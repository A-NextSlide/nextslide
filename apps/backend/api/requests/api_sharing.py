"""
API endpoints for deck sharing and team invite prompts.

Endpoints:
- POST   /api/sharing/share            - Share a deck with another user
- GET    /api/sharing/shared-with-me    - Get decks shared with current user
- GET    /api/sharing/shared-by-me      - Get decks current user shared
- POST   /api/sharing/{share_id}/read   - Mark a share as read
- DELETE /api/sharing/{share_id}        - Remove a share
- POST   /api/sharing/dismiss-prompt    - Dismiss a team invite prompt
- GET    /api/sharing/prompt-status     - Get which prompts should be shown
"""

import os
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
import httpx

from services.sharing_service import get_sharing_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sharing", tags=["Sharing"])


# ============================================================================
# Auth Helpers (same pattern as api_referral.py)
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
        logger.warning(f"Auth failure in sharing endpoint: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


# ============================================================================
# Request / Response Models
# ============================================================================

class ShareDeckRequest(BaseModel):
    deck_id: str
    email: str
    permission: str = "view"
    message: Optional[str] = None


class DismissPromptRequest(BaseModel):
    prompt_type: str


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/share")
async def share_deck(body: ShareDeckRequest, user: Dict[str, Any] = Depends(_get_current_user)):
    """Share a deck with another user by email."""
    service = get_sharing_service()

    if body.permission not in ("view", "edit"):
        raise HTTPException(status_code=400, detail="Permission must be 'view' or 'edit'")

    try:
        result = await service.share_deck_with_user(
            deck_id=body.deck_id,
            shared_by=user["id"],
            shared_with_email=body.email,
            permission=body.permission,
            message=body.message,
        )
        return {"success": True, "share": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error sharing deck: {e}")
        raise HTTPException(status_code=500, detail="Failed to share deck")


@router.get("/shared-with-me")
async def get_shared_with_me(user: Dict[str, Any] = Depends(_get_current_user)):
    """Get decks shared with the current user."""
    service = get_sharing_service()
    shares = await service.get_shared_with_me(user["id"])
    return {"shares": shares}


@router.get("/shared-by-me")
async def get_shared_by_me(user: Dict[str, Any] = Depends(_get_current_user)):
    """Get decks the current user has shared."""
    service = get_sharing_service()
    shares = await service.get_shared_by_me(user["id"])
    return {"shares": shares}


@router.post("/{share_id}/read")
async def mark_share_as_read(share_id: str, user: Dict[str, Any] = Depends(_get_current_user)):
    """Mark a share notification as read."""
    service = get_sharing_service()
    success = await service.mark_share_as_read(share_id, user["id"])

    if not success:
        raise HTTPException(status_code=404, detail="Share not found or not authorized")

    return {"success": True}


@router.delete("/{share_id}")
async def remove_share(share_id: str, user: Dict[str, Any] = Depends(_get_current_user)):
    """Remove a share (sharer or recipient)."""
    service = get_sharing_service()
    success = await service.remove_share(share_id, user["id"])

    if not success:
        raise HTTPException(status_code=404, detail="Share not found or not authorized")

    return {"success": True}


@router.post("/dismiss-prompt")
async def dismiss_prompt(body: DismissPromptRequest, user: Dict[str, Any] = Depends(_get_current_user)):
    """Dismiss a team invite prompt for 7 days."""
    service = get_sharing_service()
    success = await service.dismiss_prompt(user["id"], body.prompt_type)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to dismiss prompt")

    return {"success": True}


@router.get("/prompt-status")
async def get_prompt_status(user: Dict[str, Any] = Depends(_get_current_user)):
    """
    Check which team invite prompts should be shown.

    Returns prompt visibility based on:
    - User stats (deck count, share count, total views)
    - Whether each prompt type has been dismissed recently
    """
    service = get_sharing_service()

    # Get user stats
    stats = await service.get_user_stats_for_prompts(user["id"])

    # Check each prompt type
    prompts = {}

    # Prompt 1: After 3rd deck created
    if stats["deck_count"] >= 3:
        dismissed = await service.check_prompt_dismissed(user["id"], "after_3rd_deck")
        prompts["after_3rd_deck"] = {"eligible": True, "dismissed": dismissed}
    else:
        prompts["after_3rd_deck"] = {"eligible": False, "dismissed": False}

    # Prompt 2: After sharing a presentation
    if stats["share_count"] >= 1:
        dismissed = await service.check_prompt_dismissed(user["id"], "after_share")
        prompts["after_share"] = {"eligible": True, "dismissed": dismissed}
    else:
        prompts["after_share"] = {"eligible": False, "dismissed": False}

    # Prompt 3: After 100+ total views
    if stats["total_views"] >= 100:
        dismissed = await service.check_prompt_dismissed(user["id"], "after_100_views")
        prompts["after_100_views"] = {"eligible": True, "dismissed": dismissed}
    else:
        prompts["after_100_views"] = {"eligible": False, "dismissed": False}

    return {
        "prompts": prompts,
        "stats": stats,
    }
