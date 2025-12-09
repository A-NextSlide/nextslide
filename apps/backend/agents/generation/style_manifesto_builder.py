"""
StyleManifestoBuilder - Creates style manifestos for slide generation.

This class extracts the style manifesto creation logic from SimpleDeckComposer.
A style manifesto is a unified palette + design tokens string that gets passed
to the slide generation prompts.
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass

from agents.domain.models import ThemeSpec
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


@dataclass
class DesignTokens:
    """Design tokens for visual styling."""
    corner_radius: str = "8px"
    shadow_style: str = "soft"
    spacing_scale: str = "comfortable"
    animation_style: str = "subtle"

    def to_dict(self) -> Dict[str, str]:
        return {
            'corner_radius': self.corner_radius,
            'shadow_style': self.shadow_style,
            'spacing_scale': self.spacing_scale,
            'animation_style': self.animation_style,
        }


class StyleManifestoBuilder:
    """
    Builds style manifestos for slide generation.

    A style manifesto combines:
    - Color palette (with aliased keys for compatibility)
    - Typography information
    - Design tokens
    - Visual style hints

    The manifesto is passed to AI slide generation prompts.
    """

    def __init__(self):
        pass

    def build(
        self,
        theme: Optional[ThemeSpec],
        palette: Dict[str, Any],
        design_tokens: Optional[DesignTokens] = None
    ) -> str:
        """
        Build a style manifesto string.

        Args:
            theme: ThemeSpec object with full theme data
            palette: Normalized palette dict
            design_tokens: Optional design tokens

        Returns:
            Style manifesto string for prompts
        """
        if design_tokens is None:
            design_tokens = DesignTokens()

        # Build unified palette with aliased keys
        unified_palette = self._build_unified_palette(palette)

        # Extract typography
        typography = self._extract_typography(theme)

        # Build manifesto sections
        sections = []

        # Color section
        sections.append("## Colors")
        sections.append(f"Primary Background: {unified_palette.get('primary_background', '#FFFFFF')}")
        sections.append(f"Primary Text: {unified_palette.get('primary_text', '#1A1A1A')}")
        sections.append(f"Accent 1: {unified_palette.get('accent_1', '#2563EB')}")
        sections.append(f"Accent 2: {unified_palette.get('accent_2', '#F59E0B')}")

        if unified_palette.get('gradients'):
            sections.append(f"Gradients: {', '.join(unified_palette['gradients'][:2])}")

        # Typography section
        sections.append("\n## Typography")
        sections.append(f"Hero Font: {typography.get('hero', 'Inter')}")
        sections.append(f"Body Font: {typography.get('body', 'Inter')}")

        # Design tokens section
        sections.append("\n## Design Tokens")
        sections.append(f"Corner Radius: {design_tokens.corner_radius}")
        sections.append(f"Shadow Style: {design_tokens.shadow_style}")
        sections.append(f"Spacing: {design_tokens.spacing_scale}")

        # Visual style hint
        if theme and hasattr(theme, 'design_style') and theme.design_style:
            sections.append(f"\n## Visual Style\n{theme.design_style[:200]}")

        return "\n".join(sections)

    def build_palette_dict(
        self,
        theme: Optional[ThemeSpec],
        palette: Dict[str, Any],
        include_metadata: bool = True
    ) -> Dict[str, Any]:
        """
        Build a complete palette dict for DeckState.

        This creates the palette that gets stored in deck.data.style_spec.palette
        and passed to slide generation.

        Args:
            theme: ThemeSpec object
            palette: Normalized palette dict
            include_metadata: Whether to include metadata like logo_url

        Returns:
            Complete palette dict
        """
        result = self._build_unified_palette(palette)

        # Add typography from theme
        if theme:
            typography = self._extract_typography(theme)
            result['fonts'] = [typography.get('hero', 'Inter'), typography.get('body', 'Inter')]

            # Add logo URL if present
            if include_metadata:
                logo_url = self._extract_logo_url(theme)
                if logo_url:
                    if 'metadata' not in result:
                        result['metadata'] = {}
                    result['metadata']['logo_url'] = logo_url

        return result

    def _build_unified_palette(self, palette: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build palette with aliased keys for compatibility.

        Different parts of the system expect different key names:
        - primary_background vs primary_bg
        - accent_1 vs accent1
        etc.

        This creates a palette with both versions.
        """
        result = dict(palette)

        # Primary keys
        primary_bg = palette.get('primary_background') or palette.get('primary_bg')
        if primary_bg:
            result['primary_background'] = primary_bg
            result['primary_bg'] = primary_bg

        secondary_bg = palette.get('secondary_background') or palette.get('secondary_bg')
        if secondary_bg:
            result['secondary_background'] = secondary_bg
            result['secondary_bg'] = secondary_bg

        primary_text = palette.get('primary_text')
        if primary_text:
            result['primary_text'] = primary_text

        # Accent keys
        accent_1 = palette.get('accent_1') or palette.get('accent1')
        if accent_1:
            result['accent_1'] = accent_1
            result['accent1'] = accent_1

        accent_2 = palette.get('accent_2') or palette.get('accent2')
        if accent_2:
            result['accent_2'] = accent_2
            result['accent2'] = accent_2

        return result

    def _extract_typography(self, theme: Optional[ThemeSpec]) -> Dict[str, str]:
        """Extract typography info from theme."""
        if not theme:
            return {'hero': 'Inter', 'body': 'Inter'}

        try:
            if hasattr(theme, 'typography') and theme.typography:
                typo = theme.typography
                if isinstance(typo, dict):
                    hero = typo.get('hero_title', {}).get('family', 'Inter')
                    body = typo.get('body_text', {}).get('family', 'Inter')
                    return {'hero': hero, 'body': body}

            # Try to_dict if available
            if hasattr(theme, 'to_dict'):
                theme_dict = theme.to_dict()
                typo = theme_dict.get('typography', {})
                hero = typo.get('hero_title', {}).get('family', 'Inter')
                body = typo.get('body_text', {}).get('family', 'Inter')
                return {'hero': hero, 'body': body}

        except Exception as e:
            logger.warning(f"[MANIFESTO BUILDER] Error extracting typography: {e}")

        return {'hero': 'Inter', 'body': 'Inter'}

    def _extract_logo_url(self, theme: Optional[ThemeSpec]) -> Optional[str]:
        """Extract logo URL from theme."""
        if not theme:
            return None

        try:
            # Check brandInfo
            if hasattr(theme, 'brandInfo') and theme.brandInfo:
                logo = theme.brandInfo.get('logoUrl') or theme.brandInfo.get('logo_url')
                if logo:
                    return logo

            # Check color_palette metadata
            if hasattr(theme, 'color_palette') and isinstance(theme.color_palette, dict):
                metadata = theme.color_palette.get('metadata', {})
                if metadata.get('logo_url'):
                    return metadata['logo_url']

            # Try to_dict
            if hasattr(theme, 'to_dict'):
                theme_dict = theme.to_dict()

                brand_info = theme_dict.get('brandInfo', {})
                if brand_info.get('logoUrl') or brand_info.get('logo_url'):
                    return brand_info.get('logoUrl') or brand_info.get('logo_url')

                cp_metadata = theme_dict.get('color_palette', {}).get('metadata', {})
                if cp_metadata.get('logo_url'):
                    return cp_metadata['logo_url']

        except Exception as e:
            logger.warning(f"[MANIFESTO BUILDER] Error extracting logo URL: {e}")

        return None

    def create_design_tokens_from_theme(self, theme: Optional[ThemeSpec]) -> DesignTokens:
        """
        Create design tokens based on theme style.

        Args:
            theme: ThemeSpec object

        Returns:
            DesignTokens appropriate for the theme
        """
        # Default tokens
        tokens = DesignTokens()

        if not theme:
            return tokens

        try:
            # Check visual_style for hints
            visual_style = None
            if hasattr(theme, 'visual_style'):
                visual_style = theme.visual_style
            elif hasattr(theme, 'to_dict'):
                visual_style = theme.to_dict().get('visual_style', {})

            if visual_style:
                style_keywords = visual_style.get('style_keywords', [])

                # Adjust tokens based on style keywords
                if any(kw in style_keywords for kw in ['modern', 'minimal', 'clean']):
                    tokens.corner_radius = "12px"
                    tokens.shadow_style = "minimal"

                if any(kw in style_keywords for kw in ['playful', 'fun', 'vibrant']):
                    tokens.corner_radius = "16px"
                    tokens.animation_style = "energetic"

                if any(kw in style_keywords for kw in ['corporate', 'professional', 'business']):
                    tokens.corner_radius = "4px"
                    tokens.shadow_style = "subtle"
                    tokens.spacing_scale = "standard"

        except Exception as e:
            logger.warning(f"[MANIFESTO BUILDER] Error creating design tokens: {e}")

        return tokens
