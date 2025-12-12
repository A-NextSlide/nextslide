"""
Centralized color utility functions.

This module consolidates all color-related calculations that were previously
duplicated across multiple files (slide_generator, theme_director, custom_component_generator,
color_palette_manager, palette_db_service, brandfetch_service, huemint_palette_service, etc.)

All color operations should use these functions instead of defining their own.
"""

from typing import Tuple, Optional, List
import re


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """
    Convert hex color to RGB tuple.

    Args:
        hex_color: Hex color string (with or without #, 3 or 6 digits)

    Returns:
        Tuple of (r, g, b) values 0-255

    Raises:
        ValueError: If color format is invalid
    """
    hex_color = hex_color.strip().lstrip('#')

    # Handle 3-digit hex
    if len(hex_color) == 3:
        hex_color = ''.join(c * 2 for c in hex_color)

    if len(hex_color) != 6:
        raise ValueError(f"Invalid hex color: {hex_color}")

    try:
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        return (r, g, b)
    except ValueError:
        raise ValueError(f"Invalid hex color: {hex_color}")


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """
    Convert RGB values to hex color string.

    Args:
        r, g, b: RGB values 0-255

    Returns:
        Hex color string with # prefix
    """
    return f"#{r:02x}{g:02x}{b:02x}"


def hex_to_hsl(hex_color: str) -> Tuple[float, float, float]:
    """
    Convert hex color to HSL tuple.

    Args:
        hex_color: Hex color string

    Returns:
        Tuple of (h, s, l) where h is 0-360, s and l are 0-1
    """
    r, g, b = hex_to_rgb(hex_color)
    r, g, b = r / 255.0, g / 255.0, b / 255.0

    max_c = max(r, g, b)
    min_c = min(r, g, b)
    l = (max_c + min_c) / 2.0

    if max_c == min_c:
        return (0.0, 0.0, l)

    d = max_c - min_c
    s = d / (2.0 - max_c - min_c) if l > 0.5 else d / (max_c + min_c)

    if max_c == r:
        h = (g - b) / d + (6.0 if g < b else 0.0)
    elif max_c == g:
        h = (b - r) / d + 2.0
    else:
        h = (r - g) / d + 4.0

    h = h * 60.0
    return (h, s, l)


def _linearize_channel(c: float) -> float:
    """Apply sRGB gamma correction to a single channel (0-1 scale)."""
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def get_relative_luminance(hex_color: str) -> float:
    """
    Calculate WCAG-compliant relative luminance.

    This is the official W3C formula for calculating relative luminance,
    used for determining color contrast ratios.

    Args:
        hex_color: Hex color string

    Returns:
        Relative luminance value between 0 (black) and 1 (white)
    """
    try:
        r, g, b = hex_to_rgb(hex_color)
        r, g, b = r / 255.0, g / 255.0, b / 255.0

        r_lin = _linearize_channel(r)
        g_lin = _linearize_channel(g)
        b_lin = _linearize_channel(b)

        # WCAG formula coefficients
        return 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin
    except Exception:
        return 0.5


def estimate_brightness(hex_color: str) -> float:
    """
    Estimate perceived brightness using simple formula.

    This is a faster approximation than relative luminance,
    suitable for quick comparisons where WCAG compliance isn't required.

    Args:
        hex_color: Hex color string

    Returns:
        Brightness value between 0 (dark) and 1 (light)
    """
    try:
        r, g, b = hex_to_rgb(hex_color)
        # Perceived brightness formula (ITU-R BT.601)
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
    except Exception:
        return 0.5


