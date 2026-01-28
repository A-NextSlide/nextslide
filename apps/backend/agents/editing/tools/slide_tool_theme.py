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

    # Extract fonts BEFORE processing components so we can include them in the diff
    # This ensures component font props are updated alongside the HTML
    extracted_heading_font = None
    extracted_body_font = None

    if typography:
        # Extract heading font - try LLM format first, then deck theme format
        if isinstance(typography.get('heading'), dict):
            extracted_heading_font = typography['heading'].get('family')
        elif isinstance(typography.get('heading'), str):
            extracted_heading_font = typography['heading']
        # Fallback to deck theme format (hero_title/hero_font)
        if not extracted_heading_font:
            if isinstance(typography.get('hero_title'), dict):
                extracted_heading_font = typography['hero_title'].get('family')
            elif isinstance(typography.get('hero_font'), str):
                extracted_heading_font = typography['hero_font']

        # Extract body font - try LLM format first, then deck theme format
        if isinstance(typography.get('body'), dict):
            extracted_body_font = typography['body'].get('family')
        elif isinstance(typography.get('body'), str):
            extracted_body_font = typography['body']
        # Fallback to deck theme format (body_text/body_font)
        if not extracted_body_font:
            if isinstance(typography.get('body_text'), dict):
                extracted_body_font = typography['body_text'].get('family')
            elif isinstance(typography.get('body_font'), str):
                extracted_body_font = typography['body_font']

        logger.info(f"[apply_theme_to_custom_components] Extracted fonts for props - heading: {extracted_heading_font}, body: {extracted_body_font}")

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

            # Check if we need to update this component:
            # 1. HTML changed (colors/fonts applied to inline styles)
            # 2. OR font props need updating (even if HTML uses CSS vars that didn't change)
            html_changed = themed_html != clean_html

            # Check if component has old font props that need updating
            current_hero_font = props.get("heroFont")
            current_body_font = props.get("bodyFont")
            current_font_family = props.get("fontFamily")

            hero_font = extracted_heading_font or extracted_body_font
            body_font = extracted_body_font or extracted_heading_font

            font_props_need_update = False
            if hero_font or body_font:
                # Need to update if:
                # 1. Component has ANY font prop set (we need to override it)
                # 2. OR any existing font prop differs from new value
                has_any_font_prop = current_hero_font or current_body_font or current_font_family
                if has_any_font_prop:
                    # Check if any differ - if so, update
                    if current_hero_font != hero_font or current_body_font != body_font or current_font_family != body_font:
                        font_props_need_update = True

            # Log what we're checking
            if font_props_need_update:
                logger.info(
                    f"[apply_theme_to_custom_components] Font props need update: "
                    f"current=({current_hero_font}, {current_body_font}, {current_font_family}) -> new=({hero_font}, {body_font})"
                )

            # Update if EITHER HTML changed OR font props need updating
            if html_changed or font_props_need_update:
                comp_id = comp.get("id")
                # Build props dict with render AND font props
                # Font props MUST be included to override existing component font overrides
                # Otherwise old fonts persist even after HTML is updated
                new_props = {}

                # Only include render if HTML actually changed
                if html_changed:
                    new_props["render"] = themed_html

                # Include font props if typography is being changed
                if hero_font or body_font:
                    new_props["heroFont"] = hero_font
                    new_props["bodyFont"] = body_font
                    new_props["fontFamily"] = body_font  # Default to body font
                    logger.info(
                        f"[apply_theme_to_custom_components] Including font props: heroFont={hero_font}, bodyFont={body_font}"
                    )

                if new_props:  # Only add if we have something to update
                    components_to_update.append(
                        ComponentDiffBase(
                            id=comp_id,
                            type="CustomComponent",
                            props=new_props
                        )
                    )
                    updated_count += 1
                    logger.info(
                        f"[apply_theme_to_custom_components] Updated component {comp_id} on slide {slide_id} "
                        f"(html_changed={html_changed}, font_props_updated={font_props_need_update})"
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

    # Use the pre-extracted fonts from above (extracted_heading_font, extracted_body_font)
    if extracted_heading_font or extracted_body_font:
        hero_font = extracted_heading_font or extracted_body_font
        body_font = extracted_body_font or extracted_heading_font

        # Include ALL typography formats to ensure complete override
        # The deck theme can have multiple font key formats that need updating
        theme_updates['typography'] = {
            # New format (used by component props)
            'hero_font': hero_font,
            'body_font': body_font,
            # Legacy format (body_text/hero_title - may be read by frontend)
            'body_text': {'family': body_font},
            'hero_title': {'family': hero_font},
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
