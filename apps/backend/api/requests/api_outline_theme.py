"""
API endpoint for applying theme changes from the outline agent.

This endpoint takes theme_changes from the outline agent and applies them
to the outline's theme (stylePreferences and deck theme).
"""
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from services.simple_brandfetch_cache import SimpleBrandfetchCache
from agents.tools.theme.palette_tools import search_palette_by_keywords
from agents.tools.theme.holistic_brand_extractor import HolisticBrandExtractor
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/outline-theme", tags=["outline-theme"])


class ThemeChanges(BaseModel):
    """Theme changes from outline agent"""
    colors: Optional[Dict[str, Any]] = Field(default=None)
    brand: Optional[Dict[str, str]] = Field(default=None)
    fonts: Optional[Dict[str, str]] = Field(default=None)
    logo: Optional[Dict[str, Any]] = Field(default=None)


class ApplyThemeChangesRequest(BaseModel):
    """Request to apply theme changes"""
    outline_id: str = Field(description="ID of the outline to update")
    theme_changes: ThemeChanges = Field(description="Theme changes to apply")


class ApplyThemeChangesResponse(BaseModel):
    """Response with updated theme data"""
    success: bool
    style_preferences: Optional[Dict[str, Any]] = Field(default=None, description="Updated stylePreferences")
    theme_updates: Optional[Dict[str, Any]] = Field(default=None, description="Updates to apply to deck theme")
    message: str


