"""
Smart Line Styler - Provides contextual divider line styling based on formality,
slide type, and theme colors to replace the current generic grey line system.
"""

from typing import Dict, Any, Optional, List
import random
import logging
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class SmartLineStyler:
    """Generates contextual divider line styles based on presentation context."""
    
    # Slide types that should NEVER have divider lines
    EXCLUDED_SLIDE_TYPES = {
        'stat', 'quote', 'keystats', 'keymetrics', 'kpi', 'hero', 'showcase', 
        'cover', 'thankyou', 'design', 'image_showcase', 'gallery'
    }
    
    # Slide types that benefit from subtle dividers only
    SUBTLE_SLIDE_TYPES = {
        'timeline', 'process', 'comparison', 'list'
    }
    
    def should_have_divider(self, slide_type: str, formality_level: str) -> bool:
        """
        Determine if a slide should have a divider line.
        
        Args:
            slide_type: Type of slide (e.g., 'content', 'stat', 'quote')
            formality_level: Presentation formality ('formal', 'business', 'creative', 'casual')
            
        Returns:
            True if slide should have a divider line
        """
        # Never add dividers to excluded slide types
        if slide_type in self.EXCLUDED_SLIDE_TYPES:
            return False
            
        # Creative presentations have more freedom - sometimes no dividers
        if formality_level == 'creative':
            return random.choice([True, False, False])  # 33% chance
            
        # All other formality levels get dividers for appropriate slide types
        return True
    
    def get_line_style(
        self, 
        formality_level: str, 
        slide_type: str, 
        theme_colors: Dict[str, Any],
        variety_seed: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Generate contextual line styling based on presentation context.
        
        Args:
            formality_level: 'formal', 'business', 'creative', 'casual'
            slide_type: Type of slide
            theme_colors: Available theme colors
            variety_seed: Seed for consistent variety
            
        Returns:
            Line style configuration or None if no line should be added
        """
        # Check if slide should have a divider
        if not self.should_have_divider(slide_type, formality_level):
            return None
            
        # Set random seed for consistent variety per deck
        if variety_seed:
            random.seed(hash(variety_seed))
        
        # Get base style for formality level
        base_style = self._get_formality_style(formality_level)
        
        # Apply slide type modifications
        style = self._apply_slide_type_modifications(base_style, slide_type)
        
        # Add color selection logic
        style['color_priority'] = self._get_color_priority(formality_level, theme_colors)
        
        # Add theme colors for resolution
        style['theme_colors'] = {
            'primary': theme_colors.get('primary_background'),
            'accent_1': theme_colors.get('accent_1'), 
            'accent_2': theme_colors.get('accent_2'),
            'backgrounds': theme_colors.get('backgrounds', []),
            'accents': theme_colors.get('accents', [])
        }
        
        logger.debug(f"Generated line style for {formality_level}/{slide_type}: {style}")
        return style
    
    def _get_formality_style(self, formality_level: str) -> Dict[str, Any]:
        """Get base styling for formality level."""
        
        if formality_level == 'formal':
            return {
                'stroke_width': 3,
                'opacity': 0.6,
                'span_fraction': 1.0,  # Full width for formal presentations
                'align': 'stretch'
            }
        elif formality_level == 'business':
            return {
                'stroke_width': 2,
                'opacity': 0.4,
                'span_fraction': 0.8,  # Most of the width
                'align': 'center'
            }
        elif formality_level == 'creative':
            # Creative gets varied styles
            creative_styles = [
                {'stroke_width': 1, 'opacity': 0.2, 'span_fraction': 0.4, 'align': 'left'},
                {'stroke_width': 4, 'opacity': 0.3, 'span_fraction': 0.6, 'align': 'center'},
                {'stroke_width': 2, 'opacity': 0.25, 'span_fraction': 0.3, 'align': 'right'}
            ]
            return random.choice(creative_styles)
        else:  # casual
            return {
                'stroke_width': 1,
                'opacity': 0.25,
                'span_fraction': 0.5,  # Half width for casual
                'align': 'center'
            }
    
    def _apply_slide_type_modifications(
        self, 
        base_style: Dict[str, Any], 
        slide_type: str
    ) -> Dict[str, Any]:
        """Apply slide type specific modifications to base style."""
        
        style = base_style.copy()
        
        # Subtle slides get reduced opacity and width
        if slide_type in self.SUBTLE_SLIDE_TYPES:
            style['opacity'] *= 0.7
            style['span_fraction'] *= 0.8
            
        # Content slides can have full styling
        elif slide_type == 'content':
            pass  # Use base style as-is
            
        # Title slides get more prominent dividers
        elif slide_type == 'title':
            style['stroke_width'] = max(style['stroke_width'], 2)
            style['opacity'] = min(style['opacity'] * 1.2, 0.8)
            
        return style
    
    def _get_color_priority(
        self, 
        formality_level: str, 
        theme_colors: Dict[str, Any]
    ) -> List[str]:
        """
        Determine color selection priority based on formality and available colors.
        
        Returns:
            List of color keys in priority order
        """
        
        if formality_level == 'formal':
            # Formal presentations use primary brand colors
            return ['primary', 'accent_1', 'accent_2']
        elif formality_level == 'business':
            # Business uses accent colors primarily
            return ['accent_1', 'accent_2', 'primary']
        elif formality_level == 'creative':
            # Creative can use more varied colors
            return ['accent_2', 'accent_1', 'primary']
        else:  # casual
            # Casual uses subtle accent colors
            return ['accent_2', 'accent_1']
    
    def resolve_line_color(
        self, 
        style_config: Dict[str, Any],
        fallback_color: str = '#2563EB'
    ) -> str:
        """
        Resolve the actual color to use for the line based on style configuration.
        
        Args:
            style_config: Line style configuration with theme_colors and color_priority
            fallback_color: Color to use if no theme colors available
            
        Returns:
            Hex color string for the line
        """
        theme_colors = style_config.get('theme_colors', {})
        color_priority = style_config.get('color_priority', ['accent_1'])
        
        # Try colors in priority order
        for color_key in color_priority:
            color_value = theme_colors.get(color_key)
            if color_value and isinstance(color_value, str) and color_value.startswith('#'):
                return color_value
                
        # Try accent colors list
        accents = theme_colors.get('accents', [])
        if accents and len(accents) > 0:
            return accents[0]
            
        # Try background colors as last resort
        backgrounds = theme_colors.get('backgrounds', [])
        if backgrounds and len(backgrounds) > 0:
            # Use a darker variant of background for line
            bg_color = backgrounds[0]
            return self._darken_color(bg_color, 0.3)
            
        # Final fallback - use blue instead of grey
        return fallback_color
    
    def _darken_color(self, hex_color: str, factor: float) -> str:
        """Darken a color by the given factor."""
        try:
            hex_color = hex_color.lstrip('#')
            if len(hex_color) != 6:
                return hex_color
                
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            
            r = int(r * (1 - factor))
            g = int(g * (1 - factor))
            b = int(b * (1 - factor))
            
            return f"#{r:02X}{g:02X}{b:02X}"
        except Exception:
            return hex_color