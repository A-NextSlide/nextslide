"""
Tool executor - routes tool calls to implementations.

Simple mapping: tool_name → function
"""

from typing import Dict, List, Optional, Any
import logging

from models.deck import DeckDiff, DeckDiffBase
from models.registry import ComponentRegistry

logger = logging.getLogger(__name__)


def execute_tool(
    tool_name: str,
    tool_args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Execute a tool by name.

    Args:
        tool_name: Name of tool to execute
        tool_args: Arguments for the tool
        deck_data: Full deck object
        current_slide: Currently selected slide
        registry: Component registry
        attachments: User-uploaded files

    Returns:
        DeckDiff with changes to apply
    """

    # Import tools here to avoid circular imports
    from agents.editing.tools.slide_tools import (
        edit_slide,
        create_slide,
        delete_slide,
    )
    from agents.editing.tools.component_tools import (
        edit_component,
        create_component,
        delete_component,
    )
    from agents.editing.tools.theme_tools import apply_theme

    # Tool map
    TOOLS = {
        "edit_slide": edit_slide,
        "create_slide": create_slide,
        "delete_slide": delete_slide,
        "edit_component": edit_component,
        "create_component": create_component,
        "delete_component": delete_component,
        "apply_theme": apply_theme,
    }

    if tool_name not in TOOLS:
        logger.error(f"Unknown tool: {tool_name}")
        raise ValueError(f"Unknown tool: {tool_name}")

    tool_fn = TOOLS[tool_name]

    # Execute tool
    return tool_fn(
        args=tool_args,
        deck_data=deck_data,
        current_slide=current_slide,
        registry=registry,
        attachments=attachments,
    )
