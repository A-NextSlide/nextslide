"""Theme application for custom components."""

from typing import Any, Dict, List
import logging

from models.deck import DeckDiff, DeckDiffBase
from models.component import ComponentDiffBase
from models.registry import ComponentRegistry
from agents.editing.tools.struct_utils import get_attr as _get_attr

logger = logging.getLogger(__name__)


def apply_theme_to_custom_components(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Apply theme colors and fonts to ALL CustomComponents in the deck.

    This is a "hotswap" operation that updates CSS custom properties
    and font-family declarations in CustomComponent HTML.

    Args in dict:
        colors: Optional dict with color values (accent_1, primary_text, etc.)
        typography: Optional dict with font info (heading, body)

    If not provided, uses deck's existing theme.
    """
    from agents.editing.orchestrator_v2 import (
        apply_theme_to_custom_component_html,
        strip_frontend_editing_scripts
    )
    from models.slide import SlideDiffBase

    # Get theme from args or deck
    colors = args.get("colors")
    typography = args.get("typography")

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

            if themed_html != html:
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

    return DeckDiff(DeckDiffBase(slides_to_update=slides_to_update))
