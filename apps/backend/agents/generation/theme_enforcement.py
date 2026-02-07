"""Theme enforcement helpers for slide post-processing."""

from typing import Dict, Any

from setup_logging_optimized import get_logger

logger = get_logger(__name__)


_font_service = None

# System fonts that are always available on user devices (matches frontend Essentials category).
# These should NEVER be fuzzy-matched to registry fonts — pass them through as-is.
_SYSTEM_FONTS = {
    "arial", "helvetica", "times new roman", "georgia", "verdana", "tahoma",
    "trebuchet ms", "courier new", "impact", "comic sans ms", "lucida console",
    "lucida sans unicode", "palatino linotype", "book antiqua", "garamond",
    "century gothic", "franklin gothic medium", "candara", "calibri", "cambria",
    "consolas", "segoe ui", "optima", "futura", "gill sans", "rockwell",
    "copperplate", "didot", "baskerville", "bodoni mt", "perpetua",
    "calisto mt", "goudy old style", "system-ui",
}


def _is_known_renderable_font(font_name: str) -> bool:
    """Check if a font is a known system or Google Font that can be rendered without registry lookup."""
    key = font_name.strip().lower()
    if key in _SYSTEM_FONTS:
        return True
    try:
        from services.web_font_service import GOOGLE_FONTS
        if key in GOOGLE_FONTS:
            return True
    except ImportError:
        pass
    return False


def _get_font_service():
    global _font_service
    if _font_service is None:
        try:
            from services.enhanced_font_service import EnhancedFontService
            _font_service = EnhancedFontService()
        except Exception as e:
            logger.warning(f"[FONT FALLBACK] Failed to init EnhancedFontService: {e}")
            _font_service = None
    return _font_service


def get_fallback_font_if_unavailable(font_name: str, *, is_hero: bool = False) -> str:
    """Return a similar available font if requested font is missing.

    System fonts and Google Fonts are passed through directly since they're
    always renderable in the browser — no need to fuzzy-match them to registry fonts.
    """
    if not font_name or not font_name.strip():
        return "Inter"

    # Pass through known system/Google fonts without fuzzy-matching
    if _is_known_renderable_font(font_name):
        logger.debug(f"[FONT FALLBACK] '{font_name}' is a known renderable font, passing through")
        return font_name

    try:
        font_service = _get_font_service()
        if font_service:
            match = font_service.match_font_name(font_name, is_hero=is_hero, include_remote=False)
            if match:
                logger.debug(f"[FONT FALLBACK] Matched '{font_name}' -> '{match}' (local)")
                return match
            match = font_service.match_font_name(font_name, is_hero=is_hero, include_remote=True)
            if match:
                logger.debug(f"[FONT FALLBACK] Matched '{font_name}' -> '{match}' (remote)")
                return match
        logger.warning(f"[FONT FALLBACK] No match found for '{font_name}', using original")
        return font_name

    except Exception as e:
        logger.warning(f"[FONT FALLBACK] Error finding fallback for '{font_name}': {e}")
        return font_name


