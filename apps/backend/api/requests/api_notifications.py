"""
API endpoints for the notifications system.
Includes routes for listing, reading, and managing notification preferences.
"""

import os
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from services.notification_service import get_notification_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ---------------------------------------------------------------------------
# Auth helper (same pattern as api_community.py)
# ---------------------------------------------------------------------------

async def _get_current_user(
    authorization: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Verify the JWT from the Authorization header and return the user dict.
    Raises 401 if missing/invalid.
    """
    import httpx

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.replace("Bearer ", "")
    supabase_url = os.getenv("SUPABASE_URL")
    api_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")

    try:
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
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


from fastapi import Header


async def get_current_user(
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    return await _get_current_user(authorization)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class NotificationPreferencesUpdate(BaseModel):
    email_on_views: Optional[bool] = None
    email_weekly_digest: Optional[bool] = None
    email_on_badges: Optional[bool] = None
    in_app_notifications: Optional[bool] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """List notifications for the authenticated user."""
    ns = get_notification_service()
    notifications = await ns.get_notifications(
        user_id=user["id"],
        limit=limit,
        unread_only=unread_only,
    )
    return {"notifications": notifications}


@router.get("/count")
async def unread_count(
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Return the number of unread notifications."""
    ns = get_notification_service()
    count = await ns.get_unread_count(user["id"])
    return {"count": count}


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Mark a single notification as read."""
    ns = get_notification_service()
    success = await ns.mark_read(user["id"], notification_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


@router.post("/read-all")
async def mark_all_notifications_read(
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Mark all notifications as read."""
    ns = get_notification_service()
    await ns.mark_all_read(user["id"])
    return {"success": True}


@router.get("/preferences")
async def get_preferences(
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Get notification preferences for the authenticated user."""
    ns = get_notification_service()
    prefs = await ns.get_preferences(user["id"])
    return prefs


@router.put("/preferences")
async def update_preferences(
    body: NotificationPreferencesUpdate,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Update notification preferences."""
    ns = get_notification_service()
    update_dict = body.dict(exclude_unset=True)
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    prefs = await ns.update_preferences(user["id"], update_dict)
    return prefs
