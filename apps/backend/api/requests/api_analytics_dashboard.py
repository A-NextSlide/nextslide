"""
Analytics Dashboard API Endpoints

Provides:
- POST /api/analytics/track-view      - Record a presentation view (public, no auth)
- POST /api/analytics/track-slide     - Record slide engagement (public, no auth)
- GET  /api/analytics/deck/{deck_uuid}       - Per-deck analytics (auth required)
- GET  /api/analytics/deck/{deck_uuid}/slides - Slide-by-slide engagement (auth required)
- GET  /api/analytics/dashboard       - Aggregate analytics for current user (auth required)
"""

import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

from services.analytics_dashboard_service import (
    record_view,
    record_slide_engagement,
    get_deck_analytics,
    get_slide_engagement,
    get_aggregate_analytics,
)
from services.supabase import get_supabase_client
from services.supabase_auth_service import get_auth_service
from api.requests.api_auth import get_auth_header

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["Analytics Dashboard"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_current_user(token: Optional[str] = Depends(get_auth_header)) -> dict:
    """Get current authenticated user from token."""
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


def _user_owns_deck(user_id: str, deck_uuid: str) -> bool:
    """Check if the authenticated user owns the deck."""
    try:
        client = get_supabase_client()
        resp = (
            client.table("decks")
            .select("user_id")
            .eq("uuid", deck_uuid)
            .limit(1)
            .execute()
        )
        if resp.data and len(resp.data) > 0:
            return resp.data[0].get("user_id") == user_id
        return False
    except Exception as e:
        logger.error(f"[AnalyticsDashboard] Ownership check failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

class TrackViewRequest(BaseModel):
    deck_uuid: str
    session_id: Optional[str] = None
    source: str = "direct"
    platform: Optional[str] = None
    device_type: str = "desktop"
    country: Optional[str] = None
    city: Optional[str] = None


class TrackSlideRequest(BaseModel):
    deck_uuid: str
    slide_index: int
    session_id: str
    time_spent_ms: int = Field(..., ge=0, le=600000)


class TrackSlideBatchRequest(BaseModel):
    deck_uuid: str
    session_id: str
    slides: List[dict]  # [{slide_index: int, time_spent_ms: int}, ...]


# ---------------------------------------------------------------------------
# Public Tracking Endpoints (no auth required)
# ---------------------------------------------------------------------------

@router.post("/track-view")
async def track_view_endpoint(body: TrackViewRequest, request: Request):
    """Record a presentation view event. Called from the shared deck viewer."""
    result = record_view(
        deck_uuid=body.deck_uuid,
        session_id=body.session_id,
        source=body.source,
        platform=body.platform,
        device_type=body.device_type,
        country=body.country,
        city=body.city,
    )
    if not result.get("success"):
        logger.warning(f"[AnalyticsDashboard] track-view failed: {result.get('error')}")
    return {"status": "ok"}


@router.post("/track-slide")
async def track_slide_endpoint(body: TrackSlideRequest):
    """Record slide engagement (time spent on a single slide)."""
    result = record_slide_engagement(
        deck_uuid=body.deck_uuid,
        slide_index=body.slide_index,
        session_id=body.session_id,
        time_spent_ms=body.time_spent_ms,
    )
    if not result.get("success") and not result.get("skipped"):
        logger.warning(f"[AnalyticsDashboard] track-slide failed: {result.get('error')}")
    return {"status": "ok"}


@router.post("/track-slide-batch")
async def track_slide_batch_endpoint(body: TrackSlideBatchRequest):
    """Record slide engagement for multiple slides at once (batched on page unload)."""
    for item in body.slides:
        slide_index = item.get("slide_index", 0)
        time_spent_ms = item.get("time_spent_ms", 0)
        if time_spent_ms > 0:
            record_slide_engagement(
                deck_uuid=body.deck_uuid,
                slide_index=slide_index,
                session_id=body.session_id,
                time_spent_ms=time_spent_ms,
            )
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Authenticated Analytics Endpoints
# ---------------------------------------------------------------------------

@router.get("/deck/{deck_uuid}")
async def get_deck_analytics_endpoint(
    deck_uuid: str,
    period: str = "30d",
    user: dict = Depends(_get_current_user),
):
    """Get analytics for a specific deck. Requires authentication and ownership."""
    user_id = user.get("id")
    if not _user_owns_deck(user_id, deck_uuid):
        raise HTTPException(status_code=403, detail="You do not own this deck")

    data = get_deck_analytics(deck_uuid, period)
    return data


@router.get("/deck/{deck_uuid}/slides")
async def get_deck_slides_endpoint(
    deck_uuid: str,
    period: str = "30d",
    user: dict = Depends(_get_current_user),
):
    """Get slide-by-slide engagement data for a deck."""
    user_id = user.get("id")
    if not _user_owns_deck(user_id, deck_uuid):
        raise HTTPException(status_code=403, detail="You do not own this deck")

    data = get_slide_engagement(deck_uuid, period)
    return {"slides": data}


@router.get("/dashboard")
async def get_dashboard_endpoint(
    period: str = "30d",
    user: dict = Depends(_get_current_user),
):
    """Get aggregate analytics across all decks for the current user."""
    user_id = user.get("id")
    data = get_aggregate_analytics(user_id, period)
    return data