def enforce_theme_fonts(slide_data: Dict[str, Any], theme: Any) -> None:
    """Ensure all text components use theme fonts and palette colors."""
    if isinstance(theme, dict):
        typography = theme.get("typography", {})
        color_palette = theme.get("color_palette", {})
    elif hasattr(theme, "typography"):
        typography = theme.typography
        color_palette = getattr(theme, "color_palette", {})
    else:
        logger.warning("[FONT ENFORCEMENT] Theme missing or has no typography.")
        typography = {}
        color_palette = {}

    hero_font = typography.get("hero_title", {}).get("family", "Inter")
    body_font = typography.get("body_text", {}).get("family", "Inter")

    def normalize_font_name(font_name: str) -> str:
        if not font_name:
            return font_name
        return " ".join(word.capitalize() for word in str(font_name).split())

    hero_font = normalize_font_name(hero_font)
    body_font = normalize_font_name(body_font)

    hero_font = get_fallback_font_if_unavailable(hero_font, is_hero=True)
    body_font = get_fallback_font_if_unavailable(body_font, is_hero=False)

    primary_text = color_palette.get("primary_text", "#1A1A1A")
    accent_1 = color_palette.get("accent_1", "#0066CC")
    accent_2 = color_palette.get("accent_2", "#FF6B6B")

    for component in slide_data.get("components", []):
        if component.get("type") not in ("TiptapTextBlock", "TextBlock", "Title"):
            continue
        props = component.get("props", {})
        current_font = props.get("fontFamily", "not set")

        position_y = props.get("position", {}).get("y") if props.get("position") else None
        is_title = (
            component.get("type") == "Title"
            or (props.get("fontSize") or 0) > 60
            or (position_y or 999) < 200
        )

        new_font = hero_font if is_title else body_font
        if current_font != new_font:
            logger.debug(f"[FONT ENFORCEMENT] Updating font from '{current_font}' to '{new_font}'")
        props["fontFamily"] = new_font

        if component.get("type") == "TiptapTextBlock":
            props["padding"] = 0
        else:
            props.setdefault("padding", 16)

        if "letterSpacing" not in props:
            texts = props.get("texts", []) or []
            try:
                if isinstance(texts, list):
                    max_size = max((t.get("fontSize", 0) or 0 for t in texts if isinstance(t, dict)), default=(props.get("fontSize") or 0) or 0)
                else:
                    max_size = (props.get("fontSize") or 0) or 0
            except Exception:
                max_size = (props.get("fontSize") or 0) or 0
            props["letterSpacing"] = -0.02 if (max_size and max_size >= 80) else -0.01
        else:
            ls = props.get("letterSpacing")
            if isinstance(ls, str):
                try:
                    if ls.endswith("em"):
                        props["letterSpacing"] = float(ls.replace("em", "").strip())
                    elif ls.endswith("px"):
                        props["letterSpacing"] = float(ls.replace("px", "").strip()) / 16.0
                    else:
                        props["letterSpacing"] = float(ls)
                except Exception:
                    props["letterSpacing"] = -0.01
        if "lineHeight" not in props:
            props["lineHeight"] = 1.1 if is_title else 1.2
        else:
            try:
                lh_raw = props.get("lineHeight")
                lh_val = float(str(lh_raw).replace("px", "").replace("em", "").strip()) if isinstance(lh_raw, str) else float(lh_raw)
                props["lineHeight"] = 1.2 if lh_val > 1.2 else lh_val
            except Exception:
                props["lineHeight"] = 1.2
        props.setdefault("textShadow", "0 4px 24px rgba(0,0,0,0.25)")

        texts = props.get("texts", []) or []
        if texts and isinstance(texts, list):
            try:
                max_size = max((t.get("fontSize", 0) or 0 for t in texts if isinstance(t, dict)), default=(props.get("fontSize") or 0) or 0)
            except Exception:
                max_size = (props.get("fontSize") or 0) or 0
            for t in texts:
                if not isinstance(t, dict):
                    continue
                color = t.get("color")
                if not color or str(color).lower() in ["#000", "#000000"]:
                    if t.get("fontSize", 0) == max_size and accent_1:
                        t["color"] = accent_1
                    else:
                        t["color"] = primary_text
                style = t.get("style") if isinstance(t.get("style"), dict) else {}
                style.setdefault("textColor", t.get("color"))
                style.setdefault("backgroundColor", "#00000000")
                t["style"] = style


