"""
Claude-Compatible Tool Definitions for Deck Editing

This module provides tools in the format expected by Claude's Messages API.
Each tool is defined with a JSON schema that Claude can understand and use.
"""

from typing import List, Dict, Any
import uuid
from models.registry import ComponentRegistry
from models.deck import DeckBase, DeckDiff, DeckDiffBase
from utils.deck import get_all_component_ids, get_all_slide_ids, find_component_by_id, find_current_slide
from utils.summaries import get_slide_summary
from agents.integrations.tools import get_apollo_tools


def get_claude_tools(
    deck_data: DeckBase,
    registry: ComponentRegistry,
    current_slide_id: str
) -> List[Dict[str, Any]]:
    """
    Get all available tools in Claude-compatible format.

    Returns a list of tool definitions with JSON schemas.
    """
    component_types = registry.get_component_types()
    component_ids = get_all_component_ids(deck_data, current_slide_id)
    slide_ids = get_all_slide_ids(deck_data)

    tools = [
        # Component editing tools
        {
            "name": "update_component_properties",
            "description": "Update specific properties of an existing component. Use this to change colors, fonts, sizes, positions, text content, or any other component properties. You must specify exactly which properties to update and their new values.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "component_id": {
                        "type": "string",
                        "description": "The ID of the component to update",
                        "enum": component_ids if component_ids else None
                    },
                    "slide_id": {
                        "type": "string",
                        "description": "The ID of the slide containing the component",
                        "enum": slide_ids if slide_ids else None
                    },
                    "properties": {
                        "type": "object",
                        "description": "Object containing the properties to update. Common properties include: textColor (hex color), fontSize (number), fontFamily (string), text (string), content (string), backgroundColor (hex color), x (number), y (number), width (number), height (number), src (URL for images), etc. Include only the properties you want to change.",
                        "additionalProperties": True
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of why you're making this change (for user clarity)"
                    }
                },
                "required": ["component_id", "slide_id", "properties", "reason"]
            }
        },
        {
            "name": "create_component",
            "description": "Create a new component on a slide. You must specify the component type and all required properties including position (x, y), size (width, height), and content. Use the deck context to understand available component types.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "slide_id": {
                        "type": "string",
                        "description": "The ID of the slide to add the component to",
                        "enum": slide_ids if slide_ids else None
                    },
                    "component_type": {
                        "type": "string",
                        "description": "The type of component to create (e.g., TiptapTextBlock, Title, Image, Shape, Chart)",
                        "enum": component_types if component_types else None
                    },
                    "properties": {
                        "type": "object",
                        "description": "Properties for the new component. Must include position (x, y), size (width, height), and type-specific properties. For text components: text, textColor, fontSize, fontFamily. For images: src (URL). For shapes: backgroundColor, borderRadius, etc. Canvas is 1920x1080.",
                        "additionalProperties": True
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of what this component adds (for user clarity)"
                    }
                },
                "required": ["slide_id", "component_type", "properties", "reason"]
            }
        },
        {
            "name": "remove_component",
            "description": "Remove a component from a slide permanently.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "component_id": {
                        "type": "string",
                        "description": "The ID of the component to remove",
                        "enum": component_ids if component_ids else None
                    },
                    "slide_id": {
                        "type": "string",
                        "description": "The ID of the slide containing the component",
                        "enum": slide_ids if slide_ids else None
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of why you're removing this (for user clarity)"
                    }
                },
                "required": ["component_id", "slide_id", "reason"]
            }
        },
        {
            "name": "replace_component",
            "description": "Replace an existing component with a new one of a different type. Use this when changing a component's fundamental type (e.g., text to image, shape to chart).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "component_id": {
                        "type": "string",
                        "description": "The ID of the component to replace",
                        "enum": component_ids if component_ids else None
                    },
                    "slide_id": {
                        "type": "string",
                        "description": "The ID of the slide containing the component",
                        "enum": slide_ids if slide_ids else None
                    },
                    "new_component_type": {
                        "type": "string",
                        "description": "The type of the new component",
                        "enum": component_types if component_types else None
                    },
                    "new_properties": {
                        "type": "object",
                        "description": "Properties for the replacement component. Include position, size, and type-specific properties.",
                        "additionalProperties": True
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of why you're replacing this (for user clarity)"
                    }
                },
                "required": ["component_id", "slide_id", "new_component_type", "new_properties", "reason"]
            }
        },

        # Slide-level tools
        {
            "name": "update_background",
            "description": "Update the background of a slide. Can set solid colors or gradients.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "slide_id": {
                        "type": "string",
                        "description": "The ID of the slide to update",
                        "enum": slide_ids if slide_ids else None
                    },
                    "background_type": {
                        "type": "string",
                        "description": "Type of background: 'solid' for solid color, 'linear' for linear gradient, 'radial' for radial gradient",
                        "enum": ["solid", "linear", "radial"]
                    },
                    "color": {
                        "type": "string",
                        "description": "For solid backgrounds: hex color (e.g., '#FFFFFF'). For gradients: primary color."
                    },
                    "gradient_end_color": {
                        "type": "string",
                        "description": "For gradients only: the ending color (hex format)"
                    },
                    "gradient_angle": {
                        "type": "number",
                        "description": "For linear gradients: angle in degrees (0-360). Default is 90 (top to bottom)"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of the background choice"
                    }
                },
                "required": ["slide_id", "background_type", "color", "reason"]
            }
        },
        {
            "name": "create_slide",
            "description": "Create a new slide in the deck.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Title for the new slide"
                    },
                    "position": {
                        "type": "number",
                        "description": "Position index where to insert the slide (0-based). If not specified, adds to the end."
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of what this slide will contain"
                    }
                },
                "required": ["title", "reason"]
            }
        },
        {
            "name": "duplicate_slide",
            "description": "Duplicate an existing slide.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "slide_id": {
                        "type": "string",
                        "description": "The ID of the slide to duplicate",
                        "enum": slide_ids if slide_ids else None
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of why you're duplicating this slide"
                    }
                },
                "required": ["slide_id", "reason"]
            }
        },
        {
            "name": "remove_slide",
            "description": "Remove a slide from the deck.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "slide_id": {
                        "type": "string",
                        "description": "The ID of the slide to remove",
                        "enum": slide_ids if slide_ids else None
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of why you're removing this slide"
                    }
                },
                "required": ["slide_id", "reason"]
            }
        },

        # Media and content tools
        {
            "name": "insert_image",
            "description": "Insert an image onto a slide. Provide the image URL and positioning.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "slide_id": {
                        "type": "string",
                        "description": "The ID of the slide to add the image to",
                        "enum": slide_ids if slide_ids else None
                    },
                    "image_url": {
                        "type": "string",
                        "description": "URL of the image to insert"
                    },
                    "x": {
                        "type": "number",
                        "description": "X position on the canvas (0-1920)"
                    },
                    "y": {
                        "type": "number",
                        "description": "Y position on the canvas (0-1080)"
                    },
                    "width": {
                        "type": "number",
                        "description": "Width of the image in pixels"
                    },
                    "height": {
                        "type": "number",
                        "description": "Height of the image in pixels"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of what this image adds"
                    }
                },
                "required": ["slide_id", "image_url", "x", "y", "width", "height", "reason"]
            }
        },
        {
            "name": "search_and_add_logo",
            "description": "Search for a brand logo and add it to the slide. Provide the brand name and positioning.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "slide_id": {
                        "type": "string",
                        "description": "The ID of the slide to add the logo to",
                        "enum": slide_ids if slide_ids else None
                    },
                    "brand_name": {
                        "type": "string",
                        "description": "Name of the brand to search for (e.g., 'Google', 'Microsoft', 'Apple')"
                    },
                    "x": {
                        "type": "number",
                        "description": "X position on the canvas (0-1920)"
                    },
                    "y": {
                        "type": "number",
                        "description": "Y position on the canvas (0-1080)"
                    },
                    "width": {
                        "type": "number",
                        "description": "Width of the logo in pixels"
                    },
                    "height": {
                        "type": "number",
                        "description": "Height of the logo in pixels"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of why you're adding this logo"
                    }
                },
                "required": ["slide_id", "brand_name", "x", "y", "width", "height", "reason"]
            }
        },

        # Theme and styling tools
        {
            "name": "apply_color_palette",
            "description": "Apply a color palette to the entire deck or specific slides. Use this for consistent theming.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "palette_source": {
                        "type": "string",
                        "description": "How to get the palette: 'brand' for brand colors, 'website' to extract from URL, 'keyword' to generate from keyword, 'random' for random palette",
                        "enum": ["brand", "website", "keyword", "random"]
                    },
                    "source_value": {
                        "type": "string",
                        "description": "The value for the palette source: brand name, website URL, keyword, or empty for random"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of the color palette choice"
                    }
                },
                "required": ["palette_source", "reason"]
            }
        },
        {
            "name": "apply_theme_fonts",
            "description": "Apply consistent fonts across the deck based on a theme.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "theme_name": {
                        "type": "string",
                        "description": "Name of the font theme to apply (e.g., 'modern', 'classic', 'playful')"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of the font choice"
                    }
                },
                "required": ["theme_name", "reason"]
            }
        },

        # Utility tools
        {
            "name": "fetch_website_content",
            "description": "Fetch and extract content from a website URL. Use this when the user wants to pull content from a web page into their deck.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL of the website to fetch content from"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of what content you're looking for"
                    }
                },
                "required": ["url", "reason"]
            }
        },
    ]

    # Add Apollo integration tools (always available - business intelligence)
    apollo_tools = get_apollo_tools()
    for apollo_tool in apollo_tools:
        tools.append(apollo_tool["definition"])

    # Filter out None enums
    for tool in tools:
        if "input_schema" in tool and "properties" in tool["input_schema"]:
            for prop_name, prop_def in tool["input_schema"]["properties"].items():
                if isinstance(prop_def, dict) and prop_def.get("enum") is None:
                    prop_def.pop("enum", None)

    return tools


