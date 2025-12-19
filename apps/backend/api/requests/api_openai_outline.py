"""Clean API endpoint for AI-powered slide outline generation."""

from api.requests.openai_outline.models import (
    OutlineRequest,
    ContentEnhancementRequest,
    ContentEnhancementResponse,
    OutlineResponse,
)
from api.requests.openai_outline.handlers import (
    process_outline,
    process_outline_stream,
    process_media_interpretation,
    process_content_enhancement,
    process_openai_outline,
    process_openai_outline_stream,
)

__all__ = [
    "OutlineRequest",
    "ContentEnhancementRequest",
    "ContentEnhancementResponse",
    "OutlineResponse",
    "OpenAIOutlineRequest",
    "OpenAIOutlineResponse",
    "process_outline",
    "process_outline_stream",
    "process_media_interpretation",
    "process_content_enhancement",
    "process_openai_outline",
    "process_openai_outline_stream",
]

# Backward-compatible aliases for chat_server imports
OpenAIOutlineRequest = OutlineRequest
OpenAIOutlineResponse = OutlineResponse
