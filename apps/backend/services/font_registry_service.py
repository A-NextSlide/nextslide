"""
Font Registry Service for managing custom and web fonts.
Tracks available fonts and their sources for dynamic loading.
"""

from typing import Dict, List, Optional, Set
from dataclasses import dataclass
from enum import Enum
import json
import logging

logger = logging.getLogger(__name__)


class FontSource(Enum):
    """Font source types."""
    SYSTEM = "system"  # System-installed font
    GOOGLE = "google"  # Google Fonts
    CUSTOM = "custom"  # Custom uploaded font
    WEB = "web"  # Generic web font URL


@dataclass
class FontInfo:
    """Information about a registered font."""
    family: str
    source: FontSource
    variants: List[str]  # e.g., ["regular", "bold", "italic"]
    url: Optional[str] = None  # For web fonts
    path: Optional[str] = None  # For local fonts
    fallback: Optional[str] = None  # Fallback font family
    category: Optional[str] = None  # serif, sans-serif, monospace, display


class FontRegistryService:
    """Manages font registration and availability."""

    # Popular Google Fonts with their categories
    GOOGLE_FONTS = {
        # Sans-serif
        "Inter": {"category": "sans-serif", "variants": ["300", "400", "500", "600", "700"]},
        "Roboto": {"category": "sans-serif", "variants": ["300", "400", "500", "700", "900"]},
        "Open Sans": {"category": "sans-serif", "variants": ["300", "400", "600", "700", "800"]},
        "Lato": {"category": "sans-serif", "variants": ["300", "400", "700", "900"]},
        "Montserrat": {"category": "sans-serif", "variants": ["300", "400", "500", "600", "700", "800", "900"]},
        "Poppins": {"category": "sans-serif", "variants": ["300", "400", "500", "600", "700", "800", "900"]},
        "Source Sans Pro": {"category": "sans-serif", "variants": ["300", "400", "600", "700", "900"]},
        "Raleway": {"category": "sans-serif", "variants": ["300", "400", "500", "600", "700", "800", "900"]},
        "Work Sans": {"category": "sans-serif", "variants": ["300", "400", "500", "600", "700", "800", "900"]},
        "Nunito": {"category": "sans-serif", "variants": ["300", "400", "600", "700", "800", "900"]},

        # Serif
        "Playfair Display": {"category": "serif", "variants": ["400", "700", "900"]},
        "Merriweather": {"category": "serif", "variants": ["300", "400", "700", "900"]},
        "Lora": {"category": "serif", "variants": ["400", "500", "600", "700"]},
        "PT Serif": {"category": "serif", "variants": ["400", "700"]},
        "Crimson Text": {"category": "serif", "variants": ["400", "600", "700"]},
        "Libre Baskerville": {"category": "serif", "variants": ["400", "700"]},
        "Cormorant": {"category": "serif", "variants": ["300", "400", "500", "600", "700"]},

        # Display
        "Bebas Neue": {"category": "display", "variants": ["400"]},
        "Righteous": {"category": "display", "variants": ["400"]},
        "Abril Fatface": {"category": "display", "variants": ["400"]},
        "Fredoka One": {"category": "display", "variants": ["400"]},

        # Monospace
        "Roboto Mono": {"category": "monospace", "variants": ["300", "400", "500", "600", "700"]},
        "Source Code Pro": {"category": "monospace", "variants": ["300", "400", "500", "600", "700", "900"]},
        "JetBrains Mono": {"category": "monospace", "variants": ["400", "500", "600", "700", "800"]},
    }

    # System fonts available on most platforms
    SYSTEM_FONTS = {
        "Arial": {"category": "sans-serif", "variants": ["regular", "bold"]},
        "Helvetica": {"category": "sans-serif", "variants": ["regular", "bold"]},
        "Times New Roman": {"category": "serif", "variants": ["regular", "bold", "italic"]},
        "Georgia": {"category": "serif", "variants": ["regular", "bold"]},
        "Courier New": {"category": "monospace", "variants": ["regular", "bold"]},
        "Verdana": {"category": "sans-serif", "variants": ["regular", "bold"]},
        "Trebuchet MS": {"category": "sans-serif", "variants": ["regular", "bold"]},
        "Impact": {"category": "display", "variants": ["regular"]},
    }

    def __init__(self):
        self.registry: Dict[str, FontInfo] = {}
        self._initialize_registry()

    def _initialize_registry(self):
        """Initialize font registry with known fonts."""
        # Register Google Fonts
        for family, info in self.GOOGLE_FONTS.items():
            self.register_font(FontInfo(
                family=family,
                source=FontSource.GOOGLE,
                variants=info["variants"],
                category=info["category"],
                url=self._get_google_font_url(family),
                fallback=self._get_fallback_for_category(info["category"])
            ))

        # Register system fonts
        for family, info in self.SYSTEM_FONTS.items():
            self.register_font(FontInfo(
                family=family,
                source=FontSource.SYSTEM,
                variants=info["variants"],
                category=info["category"],
                fallback=self._get_fallback_for_category(info["category"])
            ))

    def register_font(self, font_info: FontInfo):
        """Register a font in the registry."""
        self.registry[font_info.family] = font_info
        logger.debug(f"Registered font: {font_info.family} ({font_info.source.value})")

    def get_font_info(self, font_family: str) -> Optional[FontInfo]:
        """Get font information if registered."""
        return self.registry.get(font_family)

    def is_font_available(self, font_family: str) -> bool:
        """Check if a font is available."""
        return font_family in self.registry

    def get_fonts_by_category(self, category: str) -> List[FontInfo]:
        """Get all fonts in a category."""
        return [
            font for font in self.registry.values()
            if font.category == category
        ]

    def get_safe_font_stack(self, font_family: str) -> List[str]:
        """
        Get a safe font stack for CSS fallback.

        Returns:
            List of fonts from specific to generic
        """
        stack = [font_family]

        # Add the specific fallback if registered
        font_info = self.get_font_info(font_family)
        if font_info and font_info.fallback:
            stack.append(font_info.fallback)

        # Add category fallback
        if font_info and font_info.category:
            if font_info.category == "serif":
                stack.extend(["Georgia", "Times New Roman", "serif"])
            elif font_info.category == "monospace":
                stack.extend(["Courier New", "monospace"])
            elif font_info.category == "display":
                stack.extend(["Impact", "Arial Black", "sans-serif"])
            else:  # sans-serif or default
                stack.extend(["Helvetica", "Arial", "sans-serif"])
        else:
            # Default fallback
            stack.extend(["Inter", "Helvetica", "Arial", "sans-serif"])

        # Remove duplicates while preserving order
        seen = set()
        return [x for x in stack if not (x in seen or seen.add(x))]

    def _get_google_font_url(self, family: str) -> str:
        """Generate Google Fonts URL for a font family."""
        # Format family name for URL
        url_family = family.replace(" ", "+")
        return f"https://fonts.googleapis.com/css2?family={url_family}:wght@400;700&display=swap"

    def _get_fallback_for_category(self, category: str) -> str:
        """Get appropriate fallback font for a category."""
        fallbacks = {
            "serif": "Georgia",
            "sans-serif": "Arial",
            "monospace": "Courier New",
            "display": "Arial Black"
        }
        return fallbacks.get(category, "Arial")

    def suggest_similar_fonts(self, font_family: str, max_suggestions: int = 5) -> List[str]:
        """
        Suggest similar fonts when requested font is not available.

        Args:
            font_family: Requested font that's not available
            max_suggestions: Maximum number of suggestions

        Returns:
            List of similar font families
        """
        suggestions = []

        # Try to determine category from font name
        family_lower = font_family.lower()
        guessed_category = None

        if any(serif in family_lower for serif in ['serif', 'times', 'book', 'antiqua']):
            guessed_category = "serif"
        elif any(mono in family_lower for mono in ['mono', 'code', 'courier', 'console']):
            guessed_category = "monospace"
        elif any(display in family_lower for display in ['display', 'headline', 'title']):
            guessed_category = "display"
        else:
            guessed_category = "sans-serif"

        # Get fonts from the same category
        category_fonts = self.get_fonts_by_category(guessed_category)

        # Prioritize Google Fonts for better availability
        google_fonts = [f for f in category_fonts if f.source == FontSource.GOOGLE]
        system_fonts = [f for f in category_fonts if f.source == FontSource.SYSTEM]

        # Add suggestions
        for font in google_fonts[:max_suggestions]:
            suggestions.append(font.family)

        # Fill with system fonts if needed
        remaining = max_suggestions - len(suggestions)
        for font in system_fonts[:remaining]:
            if font.family not in suggestions:
                suggestions.append(font.family)

        # If still not enough, add popular defaults
        if len(suggestions) < max_suggestions:
            defaults = ["Inter", "Roboto", "Open Sans", "Helvetica", "Arial"]
            for default in defaults:
                if default not in suggestions:
                    suggestions.append(default)
                    if len(suggestions) >= max_suggestions:
                        break

        return suggestions[:max_suggestions]

    def export_registry(self) -> Dict:
        """Export registry as JSON-serializable dict."""
        return {
            family: {
                "source": info.source.value,
                "variants": info.variants,
                "category": info.category,
                "url": info.url,
                "fallback": info.fallback
            }
            for family, info in self.registry.items()
        }


# Singleton instance
font_registry = FontRegistryService()