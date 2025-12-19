from typing import Dict, Any, Optional, Tuple, List
from PIL import Image, ImageDraw
import logging

logger = logging.getLogger(__name__)


class CustomComponentRenderMixin:
    def _render_custom_component(
        self,
        img: Image.Image,
        draw: ImageDraw.Draw,
        props: Dict[str, Any],
    ) -> Optional[Tuple[int, int, int, int]]:
        """Render custom components generically without keyword heuristics."""
        position = props.get("position", {"x": 0, "y": 0})
        x = int(position.get("x", 0))
        y = int(position.get("y", 0))
        width = int(props.get("width", 300))
        height = int(props.get("height", 200))

        internal_props = props.get("props", {}) or {}

        font_size = internal_props.get("fontSize") or props.get("fontSize") or 48
        font_size = self._parse_font_size(font_size)
        font_family = internal_props.get("fontFamily", "Arial")
        font_weight = str(internal_props.get("fontWeight", "400"))
        text_color = internal_props.get("textColor", internal_props.get("color", "#333333"))
        line_height = float(internal_props.get("lineHeight", 1.2))
        text_align = internal_props.get("textAlign", "left")

        bg_color = props.get("backgroundColor", internal_props.get("backgroundColor", "transparent"))
        border_color = internal_props.get("borderColor")
        border_width = int(internal_props.get("borderWidth", 0))

        if bg_color and bg_color not in ("transparent", "rgba(0,0,0,0)"):
            draw.rectangle([x, y, x + width, y + height], fill=bg_color)

        if border_color and border_width > 0:
            draw.rectangle([x, y, x + width, y + height], outline=border_color, width=border_width)
        elif not bg_color or bg_color == "transparent":
            draw.rectangle([x, y, x + width, y + height], outline="#CCCCCC", width=1)

        padding = int(internal_props.get("padding", 20))
        content_x = x + padding
        content_y = y + padding
        content_width = max(1, width - (2 * padding))
        content_height = max(1, height - (2 * padding))

        texts = self._collect_texts(internal_props)
        if not texts:
            placeholder_font = self.get_font("Arial", 14)
            draw.text((content_x, content_y), "[CustomComponent]", font=placeholder_font, fill="#999999")
            return (x, y, x + width, y + height)

        font = self.get_font(font_family, font_size, font_weight)
        line_spacing = font_size * line_height

        current_y = content_y
        for text in texts:
            if not text.strip():
                continue
            wrapped_lines = self._wrap_text(text, font, content_width)
            for line in wrapped_lines:
                if current_y + line_spacing > content_y + content_height:
                    break
                if text_align == "center":
                    bbox = font.getbbox(line)
                    line_width = bbox[2] - bbox[0]
                    line_x = content_x + (content_width - line_width) // 2
                elif text_align == "right":
                    bbox = font.getbbox(line)
                    line_width = bbox[2] - bbox[0]
                    line_x = content_x + content_width - line_width
                else:
                    line_x = content_x
                draw.text((line_x, current_y), line, font=font, fill=text_color)
                current_y += line_spacing
            current_y += 8
            if current_y > content_y + content_height:
                break

        return (x, y, x + width, y + height)

    def _collect_texts(self, value: Any, texts: Optional[List[str]] = None) -> List[str]:
        if texts is None:
            texts = []
        if isinstance(value, str):
            texts.append(value)
        elif isinstance(value, dict):
            for key, item in value.items():
                if key == "render":
                    continue
                self._collect_texts(item, texts)
        elif isinstance(value, list):
            for item in value:
                self._collect_texts(item, texts)
        return texts

    def _render_data_component(
        self,
        img: Image.Image,
        draw: ImageDraw.Draw,
        props: Dict[str, Any],
        comp_type: str,
    ) -> Optional[Tuple[int, int, int, int]]:
        """Render chart or table placeholder."""
        position = props.get("position", {"x": 0, "y": 0})
        x = int(position.get("x", 0))
        y = int(position.get("y", 0))
        width = int(props.get("width", 600))
        height = int(props.get("height", 400))

        draw.rectangle([x, y, x + width, y + height], fill="#FAFAFA", outline="#DDDDDD", width=2)
        font = self.get_font("Arial", 20)
        draw.text((x + 20, y + 20), comp_type.upper(), font=font, fill="#666666")

        return (x, y, x + width, y + height)