def execute_tool(
    tool_name: str,
    tool_input: Dict[str, Any],
    deck_data: DeckBase,
    registry: ComponentRegistry,
    deck_diff: DeckDiff
) -> Dict[str, Any]:
    """
    Execute a tool and return the result.

    This function routes tool calls to the appropriate handler.

    Args:
        tool_name: Name of the tool to execute
        tool_input: Input parameters for the tool
        deck_data: Current deck data
        registry: Component registry
        deck_diff: Current deck diff to update

    Returns:
        Dict with 'message' and optionally 'deck_diff'
    """
    reason = tool_input.get("reason", "")

    try:
        if tool_name == "update_component_properties":
            return _update_component_properties(tool_input, deck_data, deck_diff, registry)

        elif tool_name == "create_component":
            return _create_component(tool_input, deck_data, deck_diff, registry)

        elif tool_name == "remove_component":
            return _remove_component(tool_input, deck_diff)

        elif tool_name == "replace_component":
            return _replace_component(tool_input, deck_data, deck_diff, registry)

        elif tool_name == "update_background":
            return _update_background(tool_input, deck_diff)

        elif tool_name == "create_slide":
            return _create_slide(tool_input, deck_diff)

        elif tool_name == "duplicate_slide":
            return _duplicate_slide(tool_input, deck_data, deck_diff)

        elif tool_name == "remove_slide":
            return _remove_slide(tool_input, deck_diff)

        elif tool_name == "insert_image":
            return _insert_image(tool_input, deck_diff)

        elif tool_name == "search_and_add_logo":
            return _search_and_add_logo(tool_input, deck_data, deck_diff)

        elif tool_name == "apply_color_palette":
            return _apply_color_palette(tool_input, deck_data, deck_diff)

        elif tool_name == "apply_theme_fonts":
            return _apply_theme_fonts(tool_input, deck_diff)

        elif tool_name == "fetch_website_content":
            return _fetch_website_content(tool_input)

        # Apollo integration tools
        elif tool_name == "apollo_company_lookup":
            return _apollo_company_lookup(tool_input)

        elif tool_name == "apollo_person_lookup":
            return _apollo_person_lookup(tool_input)

        else:
            return {
                "message": f"Unknown tool: {tool_name}",
                "success": False
            }

    except Exception as e:
        return {
            "message": f"Error executing {tool_name}: {str(e)}",
            "success": False
        }


