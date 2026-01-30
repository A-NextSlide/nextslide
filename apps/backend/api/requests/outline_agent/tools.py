"""Tool definitions and Gemini helpers for the outline agent."""

import logging

logger = logging.getLogger(__name__)

# Import Gemini types for function calling
try:
    from google import genai  # noqa: F401
    from google.genai import types as genai_types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    genai_types = None


# ── Anthropic-format tool schemas ──────────────────────────────────────────────

SEARCH_TOOL = {
    "name": "web_search",
    "description": "Search the web for current facts or sources when needed.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query"}
        },
        "required": ["query"],
    },
}

DEEP_EXTRACT_TOOL = {
    "name": "deep_extract",
    "description": "Extract data from a specific site or set of URLs when needed.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "What to extract"},
            "url": {"type": "string", "description": "Primary URL"},
            "urls": {"type": "array", "items": {"type": "string"}, "description": "Optional URLs"},
            "schema": {"type": "object", "description": "Optional schema hint"},
            "max_credits": {"type": "integer", "description": "Max Firecrawl agent credits"},
            "include_videos": {"type": "boolean", "description": "Include videos if relevant"},
        },
        "required": ["query"],
    },
}

UPDATE_THEME_TOOL = {
    "name": "update_theme",
    "description": "Change the presentation theme: fonts, colors, brand styling, or logo. Use this when the user asks to change visual style.",
    "input_schema": {
        "type": "object",
        "properties": {
            "colors": {
                "type": "object",
                "description": "Color change. Specify hex values directly OR use search_query for palette lookup.",
                "properties": {
                    "background": {"type": "string", "description": "Background hex color (e.g. '#d4edda')"},
                    "text": {"type": "string", "description": "Text hex color (e.g. '#155724')"},
                    "accent1": {"type": "string", "description": "Primary accent hex color"},
                    "accent2": {"type": "string", "description": "Secondary accent hex color"},
                    "search_query": {"type": "string", "description": "Fallback: palette search query (e.g. 'warm sunset')"},
                },
            },
            "fonts": {
                "type": "object",
                "description": "Font change. Use {\"family\": \"Inter\"} for specific font or {\"family\": null} for auto-select.",
                "properties": {
                    "family": {"type": "string", "description": "Font family name, or null for auto-select"},
                },
            },
            "brand": {
                "type": "object",
                "description": "Apply brand styling (colors, fonts, logo) from a company.",
                "properties": {
                    "name": {"type": "string", "description": "Brand/company name"},
                    "url": {"type": "string", "description": "Brand domain (e.g. 'nike.com')"},
                },
            },
            "logo": {
                "type": "object",
                "description": "Add or remove logo.",
                "properties": {
                    "action": {"type": "string", "description": "'add' or 'remove'"},
                    "brand_names": {"type": "array", "items": {"type": "string"}, "description": "Brand names to fetch logo from (for action='add')"},
                },
                "required": ["action"],
            },
        },
    },
}

UPDATE_SLIDES_TOOL = {
    "name": "update_slides",
    "description": "Apply targeted changes to specific slides in the current outline. Use for content edits, title changes, speaker notes updates.",
    "input_schema": {
        "type": "object",
        "properties": {
            "changes": {
                "type": "array",
                "description": "List of slide changes to apply.",
                "items": {
                    "type": "object",
                    "properties": {
                        "slide_index": {"type": "integer", "description": "Zero-based index of the slide to modify"},
                        "title": {"type": "string", "description": "New title (omit to keep current)"},
                        "content": {"type": "string", "description": "New content (omit to keep current)"},
                        "speaker_notes": {"type": "string", "description": "New speaker notes (omit to keep current)"},
                        "key_points": {"type": "array", "items": {"type": "string"}, "description": "New key points (omit to keep current)"},
                    },
                    "required": ["slide_index"],
                },
            },
        },
        "required": ["changes"],
    },
}

ADD_SLIDE_TOOL = {
    "name": "add_slide",
    "description": "Insert a new slide into the outline.",
    "input_schema": {
        "type": "object",
        "properties": {
            "after_index": {"type": "integer", "description": "Insert after this zero-based index. Omit to append at end."},
            "title": {"type": "string", "description": "Title of the new slide"},
            "content": {"type": "string", "description": "Body content of the new slide"},
            "key_points": {"type": "array", "items": {"type": "string"}, "description": "Key points for the slide"},
        },
        "required": ["title", "content"],
    },
}

REMOVE_SLIDE_TOOL = {
    "name": "remove_slide",
    "description": "Remove a slide from the outline by its index.",
    "input_schema": {
        "type": "object",
        "properties": {
            "slide_index": {"type": "integer", "description": "Zero-based index of the slide to remove"},
        },
        "required": ["slide_index"],
    },
}

