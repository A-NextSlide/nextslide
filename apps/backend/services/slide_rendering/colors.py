from typing import List, Optional
from PIL import Image, ImageDraw


class ColorMixin:

    def _resolve_color(self, value: Optional[str]) -> Optional[str]:
        """Normalize color to #RRGGBB, return None for transparent/none."""
        if not value:
            return None
        if isinstance(value, str):
            v = value.strip().lower()
            if v in ("transparent", "none", "rgba(0,0,0,0)"):
                return None
            if v.startswith('#'):
                if len(v) == 9:  # #RRGGBBAA -> drop alpha
                    return v[:7]
                if len(v) == 7:
                    return v
            if v.startswith('rgba('):
                try:
                    inside = v[5:-1]
                    parts = [p.strip() for p in inside.split(',')]
                    r, g, b, a = int(float(parts[0])), int(float(parts[1])), int(float(parts[2])), float(parts[3])
                    if a <= 0:
                        return None
                    return f"#{r:02x}{g:02x}{b:02x}"
                except Exception:
                    return None
        return value

    def _render_linear_gradient(self, img: Image.Image, colors: List[str], angle: float = 0):
        """Render a linear gradient"""
        import math
        
        # Create a new image for the gradient
        gradient = Image.new('RGB', (self.canvas_width, self.canvas_height))
        draw = ImageDraw.Draw(gradient)
        
        # Convert angle to radians
        angle_rad = math.radians(angle)
        
        # Calculate gradient direction
        cos_angle = math.cos(angle_rad)
        sin_angle = math.sin(angle_rad)
        
        # Determine the gradient length
        gradient_length = abs(self.canvas_width * cos_angle) + abs(self.canvas_height * sin_angle)
        
        # Create gradient
        for i in range(int(gradient_length)):
            # Calculate position along gradient
            position = i / gradient_length
            
            # Interpolate color
            color = self._interpolate_color(colors, position)
            
            # Calculate line position
            if angle == 0:  # Optimize for common case
                draw.line([(i, 0), (i, self.canvas_height)], fill=color)
            elif angle == 90:  # Optimize for common case
                draw.line([(0, i), (self.canvas_width, i)], fill=color)
            else:
                # Calculate perpendicular line to gradient direction
                x1 = i * cos_angle
                y1 = i * sin_angle
                
                # Perpendicular direction
                perp_x = -sin_angle
                perp_y = cos_angle
                
                # Extend line across canvas
                scale = max(self.canvas_width, self.canvas_height) * 2
                draw.line([
                    (x1 - perp_x * scale, y1 - perp_y * scale),
                    (x1 + perp_x * scale, y1 + perp_y * scale)
                ], fill=color)
        
        # Paste gradient onto main image
        img.paste(gradient, (0, 0))

    def _render_radial_gradient(self, img: Image.Image, colors: List[str]):
        """Render a radial gradient"""
        import math
        
        # Create a new image for the gradient
        gradient = Image.new('RGB', (self.canvas_width, self.canvas_height))
        draw = ImageDraw.Draw(gradient)
        
        # Center of gradient
        center_x = self.canvas_width / 2
        center_y = self.canvas_height / 2
        
        # Maximum radius
        max_radius = math.sqrt(center_x**2 + center_y**2)
        
        # Draw concentric circles
        for r in range(int(max_radius), 0, -2):  # Step by 2 for performance
            position = r / max_radius
            color = self._interpolate_color(colors, 1 - position)  # Reverse for center to edge
            
            # Draw filled circle
            draw.ellipse([
                center_x - r, center_y - r,
                center_x + r, center_y + r
            ], fill=color, outline=None)
        
        # Paste gradient onto main image
        img.paste(gradient, (0, 0))

    def _interpolate_color(self, colors: List[str], position: float) -> str:
        """Interpolate between multiple colors at a given position (0-1)"""
        if not colors:
            return '#FFFFFF'
        
        if len(colors) == 1:
            return colors[0]
        
        # Clamp position
        position = max(0, min(1, position))
        
        # Find which two colors to interpolate between
        segment_size = 1.0 / (len(colors) - 1)
        segment_index = int(position / segment_size)
        
        # Handle edge case
        if segment_index >= len(colors) - 1:
            return colors[-1]
        
        # Local position within segment
        local_position = (position - segment_index * segment_size) / segment_size
        
        # Get colors to interpolate
        color1 = colors[segment_index]
        color2 = colors[segment_index + 1]
        
        # Convert hex to RGB
        r1, g1, b1 = int(color1[1:3], 16), int(color1[3:5], 16), int(color1[5:7], 16)
        r2, g2, b2 = int(color2[1:3], 16), int(color2[3:5], 16), int(color2[5:7], 16)
        
        # Interpolate
        r = int(r1 + (r2 - r1) * local_position)
        g = int(g1 + (g2 - g1) * local_position)
        b = int(b1 + (b2 - b1) * local_position)
        
        # Convert back to hex
        return f'#{r:02x}{g:02x}{b:02x}'
