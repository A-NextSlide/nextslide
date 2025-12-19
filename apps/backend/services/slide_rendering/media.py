from typing import Dict, Any, Optional, Tuple
from PIL import Image, ImageDraw, ImageFilter
import logging

logger = logging.getLogger(__name__)


class MediaRenderMixin:

    def _render_image_placeholder(self, img: Image.Image, draw: ImageDraw.Draw, props: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render image placeholder"""
        position = props.get('position', {'x': 0, 'y': 0})
        x = int(position.get('x', 0))
        y = int(position.get('y', 0))
        width = int(props.get('width', 400))
        height = int(props.get('height', 300))
        
        # Draw image placeholder
        draw.rectangle([x, y, x + width, y + height], fill='#F0F0F0', outline='#CCCCCC', width=2)
        
        # Draw diagonal lines
        draw.line([x, y, x + width, y + height], fill='#CCCCCC', width=1)
        draw.line([x + width, y, x, y + height], fill='#CCCCCC', width=1)
        
        # Add placeholder label (special-case logo)
        font = self.get_font('Arial', 24)
        metadata = props.get('metadata') or {}
        kind = (metadata.get('kind') or '').lower()
        text = "LOGO" if kind == 'logo' or (props.get('alt', '').strip().lower() == 'logo') else "IMAGE"
        bbox = font.getbbox(text)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        text_x = x + (width - text_width) // 2
        text_y = y + (height - text_height) // 2
        draw.text((text_x, text_y), text, font=font, fill='#999999')
        
        # Add source info if available
        src = props.get('src', 'placeholder')
        if src and src != 'placeholder':
            info_font = self.get_font('Arial', 10)
            draw.text((x + 5, y + height - 15), f"src: {src[:30]}...", font=info_font, fill='#666666')
        
        return (x, y, x + width, y + height)

    def _render_image(self, img: Image.Image, draw: ImageDraw.Draw, props: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render an Image component using src data URL with objectFit and cropRect support."""
        position = props.get('position', {'x': 0, 'y': 0})
        x = int(position.get('x', 0))
        y = int(position.get('y', 0))
        width = int(props.get('width', 400))
        height = int(props.get('height', 300))
        src = props.get('src', '')
        object_fit = props.get('objectFit', 'contain')
        crop = props.get('cropRect') or {}
        rotation = int(props.get('rotation', 0) or 0)
        flip_x = bool(props.get('flipX', False))
        flip_y = bool(props.get('flipY', False))
        try:
            if src.startswith('data:image'):
                import base64, io
                from PIL import Image as PILImage
                header, b64 = src.split(',', 1)
                data = base64.b64decode(b64)
                with PILImage.open(io.BytesIO(data)) as im:
                    im = im.convert('RGB')
                    # Apply flips if requested
                    if flip_x:
                        im = im.transpose(PILImage.FLIP_LEFT_RIGHT)
                    if flip_y:
                        im = im.transpose(PILImage.FLIP_TOP_BOTTOM)
                    iw, ih = im.size
                    # Apply crop fractions
                    left_f = float(crop.get('left', 0) or 0)
                    right_f = float(crop.get('right', 0) or 0)
                    top_f = float(crop.get('top', 0) or 0)
                    bottom_f = float(crop.get('bottom', 0) or 0)
                    if any(v > 0 for v in [left_f, right_f, top_f, bottom_f]):
                        left_px = int(iw * left_f)
                        top_px = int(ih * top_f)
                        right_px = int(iw * (1 - right_f))
                        bottom_px = int(ih * (1 - bottom_f))
                        # Ensure valid box
                        right_px = max(left_px + 1, right_px)
                        bottom_px = max(top_px + 1, bottom_px)
                        im = im.crop((left_px, top_px, right_px, bottom_px))
                        iw, ih = im.size
                    # Fit into dest rect
                    if object_fit == 'cover':
                        scale = max(width / iw, height / ih)
                    else:  # contain
                        scale = min(width / iw, height / ih)
                    new_size = (max(1, int(iw * scale)), max(1, int(ih * scale)))
                    im = im.resize(new_size, PILImage.LANCZOS)
                    # Create a transparent layer the size of the container and paste centered
                    from PIL import Image as _PILImage
                    layer = _PILImage.new('RGBA', (max(1, width), max(1, height)), (0, 0, 0, 0))
                    dx = (width - im.size[0]) // 2
                    dy = (height - im.size[1]) // 2
                    layer.paste(im, (max(0, dx), max(0, dy)))
                    # Apply rotation around the container center
                    if rotation:
                        layer = layer.rotate(rotation, expand=True, resample=PILImage.BICUBIC)
                    paste_x = int(x + width / 2 - layer.size[0] / 2)
                    paste_y = int(y + height / 2 - layer.size[1] / 2)
                    img.paste(layer, (paste_x, paste_y), layer)
                    return (paste_x, paste_y, paste_x + layer.size[0], paste_y + layer.size[1])
        except Exception:
            pass
        # Fallback to placeholder
        return self._render_image_placeholder(img, draw, props)

    def _render_lines(self, img: Image.Image, draw: ImageDraw.Draw, props: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render a straight line from startPoint to endPoint with stroke properties."""
        try:
            sp = props.get('startPoint', {})
            ep = props.get('endPoint', {})
            x1, y1 = int(sp.get('x', 0)), int(sp.get('y', 0))
            x2, y2 = int(ep.get('x', 0)), int(ep.get('y', 0))
            color = self._resolve_color(props.get('stroke', '#000000')) or '#000000'
            width = int(props.get('strokeWidth', 2))
            draw.line([x1, y1, x2, y2], fill=color, width=width)
            # Return bounding box
            x_min, x_max = min(x1, x2), max(x1, x2)
            y_min, y_max = min(y1, y2), max(y1, y2)
            return (x_min, y_min, x_max, y_max)
        except Exception:
            return None
