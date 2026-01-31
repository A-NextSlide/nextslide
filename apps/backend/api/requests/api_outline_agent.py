"""Outline Generation Agent endpoints."""

from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

from setup_logging_optimized import get_logger
from api.requests.api_auth import get_auth_header
from api.requests.outline_agent.models import (
    OutlineAgentRequest,
    GenerateSlideContentRequest,
    GenerateSlideContentResponse,
)
from api.requests.outline_agent.streaming import stream_agent_response
from api.requests.outline_agent.generation import generate_slide_content_response

logger = get_logger(__name__)

router = APIRouter(prefix="/api/outline-agent", tags=["outline-agent"])


@router.post("/chat")
async def outline_agent_chat(
    request: OutlineAgentRequest,
    token: Optional[str] = Depends(get_auth_header),
):
    """Chat with the outline generation agent (SSE)."""
    try:
        logger.info("[OutlineAgent] Received chat request: %s", request.message[:100])

        from agents.config import USE_MODAL
        if USE_MODAL:
            from services.modal_dispatch import stream_outline_via_modal
            generator = stream_outline_via_modal(request)
        else:
            generator = stream_agent_response(request)

        return StreamingResponse(
            generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception as e:
        logger.error("[OutlineAgent] Error: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-slide-content", response_model=GenerateSlideContentResponse)
async def generate_slide_content(
    request: GenerateSlideContentRequest,
    token: Optional[str] = Depends(get_auth_header),
):
    """Generate narrative content and key points for a single slide."""
    try:
        return await generate_slide_content_response(request)
    except Exception as e:
        logger.error("[OutlineAgent] Slide content error: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
