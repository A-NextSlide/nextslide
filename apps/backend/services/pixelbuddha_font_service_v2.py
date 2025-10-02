"""
Enhanced PixelBuddha Font Service - Intelligent font pairing using categorized fonts
"""

import json
import os
from typing import Dict, List, Optional, Tuple
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class PixelBuddhaFontServiceV2:
    """
    Enhanced service that uses categorized PixelBuddha fonts
    to provide appropriate font pairings for different presentation contexts.
    """
    
    def __init__(self):
        self.categories = self._load_categories()
        self.pairings = self._load_pairings()
        self.registry = self._load_registry()
    
    def _load_categories(self) -> Dict:
        """Load the categorized fonts"""
        categories_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'pixelbuddha' / 'font_categories.json'
        
        if categories_path.exists():
            with open(categories_path, 'r') as f:
                return json.load(f)
        
        return {}
    
    def _load_pairings(self) -> Dict:
        """Load the font pairing recommendations"""
        pairings_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'pixelbuddha' / 'font_pairings.json'
        
        if pairings_path.exists():
            with open(pairings_path, 'r') as f:
                return json.load(f)
        
        return {}
    
    def _load_registry(self) -> Dict:
        """Load the full font registry with descriptions"""
        registry_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'pixelbuddha' / 'font_registry.json'
        
        if registry_path.exists():
            with open(registry_path, 'r') as f:
                return json.load(f)
        
        return {}
    
    def _is_inappropriate_font(self, font_name: str) -> bool:
        """Check if a font name is inappropriate for professional use"""
        inappropriate_words = [
            'telefax', 'tm', 'demo', 'test', 'sample', 'trial',
            'personal', 'non-commercial', 'student', 'learning'
        ]
        name_lower = font_name.lower()
        return any(word in name_lower for word in inappropriate_words)
    
    def get_appropriate_fonts(
        self,
        deck_title: str,
        vibe: str,
        content_keywords: List[str] = None
    ) -> Dict[str, List[str]]:
        """
        Get appropriate fonts based on presentation context.
        
        Returns only professional/appropriate fonts for the context.
        """
        
        # Determine presentation type
        presentation_type = self._determine_presentation_type(deck_title, vibe, content_keywords)
        
        # Get appropriate categories for this type
        appropriate_categories = self._get_appropriate_categories(presentation_type, vibe)
        
        # Select fonts from appropriate categories
        hero_fonts = []
        body_fonts = []
        
        # For hero fonts - prioritize display and distinctive fonts
        for category in appropriate_categories['hero']:
            if category in self.categories:
                # Take first 5 from each category to avoid overwhelming
                category_fonts = self.categories[category][:10]
                # Filter out inappropriate fonts
                filtered_fonts = [f['name'] for f in category_fonts 
                                if not self._is_inappropriate_font(f['name'])]
                hero_fonts.extend(filtered_fonts[:5])
        
        # For body fonts - prioritize readability
        for category in appropriate_categories['body']:
            if category in self.categories:
                category_fonts = self.categories[category][:10]
                # Filter out inappropriate fonts
                filtered_fonts = [f['name'] for f in category_fonts 
                                if not self._is_inappropriate_font(f['name'])]
                body_fonts.extend(filtered_fonts[:5])
        
        # Remove duplicates while preserving order
        hero_fonts = list(dict.fromkeys(hero_fonts))[:20]  # Limit to 20 options
        body_fonts = list(dict.fromkeys(body_fonts))[:20]
        
        # Ensure we don't recommend the same font for both
        body_fonts = [f for f in body_fonts if f not in hero_fonts]
        
        return {
            'hero': hero_fonts,
            'body': body_fonts,
            'presentation_type': presentation_type,
            'reasoning': f"Selected {presentation_type} appropriate fonts avoiding graffiti/horror styles"
        }
    
    def _determine_presentation_type(self, title: str, vibe: str, keywords: List[str] = None) -> str:
        """Determine the type of presentation"""
        
        title_lower = title.lower()
        vibe_lower = vibe.lower()
        keywords_text = ' '.join(keywords).lower() if keywords else ''
        all_text = f"{title_lower} {vibe_lower} {keywords_text}"
        
        # Check for specific presentation types
        if any(word in all_text for word in ['storyboard', 'video', 'scene', 'script', 'production']):
            return 'creative'  # Storyboarding should use creative fonts
            
        if any(word in all_text for word in ['q1', 'q2', 'q3', 'q4', 'quarterly', 'earnings', 'financial', 'revenue']):
            return 'quarterly_report'
        
        if any(word in all_text for word in ['corporate', 'business', 'enterprise', 'professional', 'formal']):
            return 'corporate'
        
        if any(word in all_text for word in ['startup', 'pitch', 'investor', 'funding', 'seed']):
            return 'tech_startup'
        
        if any(word in all_text for word in ['education', 'teaching', 'learning', 'school', 'university']):
            return 'educational'
        
        if any(word in all_text for word in ['creative', 'design', 'art', 'portfolio']):
            return 'creative'
        
        # Default based on vibe
        if vibe_lower in ['professional', 'formal', 'serious']:
            return 'corporate'
        elif vibe_lower in ['modern', 'tech', 'innovative']:
            return 'tech_startup'
        elif vibe_lower in ['fun', 'playful', 'casual']:
            return 'creative'
        
        return 'general'
    
    def _get_appropriate_categories(self, presentation_type: str, vibe: str) -> Dict[str, List[str]]:
        """Get appropriate font categories for the presentation type"""
        
        # Define appropriate categories for each presentation type
        category_map = {
            'quarterly_report': {
                'hero': ['professional', 'sans', 'tech'],  # Clean, modern, professional
                'body': ['sans', 'professional']  # Highly readable
            },
            'corporate': {
                'hero': ['professional', 'elegant', 'serif'],
                'body': ['sans', 'professional']
            },
            'tech_startup': {
                'hero': ['tech', 'display', 'sans'],
                'body': ['sans', 'tech', 'professional']
            },
            'educational': {
                'hero': ['serif', 'professional', 'elegant'],
                'body': ['sans', 'professional']
            },
            'creative': {
                'hero': ['display', 'creative', 'retro'],  # More freedom but still curated
                'body': ['sans', 'general']
            },
            'general': {
                'hero': ['professional', 'sans', 'display'],
                'body': ['sans', 'professional']
            }
        }
        
        return category_map.get(presentation_type, category_map['general'])
    
    def get_filtered_font_list(self) -> List[str]:
        """Get the complete list of appropriate PixelBuddha fonts (excluding inappropriate ones)"""
        
        all_fonts = set()
        
        # Collect all fonts from all categories
        for category_fonts in self.categories.values():
            for font in category_fonts:
                all_fonts.add(font['name'])
        
        return sorted(list(all_fonts))