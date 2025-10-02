#!/usr/bin/env python3
"""
Brand Identity Color Filter - Filters extracted colors to prioritize brand identity colors
over design system/UI colors.
"""

import re
from typing import List, Dict, Any, Tuple
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class BrandIdentityColorFilter:
    """Filters colors to prioritize brand identity colors over system/UI colors."""
    
    def __init__(self):
        # NO HARDCODED COLORS - Use dynamic extraction only
        self.known_brand_colors = {}
        
        # Colors that are typically NOT brand colors (system/UI colors)
        self.non_brand_color_patterns = {
            # Common grays and neutrals
            'light_grays': ['#F0F0F0', '#F1F1F1', '#F2F2F2', '#F3F3F3', '#F4F4F4', '#F5F5F5', '#F6F6F6', '#F7F7F7', '#F8F8F8', '#F9F9F9', '#FAFAFA', '#FBFBFB', '#FCFCFC', '#FDFDFD', '#FEFEFE'],
            'mid_grays': ['#E0E0E0', '#E1E1E1', '#E2E2E2', '#E3E3E3', '#E4E4E4', '#E5E5E5', '#DDDDDD', '#CCCCCC', '#C0C0C0', '#C7C8CD', '#D5D5D5', '#D8D8D8'],
            'dark_grays': ['#333333', '#404040', '#505050', '#606060', '#707070', '#808080', '#909090', '#A0A0A0', '#B0B0B0', '#616A75', '#5C5F62'],
            'blacks_whites': ['#000000', '#FFFFFF', '#FFFFFFFF', '#00000000'],
            # Common blue shades used in UI
            'ui_blues': ['#007DC1', '#0073B2', '#004B75', '#3897F0', '#1264A3'],
            # Common neutral tones
            'neutral_tones': ['#32373C', '#242529', '#343538', '#212121', '#313131', '#0F0F0F', '#121212']
        }
        
        # Flatten the patterns for easier checking
        self.system_colors = set()
        for category, colors in self.non_brand_color_patterns.items():
            self.system_colors.update(colors)
    
    def filter_brand_colors(self, colors: List[str], brand_name: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Filter colors to prioritize brand identity colors.
        
        Args:
            colors: List of extracted colors
            brand_name: Name of the brand
            context: Additional context (sources, confidence scores, etc.)
            
        Returns:
            Filtered color results with brand identity colors prioritized
        """
        
        if not colors:
            return {'brand_colors': [], 'system_colors': [], 'confidence': 0}
        
        brand_colors = []
        system_colors = []
        
        print(f"   🔍 Filtering {len(colors)} colors for brand identity...")
        
        for color in colors:
            color_upper = color.upper()
            
            # CRITICAL: If from brand guidelines, NEVER filter - always include
            is_from_guidelines = context and any('guidelines' in str(source) or 'brand' in str(source) or 'smart_pattern' in str(source) for source in context.get('sources', []))
            
            if is_from_guidelines:
                brand_colors.append(color)
                print(f"      🎨 Brand guidelines: {color} (NEVER filtered)")
                continue
            
            # Check if it's a known system/UI color
            if color_upper in self.system_colors:
                system_colors.append(color)
                print(f"      🗃️  System color: {color}")
                continue
            
            # Check if it matches known brand colors for this brand
            brand_key = brand_name.lower()
            if brand_key in self.known_brand_colors:
                if self._color_matches_known_brand(color, self.known_brand_colors[brand_key]):
                    brand_colors.append(color)
                    print(f"      ✅ Brand match: {color}")
                    continue
            
            # Analyze color characteristics for brand potential (only for website colors)
            brand_potential = self._analyze_brand_color_potential(color, brand_name)
            
            if brand_potential >= 0.6:  # Standard threshold for website-only colors
                brand_colors.append(color)
                print(f"      🎨 Brand potential ({brand_potential:.1f}): {color}")
            else:
                system_colors.append(color)
                print(f"      🔧 System potential ({brand_potential:.1f}): {color}")
        
        # Calculate confidence based on brand color ratio
        total_colors = len(colors)
        brand_color_ratio = len(brand_colors) / total_colors if total_colors > 0 else 0
        confidence = min(95, brand_color_ratio * 100 + 20)
        
        print(f"      📊 Brand colors: {len(brand_colors)}, System: {len(system_colors)}")
        print(f"      📈 Brand confidence: {confidence:.1f}%")
        
        return {
            'brand_colors': brand_colors[:6],  # Top 6 brand colors
            'system_colors': system_colors,
            'total_filtered': len(colors),
            'brand_color_ratio': brand_color_ratio,
            'confidence': confidence
        }
    
    def _color_matches_known_brand(self, color: str, known_colors: List[str], threshold: int = 30) -> bool:
        """Check if a color matches any known brand colors within threshold."""
        for known_color in known_colors:
            if self._colors_similar(color, known_color, threshold):
                return True
        return False
    
    def _colors_similar(self, color1: str, color2: str, threshold: int = 30) -> bool:
        """Check if two colors are similar within a threshold."""
        try:
            c1 = color1.lstrip('#')
            c2 = color2.lstrip('#')
            
            if len(c1) != 6 or len(c2) != 6:
                return False
            
            r1, g1, b1 = int(c1[0:2], 16), int(c1[2:4], 16), int(c1[4:6], 16)
            r2, g2, b2 = int(c2[0:2], 16), int(c2[2:4], 16), int(c2[4:6], 16)
            
            distance = ((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2) ** 0.5
            return distance <= threshold
        except:
            return color1.upper() == color2.upper()
    
    def _analyze_brand_color_potential(self, color: str, brand_name: str) -> float:
        """
        Analyze how likely a color is to be a brand identity color vs system color.
        
        Returns:
            Score from 0.0 to 1.0 (higher = more likely to be brand color)
        """
        
        try:
            color_hex = color.lstrip('#')
            if len(color_hex) != 6:
                return 0.0
            
            r, g, b = int(color_hex[0:2], 16), int(color_hex[2:4], 16), int(color_hex[4:6], 16)
            
            score = 0.0
            
            # 1. Saturation analysis (brand colors tend to be more saturated)
            saturation = self._calculate_saturation(r, g, b)
            if saturation > 0.7:
                score += 0.3  # High saturation = likely brand color
            elif saturation > 0.4:
                score += 0.15  # Medium saturation
            else:
                score -= 0.1  # Low saturation = likely system color
            
            # 2. Brightness analysis (avoid pure blacks/whites which are often UI)
            brightness = self._calculate_brightness(r, g, b)
            if 0.1 < brightness < 0.9:  # Sweet spot for brand colors
                score += 0.2
            elif brightness < 0.02 or brightness > 0.99:  # Only pure black/white (000000/FFFFFF)
                score -= 0.3
            
            # 3. Avoid common UI color ranges
            if self._is_common_ui_color_range(r, g, b):
                score -= 0.4
            
            # 4. Boost for vibrant/distinctive colors
            if self._is_vibrant_color(r, g, b):
                score += 0.3
            
            # 5. Context boost for certain color families by brand
            brand_lower = brand_name.lower()
            if 'green' in brand_lower or 'eco' in brand_lower:
                if g > r and g > b:  # Green-ish
                    score += 0.2
            elif 'blue' in brand_lower or 'tech' in brand_lower:
                if b > r and b > g:  # Blue-ish  
                    score += 0.2
            
            # 6. Boost for off-white/cream colors (common in brand palettes)
            if (r > 240 and g > 230 and b > 220 and 
                abs(r - g) < 30 and abs(r - b) < 30 and abs(g - b) < 30):
                score += 0.4  # Strong boost for cream/off-white colors
            
            return max(0.0, min(1.0, score))
            
        except Exception as e:
            logger.debug(f"Error analyzing color {color}: {e}")
            return 0.5  # Default neutral score
    
    def _calculate_saturation(self, r: int, g: int, b: int) -> float:
        """Calculate color saturation (0.0 to 1.0)."""
        r, g, b = r / 255.0, g / 255.0, b / 255.0
        max_val = max(r, g, b)
        min_val = min(r, g, b)
        
        if max_val == 0:
            return 0.0
        
        return (max_val - min_val) / max_val
    
    def _calculate_brightness(self, r: int, g: int, b: int) -> float:
        """Calculate relative brightness (0.0 to 1.0)."""
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
    
    def _is_common_ui_color_range(self, r: int, g: int, b: int) -> bool:
        """Check if color falls in common UI color ranges."""
        
        # Gray range (all components within 15 of each other AND in mid-range)
        # Avoid false positives for dark greens or off-whites
        if (abs(r - g) < 15 and abs(g - b) < 15 and abs(r - b) < 15 and 
            50 < r < 200 and 50 < g < 200 and 50 < b < 200):
            return True
        
        # Pure grays only (exact matches or very close)
        pure_grays = [(0,0,0), (255,255,255), (128,128,128), (64,64,64), (192,192,192)]
        for gr, gg, gb in pure_grays:
            if abs(r - gr) < 5 and abs(g - gg) < 5 and abs(b - gb) < 5:
                return True
        
        return False
    
    def _is_vibrant_color(self, r: int, g: int, b: int) -> bool:
        """Check if color is vibrant/distinctive."""
        saturation = self._calculate_saturation(r, g, b)
        brightness = self._calculate_brightness(r, g, b)
        
        # Vibrant colors have good saturation and reasonable brightness
        return saturation > 0.6 and 0.2 < brightness < 0.8