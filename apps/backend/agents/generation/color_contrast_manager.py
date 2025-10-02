"""
Color Contrast Manager for ensuring readable text on backgrounds.
Provides WCAG-compliant color selection for slides.
"""

from typing import Dict, List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

class ColorContrastManager:
    """Manages color contrast for readable text on various backgrounds."""
    
    def __init__(self):
        # Standard text colors for fallback
        self.standard_colors = {
            'white': '#FFFFFF',
            'black': '#000000',
            'dark_gray': '#1A202C',
            'light_gray': '#F7FAFC',
            'off_white': '#FAFAFA',
            'charcoal': '#2D3748'
        }
    
    @staticmethod
    def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
        """Convert hex color to RGB."""
        hex_color = hex_color.lstrip('#')
        try:
            return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        except:
            return (128, 128, 128)  # Default to gray on error
    
    @staticmethod
    def get_luminance(rgb: Tuple[int, int, int]) -> float:
        """Calculate relative luminance of a color according to WCAG."""
        r, g, b = [x/255.0 for x in rgb]
        
        # Apply gamma correction
        r = r/12.92 if r <= 0.03928 else ((r + 0.055)/1.055) ** 2.4
        g = g/12.92 if g <= 0.03928 else ((g + 0.055)/1.055) ** 2.4
        b = b/12.92 if b <= 0.03928 else ((b + 0.055)/1.055) ** 2.4
        
        # Calculate luminance
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    
    def get_contrast_ratio(self, color1: str, color2: str) -> float:
        """Calculate WCAG contrast ratio between two colors."""
        rgb1 = self.hex_to_rgb(color1)
        rgb2 = self.hex_to_rgb(color2)
        
        lum1 = self.get_luminance(rgb1)
        lum2 = self.get_luminance(rgb2)
        
        # Ensure lum1 is the lighter color
        if lum1 < lum2:
            lum1, lum2 = lum2, lum1
        
        return (lum1 + 0.05) / (lum2 + 0.05)
    
    def is_dark_color(self, hex_color: str) -> bool:
        """Check if a color is dark based on luminance."""
        rgb = self.hex_to_rgb(hex_color)
        luminance = self.get_luminance(rgb)
        return luminance < 0.179  # WCAG threshold for dark colors
    
    def get_readable_text_color(
        self, 
        bg_color: str, 
        palette: Optional[List[str]] = None,
        min_contrast: float = 4.5  # WCAG AA standard
    ) -> Dict[str, any]:
        """
        Get the best text color for a given background.
        
        Args:
            bg_color: Background color in hex format
            palette: Optional list of palette colors to consider
            min_contrast: Minimum contrast ratio (4.5 for AA, 7.0 for AAA)
            
        Returns:
            Dict with recommended color and analysis
        """
        result = {
            'background': bg_color,
            'is_dark_bg': self.is_dark_color(bg_color),
            'recommended': None,
            'contrast_ratio': 0,
            'passes_wcag_aa': False,
            'passes_wcag_aaa': False,
            'alternatives': []
        }
        
        # Test standard colors first
        candidates = []
        
        # For dark backgrounds, prefer white/light colors
        if result['is_dark_bg']:
            test_order = ['white', 'light_gray', 'off_white', 'charcoal', 'dark_gray', 'black']
        else:
            # For light backgrounds, prefer dark colors
            test_order = ['black', 'dark_gray', 'charcoal', 'light_gray', 'off_white', 'white']
        
        for color_name in test_order:
            color = self.standard_colors[color_name]
            contrast = self.get_contrast_ratio(bg_color, color)
            candidates.append({
                'color': color,
                'name': color_name,
                'contrast': contrast,
                'passes_aa': contrast >= 4.5,
                'passes_aaa': contrast >= 7.0
            })
        
        # Also test palette colors if provided
        if palette:
            for color in palette:
                if color != bg_color:  # Don't test against itself
                    contrast = self.get_contrast_ratio(bg_color, color)
                    if contrast >= min_contrast:
                        candidates.append({
                            'color': color,
                            'name': 'palette',
                            'contrast': contrast,
                            'passes_aa': contrast >= 4.5,
                            'passes_aaa': contrast >= 7.0
                        })
        
        # Sort by contrast ratio
        candidates.sort(key=lambda x: x['contrast'], reverse=True)
        
        # Select the best candidate that meets minimum contrast
        for candidate in candidates:
            if candidate['contrast'] >= min_contrast:
                result['recommended'] = candidate['color']
                result['contrast_ratio'] = candidate['contrast']
                result['passes_wcag_aa'] = candidate['passes_aa']
                result['passes_wcag_aaa'] = candidate['passes_aaa']
                break
        
        # If no color meets the minimum, use the best available
        if not result['recommended'] and candidates:
            best = candidates[0]
            result['recommended'] = best['color']
            result['contrast_ratio'] = best['contrast']
            result['passes_wcag_aa'] = best['passes_aa']
            result['passes_wcag_aaa'] = best['passes_aaa']
            logger.warning(f"No color meets min contrast {min_contrast} for bg {bg_color}. Using {best['color']} with ratio {best['contrast']:.2f}")
        
        # Add top 3 alternatives
        result['alternatives'] = candidates[:3]
        
        return result
    

    
    def get_theme_colors_with_contrast(
        self, 
        palette: List[str],
        ensure_contrast: bool = True
    ) -> Dict[str, str]:
        """
        Generate theme colors ensuring proper contrast.
        
        Args:
            palette: List of palette colors
            ensure_contrast: Not used anymore - kept for backwards compatibility
            
        Returns:
            Theme color dictionary with proper text colors
        """
        # Trust the AI-generated palette as-is
        
        # Determine primary background (usually first or lightest color)
        bg_candidates = sorted(palette, 
                             key=lambda c: self.get_luminance(self.hex_to_rgb(c)), 
                             reverse=True)
        
        primary_bg = bg_candidates[0] if bg_candidates else '#FFFFFF'
        
        # Get readable text color for primary background
        text_result = self.get_readable_text_color(primary_bg, palette)
        primary_text = text_result['recommended']
        
        # Select accent colors (prefer middle brightness)
        accents = [c for c in palette if c not in [primary_bg, primary_text]]
        
        return {
            'primary_background': primary_bg,
            'secondary_background': bg_candidates[1] if len(bg_candidates) > 1 else '#F8F9FA',
            'primary_text': primary_text,
            'secondary_text': self.get_readable_text_color(
                bg_candidates[1] if len(bg_candidates) > 1 else '#F8F9FA', 
                palette
            )['recommended'],
            'accent_1': accents[0] if len(accents) > 0 else '#0066CC',
            'accent_2': accents[1] if len(accents) > 1 else '#FF6B6B',
            'accent_3': accents[2] if len(accents) > 2 else '#00AA55',
            'has_good_contrast': text_result['passes_wcag_aa']
        }