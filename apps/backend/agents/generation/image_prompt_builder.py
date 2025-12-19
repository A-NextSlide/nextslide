"""
Image generation prompt builder for slide images.
"""

from __future__ import annotations

from typing import Dict, Any, List, Tuple


class ImageGenerationPromptBuilder:
    """Build prompts for AI image generation per image component."""

    DEFAULT_CHROMA_COLOR = "#00FD00"

    def __init__(self, theme: Dict[str, Any] | None = None) -> None:
        self.theme = theme or {}

    def build_for_slide(
        self,
        slide_data: Dict[str, Any],
        slide_title: str,
        slide_content: str,
        max_images: int = 3,
    ) -> List[Dict[str, Any]]:
        """Create up to max_images prompts for placeholder Image components."""
        components = slide_data.get("components", []) or []
        image_placeholders: List[Tuple[int, Dict[str, Any], int]] = []

        for idx, comp in enumerate(components):
            if comp.get("type") != "Image":
                continue
            props = comp.get("props", {}) or {}
            try:
                alt_text = (props.get("alt") or "").strip().lower()
                metadata_kind = ((props.get("metadata") or {}).get("kind") or "").strip().lower()
                if alt_text == "logo" or metadata_kind == "logo":
                    continue
            except Exception:
                pass
            src = (props.get("src") or "").strip().lower()
            if src not in ("", "placeholder"):
                continue
            w = int(props.get("width", 0) or 0)
            h = int(props.get("height", 0) or 0)
            area = max(0, w) * max(0, h)
            image_placeholders.append((idx, comp, area))

        if not image_placeholders:
            return []

        image_placeholders.sort(key=lambda t: t[2], reverse=True)
        desired_count = min(max_images, len(image_placeholders))

        plans: List[Dict[str, Any]] = []
        if desired_count <= 0:
            return plans

        theme_desc = self._theme_short()
        hero_candidate = image_placeholders[0]
        hero_is_large = self._is_large_area(hero_candidate[1])

        if hero_is_large and desired_count > 0:
            idx, comp, _ = hero_candidate
            prompt = (
                f"Create a hero image that fits the slide title and content. "
                f"Style aligns with {theme_desc}. No text, no watermarks."
            )
            size = self._infer_size(comp)
            plans.append({
                "prompt": prompt,
                "size": size,
                "needs_transparency": False,
                "background_color": None,
                "component_index": idx,
            })
            desired_count -= 1
            start_idx = 1
        else:
            start_idx = 0

        for idx, comp, _ in image_placeholders[start_idx:start_idx + desired_count]:
            prompt = (
                f"Create a supporting visual that matches the slide title and content. "
                f"Style aligns with {theme_desc}. No text, no watermarks. "
                f"Use a flat solid background color {self.DEFAULT_CHROMA_COLOR}."
            )
            size = self._infer_size(comp)
            plans.append({
                "prompt": prompt,
                "size": size,
                "needs_transparency": True,
                "background_color": self.DEFAULT_CHROMA_COLOR,
                "component_index": idx,
            })

        return plans

    def _theme_short(self) -> str:
        colors = (self.theme.get("color_palette") or {}) if isinstance(self.theme, dict) else {}
        accent = colors.get("accent_1") or colors.get("accent") or "theme accent"
        background = colors.get("primary_background") or colors.get("background") or "neutral"
        return f"a {background} palette with {accent} accents"

    def _infer_size(self, comp: Dict[str, Any]) -> str:
        props = comp.get("props", {}) or {}
        w = int(props.get("width", 1024) or 1024)
        h = int(props.get("height", 768) or 768)
        return f"{w}x{h}"

    def _is_large_area(self, comp: Dict[str, Any]) -> bool:
        props = comp.get("props", {}) or {}
        w = int(props.get("width", 0) or 0)
        h = int(props.get("height", 0) or 0)
        return w * h >= 1000000
