"""
ColorPaletteManager - Handles color extraction, normalization, and enhancement.

This class consolidates all color-related operations from SimpleDeckComposer:
- Extracting colors from various theme formats
- Normalizing color palettes to consistent structure
- Enhancing minimal brand palettes with AI
- Computing readable text colors
- Building the final palette for slide generation
"""

from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass

from setup_logging_optimized import get_logger

logger = get_logger(__name__)


@dataclass
class NormalizedPalette:
    """A normalized color palette with all required fields."""
    primary_background: str
    secondary_background: str
    primary_text: str
    accent_1: str
    accent_2: str
    colors: List[str]
    backgrounds: List[str]
    accents: List[str]
    text_colors: Dict[str, str]
    gradients: List[str]
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format."""
        return {
            'primary_background': self.primary_background,
            'secondary_background': self.secondary_background,
            'primary_text': self.primary_text,
            'accent_1': self.accent_1,
            'accent_2': self.accent_2,
            'colors': self.colors,
            'backgrounds': self.backgrounds,
            'accents': self.accents,
            'text_colors': self.text_colors,
            'gradients': self.gradients,
            'metadata': self.metadata,
        }


class ColorPaletteManager:
    """
    Manages color palette operations for deck generation.

    Responsibilities:
    - Extract colors from theme objects
    - Normalize palettes to consistent structure
    - Enhance minimal palettes with AI
    - Compute readable text colors
    - Build final palette for slides
    """

    # Default fallback colors
    DEFAULT_BACKGROUND = '#FFFFFF'
    DEFAULT_TEXT = '#1A1A1A'
    DEFAULT_ACCENT_1 = '#2563EB'  # Blue
    DEFAULT_ACCENT_2 = '#F59E0B'  # Amber

    def __init__(self):
        """Initialize ColorPaletteManager."""
        pass

    def extract_from_theme(self, theme) -> Dict[str, Any]:
        """
        Extract palette from a ThemeSpec or theme dict.

        Args:
            theme: ThemeSpec object or dict with color_palette

        Returns:
            Dict with extracted palette data
        """
        if not theme:
            return {}

        try:
            # Handle ThemeSpec objects
            if hasattr(theme, 'to_dict'):
                theme_dict = theme.to_dict()
            elif hasattr(theme, 'color_palette'):
                theme_dict = {'color_palette': theme.color_palette}
            elif isinstance(theme, dict):
                theme_dict = theme
            else:
                return {}

            palette = theme_dict.get('color_palette', {})
            if not isinstance(palette, dict):
                return {}

            return dict(palette)

        except Exception as e:
            logger.warning(f"[COLOR MANAGER] Error extracting palette: {e}")
            return {}

    def normalize(
        self,
        palette: Dict[str, Any],
        preserve_brand_colors: bool = True
    ) -> NormalizedPalette:
        """
        Normalize a palette to ensure all required fields are present.

        Args:
            palette: Raw palette dict
            preserve_brand_colors: If True, preserve all brand colors including white

        Returns:
            NormalizedPalette with all fields populated
        """
        # Extract existing values
        primary_bg = palette.get('primary_background') or palette.get('primary_bg')
        secondary_bg = palette.get('secondary_background') or palette.get('secondary_bg')
        primary_text = palette.get('primary_text')
        accent_1 = palette.get('accent_1')
        accent_2 = palette.get('accent_2')
        colors = palette.get('colors', [])
        backgrounds = palette.get('backgrounds', [])
        accents = palette.get('accents', [])
        text_colors = palette.get('text_colors', {})
        gradients = palette.get('gradients', [])
        metadata = palette.get('metadata', {})

        # Ensure we have lists
        if not isinstance(colors, list):
            colors = [colors] if colors else []
        if not isinstance(backgrounds, list):
            backgrounds = [backgrounds] if backgrounds else []
        if not isinstance(accents, list):
            accents = [accents] if accents else []
        if not isinstance(gradients, list):
            gradients = [gradients] if gradients else []

        # Apply defaults for missing required fields
        if not primary_bg:
            primary_bg = backgrounds[0] if backgrounds else self.DEFAULT_BACKGROUND
        if not secondary_bg:
            secondary_bg = backgrounds[1] if len(backgrounds) > 1 else self._darken_color(primary_bg, 0.05)
        if not accent_1:
            accent_1 = accents[0] if accents else (colors[0] if colors else self.DEFAULT_ACCENT_1)
        if not accent_2:
            accent_2 = accents[1] if len(accents) > 1 else (colors[1] if len(colors) > 1 else accent_1)

        # Compute text color if not provided
        if not primary_text:
            primary_text = self._compute_text_color(primary_bg)

        # Ensure text_colors dict
        if not isinstance(text_colors, dict):
            text_colors = {}
        if 'primary' not in text_colors:
            text_colors['primary'] = primary_text
        if 'heading' not in text_colors:
            text_colors['heading'] = primary_text
        if 'body' not in text_colors:
            text_colors['body'] = primary_text

        # Ensure backgrounds list includes primary
        if primary_bg and primary_bg not in backgrounds:
            backgrounds = [primary_bg] + backgrounds

        # Ensure accents list includes accent_1 and accent_2
        if accent_1 and accent_1 not in accents:
            accents = [accent_1] + accents
        if accent_2 and accent_2 not in accents and accent_2 != accent_1:
            accents = accents + [accent_2]

        # Build colors list if empty
        if not colors:
            colors = accents + backgrounds
            # Remove duplicates while preserving order
            seen = set()
            colors = [c for c in colors if c and not (c.lower() in seen or seen.add(c.lower()))]

        return NormalizedPalette(
            primary_background=primary_bg,
            secondary_background=secondary_bg,
            primary_text=primary_text,
            accent_1=accent_1,
            accent_2=accent_2,
            colors=colors,
            backgrounds=backgrounds,
            accents=accents,
            text_colors=text_colors,
            gradients=gradients,
            metadata=metadata,
        )

    async def enhance_minimal_palette(
        self,
        colors: List[str],
        context: str = ""
    ) -> List[str]:
        """
        Enhance a minimal brand palette (< 4 colors) using AI.

        Args:
            colors: Existing brand colors
            context: Context string (topic, brand name, etc.)

        Returns:
            Enhanced list of colors
        """
        if len(colors) >= 4:
            logger.info(f"[COLOR MANAGER] Palette has {len(colors)} colors - no enhancement needed")
            return colors

        try:
            from agents.tools.theme import enhance_minimal_brand_colors

            logger.info(f"[COLOR MANAGER] Enhancing {len(colors)} colors with AI...")
            enhanced = await enhance_minimal_brand_colors(colors, context)

            if enhanced and enhanced.get('generated_colors'):
                new_colors = enhanced['generated_colors']
                logger.info(f"[COLOR MANAGER] Enhanced to {len(new_colors)} colors")
                return new_colors

            return colors

        except Exception as e:
            logger.warning(f"[COLOR MANAGER] Enhancement failed: {e}")
            return colors

    def build_style_palette(
        self,
        normalized: NormalizedPalette,
        include_aliases: bool = True
    ) -> Dict[str, Any]:
        """
        Build the final palette dict for style manifesto.

        Args:
            normalized: NormalizedPalette object
            include_aliases: If True, include aliased keys for compatibility

        Returns:
            Dict suitable for style manifesto
        """
        palette = normalized.to_dict()

        if include_aliases:
            # Add aliased keys for compatibility with different consumers
            palette['primary_bg'] = palette['primary_background']
            palette['secondary_bg'] = palette['secondary_background']
            palette['accent1'] = palette['accent_1']
            palette['accent2'] = palette['accent_2']

        return palette

    def merge_user_colors(
        self,
        palette: Dict[str, Any],
        user_colors: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Merge user-selected colors into existing palette.

        Args:
            palette: Existing palette dict
            user_colors: User-selected colors (accent1, accent2, background, text)

        Returns:
            Updated palette dict
        """
        result = dict(palette)

        if user_colors.get('accent1'):
            result['accent_1'] = user_colors['accent1']
            if 'accents' in result and isinstance(result['accents'], list):
                result['accents'] = [user_colors['accent1']] + result['accents'][1:]

        if user_colors.get('accent2'):
            result['accent_2'] = user_colors['accent2']
            if 'accents' in result and isinstance(result['accents'], list) and len(result['accents']) > 1:
                result['accents'][1] = user_colors['accent2']

        if user_colors.get('background'):
            result['primary_background'] = user_colors['background']
            if 'backgrounds' in result and isinstance(result['backgrounds'], list):
                result['backgrounds'] = [user_colors['background']] + result['backgrounds'][1:]

        if user_colors.get('text'):
            result['primary_text'] = user_colors['text']
            if 'text_colors' in result and isinstance(result['text_colors'], dict):
                result['text_colors']['primary'] = user_colors['text']

        # Update colors list
        if user_colors.get('accent1') or user_colors.get('accent2'):
            colors = []
            if user_colors.get('accent1'):
                colors.append(user_colors['accent1'])
            if user_colors.get('accent2'):
                colors.append(user_colors['accent2'])
            result['colors'] = colors

        return result

    def _compute_text_color(self, background: str) -> str:
        """Compute readable text color for a background."""
        try:
            luminance = self._get_luminance(background)
            return '#FFFFFF' if luminance < 0.5 else '#1A1A1A'
        except Exception:
            return self.DEFAULT_TEXT

    def _get_luminance(self, hex_color: str) -> float:
        """Calculate relative luminance of a hex color."""
        try:
            hex_color = hex_color.lstrip('#')
            if len(hex_color) == 3:
                hex_color = ''.join(c * 2 for c in hex_color)

            r = int(hex_color[0:2], 16) / 255.0
            g = int(hex_color[2:4], 16) / 255.0
            b = int(hex_color[4:6], 16) / 255.0

            # Apply gamma correction
            r = r / 12.92 if r <= 0.03928 else ((r + 0.055) / 1.055) ** 2.4
            g = g / 12.92 if g <= 0.03928 else ((g + 0.055) / 1.055) ** 2.4
            b = b / 12.92 if b <= 0.03928 else ((b + 0.055) / 1.055) ** 2.4

            return 0.2126 * r + 0.7152 * g + 0.0722 * b

        except Exception:
            return 0.5

    def _darken_color(self, hex_color: str, factor: float = 0.1) -> str:
        """Darken a hex color by a factor."""
        try:
            hex_color = hex_color.lstrip('#')
            if len(hex_color) == 3:
                hex_color = ''.join(c * 2 for c in hex_color)

            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)

            r = max(0, int(r * (1 - factor)))
            g = max(0, int(g * (1 - factor)))
            b = max(0, int(b * (1 - factor)))

            return f'#{r:02x}{g:02x}{b:02x}'

        except Exception:
            return hex_color

    def _lighten_color(self, hex_color: str, factor: float = 0.1) -> str:
        """Lighten a hex color by a factor."""
        try:
            hex_color = hex_color.lstrip('#')
            if len(hex_color) == 3:
                hex_color = ''.join(c * 2 for c in hex_color)

            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)

            r = min(255, int(r + (255 - r) * factor))
            g = min(255, int(g + (255 - g) * factor))
            b = min(255, int(b + (255 - b) * factor))

            return f'#{r:02x}{g:02x}{b:02x}'

        except Exception:
            return hex_color
