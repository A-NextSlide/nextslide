"""
Slide Renderer - Converts slide JSON data to PNG images for visual validation

IMPROVEMENT PLAN:
=================
The visual analyzer looks at the ENTIRE visual output, not just red boxes. To make it more effective,
we need to improve this renderer to match the frontend rendering capabilities:

1. CUSTOM COMPONENTS - Currently just shows placeholder text
   TODO: Execute the JavaScript render function to generate actual content
   - Parse the render function 
   - Extract text content from props
   - Render styled components with proper layouts
   
2. ADVANCED SHAPES - Currently only rectangles/circles
   TODO: Add support for:
   - Arrows, stars, polygons
   - Rounded rectangles with customizable radius
   - Complex path shapes
   
3. GRADIENTS - Currently simplified to first color
   TODO: Implement proper gradient rendering:
   - Linear gradients with angle support
   - Radial gradients
   - Multiple color stops
   
4. TEXT RENDERING - Currently basic
   TODO: Improve text rendering:
   - Better font weight handling (100-900)
   - Text shadows
   - Letter spacing
   - Line height accuracy
   - Text decorations (underline, strike-through)
   
5. EFFECTS & STYLING
   TODO: Add support for:
   - Box shadows
   - Opacity/transparency
   - Backdrop filters
   - Border styles (dashed, dotted)
   
6. COMPONENT-SPECIFIC IMPROVEMENTS:
   - Charts: Render actual chart visualizations
   - Tables: Render table grid with data
   - Images: Load and render actual images (with fallback)
   
The visual analyzer will then be able to:
- Detect misaligned text in custom components
- See if decorative shapes are properly positioned
- Identify visual balance issues
- Make aesthetic improvements beyond just overlap detection
"""

import os
import json
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from typing import Dict, List, Any, Tuple, Optional
from datetime import datetime
from pathlib import Path
import textwrap
import logging
import math

logger = logging.getLogger(__name__)