@router.post("/apply")
async def apply_theme_changes(request: ApplyThemeChangesRequest) -> ApplyThemeChangesResponse:
    """
    Apply theme changes from the outline agent.

    Returns updated stylePreferences and theme updates to be merged with the outline.
    """
    try:
        logger.info(f"[OutlineTheme] Applying theme changes for outline {request.outline_id}")

        style_preferences = {}
        theme_updates = {}
        messages = []

        # Handle brand changes (colors + logo from brand)
        if request.theme_changes.brand:
            brand_name = request.theme_changes.brand.get('name')
            brand_url = request.theme_changes.brand.get('url')

            if brand_name or brand_url:
                logger.info(f"[OutlineTheme] Applying brand: {brand_name or brand_url}")

                # Try to get brand data - use SAME flow as ThemeDirector
                try:
                    # First, try brandfetch DB (fastest, most reliable)
                    brand_data = None
                    brand_domain = brand_url if brand_url else None

                    # If no URL provided, construct domain from brand name
                    if not brand_domain and brand_name:
                        import re
                        # Clean brand name for domain
                        cleaned = re.sub(r"[^a-zA-Z0-9\s]", "", brand_name)
                        cleaned = cleaned.lower().replace(' ', '')
                        brand_domain = f"{cleaned}.com"

                    logger.info(f"[OutlineTheme] Trying Brandfetch DB for domain: {brand_domain}")

                    # Try SimpleBrandfetchCache (same as ThemeDirector)
                    import os
                    db_url = os.getenv('DATABASE_URL', 'postgresql://postgres.iureiriffqcxrldisuqp:202War123!!@aws-0-us-west-1.pooler.supabase.com:6543/postgres')
                    async with SimpleBrandfetchCache(db_url) as bf_service:
                        brand_info = await bf_service.get_brand_data(brand_domain)

                        if brand_info and not brand_info.get('error'):
                            # Extract from Brandfetch DB format
                            colors_data = brand_info.get('colors', {})
                            logos_data = brand_info.get('logos', {})

                            all_colors = colors_data.get('all', [])
                            light_colors = [c.get('hex') for c in all_colors if c.get('type') == 'light' and c.get('hex')]
                            dark_colors = [c.get('hex') for c in all_colors if c.get('type') == 'dark' and c.get('hex')]
                            accent_colors_raw = [c.get('hex') for c in all_colors if c.get('type') == 'accent' and c.get('hex')]

                            # Prioritize: accent colors, then dark, then light
                            colors_list = accent_colors_raw + dark_colors + light_colors
                            # Remove duplicates while preserving order
                            colors_list = list(dict.fromkeys(colors_list))

                            brand_data = {
                                'colors': colors_list,
                                'logos': logos_data.get('all', []),
                                'fonts': [f.get('name') for f in brand_info.get('fonts', {}).get('all', []) if f.get('name')]
                            }
                            logger.info(f"[OutlineTheme] Found {len(colors_list)} colors from Brandfetch DB")

                    # Fallback to HolisticBrandExtractor if Brandfetch DB fails
                    if not brand_data:
                        logger.info(f"[OutlineTheme] Brandfetch DB failed, trying HolisticBrandExtractor")
                        extractor = HolisticBrandExtractor()
                        brand_data = await extractor.extract_brand_async(brand_domain)

                    if brand_data:
                        # Extract colors using proper semantic role assignment like ThemeDirector
                        if brand_data.get('colors'):
                            colors = brand_data['colors']

                            from agents.tools.theme.smart_color_selector import SmartColorSelector
                            color_selector = SmartColorSelector()

                            # Format brand colors for post-processing
                            palette_result = {
                                'colors': colors,
                                'backgrounds': [],  # Let post-processing decide
                                'accents': colors[1:] if len(colors) > 1 else [],
                                'text_colors': {'primary': '#1F2937'},
                                'source': 'brand'
                            }

                            # Apply post-processing (same logic as ThemeDirector)
                            analysis = {'wants_pink': False, 'prefers_dark': False, 'prefers_light': True}
                            assigned_result = color_selector._post_process_colors(palette_result, analysis, preserve_brand_backgrounds=True)

                            # Extract assigned colors
                            assigned_backgrounds = assigned_result.get('backgrounds', [])
                            assigned_accents = assigned_result.get('accents', [])
                            assigned_text = assigned_result.get('text_colors', {}).get('primary', '#1F2937')

                            bg_color = assigned_backgrounds[0] if assigned_backgrounds else colors[0]
                            text_color = assigned_text
                            accent_colors = assigned_accents[:3] if len(assigned_accents) >= 3 else assigned_accents

                            logger.info(f"[OutlineTheme] Brand colors assigned: bg={bg_color}, text={text_color}, accents={accent_colors}")

                            style_preferences['colors'] = {
                                'type': 'custom',
                                'background': bg_color,
                                'accent1': accent_colors[0] if len(accent_colors) > 0 else colors[0],
                                'accent2': accent_colors[1] if len(accent_colors) > 1 else accent_colors[0] if len(accent_colors) > 0 else colors[0],
                                'accent3': accent_colors[2] if len(accent_colors) > 2 else accent_colors[0] if len(accent_colors) > 0 else colors[0],
                                'text': text_color
                            }

                            # Also update theme
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
                            # Prefer SVG, then PNG
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
                            font_family = brand_data['fonts'][0]
                            style_preferences['font'] = font_family
                            theme_updates['typography'] = {
                                'hero_title': {'family': font_family},
                                'body_text': {'family': font_family}
                            }

                        messages.append(f"Applied {brand_name or brand_url} brand theme")
                    else:
                        messages.append(f"Could not find brand data for {brand_name or brand_url}")

                except Exception as e:
                    logger.error(f"[OutlineTheme] Error extracting brand data: {e}")
                    messages.append(f"Error applying brand: {str(e)}")

        # Handle color palette search
        elif request.theme_changes.colors and request.theme_changes.colors.get('search_query'):
            query = request.theme_changes.colors['search_query']
            logger.info(f"[OutlineTheme] Searching for color palette: {query}")

            try:
                # Use PaletteDBService directly for better search results
                from services.palette_db_service import PaletteDBService
                pdb = PaletteDBService()

                # Search for palettes matching the query
                palettes = pdb.search_palettes(
                    query=query,
                    limit=5,  # Get top 5 matches
                    min_colors=3,
                    max_colors=7
                )

                logger.info(f"[OutlineTheme] Found {len(palettes)} palettes for query '{query}'")

                if palettes and len(palettes) > 0:
                    palette = palettes[0]  # Get the best match
                    colors = palette.get('colors', [])
                    backgrounds = palette.get('backgrounds', [])

                    logger.info(f"[OutlineTheme] Using palette '{palette.get('name')}' with {len(colors)} colors: {colors}")

                    # Use proper semantic role assignment like ThemeDirector
                    from agents.tools.theme.smart_color_selector import SmartColorSelector
                    color_selector = SmartColorSelector()

                    # Format palette result
                    palette_result = {
                        'colors': colors,
                        'backgrounds': backgrounds if backgrounds else [],
                        'accents': colors[1:] if len(colors) > 1 else [],
                        'text_colors': {'primary': '#1F2937'},
                        'source': 'palette_db'
                    }

                    # Apply post-processing (handles proper background/text/accent assignment)
                    # This uses the same logic as ThemeDirector
                    analysis = {'wants_pink': False, 'prefers_dark': False, 'prefers_light': True}
                    assigned_result = color_selector._post_process_colors(palette_result, analysis, preserve_brand_backgrounds=False)

                    # Extract assigned colors
                    assigned_backgrounds = assigned_result.get('backgrounds', [])
                    assigned_accents = assigned_result.get('accents', [])
                    assigned_text = assigned_result.get('text_colors', {}).get('primary', '#1F2937')

                    bg_color = assigned_backgrounds[0] if assigned_backgrounds else colors[0]
                    text_color = assigned_text
                    accent_colors = assigned_accents[:3] if len(assigned_accents) >= 3 else assigned_accents

                    logger.info(f"[OutlineTheme] Assigned colors: bg={bg_color}, text={text_color}, accents={accent_colors}")

                    style_preferences['colors'] = {
                        'type': 'custom',  # Required by ColorConfigItem model
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
                        'backgrounds': [bg_color] + (backgrounds[1:] if len(backgrounds) > 1 else []),
                        'accents': accent_colors,
                        'text_colors': {'primary': text_color},
                        'colors': colors
                    }

                    messages.append(f"Applied '{query}' color palette")
                else:
                    messages.append(f"Could not find palette for '{query}'")
            except Exception as e:
                logger.error(f"[OutlineTheme] Error searching palette: {e}")
                messages.append(f"Error searching palette: {str(e)}")

        # Handle font changes (with intelligent selection like ThemeDirector)
        if request.theme_changes.fonts:
            font_family = request.theme_changes.fonts.get('family')

            # If no specific font provided, intelligently select based on outline context
            if not font_family:
                # Get outline to check for fun topics
                from models.registry import ComponentRegistry
                registry = ComponentRegistry()
                outline = registry.get_outline(request.outline_id)

                if outline:
                    title = getattr(outline, 'title', '') or ''

                    # Check if this is a fun/playful topic (like Pikachu, Mario, etc.)
                    title_lower = title.lower()
                    is_fun_topic = any(keyword in title_lower for keyword in [
                        'pikachu', 'pokemon', 'mario', 'luigi', 'disney', 'mickey',
                        'cartoon', 'game', 'toy', 'character', 'kids', 'children',
                        'fun', 'play', 'party', 'arcade', 'retro', 'gaming', 'birthday',
                        'silly', 'celebration', 'video'
                    ])

                    if is_fun_topic:
                        # Use playful fonts for fun topics
                        import hashlib
                        variety_seed = str(request.outline_id)
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

                        selected = playful_combos[seed_hash % len(playful_combos)]
                        font_family = selected['hero']
                        logger.info(f"[OutlineTheme] Fun topic detected! Using playful font: {font_family}")

            if font_family:
                logger.info(f"[OutlineTheme] Applying font: {font_family}")
                style_preferences['font'] = font_family
                theme_updates['typography'] = {
                    'hero_title': {'family': font_family},
                    'body_text': {'family': font_family}
                }
                messages.append(f"Applied font: {font_family}")

        # Handle logo changes
        if request.theme_changes.logo:
            logo_action = request.theme_changes.logo.get('action')

            if logo_action == 'remove':
                logger.info(f"[OutlineTheme] Removing logo")
                # Remove logoUrl from stylePreferences (by not including it)
                # The frontend will handle removing it from the outline
                theme_updates['remove_logo'] = True
                messages.append("Removed logo")

            elif logo_action == 'add':
                brand_names = request.theme_changes.logo.get('brand_names', [])
                if brand_names:
                    logger.info(f"[OutlineTheme] Adding logos: {brand_names}")

                    # Try to get logo from first brand
                    try:
                        cache = SimpleBrandfetchCache()
                        brand_name = brand_names[0]

                        # Try to find brand in cache
                        brand_domain = f"{brand_name.lower()}.com"
                        brand_data = cache.get_brand_cached(brand_domain)

                        if brand_data and brand_data.get('logos'):
                            # Get best logo (prefer SVG)
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
                        logger.error(f"[OutlineTheme] Error adding logo: {e}")
                        messages.append(f"Error adding logo: {str(e)}")

        if not messages:
            messages.append("No theme changes applied")

        return ApplyThemeChangesResponse(
            success=True,
            style_preferences=style_preferences if style_preferences else None,
            theme_updates=theme_updates if theme_updates else None,
            message="; ".join(messages)
        )

    except Exception as e:
        logger.error(f"[OutlineTheme] Error applying theme changes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
