"""
Fast theme style manager that skips AI calls when possible.
"""
from typing import Dict, Any, List, Optional
from models.requests import DeckOutline
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class FastThemeStyleManager:
    """Optimized theme manager that uses provided colors/fonts when available."""
    
    # Default professional fonts (nicer defaults, avoid Inter)
    DEFAULT_FONTS = {
        "hero_title": {"family": "Montserrat", "weight": "800"},
        "section_title": {"family": "Poppins", "weight": "700"},
        "body_text": {"family": "Poppins", "weight": "500"},
        "caption": {"family": "Poppins", "weight": "400"},
        "data_label": {"family": "Poppins", "weight": "500"}
    }
    
    # Default color palettes by style
    DEFAULT_PALETTES = {
        "modern": {
            "primary_background": "#0A0E27",
            "secondary_background": "#1A1F3A", 
            "primary_text": "#FFFFFF",
            "secondary_text": "#E0E0E0",
            "accent_1": "#00F0FF",
            "accent_2": "#FF5722",
            "accent_3": "#FFEB3B",
            "shape_color": "#00F0FF20"
        },
        "vibrant": {
            "primary_background": "#0A0A0A",
            "secondary_background": "#1A0033",
            "primary_text": "#FFFFFF",
            "secondary_text": "#E0E0E0",
            "accent_1": "#39FF14",
            "accent_2": "#FF00FF",
            "accent_3": "#00FFFF",
            "shape_color": "#39FF1420"
        },
        "professional": {
            "primary_background": "#FFFFFF",
            "secondary_background": "#F5F5F5",
            "primary_text": "#1F2937",
            "secondary_text": "#6B7280",
            "accent_1": "#2563EB",
            "accent_2": "#7C3AED",
            "accent_3": "#F59E0B",
            "shape_color": "#2563EB20"
        }
    }
    
    def __init__(self, theme_style_manager=None):
        """Initialize with optional fallback to original manager."""
        self.original_manager = theme_style_manager
        
    async def analyze_theme_and_style(self, deck_outline: DeckOutline, progress_callback=None) -> Dict[str, Any]:
        """Fast theme analysis - skip AI when possible."""
        logger.info("[FAST THEME] Starting optimized theme generation")
        
        # Extract style preferences
        style_prefs = getattr(deck_outline, 'stylePreferences', {})
        if hasattr(style_prefs, 'model_dump'):
            style_prefs = style_prefs.model_dump()
        elif not isinstance(style_prefs, dict):
            style_prefs = {}
            
        visual_style = style_prefs.get('visualStyle', 'modern')
        color_scheme = style_prefs.get('colorScheme', 'vibrant')
        specific_colors = style_prefs.get('specificColors', [])
        vibe_context = style_prefs.get('vibeContext', '')
        
        # Fast path: Use provided colors
        if specific_colors and len(specific_colors) >= 2:
            logger.info(f"[FAST THEME] Using provided colors: {specific_colors}")
            theme = self._create_theme_from_colors(
                specific_colors, 
                visual_style,
                vibe_context,
                deck_outline.title
            )
            return {
                'theme': theme,
                'search_terms': self._extract_search_terms(deck_outline)
            }
            
        # Fast path: Use default palette for known styles
        if visual_style in self.DEFAULT_PALETTES:
            logger.info(f"[FAST THEME] Using default palette for style: {visual_style}")
            theme = self._create_theme_from_defaults(
                visual_style,
                vibe_context,
                deck_outline.title
            )
            return {
                'theme': theme,
                'search_terms': self._extract_search_terms(deck_outline)
            }
            
        # Fallback to original manager if needed
        if self.original_manager:
            logger.info("[FAST THEME] Falling back to original theme manager")
            return await self.original_manager.analyze_theme_and_style(deck_outline, progress_callback)
            
        # Final fallback
        logger.info("[FAST THEME] Using modern default theme")
        return {
            'theme': self._create_theme_from_defaults('modern', vibe_context, deck_outline.title),
            'search_terms': self._extract_search_terms(deck_outline)
        }
        
    def _create_theme_from_colors(self, colors: List[str], visual_style: str, vibe: str, title: str) -> Dict[str, Any]:
        """Create theme from provided colors."""
        # Use first color as primary, second as accent
        primary_color = colors[0] if colors else "#2563EB"
        accent_color = colors[1] if len(colors) > 1 else "#7C3AED"
        accent_2 = colors[2] if len(colors) > 2 else "#F59E0B"
        
        # Determine if dark or light theme based on primary color
        is_dark = self._is_dark_color(primary_color)
        
        return {
            "theme_name": f"Custom {visual_style.title()}",
            "visual_style": {
                "background_style": "gradient" if is_dark else "solid",
                "image_effects": ["ken-burns"] if visual_style == "modern" else [],
                "transition_style": "smooth"
            },
            "color_palette": {
                "primary": primary_color,
                "secondary": accent_color,
                "accent": accent_2,
                "background": "#0A0E27" if is_dark else "#FFFFFF",
                "text": "#FFFFFF" if is_dark else "#1F2937",
                "primary_background": "#0A0E27" if is_dark else "#FFFFFF",
                "secondary_background": "#1A1F3A" if is_dark else "#F5F5F5",
                "primary_text": "#FFFFFF" if is_dark else "#1F2937",
                "secondary_text": "#E0E0E0" if is_dark else "#6B7280",
                "accent_1": primary_color,
                "accent_2": accent_color,
                "accent_3": accent_2,
                "shape_color": f"{primary_color}20"
            },
            "typography": self.DEFAULT_FONTS,
            "component_styles": {
                "emphasis": "modern" if visual_style == "modern" else "classic",
                "spacing": "comfortable",
                "roundness": "medium"
            }
        }
        
    def _create_theme_from_defaults(self, visual_style: str, vibe: str, title: str) -> Dict[str, Any]:
        """Create theme from default palettes."""
        palette = self.DEFAULT_PALETTES.get(visual_style, self.DEFAULT_PALETTES["modern"])
        
        return {
            "theme_name": f"{visual_style.title()} Theme",
            "visual_style": {
                "background_style": "gradient" if visual_style != "professional" else "solid",
                "image_effects": ["ken-burns"] if visual_style == "modern" else [],
                "transition_style": "smooth"
            },
            "color_palette": palette,
            "typography": self.DEFAULT_FONTS,
            "component_styles": {
                "emphasis": visual_style,
                "spacing": "comfortable",
                "roundness": "medium" if visual_style == "modern" else "subtle"
            }
        }
        
    def _is_dark_color(self, hex_color: str) -> bool:
        """Check if a color is dark based on luminance."""
        try:
            # Remove # if present
            hex_color = hex_color.lstrip('#')
            # Convert to RGB
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16) 
            b = int(hex_color[4:6], 16)
            # Calculate luminance
            luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            return luminance < 0.5
        except:
            return True  # Default to dark
            
    def _extract_search_terms(self, deck_outline: DeckOutline) -> List[str]:
        """Extract search terms from deck content."""
        terms = []
        
        # Extract from title
        title_words = deck_outline.title.lower().split()
        important_words = [w for w in title_words if len(w) > 3 and w not in ['with', 'from', 'about', 'this', 'that', 'your']]
        terms.extend(important_words[:2])
        
        # Extract from vibe context if available
        style_prefs = getattr(deck_outline, 'stylePreferences', {})
        if hasattr(style_prefs, 'model_dump'):
            style_prefs = style_prefs.model_dump()
        vibe = style_prefs.get('vibeContext', '') if isinstance(style_prefs, dict) else ''
        
        if vibe:
            vibe_words = vibe.lower().split()
            vibe_important = [w for w in vibe_words if len(w) > 4 and w not in ['with', 'from', 'about', 'this', 'that', 'your', 'presentation']]
            terms.extend(vibe_important[:1])
            
        # Limit to 3 terms
        return list(dict.fromkeys(terms))[:3]  # Remove duplicates and limit
        
    async def generate_palette(self, deck_outline: DeckOutline, theme: Dict[str, Any]) -> Dict[str, Any]:
        """Generate palette - just extract from theme."""
        if isinstance(theme, dict) and 'color_palette' in theme:
            palette = theme['color_palette']
            # Return simplified palette
            return {
                "primary": palette.get("accent_1", "#2563EB"),
                "secondary": palette.get("accent_2", "#7C3AED"),
                "accent": palette.get("accent_3", "#F59E0B"),
                "background": palette.get("primary_background", "#FFFFFF"),
                "text": palette.get("primary_text", "#1F2937")
            }
            
        # Fallback
        return {
            "primary": "#2563EB",
            "secondary": "#7C3AED", 
            "accent": "#F59E0B",
            "background": "#FFFFFF",
            "text": "#1F2937"
        }
        
    def create_style_manifesto(self, style_spec: Dict[str, Any]) -> str:
        """Create a concise style manifesto."""
        theme = style_spec.get('theme', {})
        palette = style_spec.get('palette', {})
        
        return f"""Theme: {theme.get('theme_name', 'Modern')}
Primary: {palette.get('primary', '#2563EB')}
Secondary: {palette.get('secondary', '#7C3AED')}
Background: {palette.get('background', '#FFFFFF')}"""
