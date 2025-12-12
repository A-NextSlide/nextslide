"""
Utility modules for the NextSlide backend.
"""

# Color utilities - use instead of duplicating brightness/luminance calculations
from utils.color_utils import (
    hex_to_rgb,
    rgb_to_hex,
    hex_to_hsl,
    get_relative_luminance,
    estimate_brightness,
    get_contrast_ratio,
    is_dark_color,
    is_light_color,
    is_near_white,
    is_near_black,
    get_text_color_for_background,
    ensure_contrast,
    get_colorfulness,
    find_lightest_color,
    find_darkest_color,
    find_most_colorful,
    is_valid_hex_color,
    normalize_hex_color,
    blend_colors,
    adjust_brightness,
)

# Logo extraction utilities - use instead of duplicating logo extraction logic
from utils.logo_extractor import (
    extract_logo_from_theme,
    extract_logo_from_style_preferences,
    extract_logo_from_palette,
    extract_logo_from_deck_outline,
    get_logo_for_background,
    find_logo_from_any_source,
    build_logo_metadata,
    inject_logo_into_theme,
    is_valid_logo_url,
)
