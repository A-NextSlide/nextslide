"""
API endpoints for public profiles and creator pages.

Endpoints:
- GET  /api/profiles/me              - Get own profile (auth required)
- PUT  /api/profiles/me              - Update own profile (auth required)
- POST /api/profiles/me/username     - Set username (auth required)
- GET  /api/profiles/:username       - Public profile data
- POST /api/profiles/:username/follow   - Follow user (auth required)
- DELETE /api/profiles/:username/follow - Unfollow user (auth required)
- GET  /api/profiles/:username/followers     - List followers
- GET  /api/profiles/:username/following     - List following
- GET  /api/profiles/:username/presentations - Public presentations
"""

import os
import logging
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Header
from pydantic import BaseModel
import httpx

from services.profile_service import get_profile_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/profiles", tags=["Profiles"])


# ============================================================================
# Auth Helpers (same pattern as api_community.py / api_gamification.py)
# ============================================================================

async def get_auth_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract JWT token from Authorization header."""
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "")
    return None


async def get_current_user_optional(token: Optional[str] = Depends(get_auth_header)) -> Optional[Dict[str, Any]]:
    """Get current user if authenticated, returns None otherwise."""
    if not token:
        return None

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
        return None
    except Exception as e:
        logger.warning(f"Failed to get optional user: {e}")
        return None


async def get_current_user_required(token: Optional[str] = Depends(get_auth_header)) -> Dict[str, Any]:
    """Get current user, raises 401 if not authenticated."""
    user = await get_current_user_optional(token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


# ============================================================================
# Request / Response Models
# ============================================================================

class UpdateProfileRequest(BaseModel):
    bio: Optional[str] = None
    social_links: Optional[Dict[str, Any]] = None
    is_profile_public: Optional[bool] = None
    avatar_url: Optional[str] = None
    hide_watermark: Optional[bool] = None


class SetUsernameRequest(BaseModel):
    username: str


# ============================================================================
# Own Profile Endpoints (auth required)
# ============================================================================

@router.get("/me")
async def get_own_profile(user: Dict[str, Any] = Depends(get_current_user_required)):
    """Get the authenticated user's own profile data for editing."""
    service = get_profile_service()
    profile = await service.get_own_profile(user["id"])

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    return profile


@router.put("/me")
async def update_profile(
    body: UpdateProfileRequest,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """Update the authenticated user's profile."""
    service = get_profile_service()
    result = await service.update_profile(user["id"], body.dict(exclude_none=True))

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Update failed"))

    return result


@router.post("/me/username")
async def set_username(
    body: SetUsernameRequest,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """Set or update the authenticated user's username."""
    service = get_profile_service()
    result = await service.set_username(user["id"], body.username)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to set username"))

    return result


# ============================================================================
# Public Profile Endpoints
# ============================================================================

@router.get("/{username}")
async def get_public_profile(
    username: str,
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Get a user's public profile by username."""
    service = get_profile_service()
    viewer_id = user["id"] if user else None
    profile = await service.get_public_profile(username, viewer_id=viewer_id)

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    return profile


@router.get("/{username}/presentations")
async def get_user_presentations(
    username: str,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """Get a user's public presentations."""
    service = get_profile_service()
    result = await service.get_user_public_presentations(username, limit=limit, offset=offset)
    return result


# ============================================================================
# Follow / Unfollow Endpoints (auth required)
# ============================================================================

@router.post("/{username}/follow")
async def follow_user(
    username: str,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """Follow a user. Requires authentication."""
    service = get_profile_service()
    result = await service.follow_user(user["id"], username)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to follow"))

    return result


@router.delete("/{username}/follow")
async def unfollow_user(
    username: str,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """Unfollow a user. Requires authentication."""
    service = get_profile_service()
    result = await service.unfollow_user(user["id"], username)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to unfollow"))

    return result


# ============================================================================
# Followers / Following Lists
# ============================================================================

@router.get("/{username}/followers")
async def get_followers(username: str):
    """Get list of users who follow the given user."""
    service = get_profile_service()
    followers = await service.get_followers(username)
    return {"followers": followers}


@router.get("/{username}/following")
async def get_following(username: str):
    """Get list of users the given user follows."""
    service = get_profile_service()
    following = await service.get_following(username)
    return {"following": following}
