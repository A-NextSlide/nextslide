"""
Centralized logo extraction utilities.

This module consolidates all logo-related extraction logic that was previously
scattered across slide_generator, custom_component_generator, theme_director,
and adapters.

All logo operations should use these functions instead of duplicating logic.
"""

from typing import Dict, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


def extract_logo_from_theme(theme: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract logo URLs from a theme dictionary.

    Checks multiple possible locations where logos might be stored in a theme.

    Args:
        theme: Theme dictionary

    Returns:
        Tuple of (logo_url, logo_url_dark) - either can be None
    """
    if not theme or not isinstance(theme, dict):
        return None, None

    logo_url = None
    logo_url_dark = None

    # Try theme.logo.url
    logo_obj = theme.get('logo')
    if isinstance(logo_obj, dict):
        logo_url = logo_obj.get('url')

    # Try theme.brandInfo.logoUrl
    if not logo_url:
        brand_info = theme.get('brandInfo', {})
        if isinstance(brand_info, dict):
            logo_url = brand_info.get('logoUrl')
            logo_url_dark = brand_info.get('logoUrlDark')

    # Try theme.color_palette.metadata.logo_url
    if not logo_url:
        color_palette = theme.get('color_palette', {})
        if isinstance(color_palette, dict):
            metadata = color_palette.get('metadata', {})
            if isinstance(metadata, dict):
                logo_url = metadata.get('logo_url') or metadata.get('logo_url_light')
                logo_url_dark = metadata.get('logo_url_dark')

    # Try theme.metadata.logo_url
    if not logo_url:
        metadata = theme.get('metadata', {})
        if isinstance(metadata, dict):
            logo_url = metadata.get('logo_url') or metadata.get('logo_url_light')
            logo_url_dark = metadata.get('logo_url_dark')

    return logo_url, logo_url_dark


def extract_logo_from_style_preferences(style_prefs: Any) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract logo URLs from style preferences object.

    Args:
        style_prefs: Style preferences (can be dict or object with attributes)

    Returns:
        Tuple of (logo_url, logo_url_dark) - either can be None
    """
    if not style_prefs:
        return None, None

    logo_url = None
    logo_url_dark = None

    # Handle dict-style access
    if isinstance(style_prefs, dict):
        logo_url = style_prefs.get('logoUrl') or style_prefs.get('logo_url')
        logo_url_dark = style_prefs.get('logoUrlDark') or style_prefs.get('logo_url_dark')

        # Check nested deck_theme
        deck_theme = style_prefs.get('deck_theme')
        if not logo_url and deck_theme:
            logo_url, logo_url_dark = extract_logo_from_theme(deck_theme)

    # Handle object-style access
    else:
        logo_url = getattr(style_prefs, 'logoUrl', None) or getattr(style_prefs, 'logo_url', None)
        logo_url_dark = getattr(style_prefs, 'logoUrlDark', None) or getattr(style_prefs, 'logo_url_dark', None)

        # Check nested deck_theme
        deck_theme = getattr(style_prefs, 'deck_theme', None)
        if not logo_url and deck_theme:
            logo_url, logo_url_dark = extract_logo_from_theme(deck_theme)

    return logo_url, logo_url_dark


def extract_logo_from_palette(palette: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract logo URLs from a color palette dictionary.

    Args:
        palette: Palette dictionary

    Returns:
        Tuple of (logo_url, logo_url_dark) - either can be None
    """
    if not palette or not isinstance(palette, dict):
        return None, None

    logo_url = None
    logo_url_dark = None

    # Try palette.logo_url directly
    logo_url = palette.get('logo_url')

    # Try palette.metadata
    if not logo_url:
        metadata = palette.get('metadata', {})
        if isinstance(metadata, dict):
            logo_url = metadata.get('logo_url') or metadata.get('logo_url_light')
            logo_url_dark = metadata.get('logo_url_dark')

    return logo_url, logo_url_dark


def extract_logo_from_deck_outline(deck_outline: Any) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract logo URLs from a deck outline.

    Checks stylePreferences and any embedded theme data.

    Args:
        deck_outline: Deck outline object

    Returns:
        Tuple of (logo_url, logo_url_dark) - either can be None
    """
    if not deck_outline:
        return None, None

    # Try stylePreferences first
    style_prefs = None
    if hasattr(deck_outline, 'stylePreferences'):
        style_prefs = deck_outline.stylePreferences
    elif isinstance(deck_outline, dict):
        style_prefs = deck_outline.get('stylePreferences')

    if style_prefs:
        logo_url, logo_url_dark = extract_logo_from_style_preferences(style_prefs)
        if logo_url:
            return logo_url, logo_url_dark

    return None, None


def get_logo_for_background(
    theme: Dict[str, Any],
    is_dark_background: bool
) -> Optional[str]:
    """
    Get the appropriate logo variant for a given background.

    If the background is dark, prefer the light/standard logo.
    If the background is light, prefer the dark logo variant (if available).

    Args:
        theme: Theme dictionary containing logo URLs
        is_dark_background: Whether the background is dark

    Returns:
        Appropriate logo URL or None
    """
    logo_url, logo_url_dark = extract_logo_from_theme(theme)

    if is_dark_background:
        # Dark background - use standard (light) logo
        return logo_url
    else:
        # Light background - prefer dark logo, fallback to standard
        return logo_url_dark or logo_url


def find_logo_from_any_source(
    theme: Optional[Dict[str, Any]] = None,
    style_prefs: Any = None,
    palette: Optional[Dict[str, Any]] = None,
    deck_outline: Any = None
) -> Tuple[Optional[str], Optional[str]]:
    """
    Find logo URLs from any available source.

    Checks all possible sources in priority order:
    1. Style preferences (most specific)
    2. Theme
    3. Palette
    4. Deck outline

    Args:
        theme: Theme dictionary
        style_prefs: Style preferences
        palette: Color palette dictionary
        deck_outline: Deck outline

    Returns:
        Tuple of (logo_url, logo_url_dark) - either can be None
    """
    # Try style preferences first
    if style_prefs:
        logo_url, logo_url_dark = extract_logo_from_style_preferences(style_prefs)
        if logo_url:
            return logo_url, logo_url_dark

    # Try theme
    if theme:
        logo_url, logo_url_dark = extract_logo_from_theme(theme)
        if logo_url:
            return logo_url, logo_url_dark

    # Try palette
    if palette:
        logo_url, logo_url_dark = extract_logo_from_palette(palette)
        if logo_url:
            return logo_url, logo_url_dark

    # Try deck outline
    if deck_outline:
        logo_url, logo_url_dark = extract_logo_from_deck_outline(deck_outline)
        if logo_url:
            return logo_url, logo_url_dark

    return None, None


def build_logo_metadata(
    logo_url: Optional[str],
    logo_url_dark: Optional[str] = None
) -> Dict[str, Any]:
    """
    Build a standardized logo metadata dictionary.

    Args:
        logo_url: Standard/light logo URL
        logo_url_dark: Dark variant logo URL

    Returns:
        Dictionary with logo metadata (empty if no logos)
    """
    if not logo_url:
        return {}

    metadata = {
        "logo_url": logo_url,
        "logo_url_light": logo_url
    }

    if logo_url_dark:
        metadata["logo_url_dark"] = logo_url_dark

    return metadata


def inject_logo_into_theme(
    theme: Dict[str, Any],
    logo_url: Optional[str],
    logo_url_dark: Optional[str] = None
) -> Dict[str, Any]:
    """
    Inject logo URLs into a theme dictionary.

    Updates the theme in-place and returns it.

    Args:
        theme: Theme dictionary to update
        logo_url: Standard/light logo URL
        logo_url_dark: Dark variant logo URL

    Returns:
        Updated theme dictionary
    """
    if not logo_url:
        return theme

    # Ensure brandInfo exists
    if 'brandInfo' not in theme:
        theme['brandInfo'] = {}

    theme['brandInfo']['logoUrl'] = logo_url
    if logo_url_dark:
        theme['brandInfo']['logoUrlDark'] = logo_url_dark

    # Also update color_palette metadata if it exists
    if 'color_palette' in theme and isinstance(theme['color_palette'], dict):
        if 'metadata' not in theme['color_palette']:
            theme['color_palette']['metadata'] = {}
        theme['color_palette']['metadata']['logo_url'] = logo_url
        theme['color_palette']['metadata']['logo_url_light'] = logo_url
        if logo_url_dark:
            theme['color_palette']['metadata']['logo_url_dark'] = logo_url_dark

    return theme


def is_valid_logo_url(url: Optional[str]) -> bool:
    """
    Check if a URL looks like a valid logo URL.

    Args:
        url: URL string to validate

    Returns:
        True if URL appears to be a valid logo URL
    """
    if not url or not isinstance(url, str):
        return False

    url = url.strip()

    # Must be a URL
    if not (url.startswith('http://') or url.startswith('https://') or url.startswith('data:')):
        return False

    # Should have some length
    if len(url) < 10:
        return False

    return True


def get_logo_with_inversion(
    theme: Dict[str, Any],
    background_color: Optional[str] = None
) -> Tuple[Optional[str], bool]:
    """
    Extract logo URL from theme dict.

    Simply returns the first available logo URL without any manipulation.
    The second return value is always False (kept for API compatibility).

    Args:
        theme: Theme dictionary
        background_color: Ignored (kept for API compatibility)

    Returns:
        Tuple of (logo_url, False):
        - logo_url: First available logo URL, or None if not found
        - False: Always False (no inversion logic)
    """
    if not theme:
        return None, False

    logo_url = None

    # Try brandInfo.logoUrl first
    brand_info = theme.get('brandInfo', {})
    if isinstance(brand_info, dict):
        logo_url = brand_info.get('logoUrl') or brand_info.get('logoUrlLight') or brand_info.get('logoUrlDark')

    # Try color_palette.metadata.logo_url
    if not logo_url:
        color_palette = theme.get('color_palette', {})
        if isinstance(color_palette, dict):
            metadata = color_palette.get('metadata', {})
            if isinstance(metadata, dict):
                logo_url = metadata.get('logo_url') or metadata.get('logo_url_light') or metadata.get('logo_url_dark')

    # Try theme.logo.url or theme.logo (direct string)
    if not logo_url:
        logo = theme.get('logo')
        if isinstance(logo, dict):
            logo_url = logo.get('url')
        elif isinstance(logo, str) and logo.startswith('http'):
            logo_url = logo

    return logo_url, False
