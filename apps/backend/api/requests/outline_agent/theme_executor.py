"""
Reusable theme update logic for the outline agent.

Extracted from api_outline_theme.py so it can be called from both:
- The tool loop (when model calls update_theme tool)
- The existing API endpoint (api_outline_theme.py)
"""

import os
import re
import random
import hashlib
import logging
from typing import Any, Dict, List, Optional

from setup_logging_optimized import get_logger

logger = get_logger(__name__)


async def _ai_select_body_font(hero_font: str, context: str) -> str:
    """Use AI to select a complementary body font from 700+ available fonts."""
    try:
        import anthropic
        from services.enhanced_font_service import EnhancedFontService

        font_service = EnhancedFontService()
        available_ids = font_service.get_available_font_ids(include_remote=False)

        font_list_parts = []
        category_map: Dict[str, list[str]] = {}
        for font_id in available_ids:
            data = font_service.all_fonts.get(font_id, {})
            cat = str(data.get('category') or 'unknown').title()
            category_map.setdefault(cat, []).append(data.get('name', font_id))
        for category, fonts_in_cat in category_map.items():
            if fonts_in_cat:
                font_list_parts.append(f"**{category}**: {', '.join(fonts_in_cat[:30])}")
        available_fonts_str = "\n".join(font_list_parts)

        prompt = f"""The hero/header font is: "{hero_font}"

Select a DIFFERENT complementary body font for a {context} presentation.

RULES:
1. Body font MUST be DIFFERENT from "{hero_font}"
2. Body font should be highly readable (prefer sans-serif for body)
3. Should complement the hero font stylistically

Available fonts:
{available_fonts_str}

Return ONLY the exact font name, nothing else."""

        from agents.config import FONT_SELECTION_MODEL
        from agents.ai.clients import get_model_id
        client = anthropic.Anthropic()
        response = client.messages.create(
            model=get_model_id(FONT_SELECTION_MODEL),
            max_tokens=50,
            temperature=0.3,
            messages=[{"role": "user", "content": prompt}]
        )

        body_font = response.content[0].text.strip().strip('"\'')

        normalized_hero = hero_font.lower()
        matched = font_service.match_font_name(body_font, is_hero=False, include_remote=False)
        if matched and matched.lower() != normalized_hero:
            logger.info(f"[ThemeExecutor] AI selected body font: {matched}")
            return matched

        matched = font_service.match_font_name(body_font, is_hero=False, include_remote=True)
        if matched and matched.lower() != normalized_hero:
            return matched

        return font_service.match_font_name('Inter', is_hero=False, include_remote=True) or 'Inter'

    except Exception as e:
        logger.error(f"[ThemeExecutor] AI font selection error: {e}")
        return 'Inter' if hero_font != 'Inter' else 'Poppins'


async def _select_brand_fonts_ai(brand_name: str, brand_domain: Optional[str] = None) -> Dict[str, str]:
    """Use FontIntelligence to select fonts that match a brand's personality."""
    try:
        try:
            from services.font_characteristics import get_brand_font_override
            font_override = get_brand_font_override(brand_domain or brand_name)
            if font_override:
                logger.info(f"[ThemeExecutor] Using font override for {brand_domain or brand_name}: {font_override}")
                return font_override
        except ImportError:
            pass

        from agents.tools.theme.font_intelligence import select_fonts_for_brand

        result = await select_fonts_for_brand(
            brand_name=brand_name,
            brand_domain=brand_domain,
            content_topic=None
        )

        hero_font = result.get('hero', 'Poppins')
        body_font = result.get('body', 'Inter')
        reasoning = result.get('reasoning', '')

        logger.info(f"[ThemeExecutor] FontIntelligence selected: hero={hero_font}, body={body_font}")
        logger.info(f"[ThemeExecutor] Reasoning: {reasoning}")

        return {'hero': hero_font, 'body': body_font}

    except Exception as e:
        logger.error(f"[ThemeExecutor] FontIntelligence error: {e}, using registry fallback")
        try:
            from services.enhanced_font_service import EnhancedFontService
            font_svc = EnhancedFontService()
            pair = font_svc.select_font_pair(
                deck_title=brand_name,
                vibe='professional'
            )
            return {'hero': pair['hero'], 'body': pair['body']}
        except Exception:
            return {'hero': 'Poppins', 'body': 'Inter'}


