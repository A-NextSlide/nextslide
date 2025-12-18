"""
Tool executor - routes tool calls to implementations.

Simple mapping: tool_name → function
"""

from typing import Dict, List, Optional, Any, Callable
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
    event_cb: Callable = None,
    chat_history: List[Dict] = None,
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
        event_cb: Optional callback for streaming events (for tools like linkedin_lookup)
        chat_history: Full chat history for context (user messages AND assistant responses)

    Returns:
        DeckDiff with changes to apply
    """

    # Import tools here to avoid circular imports
    from agents.editing.tools.slide_tools import (
        edit_slide,
        create_slide,
        delete_slide,
        duplicate_slide,
        reorder_slides,
        custom_component_rewrite,
        custom_component_str_replace,
        component_prop_update,
        view_component,
        apply_theme_to_custom_components,
        edit_all_slides,
    )
    from agents.editing.tools.component_tools import (
        edit_component,
        create_component,
        delete_component,
    )
    from agents.editing.tools.theme_tools import apply_theme
    from agents.editing.tools.images import (
        search_images,
        replace_image_from_search,
        edit_image_with_ai,
    )
    from agents.editing.tools.integration_tools import linkedin_lookup, web_search

    # Tool map
    TOOLS = {
        "edit_slide": edit_slide,
        "create_slide": create_slide,
        "delete_slide": delete_slide,
        "duplicate_slide": duplicate_slide,
        "reorder_slides": reorder_slides,
        "edit_all_slides": edit_all_slides,
        "edit_component": edit_component,
        "create_component": create_component,
        "delete_component": delete_component,
        "apply_theme": apply_theme,
        "apply_theme_to_custom_components": apply_theme_to_custom_components,
        "custom_component_rewrite": custom_component_rewrite,
        "custom_component_str_replace": custom_component_str_replace,
        "component_prop_update": component_prop_update,
        "view_component": view_component,
        "search_images": search_images,
        "replace_image": replace_image_from_search,
        "edit_image_with_ai": edit_image_with_ai,
        "linkedin_lookup": linkedin_lookup,
        "web_search": web_search,
    }

    # Tools that need event_cb for streaming
    STREAMING_TOOLS = {"linkedin_lookup"}

    # Tools that need chat_history for context-aware generation
    CHAT_CONTEXT_TOOLS = {"create_slide", "edit_slide", "custom_component_rewrite"}

    if tool_name not in TOOLS:
        logger.error(f"Unknown tool: {tool_name}")
        raise ValueError(f"Unknown tool: {tool_name}")

    tool_fn = TOOLS[tool_name]

    # Execute tool - pass appropriate context based on tool type
    if tool_name in STREAMING_TOOLS:
        return tool_fn(
            args=tool_args,
            deck_data=deck_data,
            current_slide=current_slide,
            registry=registry,
            attachments=attachments,
            event_cb=event_cb,
        )
    elif tool_name in CHAT_CONTEXT_TOOLS:
        return tool_fn(
            args=tool_args,
            deck_data=deck_data,
            current_slide=current_slide,
            registry=registry,
            attachments=attachments,
            chat_history=chat_history,
        )
    else:
        return tool_fn(
            args=tool_args,
            deck_data=deck_data,
            current_slide=current_slide,
            registry=registry,
            attachments=attachments,
        )
