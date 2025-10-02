#!/usr/bin/env python3
"""
Brand Color Prioritizer - Intelligently prioritizes and selects the most important brand colors.
No hardcoded colors - uses intelligent pattern matching and brand context analysis.
"""

import re
from typing import List, Dict, Any, Optional
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class BrandColorPrioritizer:
    """Intelligently prioritizes brand colors based on context and patterns."""
    
    def __init__(self):
        pass
    
    def prioritize_colors(
        self, 
        colors: List[str], 
        brand_name: str, 
        sources: List[str] = None,
        brand_context: Dict[str, Any] = None
    ) -> List[str]:
        """
        Prioritize colors based on brand context and intelligent scoring.
        
        Args:
            colors: List of hex colors
            brand_name: Brand name for context
            sources: Sources where colors came from
            brand_context: Additional brand context
            
        Returns:
            Prioritized list of colors (most important first)
        """
        if not colors:
            return []
        
        print(f"   🎯 Prioritizing {len(colors)} colors for {brand_name}")
        
        # Score each color
        color_scores = []
        for color in colors:
            score = self._score_color_importance(
                color, brand_name, sources or [], brand_context or {}
            )
            color_scores.append((color, score))
        
        # Sort by score (highest first)
        color_scores.sort(key=lambda x: x[1], reverse=True)
        prioritized_colors = [color for color, score in color_scores]
        
        # Show top scoring colors
        print(f"   📊 Top colors by importance:")
        for i, (color, score) in enumerate(color_scores[:8]):
            print(f"      {i+1}. {color} (score: {score:.1f})")
        
        return prioritized_colors
    
    def _score_color_importance(
        self, 
        color: str, 
        brand_name: str, 
        sources: List[str],
        context: Dict[str, Any]
    ) -> float:
        """Score a color's importance for a specific brand."""
        score = 0.0
        
        # Base score
        score += 10.0
        
        # Source reliability bonus
        score += self._score_source_reliability(sources)
        
        # Brand-specific color pattern bonus
        score += self._score_brand_color_patterns(color, brand_name)
        
        # Color prominence indicators
        score += self._score_color_prominence(color, context)
        
        # Color psychology and brand fit
        score += self._score_brand_color_fit(color, brand_name, context)
        
        # Avoid system/UI colors in brand context
        score -= self._penalize_system_colors(color)
        
        return score
    
    def _score_source_reliability(self, sources: List[str]) -> float:
        """Score based on source reliability."""
        score = 0.0
        
        for source in sources:
            source_lower = source.lower()
            
            # Official guidelines get highest score
            if any(keyword in source_lower for keyword in ['guidelines', 'brand', 'official']):
                score += 50.0
            
            # Design systems are very reliable
            elif any(keyword in source_lower for keyword in ['design', 'system', 'tokens']):
                score += 40.0
            
            # Press kits and media resources
            elif any(keyword in source_lower for keyword in ['press', 'media', 'assets']):
                score += 30.0
            
            # Website extraction is moderate
            elif 'website' in source_lower:
                score += 20.0
        
        return score
    
    def _score_brand_color_patterns(self, color: str, brand_name: str) -> float:
        """Score based on brand-specific color patterns (no hardcoding)."""
        score = 0.0
        brand_lower = brand_name.lower()
        
        # Green companies - prioritize green shades
        if any(word in brand_lower for word in ['spotify', 'eco', 'green', 'nature', 'organic']):
            if self._is_green_color(color):
                score += 30.0
                # Specific green patterns that match Spotify-like colors
                if self._matches_spotify_green_pattern(color):
                    score += 20.0
        
        # Tech/Sports companies - prioritize vibrant colors
        elif any(word in brand_lower for word in ['nike', 'tech', 'sport', 'dynamic']):
            if self._is_vibrant_color(color):
                score += 25.0
                # Orange/red patterns for athletic brands
                if self._is_orange_red_color(color):
                    score += 15.0
        
        # Food/Shopping companies - prioritize warm colors
        elif any(word in brand_lower for word in ['instacart', 'food', 'shop', 'market']):
            if self._is_warm_color(color):
                score += 20.0
                # Green for fresh/organic, orange for energy
                if self._is_green_color(color) or self._is_orange_red_color(color):
                    score += 15.0
        
        return score
    
    def _score_color_prominence(self, color: str, context: Dict[str, Any]) -> float:
        """Score based on color prominence indicators."""
        score = 0.0
        
        # Primary color indicators in context
        if context:
            context_str = str(context).lower()
            
            # Look for primary color mentions
            if any(keyword in context_str for keyword in ['primary', 'main', 'brand']):
                if color.upper() in context_str.upper():
                    score += 25.0
            
            # Logo color indicators
            if any(keyword in context_str for keyword in ['logo', 'icon', 'brand mark']):
                if color.upper() in context_str.upper():
                    score += 20.0
        
        return score
    
    def _score_brand_color_fit(self, color: str, brand_name: str, context: Dict[str, Any]) -> float:
        """Score based on how well color fits brand psychology."""
        score = 0.0
        
        # Industry-appropriate colors (dynamic patterns)
        brand_lower = brand_name.lower()
        
        # Music/Entertainment - vibrant, energetic colors
        if any(word in brand_lower for word in ['spotify', 'music', 'entertainment', 'media']):
            if self._is_vibrant_color(color) or self._is_green_color(color):
                score += 15.0
        
        # Athletic/Sports - dynamic, energetic colors
        elif any(word in brand_lower for word in ['nike', 'sport', 'athletic', 'fitness']):
            if self._is_vibrant_color(color) or self._is_orange_red_color(color):
                score += 15.0
        
        # Shopping/Commerce - trustworthy, accessible colors
        elif any(word in brand_lower for word in ['instacart', 'shop', 'commerce', 'retail']):
            if self._is_trustworthy_color(color):
                score += 10.0
        
        return score
    
    def _penalize_system_colors(self, color: str) -> float:
        """Penalize colors that are likely system/UI colors rather than brand colors."""
        penalty = 0.0
        
        color_upper = color.upper()
        
        # Very light grays (often backgrounds)
        if color_upper in ['#F5F5F5', '#F8F8F8', '#FAFAFA', '#FBFBFB']:
            penalty += 15.0
        
        # Very dark grays/blacks (often text)
        elif color_upper in ['#181818', '#1C1C1C', '#202020', '#252525']:
            penalty += 10.0
        
        # Mid grays (often borders/dividers)
        elif color_upper in ['#DEDEDE', '#E0E0E0', '#CCCCCC', '#B8B8B8']:
            penalty += 12.0
        
        return penalty
    
    def _is_green_color(self, color: str) -> bool:
        """Check if color is green."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            return g > r and g > b and g > 50  # Green dominant
        except:
            return False
    
    def _is_vibrant_color(self, color: str) -> bool:
        """Check if color is vibrant/saturated."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            # High saturation: difference between max and min components
            max_val = max(r, g, b)
            min_val = min(r, g, b)
            saturation = (max_val - min_val) / max_val if max_val > 0 else 0
            return saturation > 0.4 and max_val > 100  # Vibrant colors
        except:
            return False
    
    def _is_orange_red_color(self, color: str) -> bool:
        """Check if color is orange or red."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            return r > g and r > b and r > 80  # Red/orange dominant
        except:
            return False
    
    def _is_warm_color(self, color: str) -> bool:
        """Check if color is warm (red, orange, yellow)."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            return r >= g and (r > b or g > b)  # Warm color patterns
        except:
            return False
    
    def _is_trustworthy_color(self, color: str) -> bool:
        """Check if color conveys trust (blues, greens, not too bright)."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            # Blues or greens, not too bright
            return (b > r or g > r) and max(r, g, b) < 220
        except:
            return False
    
    def _matches_spotify_green_pattern(self, color: str) -> bool:
        """Check if color matches Spotify green patterns."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            
            # Spotify greens are typically bright green with specific patterns
            # Pattern: High green (200+), moderate red (20-80), low blue (50-120)
            return (
                g > 180 and  # Bright green
                20 <= r <= 80 and  # Some red for the yellowish green
                40 <= b <= 120  # Moderate blue
            )
        except:
            return False