# ── Color-intent helpers ──────────────────────────────────────────────────────

# Map color names to HSL hue ranges (degrees)
_COLOR_HUE_RANGES = {
    'red':    [(345, 360), (0, 15)],
    'orange': [(15, 45)],
    'yellow': [(45, 75)],
    'green':  [(75, 165)],
    'teal':   [(165, 195)],
    'blue':   [(195, 260)],
    'purple': [(260, 300)],
    'pink':   [(300, 345)],
}

# Also match dark/light preference keywords
_DARK_KEYWORDS = {'dark', 'night', 'midnight', 'deep', 'noir', 'black'}
_LIGHT_KEYWORDS = {'light', 'pastel', 'soft', 'pale', 'bright', 'neon', 'vivid'}


def _hex_to_hsl(hex_color: str):
    """Convert hex color to (hue, saturation, lightness) tuple."""
    h = hex_color.lstrip('#')
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        h_val = s = 0.0
    else:
        d = mx - mn
        s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
        if mx == r:
            h_val = (g - b) / d + (6 if g < b else 0)
        elif mx == g:
            h_val = (b - r) / d + 2
        else:
            h_val = (r - g) / d + 4
        h_val /= 6
    return h_val * 360, s, l


def _hsl_to_hex(h: float, s: float, l: float) -> str:
    """Convert HSL to hex color string."""
    h = h / 360
    if s == 0:
        r = g = b = l
    else:
        def hue2rgb(p, q, t):
            if t < 0: t += 1
            if t > 1: t -= 1
            if t < 1/6: return p + (q - p) * 6 * t
            if t < 1/2: return q
            if t < 2/3: return p + (q - p) * (2/3 - t) * 6
            return p
        q = l * (1 + s) if l < 0.5 else l + s - l * s
        p = 2 * l - q
        r = hue2rgb(p, q, h + 1/3)
        g = hue2rgb(p, q, h)
        b = hue2rgb(p, q, h - 1/3)
    return f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"


def _perceived_brightness(hex_color: str) -> float:
    """WCAG relative luminance approximation."""
    h = hex_color.lstrip('#')
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _parse_color_intent(query: str):
    """Parse a color search query for specific color + dark/light preference.

    Returns dict with 'color_name', 'hue_ranges', 'prefers_dark', 'prefers_light'
    or None if no specific color detected.
    """
    words = set(query.lower().split())

    prefers_dark = bool(words & _DARK_KEYWORDS)
    prefers_light = bool(words & _LIGHT_KEYWORDS)

    for color_name, hue_ranges in _COLOR_HUE_RANGES.items():
        if color_name in words:
            return {
                'color_name': color_name,
                'hue_ranges': hue_ranges,
                'prefers_dark': prefers_dark,
                'prefers_light': prefers_light if not prefers_dark else False,
            }

    return {
        'color_name': None,
        'hue_ranges': None,
        'prefers_dark': prefers_dark,
        'prefers_light': prefers_light or (not prefers_dark),
    }


def _hue_in_ranges(hue: float, ranges) -> bool:
    """Check if a hue value falls within any of the given ranges."""
    for lo, hi in ranges:
        if lo <= hue <= hi:
            return True
    return False


def _find_best_color_match(colors: List[str], hue_ranges) -> Optional[str]:
    """Find the palette color whose hue best matches the target ranges."""
    best = None
    best_score = -1.0
    for c in colors:
        if not isinstance(c, str) or not c.startswith('#') or len(c) < 7:
            continue
        hue, sat, lit = _hex_to_hsl(c)
        # Skip near-white, near-black, and desaturated colors
        if lit > 0.92 or lit < 0.08 or sat < 0.15:
            continue
        if _hue_in_ranges(hue, hue_ranges):
            # Score by saturation (prefer vivid colors)
            score = sat
            if score > best_score:
                best_score = score
                best = c
    return best


