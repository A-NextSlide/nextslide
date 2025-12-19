import asyncio
import json
import logging
from typing import Optional, List, Dict, Any
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from services.outline_service import OutlineGenerator, OutlineOptions
from services.outline.chart_normalization import normalize_extracted_data
from models.requests import DeckOutline, SlideOutline, ExtractedDataItem, TaggedMediaItem
from api.requests.api_deck_outline import process_deck_outline

from .models import OutlineRequest, OutlineResponse
from .utils import _sanitize_request_for_logging
from .converter import _convert_to_api_format
from .brand import _hydrate_style_preferences, _guess_brand_identifier, _looks_like_domain, _is_reasonable_brand_term

logger = logging.getLogger(__name__)


async def process_openai_outline(request: OutlineRequest) -> OutlineResponse:
    """Legacy function name - redirects to process_outline"""
    logger.warning("[DEPRECATED] process_openai_outline is deprecated; use outline agent endpoints instead.")
    return await process_outline(request)

async def process_openai_outline_stream(request: OutlineRequest, registry=None):
    """Legacy function name - redirects to process_outline_stream"""
    logger.warning("[DEPRECATED] process_openai_outline_stream is deprecated; use outline agent endpoints instead.")
    return await process_outline_stream(request, registry)
