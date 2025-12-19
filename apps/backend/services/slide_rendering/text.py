from typing import Dict, Any, List, Optional, Tuple
from PIL import Image, ImageDraw, ImageFont
import textwrap


class TextRenderMixin:

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