def _build_theme_from_color(base_color: str, prefers_dark: bool = False) -> dict:
    """Build a complete bg/text/accent theme from a single base color."""
    hue, sat, lit = _hex_to_hsl(base_color)

    if prefers_dark:
        # Dark mode: use a dark shade of the color as bg
        bg = _hsl_to_hex(hue, max(sat * 0.6, 0.15), 0.15)
        text = '#FFFFFF'
        accent1 = _hsl_to_hex(hue, min(sat, 0.85), 0.55)
        accent2 = _hsl_to_hex((hue + 30) % 360, min(sat * 0.7, 0.6), 0.5)
    else:
        # Light mode: use a light tint of the color as bg
        bg = _hsl_to_hex(hue, max(sat * 0.45, 0.20), 0.85)
        text = '#1A1A1A'
        accent1 = _hsl_to_hex(hue, min(sat, 0.75), 0.45)
        accent2 = _hsl_to_hex((hue + 30) % 360, min(sat * 0.6, 0.55), 0.4)

    # Verify text contrast; swap if needed
    bg_brightness = _perceived_brightness(bg)
    if not prefers_dark and bg_brightness < 0.5:
        text = '#FFFFFF'
    elif prefers_dark and bg_brightness > 0.5:
        text = '#1A1A1A'

    return {
        'bg': bg,
        'text': text,
        'accents': [accent1, accent2],
    }


