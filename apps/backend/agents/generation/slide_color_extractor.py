"""
Extracts color preferences from slide content to pass to AI model for color generation.
No hardcoded colors - let the AI model handle color selection.
"""

from typing import Dict, Any, List, Optional
import re
import logging

logger = logging.getLogger(__name__)

class SlideColorExtractor:
    """Extracts color requests from slide content for AI model to process."""
    
    def __init__(self):
        # Define color-related keywords to detect (no hardcoded colors)
        self.color_keywords = {
            'intensity': {
                'vibrant': ['colorful', 'vibrant', 'bright', 'vivid', 'bold', 'lively', 'energetic'],
                'muted': ['subtle', 'muted', 'soft', 'pastel', 'light', 'gentle', 'calm'],
                'dark': ['dark', 'moody', 'dramatic', 'noir', 'shadowy', 'deep'],
                'neon': ['neon', 'electric', 'fluorescent', 'glowing'],
            },
            'color_names': [
                'blue', 'azure', 'navy', 'cobalt', 'cerulean', 'sapphire', 'ocean', 'sky',
                'red', 'crimson', 'scarlet', 'burgundy', 'ruby', 'cherry', 'rose',
                'green', 'emerald', 'forest', 'lime', 'mint', 'jade', 'olive',
                'purple', 'violet', 'magenta', 'lavender', 'plum', 'indigo',
                'orange', 'amber', 'tangerine', 'coral', 'peach', 'apricot',
                'yellow', 'gold', 'golden', 'lemon', 'sunshine', 'mustard',
                'pink', 'fuchsia', 'salmon', 'blush',
                'brown', 'chocolate', 'coffee', 'tan', 'beige', 'sepia',
                'gray', 'grey', 'silver', 'charcoal', 'slate',
                'black', 'ebony', 'onyx', 'jet',
                'white', 'ivory', 'pearl', 'snow', 'cream'
            ],
            'themes': [
                'rainbow', 'multicolor', 'spectrum', 'pride',
                'monochrome', 'grayscale',
                'earth tones', 'earthy', 'natural', 'organic',
                'ocean', 'marine', 'aquatic', 'nautical', 'sea',
                'sunset', 'sunrise', 'dusk', 'dawn',
                'forest', 'woodland', 'jungle', 'nature',
                'fire', 'flame', 'hot', 'burning', 'fiery',
                'ice', 'frost', 'frozen', 'arctic', 'cool'
            ]
        }
    
    def extract_color_preferences(self, content: str, title: str = "") -> Dict[str, Any]:
        """
        Extract color preferences from slide content.
        Returns keywords for the AI model to interpret.
        
        Args:
            content: Slide content text
            title: Slide title (optional)
            
        Returns:
            Dictionary with detected color-related keywords
        """
        combined_text = f"{title} {content}".lower()
        
        results = {
            'has_color_request': False,
            'intensity': None,
            'requested_colors': [],
            'theme': None,
            'color_instruction': None
        }
        
        # Check for intensity keywords
        for intensity, keywords in self.color_keywords['intensity'].items():
            if any(kw in combined_text for kw in keywords):
                results['intensity'] = intensity
                results['has_color_request'] = True
                logger.info(f"[COLOR EXTRACTOR] Found intensity: {intensity}")
                break
        
        # Check for specific color mentions
        mentioned_colors = []
        for color in self.color_keywords['color_names']:
            if color in combined_text:
                mentioned_colors.append(color)
                results['has_color_request'] = True
        
        if mentioned_colors:
            results['requested_colors'] = list(set(mentioned_colors))  # Remove duplicates
            logger.info(f"[COLOR EXTRACTOR] Found colors: {results['requested_colors']}")
        
        # Check for theme keywords
        for theme in self.color_keywords['themes']:
            if theme in combined_text:
                results['theme'] = theme
                results['has_color_request'] = True
                logger.info(f"[COLOR EXTRACTOR] Found theme: {theme}")
                break
        
        # Build instruction for AI model if color requests found
        if results['has_color_request']:
            instruction_parts = []
            
            if results['intensity']:
                instruction_parts.append(f"Use {results['intensity']} colors")
            
            if results['requested_colors']:
                colors_str = ' and '.join(results['requested_colors'][:3])  # Max 3 colors
                instruction_parts.append(f"Include {colors_str} colors")
            
            if results['theme']:
                instruction_parts.append(f"Apply {results['theme']} theme")
            
            results['color_instruction'] = '. '.join(instruction_parts)
            logger.info(f"[COLOR EXTRACTOR] Generated instruction: {results['color_instruction']}")
        
        return results
    
    def should_override_palette(self, color_prefs: Dict) -> bool:
        """
        Determine if the slide needs a different palette than the deck default.
        
        Args:
            color_prefs: Color preferences dictionary
            
        Returns:
            True if palette should be overridden
        """
        # Override if specific colors or themes are requested
        return (color_prefs['has_color_request'] and 
                (color_prefs['requested_colors'] or color_prefs['theme']))
    
    def get_palette_search_query(self, color_prefs: Dict) -> Optional[str]:
        """
        Generate a search query for finding matching palettes.
        
        Args:
            color_prefs: Color preferences dictionary
            
        Returns:
            Search query string or None
        """
        if not color_prefs['has_color_request']:
            return None
        
        query_parts = []
        
        if color_prefs['intensity']:
            query_parts.append(color_prefs['intensity'])
        
        if color_prefs['theme']:
            query_parts.append(color_prefs['theme'])
        elif color_prefs['requested_colors']:
            # Add up to 2 colors to search
            query_parts.extend(color_prefs['requested_colors'][:2])
        
        if query_parts:
            return ' '.join(query_parts)
        
        return None