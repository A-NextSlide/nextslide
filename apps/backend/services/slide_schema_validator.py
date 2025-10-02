"""
Slide Schema Validator - Ensures consistent PPTX to slide schema conversion.

Enforces strict compliance with our component standards from components.json:
- TiptapTextBlock: proper padding (0), fontSize requirements, texts array structure
- Image: src must be "placeholder", proper sizing
- Background: gradient object structure (not legacy format)  
- CustomComponent: proper render string format
- Chart: positioning rules and theme detection
- Canvas bounds: all components within 1920×1080
"""

from typing import Dict, Any, List, Optional, Tuple
import json
import logging

class SlideSchemaValidator:
    """Validates and fixes slide schemas for consistent PPTX conversion."""
    
    def __init__(self):
        self.canvas_width = 1920
        self.canvas_height = 1080
        self.min_font_size = 6
        self.default_font_size = 24
        self.fixes_applied = 0
        self.warnings = 0
        self.errors = []
        
    def validate_and_fix_presentation(self, presentation: Dict[str, Any]) -> Dict[str, Any]:
        """Main validation entry point - fixes entire presentation."""
        if not presentation or 'slides' not in presentation:
            self.errors.append("Invalid presentation format - missing slides")
            return presentation
            
        self.fixes_applied = 0
        self.warnings = 0
        self.errors = []
        
        for i, slide in enumerate(presentation['slides']):
            if 'components' in slide:
                slide['components'] = self._validate_and_fix_slide_components(slide['components'], i)
        
        return presentation
    
    def _validate_and_fix_slide_components(self, components: List[Dict[str, Any]], slide_index: int) -> List[Dict[str, Any]]:
        """Validates and fixes all components in a slide."""
        fixed_components = []
        
        for component in components:
            if not component or 'type' not in component or 'props' not in component:
                self.warnings += 1
                continue
                
            component_type = component['type']
            props = component['props']
            
            # Apply type-specific fixes
            if component_type == 'TiptapTextBlock':
                props = self._fix_text_block_properties(props, slide_index)
            elif component_type == 'Image':
                props = self._fix_image_properties(props, slide_index)
            elif component_type == 'Background':
                props = self._fix_background_properties(props, slide_index)
            elif component_type == 'CustomComponent':
                props = self._fix_custom_component_properties(props, slide_index)
            elif component_type == 'Chart':
                props = self._fix_chart_properties(props, slide_index)
            
            # Apply universal fixes
            props = self._fix_positioning(props, slide_index)
            
            component['props'] = props
            fixed_components.append(component)
        
        # Fix overlapping components
        fixed_components = self._fix_overlapping_components(fixed_components, slide_index)
        
        return fixed_components
    
    def _fix_text_block_properties(self, props: Dict[str, Any], slide_index: int) -> Dict[str, Any]:
        """Fix TiptapTextBlock schema violations."""
        
        # CRITICAL: padding must always be 0 (numeric)
        if 'padding' not in props or props['padding'] != 0:
            props['padding'] = 0
            self.fixes_applied += 1
            
        # Remove backgroundColor unless absolutely necessary
        if 'backgroundColor' in props and props['backgroundColor']:
            del props['backgroundColor']
            self.fixes_applied += 1
            
        # Ensure texts array exists and has proper structure
        if 'texts' not in props or not isinstance(props['texts'], list):
            props['texts'] = [{"text": "Text", "fontSize": self.default_font_size}]
            self.fixes_applied += 1
        else:
            # Fix fontSize in texts array
            for text_obj in props['texts']:
                if isinstance(text_obj, dict):
                    if 'fontSize' not in text_obj or not isinstance(text_obj['fontSize'], (int, float)):
                        text_obj['fontSize'] = self.default_font_size
                        self.fixes_applied += 1
                    elif text_obj['fontSize'] < self.min_font_size:
                        text_obj['fontSize'] = self.min_font_size
                        self.fixes_applied += 1
        
        # Calculate proper height based on fontSize
        if 'texts' in props and props['texts']:
            max_font_size = max((text.get('fontSize', self.default_font_size) for text in props['texts'] if isinstance(text, dict)), default=self.default_font_size)
            expected_height = int(max_font_size * 1.2)
            if 'height' not in props or props['height'] < expected_height:
                props['height'] = expected_height
                self.fixes_applied += 1
        
        # Ensure borderRadius is string format
        if 'borderRadius' in props and not isinstance(props['borderRadius'], str):
            props['borderRadius'] = "0px"
            self.fixes_applied += 1
            
        return props
    
    def _fix_image_properties(self, props: Dict[str, Any], slide_index: int) -> Dict[str, Any]:
        """Fix Image schema violations."""
        
        # CRITICAL: src must be "placeholder" UNLESS it's a logo with actual URL
        is_logo = (props.get('metadata', {}).get('kind') == 'logo' or 
                   'logo' in props.get('alt', '').lower())
        current_src = props.get('src', '')
        
        if not is_logo and (not current_src or current_src != 'placeholder'):
            props['src'] = 'placeholder'
            self.fixes_applied += 1
        elif is_logo and not current_src:
            # Logo should have a URL, but fallback to placeholder if empty
            props['src'] = 'placeholder'
            self.fixes_applied += 1
            
        # Ensure minimum sizes for non-logo images only
        # Logos are intentionally small and often non-rectangular; do not upsize them here
        if not is_logo:
            if 'width' in props and props['width'] < 200:
                props['width'] = 200
                self.fixes_applied += 1
                
            if 'height' in props and props['height'] < 200:
                props['height'] = 200
                self.fixes_applied += 1
            
        # Default to cover object-fit
        if 'objectFit' not in props:
            props['objectFit'] = 'cover'
            self.fixes_applied += 1
            
        return props
    
    def _fix_background_properties(self, props: Dict[str, Any], slide_index: int) -> Dict[str, Any]:
        """Fix Background schema violations."""
        
        # Ensure canvas size
        props['width'] = self.canvas_width
        props['height'] = self.canvas_height
        props['position'] = {'x': 0, 'y': 0}
        
        # Fix legacy gradient format
        if props.get('backgroundType') == 'gradient':
            # Check for legacy format
            if any(key in props for key in ['gradientStartColor', 'gradientEndColor', 'gradientDirection']):
                # Convert to proper format
                start_color = props.pop('gradientStartColor', '#011830')
                end_color = props.pop('gradientEndColor', '#003151')
                angle = props.pop('gradientDirection', 135)
                
                props['gradient'] = {
                    'type': 'linear',
                    'angle': angle,
                    'stops': [
                        {'color': start_color, 'position': 0},
                        {'color': end_color, 'position': 100}
                    ]
                }
                self.fixes_applied += 1
            
            # Ensure proper gradient structure exists
            if 'gradient' not in props:
                props['gradient'] = {
                    'type': 'linear',
                    'angle': 135,
                    'stops': [
                        {'color': '#011830', 'position': 0},
                        {'color': '#003151', 'position': 100}
                    ]
                }
                self.fixes_applied += 1
        
        return props
    
    def _fix_custom_component_properties(self, props: Dict[str, Any], slide_index: int) -> Dict[str, Any]:
        """Fix CustomComponent schema violations."""
        
        # Ensure render is a string
        if 'render' in props and not isinstance(props['render'], str):
            props['render'] = str(props['render'])
            self.fixes_applied += 1
            
        # Ensure props object exists
        if 'props' not in props:
            props['props'] = {}
            self.fixes_applied += 1
            
        return props
    
    def _fix_chart_properties(self, props: Dict[str, Any], slide_index: int) -> Dict[str, Any]:
        """Fix Chart schema violations."""
        
        # Ensure proper positioning (left or right half) — top-left columns
        if 'position' in props and 'x' in props['position']:
            x = props['position']['x']
            # Default chart widths if missing
            if 'width' not in props or not isinstance(props['width'], (int, float)) or props['width'] <= 0:
                props['width'] = 880
            width = props['width']
            # Left column: x at left margin 80
            if x < 960:
                props['position']['x'] = 80
                if width > 880:
                    props['width'] = 880
                    self.fixes_applied += 1
            else:
                # Right column: x at 960
                props['position']['x'] = 960
                if width > 880:
                    props['width'] = 880
                    self.fixes_applied += 1
        
        # Ensure optimal height range
        if 'height' not in props or props['height'] < 600:
            props['height'] = 700
            self.fixes_applied += 1
        elif props['height'] > 800:
            props['height'] = 800
            self.fixes_applied += 1
            
        # Ensure required chartType
        if 'chartType' not in props:
            props['chartType'] = 'column'
            self.fixes_applied += 1
            
        # Ensure data array exists
        if 'data' not in props or not isinstance(props['data'], list):
            props['data'] = []
            self.fixes_applied += 1
            
        return props
    
    def _fix_positioning(self, props: Dict[str, Any], slide_index: int) -> Dict[str, Any]:
        """Fix positioning to ensure components stay within canvas bounds."""
        
        if 'position' not in props:
            props['position'] = {'x': 0, 'y': 0}
            self.fixes_applied += 1
            return props
            
        position = props['position']
        width = props.get('width', 100)
        height = props.get('height', 100)
        
        # Top-left clamp to canvas
        x = position.get('x', 0)
        y = position.get('y', 0)
        if 'x' not in position or x < 0:
            position['x'] = 0
            self.fixes_applied += 1
        elif x + width > self.canvas_width:
            position['x'] = max(0, self.canvas_width - width)
            self.fixes_applied += 1
        if 'y' not in position or y < 0:
            position['y'] = 0
            self.fixes_applied += 1
        elif y + height > self.canvas_height:
            position['y'] = max(0, self.canvas_height - height)
            self.fixes_applied += 1
            
        return props
    
    def _fix_overlapping_components(self, components: List[Dict[str, Any]], slide_index: int) -> List[Dict[str, Any]]:
        """Fix overlapping components by adjusting positions."""
        
        # Sort components by type priority (Background first, then others)
        def component_priority(component):
            type_priorities = {'Background': 0, 'Image': 1, 'Chart': 2, 'TiptapTextBlock': 3, 'CustomComponent': 4}
            return type_priorities.get(component.get('type', ''), 5)
        
        components.sort(key=component_priority)
        
        # Track occupied areas (simplified overlap detection) using center->bounds
        for i in range(len(components)):
            for j in range(i + 1, len(components)):
                comp_a = components[i]
                comp_b = components[j]
                
                if self._components_overlap(comp_a, comp_b):
                    # Move component B to avoid overlap
                    self._adjust_component_position(comp_b, components[:j])
                    self.fixes_applied += 1
        
        return components
    
    def _components_overlap(self, comp_a: Dict[str, Any], comp_b: Dict[str, Any]) -> bool:
        """Check if two components overlap."""
        try:
            a_props = comp_a.get('props', {})
            b_props = comp_b.get('props', {})
            ap = a_props.get('position', {})
            bp = b_props.get('position', {})
            acx, acy = ap.get('x', 0), ap.get('y', 0)
            bcx, bcy = bp.get('x', 0), bp.get('y', 0)
            aw, ah = a_props.get('width', 0), a_props.get('height', 0)
            bw, bh = b_props.get('width', 0), b_props.get('height', 0)
            a_left, a_top = acx - aw / 2, acy - ah / 2
            b_left, b_top = bcx - bw / 2, bcy - bh / 2
            # AABB overlap in top-left space
            return not (
                a_left + aw <= b_left or b_left + bw <= a_left or
                a_top + ah <= b_top or b_top + bh <= a_top
            )
        except Exception:
            return False
    
    def _adjust_component_position(self, component: Dict[str, Any], existing_components: List[Dict[str, Any]]):
        """Adjust component position to avoid overlaps."""
        props = component.get('props', {})
        if 'position' not in props:
            return
            
        # Simple adjustment - move down by 50px (top-left)
        y = props['position'].get('y', 0)
        height = props.get('height', 100)
        max_y = self.canvas_height - height
        props['position']['y'] = int(min(y + 50, max_y))
    
    def get_validation_report(self) -> Dict[str, Any]:
        """Get detailed validation report."""
        return {
            'critical_fixes': self.fixes_applied,
            'warnings': self.warnings,
            'errors': self.errors,
            'success_rate': 100.0 if not self.errors else 0.0
        }