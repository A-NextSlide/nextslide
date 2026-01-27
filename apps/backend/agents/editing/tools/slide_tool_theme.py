"""Theme application for custom components."""

from typing import Any, Dict, List, Tuple, Union
import logging

from models.deck import DeckDiff, DeckDiffBase
from models.component import ComponentDiffBase
from models.registry import ComponentRegistry
from agents.editing.tools.struct_utils import get_attr as _get_attr

logger = logging.getLogger(__name__)


# Return type that includes both DeckDiff and optional theme_updates
class ThemeUpdateResult:
    """Result from apply_theme_to_custom_components containing DeckDiff and theme_updates."""
    def __init__(self, deck_diff: DeckDiff, theme_updates: Dict[str, Any] = None):
        self.deck_diff = deck_diff
        self.theme_updates = theme_updates or {}


def apply_theme_to_custom_components(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> Union[DeckDiff, ThemeUpdateResult]:
    """
    Apply theme colors and fonts to ALL CustomComponents in the deck.

    This is a "hotswap" operation that:
    1. Updates CSS custom properties and font-family declarations in CustomComponent HTML
    2. Returns theme_updates to update the deck's theme settings (for frontend to apply)

    Args in dict:
        colors: Optional dict with color values (accent_1, primary_text, etc.)
        typography: Optional dict with font info (heading, body)

    If not provided, uses deck's existing theme.

    Returns:
        ThemeUpdateResult containing:
        - deck_diff: Updates to apply to slides/components
        - theme_updates: Updates to apply to deck theme (typography, colors)
    """
    from agents.editing.tools.html_utils import (
        apply_theme_to_custom_component_html,
        strip_frontend_editing_scripts
    )
    from models.slide import SlideDiffBase

    # Get theme from args or deck
    colors = args.get("colors")
    typography = args.get("typography")

    # Validate typography is a dict (LLM sometimes passes list like ['header', 'body'])
    if typography and not isinstance(typography, dict):
        logger.warning(f"[apply_theme_to_custom_components] Invalid typography type: {type(typography)}, ignoring")
        typography = None

    # Fall back to deck theme if not provided
    if not colors or not typography:
        theme = (deck_data or {}).get("theme") or {}
        if not colors:
            colors = theme.get("color_palette") or theme.get("colors") or {}
        if not typography:
            typography = theme.get("typography") or {}

    if not colors and not typography:
        logger.warning("[apply_theme_to_custom_components] No theme colors or typography to apply")
        return DeckDiff(DeckDiffBase())

    logger.info("[apply_theme_to_custom_components] Applying theme to all CustomComponents")
    logger.info(
        f"[apply_theme_to_custom_components] Colors: {list(colors.keys()) if colors else 'None'}"
    )
    logger.info(
        f"[apply_theme_to_custom_components] Typography: {list(typography.keys()) if typography else 'None'}"
    )

    slides_to_update = []
    updated_count = 0

    for slide in (deck_data or {}).get("slides", []):
        slide_id = slide.get("id")
        components = slide.get("components", [])
        components_to_update = []

        for comp in components:
            if comp.get("type") != "CustomComponent":
                continue

            props = comp.get("props", {})
            html = props.get("render", "")
            if not html:
                continue

            # Clean and apply theme
            clean_html = strip_frontend_editing_scripts(html)
            themed_html = apply_theme_to_custom_component_html(clean_html, colors, typography)

            # Log what changed
            if themed_html != clean_html:
                # Find actual differences (log first change for debugging)
                import difflib
                diff = list(difflib.unified_diff(
                    clean_html[:2000].splitlines(),
                    themed_html[:2000].splitlines(),
                    lineterm='',
                    n=0
                ))
                if diff:
                    logger.info(f"[apply_theme_to_custom_components] Sample diff: {diff[:10]}")

            if themed_html != clean_html:
                comp_id = comp.get("id")
                components_to_update.append(
                    ComponentDiffBase(
                        id=comp_id,
                        type="CustomComponent",
                        props={"render": themed_html}
                    )
                )
                updated_count += 1
                logger.info(
                    f"[apply_theme_to_custom_components] Updated component {comp_id} on slide {slide_id}"
                )

        if components_to_update:
            slides_to_update.append(
                SlideDiffBase(
                    slide_id=slide_id,
                    components_to_update=components_to_update
                )
            )

    logger.info(
        f"[apply_theme_to_custom_components] Updated {updated_count} CustomComponents across {len(slides_to_update)} slides"
    )

    # Build theme_updates to update the deck's theme settings
    # This is critical - the frontend injects fonts based on deck theme, not component HTML
    theme_updates = {}

    if typography:
        # Extract font families from typography arg
        heading_font = None
        body_font = None

        if isinstance(typography.get('heading'), dict):
            heading_font = typography['heading'].get('family')
        elif isinstance(typography.get('heading'), str):
            heading_font = typography['heading']

        if isinstance(typography.get('body'), dict):
            body_font = typography['body'].get('family')
        elif isinstance(typography.get('body'), str):
            body_font = typography['body']

        if heading_font or body_font:
            theme_updates['typography'] = {
                'hero_font': heading_font or body_font,
                'body_font': body_font or heading_font,
            }
            logger.info(f"[apply_theme_to_custom_components] Theme updates: {theme_updates}")

    if colors:
        theme_updates['color_palette'] = colors
        logger.info(f"[apply_theme_to_custom_components] Color updates: {list(colors.keys())}")

    deck_diff = DeckDiff(DeckDiffBase(slides_to_update=slides_to_update))

    # Return ThemeUpdateResult if we have theme updates, otherwise just DeckDiff
    if theme_updates:
        return ThemeUpdateResult(deck_diff=deck_diff, theme_updates=theme_updates)
    return deck_diff
