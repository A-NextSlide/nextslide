"""
Enhanced PixelBuddha Font Service V3 - Better font selection with quality scoring
"""

import json
import random
from typing import Dict, List, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class PixelBuddhaFontServiceV3:
    """
    Improved font service that avoids repetitive selections and provides
    better variety based on actual font quality and appropriateness.
    """
    
    # Fonts to avoid for professional presentations (too quirky/specific)
    AVOID_FOR_PROFESSIONAL = [
        'telefax', 'gokil', 'ancient-serpent', 'horror', 'zombie', 'trash', 
        'death', 'metal', 'graffiti', 'blood', 'spooky', 'halloween'
    ]
    
    # High-quality versatile fonts (manually curated)
    PREMIUM_FONTS = {
        'hero': [
            'elastic-square-display-font',
            'gendra-modern-sans-serif', 
            'greats-luxury-serif-font',
            'hiluna-clean-sans-serif',
            'gridiron-glory-sport-typeface',
            'oceania-mesmerizing-typeface',
            'bizkea-elegant-serif',
            'grandline-classy-luxury-typeface',
            'marine-elmoure-sans-serif',
            'hexaplex-geometric-typeface',
            'glorida-sans-serif-family',
            'avilar-display-font',
            'intrepic-display-font',
            'acting-slab-rounded-family',
            'centralismo-avant-garde-font',
            'magnifico-elegant-serif',
            'neudron-condensed-sans-serif-font',
            'standie-sans-display',
            'moldin-condensed-sans-serif-font',
            'manuscript-hand-lettered-serif'
        ],
        'body': [
            'gendra-modern-sans-serif',
            'hiluna-clean-sans-serif',
            'marine-elmoure-sans-serif',
            'glorida-sans-serif-family',
            'hello-chloe-sans-serif',
            'bionca-stylistic-sans-serif',
            'shinier-sans-serif-font',
            'rondah-modern-sans-serif',
            'qiera-modern-sans-serif',
            'benji-sans-serif',
            'acting-slab-rounded-family',
            'neudron-condensed-sans-serif-font',
            'standie-sans-display',
            'moldin-condensed-sans-serif-font'
        ],
        'creative': [
            'paradine-ligature-handwritten-font',
            'plumpkins-playful-kids-typeface',
            'kindly-season-3-font',
            'spooky-zombie-halloween-font',
            'double-bubble-3d-typeface',
            'upside-down-1980s-retro-typeface',
            'boho-melody-groovy-typeface',
            'disco-diva-groovy-typeface',
            'chunky-charmer-bold-typeface',
            'vibe-vision-experimental-font',
            'tropic-avenue-experimental-sans-serif',
            'lingo-lush-surreal-typeface',
            'freestyle-graffiti-display',
            'pixel-impact-retro-8bit-font',
            'plump-pixel-bouncy-8-bit-font'
        ]
    }
    
    def __init__(self):
        self.registry = self._load_registry()
        self.categories = self._load_categories()
        self.recent_selections = []  # Track recent selections to avoid repetition
    
    def _load_registry(self) -> Dict:
        """Load the full font registry"""
        registry_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'pixelbuddha' / 'font_registry.json'
        
        if registry_path.exists():
            with open(registry_path, 'r') as f:
                return json.load(f)
        
        return {}
    
    def _load_categories(self) -> Dict:
        """Load font categories"""
        categories_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'pixelbuddha' / 'font_categories.json'
        
        if categories_path.exists():
            with open(categories_path, 'r') as f:
                return json.load(f)
        
        return {}
    
    def get_appropriate_fonts(
        self,
        deck_title: str,
        vibe: str,
        content_keywords: List[str] = None
    ) -> Dict[str, List[str]]:
        """
        Get appropriate fonts with better variety and quality.
        """
        
        # Determine context
        is_professional = self._is_professional_context(deck_title, vibe, content_keywords)
        is_creative = self._is_creative_context(deck_title, vibe, content_keywords)
        
        # Select fonts based on context
        if is_professional:
            hero_fonts = self._get_professional_hero_fonts()
            body_fonts = self._get_professional_body_fonts()
        elif is_creative:
            hero_fonts = self._get_creative_hero_fonts()
            body_fonts = self._get_creative_body_fonts()
        else:
            hero_fonts = self._get_balanced_hero_fonts()
            body_fonts = self._get_balanced_body_fonts()
        
        # Ensure variety by avoiding recent selections
        hero_fonts = self._ensure_variety(hero_fonts, 'hero')
        body_fonts = self._ensure_variety(body_fonts, 'body')
        
        return {
            'hero': hero_fonts[:15],  # Return top 15 options
            'body': body_fonts[:15],
            'presentation_type': 'professional' if is_professional else 'creative' if is_creative else 'balanced',
            'reasoning': self._get_reasoning(is_professional, is_creative)
        }
    
    def _is_professional_context(self, title: str, vibe: str, keywords: List[str] = None) -> bool:
        """Check if this is a professional/corporate context"""
        professional_indicators = [
            'corporate', 'business', 'professional', 'formal', 'serious',
            'quarterly', 'report', 'financial', 'enterprise', 'strategy'
        ]
        
        text = f"{title} {vibe} {' '.join(keywords or [])}".lower()
        return any(indicator in text for indicator in professional_indicators)
    
    def _is_creative_context(self, title: str, vibe: str, keywords: List[str] = None) -> bool:
        """Check if this is a creative/playful context"""
        creative_indicators = [
            'creative', 'fun', 'playful', 'artistic', 'design', 'portfolio',
            'casual', 'vibrant', 'experimental', 'innovative'
        ]
        
        text = f"{title} {vibe} {' '.join(keywords or [])}".lower()
        return any(indicator in text for indicator in creative_indicators)
    
    def _get_professional_hero_fonts(self) -> List[str]:
        """Get professional hero fonts"""
        # Start with premium selections
        fonts = list(self.PREMIUM_FONTS['hero'])
        
        # Add from categories
        if 'professional' in self.categories:
            prof_fonts = [f['name'] for f in self.categories['professional'] 
                         if not any(avoid in f['name'].lower() for avoid in self.AVOID_FOR_PROFESSIONAL)]
            fonts.extend(prof_fonts[:20])
        
        if 'elegant' in self.categories:
            elegant_fonts = [f['name'] for f in self.categories['elegant'][:15]]
            fonts.extend(elegant_fonts)
        
        # Shuffle for variety
        random.shuffle(fonts)
        return fonts
    
    def _get_professional_body_fonts(self) -> List[str]:
        """Get professional body fonts"""
        fonts = list(self.PREMIUM_FONTS['body'])
        
        if 'sans' in self.categories:
            sans_fonts = [f['name'] for f in self.categories['sans']
                         if not any(avoid in f['name'].lower() for avoid in self.AVOID_FOR_PROFESSIONAL)]
            fonts.extend(sans_fonts[:20])
        
        random.shuffle(fonts)
        return fonts
    
    def _get_creative_hero_fonts(self) -> List[str]:
        """Get creative/playful hero fonts"""
        fonts = list(self.PREMIUM_FONTS['creative'])
        
        if 'playful' in self.categories:
            playful_fonts = [f['name'] for f in self.categories['playful'][:20]]
            fonts.extend(playful_fonts)
        
        if 'display' in self.categories:
            display_fonts = [f['name'] for f in self.categories['display'][:20]]
            fonts.extend(display_fonts)
        
        random.shuffle(fonts)
        return fonts
    
    def _get_creative_body_fonts(self) -> List[str]:
        """Get creative body fonts"""
        fonts = list(self.PREMIUM_FONTS['body'])
        
        if 'creative' in self.categories:
            creative_fonts = [f['name'] for f in self.categories['creative'][:15]
                            if 'sans' in f['name'].lower() or 'serif' in f['name'].lower()]
            fonts.extend(creative_fonts)
        
        random.shuffle(fonts)
        return fonts
    
    def _get_balanced_hero_fonts(self) -> List[str]:
        """Get balanced selection of hero fonts"""
        fonts = []
        
        # Mix from different categories
        for category in ['tech', 'elegant', 'display', 'serif']:
            if category in self.categories:
                category_fonts = [f['name'] for f in self.categories[category][:10]
                                 if not any(avoid in f['name'].lower() for avoid in self.AVOID_FOR_PROFESSIONAL)]
                fonts.extend(category_fonts)
        
        # Add some premium fonts
        fonts.extend(self.PREMIUM_FONTS['hero'][:10])
        
        random.shuffle(fonts)
        return fonts
    
    def _get_balanced_body_fonts(self) -> List[str]:
        """Get balanced selection of body fonts"""
        fonts = []
        
        # Prioritize readability
        for category in ['sans', 'professional', 'tech']:
            if category in self.categories:
                category_fonts = [f['name'] for f in self.categories[category][:10]]
                fonts.extend(category_fonts)
        
        fonts.extend(self.PREMIUM_FONTS['body'][:10])
        
        random.shuffle(fonts)
        return fonts
    
    def _ensure_variety(self, fonts: List[str], font_type: str) -> List[str]:
        """Ensure we don't keep suggesting the same fonts"""
        # Move recently used fonts to the end
        if self.recent_selections:
            fonts_dedup = []
            fonts_recent = []
            
            for font in fonts:
                if font in self.recent_selections:
                    fonts_recent.append(font)
                else:
                    fonts_dedup.append(font)
            
            fonts = fonts_dedup + fonts_recent
        
        # Track selections (keep last 20)
        self.recent_selections.extend(fonts[:5])
        self.recent_selections = self.recent_selections[-20:]
        
        return fonts
    
    def _get_reasoning(self, is_professional: bool, is_creative: bool) -> str:
        """Get reasoning for font selection"""
        if is_professional:
            return "Selected clean, professional fonts with excellent readability for business context"
        elif is_creative:
            return "Selected expressive, creative fonts with personality for artistic context"
        else:
            return "Selected balanced, versatile fonts suitable for general presentations"
    
    def get_font_details(self, font_name: str) -> Optional[Dict]:
        """Get detailed information about a specific font"""
        for font_id, font_data in self.registry.items():
            if font_data.get('name') == font_name:
                return {
                    'id': font_id,
                    'name': font_name,
                    'files': font_data.get('files', []),
                    'description': font_data.get('description', ''),
                    'tags': font_data.get('tags', [])
                }
        return None