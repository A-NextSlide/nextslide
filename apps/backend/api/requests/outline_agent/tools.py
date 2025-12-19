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


def get_gemini_search_tool():
    """Return Gemini-compatible tool declarations."""
    if not GEMINI_AVAILABLE:
        return None
    return genai_types.Tool(
        function_declarations=[
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
    )


def is_gemini_model(model: str) -> bool:
    """Return True when the model name is Gemini."""
    return model.startswith("gemini") if model else False
