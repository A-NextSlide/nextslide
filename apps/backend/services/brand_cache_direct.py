"""
Direct Brand Cache Lookup - Simple, fast, no complexity.

This module provides a direct lookup for curated brand data from the cache.
If a brand exists in the cache (especially admin-curated), use it directly
without any validation, AI fallbacks, or complex processing.
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from supabase import create_client, Client

logger = logging.getLogger(__name__)


def _get_supabase() -> Client:
    """Get Supabase client."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return create_client(url, key)


def get_cached_brand_direct(domain_or_name: str) -> Optional[Dict[str, Any]]:
    """
    Direct lookup of brand data from cache. No API calls, no validation.

    Args:
        domain_or_name: Domain (instacart.com) or brand name (Instacart)

    Returns:
        Dict with brand data if found, None otherwise.
        Structure: {
            "found": True,
            "domain": "instacart.com",
            "brand_name": "Instacart",
            "colors": {
                "accent": "#FF7009",
                "accent2": "#0AAD0A",
                "background": "#FAF1E5",
                "text": "#003D29"
            },
            "fonts": {
                "hero": "Playfair Display",
                "body": "Open Sans"
            },
            "logo_url": "https://...",
            "raw_api_response": {...}  # Full cached data
        }
    """
    try:
        supabase = _get_supabase()

        # Normalize the lookup key
        normalized = domain_or_name.lower().strip()
        normalized = normalized.replace('https://', '').replace('http://', '').replace('www.', '')
        if '/' in normalized:
            normalized = normalized.split('/')[0]

        # Try exact domain match first
        result = supabase.table("brandfetch_cache").select("*").eq(
            "normalized_identifier", normalized
        ).execute()

        # If not found, try with .com appended
        if not result.data:
            if '.' not in normalized:
                result = supabase.table("brandfetch_cache").select("*").eq(
                    "normalized_identifier", f"{normalized}.com"
                ).execute()

        # If still not found, try searching by identifier
        if not result.data:
            result = supabase.table("brandfetch_cache").select("*").ilike(
                "identifier", f"%{normalized}%"
            ).limit(1).execute()

        if not result.data:
            logger.info(f"[BrandCacheDirect] No cached data for: {domain_or_name}")
            return None

        cached = result.data[0]
        api_response = cached.get("api_response", {})

        if not api_response or not isinstance(api_response, dict):
            logger.warning(f"[BrandCacheDirect] Invalid api_response for: {domain_or_name}")
            return None

        # Extract colors - check multiple possible structures
        colors = _extract_colors(api_response)
        fonts = _extract_fonts(api_response)
        logo_url = _extract_logo(api_response)

        brand_data = {
            "found": True,
            "domain": api_response.get("domain") or cached.get("normalized_identifier"),
            "brand_name": api_response.get("brand_name") or api_response.get("name"),
            "colors": colors,
            "fonts": fonts,
            "logo_url": logo_url,
            "raw_api_response": api_response
        }

        logger.info(
            f"[BrandCacheDirect] Found cached brand: {brand_data['domain']} - "
            f"colors: {colors}, fonts: {fonts}"
        )

        return brand_data

    except Exception as e:
        logger.error(f"[BrandCacheDirect] Error looking up brand {domain_or_name}: {e}")
        return None


