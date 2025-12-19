import os
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from PIL import Image, ImageDraw

from .fonts import FontMixin
from .colors import ColorMixin
from .text import TextRenderMixin
from .shapes import ShapeRenderMixin
from .media import MediaRenderMixin
from .components import CustomComponentRenderMixin
from .analysis import RenderAnalysisMixin

logger = logging.getLogger(__name__)


class SlideRenderer(
    FontMixin,
    ColorMixin,
    TextRenderMixin,
    ShapeRenderMixin,
    MediaRenderMixin,
    CustomComponentRenderMixin,
    RenderAnalysisMixin,
):

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
            
        # Render citations footer (if present in metadata but not in components)
        self._render_citations_footer(img, draw, slide_data)

        
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

    def _render_citations_footer(self, img: Image.Image, draw: ImageDraw.Draw, slide_data: Dict[str, Any]):
        """Render citations footer if present in slide data"""
        footer = slide_data.get('citationsFooter')
        if not footer or not isinstance(footer, dict):
            return
            
        sources = footer.get('sources', [])
        if not sources:
            return
            
        # Footer configuration
        footer_y = self.canvas_height - 60
        footer_height = 60
        margin_right = 80
        
        # Draw divider line
        draw.line([80, footer_y, self.canvas_width - 80, footer_y], fill='#E5E7EB', width=1)
        
        # Render sources
        font = self.get_font('Arial', 14)
        text = "Sources: " + " • ".join([s.get('title', 'Source') for s in sources])
        
        # Calculate text width to align right
        bbox = font.getbbox(text)
        text_width = bbox[2] - bbox[0]
        text_x = self.canvas_width - margin_right - text_width
        text_y = footer_y + (footer_height - (bbox[3] - bbox[1])) // 2
        
        draw.text((text_x, text_y), text, font=font, fill='#9CA3AF')

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