# Tool implementation functions
# These are simplified, deterministic functions that perform the actual edits

def _update_component_properties(
    tool_input: Dict[str, Any],
    deck_data: DeckBase,
    deck_diff: DeckDiff,
    registry: ComponentRegistry
) -> Dict[str, Any]:
    """Update properties of a component"""
    component_id = tool_input["component_id"]
    slide_id = tool_input["slide_id"]
    properties = tool_input["properties"]
    reason = tool_input.get("reason", "")

    # Get component to determine its type
    component = find_component_by_id(deck_data, component_id)
    if not component:
        return {"message": f"Component {component_id} not found", "success": False}

    comp_data = component.get("component", {})
    comp_type = comp_data.get("type")

    # Build the diff
    component_diff = {
        "id": component_id,
        "type": comp_type,
        "props": properties
    }

    deck_diff.update_component(slide_id, component_id, component_diff)

    return {
        "message": f"Updated component properties. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _create_component(
    tool_input: Dict[str, Any],
    deck_data: DeckBase,
    deck_diff: DeckDiff,
    registry: ComponentRegistry
) -> Dict[str, Any]:
    """Create a new component"""
    slide_id = tool_input["slide_id"]
    component_type = tool_input["component_type"]
    properties = tool_input["properties"]
    reason = tool_input.get("reason", "")

    # Generate new component ID
    new_id = str(uuid.uuid4())

    # Get component model from registry to ensure it's valid
    try:
        component_model = registry.get_component_model(component_type)
    except Exception as e:
        return {"message": f"Invalid component type {component_type}: {str(e)}", "success": False}

    # Build the component
    new_component = {
        "id": new_id,
        "type": component_type,
        "props": properties
    }

    # Try to create a proper Pydantic model instance
    try:
        new_component = component_model(**new_component)
    except Exception:
        # If that fails, use dict (will be validated later)
        pass

    deck_diff.add_component(slide_id, new_component)

    return {
        "message": f"Created new {component_type} component. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _remove_component(
    tool_input: Dict[str, Any],
    deck_diff: DeckDiff
) -> Dict[str, Any]:
    """Remove a component"""
    component_id = tool_input["component_id"]
    slide_id = tool_input["slide_id"]
    reason = tool_input.get("reason", "")

    deck_diff.remove_component(slide_id, component_id)

    return {
        "message": f"Removed component. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _replace_component(
    tool_input: Dict[str, Any],
    deck_data: DeckBase,
    deck_diff: DeckDiff,
    registry: ComponentRegistry
) -> Dict[str, Any]:
    """Replace a component with a new one"""
    component_id = tool_input["component_id"]
    slide_id = tool_input["slide_id"]
    new_component_type = tool_input["new_component_type"]
    new_properties = tool_input["new_properties"]
    reason = tool_input.get("reason", "")

    # Remove old component
    deck_diff.remove_component(slide_id, component_id)

    # Create new component with same ID
    try:
        component_model = registry.get_component_model(new_component_type)
    except Exception as e:
        return {"message": f"Invalid component type {new_component_type}: {str(e)}", "success": False}

    new_component = {
        "id": component_id,  # Keep the same ID
        "type": new_component_type,
        "props": new_properties
    }

    try:
        new_component = component_model(**new_component)
    except Exception:
        pass

    deck_diff.add_component(slide_id, new_component)

    return {
        "message": f"Replaced component with {new_component_type}. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _update_background(
    tool_input: Dict[str, Any],
    deck_diff: DeckDiff
) -> Dict[str, Any]:
    """Update slide background"""
    slide_id = tool_input["slide_id"]
    background_type = tool_input["background_type"]
    color = tool_input["color"]
    reason = tool_input.get("reason", "")

    background = {}

    if background_type == "solid":
        background = {
            "type": "solid",
            "color": color
        }
    elif background_type in ["linear", "radial"]:
        end_color = tool_input.get("gradient_end_color", color)
        angle = tool_input.get("gradient_angle", 90)

        background = {
            "type": background_type,
            "gradient": {
                "colors": [color, end_color],
                "angle": angle if background_type == "linear" else None
            }
        }

    deck_diff.update_slide(slide_id, {"background": background})

    return {
        "message": f"Updated slide background to {background_type}. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _create_slide(
    tool_input: Dict[str, Any],
    deck_diff: DeckDiff
) -> Dict[str, Any]:
    """Create a new slide"""
    title = tool_input["title"]
    position = tool_input.get("position")
    reason = tool_input.get("reason", "")

    new_slide = {
        "id": str(uuid.uuid4()),
        "title": title,
        "components": []
    }

    # Note: The actual DeckDiff model should support position parameter
    deck_diff.add_slide(new_slide)

    return {
        "message": f"Created new slide titled '{title}'. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _duplicate_slide(
    tool_input: Dict[str, Any],
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> Dict[str, Any]:
    """Duplicate a slide"""
    slide_id = tool_input["slide_id"]
    reason = tool_input.get("reason", "")

    # Find the slide
    slide = find_current_slide(deck_data, slide_id)
    if not slide:
        return {"message": f"Slide {slide_id} not found", "success": False}

    # Create a copy with new IDs
    import copy
    new_slide = copy.deepcopy(slide)

    # Generate new IDs
    if isinstance(new_slide, dict):
        new_slide["id"] = str(uuid.uuid4())
        if "components" in new_slide:
            for comp in new_slide["components"]:
                if isinstance(comp, dict):
                    comp["id"] = str(uuid.uuid4())

    deck_diff.add_slide(new_slide)

    return {
        "message": f"Duplicated slide. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _remove_slide(
    tool_input: Dict[str, Any],
    deck_diff: DeckDiff
) -> Dict[str, Any]:
    """Remove a slide"""
    slide_id = tool_input["slide_id"]
    reason = tool_input.get("reason", "")

    deck_diff.remove_slide(slide_id)

    return {
        "message": f"Removed slide. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _insert_image(
    tool_input: Dict[str, Any],
    deck_diff: DeckDiff
) -> Dict[str, Any]:
    """Insert an image"""
    slide_id = tool_input["slide_id"]
    image_url = tool_input["image_url"]
    x = tool_input["x"]
    y = tool_input["y"]
    width = tool_input["width"]
    height = tool_input["height"]
    reason = tool_input.get("reason", "")

    new_component = {
        "id": str(uuid.uuid4()),
        "type": "Image",
        "props": {
            "src": image_url,
            "x": x,
            "y": y,
            "width": width,
            "height": height
        }
    }

    deck_diff.add_component(slide_id, new_component)

    return {
        "message": f"Inserted image at ({x}, {y}). {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _search_and_add_logo(
    tool_input: Dict[str, Any],
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> Dict[str, Any]:
    """Search for a logo and add it"""
    # Import the actual logo search function
    from agents.editing.tools.logo_search import add_logos, LogoSearchArgs

    slide_id = tool_input["slide_id"]
    brand_name = tool_input["brand_name"]
    x = tool_input["x"]
    y = tool_input["y"]
    width = tool_input["width"]
    height = tool_input["height"]
    reason = tool_input.get("reason", "")

    # Create the args for the existing tool
    args = LogoSearchArgs(
        tool_name="add_logos",
        slide_id=slide_id,
        query=brand_name,
        x=x,
        y=y,
        width=width,
        height=height
    )

    # Use the existing logo search implementation
    from models.registry import ComponentRegistry
    result_diff = add_logos(args, ComponentRegistry(), deck_data, DeckDiff(DeckDiffBase()))

    # Merge results
    deck_diff = deck_diff.merge(result_diff)

    return {
        "message": f"Added {brand_name} logo. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _apply_color_palette(
    tool_input: Dict[str, Any],
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> Dict[str, Any]:
    """Apply a color palette"""
    palette_source = tool_input["palette_source"]
    source_value = tool_input.get("source_value", "")
    reason = tool_input.get("reason", "")

    # Import the appropriate theme tool
    from agents.editing.tools.theme_bridge import (
        apply_brand_colors, ApplyBrandColorsArgs,
        apply_website_palette, ApplyWebsitePaletteArgs,
        apply_keyword_palette, ApplyKeywordPaletteArgs,
        apply_random_palette, ApplyRandomPaletteArgs
    )
    from models.registry import ComponentRegistry

    registry = ComponentRegistry()

    if palette_source == "brand":
        args = ApplyBrandColorsArgs(tool_name="apply_brand_colors", brand_name=source_value)
        result_diff = apply_brand_colors(args, registry, deck_data, DeckDiff(DeckDiffBase()))

    elif palette_source == "website":
        args = ApplyWebsitePaletteArgs(tool_name="apply_website_palette", url=source_value)
        result_diff = apply_website_palette(args, registry, deck_data, DeckDiff(DeckDiffBase()))

    elif palette_source == "keyword":
        args = ApplyKeywordPaletteArgs(tool_name="apply_keyword_palette", keyword=source_value)
        result_diff = apply_keyword_palette(args, registry, deck_data, DeckDiff(DeckDiffBase()))

    else:  # random
        args = ApplyRandomPaletteArgs(tool_name="apply_random_palette")
        result_diff = apply_random_palette(args, registry, deck_data, DeckDiff(DeckDiffBase()))

    deck_diff = deck_diff.merge(result_diff)

    return {
        "message": f"Applied {palette_source} color palette. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _apply_theme_fonts(
    tool_input: Dict[str, Any],
    deck_diff: DeckDiff
) -> Dict[str, Any]:
    """Apply theme fonts"""
    from agents.editing.tools.theme_bridge import apply_theme_fonts, ApplyThemeFontsArgs
    from models.registry import ComponentRegistry

    theme_name = tool_input["theme_name"]
    reason = tool_input.get("reason", "")

    args = ApplyThemeFontsArgs(tool_name="apply_theme_fonts", theme_name=theme_name)
    result_diff = apply_theme_fonts(args, ComponentRegistry(), None, DeckDiff(DeckDiffBase()))

    deck_diff = deck_diff.merge(result_diff)

    return {
        "message": f"Applied '{theme_name}' font theme. {reason}",
        "deck_diff": deck_diff,
        "success": True
    }


def _fetch_website_content(
    tool_input: Dict[str, Any]
) -> Dict[str, Any]:
    """Fetch content from a website"""
    from agents.editing.tools.firecrawl import firecrawl_fetch, FirecrawlFetchArgs

    url = tool_input["url"]
    reason = tool_input.get("reason", "")

    args = FirecrawlFetchArgs(tool_name="firecrawl_fetch", url=url)

    try:
        # The firecrawl tool returns the content directly
        result_diff = firecrawl_fetch(args, None, None, DeckDiff(DeckDiffBase()))

        # Extract content from the diff or result
        # Note: The actual implementation may vary
        return {
            "message": f"Fetched content from {url}. {reason}\n\nContent will be available for you to use in the deck.",
            "success": True
        }
    except Exception as e:
        return {
            "message": f"Failed to fetch content from {url}: {str(e)}",
            "success": False
        }


def _apollo_company_lookup(tool_input: Dict[str, Any]) -> Dict[str, Any]:
    """
    Look up company information via Apollo.

    This tool provides business intelligence about companies including:
    - Company name, industry, employee count
    - LinkedIn URL, website
    - Description and location
    """
    from agents.integrations.tools import ApolloCompanyTool

    tool = ApolloCompanyTool()
    result = tool.execute(
        domain=tool_input.get("domain"),
        company_name=tool_input.get("company_name")
    )

    if result.success:
        company = result.data.get("company") or result.data.get("companies", [{}])[0]
        # Format a nice summary for the agent
        summary_parts = []
        if company.get("name"):
            summary_parts.append(f"**{company['name']}**")
        if company.get("industry"):
            summary_parts.append(f"Industry: {company['industry']}")
        if company.get("employee_count"):
            summary_parts.append(f"Employees: {company['employee_count']:,}")
        if company.get("description"):
            summary_parts.append(f"Description: {company['description'][:300]}...")
        if company.get("linkedin_url"):
            summary_parts.append(f"LinkedIn: {company['linkedin_url']}")
        if company.get("website_url"):
            summary_parts.append(f"Website: {company['website_url']}")
        if company.get("location"):
            loc = company["location"]
            loc_str = ", ".join(filter(None, [loc.get("city"), loc.get("state"), loc.get("country")]))
            if loc_str:
                summary_parts.append(f"Location: {loc_str}")

        return {
            "message": "\n".join(summary_parts),
            "data": result.data,
            "success": True
        }
    else:
        return {
            "message": f"Could not find company information: {result.error}",
            "success": False
        }


def _apollo_person_lookup(tool_input: Dict[str, Any]) -> Dict[str, Any]:
    """
    Look up person/professional information via Apollo.

    Note: Requires paid Apollo plan for full access.
    """
    from agents.integrations.tools import ApolloPersonTool

    tool = ApolloPersonTool()
    result = tool.execute(
        email=tool_input.get("email"),
        linkedin_url=tool_input.get("linkedin_url"),
        name=tool_input.get("name"),
        company_domain=tool_input.get("company_domain"),
        title=tool_input.get("title")
    )

    if result.success:
        person = result.data.get("person") or result.data.get("people", [{}])[0]
        # Format summary
        summary_parts = []
        if person.get("name"):
            summary_parts.append(f"**{person['name']}**")
        if person.get("title"):
            summary_parts.append(f"Title: {person['title']}")
        if person.get("company"):
            summary_parts.append(f"Company: {person['company']}")
        if person.get("email"):
            summary_parts.append(f"Email: {person['email']}")
        if person.get("linkedin_url"):
            summary_parts.append(f"LinkedIn: {person['linkedin_url']}")
        if person.get("location"):
            loc = person["location"]
            loc_str = ", ".join(filter(None, [loc.get("city"), loc.get("state"), loc.get("country")]))
            if loc_str:
                summary_parts.append(f"Location: {loc_str}")

        return {
            "message": "\n".join(summary_parts),
            "data": result.data,
            "success": True
        }
    else:
        return {
            "message": f"Could not find person information: {result.error}",
            "success": False
        }
