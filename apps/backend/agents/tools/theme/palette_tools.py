"""Palette-specific tools for color selection and filtering."""

import random
from typing import Dict, List, Optional, Any
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


def search_palette_by_topic(
    topic: str,
    style_preferences: Optional[Dict[str, Any]] = None,
    limit: int = 5
) -> List[Dict[str, Any]]:
    """Search palette database by topic.
    
    Args:
        topic: Topic to search for
        style_preferences: Optional style preferences to guide search
        limit: Maximum number of palettes to return
        
    Returns:
        List of palette dictionaries
    """
    try:
        from services.palette_db_service import PaletteDBService
        pdb = PaletteDBService()

        # Prefer ranked candidates (contrast-aware) over repeated random picks
        candidates = pdb.get_palette_candidates_for_topic(
            topic=topic,
            style_preferences=style_preferences,
            max_candidates=limit
        ) or []

        if candidates:
            return candidates[:limit]

        # Fallback to prior behavior if candidates API returns nothing
        palettes = []
        for i in range(limit):
            palette = pdb.get_palette_for_topic(
                topic,
                style_preferences=style_preferences,
                randomize=True
            )
            if palette and palette not in palettes:
                palettes.append(palette)
        return palettes
    except Exception as e:
        logger.error(f"Error searching palettes by topic: {e}")
        return []


def search_palette_by_keywords(
    keywords: List[str],
    limit: int = 5
) -> List[Dict[str, Any]]:
    """Search palette database by keywords.
    
    Args:
        keywords: Keywords to search for
        limit: Maximum number of palettes to return
        
    Returns:
        List of palette dictionaries
    """
    try:
        from services.palette_db_service import PaletteDBService
        pdb = PaletteDBService()
        
        # Search by keywords
        results = pdb.search_palette_by_keywords(keywords, limit=limit)
        return results if isinstance(results, list) else [results] if results else []
    except Exception as e:
        logger.error(f"Error searching palettes by keywords: {e}")
        return []


