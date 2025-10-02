"""
Deck access API (P1): grant/revoke access to users or teams
"""
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from api.requests.api_auth import get_auth_header
from services.supabase_auth_service import get_auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/decks", tags=["deck-access"])


class AccessGrantRequest(BaseModel):
    user_id: Optional[str] = None
    team_id: Optional[str] = None
    role: str = Field(..., description="viewer|editor|commenter")


class AccessUpdateRequest(BaseModel):
    role: str = Field(..., description="viewer|editor|commenter")


def _get_supabase():
    from utils.supabase import get_supabase_client
    return get_supabase_client()


def _require_user(token: Optional[str]) -> Dict[str, Any]:
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def _assert_deck_admin(deck_id: str, user_id: str):
    from utils.supabase import get_deck
    deck = get_deck(deck_id)
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    if deck.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Only deck owner can manage access (P1)")
    return deck


@router.post("/{deck_id}/access")
async def grant_access(deck_id: str, request: AccessGrantRequest, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_deck_admin(deck_id, user["id"])  # P1: owner only
    supabase = _get_supabase()
    if not request.user_id and not request.team_id:
        raise HTTPException(status_code=400, detail="user_id or team_id required")
    if request.user_id and request.team_id:
        raise HTTPException(status_code=400, detail="Provide either user_id or team_id, not both")
    now = datetime.utcnow().isoformat()
    if request.user_id:
        res = supabase.table("deck_user_access").upsert({
            "deck_id": deck_id,
            "user_id": request.user_id,
            "role": request.role,
            "invited_by_user_id": user["id"],
            "invited_at": now,
            "status": "active"
        }).execute()
        return res.data[0] if res.data else {"deck_id": deck_id, "user_id": request.user_id, "role": request.role}
    else:
        res = supabase.table("deck_team_access").upsert({
            "deck_id": deck_id,
            "team_id": request.team_id,
            "role": request.role
        }).execute()
        return res.data[0] if res.data else {"deck_id": deck_id, "team_id": request.team_id, "role": request.role}


@router.get("/{deck_id}/access")
async def list_access(deck_id: str, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_deck_admin(deck_id, user["id"])  # P1: owner only
    supabase = _get_supabase()
    users = supabase.table("deck_user_access").select("user_id, role, status, invited_by_user_id, invited_at, created_at, users:users(id,email,full_name)").eq("deck_id", deck_id).execute()
    teams = supabase.table("deck_team_access").select("team_id, role, created_at, teams:teams(id,name)").eq("deck_id", deck_id).execute()
    return {
        "users": [
            {
                "user_id": r.get("user_id"),
                "email": (r.get("users") or {}).get("email"),
                "role": r.get("role"),
                "status": r.get("status"),
                "invited_by_user_id": r.get("invited_by_user_id"),
                "invited_at": r.get("invited_at"),
                "added_at": r.get("created_at")
            } for r in users.data or []
        ],
        "teams": [
            {
                "team_id": r.get("team_id"),
                "name": (r.get("teams") or {}).get("name"),
                "role": r.get("role"),
                "added_at": r.get("created_at")
            } for r in teams.data or []
        ]
    }


@router.patch("/{deck_id}/access/{grantee_id}")
async def update_access(deck_id: str, grantee_id: str, request: AccessUpdateRequest, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_deck_admin(deck_id, user["id"])  # P1: owner only
    supabase = _get_supabase()
    # Try user first
    res = supabase.table("deck_user_access").update({"role": request.role}).eq("deck_id", deck_id).eq("user_id", grantee_id).execute()
    if res.data:
        return {"user_id": grantee_id, "role": request.role}
    # Try team
    res2 = supabase.table("deck_team_access").update({"role": request.role}).eq("deck_id", deck_id).eq("team_id", grantee_id).execute()
    if res2.data:
        return {"team_id": grantee_id, "role": request.role}
    raise HTTPException(status_code=404, detail="Grantee not found")


@router.delete("/{deck_id}/access/{grantee_id}")
async def revoke_access(deck_id: str, grantee_id: str, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_deck_admin(deck_id, user["id"])  # P1: owner only
    supabase = _get_supabase()
    res = supabase.table("deck_user_access").delete().eq("deck_id", deck_id).eq("user_id", grantee_id).execute()
    if res.data:
        return {"message": "User access revoked", "user_id": grantee_id}
    res2 = supabase.table("deck_team_access").delete().eq("deck_id", deck_id).eq("team_id", grantee_id).execute()
    if res2.data:
        return {"message": "Team access revoked", "team_id": grantee_id}
    raise HTTPException(status_code=404, detail="Grantee not found")


