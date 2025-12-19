from typing import Dict, Any, Optional, Tuple
from PIL import Image, ImageDraw


class ShapeRenderMixin:

    def _render_shape(self, img: Image.Image, draw: ImageDraw.Draw, props: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render shape component with support for more shape types"""
        position = props.get('position', {'x': 0, 'y': 0})
        x = int(position.get('x', 0))
        y = int(position.get('y', 0))
        width = int(props.get('width', 200))
        height = int(props.get('height', 200))
        rotation = int(props.get('rotation', 0) or 0)
        
        shape_type = props.get('shape', props.get('shapeType', 'rectangle'))
        fill_color = self._resolve_color(props.get('fill', props.get('backgroundColor', None)))
        stroke_color = self._resolve_color(props.get('stroke', props.get('borderColor', None)))
        stroke_width = int(props.get('strokeWidth', props.get('borderWidth', 0)))
        
        # Handle transparent colors
        if fill_color is None:
            fill_color = None
        if stroke_color is None:
            stroke_color = None
            stroke_width = 0
        
        # Draw into a temporary transparent layer to support rotation
        from PIL import Image as _PILImage
        layer = _PILImage.new('RGBA', (max(1, width), max(1, height)), (0, 0, 0, 0))
        ldraw = ImageDraw.Draw(layer)

        # If shape carries an imageFill, render it clipped within the shape layer
        image_fill = props.get('imageFill')
        if image_fill and isinstance(image_fill, dict):
            from PIL import Image as _PILImage
            # Prepare a layer for the image and clip by drawing the shape into alpha
            layer = _PILImage.new('RGBA', (max(1, width), max(1, height)), (0, 0, 0, 0))
            mask = _PILImage.new('L', (max(1, width), max(1, height)), 0)
            mdraw = ImageDraw.Draw(mask)
            # Draw mask using same logic as vector drawing
            if shape_type in ('rectangle', 'rect'):
                corner_radius = int(props.get('cornerRadius', props.get('borderRadius', 0)))
                if corner_radius > 0 and hasattr(mdraw, 'rounded_rectangle'):
                    mdraw.rounded_rectangle([0, 0, width, height], radius=corner_radius, fill=255)
                else:
                    mdraw.rectangle([0, 0, width, height], fill=255)
            elif shape_type in ('circle', 'ellipse'):
                mdraw.ellipse([0, 0, width, height], fill=255)
            else:
                # Default to rectangle for unsupported masks
                mdraw.rectangle([0, 0, width, height], fill=255)
            # Render the image into a same-size canvas
            try:
                src = image_fill.get('src', '')
                object_fit = image_fill.get('objectFit', 'contain')
                crop = image_fill.get('cropRect') or {}
                flip_x = bool(image_fill.get('flipX', False))
                flip_y = bool(image_fill.get('flipY', False))
                if src.startswith('data:image'):
                    import base64, io
                    from PIL import Image as PILImage
                    header, b64 = src.split(',', 1)
                    data = base64.b64decode(b64)
                    with PILImage.open(io.BytesIO(data)) as im:
                        im = im.convert('RGB')
                        if flip_x:
                            im = im.transpose(PILImage.FLIP_LEFT_RIGHT)
                        if flip_y:
                            im = im.transpose(PILImage.FLIP_TOP_BOTTOM)
                        iw, ih = im.size
                        # Apply crop
                        if crop:
                            left_f = float(crop.get('left', 0) or 0)
                            right_f = float(crop.get('right', 0) or 0)
                            top_f = float(crop.get('top', 0) or 0)
                            bottom_f = float(crop.get('bottom', 0) or 0)
                            if any(v > 0 for v in [left_f, right_f, top_f, bottom_f]):
                                left_px = int(iw * left_f)
                                top_px = int(ih * top_f)
                                right_px = int(iw * (1 - right_f))
                                bottom_px = int(ih * (1 - bottom_f))
                                right_px = max(left_px + 1, right_px)
                                bottom_px = max(top_px + 1, bottom_px)
                                im = im.crop((left_px, top_px, right_px, bottom_px))
                                iw, ih = im.size
                        # Fit to layer
                        if object_fit == 'cover':
                            scale = max(width / iw, height / ih)
                        else:
                            scale = min(width / iw, height / ih)
                        im = im.resize((max(1, int(iw * scale)), max(1, int(ih * scale))), PILImage.LANCZOS)
                        # Center in layer
                        bx = max(0, (width - im.size[0]) // 2)
                        by = max(0, (height - im.size[1]) // 2)
                        layer.paste(im, (bx, by))
                        # Apply rotation to the composed layer
                        if rotation:
                            layer = layer.rotate(rotation, expand=True, resample=PILImage.BICUBIC)
                            mask = mask.rotate(rotation, expand=True, resample=PILImage.BICUBIC)
                        # Paste with mask
                        paste_x = int(x + width / 2 - layer.size[0] / 2)
                        paste_y = int(y + height / 2 - layer.size[1] / 2)
                        img.paste(layer, (paste_x, paste_y), mask)
                        return (paste_x, paste_y, paste_x + layer.size[0], paste_y + layer.size[1])
            except Exception:
                pass

        if shape_type == 'rectangle' or shape_type == 'rect':
            corner_radius = int(props.get('cornerRadius', props.get('borderRadius', 0)))
            if corner_radius > 0:
                self._draw_rounded_rectangle(ldraw, 0, 0, width, height, corner_radius, fill_color, stroke_color, stroke_width)
            else:
                ldraw.rectangle([0, 0, width, height], fill=fill_color, outline=stroke_color if stroke_width > 0 else None, width=stroke_width)
        elif shape_type == 'circle' or shape_type == 'ellipse':
            ldraw.ellipse([0, 0, width, height], fill=fill_color, outline=stroke_color if stroke_width > 0 else None, width=stroke_width)
        elif shape_type == 'arrow':
            self._draw_arrow(ldraw, 0, 0, width, height, fill_color, stroke_color, stroke_width)
        elif shape_type == 'star':
            points = int(props.get('points', 5))
            self._draw_star(ldraw, 0, 0, width, height, points, fill_color, stroke_color, stroke_width)
        elif shape_type == 'triangle':
            points = [(width/2, 0), (0, height), (width, height)]
            ldraw.polygon(points, fill=fill_color, outline=stroke_color if stroke_width > 0 else None, width=stroke_width)
        elif shape_type == 'hexagon':
            self._draw_polygon(ldraw, 0, 0, width, height, 6, fill_color, stroke_color, stroke_width)
        else:
            ldraw.rectangle([0, 0, width, height], fill=fill_color, outline=stroke_color if stroke_width > 0 else None, width=stroke_width)

        if rotation:
            layer = layer.rotate(rotation, expand=True, resample=_PILImage.BICUBIC)
        paste_x = int(x + width / 2 - layer.size[0] / 2)
        paste_y = int(y + height / 2 - layer.size[1] / 2)
        img.paste(layer, (paste_x, paste_y), layer)
        return (paste_x, paste_y, paste_x + layer.size[0], paste_y + layer.size[1])

    def _draw_rounded_rectangle(self, draw: ImageDraw.Draw, x: int, y: int, width: int, height: int, 
                               radius: int, fill_color: Optional[str], stroke_color: Optional[str], stroke_width: int):
        """Draw a rounded rectangle"""
        # Ensure radius is not too large
        radius = min(radius, width // 2, height // 2)
        
        # Create the shape
        if hasattr(draw, 'rounded_rectangle'):
            # Use built-in if available (PIL 8.2.0+)
            draw.rounded_rectangle([x, y, x + width, y + height], radius=radius,
                                 fill=fill_color, outline=stroke_color if stroke_width > 0 else None, width=stroke_width)
        else:
            # Manual implementation for older PIL versions
            # Draw the main rectangle without corners
            if fill_color:
                # Main body
                draw.rectangle([x + radius, y, x + width - radius, y + height], fill=fill_color)
                draw.rectangle([x, y + radius, x + width, y + height - radius], fill=fill_color)
                
                # Corners
                draw.pieslice([x, y, x + 2*radius, y + 2*radius], 180, 270, fill=fill_color)
                draw.pieslice([x + width - 2*radius, y, x + width, y + 2*radius], 270, 360, fill=fill_color)
                draw.pieslice([x, y + height - 2*radius, x + 2*radius, y + height], 90, 180, fill=fill_color)
                draw.pieslice([x + width - 2*radius, y + height - 2*radius, x + width, y + height], 0, 90, fill=fill_color)
            
            if stroke_color and stroke_width > 0:
                # Draw outline
                draw.arc([x, y, x + 2*radius, y + 2*radius], 180, 270, fill=stroke_color, width=stroke_width)
                draw.arc([x + width - 2*radius, y, x + width, y + 2*radius], 270, 360, fill=stroke_color, width=stroke_width)
                draw.arc([x, y + height - 2*radius, x + 2*radius, y + height], 90, 180, fill=stroke_color, width=stroke_width)
                draw.arc([x + width - 2*radius, y + height - 2*radius, x + width, y + height], 0, 90, fill=stroke_color, width=stroke_width)
                
                draw.line([x + radius, y, x + width - radius, y], fill=stroke_color, width=stroke_width)
                draw.line([x + radius, y + height, x + width - radius, y + height], fill=stroke_color, width=stroke_width)
                draw.line([x, y + radius, x, y + height - radius], fill=stroke_color, width=stroke_width)
                draw.line([x + width, y + radius, x + width, y + height - radius], fill=stroke_color, width=stroke_width)

    def _draw_arrow(self, draw: ImageDraw.Draw, x: int, y: int, width: int, height: int,
                   fill_color: Optional[str], stroke_color: Optional[str], stroke_width: int):
        """Draw an arrow shape pointing right"""
        # Arrow shape with 7 points
        arrow_head_width = width * 0.4
        arrow_body_height = height * 0.6
        
        points = [
            (x, y + (height - arrow_body_height) / 2),  # Top left of body
            (x + width - arrow_head_width, y + (height - arrow_body_height) / 2),  # Top right of body
            (x + width - arrow_head_width, y),  # Top of arrow head
            (x + width, y + height / 2),  # Arrow tip
            (x + width - arrow_head_width, y + height),  # Bottom of arrow head
            (x + width - arrow_head_width, y + (height + arrow_body_height) / 2),  # Bottom right of body
            (x, y + (height + arrow_body_height) / 2),  # Bottom left of body
        ]
        
        draw.polygon(points, fill=fill_color, outline=stroke_color if stroke_width > 0 else None, width=stroke_width)

    def _draw_star(self, draw: ImageDraw.Draw, x: int, y: int, width: int, height: int, 
                  num_points: int, fill_color: Optional[str], stroke_color: Optional[str], stroke_width: int):
        """Draw a star shape"""
        import math
        
        center_x = x + width / 2
        center_y = y + height / 2
        outer_radius = min(width, height) / 2
        inner_radius = outer_radius * 0.4
        
        points = []
        angle_step = 2 * math.pi / (num_points * 2)
        
        for i in range(num_points * 2):
            radius = outer_radius if i % 2 == 0 else inner_radius
            angle = i * angle_step - math.pi / 2  # Start from top
            px = center_x + radius * math.cos(angle)
            py = center_y + radius * math.sin(angle)
            points.append((px, py))
        
        draw.polygon(points, fill=fill_color, outline=stroke_color if stroke_width > 0 else None, width=stroke_width)

    def _draw_polygon(self, draw: ImageDraw.Draw, x: int, y: int, width: int, height: int,
                     sides: int, fill_color: Optional[str], stroke_color: Optional[str], stroke_width: int):
        """Draw a regular polygon"""
        import math
        
        center_x = x + width / 2
        center_y = y + height / 2
        radius = min(width, height) / 2
        
        points = []
        angle_step = 2 * math.pi / sides
        
        for i in range(sides):
            angle = i * angle_step - math.pi / 2  # Start from top
            px = center_x + radius * math.cos(angle)
            py = center_y + radius * math.sin(angle)
            points.append((px, py))
        
        draw.polygon(points, fill=fill_color, outline=stroke_color if stroke_width > 0 else None, width=stroke_width)