def get_contrast_ratio(color1: str, color2: str) -> float:
    """
    Calculate WCAG contrast ratio between two colors.

    Args:
        color1: First hex color
        color2: Second hex color

    Returns:
        Contrast ratio from 1 (same color) to 21 (black/white)
    """
    l1 = get_relative_luminance(color1)
    l2 = get_relative_luminance(color2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def is_dark_color(hex_color: str, threshold: float = 0.5) -> bool:
    """
    Determine if a color is dark.

    Args:
        hex_color: Hex color string
        threshold: Luminance threshold (default 0.5)

    Returns:
        True if color is dark, False if light
    """
    return get_relative_luminance(hex_color) < threshold


def is_light_color(hex_color: str, threshold: float = 0.5) -> bool:
    """
    Determine if a color is light.

    Args:
        hex_color: Hex color string
        threshold: Luminance threshold (default 0.5)

    Returns:
        True if color is light, False if dark
    """
    return get_relative_luminance(hex_color) >= threshold


def is_near_white(hex_color: str, threshold: float = 0.97) -> bool:
    """
    Check if a color is near white.

    Args:
        hex_color: Hex color string
        threshold: Brightness threshold (default 0.97)

    Returns:
        True if color is very close to white
    """
    try:
        if not isinstance(hex_color, str):
            return False
        s = hex_color.strip().lower()
        if s in ['#fff', '#ffffff', '#fefefe', '#fdfdfd']:
            return True
        return estimate_brightness(hex_color) > threshold
    except Exception:
        return False


def is_near_black(hex_color: str, threshold: float = 0.03) -> bool:
    """
    Check if a color is near black.

    Args:
        hex_color: Hex color string
        threshold: Brightness threshold (default 0.03)

    Returns:
        True if color is very close to black
    """
    try:
        if not isinstance(hex_color, str):
            return False
        s = hex_color.strip().lower()
        if s in ['#000', '#000000', '#010101', '#020202']:
            return True
        return estimate_brightness(hex_color) < threshold
    except Exception:
        return False


def get_text_color_for_background(background: str,
                                   light_text: str = '#FFFFFF',
                                   dark_text: str = '#1A1A1A') -> str:
    """
    Determine appropriate text color for a given background.

    Args:
        background: Background hex color
        light_text: Color to use on dark backgrounds (default white)
        dark_text: Color to use on light backgrounds (default near-black)

    Returns:
        Appropriate text color for readability
    """
    return light_text if is_dark_color(background) else dark_text


def ensure_contrast(foreground: str, background: str,
                    min_ratio: float = 4.5) -> str:
    """
    Ensure foreground color has sufficient contrast with background.

    If contrast is insufficient, returns white or black depending on background.

    Args:
        foreground: Foreground hex color
        background: Background hex color
        min_ratio: Minimum contrast ratio required (default 4.5 for WCAG AA)

    Returns:
        Original foreground if contrast is sufficient, otherwise high-contrast alternative
    """
    ratio = get_contrast_ratio(foreground, background)
    if ratio >= min_ratio:
        return foreground
    return get_text_color_for_background(background)


def get_colorfulness(hex_color: str) -> float:
    """
    Calculate how colorful/saturated a color is.

    Args:
        hex_color: Hex color string

    Returns:
        Colorfulness score from 0 (grayscale) to 1 (fully saturated)
    """
    try:
        _, saturation, _ = hex_to_hsl(hex_color)
        return saturation
    except Exception:
        return 0.0


def find_lightest_color(colors: List[str]) -> Optional[str]:
    """
    Find the lightest color in a list.

    Args:
        colors: List of hex color strings

    Returns:
        Lightest color or None if list is empty/invalid
    """
    try:
        if not colors:
            return None
        return sorted(colors, key=lambda c: estimate_brightness(c), reverse=True)[0]
    except Exception:
        return None


def find_darkest_color(colors: List[str]) -> Optional[str]:
    """
    Find the darkest color in a list.

    Args:
        colors: List of hex color strings

    Returns:
        Darkest color or None if list is empty/invalid
    """
    try:
        if not colors:
            return None
        return sorted(colors, key=lambda c: estimate_brightness(c))[0]
    except Exception:
        return None


def find_most_colorful(colors: List[str]) -> Optional[str]:
    """
    Find the most saturated/colorful color in a list.

    Args:
        colors: List of hex color strings

    Returns:
        Most colorful color or None if list is empty/invalid
    """
    try:
        if not colors:
            return None
        return sorted(colors, key=lambda c: get_colorfulness(c), reverse=True)[0]
    except Exception:
        return None


def is_valid_hex_color(color: str) -> bool:
    """
    Check if a string is a valid hex color.

    Args:
        color: String to validate

    Returns:
        True if valid hex color format
    """
    if not isinstance(color, str):
        return False
    pattern = r'^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'
    return bool(re.match(pattern, color.strip()))


def normalize_hex_color(color: str) -> str:
    """
    Normalize a hex color to 6-digit lowercase format with # prefix.

    Args:
        color: Hex color string

    Returns:
        Normalized hex color (e.g., "#abcdef")

    Raises:
        ValueError: If color format is invalid
    """
    if not is_valid_hex_color(color):
        raise ValueError(f"Invalid hex color: {color}")

    color = color.strip().lstrip('#').lower()
    if len(color) == 3:
        color = ''.join(c * 2 for c in color)

    return f"#{color}"


def blend_colors(color1: str, color2: str, weight: float = 0.5) -> str:
    """
    Blend two colors together.

    Args:
        color1: First hex color
        color2: Second hex color
        weight: Weight of color1 (0-1, default 0.5 for equal blend)

    Returns:
        Blended hex color
    """
    r1, g1, b1 = hex_to_rgb(color1)
    r2, g2, b2 = hex_to_rgb(color2)

    r = int(r1 * weight + r2 * (1 - weight))
    g = int(g1 * weight + g2 * (1 - weight))
    b = int(b1 * weight + b2 * (1 - weight))

    return rgb_to_hex(r, g, b)


def adjust_brightness(hex_color: str, factor: float) -> str:
    """
    Adjust the brightness of a color.

    Args:
        hex_color: Hex color string
        factor: Brightness factor (>1 = lighter, <1 = darker)

    Returns:
        Adjusted hex color
    """
    r, g, b = hex_to_rgb(hex_color)

    r = min(255, max(0, int(r * factor)))
    g = min(255, max(0, int(g * factor)))
    b = min(255, max(0, int(b * factor)))

    return rgb_to_hex(r, g, b)
