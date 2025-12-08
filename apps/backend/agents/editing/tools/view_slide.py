"""
View Slide Tool - Allows the agent to inspect any slide in the deck.

This tool enables cross-slide awareness by letting the agent fetch full details
of any slide, not just the current one. Useful for:
- Copying styles from one slide to another
- Referencing component layouts from other slides
- Understanding the full deck structure before making changes
"""

from typing import Literal, Optional, Dict, Any, List
from pydantic import Field
import logging
import json

from models.tools import ToolModel
from models.deck import DeckBase, DeckDiff
from utils.summaries import get_slide_summary
from utils.deck import get_all_slide_ids

logger = logging.getLogger(__name__)


class ViewSlideArgs(ToolModel):
    """View the full details of any slide in the deck."""
    tool_name: Literal["view_slide"] = Field(
        description="View full details of any slide in the deck. Use this to inspect another slide's components, styles, and layout before copying or referencing them. Returns component IDs, types, positions, sizes, text content, and styles."
    )
    slide_id: str = Field(
        description="The ID of the slide to view (e.g., 'slide-1', 'slide-2'). Use the slide IDs from the deck summary."
    )
    include_html: bool = Field(
        default=False,
        description="Whether to include full HTML content for CustomComponents. Set to True if you need to copy or reference specific HTML/CSS styles."
    )


class ViewSlideResult:
    """Result container for view_slide tool."""
    def __init__(self, slide_id: str, details: Dict[str, Any], success: bool = True, error: Optional[str] = None):
        self.slide_id = slide_id
        self.details = details
        self.success = success
        self.error = error

    def to_context_string(self) -> str:
        """Convert to a string suitable for including in agent context."""
        if not self.success:
            return f"[VIEW_SLIDE ERROR] Could not view slide {self.slide_id}: {self.error}"

        lines = [f"[VIEWED SLIDE: {self.slide_id}]"]

        if self.details.get("title"):
            lines.append(f"Title: {self.details['title']}")

        lines.append(f"Components ({self.details.get('component_count', 0)}):")

        for comp in self.details.get("components", []):
            comp_line = f"  - {comp.get('type')} (id: {comp.get('id')})"

            # Add position info if available
            if comp.get("position"):
                pos = comp["position"]
                comp_line += f" at ({pos.get('x', 0)}, {pos.get('y', 0)})"

            # Add size info if available
            if comp.get("width") and comp.get("height"):
                comp_line += f" size: {comp['width']}x{comp['height']}"

            # Add text preview if available
            if comp.get("text_preview"):
                comp_line += f" text: \"{comp['text_preview']}\""

            lines.append(comp_line)

            # Add HTML content for CustomComponents (critical for style copying)
            if comp.get("type") == "CustomComponent" and comp.get("html_content"):
                html = comp["html_content"]
                # Truncate very long HTML but keep enough for style extraction
                if len(html) > 15000:
                    html = html[:15000] + f"\n... [TRUNCATED - full HTML is {len(comp['html_content'])} chars]"
                lines.append(f"\n    <custom_component_html id=\"{comp.get('id')}\">\n{html}\n    </custom_component_html>")

        # Add warnings if any
        if self.details.get("warnings"):
            lines.append("Warnings:")
            for warning in self.details["warnings"]:
                lines.append(f"  ! {warning}")

        return "\n".join(lines)


def view_slide(
    args: ViewSlideArgs,
    registry,  # Unused but needed for consistent tool signature
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> DeckDiff:
    """
    View the full details of any slide in the deck.

    This tool fetches comprehensive information about a slide including:
    - All component IDs, types, and positions
    - Text content previews
    - CustomComponent HTML (if requested)
    - Grid layout visualization
    - Overlap detection

    The viewed slide details are stored in deck_diff.viewed_slides for
    context enrichment in subsequent tool calls.
    """
    slide_id = args.slide_id
    include_html = args.include_html

    logger.info(f"[VIEW_SLIDE] Viewing slide: {slide_id}, include_html: {include_html}")

    # Validate slide exists
    all_slide_ids = get_all_slide_ids(deck_data)
    if slide_id not in all_slide_ids:
        logger.warning(f"[VIEW_SLIDE] Slide {slide_id} not found. Available: {all_slide_ids}")
        result = ViewSlideResult(
            slide_id=slide_id,
            details={},
            success=False,
            error=f"Slide '{slide_id}' not found. Available slides: {', '.join(all_slide_ids)}"
        )
        # Store error in deck_diff for agent feedback
        if not hasattr(deck_diff, '_viewed_slides'):
            deck_diff._viewed_slides = []
        deck_diff._viewed_slides.append(result)
        return deck_diff

    # Get detailed slide summary
    details = get_slide_summary(deck_data, slide_id)

    if not details:
        logger.warning(f"[VIEW_SLIDE] Could not get summary for slide {slide_id}")
        result = ViewSlideResult(
            slide_id=slide_id,
            details={},
            success=False,
            error=f"Could not retrieve details for slide '{slide_id}'"
        )
        if not hasattr(deck_diff, '_viewed_slides'):
            deck_diff._viewed_slides = []
        deck_diff._viewed_slides.append(result)
        return deck_diff

    # Optionally strip HTML content to reduce token usage
    if not include_html:
        for comp in details.get("components", []):
            if "html_content" in comp:
                # Keep a brief indicator but remove full HTML
                html_len = comp.get("html_length", len(comp.get("html_content", "")))
                comp["html_summary"] = f"[CustomComponent HTML: {html_len} chars - use include_html=True to view]"
                del comp["html_content"]

    logger.info(f"[VIEW_SLIDE] Successfully retrieved details for slide {slide_id}")
    logger.info(f"[VIEW_SLIDE] Components: {len(details.get('components', []))}")

    # Log the viewed slide details for debugging
    for comp in details.get("components", []):
        comp_type = comp.get("type")
        comp_id = comp.get("id")
        logger.info(f"[VIEW_SLIDE]   - {comp_type} (id: {comp_id})")

    result = ViewSlideResult(
        slide_id=slide_id,
        details=details,
        success=True
    )

    # Store in deck_diff for context enrichment
    if not hasattr(deck_diff, '_viewed_slides'):
        deck_diff._viewed_slides = []
    deck_diff._viewed_slides.append(result)

    # Also log the context string that will be used
    context_str = result.to_context_string()
    logger.info(f"[VIEW_SLIDE] Context for agent:\n{context_str}")

    return deck_diff


def get_viewed_slides_context(deck_diff: DeckDiff) -> Optional[str]:
    """
    Extract viewed slides from deck_diff and format as context string.

    This is called by the orchestrator to enrich context when view_slide
    tools were called.
    """
    if not hasattr(deck_diff, '_viewed_slides') or not deck_diff._viewed_slides:
        return None

    context_parts = ["<viewed_slides>"]
    for result in deck_diff._viewed_slides:
        context_parts.append(result.to_context_string())
    context_parts.append("</viewed_slides>")

    return "\n".join(context_parts)