def _extract_colors(api_response: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """Extract colors from api_response, handling multiple structures."""
    colors = api_response.get("colors", {})

    # Structure 1: Direct color keys (admin-curated format)
    # colors: { accent: "#FF7009", accent2: "#0AAD0A", background: "#FAF1E5", text: "#003D29" }
    if isinstance(colors, dict):
        accent = colors.get("accent") or colors.get("accent_1") or colors.get("primary")
        accent2 = colors.get("accent2") or colors.get("accent_2") or colors.get("secondary")
        background = colors.get("background") or colors.get("primary_background") or colors.get("bg")
        text = colors.get("text") or colors.get("primary_text") or colors.get("textPrimary")

        # If direct keys found, use them
        if accent or background:
            # Also try extracting from nested structures
            if not accent:
                accent = _extract_first_hex(colors.get("primary", []))
            if not accent:
                accent = _extract_first_hex(colors.get("accent", []))
            if not background:
                background = _extract_first_hex(colors.get("background", []))
            if not text:
                text = _extract_first_hex(colors.get("text", []))

            return {
                "accent": _normalize_hex(accent),
                "accent2": _normalize_hex(accent2),
                "background": _normalize_hex(background) or "#FFFFFF",
                "text": _normalize_hex(text) or "#1A1A1A"
            }

        # Structure 2: Brandfetch API format with arrays
        # colors: { primary: [{hex: "#0AAD0A"}], accent: [{hex: "#FF7009"}], ... }
        primary_colors = _extract_hex_list(colors.get("primary", []))
        accent_colors = _extract_hex_list(colors.get("accent", []))
        background_colors = _extract_hex_list(colors.get("background", []))
        text_colors = _extract_hex_list(colors.get("text", []))
        hex_list = colors.get("hex_list", [])

        # Build result from available data
        result_accent = accent_colors[0] if accent_colors else (primary_colors[0] if primary_colors else None)
        result_accent2 = accent_colors[1] if len(accent_colors) > 1 else (primary_colors[1] if len(primary_colors) > 1 else None)
        result_bg = background_colors[0] if background_colors else None
        result_text = text_colors[0] if text_colors else None

        # Fallback to hex_list
        if not result_accent and hex_list:
            result_accent = hex_list[0] if hex_list else None
        if not result_accent2 and len(hex_list) > 1:
            result_accent2 = hex_list[1]

        return {
            "accent": _normalize_hex(result_accent),
            "accent2": _normalize_hex(result_accent2),
            "background": _normalize_hex(result_bg) or "#FFFFFF",
            "text": _normalize_hex(result_text) or "#1A1A1A"
        }

    # Structure 3: Colors is a list of hex strings
    if isinstance(colors, list):
        hex_colors = [_normalize_hex(c) for c in colors if isinstance(c, str) and c.startswith('#')]
        return {
            "accent": hex_colors[0] if hex_colors else None,
            "accent2": hex_colors[1] if len(hex_colors) > 1 else None,
            "background": hex_colors[2] if len(hex_colors) > 2 else "#FFFFFF",
            "text": "#1A1A1A"
        }

    return {"accent": None, "accent2": None, "background": "#FFFFFF", "text": "#1A1A1A"}


def _extract_fonts(api_response: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """Extract fonts from api_response, handling multiple structures."""
    fonts = api_response.get("fonts", {})

    hero = None
    body = None

    if isinstance(fonts, dict):
        # Structure 1: Direct font names
        # fonts: { names: ["Playfair Display", "Open Sans"], ... }
        names = fonts.get("names", [])
        if names and isinstance(names, list):
            # Filter out generic CSS fallbacks
            valid_names = [
                n for n in names
                if isinstance(n, str) and n.lower() not in ('sans-serif', 'serif', 'monospace', 'cursive', 'fantasy')
            ]
            if valid_names:
                hero = valid_names[0]
                body = valid_names[1] if len(valid_names) > 1 else valid_names[0]

        # Structure 2: Brandfetch API format with 'all' array
        # fonts: { all: [{name: "Playfair Display", type: "heading"}, ...] }
        if not hero:
            all_fonts = fonts.get("all", [])
            for font_entry in all_fonts:
                if isinstance(font_entry, dict):
                    font_name = font_entry.get("name", "")
                    font_type = font_entry.get("type", "").lower()

                    if font_name.lower() in ('sans-serif', 'serif', 'monospace'):
                        continue

                    if font_type in ('title', 'heading', 'hero', 'display', 'primary'):
                        if not hero:
                            hero = font_name
                    elif font_type in ('body', 'text', 'paragraph', 'secondary'):
                        if not body:
                            body = font_name
                    elif not hero:
                        hero = font_name
                    elif not body:
                        body = font_name

    elif isinstance(fonts, list):
        # Structure 3: List of font names
        valid_fonts = [f for f in fonts if isinstance(f, str) and f.lower() not in ('sans-serif', 'serif')]
        hero = valid_fonts[0] if valid_fonts else None
        body = valid_fonts[1] if len(valid_fonts) > 1 else hero

    return {"hero": hero, "body": body or hero}


def _extract_logo(api_response: Dict[str, Any]) -> Optional[str]:
    """Extract best logo URL from api_response."""
    # Check for direct logo_url field first (often set by admin or processing)
    if api_response.get("logo_url"):
        return api_response["logo_url"]

    logos = api_response.get("logos", {})
    if not logos:
        return None

    # Try light logos first (better for presentations)
    for theme in ["light", "dark", "icon", "symbol"]:
        logo_list = logos.get(theme, [])
        if isinstance(logo_list, list):
            for logo_item in logo_list:
                if isinstance(logo_item, dict):
                    formats = logo_item.get("formats", [])
                    if formats:
                        # Prefer SVG, then PNG
                        for fmt in formats:
                            if isinstance(fmt, dict) and fmt.get("format") == "svg" and fmt.get("url"):
                                return fmt["url"]
                        for fmt in formats:
                            if isinstance(fmt, dict) and fmt.get("format") == "png" and fmt.get("url"):
                                return fmt["url"]
                        # Fallback to first available
                        for fmt in formats:
                            if isinstance(fmt, dict) and fmt.get("url"):
                                return fmt["url"]

    return None


def _extract_hex_list(items: Any) -> List[str]:
    """Extract hex colors from a list of items (dicts or strings)."""
    if not items or not isinstance(items, list):
        return []

    result = []
    for item in items:
        if isinstance(item, str) and item.startswith('#'):
            result.append(_normalize_hex(item))
        elif isinstance(item, dict):
            hex_val = item.get("hex") or item.get("color") or item.get("value")
            if isinstance(hex_val, str) and hex_val.startswith('#'):
                result.append(_normalize_hex(hex_val))

    return result


def _extract_first_hex(items: Any) -> Optional[str]:
    """Extract first hex color from items."""
    hex_list = _extract_hex_list(items)
    return hex_list[0] if hex_list else None


def _normalize_hex(color: Optional[str]) -> Optional[str]:
    """Normalize hex color to uppercase 6-digit format."""
    if not color or not isinstance(color, str):
        return None

    color = color.strip().upper()
    if not color.startswith('#'):
        color = '#' + color

    # Convert 3-digit to 6-digit
    if len(color) == 4:
        color = '#' + color[1]*2 + color[2]*2 + color[3]*2

    # Validate
    if len(color) == 7 and all(c in '0123456789ABCDEF' for c in color[1:]):
        return color

    return None
