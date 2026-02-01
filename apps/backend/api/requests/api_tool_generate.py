"""
Tool page slide generation endpoint.

Accepts file analysis + prompt from the unauthenticated tool landing pages,
generates 6 ephemeral slides via outline → compose pipeline, and streams
them back as SSE events.  Nothing is persisted to the database.
"""

import logging
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agents.config import TOOL_CONVERSION_MODEL
from agents.generation.events import sse_encode
from config.rate_limits import TOOL_GENERATION_RATE_LIMIT, TOOL_GENERATION_BURST_LIMIT

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Rate limiting (IP-based, unauthenticated)
# ---------------------------------------------------------------------------
try:
    from services.api_rate_limiter import limiter
    from slowapi.util import get_remote_address

    _has_limiter = True
except Exception:
    _has_limiter = False

# ---------------------------------------------------------------------------
# Request / helpers
# ---------------------------------------------------------------------------

TOOL_SLIDE_COUNT = 6
TOOL_UNLOCKED_COUNT = 3


class ToolGenerateRequest(BaseModel):
    file_analysis: str = Field(..., description="Combined file analysis text")
    prompt: str = Field(..., description="Seed prompt for the presentation")
    file_context: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional structured file context"
    )


def _build_outline_options(req: ToolGenerateRequest):
    """Build OutlineOptions configured for cheap, fast tool-page generation."""
    from services.outline.models import OutlineOptions

    full_prompt = f"{req.prompt}\n\nHere is the extracted content from the uploaded file:\n{req.file_analysis}"

    return OutlineOptions(
        prompt=full_prompt,
        detail_level="quick",
        enable_research=False,
        slide_count=TOOL_SLIDE_COUNT,
        model=TOOL_CONVERSION_MODEL,
        planning_model=TOOL_CONVERSION_MODEL,
        content_model=TOOL_CONVERSION_MODEL,
        research_model=TOOL_CONVERSION_MODEL,
        async_images=False,
    )


def _convert_result_to_deck_outline(result):
    """Lightweight converter from OutlineResult → DeckOutline for compose_deck_stream."""
    from models.requests import DeckOutline, SlideOutline

    slides = []
    for slide in result.slides:
        slides.append(
            SlideOutline(
                id=slide.id,
                title=slide.title,
                content=slide.content,
                deepResearch=False,
                taggedMedia=[],
                extractedData=None,
            )
        )

    return DeckOutline(
        id=result.id,
        title=result.title,
        slides=slides,
        notes=None,
        stylePreferences=None,
    )


# ---------------------------------------------------------------------------
# SSE stream generator
# ---------------------------------------------------------------------------

async def _generate_stream(req: ToolGenerateRequest, registry):
    """Async generator that yields SSE-encoded bytes."""
    sequence = 0
    deck_uuid = str(uuid.uuid4())

    def _sse(event: Dict[str, Any]) -> bytes:
        nonlocal sequence
        sequence += 1
        event.setdefault("sequence", sequence)
        event.setdefault("deck_uuid", deck_uuid)
        try:
            return sse_encode(event)
        except Exception:
            return sse_encode({"type": "error", "error": "serialization_failed"})

    try:
        # 1. Signal start
        yield _sse({
            "type": "generation_started",
            "total_slides": TOOL_SLIDE_COUNT,
            "message": "Starting slide generation…",
        })

        # 2. Generate outline (research disabled via OutlineOptions)
        from services.outline.generator import generate_outline

        options = _build_outline_options(req)
        outline_result = await generate_outline(options, registry)

        # Trim to exactly TOOL_SLIDE_COUNT slides
        if len(outline_result.slides) > TOOL_SLIDE_COUNT:
            outline_result.slides = outline_result.slides[:TOOL_SLIDE_COUNT]

        yield _sse({
            "type": "outline_ready",
            "title": outline_result.title,
            "slide_titles": [s.title for s in outline_result.slides],
        })

        # 3. Convert to DeckOutline and compose
        deck_outline = _convert_result_to_deck_outline(outline_result)

        from agents.generation.deck_composer import compose_deck_stream

        slide_data_by_index: Dict[int, Dict[str, Any]] = {}

        async for update in compose_deck_stream(
            deck_outline,
            registry,
            deck_uuid,
            max_parallel=TOOL_SLIDE_COUNT,
            delay_between_slides=0.05,
            async_images=False,
            enable_visual_analysis=False,
            user_id=None,
        ):
            utype = update.get("type", "")

            # Forward slide_generated events with the slide data
            if utype == "slide_generated":
                slide_index = update.get("slide_index")
                # compose pipeline puts slide payload under slide_data or slide
                slide_data = (
                    update.get("slide_data")
                    or update.get("slide")
                    or update.get("data")
                    or {}
                )

                if slide_index is not None:
                    slide_data_by_index[slide_index] = slide_data
                    yield _sse({
                        "type": "slide_generated",
                        "slide_index": slide_index,
                        "slide_data": slide_data,
                    })

            # Also capture slide_complete as slide_generated if it carries data
            elif utype == "slide_complete":
                slide_index = update.get("slide_index")
                slide_data = (
                    update.get("slide_data")
                    or update.get("slide")
                    or update.get("data")
                    or {}
                )
                if slide_index is not None and slide_data:
                    if slide_index not in slide_data_by_index:
                        slide_data_by_index[slide_index] = slide_data
                        yield _sse({
                            "type": "slide_generated",
                            "slide_index": slide_index,
                            "slide_data": slide_data,
                        })

            # Forward progress / phase events so the frontend can show pipeline stages
            elif utype in ("progress", "slide_started", "theme_generated", "slides_generation_started"):
                yield _sse(update)

        # 4. Completion
        yield _sse({
            "type": "tool_complete",
            "locked_slide_info": {
                "unlocked_count": TOOL_UNLOCKED_COUNT,
                "total_count": TOOL_SLIDE_COUNT,
            },
            "message": "All slides generated",
        })

    except Exception as exc:
        logger.error("Tool generation failed: %s", exc, exc_info=True)
        yield _sse({"type": "error", "error": str(exc)})

    # Always close cleanly
    yield _sse({"type": "end", "message": "Stream complete"})


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

if _has_limiter:

    @router.post("/api/tool/generate")
    @limiter.limit(TOOL_GENERATION_RATE_LIMIT, key_func=get_remote_address)
    @limiter.limit(TOOL_GENERATION_BURST_LIMIT, key_func=get_remote_address)
    async def tool_generate_endpoint(request: Request, body: ToolGenerateRequest):
        from models.registry import get_global_registry

        registry = get_global_registry()
        if registry is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=503, detail="Component registry not ready")

        logger.info(
            "[TOOL_GENERATE] prompt=%s… analysis=%d chars",
            body.prompt[:60],
            len(body.file_analysis),
        )

        return StreamingResponse(
            _generate_stream(body, registry),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

else:
    # Fallback without rate limiter
    @router.post("/api/tool/generate")
    async def tool_generate_endpoint(request: Request, body: ToolGenerateRequest):
        from models.registry import get_global_registry

        registry = get_global_registry()
        if registry is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=503, detail="Component registry not ready")

        logger.info(
            "[TOOL_GENERATE] (no limiter) prompt=%s… analysis=%d chars",
            body.prompt[:60],
            len(body.file_analysis),
        )

        return StreamingResponse(
            _generate_stream(body, registry),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