REORDER_SLIDE_TOOL = {
    "name": "reorder_slide",
    "description": "Move a slide from one position to another.",
    "input_schema": {
        "type": "object",
        "properties": {
            "from_index": {"type": "integer", "description": "Current zero-based index of the slide"},
            "to_index": {"type": "integer", "description": "Target zero-based index"},
        },
        "required": ["from_index", "to_index"],
    },
}

SCRAPE_MEDIA_TOOL = {
    "name": "scrape_media",
    "description": "Scrape images, GIFs, and videos from a URL for use in the presentation.",
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Website URL to scrape media from"},
            "media_filter": {"type": "string", "description": "'gifs', 'images', or 'all' (default: 'all')"},
        },
        "required": ["url"],
    },
}

# All outline tools (Anthropic format)
OUTLINE_TOOLS = [
    SEARCH_TOOL,
    DEEP_EXTRACT_TOOL,
    UPDATE_THEME_TOOL,
    UPDATE_SLIDES_TOOL,
    ADD_SLIDE_TOOL,
    REMOVE_SLIDE_TOOL,
    REORDER_SLIDE_TOOL,
    SCRAPE_MEDIA_TOOL,
]

# Research-only tools (Anthropic format) – backward compatible
RESEARCH_TOOLS = [SEARCH_TOOL, DEEP_EXTRACT_TOOL]

# Names of tools that modify the outline (not research)
OUTLINE_TOOL_NAMES = frozenset({
    "update_theme", "update_slides", "add_slide",
    "remove_slide", "reorder_slide", "scrape_media",
})


# ── Gemini function declarations ───────────────────────────────────────────────

def _gemini_search_declarations():
    """Return Gemini FunctionDeclaration list for research tools only."""
    return [
        genai_types.FunctionDeclaration(
            name="web_search",
            description=SEARCH_TOOL["description"],
            parameters=genai_types.Schema(
                type=genai_types.Type.OBJECT,
                properties={
                    "query": genai_types.Schema(
                        type=genai_types.Type.STRING,
                        description="The search query",
                    )
                },
                required=["query"],
            ),
        ),
        genai_types.FunctionDeclaration(
            name="deep_extract",
            description=DEEP_EXTRACT_TOOL["description"],
            parameters=genai_types.Schema(
                type=genai_types.Type.OBJECT,
                properties={
                    "query": genai_types.Schema(
                        type=genai_types.Type.STRING,
                        description="What to extract",
                    ),
                    "url": genai_types.Schema(
                        type=genai_types.Type.STRING,
                        description="Primary URL",
                    ),
                    "urls": genai_types.Schema(
                        type=genai_types.Type.ARRAY,
                        items=genai_types.Schema(type=genai_types.Type.STRING),
                        description="Optional list of URLs",
                    ),
                    "schema": genai_types.Schema(
                        type=genai_types.Type.OBJECT,
                        description="Optional schema hint",
                    ),
                    "max_credits": genai_types.Schema(
                        type=genai_types.Type.INTEGER,
                        description="Max Firecrawl agent credits",
                    ),
                    "include_videos": genai_types.Schema(
                        type=genai_types.Type.BOOLEAN,
                        description="Include videos if relevant",
                    ),
                },
                required=["query"],
            ),
        ),
    ]


