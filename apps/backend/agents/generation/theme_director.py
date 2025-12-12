"""
Agent-based ThemeDirector that orchestrates deck-wide theme and per-slide themes
via tool-calling. Streams structured agent events to the EventBus.
"""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass
import re
import uuid
import colorsys
import difflib
from setup_logging_optimized import get_logger

from agents.application import get_event_bus, AGENT_EVENT, TOOL_CALL_EVENT, TOOL_RESULT_EVENT, ARTIFACT_EVENT
from utils.color_utils import (
    estimate_brightness, get_relative_luminance, is_near_white, is_near_black,
    adjust_brightness, get_colorfulness, hex_to_rgb, rgb_to_hex
)
from agents.domain.models import ThemeDocument
from agents.ai.clients import get_client, invoke

logger = get_logger(__name__)


@dataclass
class ThemeDirectorOptions:
    max_duration_seconds: float = 45.0
    per_slide_theming: bool = True
    variety_seed: Optional[str] = None  # For deterministic variety


class ThemeDirector:
    """Pure agent-based theme generation using only tools, no ThemeStyleManager."""

    def __init__(self):
        self.event_bus = get_event_bus()

    async def generate_quick_palette(
        self,
        title: str,
        context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a quick color palette for a topic/title during outline creation.
        This is a lightweight version that doesn't do full theme generation.
        """
        try:
            logger.info(f"[ThemeDirector] Generating quick palette for: {title}")
            
            # Use fast analysis to understand the topic
            analysis = self._analyze_request_fast(context or "", title, {})
            
            # Use SmartColorSelector (AI-driven) to understand the topic and pick colors
            # This uses: semantic palette DB search, theme detection, and Huemint AI generation
            try:
                from agents.tools.theme import SmartColorSelector
                selector = SmartColorSelector()
                
                logger.info(f"[ThemeDirector] 🧠 Invoking SmartColorSelector for: {title}")
                ai_result = await selector.select_colors_for_request(
                    prompt=context or "",
                    title=title,
                    variety_seed=str(uuid.uuid4())
                )
                
                if ai_result and ai_result.get('colors'):
                    colors = ai_result['colors']
                    logger.info(f"[ThemeDirector] ✅ AI generated colors: {colors}")

                    # Map AI result to simple palette format with all 3 distinct roles
                    bg_color = ai_result.get('backgrounds', [colors[0]])[0]

                    # Get accent color - must be distinct from background
                    accents = ai_result.get('accents', [])
                    accent_color = None
                    for acc in accents:
                        if acc and acc.upper() != bg_color.upper():
                            accent_color = acc
                            break
                    # Fallback: find a saturated color from the palette that's not the background
                    if not accent_color:
                        for c in colors:
                            if c and c.upper() != bg_color.upper():
                                accent_color = c
                                break
                    if not accent_color:
                        accent_color = "#2563EB"  # Default blue accent

                    # Get text color from AI result or calculate based on background
                    text_color = ai_result.get('text_colors', {}).get('primary')
                    if not text_color:
                        # Simple luminance check for text color
                        is_dark = True
                        try:
                            h = bg_color.lstrip('#')
                            rgb = tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
                            lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255
                            is_dark = lum < 0.5
                        except:
                            pass
                        text_color = "#FFFFFF" if is_dark else "#1F2937"

                    # Ensure text color is different from background
                    if text_color.upper() == bg_color.upper():
                        text_color = "#FFFFFF" if bg_color.upper() != "#FFFFFF" else "#1F2937"

                    logger.info(f"[ThemeDirector] 🎨 Final palette: bg={bg_color}, text={text_color}, accent={accent_color}")

                    return {
                        "color_palette": {
                            "primary_background": bg_color,
                            "primary_text": text_color,
                            "accent_1": accent_color,
                            "colors": colors[:5]
                        }
                    }
            except Exception as e:
                logger.warning(f"[ThemeDirector] SmartColorSelector failed: {e}")
            
            # If AI failed, try Huemint for a good palette
            try:
                from agents.tools.theme import generate_huemint_palette
                
                # Generate a palette based on the topic vibe
                huemint_result = await generate_huemint_palette(
                    num_colors=4,
                    variety_seed=str(uuid.uuid4())
                )
                
                huemint_colors = huemint_result.get('colors', []) if huemint_result else []
                
                if huemint_colors and len(huemint_colors) >= 3:
                    logger.info(f"[ThemeDirector] ✅ Huemint generated colors: {huemint_colors}")
                    # Assign distinct roles: background, text (contrast), accent
                    bg = huemint_colors[0]
                    # Calculate text based on background brightness
                    try:
                        h = bg.lstrip('#')
                        rgb = tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
                        lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255
                        text = "#FFFFFF" if lum < 0.5 else "#1F2937"
                    except:
                        text = "#1F2937"
                    # Accent: pick a color that's distinct from background
                    accent = huemint_colors[2] if len(huemint_colors) > 2 else huemint_colors[1]
                    if accent.upper() == bg.upper():
                        accent = huemint_colors[1] if huemint_colors[1].upper() != bg.upper() else "#2563EB"
                    return {
                        "color_palette": {
                            "primary_background": bg,
                            "primary_text": text,
                            "accent_1": accent,
                            "colors": huemint_colors[:4]
                        }
                    }
            except Exception as e:
                logger.debug(f"[ThemeDirector] Huemint fallback failed: {e}")

            # Final fallback: return a default modern palette with 3 distinct colors
            logger.info("[ThemeDirector] Using default modern palette")
            return {
                "color_palette": {
                    "primary_background": "#FFFFFF",
                    "primary_text": "#1F2937",
                    "accent_1": "#3B82F6",
                    "colors": ["#FFFFFF", "#1F2937", "#3B82F6"]  # Background, Text, Accent
                }
            }
            
        except Exception as e:
            logger.error(f"[ThemeDirector] generate_quick_palette failed: {e}")
            return {}

    async def generate_theme_document(
        self,
        deck_outline: Any,
        options: Optional[ThemeDirectorOptions] = None
    ) -> ThemeDocument:
        opts = options or ThemeDirectorOptions()
        
        # Use deck UUID for variety seed if not provided
        if not opts.variety_seed:
            opts.variety_seed = str(uuid.uuid4())

        # Emit agent start
        await self._emit_agent(
            agent="ThemeDirector",
            phase="start",
            summary=f"Analyzing outline with {len(getattr(deck_outline, 'slides', []))} slides"
        )

        # Extract context
        title = getattr(deck_outline, 'title', '') or ''
        prompt = getattr(deck_outline, 'prompt', '') or ''
        style_prefs = getattr(deck_outline, 'stylePreferences', None)
        style_dict = self._style_prefs_to_dict(style_prefs)
        
        # Step 1: Fast request analysis (optimized)
        analysis = self._analyze_request_fast(prompt, title, style_dict)
        
        # Step 2: Acquire colors based on analysis (parallelized where possible)
        color_result = await self._acquire_colors_fast(analysis, prompt, title, style_dict, opts.variety_seed)
        
        # Step 3: Select fonts based on brand/topic using intelligent metadata-based selection
        font_result = await self._select_fonts(analysis, color_result, title, opts.variety_seed, style_dict)
        
        # Step 4: Generate final theme
        deck_theme = await self._compose_theme(color_result, font_result, analysis, deck_outline)
        
        # Step 5: Upload any scraped assets (logos)
        if color_result.get('metadata', {}).get('logo_url'):
            await self._upload_brand_assets(color_result, deck_outline)
        
        # Per-slide theming (simplified)
        slide_themes: Dict[str, Dict[str, Any]] = {}
        if opts.per_slide_theming:
            for i, slide in enumerate(getattr(deck_outline, 'slides', []) or []):
                slide_id = getattr(slide, 'id', None) or getattr(slide, 'uuid', None) or str(i)
                slide_type = getattr(slide, 'slide_type', 'content')
                
                slide_structure = {
                    "slide_type": slide_type,
                    "elements_to_include": ["title"],
                    "positioning": {
                        "content_area": {
                            "x": 80, 
                            "y": 220, 
                            "width": 1760, 
                            "height": 640,
                            "spacing": "relaxed"
                        }
                    },
                    "styling": {
                        "colors": {
                            "title_color": deck_theme.get('title_color', '#1A1A1A'),
                            "subtitle_color": deck_theme.get('subtitle_color', '#4A5568')
                        }
                    }
                }
                
                slide_themes[slide_id] = {
                    "structure": slide_structure,
                    "instructions": [
                        "Apply deck palette with high contrast",
                        "Scale typography based on content density"
                    ]
                }

        doc = ThemeDocument(deck_theme=deck_theme, slide_themes=slide_themes, agent_trace=[])

        # Emit artifact
        await self._emit_artifact(
            kind="theme_json",
            content={"deck_theme": self._sanitize_for_event(deck_theme)}
        )

        await self._emit_agent(
            agent="ThemeDirector",
            phase="complete",
            summary="Theme document created"
        )

        return doc
    
    def _analyze_request_fast(
        self,
        prompt: str,
        title: str,
        style_dict: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Fast request analysis without heavy AI calls."""
        full_text = f"{title} {prompt}".lower()
        if style_dict and style_dict.get('vibeContext'):
            full_text += f" {style_dict['vibeContext']}".lower()
        
        analysis = {
            'is_brand': False,
            'brand_name': None,
            'brand_url': None,
            'brand_domain': None,  # Explicit domain from vibeContext
            'is_entity': False,
            'entity_name': None,
            'topic': None,
            'style_keywords': [],
            'explicit_colors': [],
            'wants_gradients': self._check_wants_gradients(full_text)
        }

        # PRIORITY: Extract brand domain directly from vibeContext if it looks like a domain
        # This allows outline agent to pass brand context (e.g., "ualberta.ca") directly
        if style_dict and style_dict.get('vibeContext'):
            vibe_context = style_dict['vibeContext'].strip()
            # Check if vibeContext looks like a domain (has dot, no spaces, no # for colors)
            if '.' in vibe_context and ' ' not in vibe_context and not vibe_context.startswith('#'):
                analysis['brand_domain'] = vibe_context
                analysis['is_brand'] = True
                # Try to extract brand name from domain (e.g., ualberta.ca → University of Alberta)
                domain_base = vibe_context.split('.')[0]
                analysis['brand_name'] = domain_base.replace('-', ' ').title()
                logger.info(f"[THEME] 🏷️ Extracted brand from vibeContext: {vibe_context} → {analysis['brand_name']}")

        # Quick entity detection (no AI calls)
        entity_patterns = [
            r'\b(super\s+mario|mario|luigi|pokemon|pikachu|disney|mickey\s+mouse)\b',
            r'\b(benjamin\s+franklin|george\s+washington|einstein|tesla)\b',
            r'\b(batman|superman|spider-man|iron\s+man|captain\s+america)\b'
        ]
        
        for pattern in entity_patterns:
            match = re.search(pattern, full_text)
            if match:
                analysis['is_entity'] = True
                analysis['entity_name'] = match.group(1).title()
                break
        
        # AI-powered brand detection - smart extraction of brand AND domain for Brandfetch
        try:
            from anthropic import Anthropic
            import os
            import json as json_module

            client = Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
            brand_prompt = f"""Analyze this presentation request and extract brand information for fetching official brand assets.

Text: "{title} {prompt}"

Your task:
1. Determine if a real company/brand is being referenced as the SUBJECT (not just mentioned in passing)
2. If yes, provide the brand's official website domain for fetching brand colors/logo

Be smart about context:
- "Learn the alphabet" → NOT about Alphabet Inc, just letters A-Z
- "Alphabet Inc investor presentation" → YES, about Google's parent company → alphabet.com
- "Apple pie recipe" → NOT about Apple Inc, just fruit
- "Apple's new iPhone" → YES, about Apple Inc → apple.com
- "Amazon rainforest" → NOT about Amazon.com, just the forest
- "Amazon Prime benefits" → YES, about Amazon → amazon.com

Return JSON only:
{{"brand": "Brand Name", "domain": "brand.com"}} or {{"brand": null, "domain": null}}

Examples:
- "Nike marketing strategy" → {{"brand": "Nike", "domain": "nike.com"}}
- "Coca-Cola history" → {{"brand": "Coca-Cola", "domain": "coca-cola.com"}}
- "How to teach kids the alphabet" → {{"brand": null, "domain": null}}
- "Stripe payment integration" → {{"brand": "Stripe", "domain": "stripe.com"}}
- "McDonald's franchise model" → {{"brand": "McDonald's", "domain": "mcdonalds.com"}}"""

            from agents.config import BRAND_DETECTION_MODEL
            from agents.ai.clients import get_model_id
            response = client.messages.create(
                model=get_model_id(BRAND_DETECTION_MODEL),
                max_tokens=100,
                temperature=0,
                system="You are a brand detection expert. Return valid JSON only. Be smart about distinguishing common words from actual brand references.",
                messages=[{"role": "user", "content": brand_prompt}]
            )

            result_text = response.content[0].text.strip()
            # Clean markdown if present
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
            result_text = result_text.strip()

            brand_info = json_module.loads(result_text)
            if brand_info.get('brand') and brand_info.get('domain'):
                analysis['is_brand'] = True
                analysis['brand_name'] = brand_info['brand']
                analysis['brand_url'] = brand_info['domain']
                logger.info(f"[THEME] AI detected brand: {brand_info['brand']} → {brand_info['domain']}")
        except Exception as e:
            logger.warning(f"[THEME] Brand detection failed: {e}")
            
        # No hardcoded brand fallback - AI detection handles all brands
        # Brandfetch DB will provide colors for any detected brand

        # Topic will be determined by palettesdb search or model if needed
        
        # Extract style keywords
        style_words = ['modern', 'minimal', 'bold', 'playful', 'professional', 'elegant', 'fun', 'creative']
        analysis['style_keywords'] = [w for w in style_words if w in full_text]
        
        # Check for explicit colors
        if style_dict and style_dict.get('colors'):
            colors = style_dict['colors']
            if isinstance(colors, list):
                analysis['explicit_colors'] = [c for c in colors if isinstance(c, str) and c.startswith('#')]
            elif isinstance(colors, dict):
                # Handle ColorConfig object format
                color_list = []
                for key in ['background', 'text', 'accent1', 'accent2', 'accent3']:
                    val = colors.get(key)
                    if val and isinstance(val, str) and val.startswith('#'):
                        color_list.append(val)
                if color_list:
                    analysis['explicit_colors'] = color_list

        return analysis

    def _check_wants_gradients(self, text: str) -> bool:
        """Check if user specifically wants gradients."""
        gradient_words = ['gradient', 'gradients', 'fade', 'blend', 'ombre', 'transition']
        return any(word in text for word in gradient_words)

    async def _analyze_request(
        self,
        prompt: str,
        title: str,
        style_dict: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze the request to determine brand/entity/topic using intelligent brand detection."""
        full_text = f"{title} {prompt}".lower()
        if style_dict and style_dict.get('vibeContext'):
            full_text += f" {style_dict['vibeContext']}".lower()
        
        
        analysis = {
            'is_brand': False,
            'brand_name': None,
            'brand_url': None,
            'is_entity': False,  # Character, person, etc.
            'entity_name': None,
            'topic': None,
            'style_keywords': [],
            'explicit_colors': [],
            'intelligent_brand_config': None  # NEW: Intelligent brand analysis
        }
        
        # Step 1: Try intelligent brand detection (only when brand cues exist)
        print(f"🧠 Running intelligent brand analysis...")
        
        tried_intelligent = False
        intelligent_no_brand = False
        try:
            # Quick AI-based brand detection - single fast API call
            from agents.ai.clients import get_client, invoke
            
            brand_detection_prompt = f"""Analyze this text and extract brand information for fetching official brand assets.

Text: "{full_text[:300]}"

Your task:
1. Determine if a real company/brand is being referenced as the SUBJECT
2. If yes, provide the brand's official website domain

Be smart about context - distinguish common words from brand references:
- "Learn the alphabet" → NOT Alphabet Inc, just letters → null
- "Alphabet Inc quarterly earnings" → YES → alphabet.com
- "Apple pie recipe" → NOT Apple Inc → null
- "Apple Vision Pro review" → YES → apple.com
- "Amazon rainforest documentary" → NOT Amazon.com → null
- "Amazon Web Services tutorial" → YES → amazon.com
- "Target practice tips" → NOT Target store → null
- "Target Q4 sales" → YES → target.com

Return JSON: {{"brand": "Name", "domain": "domain.com"}} or {{"brand": null, "domain": null}}"""

            detected_brand = None
            detected_domain = None
            try:
                import json as json_module
                from agents.config import BRAND_DETECTION_MODEL
                client = get_client(BRAND_DETECTION_MODEL)
                brand_response = invoke(
                    client=client,
                    model=BRAND_DETECTION_MODEL,
                    messages=[{"role": "user", "content": brand_detection_prompt}],
                    max_tokens=100,
                    temperature=0
                )

                # Parse JSON response
                result_text = brand_response.strip()
                if result_text.startswith("```"):
                    result_text = result_text.split("```")[1]
                    if result_text.startswith("json"):
                        result_text = result_text[4:]
                result_text = result_text.strip()

                brand_info = json_module.loads(result_text)
                if brand_info.get('brand') and brand_info.get('domain'):
                    detected_brand = brand_info['brand']
                    detected_domain = brand_info['domain']
                    logger.info(f"AI detected brand: {detected_brand} → {detected_domain}")
                else:
                    logger.info("AI brand detection: no brand found (returned null)")

            except Exception as e:
                logger.warning(f"Quick brand detection failed: {e}")
                logger.info("AI brand detection failed, proceeding with general theme")

            # If no brand detected, skip brand processing
            if not detected_brand or not detected_domain:
                logger.info("No brand detected, using general theme")
                raise RuntimeError("no_brand_detected")

            # Use the AI-provided domain directly for Brandfetch lookup
            logger.info(f"Brand detected: {detected_brand}, using domain: {detected_domain}")

            try:
                # Try brandfetch for this detected brand using the AI-provided domain
                from services.simple_brandfetch_cache import SimpleBrandfetchCache
                import os
                db_url = os.getenv('DATABASE_URL', 'postgresql://postgres.iureiriffqcxrldisuqp:202War123!!@aws-0-us-west-1.pooler.supabase.com:6543/postgres')
                async with SimpleBrandfetchCache(db_url) as bf_service:
                    # Use the AI-provided domain directly - it's smart about the correct domain
                    # Only use fallback variations if the direct domain fails
                    domain_variants = [detected_domain]  # AI-provided domain first

                    # Add fallback variations only if needed
                    cleaned = detected_domain.replace('.com', '').replace('.org', '').replace('.net', '').replace('-', '')
                    if f"{cleaned}.com" != detected_domain:
                        domain_variants.append(f"{cleaned}.com")

                    for domain in domain_variants:
                        brand_info = await bf_service.get_brand_data(domain)
                        
                        if brand_info and not brand_info.get('error'):
                            # Found in brandfetch DB!
                            colors_data = brand_info.get('colors', {})
                            logos_data = brand_info.get('logos', {})
                            
                            # Extract colors array with intelligent ordering
                            all_colors = colors_data.get('all', [])
                            
                            # Separate colors by type for better theme prioritization
                            light_colors = [c.get('hex') for c in all_colors if c.get('type') == 'light' and c.get('hex')]
                            dark_colors = [c.get('hex') for c in all_colors if c.get('type') == 'dark' and c.get('hex')]
                            accent_colors = [c.get('hex') for c in all_colors if c.get('type') == 'accent' and c.get('hex')]
                            brand_colors = [c.get('hex') for c in all_colors if c.get('type') == 'brand' and c.get('hex')]
                            other_colors = [c.get('hex') for c in all_colors if c.get('type') not in ['light', 'dark', 'accent', 'brand'] and c.get('hex')]
                            
                            # Use colors in the order they appear in brandfetch data
                            color_list = [c.get('hex') for c in all_colors if c.get('hex')]
                            
                            # Extract logo URL - first check if already provided in stylePreferences
                            logo_url = style_dict.get('logoUrl') if style_dict else None
                            if logo_url:
                                logger.info(f"[THEME DIRECTOR] Using logo URL from stylePreferences: {logo_url}")
                            else:
                                # Extract logo URL (prefer dark theme, then light, then any)
                                for theme in ['dark', 'light', 'other']:
                                    theme_logos = logos_data.get(theme, [])
                                    if theme_logos and len(theme_logos) > 0:
                                        formats = theme_logos[0].get('formats', [])
                                        if formats and len(formats) > 0:
                                            logo_url = formats[0].get('url')
                                            break
                            
                            # If no logo in main themes, try icons
                            if not logo_url:
                                icons = logos_data.get('icons', [])
                                if icons and len(icons) > 0:
                                    formats = icons[0].get('formats', [])
                                    if formats and len(formats) > 0:
                                        logo_url = formats[0].get('url')
                            
                            # Determine logo aspect from Brandfetch formats when possible
                            logo_aspect = None
                            logo_aspect_ratio = None
                            try:
                                # Search all formats to find the selected URL and its dims
                                def _iter_formats():
                                    for k in ['dark','light','other','icons']:
                                        for item in logos_data.get(k, []) or []:
                                            for fmt in item.get('formats', []) or []:
                                                yield (k, fmt)
                                matched = None
                                for k, fmt in _iter_formats():
                                    if isinstance(fmt, dict) and fmt.get('url') == logo_url:
                                        matched = (k, fmt)
                                        break
                                # If not matched, fall back to first available format to infer aspect by theme
                                if not matched:
                                    for k, fmt in _iter_formats():
                                        matched = (k, fmt)
                                        break
                                if matched:
                                    k, fmt = matched
                                    w = fmt.get('width')
                                    h = fmt.get('height')
                                    if isinstance(w, (int,float)) and isinstance(h, (int,float)) and w > 0 and h > 0:
                                        ratio = float(w) / float(h)
                                        logo_aspect_ratio = round(ratio, 3)
                                        # Consider near-1:1 as square
                                        if 0.9 <= ratio <= 1.1 or k == 'icons':
                                            logo_aspect = 'square'
                                        else:
                                            logo_aspect = 'horizontal'
                                    else:
                                        # No dimensions; infer from type
                                        logo_aspect = 'square' if k == 'icons' else 'horizontal'
                            except Exception:
                                # Non-fatal
                                logo_aspect = logo_aspect or None
                                logo_aspect_ratio = logo_aspect_ratio or None
                            
                            analysis['is_brand'] = True
                            analysis['brand_name'] = brand_info.get('brand_name', detected_brand.title())
                            analysis['website_url'] = f"https://www.{domain}"
                            analysis['brand_confidence'] = 0.9
                            analysis['intelligent_brand_config'] = {
                                'brand_name': analysis['brand_name'],
                                'colors': {
                                    'all_colors': color_list,
                                    'light_colors': light_colors,
                                    'dark_colors': dark_colors,
                                    'accent_colors': accent_colors,
                                    'brand_colors': brand_colors,
                                    'primary': light_colors[0] if light_colors else (brand_colors[0] if brand_colors else color_list[0] if color_list else None),
                                    'background': light_colors[0] if light_colors else '#FFFFFF',
                                    'accent': accent_colors[0] if accent_colors else (brand_colors[0] if brand_colors else color_list[-1] if color_list else '#000000')
                                },
                                'logo_url': logo_url,
                                'logo_aspect': logo_aspect,
                                'logo_aspect_ratio': logo_aspect_ratio,
                                'confidence_score': 90
                            }
                            
                            print(f"   ✅ Brandfetch DB found: {detected_brand} at {domain}")
                            print(f"   🎨 Colors: {len(color_list)} found - {color_list[:3]}...")
                            print(f"   🖼️  Logo: {'✅' if logo_url else '❌'}")
                            if logo_url:
                                print(f"   🔗 Logo URL: {logo_url}")
                            
                            return analysis
                    
                    # Not found in brandfetch DB - try Firecrawl branding as fallback
                    logger.info(f"Brand {detected_brand} not found in brandfetch DB, trying Firecrawl branding...")
                    try:
                        from services.firecrawl_service import get_firecrawl_service
                        firecrawl = get_firecrawl_service()
                        if firecrawl.is_configured():
                            fc_result = firecrawl.extract_brand_design(f"https://{detected_domain}", include_screenshot=True)
                            if fc_result.get("success"):
                                fc_data = fc_result.get("data", {})
                                fc_colors = fc_data.get("colors", {})

                                if fc_colors:
                                    # Build color list from Firecrawl branding
                                    color_list = []
                                    for key in ["primary", "secondary", "accent", "background"]:
                                        if fc_colors.get(key):
                                            color_list.append(fc_colors[key])

                                    if color_list:
                                        analysis['is_brand'] = True
                                        analysis['brand_name'] = detected_brand
                                        analysis['brand_url'] = f"https://{detected_domain}"
                                        analysis['website_url'] = f"https://{detected_domain}"
                                        analysis['brand_confidence'] = 0.85
                                        analysis['brand_colors'] = color_list
                                        analysis['brand_fonts'] = fc_data.get('fonts', [])
                                        analysis['brand_logo'] = fc_data.get('logo')
                                        analysis['brand_screenshot'] = fc_data.get('screenshot')
                                        analysis['firecrawl_branding'] = fc_data  # Store full data

                                        # Build intelligent_brand_config for downstream processing
                                        analysis['intelligent_brand_config'] = {
                                            'brand_name': detected_brand,
                                            'colors': {
                                                'all_colors': color_list,
                                                'light_colors': [c for c in [fc_colors.get('background')] if c],
                                                'dark_colors': [c for c in [fc_colors.get('textPrimary')] if c],
                                                'accent_colors': [c for c in [fc_colors.get('accent'), fc_colors.get('secondary')] if c],
                                                'brand_colors': [c for c in [fc_colors.get('primary')] if c],
                                                'primary': fc_colors.get('primary') or color_list[0] if color_list else None,
                                                'background': fc_colors.get('background') or '#FFFFFF',
                                                'accent': fc_colors.get('accent') or fc_colors.get('primary') or color_list[0] if color_list else '#000000'
                                            },
                                            'logo_url': fc_data.get('logo'),
                                            'fonts': fc_data.get('fonts', []),
                                            'screenshot': fc_data.get('screenshot'),
                                            'extraction_method': 'firecrawl_branding',
                                            'confidence_score': 85
                                        }

                                        print(f"   ✅ Firecrawl branding found: {detected_brand}")
                                        print(f"   🎨 Colors: {len(color_list)} found - {color_list[:3]}...")
                                        print(f"   🖼️  Logo: {'✅' if fc_data.get('logo') else '❌'}")
                                        print(f"   📸 Screenshot: {'✅' if fc_data.get('screenshot') else '❌'}")

                                        logger.info(f"[THEME] ✅ Firecrawl branding for {detected_brand}: {len(color_list)} colors")
                                        return analysis
                    except Exception as fc_err:
                        logger.warning(f"Firecrawl branding fallback failed: {fc_err}")

                    raise RuntimeError("brand_not_in_db")

            except Exception as e:
                logger.warning(f"Brandfetch DB lookup failed: {e}")
                raise RuntimeError("brandfetch_lookup_failed")
            
        except Exception as e:
            logger.warning(f"AI brand detection failed, proceeding with general theme: {e}")
            print(f"   ⚠️  No brand detected, using general palette selection")
        
        # Check for known entities/characters
        entity_patterns = [
            r'\b(super\s+mario|mario|luigi|pokemon|pikachu|disney|mickey\s+mouse)\b',
            r'\b(benjamin\s+franklin|george\s+washington|einstein|tesla)\b',
            r'\b(batman|superman|spider-man|iron\s+man|captain\s+america)\b'
        ]
        
        for pattern in entity_patterns:
            match = re.search(pattern, full_text)
            if match:
                analysis['is_entity'] = True
                analysis['entity_name'] = match.group(1).title()
                break
        
        # Extract topic
        if 'business' in full_text or 'financial' in full_text or 'quarterly' in full_text:
            analysis['topic'] = 'business'
        elif 'education' in full_text or 'school' in full_text or 'student' in full_text:
            analysis['topic'] = 'education'
        elif 'tech' in full_text or 'software' in full_text or 'startup' in full_text:
            analysis['topic'] = 'technology'
        elif 'team' in full_text or 'onboarding' in full_text or 'welcome' in full_text:
            analysis['topic'] = 'team'
        
        # Extract style keywords
        style_words = ['modern', 'minimal', 'bold', 'playful', 'professional', 'elegant', 'fun', 'creative']
        analysis['style_keywords'] = [w for w in style_words if w in full_text]
        
        # Check for explicit colors
        if style_dict and style_dict.get('colors'):
            colors = style_dict['colors']
            if isinstance(colors, list):
                analysis['explicit_colors'] = [c for c in colors if isinstance(c, str) and c.startswith('#')]
            elif isinstance(colors, dict):
                # Handle ColorConfig object format
                color_list = []
                for key in ['background', 'text', 'accent1', 'accent2', 'accent3']:
                    val = colors.get(key)
                    if val and isinstance(val, str) and val.startswith('#'):
                        color_list.append(val)
                if color_list:
                    analysis['explicit_colors'] = color_list

        return analysis
    
    def _select_optimal_logo_for_background(
        self, 
        deck_theme: Dict[str, Any], 
        slide_title: str, 
        slide_content: str,
        ai_reasoning: str
    ) -> Optional[str]:
        """
        Select the optimal logo variant (light/dark) based on slide background analysis.
        
        Args:
            deck_theme: Theme data with logo variants and colors
            slide_title: Title of the slide
            slide_content: Content of the slide  
            ai_reasoning: AI's reasoning for this slide's structure
            
        Returns:
            Selected logo URL or None
        """
        
        # Get available logo variants
        logo_light = deck_theme.get('metadata', {}).get('logo_url_light') or deck_theme.get('metadata', {}).get('logo_url')
        logo_dark = deck_theme.get('metadata', {}).get('logo_url_dark')
        
        if not logo_light and not logo_dark:
            return None
        
        # If only one variant is available, use it
        if logo_light and not logo_dark:
            return logo_light
        if logo_dark and not logo_light:
            return logo_dark
        
        # Analyze theme colors to determine likely slide background
        primary_bg = self._determine_slide_background_luminance(deck_theme, slide_title, slide_content)
        
        # Select logo based on background luminance
        # Light backgrounds (>0.5 luminance) need dark logos for contrast
        # Dark backgrounds (<0.5 luminance) need light logos for contrast
        if primary_bg > 0.5:
            # Light background - use dark logo if available, otherwise light
            selected_logo = logo_dark if logo_dark else logo_light
            logger.info(f"Selected dark logo for light background (luminance: {primary_bg:.2f})")
        else:
            # Dark background - use light logo if available, otherwise dark
            selected_logo = logo_light if logo_light else logo_dark
            logger.info(f"Selected light logo for dark background (luminance: {primary_bg:.2f})")
        
        return selected_logo
    
    def _determine_slide_background_luminance(
        self, 
        deck_theme: Dict[str, Any], 
        slide_title: str, 
        slide_content: str
    ) -> float:
        """
        Determine the likely background luminance for a slide based on theme colors.
        
        Returns:
            Float between 0.0 (black) and 1.0 (white) representing background lightness
        """
        
        # Get theme background colors
        color_palette = deck_theme.get('color_palette', {})
        backgrounds = color_palette.get('backgrounds', [])
        
        # If we have background colors, use the primary one
        if backgrounds and len(backgrounds) > 0:
            primary_bg = backgrounds[0]
            return self._calculate_luminance(primary_bg)
        
        # Fallback to accent colors if no backgrounds
        accents = color_palette.get('accents', [])
        if accents and len(accents) > 0:
            return self._calculate_luminance(accents[0])
        
        # Final fallback - analyze slide content for theme indicators
        content_lower = f"{slide_title} {slide_content}".lower()
        
        # Dark theme indicators
        if any(indicator in content_lower for indicator in [
            'dark', 'night', 'black', 'shadow', 'deep', 'midnight', 'carbon'
        ]):
            return 0.2  # Dark background
        
        # Light theme indicators  
        if any(indicator in content_lower for indicator in [
            'light', 'bright', 'white', 'clean', 'minimal', 'pure', 'snow'
        ]):
            return 0.9  # Light background
        
        # Default to light background (most common in business presentations)
        return 0.8
    
    def _calculate_luminance(self, hex_color: str) -> float:
        """Calculate relative luminance of a hex color (0 = black, 1 = white)."""
        return get_relative_luminance(hex_color)
    
    def _detect_formality_from_style(self, visual_style: Dict[str, Any]) -> str:
        """
        Detect formality level from visual style attributes.
        
        Returns:
            'formal', 'business', 'creative', or 'casual'
        """
        # Check visual style indicators
        layout_patterns = visual_style.get('layout_patterns', [])
        background_style = visual_style.get('background_style', '')
        image_prominence = visual_style.get('image_prominence', 50)
        
        # Formal indicators
        formal_indicators = 0
        if 'grid' in layout_patterns or 'structured' in layout_patterns:
            formal_indicators += 1
        if 'corporate' in background_style or 'solid' in background_style:
            formal_indicators += 1
        if image_prominence < 30:
            formal_indicators += 1
            
        # Creative indicators
        creative_indicators = 0
        if 'artistic' in layout_patterns or 'magazine' in layout_patterns:
            creative_indicators += 1
        if 'gradient' in background_style or 'abstract' in background_style:
            creative_indicators += 1
        if image_prominence > 70:
            creative_indicators += 1
            
        # Determine formality
        if formal_indicators >= 2:
            return 'formal'
        elif creative_indicators >= 2:
            return 'creative'
        elif image_prominence >= 50:
            return 'casual'
        else:
            return 'business'
    
    async def _acquire_colors_fast(
        self,
        analysis: Dict[str, Any],
        prompt: str,
        title: str,
        style_dict: Optional[Dict[str, Any]],
        variety_seed: str
    ) -> Dict[str, Any]:
        """Fast AI-driven color acquisition."""
        logger.info(f"[THEME DIRECTOR] _acquire_colors_fast called. style_dict keys: {list(style_dict.keys()) if style_dict else 'None'}")
        if style_dict:
            logger.info(f"[THEME DIRECTOR] vibeContext in style_dict: {style_dict.get('vibeContext')}")

        # 0. HIGHEST PRIORITY: Explicit colors from ColorConfig (user selected colors)
        explicit_colors = analysis.get('explicit_colors', [])
        if explicit_colors and len(explicit_colors) > 0:
            logger.info(f"[THEME DIRECTOR] Using explicit colors from ColorConfig: {explicit_colors}")
            # Determine which colors are backgrounds vs accents based on brightness
            backgrounds = []
            accents = []
            for color in explicit_colors:
                # Simple brightness check: if color is light, it's likely a background
                if color.upper() in ['#FFFFFF', '#F5F5F5', '#FAFAFA', '#FFF', '#FFFFFFFF']:
                    backgrounds.append(color)
                elif len(color) == 7:  # Valid hex
                    # Check brightness
                    try:
                        r = int(color[1:3], 16)
                        g = int(color[3:5], 16)
                        b = int(color[5:7], 16)
                        brightness = (r * 299 + g * 587 + b * 114) / 1000
                        if brightness > 200:  # Light color, likely background
                            backgrounds.append(color)
                        else:  # Dark/saturated color, likely accent
                            accents.append(color)
                    except:
                        accents.append(color)

            return {
                'colors': explicit_colors[:8],
                'source': 'user_explicit_colors',
                'palette_name': 'Selected Colors',
                'backgrounds': backgrounds if backgrounds else ['#FFFFFF'],
                'accents': accents if accents else explicit_colors[:2],
                'metadata': {'user_selected': True, 'explicit_colors': explicit_colors}
            }

        # 1. Custom hex colors from vibeContext (high priority)
        if style_dict and style_dict.get('vibeContext'):
            vibe_context = style_dict.get('vibeContext', '')
            hex_pattern = r'#[0-9A-Fa-f]{6}\b'
            hex_matches = re.findall(hex_pattern, vibe_context)
            if hex_matches:
                custom_hex_colors = [color.upper() for color in hex_matches]
                return {
                    'colors': custom_hex_colors[:8],
                    'source': 'user_custom_colors',
                    'palette_name': 'Custom Palette',
                    'backgrounds': ['#FFFFFF'],
                    'accents': custom_hex_colors[:2],
                    'metadata': {'custom_colors': True}
                }
        
        # 2. AI model for entities (like Pikachu)
        if analysis.get('is_entity'):
            entity_colors = await self._get_entity_colors_from_ai(analysis['entity_name'])
            if entity_colors:
                inferred_backgrounds = self._infer_backgrounds(entity_colors)[:2]
                inferred_accents = self._infer_accents(entity_colors)[:2]
                # CRITICAL: Use inferred colors, not raw AI array!
                # Frontend expects: colors[0]=bg, colors[1]=text, colors[2]=accent
                clean_colors = []
                if inferred_backgrounds:
                    clean_colors.append(inferred_backgrounds[0])
                # We don't have text color yet, will be computed in _compose_theme
                if inferred_accents:
                    clean_colors.append(inferred_accents[0])
                return {
                    'colors': clean_colors,  # Clean [bg, accent] instead of raw AI array
                    'source': 'ai_iconic_colors',
                    'palette_name': f"{analysis['entity_name']} Colors",
                    'backgrounds': inferred_backgrounds,
                    'accents': inferred_accents,
                    'metadata': {'entity': analysis['entity_name']}
                }
        
        # 3. PRIORITY: Check vibeContext for brand domains (like mcdonalds.com, ualberta.ca)
        brand_domain = None
        logger.info(f"[THEME DIRECTOR] Checking vibeContext for brand domain. style_dict={bool(style_dict)}, vibeContext={style_dict.get('vibeContext') if style_dict else None}")
        if style_dict and style_dict.get('vibeContext'):
            vibe_context = style_dict.get('vibeContext', '').strip()
            # Check if vibeContext looks like a domain
            if '.' in vibe_context and not vibe_context.startswith('#') and ' ' not in vibe_context:
                brand_domain = vibe_context
                logger.info(f"[THEME DIRECTOR] ✅ Found brand domain in vibeContext: {brand_domain}")
            else:
                logger.info(f"[THEME DIRECTOR] vibeContext '{vibe_context}' doesn't look like a domain")
        
        # Also check if analysis detected a brand - use BrandColorSearcher for proper cache-first lookup
        if not brand_domain and analysis.get('is_brand') and analysis.get('brand_name'):
            brand_name = analysis['brand_name']
            logger.info(f"[THEME] AI detected brand: {brand_name}, using BrandColorSearcher")
            
            try:
                from agents.tools.theme.brand_color_tools import BrandColorSearcher
                brand_searcher = BrandColorSearcher()
                brand_colors_result = await brand_searcher.search_brand_colors(brand_name)
                
                if brand_colors_result and brand_colors_result.get('source') == 'brandfetch_cache':
                    # Found in cache! Use this data directly with proper categorization
                    colors = brand_colors_result.get('colors', [])
                    fonts = brand_colors_result.get('fonts', [])
                    logo_url = brand_colors_result.get('logo_url')
                    confidence = brand_colors_result.get('confidence', 0)

                    # Get properly categorized backgrounds, accents, and text colors from searcher
                    backgrounds = brand_colors_result.get('backgrounds', [])
                    accents = brand_colors_result.get('accents', [])
                    text_colors = brand_colors_result.get('text_colors', [])

                    logger.info(f"✅ BRANDFETCH CACHE HIT via BrandColorSearcher for {brand_name}: {colors}")
                    if logo_url:
                        logger.info(f"✅ LOGO FOUND via BrandColorSearcher: {logo_url[:80]}...")

                    await self._emit_tool_result("BrandColorSearcher",
                        [f"✅ CACHE HIT: {len(colors)} colors, {len(fonts)} fonts" + (", logo found" if logo_url else ""),
                         f"Colors: {colors[:3]}...",
                         f"Backgrounds: {backgrounds}, Accents: {accents}, Text: {text_colors}",
                         f"Confidence: {confidence}"])

                    return {
                        'colors': colors[:8],
                        'source': 'brandfetch_cache',  # ← TRUST THIS SOURCE!
                        'palette_name': f"{brand_name} Brand Colors",
                        'backgrounds': backgrounds if backgrounds else [],
                        'accents': accents if accents else [],
                        'text_colors': text_colors if text_colors else [],  # Include text colors
                        'metadata': {
                            'brand': brand_name,
                            'fonts': fonts,
                            'logo_url': logo_url,
                            'confidence': confidence,
                            'source': 'brandfetch_cache'
                        }
                    }
                else:
                    logger.info(f"[THEME] BrandColorSearcher returned non-cache result for {brand_name}")
                    
            except Exception as e:
                logger.warning(f"[THEME] BrandColorSearcher failed for {brand_name}: {e}")
            
            # Fallback: try cache/search again using the brand name directly (avoid forcing .com)
            brand_domain = None
            try:
                from services.simple_brandfetch_cache import SimpleBrandfetchCache
                import os
                db_url = os.getenv('DATABASE_URL')
                if db_url:
                    async with SimpleBrandfetchCache(db_url) as bf_service:
                        brand_info = await bf_service.get_brand_data(brand_name)
                        if isinstance(brand_info, dict) and not brand_info.get('error'):
                            brand_domain = brand_info.get('domain') or None
            except Exception:
                brand_domain = None
        
        # Use brandfetch cache for brand colors (HIGHEST PRIORITY)
        if brand_domain:
            try:
                from services.simple_brandfetch_cache import SimpleBrandfetchCache
                import os
                db_url = os.getenv('DATABASE_URL')
                if db_url:
                    await self._emit_tool_call("BrandCache.lookup", {"domain": brand_domain})
                    
                    async with SimpleBrandfetchCache(db_url) as bf_service:
                        brand_info = await bf_service.get_brand_data(brand_domain)
                        # Normalize legacy shapes to dict
                        if not isinstance(brand_info, dict):
                            logger.warning(f"[THEME DIRECTOR] Brand cache returned non-dict for {brand_domain}: {type(brand_info)}")
                            brand_info = {"error": "invalid_cached_response"}
                        
                        if brand_info and not brand_info.get('error'):
                            colors_data = brand_info.get('colors', {}) if isinstance(brand_info, dict) else {}
                            fonts_data = brand_info.get('fonts', {}) if isinstance(brand_info, dict) else {}
                            logos_data = brand_info.get('logos', {}) if isinstance(brand_info, dict) else {}
                            
                            # Extract colors - check labeled format first (from admin panel), then hex_list
                            brand_colors = []
                            labeled_backgrounds = []
                            labeled_accents = []
                            labeled_text = []

                            # Helper to extract hex from color value (handles string or dict with 'hex' key)
                            def extract_hex(color_val):
                                if isinstance(color_val, str):
                                    return color_val
                                elif isinstance(color_val, dict) and 'hex' in color_val:
                                    return color_val['hex']
                                elif isinstance(color_val, list) and len(color_val) > 0:
                                    return extract_hex(color_val[0])
                                return None

                            if colors_data:
                                # PRIORITY 1: Check for labeled colors format (from admin panel edits)
                                # Format: { background: "#...", text: "#...", accent: "#...", accent2: "#..." }
                                if colors_data.get('background') or colors_data.get('accent'):
                                    logger.info(f"[THEME DIRECTOR] ✅ Found LABELED colors format for {brand_domain}")

                                    bg = extract_hex(colors_data.get('background'))
                                    text = extract_hex(colors_data.get('text'))
                                    accent = extract_hex(colors_data.get('accent'))
                                    accent2 = extract_hex(colors_data.get('accent2'))

                                    if bg:
                                        labeled_backgrounds.append(bg)
                                        brand_colors.append(bg)
                                    if text:
                                        labeled_text.append(text)
                                        brand_colors.append(text)
                                    if accent:
                                        labeled_accents.append(accent)
                                        brand_colors.append(accent)
                                    if accent2:
                                        labeled_accents.append(accent2)
                                        brand_colors.append(accent2)

                                    logger.info(f"[THEME DIRECTOR] Labeled colors - bg: {labeled_backgrounds}, text: {labeled_text}, accents: {labeled_accents}")

                                # PRIORITY 2: Fall back to hex_list format
                                elif colors_data.get('hex_list'):
                                    brand_colors = colors_data['hex_list']

                            brand_fonts = fonts_data.get('names', []) if fonts_data else []

                            # Extract logo URL - first check if already provided in stylePreferences
                            logo_url = style_dict.get('logoUrl') if style_dict else None
                            if logo_url:
                                logger.info(f"[THEME DIRECTOR] Using logo URL from stylePreferences: {logo_url}")
                            elif logos_data:
                                for logo_type in ['light', 'dark', 'icons', 'other']:
                                    if logo_type in logos_data and logos_data[logo_type]:
                                        logo_items = logos_data[logo_type]
                                        if isinstance(logo_items, list) and logo_items:
                                            # Each item has formats array with actual URLs
                                            logo_item = logo_items[0]
                                            if isinstance(logo_item, dict) and 'formats' in logo_item:
                                                formats = logo_item['formats']
                                                if formats and isinstance(formats, list):
                                                    # Get the first format's URL
                                                    logo_url = formats[0].get('url')
                                                    if logo_url:
                                                        logger.info(f"[THEME DIRECTOR] Found logo URL ({logo_type}): {logo_url}")
                                                        break

                            if brand_colors:
                                await self._emit_tool_result("BrandCache.lookup",
                                    [f"✅ BRAND CACHE HIT: {len(brand_colors)} colors, {len(brand_fonts)} fonts",
                                     f"Colors: {brand_colors[:3]}...",
                                     f"Logo: {'Yes' if logo_url else 'No'}"])

                                logger.info(f"✅ BRANDFETCH CACHE HIT for {brand_domain}: {brand_colors}")

                                # Use labeled colors if available, otherwise intelligently categorize
                                if labeled_backgrounds or labeled_accents:
                                    # Use the pre-labeled colors from admin panel
                                    backgrounds = labeled_backgrounds if labeled_backgrounds else ['#FFFFFF']
                                    accents = labeled_accents if labeled_accents else brand_colors[:2]
                                    text_colors = labeled_text if labeled_text else []

                                    logger.info(f"[BRANDFETCH] Using LABELED colors - backgrounds: {backgrounds}, accents: {accents}, text: {text_colors}")
                                else:
                                    # Fall back to intelligent categorization based on luminance
                                    backgrounds = []
                                    accents = []
                                    text_colors = []
                                    for color in brand_colors:
                                        try:
                                            lum = self._get_luminance(color)
                                            # Light colors (>0.7 luminance) are good for backgrounds
                                            if lum > 0.7:
                                                backgrounds.append(color)
                                            else:
                                                accents.append(color)
                                        except Exception:
                                            accents.append(color)

                                    # Ensure we have at least one background (fall back to white if no light colors)
                                    if not backgrounds:
                                        backgrounds = ['#FFFFFF']
                                    # Ensure we have at least one accent
                                    if not accents:
                                        accents = brand_colors[:2] if brand_colors else ['#000000']

                                    logger.info(f"[BRANDFETCH] Categorized colors - backgrounds: {backgrounds}, accents: {accents}")

                                # Also fetch brand screenshot via Firecrawl for visual reference
                                brand_screenshot = None
                                try:
                                    from services.firecrawl_service import get_firecrawl_service
                                    firecrawl = get_firecrawl_service()
                                    if firecrawl.is_configured():
                                        logger.info(f"[THEME DIRECTOR] 📸 Fetching brand screenshot for {brand_domain}")
                                        fc_result = firecrawl.extract_brand_design(f"https://{brand_domain}", include_screenshot=True)
                                        if fc_result.get("success"):
                                            fc_data = fc_result.get("data", {})
                                            brand_screenshot = fc_data.get("screenshot")
                                            if brand_screenshot:
                                                logger.info(f"[THEME DIRECTOR] 📸 Got brand screenshot ({len(brand_screenshot)} chars)")
                                except Exception as fc_err:
                                    logger.warning(f"[THEME DIRECTOR] Screenshot fetch failed (non-blocking): {fc_err}")

                                return {
                                    'colors': brand_colors[:8],
                                    'source': 'brandfetch_cache',
                                    'palette_name': f"{brand_info.get('company_name', brand_domain)} Brand Colors",
                                    'backgrounds': backgrounds[:2],
                                    'accents': accents[:2],
                                    'text_colors': text_colors,  # Include labeled text colors
                                    'metadata': {
                                        'brand': brand_info.get('company_name', brand_domain),
                                        'domain': brand_domain,
                                        'logo_url': logo_url,
                                        'fonts': brand_fonts,
                                        'source': 'brandfetch_cache',
                                        'brand_screenshot': brand_screenshot  # For visual reference in generation
                                    }
                                }
                            else:
                                logger.warning(f"[THEME DIRECTOR] Brand {brand_domain} found but no colors in labeled format or hex_list")
                                await self._emit_tool_result("BrandCache.lookup", ["❌ No colors found in brand cache"])
                        else:
                            logger.warning(f"[THEME DIRECTOR] Brand {brand_domain} not found or error: {brand_info.get('error') if brand_info else 'None'}")
                            await self._emit_tool_result("BrandCache.lookup", ["❌ Brand not found in cache"])
            except Exception as e:
                logger.warning(f"[THEME DIRECTOR] Brandfetch cache lookup failed for {brand_domain}: {e}")
                await self._emit_tool_result("BrandCache.lookup", [f"❌ Cache error: {str(e)}"]) 
        
        # 4. Use SmartColorSelector (which handles palettesdb and curated fallbacks)
        from agents.tools.theme import SmartColorSelector
        selector = SmartColorSelector()
        color_result = await selector.select_colors_for_request(
            prompt=prompt,
            title=title,
            style_preferences=style_dict,
            variety_seed=variety_seed
        )
        # Ensure not to collapse to a dark-minimal default; pick light-forward curated fallback when empty
        if not color_result or not color_result.get('colors'):
            return {
                'colors': ['#FF7A59', '#FFC145', '#2EC4B6', '#1B9AAA', '#F5F7FA'],
                'backgrounds': ['#F5F7FA', '#E6EEF5'],
                'accents': ['#FF7A59', '#2EC4B6'],
                'source': 'curated_fallback'
            }
        return color_result
    
    async def _acquire_colors(
        self,
        analysis: Dict[str, Any],
        prompt: str,
        title: str,
        style_dict: Optional[Dict[str, Any]],
        variety_seed: str
    ) -> Dict[str, Any]:
        """Acquire colors based on analysis using appropriate tools."""
        
        # ICONIC SUBJECT: use model-known iconic colors when detected (no hardcoded names)
        if analysis.get('is_entity') and analysis.get('entity_name'):
            try:
                entity_colors = await self._get_entity_colors_from_ai(analysis['entity_name'])
                if entity_colors and len(entity_colors) >= 2:
                    backgrounds, accents = self._infer_backgrounds(entity_colors), self._infer_accents(entity_colors)
                    return {
                        'colors': entity_colors[:8],
                        'backgrounds': backgrounds[:2] if backgrounds else [],
                        'accents': accents[:2] if accents else [],
                        'text_colors': {},
                        'gradients': [],
                        'source': 'iconic_subject_ai',
                        'palette_name': f"{analysis['entity_name']} Iconic Colors",
                        'metadata': {
                            'entity': analysis['entity_name'],
                            'confidence': 0.8
                        }
                    }
            except Exception as _e:
                logger.warning(f"Iconic subject model color lookup failed: {_e}")
        
        # FIRST PRIORITY: Check for custom hex colors in vibeContext
        custom_hex_colors = []
        if style_dict and style_dict.get('vibeContext'):
            vibe_context = style_dict.get('vibeContext', '')
            import re
            # Extract hex colors from vibeContext
            hex_pattern = r'#[0-9A-Fa-f]{6}\b'
            hex_matches = re.findall(hex_pattern, vibe_context)
            custom_hex_colors = [color.upper() for color in hex_matches]
            
            if custom_hex_colors:
                print(f"🎨 Found custom hex colors in vibeContext: {custom_hex_colors}")
                # Create a custom palette from the hex colors
                result = {
                    'colors': custom_hex_colors[:8],  # Limit to 8 colors
                    'source': 'custom_hex_colors_from_vibe',
                    'palette_name': 'Custom Palette',
                    'metadata': {
                        'custom_colors': True,
                        'from_vibe_context': True,
                        'brand': analysis.get('brand_name', ''),
                        'extraction_method': 'vibe_context_hex_extraction'
                    }
                }
                
                # Generate backgrounds and accents from the custom colors
                # Use first color as primary, second as secondary background
                if len(custom_hex_colors) >= 1:
                    result['backgrounds'] = ['#FFFFFF']  # Always include white
                    result['accents'] = [custom_hex_colors[0]]  # First color as accent
                if len(custom_hex_colors) >= 2:
                    result['accents'].append(custom_hex_colors[1])  # Second color as accent
                if len(custom_hex_colors) >= 3:
                    result['backgrounds'].append(custom_hex_colors[2])  # Third color as background
                    
                print(f"   ✅ Using custom hex colors from vibeContext")
                return result
        
        # SECOND PRIORITY: Use intelligent brand config if available (only if no custom colors)
        # BUT STILL PROCESS THROUGH SMARTCOLORSELECTOR for proper background filtering
        if analysis.get('intelligent_brand_config'):
            print(f"🚀 Using intelligent brand configuration...")
            
            config = analysis['intelligent_brand_config']
            colors = config.get('colors', {})
            
            print(f"   ✅ Intelligent brand colors found: {len(colors.get('all_colors', []))} colors")
            print(f"   🎨 Raw Primary: {colors.get('primary')} (will be processed)")
            print(f"   📊 Confidence: {config.get('confidence_score', 0)}%")
            
            # Use SmartColorSelector's _format_color_result and _post_process_colors directly
            # to get proper background filtering while preserving brand colors
            from agents.tools.theme import SmartColorSelector
            selector = SmartColorSelector()
            
            await self._emit_tool_call(
                "SmartColorSelector.process_brand_colors", 
                {
                    "brand": config.get('brand_name'),
                    "colors": len(colors.get('all_colors', [])),
                    "has_logo": bool(config.get('logo_url'))
                }
            )
            
            try:
                # RESPECT BRANDFETCH DATA EXACTLY - don't override their brand guidance!
                # The brandfetch data already has proper type classifications
                
                print(f"   📊 Respecting brandfetch data types exactly")
                
                # Use the exact backgrounds and accents from the intelligent brand config
                brand_backgrounds = colors.get('backgrounds', [])
                brand_accents = colors.get('accents', [])
                all_colors = colors.get('all_colors', [])
                
                print(f"   🎨 Brandfetch backgrounds: {brand_backgrounds}")
                print(f"   🎯 Brandfetch accents: {brand_accents}")
                
                # If brandfetch specified backgrounds, use them (even if they're light)
                # This respects the actual brand identity from the official source
                final_backgrounds = brand_backgrounds if brand_backgrounds else []
                final_accents = brand_accents if brand_accents else []
                
                # Only add fallbacks if brandfetch didn't provide any guidance
                if not final_backgrounds:
                    # Fallback: use any available colors
                    final_backgrounds = all_colors[:2]
                if not final_accents:
                    # Fallback: use remaining colors as accents
                    final_accents = [c for c in all_colors if c not in final_backgrounds][:2]
                
                print(f"   ✅ Final backgrounds: {final_backgrounds}")
                print(f"   ✅ Final accents: {final_accents}")
                
                # For verified brand data from brandfetch, use it EXACTLY without any post-processing
                # This ensures we respect the official brand colors completely
                smart_result = {
                    'colors': all_colors,
                    'backgrounds': final_backgrounds,  # EXACT brandfetch backgrounds (including white)
                    'accents': final_accents,  # EXACT brandfetch accents 
                    'source': f"intelligent_brand_{config.get('extraction_method', 'hybrid')}_exact",
                    'palette_name': f"{config.get('brand_name', 'Brand')} Official Colors",
                    'text_colors': {
                        'primary': '#1A1A1A' if final_backgrounds and selector._calculate_brightness(final_backgrounds[0]) > 0.7 else '#FFFFFF',
                        'secondary': '#424242' if final_backgrounds and selector._calculate_brightness(final_backgrounds[0]) > 0.7 else '#E5E5E5',
                        'accent': '#1A1A1A' if final_backgrounds and selector._calculate_brightness(final_backgrounds[0]) > 0.7 else '#FFFFFF'
                    },
                    # Generate gradients using only the brand colors (single color variations)
                    'gradients': selector._create_gradient_suggestions(final_backgrounds, all_colors) if final_backgrounds else [],
                    'metadata': {
                        'confidence': config.get('confidence_score', 90) / 100.0
                    }
                }
                
                print(f"   🎯 Using EXACT brandfetch data without any filtering or post-processing")
                
                # Enhance the SmartColorSelector result with intelligent brand metadata
                if smart_result.get('colors'):
                    smart_result['fonts'] = config.get('fonts', [])
                    smart_result['metadata'] = smart_result.get('metadata', {})
                    smart_result['metadata'].update({
                        'brand': config.get('brand_name'),
                        'logo_url': config.get('logo_url'),
                        'confidence': config.get('confidence_score', 90) / 100.0,
                        'extraction_method': 'intelligent_brand_analysis',
                        'raw_primary_color': colors.get('primary'),  # Keep raw for reference
                        'semantic_roles': colors
                    })
                    
                    await self._emit_tool_result(
                        "SmartColorSelector.select_colors_for_request",
                        [f"Brand detected: {config.get('brand_name')}", 
                         f"Colors processed: {len(smart_result.get('colors', []))}",
                         f"Backgrounds: {smart_result.get('backgrounds', [])}",
                         f"Source: {smart_result.get('source', 'unknown')}"]
                    )
                    
                    print(f"   ✅ SmartColorSelector processed brand colors successfully")
                    print(f"   🎨 Processed Backgrounds: {smart_result.get('backgrounds', [])}")
                    return smart_result
                else:
                    print(f"   ⚠️ SmartColorSelector returned no colors, using raw config")
                    
            except Exception as e:
                logger.error(f"SmartColorSelector failed for intelligent brand: {e}")
                print(f"   ⚠️ SmartColorSelector failed, using raw config: {e}")
            
            # Fallback to raw config if SmartColorSelector fails
            result = {
                'colors': colors.get('all_colors', [])[:8],
                'fonts': config.get('fonts', []),
                'source': f"intelligent_brand_{config.get('extraction_method', 'hybrid')}_raw",
                'backgrounds': colors.get('backgrounds', []),
                'accents': colors.get('accents', []),
                'metadata': {
                    'brand': config.get('brand_name'),
                    'logo_url': config.get('logo_url'),
                    'confidence': config.get('confidence_score', 90) / 100.0,
                    'extraction_method': 'intelligent_brand_analysis',
                    'primary_color': colors.get('primary'),
                    'semantic_roles': colors
                }
            }
            return result
        
        # Brand request - use brand tools (fallback)
        # Gate on confidence: require >= 0.8 (domains or strong cues)
        if analysis['is_brand'] and analysis['brand_name'] and float(analysis.get('brand_confidence', 0.0)) >= 0.8:
            # Try web scraper first if we have URL
            if analysis.get('website_url'):
                from agents.tools.theme import WebColorScraper
                scraper = WebColorScraper()
                
                await self._emit_tool_call(
                    "WebColorScraper.scrape_brand_website",
                    {"brand_name": analysis['brand_name'], "url": analysis['website_url']}
                )
                
                try:
                    result = await scraper.scrape_brand_website(
                        brand_name=analysis['brand_name'],
                        url=analysis['website_url']
                    )
                    
                    if result and result.get('colors'):
                        await self._emit_tool_result(
                            "WebColorScraper.scrape_brand_website",
                            [f"Found {len(result.get('colors', []))} colors, css_vars: {len(result.get('css_variables', {}))}, fonts: {len(result.get('fonts', []))}"]
                        )
                        
                        # Emit palette candidates event
                        await self._emit_event("palette_candidates", {
                            "source": "web_scraper",
                            "candidates": [{"name": f"{analysis['brand_name']} Web Colors", "colors": result['colors'][:6]}]
                        })
                        
                        return self._format_scraper_result(result, analysis['brand_name'])
                    else:
                        await self._emit_tool_result(
                            "WebColorScraper.scrape_brand_website",
                            ["No colors found"]
                        )
                except Exception as e:
                    logger.error(f"Web scraper failed: {e}")
                    await self._emit_tool_result(
                        "WebColorScraper.scrape_brand_website",
                        ["Failed to scrape website"]
                    )
                finally:
                    try:
                        await scraper.close()
                    except Exception:
                        pass
            
            # Try holistic brand extractor (website elements + guidelines + fonts)
            from agents.tools.theme.holistic_brand_extractor import HolisticBrandExtractor
            extractor = HolisticBrandExtractor()
            
            await self._emit_tool_call(
                "HolisticBrandExtractor.extract_complete_brand",
                {"brand_name": analysis['brand_name'], "website_url": analysis.get('website_url', f"https://www.{analysis['brand_name'].lower()}.com")}
            )
            
            try:
                async with extractor:
                    result = await extractor.extract_complete_brand(
                        analysis['brand_name'], 
                        analysis.get('website_url', f"https://www.{analysis['brand_name'].lower()}.com")
                    )
                
                if result and result.get('final_colors'):
                    colors = result['final_colors']
                    fonts = result.get('final_fonts', [])
                    method = result.get('extraction_method', 'holistic')
                    confidence = result.get('confidence_score', 0)
                    
                    await self._emit_tool_result(
                        "HolisticBrandExtractor.extract_complete_brand",
                        [
                            f"Found {len(colors)} brand colors using {method}",
                            f"Found {len(fonts)} brand fonts",
                            f"Guidelines found: {result.get('guidelines_found', False)}",
                            f"Website extracted: {result.get('website_extracted', True)}",
                            f"Confidence: {confidence}%"
                        ]
                    )
                    
                    # Emit palette candidates with fonts
                    await self._emit_event("palette_candidates", {
                        "source": f"holistic_extraction_{method}",
                        "candidates": [{"name": f"{analysis['brand_name']} Brand Colors", "colors": colors, "fonts": fonts}]
                    })
                    
                    # Get categorized colors from result
                    color_categories = result.get('color_categories', {})
                    
                    # Use the result with enhanced color categorization and fonts
                    return {
                        'colors': colors,
                        'fonts': fonts,
                        'source': f"holistic_{method}",
                        'backgrounds': color_categories.get('backgrounds', []),
                        'accents': color_categories.get('accent', []),
                        'primary': color_categories.get('primary'),
                        'secondary': color_categories.get('secondary'),
                        'text_colors': color_categories.get('text', []),
                        'neutral_colors': color_categories.get('neutral', []),
                        'metadata': {
                            'brand': analysis['brand_name'],
                            'logo_url': result.get('website_logo_url'),
                            'logo_url_light': result.get('website_logo_url'),  # Default logo (usually light)
                            'logo_url_dark': result.get('website_logo_url_dark'),  # Dark variant if available
                            'confidence': confidence / 100.0,
                            'extraction_method': method,
                            'guidelines_found': result.get('guidelines_found', False),
                            'website_extracted': result.get('website_extracted', True),
                            'sources': result.get('sources', []),
                            'color_categories': color_categories
                        }
                    }
            except Exception as e:
                logger.error(f"Holistic brand extraction failed: {e}")
                await self._emit_tool_result(
                    "HolisticBrandExtractor.extract_complete_brand",
                    ["No brand assets found"]
                )
        elif analysis.get('is_brand') and float(analysis.get('brand_confidence', 0.0)) < 0.8:
            # Low confidence brand detection - do NOT hit network. Fall through to smart selector.
            logger.info(f"Skipping brand fetch due to low confidence ({analysis.get('brand_confidence'):.2f}) for '{analysis.get('brand_name')}'")
        
        # Entity request - use smart selector with entity context
        if analysis['is_entity'] and analysis['entity_name']:
            entity_prompt = f"{analysis['entity_name']} themed presentation"
        else:
            entity_prompt = prompt
        
        # Use SmartColorSelector for all other cases
        from agents.tools.theme import SmartColorSelector
        selector = SmartColorSelector()
        
        await self._emit_tool_call(
            "SmartColorSelector.select_colors_for_request",
            {
                "prompt": entity_prompt[:100] + "..." if len(entity_prompt) > 100 else entity_prompt,
                "title": title,
                "has_style_prefs": bool(style_dict),
                "variety_seed": variety_seed[:8]
            }
        )
        
        try:
            # Get intelligent color selection
            color_result = await selector.select_colors_for_request(
                prompt=entity_prompt,
                title=title,
                style_preferences=style_dict,
                variety_seed=variety_seed  # Pass seed for variety
            )
            
            if color_result.get('colors'):
                await self._emit_tool_result(
                    "SmartColorSelector.select_colors_for_request",
                    [f"{color_result.get('source', 'Unknown')} - {len(color_result['colors'])} colors"]
                )
                
                # Emit candidates if multiple were considered
                if color_result.get('candidates'):
                    await self._emit_event("palette_candidates", {
                        "source": "smart_selector",
                        "candidates": color_result['candidates']
                    })
                
                # Emit selected palette
                await self._emit_event("palette_selected", {
                    "name": color_result.get('palette_name', 'Selected Palette'),
                    "colors": color_result['colors'],
                    "source": color_result.get('source', 'smart_selector')
                })
                
                return color_result
        except Exception as e:
            logger.error(f"SmartColorSelector failed: {e}")
        
        await self._emit_tool_result(
            "SmartColorSelector.select_colors_for_request",
            ["Failed - using fallback"]
        )
        
        # Final fallback
        from agents.tools.theme import get_random_palette
        await self._emit_tool_call("get_random_palette", {"variety_seed": variety_seed[:8]})
        
        result = get_random_palette(
            exclude_pink=True,
            variety_seed=variety_seed
        )
        
        await self._emit_tool_result(
            "get_random_palette",
            [result.get('name', 'Random Palette')]
        )
        
        return result
    
    async def _select_fonts_fast(
        self,
        analysis: Dict[str, Any],
        color_result: Dict[str, Any],
        title: str,
        variety_seed: str
    ) -> Dict[str, str]:
        """AI-driven font selection."""
        from services.registry_fonts import RegistryFonts
        
        # Use scraped brand fonts if available AND locally available
        scraped_fonts = color_result.get('metadata', {}).get('fonts') or []
        if scraped_fonts:
            # CRITICAL: Validate that scraped fonts are available locally
            # Many brands use custom fonts (e.g., "Flexo-Medium") that we don't have
            try:
                all_available = RegistryFonts.get_all_fonts_list(None)
                available_set = {str(f).lower().strip() for f in all_available}
                
                matched_hero = None
                matched_body = None
                
                for font in scraped_fonts:
                    font_lower = str(font).lower().strip()
                    if font_lower in available_set:
                        if not matched_hero:
                            matched_hero = font
                        elif not matched_body:
                            matched_body = font
                            break
                
                if matched_hero:
                    logger.info(f"[FONT SELECTION] ✅ Using available scraped font: {matched_hero}")
                    return {
                        'hero': matched_hero,
                        'body': matched_body or 'Roboto',
                        'source': 'brand_fonts_validated'
                    }
                else:
                    logger.warning(f"[FONT SELECTION] ⚠️ Scraped fonts not available locally: {scraped_fonts}")
            except Exception as e:
                logger.warning(f"[FONT SELECTION] Font validation error: {e}")
        
        # Use AI to select fonts based on context
        try:
            context = f"{title} {analysis.get('entity_name', '')} {analysis.get('brand_name', '')}"
            fonts = await self._get_ai_font_recommendation(context)
            if fonts:
                return fonts
        except Exception:
            pass
        
        # Simple fallback
        return {'hero': 'Montserrat', 'body': 'Roboto', 'source': 'default'}
    
    async def _select_fonts(
        self,
        analysis: Dict[str, Any],
        color_result: Dict[str, Any],
        title: str,
        variety_seed: str,
        style_dict: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Select fonts based on brand/topic/style using intelligent metadata-based selection."""
        from services.enhanced_font_service import EnhancedFontService
        from services.registry_fonts import RegistryFonts

        # PRIORITY 1: Check for user-specified fonts from stylePreferences (e.g., extracted from uploaded PDF)
        user_hero_font = style_dict.get('font') if style_dict else None
        user_body_font = style_dict.get('bodyFont') if style_dict else None

        if user_hero_font:
            logger.info(f"[FONT SELECTION] 🎯 Found user-specified font from stylePreferences: hero={user_hero_font}, body={user_body_font}")

        # Check if we have brand fonts from scraping
        scraped_fonts = []
        if color_result.get('metadata', {}).get('fonts'):
            scraped_fonts = color_result['metadata']['fonts']
            
        await self._emit_tool_call(
            "FontSelector.select_fonts",
            {
                "context": analysis.get('topic') or 'general',
                "brand": analysis.get('brand_name'),
                "entity": analysis.get('entity_name'),
                "scraped_fonts": len(scraped_fonts) if color_result.get('metadata', {}).get('fonts') else 0,
                "variety_seed": variety_seed[:8],
                "method": "enhanced_metadata"
            }
        )
        
        font_result = {}

        # CRITICAL: Check for fun/playful topics FIRST - before using brand fonts!
        # Fun topics (Pokemon, Mario, etc.) should ALWAYS get playful fonts, even if brand fonts exist
        entity_name = (analysis.get('entity_name') or '').lower() if analysis.get('entity_name') else ''
        is_fun_entity = any(keyword in entity_name for keyword in [
            'pikachu', 'pokemon', 'pokémon', 'mario', 'luigi', 'disney', 'mickey',
            'cartoon', 'game', 'toy', 'character', 'sonic', 'zelda', 'kirby',
            'spongebob', 'nickelodeon', 'pixar', 'dreamworks', 'lego', 'nerf',
            'barbie', 'hot wheels', 'transformers', 'paw patrol', 'peppa pig'
        ]) if entity_name else False

        # Check if title suggests kids/fun topic
        # Use word boundary matching to avoid false positives like "fun" in "fundraising"
        import re
        title_lower = (title or '').lower() if title else ''
        fun_keywords = [
            'pikachu', 'pokemon', 'pokémon', 'pokedex', 'pokédex', 'kids', 'children',
            'game', 'fun', 'play', 'cartoon', 'toy', 'party', 'arcade', 'retro',
            'gaming', 'birthday', 'silly', 'celebration', 'video', 'anime', 'manga',
            'superhero', 'comic', 'animated'
        ]
        is_fun_topic = any(re.search(rf'\b{re.escape(kw)}\b', title_lower) for kw in fun_keywords) if title_lower else False

        if is_fun_entity or is_fun_topic:
            # OVERRIDE: Use playful fonts - even if brand fonts exist!
            logger.info(f"🎨 FUN TOPIC DETECTED (PRIORITY CHECK): {entity_name or title} → Using PLAYFUL fonts")
            print(f"\n🎨🎨🎨 FUN TOPIC DETECTED - OVERRIDING BRAND FONTS 🎨🎨🎨")
            print(f"   Title: '{title}'")
            print(f"   Entity: '{entity_name}'")
            print(f"   is_fun_entity: {is_fun_entity}")
            print(f"   is_fun_topic: {is_fun_topic}")
            print(f"   → Selecting CREATIVE, PLAYFUL fonts!\n")

            # Rotate through playful font combinations
            import hashlib
            seed_hash = int(hashlib.md5(variety_seed.encode()).hexdigest(), 16)

            playful_combos = [
                {'hero': 'Bebas Neue', 'body': 'Nunito'},
                {'hero': 'Fredoka', 'body': 'Quicksand'},
                {'hero': 'Righteous', 'body': 'Poppins'},
                {'hero': 'Bungee', 'body': 'Asap'},
                {'hero': 'Bangers', 'body': 'Rubik'},
                {'hero': 'Titan One', 'body': 'Cabin'},
                {'hero': 'Pacifico', 'body': 'Comfortaa'},
                {'hero': 'Press Start 2P', 'body': 'Space Mono'}
            ]

            combo_idx = seed_hash % len(playful_combos)
            selected_combo = playful_combos[combo_idx]

            font_result = {
                'hero': selected_combo['hero'],
                'body': selected_combo['body'],
                'source': 'fun_topic_override',
                'hero_category': 'playful',
                'body_category': 'friendly'
            }

            logger.info(f"✅ PLAYFUL FONTS (PRIORITY): Hero={font_result['hero']}, Body={font_result['body']}")
            print(f"✅✅✅ PLAYFUL FONTS SELECTED (PRIORITY) ✅✅✅")
            print(f"   Hero: {font_result['hero']}")
            print(f"   Body: {font_result['body']}")
            print(f"   Combo: {combo_idx + 1}/{len(playful_combos)}\n")
        elif scraped_fonts:
            # Match scraped fonts to available (only if NOT a fun topic)
            try:
                from models.registry import ComponentRegistry
                registry = ComponentRegistry()
                available_fonts = RegistryFonts.get_available_fonts(registry)
            except Exception:
                available_fonts = RegistryFonts.get_all_fonts_list()
            matched = self._match_fonts(scraped_fonts, available_fonts)
            if matched:
                font_result = matched
                # If body needs AI selection (only 1 brand font found)
                if font_result.get('needs_ai_body') and font_result.get('body') == '__AI_SELECT__':
                    hero_font = font_result['hero']
                    vibe = analysis.get('vibe', 'professional')
                    body_font = await self._ai_select_complementary_body_font(hero_font, title, vibe, available_fonts)
                    font_result['body'] = body_font
                    logger.info(f"[THEME] AI selected body font '{body_font}' to complement hero '{hero_font}'")

        # PRIORITY 2: Use user-specified fonts from stylePreferences if brand fonts failed/unavailable
        if not font_result and user_hero_font:
            # Validate the user-specified font exists in our registry
            all_available = RegistryFonts.get_all_fonts_list(None)
            available_lower = {f.lower(): f for f in all_available}

            validated_hero = available_lower.get(user_hero_font.lower())
            validated_body = available_lower.get((user_body_font or user_hero_font).lower())

            if validated_hero:
                # Use the exact casing from our registry
                font_result = {
                    'hero': validated_hero,
                    'body': validated_body or validated_hero,
                    'source': 'user_stylePreferences'
                }
                logger.info(f"[FONT SELECTION] ✅ Using user-specified fonts from stylePreferences: hero={validated_hero}, body={validated_body or validated_hero}")
            else:
                logger.warning(f"[FONT SELECTION] ⚠️ User-specified font '{user_hero_font}' not available in registry")

        if not font_result:
            # Fun topics are already handled above with priority - this handles remaining cases
            if analysis.get('is_brand') and analysis.get('brand_name'):
                # BRAND DETECTED but brand fonts not available - use AI to select brand-appropriate fonts
                brand_name = analysis.get('brand_name')
                logger.info(f"🏷️ BRAND DETECTED: {brand_name} → Selecting brand-appropriate fonts with AI")
                print(f"\n🏷️🏷️🏷️ BRAND DETECTED IN THEME_DIRECTOR 🏷️🏷️🏷️")
                print(f"   Brand: '{brand_name}'")
                print(f"   → Selecting fonts that match the brand's personality!\n")

                try:
                    # Use AI to select fonts that match the brand's personality
                    all_available = RegistryFonts.get_all_fonts_list(None)
                    font_categories = RegistryFonts.get_available_fonts()

                    font_list_parts = []
                    for category, fonts_in_cat in font_categories.items():
                        if fonts_in_cat:
                            font_list_parts.append(f"**{category}**: {', '.join(fonts_in_cat[:25])}")
                    available_fonts_str = "\n".join(font_list_parts)

                    prompt = f"""Select appropriate fonts for a presentation about the brand "{brand_name}".

The brand's own fonts aren't available, so select fonts from our library that MATCH THE BRAND'S PERSONALITY and visual identity.

Consider the brand's characteristics:
- Industry/sector (tech, food, luxury, sports, etc.)
- Brand personality (modern, traditional, playful, sophisticated, etc.)
- Target audience (young, professional, mass market, premium, etc.)

Available fonts by category:
{available_fonts_str}

Return your selection as:
HERO: [font name]
BODY: [font name]

IMPORTANT:
- Hero font should reflect the brand's headline style (bold, impactful)
- Body font should be highly readable and complement the hero
- Hero and body MUST be DIFFERENT fonts
- Only use fonts from the list above"""

                    # Use the unified AI client infrastructure
                    from agents.config import FONT_SELECTION_MODEL
                    client, actual_model = get_client(FONT_SELECTION_MODEL)
                    if not client or not actual_model:
                        raise ValueError(f"Failed to get client for {FONT_SELECTION_MODEL}")

                    response = invoke(
                        client=client,
                        model=actual_model,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=100,
                        temperature=0.3,
                        theme_generation=True
                    )

                    response_text = response.get("content") if isinstance(response, dict) else response
                    response_text = response_text.strip()
                    hero_font = None
                    body_font = None

                    for line in response_text.split('\n'):
                        line = line.strip()
                        if line.upper().startswith('HERO:'):
                            hero_font = line.split(':', 1)[1].strip().strip('"\'')
                        elif line.upper().startswith('BODY:'):
                            body_font = line.split(':', 1)[1].strip().strip('"\'')

                    # Validate fonts exist
                    available_lower = {f.lower(): f for f in all_available}
                    if hero_font and hero_font.lower() in available_lower:
                        hero_font = available_lower[hero_font.lower()]
                    else:
                        hero_font = 'Montserrat'
                    if body_font and body_font.lower() in available_lower:
                        body_font = available_lower[body_font.lower()]
                    else:
                        body_font = 'Roboto'

                    # Ensure different fonts
                    if hero_font.lower() == body_font.lower():
                        body_font = 'Roboto' if hero_font != 'Roboto' else 'Open Sans'

                    font_result = {
                        'hero': hero_font,
                        'body': body_font,
                        'source': 'brand_ai_selected'
                    }
                    logger.info(f"✅ BRAND FONTS (AI): Hero={font_result['hero']}, Body={font_result['body']}")

                except Exception as e:
                    logger.warning(f"AI brand font selection failed: {e}")
                    font_result = {'hero': 'Montserrat', 'body': 'Roboto', 'source': 'fallback'}
            else:
                # Use FontIntelligence for intelligent metadata-based selection
                try:
                    from agents.tools.theme.font_intelligence import get_font_intelligence
                    font_intelligence = get_font_intelligence()

                    # Extract context from analysis
                    vibe = analysis.get('vibe', 'professional')
                    topic = analysis.get('topic') or analysis.get('industry')
                    audience = analysis.get('audience') or analysis.get('target_audience')

                    # Check if we have brand context
                    brand_name = analysis.get('brand_name')
                    brand_domain = analysis.get('brand_domain')

                    if brand_name or brand_domain:
                        # Use brand-aware font selection
                        font_pair = font_intelligence.select_fonts_for_brand(
                            brand_name=brand_name or brand_domain or title,
                            brand_domain=brand_domain,
                            content_topic=topic
                        )
                    else:
                        # Use content-aware font selection
                        font_pair = font_intelligence.select_fonts_for_content(
                            title=title,
                            topic=topic,
                            vibe=vibe,
                            audience=audience
                        )

                    font_result = {
                        'hero': font_pair['hero'],
                        'body': font_pair['body'],
                        'source': 'font_intelligence',
                        'style': font_pair.get('style'),
                        'reasoning': font_pair.get('reasoning')
                    }
                    logger.info(f"[THEME] FontIntelligence selected: {font_result['hero']} + {font_result['body']} ({font_pair.get('style')})")
                except Exception as e:
                    # Fallback to safe defaults
                    logger.warning(f"FontIntelligence failed, using fallback: {e}")
                    font_result = {'hero': 'Poppins', 'body': 'Inter', 'source': 'fallback'}
        
        await self._emit_tool_result(
            "FontSelector.select_fonts",
            [f"Hero: {font_result.get('hero', 'default')}, Body: {font_result.get('body', 'default')} (source: {font_result.get('source', 'unknown')})"]
        )
        
        # Emit fonts selected event
        await self._emit_event("fonts_selected", font_result)
        
        return font_result
    
    async def _compose_theme(
        self,
        color_result: Dict[str, Any],
        font_result: Dict[str, Any],
        analysis: Dict[str, Any],
        deck_outline: Any = None
    ) -> Dict[str, Any]:
        """Compose final theme from colors and fonts."""
        colors = color_result.get('colors', [])
        backgrounds = color_result.get('backgrounds', [])
        accents = color_result.get('accents', [])
        text_colors = color_result.get('text_colors', {})
        gradients = color_result.get('gradients', [])
        is_brand_cache = color_result.get('source') == 'brandfetch_cache'

        print(f"\n🎨 [THEME BUILD] Source: {color_result.get('source')}, is_brand_cache: {is_brand_cache}")
        print(f"🎨 [THEME BUILD] Colors: {colors}")
        print(f"🎨 [THEME BUILD] Backgrounds: {backgrounds}")
        print(f"🎨 [THEME BUILD] Accents: {accents}")
        print(f"🎨 [THEME BUILD] Text Colors: {color_result.get('text_colors')}")

        # Helper to extract hex from color value (handles string or dict with 'hex' key)
        def extract_hex(color_val):
            if isinstance(color_val, str):
                return color_val
            elif isinstance(color_val, dict) and 'hex' in color_val:
                return color_val['hex']
            elif isinstance(color_val, list) and len(color_val) > 0:
                return extract_hex(color_val[0])
            return None

        # ✅ IF BRAND CACHE: USE COLORS EXACTLY AS-IS, NO SANITIZATION, NO FALLBACKS!
        if is_brand_cache and backgrounds and accents:
            print(f"🎨 [BRAND COLORS] ✅ USING EXACT BRAND COLORS - NO MODIFICATIONS!")
            primary_bg = extract_hex(backgrounds[0]) or '#FFFFFF'
            secondary_bg = extract_hex(backgrounds[1] if len(backgrounds) > 1 else (accents[0] if accents else backgrounds[0])) or primary_bg
            accent_1 = extract_hex(accents[0]) or '#6366f1'
            accent_2 = extract_hex(accents[1] if len(accents) > 1 else accents[0]) or accent_1

            # Use brand text colors if available, otherwise compute them
            brand_text_colors = color_result.get('text_colors')  # This is a list like ['#003D29']
            if brand_text_colors and isinstance(brand_text_colors, list) and len(brand_text_colors) > 0:
                # Use brand text colors - build the dict from the list
                primary_text = brand_text_colors[0]
                secondary_text = brand_text_colors[1] if len(brand_text_colors) > 1 else primary_text
                text_colors = {
                    "primary": primary_text,
                    "secondary": secondary_text,
                    "heading": primary_text,
                    "body": primary_text
                }
                print(f"🎨 [BRAND COLORS] Using brand text color: {primary_text}")
            elif not text_colors:
                # Fallback: compute text colors based on background brightness
                text_colors = self._compute_text_colors(primary_bg, accent_1, accent_2)
                print(f"🎨 [BRAND COLORS] Computed text colors from background")

            print(f"🎨 [BRAND COLORS] ✅ FINAL: bg={primary_bg}, accent1={accent_1}, accent2={accent_2}, text={text_colors.get('primary') if isinstance(text_colors, dict) else text_colors}\n")

            # Skip ALL sanitization - jump straight to building the theme object
            primary_text = text_colors.get('primary') if isinstance(text_colors, dict) else '#1A1A1A'
            theme = {
                'color_palette': {
                    'primary_background': primary_bg,
                    'secondary_background': secondary_bg,
                    'primary_text': primary_text,  # Add explicit primary_text for frontend compatibility
                    'accent_1': accent_1,
                    'accent_2': accent_2,
                    'colors': colors,
                    'backgrounds': backgrounds,
                    'accents': accents,
                    'text_colors': text_colors,
                    'gradients': gradients if gradients else [],
                    'source': 'brandfetch_cache',
                    'palette_name': color_result.get('palette_name', 'Brand Colors'),
                    'metadata': color_result.get('metadata', {})
                },
                'typography': {
                    'hero_title': {
                        'family': font_result.get('hero', 'Montserrat'),
                        'weight': '700',
                        'size': '48px'
                    },
                    'body_text': {
                        'family': font_result.get('body', 'Roboto'),
                        'weight': '400',
                        'size': '16px'
                    },
                    'fonts': color_result.get('fonts', []),
                    'font_source': font_result.get('source', 'contextual')
                },
                'visual_style': {
                    'background_style': 'solid',
                    'style_keywords': analysis.get('style_keywords', [])
                }
            }

            # Add logo if available
            try:
                logo_url_top = (color_result.get('metadata') or {}).get('logo_url')
                if deck_outline and hasattr(deck_outline, 'stylePreferences') and deck_outline.stylePreferences:
                    if hasattr(deck_outline.stylePreferences, 'logoUrl'):
                        user_logo = deck_outline.stylePreferences.logoUrl
                        if isinstance(user_logo, str) and user_logo.strip():
                            logo_url_top = user_logo.strip()

                if isinstance(logo_url_top, str) and logo_url_top.strip():
                    theme['brandInfo'] = {'logoUrl': logo_url_top}
                    if 'metadata' not in theme['color_palette']:
                        theme['color_palette']['metadata'] = {}
                    theme['color_palette']['metadata']['logo_url'] = logo_url_top
            except Exception:
                pass

            # Add brand screenshot as reference image for visual design inspiration
            try:
                brand_screenshot = (color_result.get('metadata') or {}).get('brand_screenshot')
                if brand_screenshot:
                    theme['reference_images'] = [brand_screenshot]
                    logger.info(f"[THEME DIRECTOR] 📸 Added brand screenshot to theme.reference_images")
            except Exception:
                pass

            # Generate creative design style
            design_style = await self._generate_design_style(analysis, deck_outline)
            theme['design_style'] = design_style

            return theme

        # ELSE: Non-brand colors - do normal inference and sanitization
        print(f"🎨 [THEME BUILD] Not brand cache - doing inference and sanitization...")

        # Ensure we have valid backgrounds and accents
        if not backgrounds:
            backgrounds = self._infer_backgrounds(colors)
            print(f"🎨 [THEME BUILD] Inferred backgrounds: {backgrounds}")
        if not accents:
            accents = self._infer_accents(colors)
            print(f"🎨 [THEME BUILD] Inferred accents: {accents}")

        # Select primary/secondary from lists
        primary_bg = backgrounds[0] if backgrounds else '#0A0E27'
        secondary_bg = backgrounds[1] if len(backgrounds) > 1 else self._darken_color(primary_bg, 0.15)
        accent_1 = accents[0] if accents else '#2563EB'
        accent_2 = accents[1] if len(accents) > 1 else self._shift_hue(accent_1, 60)

        print(f"🎨 [THEME BUILD] BEFORE sanitize - primary_bg: {primary_bg}, accent_1: {accent_1}")

        # Policy: avoid grey and pink backgrounds unless explicitly requested
        def _is_greyish(hex_color: str) -> bool:
            try:
                h = hex_color.lstrip('#')
                r = int(h[0:2], 16) / 255.0
                g = int(h[2:4], 16) / 255.0
                b = int(h[4:6], 16) / 255.0
                mx, mn = max(r, g, b), min(r, g, b)
                s = 0.0 if mx == 0 else (mx - mn) / mx
                # Consider greys as very low saturation, not near white/black
                return s < 0.12 and (not self._is_near_white(hex_color)) and (not self._is_near_black(hex_color))
            except Exception:
                return False
        
        def _is_pinkish(hex_color: str) -> bool:
            try:
                h = hex_color.lstrip('#')
                r = int(h[0:2], 16) / 255.0
                g = int(h[2:4], 16) / 255.0
                b = int(h[4:6], 16) / 255.0
                import colorsys
                hh, ss, ll = colorsys.rgb_to_hls(r, g, b)
                hue = (hh * 360.0) % 360.0
                return (ss >= 0.25) and (300.0 <= hue <= 355.0)
            except Exception:
                return False
        
        def _sanitize_bg(bg: str, fallback_from: str) -> str:
            # IMPORTANT: If this is from brand cache, trust it completely
            is_from_brand_cache = color_result.get('source') == 'brandfetch_cache'
            print(f"🎨 [SANITIZE] Input bg: {bg}, is_from_brand_cache: {is_from_brand_cache}")
            if is_from_brand_cache:
                print(f"🎨 [SANITIZE] ✅ Trusting brand cache background: {bg}")
                return bg

            # For presentations, near-white backgrounds are GOOD! Only reject grey/pink
            if not _is_greyish(bg) and not _is_pinkish(bg):
                print(f"🎨 [SANITIZE] ✅ Background {bg} is acceptable")
                return bg

            print(f"🎨 [SANITIZE] ❌ Background {bg} rejected as greyish/pinkish, finding alternative")
            # Try to find a better candidate from provided colors
            try:
                candidates = [c for c in (colors or []) if isinstance(c, str)]
                # Prefer light, saturated, non-pink, non-grey
                def _brightness(c: str) -> float:
                    return self._estimate_brightness(c)
                ranked = sorted(
                    [c for c in candidates if not _is_greyish(c) and not _is_pinkish(c)],
                    key=lambda c: (_brightness(c), self._calculate_saturation(c)),
                    reverse=True
                )
                if ranked:
                    logger.info(f"[THEME] Using alternative background: {ranked[0]}")
                    return ranked[0]
            except Exception:
                pass
            # Synthesize from accent_1 to avoid grey/pink
            try:
                base = accent_1 if isinstance(accent_1, str) else fallback_from
                # Lighten to create a usable background
                candidate = self._lighten_color(base, 0.22)
                if _is_pinkish(candidate):
                    candidate = self._shift_hue(candidate, -20)
                logger.info(f"[THEME] Synthesized background: {candidate}")
                return candidate
            except Exception:
                return fallback_from

        primary_bg = _sanitize_bg(primary_bg, primary_bg)
        print(f"🎨 [THEME BUILD] AFTER sanitize - primary_bg: {primary_bg}")

        # Normalize potential None values before string operations
        try:
            primary_bg = str(primary_bg or '#FFFFFF')
            secondary_bg = str(secondary_bg or primary_bg)
            accent_1 = str(accent_1 or '#FF4301')
            accent_2 = str(accent_2 or accent_1)
        except Exception:
            primary_bg = str(primary_bg) if primary_bg is not None else '#FFFFFF'
            secondary_bg = str(secondary_bg) if secondary_bg is not None else primary_bg
            accent_1 = str(accent_1) if accent_1 is not None else '#FF4301'
            accent_2 = str(accent_2) if accent_2 is not None else accent_1

        print(f"🎨 [THEME BUILD] ✅ FINAL THEME - primary_bg: {primary_bg}, accent_1: {accent_1}, accent_2: {accent_2}\n")
        # Ensure secondary differs and is usable
        if secondary_bg.lower() == primary_bg.lower() or _is_greyish(secondary_bg) or _is_pinkish(secondary_bg):
            secondary_bg = self._darken_color(primary_bg, 0.15)
            if _is_pinkish(secondary_bg) or _is_greyish(secondary_bg):
                secondary_bg = self._shift_hue(primary_bg, 20)

        # Guard against background == accent
        if primary_bg.lower() == accent_1.lower():
            primary_bg = self._lighten_color(primary_bg, 0.1)
        if secondary_bg.lower() == accent_1.lower():
            secondary_bg = self._darken_color(secondary_bg, 0.1)
        
        # Generate gradients only if user requested them and not provided
        if not gradients and analysis.get('wants_gradients', False):
            gradients = self._create_gradients(primary_bg, secondary_bg, accent_1, accent_2)
        elif not analysis.get('wants_gradients', False):
            gradients = []
        
        # Compute text colors if not provided
        if not text_colors:
            text_colors = self._compute_text_colors(primary_bg, accent_1, accent_2)

        # Extract primary_text for frontend compatibility
        primary_text_color = text_colors.get('primary') if isinstance(text_colors, dict) else '#1A1A1A'

        theme = {
            'color_palette': {
                'primary_background': primary_bg,
                'secondary_background': secondary_bg,
                'primary_text': primary_text_color,  # Add explicit primary_text for frontend
                'accent_1': accent_1,
                'accent_2': accent_2,
                'colors': colors,
                'backgrounds': backgrounds,
                'accents': accents,
                'text_colors': text_colors,
                'gradients': gradients,
                'source': color_result.get('source', 'generated'),
                'palette_name': color_result.get('palette_name', 'Custom Palette'),
                'metadata': color_result.get('metadata', {})
            },
            'typography': {
                'hero_title': {
                    'family': font_result.get('hero', 'Montserrat'),
                    'weight': '700',
                    'size': '48px'
                },
                'body_text': {
                    'family': font_result.get('body', 'Roboto'),
                    'weight': '400',
                    'size': '16px'
                },
                'fonts': color_result.get('fonts', []),  # Include extracted brand fonts
                'font_source': font_result.get('source', 'contextual')
            },
            'visual_style': {
                'background_style': 'gradient' if primary_bg not in ['#fff', '#ffffff'] else 'solid',
                'style_keywords': analysis.get('style_keywords', [])
            }
        }

        # Expose logo URL and aspect at a stable top-level place for the frontend ThemeTab
        try:
            palette_meta = theme.get('color_palette', {}).get('metadata', {}) or {}
            
            # PRIORITY 1: Check for user-uploaded logo in deck_outline.stylePreferences.logoUrl
            logo_url_top = None
            if deck_outline and hasattr(deck_outline, 'stylePreferences') and deck_outline.stylePreferences:
                if hasattr(deck_outline.stylePreferences, 'logoUrl'):
                    user_logo = deck_outline.stylePreferences.logoUrl
                    if isinstance(user_logo, str) and user_logo.strip():
                        logo_url_top = user_logo.strip()
                        logger.info(f"[THEME DIRECTOR] Using user-uploaded logo from stylePreferences: {logo_url_top[:60]}...")
            
            # PRIORITY 2: Fallback to scraped brand logo
            if not logo_url_top:
                logo_url_top = (color_result.get('metadata') or {}).get('logo_url') or palette_meta.get('logo_url')
                if isinstance(logo_url_top, str) and logo_url_top.strip():
                    logger.info(f"[THEME DIRECTOR] Using scraped brand logo: {logo_url_top[:60]}...")
            
            if isinstance(logo_url_top, str) and logo_url_top.strip():
                # Include aspect information if known
                aspect_in_meta = (color_result.get('metadata') or {}).get('logo_aspect') or palette_meta.get('logo_aspect')
                if not aspect_in_meta:
                    # Try from analysis intelligent_brand_config
                    aspect_in_meta = (analysis.get('intelligent_brand_config') or {}).get('logo_aspect')
                brand_info = {'logoUrl': logo_url_top}
                if aspect_in_meta:
                    brand_info['logoAspect'] = aspect_in_meta
                theme['brandInfo'] = brand_info
                
                # Also add to color_palette.metadata for consistency
                if 'metadata' not in theme['color_palette']:
                    theme['color_palette']['metadata'] = {}
                theme['color_palette']['metadata']['logo_url'] = logo_url_top
                
                # Also copy back aspect info to palette metadata for downstream consumers if missing
                try:
                    if aspect_in_meta and 'logo_aspect' not in palette_meta:
                        theme['color_palette']['metadata']['logo_aspect'] = aspect_in_meta
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"[THEME DIRECTOR] Error setting logo in theme: {e}")

        # Attach concise human-readable rationale for palette selection
        try:
            bullets: list[str] = []
            topic = analysis.get('topic') or ''
            style_keywords = analysis.get('style_keywords') or []
            src = color_result.get('source') or 'selector'
            brand = (color_result.get('metadata') or {}).get('brand')

            if brand:
                bullets.append(f"Reflects {brand} brand identity")
            if topic:
                bullets.append(f"Fits the '{topic}' context")
            if style_keywords:
                bullets.append("Style cues: " + ", ".join(style_keywords[:3]))

            # Readability note based on computed text color choice
            primary_text = text_colors.get('primary')
            if isinstance(primary_text, str):
                def _lum(hex_color: str) -> float:
                    try:
                        hc = hex_color.lstrip('#')
                        r = int(hc[0:2], 16) / 255.0
                        g = int(hc[2:4], 16) / 255.0
                        b = int(hc[4:6], 16) / 255.0
                        return 0.2126 * r + 0.7152 * g + 0.0722 * b
                    except Exception:
                        return 0.5
                contrast_hint = 'good contrast' if abs(_lum(primary_bg) - _lum(primary_text)) >= 0.4 else 'moderate contrast'
                bullets.append(f"{contrast_hint} between background {primary_bg} and text {primary_text}")

            bullets.append(f"Selected via {src}")

            theme['explanation'] = {
                'palette_reason': f"Palette balances readability and emphasis for {topic or 'the presentation'}.",
                'bullets': bullets
            }
        except Exception:
            # Non-fatal; explanation is optional
            pass

        # Set a meaningful theme name to avoid defaulting to "Modern"
        try:
            meta = color_result.get('metadata', {}) or {}
            palette_meta_name = meta.get('name')
            palette_name = color_result.get('palette_name') or ''
            topic = (analysis.get('topic') or '')
            style_keywords = analysis.get('style_keywords') or []
            base_name = None
            if isinstance(palette_meta_name, str) and palette_meta_name.strip():
                base_name = palette_meta_name.strip()
            elif isinstance(palette_name, str) and palette_name.strip() and palette_name.lower() != 'custom palette':
                base_name = palette_name.strip()
            elif isinstance(topic, str) and topic.strip():
                base_name = topic.strip().title()
            else:
                base_name = 'Adaptive'
            descriptor = ''
            if style_keywords and isinstance(style_keywords, list):
                first_kw = str(style_keywords[0]).strip()
                if first_kw and first_kw.lower() not in base_name.lower():
                    descriptor = first_kw.title()
            parts = [base_name]
            if descriptor:
                parts.append(descriptor)
            parts.append('Theme')
            theme['theme_name'] = ' '.join(parts)
        except Exception:
            theme['theme_name'] = 'Adaptive Theme'
        
        # Add brand/entity metadata
        if analysis['is_brand']:
            theme['metadata'] = {
                'brand_name': analysis['brand_name'],
                'website_url': analysis.get('website_url')
            }
        elif analysis['is_entity']:
            theme['metadata'] = {
                'entity_name': analysis['entity_name']
            }

        # Generate creative design style
        design_style = await self._generate_design_style(analysis, deck_outline)
        theme['design_style'] = design_style

        return theme
    
    async def _generate_design_style(
        self,
        analysis: Dict[str, Any],
        deck_outline: Any
    ) -> str:
        """Generate a creative design style description using AI.

        The AI will come up with its own creative style based on the content,
        not from a fixed list. Examples it might create:
        - "Minimalist with bold typography and ample whitespace"
        - "Playful with rotated elements and vibrant energy"
        - "Corporate clean with structured grids"
        - "Editorial magazine-style with dramatic imagery"
        """
        title = getattr(deck_outline, 'title', '') or ''
        prompt = getattr(deck_outline, 'prompt', '') or ''
        topic = analysis.get('topic', '')
        style_keywords = analysis.get('style_keywords', [])

        system_prompt = """You are a creative design director. Generate a unique design style description for a presentation.

Your style description should:
- Be 1-2 sentences (concise!)
- Describe the overall visual approach
- Consider the content and audience
- Be creative and specific (not generic)
- Include layout philosophy, typography approach, visual elements

Examples of good styles:
- "Minimalist with generous whitespace, left-aligned layouts, and subtle geometric accents"
- "Bold and playful with rotated elements, vibrant colors, and dynamic asymmetry"
- "Editorial magazine style with large imagery, elegant typography, and dramatic contrasts"
- "Tech-forward with clean grids, sans-serif precision, and floating UI elements"
- "Organic and flowing with curved shapes, warm tones, and natural spacing"

DO NOT use the examples above - create your own unique style!"""

        user_prompt = f"""Create a design style for this presentation:

Title: {title}
Topic: {topic}
Keywords: {', '.join(style_keywords[:5]) if style_keywords else 'general'}
Context: {prompt[:200] if prompt else 'general presentation'}

Generate a creative, specific design style description (1-2 sentences):"""

        try:
            from agents.config import THEME_MODEL
            client, actual_model = get_client(THEME_MODEL)
            response = invoke(
                client=client,
                model=actual_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.8  # Higher temperature for creativity
            )
            style = response.strip()

            # Ensure it's not too long
            if len(style) > 300:
                style = style[:297] + "..."

            logger.info(f"[THEME DIRECTOR] Generated design style: {style}")
            return style
        except Exception as e:
            logger.warning(f"[THEME DIRECTOR] Error generating design style: {e}")
            # Fallback to a simple style
            return "Clean and professional with balanced typography and thoughtful spacing"

    async def _upload_brand_assets(
        self,
        color_result: Dict[str, Any],
        deck_outline: Any
    ) -> None:
        """Upload scraped brand assets (logos) to storage."""
        metadata = color_result.get('metadata', {})
        logo_url = metadata.get('logo_url')
        logo_url_dark = metadata.get('logo_url_dark')  # Dark variant for light backgrounds

        if not logo_url:
            return

        await self._emit_tool_call(
            "ImageStorageService.upload_from_url",
            {"url": logo_url, "type": "brand_logo"}
        )

        try:
            # This would use actual image storage service
            stored_url = logo_url  # In reality, this would be CDN URL
            stored_url_dark = logo_url_dark  # Keep dark variant URL

            await self._emit_tool_result(
                "ImageStorageService.upload_from_url",
                [f"Uploaded logo to: {stored_url}"]
            )

            # Emit assets uploaded event
            logos_list = [{"url": stored_url, "type": "brand_logo"}]
            if stored_url_dark:
                logos_list.append({"url": stored_url_dark, "type": "brand_logo_dark"})
            await self._emit_event("assets_uploaded", {
                "logos": logos_list
            })

            # Store in deck data if possible
            if hasattr(deck_outline, 'data'):
                if not hasattr(deck_outline.data, 'assets'):
                    deck_outline.data.assets = {}
                deck_outline.data.assets['logos'] = logos_list

            # CRITICAL: Set logo in stylePreferences for slide generation
            # Set BOTH light and dark variants so proper contrast can be chosen
            if hasattr(deck_outline, 'stylePreferences') and deck_outline.stylePreferences:
                deck_outline.stylePreferences.logoUrl = stored_url
                if stored_url_dark:
                    # Set dark variant if available (logoUrlDark should exist on StylePreferencesItem)
                    if hasattr(deck_outline.stylePreferences, 'logoUrlDark'):
                        deck_outline.stylePreferences.logoUrlDark = stored_url_dark
                        logger.info(f"🖼️ Logo URLs set - Light: {stored_url[:50]}..., Dark: {stored_url_dark[:50]}...")
                    else:
                        logger.info(f"🖼️ Logo URL set in stylePreferences: {stored_url}")
                        logger.warning(f"⚠️ stylePreferences has no logoUrlDark field - dark variant not stored")
                else:
                    logger.info(f"🖼️ Logo URL set in stylePreferences (no dark variant): {stored_url}")
            elif hasattr(deck_outline, 'stylePreferences'):
                # stylePreferences exists but is None, create it using the correct model
                from models.requests import StylePreferencesItem
                deck_outline.stylePreferences = StylePreferencesItem(logoUrl=stored_url, logoUrlDark=stored_url_dark)
                logger.info(f"🖼️ Created stylePreferences with logo URLs")
            else:
                logger.warning("⚠️ Cannot set logo - stylePreferences not available")
        except Exception as e:
            logger.error(f"Failed to upload logo: {e}")
            await self._emit_tool_result(
                "ImageStorageService.upload_from_url",
                ["Failed to upload"]
            )
    
    def _format_scraper_result(self, result: Dict[str, Any], brand_name: str) -> Dict[str, Any]:
        """Format web scraper result into color result format."""
        colors = result.get('colors', [])
        
        # Categorize colors
        categorized = result.get('categorized', {})
        # Map possible key variants from scraper
        backgrounds = (
            categorized.get('backgrounds')
            or categorized.get('background')
            or []
        )
        accents = (
            categorized.get('primaries', [])
            or categorized.get('primary', [])
        ) + categorized.get('accents', []) + categorized.get('accent', [])
        
        if not backgrounds:
            backgrounds = self._infer_backgrounds(colors)
        if not accents:
            accents = self._infer_accents(colors)
        
        return {
            'colors': colors,
            'backgrounds': backgrounds[:2],
            'accents': accents[:2],
            'text_colors': {},
            'gradients': [],
            'source': 'brand_tools',
            'palette_name': f"{brand_name} Brand Colors",
            'metadata': {
                'brand': brand_name,
                'logo_url': result.get('logo_url'),
                'fonts': result.get('fonts', []),
                'guidelines_url': result.get('guidelines_url')
            }
        }
    
    def _match_fonts(self, scraped_fonts: List[str], available_fonts: List[str]) -> Dict[str, str]:
        """Match scraped fonts to available fonts with strict validation."""
        if not scraped_fonts or not available_fonts:
            return {}

        # Filter out CSS variables and invalid font names
        # CSS variables like "var(--heading-font)" are not valid font names
        def is_valid_font_name(name: str) -> bool:
            if not name or not isinstance(name, str):
                return False
            name_lower = name.lower().strip()
            # Skip CSS variables
            if name_lower.startswith('var(') or name_lower.startswith('--'):
                return False
            # Skip too short names (likely invalid)
            if len(name_lower) < 2:
                return False
            # Skip pure numbers
            if name_lower.isdigit():
                return False
            return True

        scraped_fonts = [f for f in scraped_fonts if is_valid_font_name(f)]
        if not scraped_fonts:
            logger.info("[FONT MATCH] No valid font names found after filtering CSS variables")
            return {}

        norm = lambda s: ''.join(ch.lower() for ch in s if ch.isalnum())
        available_map = {norm(f): f for f in available_fonts}
        # Also keep a set of lowercase full names for quick lookup
        available_lower = {f.lower(): f for f in available_fonts}

        def find_match(font_name: str) -> Optional[str]:
            # First try exact match (case-insensitive)
            if font_name.lower() in available_lower:
                return available_lower[font_name.lower()]

            # Then try normalized match (remove spaces, special chars)
            key = norm(font_name)
            if key in available_map:
                return available_map[key]

            # Only do fuzzy match with HIGH cutoff (0.85) to avoid false matches
            # e.g., "Alerio Sans Serif" should NOT match "Merriweather Sans"
            matches = difflib.get_close_matches(key, available_map.keys(), n=1, cutoff=0.85)
            if matches:
                matched_font = available_map[matches[0]]
                logger.info(f"[FONT MATCH] Fuzzy matched '{font_name}' → '{matched_font}'")
                return matched_font

            # Font not available - log and return None
            logger.warning(f"[FONT MATCH] Brand font '{font_name}' not available in registry, skipping")
            return None
        
        result = {}
        matched_fonts = []
        
        for font in scraped_fonts[:3]:  # Check first 3
            match = find_match(font)
            if match and match not in matched_fonts:
                matched_fonts.append(match)
        
        if matched_fonts:
            result['hero'] = matched_fonts[0]
            if len(matched_fonts) > 1:
                result['body'] = matched_fonts[1]
            else:
                # CRITICAL: Hero and body MUST be different fonts!
                # Mark for AI selection - will be handled in _select_fonts
                result['body'] = '__AI_SELECT__'
                result['needs_ai_body'] = True
            result['source'] = 'brand_scraped'

        return result

    async def _ai_select_complementary_body_font(self, hero_font: str, title: str, vibe: str, available_fonts: List[str]) -> str:
        """Use AI to intelligently select a complementary body font from 700+ available fonts."""
        try:
            from services.registry_fonts import RegistryFonts
            # Get categorized fonts for better AI context
            font_categories = RegistryFonts.get_available_fonts()

            # Build font list string for AI
            font_list_parts = []
            for category, fonts_in_cat in font_categories.items():
                if fonts_in_cat:
                    font_list_parts.append(f"**{category}**: {', '.join(fonts_in_cat[:30])}")
            available_fonts_str = "\n".join(font_list_parts)

            prompt = f"""The hero/header font is already set to: "{hero_font}"

Select a DIFFERENT complementary body font for a {vibe} presentation titled "{title}".

CRITICAL RULES:
1. Body font MUST be DIFFERENT from "{hero_font}"
2. Body font should complement the hero font stylistically
3. Body font should be highly readable for body text
4. Consider the vibe: {vibe}

Available fonts by category:
{available_fonts_str}

Return ONLY the exact font name, nothing else. Pick from Sans Serif or Designer categories for best readability."""

            from agents.config import FONT_SELECTION_MODEL
            from agents.ai.clients import get_model_id
            import anthropic
            # Use async client directly - get_client returns sync client which breaks await
            client = anthropic.AsyncAnthropic()
            actual_model = get_model_id(FONT_SELECTION_MODEL)
            response = await client.messages.create(
                model=actual_model,
                max_tokens=50,
                temperature=0.3,
                messages=[{"role": "user", "content": prompt}]
            )

            body_font = response.content[0].text.strip().strip('"\'')

            # Validate the font exists
            all_fonts = RegistryFonts.get_all_fonts_list()
            if body_font in all_fonts and body_font.lower() != hero_font.lower():
                logger.info(f"[AI FONT] Selected body font '{body_font}' to complement '{hero_font}'")
                return body_font

            # Try fuzzy match
            for font in all_fonts:
                if body_font.lower() in font.lower() or font.lower() in body_font.lower():
                    if font.lower() != hero_font.lower():
                        logger.info(f"[AI FONT] Fuzzy matched body font '{font}' to complement '{hero_font}'")
                        return font

            # Fallback - pick a different readable font
            fallback = 'Open Sans' if hero_font != 'Open Sans' else 'Roboto'
            logger.warning(f"[AI FONT] Could not validate '{body_font}', using fallback '{fallback}'")
            return fallback

        except Exception as e:
            logger.error(f"[AI FONT] Error selecting body font: {e}")
            return 'Open Sans' if hero_font != 'Open Sans' else 'Roboto'

    def _select_contextual_fonts(
        self,
        analysis: Dict[str, Any],
        available_fonts: List[str],
        variety_seed: str
    ) -> Dict[str, str]:
        """Select fonts based on context with variety."""
        # Define font pairings by context
        pairings = {
            'business': [
                ('Montserrat', 'Roboto'),
                ('Raleway', 'Open Sans'),
                ('Poppins', 'Lato'),
                ('Inter', 'Source Sans Pro'),
                ('Playfair Display', 'Lato')
            ],
            'education': [
                ('Quicksand', 'Open Sans'),
                ('Nunito', 'Roboto'),
                ('Fredoka', 'Poppins'),
                ('Comic Neue', 'Lato'),
                ('Bubblegum Sans', 'Open Sans')
            ],
            'technology': [
                ('Orbitron', 'Roboto'),
                ('Space Mono', 'Open Sans'),
                ('Roboto Mono', 'Roboto'),
                ('JetBrains Mono', 'Inter'),
                ('Fira Code', 'Fira Sans')
            ],
            'team': [
                ('Comfortaa', 'Poppins'),
                ('Pacifico', 'Open Sans'),
                ('Kalam', 'Roboto'),
                ('Architects Daughter', 'Lato'),
                ('Caveat', 'Open Sans')
            ],
            'creative': [
                ('Bebas Neue', 'Roboto'),
                ('Oswald', 'Lato'),
                ('Anton', 'Open Sans'),
                ('Righteous', 'Poppins'),
                ('Bungee', 'Roboto')
            ]
        }
        
        # Get context pairings or default
        topic = analysis.get('topic', 'business')
        context_pairings = pairings.get(topic, pairings['business'])
        
        # Use variety seed to pick different pairing
        seed_hash = hash(variety_seed) % len(context_pairings)
        hero, body = context_pairings[seed_hash]
        
        # Check availability and fallback
        if hero not in available_fonts:
            hero = 'Montserrat'
        if body not in available_fonts:
            body = 'Roboto'
        
        return {
            'hero': hero,
            'body': body,
            'source': f'{topic}_contextual'
        }
    
    def _infer_backgrounds(self, colors: List[str]) -> List[str]:
        """Infer background colors from palette."""
        if not colors:
            return []
        
        # Sort by brightness, prefer non-white
        sorted_colors = sorted(colors, key=self._estimate_brightness, reverse=True)
        non_white = [c for c in sorted_colors if not self._is_near_white(c)]
        
        backgrounds = []
        
        # Pick lightest non-white
        if non_white:
            backgrounds.append(non_white[0])
            # Pick a darker variant
            if len(non_white) > 1:
                backgrounds.append(non_white[1])
        
        return backgrounds[:2]
    
    def _infer_accents(self, colors: List[str]) -> List[str]:
        """Infer accent colors from palette."""
        if not colors:
            return []
        
        # Sort by saturation/colorfulness
        sorted_colors = sorted(colors, key=self._calculate_saturation, reverse=True)
        
        # Filter out near-white/black
        vibrant = [
            c for c in sorted_colors 
            if not self._is_near_white(c) and not self._is_near_black(c)
        ]
        
        return vibrant[:2]
    
    def _darken_color_subtly(self, hex_color: str) -> str:
        """Create a barely noticeable darker version of the same color (5% darker)."""
        try:
            hex_color = hex_color.replace('#', '')
            if len(hex_color) != 6:
                return hex_color
            
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            # Darken by only 5% (barely noticeable)
            factor = 0.95  # 5% darker
            r_dark = max(0, int(r * factor))
            g_dark = max(0, int(g * factor))  
            b_dark = max(0, int(b * factor))
            
            return f"#{r_dark:02x}{g_dark:02x}{b_dark:02x}"
        except Exception:
            return hex_color
    
    def _create_gradients(self, bg1: str, bg2: str, a1: str, a2: str) -> List[Dict[str, Any]]:
        """Create gradient definitions using theme colors only."""
        gradients = []
        
        # Normalize None to strings
        bg1 = str(bg1 or '#FFFFFF')
        bg2 = str(bg2 or '')
        a1 = str(a1 or '#FF4301')
        a2 = str(a2 or a1)
        
        # For backgrounds, use only theme colors, never introduce foreign colors
        if bg2 and str(bg2).lower() != str(bg1).lower():
            # We have two different background colors from theme - use them
            gradients.append({
                "name": "background_gradient", 
                "type": "radial",
                "position": "top-right",
                "colors": [bg1, bg2]  # Use actual theme backgrounds
            })
        else:
            # Only one background - create subtle same-color variation
            bg1_subtle = self._darken_color_subtly(bg1)
            gradients.append({
                "name": "background_gradient",
                "type": "radial",
                "position": "top-right", 
                "colors": [bg1, bg1_subtle]  # Barely darker corner fade
            })
        
        # Accent gradient using theme accent colors only
        if a2 and str(a2).lower() != str(a1).lower():
            gradients.append({
                "name": "accent_gradient",
                "type": "linear",
                "angle": 45,
                "colors": [a1, a2]  # Use actual theme accents
            })
        else:
            # Single accent - create variation within theme
            a1_variant = self._lighten_color(a1, 0.15)
            gradients.append({
                "name": "accent_gradient", 
                "type": "linear",
                "angle": 45,
                "colors": [a1, a1_variant]  # Lighter variation of same accent
            })
        
        # Subtle background option using theme colors
        if bg2:
            gradients.append({
                "name": "subtle_gradient",
                "type": "linear",
                "angle": 135,
                "colors": [self._lighten_color(bg1, 0.05), self._lighten_color(bg2, 0.05)]
            })
        else:
            gradients.append({
                "name": "subtle_gradient",
                "type": "radial",
                "colors": [self._lighten_color(bg1, 0.1), bg1]
            })
            
        return gradients
    
    def _compute_text_colors(self, bg: str, a1: str, a2: str) -> Dict[str, str]:
        """Compute text colors for backgrounds."""
        bg_n = str(bg or '#FFFFFF')
        a1_n = str(a1 or '#FF4301')
        a2_n = str(a2 or a1_n)
        return {
            'primary': '#FFFFFF' if self._estimate_brightness(bg_n) < 0.5 else '#1A1A1A',
            'on_accent_1': '#FFFFFF' if self._estimate_brightness(a1_n) < 0.5 else '#1A1A1A',
            'on_accent_2': '#FFFFFF' if self._estimate_brightness(a2_n) < 0.5 else '#1A1A1A'
        }
    
    def _style_prefs_to_dict(self, style_prefs: Any) -> Optional[Dict[str, Any]]:
        """Convert style preferences to dict."""
        if not style_prefs:
            return None

        try:
            # Handle Pydantic models (v2 uses model_dump, v1 uses dict)
            if hasattr(style_prefs, 'model_dump'):
                result = style_prefs.model_dump()
                logger.info(f"[THEME DIRECTOR] Converted stylePreferences via model_dump: vibeContext={result.get('vibeContext')}")
                return result
            elif hasattr(style_prefs, 'dict'):
                result = style_prefs.dict()
                logger.info(f"[THEME DIRECTOR] Converted stylePreferences via dict(): vibeContext={result.get('vibeContext')}")
                return result
            elif isinstance(style_prefs, dict):
                return style_prefs
            elif hasattr(style_prefs, '__dict__'):
                return style_prefs.__dict__
        except Exception as e:
            logger.warning(f"[THEME DIRECTOR] Failed to convert stylePreferences: {e}")

        return None
    
    def _sanitize_for_event(self, data: Any) -> Any:
        """Sanitize data for event emission."""
        if isinstance(data, dict):
            sanitized = {}
            for k, v in data.items():
                if k.lower() in ['embedding', 'embeddings']:
                    sanitized[k] = "[redacted]"
                elif isinstance(v, list) and len(v) > 50:
                    sanitized[k] = v[:10] + ["...truncated..."]
                elif isinstance(v, str) and len(v) > 1000:
                    sanitized[k] = v[:200] + "...truncated..."
                elif isinstance(v, dict):
                    sanitized[k] = self._sanitize_for_event(v)
                else:
                    sanitized[k] = v
            return sanitized
        return data
    
    # Color utility methods - thin wrappers around shared utils/color_utils.py
    def _estimate_brightness(self, hex_color: str) -> float:
        return estimate_brightness(hex_color)

    def _calculate_saturation(self, hex_color: str) -> float:
        return get_colorfulness(hex_color)

    def _is_near_white(self, color: str) -> bool:
        return is_near_white(color)

    def _is_near_black(self, color: str) -> bool:
        return is_near_black(color)

    def _darken_color(self, hex_color: str, factor: float) -> str:
        return adjust_brightness(hex_color, -factor)

    def _lighten_color(self, hex_color: str, factor: float) -> str:
        return adjust_brightness(hex_color, factor)

    def _shift_hue(self, hex_color: str, degrees: float) -> str:
        """Shift hue of a color by degrees."""
        try:
            r, g, b = hex_to_rgb(hex_color)
            r, g, b = r / 255.0, g / 255.0, b / 255.0
            hsv = colorsys.rgb_to_hsv(r, g, b)
            new_hue = (hsv[0] + degrees / 360.0) % 1.0
            rgb = colorsys.hsv_to_rgb(new_hue, hsv[1], hsv[2])
            return rgb_to_hex(int(rgb[0] * 255), int(rgb[1] * 255), int(rgb[2] * 255))
        except Exception:
            return adjust_brightness(hex_color, 0.2)

    # Event emission helpers
    async def _emit_agent(self, agent: str, phase: str, summary: str) -> None:
        try:
            await self.event_bus.emit(AGENT_EVENT, {
                'agent': agent,
                'phase': phase,
                'summary': summary
            })
        except Exception:
            logger.debug("Agent event emit failed")

    async def _emit_tool_call(self, name: str, args: Dict[str, Any]) -> None:
        try:
            await self.event_bus.emit(TOOL_CALL_EVENT, {
                'name': name,
                'args': args
            })
        except Exception:
            logger.debug("Tool call event emit failed")

    async def _emit_tool_result(self, name: str, result_keys: List[str]) -> None:
        try:
            await self.event_bus.emit(TOOL_RESULT_EVENT, {
                'name': name,
                'result_keys': result_keys
            })
        except Exception:
            logger.debug("Tool result event emit failed")

    async def _emit_artifact(self, kind: str, content: Dict[str, Any]) -> None:
        try:
            await self.event_bus.emit(ARTIFACT_EVENT, {
                'kind': kind,
                'content': content
            })
        except Exception:
            logger.debug("Artifact event emit failed")
    
    async def _emit_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Emit custom events like palette_candidates, fonts_selected, etc."""
        try:
            await self.event_bus.emit(event_type, data)
        except Exception:
            logger.debug(f"Event {event_type} emit failed")
    
    async def _get_entity_colors_from_ai(self, entity_name: str) -> Optional[List[str]]:
        """Query the AI model for iconic colors of entities like Pikachu, Mario, etc."""
        try:
            prompt = f"""You are an expert on visual design and iconic characters/subjects. Please provide the most iconic and recognizable colors for {entity_name}.

Return ONLY the hex color codes in a comma-separated list, nothing else. Focus on the most distinctive colors that people associate with this subject.

Examples:
- Pikachu: #FFDE00, #FF6B35, #FFFFFF, #000000
- Mario: #FF0000, #0000FF, #FFFF00, #8B4513
- Unknown subject: UNKNOWN

{entity_name}:"""
            
            # Use fast model for color queries
            from agents.config import THEME_MODEL
            client, actual_model = get_client(THEME_MODEL)
            response = invoke(
                client=client,
                model=actual_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=100,
                temperature=0.1
            )
            
            response_text = response.strip()
            
            if response_text == "UNKNOWN" or "unknown" in response_text.lower():
                logger.info(f"AI model doesn't know iconic colors for {entity_name}")
                return None
            
            # Extract hex colors from response
            hex_pattern = r'#[0-9A-Fa-f]{6}\b'
            colors = re.findall(hex_pattern, response_text)
            
            if colors:
                # Remove duplicates and normalize
                unique_colors = []
                seen = set()
                for color in colors:
                    color_upper = color.upper()
                    if color_upper not in seen:
                        seen.add(color_upper)
                        unique_colors.append(color_upper)
                
                logger.info(f"AI model provided iconic colors for {entity_name}: {unique_colors}")
                return unique_colors
            
            return None
            
        except Exception as e:
            logger.error(f"Error querying AI model for entity colors: {e}")
            return None
    
    async def _get_ai_font_recommendation(self, context: str) -> Optional[Dict[str, str]]:
        """Get AI-driven font recommendation based on context."""
        try:
            prompt = f"""Based on this presentation context: "{context.strip()}"

Recommend 2 fonts from this list that would work well together:
Montserrat, Roboto, Raleway, Open Sans, Poppins, Lato, Inter, Source Sans Pro, Quicksand, Nunito, Comfortaa, Bebas Neue, Oswald

Respond with just: "HERO_FONT, BODY_FONT"

Context: {context}
Fonts:"""
            
            from agents.config import FONT_SELECTION_MODEL
            client, actual_model = get_client(FONT_SELECTION_MODEL)
            response = invoke(
                client=client,
                model=actual_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=50,
                temperature=0.3
            )
            
            response_text = response.strip()
            if ',' in response_text:
                parts = [p.strip() for p in response_text.split(',')]
                if len(parts) >= 2:
                    return {
                        'hero': parts[0],
                        'body': parts[1],
                        'source': 'ai_recommended'
                    }
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting AI font recommendation: {e}")
            return None
