"""
oEmbed endpoint for NextSlide presentations.

Enables rich embeds in Notion, Medium, WordPress, Slack, and other services
that support the oEmbed standard.

Specification: https://oembed.com/
"""

import logging
import os
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from services.deck_sharing_service import get_sharing_service

logger = logging.getLogger(__name__)

FRONTEND_BASE_URL = os.getenv("FRONTEND_URL", "https://nextslide.ai")
API_BASE_URL = os.getenv("API_URL", "https://api.nextslide.ai")

router = APIRouter(prefix="/api", tags=["oembed"])

# Regex to extract the share code from supported URLs
# Supports:
#   https://nextslide.ai/p/{code}
#   https://app.nextslide.ai/p/{code}
#   https://www.nextslide.ai/p/{code}
_URL_PATTERN = re.compile(
    r"https?://(?:app\.|www\.)?nextslide\.ai/p/(?P<code>[A-Za-z0-9_-]+)"
)


def _extract_share_code(url: str) -> Optional[str]:
    """Return the share code from a NextSlide presentation URL, or None."""
    m = _URL_PATTERN.search(url)
    return m.group("code") if m else None


@router.get("/oembed")
async def oembed(
    url: str = Query(..., description="The URL of the presentation"),
    format: Optional[str] = Query("json", description="Response format (only json is supported)"),
    maxwidth: Optional[int] = Query(None, ge=1, description="Maximum width of the embed"),
    maxheight: Optional[int] = Query(None, ge=1, description="Maximum height of the embed"),
):
    """
    oEmbed discovery endpoint.

    Accepts a NextSlide presentation URL and returns a JSON oEmbed response
    containing an embeddable iframe and metadata.
    """

    # Only JSON is supported (XML is optional per spec and rarely used)
    if format and format.lower() not in ("json", ""):
        raise HTTPException(status_code=501, detail="Only JSON format is supported")

    share_code = _extract_share_code(url)
    if not share_code:
        raise HTTPException(
            status_code=404,
            detail="URL does not match a NextSlide presentation",
        )

    # Look up deck metadata via the sharing service
    sharing_service = get_sharing_service()
    deck = sharing_service.get_deck_by_share_code(share_code)

    if not deck:
        raise HTTPException(status_code=404, detail="Presentation not found")

    title = deck.get("name") or deck.get("title") or "Untitled Presentation"
    author_name = deck.get("author_name") or deck.get("owner_name") or "NextSlide"

    # Respect maxwidth / maxheight while keeping 4:3 aspect ratio
    width = 640
    height = 480

    if maxwidth and maxwidth < width:
        width = maxwidth
        height = int(width * 0.75)

    if maxheight and maxheight < height:
        height = maxheight
        width = int(height / 0.75)

    embed_url = f"{FRONTEND_BASE_URL}/embed/{share_code}"
    html_snippet = (
        f'<iframe src="{embed_url}" '
        f'width="{width}" height="{height}" '
        f'frameborder="0" allowfullscreen></iframe>'
    )

    thumbnail_url = f"{API_BASE_URL}/api/public/og/{share_code}.png"

    payload = {
        "version": "1.0",
        "type": "rich",
        "provider_name": "NextSlide",
        "provider_url": FRONTEND_BASE_URL,
        "title": title,
        "author_name": author_name,
        "author_url": FRONTEND_BASE_URL,
        "thumbnail_url": thumbnail_url,
        "thumbnail_width": 1200,
        "thumbnail_height": 630,
        "width": width,
        "height": height,
        "html": html_snippet,
    }

    return JSONResponse(content=payload, headers={"Content-Type": "application/json"})
