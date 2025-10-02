import asyncio
import json
from datetime import datetime
from typing import Optional, Dict, Any, AsyncIterator

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import StreamingResponse

from api.requests.api_auth import get_auth_header
from services.supabase_auth_service import get_auth_service
from services.agent_stream_bus import agent_stream_bus
from utils.supabase import get_supabase_client
from utils.json_safe import ensure_json_serializable

router = APIRouter(prefix="/v1/agent", tags=["Agent Stream"])


def _envelope(event_type: str, session_id: str, message_id: Optional[str], data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "type": event_type,
        "sessionId": session_id,
        "messageId": message_id,
        "timestamp": int(datetime.utcnow().timestamp() * 1000),
        "data": data or {}
    }


@router.websocket("/stream")
async def ws_agent_stream(websocket: WebSocket, sessionId: Optional[str] = None, token: Optional[str] = None):
    # Support both query param and path param
    session_id = sessionId  # Use query param name
    
    if not session_id:
        await websocket.close(code=1008, reason="Missing sessionId parameter")
        return
    
    # Accept the connection
    await websocket.accept()
    queue = agent_stream_bus.subscribe(session_id)
    # Try to resolve user for audit of client commands
    user_id: Optional[str] = None
    try:
        if token:
            from services.supabase_auth_service import get_auth_service
            auth = get_auth_service()
            user = auth.get_user_with_token(token)
            if user:
                user_id = user.get("id")
    except Exception:
        pass
    try:
        # Initial hello (guard if client disconnected immediately)
        try:
            await websocket.send_json(_envelope("connection_established", session_id, None, {}))
        except Exception:
            return
        while True:
            # Relay outbound events
            try:
                event = await asyncio.wait_for(queue.get(), timeout=10)
                try:
                    await websocket.send_json(event)
                except WebSocketDisconnect:
                    return
                except Exception:
                    # Client likely went away; exit cleanly
                    return
            except asyncio.TimeoutError:
                # Keepalive ping
                try:
                    await websocket.send_json(_envelope("server.ping", session_id, None, {}))
                except WebSocketDisconnect:
                    return
                except Exception:
                    return

            # Handle inbound client messages (non-blocking poll)
            try:
                incoming = await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
                payload = json.loads(incoming)
                sb = get_supabase_client()
                msg_type = payload.get("type", "client.raw")
                # Persist client command as event
                sb.table("agent_events").insert({
                    "session_id": session_id,
                    "user_id": user_id,
                    "type": msg_type,
                    "data": payload
                }).execute()

                # Handle recognized commands inline
                if msg_type == "client.apply_edit":
                    edit_id = payload.get("editId")
                    if edit_id:
                        # Fetch and apply
                        edit_res = sb.table("agent_edits").select("*").eq("id", edit_id).single().execute()
                        if edit_res.data:
                            from services.agent_apply import apply_fast_operations, apply_deckdiff
                            edit = edit_res.data
                            deck_id = edit.get("deck_id")
                            diff = (edit.get("diff") or {})
                            if "operations" in diff:
                                deck_revision = await apply_fast_operations(deck_id, diff.get("operations", []), user_id=user_id) if deck_id else None
                            else:
                                deck_revision = await apply_deckdiff(deck_id, diff, user_id=user_id) if deck_id else None
                            # Update edit
                            sb.table("agent_edits").update({
                                "status": "applied",
                                "applied_at": datetime.utcnow().isoformat(),
                                "applied_by": user_id,
                                "deck_revision": str(deck_revision) if deck_revision else None
                            }).eq("id", edit_id).execute()
                            await agent_stream_bus.publish(session_id, ensure_json_serializable(_envelope("deck.edit.applied", session_id, None, {"editId": edit_id, "deckRevision": deck_revision})))
                elif msg_type == "client.update_context":
                    # Optionally store as system message/context update
                    sb.table("agent_messages").insert({
                        "session_id": session_id,
                        "user_id": user_id,
                        "role": "system",
                        "text": None,
                        "attachments": [],
                        "selections": payload.get("selections", []),
                        "context": payload.get("context", {})
                    }).execute()
            except asyncio.TimeoutError:
                pass
            except WebSocketDisconnect:
                return
            except Exception:
                # Ignore transient errors in non-blocking receive
                pass
    except WebSocketDisconnect:
        return


@router.get("/stream/{session_id}")
async def sse_agent_stream(session_id: str, token: Optional[str] = Depends(get_auth_header)):
    auth = get_auth_service()
    user = auth.get_user_with_token(token) if token else None
    if not user:
        # For SSE, allow anonymous only if your app needs it; otherwise enforce auth
        pass

    queue = agent_stream_bus.subscribe(session_id)

    async def event_gen() -> AsyncIterator[str]:
        try:
            # Initial hello
            yield f"data: {json.dumps(_envelope('connection_established', session_id, None, {}))}\n\n"
            while True:
                event = await queue.get()
                yield f"data: {json.dumps(event)}\n\n"
        except asyncio.CancelledError:
            # Client disconnected; exit gracefully
            return

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    })


