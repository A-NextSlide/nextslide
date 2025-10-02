"""
Enhanced Structured Layout Engine for Slide Generation

This engine provides:
1. Deck-type aware layout templates
2. Anti-overlap positioning system  
3. Consistent repeated structures
4. Professional spacing and hierarchy
"""

import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import json

logger = logging.getLogger(__name__)

class DeckType(Enum):
    """Supported deck types with specific layout needs"""
    BUSINESS = "business"
    EDUCATIONAL = "educational"
    CREATIVE = "creative"
    TECHNICAL = "technical"
    COMPARISON = "comparison"
    NARRATIVE = "narrative"
    DATA_HEAVY = "data_heavy"

class LayoutPattern(Enum):
    """Layout patterns for consistent structure"""
    HERO_LEFT_TEXT_RIGHT = "hero_left_text_right"
    TEXT_LEFT_VISUAL_RIGHT = "text_left_visual_right"
    CENTERED_HERO = "centered_hero"
    THREE_COLUMN = "three_column"
    VERTICAL_STACK = "vertical_stack"
    DASHBOARD = "dashboard"
    COMPARISON_SPLIT = "comparison_split"

@dataclass
class LayoutGrid:
    """12-column grid system for consistent positioning"""
    width: int = 1920
    height: int = 1080
    columns: int = 12
    margin: int = 80
    gutter: int = 40
    
    @property
    def column_width(self) -> float:
        return (self.width - 2 * self.margin - (self.columns - 1) * self.gutter) / self.columns
    
    def get_column_position(self, start_col: int, span: int) -> Tuple[int, int]:
        """Get x position and width for columns (1-indexed)"""
        x = self.margin + (start_col - 1) * (self.column_width + self.gutter)
        width = span * self.column_width + (span - 1) * self.gutter
        return int(x), int(width)

@dataclass 
class ComponentSpacing:
    """Spacing rules to prevent overlaps"""
    title_height: int = 120
    subtitle_height: int = 60
    text_line_height: float = 1.4
    min_gap_text: int = 40
    min_gap_shapes: int = 60
    min_gap_charts: int = 80
    padding_text: int = 20
    padding_cards: int = 24

@dataclass
class LayoutTemplate:
    """Layout template definition"""
    name: str
    description: str
    deck_types: List[DeckType]
    zones: Dict[str, Dict[str, Any]]  # Zone definitions
    spacing_rules: Dict[str, Any]
    suggested_components: List[str]

