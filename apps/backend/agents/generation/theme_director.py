"""
Agent-based ThemeDirector that orchestrates deck-wide theme and per-slide themes
via tool-calling. Streams structured agent events to the EventBus.
"""

from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
import re
import asyncio
import uuid
import random
from setup_logging_optimized import get_logger
import difflib

from agents.application import get_event_bus, AGENT_EVENT, TOOL_CALL_EVENT, TOOL_RESULT_EVENT, ARTIFACT_EVENT
from agents.domain.models import ThemeDocument
from agents.ai.clients import get_client, invoke
from agents.config import COMPOSER_MODEL

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
        
        # Step 3: Select fonts based on brand/topic (simplified)
        font_result = await self._select_fonts_fast(analysis, color_result, title, opts.variety_seed)
        
        # Step 4: Generate final theme
        deck_theme = await self._compose_theme(color_result, font_result, analysis)
        
        # Step 5: Upload any scraped assets (logos)
        if color_result.get('metadata', {}).get('logo_url'):
            await self._upload_brand_assets(color_result, deck_outline)
        
        # Per-slide theming with AI-driven structural guidance
        slide_themes: Dict[str, Dict[str, Any]] = {}
        if opts.per_slide_theming:
            # Use AI to determine deck formality and generate per-slide structural instructions
            await self._emit_tool_call(
                "AI.analyze_deck_formality",
                {"deck_title": getattr(deck_outline, 'title', ''), "slides_count": len(getattr(deck_outline, 'slides', []))}
            )
            
            formality_analysis = await self._determine_deck_formality_with_ai(deck_outline, analysis)
            
            await self._emit_tool_result(
                "AI.analyze_deck_formality", 
                [f"Formality: {formality_analysis['formality_level']} (confidence: {formality_analysis['confidence']:.1%})", 
                 f"Audience: {formality_analysis['intended_audience']}", 
                 f"Context: {formality_analysis['presentation_context']}"]
            )
            
            # Log AI reasoning
            logger.info(f"AI formality analysis: {formality_analysis['formality_level']} - {formality_analysis['reasoning']}")
            
            for i, slide in enumerate(getattr(deck_outline, 'slides', []) or []):
                slide_id = getattr(slide, 'id', None) or getattr(slide, 'uuid', None) or str(i)
                slide_title = getattr(slide, 'title', '')
                slide_content = getattr(slide, 'content', '')
                slide_type = getattr(slide, 'slide_type', 'content')  # Get the actual slide type
                
                # Find matching AI instruction for this slide
                ai_instruction = None
                for instr in formality_analysis.get('slide_instructions', []):
                    if instr['slide_index'] == i + 1:
                        ai_instruction = instr
                        break
                
                # Use AI instruction if available, otherwise fallback to basic structure
                if ai_instruction:
                    slide_structure = {
                        "slide_type": slide_type,  # Use the actual slide type
                        "elements_to_include": [],
                        "positioning": {},
                        "styling": {
                            "colors": {
                                "title_color": deck_theme.get('title_color', '#1A1A1A'),
                                "subtitle_color": deck_theme.get('subtitle_color', '#4A5568'),
                                "number_color": deck_theme.get('accent_colors', ['#6B7280'])[0] if deck_theme.get('accent_colors') else '#6B7280'
                            }
                        },
                        "ai_reasoning": ai_instruction.get('reasoning', '')
                    }
                    
                    # Add elements based on AI decision
                    slide_structure["elements_to_include"] = ["title"]
                    
                    if ai_instruction['show_slide_number']:
                        slide_structure["elements_to_include"].append("slide_number")
                        slide_structure["positioning"]["slide_number"] = {
                            "position": ai_instruction['slide_number_position'],
                            "text": f"{i+1:02d}",
                            "style": ai_instruction['slide_number_style']
                        }
                    
                    # Note: Logo positioning is now handled by AI model through prompts, not forced positioning
                    
                    if ai_instruction['show_subtitle']:
                        slide_structure["elements_to_include"].append("subtitle")
                        slide_structure["positioning"]["subtitle"] = {
                            "gap_below_title": 30,
                            "style": {"fontSize": 20, "opacity": 0.8}
                        }
                    
                    # Use smart line styler for contextual divider lines
                    if ai_instruction['show_divider_line']:
                        from agents.generation.components.smart_line_styler import SmartLineStyler
                        line_styler = SmartLineStyler()
                        
                        # Get contextual line style
                        line_style = line_styler.get_line_style(
                            formality_level=formality_analysis['formality_level'],
                            slide_type=slide_type,
                            theme_colors=deck_theme.get('color_palette', {}),
                            variety_seed=opts.variety_seed
                        )
                        
                        if line_style:  # Only add line if style is returned (not None for excluded types)
                            slide_structure["elements_to_include"].append("divider_line")
                            
                            # Calculate position based on content area
                            content_y = ai_instruction['content_area_start_y']
                            divider_y = content_y - 30  # Position above content area
                            
                            # Calculate line positioning based on span and alignment
                            line_width = int(1760 * line_style.get('span_fraction', 0.8))
                            align = line_style.get('align', 'center')
                            
                            if align == 'left':
                                start_x = 80
                                end_x = 80 + line_width
                            elif align == 'right':
                                start_x = 1840 - line_width
                                end_x = 1840
                            else:  # center or stretch
                                if line_style.get('span_fraction', 0.8) >= 1.0:
                                    start_x = 80
                                    end_x = 1840
                                else:
                                    start_x = 80 + (1760 - line_width) // 2
                                    end_x = start_x + line_width
                            
                            slide_structure["positioning"]["divider_line"] = {
                                "below_title": True,
                                "stroke_width": line_style.get('stroke_width', 2),
                                "opacity": line_style.get('opacity', 0.3),
                                "span_fraction": line_style.get('span_fraction', 0.8),
                                "align": align,
                                "startPoint": {"x": start_x, "y": divider_y},
                                "endPoint": {"x": end_x, "y": divider_y},
                                "style": {
                                    "strokeWidth": line_style.get('stroke_width', 2),
                                    "opacity": line_style.get('opacity', 0.3)
                                },
                                # Pass theme colors for color resolution
                                "theme_colors": line_style.get('theme_colors', {}),
                                "color_priority": line_style.get('color_priority', ['accent_1'])
                            }
                    
                    # Content area positioning
                    slide_structure["positioning"]["content_area"] = {
                        "x": 80,
                        "y": ai_instruction['content_area_start_y'],
                        "width": 1760,
                        "height": 1080 - ai_instruction['content_area_start_y'] - 120,
                        "spacing": ai_instruction['spacing_mode']
                    }
                else:
                    # Fallback structure for slides without AI instruction
                    slide_structure = {
                        "slide_type": slide_type,  # Use the actual slide type
                        "elements_to_include": ["title"],
                        "positioning": {
                            "content_area": {
                                "x": 80, "y": 220, "width": 1760, "height": 640,
                                "spacing": "relaxed"
                            }
                        },
                        "styling": {
                            "colors": {
                                "title_color": deck_theme.get('title_color', '#1A1A1A'),
                                "subtitle_color": deck_theme.get('subtitle_color', '#4A5568')
                            }
                        },
                        "ai_reasoning": "Fallback structure - no AI instruction available"
                    }
                
                slide_themes[slide_id] = {
                    "structure": slide_structure,
                    "instructions": [
                        "Apply deck palette with high contrast",
                        "Scale typography based on content density",
                        "Follow structural guidance provided"
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
            'is_entity': False,
            'entity_name': None,
            'topic': None,
            'style_keywords': [],
            'explicit_colors': [],
            'wants_gradients': self._check_wants_gradients(full_text)
        }
        
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
        
        # AI-powered brand detection (same as outline generation)
        try:
            from anthropic import Anthropic
            import os
            
            client = Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
            brand_prompt = f"Extract the main company/brand name from this text: '{title} {prompt}'. Return only the company name or NONE if no clear brand is mentioned."
            
            response = client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=50,
                system="You are a brand detection expert. Return only the company name or NONE.",
                messages=[{"role": "user", "content": brand_prompt}]
            )
            
            detected_brand = response.content[0].text.strip()
            if detected_brand and detected_brand.upper() != 'NONE':
                analysis['is_brand'] = True
                analysis['brand_name'] = detected_brand
                logger.info(f"[THEME] AI detected brand: {detected_brand}")
        except Exception as e:
            logger.warning(f"[THEME] Brand detection failed: {e}")
            
        # Simple brand detection fallback for known brands
        known_brands = ['first round capital', 'spotify', 'netflix', 'google', 'apple', 'microsoft']
        if not analysis['is_brand']:
            for brand in known_brands:
                if brand in full_text:
                    analysis['is_brand'] = True
                    analysis['brand_name'] = brand.title()
                    break
        
        # Topic will be determined by palettesdb search or model if needed
        
        # Extract style keywords
        style_words = ['modern', 'minimal', 'bold', 'playful', 'professional', 'elegant', 'fun', 'creative']
        analysis['style_keywords'] = [w for w in style_words if w in full_text]
        
        # Check for explicit colors
        if style_dict and style_dict.get('colors'):
            colors = style_dict['colors']
            if isinstance(colors, list):
                analysis['explicit_colors'] = [c for c in colors if isinstance(c, str) and c.startswith('#')]
        
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
            
            brand_detection_prompt = f"""Extract the main company/brand name from this text if present:

Text: "{full_text[:200]}"

Look for:
- Company names (e.g. "Nike", "Spotify", "First Round Capital")
- Investment firms (e.g. "Andreessen Horowitz", "Sequoia Capital")
- Well-known brands mentioned for theming

Respond with ONLY the brand name or "none":
Examples: "Nike", "First Round Capital", "Google", "none"

Brand name:"""

            detected_brand = None
            try:
                client = get_client("claude-3-7-sonnet-20250219")
                brand_response = invoke(
                    client=client,
                    model="claude-3-7-sonnet-20250219",
                    messages=[{"role": "user", "content": brand_detection_prompt}],
                    max_tokens=10,
                    temperature=0
                )
                
                ai_detected_brand = brand_response.strip().lower()
                if ai_detected_brand != "none" and len(ai_detected_brand) > 2:
                    # Brand detected - continue with intelligent analysis
                    logger.info(f"Quick AI detected brand: {ai_detected_brand}")
                    detected_brand = ai_detected_brand
                else:
                    # No brand detected - skip heavy brand processing
                    logger.info("Quick AI brand detection: no brand found")
            
            except Exception as e:
                logger.warning(f"Quick brand detection failed: {e}")
                logger.info("AI brand detection failed, proceeding with general theme: brand_detection_failed")
            
            # If AI failed to detect brand, try simple keyword matching for known brands
            if not detected_brand:
                text_lower = full_text.lower()
                known_brands = {
                    'first round capital': 'first round capital',
                    'firstround': 'first round capital', 
                    'first round': 'first round capital',
                    'spotify': 'spotify',
                    'netflix': 'netflix',
                    'airbnb': 'airbnb',
                    'google': 'google',
                    'apple': 'apple',
                    'microsoft': 'microsoft'
                }
                
                for keyword, brand_name in known_brands.items():
                    if keyword in text_lower:
                        detected_brand = brand_name
                        logger.info(f"Keyword matching detected brand: {detected_brand}")
                        break
            
            # If still no brand detected, skip brand processing
            if not detected_brand:
                logger.info("No brand detected, using general theme")
                raise RuntimeError("no_brand_detected")
            # Fast brand color extraction with single AI call
            # Skip AI color guessing - go straight to brandfetch DB lookup
            logger.info(f"Brand detected: {detected_brand}, checking brandfetch DB...")
            
            try:
                # Try brandfetch for this detected brand (check cache first)
                from services.simple_brandfetch_cache import SimpleBrandfetchCache
                import os
                db_url = os.getenv('DATABASE_URL', 'postgresql://postgres.iureiriffqcxrldisuqp:202War123!!@aws-0-us-west-1.pooler.supabase.com:6543/postgres')
                async with SimpleBrandfetchCache(db_url) as bf_service:
                    # Try different domain variations (prioritize shorter/simpler domains first)
                    # Clean brand name: remove apostrophes, symbols, and other non-alphanumeric chars
                    def clean_for_domain(name: str) -> str:
                        # Remove all non-alphanumeric characters except spaces
                        import re
                        cleaned = re.sub(r"[^a-zA-Z0-9\s]", "", name)
                        # Replace spaces and make lowercase
                        return cleaned.lower().replace(' ', '')
                    
                    cleaned_brand = clean_for_domain(detected_brand)
                    domain_variants = [
                        f"{cleaned_brand.replace('capital', '')}.com",  # mcdonalds.com (remove apostrophe)
                        f"{''.join(detected_brand.lower().split()[:2])}.com".replace("'", ""),  # First two words, no apostrophes
                        f"{cleaned_brand}.com"  # Full cleaned brand name
                    ]
                    
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
                    
                    # Not found in brandfetch DB
                    logger.info(f"Brand {detected_brand} not found in brandfetch DB, falling back to general palette")
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
        
        return analysis
    
    async def _determine_deck_formality_with_ai(self, deck_outline: Any, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Use AI model to determine deck formality and generate per-slide structural instructions."""
        
        from pydantic import BaseModel, Field
        from typing import List, Dict, Any
        
        # Collect deck content
        title = getattr(deck_outline, 'title', '')
        prompt = getattr(deck_outline, 'prompt', '')
        
        slides_info = []
        if hasattr(deck_outline, 'slides'):
            for i, slide in enumerate(deck_outline.slides):
                slide_title = getattr(slide, 'title', '')
                slide_content = getattr(slide, 'content', '')
                slides_info.append({
                    'index': i + 1,
                    'title': slide_title,
                    'content': slide_content[:200] + '...' if len(slide_content) > 200 else slide_content
                })
        
        class SlideStructureInstruction(BaseModel):
            slide_index: int = Field(..., description="Slide number (1-based)")
            show_slide_number: bool = Field(..., description="Whether to show slide number")
            slide_number_position: Dict[str, int] = Field(default={'x': 80, 'y': 1020}, description="Position for slide number")
            slide_number_style: Dict[str, Any] = Field(default={'fontSize': 20, 'opacity': 0.6}, description="Style for slide number")
            show_subtitle: bool = Field(..., description="Whether this slide should have a subtitle")
            show_divider_line: bool = Field(..., description="Whether to show divider line below title")
            content_area_start_y: int = Field(default=220, description="Y position where main content should start")
            spacing_mode: str = Field(default='relaxed', description="'formal' or 'relaxed' spacing")
            reasoning: str = Field(..., description="Brief explanation for structural choices")
        
        class DeckFormalityAnalysis(BaseModel):
            formality_level: str = Field(..., description="One of: 'formal', 'business', 'creative', 'casual'")
            confidence: float = Field(..., description="Confidence score 0-1")
            reasoning: str = Field(..., description="Detailed reasoning for formality classification")
            intended_audience: str = Field(..., description="Who is this presentation for?")
            presentation_context: str = Field(..., description="When/where would this be presented?")
            slide_instructions: List[SlideStructureInstruction] = Field(..., description="Per-slide structural guidance")
        
        # Create system prompt
        system_prompt = '''You are an expert presentation designer who analyzes deck content to determine the appropriate formality level and structural requirements.

Formality Levels:
- FORMAL: Board meetings, investor presentations, quarterly reports, compliance, audit reports
  * Structure: Slide numbers (24pt, bottom-left), logos (120×40px to right of numbers), subtitles, divider lines
  * Positioning: Numbers at (80,1000), logos at (140,990), content starts at y:240
  
- BUSINESS: Strategy presentations, proposals, market analysis, performance reviews  
  * Structure: Slide numbers (20pt, bottom-left), logos when available (100×30px), subtitles
  * Positioning: Numbers at (80,1020), logos at (120,1010), content starts at y:220
  
- CREATIVE: Brand campaigns, artistic presentations, vision statements, marketing creative
  * Structure: Minimal - no forced slide numbers or logos, creative freedom
  * Positioning: Flexible, content starts at y:320
  
- CASUAL: Tutorials, how-to guides, personal presentations, educational basics
  * Structure: Clean and minimal, no structural elements
  * Positioning: Simple, content starts at y:200

Analyze the deck content and context to determine appropriate formality. Consider:
- Who is the audience? (executives, team members, students, general public)
- What is the purpose? (reporting, presenting, teaching, inspiring)
- What is the tone? (professional, creative, casual, educational)
- When/where would this be presented? (boardroom, conference, workshop, online)

For each slide, determine if it needs:
- Slide numbers (formal/business only)
- Logo placement (when appropriate for context) 
- Subtitles (for complex slides in structured presentations)
- Divider lines (formal presentations only, never on stat or quote slides)
- Appropriate content spacing

Base decisions on content meaning and intent, not just keywords.'''
        
        # Create user prompt
        user_prompt = f'''Analyze this presentation and determine the appropriate formality level and per-slide structural requirements:

**Deck Title:** {title}

**User Request/Context:** {prompt}

**Slides ({len(slides_info)} total):**
'''
        
        for slide_info in slides_info:
            user_prompt += f'''\nSlide {slide_info['index']}: {slide_info['title']}
{slide_info['content']}
'''
        
        user_prompt += '''

Provide:
1. Overall formality assessment with reasoning
2. Intended audience and presentation context
3. Per-slide structural instructions matching the formality level

Ensure structural elements match the deck's maturity and intended use.'''
        
        # Get AI client and invoke
        client, model_name = get_client(COMPOSER_MODEL)
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        try:
            response = invoke(
                client=client,
                model=model_name,
                messages=messages,
                response_model=DeckFormalityAnalysis,
                max_tokens=4000,
                temperature=0.3  # Low temperature for consistent structural decisions
            )
            
            return {
                'formality_level': response.formality_level,
                'confidence': response.confidence,
                'reasoning': response.reasoning,
                'intended_audience': response.intended_audience,
                'presentation_context': response.presentation_context,
                'slide_instructions': [
                    {
                        'slide_index': instr.slide_index,
                        'show_slide_number': instr.show_slide_number,
                        'slide_number_position': instr.slide_number_position,
                        'slide_number_style': instr.slide_number_style,
                        'show_subtitle': instr.show_subtitle,
                        'show_divider_line': instr.show_divider_line,
                        'content_area_start_y': instr.content_area_start_y,
                        'spacing_mode': instr.spacing_mode,
                        'reasoning': instr.reasoning
                    } for instr in response.slide_instructions
                ]
            }
        except Exception as e:
            logger.error(f"AI formality detection failed: {e}")
            # Fallback to business formality with basic structure
            return {
                'formality_level': 'business',
                'confidence': 0.5,
                'reasoning': 'Fallback due to AI detection error',
                'intended_audience': 'Business audience',
                'presentation_context': 'Professional setting',
                'slide_instructions': []
            }
    
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
        try:
            # Remove # if present
            hex_color = hex_color.lstrip('#')
            
            # Convert to RGB
            r = int(hex_color[0:2], 16) / 255.0
            g = int(hex_color[2:4], 16) / 255.0  
            b = int(hex_color[4:6], 16) / 255.0
            
            # Apply gamma correction
            def linearize(c):
                return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
            
            r_lin = linearize(r)
            g_lin = linearize(g)
            b_lin = linearize(b)
            
            # Calculate luminance using ITU-R BT.709 coefficients
            return 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin
            
        except (ValueError, IndexError):
            # Return middle luminance for invalid colors
            return 0.5
    
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
        
        # 1. Custom hex colors (highest priority)
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
                return {
                    'colors': entity_colors[:8],
                    'source': 'ai_iconic_colors',
                    'palette_name': f"{analysis['entity_name']} Colors",
                    'backgrounds': self._infer_backgrounds(entity_colors)[:2],
                    'accents': self._infer_accents(entity_colors)[:2],
                    'metadata': {'entity': analysis['entity_name']}
                }
        
        # 3. PRIORITY: Check vibeContext for brand domains (like mcdonalds.com)
        brand_domain = None
        if style_dict and style_dict.get('vibeContext'):
            vibe_context = style_dict.get('vibeContext', '').strip()
            # Check if vibeContext looks like a domain
            if '.' in vibe_context and not vibe_context.startswith('#') and ' ' not in vibe_context:
                brand_domain = vibe_context
                logger.info(f"[THEME DIRECTOR] Found brand domain in vibeContext: {brand_domain}")
        
        # Also check if analysis detected a brand - use BrandColorSearcher for proper cache-first lookup
        if not brand_domain and analysis.get('is_brand') and analysis.get('brand_name'):
            brand_name = analysis['brand_name']
            logger.info(f"[THEME] AI detected brand: {brand_name}, using BrandColorSearcher")
            
            try:
                from agents.tools.theme.brand_color_tools import BrandColorSearcher
                brand_searcher = BrandColorSearcher()
                brand_colors_result = await brand_searcher.search_brand_colors(brand_name)
                
                if brand_colors_result and brand_colors_result.get('source') == 'brandfetch_cache':
                    # Found in cache! Use this data directly
                    colors = brand_colors_result.get('colors', [])
                    fonts = brand_colors_result.get('fonts', [])
                    confidence = brand_colors_result.get('confidence', 0)
                    
                    logger.info(f"✅ BRANDFETCH CACHE HIT via BrandColorSearcher for {brand_name}: {colors}")
                    
                    await self._emit_tool_result("BrandColorSearcher", 
                        [f"✅ CACHE HIT: {len(colors)} colors, {len(fonts)} fonts",
                         f"Colors: {colors[:3]}...",
                         f"Confidence: {confidence}"])
                    
                    return {
                        'colors': colors[:8],
                        'source': 'brandfetch_cache_via_searcher',
                        'palette_name': f"{brand_name} Brand Colors",
                        'backgrounds': ['#FFFFFF'] + ([colors[2]] if len(colors) > 2 else []),
                        'accents': colors[:2],
                        'metadata': {
                            'brand': brand_name,
                            'fonts': fonts,
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
                            
                            # Extract colors from hex_list format
                            brand_colors = colors_data.get('hex_list', []) if colors_data else []
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
                                
                                return {
                                    'colors': brand_colors[:8],
                                    'source': 'brandfetch_cache',
                                    'palette_name': f"{brand_info.get('company_name', brand_domain)} Brand Colors",
                                    'backgrounds': ['#FFFFFF'] + ([brand_colors[2]] if len(brand_colors) > 2 else []),
                                    'accents': brand_colors[:2],
                                    'metadata': {
                                        'brand': brand_info.get('company_name', brand_domain),
                                        'domain': brand_domain,
                                        'logo_url': logo_url,
                                        'fonts': brand_fonts,
                                        'source': 'brandfetch_cache'
                                    }
                                }
                            else:
                                await self._emit_tool_result("BrandCache.lookup", ["❌ No colors found in brand cache"])
                        else:
                            await self._emit_tool_result("BrandCache.lookup", ["❌ Brand not found in cache"])
            except Exception as e:
                logger.warning(f"Brandfetch cache lookup failed for {brand_domain}: {e}")
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
        
        # Use scraped brand fonts if available
        scraped_fonts = color_result.get('metadata', {}).get('fonts') or []
        if scraped_fonts:
            return {
                'hero': scraped_fonts[0],
                'body': scraped_fonts[1] if len(scraped_fonts) > 1 else 'Roboto',
                'source': 'brand_fonts'
            }
        
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
        variety_seed: str
    ) -> Dict[str, Any]:
        """Select fonts based on brand/topic/style."""
        from services.registry_fonts import RegistryFonts
        
        # Get available fonts
        try:
            from models.registry import ComponentRegistry
            registry = ComponentRegistry()
            available_fonts = RegistryFonts.get_available_fonts(registry)
        except Exception:
            available_fonts = RegistryFonts.get_all_fonts_list()
        
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
                "variety_seed": variety_seed[:8]
            }
        )
        
        font_result = {}
        
        if scraped_fonts:
            # Match scraped fonts to available
            matched = self._match_fonts(scraped_fonts, available_fonts)
            if matched:
                font_result = matched
        
        if not font_result:
            # Select based on context with variety
            font_result = self._select_contextual_fonts(
                analysis, 
                available_fonts,
                variety_seed
            )
        
        await self._emit_tool_result(
            "FontSelector.select_fonts",
            [f"Hero: {font_result.get('hero', 'default')}, Body: {font_result.get('body', 'default')}"]
        )
        
        # Emit fonts selected event
        await self._emit_event("fonts_selected", font_result)
        
        return font_result
    
    async def _compose_theme(
        self,
        color_result: Dict[str, Any],
        font_result: Dict[str, Any],
        analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Compose final theme from colors and fonts."""
        colors = color_result.get('colors', [])
        backgrounds = color_result.get('backgrounds', [])
        accents = color_result.get('accents', [])
        text_colors = color_result.get('text_colors', {})
        gradients = color_result.get('gradients', [])
        
        # Ensure we have valid backgrounds and accents
        if not backgrounds:
            backgrounds = self._infer_backgrounds(colors)
        if not accents:
            accents = self._infer_accents(colors)
        
        # Select primary/secondary from lists
        primary_bg = backgrounds[0] if backgrounds else '#0A0E27'
        secondary_bg = backgrounds[1] if len(backgrounds) > 1 else self._darken_color(primary_bg, 0.15)
        accent_1 = accents[0] if accents else '#2563EB'
        accent_2 = accents[1] if len(accents) > 1 else self._shift_hue(accent_1, 60)
        
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
            # For presentations, near-white backgrounds are GOOD! Only reject grey/pink
            if not _is_greyish(bg) and not _is_pinkish(bg):
                return bg
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
                return candidate
            except Exception:
                return fallback_from

        primary_bg = _sanitize_bg(primary_bg, primary_bg)
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
        
        theme = {
            'color_palette': {
                'primary_background': primary_bg,
                'secondary_background': secondary_bg,
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
            logo_url_top = (color_result.get('metadata') or {}).get('logo_url') or palette_meta.get('logo_url')
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
                # Also copy back aspect info to palette metadata for downstream consumers if missing
                try:
                    if aspect_in_meta and 'logo_aspect' not in palette_meta:
                        theme['color_palette']['metadata']['logo_aspect'] = aspect_in_meta
                except Exception:
                    pass
        except Exception:
            pass

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
        
        return theme
    
    async def _upload_brand_assets(
        self,
        color_result: Dict[str, Any],
        deck_outline: Any
    ) -> None:
        """Upload scraped brand assets (logos) to storage."""
        logo_url = color_result.get('metadata', {}).get('logo_url')
        if not logo_url:
            return
        
        await self._emit_tool_call(
            "ImageStorageService.upload_from_url",
            {"url": logo_url, "type": "brand_logo"}
        )
            
        try:
            # This would use actual image storage service
            stored_url = logo_url  # In reality, this would be CDN URL
            
            await self._emit_tool_result(
                "ImageStorageService.upload_from_url",
                [f"Uploaded logo to: {stored_url}"]
            )

            # Emit assets uploaded event
            await self._emit_event("assets_uploaded", {
                "logos": [{"url": stored_url, "type": "brand_logo"}]
            })

            # Store in deck data if possible
            if hasattr(deck_outline, 'data'):
                if not hasattr(deck_outline.data, 'assets'):
                    deck_outline.data.assets = {}
                deck_outline.data.assets['logos'] = [
                    {"url": stored_url, "type": "brand_logo"}
                ]
            
            # CRITICAL: Set logo in stylePreferences for slide generation
            if hasattr(deck_outline, 'stylePreferences') and deck_outline.stylePreferences:
                deck_outline.stylePreferences.logoUrl = stored_url
                logger.info(f"🖼️ Logo URL set in stylePreferences: {stored_url}")
            elif hasattr(deck_outline, 'stylePreferences'):
                # stylePreferences exists but is None, create it using the correct model
                from models.requests import StylePreferencesItem
                deck_outline.stylePreferences = StylePreferencesItem(logoUrl=stored_url)
                logger.info(f"🖼️ Created stylePreferences with logo URL: {stored_url}")
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
        """Match scraped fonts to available fonts."""
        if not scraped_fonts or not available_fonts:
            return {}
        
        norm = lambda s: ''.join(ch.lower() for ch in s if ch.isalnum())
        available_map = {norm(f): f for f in available_fonts}
        
        def find_match(font_name: str) -> Optional[str]:
            key = norm(font_name)
            if key in available_map:
                return available_map[key]
            
            # Fuzzy match
            matches = difflib.get_close_matches(key, available_map.keys(), n=1, cutoff=0.6)
            if matches:
                return available_map[matches[0]]
            
            return None
        
        result = {}
        matched_fonts = []
        
        for font in scraped_fonts[:3]:  # Check first 3
            match = find_match(font)
            if match and match not in matched_fonts:
                matched_fonts.append(match)
        
        if matched_fonts:
            result['hero'] = matched_fonts[0]
            result['body'] = matched_fonts[1] if len(matched_fonts) > 1 else 'Roboto'
            result['source'] = 'brand_scraped'
        
        return result
    
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
            if hasattr(style_prefs, '__dict__'):
                return style_prefs.__dict__
            elif isinstance(style_prefs, dict):
                return style_prefs
        except Exception:
            pass
        
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
    
    # Color utility methods
    def _estimate_brightness(self, hex_color: str) -> float:
        try:
            h = hex_color.lstrip('#')
            r = int(h[0:2], 16) / 255.0
            g = int(h[2:4], 16) / 255.0
            b = int(h[4:6], 16) / 255.0
            return 0.299 * r + 0.587 * g + 0.114 * b
        except Exception:
            return 0.5
    
    def _calculate_saturation(self, hex_color: str) -> float:
        try:
            h = hex_color.lstrip('#')
            r = int(h[0:2], 16) / 255.0
            g = int(h[2:4], 16) / 255.0
            b = int(h[4:6], 16) / 255.0
            mx, mn = max(r, g, b), min(r, g, b)
            return 0.0 if mx == 0 else (mx - mn) / mx
        except Exception:
            return 0.0

    def _is_near_white(self, color: str) -> bool:
        try:
            c = str(color).strip().lower()
            if c in ['#fff', '#ffffff', '#ffffffff']:
                return True
            return self._estimate_brightness(c) > 0.95
        except Exception:
            return False
    
    def _is_near_black(self, color: str) -> bool:
        try:
            return self._estimate_brightness(color) < 0.05
        except Exception:
            return False
    
    def _darken_color(self, hex_color: str, factor: float) -> str:
        try:
            h = hex_color.lstrip('#')
            r = int(h[0:2], 16)
            g = int(h[2:4], 16)
            b = int(h[4:6], 16)
            
            r = int(r * (1 - factor))
            g = int(g * (1 - factor))
            b = int(b * (1 - factor))
            
            return f"#{r:02X}{g:02X}{b:02X}"
        except Exception:
            return hex_color
    
    def _lighten_color(self, hex_color: str, factor: float) -> str:
        try:
            h = hex_color.lstrip('#')
            r = int(h[0:2], 16)
            g = int(h[2:4], 16)
            b = int(h[4:6], 16)
            
            r = int(r + (255 - r) * factor)
            g = int(g + (255 - g) * factor)
            b = int(b + (255 - b) * factor)
            
            return f"#{r:02X}{g:02X}{b:02X}"
        except Exception:
            return hex_color
    
    def _shift_hue(self, hex_color: str, degrees: float) -> str:
        """Shift hue of a color by degrees."""
        try:
            import colorsys
            h = hex_color.lstrip('#')
            r = int(h[0:2], 16) / 255.0
            g = int(h[2:4], 16) / 255.0
            b = int(h[4:6], 16) / 255.0
            
            # Convert to HSV
            hsv = colorsys.rgb_to_hsv(r, g, b)
            # Shift hue
            new_hue = (hsv[0] + degrees / 360.0) % 1.0
            # Convert back
            rgb = colorsys.hsv_to_rgb(new_hue, hsv[1], hsv[2])
            
            r = int(rgb[0] * 255)
            g = int(rgb[1] * 255)
            b = int(rgb[2] * 255)
            
            return f"#{r:02X}{g:02X}{b:02X}"
        except Exception:
            # Fallback: lighten instead
            return self._lighten_color(hex_color, 0.2)

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
            client, actual_model = get_client("claude-3-7-sonnet-20250219")
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
            
            client, actual_model = get_client("claude-3-7-sonnet-20250219")
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
