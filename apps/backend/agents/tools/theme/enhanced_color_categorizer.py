#!/usr/bin/env python3
"""
Enhanced color categorization system.
Properly categorizes colors into primary, secondary, accent, and background.
"""

import colorsys
from typing import List, Dict, Any, Tuple
import re
from collections import Counter
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class EnhancedColorCategorizer:
    """Advanced color categorization with semantic understanding."""
    
    def __init__(self):
        self.brand_color_keywords = {
            'primary': ['primary', 'main', 'brand', 'corporate', 'principal'],
            'secondary': ['secondary', 'support', 'complementary', 'alternate'],
            'accent': ['accent', 'highlight', 'call-to-action', 'cta', 'action', 'button'],
            'background': ['background', 'bg', 'surface', 'canvas', 'page', 'body'],
            'text': ['text', 'font', 'foreground', 'content', 'copy'],
            'neutral': ['neutral', 'gray', 'grey', 'muted', 'subtle']
        }
    
    def categorize_colors(
        self,
        colors: List[str],
        css_variables: Dict[str, str] = None,
        brand_context: str = "",
        website_content: str = ""
    ) -> Dict[str, Any]:
        """
        Categorize colors into semantic groups with proper hierarchy.
        
        Args:
            colors: List of hex colors
            css_variables: CSS custom properties with color values
            brand_context: Brand name and context
            website_content: Website content for context clues
            
        Returns:
            Categorized colors with confidence scores
        """
        
        if not colors:
            return self._get_empty_result()
        
        # Prepare color analysis data
        color_data = []
        for color in colors:
            analysis = self._analyze_color_properties(color)
            analysis['hex'] = color
            analysis['source'] = 'extracted'
            analysis['semantic_score'] = 0
            analysis['css_variables'] = []
            analysis['category_votes'] = {category: 0 for category in self.brand_color_keywords}
            color_data.append(analysis)
        
        # Add CSS variable context
        if css_variables:
            color_data = self._enrich_with_css_context(color_data, css_variables)
        
        # Add brand context
        color_data = self._enrich_with_brand_context(color_data, brand_context, website_content)
        
        # Categorize colors
        categorized = self._perform_categorization(color_data)
        
        # Generate complementary colors if needed
        categorized = self._ensure_complete_palette(categorized)
        
        return categorized
    
    def _analyze_color_properties(self, hex_color: str) -> Dict[str, Any]:
        """Analyze color properties for categorization."""
        try:
            # Convert to RGB and HSL
            hex_color = hex_color.lstrip('#')
            if len(hex_color) != 6:
                hex_color = hex_color * 2 if len(hex_color) == 3 else '000000'
            
            r = int(hex_color[0:2], 16) / 255.0
            g = int(hex_color[2:4], 16) / 255.0  
            b = int(hex_color[4:6], 16) / 255.0
            
            h, l, s = colorsys.rgb_to_hls(r, g, b)
            
            # Calculate properties
            brightness = 0.299 * r + 0.587 * g + 0.114 * b
            saturation = s
            hue = h * 360
            
            # Determine color characteristics
            is_warm = 0 <= hue <= 60 or 300 <= hue <= 360  # Reds, oranges, yellows
            is_cool = 120 <= hue <= 240  # Blues, greens
            is_neutral = saturation < 0.15
            is_vivid = saturation > 0.6 and brightness > 0.3
            is_dark = brightness < 0.3
            is_light = brightness > 0.8
            
            return {
                'rgb': (r, g, b),
                'hsl': (h, l, s),
                'brightness': brightness,
                'saturation': saturation,
                'hue': hue,
                'is_warm': is_warm,
                'is_cool': is_cool,
                'is_neutral': is_neutral,
                'is_vivid': is_vivid,
                'is_dark': is_dark,
                'is_light': is_light
            }
            
        except Exception as e:
            logger.debug(f"Color analysis failed for {hex_color}: {e}")
            return {
                'rgb': (0, 0, 0),
                'hsl': (0, 0, 0),
                'brightness': 0,
                'saturation': 0,
                'hue': 0,
                'is_warm': False,
                'is_cool': False,
                'is_neutral': True,
                'is_vivid': False,
                'is_dark': True,
                'is_light': False
            }
    
    def _enrich_with_css_context(self, color_data: List[Dict], css_variables: Dict[str, str]) -> List[Dict]:
        """Enrich color data with CSS variable context."""
        
        # Create reverse mapping from color to CSS variable names
        color_to_vars = {}
        for var_name, var_value in css_variables.items():
            if var_value.startswith('#'):
                normalized_value = var_value.upper()
                if normalized_value not in color_to_vars:
                    color_to_vars[normalized_value] = []
                color_to_vars[normalized_value].append(var_name.lower())
        
        # Enrich color data with semantic scores
        for color_info in color_data:
            color_hex = color_info['hex'].upper()
            
            if color_hex in color_to_vars:
                var_names = color_to_vars[color_hex]
                color_info['css_variables'] = var_names
                
                # Calculate semantic score based on variable names
                semantic_score = 0
                
                for var_name in var_names:
                    for category, keywords in self.brand_color_keywords.items():
                        for keyword in keywords:
                            if keyword in var_name:
                                color_info['category_votes'][category] += 2
                                semantic_score += 1
                
                color_info['semantic_score'] = semantic_score
        
        return color_data
    
    def _enrich_with_brand_context(self, color_data: List[Dict], brand_context: str, website_content: str) -> List[Dict]:
        """Add brand-specific context to color analysis."""
        
        # Brand-specific color associations
        brand_associations = {
            'spotify': {'primary': 'green', 'accent': 'green'},
            'netflix': {'primary': 'red', 'background': 'black'},
            'facebook': {'primary': 'blue'},
            'twitter': {'primary': 'blue'},
            'instagram': {'primary': 'purple', 'accent': 'pink'},
            'linkedin': {'primary': 'blue'},
            'youtube': {'primary': 'red'},
            'google': {'primary': 'blue', 'accent': 'red'},
            'microsoft': {'primary': 'blue'},
            'apple': {'neutral': 'gray', 'background': 'white'},
            'github': {'primary': 'black', 'accent': 'orange'},
            'slack': {'primary': 'purple', 'accent': 'green'},
            'stripe': {'primary': 'blue', 'accent': 'purple'},
            'airbnb': {'primary': 'red', 'accent': 'coral'}
        }
        
        brand_lower = brand_context.lower()
        brand_colors = brand_associations.get(brand_lower, {})
        
        # Apply brand-specific scoring
        for color_info in color_data:
            brand_bonus = 0
            
            for category, expected_color in brand_colors.items():
                if self._color_matches_description(color_info, expected_color):
                    color_info['category_votes'][category] += 3
                    brand_bonus += 2
            
            color_info['semantic_score'] += brand_bonus
        
        return color_data
    
    def _color_matches_description(self, color_info: Dict, color_description: str) -> bool:
        """Check if a color matches a description like 'red', 'blue', etc."""
        hue = color_info['hue']
        saturation = color_info['saturation']
        brightness = color_info['brightness']
        
        # Define hue ranges for color names
        color_ranges = {
            'red': (0, 30, 330, 360),  # Two ranges for red (wraps around)
            'orange': (30, 60),
            'yellow': (60, 90),
            'green': (90, 150),
            'blue': (150, 270),
            'purple': (270, 330),
            'pink': (300, 360, 0, 30),  # Pink overlaps with red
            'black': None,  # Special case
            'white': None,  # Special case
            'gray': None,   # Special case
            'grey': None    # Special case
        }
        
        if color_description in ['black', 'dark']:
            return brightness < 0.2
        elif color_description in ['white', 'light']:
            return brightness > 0.9
        elif color_description in ['gray', 'grey', 'neutral']:
            return saturation < 0.2
        elif color_description in color_ranges:
            ranges = color_ranges[color_description]
            if isinstance(ranges, tuple) and len(ranges) == 2:
                return ranges[0] <= hue <= ranges[1] and saturation > 0.3
            elif isinstance(ranges, tuple) and len(ranges) == 4:
                # Handle wrapped ranges like red
                return ((ranges[0] <= hue <= ranges[1]) or (ranges[2] <= hue <= ranges[3])) and saturation > 0.3
        
        return False
    
    def _perform_categorization(self, color_data: List[Dict]) -> Dict[str, Any]:
        """Perform the actual color categorization."""
        
        # Sort colors by semantic score (highest first)
        color_data.sort(key=lambda x: x['semantic_score'], reverse=True)
        
        categorized = {
            'primary': [],
            'secondary': [],
            'accent': [],
            'background': [],
            'text': [],
            'neutral': [],
            'all_colors': [c['hex'] for c in color_data]
        }
        
        used_colors = set()
        
        # Step 1: Assign based on strong semantic signals
        for color_info in color_data:
            if color_info['hex'] in used_colors:
                continue
                
            votes = color_info['category_votes']
            max_votes = max(votes.values()) if votes else 0
            
            if max_votes >= 2:  # Strong semantic signal
                top_category = max(votes, key=votes.get)
                if len(categorized[top_category]) < 2:  # Limit per category
                    categorized[top_category].append(color_info['hex'])
                    used_colors.add(color_info['hex'])
        
        # Step 2: Fill primary colors with most saturated/distinctive colors
        if not categorized['primary']:
            vivid_colors = [c for c in color_data if c['is_vivid'] and c['hex'] not in used_colors]
            if vivid_colors:
                categorized['primary'].append(vivid_colors[0]['hex'])
                used_colors.add(vivid_colors[0]['hex'])
        
        # Step 3: Fill background colors with light/neutral colors
        if not categorized['background']:
            light_colors = [c for c in color_data if c['is_light'] and c['hex'] not in used_colors]
            neutral_colors = [c for c in color_data if c['is_neutral'] and c['hex'] not in used_colors]
            
            background_candidates = light_colors + neutral_colors
            for color_info in background_candidates[:2]:
                if color_info['hex'] not in used_colors:
                    categorized['background'].append(color_info['hex'])
                    used_colors.add(color_info['hex'])
        
        # Step 4: Fill accent colors with complementary vivid colors
        if len(categorized['accent']) < 2:
            accent_candidates = [c for c in color_data 
                               if c['is_vivid'] and c['hex'] not in used_colors]
            
            for color_info in accent_candidates[:2]:
                categorized['accent'].append(color_info['hex'])
                used_colors.add(color_info['hex'])
        
        # Step 5: Fill secondary with remaining distinctive colors
        if not categorized['secondary']:
            remaining_colors = [c for c in color_data 
                              if c['hex'] not in used_colors and not c['is_light']]
            
            for color_info in remaining_colors[:2]:
                categorized['secondary'].append(color_info['hex'])
                used_colors.add(color_info['hex'])
        
        # Step 6: Determine appropriate text colors
        categorized['text'] = self._calculate_text_colors(categorized)
        
        return categorized
    
    def _ensure_complete_palette(self, categorized: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure we have a complete, usable color palette."""
        
        # Ensure we have at least one primary color
        if not categorized['primary'] and categorized['all_colors']:
            # Pick the most saturated color as primary
            color_scores = []
            for color in categorized['all_colors']:
                analysis = self._analyze_color_properties(color)
                score = analysis['saturation'] * 0.7 + (1 - abs(analysis['brightness'] - 0.5)) * 0.3
                color_scores.append((score, color))
            
            color_scores.sort(key=lambda x: x[0], reverse=True)
            categorized['primary'] = [color_scores[0][1]]
        
        # Ensure we have background colors
        if not categorized['background'] and categorized['primary']:
            primary_analysis = self._analyze_color_properties(categorized['primary'][0])
            
            if primary_analysis['is_dark']:
                # Dark primary -> light background
                categorized['background'] = ['#FFFFFF', '#F8F9FA']
            else:
                # Light primary -> generate complementary background
                complementary = self._generate_complementary_color(categorized['primary'][0])
                light_complement = self._lighten_color(complementary, 0.8)
                categorized['background'] = [light_complement, '#FFFFFF']
        
        # Ensure we have accent colors
        if len(categorized['accent']) < 2 and categorized['primary']:
            primary_color = categorized['primary'][0]
            accent1 = self._generate_analogous_color(primary_color, 60)
            accent2 = self._generate_analogous_color(primary_color, -60)
            
            existing_accents = set(categorized['accent'])
            if accent1 not in existing_accents:
                categorized['accent'].append(accent1)
            if accent2 not in existing_accents and len(categorized['accent']) < 2:
                categorized['accent'].append(accent2)
        
        return categorized
    
    def _calculate_text_colors(self, categorized: Dict[str, Any]) -> List[str]:
        """Calculate appropriate text colors for the palette."""
        text_colors = []
        
        # Find the best text color for primary backgrounds
        backgrounds = categorized.get('background', [])
        if not backgrounds and categorized.get('primary'):
            backgrounds = categorized['primary'][:1]
        
        for bg_color in backgrounds[:2]:  # Check up to 2 backgrounds
            bg_analysis = self._analyze_color_properties(bg_color)
            
            if bg_analysis['brightness'] > 0.6:
                # Light background -> dark text
                text_colors.append('#1A1A1A')
            else:
                # Dark background -> light text  
                text_colors.append('#FFFFFF')
        
        # Ensure we have at least one text color
        if not text_colors:
            text_colors = ['#1A1A1A', '#FFFFFF']
        
        return list(dict.fromkeys(text_colors))  # Remove duplicates, preserve order
    
    def _generate_complementary_color(self, hex_color: str) -> str:
        """Generate complementary color."""
        try:
            analysis = self._analyze_color_properties(hex_color)
            h, l, s = analysis['hsl']
            
            # Complementary hue (opposite on color wheel)
            comp_h = (h + 0.5) % 1.0
            
            # Adjust lightness and saturation for better harmony
            comp_l = min(0.8, l + 0.2) if l < 0.5 else max(0.2, l - 0.2)
            comp_s = max(0.3, s * 0.8)  # Slightly less saturated
            
            r, g, b = colorsys.hls_to_rgb(comp_h, comp_l, comp_s)
            return f"#{int(r*255):02X}{int(g*255):02X}{int(b*255):02X}"
            
        except Exception:
            return "#4A5568"  # Fallback neutral
    
    def _generate_analogous_color(self, hex_color: str, hue_shift: float) -> str:
        """Generate analogous color by shifting hue."""
        try:
            analysis = self._analyze_color_properties(hex_color)
            h, l, s = analysis['hsl']
            
            # Shift hue by specified degrees
            new_h = (h + hue_shift / 360.0) % 1.0
            
            r, g, b = colorsys.hls_to_rgb(new_h, l, s)
            return f"#{int(r*255):02X}{int(g*255):02X}{int(b*255):02X}"
            
        except Exception:
            return "#4A5568"  # Fallback neutral
    
    def _lighten_color(self, hex_color: str, factor: float) -> str:
        """Lighten a color by a factor (0-1)."""
        try:
            analysis = self._analyze_color_properties(hex_color)
            h, l, s = analysis['hsl']
            
            # Increase lightness
            new_l = min(1.0, l + (1.0 - l) * factor)
            
            r, g, b = colorsys.hls_to_rgb(h, new_l, s)
            return f"#{int(r*255):02X}{int(g*255):02X}{int(b*255):02X}"
            
        except Exception:
            return hex_color
    
    def _get_empty_result(self) -> Dict[str, Any]:
        """Return empty categorization result."""
        return {
            'primary': [],
            'secondary': [],
            'accent': [],
            'background': ['#FFFFFF', '#F8F9FA'],
            'text': ['#1A1A1A', '#FFFFFF'],
            'neutral': ['#6B7280', '#9CA3AF'],
            'all_colors': []
        }