async def execute_theme_update(
    theme_args: Dict[str, Any],
    outline_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute a theme update. Callable from both:
    - The tool loop (when model calls update_theme tool)
    - The existing API endpoint (api_outline_theme.py)

    Args:
        theme_args: {colors?, fonts?, brand?, logo?}
        outline_id: Optional outline ID for context-dependent font selection.

    Returns:
        {success, style_preferences, theme_updates, message}
    """
    from services.simple_brandfetch_cache import SimpleBrandfetchCache
    from agents.tools.theme.holistic_brand_extractor import HolisticBrandExtractor

    style_preferences: Dict[str, Any] = {}
    theme_updates: Dict[str, Any] = {}
    messages: List[str] = []

    brand_args = theme_args.get("brand")
    colors_args = theme_args.get("colors")
    fonts_args = theme_args.get("fonts")
    logo_args = theme_args.get("logo")

    # ── Brand changes (colors + logo from brand) ──────────────────────────
    if brand_args:
        brand_name = brand_args.get("name")
        brand_url = brand_args.get("url")

        if brand_name or brand_url:
            logger.info(f"[ThemeExecutor] Applying brand: {brand_name or brand_url}")

            try:
                brand_data = None
                brand_domain = brand_url if brand_url else None

                if not brand_domain and brand_name:
                    cleaned = re.sub(r"[^a-zA-Z0-9\s]", "", brand_name)
                    cleaned = cleaned.lower().replace(' ', '')
                    brand_domain = f"{cleaned}.com"

                logger.info(f"[ThemeExecutor] Trying Brandfetch DB for domain: {brand_domain}")

                db_url = os.getenv('DATABASE_URL')
                if not db_url:
                    logger.error("[ThemeExecutor] DATABASE_URL not set, skipping Brandfetch DB lookup")
                    raise ValueError("DATABASE_URL environment variable is required")
                async with SimpleBrandfetchCache(db_url) as bf_service:
                    brand_info = await bf_service.get_brand_data(brand_domain)

                    if brand_info and not brand_info.get('error'):
                        colors_data = brand_info.get('colors', {})
                        logos_data = brand_info.get('logos', {})

                        all_colors = colors_data.get('all', [])
                        light_colors = [c.get('hex') for c in all_colors if c.get('type') == 'light' and c.get('hex')]
                        dark_colors = [c.get('hex') for c in all_colors if c.get('type') == 'dark' and c.get('hex')]
                        accent_colors_raw = [c.get('hex') for c in all_colors if c.get('type') == 'accent' and c.get('hex')]

                        colors_list = accent_colors_raw + dark_colors + light_colors
                        colors_list = list(dict.fromkeys(colors_list))

                        brand_data = {
                            'colors': colors_list,
                            'logos': logos_data.get('all', []),
                            'fonts': [f.get('name') for f in brand_info.get('fonts', {}).get('all', []) if f.get('name')]
                        }
                        logger.info(f"[ThemeExecutor] Found {len(colors_list)} colors from Brandfetch DB")

                if not brand_data:
                    logger.info(f"[ThemeExecutor] Brandfetch DB failed, trying HolisticBrandExtractor")
                    extractor = HolisticBrandExtractor()
                    brand_data = await extractor.extract_brand_async(brand_domain)

                if brand_data:
                    if brand_data.get('colors'):
                        colors = brand_data['colors']

                        from agents.tools.theme.smart_color_selector import SmartColorSelector
                        color_selector = SmartColorSelector()

                        palette_result = {
                            'colors': colors,
                            'backgrounds': [],
                            'accents': colors[1:] if len(colors) > 1 else [],
                            'text_colors': {'primary': '#1F2937'},
                            'source': 'brand'
                        }

                        analysis = {'wants_pink': False, 'prefers_dark': False, 'prefers_light': True}
                        assigned_result = color_selector._post_process_colors(palette_result, analysis, preserve_brand_backgrounds=True)

                        assigned_backgrounds = assigned_result.get('backgrounds', [])
                        assigned_accents = assigned_result.get('accents', [])
                        assigned_text = assigned_result.get('text_colors', {}).get('primary', '#1F2937')

                        bg_color = assigned_backgrounds[0] if assigned_backgrounds else colors[0]
                        text_color = assigned_text
                        accent_colors = assigned_accents[:3] if len(assigned_accents) >= 3 else assigned_accents

                        logger.info(f"[ThemeExecutor] Brand colors assigned: bg={bg_color}, text={text_color}, accents={accent_colors}")

                        style_preferences['colors'] = {
                            'type': 'custom',
                            'background': bg_color,
                            'accent1': accent_colors[0] if len(accent_colors) > 0 else colors[0],
                            'accent2': accent_colors[1] if len(accent_colors) > 1 else accent_colors[0] if len(accent_colors) > 0 else colors[0],
                            'accent3': accent_colors[2] if len(accent_colors) > 2 else accent_colors[0] if len(accent_colors) > 0 else colors[0],
                            'text': text_color
                        }

                        theme_updates['color_palette'] = {
                            'primary_background': bg_color,
                            'primary_text': text_color,
                            'accent_1': accent_colors[0] if len(accent_colors) > 0 else colors[0],
                            'accent_2': accent_colors[1] if len(accent_colors) > 1 else accent_colors[0] if len(accent_colors) > 0 else colors[0],
                            'backgrounds': [bg_color],
                            'accents': accent_colors,
                            'text_colors': {'primary': text_color},
                            'colors': colors
                        }

                    # Extract logo
                    logo_url = None
                    if brand_data.get('logos'):
                        for logo in brand_data['logos']:
                            if logo.get('format') == 'svg':
                                logo_url = logo.get('url')
                                break
                        if not logo_url and brand_data['logos']:
                            logo_url = brand_data['logos'][0].get('url')

                    if logo_url:
                        style_preferences['logoUrl'] = logo_url
                        if 'brandInfo' not in theme_updates:
                            theme_updates['brandInfo'] = {}
                        theme_updates['brandInfo']['logoUrl'] = logo_url

                        if 'color_palette' not in theme_updates:
                            theme_updates['color_palette'] = {}
                        if 'metadata' not in theme_updates['color_palette']:
                            theme_updates['color_palette']['metadata'] = {}
                        theme_updates['color_palette']['metadata']['logo_url'] = logo_url

                    # Extract fonts
                    if brand_data.get('fonts') and len(brand_data['fonts']) > 0:
                        from services.enhanced_font_service import EnhancedFontService
                        font_service = EnhancedFontService()

                        hero_font = None
                        body_font = None
                        for font in brand_data['fonts']:
                            if not hero_font:
                                hero_font = font_service.match_font_name(font, is_hero=True, include_remote=False)
                            elif not body_font:
                                body_font = font_service.match_font_name(font, is_hero=False, include_remote=False)
                            if hero_font and body_font:
                                break

                        if hero_font:
                            if not body_font:
                                body_font = await _ai_select_body_font(hero_font, brand_name or 'brand')
                            style_preferences['font'] = hero_font
                            style_preferences['bodyFont'] = body_font
                            theme_updates['typography'] = {
                                'hero_title': {'family': hero_font},
                                'body_text': {'family': body_font}
                            }
                            logger.info(f"[ThemeExecutor] Brand fonts (matched): hero={hero_font}, body={body_font}")
                        else:
                            logger.info(f"[ThemeExecutor] Brand fonts not available locally, using AI selection")
                            brand_fonts = await _select_brand_fonts_ai(brand_name or brand_url or 'brand', brand_url)
                            style_preferences['font'] = brand_fonts['hero']
                            style_preferences['bodyFont'] = brand_fonts['body']
                            theme_updates['typography'] = {
                                'hero_title': {'family': brand_fonts['hero']},
                                'body_text': {'family': brand_fonts['body']}
                            }
                            logger.info(f"[ThemeExecutor] Brand fonts (AI): hero={brand_fonts['hero']}, body={brand_fonts['body']}")

                    messages.append(f"Applied {brand_name or brand_url} brand theme")
                else:
                    messages.append(f"Could not find brand data for {brand_name or brand_url}")

            except Exception as e:
                logger.error(f"[ThemeExecutor] Error extracting brand data: {e}")
                messages.append(f"Error applying brand: {str(e)}")

    # ── Direct hex colors from model (model has final say) ──────────────
    # Standalone check — overrides brand-fetched colors when model specifies hex
    if colors_args and colors_args.get('background'):
        bg_color = colors_args['background']
        text_color = colors_args.get('text') or (
            '#FFFFFF' if _perceived_brightness(bg_color) < 0.5 else '#1A1A1A'
        )
        accent_colors = [
            colors_args.get('accent1') or bg_color,
            colors_args.get('accent2') or bg_color,
        ]

        logger.info(f"[ThemeExecutor] Applying direct colors: bg={bg_color}, text={text_color}, accents={accent_colors}")

        style_preferences['colors'] = {
            'type': 'custom',
            'background': bg_color,
            'accent1': accent_colors[0],
            'accent2': accent_colors[1],
            'accent3': accent_colors[0],
            'text': text_color,
        }

        theme_updates['color_palette'] = {
            'primary_background': bg_color,
            'primary_text': text_color,
            'accent_1': accent_colors[0],
            'accent_2': accent_colors[1],
            'backgrounds': [bg_color],
            'accents': accent_colors,
            'text_colors': {'primary': text_color},
            'colors': [bg_color] + accent_colors,
        }

        messages.append("Applied custom color palette")

    # ── Color palette search (fallback, skipped when brand provides colors) ─
    elif colors_args and colors_args.get('search_query') and not brand_args:
        query = colors_args['search_query']
        logger.info(f"[ThemeExecutor] Searching for color palette: {query}")

        try:
            from services.palette_db_service import PaletteDBService
            pdb = PaletteDBService()

            palettes = pdb.search_palettes(
                query=query,
                limit=5,
                min_colors=3,
                max_colors=7
            )

            logger.info(f"[ThemeExecutor] Found {len(palettes)} palettes for query '{query}'")

            if palettes and len(palettes) > 0:
                palette = palettes[0]
                colors = palette.get('colors', [])

                logger.info(f"[ThemeExecutor] Using palette '{palette.get('name')}' with {len(colors)} colors: {colors}")

                # Parse the query for a specific color intent (e.g., "green", "dark blue")
                intent = _parse_color_intent(query)
                used_intent_override = False

                if intent.get('hue_ranges'):
                    # User asked for a specific color — find the best match
                    # Search ALL returned palettes for the best color match
                    best_match = None
                    for p in palettes:
                        match = _find_best_color_match(p.get('colors', []), intent['hue_ranges'])
                        if match:
                            best_match = match
                            # Use the palette that actually contains the match
                            colors = p.get('colors', [])
                            break

                    if best_match:
                        theme = _build_theme_from_color(best_match, intent.get('prefers_dark', False))
                        bg_color = theme['bg']
                        text_color = theme['text']
                        accent_colors = theme['accents']
                        used_intent_override = True
                        logger.info(f"[ThemeExecutor] Color-intent override: matched {best_match} for '{intent['color_name']}' → bg={bg_color}, accents={accent_colors}")

                if not used_intent_override:
                    # No specific color or no match — use SmartColorSelector
                    backgrounds = palette.get('backgrounds', [])
                    from agents.tools.theme.smart_color_selector import SmartColorSelector
                    color_selector = SmartColorSelector()

                    palette_result = {
                        'colors': colors,
                        'backgrounds': backgrounds if backgrounds else [],
                        'accents': colors[1:] if len(colors) > 1 else [],
                        'text_colors': {'primary': '#1F2937'},
                        'source': 'palette_db'
                    }

                    analysis = {
                        'wants_pink': 'pink' in query.lower(),
                        'prefers_dark': intent.get('prefers_dark', False),
                        'prefers_light': intent.get('prefers_light', True),
                    }
                    assigned_result = color_selector._post_process_colors(palette_result, analysis, preserve_brand_backgrounds=False)

                    assigned_backgrounds = assigned_result.get('backgrounds', [])
                    assigned_accents = assigned_result.get('accents', [])
                    assigned_text = assigned_result.get('text_colors', {}).get('primary', '#1F2937')

                    bg_color = assigned_backgrounds[0] if assigned_backgrounds else colors[0]
                    text_color = assigned_text
                    accent_colors = assigned_accents[:3] if len(assigned_accents) >= 3 else assigned_accents

                logger.info(f"[ThemeExecutor] Assigned colors: bg={bg_color}, text={text_color}, accents={accent_colors}")

                style_preferences['colors'] = {
                    'type': 'custom',
                    'background': bg_color,
                    'accent1': accent_colors[0] if len(accent_colors) > 0 else '#FF4301',
                    'accent2': accent_colors[1] if len(accent_colors) > 1 else accent_colors[0] if len(accent_colors) > 0 else '#FF4301',
                    'accent3': accent_colors[2] if len(accent_colors) > 2 else accent_colors[0] if len(accent_colors) > 0 else '#FF4301',
                    'text': text_color
                }

                theme_updates['color_palette'] = {
                    'primary_background': bg_color,
                    'primary_text': text_color,
                    'accent_1': accent_colors[0] if len(accent_colors) > 0 else '#FF4301',
                    'accent_2': accent_colors[1] if len(accent_colors) > 1 else accent_colors[0] if len(accent_colors) > 0 else '#FF4301',
                    'backgrounds': [bg_color],
                    'accents': accent_colors,
                    'text_colors': {'primary': text_color},
                    'colors': colors
                }

                messages.append(f"Applied '{query}' color palette")
            else:
                messages.append(f"Could not find palette for '{query}'")
        except Exception as e:
            logger.error(f"[ThemeExecutor] Error searching palette: {e}")
            messages.append(f"Error searching palette: {str(e)}")

    # ── Font changes ──────────────────────────────────────────────────────
    if fonts_args:
        font_family = fonts_args.get('family')

        if not font_family:
            outline = None
            title = ''
            if outline_id:
                try:
                    from models.registry import ComponentRegistry
                    registry = ComponentRegistry()
                    outline = registry.get_outline(outline_id)
                    if outline:
                        title = getattr(outline, 'title', '') or ''
                except Exception:
                    pass

            if title:
                title_lower = title.lower()
                fun_keywords = [
                    'pikachu', 'pokemon', 'mario', 'luigi', 'disney', 'mickey',
                    'cartoon', 'game', 'toy', 'character', 'kids', 'children',
                    'fun', 'play', 'party', 'arcade', 'retro', 'gaming', 'birthday',
                    'silly', 'celebration', 'video'
                ]
                is_fun_topic = any(re.search(rf'\b{re.escape(kw)}\b', title_lower) for kw in fun_keywords)

                if is_fun_topic:
                    variety_seed = str(outline_id)
                    try:
                        from services.enhanced_font_service import EnhancedFontService
                        font_svc = EnhancedFontService()
                        pair = font_svc.select_font_pair(
                            deck_title=title,
                            vibe='creative',
                            content_keywords=['fun', 'playful'],
                            variety_seed=variety_seed
                        )
                        font_family = pair['hero']
                        body_font_preset = pair['body']
                    except Exception as e:
                        logger.warning(f"[ThemeExecutor] Font service error for playful: {e}")
                        font_family = 'Poppins'
                        body_font_preset = 'Nunito'
                    logger.info(f"[ThemeExecutor] Fun topic detected! Using fonts: {font_family} / {body_font_preset}")

                    style_preferences['font'] = font_family
                    style_preferences['bodyFont'] = body_font_preset
                    theme_updates['typography'] = {
                        'hero_title': {'family': font_family},
                        'body_text': {'family': body_font_preset}
                    }
                    messages.append(f"Applied playful fonts: {font_family} / {body_font_preset}")
                    font_family = None  # Skip general handling below

            if not font_family and 'font' not in style_preferences:
                try:
                    from services.enhanced_font_service import EnhancedFontService
                    font_svc = EnhancedFontService()
                    pair = font_svc.select_font_pair(
                        deck_title=title or 'presentation',
                        vibe='professional',
                        variety_seed=str(outline_id) if outline_id else None
                    )
                    selected = {'hero': pair['hero'], 'body': pair['body']}
                except Exception as e:
                    logger.warning(f"[ThemeExecutor] Font service error for professional: {e}")
                    selected = {'hero': 'Poppins', 'body': 'Inter'}
                style_preferences['font'] = selected['hero']
                style_preferences['bodyFont'] = selected['body']
                theme_updates['typography'] = {
                    'hero_title': {'family': selected['hero']},
                    'body_text': {'family': selected['body']}
                }
                messages.append(f"Applied fonts: {selected['hero']} / {selected['body']}")
                logger.info(f"[ThemeExecutor] Using fonts from registry: {selected['hero']} / {selected['body']}")

        if font_family:
            body_font = await _ai_select_body_font(font_family, 'presentation')

            logger.info(f"[ThemeExecutor] Applying fonts: hero={font_family}, body={body_font}")
            style_preferences['font'] = font_family
            style_preferences['bodyFont'] = body_font
            theme_updates['typography'] = {
                'hero_title': {'family': font_family},
                'body_text': {'family': body_font}
            }
            messages.append(f"Applied fonts: {font_family} / {body_font}")

    # ── Logo changes ──────────────────────────────────────────────────────
    if logo_args:
        logo_action = logo_args.get('action')

        if logo_action == 'remove':
            logger.info(f"[ThemeExecutor] Removing logo")
            theme_updates['remove_logo'] = True
            messages.append("Removed logo")

        elif logo_action == 'add':
            brand_names = logo_args.get('brand_names', [])
            if brand_names:
                logger.info(f"[ThemeExecutor] Adding logos: {brand_names}")

                try:
                    cache = SimpleBrandfetchCache()
                    brand_name = brand_names[0]

                    brand_domain = f"{brand_name.lower()}.com"
                    brand_data = cache.get_brand_cached(brand_domain)

                    if brand_data and brand_data.get('logos'):
                        from agents.editing.tools.logo_search import get_best_logo
                        logo_variants = get_best_logo(brand_data, prefer_theme="light")
                        logo_url = logo_variants.get('light') or logo_variants.get('dark')

                        if logo_url:
                            style_preferences['logoUrl'] = logo_url
                            if 'brandInfo' not in theme_updates:
                                theme_updates['brandInfo'] = {}
                            theme_updates['brandInfo']['logoUrl'] = logo_url

                            if 'color_palette' not in theme_updates:
                                theme_updates['color_palette'] = {}
                            if 'metadata' not in theme_updates['color_palette']:
                                theme_updates['color_palette']['metadata'] = {}
                            theme_updates['color_palette']['metadata']['logo_url'] = logo_url

                            messages.append(f"Added {brand_name} logo")
                        else:
                            messages.append(f"Could not find logo for {brand_name}")
                    else:
                        messages.append(f"Could not find brand data for {brand_name}")
                except Exception as e:
                    logger.error(f"[ThemeExecutor] Error adding logo: {e}")
                    messages.append(f"Error adding logo: {str(e)}")

    if not messages:
        messages.append("No theme changes applied")

    return {
        "success": True,
        "style_preferences": style_preferences if style_preferences else None,
        "theme_updates": theme_updates if theme_updates else None,
        "message": "; ".join(messages),
    }
