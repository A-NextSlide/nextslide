"""
Comments API (P2)
"""
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from api.requests.api_auth import get_auth_header
from services.supabase_auth_service import get_auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/decks", tags=["comments"])


class CreateCommentRequest(BaseModel):
    body: str
    slide_id: Optional[str] = None
    thread_id: Optional[str] = None
    anchor: Optional[Dict[str, Any]] = None
    mentions: Optional[List[str]] = None


class UpdateCommentRequest(BaseModel):
    body: Optional[str] = None
    resolved_by_user_id: Optional[str] = None
    resolved_at: Optional[str] = None


class UpdateThreadRequest(BaseModel):
    resolved: bool


def _get_supabase():
    from utils.supabase import get_supabase_client
    return get_supabase_client()


def _require_user(token: Optional[str]) -> Dict[str, Any]:
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def _is_valid_uuid(value: Optional[str]) -> bool:
    if not value or not isinstance(value, str):
        return False
    try:
        UUID(value)
        return True
    except Exception:
        return False


def _assert_can_comment(deck_id: str, user_id: str):
    # P2 minimal: deck owner or any active user access with role commenter/editor
    from utils.supabase import get_deck
    deck = get_deck(deck_id)
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    if deck.get("user_id") == user_id:
        return True
    supabase = _get_supabase()
    res = supabase.table("deck_user_access").select("role,status").eq("deck_id", deck_id).eq("user_id", user_id).single().execute()
    role = (res.data or {}).get("role")
    status = (res.data or {}).get("status")
    if status == "active" and role in ("commenter", "editor"):
        return True
    raise HTTPException(status_code=403, detail="Insufficient permissions to comment")


@router.post("/{deck_id}/comments")
async def create_comment(deck_id: str, request: CreateCommentRequest, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_can_comment(deck_id, user["id"])
    supabase = _get_supabase()
    now = datetime.utcnow().isoformat()
    thread_id = request.thread_id or None
    payload: Dict[str, Any] = {
        "deck_id": deck_id,
        "author_id": user["id"],
        "body": request.body,
        "thread_id": thread_id,
        "created_at": now,
        "updated_at": now
    }
    # Support either UUID slide_id or string slide_key
    if _is_valid_uuid(request.slide_id):
        payload["slide_id"] = request.slide_id
    elif request.slide_id:
        # Use slide_key (text) for non-uuid slide IDs
        payload["slide_key"] = request.slide_id
    # Add anchor/mentions if provided
    if request.anchor is not None:
        payload["anchor"] = request.anchor
    if request.mentions is not None:
        payload["mention_user_ids"] = request.mentions
    res = supabase.table("comments").insert(payload).execute()
    return res.data[0] if res.data else {"deck_id": deck_id, "body": request.body}


@router.get("/{deck_id}/comments")
async def list_comments(
    deck_id: str,
    slideId: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    token: Optional[str] = Depends(get_auth_header)
):
    user = _require_user(token)
    _assert_can_comment(deck_id, user["id"])  # any commenter/editor can read
    supabase = _get_supabase()
    query = supabase.table("comments").select("*").eq("deck_id", deck_id)
    if slideId:
        if _is_valid_uuid(slideId):
            query = query.eq("slide_id", slideId)
        else:
            # Filter by slide_key for non-uuid slide identifiers
            query = query.eq("slide_key", slideId)
    if status == "open":
        query = query.is_("resolved_at", None)
    elif status == "resolved":
        query = query.not_.is_("resolved_at", None)
    res = query.order("created_at", desc=False).execute()
    return res.data or []


@router.patch("/{deck_id}/comments/{id}")
async def update_comment(deck_id: str, id: str, request: UpdateCommentRequest, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_can_comment(deck_id, user["id"])  # allow commenter/editor/owner
    supabase = _get_supabase()
    updates: Dict[str, Any] = {}
    if request.body is not None:
        updates["body"] = request.body
    if request.resolved_by_user_id is not None:
        updates["resolved_by_user_id"] = request.resolved_by_user_id
    if request.resolved_at is not None:
        updates["resolved_at"] = request.resolved_at
    if not updates:
        return {"message": "No changes"}
    updates["updated_at"] = datetime.utcnow().isoformat()
    res = supabase.table("comments").update(updates).eq("id", id).eq("deck_id", deck_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Comment not found")
    return res.data[0]


@router.delete("/{deck_id}/comments/{id}")
async def delete_comment(deck_id: str, id: str, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_can_comment(deck_id, user["id"])  # allow commenter/editor/owner
    supabase = _get_supabase()
    res = supabase.table("comments").delete().eq("id", id).eq("deck_id", deck_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"message": "Comment deleted", "id": id}


@router.put("/{deck_id}/threads/{thread_id}")
@router.patch("/{deck_id}/threads/{thread_id}")
async def update_thread(deck_id: str, thread_id: str, request: UpdateThreadRequest, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_can_comment(deck_id, user["id"])  # allow commenter/editor/owner
    supabase = _get_supabase()
    # Validate thread_id to prevent UUID cast errors
    if not _is_valid_uuid(thread_id):
        raise HTTPException(status_code=400, detail="Invalid thread_id")
    updates: Dict[str, Any] = {
        "resolved_by_user_id": user["id"],
        "resolved_at": datetime.utcnow().isoformat()
    } if request.resolved else {
        "resolved_by_user_id": None,
        "resolved_at": None
    }
    res = supabase.table("comments").update(updates).eq("deck_id", deck_id).eq("thread_id", thread_id).execute()
    # 204-like response
    return {"message": "Thread updated", "thread_id": thread_id, "resolved": request.resolved}