def enforce_theme_consistency(slide_data: Dict[str, Any], theme: Any) -> None:
    """Enforce consistent use of theme colors/fonts across key components."""
    try:
        theme_dict = theme.to_dict() if hasattr(theme, "to_dict") else (theme if isinstance(theme, dict) else {})
        if not theme_dict:
            return
        colors = theme_dict.get("color_palette", {}) or {}
        typography = theme_dict.get("typography", {}) or {}

        primary_bg = (
            colors.get("primary_background")
            or (colors.get("backgrounds", [None])[0] if isinstance(colors.get("backgrounds"), list) else None)
            or "#0A0E27"
        )
        secondary_bg = (
            colors.get("secondary_background")
            or (
                colors.get("backgrounds", [None, None])[1]
                if isinstance(colors.get("backgrounds"), list) and len(colors.get("backgrounds", [])) > 1
                else None
            )
            or "#1A1F3A"
        )
        primary_text = (
            colors.get("primary_text")
            or (colors.get("text_colors", {}).get("primary") if isinstance(colors.get("text_colors"), dict) else None)
            or "#FFFFFF"
        )
        accent_1 = (
            colors.get("accent_1")
            or (colors.get("accents", [None])[0] if isinstance(colors.get("accents"), list) else None)
            or (colors.get("colors", [None])[0] if isinstance(colors.get("colors"), list) else None)
            or "#00F0FF"
        )
        accent_2 = (
            colors.get("accent_2")
            or (
                colors.get("accents", [None, None])[1]
                if isinstance(colors.get("accents"), list) and len(colors.get("accents", [])) > 1
                else None
            )
            or (
                colors.get("colors", [None, None])[1]
                if isinstance(colors.get("colors"), list) and len(colors.get("colors", [])) > 1
                else None
            )
            or "#FF5722"
        )

        hero_font = (typography.get("hero_title", {}) or {}).get("family", "Inter")

        allowed_text_colors = set(c for c in [primary_text, "#FFFFFF", "#000000"] if isinstance(c, str))
        allowed_fill_colors = set(c for c in [accent_1, accent_2, primary_bg, primary_text] if isinstance(c, str))

        for component in slide_data.get("components", []) or []:
            ctype = component.get("type")
            props = component.get("props", {}) or {}

            if ctype == "Background":
                if props.get("backgroundType") != "gradient":
                    page_bg = primary_bg
                    try:
                        palette = slide_data.get("palette") if isinstance(slide_data, dict) else None
                        if palette and palette.get("source") in ("brand_database", "web_scrape"):
                            backgrounds = palette.get("backgrounds") or []
                            if isinstance(backgrounds, list) and backgrounds:
                                page_bg = backgrounds[0]
                            else:
                                colors_list = palette.get("colors") or []
                                if colors_list:
                                    def _brightness(hex_color: str) -> float:
                                        try:
                                            h = hex_color.lstrip("#")
                                            r = int(h[0:2], 16) / 255.0
                                            g = int(h[2:4], 16) / 255.0
                                            b = int(h[4:6], 16) / 255.0
                                            return (0.299 * r + 0.587 * g + 0.114 * b)
                                        except Exception:
                                            return 0.5
                                    page_bg = sorted(colors_list, key=lambda c: _brightness(c), reverse=True)[0]
                    except Exception:
                        page_bg = primary_bg

                    props["backgroundType"] = "color"
                    props["backgroundColor"] = page_bg
                component["props"] = props

            elif ctype == "CustomComponent":
                typography = (theme_dict or {}).get("typography", {})
                hero_font = (typography.get("hero_title") or {}).get("family") or "Inter"
                body_font = (typography.get("body_text") or {}).get("family") or "Inter"

                props["primaryColor"] = accent_1
                props["secondaryColor"] = accent_2
                props["accentColor"] = accent_1
                props["textColor"] = primary_text
                props["fontFamily"] = hero_font
                props["bodyFont"] = body_font
                component["props"] = props

            elif ctype == "Icon":
                color = props.get("color")
                if not isinstance(color, str) or (color not in allowed_fill_colors and color not in allowed_text_colors):
                    props["color"] = accent_1
                    component["props"] = props

            elif ctype in ("Shape", "ShapeWithText"):
                grad = props.get("gradient")
                if isinstance(grad, dict):
                    gtype = grad.get("type", "linear")
                    angle = grad.get("angle", 90)
                    props["gradient"] = {
                        "type": gtype,
                        "angle": angle,
                        "stops": [
                            {"color": accent_1, "position": 0},
                            {"color": accent_2, "position": 100},
                        ],
                    }
                    component["props"] = props
                else:
                    props["fill"] = accent_1
                    component["props"] = props

    except Exception as e:
        logger.warning(f"[THEME ENFORCEMENT] Skipped due to error: {e}")