def _gemini_outline_declarations():
    """Return Gemini FunctionDeclaration list for outline-specific tools."""
    return [
        genai_types.FunctionDeclaration(
            name="update_theme",
            description=UPDATE_THEME_TOOL["description"],
            parameters=genai_types.Schema(
                type=genai_types.Type.OBJECT,
                properties={
                    "colors": genai_types.Schema(
                        type=genai_types.Type.OBJECT,
                        description="Color change. Specify hex values directly OR use search_query for palette lookup.",
                        properties={
                            "background": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                description="Background hex color (e.g. '#d4edda')",
                            ),
                            "text": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                description="Text hex color (e.g. '#155724')",
                            ),
                            "accent1": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                description="Primary accent hex color",
                            ),
                            "accent2": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                description="Secondary accent hex color",
                            ),
                            "search_query": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                description="Fallback: palette search query",
                            ),
                        },
                    ),
                    "fonts": genai_types.Schema(
                        type=genai_types.Type.OBJECT,
                        description="Font change.",
                        properties={
                            "family": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                description="Font family name or null for auto-select",
                            ),
                        },
                    ),
                    "brand": genai_types.Schema(
                        type=genai_types.Type.OBJECT,
                        description="Apply brand styling.",
                        properties={
                            "name": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                description="Brand/company name",
                            ),
                            "url": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                description="Brand domain",
                            ),
                        },
                    ),
                    "logo": genai_types.Schema(
                        type=genai_types.Type.OBJECT,
                        description="Add or remove logo.",
                        properties={
                            "action": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                description="'add' or 'remove'",
                            ),
                            "brand_names": genai_types.Schema(
                                type=genai_types.Type.ARRAY,
                                items=genai_types.Schema(type=genai_types.Type.STRING),
                                description="Brand names for logo fetch",
                            ),
                        },
                    ),
                },
            ),
        ),
        genai_types.FunctionDeclaration(
            name="update_slides",
            description=UPDATE_SLIDES_TOOL["description"],
            parameters=genai_types.Schema(
                type=genai_types.Type.OBJECT,
                properties={
                    "changes": genai_types.Schema(
                        type=genai_types.Type.ARRAY,
                        description="List of slide changes.",
                        items=genai_types.Schema(
                            type=genai_types.Type.OBJECT,
                            properties={
                                "slide_index": genai_types.Schema(
                                    type=genai_types.Type.INTEGER,
                                    description="Zero-based slide index",
                                ),
                                "title": genai_types.Schema(
                                    type=genai_types.Type.STRING,
                                    description="New title",
                                ),
                                "content": genai_types.Schema(
                                    type=genai_types.Type.STRING,
                                    description="New content",
                                ),
                                "speaker_notes": genai_types.Schema(
                                    type=genai_types.Type.STRING,
                                    description="New speaker notes",
                                ),
                                "key_points": genai_types.Schema(
                                    type=genai_types.Type.ARRAY,
                                    items=genai_types.Schema(type=genai_types.Type.STRING),
                                    description="New key points",
                                ),
                            },
                            required=["slide_index"],
                        ),
                    ),
                },
                required=["changes"],
            ),
        ),
        genai_types.FunctionDeclaration(
            name="add_slide",
            description=ADD_SLIDE_TOOL["description"],
            parameters=genai_types.Schema(
                type=genai_types.Type.OBJECT,
                properties={
                    "after_index": genai_types.Schema(
                        type=genai_types.Type.INTEGER,
                        description="Insert after this index (omit to append)",
                    ),
                    "title": genai_types.Schema(
                        type=genai_types.Type.STRING,
                        description="Slide title",
                    ),
                    "content": genai_types.Schema(
                        type=genai_types.Type.STRING,
                        description="Slide content",
                    ),
                    "key_points": genai_types.Schema(
                        type=genai_types.Type.ARRAY,
                        items=genai_types.Schema(type=genai_types.Type.STRING),
                        description="Key points",
                    ),
                },
                required=["title", "content"],
            ),
        ),
        genai_types.FunctionDeclaration(
            name="remove_slide",
            description=REMOVE_SLIDE_TOOL["description"],
            parameters=genai_types.Schema(
                type=genai_types.Type.OBJECT,
                properties={
                    "slide_index": genai_types.Schema(
                        type=genai_types.Type.INTEGER,
                        description="Zero-based slide index to remove",
                    ),
                },
                required=["slide_index"],
            ),
        ),
        genai_types.FunctionDeclaration(
            name="reorder_slide",
            description=REORDER_SLIDE_TOOL["description"],
            parameters=genai_types.Schema(
                type=genai_types.Type.OBJECT,
                properties={
                    "from_index": genai_types.Schema(
                        type=genai_types.Type.INTEGER,
                        description="Current index",
                    ),
                    "to_index": genai_types.Schema(
                        type=genai_types.Type.INTEGER,
                        description="Target index",
                    ),
                },
                required=["from_index", "to_index"],
            ),
        ),
        genai_types.FunctionDeclaration(
            name="scrape_media",
            description=SCRAPE_MEDIA_TOOL["description"],
            parameters=genai_types.Schema(
                type=genai_types.Type.OBJECT,
                properties={
                    "url": genai_types.Schema(
                        type=genai_types.Type.STRING,
                        description="URL to scrape media from",
                    ),
                    "media_filter": genai_types.Schema(
                        type=genai_types.Type.STRING,
                        description="'gifs', 'images', or 'all'",
                    ),
                },
                required=["url"],
            ),
        ),
    ]


def get_gemini_search_tool():
    """Return Gemini-compatible tool for research only (backward compat)."""
    if not GEMINI_AVAILABLE:
        return None
    return genai_types.Tool(function_declarations=_gemini_search_declarations())


def get_gemini_outline_tools():
    """Return Gemini-compatible tool with ALL outline + research declarations."""
    if not GEMINI_AVAILABLE:
        return None
    return genai_types.Tool(
        function_declarations=_gemini_search_declarations() + _gemini_outline_declarations()
    )


def is_gemini_model(model: str) -> bool:
    """Return True when the model name is Gemini."""
    return model.startswith("gemini") if model else False
