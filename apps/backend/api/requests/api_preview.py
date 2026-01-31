"""
Preview generation API for the "Try Without Signup" landing page experience.

Generates a lightweight slide outline preview without requiring authentication.
Rate limited to 3 requests per IP per hour using simple in-memory tracking.
"""

import os
import time
import uuid
import logging
from typing import Optional, Dict, List, Any
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/preview", tags=["Preview"])

# ---------------------------------------------------------------------------
# In-memory rate limiting (no Redis needed)
# ---------------------------------------------------------------------------
# Structure: { ip: [timestamp1, timestamp2, ...] }
_ip_request_log: Dict[str, List[float]] = defaultdict(list)
_MAX_REQUESTS_PER_HOUR = int(os.getenv("PREVIEW_RATE_LIMIT", "3"))
_WINDOW_SECONDS = 3600  # 1 hour

# Maximum prompt length to prevent abuse
_MAX_PROMPT_LENGTH = 500


def _check_rate_limit(ip: str) -> bool:
    """Check if the IP is within the rate limit. Returns True if allowed."""
    now = time.time()
    cutoff = now - _WINDOW_SECONDS

    # Prune expired entries for this IP
    _ip_request_log[ip] = [ts for ts in _ip_request_log[ip] if ts > cutoff]

    if len(_ip_request_log[ip]) >= _MAX_REQUESTS_PER_HOUR:
        return False

    _ip_request_log[ip].append(now)
    return True


def _get_remaining_requests(ip: str) -> int:
    """Return how many requests remain for this IP in the current window."""
    now = time.time()
    cutoff = now - _WINDOW_SECONDS
    recent = [ts for ts in _ip_request_log.get(ip, []) if ts > cutoff]
    return max(0, _MAX_REQUESTS_PER_HOUR - len(recent))


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class PreviewRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=_MAX_PROMPT_LENGTH, description="The topic or idea for the presentation")


class PreviewSlide(BaseModel):
    title: str
    content: str
    locked: bool = False


class PreviewResponse(BaseModel):
    id: str
    title: str
    slides: List[PreviewSlide]


# ---------------------------------------------------------------------------
# Lightweight outline generation (reuses existing OutlineGenerator)
# ---------------------------------------------------------------------------

async def _generate_preview_outline(prompt: str) -> Dict[str, Any]:
    """
    Generate a lightweight outline for preview purposes.
    Uses the existing outline generator but with constraints:
    - Max 6 slides
    - Quick detail level (fastest)
    - No research, no images, no charts
    """
    try:
        from services.outline_service import OutlineGenerator, OutlineOptions

        generator = OutlineGenerator(registry=None)

        options = OutlineOptions(
            prompt=prompt,
            detail_level="quick",
            enable_research=False,
            slide_count=6,
            async_images=True,  # Placeholder mode -- no actual image search
        )

        result = await generator.generate(options)

        slides = []
        for slide in result.slides:
            slides.append({
                "title": slide.title,
                "content": slide.content,
            })

        return {
            "title": result.title,
            "slides": slides,
        }

    except Exception as e:
        logger.error(f"Preview outline generation failed: {e}", exc_info=True)
        raise


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/generate", response_model=PreviewResponse)
async def generate_preview(request: PreviewRequest, req: Request):
    """
    Generate a preview outline for the landing page.
    No authentication required. Rate limited to 3 per IP per hour.
    First 3 slides are unlocked; the rest are locked (require signup).
    """
    # Determine client IP (support reverse proxies)
    client_ip = req.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if not client_ip:
        client_ip = req.client.host if req.client else "unknown"

    # Rate limit check
    if not _check_rate_limit(client_ip):
        remaining = _get_remaining_requests(client_ip)
        raise HTTPException(
            status_code=429,
            detail={
                "error": "RATE_LIMIT_EXCEEDED",
                "message": "You've reached the preview limit. Sign up for unlimited access!",
                "remaining": remaining,
            },
        )

    prompt = request.prompt.strip()
    logger.info(f"[Preview] Generating preview for prompt: {prompt[:80]}... (IP: {client_ip})")

    try:
        result = await _generate_preview_outline(prompt)
    except Exception as e:
        logger.error(f"[Preview] Generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "GENERATION_FAILED",
                "message": "Failed to generate preview. Please try again.",
            },
        )

    # Build response: first 3 unlocked, rest locked
    preview_id = str(uuid.uuid4())
    slides: List[PreviewSlide] = []
    for idx, slide_data in enumerate(result.get("slides", [])):
        locked = idx >= 3
        slides.append(PreviewSlide(
            title=slide_data["title"],
            content=slide_data["content"],
            locked=locked,
        ))

    # Ensure we have at least some slides
    if not slides:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "GENERATION_FAILED",
                "message": "Preview generation returned no slides. Please try again.",
            },
        )

    remaining = _get_remaining_requests(client_ip)
    logger.info(f"[Preview] Generated {len(slides)} slides for preview {preview_id} (remaining: {remaining})")

    return PreviewResponse(
        id=preview_id,
        title=result.get("title", "Untitled Presentation"),
        slides=slides,
    )


@router.get("/rate-limit-status")
async def rate_limit_status(req: Request):
    """Check how many preview requests remain for the current IP."""
    client_ip = req.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if not client_ip:
        client_ip = req.client.host if req.client else "unknown"

    remaining = _get_remaining_requests(client_ip)
    return {
        "remaining": remaining,
        "limit": _MAX_REQUESTS_PER_HOUR,
        "window_seconds": _WINDOW_SECONDS,
    }
