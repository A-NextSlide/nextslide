"""
API endpoints for webpage publishing feature.
Allows users to publish presentations as scrollable single-page websites.
"""
import logging
import os
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, Field
import httpx

from services.supabase import get_supabase_client
from services.webpage_service import (
    validate_slug,
    publish_webpage,
    get_webpage_by_slug,
    get_user_webpages,
    update_webpage,
    unpublish_webpage,
    record_webpage_view,
    submit_lead,
    get_webpage_leads,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webpages", tags=["Webpage Publishing"])


# ============================================================================
# Auth Helpers (same pattern as api_community.py)
# ============================================================================

async def get_auth_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract JWT token from Authorization header"""
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "")
    return None


async def get_current_user_required(token: Optional[str] = Depends(get_auth_header)) -> Dict[str, Any]:
    """Get current user, raises 401 if not authenticated"""
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        supabase_url = os.getenv("SUPABASE_URL")
        api_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        headers = {"Authorization": f"Bearer {token}", "apikey": api_key}

        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers=headers,
            timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=2.0)
        )

        if resp.status_code == 200:
            user_json = resp.json()
            return {
                "id": user_json.get("id"),
                "email": user_json.get("email"),
                "user_metadata": user_json.get("user_metadata", {})
            }

        raise HTTPException(status_code=401, detail="Invalid token")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth verification error: {e}")
        raise HTTPException(status_code=500, detail="Authentication error")


# ============================================================================
# Request / Response Models
# ============================================================================

class PublishWebpageRequest(BaseModel):
    deck_id: str
    slug: str = Field(..., min_length=3, max_length=60)
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    slides_data: list
    settings: Optional[Dict[str, Any]] = None


class UpdateWebpageRequest(BaseModel):
    slug: Optional[str] = Field(None, min_length=3, max_length=60)
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    settings: Optional[Dict[str, Any]] = None
    slides_data: Optional[list] = None


class SubmitLeadRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    name: Optional[str] = Field(None, max_length=100)


# ============================================================================
# Authenticated Endpoints
# ============================================================================

@router.post("")
async def create_webpage(
    request: PublishWebpageRequest,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """Publish a deck as a webpage. Auth required."""
    user_id = user['id']

    # Validate slug
    slug_check = validate_slug(request.slug)
    if not slug_check.get('valid'):
        raise HTTPException(status_code=400, detail=slug_check.get('error', 'Invalid slug'))

    result = publish_webpage(
        user_id=user_id,
        deck_id=request.deck_id,
        slug=request.slug,
        title=request.title,
        description=request.description,
        slides_data=request.slides_data,
        settings=request.settings,
    )

    if 'error' in result:
        raise HTTPException(status_code=400, detail=result['error'])

    logger.info(f"User {user_id} published webpage: {request.slug}")
    return result


@router.get("")
async def list_webpages(
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """List user's published webpages. Auth required."""
    webpages = get_user_webpages(user['id'])
    return {"webpages": webpages}


@router.put("/{webpage_id}")
async def update_webpage_endpoint(
    webpage_id: str,
    request: UpdateWebpageRequest,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """Update webpage settings. Auth required."""
    # If slug is being changed, validate the new one
    if request.slug:
        slug_check = validate_slug(request.slug)
        if not slug_check.get('valid'):
            # Allow if the slug belongs to this webpage already
            supabase = get_supabase_client()
            existing = supabase.table('published_webpages').select('slug').eq(
                'id', webpage_id
            ).execute()
            if not existing.data or existing.data[0]['slug'] != request.slug:
                raise HTTPException(status_code=400, detail=slug_check.get('error', 'Invalid slug'))

    update_data = request.model_dump(exclude_none=True)
    result = update_webpage(user['id'], webpage_id, update_data)

    if 'error' in result:
        status = 404 if result['error'] == 'Webpage not found' else (
            403 if result['error'] == 'Not authorized' else 400
        )
        raise HTTPException(status_code=status, detail=result['error'])

    return result


@router.delete("/{webpage_id}")
async def delete_webpage(
    webpage_id: str,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """Unpublish a webpage. Auth required."""
    result = unpublish_webpage(user['id'], webpage_id)

    if 'error' in result:
        status = 404 if result['error'] == 'Webpage not found' else (
            403 if result['error'] == 'Not authorized' else 400
        )
        raise HTTPException(status_code=status, detail=result['error'])

    return result


@router.get("/{webpage_id}/leads")
async def get_leads(
    webpage_id: str,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """Get leads for a webpage. Auth required (owner only)."""
    result = get_webpage_leads(user['id'], webpage_id)

    if 'error' in result:
        status = 404 if result['error'] == 'Webpage not found' else (
            403 if result['error'] == 'Not authorized' else 400
        )
        raise HTTPException(status_code=status, detail=result['error'])

    return result


@router.get("/check-slug/{slug}")
async def check_slug(
    slug: str,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """Check if a slug is available. Auth required."""
    result = validate_slug(slug)
    return result


# ============================================================================
# Public Endpoints (No Auth Required)
# ============================================================================

@router.get("/by-slug/{slug}")
async def get_webpage_by_slug_endpoint(slug: str):
    """Get a published webpage by its slug. Public endpoint."""
    webpage = get_webpage_by_slug(slug)
    if not webpage:
        raise HTTPException(status_code=404, detail="Webpage not found")
    return webpage


@router.post("/{slug}/view")
async def record_view(slug: str):
    """Record a view for a webpage. Public endpoint."""
    webpage = get_webpage_by_slug(slug)
    if not webpage:
        raise HTTPException(status_code=404, detail="Webpage not found")

    record_webpage_view(webpage['id'])
    return {"success": True}


@router.post("/{slug}/lead")
async def capture_lead(
    slug: str,
    request: SubmitLeadRequest,
):
    """Capture a lead email for a webpage. Public endpoint."""
    webpage = get_webpage_by_slug(slug)
    if not webpage:
        raise HTTPException(status_code=404, detail="Webpage not found")

    # Check if lead capture is enabled in settings
    settings = webpage.get('settings') or {}
    if not settings.get('lead_capture_enabled', True):
        raise HTTPException(status_code=400, detail="Lead capture is not enabled for this webpage")

    result = submit_lead(webpage['id'], request.email, request.name)

    if 'error' in result:
        raise HTTPException(status_code=400, detail=result['error'])

    return result
