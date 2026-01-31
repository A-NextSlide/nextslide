"""
API endpoints for the referral program.

Endpoints:
- GET  /api/referral/my-code - Check if user has a code (no auto-create, 404 if none)
- GET  /api/referral/code   - Get (or create) the user's referral code
- POST /api/referral/create - Create a referral code (with optional custom code)
- GET  /api/referral/stats  - Get referral dashboard stats
- GET  /api/referral/list   - Get list of referrals
- POST /api/referral/track  - Track a referral signup
- GET  /api/referral/lookup/:code - Public lookup for referral landing page
"""

import os
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
import httpx

from services.referral_service import get_referral_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/referral", tags=["Referral"])


# ============================================================================
# Auth Helpers (same pattern as api_community.py)
# ============================================================================

async def _get_auth_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract JWT token from Authorization header."""
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "")
    return None


async def _get_current_user(token: Optional[str] = Depends(_get_auth_header)) -> Dict[str, Any]:
    """Get current user, raises 401 if not authenticated."""
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        supabase_url = os.getenv("SUPABASE_URL")
        api_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        headers = {"Authorization": f"Bearer {token}", "apikey": api_key}

        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers=headers,
            timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=2.0),
        )

        if resp.status_code == 200:
            user_json = resp.json()
            return {
                "id": user_json.get("id"),
                "email": user_json.get("email"),
                "user_metadata": user_json.get("user_metadata", {}),
            }

        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Auth failure in referral endpoint: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


# ============================================================================
# Request / Response Models
# ============================================================================

class CreateReferralCodeRequest(BaseModel):
    custom_code: Optional[str] = None


class TrackReferralRequest(BaseModel):
    referral_code: str
    referee_id: str


class ReferralCodeResponse(BaseModel):
    code: str
    referral_url: str


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/my-code")
async def get_my_referral_code(user: Dict[str, Any] = Depends(_get_current_user)):
    """Check if user has a referral code. Returns it if exists, 404 if not. Does NOT auto-create."""
    service = get_referral_service()
    client = service._get_client()
    result = client.table("referral_codes").select("code, created_at").eq("user_id", user["id"]).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="No referral code found")

    code = result.data[0]["code"]
    frontend_url = os.getenv("FRONTEND_URL", "https://app.nextslide.ai")
    return {
        "code": code,
        "referral_url": f"{frontend_url}/r/{code}",
    }


@router.get("/code")
async def get_referral_code(user: Dict[str, Any] = Depends(_get_current_user)):
    """Get or create the user's referral code."""
    service = get_referral_service()
    result = await service.get_or_create_referral_code(user["id"])

    frontend_url = os.getenv("FRONTEND_URL", "https://app.nextslide.ai")
    referral_url = f"{frontend_url}/r/{result['code']}"

    return {
        "code": result["code"],
        "referral_url": referral_url,
    }


@router.post("/create")
async def create_referral_code(body: CreateReferralCodeRequest, user: Dict[str, Any] = Depends(_get_current_user)):
    """Create a referral code, optionally with a custom code."""
    service = get_referral_service()
    try:
        result = await service.create_referral_code(user["id"], custom_code=body.custom_code)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    frontend_url = os.getenv("FRONTEND_URL", "https://app.nextslide.ai")
    referral_url = f"{frontend_url}/r/{result['code']}"

    return {
        "code": result["code"],
        "referral_url": referral_url,
    }


@router.get("/stats")
async def get_referral_stats(user: Dict[str, Any] = Depends(_get_current_user)):
    """Get referral dashboard stats."""
    service = get_referral_service()
    stats = await service.get_referral_stats(user["id"])

    frontend_url = os.getenv("FRONTEND_URL", "https://app.nextslide.ai")
    stats["referral_url"] = f"{frontend_url}/r/{stats['code']}"

    return stats


@router.get("/list")
async def get_referral_list(user: Dict[str, Any] = Depends(_get_current_user)):
    """Get list of referrals."""
    service = get_referral_service()
    referrals = await service.get_referral_list(user["id"])
    return {"referrals": referrals}


@router.post("/track")
async def track_referral(body: TrackReferralRequest):
    """
    Track a referral signup.
    Called after a new user signs up with a referral code.
    """
    service = get_referral_service()
    result = await service.track_referral_signup(body.referee_id, body.referral_code)

    if result is None:
        raise HTTPException(status_code=400, detail="Invalid referral code or self-referral")

    return {"success": True, "referral_id": result.get("id")}


@router.get("/lookup/{code}")
async def lookup_referral_code(code: str):
    """
    Public endpoint: look up a referral code for the landing page.
    Returns referrer display name without requiring authentication.
    """
    service = get_referral_service()
    info = await service.lookup_referral_code(code)

    if not info:
        raise HTTPException(status_code=404, detail="Referral code not found")

    return {
        "code": info["code"],
        "referrer_name": info["referrer_name"],
    }
