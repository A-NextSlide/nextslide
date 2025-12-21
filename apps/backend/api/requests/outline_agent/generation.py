"""Helpers for single-slide content generation."""

import asyncio
import json
import re
from typing import Optional

from agents.ai.clients import get_client, invoke
from agents.config import OUTLINE_AGENT_MODEL
from setup_logging_optimized import get_logger

from .models import GenerateSlideContentRequest, GenerateSlideContentResponse

logger = get_logger(__name__)


async def generate_slide_content_response(
    request: GenerateSlideContentRequest,
) -> GenerateSlideContentResponse:
    """Generate narrative content and key points for a single slide."""
    logger.info("[OutlineAgent] Generating content for slide: %s", request.slide_title)

    client, model = get_client(OUTLINE_AGENT_MODEL, wrap_with_instructor=False)

    prompt = (
        "Generate detailed slide content as JSON with keys: content, key_points. "
        "content should be 2-4 concise paragraphs with concrete facts, figures, and evidence pulled from "
        "Context and Source material. Avoid generic filler. If data is missing, state reasonable assumptions "
        "clearly. key_points should be 5-8 specific bullets (numbers, benchmarks, named entities, or claims).\n\n"
        f"Topic: {request.presentation_topic}\n"
        f"Slide {request.slide_index + 1}/{request.total_slides}\n"
        f"Title: {request.slide_title}\n"
        f"Context: {request.presentation_context or ''}\n"
        f"Existing key points: {', '.join(request.existing_key_points or [])}\n"
        f"Source material: {request.file_content or ''}\n"
        "Return JSON only."
    )

    response_text = await asyncio.to_thread(
        invoke,
        client,
        model,
        [{"role": "user", "content": prompt}],
        response_model=None,
        max_tokens=1600,
    )

    json_match = re.search(r"\{[\s\S]*\}", response_text)
    if json_match:
        try:
            result = json.loads(json_match.group())
            return GenerateSlideContentResponse(
                content=result.get("content", ""),
                key_points=result.get("key_points", []),
            )
        except json.JSONDecodeError:
            pass

    return GenerateSlideContentResponse(content=response_text, key_points=[])
