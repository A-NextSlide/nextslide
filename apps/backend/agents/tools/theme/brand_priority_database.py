#!/usr/bin/env python3
"""
Brand Priority Database - Ensures we prioritize the most iconic, recognizable brand colors
that customers actually associate with each brand.
"""

from typing import Dict, List, Optional, Tuple
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class BrandPriorityDatabase:
    """Database of priority brand colors for major brands."""
    
    def __init__(self):
        # NO HARDCODED COLORS - Pure website extraction only
        self.brand_colors = {}
        
        # Brand aliases - different ways people might refer to the same brand
        self.brand_aliases = {
            'youtube.com': 'youtube',
            'youtu.be': 'youtube',
            'yt': 'youtube',
            'insta': 'instagram',
            'ig': 'instagram',
            'fb': 'facebook',
            'goog': 'google',
            'googl': 'google',
            'msft': 'microsoft',
            'ms': 'microsoft',
            'mcd': 'mcdonalds',
            'sbux': 'starbucks',
            'uber eats': 'uber',
            'ubereats': 'uber'
        }
    
    def get_priority_colors(self, brand_name: str) -> Optional[Dict[str, List[str]]]:
        """Get priority colors for a brand."""
        
        # Normalize brand name
        brand_key = self._normalize_brand_name(brand_name)
        
        # Check direct match
        if brand_key in self.brand_colors:
            return self.brand_colors[brand_key]
        
        # Check aliases
        if brand_key in self.brand_aliases:
            return self.brand_colors[self.brand_aliases[brand_key]]
        
        # Fuzzy matching for close names
        for known_brand in self.brand_colors.keys():
            if self._brands_similar(brand_key, known_brand):
                return self.brand_colors[known_brand]
        
        return None
    
    def _normalize_brand_name(self, brand_name: str) -> str:
        """Normalize brand name for lookup."""
        return brand_name.lower().strip().replace(' ', '').replace('-', '').replace('.', '').replace('_', '')
    
    def _brands_similar(self, brand1: str, brand2: str) -> bool:
        """Check if two brand names are similar enough to match."""
        # Simple similarity check
        if brand1 in brand2 or brand2 in brand1:
            return True
        
        # Levenshtein distance for typos
        return self._levenshtein_distance(brand1, brand2) <= 2
    
    def _levenshtein_distance(self, s1: str, s2: str) -> int:
        """Calculate Levenshtein distance between two strings."""
        if len(s1) < len(s2):
            return self._levenshtein_distance(s2, s1)
        
        if len(s2) == 0:
            return len(s1)
        
        previous_row = list(range(len(s2) + 1))
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row
        
        return previous_row[-1]
    
    def enhance_extracted_colors(self, brand_name: str, extracted_colors: List[str]) -> Tuple[List[str], Dict[str, any]]:
        """
        Enhance extracted colors with priority brand colors.
        
        Returns:
            Tuple of (enhanced_colors, metadata)
        """
        
        priority_colors = self.get_priority_colors(brand_name)
        if not priority_colors:
            return extracted_colors, {'priority_boost': False}
        
        enhanced = []
        used_priorities = []
        
        # 1. Add primary colors first (highest priority)
        for primary_color in priority_colors['primary']:
            if not self._color_already_present(primary_color, enhanced):
                enhanced.append(primary_color)
                used_priorities.append(f'primary:{primary_color}')
        
        # 2. Add extracted colors that aren't too similar to priorities
        for extracted_color in extracted_colors:
            if len(enhanced) >= 8:  # Limit total colors
                break
            
            # Skip if too similar to already added colors
            if not self._color_already_present(extracted_color, enhanced, threshold=25):
                enhanced.append(extracted_color)
        
        # 3. Add secondary colors if we have room
        for secondary_color in priority_colors.get('secondary', []):
            if len(enhanced) >= 8:
                break
            if not self._color_already_present(secondary_color, enhanced, threshold=25):
                enhanced.append(secondary_color)
                used_priorities.append(f'secondary:{secondary_color}')
        
        # 4. Add neutral colors if we have room and they're not present
        for neutral_color in priority_colors.get('neutrals', []):
            if len(enhanced) >= 10:
                break
            if not self._color_already_present(neutral_color, enhanced, threshold=15):
                enhanced.append(neutral_color)
                used_priorities.append(f'neutral:{neutral_color}')
        
        metadata = {
            'priority_boost': True,
            'used_priorities': used_priorities,
            'original_count': len(extracted_colors),
            'enhanced_count': len(enhanced)
        }
        
        logger.info(f"Enhanced {brand_name}: {len(extracted_colors)} -> {len(enhanced)} colors, priorities: {used_priorities}")
        
        return enhanced, metadata
    
    def _color_already_present(self, color: str, color_list: List[str], threshold: int = 30) -> bool:
        """Check if a color is already present in the list (within threshold)."""
        for existing_color in color_list:
            if self._colors_similar(color, existing_color, threshold):
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
    
    def get_all_brand_names(self) -> List[str]:
        """Get all brand names in the database."""
        return list(self.brand_colors.keys())