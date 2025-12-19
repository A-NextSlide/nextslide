from typing import Dict, Any, List, Tuple
from PIL import ImageDraw
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class RenderAnalysisMixin:

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
