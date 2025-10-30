"""
Agent-based ThemeDirector that orchestrates deck-wide theme and per-slide themes
via tool-calling. Streams structured agent events to the EventBus.
"""

from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
import re
import asyncio
import uuid
from setup_logging_optimized import get_logger
import difflib

from agents.application import get_event_bus, AGENT_EVENT, TOOL_CALL_EVENT, TOOL_RESULT_EVENT, ARTIFACT_EVENT
from agents.domain.models import ThemeDocument

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
        
        # Step 1: Analyze request for brand/entity/topic
        analysis = await self._analyze_request(prompt, title, style_dict)
        
        # Step 2: Acquire colors based on analysis
        color_result = await self._acquire_colors(analysis, prompt, title, style_dict, opts.variety_seed)
        
        # Step 3: Select fonts based on brand/topic
        font_result = await self._select_fonts(analysis, color_result, title, opts.variety_seed)
        
        # Step 4: Generate final theme
        deck_theme = await self._compose_theme(color_result, font_result, analysis, deck_outline)
        
        # Step 5: Upload any scraped assets (logos)
        if color_result.get('metadata', {}).get('logo_url'):
            await self._upload_brand_assets(color_result, deck_outline)
        
        # Step 6: Generate smart image search terms
        search_terms = await self._generate_search_terms(deck_outline, title, prompt, analysis)
        
        # Per-slide theming (minimal)
        slide_themes: Dict[str, Dict[str, Any]] = {}
        if opts.per_slide_theming:
            for slide in getattr(deck_outline, 'slides', []) or []:
                slide_id = getattr(slide, 'id', None) or getattr(slide, 'uuid', None) or ''
                if slide_id:
                    slide_themes[slide_id] = {
                        "instructions": [
                            "Apply deck palette with high contrast",
                            "Scale typography based on content density"
                        ]
                    }

        doc = ThemeDocument(deck_theme=deck_theme, slide_themes=slide_themes, search_terms=search_terms, agent_trace=[])

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
    
    async def _analyze_request(
        self,
        prompt: str,
        title: str,
        style_dict: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze the request to determine brand/entity/topic."""
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
            'explicit_colors': []
        }
        
        # Check for brand mentions
        brand_patterns = [
            r'\b(colors?\s+of|like|similar\s+to|brand\s+colors?|official\s+colors?)\s+([\w\-\s\.]+?)(?:\s|$)',
            r'\b([\w\-]+)\s+(?:brand|company|corp|inc)\b',
            r'\b([\w\-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)\b',
        ]
        
        for pattern in brand_patterns:
            match = re.search(pattern, full_text)
            if match:
                brand_name = match.group(2) if match.lastindex >= 2 else match.group(1)
                brand_name = brand_name.strip()
                
                # Check if URL
                url = None
                if re.search(r'\.[a-z]{2,}(?:\.[a-z]{2,})?\b', brand_name, re.IGNORECASE):
                    url = f"https://{brand_name}" if not brand_name.startswith('http') else brand_name
                    brand_name = brand_name.split('.')[0]
                
                analysis['is_brand'] = True
                analysis['brand_name'] = brand_name
                analysis['brand_url'] = url
                break
        
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
    
    async def _acquire_colors(
        self,
        analysis: Dict[str, Any],
        prompt: str,
        title: str,
        style_dict: Optional[Dict[str, Any]],
        variety_seed: str
    ) -> Dict[str, Any]:
        """Acquire colors based on analysis using appropriate tools."""
        
        # Brand request - use brand tools
        if analysis['is_brand'] and analysis['brand_name']:
            # Try web scraper first if we have URL
            if analysis['brand_url']:
                from agents.tools.theme import WebColorScraper
                scraper = WebColorScraper()
                
                await self._emit_tool_call(
                    "WebColorScraper.scrape_brand_website",
                    {"name": analysis['brand_name'], "url": analysis['brand_url']}
                )
                
                try:
                    result = await scraper.scrape_brand_website(
                        name=analysis['brand_name'],
                        url=analysis['brand_url']
                    )
                    
                    if result.get('success') and result.get('colors'):
                        await self._emit_tool_result(
                            "WebColorScraper.scrape_brand_website",
                            [f"Found {len(result['colors'])} colors, logo: {bool(result.get('logo_url'))}"]
                        )
                        
                        # Emit palette candidates event
                        await self._emit_event("palette_candidates", {
                            "source": "web_scraper",
                            "candidates": [{"name": f"{analysis['brand_name']} Web Colors", "colors": result['colors'][:6]}]
                        })
                        
                        return self._format_scraper_result(result, analysis['brand_name'])
                except Exception as e:
                    logger.error(f"Web scraper failed: {e}")
                
                await self._emit_tool_result(
                    "WebColorScraper.scrape_brand_website",
                    ["Failed to scrape website"]
                )
            
            # Try brand color searcher
            from agents.tools.theme import BrandColorSearcher
            searcher = BrandColorSearcher()
            
            await self._emit_tool_call(
                "BrandColorSearcher.search_brand_colors",
                {"brand_name": analysis['brand_name']}
            )
            
            try:
                result = await searcher.search_brand_colors(analysis['brand_name'])
                
                if result and len(result) > 0:
                    await self._emit_tool_result(
                        "BrandColorSearcher.search_brand_colors",
                        [f"Found {len(result)} brand colors"]
                    )
                    
                    # Emit palette candidates
                    await self._emit_event("palette_candidates", {
                        "source": "brand_database",
                        "candidates": [{"name": f"{analysis['brand_name']} Brand Colors", "colors": result}]
                    })
                    
                    return {
                        'colors': result,
                        'source': 'brand_colors',
                        'backgrounds': self._infer_backgrounds(result),
                        'accents': self._infer_accents(result),
                        'metadata': {'brand': analysis['brand_name']}
                    }
            except Exception as e:
                logger.error(f"Brand color search failed: {e}")
            
            await self._emit_tool_result(
                "BrandColorSearcher.search_brand_colors",
                ["No brand colors found"]
            )
        
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
    
    async def _select_fonts(
        self,
        analysis: Dict[str, Any],
        color_result: Dict[str, Any],
        title: str,
        variety_seed: str
    ) -> Dict[str, Any]:
        """Select fonts based on brand/topic/style using intelligent metadata-based selection."""
        from services.enhanced_font_service import EnhancedFontService
        from services.registry_fonts import RegistryFonts
        
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
                "scraped_fonts": len(scraped_fonts),
                "variety_seed": variety_seed[:8],
                "method": "enhanced_metadata"
            }
        )
        
        font_result = {}
        
        if scraped_fonts:
            # Match scraped fonts to available
            try:
                from models.registry import ComponentRegistry
                registry = ComponentRegistry()
                available_fonts = RegistryFonts.get_available_fonts(registry)
            except Exception:
                available_fonts = RegistryFonts.get_all_fonts_list()
            matched = self._match_fonts(scraped_fonts, available_fonts)
            if matched:
                font_result = matched
        
        if not font_result:
            # CRITICAL: Check if this is a fun/playful/creative entity
            # These should get CREATIVE fonts, not boring corporate ones!
            entity_name = analysis.get('entity_name', '').lower()
            is_fun_entity = any(keyword in entity_name for keyword in [
                'pikachu', 'pokemon', 'mario', 'luigi', 'disney', 'mickey',
                'cartoon', 'game', 'toy', 'character', 'arcade', 'retro',
                'sonic', 'zelda', 'minecraft', 'roblox'
            ])

            # Check if title/content suggests creative/fun/casual topic
            title_lower = title.lower()
            prompt_lower = (analysis.get('topic', '') + ' ' + analysis.get('vibe', '')).lower()
            full_context = f"{title_lower} {prompt_lower}"

            is_fun_topic = any(keyword in full_context for keyword in [
                # Kids/Fun
                'pikachu', 'pokemon', 'kids', 'children', 'game', 'fun', 'play',
                'cartoon', 'toy', 'party', 'arcade', 'retro', 'playful',
                # Gaming/Tech Culture
                'gaming', 'esports', 'twitch', 'stream', 'gamer', 'pixel',
                '8bit', '8-bit', 'minecraft', 'roblox', 'fortnite',
                # Creative/Artistic
                'creative', 'artistic', 'design', 'art', 'music', 'festival',
                'concert', 'band', 'artist', 'gallery', 'exhibition',
                # Retro/Vintage
                '80s', '70s', '60s', 'vintage', 'retro', 'nostalgic', 'throwback',
                'disco', 'groovy', 'psychedelic',
                # Casual/Social
                'casual', 'social', 'community', 'meetup', 'hangout', 'club',
                'hobby', 'passion', 'enthusiast'
            ])
            
            if is_fun_entity or is_fun_topic:
                # OVERRIDE: Use playful fonts for fun topics!
                logger.info(f"🎨 FUN TOPIC DETECTED: {entity_name or title} → Using PLAYFUL fonts")
                print(f"🎨 FUN TOPIC DETECTED: '{entity_name or title}' → Selecting CREATIVE, PLAYFUL fonts")
                
                # Get available fonts to validate our choices
                try:
                    from models.registry import ComponentRegistry
                    registry = ComponentRegistry()
                    available_fonts = RegistryFonts.get_available_fonts(registry)
                except Exception:
                    available_fonts = RegistryFonts.get_all_fonts_list()
                
                available_fonts_lower = {f.lower(): f for f in available_fonts}
                
                # Rotate through playful font combinations
                # ONLY include fonts we know exist in the registry!
                import hashlib
                seed_hash = int(hashlib.md5(variety_seed.encode()).hexdigest(), 16)
                
                # CREATIVE PIXELBUDDHA FONTS - Much more interesting than boring Google Fonts!
                playful_combos = [
                    # Arcade/Gaming/Retro themes
                    {'hero': 'Arcade Quest - 8Bit Font', 'body': 'Poppins'},
                    {'hero': 'Pixel Impact - Retro 8Bit Font', 'body': 'Nunito'},
                    {'hero': 'Plump Pixel - Bouncy 8-Bit Font', 'body': 'Quicksand'},

                    # Retro 80s/Groovy themes
                    {'hero': 'Binary Groove - Groovy 1980\'s Typeface', 'body': 'Raleway'},
                    {'hero': 'Cosmic Hippie - Groovy Font', 'body': 'Work Sans'},
                    {'hero': 'Boho Melody - Groovy Typeface', 'body': 'Outfit'},

                    # Playful/Bubble/Fun themes
                    {'hero': 'Double Bubble 3D Typeface', 'body': 'Varela Round'},
                    {'hero': 'Chunky Charmer - Bold Typeface', 'body': 'Cabin'},

                    # Bold Modern Creative
                    {'hero': 'Kickbox - Bold Family Typeface', 'body': 'DM Sans'},
                    {'hero': 'Gridiron Glory - Sport Typeface', 'body': 'Roboto'},

                    # Fallback to Google Fonts if PixelBuddha not available
                    {'hero': 'Bebas Neue', 'body': 'Nunito'},
                    {'hero': 'Bangers', 'body': 'Rubik'},
                    {'hero': 'Fredoka', 'body': 'Quicksand'},
                    {'hero': 'Bungee', 'body': 'Asap'}
                ]
                
                # Validate combo exists, otherwise try next one
                for attempt in range(len(playful_combos)):
                    combo_idx = (seed_hash + attempt) % len(playful_combos)
                    selected_combo = playful_combos[combo_idx]
                    
                    hero_exists = selected_combo['hero'].lower() in available_fonts_lower
                    body_exists = selected_combo['body'].lower() in available_fonts_lower
                    
                    if hero_exists and body_exists:
                        # Get properly cased names from registry
                        font_result = {
                            'hero': available_fonts_lower[selected_combo['hero'].lower()],
                            'body': available_fonts_lower[selected_combo['body'].lower()],
                            'source': 'fun_topic_override',
                            'hero_category': 'playful',
                            'body_category': 'friendly'
                        }
                        logger.info(f"✅ Selected playful fonts: Hero={font_result['hero']}, Body={font_result['body']}")
                        print(f"✅ PLAYFUL FONTS SELECTED: Hero={font_result['hero']}, Body={font_result['body']}")
                        break
                    else:
                        logger.warning(f"⚠️  Combo {combo_idx} has missing fonts: hero_exists={hero_exists}, body_exists={body_exists}")
                else:
                    # None of the combos worked, fall back to guaranteed available fonts
                    logger.warning("⚠️  No playful combos available, using fallback")
                    font_result = {
                        'hero': 'Bebas Neue',  # Guaranteed available
                        'body': 'Poppins',     # Guaranteed available  
                        'source': 'fun_topic_fallback',
                        'hero_category': 'bold',
                        'body_category': 'sans-serif'
                    }
                    print(f"⚠️  FALLBACK FONTS: Hero=Bebas Neue, Body=Poppins")
            else:
                # Use EnhancedFontService for intelligent metadata-based selection
                try:
                    font_service = EnhancedFontService()
                    
                    # Extract context from analysis
                    vibe = analysis.get('vibe', 'professional')
                    keywords = []
                    if analysis.get('topic'):
                        keywords.append(analysis['topic'])
                    if analysis.get('industry'):
                        keywords.append(analysis['industry'])

                    audience = analysis.get('audience') or analysis.get('target_audience')

                    # Get intelligent font pair with variety
                    font_pair = font_service.select_font_pair(
                        deck_title=title,
                        vibe=vibe,
                        content_keywords=keywords,
                        target_audience=audience,
                        variety_seed=variety_seed
                    )
                    
                    font_result = {
                        'hero': font_pair['hero'],
                        'body': font_pair['body'],
                        'source': font_pair.get('source', 'enhanced_metadata'),
                        'hero_category': font_pair.get('hero_category'),
                        'body_category': font_pair.get('body_category')
                    }
                except Exception as e:
                    # Fallback to safe defaults
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"EnhancedFontService failed, using fallback: {e}")
                    font_result = {'hero': 'Montserrat', 'body': 'Roboto', 'source': 'fallback'}
        
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
        analysis: Dict[str, Any],
        deck_outline: Any = None
    ) -> Dict[str, Any]:
        """Compose final theme from colors and fonts.

        Uses EXACT same 3-color logic as frontend dropdown:
        - colors[0] = background
        - colors[1] = text
        - colors[2] = accent
        NO extra derived colors!
        """
        colors = color_result.get('colors', [])

        # For Huemint colors, use them DIRECTLY (already formatted correctly)
        if color_result.get('source') == 'huemint_ai':
            logger.info(f"🎨 Using Huemint colors directly (3 colors): {colors}")

            # Huemint colors are already: [background, text, accent]
            primary_bg = colors[0] if len(colors) > 0 else '#0A0E27'
            text_primary = colors[1] if len(colors) > 1 else '#FFFFFF'
            accent_1 = colors[2] if len(colors) > 2 else '#2563EB'

            theme = {
                'color_palette': {
                    # ONLY 3 COLORS like dropdown (no secondary/accent2!)
                    'colors': [primary_bg, text_primary, accent_1],  # Exact 3 colors
                    'backgrounds': [primary_bg],
                    'accents': [accent_1],
                    'text_colors': {'primary': text_primary},
                    # CRITICAL: Also set singular fields for frontend compatibility
                    'primary_background': primary_bg,
                    'accent_1': accent_1,
                    'primary_text': text_primary,
                    'gradients': [],
                    'source': 'huemint_ai',
                    'palette_name': 'AI Generated Palette',
                    'metadata': color_result.get('metadata', {})
                },
                'typography': {
                    'hero_title': {
                        'family': self._validate_font_name(font_result.get('hero', 'Montserrat')),
                        'weight': '700',
                        'size': '48px'
                    },
                    'body_text': {
                        'family': self._validate_font_name(font_result.get('body', 'Poppins')),
                        'weight': '400',
                        'size': '16px'
                    },
                    'font_source': font_result.get('source', 'contextual')
                },
                'visual_style': {
                    'background_style': 'solid',  # ALWAYS solid like frontend dropdown (no gradients!)
                    'style_keywords': analysis.get('style_keywords', [])
                }
            }
        else:
            # For brand/database colors, also use 3 colors (no extras!)
            logger.info(f"🎨 Using {color_result.get('source')} colors (keeping to 3): {colors}")

            # Get backgrounds and accents from color_result (already categorized)
            backgrounds = color_result.get('backgrounds', [])
            accents = color_result.get('accents', [])

            # Ensure we have at least one background
            if not backgrounds:
                backgrounds = [colors[0]] if colors else ['#0A0E27']

            primary_bg = backgrounds[0]

            # Get text color (compute from background if not provided)
            text_colors = color_result.get('text_colors', {})
            if text_colors and text_colors.get('primary'):
                text_primary = text_colors['primary']
            else:
                # Compute text color based on background brightness
                text_primary = '#FFFFFF' if self._estimate_brightness(primary_bg) < 0.5 else '#1A1A1A'

            # Get accent color
            if accents:
                accent_1 = accents[0]
            elif len(colors) > 1:
                accent_1 = colors[1]
            else:
                accent_1 = '#2563EB'  # Fallback

            # ONLY 3 COLORS - same as Huemint
            final_colors = [primary_bg, text_primary, accent_1]

            theme = {
                'color_palette': {
                    # ONLY 3 COLORS like dropdown (no secondary/accent2!)
                    'colors': final_colors,
                    'backgrounds': [primary_bg],
                    'accents': [accent_1],
                    'text_colors': {'primary': text_primary},
                    # CRITICAL: Also set singular fields for frontend compatibility
                    'primary_background': primary_bg,
                    'accent_1': accent_1,
                    'primary_text': text_primary,
                    'gradients': [],
                    'source': color_result.get('source', 'custom'),
                    'palette_name': color_result.get('palette_name', 'Selected Palette'),
                    'metadata': color_result.get('metadata', {})
                },
                'typography': {
                    'hero_title': {
                        'family': self._validate_font_name(font_result.get('hero', 'Montserrat')),
                        'weight': '700',
                        'size': '48px'
                    },
                    'body_text': {
                        'family': self._validate_font_name(font_result.get('body', 'Poppins')),
                        'weight': '400',
                        'size': '16px'
                    },
                    'font_source': font_result.get('source', 'contextual')
                },
                'visual_style': {
                    'background_style': 'solid',  # ALWAYS solid like frontend dropdown (no gradients!)
                    'style_keywords': analysis.get('style_keywords', [])
                }
            }

        # Add brand/entity metadata
        if analysis['is_brand']:
            theme['metadata'] = {
                'brand_name': analysis['brand_name'],
                'brand_url': analysis.get('brand_url')
            }
        elif analysis['is_entity']:
            theme['metadata'] = {
                'entity_name': analysis['entity_name']
            }
        
        # Include logo URL in theme if available
        try:
            # PRIORITY 1: Check for user-uploaded logo in deck_outline.stylePreferences.logoUrl
            logo_url = None
            if deck_outline and hasattr(deck_outline, 'stylePreferences') and deck_outline.stylePreferences:
                if hasattr(deck_outline.stylePreferences, 'logoUrl'):
                    user_logo = deck_outline.stylePreferences.logoUrl
                    if isinstance(user_logo, str) and user_logo.strip():
                        logo_url = user_logo.strip()
                        logger.info(f"[THEME DIRECTOR NEW] Using user-uploaded logo from stylePreferences: {logo_url[:60]}...")
            
            # PRIORITY 2: Fallback to scraped brand logo
            if not logo_url:
                logo_url = color_result.get('metadata', {}).get('logo_url')
                if isinstance(logo_url, str) and logo_url.strip():
                    logger.info(f"[THEME DIRECTOR NEW] Using scraped brand logo: {logo_url[:60]}...")
            
            if isinstance(logo_url, str) and logo_url.strip():
                # Add to brandInfo
                theme['brandInfo'] = {'logoUrl': logo_url}
                
                # Also add to color_palette.metadata for consistency
                if 'metadata' not in theme['color_palette']:
                    theme['color_palette']['metadata'] = {}
                theme['color_palette']['metadata']['logo_url'] = logo_url
        except Exception as e:
            logger.warning(f"[THEME DIRECTOR NEW] Error setting logo in theme: {e}")

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
            # For now, just emit the event
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
        except Exception as e:
            logger.error(f"Failed to upload logo: {e}")
            await self._emit_tool_result(
                "ImageStorageService.upload_from_url",
                ["Failed to upload"]
            )
    
    async def _generate_search_terms(
        self,
        deck_outline: Any,
        title: str,
        prompt: str,
        analysis: Dict[str, Any]
    ) -> List[str]:
        """
        Generate simple, concise image search terms (1-3 words each).
        
        Returns 5-8 specific, concrete search terms optimized for SerpAPI/Google Images.
        """
        from agents.ai.clients import get_client, invoke
        from agents.config import COMPOSER_MODEL
        
        await self._emit_agent(
            agent="ThemeDirector",
            phase="search_terms",
            summary="Generating image search terms"
        )
        
        # Sample first 5 slide titles for context
        slides = getattr(deck_outline, 'slides', []) or []
        slide_titles = [getattr(slide, 'title', 'Untitled') for i, slide in enumerate(slides[:5])]
        
        # Build simple context
        context_parts = [f"Deck: {title}"]
        if analysis.get('brand_name'):
            context_parts.append(f"Brand: {analysis['brand_name']}")
        elif analysis.get('entity_name'):
            context_parts.append(f"Topic: {analysis['entity_name']}")
        if slide_titles:
            context_parts.append(f"Slides: {', '.join(slide_titles)}")
        
        context_text = "\n".join(context_parts)
        
        prompt_text = f"""Generate 5-8 simple image search terms for Google Images.

{context_text}

REQUIREMENTS:
1. Each term must be 1-3 words ONLY
2. Use specific, concrete nouns (objects, places, things you can photograph)
3. If brand/character mentioned, include it
4. NO abstract concepts, NO verbs, NO adjectives alone
5. Think: "What would I type into Google Images to find good photos for this?"

GOOD EXAMPLES:
- "Tesla car"
- "solar panel"
- "business meeting"
- "ocean waves"
- "Pikachu"
- "laptop coding"

BAD EXAMPLES:
- "introduction to our company" (too long, abstract)
- "powerful" (adjective only)
- "overview" (abstract)
- "data" (too generic)

Return ONLY the search terms, one per line, NO numbering, NO explanations."""

        try:
            client = get_client(COMPOSER_MODEL)
            response = await invoke(
                client=client,
                model=COMPOSER_MODEL,
                messages=[{"role": "user", "content": prompt_text}],
                temperature=0.5,  # Lower temperature for more focused results
                max_tokens=150
            )
            
            raw_text = response.get('content', '')
            logger.info(f"[THEME DIRECTOR] Raw search terms: {raw_text}")
            
            # Parse and clean terms
            lines = raw_text.strip().split('\n')
            search_terms = []
            
            for line in lines:
                # Clean up the line
                term = re.sub(r'^[\d\.\-\*\>]+\s*', '', line.strip())
                term = term.strip('"\':,.')
                
                # Skip if empty or too short
                if not term or len(term) < 3:
                    continue
                
                # Skip if too many words (more than 4)
                if len(term.split()) > 4:
                    continue
                
                # Skip meta-commentary
                if any(meta in term.lower() for meta in ['here', 'example:', 'note:', 'search term']):
                    continue
                
                search_terms.append(term)
            
            # Limit to 8 terms
            search_terms = search_terms[:8]
            
            # If we got too few, add fallback
            if len(search_terms) < 3:
                fallback = self._get_fallback_terms(title, analysis)
                search_terms.extend(fallback[:5])
                search_terms = search_terms[:8]
            
            logger.info(f"[THEME DIRECTOR] Final search terms: {search_terms}")
            
            await self._emit_tool_result(
                "AI.generate_search_terms",
                search_terms
            )
            
            return search_terms
            
        except Exception as e:
            logger.error(f"[THEME DIRECTOR] Error generating search terms: {e}")
            fallback_terms = self._get_fallback_terms(title, analysis)
            logger.warning(f"[THEME DIRECTOR] Using fallback: {fallback_terms}")
            return fallback_terms
    
    def _get_fallback_terms(self, title: str, analysis: Dict[str, Any]) -> List[str]:
        """Generate fallback search terms from title and analysis."""
        terms = []
        
        # Add brand/entity if available
        if analysis.get('brand_name'):
            terms.append(analysis['brand_name'])
        elif analysis.get('entity_name'):
            terms.append(analysis['entity_name'])
        
        # Extract key nouns from title (simple heuristic)
        stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with'}
        title_words = [w for w in title.split() if len(w) > 3 and w.lower() not in stopwords]
        terms.extend(title_words[:4])
        
        return terms[:5]
    
    def _format_scraper_result(self, result: Dict[str, Any], brand_name: str) -> Dict[str, Any]:
        """Format web scraper result into color result format."""
        colors = result.get('colors', [])
        
        # Categorize colors
        categorized = result.get('categorized', {})
        backgrounds = categorized.get('backgrounds', [])
        accents = categorized.get('primaries', []) + categorized.get('accents', [])
        
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
            'source': 'web_scraper',
            'palette_name': f"{brand_name} Brand Colors",
            'metadata': {
                'brand': brand_name,
                'logo_url': result.get('logo_url'),
                'fonts': result.get('fonts', []),
                'guidelines_url': result.get('guidelines_url')
            }
        }
    
    def _validate_font_name(self, font_name: str) -> str:
        """Validate font name and return safe fallback if invalid."""
        if not font_name or not isinstance(font_name, str):
            logger.warning(f"⚠️  Invalid font (empty or wrong type): {font_name} → Using Montserrat")
            return 'Montserrat'
        
        # List of obviously invalid font names
        invalid_fonts = ['fonts', 'font', 'font family', 'fontfamily', 'default', 'none', 'null']
        
        if font_name.lower().strip() in invalid_fonts:
            logger.warning(f"⚠️  Invalid font name detected: '{font_name}' → Using Montserrat")
            print(f"⚠️  INVALID FONT NAME: '{font_name}' → Replaced with Montserrat")
            return 'Montserrat'
        
        return font_name
    
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
    
    def _create_gradients(self, bg1: str, bg2: str, a1: str, a2: str) -> List[Dict[str, Any]]:
        """Create gradient definitions."""
        return [
            {
                "name": "background_gradient",
                "type": "linear",
                "angle": 135,
                "colors": [bg1, bg2]
            },
            {
                "name": "accent_gradient",
                "type": "linear",
                "angle": 45,
                "colors": [a1, a2]
            },
            {
                "name": "subtle_gradient",
                "type": "radial",
                "colors": [self._lighten_color(bg1, 0.1), bg1]
            }
        ]
    
    def _compute_text_colors(self, bg: str, a1: str, a2: str) -> Dict[str, str]:
        """Compute text colors for backgrounds."""
        return {
            'primary': '#FFFFFF' if self._estimate_brightness(bg) < 0.5 else '#1A1A1A',
            'on_accent_1': '#FFFFFF' if self._estimate_brightness(a1) < 0.5 else '#1A1A1A',
            'on_accent_2': '#FFFFFF' if self._estimate_brightness(a2) < 0.5 else '#1A1A1A'
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