class SlideRenderer:
    """Renders slide components to PNG images for visualization and debugging"""
    
    def __init__(self, output_dir: str = "/tmp/slide_renders"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        self.canvas_width = 1920
        self.canvas_height = 1080
        
        # Font settings - improved with web font mappings
        self.font_paths = {
            'Inter': [
                '/System/Library/Fonts/Helvetica.ttc',  # macOS
                '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',  # Linux
                'C:\\Windows\\Fonts\\arial.ttf',  # Windows
            ],
            'Poppins': [
                '/System/Library/Fonts/Supplemental/Trebuchet MS.ttf',  # macOS similar
                '/System/Library/Fonts/Helvetica.ttc',  # macOS fallback
                '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',  # Linux
                'C:\\Windows\\Fonts\\trebuc.ttf',  # Windows similar
            ],
            'Arial': [
                '/System/Library/Fonts/Helvetica.ttc',  # macOS fallback
                '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',  # Linux
                'C:\\Windows\\Fonts\\arial.ttf',  # Windows
            ],
            'Montserrat': [
                # Try to find Montserrat, fall back to similar fonts
                '/System/Library/Fonts/Avenir.ttc',  # macOS - similar geometric sans
                '/System/Library/Fonts/Helvetica.ttc',  # macOS fallback
                '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',  # Linux
                'C:\\Windows\\Fonts\\arialbd.ttf',  # Windows bold
            ],
            'Source Sans Pro': [
                '/System/Library/Fonts/HelveticaNeue.ttc',  # macOS - similar
                '/System/Library/Fonts/Helvetica.ttc',  # macOS fallback
                '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',  # Linux
                'C:\\Windows\\Fonts\\arial.ttf',  # Windows
            ],
            'Roboto': [
                '/System/Library/Fonts/Helvetica.ttc',  # macOS
                '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',  # Linux
                'C:\\Windows\\Fonts\\arial.ttf',  # Windows
            ]
        }
        
        # Default font path
        self.default_font_path = None
        for path in self.font_paths['Arial']:
            if os.path.exists(path):
                self.default_font_path = path
                break
        
        # Font cache
        self._font_cache = {}

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
        
    def get_font(self, family: str, size: int, weight: str = '400') -> ImageFont.FreeTypeFont:
        """Get font with caching"""
        cache_key = f"{family}_{size}_{weight}"
        
        if cache_key in self._font_cache:
            return self._font_cache[cache_key]
        
        # Try to find the font
        font_path = self.default_font_path
        
        if family in self.font_paths:
            for path in self.font_paths[family]:
                if '*' in path:
                    # Handle wildcards
                    import glob
                    matches = glob.glob(path)
                    if matches:
                        # Try to find best weight match
                        for match in matches:
                            if weight in ['700', '800', '900', 'bold'] and 'Bold' in match:
                                font_path = match
                                break
                            elif weight in ['300', '400', '500', 'normal'] and 'Regular' in match:
                                font_path = match
                                break
                        else:
                            font_path = matches[0]  # Use first match
                        break
                elif os.path.exists(path):
                    font_path = path
                    break
        
        try:
            font = ImageFont.truetype(font_path, size)
            self._font_cache[cache_key] = font
            return font
        except Exception as e:
            logger.warning(f"Failed to load font {family}: {e}, using default")
            font = ImageFont.load_default()
            self._font_cache[cache_key] = font
            return font
    
    def _parse_font_size(self, font_size_value: Any) -> int:
        """Parse font size value, handling strings with 'px' suffix"""
        if isinstance(font_size_value, str):
            # Remove 'px' suffix if present
            if font_size_value.endswith('px'):
                font_size_value = font_size_value[:-2]
            try:
                return int(font_size_value)
            except ValueError:
                logger.warning(f"Invalid font size value: {font_size_value}, using default 48")
                return 48
        elif isinstance(font_size_value, (int, float)):
            return int(font_size_value)
        else:
            logger.warning(f"Unexpected font size type: {type(font_size_value)}, using default 48")
            return 48
    
    def render_slide(self, slide_data: Dict[str, Any], deck_uuid: str = None, slide_index: int = 0) -> str:
        """
        Render a slide to PNG and return the file path
        
        Args:
            slide_data: Slide data with components
            deck_uuid: Optional deck UUID for file naming
            slide_index: Slide index for file naming
            
        Returns:
            Path to the rendered PNG file
        """
        # Create canvas
        img = Image.new('RGB', (self.canvas_width, self.canvas_height), color='white')
        draw = ImageDraw.Draw(img)
        
        # Track overlaps
        component_bounds = []
        overlaps = []
        text_overflows = []  # Track text overflow issues separately
        
        # Sort components by z-index (background first), prefer explicit props.zIndex when present
        components = slide_data.get('components', [])
        def _sort_key(c):
            props = c.get('props', {}) or {}
            if 'zIndex' in props and props['zIndex'] is not None:
                try:
                    return int(props['zIndex'])
                except Exception:
                    pass
            return self._get_z_index(c)
        sorted_components = sorted(components, key=_sort_key)
        
        # Render each component (diagnostic only; do not mutate positions)
        COLUMN_WIDTH = 140
        GUTTER = 20
        MARGIN = 80
        GRID_Y_STEP = 24
        MIN_GAP = 40

        def _snap_to_grid(x: int) -> int:
            if x <= MARGIN:
                return MARGIN
            col = round((x - MARGIN) / (COLUMN_WIDTH + GUTTER))
            return MARGIN + col * (COLUMN_WIDTH + GUTTER)

        for i, component in enumerate(sorted_components):
            bounds = self._render_component(img, draw, component)
            if bounds:
                # Check for overlaps with existing components (report only)
                for j, existing_bounds in enumerate(component_bounds):
                    if self._check_overlap(bounds, existing_bounds):
                        overlap_area = self._calculate_overlap_area(bounds, existing_bounds)
                        comp_type = component.get('type')
                        existing_comp = sorted_components[j]
                        overlaps.append({
                            'component1': component.get('id'),
                            'component2': existing_comp.get('id'),
                            'type1': comp_type,
                            'type2': existing_comp.get('type'),
                            'overlap_area': overlap_area,
                            'bounds1': bounds,
                            'bounds2': existing_bounds
                        })
                component_bounds.append(bounds)
        
        # Check for text overflow in components
        for i, component in enumerate(sorted_components):
            if self._check_text_overflow(component):
                text_overflows.append({
                    'component_index': i,
                    'component_id': component.get('id'),
                    'component_type': component.get('type'),
                    'message': 'Text content exceeds component bounds'
                })
        
        # Draw overlap indicators
        if overlaps:
            self._draw_overlap_indicators(draw, overlaps, component_bounds)
        
        # Add debug info
        self._add_debug_info(draw, slide_data, overlaps, text_overflows)
        
        # Save image
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"slide_{deck_uuid or 'test'}_{slide_index}_{timestamp}.png"
        filepath = self.output_dir / filename
        
        img.save(filepath, 'PNG', quality=95)
        logger.info(f"Rendered slide to: {filepath}")
        
        # Also save overlap report - include text overflow issues
        if overlaps or text_overflows:
            report_path = filepath.with_suffix('.json')
            with open(report_path, 'w') as f:
                json.dump({
                    'slide_id': slide_data.get('id'),
                    'overlaps': overlaps,
                    'text_overflows': text_overflows,
                    'component_count': len(components)
                }, f, indent=2)
            
            if overlaps:
                logger.warning(f"Found {len(overlaps)} overlaps! Report saved to: {report_path}")
            if text_overflows:
                logger.warning(f"Found {len(text_overflows)} text overflow issues! Report saved to: {report_path}")
        
        return str(filepath)
    
    def _get_z_index(self, component: Dict[str, Any]) -> int:
        """Get z-index for component type"""
        z_order = {
            'Background': 0,
            'Shape': 1,
            'Image': 2,
            'Chart': 3,
            'Table': 4,
            'TextBlock': 5,
            'TiptapTextBlock': 5,
            'Title': 6,
            'Lines': 7,
            'Group': 8,
            'CustomComponent': 7,
        }
        return z_order.get(component.get('type', ''), 10)
    
    def _render_component(self, img: Image.Image, draw: ImageDraw.Draw, component: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render a single component and return its bounds (x1, y1, x2, y2)"""
        comp_type = component.get('type', '')
        props = component.get('props', {})
        
        if comp_type == 'Background':
            return self._render_background(img, draw, props)
        elif comp_type in ['TextBlock', 'TiptapTextBlock', 'Title']:
            return self._render_text(img, draw, props, comp_type)
        elif comp_type == 'Shape':
            return self._render_shape(img, draw, props)
        elif comp_type == 'Image':
            return self._render_image(img, draw, props)
        elif comp_type == 'Group':
            # Group container is layout-only in this renderer; children are already absolute
            return None
        elif comp_type == 'Lines':
            return self._render_lines(img, draw, props)
        elif comp_type == 'CustomComponent':
            return self._render_custom_component(img, draw, props)
        elif comp_type in ['Chart', 'Table']:
            return self._render_data_component(img, draw, props, comp_type)
        else:
            logger.warning(f"Unknown component type: {comp_type}")
            return None
    
    def _render_background(self, img: Image.Image, draw: ImageDraw.Draw, props: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render background component. Prefer solid color; ignore gradients if both present."""
        bg_type = props.get('backgroundType', 'color')

        # Prefer gradient when explicitly requested
        if bg_type == 'gradient':
            gradient = props.get('gradient', {}) or {}
            # Normalize stops/colors → build a simple 2-stop gradient fallback render (solid using first stop)
            stops = gradient.get('stops') or []
            colors = gradient.get('colors') or []
            if not stops and isinstance(colors, list) and colors:
                # Create stops array from colors
                try:
                    n = len(colors)
                    stops = []
                    for i, c in enumerate(colors):
                        pos = (float(i) / float(max(1, n - 1))) * 100.0
                        stops.append({'color': c, 'position': pos})
                except Exception:
                    stops = []
            # For now, render a flat fill using the first stop
            first_color = None
            if isinstance(stops, list) and stops:
                first_color = (stops[0] or {}).get('color')
            if not first_color and isinstance(colors, list) and colors:
                first_color = colors[0]
            first = self._resolve_color(first_color or '#FFFFFF') or '#FFFFFF'
            from PIL import Image as _PILImage
            bg_img = _PILImage.new('RGB', (self.canvas_width, self.canvas_height), color=first)
            img.paste(bg_img, (0, 0))
            return None

        # If backgroundColor is present and no gradient is requested, use solid fill
        if isinstance(props.get('backgroundColor'), str):
            color = self._resolve_color(props.get('backgroundColor', '#FFFFFF')) or '#FFFFFF'
            if color is not None:
                from PIL import Image as _PILImage
                bg_img = _PILImage.new('RGB', (self.canvas_width, self.canvas_height), color=color)
                img.paste(bg_img, (0, 0))
                return None

        if bg_type == 'color':
            color = self._resolve_color(props.get('backgroundColor', '#FFFFFF')) or '#FFFFFF'
            # Handle transparent color
            if color is None:
                # Skip rendering for transparent backgrounds
                return None
            # Create new image with background color
            from PIL import Image as _PILImage
            bg_img = _PILImage.new('RGB', (self.canvas_width, self.canvas_height), color=color)
            img.paste(bg_img, (0, 0))
        elif bg_type == 'gradient':
            # Already handled above
            pass
        elif bg_type == 'image':
            # Handle image background
            image_url = props.get('backgroundImageUrl', props.get('imageUrl', ''))
            if image_url:
                try:
                    # Decode data URL if present
                    import base64, io
                    data = image_url
                    if data.startswith('data:image'):
                        header, b64 = data.split(',', 1)
                        img_bytes = base64.b64decode(b64)
                        with Image.open(io.BytesIO(img_bytes)) as bg:
                            bg = bg.convert('RGB')
                            # Object-fit: cover
                            sw, sh = self.canvas_width, self.canvas_height
                            iw, ih = bg.size
                            scale = max(sw / iw, sh / ih)
                            new_size = (int(iw * scale), int(ih * scale))
                            bg = bg.resize(new_size, Image.LANCZOS)
                            # Center crop
                            left = (bg.size[0] - sw) // 2
                            top = (bg.size[1] - sh) // 2
                            bg = bg.crop((left, top, left + sw, top + sh))
                            img.paste(bg, (0, 0))
                    else:
                        # Unknown format; draw placeholder
                        draw.rectangle([0, 0, self.canvas_width, self.canvas_height], fill='#F0F0F0')
                except Exception:
                    # Fallback placeholder
                    draw.rectangle([0, 0, self.canvas_width, self.canvas_height], fill='#EDEDED')
        
        return None  # Background doesn't have bounds for overlap
    
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
    
    def _render_text(self, img: Image.Image, draw: ImageDraw.Draw, props: Dict[str, Any], comp_type: str) -> Optional[Tuple[int, int, int, int]]:
        """Render text component with accurate sizing and alignment"""
        position = props.get('position', {'x': 0, 'y': 0})
        x = int(position.get('x', 0))
        y = int(position.get('y', 0))
        width = int(props.get('width', 800))
        height = int(props.get('height', 100))
        
        # Get text content - handle TiptapTextBlock format
        text = ""
        if 'text' in props:
            text = props['text']
        elif 'texts' in props:
            # TiptapTextBlock format - might be nested structure
            texts = props['texts']
            if isinstance(texts, dict) and 'content' in texts:
                # Handle Tiptap document structure
                content = texts.get('content', [])
                if content and isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get('type') == 'paragraph':
                            para_content = block.get('content', [])
                            for item in para_content:
                                if isinstance(item, dict) and 'text' in item:
                                    text += item['text']
            elif isinstance(texts, list) and texts:
                text = texts[0].get('text', '') if isinstance(texts[0], dict) else str(texts[0])
        elif 'content' in props and isinstance(props['content'], dict):
            # Our importer stores tiptap doc under props.content
            content = props['content'].get('content', [])
            for block in content or []:
                if isinstance(block, dict) and block.get('type') == 'paragraph':
                    for item in block.get('content', []) or []:
                        if isinstance(item, dict) and 'text' in item:
                            text += item['text']
        
        # Get font properties
        # Prefer explicit px if provided, otherwise convert pt->px for TiptapTextBlock
        if props.get('fontSizePx') is not None:
            font_size = int(props.get('fontSizePx') or 48)
        else:
            raw_size = props.get('fontSize', 48)
            if comp_type == 'TiptapTextBlock' and isinstance(raw_size, (int, float)):
                # Convert points to pixels when only pt is provided
                font_size = int(round(float(raw_size) * 96 / 72))
            else:
                font_size = self._parse_font_size(raw_size)
        font_family = props.get('fontFamily', 'Montserrat')
        font_weight = str(props.get('fontWeight', '400'))
        # Prefer first segment's color if provided (TiptapTextBlock texts[])
        seg_color = None
        try:
            texts_prop = props.get('texts')
            if isinstance(texts_prop, list) and len(texts_prop) > 0:
                first = texts_prop[0]
                if isinstance(first, dict):
                    seg_color = (first.get('style') or {}).get('textColor') or (first.get('style') or {}).get('color')
        except Exception:
            seg_color = None
        text_color = seg_color or props.get('textColor', props.get('color', '#000000'))
        # Normalize text color to #RRGGBB, treat transparent/none as black
        text_color = self._resolve_color(text_color) or '#000000'
        alignment = props.get('alignment', 'left')  # Get alignment property
        vertical_alignment = props.get('verticalAlignment', 'top')
        line_height_mult = float(props.get('lineHeight', 1.2))
        
        # Get font with better fallback
        # Map Google font fallbacks (Anton → Impact/Arial Black/HKGroteskWide-Black)
        fallback_map = {
            'Anton': ['Impact', 'Arial Black', 'HKGroteskWide-Black', 'Arial'],
        }
        fam_candidates = [font_family] + fallback_map.get(font_family, [])
        font = None
        for fam in fam_candidates:
            try:
                font = self.get_font(fam, font_size, font_weight)
                break
            except Exception:
                continue
        if font is None:
            font = self.get_font('Arial', font_size, font_weight)
        
        # Draw container background only if specified
        container_color = props.get('backgroundColor', None)
        if container_color and container_color != 'transparent' and container_color != 'rgba(0,0,0,0)':
            draw.rectangle([x, y, x + width, y + height], fill=container_color)
        
        # Don't draw debug borders for production renders
        # Only draw them if we're in debug mode or there's an issue
        
        # Calculate text bounds and wrap if needed
        padding = int(props.get('padding', 0))  # TiptapTextBlock often has 0 padding
        text_x = x + padding
        text_y = y + padding
        text_width = width - (2 * padding)
        text_height = height - (2 * padding)
        
        # Wrap text to fit width
        wrapped_lines = self._wrap_text(text, font, text_width)
        
        # Calculate actual text height needed
        line_height = font_size * line_height_mult
        total_lines_height = len(wrapped_lines) * line_height
        
        # Calculate starting Y position based on vertical alignment
        if vertical_alignment == 'middle':
            start_y = text_y + (text_height - total_lines_height) / 2
        elif vertical_alignment == 'bottom':
            start_y = text_y + text_height - total_lines_height
        else:
            start_y = text_y
        
        # Check if text fits (more accurate check)
        text_fits = total_lines_height <= text_height
        
        # Draw each line with proper alignment
        current_y = start_y
        for i, line in enumerate(wrapped_lines):
            # Skip lines that would go outside the container
            if current_y < y or current_y + line_height > y + height:
                text_fits = False
                continue
            
            # Calculate X position based on alignment
            bbox = font.getbbox(line)
            line_width = bbox[2] - bbox[0]
            
            if alignment == 'center':
                line_x = x + (width - line_width) // 2
            elif alignment == 'right':
                line_x = x + width - line_width - padding
            else:
                line_x = text_x
            
            draw.text((line_x, current_y), line, font=font, fill=text_color)
            current_y += line_height
        
        # Only show overflow indicator if text actually doesn't fit
        if not text_fits and len(wrapped_lines) > 0:
            # Red border for overflow
            draw.rectangle([x, y, x + width, y + height], outline='#FF0000', width=3)
            # Add warning text
            warning_font = self.get_font('Arial', 12)
            draw.text((x + 5, y + 5), "TEXT OVERFLOW!", font=warning_font, fill='#FF0000')
        
        return (x, y, x + width, y + height)
    
    def _wrap_text(self, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> List[str]:
        """Wrap text to fit within max_width"""
        words = text.split()
        lines = []
        current_line = []
        
        for word in words:
            test_line = ' '.join(current_line + [word])
            bbox = font.getbbox(test_line)
            text_width = bbox[2] - bbox[0]
            
            if text_width <= max_width:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                    current_line = [word]
                else:
                    # Word is too long, force break
                    lines.append(word)
                    current_line = []
        
        if current_line:
            lines.append(' '.join(current_line))
        
        return lines if lines else ['']
    
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
    
    def _render_custom_component(self, img: Image.Image, draw: ImageDraw.Draw, props: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render custom component with enhanced content extraction and display"""
        position = props.get('position', {'x': 0, 'y': 0})
        x = int(position.get('x', 0))
        y = int(position.get('y', 0))
        width = int(props.get('width', 300))
        height = int(props.get('height', 200))
        
        # Get the component's internal props
        internal_props = props.get('props', {})
        
        # Parse the render function to extract text content more intelligently
        render_function = internal_props.get('render', '')
        extracted_text = self._extract_text_from_render_function(render_function, internal_props)
        
        # Detect component type based on props and render function
        component_style = self._detect_component_style(internal_props, render_function)
        
        # Extract all text content in a structured way
        content_structure = self._extract_structured_content(internal_props)
        
        # If we extracted text from render function, add it to content structure
        if extracted_text:
            content_structure['render_text'] = extracted_text
            if not content_structure.get('main_text'):
                content_structure['main_text'] = extracted_text
        
        # Handle specific interactive component types
        if 'quiz' in render_function.lower() or 'question' in str(internal_props):
            return self._render_quiz_component(img, draw, x, y, width, height, internal_props, content_structure)
        elif 'poll' in render_function.lower() or 'vote' in str(internal_props):
            return self._render_poll_component(img, draw, x, y, width, height, internal_props, content_structure)
        elif 'slider' in render_function.lower() or 'calculate' in str(internal_props):
            return self._render_slider_component(img, draw, x, y, width, height, internal_props, content_structure)
        elif 'timeline' in render_function.lower():
            return self._render_timeline_component(img, draw, x, y, width, height, internal_props, content_structure)
        elif 'kpi' in render_function.lower() or 'metric' in str(internal_props):
            return self._render_kpi_component(img, draw, x, y, width, height, internal_props, content_structure)
        elif 'countdown' in render_function.lower() or 'timer' in str(internal_props):
            return self._render_countdown_component(img, draw, x, y, width, height, internal_props, content_structure)
        elif 'progress' in render_function.lower() and 'ring' in render_function.lower():
            return self._render_progress_rings(img, draw, x, y, width, height, internal_props, content_structure)
        
        # Get styling properties - enhanced font size detection
        # Check multiple possible locations for fontSize
        font_size = None
        
        # Priority order for finding fontSize:
        # 1. Direct fontSize in internal props
        if 'fontSize' in internal_props:
            font_size = self._parse_font_size(internal_props['fontSize'])
        # 2. fontSize in the outer props
        elif 'fontSize' in props:
            font_size = self._parse_font_size(props['fontSize'])
        # 3. Check nested style objects
        elif 'style' in internal_props and isinstance(internal_props['style'], dict):
            if 'fontSize' in internal_props['style']:
                font_size = self._parse_font_size(internal_props['style']['fontSize'])
        # 4. Check specific text type font sizes
        elif 'textFontSize' in internal_props:
            font_size = self._parse_font_size(internal_props['textFontSize'])
        # 5. Extract from render function
        elif not font_size:
            font_size = self._extract_font_size_from_render(render_function, internal_props)
        # 6. Default fallback
        if not font_size:
            font_size = 48
            
        # Log the detected font size for debugging
        logger.debug(f"CustomComponent font size detected: {font_size}px from props: {internal_props.keys()}")
        
        font_family = internal_props.get('fontFamily', 'Arial')
        font_weight = str(internal_props.get('fontWeight', '400'))
        text_color = internal_props.get('textColor', internal_props.get('color', '#333333'))
        line_height = float(internal_props.get('lineHeight', 1.2))
        text_align = internal_props.get('textAlign', 'left')
        
        # Draw container background
        bg_color = props.get('backgroundColor', internal_props.get('backgroundColor', 'transparent'))
        border_color = internal_props.get('borderColor', None)
        border_width = int(internal_props.get('borderWidth', 0))
        
        if bg_color and bg_color != 'transparent' and not bg_color.startswith('rgba'):
            draw.rectangle([x, y, x + width, y + height], fill=bg_color)
        
        # Draw border if specified
        if border_color and border_width > 0:
            draw.rectangle([x, y, x + width, y + height], outline=border_color, width=border_width)
        elif not bg_color or bg_color == 'transparent':
            # Draw subtle border to show bounds
            draw.rectangle([x, y, x + width, y + height], outline='#CCCCCC', width=1)
        
        # Calculate content area
        padding = int(internal_props.get('padding', 20))
        content_x = x + padding
        content_y = y + padding
        content_width = width - (2 * padding)
        content_height = height - (2 * padding)
        
        # Track if content fits
        content_fits = True
        
        # Render based on component style
        if component_style == 'title_subtitle':
            content_fits = self._render_title_subtitle(draw, content_structure, content_x, content_y, 
                                                      content_width, content_height, internal_props)
        elif component_style == 'list':
            content_fits = self._render_list_content(draw, content_structure, content_x, content_y, 
                                                   content_width, content_height, internal_props)
        elif component_style == 'facts':
            content_fits = self._render_facts_content(draw, content_structure, content_x, content_y, 
                                                    content_width, content_height, internal_props)
        elif component_style == 'comparison':
            content_fits = self._render_comparison_content(draw, content_structure, content_x, content_y, 
                                                         content_width, content_height, internal_props)
        else:
            # Default text rendering - render ALL found texts including from render function
            all_texts = content_structure.get('all_texts', [])
            main_text = content_structure.get('main_text', '')
            render_text = content_structure.get('render_text', '')
            
            # Prioritize render_text if available
            if render_text and render_text not in all_texts:
                all_texts.insert(0, render_text)
            
            # If we have multiple texts, render them all
            if all_texts and len(all_texts) > 1:
                # Render each text with appropriate spacing
                current_y = content_y
                
                for i, text in enumerate(all_texts):
                    if not text.strip():  # Skip empty texts
                        continue
                        
                    # Use the specified font size or slightly smaller for multiple texts
                    text_font_size = font_size if len(all_texts) <= 3 else int(font_size * 0.85)
                    font = self.get_font(font_family, text_font_size, font_weight)
                    wrapped_lines = self._wrap_text(text, font, content_width)
                    
                    line_spacing = text_font_size * line_height
                    
                    for line in wrapped_lines:
                        if current_y + line_spacing > y + height - padding:
                            content_fits = False
                            break
                        
                        # Apply text alignment
                        if text_align == 'center':
                            bbox = font.getbbox(line)
                            line_width = bbox[2] - bbox[0]
                            line_x = content_x + (content_width - line_width) // 2
                        elif text_align == 'right':
                            bbox = font.getbbox(line)
                            line_width = bbox[2] - bbox[0]
                            line_x = content_x + content_width - line_width
                        else:
                            line_x = content_x
                        
                        draw.text((line_x, current_y), line, font=font, fill=text_color)
                        current_y += line_spacing
                    
                    # Add spacing between different text blocks
                    if i < len(all_texts) - 1:
                        current_y += 10
                    
                    if not content_fits:
                        break
            
            elif main_text or render_text:
                # Single text rendering (prioritize render_text)
                text_to_render = render_text if render_text else main_text
                font = self.get_font(font_family, font_size, font_weight)
                wrapped_lines = self._wrap_text(text_to_render, font, content_width)
                
                line_spacing = font_size * line_height
                total_height = len(wrapped_lines) * line_spacing
                content_fits = total_height <= content_height
                
                current_y = content_y
                for line in wrapped_lines:
                    if current_y + line_spacing > y + height - padding:
                        content_fits = False
                        break
                    
                    # Apply text alignment
                    if text_align == 'center':
                        bbox = font.getbbox(line)
                        line_width = bbox[2] - bbox[0]
                        line_x = content_x + (content_width - line_width) // 2
                    elif text_align == 'right':
                        bbox = font.getbbox(line)
                        line_width = bbox[2] - bbox[0]
                        line_x = content_x + content_width - line_width
                    else:
                        line_x = content_x
                    
                    draw.text((line_x, current_y), line, font=font, fill=text_color)
                    current_y += line_spacing
            else:
                # No text found - render a placeholder so Claude knows
                placeholder_font = self.get_font('Arial', 14)
                placeholder_text = "[No text content found]"
                draw.text((content_x, content_y), placeholder_text, font=placeholder_font, fill='#999999')
        
        # Draw overflow indicator if content doesn't fit
        if not content_fits:
            draw.rectangle([x, y, x + width, y + height], outline='#FF0000', width=3)
            warning_font = self.get_font('Arial', 12)
            draw.text((x + 5, y + 5), "TEXT OVERFLOW!", font=warning_font, fill='#FF0000')
        
        # Special decorations (sparkles, icons, etc.) - avoid emojis in custom components
        # If sparkle accents are requested, render a non-emoji visual accent (small star-like shape)
        if 'sparkles' in internal_props:
            try:
                accent_color = text_color
                # Draw a simple 4-point star shape instead of emoji
                cx, cy = x + width - 30, y + 30
                size = 8
                points = [
                    (cx, cy - size),
                    (cx + size, cy),
                    (cx, cy + size),
                    (cx - size, cy),
                ]
                draw.polygon(points, fill=accent_color)
            except Exception:
                pass
        
        return (x, y, x + width, y + height)
    
    def _extract_text_from_render_function(self, render_function: str, props: Dict[str, Any]) -> str:
        """Extract text content from the JavaScript render function"""
        if not render_function:
            return ""
        
        # Look for text being returned in the render function
        # Common patterns:
        # 1. Direct text in createElement: React.createElement('div', {}, 'text')
        # 2. Variable references: props.text, props.mainText, etc.
        # 3. Template literals: `${props.text}`
        
        import re
        
        # Extract all text-like content from the render function
        extracted_texts = []
        
        # Pattern 1: Direct strings in createElement
        create_element_pattern = r"React\.createElement\s*\([^,]+,\s*{[^}]*}\s*,\s*['\"]([^'\"]+)['\"]"
        matches = re.findall(create_element_pattern, render_function)
        extracted_texts.extend(matches)
        
        # Pattern 2: Props references
        props_pattern = r"props\.(\w+)"
        prop_names = re.findall(props_pattern, render_function)
        for prop_name in prop_names:
            if prop_name in props and isinstance(props[prop_name], str):
                # Skip non-text props
                if prop_name not in ['color', 'backgroundColor', 'fontFamily', 'textAlign', 'render']:
                    extracted_texts.append(props[prop_name])
        
        # Pattern 3: Variable assignments with default values
        default_pattern = r"props\.(\w+)\s*\|\|\s*['\"]([^'\"]+)['\"]"
        for match in re.finditer(default_pattern, render_function):
            prop_name = match.group(1)
            default_value = match.group(2)
            if prop_name in props:
                value = props[prop_name]
                if isinstance(value, str) and value:
                    extracted_texts.append(value)
            else:
                extracted_texts.append(default_value)
        
        # Remove duplicates and join
        unique_texts = []
        for text in extracted_texts:
            if text and text not in unique_texts:
                unique_texts.append(text)
        
        return ' '.join(unique_texts)
    
    def _extract_font_size_from_render(self, render_function: str, props: Dict[str, Any]) -> Optional[int]:
        """Extract font size from render function"""
        if not render_function:
            return None
        
        import re
        
        # Look for fontSize in style objects
        # Pattern: fontSize: props.fontSize || 48
        font_size_pattern = r"fontSize:\s*(?:props\.fontSize\s*\|\|\s*)?(\d+)"
        match = re.search(font_size_pattern, render_function)
        if match:
            return int(match.group(1))
        
        # Pattern: fontSize: fontSize (where fontSize is a variable)
        # Need to find where fontSize is defined
        var_pattern = r"const\s+fontSize\s*=\s*(?:props\.fontSize\s*\|\|\s*)?(\d+)"
        match = re.search(var_pattern, render_function)
        if match:
            return int(match.group(1))
        
        # Pattern: fontSize + 'px'
        dynamic_pattern = r"fontSize\s*\+\s*['\"]px['\"]"
        if re.search(dynamic_pattern, render_function):
            # Look for fontSize variable definition
            if 'fontSize' in props:
                return self._parse_font_size(props['fontSize'])
        
        return None
    
    def _detect_component_style(self, props: Dict[str, Any], render_function: str = "") -> str:
        """Detect the style/type of custom component based on its props"""
        # Check for specific patterns in props
        if 'title' in props and 'subtitle' in props:
            return 'title_subtitle'
        elif 'facts' in props or 'factList' in props or 'items' in props:
            return 'facts'
        elif 'listItems' in props or 'bullets' in props:
            return 'list'
        elif 'comparison' in props or ('left' in props and 'right' in props):
            return 'comparison'
        else:
            return 'default'
    
    def _extract_structured_content(self, props: Dict[str, Any]) -> Dict[str, Any]:
        """Extract content from props in a structured way - enhanced to capture ALL text"""
        content = {
            'main_text': '',
            'title': '',
            'subtitle': '',
            'items': [],
            'facts': [],
            'all_texts': []  # New: collect ALL text found
        }
        
        # Extract title/subtitle - check more field names
        title_fields = ['title', 'heading', 'header', 'mainTitle', 'primaryText']
        for field in title_fields:
            if field in props and props[field]:
                content['title'] = str(props[field])
                break
        
        subtitle_fields = ['subtitle', 'subheading', 'subtext', 'secondaryText', 'description']
        for field in subtitle_fields:
            if field in props and props[field]:
                content['subtitle'] = str(props[field])
                break
        
        # Extract list items - check more field names
        list_fields = ['items', 'listItems', 'bullets', 'points', 'features', 'benefits']
        for field in list_fields:
            if field in props and isinstance(props[field], list):
                content['items'] = [str(item) for item in props[field]]
                break
        
        # Extract facts - check more field names
        fact_fields = ['facts', 'factList', 'keyPoints', 'highlights']
        for field in fact_fields:
            if field in props and isinstance(props[field], list):
                content['facts'] = [str(fact) for fact in props[field]]
                break
        
        # Comprehensive text extraction - look for ALL text fields
        text_keywords = [
            'text', 'mainText', 'content', 'message', 'description', 'value',
            'label', 'caption', 'body', 'paragraph', 'line', 'statement',
            'question', 'answer', 'prompt', 'response', 'note', 'info',
            'summary', 'detail', 'excerpt', 'quote', 'tagline', 'slogan'
        ]
        
        texts = []
        all_found_texts = []
        
        def extract_text_recursive(obj: Any, path: str = ''):
            """Recursively extract text from nested structures"""
            if isinstance(obj, str) and obj != 'render' and len(obj) > 0:
                # Skip the render function and empty strings
                if not obj.startswith('function') and not obj.startswith('()'):
                    all_found_texts.append((path, obj))
                    return obj
            elif isinstance(obj, dict):
                for key, value in obj.items():
                    if key == 'render':  # Skip render function
                        continue
                    new_path = f"{path}.{key}" if path else key
                    # Check if this key suggests text content
                    if any(keyword in key.lower() for keyword in text_keywords):
                        result = extract_text_recursive(value, new_path)
                        if result and isinstance(result, str):
                            texts.append(result)
                    else:
                        # Still check nested content
                        extract_text_recursive(value, new_path)
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    extract_text_recursive(item, f"{path}[{i}]")
            return None
        
        # Extract all text recursively
        extract_text_recursive(props)
        
        # Log what we found for debugging
        if all_found_texts:
            logger.debug(f"CustomComponent text extraction found {len(all_found_texts)} text fields:")
            for path, text in all_found_texts[:10]:  # Log first 10
                logger.debug(f"  {path}: {text[:50]}...")
        
        # Store all found texts
        content['all_texts'] = [text for _, text in all_found_texts]
        
        # Set main_text from collected texts (excluding items/facts already captured)
        if texts:
            # Filter out texts that are already in items or facts
            item_texts = set(content['items'])
            fact_texts = set(content['facts'])
            unique_texts = [t for t in texts if t not in item_texts and t not in fact_texts]
            content['main_text'] = ' '.join(unique_texts)
        
        return content
    
    def _render_title_subtitle(self, draw: ImageDraw.Draw, content: Dict, x: int, y: int, 
                              width: int, height: int, props: Dict) -> bool:
        """Render title and subtitle layout"""
        title = content.get('title', '')
        subtitle = content.get('subtitle', '')
        
        # Title styling
        title_size = int(self._parse_font_size(props.get('titleFontSize', props.get('fontSize', 72))))
        title_font = self.get_font(props.get('fontFamily', 'Arial'), title_size, 'bold')
        title_color = props.get('titleColor', props.get('textColor', '#000000'))
        
        # Subtitle styling
        subtitle_size = int(title_size * 0.6)
        subtitle_font = self.get_font(props.get('fontFamily', 'Arial'), subtitle_size, '400')
        subtitle_color = props.get('subtitleColor', props.get('textColor', '#666666'))
        
        current_y = y
        fits = True
        
        # Render title
        if title:
            wrapped_title = self._wrap_text(title, title_font, width)
            for line in wrapped_title:
                if current_y + title_size * 1.2 > y + height:
                    fits = False
                    break
                draw.text((x, current_y), line, font=title_font, fill=title_color)
                current_y += int(title_size * 1.2)
            
            current_y += 20  # Gap between title and subtitle
        
        # Render subtitle
        if subtitle and fits:
            wrapped_subtitle = self._wrap_text(subtitle, subtitle_font, width)
            for line in wrapped_subtitle:
                if current_y + subtitle_size * 1.2 > y + height:
                    fits = False
                    break
                draw.text((x, current_y), line, font=subtitle_font, fill=subtitle_color)
                current_y += int(subtitle_size * 1.2)
        
        return fits
    
    def _render_list_content(self, draw: ImageDraw.Draw, content: Dict, x: int, y: int,
                           width: int, height: int, props: Dict) -> bool:
        """Render list/bullet point content"""
        items = content.get('items', [])
        if not items:
            return True
        
        # List styling
        font_size = self._parse_font_size(props.get('fontSize', 36))
        font = self.get_font(props.get('fontFamily', 'Arial'), font_size, props.get('fontWeight', '400'))
        text_color = props.get('textColor', '#333333')
        bullet_style = props.get('bulletStyle', '•')
        
        current_y = y
        fits = True
        line_height = font_size * 1.4
        indent = 30
        
        for item in items:
            if current_y + line_height > y + height:
                fits = False
                break
            
            # Draw bullet
            draw.text((x, current_y), bullet_style, font=font, fill=text_color)
            
            # Draw item text
            item_x = x + indent
            item_width = width - indent
            wrapped_lines = self._wrap_text(str(item), font, item_width)
            
            for i, line in enumerate(wrapped_lines):
                if current_y + line_height > y + height:
                    fits = False
                    break
                draw.text((item_x, current_y), line, font=font, fill=text_color)
                current_y += int(line_height)
                if i < len(wrapped_lines) - 1:
                    item_x = x + indent  # Maintain indent for wrapped lines
            
            current_y += 10  # Gap between items
        
        return fits
    
    def _render_facts_content(self, draw: ImageDraw.Draw, content: Dict, x: int, y: int,
                            width: int, height: int, props: Dict) -> bool:
        """Render facts/key points content"""
        facts = content.get('facts', [])
        title = content.get('title', '')
        
        if not facts and not title:
            return True
        
        current_y = y
        fits = True
        
        # Render title if present
        if title:
            title_size = self._parse_font_size(props.get('titleFontSize', 48))
            title_font = self.get_font(props.get('fontFamily', 'Arial'), title_size, 'bold')
            title_color = props.get('titleColor', props.get('textColor', '#000000'))
            
            wrapped_title = self._wrap_text(title, title_font, width)
            for line in wrapped_title:
                if current_y + title_size * 1.2 > y + height:
                    fits = False
                    break
                draw.text((x, current_y), line, font=title_font, fill=title_color)
                current_y += int(title_size * 1.2)
            
            current_y += 20
        
        # Render facts
        fact_size = self._parse_font_size(props.get('factFontSize', props.get('fontSize', 32)))
        fact_font = self.get_font(props.get('fontFamily', 'Arial'), fact_size, '400')
        fact_color = props.get('factColor', props.get('textColor', '#444444'))
        
        for i, fact in enumerate(facts):
            if current_y + fact_size * 1.3 > y + height:
                fits = False
                break
            
            # Add fact number or bullet
            prefix = f"{i + 1}. " if props.get('numbered', False) else "• "
            
            wrapped_lines = self._wrap_text(prefix + str(fact), fact_font, width)
            for line in wrapped_lines:
                if current_y + fact_size * 1.3 > y + height:
                    fits = False
                    break
                draw.text((x, current_y), line, font=fact_font, fill=fact_color)
                current_y += int(fact_size * 1.3)
            
            current_y += 15  # Gap between facts
        
        return fits
    
    def _render_comparison_content(self, draw: ImageDraw.Draw, content: Dict, x: int, y: int,
                                 width: int, height: int, props: Dict) -> bool:
        """Render comparison/two-column content"""
        # Simple two-column layout
        column_width = (width - 20) // 2
        left_content = props.get('left', props.get('column1', ''))
        right_content = props.get('right', props.get('column2', ''))
        
        font_size = self._parse_font_size(props.get('fontSize', 32))
        font = self.get_font(props.get('fontFamily', 'Arial'), font_size, '400')
        text_color = props.get('textColor', '#333333')
        
        fits = True
        
        # Render left column
        if left_content:
            wrapped = self._wrap_text(str(left_content), font, column_width)
            current_y = y
            for line in wrapped:
                if current_y + font_size * 1.2 > y + height:
                    fits = False
                    break
                draw.text((x, current_y), line, font=font, fill=text_color)
                current_y += int(font_size * 1.2)
        
        # Render right column
        if right_content:
            wrapped = self._wrap_text(str(right_content), font, column_width)
            current_y = y
            for line in wrapped:
                if current_y + font_size * 1.2 > y + height:
                    fits = False
                    break
                draw.text((x + column_width + 20, current_y), line, font=font, fill=text_color)
                current_y += int(font_size * 1.2)
        
        return fits
    
    def _render_data_component(self, img: Image.Image, draw: ImageDraw.Draw, props: Dict[str, Any], comp_type: str) -> Optional[Tuple[int, int, int, int]]:
        """Render chart or table placeholder"""
        position = props.get('position', {'x': 0, 'y': 0})
        x = int(position.get('x', 0))
        y = int(position.get('y', 0))
        width = int(props.get('width', 600))
        height = int(props.get('height', 400))
        
        # Draw container
        draw.rectangle([x, y, x + width, y + height], fill='#FAFAFA', outline='#DDDDDD', width=2)
        
        # Add type label
        font = self.get_font('Arial', 20)
        draw.text((x + 20, y + 20), comp_type.upper(), font=font, fill='#666666')
        
        if comp_type == 'Chart':
            # Draw simple chart representation
            chart_type = props.get('chartType', 'bar')
            if chart_type == 'bar':
                # Draw bars
                bar_width = 40
                bar_spacing = 20
                bar_x = x + 50
                for i in range(4):
                    bar_height = 50 + i * 40
                    bar_y = y + height - bar_height - 50
                    draw.rectangle([bar_x, bar_y, bar_x + bar_width, y + height - 50], 
                                 fill='#4CAF50', outline='#388E3C')
                    bar_x += bar_width + bar_spacing
        
        return (x, y, x + width, y + height)
    
    def _check_overlap(self, bounds1: Tuple[int, int, int, int], bounds2: Tuple[int, int, int, int]) -> bool:
        """Check if two bounds overlap"""
        x1, y1, x2, y2 = bounds1
        x3, y3, x4, y4 = bounds2
        
        # Check if rectangles don't overlap
        if x2 <= x3 or x4 <= x1 or y2 <= y3 or y4 <= y1:
            return False
        return True
    
    def _calculate_overlap_area(self, bounds1: Tuple[int, int, int, int], bounds2: Tuple[int, int, int, int]) -> int:
        """Calculate overlap area between two bounds"""
        x1, y1, x2, y2 = bounds1
        x3, y3, x4, y4 = bounds2
        
        # Calculate intersection
        left = max(x1, x3)
        right = min(x2, x4)
        top = max(y1, y3)
        bottom = min(y2, y4)
        
        if left < right and top < bottom:
            return (right - left) * (bottom - top)
        return 0
    
    def _draw_overlap_indicators(self, draw: ImageDraw.Draw, overlaps: List[Dict], bounds: List[Tuple]):
        """Draw indicators for overlapping components"""
        # Note: This is simplified since we can't easily do transparency with basic PIL
        for overlap in overlaps:
            area = overlap['overlap_area']
            if area > 1000:  # Only show significant overlaps
                # Draw warning text
                font = self.get_font('Arial', 14, 'bold')
                draw.text((10, 80 + len(overlaps) * 20), 
                         f"⚠️ {overlap['type1']} overlaps {overlap['type2']} ({area} px²)", 
                         font=font, fill='#FF0000')
    
    def _add_debug_info(self, draw: ImageDraw.Draw, slide_data: Dict[str, Any], overlaps: List[Dict], text_overflows: List[Dict] = None):
        """Add debug information to the rendered image"""
        if text_overflows is None:
            text_overflows = []
            
        # Add title and info
        font = self.get_font('Arial', 14)
        title = slide_data.get('title', 'Untitled Slide')
        draw.text((10, 10), f"Slide: {title}", font=font, fill='#000000')
        
        # Add component count
        component_count = len(slide_data.get('components', []))
        draw.text((10, 30), f"Components: {component_count}", font=font, fill='#000000')
        
        # Add overlap warning
        if overlaps:
            warning_font = self.get_font('Arial', 16, 'bold')
            draw.text((10, 50), f"⚠️ {len(overlaps)} OVERLAPS DETECTED!", font=warning_font, fill='#FF0000')
            
        # Add text overflow warning
        if text_overflows:
            warning_font = self.get_font('Arial', 16, 'bold')
            y_pos = 70 if overlaps else 50
            draw.text((10, y_pos), f"⚠️ {len(text_overflows)} TEXT OVERFLOW ISSUES!", font=warning_font, fill='#FF0000')
        
        # Add timestamp
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        draw.text((self.canvas_width - 200, 10), timestamp, font=font, fill='#666666')
    
    def _check_text_overflow(self, component: Dict[str, Any]) -> bool:
        """Check if a component has text overflow based on its content and dimensions"""
        comp_type = component.get('type', '')
        props = component.get('props', {})
        
        # Only check text-based components
        if comp_type not in ['TextBlock', 'TiptapTextBlock', 'Title', 'CustomComponent']:
            return False
            
        # Get dimensions
        width = int(props.get('width', 0))
        height = int(props.get('height', 0))
        
        # TiptapTextBlock often has padding=0, others default to 20
        default_padding = 0 if comp_type == 'TiptapTextBlock' else 20
        padding = int(props.get('padding', default_padding))
        
        # Get text content and font properties
        text = ""
        font_size = 48
        line_height_mult = 1.2
        
        if comp_type == 'CustomComponent':
            internal_props = props.get('props', {})
            # For CustomComponent, we need to estimate based on all text content
            texts = []
            for key, value in internal_props.items():
                if key == 'render':
                    continue
                if isinstance(value, str) and len(value) > 0:
                    texts.append(value)
                elif isinstance(value, list):
                    # Handle lists of text (facts, items, etc.)
                    for item in value:
                        if isinstance(item, str):
                            texts.append(item)
            text = ' '.join(texts)
            font_size = self._parse_font_size(internal_props.get('fontSize', props.get('fontSize', 48)))
            line_height_mult = float(internal_props.get('lineHeight', 1.2))
        else:
            # Regular text components
            if 'text' in props:
                text = props['text']
            elif 'texts' in props:
                texts = props['texts']
                if isinstance(texts, dict) and 'content' in texts:
                    # Handle Tiptap document structure
                    content = texts.get('content', [])
                    text_parts = []
                    for block in content:
                        if isinstance(block, dict) and block.get('type') == 'paragraph':
                            para_content = block.get('content', [])
                            for item in para_content:
                                if isinstance(item, dict) and 'text' in item:
                                    text_parts.append(item['text'])
                    text = ' '.join(text_parts)
                elif isinstance(texts, list) and texts:
                    text = texts[0].get('text', '') if isinstance(texts[0], dict) else str(texts[0])
            
            font_size = self._parse_font_size(props.get('fontSize', 48))
            line_height_mult = float(props.get('lineHeight', 1.2))
        
        if not text:
            return False
        
        # Calculate available space
        available_width = max(1, width - (2 * padding))
        available_height = max(1, height - (2 * padding))
        
        # More accurate character width estimation based on font
        # Monospace fonts: ~0.6, Regular fonts: ~0.5, Condensed: ~0.4
        font_family = props.get('fontFamily', 'Arial').lower()
        
        if 'mono' in font_family or 'courier' in font_family:
            char_width_ratio = 0.6
        elif 'condensed' in font_family:
            char_width_ratio = 0.4
        else:
            # Most fonts including Arial, Helvetica, Montserrat
            char_width_ratio = 0.5
            
        # Bold text is slightly wider
        if str(props.get('fontWeight', '400')) in ['700', '800', '900', 'bold']:
            char_width_ratio *= 1.1
            
        char_width = font_size * char_width_ratio
        
        # Calculate approximate lines needed
        chars_per_line = max(1, int(available_width / char_width))
        
        # Account for word wrapping (words don't break mid-word)
        # Average word length is ~5 characters + 1 space
        avg_word_length = 6
        words_per_line = max(1, chars_per_line // avg_word_length)
        effective_chars_per_line = words_per_line * avg_word_length
        
        # Calculate lines needed
        total_chars = len(text)
        lines_needed = max(1, (total_chars + effective_chars_per_line - 1) // effective_chars_per_line)
        
        # Calculate height needed
        line_height = font_size * line_height_mult
        height_needed = lines_needed * line_height
        
        # For single-line text, be more lenient
        if lines_needed == 1:
            # Single line should fit if height is at least 80% of line height
            return available_height < (line_height * 0.8)
        
        # For multi-line text, check if it fits with a small margin
        return height_needed > (available_height * 1.05)  # 5% margin
    
    def render_deck(self, deck_data: Dict[str, Any]) -> List[str]:
        """Render all slides in a deck"""
        rendered_files = []
        deck_uuid = deck_data.get('uuid', 'unknown')
        
        for i, slide in enumerate(deck_data.get('slides', [])):
            try:
                filepath = self.render_slide(slide, deck_uuid, i)
                rendered_files.append(filepath)
            except Exception as e:
                logger.error(f"Failed to render slide {i}: {e}")
        
        # Create summary image with all slides
        if rendered_files:
            self._create_deck_summary(rendered_files, deck_uuid)
        
        return rendered_files
    
    def _create_deck_summary(self, slide_images: List[str], deck_uuid: str):
        """Create a summary image with thumbnails of all slides"""
        # Load all images
        images = []
        for path in slide_images:
            try:
                img = Image.open(path)
                images.append(img)
            except Exception as e:
                logger.error(f"Failed to load image {path}: {e}")
        
        if not images:
            return
        
        # Create thumbnail grid
        thumb_size = (320, 180)  # 1920/6 x 1080/6
        cols = 4
        rows = (len(images) + cols - 1) // cols
        
        summary_width = cols * thumb_size[0] + (cols + 1) * 20
        summary_height = rows * thumb_size[1] + (rows + 1) * 20 + 60  # Extra space for title
        
        summary_img = Image.new('RGB', (summary_width, summary_height), color='#F5F5F5')
        draw = ImageDraw.Draw(summary_img)
        
        # Add title
        title_font = self.get_font('Arial', 24, 'bold')
        draw.text((20, 20), f"Deck Summary: {deck_uuid}", font=title_font, fill='#000000')
        
        # Add thumbnails
        x_offset = 20
        y_offset = 60
        
        for i, img in enumerate(images):
            # Create thumbnail
            thumb = img.copy()
            thumb.thumbnail(thumb_size, Image.Resampling.LANCZOS)
            
            # Paste thumbnail
            summary_img.paste(thumb, (x_offset, y_offset))
            
            # Add slide number
            label_font = self.get_font('Arial', 12)
            draw.text((x_offset + 5, y_offset + 5), f"Slide {i + 1}", 
                     font=label_font, fill='#FFFFFF', 
                     stroke_width=1, stroke_fill='#000000')
            
            # Move to next position
            x_offset += thumb_size[0] + 20
            if (i + 1) % cols == 0:
                x_offset = 20
                y_offset += thumb_size[1] + 20
        
        # Save summary
        summary_path = self.output_dir / f"deck_summary_{deck_uuid}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        summary_img.save(summary_path, 'PNG', quality=95)
        logger.info(f"Created deck summary: {summary_path}") 
    
    def _render_quiz_component(self, img: Image.Image, draw: ImageDraw.Draw, x: int, y: int, 
                              width: int, height: int, props: Dict[str, Any], 
                              content: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render a quiz component preview"""
        # Draw container
        draw.rounded_rectangle([x, y, x + width, y + height], radius=12, 
                              fill='#f9fafb', outline='#e5e7eb', width=2)
        
        # Extract quiz data
        question = props.get('question', content.get('main_text', 'Quiz Question'))
        options = []
        for i in range(1, 5):
            option = props.get(f'option{i}')
            if option:
                options.append(option)
        
        # Draw question
        font_size = 32
        font = self._get_font(font_size, weight='bold')
        
        # Center question at top
        question_y = y + 40
        self._draw_centered_text(draw, question, x + width // 2, question_y, font, '#1a1a1a')
        
        # Draw options in 2x2 grid
        if options:
            option_font = self._get_font(20)
            grid_y = y + 120
            cell_height = (height - 160) // 2
            cell_width = (width - 80) // 2
            
            for i, option in enumerate(options[:4]):
                row = i // 2
                col = i % 2
                opt_x = x + 40 + col * cell_width
                opt_y = grid_y + row * cell_height
                
                # Draw option box
                draw.rounded_rectangle([opt_x, opt_y, opt_x + cell_width - 20, opt_y + cell_height - 20],
                                     radius=8, fill='white', outline='#2563eb', width=2)
                
                # Draw option letter
                letter = chr(65 + i)  # A, B, C, D
                circle_x = opt_x + 20
                circle_y = opt_y + cell_height // 2
                draw.ellipse([circle_x - 15, circle_y - 15, circle_x + 15, circle_y + 15],
                           fill='#2563eb')
                self._draw_centered_text(draw, letter, circle_x, circle_y, option_font, 'white')
                
                # Draw option text
                text_x = opt_x + 50
                self._draw_text_wrapped(draw, option, text_x, opt_y + 10, 
                                      cell_width - 80, cell_height - 20, option_font, '#374151')
        
        return x, y, x + width, y + height
    
    def _render_poll_component(self, img: Image.Image, draw: ImageDraw.Draw, x: int, y: int,
                              width: int, height: int, props: Dict[str, Any],
                              content: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render a poll component preview"""
        # Draw container
        draw.rounded_rectangle([x, y, x + width, y + height], radius=12,
                              fill='white', outline='#e5e7eb', width=1)
        
        # Extract poll data
        question = props.get('pollQuestion', content.get('main_text', 'Poll Question'))
        options = []
        votes = []
        colors = ['#3b82f6', '#8b5cf6', '#ef4444', '#10b981']
        
        for i in range(1, 5):
            option = props.get(f'pollOption{i}')
            if option:
                options.append(option)
                # Get initial votes if provided
                if 'initialVotes' in props and isinstance(props['initialVotes'], list):
                    votes = props['initialVotes']
        
        # Default votes if not provided
        if not votes:
            votes = [45, 78, 123, 67][:len(options)]
        
        # Draw question
        font = self._get_font(28, weight='bold')
        self._draw_centered_text(draw, question, x + width // 2, y + 40, font, '#1a1a1a')
        
        # Draw poll bars
        if options:
            total_votes = sum(votes[:len(options)])
            bar_y = y + 100
            bar_height = 40
            spacing = 20
            
            for i, (option, vote_count) in enumerate(zip(options, votes)):
                if i >= len(colors):
                    break
                    
                percentage = int((vote_count / total_votes) * 100) if total_votes > 0 else 0
                bar_width = int((width - 80) * (percentage / 100))
                
                # Draw background bar
                draw.rounded_rectangle([x + 40, bar_y, x + width - 40, bar_y + bar_height],
                                     radius=6, fill='#f3f4f6')
                
                # Draw filled bar
                if bar_width > 0:
                    draw.rounded_rectangle([x + 40, bar_y, x + 40 + bar_width, bar_y + bar_height],
                                         radius=6, fill=colors[i])
                
                # Draw option text
                option_font = self._get_font(18)
                draw.text((x + 50, bar_y + 10), option, font=option_font, fill='#374151')
                
                # Draw percentage
                percent_text = f"{percentage}%"
                draw.text((x + width - 100, bar_y + 10), percent_text, 
                         font=option_font, fill=colors[i])
                
                bar_y += bar_height + spacing
        
        return x, y, x + width, y + height
    
    def _render_slider_component(self, img: Image.Image, draw: ImageDraw.Draw, x: int, y: int,
                                width: int, height: int, props: Dict[str, Any],
                                content: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render a slider/calculator component preview"""
        # Draw container
        draw.rounded_rectangle([x, y, x + width, y + height], radius=12,
                              fill='white', outline='#e5e7eb', width=1)
        
        # Extract slider data
        title = props.get('title', 'Calculator')
        label = props.get('label', 'Metric')
        unit = props.get('unit', '$')
        value = props.get('initialValue', 50)
        min_val = props.get('min', 0)
        max_val = props.get('max', 100)
        
        # Draw title
        title_font = self._get_font(32, weight='bold')
        self._draw_centered_text(draw, title, x + width // 2, y + 40, title_font, '#1a1a1a')
        
        # Draw label and value
        label_font = self._get_font(20)
        value_font = self._get_font(48, weight='bold')
        
        draw.text((x + 40, y + 100), label, font=label_font, fill='#4b5563')
        value_text = f"{unit}{value * 1000:,}"
        draw.text((x + width - 200, y + 90), value_text, font=value_font, fill='#3b82f6')
        
        # Draw slider track
        track_y = y + 180
        track_left = x + 40
        track_right = x + width - 40
        track_width = track_right - track_left
        
        # Background track
        draw.rounded_rectangle([track_left, track_y - 4, track_right, track_y + 4],
                              radius=4, fill='#e5e7eb')
        
        # Filled track
        fill_percentage = (value - min_val) / (max_val - min_val)
        fill_width = int(track_width * fill_percentage)
        draw.rounded_rectangle([track_left, track_y - 4, track_left + fill_width, track_y + 4],
                              radius=4, fill='#3b82f6')
        
        # Slider handle
        handle_x = track_left + fill_width
        draw.ellipse([handle_x - 12, track_y - 12, handle_x + 12, track_y + 12],
                    fill='#3b82f6', outline='white', width=3)
        
        # Draw result box
        result_y = y + 240
        draw.rounded_rectangle([x + 40, result_y, x + width - 40, y + height - 40],
                              radius=8, fill='#3b82f615')
        
        result_label = props.get('resultLabel', 'Result')
        result_value = int(value * 1000 * 15.5)  # Example calculation
        
        draw.text((x + 60, result_y + 20), result_label, font=label_font, fill='#6b7280')
        result_text = f"{unit}{result_value:,}"
        result_font = self._get_font(56, weight='bold')
        self._draw_centered_text(draw, result_text, x + width // 2, result_y + 60, 
                                result_font, '#3b82f6')
        
        return x, y, x + width, y + height
    
    def _render_timeline_component(self, img: Image.Image, draw: ImageDraw.Draw, x: int, y: int,
                                  width: int, height: int, props: Dict[str, Any],
                                  content: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render a timeline component preview"""
        # Draw container
        draw.rounded_rectangle([x, y, x + width, y + height], radius=12,
                              fill='white', outline='#e5e7eb', width=1)
        
        # Extract timeline data
        events = []
        for i in range(1, 5):
            date = props.get(f'date{i}')
            title = props.get(f'title{i}')
            if date and title:
                events.append({'date': date, 'title': title})
        
        if not events:
            events = [
                {'date': 'Q1 2024', 'title': 'Planning'},
                {'date': 'Q2 2024', 'title': 'Development'},
                {'date': 'Q3 2024', 'title': 'Testing'},
                {'date': 'Q4 2024', 'title': 'Launch'}
            ]
        
        # Draw timeline
        timeline_y = y + height // 2
        line_left = x + 100
        line_right = x + width - 100
        
        # Draw timeline line
        draw.line([line_left, timeline_y, line_right, timeline_y], fill='#e5e7eb', width=4)
        
        # Draw events
        if events:
            spacing = (line_right - line_left) / (len(events) - 1) if len(events) > 1 else 0
            
            for i, event in enumerate(events):
                event_x = line_left + (i * spacing) if spacing > 0 else line_left
                
                # Draw node
                node_color = '#3b82f6' if i == 0 else '#e5e7eb'  # Highlight first node
                draw.ellipse([event_x - 20, timeline_y - 20, event_x + 20, timeline_y + 20],
                           fill=node_color, outline='white', width=3)
                
                # Draw node number
                node_font = self._get_font(16, weight='bold')
                self._draw_centered_text(draw, str(i + 1), event_x, timeline_y, 
                                       node_font, 'white')
                
                # Draw date
                date_font = self._get_font(14)
                self._draw_centered_text(draw, event['date'], event_x, timeline_y - 40,
                                       date_font, '#6b7280')
                
                # Draw title
                title_font = self._get_font(16, weight='bold')
                self._draw_centered_text(draw, event['title'], event_x, timeline_y + 40,
                                       title_font, '#1a1a1a')
        
        return x, y, x + width, y + height
    
    def _render_kpi_component(self, img: Image.Image, draw: ImageDraw.Draw, x: int, y: int,
                             width: int, height: int, props: Dict[str, Any],
                             content: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render KPI cards component preview"""
        # Extract KPI data
        kpis = []
        for i in range(1, 5):
            label = props.get(f'kpi{i}Label')
            value = props.get(f'kpi{i}Value')
            if label and value:
                kpis.append({
                    'label': label,
                    'value': value,
                    'change': props.get(f'kpi{i}Change', '+0%'),
                    'icon': ['💰', '👥', '📈', '⭐'][i-1]
                })
        
        if not kpis:
            kpis = [
                {'label': 'Revenue', 'value': '$2.4M', 'change': '+32%', 'icon': '💰'},
                {'label': 'Users', 'value': '48.2K', 'change': '+18%', 'icon': '👥'}
            ]
        
        # Calculate card layout
        card_count = len(kpis)
        cards_per_row = min(4, card_count)
        card_width = (width - (cards_per_row + 1) * 20) // cards_per_row
        card_height = height - 40
        
        # Draw KPI cards (no emojis)
        for i, kpi in enumerate(kpis):
            card_x = x + 20 + (i % cards_per_row) * (card_width + 20)
            card_y = y + 20
            
            # Draw card
            draw.rounded_rectangle([card_x, card_y, card_x + card_width, card_y + card_height],
                                 radius=12, fill='white', outline='#e5e7eb', width=1)
            
            # Draw icon background and a simple geometric accent instead of emoji
            icon_bg_size = 48
            icon_x = card_x + 20
            icon_y = card_y + 20
            draw.rounded_rectangle([icon_x, icon_y, icon_x + icon_bg_size, icon_y + icon_bg_size],
                                 radius=8, fill='#3b82f615')
            # Geometric accent (small filled circle)
            circle_r = 10
            circle_cx = icon_x + icon_bg_size // 2
            circle_cy = icon_y + icon_bg_size // 2
            draw.ellipse([circle_cx - circle_r, circle_cy - circle_r, circle_cx + circle_r, circle_cy + circle_r],
                        fill='#3b82f6')
            
            # Draw change indicator
            change_color = '#10b981' if '+' in kpi['change'] else '#ef4444'
            change_font = self._get_font(14, weight='bold')
            change_x = card_x + card_width - 60
            draw.text((change_x, icon_y + 10), kpi['change'], font=change_font, fill=change_color)
            
            # Draw value
            value_font = self._get_font(28, weight='bold')
            value_y = card_y + 80
            draw.text((card_x + 20, value_y), kpi['value'], font=value_font, fill='#111827')
            
            # Draw label
            label_font = self._get_font(14)
            label_y = value_y + 35
            draw.text((card_x + 20, label_y), kpi['label'], font=label_font, fill='#6b7280')
        
        return x, y, x + width, y + height
    
    def _render_countdown_component(self, img: Image.Image, draw: ImageDraw.Draw, x: int, y: int,
                                   width: int, height: int, props: Dict[str, Any],
                                   content: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render a countdown timer component preview"""
        # Draw container
        draw.rounded_rectangle([x, y, x + width, y + height], radius=12,
                              fill='#fafafa', outline='#e5e7eb', width=1)
        
        # Extract countdown data
        title = props.get('title', 'Launch Countdown')
        subtitle = props.get('subtitle', 'Something amazing is coming')
        days = props.get('days', 15)
        hours = props.get('hours', 8)
        minutes = props.get('minutes', 42)
        seconds = props.get('seconds', 17)
        
        # Draw title and subtitle
        title_font = self._get_font(36, weight='bold')
        subtitle_font = self._get_font(20)
        
        self._draw_centered_text(draw, title, x + width // 2, y + 60, title_font, '#1a1a1a')
        self._draw_centered_text(draw, subtitle, x + width // 2, y + 100, subtitle_font, '#6b7280')
        
        # Draw timer units
        units = [
            {'label': 'Days', 'value': days},
            {'label': 'Hours', 'value': hours},
            {'label': 'Minutes', 'value': minutes},
            {'label': 'Seconds', 'value': seconds}
        ]
        
        unit_width = 120
        unit_height = 120
        total_width = len(units) * unit_width + (len(units) - 1) * 20
        start_x = x + (width - total_width) // 2
        unit_y = y + 160
        
        for i, unit in enumerate(units):
            unit_x = start_x + i * (unit_width + 20)
            
            # Draw unit box
            color = '#ef4444' if unit['label'] == 'Seconds' else '#dc2626'
            draw.rounded_rectangle([unit_x, unit_y, unit_x + unit_width, unit_y + unit_height],
                                 radius=12, fill=color)
            
            # Draw value
            value_font = self._get_font(48, weight='bold')
            value_text = str(unit['value']).zfill(2)
            self._draw_centered_text(draw, value_text, unit_x + unit_width // 2,
                                   unit_y + unit_height // 2 - 10, value_font, 'white')
            
            # Draw label
            label_font = self._get_font(14)
            self._draw_centered_text(draw, unit['label'], unit_x + unit_width // 2,
                                   unit_y + unit_height + 20, label_font, '#6b7280')
        
        return x, y, x + width, y + height
    
    def _render_progress_rings(self, img: Image.Image, draw: ImageDraw.Draw, x: int, y: int,
                              width: int, height: int, props: Dict[str, Any],
                              content: Dict[str, Any]) -> Optional[Tuple[int, int, int, int]]:
        """Render progress rings component preview"""
        # Extract metrics
        metrics = []
        for i in range(1, 5):
            label = props.get(f'label{i}')
            value = props.get(f'value{i}')
            if label and value:
                metrics.append({
                    'label': label,
                    'value': value,
                    'color': props.get(f'color{i}', '#3b82f6')
                })
        
        if not metrics:
            metrics = [
                {'label': 'Complete', 'value': 75, 'color': '#3b82f6'},
                {'label': 'Progress', 'value': 60, 'color': '#10b981'}
            ]
        
        # Calculate layout
        ring_size = min(160, (width - 40) // len(metrics) - 20)
        start_x = x + (width - (len(metrics) * (ring_size + 20) - 20)) // 2
        ring_y = y + (height - ring_size) // 2
        
        # Draw progress rings
        for i, metric in enumerate(metrics):
            ring_x = start_x + i * (ring_size + 20)
            center_x = ring_x + ring_size // 2
            center_y = ring_y + ring_size // 2
            radius = ring_size // 2 - 20
            
            # Draw background ring
            for angle in range(0, 360, 5):
                x1 = center_x + radius * math.cos(math.radians(angle))
                y1 = center_y + radius * math.sin(math.radians(angle))
                draw.ellipse([x1 - 3, y1 - 3, x1 + 3, y1 + 3], fill='#e5e7eb')
            
            # Draw progress ring
            progress_angle = int(360 * (metric['value'] / 100))
            for angle in range(-90, -90 + progress_angle, 5):
                x1 = center_x + radius * math.cos(math.radians(angle))
                y1 = center_y + radius * math.sin(math.radians(angle))
                draw.ellipse([x1 - 4, y1 - 4, x1 + 4, y1 + 4], fill=metric['color'])
            
            # Draw percentage
            percent_font = self._get_font(32, weight='bold')
            self._draw_centered_text(draw, f"{metric['value']}%", center_x, center_y,
                                   percent_font, metric['color'])
            
            # Draw label
            label_font = self._get_font(16)
            self._draw_centered_text(draw, metric['label'], center_x, ring_y + ring_size + 20,
                                   label_font, '#374151')
        
        return x, y, x + width, y + height
    
    def _draw_text_wrapped(self, draw: ImageDraw.Draw, text: str, x: int, y: int,
                          max_width: int, max_height: int, font, color: str):
        """Draw text with word wrapping"""
        words = text.split()
        lines = []
        current_line = []
        
        for word in words:
            test_line = ' '.join(current_line + [word])
            bbox = draw.textbbox((0, 0), test_line, font=font)
            line_width = bbox[2] - bbox[0]
            
            if line_width <= max_width:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]
        
        if current_line:
            lines.append(' '.join(current_line))
        
        # Draw lines
        line_height = font.size * 1.2
        current_y = y
        
        for line in lines:
            if current_y + line_height > y + max_height:
                break
            draw.text((x, current_y), line, font=font, fill=color)
            current_y += line_height
    
    def _draw_centered_text(self, draw: ImageDraw.Draw, text: str, x: int, y: int,
                           font, color: str):
        """Draw text centered at the given position"""
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        draw.text((x - text_width // 2, y - text_height // 2), text, font=font, fill=color)