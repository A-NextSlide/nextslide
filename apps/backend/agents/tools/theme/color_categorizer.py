#!/usr/bin/env python3
"""
Color Categorizer - Categorizes brand colors into primary, secondary, accent, background, text, etc.
"""

from typing import List, Dict, Any
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class ColorCategorizer:
    """Categorizes colors into semantic roles based on usage context and color properties."""
    
    def __init__(self):
        pass
    
    def categorize_colors(
        self, 
        colors: List[str], 
        brand_name: str,
        color_contexts: Dict[str, List[str]] = None
    ) -> Dict[str, Any]:
        """
        Categorize colors into primary, secondary, accent, background, text.
        
        Args:
            colors: List of hex colors
            brand_name: Brand name for context
            color_contexts: Dict with context info (headers, buttons, backgrounds, etc.)
            
        Returns:
            Categorized colors with roles
        """
        
        if not colors:
            return self._empty_categorization()
        
        print(f"   🏷️  Categorizing {len(colors)} colors for {brand_name}")
        
        # Initialize categorization
        categorized = {
            'primary': None,
            'secondary': None,
            'accent': [],
            'background': [],
            'text': [],
            'neutral': [],
            'all_colors': colors.copy()
        }
        
        # Analyze each color
        color_analysis = []
        for color in colors:
            analysis = self._analyze_color(color, brand_name, color_contexts or {})
            color_analysis.append(analysis)
        
        # Sort by importance score
        color_analysis.sort(key=lambda x: x['importance_score'], reverse=True)
        
        # Assign roles based on ACTUAL website usage context
        used_colors = set()
        
        # 1. Background color - use actual site background
        background_candidates = self._find_context_colors(color_contexts, 'backgrounds', color_analysis)
        if background_candidates:
            # Use the most common/prominent background color
            categorized['background'] = [background_candidates[0]['color']]
            used_colors.add(background_candidates[0]['color'])
            print(f"      🖼️  Background: {categorized['background'][0]} (from actual site background)")
        else:
            # Fallback to light colors if no background context
            light_candidates = [c for c in color_analysis if c['brightness'] > 200 and c['color'] not in used_colors][:1]
            if light_candidates:
                categorized['background'] = [light_candidates[0]['color']]
                used_colors.add(light_candidates[0]['color'])
        
        # 2. Primary text color - use actual site text colors
        text_candidates = self._find_context_colors(color_contexts, 'text', color_analysis)
        if not text_candidates:
            # Look for colors used in titles/headers as primary text
            text_candidates = self._find_context_colors(color_contexts, 'titles', color_analysis)
        
        if text_candidates:
            categorized['text'] = [text_candidates[0]['color']]
            used_colors.add(text_candidates[0]['color'])
            print(f"      📝 Primary Text: {categorized['text'][0]} (from actual site text)")
        else:
            # Fallback to dark colors for text
            dark_candidates = [c for c in color_analysis if c['brightness'] < 80 and c['color'] not in used_colors][:1]
            if dark_candidates:
                categorized['text'] = [dark_candidates[0]['color']]
                used_colors.add(dark_candidates[0]['color'])
        
        # 3. Primary color - prominent brand color used in buttons/headers
        primary_candidates = self._find_context_colors(color_contexts, 'buttons', color_analysis)
        if not primary_candidates:
            primary_candidates = self._find_context_colors(color_contexts, 'headers', color_analysis)
        
        if primary_candidates:
            # Find the most vibrant/saturated color from button/header context
            for candidate in primary_candidates:
                if candidate['color'] not in used_colors and candidate['saturation'] > 0.3:
                    categorized['primary'] = candidate['color']
                    used_colors.add(candidate['color'])
                    print(f"      🎯 Primary: {categorized['primary']} (from actual site buttons/headers)")
                    break
        
        if not categorized['primary']:
            # Fallback to most important brand color
            brand_candidates = [c for c in color_analysis if c['is_brand_color'] and c['color'] not in used_colors]
            if brand_candidates:
                categorized['primary'] = brand_candidates[0]['color']
                used_colors.add(brand_candidates[0]['color'])
        
        # 4. Secondary color - subtle variation or complementary brand color
        if categorized['primary']:
            # Look for colors similar to primary but slightly different
            secondary_candidates = [c for c in color_analysis 
                                  if c['color'] not in used_colors 
                                  and c['is_brand_color']
                                  and self._color_similarity(categorized['primary'], c['color']) < 0.3]
            
            if secondary_candidates:
                categorized['secondary'] = secondary_candidates[0]['color']
                used_colors.add(secondary_candidates[0]['color'])
                print(f"      🎨 Secondary: {categorized['secondary']} (complementary brand color)")
        
        # 5. Accent colors - vibrant colors for highlights (not primary/secondary)
        accent_candidates = [c for c in color_analysis 
                           if c['is_vibrant'] and c['color'] not in used_colors][:2]
        categorized['accent'] = [c['color'] for c in accent_candidates]
        used_colors.update(categorized['accent'])
        if categorized['accent']:
            print(f"      ✨ Accent: {', '.join(categorized['accent'])}")
        
        # 6. Neutral colors (grays, etc.)
        neutral_candidates = [c for c in color_analysis 
                            if c['is_neutral'] and c['color'] not in used_colors][:2]
        categorized['neutral'] = [c['color'] for c in neutral_candidates]
        if categorized['neutral']:
            print(f"      ⚪ Neutral: {', '.join(categorized['neutral'])}")
        
        return categorized
    
    def _analyze_color(self, color: str, brand_name: str, contexts: Dict[str, List[str]]) -> Dict[str, Any]:
        """Analyze a single color for categorization."""
        
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            
            # Calculate color properties
            brightness = (r * 299 + g * 587 + b * 114) / 1000
            saturation = (max(r, g, b) - min(r, g, b)) / max(r, g, b) if max(r, g, b) > 0 else 0
            is_grayscale = abs(r - g) < 15 and abs(g - b) < 15 and abs(r - b) < 15
            
            analysis = {
                'color': color,
                'r': r, 'g': g, 'b': b,
                'brightness': brightness,
                'saturation': saturation,
                'is_grayscale': is_grayscale,
                'importance_score': 0.0,
                'is_brand_color': False,
                'is_vibrant': False,
                'is_background': False,
                'is_text_color': False,
                'is_neutral': False,
                'context_score': 0.0
            }
            
            # Base importance score
            analysis['importance_score'] = 50.0
            
            # Context-based scoring
            analysis['context_score'] = self._calculate_context_score(color, contexts)
            analysis['importance_score'] += analysis['context_score']
            
            # Brand color detection
            analysis['is_brand_color'] = self._is_brand_color(color, brand_name, r, g, b, saturation)
            if analysis['is_brand_color']:
                analysis['importance_score'] += 30.0
            
            # Color type detection
            analysis['is_vibrant'] = saturation > 0.6 and brightness > 50 and brightness < 220
            analysis['is_background'] = brightness > 200 or (is_grayscale and brightness > 180)
            analysis['is_text_color'] = brightness < 80 or (is_grayscale and brightness < 100)
            analysis['is_neutral'] = is_grayscale or saturation < 0.2
            
            # Type-based scoring
            if analysis['is_vibrant']:
                analysis['importance_score'] += 15.0
            if analysis['is_background']:
                analysis['importance_score'] += 5.0
            if analysis['is_text_color']:
                analysis['importance_score'] += 8.0
            
            return analysis
            
        except Exception as e:
            logger.debug(f"Color analysis failed for {color}: {e}")
            return {
                'color': color,
                'importance_score': 0.0,
                'is_brand_color': False,
                'is_vibrant': False,
                'is_background': False,
                'is_text_color': False,
                'is_neutral': False,
                'context_score': 0.0
            }
    
    def _calculate_context_score(self, color: str, contexts: Dict[str, List[str]]) -> float:
        """Calculate score based on where color was found."""
        score = 0.0
        
        # Headers/navigation (high importance)
        if 'headers' in contexts and color in contexts['headers']:
            score += 25.0
        
        # Buttons (high importance for brand)
        if 'buttons' in contexts and color in contexts['buttons']:
            score += 20.0
        
        # Titles (medium-high importance)
        if 'titles' in contexts and color in contexts['titles']:
            score += 15.0
        
        # Backgrounds (medium importance)
        if 'backgrounds' in contexts and color in contexts['backgrounds']:
            score += 10.0
        
        return score
    
    def _find_context_colors(self, color_contexts: Dict[str, List[str]], context_key: str, color_analysis: List[Dict]) -> List[Dict]:
        """Find colors that appear in a specific context (backgrounds, buttons, etc.)."""
        if not color_contexts or context_key not in color_contexts:
            return []
        
        context_colors = color_contexts[context_key]
        # Return color analyses for colors found in this context, sorted by importance
        matching_analyses = [
            analysis for analysis in color_analysis 
            if analysis['color'] in context_colors
        ]
        return sorted(matching_analyses, key=lambda x: x['importance_score'], reverse=True)
    
    def _color_similarity(self, color1: str, color2: str) -> float:
        """Calculate similarity between two colors (0 = identical, 1 = completely different)."""
        try:
            # Convert hex to RGB
            def hex_to_rgb(hex_color):
                hex_color = hex_color.replace('#', '')
                return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
            
            r1, g1, b1 = hex_to_rgb(color1)
            r2, g2, b2 = hex_to_rgb(color2)
            
            # Calculate Euclidean distance in RGB space
            distance = ((r2-r1)**2 + (g2-g1)**2 + (b2-b1)**2)**0.5
            # Normalize to 0-1 scale (max distance is sqrt(3*255^2))
            max_distance = (3 * 255**2)**0.5
            similarity = distance / max_distance
            
            return similarity
            
        except Exception:
            return 1.0  # Assume completely different if calculation fails
    
    def _is_brand_color(self, color: str, brand_name: str, r: int, g: int, b: int, saturation: float) -> bool:
        """Detect if color is likely a brand color."""
        
        brand_lower = brand_name.lower()
        
        # Brand-specific patterns (no hardcoding, just color theory)
        if 'spotify' in brand_lower:
            # Spotify uses bright greens
            return g > 180 and g > r and g > b and saturation > 0.5
        
        elif 'nike' in brand_lower:
            # Nike uses oranges and athletic colors
            return (r > 150 and r > g and r > b) or saturation > 0.7
        
        elif 'instacart' in brand_lower:
            # Instacart uses greens and warm colors
            return (g > r and g > b and g > 100) or (r > 200 and g > 80 and b < 100)
        
        elif 'apple' in brand_lower:
            # Apple uses clean colors and grays
            return saturation > 0.4 or (abs(r-g) < 10 and abs(g-b) < 10 and r > 100)
        
        elif any(word in brand_lower for word in ['facebook', 'meta']):
            # Facebook/Meta uses blues
            return b > 150 and b > r and b > g
        
        elif 'google' in brand_lower:
            # Google uses primary colors
            return saturation > 0.6 and max(r, g, b) > 150
        
        elif 'microsoft' in brand_lower:
            # Microsoft uses blues and clean colors
            return b > 100 or saturation > 0.5
        
        # General brand color detection
        return saturation > 0.4 and max(r, g, b) > 80 and min(r, g, b) < 200
    
    def _empty_categorization(self) -> Dict[str, Any]:
        """Return empty categorization structure."""
        return {
            'primary': None,
            'secondary': None,
            'accent': [],
            'background': [],
            'text': [],
            'neutral': [],
            'all_colors': []
        }