class StructuredLayoutEngine:
    """Enhanced layout engine preventing overlaps and ensuring consistency"""
    
    def __init__(self):
        self.grid = LayoutGrid()
        self.spacing = ComponentSpacing()
        self.templates = self._initialize_templates()
        self.position_tracker = PositionTracker()
    
    def detect_deck_type(self, deck_outline: Any, slide_context: Dict[str, Any]) -> DeckType:
        """Intelligently detect deck type from content and context"""
        title = getattr(deck_outline, 'title', '').lower()
        prompt = getattr(deck_outline, 'prompt', '').lower()
        
        # Get slide content for analysis
        slide_titles = []
        slide_content = []
        if hasattr(deck_outline, 'slides'):
            for slide in deck_outline.slides:
                slide_titles.append(getattr(slide, 'title', '').lower())
                slide_content.append(getattr(slide, 'content', '').lower())
        
        all_text = f"{title} {prompt} {' '.join(slide_titles)} {' '.join(slide_content)}"
        
        # Business indicators
        if any(word in all_text for word in [
            'quarterly', 'revenue', 'profit', 'strategy', 'business', 'financial',
            'kpi', 'metrics', 'growth', 'market', 'investment', 'funding'
        ]):
            return DeckType.BUSINESS
            
        # Educational indicators
        if any(word in all_text for word in [
            'training', 'education', 'course', 'lesson', 'learning', 'tutorial',
            'workshop', 'curriculum', 'student', 'teacher', 'module'
        ]):
            return DeckType.EDUCATIONAL
            
        # Technical indicators
        if any(word in all_text for word in [
            'architecture', 'system', 'technical', 'api', 'database', 'code',
            'infrastructure', 'technology', 'engineering', 'development'
        ]):
            return DeckType.TECHNICAL
            
        # Data-heavy indicators
        if any(word in all_text for word in [
            'analytics', 'data', 'dashboard', 'report', 'statistics', 'metrics',
            'analysis', 'insights', 'visualization', 'charts'
        ]):
            return DeckType.DATA_HEAVY
            
        # Comparison indicators
        if any(word in all_text for word in [
            'vs', 'versus', 'comparison', 'compare', 'against', 'alternative',
            'option', 'choice', 'before', 'after'
        ]):
            return DeckType.COMPARISON
            
        # Creative indicators  
        if any(word in all_text for word in [
            'creative', 'design', 'brand', 'marketing', 'campaign', 'story',
            'narrative', 'vision', 'inspiration', 'concept'
        ]):
            return DeckType.CREATIVE
            
        # Check for narrative patterns in slide sequence
        if len(slide_titles) >= 3:
            narrative_patterns = ['introduction', 'problem', 'solution', 'journey', 'story']
            if any(pattern in ' '.join(slide_titles) for pattern in narrative_patterns):
                return DeckType.NARRATIVE
        
        return DeckType.BUSINESS  # Default fallback
    
    def get_layout_template(self, deck_type: DeckType, slide_index: int, 
                          slide_content: str, is_title_slide: bool = False) -> LayoutTemplate:
        """Get appropriate layout template for slide"""
        
        if is_title_slide:
            return self.templates['title_hero']
            
        # Pattern detection for content-aware layouts
        content_lower = slide_content.lower()
        # Team/about detection → prefer image gallery
        if any(word in content_lower for word in ['team', 'about us', 'who we are', 'speakers', 'speaker', 'bios', 'headshot']):
            return self.templates.get('team_gallery', self.templates['business_standard'])
        # Roadmap/timeline detection → prefer roadmap gallery
        if any(word in content_lower for word in ['roadmap', 'timeline', 'phases', 'milestones', 'journey', 'stages']):
            return self.templates.get('roadmap_gallery', self.templates['vertical_list'])
        
        # Comparison content
        if any(word in content_lower for word in ['vs', 'versus', 'compare', 'comparison']):
            return self.templates['comparison_split']
            
        # Data/chart content  
        if any(word in content_lower for word in ['chart', 'graph', 'data', 'metrics']):
            return self.templates['data_focus']
            
        # List/bullet content
        if any(word in content_lower for word in ['steps', 'process', 'how to', 'list']):
            return self.templates['vertical_list']
        
        # Default by deck type
        deck_defaults = {
            DeckType.BUSINESS: 'business_standard',
            DeckType.EDUCATIONAL: 'educational_friendly', 
            DeckType.CREATIVE: 'creative_asymmetric',
            DeckType.TECHNICAL: 'technical_structured',
            DeckType.DATA_HEAVY: 'data_focus',
            DeckType.COMPARISON: 'comparison_split',
            DeckType.NARRATIVE: 'narrative_flow'
        }
        
        template_name = deck_defaults.get(deck_type, 'business_standard')
        return self.templates[template_name]
    
    def generate_structured_layout(self, 
                                 template: LayoutTemplate,
                                 slide_outline: Any,
                                 theme: Dict[str, Any],
                                 predicted_components: List[str]) -> Dict[str, Any]:
        """Generate structured layout preventing overlaps"""
        
        self.position_tracker.reset()
        layout_data = {
            'template_name': template.name,
            'zones': {},
            'components': [],
            'spacing_applied': True
        }
        
        # Apply template zones with smart positioning
        for zone_name, zone_config in template.zones.items():
            zone_data = self._create_zone_layout(zone_name, zone_config, slide_outline, theme)
            layout_data['zones'][zone_name] = zone_data
            
            # Generate components for this zone
            zone_components = self._generate_zone_components(
                zone_name, zone_config, zone_data, slide_outline, theme, predicted_components
            )
            layout_data['components'].extend(zone_components)
        
        # Apply final overlap prevention
        layout_data['components'] = self._prevent_overlaps(layout_data['components'])
        
        return layout_data
    
    def _create_zone_layout(self, zone_name: str, zone_config: Dict[str, Any],
                          slide_outline: Any, theme: Dict[str, Any]) -> Dict[str, Any]:
        """Create layout for a specific zone"""
        
        # Get grid position
        start_col = zone_config.get('start_col', 1)
        span = zone_config.get('span', 12) 
        x, width = self.grid.get_column_position(start_col, span)
        
        # Calculate y position based on zone type and previous zones
        y = self._calculate_zone_y_position(zone_name, zone_config)
        height = zone_config.get('height', 300)
        
        zone_data = {
            'name': zone_name,
            'bounds': {'x': x, 'y': y, 'width': width, 'height': height},
            'style': zone_config.get('style', {}),
            'content_type': zone_config.get('content_type', 'mixed')
        }
        
        # Track this zone position
        self.position_tracker.add_zone(zone_name, x, y, width, height)
        
        return zone_data
    
    def _calculate_zone_y_position(self, zone_name: str, zone_config: Dict[str, Any]) -> int:
        """Calculate Y position for zone to prevent overlaps"""
        
        # Zone positioning hierarchy
        zone_order = {
            'title': 60,
            'subtitle': 180,
            'hero': 240,
            'main_content': 280,
            'secondary_content': 450,
            'footer': 950
        }
        
        base_y = zone_order.get(zone_name, 300)
        
        # Adjust based on previous zones
        occupied_zones = self.position_tracker.get_zones_above(base_y)
        if occupied_zones:
            max_bottom = max(zone['y'] + zone['height'] + self.spacing.min_gap_text 
                           for zone in occupied_zones)
            return max(base_y, max_bottom)
            
        return base_y
    
    def _generate_zone_components(self, zone_name: str, zone_config: Dict[str, Any],
                                zone_data: Dict[str, Any], slide_outline: Any,
                                theme: Dict[str, Any], predicted_components: List[str]) -> List[Dict[str, Any]]:
        """Generate components for a specific zone"""
        
        components = []
        bounds = zone_data['bounds']
        content_type = zone_data['content_type']
        
        if content_type == 'title' and zone_name == 'title':
            # Generate title component
            title_comp = self._create_title_component(bounds, slide_outline, theme)
            components.append(title_comp)
            
        elif content_type == 'text' and zone_name in ['main_content', 'secondary_content']:
            # Generate text components with proper spacing
            text_comps = self._create_text_components(bounds, slide_outline, theme)
            components.extend(text_comps)
            
        elif content_type == 'visual' and zone_name == 'hero':
            # Generate hero visual
            if 'Image' in predicted_components:
                hero_comp = self._create_hero_image_component(bounds, theme)
                components.append(hero_comp)
                
        elif content_type == 'mixed':
            # Generate mixed content based on predictions
            mixed_comps = self._create_mixed_zone_components(
                bounds, slide_outline, theme, predicted_components
            )
            components.extend(mixed_comps)
        elif content_type == 'gallery':
            # Generate an image gallery with captions based on slide intent
            title_text = getattr(slide_outline, 'title', '') or ''
            content_text = getattr(slide_outline, 'content', '') or ''
            combined = f"{title_text} {content_text}".lower()
            is_team = any(k in combined for k in ['team', 'about us', 'who we are', 'speakers', 'speaker', 'bios', 'headshot'])
            mode = 'team' if is_team else (
                'roadmap' if any(k in combined for k in ['roadmap', 'timeline', 'phases', 'milestones', 'journey', 'stages']) else 'generic'
            )
            gallery = self._create_image_gallery_components(bounds, slide_outline, theme, mode)
            components.extend(gallery)
            
            # If team: attach extracted brand names to zone for downstream logo tool
            if is_team:
                try:
                    brands: List[str] = []
                    # Parse brands from structured blocks in content
                    for raw_block in (content_text.split('\n\n') if content_text else []):
                        for line in raw_block.split('\n'):
                            if line.lower().startswith('brands:'):
                                vals = [v.strip() for v in line.split(':', 1)[1].split(',') if v.strip()]
                                brands.extend(vals)
                    # De-duplicate preserving order
                    seen = set()
                    deduped = []
                    for b in brands:
                        if b.lower() not in seen:
                            seen.add(b.lower())
                            deduped.append(b)
                    # Stash in a synthetic invisible meta component for tool discovery
                    meta_comp = {
                        "type": "Shape",
                        "props": {
                            "position": {"x": bounds['x'], "y": bounds['y']},
                            "width": 1,
                            "height": 1,
                            "opacity": 0.0,
                            "metadata": {"kind": "team_brands", "brands": deduped[:12]}
                        }
                    }
                    components.append(meta_comp)
                except Exception:
                    pass
        
        return components
    
    def _create_title_component(self, bounds: Dict[str, int], 
                              slide_outline: Any, theme: Dict[str, Any]) -> Dict[str, Any]:
        """Create properly sized title component"""
        
        title_text = getattr(slide_outline, 'title', 'Slide Title')
        
        # Smart title sizing based on length
        title_length = len(title_text)
        if title_length <= 20:
            font_size = 96
        elif title_length <= 40:
            font_size = 80
        else:
            font_size = 64
            
        return {
            "type": "TiptapTextBlock",
            "props": {
                "position": {"x": bounds['x'], "y": bounds['y']},
                "width": bounds['width'],
                "height": min(bounds['height'], 160),
                "texts": [{
                    "text": title_text,
                    "fontSize": font_size,
                    "fontWeight": "700",
                    "color": theme.get('color_palette', {}).get('text_colors', {}).get('primary', '#1A1A1A'),
                    "lineHeight": 1.1
                }],
                "alignment": "left",
                "verticalAlignment": "middle",
                "padding": 0
            }
        }
    
    def _create_text_components(self, bounds: Dict[str, int],
                              slide_outline: Any, theme: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create text components with anti-overlap positioning"""
        
        components = []
        content = getattr(slide_outline, 'content', '')
        
        # Split content into paragraphs
        paragraphs = [p.strip() for p in content.split('\n\n') if p.strip()]
        
        current_y = bounds['y']
        max_width = bounds['width']
        
        for i, paragraph in enumerate(paragraphs):
            if current_y >= bounds['y'] + bounds['height']:
                break  # Exceeded zone height
                
            # Calculate paragraph height with conservative buffer and tighter line spacing
            estimated_lines = max(1, len(paragraph) // 80)  # ~80 chars per line
            base_height = int(estimated_lines * 24 * 1.2) + self.spacing.padding_text
            paragraph_height = int(base_height * 1.15)  # add ~15% buffer so boxes are a bit taller
            
            text_component = {
                "type": "TiptapTextBlock", 
                "props": {
                    "position": {"x": bounds['x'], "y": current_y},
                    "width": max_width,
                    "height": paragraph_height,
                    "texts": [{
                        "text": paragraph,
                        "fontSize": 18,
                        "fontWeight": "400",
                        "color": theme.get('color_palette', {}).get('text_colors', {}).get('primary', '#4A5568'),
                        "lineHeight": 1.2
                    }],
                    "alignment": "left",
                    "verticalAlignment": "top",
                    "padding": self.spacing.padding_text
                }
            }
            
            components.append(text_component)
            current_y += paragraph_height + self.spacing.min_gap_text
            
        return components
    
    def _create_hero_image_component(self, bounds: Dict[str, int], 
                                   theme: Dict[str, Any]) -> Dict[str, Any]:
        """Create hero image with proper sizing"""
        
        return {
            "type": "Image",
            "props": {
                "src": "placeholder",  # Always use placeholder 
                "position": {"x": bounds['x'], "y": bounds['y']},
                "width": bounds['width'],
                "height": min(bounds['height'], 400),
                "objectFit": "cover",
                "borderRadius": "8px"
            }
        }
    
    def _create_mixed_zone_components(self, bounds: Dict[str, int], slide_outline: Any,
                                    theme: Dict[str, Any], predicted_components: List[str]) -> List[Dict[str, Any]]:
        """Create mixed content components"""
        
        components = []
        
        # Smart component selection based on content
        content = getattr(slide_outline, 'content', '').lower()
        
        # Add shapes for visual interest (non-overlapping)
        if 'Shape' in predicted_components:
            shape_comp = self._create_background_shape(bounds, theme)
            components.append(shape_comp)
            
        # Add icons for bullet points if detected
        if 'icon' in content or 'step' in content:
            icon_comps = self._create_icon_components(bounds, slide_outline, theme)
            components.extend(icon_comps)
            
        return components

    def _create_image_gallery_components(self, bounds: Dict[str, int], slide_outline: Any,
                                       theme: Dict[str, Any], mode: str = 'generic') -> List[Dict[str, Any]]:
        """Create a grid of images with captions. Mode can be 'team', 'roadmap', or 'generic'."""
        components: List[Dict[str, Any]] = []
        x0, y0, w, h = bounds['x'], bounds['y'], bounds['width'], bounds['height']
        gap = 40

        # Determine grid based on mode
        if mode == 'team':
            cols = 3
            rows = 1
            count = cols * rows
            square = True
            corner_radius = 999  # circle in frontend
        elif mode == 'roadmap':
            cols = 4
            rows = 1
            count = cols * rows
            square = False
            corner_radius = 24
        else:
            cols = 3
            rows = 2
            count = cols * rows
            square = False
            corner_radius = 16

        # Compute cell sizes
        total_gaps_w = gap * (cols - 1)
        cell_w = int((w - total_gaps_w) / cols)
        # Allocate about 80% height to images, 20% to captions for single-row; for two rows, per-row area
        row_h = int(h / rows)
        image_h = int(row_h * (0.75 if rows == 1 else 0.7))
        caption_h = max(48, row_h - image_h)

        # Extract candidate captions from slide content
        captions = self._extract_captions_from_content(slide_outline, count, mode)

        # Theme colors/typography
        palette = (theme or {}).get('color_palette', {})
        accent = palette.get('accent_1', '#3182CE')
        text_primary = palette.get('text_colors', {}).get('primary', '#1A1A1A')
        caption_font = (theme or {}).get('typography', {}).get('caption', {})
        caption_size = int(str(caption_font.get('size', 36)).replace('px', '') or 36) if isinstance(caption_font.get('size', 36), (int, str)) else 36
        caption_weight = caption_font.get('weight', '400')

        # Build grid
        idx = 0
        for r in range(rows):
            y_img_top = y0 + r * row_h
            for c in range(cols):
                if idx >= count:
                    break
                x_img = x0 + c * (cell_w + gap)
                # Make images square for team (circle mask rule)
                img_w = cell_w
                img_h = image_h
                if square:
                    side = min(cell_w, image_h)
                    img_w = side
                    img_h = side

                # Optional soft background shape behind image for theme accent
                bg_shape = {
                    "type": "Shape",
                    "props": {
                        "position": {"x": x_img, "y": y_img_top},
                        "width": img_w,
                        "height": img_h,
                        "shapeType": "rectangle",
                        "cornerRadius": corner_radius,
                        "fillColor": accent,
                        "opacity": 0.06,
                        "zIndex": 0
                    }
                }
                components.append(bg_shape)

                # Image component (headshot placeholder)
                image_comp = {
                    "type": "Image",
                    "props": {
                        "src": "placeholder",
                        "position": {"x": x_img, "y": y_img_top},
                        "width": img_w,
                        "height": img_h,
                        "objectFit": "cover",
                        "borderRadius": corner_radius,
                        "borderWidth": 2,
                        "borderColor": accent
                    }
                }
                components.append(image_comp)

                # Optional logos row placeholder under name: small horizontal strip for brand logos
                if mode == 'team':
                    logos_strip_h = max(24, int(caption_h * 0.35))
                    logos_strip_y = y_img_top + img_h + 12  # same top as caption
                    # Add 2-3 tiny Image placeholders; real logos will be injected via logo tool
                    logo_size = min(40, int(img_w / 6))
                    logo_gap = 8
                    # Center 3 slots; if space tight, render 2
                    max_slots = 3 if (3 * logo_size + 2 * logo_gap) <= img_w else 2
                    total_w = max_slots * logo_size + (max_slots - 1) * logo_gap
                    start_x = x_img + (img_w - total_w) // 2
                    for li in range(max_slots):
                        lx = start_x + li * (logo_size + logo_gap)
                        logo_comp = {
                            "type": "Image",
                            "props": {
                                "src": "placeholder",
                                "position": {"x": lx, "y": logos_strip_y},
                                "width": logo_size,
                                "height": logo_size,
                                "objectFit": "contain",
                                "metadata": {"kind": "person_logo"}
                            }
                        }
                        components.append(logo_comp)

                # Caption below
                caption_text = captions[idx] if idx < len(captions) else ("Name\nTitle\nDescription" if mode == 'team' else "Phase")
                caption_comp = {
                    "type": "TiptapTextBlock",
                    "props": {
                        "position": {"x": x_img, "y": y_img_top + img_h + 12 + (logo_size + 8 if mode == 'team' else 0)},
                        "width": img_w,
                        "height": caption_h - 12,
                        "texts": [{
                            "text": caption_text,
                            "fontSize": caption_size - 6 if mode == 'team' else caption_size,
                            "fontWeight": caption_weight,
                            "color": text_primary
                        }],
                        "alignment": "center",
                        "verticalAlignment": "middle",
                        "padding": 0
                    }
                }
                components.append(caption_comp)

                idx += 1

        return components

    def _extract_captions_from_content(self, slide_outline: Any, count: int, mode: str) -> List[str]:
        """Extract up to count short caption strings from slide content."""
        try:
            title = (getattr(slide_outline, 'title', '') or '').strip()
            content = (getattr(slide_outline, 'content', '') or '').strip()
            lines: List[str] = []
            for raw in (content.split('\n') if content else []):
                t = raw.strip()
                if not t:
                    continue
                # Skip overly long paragraphs
                if len(t) > 80:
                    continue
                # Remove bullets/numbers
                t = t.lstrip('-•0123456789. ').strip()
                if t:
                    lines.append(t)
            # For roadmap: prefer lines with phase/milestone keywords
            if mode == 'roadmap':
                key_lines = [l for l in lines if any(k in l.lower() for k in ['phase', 'milestone', 'q1', 'q2', 'q3', 'q4', 'month', 'week'])]
                lines = key_lines or lines
            # For team: build stacked captions from structured blocks if present
            if mode == 'team':
                # Detect structured blocks like:
                # Name: ...\nTitle: ...\nDescription: ...\nBrands: ...
                persons: List[str] = []
                buf: List[str] = []
                for raw in (content.split('\n') if content else []):
                    t = raw.strip()
                    if not t:
                        if buf:
                            persons.append('\n'.join(buf))
                            buf = []
                        continue
                    buf.append(t)
                if buf:
                    persons.append('\n'.join(buf))
                stacked: List[str] = []
                for block in persons:
                    name_line = ''
                    title_line = ''
                    desc_line = ''
                    for bl in block.split('\n'):
                        low = bl.lower()
                        if low.startswith('name:') and not name_line:
                            name_line = bl.split(':', 1)[1].strip()
                        elif low.startswith('title:') and not title_line:
                            title_line = bl.split(':', 1)[1].strip()
                        elif low.startswith('description:') and not desc_line:
                            desc_line = bl.split(':', 1)[1].strip()
                    if name_line or title_line or desc_line:
                        stacked.append('\n'.join([s for s in [name_line, title_line, desc_line] if s]))
                if stacked:
                    lines = stacked
                else:
                    # Fallback: prefer lines that look like name-role pairs
                    name_like = [l for l in lines if (',' in l or ' - ' in l or '—' in l)]
                    lines = name_like or lines
            # Fallback: split title if needed
            if not lines and title:
                lines = [title]
            return lines[:count]
        except Exception:
            return []
    
    def _create_background_shape(self, bounds: Dict[str, int], 
                               theme: Dict[str, Any]) -> Dict[str, Any]:
        """Create background shape that won't interfere with text"""
        
        # Position shape in background, offset from main content
        shape_x = bounds['x'] + bounds['width'] - 200
        shape_y = bounds['y'] + 100
        
        return {
            "type": "Shape",
            "props": {
                "position": {"x": shape_x, "y": shape_y},
                "width": 150,
                "height": 150,
                "shapeType": "circle",
                "fillColor": theme.get('color_palette', {}).get('accent_1', '#3182CE'),
                "opacity": 0.1,
                "zIndex": 0  # Behind other content
            }
        }
    
    def _create_icon_components(self, bounds: Dict[str, int], slide_outline: Any,
                              theme: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create icon components for lists"""
        
        components = []
        content = getattr(slide_outline, 'content', '')
        
        # Look for bullet points or numbered items
        lines = [line.strip() for line in content.split('\n') if line.strip()]
        
        current_y = bounds['y']
        
        for line in lines[:5]:  # Max 5 icons
            if any(starter in line.lower() for starter in ['•', '-', '1.', '2.', '3.', 'step']):
                
                icon_comp = {
                    "type": "Icon",
                    "props": {
                        "position": {"x": bounds['x'], "y": current_y},
                        # Provide width/height so downstream overlap logic treats icons with realistic bounds
                        "width": 24,
                        "height": 24,
                        "iconLibrary": "lucide",
                        "iconName": "CheckCircle",
                        "color": theme.get('color_palette', {}).get('accent_1', '#3182CE'),
                        "strokeWidth": 2,
                        "size": 24
                    }
                }
                
                components.append(icon_comp)
                current_y += 36  # Icon height + spacing
                
        return components
    
    def _prevent_overlaps(self, components: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Final pass to prevent any component overlaps"""
        
        if not components:
            return components
            
        # Sort by top edge for processing; convert center to top for consistent ordering
        def _top_edge(comp: Dict[str, Any]) -> int:
            p = comp.get('props', {})
            pos = p.get('position', {})
            cy = int(pos.get('y', 0) or 0)
            h = int(p.get('height', 0) or 0)
            return int(cy - (h / 2))
        sorted_components = sorted(components, key=_top_edge)
        
        adjusted_components = []
        
        for i, component in enumerate(sorted_components):
            props = component.get('props', {})
            position = props.get('position', {})
            
            cx, cy = position.get('x', 0), position.get('y', 0)
            width = props.get('width', 100)
            height = props.get('height', 50)
            
            # Check for overlaps with previous components
            overlap_detected = False
            
            for prev_comp in adjusted_components:
                prev_props = prev_comp.get('props', {})
                prev_pos = prev_props.get('position', {})
                prev_cx, prev_cy = prev_pos.get('x', 0), prev_pos.get('y', 0)
                prev_width = prev_props.get('width', 100)
                prev_height = prev_props.get('height', 50)
                
                # Check for overlap
                # Convert to top-left for overlap detection
                x_tl = int(cx - (width / 2))
                y_tl = int(cy - (height / 2))
                prev_x_tl = int(prev_cx - (prev_width / 2))
                prev_y_tl = int(prev_cy - (prev_height / 2))
                if self._components_overlap(x_tl, y_tl, width, height, prev_x_tl, prev_y_tl, prev_width, prev_height):
                    # Adjust by moving current component just below previous (using top-left), then convert back to center
                    new_y_top = prev_y_tl + prev_height + self.spacing.min_gap_text
                    new_center_y = int(new_y_top + (height / 2))
                    position['y'] = new_center_y
                    overlap_detected = True
                    break
            
            adjusted_components.append(component)
            
        return adjusted_components
    
    def _components_overlap(self, x1: int, y1: int, w1: int, h1: int,
                          x2: int, y2: int, w2: int, h2: int) -> bool:
        """Check if two rectangular components overlap"""
        
        return not (x1 >= x2 + w2 or x2 >= x1 + w1 or y1 >= y2 + h2 or y2 >= y1 + h1)
    
    def _initialize_templates(self) -> Dict[str, LayoutTemplate]:
        """Initialize layout templates for different deck types"""
        
        templates = {}
        
        # Business Standard Template
        templates['business_standard'] = LayoutTemplate(
            name="Business Standard",
            description="Professional layout with clear hierarchy",
            deck_types=[DeckType.BUSINESS],
            zones={
                'title': {
                    'start_col': 1, 'span': 8, 'height': 120,
                    'content_type': 'title', 'style': {'fontWeight': 'bold'}
                },
                'main_content': {
                    'start_col': 1, 'span': 7, 'height': 400,
                    'content_type': 'text', 'style': {}
                },
                'hero': {
                    'start_col': 8, 'span': 5, 'height': 350,
                    'content_type': 'visual', 'style': {}
                }
            },
            spacing_rules={'title_gap': 40, 'section_gap': 60},
            suggested_components=['TiptapTextBlock', 'Image', 'Shape']
        )
        
        # Educational Friendly Template  
        templates['educational_friendly'] = LayoutTemplate(
            name="Educational Friendly",
            description="Clear, step-by-step layout for learning",
            deck_types=[DeckType.EDUCATIONAL],
            zones={
                'title': {
                    'start_col': 1, 'span': 12, 'height': 120,
                    'content_type': 'title', 'style': {'textAlign': 'center'}
                },
                'main_content': {
                    'start_col': 1, 'span': 12, 'height': 600,
                    'content_type': 'mixed', 'style': {}
                }
            },
            spacing_rules={'title_gap': 50, 'section_gap': 40},
            suggested_components=['TiptapTextBlock', 'Icon', 'Shape', 'Image']
        )
        
        # Creative Asymmetric Template
        templates['creative_asymmetric'] = LayoutTemplate(
            name="Creative Asymmetric",
            description="Dynamic, off-center layout for creative content",
            deck_types=[DeckType.CREATIVE],
            zones={
                'title': {
                    'start_col': 2, 'span': 6, 'height': 160,
                    'content_type': 'title', 'style': {'fontWeight': '900'}
                },
                'hero': {
                    'start_col': 7, 'span': 5, 'height': 500,
                    'content_type': 'visual', 'style': {}
                },
                'main_content': {
                    'start_col': 1, 'span': 5, 'height': 400,
                    'content_type': 'text', 'style': {}
                }
            },
            spacing_rules={'title_gap': 30, 'section_gap': 80},
            suggested_components=['TiptapTextBlock', 'Image', 'Shape', 'CustomComponent']
        )
        
        # Comparison Split Template
        templates['comparison_split'] = LayoutTemplate(
            name="Comparison Split",
            description="Side-by-side comparison layout",
            deck_types=[DeckType.COMPARISON],
            zones={
                'title': {
                    'start_col': 1, 'span': 12, 'height': 120,
                    'content_type': 'title', 'style': {'textAlign': 'center'}
                },
                'left_content': {
                    'start_col': 1, 'span': 5, 'height': 600,
                    'content_type': 'mixed', 'style': {}
                },
                'right_content': {
                    'start_col': 7, 'span': 5, 'height': 600,
                    'content_type': 'mixed', 'style': {}
                }
            },
            spacing_rules={'title_gap': 60, 'section_gap': 0},
            suggested_components=['TiptapTextBlock', 'Shape', 'Chart', 'Table']
        )
        
        # Data Focus Template
        templates['data_focus'] = LayoutTemplate(
            name="Data Focus",
            description="Chart and data-focused layout",
            deck_types=[DeckType.DATA_HEAVY],
            zones={
                'title': {
                    'start_col': 1, 'span': 12, 'height': 120,
                    'content_type': 'title', 'style': {}
                },
                'chart': {
                    'start_col': 1, 'span': 8, 'height': 500,
                    'content_type': 'visual', 'style': {}
                },
                'insights': {
                    'start_col': 9, 'span': 4, 'height': 400,
                    'content_type': 'text', 'style': {}
                }
            },
            spacing_rules={'title_gap': 40, 'section_gap': 80},
            suggested_components=['Chart', 'TiptapTextBlock', 'Table', 'CustomComponent']
        )
        
        # Title Hero Template
        templates['title_hero'] = LayoutTemplate(
            name="Title Hero", 
            description="Full-screen title slide with hero image",
            deck_types=[DeckType.BUSINESS, DeckType.CREATIVE, DeckType.NARRATIVE],
            zones={
                'hero_bg': {
                    'start_col': 1, 'span': 12, 'height': 1080,
                    'content_type': 'visual', 'style': {}
                },
                'title': {
                    'start_col': 2, 'span': 10, 'height': 260,
                    'content_type': 'title', 'style': {'fontSize': '72px', 'color': '#FFFFFF'}
                }
            },
            spacing_rules={'title_gap': 0, 'section_gap': 0},
            suggested_components=['Image', 'TiptapTextBlock', 'Shape']
        )
        
        # Vertical List Template
        templates['vertical_list'] = LayoutTemplate(
            name="Vertical List",
            description="Step-by-step vertical layout",
            deck_types=[DeckType.EDUCATIONAL, DeckType.TECHNICAL],
            zones={
                'title': {
                    'start_col': 1, 'span': 12, 'height': 120,
                    'content_type': 'title', 'style': {}
                },
                'main_content': {
                    'start_col': 1, 'span': 12, 'height': 700,
                    'content_type': 'mixed', 'style': {}
                }
            },
            spacing_rules={'title_gap': 50, 'section_gap': 30},
            suggested_components=['TiptapTextBlock', 'Icon', 'Shape', 'Lines']
        )
        
        # Team Gallery Template (images with captions)
        templates['team_gallery'] = LayoutTemplate(
            name="Team Gallery",
            description="Grid of circular headshots with captions",
            deck_types=[DeckType.BUSINESS, DeckType.CREATIVE],
            zones={
                'title': {
                    'start_col': 1, 'span': 12, 'height': 120,
                    'content_type': 'title', 'style': {}
                },
                'gallery': {
                    'start_col': 1, 'span': 12, 'height': 720,
                    'content_type': 'gallery', 'style': {}
                }
            },
            spacing_rules={'title_gap': 40, 'section_gap': 40},
            suggested_components=['Image', 'TiptapTextBlock', 'Shape']
        )

        # Roadmap Gallery Template (phases with thumbnails + captions)
        templates['roadmap_gallery'] = LayoutTemplate(
            name="Roadmap Gallery",
            description="Horizontal thumbnails per phase with captions",
            deck_types=[DeckType.BUSINESS, DeckType.TECHNICAL, DeckType.EDUCATIONAL],
            zones={
                'title': {
                    'start_col': 1, 'span': 12, 'height': 120,
                    'content_type': 'title', 'style': {}
                },
                'gallery': {
                    'start_col': 1, 'span': 12, 'height': 760,
                    'content_type': 'gallery', 'style': {}
                }
            },
            spacing_rules={'title_gap': 40, 'section_gap': 40},
            suggested_components=['Image', 'TiptapTextBlock', 'Shape', 'Lines']
        )
        
        return templates


class PositionTracker:
    """Tracks component positions to prevent overlaps"""
    
    def __init__(self):
        self.zones = []
        self.components = []
    
    def reset(self):
        """Reset tracking for new slide"""
        self.zones = []
        self.components = []
    
    def add_zone(self, name: str, x: int, y: int, width: int, height: int):
        """Add zone to tracking"""
        self.zones.append({
            'name': name, 'x': x, 'y': y, 'width': width, 'height': height
        })
    
    def add_component(self, comp_type: str, x: int, y: int, width: int, height: int):
        """Add component to tracking"""  
        self.components.append({
            'type': comp_type, 'x': x, 'y': y, 'width': width, 'height': height
        })
    
    def get_zones_above(self, y_position: int) -> List[Dict[str, Any]]:
        """Get zones above given Y position"""
        return [zone for zone in self.zones if zone['y'] < y_position]
    
    def check_collision(self, x: int, y: int, width: int, height: int) -> bool:
        """Check if position would collide with existing components"""
        for comp in self.components:
            if not (x >= comp['x'] + comp['width'] or 
                   comp['x'] >= x + width or
                   y >= comp['y'] + comp['height'] or
                   comp['y'] >= y + height):
                return True
        return False