def get_random_palette(exclude_pink: bool = True, variety_seed: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get a random palette from the database.
    
    Args:
        exclude_pink: Whether to exclude pink-dominant palettes
        variety_seed: Optional seed for deterministic randomness
        
    Returns:
        Random palette dictionary or None
    """
    try:
        from services.palette_db_service import PaletteDBService
        pdb = PaletteDBService()

        # Contrast helper
        def _best_contrast_score(colors: List[str]) -> float:
            if not colors:
                return 0.0
            def _hex_to_rgb(hx: str) -> tuple:
                h = hx.lstrip('#')
                return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
            def _lin(c: float) -> float:
                c = c / 255.0
                return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
            def _lum(hx: str) -> float:
                try:
                    r, g, b = _hex_to_rgb(hx)
                    R = _lin(r); G = _lin(g); B = _lin(b)
                    return 0.2126 * R + 0.7152 * G + 0.0722 * B
                except Exception:
                    return 0.5
            def _cr(c1: str, c2: str) -> float:
                L1 = _lum(c1); L2 = _lum(c2)
                hi, lo = (max(L1, L2), min(L1, L2))
                return (hi + 0.05) / (lo + 0.05)
            pool = list(colors) + ['#000000', '#FFFFFF']
            best = 0.0
            for bg in colors:
                for tx in pool:
                    if tx == bg:
                        continue
                    best = max(best, _cr(bg, tx))
            return best

        # We'll fetch random pools later (after defining saturation helpers) and build candidates

        # Exclude grey-heavy palettes with too little saturation across colors
        def _hex_to_hsl(hex_color: str):
            try:
                h = hex_color.lstrip('#')
                r = int(h[0:2], 16) / 255.0
                g = int(h[2:4], 16) / 255.0
                b = int(h[4:6], 16) / 255.0
                mx = max(r, g, b); mn = min(r, g, b)
                l = (mx + mn) / 2.0
                if mx == mn:
                    return (0.0, 0.0, l)
                d = mx - mn
                s = d / (2.0 - mx - mn) if l > 0.5 else d / (mx + mn)
                if mx == r:
                    h_deg = (g - b) / d + (6 if g < b else 0)
                elif mx == g:
                    h_deg = (b - r) / d + 2
                else:
                    h_deg = (r - g) / d + 4
                return (h_deg * 60.0 % 360.0, s, l)
            except Exception:
                return (0.0, 0.0, 0.5)

        def _palette_saturation_score(p: Dict[str, Any]) -> float:
            cols = p.get('colors') or []
            if not cols:
                return 0.0
            sats = []
            for c in cols:
                if not isinstance(c, str) or not c.startswith('#') or len(c) < 7:
                    continue
                _h, s, _l = _hex_to_hsl(c)
                sats.append(s)
            try:
                import numpy as _np
                return float(_np.mean(sats)) if sats else 0.0
            except Exception:
                return sum(sats) / max(1, len(sats))

        # Fetch and filter random pools until we find colorful options
        candidates: List[Dict[str, Any]] = []
        for attempt in range(3):
            pool = pdb.get_random_palettes(
                count=80 if attempt == 0 else 160,
                category='presentation',
                include_tags=None,
                exclude_tags=['pink', 'magenta']
            ) or []
            if exclude_pink:
                pool = [p for p in pool if not _has_pink_colors(p.get('colors', []))]
            colorful = [p for p in pool if _palette_saturation_score(p) >= 0.18]
            if colorful:
                candidates = colorful
                break

        # If nothing colorful found or DB unavailable, fallback to curated set (non-dark-first)
        if not candidates:
            curated: List[Dict[str, Any]] = [
                {"name": "Sunset Citrus", "colors": ["#FF7A59", "#FFC145", "#2EC4B6", "#1B9AAA"], "tags": ["sunset","warm","vibrant"], "category": "presentation"},
                {"name": "Forest Trail", "colors": ["#2D6A4F", "#95D5B2", "#40916C", "#E9F5EC"], "tags": ["nature","green","calm"], "category": "presentation"},
                {"name": "Royal Tech", "colors": ["#5B21B6", "#10B981", "#F59E0B", "#111827"], "tags": ["tech","bold"], "category": "presentation"},
                {"name": "Ocean Breeze", "colors": ["#00A8E8", "#90E0EF", "#CAF0F8", "#0077B6"], "tags": ["ocean","cool","bright"], "category": "presentation"},
                {"name": "Citrus Pop", "colors": ["#F59E0B", "#EF4444", "#22C55E", "#FFFFFF"], "tags": ["playful","vibrant"], "category": "presentation"},
                {"name": "Modern Coral", "colors": ["#FF6B6B", "#FFE66D", "#4ECDC4", "#FFFFFF"], "tags": ["modern","bright"], "category": "presentation"},
                {"name": "Business Blue", "colors": ["#0EA5E9", "#1D4ED8", "#60A5FA", "#F3F4F6"], "tags": ["corporate","clean"], "category": "presentation"},
                {"name": "Earth Tone", "colors": ["#8D6E63", "#D7CCC8", "#A1887F", "#FFF8E1"], "tags": ["earth","muted"], "category": "presentation"},
                {"name": "Teal Accent", "colors": ["#0D9488", "#14B8A6", "#A7F3D0", "#F0FDFA"], "tags": ["teal","fresh"], "category": "presentation"},
                {"name": "Purple Gradient", "colors": ["#7C3AED", "#A78BFA", "#C4B5FD", "#F5F3FF"], "tags": ["purple","creative"], "category": "presentation"},
            ]
            if exclude_pink:
                curated = [p for p in curated if not _has_pink_colors(p.get('colors', []))]
            candidates = curated

        colorful = [p for p in candidates if _palette_saturation_score(p) >= 0.18]
        if colorful:
            candidates = colorful

        # Prefer higher-contrast palettes (within colorful set if available)
        candidates.sort(key=lambda p: _best_contrast_score(p.get('colors') or []), reverse=True)
        
        # Use variety seed to select different high-quality palettes
        if variety_seed and candidates:
            # Take top 10 candidates or all if less
            top_candidates = candidates[:min(10, len(candidates))]
            seed_hash = hash(variety_seed) % len(top_candidates)
            return top_candidates[seed_hash]
        
        return candidates[0] if candidates else None
    except Exception as e:
        logger.error(f"Error getting random palette: {e}")
        # Final curated fallback if DB access failed entirely
        fallback = [
            {"name": "Sunset Citrus", "colors": ["#FF7A59", "#FFC145", "#2EC4B6", "#1B9AAA"], "tags": ["sunset","warm","vibrant"], "category": "presentation"},
            {"name": "Ocean Breeze", "colors": ["#00A8E8", "#90E0EF", "#CAF0F8", "#0077B6"], "tags": ["ocean","cool","bright"], "category": "presentation"},
            {"name": "Business Blue", "colors": ["#0EA5E9", "#1D4ED8", "#60A5FA", "#F3F4F6"], "tags": ["corporate","clean"], "category": "presentation"},
        ]
        try:
            return fallback[abs(hash(variety_seed or '0')) % len(fallback)]
        except Exception:
            return fallback[0]


def filter_out_pink_colors(colors: List[str]) -> List[str]:
    """Filter out pink colors from a color list.
    
    Args:
        colors: List of hex color codes
        
    Returns:
        Filtered list without pink colors
    """
    filtered = []
    for color in colors:
        if not _is_pink_color(color):
            filtered.append(color)
    
    # If all colors were pink, return original list
    return filtered if filtered else colors


def _has_pink_colors(colors: List[str]) -> bool:
    """Check if a color list contains pink colors."""
    for color in colors:
        if _is_pink_color(color):
            return True
    return False


def _is_pink_color(hex_color: str) -> bool:
    """Check if a hex color is pink/magenta."""
    try:
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        
        # Pink colors typically have:
        # - High red value
        # - Medium to high blue value
        # - Lower green value
        # - Red > Green and Blue > Green
        
        # Calculate ratios
        if g == 0:
            g = 1  # Avoid division by zero
        
        red_ratio = r / 255.0
        green_ratio = g / 255.0
        blue_ratio = b / 255.0
        
        # Check for pink characteristics
        is_pink = (
            red_ratio > 0.7 and  # High red
            blue_ratio > 0.5 and  # Medium-high blue
            red_ratio > green_ratio * 1.5 and  # Red significantly higher than green
            blue_ratio > green_ratio * 1.2  # Blue higher than green
        )
        
        # Also check for specific pink hues
        # HSL-based check for pink/magenta hues (300-340 degrees)
        max_val = max(r, g, b) / 255.0
        min_val = min(r, g, b) / 255.0
        
        if max_val == min_val:
            hue = 0
        else:
            delta = max_val - min_val
            if max_val == red_ratio:
                hue = ((blue_ratio - green_ratio) / delta) % 6
            elif max_val == green_ratio:
                hue = (red_ratio - blue_ratio) / delta + 2
            else:
                hue = (green_ratio - red_ratio) / delta + 4
            hue = hue * 60
        
        # Pink hues are typically between 280-340 degrees
        is_pink_hue = 280 <= hue <= 340 or hue <= 20
        
        # Also check for light pink (high brightness, slight red tint)
        brightness = max_val
        saturation = 0 if max_val == 0 else delta / max_val
        is_light_pink = (
            brightness > 0.9 and
            red_ratio > blue_ratio and
            red_ratio > green_ratio and
            saturation > 0.1
        )
        
        return is_pink or (is_pink_hue and saturation > 0.3) or is_light_pink
        
    except Exception as e:
        logger.debug(f"Error checking if color is pink: {e}")
        return False


def build_simple_gradients(color_palette: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Build simple gradient definitions from a color palette.
    
    Args:
        color_palette: Color palette dictionary
        
    Returns:
        List of gradient definitions
    """
    gradients = []
    
    # Extract colors
    primary_bg = color_palette.get('primary_background', '#0A0E27')
    secondary_bg = color_palette.get('secondary_background', '#1A1F3A')
    accent_1 = color_palette.get('accent_1', '#2563EB')
    accent_2 = color_palette.get('accent_2', '#7C3AED')
    
    # Create gradient variations
    gradients.append({
        "name": "primary_gradient",
        "type": "linear",
        "angle": 135,
        "colors": [primary_bg, _darken_color(primary_bg, 0.2)]
    })
    
    gradients.append({
        "name": "accent_gradient",
        "type": "linear", 
        "angle": 45,
        "colors": [accent_1, accent_2]
    })
    
    gradients.append({
        "name": "background_gradient",
        "type": "radial",
        "colors": [_lighten_color(primary_bg, 0.1), primary_bg, _darken_color(primary_bg, 0.1)]
    })
    
    gradients.append({
        "name": "subtle_gradient",
        "type": "linear",
        "angle": 180,
        "colors": [primary_bg, secondary_bg]
    })
    
    return gradients


def _darken_color(hex_color: str, factor: float) -> str:
    """Darken a color by a factor (0-1)."""
    try:
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        
        # Darken
        r = int(r * (1 - factor))
        g = int(g * (1 - factor))
        b = int(b * (1 - factor))
        
        return f"#{r:02X}{g:02X}{b:02X}"
    except Exception:
        return hex_color


def _lighten_color(hex_color: str, factor: float) -> str:
    """Lighten a color by a factor (0-1)."""
    try:
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        
        # Lighten
        r = int(r + (255 - r) * factor)
        g = int(g + (255 - g) * factor)
        b = int(b + (255 - b) * factor)
        
        return f"#{r:02X}{g:02X}{b:02X}"
    except Exception:
        return hex_color