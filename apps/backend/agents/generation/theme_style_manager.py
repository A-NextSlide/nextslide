"""
Theme and style management - handles design system generation and analysis.
"""
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Dict, Any, Optional, List
from agents.prompts.generation.global_theme_system import get_merged_theme_and_style_prompt
from agents.ai.clients import get_client, invoke
from agents.config import THEME_STYLE_MODEL
from services.huemint_palette_service import HuemintPaletteService
from services.database_config import get_database_connection_string
from services.simple_brandfetch_cache import SimpleBrandfetchCache
from services.palette_db_service import PaletteDBService
from models.requests import DeckOutline
from setup_logging_optimized import get_logger
from agents.generation.color_contrast_manager import ColorContrastManager
import logging

logger = get_logger(__name__)


class ThemeStyleManager:
    """Manages theme generation, style analysis, and color palettes."""
    
    def __init__(self, available_fonts: List[str]):
        self.available_fonts = available_fonts
        self.huemint_service = HuemintPaletteService()
        self.palette_db_service = PaletteDBService()
        self.contrast_manager = ColorContrastManager()
        
    async def _async_invoke(self, client, model, messages, max_tokens=2000, response_model=None, temperature=0.7):
        """Async wrapper for synchronous invoke calls to prevent blocking."""
        loop = asyncio.get_event_loop()
        
        # Create a partial function with keyword arguments
        invoke_func = partial(
            invoke,
            client=client,
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            response_model=response_model,
            temperature=temperature,
            theme_generation=True  # Flag this as theme generation
        )
        
        return await loop.run_in_executor(None, invoke_func)
    
    def _normalize_theme_structure(self, theme: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize theme structure to ensure consistency"""
        # Normalize typography keys
        if 'typography' in theme:
            normalized_typography = {}
            for key, value in theme['typography'].items():
                # Convert keys to lowercase with underscores
                normalized_key = key.lower().replace(' ', '_')
                
                # Handle string values that need to be parsed
                if isinstance(value, str):
                    # Parse string like "Sora, 96pt, 800, -0.01em" into dict
                    parts = [p.strip() for p in value.split(',')]
                    normalized_value = {}
                    
                    if len(parts) >= 1:
                        # First part is always the font family
                        normalized_value['family'] = parts[0]
                    
                    if len(parts) >= 2:
                        # Second part is size (remove 'pt' suffix)
                        size_str = parts[1].replace('pt', '').strip()
                        try:
                            normalized_value['size'] = int(size_str)
                        except:
                            normalized_value['size'] = 48  # Default size
                    
                    if len(parts) >= 3:
                        # Third part is weight
                        weight_str = parts[2].strip()
                        # Convert weight names to string numbers
                        weight_map = {
                            'regular': '400',
                            'normal': '400',
                            'medium': '500',
                            'semibold': '600',
                            'semi-bold': '600',
                            'bold': '700',
                            'heavy': '800',
                            'black': '900'
                        }
                        normalized_value['weight'] = weight_map.get(weight_str.lower(), weight_str)
                    
                    if len(parts) >= 4:
                        # Fourth part might be letter spacing
                        letter_spacing_str = parts[3].strip()
                        if 'em' in letter_spacing_str:
                            try:
                                normalized_value['letter_spacing'] = float(letter_spacing_str.replace('em', ''))
                            except:
                                pass
                    
                    normalized_typography[normalized_key] = normalized_value
                
                # Normalize the value structure if it's already a dict
                elif isinstance(value, dict):
                    normalized_value = {}
                    for k, v in value.items():
                        # Normalize inner keys
                        if k == 'font_family':
                            normalized_value['family'] = v
                        elif k == 'weight' and isinstance(v, str):
                            # Convert weight names to string numbers
                            weight_map = {
                                'regular': '400',
                                'normal': '400',
                                'medium': '500',
                                'semibold': '600',
                                'semi-bold': '600',
                                'bold': '700',
                                'heavy': '800',
                                'black': '900'
                            }
                            normalized_value['weight'] = weight_map.get(v.lower(), v)
                        elif k == 'size' and isinstance(v, str):
                            # Remove 'pt' suffix if present
                            normalized_value['size'] = int(v.replace('pt', '').strip())
                        else:
                            normalized_value[k] = v
                    normalized_typography[normalized_key] = normalized_value
                else:
                    normalized_typography[normalized_key] = value
            
            theme['typography'] = normalized_typography
        
        return theme
    
    async def analyze_theme_and_style(self, deck_outline: DeckOutline, progress_callback=None) -> Dict[str, Any]:
        """Analyze deck content and generate theme, style, and image queries."""
        try:
            logger.info("="*60)
            logger.info("[THEME ANALYSIS] Starting theme and style analysis")
            logger.info(f"[THEME ANALYSIS] Deck title: {deck_outline.title}")
            logger.info(f"[THEME ANALYSIS] Number of slides: {len(deck_outline.slides) if deck_outline.slides else 0}")
            logger.info("="*60)
            
            client, model = get_client(THEME_STYLE_MODEL)
            logger.info(f"Using model {model} for theme analysis")

            # Unified path: always use simple, Brandfetch-aware analysis first
            return await self._analyze_theme_simple(deck_outline, client, model)

            # Check for brand colors in style preferences
            has_brand_colors = False
            brand_colors = []
            if deck_outline.stylePreferences and hasattr(deck_outline.stylePreferences, 'colorPreference'):
                color_pref = deck_outline.stylePreferences.colorPreference
                if isinstance(color_pref, dict) and color_pref.get('type') == 'brand' and color_pref.get('brandColors'):
                    has_brand_colors = True
                    brand_colors = color_pref['brandColors']
                    logger.info(f"[THEME] Found {len(brand_colors)} brand colors in style preferences")
                    logger.info(f"[THEME] Brand colors: {brand_colors}")
                    logger.info(f"[THEME ANALYSIS] 🎨 Brand colors detected: {brand_colors}")
            
            # Use the simpler, brand-aware approach for all models to ensure palette/fonts/logo handling
                return await self._analyze_theme_simple(deck_outline, client, model)
            
            # Original complex approach for other models (disabled in favor of unified simple path)
            # Ensure we pass a categorized font map to the prompt builder
            try:
                from services.registry_fonts import RegistryFonts
                categorized_fonts = RegistryFonts.get_available_fonts()
            except Exception:
                categorized_fonts = None
            merged_prompt = get_merged_theme_and_style_prompt(deck_outline, categorized_fonts)
            
            response = await self._async_invoke(
                client=client,
                model=model,
                messages=[{"role": "user", "content": merged_prompt}],
                max_tokens=4000,  # Increased from 2000 to allow full response
                response_model=None
            )
            
            # Log the raw response for debugging
            logger.debug(f"Raw theme analysis response length: {len(response) if response else 0}")
            if not response or response.strip() == "{":
                logger.warning("Empty or truncated response from theme analysis, falling back to simple analysis")
                return await self._analyze_theme_simple(deck_outline, client, model)
            
            # Log first 200 chars of response for debugging
            logger.info(f"Theme response preview: {response[:200]}...")
            
            # Try to parse the response
            try:
                merged_data = json.loads(response)
            except json.JSONDecodeError as json_error:
                # Try to extract JSON from the response
                logger.warning(f"Initial JSON parse failed: {str(json_error)}")
                logger.error(f"Failed to parse extracted JSON: {str(json_error)}")
                logger.error(f"Response preview: {response[:200]}")
                
                # Look for JSON object in the response
                import re
                
                # Try multiple patterns to extract JSON
                patterns = [
                    r'\{[\s\S]*\}',  # Standard JSON object
                    r'```json\s*(\{[\s\S]*\})\s*```',  # JSON in code block
                    r'```\s*(\{[\s\S]*\})\s*```',  # JSON in generic code block
                ]
                
                json_found = False
                for pattern in patterns:
                    matches = re.findall(pattern, response, re.MULTILINE)
                    if matches:
                        # Try the last match (most complete)
                        for match in reversed(matches):
                            try:
                                # Clean up the match
                                if match.startswith('```'):
                                    match = re.sub(r'^```json?\s*', '', match)
                                    match = re.sub(r'\s*```$', '', match)
                                
                                merged_data = json.loads(match)
                                logger.info("Successfully extracted JSON from response")
                                json_found = True
                                break
                            except json.JSONDecodeError:
                                continue
                        if json_found:
                            break
                    
                    if not json_found:
                        # Try to fix truncated JSON by completing it
                        logger.warning("Attempting to repair truncated JSON response")
                        
                        # Find the last complete object/array boundary
                        # Count opening and closing braces/brackets
                        open_braces = response.count('{')
                        close_braces = response.count('}')
                        open_brackets = response.count('[')
                        close_brackets = response.count(']')
                        
                        # Try to complete the JSON
                        repaired = response
                        
                        # Add missing brackets/braces
                        missing_brackets = open_brackets - close_brackets
                        missing_braces = open_braces - close_braces
                        
                        # Close any open strings first
                        if repaired.count('"') % 2 == 1:
                            repaired += '"'
                        
                        # Add missing closing brackets/braces
                        repaired += ']' * missing_brackets
                        repaired += '}' * missing_braces
                        
                        try:
                            merged_data = json.loads(repaired)
                            logger.info("Successfully repaired truncated JSON")
                            json_found = True
                        except json.JSONDecodeError as repair_error:
                            logger.error(f"Failed to repair JSON: {str(repair_error)}")
                    
                    if not json_found:
                        # Last resort: Try to use simple theme analysis as fallback
                        logger.warning("Failed to extract valid JSON, falling back to simple analysis")
                        
                        # Use the simple analysis method which is more robust
                        # Note: client and model are already defined from earlier in the method
                        return await self._analyze_theme_simple(deck_outline, client, model)
            
            # Ensure we have valid theme data
            theme = merged_data.get('theme')
            style_spec = merged_data.get('style_spec')
            
            if not theme or not style_spec:
                logger.error(f"Missing theme or style_spec in response. Keys: {list(merged_data.keys())}")
                raise ValueError("AI failed to generate complete theme/style data")
                
            # Normalize theme structure
            theme = self._normalize_theme_structure(theme)
            
            return {
                'theme': theme,
                'style_spec': style_spec,
                'image_searches': merged_data.get('image_searches', {})
            }
            
        except Exception as e:
            logger.error(f"Error in theme/style analysis: {e}")
            logger.exception("Full traceback:")
            # Re-raise the error instead of returning defaults
            raise Exception(f"Theme analysis failed and is required for deck generation: {str(e)}")
    
    async def _analyze_theme_simple(self, deck_outline: DeckOutline, client, model: str, progress_callback=None) -> Dict[str, Any]:
        """Simpler theme analysis for Gemini models."""
        try:
            # Extract key information
            title = deck_outline.title
            vibe = deck_outline.stylePreferences.vibeContext if deck_outline.stylePreferences else "professional"
            
            # First check if we can get a palette from the database
            logger.info(f"[THEME SIMPLE] Checking database for palette matching: {title}")
            style_prefs = {}
            if deck_outline.stylePreferences:
                if hasattr(deck_outline.stylePreferences, 'vibeContext'):
                    style_prefs['vibeContext'] = deck_outline.stylePreferences.vibeContext
                if hasattr(deck_outline.stylePreferences, 'visualStyle'):
                    style_prefs['visualStyle'] = deck_outline.stylePreferences.visualStyle
            
            # Check if this is a known brand first
            brand_name = self._extract_brand_name(title, vibe)
            if brand_name:
                logger.info(f"[THEME SIMPLE] Detected brand: {brand_name} — fetching Brandfetch theme")
                # Try Brandfetch cache first to ensure official colors/logos
                try:
                    db_url = get_database_connection_string()
                except Exception:
                    db_url = None

                brandfetch_theme = None
                brandfetch_palette = None
                try:
                    identifier = f"{brand_name.replace(' ', '')}.com"
                    if db_url:
                        async with SimpleBrandfetchCache(db_url) as bf:
                            brand_info = await bf.get_brand_data(identifier)
                            if brand_info and not brand_info.get('error'):
                                # Build palette from brandfetch
                                categorized = bf.get_categorized_colors(brand_info)
                                bgs = categorized.get('backgrounds', [])
                                texts = categorized.get('text', [])
                                accents = categorized.get('accent', [])
                                # Normalize lists
                                backgrounds = [c for c in (bgs or []) if isinstance(c, str)]
                                text_primary = (texts or ['#1f2937'])[0]
                                # Build a robust color pool (prefer accents; fall back to hex list or all)
                                def _is_neutral(hex_color: str) -> bool:
                                    try:
                                        s = str(hex_color or '').strip().lstrip('#')
                                        if len(s) != 6:
                                            return False
                                        r = int(s[0:2], 16); g = int(s[2:4], 16); b = int(s[4:6], 16)
                                        sm = r + g + b
                                        if sm >= 720 or sm <= 60:
                                            return True
                                        mx = max(r, g, b); mn = min(r, g, b)
                                        return (mx - mn) <= 8
                                    except Exception:
                                        return False
                                try:
                                    hex_list = [c for c in (categorized.get('hex_list') or []) if isinstance(c, str)]
                                except Exception:
                                    hex_list = []
                                if not hex_list:
                                    try:
                                        hex_list = [c.get('hex') for c in (brand_info.get('colors', {}).get('all', []) or []) if isinstance(c, dict) and c.get('hex')]
                                    except Exception:
                                        hex_list = []

                                # Start with accents, then extend with hex_list
                                accent_pool = [c for c in (accents or []) if isinstance(c, str)]
                                full_pool = []
                                for c in (accent_pool + hex_list):
                                    if isinstance(c, str) and c.strip():
                                        uc = c.upper()
                                        if uc not in full_pool:
                                            full_pool.append(uc)
                                # Remove obvious neutrals from extras but keep if brand has only neutrals
                                non_neutral = [c for c in full_pool if not _is_neutral(c)]
                                final_colors = (non_neutral if len(non_neutral) >= 1 else full_pool)[:8]

                                # Pick accents preferring non-neutral vivid hues (avoid dark navy if teal exists)
                                def _vivid_score(hex_color: str) -> float:
                                    try:
                                        h = hex_color.lstrip('#')
                                        r = int(h[0:2], 16); g = int(h[2:4], 16); b = int(h[4:6], 16)
                                        # vividness ≈ max channel distance from grey
                                        return max(abs(r-g), abs(g-b), abs(b-r)) / 255.0
                                    except Exception:
                                        return 0.0
                                # Prefer non-neutral, high vividness colors for accents
                                ranked = sorted(final_colors, key=lambda c: (_vivid_score(c), c not in ['#000000', '#1A1F3A', '#111827']), reverse=True)
                                accent_1 = ranked[0] if ranked else '#F59E0B'
                                accent_2 = accent_1
                                for c in ranked[1:]:
                                    if c != accent_1 and not _is_neutral(c):
                                        accent_2 = c
                                        break

                                brandfetch_palette = {
                                    'backgrounds': backgrounds[:2] if backgrounds else [],
                                    'colors': final_colors,
                                    'text_colors': {
                                        'primary': text_primary
                                    },
                                    'source': 'brandfetch'
                                }
                                # Ensure palette.colors carries non-neutral backgrounds as well
                                try:
                                    extended_colors = list(final_colors)
                                    for extra in (backgrounds[:2] if backgrounds else []):
                                        if isinstance(extra, str) and extra and extra.upper() not in ['#FFFFFF', '#FFF'] and extra not in extended_colors:
                                            extended_colors.append(extra)
                                    brandfetch_palette['colors'] = extended_colors
                                except Exception:
                                    pass

                                # Build theme color palette
                                primary_bg = (brandfetch_palette['backgrounds'][0] if brandfetch_palette['backgrounds'] else (brandfetch_palette['colors'][0] if brandfetch_palette['colors'] else '#FFFFFF'))
                                secondary_bg = (brandfetch_palette['backgrounds'][1] if len(brandfetch_palette['backgrounds']) > 1 else '#1A1F3A')
                                accent_1 = (brandfetch_palette['colors'][0] if brandfetch_palette['colors'] else '#F59E0B')
                                accent_2 = (brandfetch_palette['colors'][1] if len(brandfetch_palette['colors']) > 1 else accent_1)
                                # Ensure readable text on primary background
                                try:
                                    text_primary = self.contrast_manager.get_readable_text_color(primary_bg).get('recommended') or brandfetch_palette['text_colors'].get('primary', '#1f2937')
                                except Exception:
                                    text_primary = brandfetch_palette['text_colors'].get('primary', '#1f2937')

                                brandfetch_theme = {
                                    'theme_name': f"{brand_name.title()} Brand Theme",
                                    'color_palette': {
                                        'primary_background': primary_bg,
                                        'secondary_background': secondary_bg,
                                        'primary_text': text_primary,
                                        'accent_1': accent_1,
                                        'accent_2': accent_2,
                                        'colors': brandfetch_palette['colors']
                                    },
                                    'typography': {
                                        'hero_title': {
                                            'family': 'BEBAS NEUE',
                                            'size': 180,
                                            'weight': '700'
                                        },
                                        'body_text': {
                                            'family': 'ROBOTO',
                                            'size': 36,
                                            'weight': '400'
                                        }
                                    }
                                }

                except Exception as e:
                    logger.warning(f"[THEME SIMPLE] Brandfetch failed ({brand_name}): {e}")

                if brandfetch_theme and brandfetch_palette:
                    logger.info("[THEME SIMPLE] ✅ Using Brandfetch theme and palette")
                    return {
                        'theme': brandfetch_theme,
                        'style_spec': { 'palette': brandfetch_palette },
                        'search_terms': [brand_name],
                        'image_searches': {}
                    }
                # Fallback to database palette route if Brandfetch fails
                logger.info("[THEME SIMPLE] Brandfetch unavailable, falling back to database palette")
                db_palette = self.palette_db_service.get_palette_for_topic(
                    topic=title,
                    style_preferences=style_prefs,
                    randomize=True
                )
            else:
                # Regular palette lookup for non-brands
                db_palette = self.palette_db_service.get_palette_for_topic(
                    topic=title,
                    style_preferences=style_prefs,
                    randomize=True  # Add variety to palette selection
                )
            
            # Store palette info for later use
            palette_colors = None
            palette_name = None
            if db_palette:
                logger.info(f"[THEME SIMPLE] ✅ Found database palette: {db_palette.get('name')}")
                palette_colors = db_palette.get('colors', [])
                palette_name = db_palette.get('name', 'Database Palette')
            
            # Debug logging
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(f"[THEME DEBUG] stylePreferences exists: {deck_outline.stylePreferences is not None}")
                if deck_outline.stylePreferences:
                    logger.debug(f"[THEME DEBUG] vibeContext value: {getattr(deck_outline.stylePreferences, 'vibeContext', 'NOT SET')}")
                    logger.debug(f"[THEME DEBUG] Full stylePreferences: {deck_outline.stylePreferences}")
            
            first_slides = "\n".join([f"{s.title}: {s.content[:100]}" for s in deck_outline.slides[:3]])
            
            # Get the original prompt if available
            original_prompt = getattr(deck_outline, 'prompt', '')
            
            # Extract brand guidelines from uploaded media
            brand_guidelines_info = ""
            if hasattr(deck_outline, 'uploadedMedia') and deck_outline.uploadedMedia:
                for media in deck_outline.uploadedMedia:
                    if hasattr(media, 'metadata') and media.metadata:
                        if media.metadata.get('brandGuideline'):
                            brand_guidelines_info += f"\n📋 Brand Guideline File: {media.filename}"
                            if media.metadata.get('extractedBrandInfo'):
                                brand_info = media.metadata['extractedBrandInfo']
                                if brand_info.get('colors'):
                                    brand_guidelines_info += f"\n  - Brand Colors: {brand_info['colors']}"
                                if brand_info.get('fonts'):
                                    brand_guidelines_info += f"\n  - Brand Fonts: {brand_info['fonts']}"
                                if brand_info.get('style'):
                                    brand_guidelines_info += f"\n  - Brand Style Description: {brand_info['style']}"
            
            # Log theme analysis start
            logger.info(f"[THEME PROMPT] Building theme analysis for Gemini model")
            logger.info(f"[THEME PROMPT] Title: {title}")
            logger.info(f"[THEME PROMPT] Vibe: {vibe}")
            if original_prompt:
                logger.info(f"[THEME PROMPT] Original prompt preview: {original_prompt[:100]}...")
            if brand_guidelines_info:
                logger.info(f"[THEME PROMPT] Brand guidelines found:{brand_guidelines_info}")
            
            # Check for colors mentioned in vibe context
            vibe_colors = self._extract_colors_from_vibe(vibe) if vibe else []
            if vibe_colors:
                logger.info(f"[THEME ANALYSIS] 🎨 Colors found in vibe context: {vibe_colors}")
            
            # Check for brand colors
            has_brand_colors = False
            brand_colors = []
            if deck_outline.stylePreferences and hasattr(deck_outline.stylePreferences, 'colorPreference'):
                color_pref = deck_outline.stylePreferences.colorPreference
                if isinstance(color_pref, dict) and color_pref.get('type') == 'brand' and color_pref.get('brandColors'):
                    has_brand_colors = True
                    brand_colors = color_pref['brandColors']
                    logger.info(f"[THEME ANALYSIS] 🎨 Brand colors detected: {brand_colors}")
            
            # Get all available fonts organized by category
            from services.registry_fonts import RegistryFonts
            font_categories = RegistryFonts.get_available_fonts()
            
            # Build a comprehensive font list string for the prompt
            font_list_parts = []
            for category, fonts_in_category in font_categories.items():
                if fonts_in_category:
                    font_list_parts.append(f"{category}: {', '.join(fonts_in_category)}")
            available_fonts_str = "\n".join(font_list_parts)
            
            # Always use AI model for color generation - Huemint is not giving good results
            has_specific_brand = self._has_specific_brand_colors(title, vibe, first_slides)
            should_use_huemint = False  # Disabled - AI model handles all color generation
            
            # Log color decision - PRIORITIZE vibe colors over brand detection
            if vibe_colors:
                logger.info(f"[COLOR DECISION] 🎨 USER PROVIDED COLORS - Using colors from vibe: {vibe_colors}")
                logger.info(f"[COLOR DECISION] AI will incorporate these specific colors")
            elif has_brand_colors:
                logger.info(f"[COLOR DECISION] 🎨 BRAND GUIDELINES DETECTED - Using brand colors: {brand_colors}")
                logger.info(f"[COLOR DECISION] AI will use brand guidelines")
            elif has_specific_brand:
                logger.info(f"[COLOR DECISION] 🎨 KNOWN BRAND/CHARACTER DETECTED - AI will provide authentic colors")
                logger.info(f"[COLOR DECISION] AI will generate brand-appropriate colors")
            else:
                logger.info(f"[COLOR DECISION] 🎪 GENERAL TOPIC - AI will create context-appropriate palette")
                logger.info(f"[COLOR DECISION] AI will analyze content and generate suitable colors")
            
            # PARALLEL EXECUTION: Prepare shared context for all operations
            logger.info("[THEME PARALLEL] 🚀 Starting parallel theme generation...")
            parallel_start = asyncio.get_event_loop().time()
            
            vibe_color_instruction = ""
            if vibe_colors:
                vibe_color_instruction = f"\n🚨 CRITICAL: The user specifically requested these colors: {', '.join(vibe_colors)}\nYou MUST use these as your primary colors in the palette!\n"
            
            # Add brand-specific warning if needed
            brand_override_warning = ""
            if has_specific_brand and (vibe_colors or vibe != "professional"):
                brand_override_warning = f"\n⚠️ IMPORTANT: While '{title}' might have known brand colors, the user has provided specific design preferences. YOU MUST FOLLOW THE USER'S PREFERENCES, NOT DEFAULT BRAND COLORS.\n"
            
            # Build comprehensive context for the AI
            full_context = ""
            if original_prompt:
                full_context += f"\n📝 ORIGINAL USER REQUEST:\n{original_prompt}\n"
            if brand_guidelines_info:
                full_context += f"\n📋 BRAND GUIDELINES:{brand_guidelines_info}\n"
            
            # Define all operations as async functions
            async def generate_colors_task():
                """Generate color palette in parallel"""
                logger.info("[THEME PARALLEL] Task 1: Starting color generation...")
                
                # If we already have a brand palette, just return it
                if db_palette and db_palette.get('colors'):
                    logger.info(f"[THEME PARALLEL] Using brand palette colors: {db_palette['colors']}")
                    return {
                        'primary_bg': db_palette.get('primary_background', db_palette['colors'][0]),
                        'secondary_bg': db_palette.get('secondary_background', db_palette['colors'][0]),
                        'text': '#FFFFFF',
                        'secondary_text': '#E0E0E0',
                        'accent_1': db_palette.get('accent_1', db_palette['colors'][0]),
                        'accent_2': db_palette.get('accent_2', db_palette['colors'][1] if len(db_palette['colors']) > 1 else db_palette['colors'][0]),
                        'accent_3': db_palette['colors'][2] if len(db_palette['colors']) > 2 else db_palette['colors'][0],
                        'shape_color': db_palette.get('accent_1', db_palette['colors'][0]) + '20'
                    }
                
                # If we have specific vibe colors, create a more forceful prompt
                if vibe_colors:
                    color_prompt = f"""
🚨🚨🚨 CRITICAL COLOR REQUIREMENT 🚨🚨🚨

The user has SPECIFICALLY requested these colors: {', '.join(vibe_colors)}

YOU MUST USE THESE EXACT COLORS IN YOUR PALETTE!

Title: {title}
User's color request: {vibe}

Create a palette using EXACTLY these colors:
- Primary colors MUST include: {', '.join(vibe_colors[:2])}
- You may add complementary colors that work well with these

PROVIDE EXACTLY 8 COLORS:
1. Primary Background: #1A1A1A [MUST BE DARK! Create a bold, dramatic background]
2. Secondary Background: [DARKER version of requested colors for gradient - NO LIGHT COLORS]
3. Primary Text: #FFFFFF [White text for dark backgrounds]
4. Secondary Text: #E0E0E0 [Light gray for readability]
5. Accent 1: {vibe_colors[0]} (MUST USE THIS - but make it VIBRANT)
6. Accent 2: {vibe_colors[1] if len(vibe_colors) > 1 else vibe_colors[0]} (MUST USE THIS - but make it BOLD)
7. Accent 3: [complementary BRIGHT color for highlights]
8. Shape Color: {vibe_colors[0] + '20'} [20% opacity of accent 1]

Format as:
Primary Background: #XXXXXX
Secondary Background: #XXXXXX
Primary Text: #XXXXXX
Secondary Text: #XXXXXX
Accent 1: #XXXXXX
Accent 2: #XXXXXX
Accent 3: #XXXXXX
Shape Color: #XXXXXX

REMEMBER: The user asked for "{vibe}" - USE THESE COLORS!
"""
                else:
                    color_prompt = f"""
You are a world-class color designer creating a stunning palette for this presentation.

Title: {title}
Vibe: {vibe}
Content Preview: {first_slides}
{full_context}
{vibe_color_instruction}
{brand_override_warning}

🎨 CREATE A BOLD, DRAMATIC COLOR PALETTE WITH STUNNING GRADIENTS:

YOU ARE THE PRIMARY COLOR DESIGNER - Create BOLD backgrounds and DRAMATIC gradients!

🔥 CRITICAL: BACKGROUNDS MUST BE APPROPRIATE AND IMPACTFUL:
- Choose colors that MATCH THE TOPIC (green for nature, blue for ocean, etc.)
- Avoid pure white (#FFFFFF) but light colors are OK if they fit the subject
- Create GRADIENT-READY color pairs that enhance the content
- Think about what makes SENSE for the topic, not just what looks dramatic!

DRAMATIC COLOR STRATEGIES BY TOPIC:

1. **Scientific/Educational Topics** (photosynthesis, biology, chemistry, physics):
   → Use APPROPRIATE colors for the topic - not always dark!
   → Example: Photosynthesis → Fresh green (#2E7D32) to bright leaf green (#4CAF50), sunshine yellow accents
   → Example: Ocean biology → Ocean blue (#1976D2) to deep sea (#0D47A1), coral accents
   → Let the SUBJECT guide the colors - photosynthesis should feel alive and vibrant!

2. **Nature/Environmental Topics**:
   → MOODY, ATMOSPHERIC backgrounds
   → Forest → Dark moss (#1A2F1A) to forest shadow (#0F1F0F)
   → Desert → Twilight sand (#3D2817) to night sky (#1A0F08)
   → Create depth and mystery

3. **Tech/Digital Topics**:
   → CYBERPUNK darkness with neon accents
   → Dark purple (#1A0033) to electric blue (#001A4D)
   → Matrix black (#0A0A0A) to code green (#001100)

4. **Business/Professional Topics**:
   → CREATE VARIETY - Business doesn't mean boring!
   → Consider: Deep emerald to forest green for growth/finance
   → Or: Rich burgundy to plum for luxury/premium
   → Or: Deep teal to ocean blue for trust/innovation
   → Or: Charcoal to silver for modern/sleek
   → AVOID defaulting to navy blue - be creative!

5. **Creative/Artistic Topics**:
   → BOLD gradient possibilities
   → Deep magenta (#4A0E4E) to electric purple (#81689D)
   → Sunset orange (#CC2936) to twilight purple (#2D1B69)

GOLDEN RULE: Make TASTEFUL choices that enhance the content
- Think about what the audience expects and needs
- Consider the emotional tone and purpose
- Balance creativity with appropriateness
- ALWAYS maintain readability and visual harmony

BE SMART: You understand context. A presentation about photosynthesis should feel 
natural and educational with VIBRANT GREENS, not dark forest colors. A presentation 
about digital art can be wild and creative. Let the CONTENT guide your color choices.

⚠️ IMPORTANT: Generate UNIQUE colors each time - even for the same topic!
- Use different shades and variations
- Consider time of day, season, mood variations
- Photosynthesis could be spring green, summer green, morning light, etc.
- NEVER default to the same exact palette

PROVIDE EXACTLY 8 SPECIFIC HEX COLORS:

BEFORE YOU CHOOSE, ASK YOURSELF:
1. What is the core subject? (e.g., photosynthesis = life/plants/sun)
2. What emotions should it evoke? (educational, exciting, professional, etc.)
3. Who is the audience? (students, executives, creatives, etc.)
4. What colors naturally represent this topic?

NOW PROVIDE YOUR COLORS:
1. Primary Background: #XXXXXX [BE BOLD! Use darker colors (#1A1A1A to #4A4A4A) or rich, saturated colors. NO WHITE/NEAR-WHITE!]
2. Secondary Background: #XXXXXX [For gradient end - should create dramatic contrast with primary]
3. Primary Text: #XXXXXX [Maximum contrast with primary bg - usually white #FFFFFF for dark backgrounds]
4. Secondary Text: #XXXXXX [Slightly softer but still readable - #E0E0E0 or similar]
5. Accent 1: #XXXXXX [The MAIN thematic color - VIBRANT and BOLD]
6. Accent 2: #XXXXXX [Complementary to accent 1 - equally VIBRANT]
7. Accent 3: #XXXXXX [Additional variety, can be bold - for highlights]
8. Shape Color: #XXXXXX [Accent 1 with 20% opacity, e.g., #XXXXXX20]

QUALITY CHECK:
✓ Do these colors tell the story of the content?
✓ Will the audience find them appropriate and appealing?
✓ Do they work together harmoniously?
✓ Is there enough contrast for readability?

SPECIFIC EXAMPLES FOR APPROPRIATE BACKGROUNDS:
- Photosynthesis: PRIMARY BG: Vibrant green (#4CAF50), SECONDARY BG: Fresh leaf (#66BB6A), ACCENT: Sunshine yellow (#FFD54F)
- Ocean: PRIMARY BG: Ocean blue (#2196F3), SECONDARY BG: Deep sea (#1565C0), ACCENT: Coral (#FF7043)
- Technology: PRIMARY BG: Matrix black (#0A0A0A), SECONDARY BG: Cyber purple (#1A0033), ACCENT: Neon green (#39FF14)
- Business: PRIMARY BG: Deep emerald (#0F3A0F), SECONDARY BG: Forest green (#1A4D1A), ACCENT: Copper (#B87333)
- Business Alt 1: PRIMARY BG: Rich burgundy (#4A0E1F), SECONDARY BG: Deep wine (#6B1F3A), ACCENT: Gold (#FFD700)
- Business Alt 2: PRIMARY BG: Charcoal (#1A1A1A), SECONDARY BG: Graphite (#2D2D2D), ACCENT: Electric orange (#FF6B35)

RESPOND WITH EXACTLY THIS FORMAT (replace X's with actual hex values):
Primary Background: #XXXXXX
Secondary Background: #XXXXXX
Primary Text: #XXXXXX
Secondary Text: #XXXXXX
Accent 1: #XXXXXX
Accent 2: #XXXXXX
Accent 3: #XXXXXX
Shape Color: #XXXXXX

DO NOT add any other text, explanations, or formatting. Just the 8 lines above with real hex color codes.

REMEMBER: Each topic needs UNIQUE colors that tell its story!
"""
                
                # Add system message for better context
                color_messages = [
                    {"role": "system", "content": "You are a professional color designer who creates unique, appropriate color palettes for presentations. You understand that different topics require different color schemes - photosynthesis needs greens and yellows, ocean topics need blues and teals, technology needs modern electric colors, etc. You NEVER use the same colors for different topics."},
                    {"role": "user", "content": color_prompt}
                ]
                
                color_response = await self._async_invoke(
                client=client,
                model=model,
                messages=color_messages,
                max_tokens=300,
                response_model=None,
                temperature=0.9  # Higher temperature for more creative color choices
                )
                
                logger.warning(f"[COLOR GENERATION] Raw AI response: {color_response[:500]}...")
                
                # If we have a database palette, map it intelligently to theme colors
                if palette_colors:
                    logger.info(f"[COLOR GENERATION] Using database palette colors: {palette_colors}")
                    try:
                        # Check if db_palette has explicit background colors (for brands)
                        if db_palette and db_palette.get('primary_background'):
                            primary_bg = db_palette['primary_background']
                            secondary_bg = db_palette.get('secondary_background', primary_bg)
                            logger.info(f"[COLOR GENERATION] Using brand-specific backgrounds: {primary_bg}, {secondary_bg}")
                        else:
                            # Choose backgrounds as the two lightest colors for readability
                            sorted_by_brightness = sorted(
                                palette_colors,
                                key=lambda c: self._get_brightness(c),
                                reverse=True
                            )
                            primary_bg = sorted_by_brightness[0]
                            secondary_bg = (
                                sorted_by_brightness[1]
                                if len(sorted_by_brightness) > 1 else
                                self._adjust_brightness(primary_bg, 0.9)
                            )

                        # Accents: prefer colored, mid-brightness values (avoid near-black/near-white)
                        def _rgb_tuple(hex_str: str):
                            s = hex_str.lstrip('#')
                            return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
                        def _colorfulness(hex_str: str) -> float:
                            r, g, b = _rgb_tuple(hex_str)
                            return max(abs(r-g), abs(g-b), abs(b-r)) / 255.0
                        def _is_extreme_brightness(hex_str: str) -> bool:
                            b = self._get_brightness(hex_str)
                            return b < 0.12 or b > 0.92

                        remaining = [c for c in palette_colors if c not in [primary_bg, secondary_bg]]
                        # Score accents by colorfulness first, then by brightness closeness to 0.5 (mid)
                        scored = [
                            (
                                _colorfulness(c),
                                -abs(self._get_brightness(c) - 0.5),
                                c
                            )
                            for c in remaining if not _is_extreme_brightness(c)
                        ]
                        if not scored:  # fallback if all were extreme
                            scored = [(_colorfulness(c), -abs(self._get_brightness(c) - 0.5), c) for c in remaining]
                        # Check if db_palette has explicit accent colors (for brands)
                        if db_palette and db_palette.get('accent_1'):
                            accent_1 = db_palette['accent_1']
                            accent_2 = db_palette.get('accent_2', accent_1)
                            accent_3 = palette_colors[2] if len(palette_colors) > 2 and palette_colors[2] not in [primary_bg, secondary_bg, accent_1, accent_2] else accent_2
                            logger.info(f"[COLOR GENERATION] Using brand-specific accents: {accent_1}, {accent_2}")
                        else:
                            scored.sort(reverse=True)
                            accent_1 = scored[0][2] if len(scored) > 0 else (remaining[0] if remaining else sorted_by_brightness[-1])
                            # pick next distinct
                            accent_2 = None
                            for _, __, c in scored[1:]:
                                if c != accent_1:
                                    accent_2 = c
                                    break
                            if not accent_2:
                                accent_2 = accent_1
                            # third accent prefer any remaining colored
                            accent_3 = None
                            for _, __, c in scored:
                                if c not in {accent_1, accent_2}:
                                    accent_3 = c
                                    break
                            if not accent_3:
                                accent_3 = sorted_by_brightness[2] if len(sorted_by_brightness) > 2 else accent_2

                        # Text colors: use contrast manager to ensure readability on backgrounds
                        palette_for_contrast = [c for c in [primary_bg, secondary_bg, accent_1, accent_2, accent_3] if c]
                        text_result = self.contrast_manager.get_readable_text_color(primary_bg, palette_for_contrast)
                        text_color = text_result['recommended']
                        secondary_text_result = self.contrast_manager.get_readable_text_color(secondary_bg, palette_for_contrast)
                        secondary_text = secondary_text_result['recommended']
                        logger.info(f"[COLOR GENERATION] Contrast-checked text: primary={text_color} (ratio {text_result['contrast_ratio']:.2f}), secondary={secondary_text}")

                        colors = {
                            'primary_bg': primary_bg,
                            'secondary_bg': secondary_bg,
                            'text': text_color,
                            'secondary_text': secondary_text,
                            'accent_1': accent_1,
                            'accent_2': accent_2,
                            'accent_3': accent_3,
                            'shape_color': f"{accent_1}20"
                        }
                        logger.info(f"[COLOR GENERATION] Mapped DB palette to theme colors: {colors}")
                    except Exception as map_err:
                        logger.warning(f"[COLOR GENERATION] Failed to intelligently map DB palette, using simple mapping: {map_err}")
                        colors = {
                            'primary_bg': palette_colors[0] if len(palette_colors) > 0 else '#FFFFFF',
                            'secondary_bg': palette_colors[1] if len(palette_colors) > 1 else '#F0F4F8',
                            'text': '#1A1A1A' if (len(palette_colors) > 0 and self._get_brightness(palette_colors[0]) >= 0.6) else '#FFFFFF',
                            'secondary_text': '#666666',
                            'accent_1': palette_colors[2] if len(palette_colors) > 2 else (palette_colors[0] if palette_colors else '#0066CC'),
                            'accent_2': palette_colors[3] if len(palette_colors) > 3 else (palette_colors[1] if len(palette_colors) > 1 else '#FF6B6B'),
                            'accent_3': palette_colors[4] if len(palette_colors) > 4 else (palette_colors[2] if len(palette_colors) > 2 else '#00AA55'),
                            'shape_color': ((palette_colors[2] if len(palette_colors) > 2 else (palette_colors[0] if palette_colors else '#0066CC')) + '20')
                        }
                        logger.info(f"[COLOR GENERATION] Mapped DB palette (fallback) to theme colors: {colors}")
                else:
                    # Parse colors from response
                    colors = self._parse_colors_from_text(color_response)
                
                # If parsing failed, retry with an even stricter prompt
                if colors is None and not palette_colors:
                    logger.warning(f"[COLOR GENERATION] First attempt failed, retrying with stricter prompt...")
                    
                    strict_prompt = f"""
Title: {title}

CRITICAL: You MUST provide EXACTLY these 8 lines with hex color codes:

Primary Background: #[6 characters]
Secondary Background: #[6 characters]  
Primary Text: #[6 characters]
Secondary Text: #[6 characters]
Accent 1: #[6 characters]
Accent 2: #[6 characters]
Accent 3: #[6 characters]
Shape Color: #[6 characters with 20 at end]

For "{title}":
- If it's about photosynthesis, use greens (#228B22), yellows (#FFD700), blues (#87CEEB)
- If it's about ocean, use deep blues (#003F5C), teals (#4ECDC4), aqua (#00ACC1)
- If it's about technology, use electric blues (#00D9FF), cyber purples (#8B00FF)
- Otherwise, choose appropriate colors for the topic

NO OTHER TEXT. Just the 8 lines above with real colors.
"""
                    
                    retry_response = await self._async_invoke(
                        client=client,
                        model=model,
                        messages=[{"role": "user", "content": strict_prompt}],
                        max_tokens=200,
                        response_model=None,
                        temperature=0.5  # Lower temperature for more consistent format
                    )
                    
                    colors = self._parse_colors_from_text(retry_response)
                    
                    # If still failing, use emergency fallback based on title
                    if colors is None:
                        logger.error(f"[COLOR GENERATION] AI failed to generate colors properly!")
                        # Generate colors based on title keywords
                        colors = self._generate_emergency_colors(title)
            
                # Validate and enforce vibe colors if they were requested
                if vibe_colors:
                    logger.info(f"[COLOR VALIDATION] Ensuring requested colors are used: {vibe_colors}")
                    # Force the requested colors into the palette
                    if len(vibe_colors) >= 1:
                        colors['accent_1'] = vibe_colors[0]
                        logger.info(f"[COLOR VALIDATION] Set Accent 1 to requested color: {vibe_colors[0]}")
                    if len(vibe_colors) >= 2:
                        colors['accent_2'] = vibe_colors[1]
                        logger.info(f"[COLOR VALIDATION] Set Accent 2 to requested color: {vibe_colors[1]}")
                
                    # If pink is requested, ensure proper contrast
                    if '#FF69B4' in vibe_colors:  # Pink
                        # Ensure we have a dark background for contrast
                        if self._get_brightness(colors.get('primary_bg', '#FFFFFF')) > 0.9:
                            colors['primary_bg'] = '#1A1A1A'  # Dark background for pink
                            colors['text'] = '#FFFFFF'  # White text
                            logger.info(f"[COLOR VALIDATION] Adjusted background to dark for better pink contrast")
                
                logger.info("[THEME PARALLEL] Task 1: Color generation complete")
                return colors
            
            async def generate_fonts_task():
                """Generate font pairings in parallel"""
                logger.info("[THEME PARALLEL] Task 2: Starting font selection...")
                
                # First check if db_palette has fonts in metadata
                scraped_fonts = []
                if db_palette and db_palette.get('metadata', {}).get('fonts'):
                    scraped_fonts = db_palette['metadata']['fonts']
                    logger.info(f"[FONT SELECTION] Using fonts from palette metadata: {scraped_fonts}")
                
                # If no fonts in metadata, check if we have a known brand
                if not scraped_fonts:
                    brand_name = self._extract_brand_name(title, vibe)
                    
                    if brand_name:
                        try:
                            logger.info(f"[FONT SELECTION] Detected brand: {brand_name}, checking for fonts...")
                            # We can't run async code here, so we'll check if fonts were already scraped
                            # This will be populated when palette is generated
                            # For now, we'll use known brand fonts
                            brand_fonts = {
                                'kroger': ['Nunito', 'Nunito Sans'],
                                'walmart': ['Bogle', 'Montserrat'],
                                'target': ['Helvetica Neue', 'Avenir'],
                                'google': ['Google Sans', 'Roboto'],
                                'apple': ['SF Pro Display', 'SF Pro Text'],
                                'starbucks': ['Sodo Sans', 'Lander'],
                                'amazon': ['Amazon Ember', 'Bookerly']
                            }
                            
                            if brand_name.lower() in brand_fonts:
                                scraped_fonts = brand_fonts[brand_name.lower()]
                                logger.info(f"[FONT SELECTION] Using known brand fonts: {scraped_fonts}")
                        except Exception as e:
                            logger.warning(f"[FONT SELECTION] Failed to get brand fonts: {e}")
                
                # If we have scraped fonts, use them
                if scraped_fonts:
                    # Match scraped fonts to available fonts
                    all_available_fonts = RegistryFonts.get_all_fonts_list()
                    matched_fonts = []
                    
                    for font in scraped_fonts:
                        # Try exact match first
                        if font in all_available_fonts:
                            matched_fonts.append(font)
                        else:
                            # Try partial match
                            for available in all_available_fonts:
                                if font.lower() in available.lower() or available.lower() in font.lower():
                                    matched_fonts.append(available)
                                    break
                    
                    if matched_fonts:
                        logger.info(f"[FONT SELECTION] Matched brand fonts to available: {matched_fonts}")
                        if len(matched_fonts) >= 2:
                            return {"hero": matched_fonts[0], "body": matched_fonts[1]}
                        elif len(matched_fonts) == 1:
                            # Use the brand font as hero, pick a complementary body font
                            return {"hero": matched_fonts[0], "body": "Roboto" if matched_fonts[0] != "Roboto" else "Open Sans"}
                
                # Step 2: Get creative font pairings
                font_prompt = f"""
Choose a DISTINCTIVE, on-vibe font pairing for this {vibe} presentation about {title}.
{full_context}

Available fonts by category (installable):
{available_fonts_str}

🚨 BRAND PRIORITY:
- If this is a brand deck and brand fonts are known/scraped, USE those fonts (match to available list). Otherwise, pick creative fonts below.

🚫 AVOID OVERUSED / DEFAULT PAIRS:
- Do NOT use: Inter, Roboto+Roboto, Montserrat+Montserrat, Poppins+Poppins, Open Sans+Open Sans, Lato+Lato
- Do NOT repeat the same 3 pairings across decks. Prefer variety when context allows.

🎨 CREATIVE CATEGORIES (MIX BOLDLY):
- Editorial & Magazine: Bodoni Moda, Rozha One, Arvo, Tenor Sans
- Geometric & Neo-grotesque: Questrial, Dosis, Poiret One, Satoshi, Space Grotesk, Cabinet Grotesk
- Tech & Startup: IBM Plex (Sans/Mono), Oxanium, Tomorrow, Orbitron
- Luxury & Fashion: Cormorant (Garamond/Infant/SC), Italiana, Gilda Display
- Retro & Unique: Bungee (Inline/Hairline), Monoton, Fascinate, Audiowide, Press Start 2P
- Branding & Corporate: Prompt, Radio Canada, M PLUS, Noto Sans/Serif

PAIR BY DECK TYPE (GUIDANCE, NOT LIMITS):
- Investor/Startup: Display (Orbitron, Tomorrow) + Workhorse Sans (Satoshi, Space Grotesk)
- Corporate/Enterprise: Editorial Serif (Bodoni Moda) + Corporate Sans (Prompt, Radio Canada)
- Product/Tech Demo: Tech Display (Oxanium) + Geometric Sans (Questrial, Dosis)
- Luxury/Fashion: Elegant Serif (Cormorant, Italiana) + Refined Sans (Tenor Sans)
- Editorial/Magazine: Serif Display (Rozha One) + Contemporary Sans (Instrument Sans, Bricolage)
- Playful/Creative: Retro/Unique (Bungee, Monoton) + Friendly Sans (Nunito, Comfortaa)
- Scientific/Data: Editorial Serif (Faustina, Noticia) + Monospace (JetBrains Mono, Fira Code)

RULES:
1) Hero must make a statement (use display/serif/unique where appropriate).
2) Body must be highly readable and DIFFERENT from hero.
3) Respect topic vibe; be memorable without kitsch.
4) NEVER choose Inter. Prefer non-default, characterful fonts available in registry.

OUTPUT FORMAT (exactly):
Hero Font: [exact name from available list]
Body Font: [different exact name from available list]

Example:
Hero Font: Rozha One
Body Font: Space Grotesk
"""
            
                font_response = await self._async_invoke(
                client=client,
                model=model,
                messages=[{"role": "user", "content": font_prompt}],
                max_tokens=100,
                response_model=None
                )
                
                # Parse fonts
                all_available_fonts = RegistryFonts.get_all_fonts_list()
                fonts = self._parse_fonts_from_text_flexible(font_response, all_available_fonts)
                
                logger.info(f"[THEME PARALLEL] Task 2: Font selection complete - Hero: {fonts.get('hero')}, Body: {fonts.get('body')}")
                logger.warning(f"[FONT SELECTION] AI selected fonts - Hero: {fonts.get('hero')}, Body: {fonts.get('body')}")
                return fonts
            
            async def generate_design_task():
                """Generate design aesthetics in parallel"""
                logger.info("[THEME PARALLEL] Task 3: Starting design generation...")
                
                # If we have a brand, use brand-specific design
                if db_palette and db_palette.get('name') and 'Brand Colors' in db_palette.get('name', ''):
                    brand_name = db_palette['name'].replace(' Brand Colors', '')
                    logger.info(f"[THEME PARALLEL] Using brand design for: {brand_name}")
                    return {
                        'style': f'{brand_name} Brand Experience',
                        'philosophy': f'Professional, trustworthy {brand_name} brand presentation',
                        'image_prominence': 60,
                        'image_treatment': 'masked',
                        'effects': ['subtle-fade'],
                        'layout': 'structured',
                        'bg_style': 'gradient',
                        'gradients': 'subtle',
                        'shadows': 'subtle',
                        'emphasis': 'color',
                        'animations': 'subtle',
                        'shapes': 'minimal',
                        'white_space': 'balanced',
                        'hierarchy': 'clear',
                        'title_transform': 'none'
                    }
                
                # Step 3: Get specific design system
                design_prompt = f"""
Create a cohesive design system for this {vibe} presentation about {title}.
{full_context}

Based on the chosen colors and fonts, define:

1. **Visual Style** (choose one):
   - Minimalist: Clean, lots of white space, subtle
   - Maximalist: Bold, full, rich with visuals
   - Editorial: Magazine-style, asymmetric, sophisticated
   - Brutalist: Raw, bold, high contrast
   - Organic: Flowing, natural, soft edges
   - Geometric: Sharp, mathematical, structured

2. **Image Treatment**:
   - Prominence: 0-100% (how much of slides have images)
   - Style: Full-bleed, masked, framed, scattered
   - Effects: Ken-burns, parallax, fade, none

3. **Typography Scale**:
   - Hero titles: Size multiplier (1.5x-3x base)
   - Visual hierarchy strength (subtle/moderate/extreme)

4. **Emphasis Techniques**:
   - Primary: Size, color, position, or mixed
   - Animations: None, subtle, moderate, dramatic

5. **Layout Philosophy**:
   - Grid-based, asymmetric, centered, dynamic

6. **Special Effects**:
   - Gradients: None, subtle, bold
   - Shadows: None, subtle, dramatic
   - Shapes: Minimal, moderate, abundant

Provide specific recommendations that create a cohesive, memorable design system.
"""
            
                design_response = await self._async_invoke(
                client=client,
                model=model,
                messages=[{"role": "user", "content": design_prompt}],
                max_tokens=400,
                response_model=None
                )
                
                # Parse design elements
                design_elements = self._parse_design_response(design_response)
                
                logger.info("[THEME PARALLEL] Task 3: Design generation complete")
                return design_elements
            
            async def generate_search_terms_task():
                """Generate image search terms in parallel"""
                logger.info("[THEME PARALLEL] Task 4: Starting search terms generation...")
                
                # Step 4: Get image search terms
                image_prompt = f"""
Generate DECK-WIDE image search topics for a presentation.

Context:
- Title: {title}
- Vibe: {vibe}
- Content preview (first slides):
{first_slides}
{full_context}

SMART SEARCH STRATEGY:
- Identify 3–5 core visual subjects in the deck (nouns or concrete phrases)
- Add 2–3 recurring elements or objects that appear multiple times
- Add 1–2 mood/texture/pattern searches that match the deck's vibe
- TOTAL: 8–10 terms MAX

STRICT RULES:
- Use nouns and concrete phrases only (e.g., "ocean", "city skyline", "electric vehicle")
- 1–3 words per term; NO sentences
- Prefer brand or subject names when relevant (e.g., "Tesla", "iPhone")
- Avoid vague/abstract/generic words: introduction, agenda, overview, info, slide, content, idea, concept, power, inside, unlock, great, cool, amazing, things, stuff, technology (by itself), data (by itself)
- Avoid single colors unless a brand color is the subject
- Avoid verbs and adjectives-only terms
- Presentation-appropriate imagery only; no NSFW

OUTPUT FORMAT:
- Return ONLY the final terms, one per line
- No numbering, no bullets, no extra text

GOOD EXAMPLE (for "Nova Analytics: AI Business Intelligence"):
analytics
dashboard UI
business meeting
data center
line chart
neural network
dark geometric patterns
blue abstract gradient

GOOD EXAMPLE (for "Tesla Investor Presentation"):
Tesla
electric vehicle
gigafactory
battery pack
autonomous driving sensor
production line
sustainability icons
metallic texture

Now produce 8–10 deck-wide search terms, one per line:
"""
            
                image_response = await self._async_invoke(
                client=client,
                model=model,
                messages=[{"role": "user", "content": image_prompt}],
                max_tokens=150,
                response_model=None
                )
                
                # Parse search terms more carefully
                raw_terms = image_response.strip().split('\n')
                search_terms = []
                seen_lower = set()
                vague = {
                    'image', 'picture', 'photo', 'illustration', 'graphic', 'visual',
                    'slide', 'presentation', 'content', 'text', 'info', 'information',
                    'agenda', 'overview', 'introduction', 'intro', 'what', 'why', 'how', 'when',
                    'things', 'stuff', 'amazing', 'great', 'cool', 'power', 'inside', 'unlock',
                    'technology', 'data'
                }
                for line in raw_terms:
                    term = line.strip()
                    if not term:
                        continue
                    # Skip explanatory lines
                    lowered = term.lower()
                    if any(x in lowered for x in [
                        'here are', 'search terms', 'following', 'below', 'example', 'good example',
                        'output format', 'smart search strategy', 'context:', 'title:', 'vibe:',
                        'content preview', 'now produce'
                    ]):
                        continue
                    # Remove numbering/bullets/prefix punctuation and trim quotes
                    term = term.lstrip('0123456789.-*:• ').strip("'\"")
                    if not term or len(term) < 2:
                        continue
                    lower = term.lower().strip()
                    if lower in vague:
                        continue
                    if lower in seen_lower:
                        continue
                    # Clamp overly long entries
                    if len(term) > 50:
                        term = term[:50].rstrip()
                    search_terms.append(term)
                    seen_lower.add(lower)
            
                # Take up to 10 valid terms
                search_terms = search_terms[:10]
                
                # Debug logging
                logger.debug(f"[THEME IMAGE] Raw response: {image_response[:200]}...")
                logger.debug(f"[THEME IMAGE] Parsed search terms: {search_terms}")
                
                logger.info("[THEME PARALLEL] Task 4: Search terms generation complete")
                return search_terms
            
            # Execute all 4 tasks in parallel
            logger.info("[THEME PARALLEL] 🚀 Launching all 4 tasks in parallel...")
            
            # Create tasks to track individual completion
            tasks = [
                asyncio.create_task(generate_colors_task()),
                asyncio.create_task(generate_fonts_task()),
                asyncio.create_task(generate_design_task()),
                asyncio.create_task(generate_search_terms_task())
            ]
            
            # Track task completion for progress updates
            completed = 0
            task_names = ['Colors', 'Fonts', 'Design', 'Search Terms']
            
            async def track_completion():
                nonlocal completed
                for i, task in enumerate(tasks):
                    try:
                        await task
                        completed += 1
                        # Only send progress if task succeeded and callback exists
                        if progress_callback:
                            try:
                                result = task.result()
                                if not isinstance(result, Exception):
                                    # Calculate progress within theme generation phase (15-30%)
                                    sub_progress = 15 + (15 * completed / 4)
                                    await progress_callback({
                                        "type": "progress",
                                        "data": {
                                            "phase": "theme_generation",
                                            "progress": int(sub_progress),
                                            "message": f"{task_names[i]} ready",
                                            "substep": f"{task_names[i].lower().replace(' ', '_')}_complete"
                                        }
                                    })
                            except Exception as e:
                                logger.warning(f"Failed to send progress for {task_names[i]}: {e}")
                    except Exception as e:
                        logger.error(f"Task {task_names[i]} failed: {e}")
                        completed += 1  # Still count as completed even if failed
            
            # Start completion tracking
            tracking_task = asyncio.create_task(track_completion())
            
            # Wait for all tasks
            results = await asyncio.gather(*tasks, return_exceptions=True)
            colors_result, fonts_result, design_result, search_terms_result = results
            
            # Log completion time
            parallel_end = asyncio.get_event_loop().time()
            elapsed = parallel_end - parallel_start
            logger.info(f"[THEME PARALLEL] ✅ All tasks completed in {elapsed:.2f} seconds")
            
            # Handle any failures
            if isinstance(colors_result, Exception):
                logger.error(f"Color generation failed: {colors_result}")
                colors_result = self._parse_colors_from_text("")
            
            if isinstance(fonts_result, Exception):
                logger.error(f"Font selection failed: {fonts_result}")
                fonts_result = {"hero": "Bebas Neue", "body": "Inter"}
            
            if isinstance(design_result, Exception):
                logger.error(f"Design generation failed: {design_result}")
                design_result = {"style": "Modern Bold", "philosophy": "Clean and professional"}
            
            if isinstance(search_terms_result, Exception):
                logger.error(f"Search terms generation failed: {search_terms_result}")
                search_terms_result = []
            
            # Build comprehensive theme from parallel results
            colors = colors_result
            fonts = fonts_result
            design_elements = design_result
            search_terms = search_terms_result
            
            # If we have a database palette, use its colors instead of AI-generated ones
            if db_palette and db_palette.get('colors'):
                logger.info(f"[THEME] Using database palette colors instead of AI colors")
                palette_colors = db_palette['colors']
                # Map palette colors to theme colors
                primary_bg = db_palette.get('primary_background') or palette_colors[0] if palette_colors else colors.get('primary_bg', '#FFFFFF')
                secondary_bg = db_palette.get('secondary_background') or (palette_colors[1] if len(palette_colors) > 1 else primary_bg)
                accent_1 = db_palette.get('accent_1') or palette_colors[0] if palette_colors else colors.get('accent_1', '#0066CC')
                accent_2 = db_palette.get('accent_2') or (palette_colors[1] if len(palette_colors) > 1 else accent_1)
                accent_3 = palette_colors[2] if len(palette_colors) > 2 else accent_1
                
                # Ensure we don't use white as primary background
                if primary_bg.upper() in ['#FFFFFF', '#FFF']:
                    primary_bg = palette_colors[1] if len(palette_colors) > 1 and palette_colors[1].upper() not in ['#FFFFFF', '#FFF'] else '#004B91'
                if secondary_bg.upper() in ['#FFFFFF', '#FFF']:
                    secondary_bg = primary_bg
                    
                logger.info(f"[THEME] Palette colors override - BG: {primary_bg}, Accent1: {accent_1}, Accent2: {accent_2}")
            else:
                # Use AI-generated colors
                primary_bg = colors.get('primary_bg', '#FFFFFF')
                secondary_bg = colors.get('secondary_bg', '#F8F9FA')
                accent_1 = colors.get('accent_1', '#0066CC')
                accent_2 = colors.get('accent_2', '#FF6B6B')
            
            # Also check for fonts in db_palette metadata
            if db_palette and db_palette.get('metadata', {}).get('fonts'):
                db_fonts = db_palette['metadata']['fonts']
                logger.info(f"[THEME] Using database palette fonts: {db_fonts}")
                if len(db_fonts) >= 2:
                    fonts = {"hero": db_fonts[0], "body": db_fonts[1]}
                elif len(db_fonts) == 1:
                    fonts = {"hero": db_fonts[0], "body": db_fonts[0]}
                logger.info(f"[THEME] Palette fonts override - Hero: {fonts.get('hero')}, Body: {fonts.get('body')}")
            
            # Tag source in color_palette for downstream precedence logic
            theme = {
                'theme_name': design_elements.get('style', 'Modern Bold'),
                'design_philosophy': design_elements.get('philosophy', 'Make every slide unforgettable'),
                'color_palette': {
                    'primary_background': primary_bg,
                    'secondary_background': secondary_bg,
                    'primary_text': colors.get('text', '#1A1A1A'),
                    'secondary_text': colors.get('secondary_text', '#666666'),
                    'accent_1': accent_1,
                    'accent_2': accent_2,
                    'accent_3': accent_3 if db_palette else colors.get('accent_3', '#00AA55'),
                    'shape_color': colors.get('shape_color', accent_1 + '20'),
                    'should_use_huemint': False,  # Always use AI model for colors
                    'source': ('palette_db' if db_palette else 'ai_model')
                },
                'typography': {
                    'hero_title': {
                        'family': fonts.get('hero', 'Montserrat'),
                        'size': 240,
                        'weight': '900',
                        'letter_spacing': -0.03,
                        'text_transform': design_elements.get('title_transform', 'none')
                    },
                    'section_title': {
                        'family': fonts.get('hero', 'Montserrat'),
                        'size': 144,
                        'weight': '700',
                        'letter_spacing': -0.02
                    },
                    'body_text': {
                        'family': fonts.get('body', 'Poppins'),  # Changed default from Inter
                        'size': 36,
                        'weight': '400',
                        'line_height': 1.6
                    },
                    'caption': {
                        'family': fonts.get('body', 'Poppins'),  # Changed default from Inter
                        'size': 24,
                        'weight': '400',
                        'style': 'italic'
                    }
                },
                'visual_style': {
                    'style_name': design_elements.get('style', 'Minimalist'),
                    'image_prominence': design_elements.get('image_prominence', 80),
                    'image_treatment': design_elements.get('image_treatment', 'full-bleed'),
                    'image_effects': design_elements.get('effects', ['ken-burns']),
                    'layout_approach': design_elements.get('layout', 'asymmetric'),
                    'background_style': design_elements.get('bg_style', 'solid-color'),
                    'use_gradients': design_elements.get('gradients', 'subtle'),
                    'shadow_style': design_elements.get('shadows', 'subtle')
                },
                'design_rules': {
                    'emphasis_primary': design_elements.get('emphasis', 'size'),
                    'emphasis_secondary': 'color',
                    'animation_level': design_elements.get('animations', 'subtle'),
                    'shape_usage': design_elements.get('shapes', 'minimal'),
                    'white_space': design_elements.get('white_space', 'generous'),
                    'visual_hierarchy': design_elements.get('hierarchy', 'extreme'),
                    'chart_theme_mode': 'light' if self._get_brightness(colors.get('primary_bg', '#FFFFFF')) > 0.5 else 'dark'
                },
                'background_variations': self._generate_background_variations(colors, vibe),
                'slide_templates': self._generate_slide_templates(vibe, design_elements)
            }
            
            style_spec = {
                "design_approach": vibe.upper(),
                "color_palette": {
                    "primary_bg": colors.get("primary_bg", "#FFFFFF"),
                    "accent_1": colors.get("accent_1", "#0066CC"),
                    "accent_2": colors.get("accent_2", "#FF6B6B"),
                    "primary_text": colors.get("text", "#1A1A1A"),
                    "overlay": {"color": "#000000", "opacity": 0.15}
                },
                "typography": {
                    "hero_title": {"family": fonts.get("hero", "Montserrat"), "size": 96, "weight": "800"},
                    "section_title": {"family": fonts.get("hero", "Montserrat"), "size": 64, "weight": "700"},
                    "body_text": {"family": fonts.get("body", "Inter"), "size": 36, "weight": "500"}
                },
                "images": {
                    "prominence": 0.7,
                    "effects": ["ken-burns"],
                    "layout": ["full-bleed"]
                }
            }
            
            # Normalize theme structure
            theme = self._normalize_theme_structure(theme)
            
            # Log the final color palette
            logger.info(f"\n[THEME COMPLETE] 🎨 Generated color palette:")
            logger.info(f"  Primary Background: {theme['color_palette']['primary_background']}")
            logger.info(f"  Secondary Background: {theme['color_palette']['secondary_background']}")
            logger.info(f"  Primary Text: {theme['color_palette']['primary_text']}")
            logger.info(f"  Accent 1: {theme['color_palette']['accent_1']}")
            logger.info(f"  Accent 2: {theme['color_palette']['accent_2']}")
            logger.info(f"  Accent 3: {theme['color_palette']['accent_3']}")
            # Clarify actual source based on pipeline choice
            source = "palette_db" if db_palette else "ai_model"
            logger.info(f"  Color source: {source}")
            
            # Verify no default colors are present
            if theme['color_palette']['accent_2'] == '#06FFA5':
                logger.error("🚨 [THEME COMPLETE] ERROR: Default color #06FFA5 detected! AI failed to generate unique colors!")
            if theme['color_palette']['accent_2'] == '#10B981':
                logger.error("🚨 [THEME COMPLETE] ERROR: Default color #10B981 detected! AI failed to generate unique colors!")
                
            logger.info("")
            
            # Add logo URL from palette metadata if available
            if db_palette and db_palette.get('metadata', {}).get('logo_url'):
                theme['logo_url'] = db_palette['metadata']['logo_url']
                logger.info(f"[THEME COMPLETE] 🖼️ Logo URL: {theme['logo_url']}")
            
            return {
                'theme': theme,
                'style_spec': style_spec,
                'search_terms': search_terms
            }
            
        except Exception as e:
            logger.error(f"Simple theme analysis failed: {e}")
            # Return minimal defaults as last resort
            return self._get_default_theme()
    
    def _parse_colors_from_text(self, text: str) -> Dict[str, str]:
        """Extract hex colors from text response."""
        colors = {}
        lines = text.strip().split('\n')
        
        for line in lines:
            if '#' in line:
                # Extract hex color
                import re
                hex_match = re.search(r'#[0-9A-Fa-f]{6}', line)
                if hex_match:
                    hex_color = hex_match.group()
                    if 'primary background' in line.lower():
                        colors['primary_bg'] = hex_color
                    elif 'secondary background' in line.lower():
                        colors['secondary_bg'] = hex_color
                    elif 'accent 1' in line.lower():
                        colors['accent_1'] = hex_color
                    elif 'accent 2' in line.lower():
                        colors['accent_2'] = hex_color
                    elif 'accent 3' in line.lower():
                        colors['accent_3'] = hex_color
                    elif 'shape color' in line.lower():
                        colors['shape_color'] = hex_color
                    elif 'primary text' in line.lower():
                        colors['text'] = hex_color
                    elif 'secondary text' in line.lower():
                        colors['secondary_text'] = hex_color
        
        # Log what we parsed
        logger.warning(f"[COLOR PARSING] Parsed colors from response: {colors}")
        logger.warning(f"[COLOR PARSING] Raw response text: {text[:500]}...")
        
        # Check if we got enough colors from AI
        if not colors.get('primary_bg') or not colors.get('accent_1') or not colors.get('accent_2'):
            logger.error(f"[COLOR PARSING] CRITICAL: AI did not provide required colors!")
            logger.error(f"[COLOR PARSING] Retrying with stricter prompt...")
            # Return None to trigger a retry
            return None
        
        # Use ONLY parsed colors - no defaults!
        result = {
            'primary_bg': colors.get('primary_bg'),
            'secondary_bg': colors.get('secondary_bg', colors.get('primary_bg')),  # Use primary if no secondary
            'accent_1': colors.get('accent_1'),
            'accent_2': colors.get('accent_2'),
            'accent_3': colors.get('accent_3', colors.get('accent_2')),  # Use accent_2 if no accent_3
            'shape_color': colors.get('shape_color', colors.get('accent_1') + '20' if colors.get('accent_1') else None),
            'text': colors.get('text', '#1F2937')  # Text needs a default for readability
        }
        
        # If we successfully parsed accent colors, ensure shape_color matches
        if 'accent_1' in colors and 'shape_color' not in colors:
            result['shape_color'] = colors['accent_1'] + '20'
        
        # Count how many colors we successfully parsed
        parsed_count = len([k for k in colors.keys() if k in ['primary_bg', 'secondary_bg', 'accent_1', 'accent_2', 'accent_3', 'text']])
        
        if parsed_count < 4:
            logger.error(f"[COLOR PARSING] Only parsed {parsed_count} colors from AI response. AI may not be following format correctly.")
            logger.error(f"[COLOR PARSING] Expected format example: 'Primary Background: #FFFFFF'")
        
        logger.warning(f"[COLOR PARSING] Final colors being returned: {result}")
        
        return result
    
    def _parse_font_response(self, response: str) -> Dict[str, str]:
        """Parse font selections from response text"""
        fonts = {}
        
        # Try to extract fonts from structured response first
        lines = response.strip().split('\n')
        for line in lines:
            line_lower = line.lower()
            
            # Hero/Title font
            if 'hero' in line_lower or 'title' in line_lower:
                # Look for font name after colon
                if ':' in line:
                    font_part = line.split(':', 1)[1].strip()
                    # Extract font name (stop at comma or parenthesis)
                    font_name = font_part.split(',')[0].split('(')[0].strip()
                    if font_name and font_name != 'No font':
                        fonts['hero'] = font_name
            
            # Body/Content font
            elif 'body' in line_lower or 'content' in line_lower:
                if ':' in line:
                    font_part = line.split(':', 1)[1].strip()
                    font_name = font_part.split(',')[0].split('(')[0].strip()
                    if font_name and font_name != 'No font':
                        fonts['body'] = font_name
        
        # Defaults if not found
        if 'hero' not in fonts:
            fonts['hero'] = 'Montserrat'  # Default hero font
        if 'body' not in fonts:
            fonts['body'] = 'Poppins'  # Default body font - changed from Inter
            
        return fonts
    
    def _parse_fonts_from_text(self, text: str) -> Dict[str, str]:
        """Extract font names from text response."""
        fonts = {}
        lines = text.strip().split('\n')
        
        # List of available fonts to match against
        available = [
            'Montserrat', 'Poppins', 'Roboto', 'Open Sans', 'Raleway',
            'Bebas Neue', 'Oswald', 'Anton', 'Archivo Black',
            'Fredoka', 'Pacifico', 'Comfortaa', 'Bungee', 'Lobster',
            'Playfair Display', 'Merriweather', 'Crimson Text',
            'IBM Plex Sans', 'Oxanium', 'Tomorrow', 'Questrial', 'Dosis'
        ]
        
        for line in lines:
            line_lower = line.lower()
            for font in available:
                if font.lower() in line_lower:
                    if 'hero' in line_lower or 'title' in line_lower:
                        fonts['hero'] = font
                    elif 'body' in line_lower:
                        fonts['body'] = font
                    break
        
        # Defaults
        return {
            'hero': fonts.get('hero', 'Montserrat'),
            'body': fonts.get('body', 'Poppins')
        }
    
    def _parse_fonts_from_text_flexible(self, text: str, available_fonts: List[str]) -> Dict[str, str]:
        """Extract font names from text response, using a flexible list of available fonts."""
        fonts = {}
        lines = text.strip().split('\n')
        
        logger.info(f"Parsing font response: {text[:200]}...")
        logger.info(f"Available fonts: {available_fonts[:10]}... (total: {len(available_fonts)})")
        
        for line in lines:
            line_lower = line.lower()
            # Check each available font
            for font in available_fonts:
                # Skip Inter - we don't want it!
                if font.lower() == 'inter':
                    continue
                # More flexible matching - check if font name appears anywhere in line
                if font.lower() in line_lower:
                    if ('hero' in line_lower or 'title' in line_lower or 'heading' in line_lower) and 'hero' not in fonts:
                        fonts['hero'] = font
                        logger.info(f"Found hero font: {font}")
                    elif ('body' in line_lower or 'text' in line_lower or 'content' in line_lower) and 'body' not in fonts:
                        fonts['body'] = font
                        logger.info(f"Found body font: {font}")
                    
                    # If we have both fonts, we're done
                    if 'hero' in fonts and 'body' in fonts:
                        break
        
        # Smart defaults based on available fonts - PRIORITIZE NEW CATEGORIES!
        if 'hero' not in fonts:
            # Choose from NEW categories first!
            hero_candidates = [
                # Editorial & Magazine
                'Rozha One', 'Bodoni Moda', 'Arvo',
                # Tech & Startup
                'IBM Plex Sans', 'Oxanium', 'Tomorrow',
                # Luxury
                'Tenor Sans', 'Italiana', 'Gilda Display',
                # Retro
                'Press Start 2P', 'Bungee', 'Monoton',
                # Geometric
                'Questrial', 'Dosis', 'Poiret One',
                # Modern
                'Satoshi', 'Cabinet Grotesk', 'Clash Display',
                # Designer group
                'Baloo 2', 'Eudoxus Sans', 'Gloock', 'Prata', 'Staatliches',
                # Then fallback to common ones
                'Bebas Neue', 'Anton', 'Montserrat'
            ]
            for candidate in hero_candidates:
                if candidate in available_fonts and candidate.lower() != 'inter':
                    fonts['hero'] = candidate
                    logger.info(f"Using {candidate} as default hero font from new categories!")
                    break
            
            # Fallback if none found
            if 'hero' not in fonts:
                # Find first non-Inter font
                for font in available_fonts:
                    if font.lower() != 'inter':
                        fonts['hero'] = font
                        break
                else:
                    fonts['hero'] = 'Montserrat'
                logger.warning(f"Using fallback hero font: {fonts['hero']}")
        
        if 'body' not in fonts:
            # Choose from NEW categories for body too!
            body_candidates = [
                # Branding & Corporate
                'Prompt', 'Radio Canada', 'M PLUS 1p',
                # Contemporary
                'Instrument Sans', 'Bricolage Grotesque', 'Familjen Grotesk',
                # Editorial (for serif options)
                'Faustina', 'Noticia Text', 'Spectral',
                # Tech & Startup
                'IBM Plex Sans', 'Share Tech',
                # Geometric
                'Questrial', 'Didact Gothic',
                # Designer group
                'Baloo 2', 'Eudoxus Sans', 'Gloock', 'Prata', 'Staatliches',
                # Then traditional choices
                'Poppins', 'Source Sans Pro', 'Work Sans'
            ]
            for candidate in body_candidates:
                if candidate in available_fonts and candidate != fonts.get('hero') and candidate.lower() != 'inter':  # Don't use same font or Inter
                    fonts['body'] = candidate
                    logger.info(f"Using {candidate} as body font from new categories!")
                    break
            
            # Fallback if none found
            if 'body' not in fonts:
                # Try to find a different font than hero
                for font in available_fonts:
                    if font != fonts.get('hero') and font.lower() != 'inter':
                        fonts['body'] = font
                        logger.warning(f"Using fallback body font: {font}")
                        break
                else:
                    fonts['body'] = 'Poppins'
                    logger.warning("Using Poppins as last resort body font")
        
        logger.info(f"Final font selection: Hero='{fonts.get('hero')}', Body='{fonts.get('body')}'")
        return fonts
    
    def _get_brightness(self, hex_color: str) -> float:
        """Calculate brightness of a hex color (0 = dark, 1 = light)."""
        try:
            # Remove # if present
            hex_color = hex_color.lstrip('#')
            # Convert to RGB
            r = int(hex_color[0:2], 16) / 255.0
            g = int(hex_color[2:4], 16) / 255.0
            b = int(hex_color[4:6], 16) / 255.0
            # Calculate perceived brightness
            return (0.299 * r + 0.587 * g + 0.114 * b)
        except:
            return 0.5  # Default to medium brightness
    
    def _adjust_brightness(self, hex_color: str, factor: float) -> str:
        """Adjust brightness of a hex color."""
        try:
            # Remove # if present
            hex_color = hex_color.lstrip('#')
            
            # Convert to RGB
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            
            # Adjust brightness
            r = min(255, max(0, int(r * factor)))
            g = min(255, max(0, int(g * factor)))
            b = min(255, max(0, int(b * factor)))
            
            # Convert back to hex
            return f"#{r:02x}{g:02x}{b:02x}"
        except:
            return f"#{hex_color}" if not hex_color.startswith('#') else hex_color
    
    def _get_default_theme(self) -> Dict[str, Any]:
        """Return minimal default theme as last resort."""
        default_colors = {
            'primary_bg': '#FFFFFF',
            'secondary_bg': '#F8F9FA',
            'accent_1': '#0066CC',
            'accent_2': '#FF6B6B',
            'accent_3': '#00AA55',
            'text': '#1A1A1A'
        }
        
        return {
            'theme': {
                'theme_name': 'Default Theme',
                'color_palette': {
                    'primary_background': default_colors['primary_bg'],
                    'secondary_background': default_colors['secondary_bg'],
                    'primary_text': default_colors['text'],
                    'secondary_text': '#666666',
                    'accent_1': default_colors['accent_1'],
                    'accent_2': default_colors['accent_2'],
                    'accent_3': default_colors['accent_3'],
                    'should_use_huemint': False
                },
                'typography': {
                    'hero_title': {'family': 'Montserrat', 'size': 180, 'weight': '800', 'letter_spacing': -0.02},
                    'section_title': {'family': 'Montserrat', 'size': 120, 'weight': '700', 'letter_spacing': -0.01},
                    'body_text': {'family': 'Poppins', 'size': 56, 'weight': '500', 'line_height': 1.5},
                    'caption': {'family': 'Poppins', 'size': 36, 'weight': '400'}
                },
                'visual_style': {
                    'image_prominence': 70,
                    'image_effects': ['ken-burns'],
                    'layout_patterns': ['full-bleed', 'split-screen'],
                    'background_style': 'solid-color'
                },
                'background_variations': self._generate_background_variations(default_colors, 'professional'),
                'slide_templates': self._generate_slide_templates('professional', {}),
                'design_rules': {
                    'use_shapes': 'minimal',
                    'use_gradients': 'subtle',
                    'animation_level': 'subtle',
                    'overall_sophistication': 'professional',
                    'chart_theme_mode': 'light'
                }
            },
            'style_spec': {
                'design_approach': 'PROFESSIONAL',
                'color_palette': {
                    'primary_bg': '#FFFFFF',
                    'accent_1': '#0066CC',
                    'accent_2': '#FF6B6B',
                    'primary_text': '#1A1A1A',
                    'overlay': {'color': '#000000', 'opacity': 0.15}
                },
                'typography': {
                    'hero_title': {'family': 'Montserrat', 'size': 180, 'weight': '800'},
                    'section_title': {'family': 'Montserrat', 'size': 120, 'weight': '700'},
                    'body_text': {'family': 'Poppins', 'size': 56, 'weight': '500'}
                },
                'images': {
                    'prominence': 0.7,
                    'effects': ['ken-burns'],
                    'layout': ['full-bleed']
                }
            },
            'image_searches': {
                'deck_wide': {
                    'selected_searches': []
                }
            }
        }
    
    async def generate_palette(self, deck_outline: DeckOutline, theme: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Generate color palette based on theme recommendations."""
        
        # Determine if we should enforce clean light/dark backgrounds for business/education
        title_text = (deck_outline.title or "")
        vibe_text = (deck_outline.stylePreferences.vibeContext if deck_outline.stylePreferences else "")
        topic_text = f"{title_text} {vibe_text}".lower()
        is_business_topic = any(k in topic_text for k in [
            'business', 'corporate', 'company', 'enterprise', 'professional', 'strategy', 'finance', 'sales', 'marketing'
        ])
        is_educational_topic = any(k in topic_text for k in [
            'educat', 'teach', 'learn', 'school', 'student', 'lecture', 'course', 'training', 'classroom'
        ])
        # Previously we enforced clean light/dark backgrounds for business/education decks,
        # which led to repetitive, same-looking outputs. Disable this behavior to preserve
        # variety from the palette/selector unless a strict flag is introduced later.
        enforce_clean_bg = False
        prefer_dark_bg = False
        try:
            cp = theme.get('color_palette', {}) if isinstance(theme, dict) else {}
            current_bg = cp.get('primary_background') or cp.get('primary_bg')
            if isinstance(current_bg, str):
                prefer_dark_bg = self._get_brightness(current_bg) < 0.5
        except Exception:
            prefer_dark_bg = False

        # FIRST PRIORITY: Check for user-provided brand colors
        if deck_outline.stylePreferences and hasattr(deck_outline.stylePreferences, 'colorPreference'):
            color_pref = deck_outline.stylePreferences.colorPreference
            if isinstance(color_pref, dict) and color_pref.get('type') == 'brand' and color_pref.get('brandColors'):
                brand_colors = color_pref['brandColors']
                logger.info(f"[PALETTE] 🎨 PRIORITY: Using {len(brand_colors)} brand colors from user")
                logger.info(f"[PALETTE] Brand colors: {brand_colors}")
                
                # Build palette from brand colors
                # Enforce exactly 4 colors for brand palettes
                palette_colors = list(brand_colors[:4])
                while len(palette_colors) < 4:
                    # Add neutral colors to reach 4 (avoid pure white by default)
                    if len(palette_colors) == 0:
                        palette_colors.append('#F7F9FC')
                    elif len(palette_colors) == 1:
                        palette_colors.append('#F0F4F8')
                    elif len(palette_colors) == 2:
                        palette_colors.append('#1A1A1A')
                    elif len(palette_colors) == 3:
                        palette_colors.append('#666666')
                
                palette = {
                    "name": "Brand Guidelines Palette",
                    "colors": palette_colors,
                    "source": "brand_guidelines",
                    "description": "User-provided brand colors",
                    "tags": ["brand", "custom"]
                }
                
                logger.info(f"[PALETTE] ✅ Returning brand palette: {palette['colors']}")
                return palette
        
        # SECOND PRIORITY: Check if this is a known brand/entity that needs authentic colors
        title = deck_outline.title
        vibe = deck_outline.stylePreferences.vibeContext if deck_outline.stylePreferences else ""
        
        # Check if it's a known brand that should NOT use database palettes
        is_known_brand = self._has_specific_brand_colors(title, vibe, "")
        
        if is_known_brand:
            logger.info(f"[PALETTE] 🎨 KNOWN BRAND DETECTED: {title}")
            logger.info(f"[PALETTE] Will check brand colors database and scrape website")
            
            # Use dynamic tools to acquire brand data (colors, fonts, logos)
            from agents.tools.theme import WebColorScraper
            from agents.tools.theme.brand_color_tools import BrandColorSearcher
            brand_name = self._extract_brand_name(title, vibe)
            if brand_name:
                colors: List[str] = []
                fonts: List[str] = []
                logo_url: Optional[str] = None

                try:
                    # 1) Brand color search (AI + web)
                    searcher = BrandColorSearcher()
                    logger.info(f"[PALETTE] 🔎 Searching brand data for {brand_name}...")
                    search_result = await searcher.search_brand_colors(brand_name)
                    if search_result.get('colors'):
                        colors = search_result['colors'][:6]
                        logger.info(f"[PALETTE] 🎨 BrandColorSearcher colors: {colors}")
                    if search_result.get('fonts'):
                        fonts = search_result['fonts'][:6]
                        logger.info(f"[PALETTE] 📝 BrandColorSearcher fonts: {fonts}")
                    if search_result.get('logo_url'):
                        logo_url = search_result.get('logo_url')
                        logger.info(f"[PALETTE] 🖼️ BrandColorSearcher logo: {logo_url}")

                    # 2) Web scraper for website-derived colors/fonts/logo
                    logger.info(f"[PALETTE] 🌐 Scraping website for {brand_name} (auto-discovery)...")
                    scraper = WebColorScraper()
                    try:
                        scraper_result = await scraper.scrape_brand_website(brand_name)
                    finally:
                        try:
                            await scraper.close()
                        except Exception:
                            pass
                    if scraper_result.get('fonts') and not fonts:
                        fonts = scraper_result['fonts']
                        logger.info(f"[PALETTE] 📝 Web scrape fonts: {fonts}")
                    if not colors and scraper_result.get('colors'):
                        colors = scraper_result['colors'][:6]
                        logger.info(f"[PALETTE] 🎨 Web scrape colors: {colors}")
                    if not logo_url and scraper_result.get('url'):
                        # Try extracting a logo from the discovered site
                        extracted_logo = self._extract_logo_from_website(brand_name, scraper_result.get('url'))
                        if extracted_logo:
                            logo_url = extracted_logo
                            logger.info(f"[PALETTE] 🖼️ Extracted logo from site: {logo_url}")
                except Exception as e:
                    logger.warning(f"[PALETTE] Brand data acquisition failed: {e}")
                
                if colors:
                    logger.info(f"[PALETTE] ✅ Found brand colors for {brand_name}: {colors}")
                    
                    # If no fonts found yet, attempt to match any discovered names to available fonts
                    if fonts:
                        try:
                            from services.registry_fonts import RegistryFonts
                            all_available_fonts = RegistryFonts.get_all_fonts_list()
                            matched_fonts: List[str] = []
                            for f in fonts:
                                if f in all_available_fonts:
                                    matched_fonts.append(f)
                                else:
                                    for av in all_available_fonts:
                                        if f.lower() in av.lower() or av.lower() in f.lower():
                                            matched_fonts.append(av)
                                            break
                            if matched_fonts:
                                fonts = matched_fonts[:2]
                                logger.info(f"[PALETTE] 📝 Matched fonts to registry: {fonts}")
                        except Exception:
                            pass
                    
                    # Format as palette
                    colors = colors[:4] if colors else ['#000000', '#FFFFFF']
                    while len(colors) < 4:
                        colors.append('#FFFFFF' if len(colors) % 2 == 0 else '#000000')
                    
                    palette = {
                        "name": f"{brand_name} Brand Colors",
                        "colors": colors,
                        "source": "brand_tools",
                    }
                    
                    # Always add metadata for known brands
                    palette['metadata'] = {}
                    if fonts:
                        palette['metadata']['fonts'] = fonts
                        logger.info(f"[PALETTE] 📝 Added fonts to metadata: {fonts}")
                    if logo_url:
                        palette['metadata']['logo_url'] = logo_url
                    
                    return palette
        
        # THIRD PRIORITY: Choose source: DB palette by default unless user explicitly selects style/color/brand topics
        title_lower = (deck_outline.title or '').lower()
        style_pref = (deck_outline.stylePreferences.visualStyle if deck_outline.stylePreferences and hasattr(deck_outline.stylePreferences, 'visualStyle') else '')
        force_ai = False
        # If user explicitly selected a style-heavy request or the topic is about colors/brand/character, prefer AI colors
        keywords_force_ai = ['brand', 'character', 'color', 'palette', 'branding', 'style guide', 'identity']
        if any(k in title_lower for k in keywords_force_ai) or (style_pref and style_pref.lower() not in ['default', '']):
            force_ai = True
            logger.info("[PALETTE] Forcing AI colors due to style/brand/color-driven topic or explicit style preference")

        if not force_ai:
            # Try to get a palette from the database for generic topics
            logger.info(f"[PALETTE] 🔍 PRIORITY: Searching database for: {deck_outline.title}")
        
        # Build style preferences dict for palette search
        style_prefs = {}
        if deck_outline.stylePreferences:
            if hasattr(deck_outline.stylePreferences, 'vibeContext'):
                style_prefs['vibeContext'] = deck_outline.stylePreferences.vibeContext
            if hasattr(deck_outline.stylePreferences, 'visualStyle'):
                style_prefs['visualStyle'] = deck_outline.stylePreferences.visualStyle
        
        # Add specific handling for business topics to ensure variety
        search_query = deck_outline.title
        if any(word in deck_outline.title.lower() for word in ['business', 'corporate', 'company', 'enterprise', 'professional']):
            # Add variety keywords for business topics
            variety_keywords = ['modern', 'innovative', 'creative', 'bold', 'dynamic']
            import random
            search_query = f"{deck_outline.title} {random.choice(variety_keywords)}"
            logger.info(f"[PALETTE] 🎨 Business topic detected - adding variety with query: {search_query}")
        
        # Search for palette candidates in database with enhanced query
        selected_palette = None
        palette_candidates = []
        if not force_ai:
            try:
                palette_candidates = self.palette_db_service.get_palette_candidates_for_topic(
                    topic=search_query,
                    style_preferences=style_prefs,
                    max_candidates=5
                ) or []
            except Exception as _candidates_err:
                logger.warning(f"[PALETTE] Candidate retrieval failed: {_candidates_err}")
                palette_candidates = []

            # Choose one from candidates with a slight warmth preference to avoid cold corporate blue monotony
            if palette_candidates:
                try:
                    import random as _rand
                    # Simple weighted pick: earlier (more similar) get higher base weight, add small random
                    n = len(palette_candidates)
                    base_weights = [2 ** (n - i - 1) for i in range(n)]
                    # Nudge toward candidates that include warm hues
                    def _hex_to_hsl(_hex: str):
                        try:
                            s = _hex.lstrip('#')
                            r = int(s[0:2], 16) / 255.0
                            g = int(s[2:4], 16) / 255.0
                            b = int(s[4:6], 16) / 255.0
                            mx = max(r, g, b); mn = min(r, g, b)
                            l = (mx + mn) / 2.0
                            if mx == mn:
                                return (0.0, 0.0, l)
                            d = mx - mn
                            sat = d / (2.0 - mx - mn) if l > 0.5 else d / (mx + mn)
                            if mx == r:
                                h = (g - b) / d + (6 if g < b else 0)
                            elif mx == g:
                                h = (b - r) / d + 2
                            else:
                                h = (r - g) / d + 4
                            return ((h * 60.0) % 360.0, sat, l)
                        except Exception:
                            return (0.0, 0.0, 0.5)
                    def _warmth(_cols: List[str]) -> float:
                        if not _cols:
                            return 0.0
                        s = 0.0
                        for c in _cols:
                            if not isinstance(c, str) or len(c) < 7:
                                continue
                            h, sat, _ = _hex_to_hsl(c)
                            w = 0.0
                            if 0 <= h < 60:
                                w = 1.0
                            elif 320 <= h < 360:
                                w = 0.7
                            elif 60 <= h < 90:
                                w = 0.3
                            s += w * max(0.25, min(1.0, sat))
                        return min(1.0, s / max(1, len(_cols)))
                    warmth_weights = [1.0 + 0.5 * _warmth(p.get('colors') or []) for p in palette_candidates]
                    weights = [bw * ww for bw, ww in zip(base_weights, warmth_weights)]
                    selected_palette = _rand.choices(palette_candidates, weights=weights, k=1)[0]
                except Exception:
                    selected_palette = palette_candidates[0]

        if not force_ai and selected_palette:
            db_palette = selected_palette
            logger.info(f"[PALETTE] ✅ Selected palette from {len(palette_candidates)} candidates: {db_palette.get('name')}")
            logger.info(f"[PALETTE] Using colors: {db_palette.get('colors')}")

            # Format the palette for our system, enforce 4 colors
            db_colors = (db_palette.get('colors') or [])
            db_colors = db_colors[:4]
            while len(db_colors) < 4:
                db_colors.append('#FFFFFF' if len(db_colors) == 0 else ('#F0F4F8' if len(db_colors) == 1 else ('#1A1A1A' if len(db_colors) == 2 else '#666666')))
            palette_out = {
                "name": db_palette.get('name', 'Database Palette'),
                "colors": db_colors,
                "source": "database",
                "description": db_palette.get('description', ''),
                "tags": db_palette.get('tags', []),
                # Attach candidates (name + colors) for UI/analytics
                "candidates": [
                    {
                        "name": p.get('name'),
                        "colors": (p.get('colors') or [])[:4]
                    } for p in (palette_candidates or [])
                ]
            }
            # Enforce or derive backgrounds similarly to previous logic
            if enforce_clean_bg:
                try:
                    import random
                except Exception:
                    pass
                use_dark = False
                try:
                    use_dark = (random.random() < 0.5)
                except Exception:
                    use_dark = prefer_dark_bg
                if use_dark:
                    primary_bg_enf = '#0A0A0A'
                    secondary_bg_enf = '#121212'
                    primary_text_enf = '#FFFFFF'
                    secondary_text_enf = '#E0E0E0'
                else:
                    primary_bg_enf = '#F5F7FA'
                    secondary_bg_enf = '#FFFFFF'
                    primary_text_enf = '#1A1A1A'
                    secondary_text_enf = '#333333'
                palette_out["backgrounds"] = [primary_bg_enf, secondary_bg_enf]
                on_acc1 = self.contrast_manager.get_readable_text_color(db_colors[0], db_colors)['recommended'] if db_colors else '#FFFFFF'
                on_acc2 = self.contrast_manager.get_readable_text_color(db_colors[1], db_colors)['recommended'] if len(db_colors) > 1 else '#FFFFFF'
                palette_out["text_colors"] = {
                    "primary": primary_text_enf,
                    "secondary": secondary_text_enf,
                    "on_accent_1": on_acc1,
                    "on_accent_2": on_acc2
                }
            else:
                try:
                    try:
                        import random
                    except Exception:
                        pass
                    sorted_light = sorted(db_colors, key=lambda c: self._get_brightness(c), reverse=True)
                    sorted_dark = sorted(db_colors, key=lambda c: self._get_brightness(c))
                    use_light = True
                    try:
                        use_light = (random.random() < 0.5)
                    except Exception:
                        use_light = True
                    def _is_near_white(col: str) -> bool:
                        try:
                            return self._get_brightness(col) > 0.97 or str(col).lower() in ['#fff', '#ffffff']
                        except Exception:
                            return False
                    if use_light:
                        light_filtered = [c for c in sorted_light if not _is_near_white(c)]
                        chosen = light_filtered or sorted_light
                    else:
                        chosen = [c for c in sorted_dark if not _is_near_white(c)] or sorted_dark
                    bg_primary = (chosen[0] if chosen else '#F7F9FC')
                    bg_secondary = (chosen[1] if len(chosen) > 1 else (chosen[0] if chosen else '#F5F7FA'))
                    palette_out["backgrounds"] = [bg_primary, bg_secondary]
                    on_bg_primary = self.contrast_manager.get_readable_text_color(bg_primary, db_colors)['recommended']
                    on_acc1 = self.contrast_manager.get_readable_text_color(db_colors[0], db_colors)['recommended'] if db_colors else '#FFFFFF'
                    on_acc2 = self.contrast_manager.get_readable_text_color(db_colors[1], db_colors)['recommended'] if len(db_colors) > 1 else on_acc1
                    palette_out["text_colors"] = {
                        "primary": on_bg_primary,
                        "on_accent_1": on_acc1,
                        "on_accent_2": on_acc2
                    }
                except Exception:
                    palette_out.setdefault("backgrounds", ['#FFFFFF', '#F5F7FA'])
                    palette_out.setdefault("text_colors", {"primary": '#1A1A1A', "on_accent_1": '#FFFFFF', "on_accent_2": '#FFFFFF'})
            return palette_out
        
        if not force_ai:
            logger.info(f"[PALETTE] No suitable palette found in database")
        
        should_use_huemint = theme.get('color_palette', {}).get('should_use_huemint', False)  # Always False
        
        if should_use_huemint:
            logger.info(f"[PALETTE] Huemint is disabled - using AI-generated colors")
            # Skip Huemint entirely
            # Use Huemint for beautiful palette generation
            # Create a good query from the deck content
            query_parts = []
            
            # Add title and tone
            query_parts.append(deck_outline.title)
            if hasattr(deck_outline, 'tone') and deck_outline.tone:
                query_parts.append(deck_outline.tone)
            
            # Add vibe context from style preferences if available
            if deck_outline.stylePreferences:
                vibe_context = getattr(deck_outline.stylePreferences, 'vibeContext', None)
                if vibe_context:
                    query_parts.append(vibe_context)
                visual_style = getattr(deck_outline.stylePreferences, 'visualStyle', None)
                if visual_style:
                    query_parts.append(visual_style)
            
            # Add theme name for context
            theme_name = theme.get('theme_name', '')
            if theme_name and theme_name != 'Default Theme':
                query_parts.append(theme_name)
            
            # Build query string - let Huemint understand the context naturally
            query = ' '.join(filter(None, query_parts))
            if not query:
                query = "professional modern presentation"
            
            logger.info(f"[PALETTE] Huemint query: '{query}'")
            
            # Huemint parameters for appropriate palettes
            num_colors = 4  # Use 4 colors for better palette cohesion
            
            # Let Huemint determine appropriate temperature based on the query
            # Use balanced parameters that allow Huemint's AI to understand context
            temperature = 1.0  # Balanced - allows Huemint to be tasteful based on query
            adjacency = [
                [0, 15, 12, 10],   # Balanced transitions
                [15, 0, 15, 12],   # Harmonious relationships
                [12, 15, 0, 15],   # Natural flow
                [10, 12, 15, 0]    # Good contrast
            ]
            
            if deck_outline.stylePreferences:
                # Allow override but default to 4
                num_colors = getattr(deck_outline.stylePreferences, 'numColors', 4) or 4
                adjacency = getattr(deck_outline.stylePreferences, 'adjacency', None)
            
            # Generate palette with Huemint
            try:
                palettes = await self.huemint_service.generate_palettes_for_deck(
                    deck_title=deck_outline.title,
                    deck_content=query,
                    style_preferences={
                        'vibeContext': getattr(deck_outline.stylePreferences, 'vibeContext', None) if deck_outline.stylePreferences else None,
                        'initialIdea': getattr(deck_outline.stylePreferences, 'initialIdea', None) if deck_outline.stylePreferences else None
                    },
                    num_palettes=1  # Just get the best one
                )
                
                if palettes and len(palettes) > 0:
                    best_palette = palettes[0]
                    # Enforce exactly 4 colors
                    colors = (best_palette.get('colors') or [])[:4]
                    while len(colors) < 4:
                        if len(colors) == 0:
                            colors.append('#FFFFFF')
                        elif len(colors) == 1:
                            colors.append('#F0F4F8')
                        elif len(colors) == 2:
                            colors.append('#1A1A1A')
                        elif len(colors) == 3:
                            colors.append('#666666')
                    
                    return {
                        "colors": colors,
                        "primary": colors[0] if colors else '#1E3A5F',
                        "backgrounds": [
                            colors[0] if len(colors) >= 1 else '#FFFFFF',
                            colors[1] if len(colors) >= 2 else '#F0F4F8'
                        ],
                        "name": best_palette.get('name', 'Huemint Palette'),
                        "source": "huemint",
                        "description": best_palette.get('description', ''),
                        "tags": best_palette.get('tags', [])
                    }
            except Exception as e:
                logger.error(f"Error generating Huemint palette: {e}")
                # Fall through to AI-generated colors
        
        # Always use AI-generated theme colors (Huemint is disabled)
        logger.info(f"[PALETTE] Using AI-generated colors from theme")
        color_palette = theme.get('color_palette', {})
        
        # Create a rich palette from AI-generated theme colors
        # NO DEFAULTS - if AI didn't provide colors, that's a problem
        accent_1 = color_palette.get('accent_1')
        accent_2 = color_palette.get('accent_2') 
        accent_3 = color_palette.get('accent_3')
        
        if not accent_1 or not accent_2:
            logger.error(f"[PALETTE] CRITICAL: Theme is missing required accent colors!")
            logger.error(f"[PALETTE] Color palette: {color_palette}")
            # Use the emergency generator based on title
            emergency_colors = self._generate_emergency_colors(deck_outline.title if hasattr(deck_outline, 'title') else 'Presentation')
            accent_1 = emergency_colors['accent_1']
            accent_2 = emergency_colors['accent_2']
            accent_3 = emergency_colors['accent_3']
            primary_bg = emergency_colors['primary_bg']
            secondary_bg = emergency_colors['secondary_bg']
        else:
            primary_bg = color_palette.get('primary_background', '#F7F9FC')
            secondary_bg = color_palette.get('secondary_background', '#F0F4F8')
        
        # Enforce white/dark backgrounds for business/education if needed
        if enforce_clean_bg:
            if prefer_dark_bg:
                primary_bg = '#0A0A0A'
                secondary_bg = '#121212'
            else:
                # Prefer soft light neutral instead of pure white
                primary_bg = '#F5F7FA'
                secondary_bg = '#FFFFFF'
        # Log the colors being used
        logger.info(f"[PALETTE] Building palette from AI colors:")
        logger.info(f"  - Primary BG: {primary_bg}")
        logger.info(f"  - Secondary BG: {secondary_bg}")
        logger.info(f"  - Accent 1: {accent_1}")
        logger.info(f"  - Accent 2: {accent_2}")
        logger.info(f"  - Accent 3: {accent_3}")
        
        # For 4-color palettes, adjust if we don't have accent_3
        if not accent_3:
            # Use only 4 colors: 2 accents + 2 backgrounds
            palette_colors = [accent_1, accent_2, primary_bg, secondary_bg]
        else:
            # Keep 5 colors if we have them all
            palette_colors = [accent_1, accent_2, accent_3, secondary_bg, primary_bg]
        
        # Skip palette contrast analysis - trust AI-generated colors
        
        # Get proper text colors based on backgrounds
        text_color_result = self.contrast_manager.get_readable_text_color(primary_bg, palette_colors)
        primary_text = text_color_result['recommended']
        # For enforced light/dark, lock typical secondary text
        if enforce_clean_bg:
            secondary_text = '#E0E0E0' if prefer_dark_bg else '#333333'
        else:
            secondary_text_result = self.contrast_manager.get_readable_text_color(secondary_bg, palette_colors)
            secondary_text = secondary_text_result['recommended']
        
        logger.info(f"[PALETTE] Text colors - Primary: {primary_text} (contrast: {text_color_result['contrast_ratio']:.2f}), Secondary: {secondary_text}")
        
        # Return 4-color palette format: [accent_1, accent_2, primary_bg, secondary_bg]
        colors_list = [accent_1, accent_2, primary_bg, secondary_bg]
        
        return {
            "colors": colors_list,
            "primary": accent_1,
            "backgrounds": [
                primary_bg,
                secondary_bg
            ],
            "text_colors": {
                "primary": primary_text,
                "secondary": secondary_text,
                "on_accent_1": self.contrast_manager.get_readable_text_color(accent_1, palette_colors)['recommended'],
                "on_accent_2": self.contrast_manager.get_readable_text_color(accent_2, palette_colors)['recommended']
            },
            "name": theme.get('theme_name', 'AI Theme'),
            "source": "ai_generated",
            "has_good_contrast": True  # Trust AI-generated colors
        }
    
    def _lighten_color(self, hex_color: str, factor: float = 0.95) -> str:
        """Lighten a color by mixing with white"""
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16) 
        b = int(hex_color[4:6], 16)
        
        # Mix with white
        r = int(r + (255 - r) * factor)
        g = int(g + (255 - g) * factor)
        b = int(b + (255 - b) * factor)
        
        return f"#{r:02x}{g:02x}{b:02x}"
    
    def _darken_if_needed(self, color: str, bg_color: str) -> str:
        """Darken a color if it doesn't have enough contrast with the background"""
        # Use the contrast manager for proper WCAG contrast checking
        contrast_ratio = self.contrast_manager.get_contrast_ratio(color, bg_color)
        
        if contrast_ratio < 3.0:  # Below AA standard for large text
            # Not enough contrast, darken the color
            return self._darken_color(color, 0.6)
        return color
    
    def _generate_emergency_colors(self, title: str) -> Dict[str, str]:
        """Generate emergency colors based on title when AI fails"""
        import random
        import colorsys
        
        # Generate base hue based on title hash for consistency
        title_hash = sum(ord(c) for c in title.lower())
        base_hue = (title_hash % 360) / 360.0
        
        # Adjust hue based on topic keywords for better results
        title_lower = title.lower()
        if any(word in title_lower for word in ['plant', 'green', 'nature', 'forest', 'leaf', 'photo']):
            base_hue = 0.33  # Green range
        elif any(word in title_lower for word in ['ocean', 'water', 'sea', 'marine', 'blue']):
            base_hue = 0.55  # Blue range
        elif any(word in title_lower for word in ['fire', 'hot', 'sun', 'warm', 'energy']):
            base_hue = 0.05  # Red/orange range
        elif any(word in title_lower for word in ['tech', 'digital', 'cyber', 'ai', 'future']):
            base_hue = 0.6  # Purple/blue range
        
        # Generate colors using color theory
        def hue_to_hex(h, s, l):
            r, g, b = colorsys.hls_to_rgb(h, l, s)
            return f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"
        
        # Generate appropriate colors based on topic
        # For photosynthesis/nature, use green backgrounds
        if any(word in title_lower for word in ['photosynth', 'plant', 'green', 'nature', 'forest', 'leaf']):
            colors = {
                'primary_bg': hue_to_hex(0.33, 0.4, 0.5),  # Green background
                'secondary_bg': hue_to_hex(0.33, 0.3, 0.6),  # Lighter green
                'accent_1': hue_to_hex(0.16, 0.8, 0.6),  # Yellow-green accent
                'accent_2': hue_to_hex(0.08, 0.7, 0.65),  # Yellow accent
                'accent_3': hue_to_hex(0.35, 0.6, 0.4),  # Darker green
                'text': '#1A1A1A',  # Dark text for light backgrounds
                'secondary_text': '#333333',  # Dark gray
                'shape_color': hue_to_hex(0.33, 0.4, 0.5) + '20'
            }
        # For ocean/water, use blue backgrounds
        elif any(word in title_lower for word in ['ocean', 'water', 'sea', 'marine', 'aqua']):
            colors = {
                'primary_bg': hue_to_hex(0.55, 0.5, 0.5),  # Blue background
                'secondary_bg': hue_to_hex(0.55, 0.4, 0.6),  # Lighter blue
                'accent_1': hue_to_hex(0.5, 0.8, 0.6),  # Cyan accent
                'accent_2': hue_to_hex(0.05, 0.6, 0.65),  # Coral accent
                'accent_3': hue_to_hex(0.6, 0.7, 0.4),  # Deep blue
                'text': '#FFFFFF',  # White text for blue backgrounds
                'secondary_text': '#E0E0E0',  # Light gray
                'shape_color': hue_to_hex(0.55, 0.5, 0.5) + '20'
            }
        # Default to appropriate colors based on hue, not always black
        else:
            # Generate background based on topic, not always dark
            bg_lightness = 0.2 if base_hue > 0.5 else 0.85  # Dark for cool colors, light for warm
            text_color = '#FFFFFF' if bg_lightness < 0.5 else '#1A1A1A'
            
            colors = {
                'primary_bg': hue_to_hex(base_hue, 0.3, bg_lightness),
                'secondary_bg': hue_to_hex(base_hue, 0.25, bg_lightness + 0.1),
                'accent_1': hue_to_hex(base_hue, 0.9, 0.6),  # Bright main color
                'accent_2': hue_to_hex((base_hue + 0.33) % 1.0, 0.8, 0.65),  # Triadic harmony
                'accent_3': hue_to_hex((base_hue + 0.17) % 1.0, 0.7, 0.7),  # Split complementary
                'text': text_color,
                'secondary_text': '#666666' if text_color == '#1A1A1A' else '#E0E0E0',
                'shape_color': hue_to_hex(base_hue, 0.9, 0.6) + '20'
            }
        
        logger.warning(f"[COLOR GENERATION] Emergency colors generated for '{title}': {colors}")
        return colors
    
    def _darken_color(self, hex_color: str, factor: float = 0.8) -> str:
        """Darken a color by a factor - just calls _adjust_brightness"""
        return self._adjust_brightness(hex_color, factor)
    
    def _generate_background_variations(self, colors: Dict[str, str], vibe: str) -> List[Dict[str, Any]]:
        """Generate 5-6 coordinated background variations for the theme."""
        backgrounds = []
        
        # Get base colors
        primary_bg = colors.get('primary_bg', '#1A1A1A')
        secondary_bg = colors.get('secondary_bg', '#2A2A2A')
        accent_1 = colors.get('accent_1', '#0066CC')
        accent_2 = colors.get('accent_2', '#FF6B6B')
        accent_3 = colors.get('accent_3', '#00AA55')
        
        # Determine if dark or light theme
        is_dark = self._get_brightness(primary_bg) < 0.5
        
        # Background 1: Primary background
        backgrounds.append({
            'name': 'hero_background',
            'type': 'solid',
            'usage': 'title_slides',
            'config': {
                'color': primary_bg
            }
        })
        
        # Background 2: Accent tint (for section dividers) — avoid aggressive gradients when DB palette is used
        backgrounds.append({
            'name': 'accent_tint',
            'type': 'solid',
            'usage': 'section_dividers',
            'config': {
                'color': (accent_1 + '10') if len(accent_1) in [7, 9] else accent_1
            }
        })
        
        # Background 3: Subtle secondary solid (for content slides)
        backgrounds.append({
            'name': 'content_solid',
            'type': 'solid',
            'usage': 'content_slides',
            'config': {
                'color': secondary_bg
            }
        })
        
        # Background 4: Data solid (for data slides)
        backgrounds.append({
            'name': 'data_solid',
            'type': 'solid',
            'usage': 'data_slides',
            'config': {
                'color': primary_bg
            }
        })
        
        # Background 5: Accent wash (for impact slides) kept minimal
        backgrounds.append({
            'name': 'accent_wash',
            'type': 'solid',
            'usage': 'impact_slides',
            'config': {
                'color': (accent_2 + '14') if len(accent_2) in [7, 9] else accent_2
            }
        })
        
        # Background 6: Conclusion solid
        backgrounds.append({
            'name': 'conclusion_solid',
            'type': 'solid',
            'usage': 'conclusion_slides',
            'config': {
                'color': primary_bg
            }
        })
        
        return backgrounds
    
    # _generate_theme_overlay removed
    
    def _generate_slide_templates(self, vibe: str, design_elements: Dict[str, Any]) -> Dict[str, Any]:
        """Generate slide-specific templates for consistent layouts."""
        
        templates = {}
        
        # Title slide template
        templates['title'] = {
            'background_variant': 'hero_background',
            'layout': 'centered_hero' if vibe.lower() in ['professional', 'corporate'] else 'off_center_dramatic',
            'components': {
                'title': {
                    'position': {'x': 160, 'y': 340} if vibe.lower() in ['creative', 'bold'] else {'x': 160, 'y': 400},
                    'width': 1600,
                    'fontSize_range': [220, 360],
                    'alignment': 'left' if vibe.lower() in ['creative', 'bold'] else 'center'
                },
                'subtitle': {
                    'position': {'x': 160, 'y': 600},
                    'width': 1600,
                    'fontSize': 48,
                    'opacity': 0.8
                },
                'metadata': {
                    'position': {'x': 160, 'y': 920},
                    'fontSize': 32,
                    'format': '{presenter} • {organization} • {date}'
                }
            }
        }
        
        # Content slide template
        templates['content'] = {
            'background_variant': 'content_solid',
            'layout': 'asymmetric' if design_elements.get('layout', '') == 'asymmetric' else 'structured',
            'components': {
                'header': {
                    'position': {'x': 80, 'y': 80},
                    'width': 1760,
                    'fontSize': 96
                },
                'body': {
                    'position': {'x': 80, 'y': 240},
                    'width': 1760,
                    'fontSize': 36
                }
            }
        }
        
        # Data slide template
        templates['data'] = {
            'background_variant': 'data_solid',
            'layout': 'split_screen',
            'components': {
                'title': {
                    'position': {'x': 80, 'y': 80},
                    'width': 800,
                    'fontSize': 72
                },
                'chart': {
                    'position': {'x': 920, 'y': 120},
                    'width': 920,
                    'height': 840
                },
                'insights': {
                    'position': {'x': 80, 'y': 240},
                    'width': 800,
                    'fontSize': 36
                }
            }
        }
        
        # Section divider template
        templates['section'] = {
            'background_variant': 'accent_tint',
            'layout': 'centered',
            'components': {
                'section_number': {
                    'position': {'x': 160, 'y': 320},
                    'width': 1600,
                    'fontSize': 240,
                    'opacity': 0.3,
                    'alignment': 'center'
                },
                'section_title': {
                    'position': {'x': 160, 'y': 480},
                    'width': 1600,
                    'fontSize': 120,
                    'alignment': 'center'
                }
            }
        }
        
        # Conclusion slide template
        templates['conclusion'] = {
            'background_variant': 'conclusion_solid',
            'layout': 'centered_statement',
            'components': {
                'message': {
                    'position': {'x': 160, 'y': 420},
                    'width': 1600,
                    'fontSize': 144,
                    'alignment': 'center'
                },
                'cta': {
                    'position': {'x': 160, 'y': 640},
                    'width': 1600,
                    'fontSize': 48,
                    'alignment': 'center',
                    'style': 'button' if vibe.lower() in ['bold', 'creative'] else 'text'
                }
            }
        }
        
        return templates
    
    def create_style_manifesto(self, style_spec: Dict[str, Any]) -> str:
        """Convert style spec into a readable manifesto for AI."""
        approach = style_spec.get('design_approach', 'CINEMATIC')
        colors = style_spec.get('color_palette', {})
        typography = style_spec.get('typography', {})
        images = style_spec.get('images', {})
        
        # Ensure all fields are dictionaries, not strings
        if not isinstance(colors, dict):
            colors = {}
        if not isinstance(typography, dict):
            typography = {}
        if not isinstance(images, dict):
            images = {}
        
        # Safe color handling
        overlay = colors.get('overlay', {})
        if isinstance(overlay, str):
            overlay = {}
        
        overlay_color = overlay.get('color', '#000000') if isinstance(overlay, dict) else '#000000'
        overlay_opacity = self._safe_float(overlay.get('opacity', 0.15)) if isinstance(overlay, dict) else 0.15
        
        # Typography defaults
        hero = typography.get('hero_title', {})
        if not isinstance(hero, dict):
            hero = {'family': 'Montserrat', 'size': 180, 'weight': '700'}
        
        section = typography.get('section_title', {})
        if not isinstance(section, dict):
            section = {'family': 'Montserrat', 'size': 120, 'weight': '600'}
        
        body = typography.get('body', {}) or typography.get('body_text', {})
        if not isinstance(body, dict):
            body = {'family': 'Poppins', 'size': 36, 'weight': '400'}
        
        return f"""
DESIGN APPROACH: {approach}

COLOR SYSTEM:
- Backgrounds: {colors.get('primary_bg', '#FFFFFF')}, {colors.get('secondary_bg', '#F8F9FA')}
- Text: {colors.get('primary_text', '#1A1A1A')} 
- Accents: {colors.get('accent_1', '#0066CC')}, {colors.get('accent_2', '#FF6B6B')}
- Image overlays: {overlay_color} at {int(overlay_opacity * 100)}% opacity

TYPOGRAPHY:
- Hero titles: {hero.get('family', 'Montserrat')} at {hero.get('size', 180)}pt, weight {hero.get('weight', '700')}
- Section titles: {section.get('family', 'Montserrat')} at {section.get('size', 120)}pt
- Body text: {body.get('family', 'Poppins')} at {body.get('size', 36)}pt

VISUAL RULES:
- Images take up {self._safe_float(images.get('prominence', 0.7)) * 100:.0f}% of slides
- Effects: {', '.join(images.get('effects', ['ken-burns']))}
- Layouts: {', '.join(images.get('layout', ['full-bleed']))}
- Clean, sophisticated, adult-oriented design
"""
    
    def extract_slide_colors(self, slide_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract all colors used in a slide."""
        colors = {
            "background": None,
            "text": set(),
            "accents": set(),
            "all": set()
        }
        
        for component in slide_data.get('components', []):
            comp_type = component.get('type', '')
            props = component.get('props', {})
            
            for prop in ['color', 'fill', 'stroke', 'backgroundColor', 'textColor', 'borderColor']:
                if prop in props and isinstance(props[prop], str) and props[prop].startswith('#'):
                    color = props[prop]
                    colors['all'].add(color)
                    
                    if comp_type == 'Background' or prop == 'backgroundColor':
                        colors['background'] = color
                    elif prop in ['color', 'textColor'] and comp_type in ['TextBlock', 'TiptapTextBlock', 'Title']:
                        colors['text'].add(color)
                    else:
                        colors['accents'].add(color)
        
        return {
            "background": colors['background'],
            "text": list(colors['text']),
            "accents": list(colors['accents']),
            "all": list(colors['all'])
        }
    
    def _extract_logo_from_website(self, brand_name: str, url: str) -> Optional[str]:
        """Extract logo URL from a website."""
        try:
            import asyncio
            from agents.tools.theme import WebColorScraper
            
            async def get_logo():
                scraper = WebColorScraper()
                # Fetch the page content
                content = await scraper._fetch_page_content(url)
                if not content:
                    return None
                    
                # Common logo patterns in HTML
                logo_patterns = [
                    # img tags with logo in src/alt/class
                    r'<img[^>]+(?:class|id|alt)[^>]*logo[^>]*src=["\']([^"\']+)["\']',
                    r'<img[^>]+src=["\']([^"\']+)["\'][^>]*(?:class|id|alt)[^>]*logo',
                    # SVG logos
                    r'<svg[^>]+(?:class|id)[^>]*logo[^>]*>.*?</svg>',
                    # Background images with logo
                    r'background-image:\s*url\(["\']?([^"\')\s]+logo[^"\')\s]*)["\']?\)',
                    # Meta tags
                    r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
                    # Link tags for icons
                    r'<link[^>]+rel=["\'](?:icon|apple-touch-icon)["\'][^>]+href=["\']([^"\']+)["\']'
                ]
                
                for pattern in logo_patterns:
                    import re
                    matches = re.findall(pattern, content, re.IGNORECASE)
                    for match in matches:
                        if isinstance(match, str) and match:
                            # Convert relative URLs to absolute
                            from urllib.parse import urljoin
                            logo_url = urljoin(url, match)
                            # Filter out common non-logo images
                            if not any(skip in logo_url.lower() for skip in ['sprite', 'icon-', 'placeholder', 'loading']):
                                return logo_url
                
                return None
            
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                # No event loop in thread
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
            return loop.run_until_complete(get_logo())
            
        except Exception as e:
            logger.warning(f"Failed to extract logo: {e}")
            return None
    
    def _extract_brand_name(self, title: str, vibe: str) -> Optional[str]:
        """Extract brand name from title or vibe context."""
        text = f"{title} {vibe}".lower()
        
        # Known brands we should check (include common aliases)
        known_brands = [
            'kroger', 'aldi', 'walmart', 'target', 'openai', 'google', 'microsoft',
            'apple', 'meta', 'facebook', 'mario', 'super mario', 'pokemon', 'pikachu',
            'disney', 'mcdonalds', 'starbucks', 'amazon', 'ebay', 'twitter', 'x.com',
            'instagram', 'linkedin', 'youtube', 'tiktok',
            'first round'
        ]
        
        for brand in known_brands:
            if brand in text:
                # Normalize common aliases to a canonical identifier for Brandfetch domain building
                if brand in ['first round', 'first round capital', 'firstround', 'firstroundcapital']:
                    return 'firstroundcapital'
                return brand
        
        return None
    
    def _has_specific_brand_colors(self, title: str, vibe: str, content: str) -> bool:
        """Determine if the topic has specific brand/character colors that shouldn't use Huemint"""
        # Known brands and characters with specific colors
        specific_brands = [
            'pikachu', 'pokemon', 'pokémon',
            'coca-cola', 'coca cola', 'coke', 'pepsi',
            'google', 'apple', 'microsoft', 'meta', 'facebook', 'amazon', 'netflix',
            'mario', 'nintendo', 'luigi', 'zelda', 'sonic', 'sega',
            'disney', 'pixar', 'marvel', 'star wars',
            'mcdonalds', "mcdonald's", 'burger king', 'subway', 'kfc', 'wendys',
            'nike', 'adidas', 'puma', 'reebok', 'under armour',
            'ferrari', 'tesla', 'ford', 'toyota', 'bmw', 'mercedes',
            'starbucks', 'dunkin', 'tim hortons',
            'walmart', 'target', 'costco', 'ikea', 'kroger', 'safeway', 'whole foods',
            'youtube', 'instagram', 'twitter', 'tiktok', 'snapchat', 'linkedin',
            'uber', 'lyft', 'airbnb', 'doordash', 'grubhub',
            'christmas', 'halloween', 'easter', 'valentine',
            'spotify', 'pandora', 'soundcloud',
            'visa', 'mastercard', 'american express', 'paypal',
            'home depot', 'lowes', 'ace hardware'
        ]
        
        # Check if any specific brand/character is mentioned
        combined_text = f"{title} {vibe} {content}".lower()
        logger.info(f"Checking for brand colors in: {combined_text[:100]}...")
        
        for brand in specific_brands:
            if brand in combined_text:
                logger.info(f"Found specific brand: {brand}")
                return True
        
        # Check for sports teams (they have specific colors)
        sports_keywords = ['lakers', 'yankees', 'patriots', 'cowboys', 'united', 'barcelona', 'madrid']
        for team in sports_keywords:
            if team in combined_text:
                logger.info(f"Found sports team: {team}")
                return True
        
        # Check for countries/flags (they have specific colors)
        country_keywords = ['flag', 'national', 'america', 'canada', 'france', 'germany', 'japan', 'brazil']
        for country in country_keywords:
            if country in combined_text:
                logger.info(f"Found country/flag: {country}")
                return True
        
        logger.info("No specific brand colors detected, will use Huemint")
        return False
    
    def _safe_float(self, value: Any, default: float = 0.0) -> float:
        """Safely convert value to float."""
        try:
            if isinstance(value, (int, float)):
                return float(value)
            elif isinstance(value, str):
                cleaned = value.strip().rstrip('%')
                result = float(cleaned)
                if '%' in value:
                    result = result / 100
                return result
            else:
                return default
        except (ValueError, TypeError):
            return default 

    def _parse_design_response(self, response: str) -> Dict[str, Any]:
        """Parse design system response from AI."""
        design = {}
        response_lower = response.lower()
        
        # Visual style
        if 'minimalist' in response_lower:
            design['style'] = 'Minimalist'
        elif 'maximalist' in response_lower:
            design['style'] = 'Maximalist'
        elif 'editorial' in response_lower:
            design['style'] = 'Editorial'
        elif 'brutalist' in response_lower:
            design['style'] = 'Brutalist'
        elif 'organic' in response_lower:
            design['style'] = 'Organic'
        elif 'geometric' in response_lower:
            design['style'] = 'Geometric'
        else:
            design['style'] = 'Modern'
        
        # Image prominence
        import re
        prominence_match = re.search(r'prominence[:\s]+(\d+)', response_lower)
        if prominence_match:
            design['image_prominence'] = int(prominence_match.group(1))
        else:
            design['image_prominence'] = 80
        
        # Image treatment
        if 'full-bleed' in response_lower or 'full bleed' in response_lower:
            design['image_treatment'] = 'full-bleed'
        elif 'masked' in response_lower:
            design['image_treatment'] = 'masked'
        elif 'framed' in response_lower:
            design['image_treatment'] = 'framed'
        else:
            design['image_treatment'] = 'full-bleed'
        
        # Effects
        design['effects'] = []
        if 'ken-burns' in response_lower or 'ken burns' in response_lower:
            design['effects'].append('ken-burns')
        if 'parallax' in response_lower:
            design['effects'].append('parallax')
        if 'fade' in response_lower:
            design['effects'].append('fade')
        if not design['effects']:
            design['effects'] = ['ken-burns']
        
        # Layout
        if 'asymmetric' in response_lower:
            design['layout'] = 'asymmetric'
        elif 'grid' in response_lower:
            design['layout'] = 'grid-based'
        elif 'centered' in response_lower:
            design['layout'] = 'centered'
        elif 'dynamic' in response_lower:
            design['layout'] = 'dynamic'
        else:
            design['layout'] = 'asymmetric'
        
        # Visual hierarchy
        if 'extreme' in response_lower:
            design['hierarchy'] = 'extreme'
        elif 'moderate' in response_lower:
            design['hierarchy'] = 'moderate'
        else:
            design['hierarchy'] = 'extreme'
        
        # Special effects
        if 'no gradient' in response_lower or 'none' in response_lower:
            design['gradients'] = 'none'
        elif 'subtle' in response_lower:
            design['gradients'] = 'subtle'
        elif 'bold' in response_lower:
            design['gradients'] = 'bold'
        else:
            design['gradients'] = 'subtle'
        
        # Shadows
        if 'no shadow' in response_lower:
            design['shadows'] = 'none'
        elif 'dramatic' in response_lower:
            design['shadows'] = 'dramatic'
        else:
            design['shadows'] = 'subtle'
        
        # Shapes
        if 'minimal' in response_lower:
            design['shapes'] = 'minimal'
        elif 'abundant' in response_lower:
            design['shapes'] = 'abundant'
        else:
            design['shapes'] = 'minimal'
        
        # Emphasis
        if 'size' in response_lower:
            design['emphasis'] = 'size'
        elif 'color' in response_lower:
            design['emphasis'] = 'color'
        elif 'position' in response_lower:
            design['emphasis'] = 'position'
        else:
            design['emphasis'] = 'mixed'
        
        # Animations
        if 'no animation' in response_lower or 'none' in response_lower:
            design['animations'] = 'none'
        elif 'dramatic' in response_lower:
            design['animations'] = 'dramatic'
        elif 'moderate' in response_lower:
            design['animations'] = 'moderate'
        else:
            design['animations'] = 'subtle'
        
        # White space
        if 'generous' in response_lower or 'lots of' in response_lower:
            design['white_space'] = 'generous'
        elif 'moderate' in response_lower:
            design['white_space'] = 'moderate'
        else:
            design['white_space'] = 'generous'
        
        # Design philosophy
        if 'unforgettable' in response_lower:
            design['philosophy'] = 'Make every slide unforgettable'
        elif 'bold' in response_lower:
            design['philosophy'] = 'Be bold, break conventions'
        elif 'clean' in response_lower:
            design['philosophy'] = 'Clean design speaks loudest'
        else:
            design['philosophy'] = 'Transform information into experiences'
        
        return design 

    def _extract_colors_from_vibe(self, vibe: str) -> List[str]:
        """Extract color names or hex codes from vibe context"""
        if not vibe:
            return []
        
        colors = []
        vibe_lower = vibe.lower()
        
        # Common color names to look for
        color_names = {
            'pink': '#FF69B4',
            'black': '#000000',
            'white': '#FFFFFF',
            'red': '#FF0000',
            'blue': '#0000FF',
            'green': '#00FF00',
            'yellow': '#FFFF00',
            'purple': '#800080',
            'orange': '#FFA500',
            'gray': '#808080',
            'grey': '#808080',
            'brown': '#A52A2A',
            'navy': '#000080',
            'teal': '#008080',
            'gold': '#FFD700',
            'silver': '#C0C0C0',
            'maroon': '#800000',
            'cyan': '#00FFFF',
            'magenta': '#FF00FF',
            'lime': '#00FF00',
            'coral': '#FF7F50',
            'salmon': '#FA8072',
            'turquoise': '#40E0D0',
            'violet': '#EE82EE',
            'indigo': '#4B0082',
            'beige': '#F5F5DC',
            'mint': '#3EB489',
            'lavender': '#E6E6FA',
            'crimson': '#DC143C',
            'emerald': '#50C878',
            'ruby': '#E0115F',
            'sapphire': '#0F52BA',
            'rose': '#FF007F',
            'charcoal': '#36454F',
            'midnight': '#191970',
            'neon pink': '#FF10F0',
            'hot pink': '#FF69B4',
            'dark blue': '#00008B',
            'light blue': '#ADD8E6',
            'dark green': '#006400',
            'light green': '#90EE90',
            'pastel pink': '#FFD1DC',
            'pastel blue': '#AEC6CF',
            'pastel yellow': '#FFFDCB',
            'pastel green': '#C1FFC1',
            'pastel purple': '#E5D4FF'
        }
        
        # Check for color names in vibe
        for color_name, hex_value in color_names.items():
            if color_name in vibe_lower:
                colors.append(hex_value)
                logger.info(f"[COLOR EXTRACTION] Found '{color_name}' in vibe context → {hex_value}")
        
        # Also check for hex codes in vibe (e.g., #FF69B4)
        import re
        hex_pattern = r'#[0-9A-Fa-f]{6}\b'
        hex_matches = re.findall(hex_pattern, vibe)
        for hex_color in hex_matches:
            colors.append(hex_color.upper())
            logger.info(f"[COLOR EXTRACTION] Found hex code in vibe context: {hex_color}")
        
        return colors 