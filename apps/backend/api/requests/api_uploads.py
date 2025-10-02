from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException

from api.requests.api_auth import get_auth_header
from services.supabase_auth_service import get_auth_service
from utils.supabase import get_supabase_client

router = APIRouter(prefix="/v1/uploads", tags=["Uploads"])


@router.post("/request")
async def request_upload(body: Dict[str, Any], token: Optional[str] = Depends(get_auth_header)):
    auth = get_auth_service()
    user = auth.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail={"error": {"code": "UNAUTHORIZED", "message": "Missing or invalid token"}})

    # For now, we recommend direct upload from frontend to Supabase Storage.
    # This endpoint can return a tempId to pair with /complete for registration.
    return {
        "uploadUrl": None,
        "uploadHeaders": {},
        "tempId": f"tmp_{user['id']}"
    }


@router.post("/complete")
async def complete_upload(body: Dict[str, Any], token: Optional[str] = Depends(get_auth_header)):
    auth = get_auth_service()
    user = auth.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail={"error": {"code": "UNAUTHORIZED", "message": "Missing or invalid token"}})

    sb = get_supabase_client()
    meta = body.get("metadata", {})
    session_id = meta.get("sessionId")
    name = meta.get("name") or body.get("name")
    mime_type = meta.get("mimeType") or body.get("mimeType")
    size = meta.get("size") or body.get("size")
    url = meta.get("url") or body.get("url")

    if not url:
        raise HTTPException(status_code=400, detail="url is required (upload to storage first)")

    res = sb.table("attachments").insert({
        "user_id": user["id"],
        "session_id": session_id,
        "name": name,
        "mime_type": mime_type,
        "size": size,
        "url": url,
        "metadata": meta or {}
    }).execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to register attachment")

    att = res.data[0]
    return {"attachment": {"id": att["id"], "mimeType": att.get("mime_type"), "name": att.get("name"), "size": att.get("size"), "url": att.get("url")}}


