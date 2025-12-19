"""Post-processing pipeline for generated slides."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List
import uuid

from agents.domain.models import SlideGenerationContext
from agents.generation.image_processing import apply_tagged_media_to_images, process_custom_component_images
from agents.generation.theme_adapter import ThemeAdapter
from agents.generation.theme_enforcement import enforce_theme_consistency, enforce_theme_fonts
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


def _normalize_hex_no_alpha(color: str) -> str:
    try:
        value = (color or "").strip()
        if value.startswith("#") and len(value) == 9:
            return value[:7]
        return value
    except Exception:
        return color


def _estimate_brightness(hex_color: str) -> float:
    try:
        h = hex_color.lstrip("#")
        r = int(h[0:2], 16) / 255.0
        g = int(h[2:4], 16) / 255.0
        b = int(h[4:6], 16) / 255.0
        return (0.299 * r + 0.587 * g + 0.114 * b)
    except Exception:
        return 0.5


def _darken_color_subtly(hex_color: str) -> str:
    """Create a barely noticeable darker version of the same color (5% darker)."""
    try:
        hex_color = hex_color.replace("#", "")
        if len(hex_color) != 6:
            return hex_color

        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
        factor = 0.95
        r_dark = max(0, int(r * factor))
        g_dark = max(0, int(g * factor))
        b_dark = max(0, int(b * factor))
        return f"#{r_dark:02x}{g_dark:02x}{b_dark:02x}"
    except Exception:
        return hex_color


def _gradient_on_palette(grad: Dict[str, Any], palette_colors: List[str]) -> bool:
    try:
        allowed = set(_normalize_hex_no_alpha(x).lower() for x in (palette_colors or []) if isinstance(x, str))
        stops = grad.get("stops") or []
        colors = [(_normalize_hex_no_alpha(s.get("color")) or "").lower() for s in stops if isinstance(s, dict)]
        colors = [c for c in colors if c]
        return any(c in allowed for c in colors)
    except Exception:
        return False


@dataclass
class SlidePostProcessor:
    component_validator: Any
    registry: Any

    async def process(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> Dict[str, Any]:
        self._ensure_component_ids(slide_data)
        self._ensure_theme_panel(slide_data, context)
        self._ensure_background_component(slide_data, context)
        self._handle_image_replacement(slide_data, context)

        validated = self._validate_components(slide_data, context)
        slide_data["components"] = validated
        slide_data["generated_at"] = datetime.now().isoformat()

        self._preserve_chart_data(slide_data, context)
        self._attach_theme_and_palette(slide_data, context)
        self._enforce_theme(slide_data, context)

        self._inject_outline_values_into_custom_components(slide_data, context)
        await self._process_custom_component_images(slide_data, context)
        self._store_image_search_terms(slide_data)
        return slide_data

    def _ensure_component_ids(self, slide_data: Dict[str, Any]) -> None:
        try:
            for component in slide_data.get("components", []) or []:
                if not component.get("id"):
                    component["id"] = str(uuid.uuid4())
        except Exception as exc:
            logger.warning("[POST] Failed to ensure component IDs: %s", exc)

    def _ensure_theme_panel(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        try:
            if not slide_data.get("theme_panel") and context.theme:
                slide_data["theme_panel"] = ThemeAdapter.build_frontend_theme(context.theme)
        except Exception as exc:
            logger.warning("[POST] Failed to attach theme_panel: %s", exc)

    def _ensure_background_component(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        try:
            components = slide_data.get("components", []) or []
            has_background = any(c.get("type") == "Background" for c in components)
            theme_dict = context.theme.to_dict() if hasattr(context.theme, "to_dict") else (context.theme or {})
            colors = (theme_dict or {}).get("color_palette", {})
            db_palette = context.palette or {}

            if not has_background:
                bg_from_db = None
                try:
                    if db_palette.get("source") == "database" and isinstance(db_palette.get("colors"), list) and db_palette["colors"]:
                        bg_from_db = sorted(db_palette["colors"], key=_estimate_brightness, reverse=True)[0]
                except Exception:
                    bg_from_db = None

                bg_color = bg_from_db or colors.get("primary_background", "#FFFFFF")
                components.insert(0, {
                    "id": "bg-fallback",
                    "type": "Background",
                    "props": {
                        "position": {"x": 0, "y": 0},
                        "width": 1920,
                        "height": 1080,
                        "opacity": 1,
                        "rotation": 0,
                        "zIndex": 0,
                        "backgroundType": "color",
                        "backgroundColor": bg_color,
                    },
                })
                slide_data["components"] = components
                return

            palette_colors_allowed: List[str] = []
            if isinstance(colors.get("colors"), list):
                palette_colors_allowed.extend(colors.get("colors"))
            for key in ["primary_background", "secondary_background", "accent_1", "accent_2", "primary_text", "secondary_text"]:
                value = colors.get(key)
                if isinstance(value, str):
                    palette_colors_allowed.append(value)

            for comp in components:
                if comp.get("type") != "Background":
                    continue
                props = comp.setdefault("props", {})
                props.setdefault("position", {"x": 0, "y": 0})
                props.setdefault("width", 1920)
                props.setdefault("height", 1080)
                props.setdefault("opacity", 1)
                props.setdefault("rotation", 0)
                props.setdefault("zIndex", 0)
                props.setdefault("backgroundType", "gradient")

                if props.get("backgroundType") == "gradient" and isinstance(props.get("gradient"), dict):
                    if not _gradient_on_palette(props.get("gradient"), palette_colors_allowed):
                        stops: List[Dict[str, Any]] = []
                        theme_grads = colors.get("gradients") or []
                        if isinstance(theme_grads, list) and theme_grads:
                            grad = theme_grads[0] or {}
                            gcolors = grad.get("colors") or []
                            if isinstance(gcolors, list) and len(gcolors) >= 2:
                                c1, c2 = gcolors[0], gcolors[1]
                                stops = [
                                    {"color": _normalize_hex_no_alpha(c1), "position": 0},
                                    {"color": _normalize_hex_no_alpha(c2), "position": 100},
                                ]
                        if not stops:
                            c1 = colors.get("primary_background", "#0A0E27")
                            c2 = _darken_color_subtly(c1)
                            stops = [
                                {"color": _normalize_hex_no_alpha(c1), "position": 0},
                                {"color": _normalize_hex_no_alpha(c2), "position": 60},
                                {"color": _normalize_hex_no_alpha(c1), "position": 100},
                            ]
                        props["backgroundType"] = "gradient"
                        props["gradient"] = {"type": "radial", "position": "top-right", "stops": stops}
                        props.pop("backgroundColor", None)
                    else:
                        grad = props.get("gradient") or {}
                        stops_in = grad.get("stops") or []
                        colors_in = grad.get("colors") or []
                        if (not stops_in) and isinstance(colors_in, list) and colors_in:
                            n = len(colors_in)
                            stops_norm: List[Dict[str, Any]] = []
                            for i, color in enumerate(colors_in):
                                pos = (float(i) / float(max(1, n - 1))) * 100.0
                                stops_norm.append({"color": _normalize_hex_no_alpha(color), "position": pos})
                            grad["stops"] = stops_norm
                            props["gradient"] = grad
                            props.pop("backgroundColor", None)
                else:
                    stops: List[Dict[str, Any]] = []
                    try:
                        if isinstance(db_palette.get("backgrounds"), list) and db_palette["backgrounds"]:
                            c1 = db_palette["backgrounds"][0]
                            c2 = _darken_color_subtly(c1)
                            stops = [
                                {"color": _normalize_hex_no_alpha(c1), "position": 0},
                                {"color": _normalize_hex_no_alpha(c2), "position": 60},
                                {"color": _normalize_hex_no_alpha(c1), "position": 100},
                            ]
                        elif isinstance(db_palette.get("colors"), list) and db_palette["colors"]:
                            c1 = db_palette["colors"][0]
                            c2 = _darken_color_subtly(c1)
                            stops = [
                                {"color": _normalize_hex_no_alpha(c1), "position": 0},
                                {"color": _normalize_hex_no_alpha(c2), "position": 60},
                                {"color": _normalize_hex_no_alpha(c1), "position": 100},
                            ]
                        else:
                            c1 = colors.get("primary_background", "#0A0E27")
                            c2 = _darken_color_subtly(c1)
                            stops = [
                                {"color": _normalize_hex_no_alpha(c1), "position": 0},
                                {"color": _normalize_hex_no_alpha(c2), "position": 60},
                                {"color": _normalize_hex_no_alpha(c1), "position": 100},
                            ]
                    except Exception:
                        c1 = colors.get("primary_background", "#0A0E27")
                        c2 = _darken_color_subtly(c1)
                        stops = [
                            {"color": _normalize_hex_no_alpha(c1), "position": 0},
                            {"color": _normalize_hex_no_alpha(c2), "position": 60},
                            {"color": _normalize_hex_no_alpha(c1), "position": 100},
                        ]
                    props["backgroundType"] = "gradient"
                    props["gradient"] = {"type": "radial", "position": "top-right", "stops": stops}
                    props.pop("backgroundColor", None)
        except Exception as exc:
            logger.warning("[POST] Failed to ensure background defaults: %s", exc)

    def _handle_image_replacement(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        if context.tagged_media and not context.async_images:
            apply_tagged_media_to_images(slide_data, context.tagged_media)
            return

        if context.async_images and context.available_images:
            slide_data["availableImages"] = context.available_images

    def _validate_components(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> List[Dict[str, Any]]:
        theme_dict = None
        if context.theme:
            theme_dict = context.theme.to_dict() if hasattr(context.theme, "to_dict") else context.theme
        components = slide_data.get("components", []) or []
        return self.component_validator.validate_components(components, self.registry, theme=theme_dict)

    def _preserve_chart_data(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        if getattr(context.slide_outline, "extractedData", None):
            extracted = context.slide_outline.extractedData
            slide_data["extractedData"] = extracted.model_dump() if hasattr(extracted, "model_dump") else extracted

        if getattr(context.slide_outline, "manualCharts", None):
            slide_data["manualCharts"] = [
                chart.model_dump() if hasattr(chart, "model_dump") else chart
                for chart in context.slide_outline.manualCharts
            ]

    def _attach_theme_and_palette(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        if context.theme:
            theme_dict = context.theme.to_dict() if hasattr(context.theme, "to_dict") else context.theme
            slide_data["theme"] = theme_dict
            try:
                slide_data.setdefault("theme_panel", ThemeAdapter.build_frontend_theme(context.theme))
            except Exception:
                pass
        if context.palette:
            slide_data["palette"] = context.palette

    def _enforce_theme(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        if not context.theme:
            return

        enforce_theme_consistency(slide_data, context.theme)
        enforce_theme_fonts(slide_data, context.theme)

        try:
            theme_panel = slide_data.get("theme_panel") or ThemeAdapter.build_frontend_theme(context.theme)
            updated = ThemeAdapter.apply_theme_to_components(
                slide_data.get("components", []),
                theme_panel,
                original_theme=context.theme,
            )
            slide_data["components"] = updated
            slide_data["theme_panel"] = theme_panel
        except Exception as exc:
            logger.warning("[POST] ThemeAdapter apply failed: %s", exc)

    def _inject_outline_values_into_custom_components(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        try:
            import re

            title_text = (getattr(context.slide_outline, "title", "") or "").strip()
            content_text = (getattr(context.slide_outline, "content", "") or "").strip()
            combined = f"{title_text}\n{content_text}".strip()

            def find_metric(text: str) -> Dict[str, Any]:
                match = re.search(r"([\$€£])\s?(\d[\d,]*(?:\.\d+)?)([kKmMbB])?", text)
                if match:
                    return {
                        "value": (match.group(1) + (match.group(2) or "") + (match.group(3) or "")).replace(" ", ""),
                        "span": match.span(),
                    }
                match = re.search(r"(\d+(?:\.\d+)?)\s?%", text)
                if match:
                    return {"value": match.group(0).replace(" ", ""), "span": match.span()}
                match = re.search(r"\b(\d[\d,]{3,})(?:\s?(?:k|m|b))?\b", text, flags=re.IGNORECASE)
                if match:
                    return {"value": match.group(0), "span": match.span()}
                return {"value": "", "span": (0, 0)}

            def find_previous(text: str) -> str:
                match = re.search(
                    r"(?:up|down)?\s*from\s+([\$€£]?\s?\d[\d,]*(?:\.\d+)?(?:[kKmMbB])?|\d+(?:\.\d+)?\s?%)",
                    text,
                    flags=re.IGNORECASE,
                )
                if match:
                    return match.group(1).replace(" ", "")
                match = re.search(
                    r"last\s+(?:year|month|quarter)\s*[:\-]?\s*([\$€£]?\s?\d[\d,]*(?:\.\d+)?(?:[kKmMbB])?|\d+(?:\.\d+)?\s?%)",
                    text,
                    flags=re.IGNORECASE,
                )
                return match.group(1).replace(" ", "") if match else ""

            def find_target(text: str) -> str:
                match = re.search(
                    r"(?:target|goal|aim)\s*(?:of|:)\s*([\$€£]?\s?\d[\d,]*(?:\.\d+)?(?:[kKmMbB])?|\d+(?:\.\d+)?\s?%)",
                    text,
                    flags=re.IGNORECASE,
                )
                return match.group(1).replace(" ", "") if match else ""

            def derive_label(text: str, metric_span: tuple[int, int]) -> str:
                return title_text or "Metric"

            def extract_outline_chips(title: str, content: str) -> List[str]:
                title = (title or "").strip()
                return [title] if title else []

            metric = find_metric(combined)
            prev = find_previous(combined)
            targ = find_target(combined)
            label_text = derive_label(combined, metric.get("span", (0, 0))) if metric.get("value") else (title_text or "")
            chips = extract_outline_chips(title_text, content_text)

            def is_placeholder(value: Any) -> bool:
                try:
                    text = (value or "").strip().lower()
                    return text in {"", "value", "label"}
                except Exception:
                    return True

            for comp in slide_data.get("components", []) or []:
                if comp.get("type") != "CustomComponent":
                    continue
                props = comp.setdefault("props", {})
                if metric.get("value") and ("value" not in props or is_placeholder(props.get("value"))):
                    props["value"] = metric["value"]
                if label_text and ("label" not in props or is_placeholder(props.get("label"))):
                    props["label"] = label_text
                if "emphasis" not in props and props.get("value"):
                    props["emphasis"] = "hero"
                if prev and not props.get("previous"):
                    props["previous"] = prev
                if targ and not (props.get("target") or props.get("max")):
                    props["target"] = targ
                if chips and not props.get("outline"):
                    props["outline"] = chips
        except Exception as exc:
            logger.debug("[POST] Outline value injection skipped: %s", exc)

    async def _process_custom_component_images(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        try:
            await process_custom_component_images(slide_data, context)
        except Exception as exc:
            logger.warning("[POST] CustomComponent image processing skipped: %s", exc)

    def _store_image_search_terms(self, slide_data: Dict[str, Any]) -> None:
        image_search_terms: Dict[str, str] = {}
        for idx, comp in enumerate(slide_data.get("components", []) or []):
            if comp.get("type") != "Image":
                continue
            search_query = comp.get("props", {}).get("searchQuery", "")
            if isinstance(search_query, str) and search_query.strip():
                image_search_terms[f"image_{idx}"] = search_query.strip()

        if image_search_terms:
            slide_data["imageSearchTerms"] = image_search_terms
