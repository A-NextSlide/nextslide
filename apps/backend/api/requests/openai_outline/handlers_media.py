import logging
from typing import Optional, List, Dict, Any

from services.outline.chart_normalization import normalize_extracted_data
from models.requests import DeckOutline, SlideOutline, ExtractedDataItem, TaggedMediaItem
from api.requests.api_deck_outline import process_deck_outline

from .models import OutlineRequest, OutlineResponse
from .utils import _sanitize_extracted_data
from .converter import _convert_to_api_format

logger = logging.getLogger(__name__)


async def process_media_interpretation(files: List[Dict[str, Any]], slides: List[SlideOutline], media_prompt: str = "") -> List[TaggedMediaItem]:
    """Process media interpretation - simplified implementation"""
    try:
        # Simple implementation that returns basic tagged media items
        tagged_media = []
        
        for i, file_data in enumerate(files):
            media_item = TaggedMediaItem(
                id=f"media_{i}",
                filename=file_data.get("name", f"file_{i}"),
                type=file_data.get("type", "other"),
                content=file_data.get("content"),
                interpretation=f"Media file: {file_data.get('name', 'Unknown')}",
                status="processed",
                metadata={"processed_by": "simplified_interpreter"}
            )
            tagged_media.append(media_item)
        
        return tagged_media
        
    except Exception as e:
        logger.error(f"Error in media interpretation: {e}")
        return []
