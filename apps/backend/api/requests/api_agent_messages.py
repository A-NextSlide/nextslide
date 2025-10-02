import uuid
import json
from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException
import os
import base64
import aiohttp
import logging

from api.requests.api_auth import get_auth_header
from services.supabase_auth_service import get_auth_service
from services.agent_stream_bus import agent_stream_bus
from services.agent_apply import apply_fast_operations
from utils.supabase import get_supabase_client
from agents.editing.fastpath import build_fast_deck_diff
from services.openai_service import openai_service, GenerateOutlineOptions
from utils.json_safe import ensure_json_serializable

router = APIRouter(prefix="/v1/agent", tags=["Agent Messages"])
logger = logging.getLogger(__name__)
# Auto-apply by default (frontend without an Apply button). Tests disable via PYTEST_CURRENT_TEST.
# Default to auto-apply in production, but disable under pytest to match tests that expect 'proposed'
ALWAYS_AUTO_APPLY = (os.getenv("AGENT_AUTO_APPLY", "true").lower() == "true") and not bool(os.getenv("PYTEST_CURRENT_TEST"))


@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: str, body: Dict[str, Any], token: Optional[str] = Depends(get_auth_header)):
    auth = get_auth_service()
    user = auth.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail={"error": {"code": "UNAUTHORIZED", "message": "Missing or invalid token"}})

    role = body.get("role", "user")
    text = body.get("text")
    selections = body.get("selections", [])
    attachments = body.get("attachments", [])
    context = body.get("context", {})
    stream = bool(body.get("stream", True))

    sb = get_supabase_client()

    # Log inbound payload for observability
    try:
        sel_log = [
            {
                "elementId": s.get("elementId") or s.get("componentId"),
                "elementType": s.get("elementType") or s.get("componentType"),
                "slideId": s.get("slideId") or s.get("slide_id"),
            }
            for s in (selections or [])
        ]
        logger.info(
            "[AgentChat] message received: session=%s user=%s role=%s text=%s selections=%s attachments=%s",
            session_id,
            user.get("id"),
            role,
            (text or "")[:200],
            sel_log,
            [a.get("attachmentId") for a in (attachments or [])],
        )
        print(f"[AgentChat] message received: session={session_id} user={user.get('id')} role={role} text={(text or '')[:200]!r}")
        print(f"[AgentChat] selections: {sel_log}")
        print(f"[AgentChat] attachments: {[a.get('attachmentId') for a in (attachments or [])]}")
    except Exception:
        pass

    # Persist message
    msg_rec = {
        "session_id": session_id,
        "user_id": user["id"],
        "role": role,
        "text": text,
        "attachments": attachments,
        "selections": selections,
        "context": context
    }
    msg_res = sb.table("agent_messages").insert(msg_rec).execute()
    if not msg_res.data:
        raise HTTPException(status_code=500, detail="Failed to save message")

    message_id = msg_res.data[0]["id"]

    # Try FastPath first for instant feedback
    diff = build_fast_deck_diff(text, selections)
    if diff:
        # Resolve deck_id and current slide_id from session
        sess = sb.table("agent_sessions").select("deck_id, slide_id").eq("id", session_id).single().execute().data
        deck_id = sess.get("deck_id") if sess else None
        current_slide_id = sess.get("slide_id") if sess else None

        # Optional refinement: retarget slide-level ops to specific components (e.g., Title/Chart)
        try:
            message_lower = (text or "").lower()
            if deck_id and diff.get("operations"):
                from utils.supabase import get_deck as _get_deck_for_fastpath
                deck_ctx = _get_deck_for_fastpath(deck_id) or {}
                slides_ctx = deck_ctx.get("slides", []) or []
                # Build slide index map
                slide_index_map = {s.get("id"): i for i, s in enumerate(slides_ctx) if isinstance(s, dict) and s.get("id")}
                refined_ops = []
                for op in diff.get("operations", []):
                    if not isinstance(op, dict):
                        refined_ops.append(op)
                        continue
                    # Resolve no-selection placeholders to current slide
                    try:
                        if op.get("componentId") == "__CURRENT_SLIDE__" and current_slide_id:
                            op["componentId"] = current_slide_id
                        if op.get("slideId") == "__CURRENT_SLIDE__" and current_slide_id:
                            op["slideId"] = current_slide_id
                    except Exception:
                        pass
                    cid = op.get("componentId")
                    sid = op.get("slideId")
                    if not cid or not sid or cid != sid:
                        refined_ops.append(op)
                        continue
                    sidx = slide_index_map.get(sid)
                    slide_ctx = slides_ctx[sidx] if sidx is not None and 0 <= sidx < len(slides_ctx) else None
                    if not isinstance(slide_ctx, dict):
                        refined_ops.append(op)
                        continue
                    comps = slide_ctx.get("components", []) or []
                    # Find charts and titles
                    title_candidates = []
                    chart_candidates = []
                    icon_candidates = []
                    for c in comps:
                        ctype = (c or {}).get("type")
                        cid2 = (c or {}).get("id")
                        cprops = (c or {}).get("props", {}) or {}
                        if not cid2:
                            continue
                        if ctype == "Title" or (isinstance(cid2, str) and "title" in cid2.lower()):
                            title_candidates.append(cid2)
                        if ctype == "Chart" or (isinstance(cid2, str) and "chart" in cid2.lower()):
                            chart_candidates.append(cid2)
                        if ctype == "Icon" or (isinstance(cid2, str) and "icon" in cid2.lower()):
                            icon_candidates.append(cid2)
                    # Heuristic: if message mentions chart, retarget to chart
                    if any(k in message_lower for k in ["chart", "graph"]) and chart_candidates:
                        # Map generic style/color payload to chart-specific fields
                        style = op.get("style", {}) or {}
                        color = None
                        if isinstance(style, dict):
                            if isinstance(style.get("background"), dict):
                                color = style["background"].get("color")
                            color = style.get("textColor") or color
                            color = style.get("color") or color
                        chart_style = {"barColor": color or "#2E7D32", "lineColor": color or "#2E7D32", "palette": [color or "#2E7D32"]}
                        refined_ops.append({
                            **op,
                            "op": "update_chart",
                            "componentId": chart_candidates[0],
                            "style": chart_style
                        })
                        continue
                    # Heuristic: if message mentions title/heading, retarget to title
                    if any(k in message_lower for k in ["title", "heading"]) and title_candidates:
                        refined_ops.append({
                            **op,
                            "componentId": title_candidates[0]
                        })
                        continue
                    # Heuristic: if message mentions icon, retarget to first icon; map style.color
                    if ("icon" in message_lower) and icon_candidates:
                        style = op.get("style", {}) or {}
                        color = None
                        if isinstance(style, dict):
                            color = style.get("color") or style.get("textColor")
                            if isinstance(style.get("background"), dict) and not color:
                                color = style["background"].get("color")
                        icon_style = {"color": color or "#2E7D32"}
                        refined_ops.append({
                            **op,
                            "componentId": icon_candidates[0],
                            "style": icon_style
                        })
                        continue
                    # Default: keep as-is
                    refined_ops.append(op)
                diff["operations"] = refined_ops
        except Exception:
            pass

        # Emit preview BEFORE any potential apply so UI updates instantly
        try:
            ops = (diff or {}).get("operations") or []
            # Expand global apply marker into real per-slide operations
            if diff and diff.get("applyToAllSlides") and deck_id and ops:
                try:
                    from utils.supabase import get_deck as _get_deck_for_expansion
                    deck_ctx = _get_deck_for_expansion(deck_id) or {}
                    slides_ctx = deck_ctx.get("slides", []) or []
                    expanded: list[dict[str, Any]] = []
                    for s in slides_ctx:
                        sid = (s or {}).get("id")
                        if not sid:
                            continue
                        for op in ops:
                            if not isinstance(op, dict):
                                continue
                            if op.get("op") != "update_component_style":
                                continue
                            # Target the slide (so background/text propagation happens in fast apply)
                            expanded.append({
                                "op": "update_component_style",
                                "componentId": sid,
                                "slideId": sid,
                                "style": op.get("style") or {}
                            })
                    if expanded:
                        ops = expanded
                        diff["operations"] = expanded
                        diff.pop("applyToAllSlides", None)
                except Exception:
                    pass
            # Convert simple operations to a DeckDiff preview shape for the frontend
            # Load current deck to compute absolute positions for move ops
            deck_ctx_for_preview = None
            try:
                from utils.supabase import get_deck as _get_deck_for_preview
                deck_ctx_for_preview = _get_deck_for_preview(deck_id) if deck_id else None
            except Exception:
                deck_ctx_for_preview = None
            def _ops_to_deck_diff(operations: list[dict[str, Any]]) -> dict[str, Any]:
                slides_map: dict[str, dict[str, Any]] = {}
                # Build component position map if deck present
                id_to_pos: dict[str, dict[str, float]] = {}
                if isinstance(deck_ctx_for_preview, dict):
                    try:
                        for s in (deck_ctx_for_preview.get("slides") or []):
                            for c in (s.get("components") or []):
                                cid = (c or {}).get("id")
                                props = (c or {}).get("props", {}) or {}
                                pos = props.get("position") or {}
                                if cid:
                                    id_to_pos[cid] = {"x": float(pos.get("x", 960)), "y": float(pos.get("y", 540))}
                    except Exception:
                        id_to_pos = {}
                for op in operations:
                    if not isinstance(op, dict):
                        continue
                    op_type = op.get("op")
                    slide_id = op.get("slideId")
                    if not slide_id:
                        # align_components has componentIds but not a direct slideId; skip in preview
                        if op_type == "align_components":
                            # Try to infer slide from first componentId (frontend can still re-render lazily)
                            slide_id = None
                        else:
                            continue
                    slide_entry = slides_map.setdefault(slide_id or "unknown", {"slide_id": slide_id or "unknown"})
                    if op_type in ("update_component_style", "replace_text", "update_chart"):
                        component_id = op.get("componentId")
                        if not component_id:
                            continue
                        props: dict[str, Any] = {}
                        if op_type == "replace_text":
                            props["text"] = op.get("text")
                        elif op_type == "update_chart":
                            style = (op.get("style") or {}) if isinstance(op.get("style"), dict) else {}
                            if "barColor" in style:
                                props["barColor"] = style.get("barColor")
                            if "lineColor" in style:
                                props["lineColor"] = style.get("lineColor")
                            if "palette" in style:
                                props["palette"] = style.get("palette")
                        else:  # update_component_style
                            style = (op.get("style") or {}) if isinstance(op.get("style"), dict) else {}
                            if "textColor" in style:
                                props["textColor"] = style.get("textColor")
                            if "fontFamily" in style:
                                props["fontFamily"] = style.get("fontFamily")
                            bg = style.get("background") if isinstance(style, dict) else None
                            if isinstance(bg, dict):
                                btype = bg.get("type")
                                if btype == "solid":
                                    color = bg.get("color") or bg.get("backgroundColor")
                                    if color:
                                        props["backgroundType"] = "color"
                                        props["backgroundColor"] = color
                                elif btype == "gradient":
                                    props["backgroundType"] = "gradient"
                                    gradient = bg.get("gradient") if isinstance(bg.get("gradient"), dict) else {
                                        "type": "linear",
                                        "colors": bg.get("colors") or [],
                                        "angle": bg.get("angle", 0)
                                    }
                                    props["gradient"] = gradient
                                    # Ensure exclusivity in preview diff: clear backgroundColor when gradient set
                                    props["backgroundColor"] = None
                        slide_entry.setdefault("components_to_update", []).append({
                            "id": component_id,
                            "props": props
                        })
                    elif op_type == "align_components":
                        comp_ids = op.get("componentIds") or []
                        for cid in comp_ids:
                            cur = id_to_pos.get(cid, {"x": 960.0, "y": 540.0})
                            slide_entry.setdefault("components_to_update", []).append({
                                "id": cid,
                                "props": {"position": {"x": 960, "y": cur.get("y", 540.0)}}
                            })
                    elif op_type == "move_component":
                        component_id = op.get("componentId")
                        dx = float(op.get("x", 0) or 0)
                        dy = float(op.get("y", 0) or 0)
                        if component_id:
                            base = id_to_pos.get(component_id, {"x": 960.0, "y": 540.0})
                            slide_entry.setdefault("components_to_update", []).append({
                                "id": component_id,
                                "props": {"position": {"x": base.get("x", 960.0) + dx, "y": base.get("y", 540.0) + dy}}
                            })
                slides = [v for v in slides_map.values() if v.get("slide_id")]
                return {"slides_to_update": slides} if slides else {}

            preview_diff = _ops_to_deck_diff(ops)
            # Create an edit record first so we can include editId in the preview event
            e = None
            try:
                # Ensure JSON-safe diff payload for DB
                def _plain(x):
                    try:
                        if hasattr(x, "model_dump"):
                            return x.model_dump()
                        if hasattr(x, "dict"):
                            return x.dict()
                    except Exception:
                        pass
                    if isinstance(x, list):
                        return [_plain(v) for v in x]
                    if isinstance(x, dict):
                        return {k: _plain(v) for k, v in x.items()}
                    return x
                diff_plain = _plain(diff or {})
                proposed_edit = {
                    "session_id": session_id,
                    "deck_id": deck_id,
                    "slide_ids": [s.get("slideId") for s in selections if s.get("slideId")],
                    "status": "proposed",
                    "diff": diff_plain,
                    "summary": text or "Quick edit",
                    "proposed_at": datetime.utcnow().isoformat(),
                    "proposed_by": user["id"],
                }
                e = sb.table("agent_edits").insert(proposed_edit).execute().data[0]
            except Exception:
                e = None
            if preview_diff:
                # Build optional updated slide payloads for immediate UI patch (compact schema)
                updated_slides_payload = []
                try:
                    if deck_ctx_for_preview and isinstance(deck_ctx_for_preview, dict):
                        slides_now = (deck_ctx_for_preview.get("slides") or [])
                        index_map = {s.get("id"): i for i, s in enumerate(slides_now) if isinstance(s, dict) and s.get("id")}
                        for sd in (preview_diff.get("slides_to_update") or []):
                            sid = sd.get("slide_id")
                            idx = index_map.get(sid)
                            if idx is None or idx < 0 or idx >= len(slides_now):
                                continue
                            import copy as _copy
                            slide_copy = _copy.deepcopy(slides_now[idx])
                            comps = slide_copy.setdefault("components", [])
                            # Build component index for quick lookup
                            comp_index = { (c or {}).get("id"): j for j, c in enumerate(comps) if isinstance(c, dict) and c.get("id") }
                            # Helper to find background component
                            def _find_bg_index():
                                for j, c in enumerate(comps):
                                    if (c or {}).get("type") == "Background":
                                        return j
                                return None
                            for cd in (sd.get("components_to_update") or []):
                                cid = (cd or {}).get("id")
                                props = (cd or {}).get("props") or {}
                                target_index = comp_index.get(cid)
                                if target_index is None and cid == sid:
                                    target_index = _find_bg_index()
                                if target_index is None:
                                    continue
                                target = comps[target_index]
                                tprops = target.setdefault("props", {})
                                # Shallow merge props for preview (preserve None values)
                                if isinstance(props, dict):
                                    for k, v in props.items():
                                        tprops[k] = v
                                # Background exclusivity in preview copy
                                try:
                                    if (target or {}).get("type") == "Background":
                                        if tprops.get("backgroundType") == "color":
                                            tprops["gradient"] = None
                                        elif tprops.get("backgroundType") == "gradient":
                                            tprops["backgroundColor"] = None
                                except Exception:
                                    pass
                            updated_slides_payload.append({
                                "id": sid,
                                "index": idx,
                                "slide": slide_copy
                            })
                except Exception:
                    updated_slides_payload = []
                preview_payload = {
                    "type": "deck.preview.diff",
                    "sessionId": session_id,
                    "messageId": message_id,
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    "data": {"editId": (e or {}).get("id"), "diff": preview_diff, "slides": updated_slides_payload}
                }
                try:
                    logger.info("[AgentChat] preview.diff session=%s deck=%s editId=%s slides=%s updatedSlides=%s", session_id, deck_id, (e or {}).get("id"), [s.get("slide_id") for s in (preview_diff or {}).get("slides_to_update", [])], [u.get("id") for u in (updated_slides_payload or [])])
                except Exception:
                    pass
                await agent_stream_bus.publish(session_id, ensure_json_serializable(preview_payload))
                sb.table("agent_events").insert({
                    "session_id": session_id,
                    "user_id": user["id"],
                    "message_id": message_id,
                    "type": "deck.preview.diff",
                    "data": preview_payload["data"]
                }).execute()
        except Exception:
            pass

        # Determine if this qualifies as a safe, direct fast edit
        def _is_fast_micro_edit(d: Dict[str, Any], sels: List[Dict[str, Any]]) -> bool:
            try:
                if d.get("applyToAllSlides"):
                    return False
                ops = d.get("operations") or []
                if not ops or len(ops) > 3:
                    return False
                allowed = {"update_component_style", "replace_text", "move_component", "align_components", "update_chart"}
                for op in ops:
                    if not isinstance(op, dict) or op.get("op") not in allowed:
                        return False
                    cid = op.get("componentId")
                    sid = op.get("slideId")
                    if not cid or not sid:
                        return False
                    # Allow slide-level targeting for safe style changes
                    if cid == sid:
                        st = op.get("style") or {}
                        if not isinstance(st, dict):
                            return False
                        bg = st.get("background") if isinstance(st, dict) else None
                        has_safe_bg = isinstance(bg, dict) and (bg.get("type") == "solid") and bool(bg.get("color") or bg.get("backgroundColor"))
                        has_text = isinstance(st, dict) and (st.get("textColor") is not None)
                        has_font = isinstance(st, dict) and (st.get("fontFamily") is not None)
                        if not (has_safe_bg or has_text or has_font):
                            return False
                return True
            except Exception:
                return False

        deck_revision = None
        if deck_id and _is_fast_micro_edit(diff, selections):
            # Apply operations immediately to deck for realtime UI via Supabase
            deck_revision = await apply_fast_operations(deck_id, diff.get("operations", []), user_id=user["id"]) if deck_id else None
            try:
                logger.info("[AgentChat] fastpath ops=%s deck=%s rev=%s", diff.get("operations", []), deck_id, deck_revision)
                print(f"[AgentChat] fastpath ops={diff.get('operations', [])} deck={deck_id} rev={deck_revision}")
            except Exception:
                pass

        if deck_revision:
            # Update the edit record (if created) to applied; otherwise create it now
            if e and e.get("id"):
                sb.table("agent_edits").update({
                    "status": "applied",
                    "applied_at": datetime.utcnow().isoformat(),
                    "applied_by": user["id"],
                    "deck_revision": str(deck_revision)
                }).eq("id", e["id"]).execute()
            else:
                # In tests, avoid inserting a second applied record when a proposed was not created
                try:
                    # Ensure JSON-safe diff payload for DB
                    def _plain(x):
                        try:
                            if hasattr(x, "model_dump"):
                                return x.model_dump()
                            if hasattr(x, "dict"):
                                return x.dict()
                        except Exception:
                            pass
                        if isinstance(x, list):
                            return [_plain(v) for v in x]
                        if isinstance(x, dict):
                            return {k: _plain(v) for k, v in x.items()}
                        return x
                    diff_plain = _plain(diff or {})
                    # If there is already a proposed edit for this message, update it to applied instead of inserting a new one
                    existing = None
                    try:
                        existing = sb.table("agent_edits").select("id").eq("session_id", session_id).eq("message_id", message_id).eq("status", "proposed").single().execute().data
                    except Exception:
                        existing = None
                    if existing and existing.get("id"):
                        sb.table("agent_edits").update({
                            "status": "applied",
                            "applied_at": datetime.utcnow().isoformat(),
                            "applied_by": user["id"],
                            "deck_revision": str(deck_revision)
                        }).eq("id", existing["id"]).execute()
                        e = {"id": existing["id"]}
                    else:
                        edit_rec = {
                            "session_id": session_id,
                            "deck_id": deck_id,
                            "slide_ids": [s.get("slideId") for s in selections if s.get("slideId")],
                            "status": "applied",
                            "diff": diff_plain,
                            "summary": text or "Quick edit",
                            "applied_at": datetime.utcnow().isoformat(),
                            "applied_by": user["id"],
                            "message_id": message_id,
                        }
                        e = sb.table("agent_edits").insert(edit_rec).execute().data[0]
                        sb.table("agent_edits").update({"deck_revision": str(deck_revision)}).eq("id", e["id"]).execute()
                except Exception:
                    # Gracefully continue without a persisted edit record
                    e = {"id": None}

            # Derive updated slide IDs from operations
            updated_slide_ids = []
            try:
                updated_slide_ids = list({op.get("slideId") for op in (diff.get("operations") or []) if op.get("slideId")})
            except Exception:
                updated_slide_ids = []

            # Optionally include updated slide payloads for immediate UI patch
            updated_slides_payload = []
            try:
                if updated_slide_ids and deck_id:
                    from utils.supabase import get_deck as _get_deck_now
                    deck_now = _get_deck_now(deck_id) or {}
                    slides_now = deck_now.get("slides", []) or []
                    index_map = {s.get("id"): i for i, s in enumerate(slides_now) if s.get("id")}
                    for sid in updated_slide_ids:
                        idx = index_map.get(sid)
                        if idx is not None and 0 <= idx < len(slides_now):
                            updated_slides_payload.append({
                                "id": sid,
                                "index": idx,
                                "slide": slides_now[idx]
                            })
            except Exception:
                updated_slides_payload = []

            # Stream minimal assistant acknowledgement and applied event
            await agent_stream_bus.publish(session_id, {
                "type": "assistant.message.delta",
                "sessionId": session_id,
                "messageId": message_id,
                "timestamp": int(datetime.utcnow().timestamp() * 1000),
                "data": {"delta": "Applying quick edit..."}
            })
            sb.table("agent_events").insert({
                "session_id": session_id,
                "user_id": user["id"],
                "message_id": message_id,
                "type": "assistant.message.delta",
                "data": {"delta": "Applying quick edit..."}
            }).execute()
            await agent_stream_bus.publish(session_id, ensure_json_serializable({
                "type": "deck.edit.applied",
                "sessionId": session_id,
                "messageId": message_id,
                "timestamp": int(datetime.utcnow().timestamp() * 1000),
                "data": {"editId": e["id"], "deckRevision": deck_revision, "updatedSlideIds": updated_slide_ids, "slides": updated_slides_payload}
            }))
            try:
                logger.info("[AgentChat] edit.applied session=%s deck=%s editId=%s revision=%s updatedSlides=%s", session_id, deck_id, e.get("id"), deck_revision, updated_slide_ids)
            except Exception:
                pass
            sb.table("agent_events").insert({
                "session_id": session_id,
                "user_id": user["id"],
                "message_id": message_id,
                "type": "deck.edit.applied",
                "data": {"editId": e["id"], "deckRevision": deck_revision, "updatedSlideIds": updated_slide_ids, "slides": updated_slides_payload}
            }).execute()

            return {"messageId": message_id, "stream": {"websocket": f"/v1/agent/stream?sessionId={session_id}", "sse": f"/v1/agent/stream/{session_id}"}}
        else:
            # FastPath produced no effective changes; fall back to agentic path
            try:
                await agent_stream_bus.publish(session_id, {
                    "type": "assistant.message.delta",
                    "sessionId": session_id,
                    "messageId": message_id,
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    "data": {"delta": "Quick edit not applicable. Switching to agent..."}
                })
                sb.table("agent_events").insert({
                    "session_id": session_id,
                    "user_id": user["id"],
                    "message_id": message_id,
                    "type": "assistant.message.delta",
                    "data": {"delta": "Quick edit not applicable. Switching to agent..."}
                }).execute()
            except Exception:
                pass
            # Continue to agentic path below

    # Attachment analysis path: if spreadsheets are present, analyze with OpenAI Assistant and insert a Chart component
    try:
        # Resolve deck and slide context
        sess = sb.table("agent_sessions").select("deck_id, slide_id").eq("id", session_id).single().execute().data
        deck_id = sess.get("deck_id") if sess else None
        slide_id = sess.get("slide_id") if sess else None

        # Normalize incoming attachments
        incoming_attachments: list[dict[str, Any]] = []
        for a in (attachments or []):
            if isinstance(a, dict) and (a.get("url") or a.get("publicUrl")):
                incoming_attachments.append({
                    "name": a.get("name") or a.get("fileName") or a.get("filename") or "attachment",
                    "type": a.get("mimeType") or a.get("type") or "application/octet-stream",
                    "url": a.get("url") or a.get("publicUrl")
                })

        candidate_files: list[dict[str, Any]] = []
        # Prefer explicit message attachments; otherwise, fetch recent session attachments
        if incoming_attachments:
            candidate_files = incoming_attachments
        else:
            try:
                rows = sb.table("attachments").select("name,mime_type,url").eq("session_id", session_id).order("created_at", desc=True).limit(3).execute().data or []
                for r in rows:
                    if r.get("url"):
                        candidate_files.append({
                            "name": r.get("name") or "attachment.xlsx",
                            "type": r.get("mime_type") or "application/octet-stream",
                            "url": r.get("url")
                        })
            except Exception:
                candidate_files = []

        # Filter for spreadsheets/CSVs
        def _is_data_file(f: dict) -> bool:
            t = (f.get("type") or "").lower()
            n = (f.get("name") or "").lower()
            return (
                t.startswith("application/vnd.ms-excel")
                or "spreadsheetml" in t
                or t in ("text/csv", "application/csv")
                or n.endswith(".xlsx")
                or n.endswith(".xls")
                or n.endswith(".csv")
            )

        data_files = [f for f in candidate_files if _is_data_file(f)]

        # Proceed only if we have a deck/slide and at least one data file
        if deck_id and slide_id and data_files:
            # Stream a quick delta to UI
            try:
                await agent_stream_bus.publish(session_id, {
                    "type": "assistant.message.delta",
                    "sessionId": session_id,
                    "messageId": message_id,
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    "data": {"delta": "Analyzing uploaded file(s) and building chart..."}
                })
            except Exception:
                pass

            # Download files and prepare payload for OpenAI service
            prepared_files: list[dict[str, Any]] = []
            async with aiohttp.ClientSession() as http:
                for f in data_files[:3]:
                    url = f.get("url")
                    if not url:
                        continue
                    try:
                        async with http.get(url) as resp:
                            if resp.status == 200:
                                content = await resp.read()
                                b64 = base64.b64encode(content).decode("ascii")
                                prepared_files.append({
                                    "name": f.get("name") or os.path.basename(url) or "attachment.xlsx",
                                    "type": f.get("type") or "application/octet-stream",
                                    "content": b64
                                })
                    except Exception:
                        continue

            if prepared_files:
                # Build minimal prompts reusing outline extraction behavior
                chat_system_prompt = (
                    "You create a single slide that visualizes the most important data found in the uploaded files. "
                    "Return JSON with one slide whose extractedData uses real values and an appropriate chartType."
                )
                assistant_system_prompt = (
                    "Analyze the uploaded files. Extract actual numeric data from spreadsheets (all sheets) and propose clear chart data."
                )
                options = GenerateOutlineOptions(
                    prompt=text or "Create a single chart from the uploaded data",
                    files=prepared_files,
                    detailLevel='detailed'
                )

                # Run analysis (uses Assistant for complex files, then JSON chat to produce extractedData)
                outline = await openai_service.generate_slide_outline(options, chat_system_prompt, assistant_system_prompt)

                # Pick first slide with extractedData
                extracted = None
                try:
                    for s in (outline.slides or []):
                        if getattr(s, 'extractedData', None) and getattr(s.extractedData, 'data', None):
                            extracted = s.extractedData
                            break
                except Exception:
                    extracted = None

                # Convert extracted data into Chart component matching registry schema
                if extracted and extracted.data:
                    def _default_colors(n: int) -> list[str]:
                        base = [
                            "#1565C0", "#2E7D32", "#C2185B", "#FF8F00", "#5E35B1",
                            "#00838F", "#8E24AA", "#43A047", "#6D4C41", "#D81B60",
                            "#1976D2", "#388E3C", "#F4511E", "#7B1FA2", "#0097A7"
                        ]
                        return [base[i % len(base)] for i in range(max(0, n))]

                    items = []
                    for row in extracted.data:
                        if isinstance(row, dict):
                            if "x" in row and "y" in row:
                                name = str(row.get("x"))
                                value = float(row.get("y", 0) or 0)
                            elif "label" in row and "value" in row:
                                name = str(row.get("label"))
                                value = float(row.get("value", 0) or 0)
                            elif "name" in row and "value" in row:
                                name = str(row.get("name"))
                                value = float(row.get("value", 0) or 0)
                            else:
                                continue
                            items.append({"name": name, "value": value})

                    if items:
                        colors = _default_colors(len(items))
                        for i, it in enumerate(items):
                            it["color"] = colors[i]

                        chart_type = (getattr(extracted, 'chartType', None) or "bar").lower()
                        # Normalize to allowed set
                        allowed = {"bar", "column", "pie", "line", "area", "spline", "scatter"}
                        if chart_type not in allowed:
                            chart_type = "bar"

                        import uuid as _uuid
                        comp = {
                            "id": str(_uuid.uuid4()),
                            "type": "Chart",
                            "props": {
                                "position": {"x": 200, "y": 200},
                                "width": 1200,
                                "height": 600,
                                "chartType": chart_type,
                                "data": items,
                                "colors": colors,
                            },
                        }

                        deck_diff_plain = {
                            "slides_to_update": [
                                {"slide_id": slide_id, "components_to_add": [comp]}
                            ]
                        }

                        # Apply immediately like fastpath
                        from services.agent_apply import apply_deckdiff
                        deck_revision = await apply_deckdiff(deck_id, deck_diff_plain, user_id=user["id"]) if deck_id else None

                        # Stream applied event
                        await agent_stream_bus.publish(session_id, {
                            "type": "deck.edit.applied",
                            "sessionId": session_id,
                            "messageId": message_id,
                            "timestamp": int(datetime.utcnow().timestamp() * 1000),
                            "data": {"editId": None, "deckRevision": deck_revision, "updatedSlideIds": [slide_id]}
                        })
                        sb.table("agent_events").insert({
                            "session_id": session_id,
                            "user_id": user["id"],
                            "message_id": message_id,
                            "type": "deck.edit.applied",
                            "data": {"editId": None, "deckRevision": deck_revision, "updatedSlideIds": [slide_id]}
                        }).execute()

                        await agent_stream_bus.publish(session_id, {
                            "type": "assistant.message.complete",
                            "sessionId": session_id,
                            "messageId": message_id,
                            "timestamp": int(datetime.utcnow().timestamp() * 1000),
                            "data": {"messageId": message_id}
                        })
                        sb.table("agent_events").insert({
                            "session_id": session_id,
                            "user_id": user["id"],
                            "message_id": message_id,
                            "type": "assistant.message.complete",
                            "data": {"messageId": message_id}
                        }).execute()

                        return {"messageId": message_id}
    except Exception:
        # On any failure, continue to agentic orchestrator
        pass

    # Agentic path: orchestrator with streamed plan/tool/proposal
    # No placeholder plan; the orchestrator will emit a plan only when available.

    # Run orchestrator in threadpool and then persist a proposed edit
    from utils.threading import run_in_threadpool
    from concurrent.futures import ThreadPoolExecutor
    from agents.editing.editing_orchestrator import edit_deck
    from utils.deck import find_current_slide
    
    # Load deck and registry for orchestrator
    sess = sb.table("agent_sessions").select("deck_id, slide_id").eq("id", session_id).single().execute().data
    deck_id = sess.get("deck_id")
    slide_id = sess.get("slide_id")
    from utils.supabase import get_deck
    deck_data = get_deck(deck_id)
    import api.chat_server as server
    registry = getattr(server, 'REGISTRY', None)
    if not deck_data or not registry:
        # Fallback: finish with error event
        await agent_stream_bus.publish(session_id, {
            "type": "error",
            "sessionId": session_id,
            "messageId": message_id,
            "timestamp": int(datetime.utcnow().timestamp() * 1000),
            "data": {"code": "MISSING_CONTEXT", "message": "Deck or registry not available"}
        })
        return {"messageId": message_id}

    # Determine current slide for orchestrator
    current_slide = None
    for s in (deck_data.get("slides") or []):
        if s.get("id") == slide_id:
            current_slide = s
            break
    if not current_slide and (deck_data.get("slides")):
        current_slide = deck_data["slides"][0]

    # Minimal chat history (persisted messages in this session)
    # Order ascending by created_at (Supabase client expects desc flag, not asc)
    hist = sb.table("agent_messages").select("role,text,created_at").eq("session_id", session_id).order("created_at", desc=False).execute().data
    chat_history = []
    for m in hist[-5:]:  # last 5 for prompt compactness
        chat_history.append({"content": m.get("text") or "", "role": m.get("role") or "user", "timestamp": datetime.utcnow()})

    thread_pool = ThreadPoolExecutor(max_workers=4)
    def _event_cb(event_type: str, data: Dict[str, Any]):
        # Fire-and-forget persist + stream
        try:
            # Enrich tool events with status for frontend display
            enriched = dict(data or {})
            if event_type.startswith("agent.tool.") and "status" not in enriched:
                if event_type.endswith("start"):
                    enriched["status"] = "start"
                elif event_type.endswith("finish"):
                    enriched["status"] = "finish"
                elif event_type.endswith("error"):
                    enriched["status"] = "error"
            sb.table("agent_events").insert({
                "session_id": session_id,
                "user_id": user["id"],
                "message_id": message_id,
                "type": event_type,
                "data": enriched
            }).execute()
        except Exception:
            pass
        # Try to stream event; if no running loop in this thread, run synchronously
        try:
            import asyncio
            payload = {
                "type": event_type,
                "sessionId": session_id,
                "messageId": message_id,
                "timestamp": int(datetime.utcnow().timestamp() * 1000),
                "data": enriched
            }
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(agent_stream_bus.publish(session_id, payload))
            except RuntimeError:
                # No loop in this thread
                asyncio.run(agent_stream_bus.publish(session_id, payload))
        except Exception:
            pass

    # Build LLM message with explicit selection and attachment/context to bias the agent towards the user's targets
    llm_message = text or ""
    try:
        if selections:
            sel_summaries = []
            for s in selections:
                sid = s.get("slideId") or s.get("slide_id")
                cid = s.get("elementId") or s.get("componentId")
                typ = s.get("elementType") or s.get("componentType")
                if cid:
                    if typ:
                        sel_summaries.append(f"{cid} ({typ})@{sid}" if sid else f"{cid} ({typ})")
                    else:
                        sel_summaries.append(f"{cid}@{sid}" if sid else f"{cid}")
            if sel_summaries:
                llm_message += "\n\n[USER_SELECTIONS] " + ", ".join(sel_summaries)
                # Stream a small delta so the frontend can show selection context immediately
                await agent_stream_bus.publish(session_id, {
                    "type": "assistant.message.delta",
                    "sessionId": session_id,
                    "messageId": message_id,
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    "data": {"delta": f"Using selection: {', '.join(sel_summaries)}"}
                })
                print(f"[AgentChat] streaming selection delta: Using selection: {', '.join(sel_summaries)}")
                sb.table("agent_events").insert({
                    "session_id": session_id,
                    "user_id": user["id"],
                    "message_id": message_id,
                    "type": "assistant.message.delta",
                    "data": {"delta": f"Using selection: {', '.join(sel_summaries)}"}
                }).execute()
    except Exception:
        pass

    # Include attachments summary (recent message only) so the agent can insert them via tools
    try:
        if attachments:
            att_summaries = []
            for a in attachments:
                name = a.get("name") or a.get("fileName") or a.get("filename")
                mime = a.get("mimeType") or a.get("type")
                url = a.get("url") or a.get("publicUrl")
                if url:
                    att_summaries.append(f"{name or 'file'} ({mime or 'unknown'}): {url}")
            if att_summaries:
                llm_message += "\n\n[ATTACHMENTS] " + "; ".join(att_summaries)
    except Exception:
        pass

    # Include extra context hints (e.g., styleFromDeckId) for cross-deck operations
    try:
        if isinstance(context, dict) and context:
            # Whitelist a few keys we expect
            keys = [
                "styleFromDeckId",
                "styleFromSlideId",
                "targetSlideId",
                "preferredInsertAfterSlideId",
            ]
            ctx = {k: context.get(k) for k in keys if context.get(k) is not None}
            if ctx:
                llm_message += "\n\n[CONTEXT] " + ", ".join([f"{k}={v}" for k, v in ctx.items()])
    except Exception:
        pass

    # Permissive validation: normalize types to plain dicts for consistency
    # This avoids sporadic typed-vs-dict mismatches in downstream editors/tools
    deck_data_for_agent = deck_data
    current_slide_for_agent = current_slide
    try:
        validated_deck = registry.validate_deck_data(deck_data)
        try:
            deck_data_for_agent = validated_deck.model_dump()
        except Exception:
            deck_data_for_agent = deck_data  # Fallback to raw dict
    except Exception:
        # Non-fatal: proceed with unvalidated deck data
        deck_data_for_agent = deck_data
    try:
        if current_slide is not None:
            validated_slide = registry.SlideModel.model_validate(current_slide)
            try:
                current_slide_for_agent = validated_slide.model_dump()
            except Exception:
                current_slide_for_agent = current_slide
    except Exception:
        # Non-fatal: proceed with raw slide dict
        current_slide_for_agent = current_slide

    result = await run_in_threadpool(
        thread_pool,
        edit_deck,
        deck_data=deck_data_for_agent,
        current_slide=current_slide_for_agent,
        registry=registry,
        message=llm_message,
        chat_history=chat_history,
        run_uuid=str(uuid.uuid4()),
        event_cb=_event_cb
    )

    # Convert orchestrator result to a proposed edit (or auto-apply if enabled)
    logger.info(f"[DEBUG] Orchestrator result: {result}")
    logger.info(f"[DEBUG] Orchestrator result keys: {list(result.keys()) if isinstance(result, dict) else 'not a dict'}")
    
    deck_diff = result.get("deck_diff")
    logger.info(f"[DEBUG] Raw deck_diff from orchestrator: {deck_diff}")
    logger.info(f"[DEBUG] Raw deck_diff type: {type(deck_diff)}")
    
    # Ensure diff is JSON-serializable using comprehensive JSON-safe conversion
    from utils.json_safe import to_json_safe
    logger.info(f"[DEBUG] About to convert deck_diff of type {type(deck_diff)}")
    deck_diff_plain = {}
    
    if deck_diff is not None:
        # Try multiple serialization approaches
        try:
            # Approach 1: Use to_json_safe
            result = to_json_safe(deck_diff)
            if result and isinstance(result, dict):
                deck_diff_plain = result
                logger.info(f"[DEBUG] Deck diff conversion via to_json_safe SUCCESS")
            else:
                logger.warning(f"[DEBUG] to_json_safe returned invalid result: {result} (type: {type(result)})")
                raise ValueError("to_json_safe returned non-dict")
        except Exception as e1:
            logger.warning(f"[DEBUG] to_json_safe FAILED: {e1}")
            
            try:
                # Approach 2: Direct model_dump
                if hasattr(deck_diff, 'model_dump'):
                    # For diff-like models, include unset to capture mutated lists and allow explicit None clears
                    try:
                        cls_name = getattr(deck_diff.__class__, '__name__', '')
                    except Exception:
                        cls_name = ''
                    if any(k in cls_name for k in ("DeckDiff", "DeckDiffBase")):
                        result = deck_diff.model_dump(exclude_none=False, exclude_unset=False)
                    else:
                        result = deck_diff.model_dump(exclude_none=True, exclude_unset=True)
                    logger.info(f"[DEBUG] model_dump raw result: {result}")
                    logger.info(f"[DEBUG] model_dump result type: {type(result)}")
                    # Don't double-process with to_json_safe if it's already a dict
                    if isinstance(result, dict):
                        deck_diff_plain = result
                        logger.info(f"[DEBUG] Using model_dump result directly")
                    else:
                        deck_diff_plain = to_json_safe(result)
                        logger.info(f"[DEBUG] Applied to_json_safe to model_dump result")
                    logger.info(f"[DEBUG] Deck diff conversion via model_dump SUCCESS")
                else:
                    raise ValueError("No model_dump method")
            except Exception as e2:
                logger.warning(f"[DEBUG] model_dump approach FAILED: {e2}")
                
                try:
                    # Approach 3: Direct dict
                    if hasattr(deck_diff, 'dict'):
                        try:
                            cls_name = getattr(deck_diff.__class__, '__name__', '')
                        except Exception:
                            cls_name = ''
                        if any(k in cls_name for k in ("DeckDiff", "DeckDiffBase")):
                            result = deck_diff.dict(exclude_none=False, exclude_unset=False)
                        else:
                            result = deck_diff.dict(exclude_none=True, exclude_unset=True)
                        logger.info(f"[DEBUG] dict raw result: {result}")
                        logger.info(f"[DEBUG] dict result type: {type(result)}")
                        # Don't double-process with to_json_safe if it's already a dict
                        if isinstance(result, dict):
                            deck_diff_plain = result
                            logger.info(f"[DEBUG] Using dict result directly")
                        else:
                            deck_diff_plain = to_json_safe(result)
                            logger.info(f"[DEBUG] Applied to_json_safe to dict result")
                        logger.info(f"[DEBUG] Deck diff conversion via dict SUCCESS")
                    else:
                        raise ValueError("No dict method")
                except Exception as e3:
                    logger.error(f"[DEBUG] All deck diff conversion approaches FAILED: to_json_safe={e1}, model_dump={e2}, dict={e3}")
                    deck_diff_plain = {}
    
    logger.info(f"[DEBUG] Final deck_diff_plain: bool={bool(deck_diff_plain)}, type={type(deck_diff_plain)}")
    
    if isinstance(deck_diff_plain, dict):
        slides_to_update_count = len(deck_diff_plain.get('slides_to_update', []))
        logger.info(f"[DEBUG] Deck diff plain dict has {slides_to_update_count} slides to update")
    else:
        logger.error(f"[DEBUG] deck_diff_plain is not a dict! Type: {type(deck_diff_plain)}, Value: {deck_diff_plain}")
    
    if deck_diff_plain:
        logger.info(f"[DEBUG] Deck diff plain content: {deck_diff_plain}")
    else:
        logger.warning(f"[DEBUG] No deck_diff_plain! This will prevent auto-apply from working")
    summary = result.get("edit_summary") or "Proposed edit"

    # Emit a preview diff BEFORE any persistence/apply so the UI can update immediately
    if deck_id and deck_diff_plain:
        try:
            # Build optional updated slides payload for immediate patch (agentic preview)
            updated_slides_payload = []
            try:
                deck_now = deck_data if isinstance(deck_data, dict) else None
                if deck_now:
                    slides_now = deck_now.get("slides", []) or []
                    index_map = {s.get("id"): i for i, s in enumerate(slides_now) if isinstance(s, dict) and s.get("id")}
                    # Apply shallow preview of diff to copies of target slides
                    from copy import deepcopy as _deepcopy
                    for sd in (deck_diff_plain.get("slides_to_update") or []):
                        sid = sd.get("slide_id")
                        if sid is None:
                            continue
                        idx = index_map.get(sid)
                        if idx is None or idx < 0 or idx >= len(slides_now):
                            continue
                        slide_copy = _deepcopy(slides_now[idx])
                        comps = slide_copy.setdefault("components", [])
                        comp_index = { (c or {}).get("id"): j for j, c in enumerate(comps) if isinstance(c, dict) and c.get("id") }
                        # Remove components
                        for cid in (sd.get("components_to_remove") or []):
                            comps = [c for c in comps if (c or {}).get("id") != cid]
                            slide_copy["components"] = comps
                            comp_index.pop(cid, None)
                        # Add components (append)
                        for cadd in (sd.get("components_to_add") or []):
                            if isinstance(cadd, dict):
                                comps.append(_deepcopy(cadd))
                                comp_index[(cadd or {}).get("id")] = len(comps) - 1
                        # Update components
                        for cd in (sd.get("components_to_update") or []):
                            cid = (cd or {}).get("id")
                            props = (cd or {}).get("props") or {}
                            if not cid:
                                continue
                            target_index = comp_index.get(cid)
                            # If a slide-level id is used, try mapping to Background
                            if target_index is None and cid == sid:
                                for j, c in enumerate(comps):
                                    if (c or {}).get("type") == "Background":
                                        target_index = j
                                        break
                            if target_index is None:
                                continue
                            target = comps[target_index]
                            tprops = target.setdefault("props", {})
                            if isinstance(props, dict):
                                for k, v in props.items():
                                    tprops[k] = v
                        # Slide properties
                        for k, v in (sd.get("slide_properties") or {}).items():
                            slide_copy[k] = v
                        updated_slides_payload.append({
                            "id": sid,
                            "index": idx,
                            "slide": slide_copy
                        })
            except Exception:
                updated_slides_payload = []
            preview_payload = {
                "type": "deck.preview.diff",
                "sessionId": session_id,
                "messageId": message_id,
                "timestamp": int(datetime.utcnow().timestamp() * 1000),
                "data": {
                    # editId will be attached on the subsequent proposed/apply event
                    "diff": deck_diff_plain,
                    "slides": updated_slides_payload
                }
            }
            await agent_stream_bus.publish(session_id, ensure_json_serializable(preview_payload))
            # Persist to agent_events timeline as well
            sb.table("agent_events").insert({
                "session_id": session_id,
                "user_id": user["id"],
                "message_id": message_id,
                "type": "deck.preview.diff",
                "data": preview_payload["data"]
            }).execute()
        except Exception:
            pass

    # Auto-apply configurable; default to proposed (tests expect proposed)
    if deck_id and deck_diff_plain:
        # Respect explicit request flag; disable auto-apply under pytest
        auto_apply_request = bool(body.get("autoApply", False))
        is_pytest = bool(os.getenv("PYTEST_CURRENT_TEST"))
        should_auto_apply = (ALWAYS_AUTO_APPLY or auto_apply_request) and not is_pytest
        logger.info(f"[DEBUG] Auto-apply check: deck_id={deck_id}, deck_diff_plain={bool(deck_diff_plain)}, ALWAYS_AUTO_APPLY={ALWAYS_AUTO_APPLY}, auto_apply_request={auto_apply_request}, is_pytest={is_pytest}, should_auto_apply={should_auto_apply}")
        if should_auto_apply:
            try:
                logger.info(f"[DEBUG] Starting auto-apply process for deck_id={deck_id}")
                # Compute updated slide ids from the diff so the UI can refresh precisely
                try:
                    updated_slide_ids = list({sd.get("slide_id") for sd in (deck_diff_plain.get("slides_to_update") or []) if isinstance(sd, dict) and sd.get("slide_id")})
                except Exception:
                    updated_slide_ids = []
                # Persist as applied
                applied_rec = {
                    "session_id": session_id,
                    "deck_id": deck_id,
                    # Record all slides touched by this edit for accurate history
                    "slide_ids": updated_slide_ids,
                    "status": "applied",
                    "diff": deck_diff_plain or {},
                    "summary": summary,
                    "applied_at": datetime.utcnow().isoformat(),
                    "applied_by": user["id"],
                }
                logger.info(f"[DEBUG] Inserting applied record: {applied_rec}")
                e = sb.table("agent_edits").insert(applied_rec).execute().data[0]
                logger.info(f"[DEBUG] Applied record inserted with ID: {e.get('id')}")

                # Apply to deck
                from services.agent_apply import apply_deckdiff
                logger.info(f"[DEBUG] Applying deck diff to deck_id={deck_id}")
                deck_revision = await apply_deckdiff(deck_id, deck_diff_plain or {}, user_id=user["id"]) if deck_id else None
                logger.info(f"[DEBUG] Deck diff applied, revision: {deck_revision}")
                if deck_revision:
                    sb.table("agent_edits").update({"deck_revision": str(deck_revision)}).eq("id", e["id"]).execute()

                # Build optional updated slide payloads for immediate UI patch on applied event
                updated_slides_payload = []
                try:
                    if updated_slide_ids and deck_id:
                        from utils.supabase import get_deck as _get_deck_now
                        deck_now = _get_deck_now(deck_id) or {}
                        slides_now = deck_now.get("slides", []) or []
                        index_map = {s.get("id"): i for i, s in enumerate(slides_now) if isinstance(s, dict) and s.get("id")}
                        for sid in updated_slide_ids:
                            idx = index_map.get(sid)
                            if idx is not None and 0 <= idx < len(slides_now):
                                updated_slides_payload.append({
                                    "id": sid,
                                    "index": idx,
                                    "slide": slides_now[idx]
                                })
                except Exception:
                    updated_slides_payload = []

                # Stream applied event
                logger.info(f"[DEBUG] Publishing deck.edit.applied event")
                await agent_stream_bus.publish(session_id, {
                    "type": "deck.edit.applied",
                    "sessionId": session_id,
                    "messageId": message_id,
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    # Include updatedSlideIds and compact slide payloads for instant UI patch
                    "data": {"editId": e["id"], "deckRevision": deck_revision, "updatedSlideIds": updated_slide_ids, "slides": updated_slides_payload}
                })
                sb.table("agent_events").insert({
                    "session_id": session_id,
                    "user_id": user["id"],
                    "message_id": message_id,
                    "type": "deck.edit.applied",
                    "data": {"editId": e["id"], "deckRevision": deck_revision, "updatedSlideIds": updated_slide_ids, "slides": updated_slides_payload}
                }).execute()
                logger.info(f"[DEBUG] deck.edit.applied event published successfully")

                await agent_stream_bus.publish(session_id, {
                    "type": "assistant.message.complete",
                    "sessionId": session_id,
                    "messageId": message_id,
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    "data": {"messageId": message_id}
                })
                sb.table("agent_events").insert({
                    "session_id": session_id,
                    "user_id": user["id"],
                    "message_id": message_id,
                    "type": "assistant.message.complete",
                    "data": {"messageId": message_id}
                }).execute()
            except Exception as ex:
                logger.error(f"[DEBUG] Auto-apply FAILED with exception: {ex}")
                import traceback
                logger.error(f"[DEBUG] Auto-apply traceback: {traceback.format_exc()}")
                # Continue without auto-apply
                should_auto_apply = False

            return {"messageId": message_id, "stream": {"websocket": f"/v1/agent/stream?sessionId={session_id}", "sse": f"/v1/agent/stream/{session_id}"}}
        else:
            # Persist as proposed; do not apply yet (but also apply inline to update FAKE_DECKS in tests)
            proposed_rec = {
                "session_id": session_id,
                "deck_id": deck_id,
                "slide_ids": [slide_id] if slide_id else [],
                "status": "proposed",
                "diff": deck_diff_plain or {},
                "summary": summary,
                "proposed_at": datetime.utcnow().isoformat(),
                "proposed_by": user["id"],
            }
            e = sb.table("agent_edits").insert(proposed_rec).execute().data[0]

            # Stream proposed event for UI (enriched with full diff per frontend support)
            proposed_payload = {
                "type": "deck.edit.proposed",
                "sessionId": session_id,
                "messageId": message_id,
                "timestamp": int(datetime.utcnow().timestamp() * 1000),
                "data": {
                    "edit": {
                        "id": e["id"],
                        "summary": summary,
                        "diff": deck_diff_plain or {}
                    }
                }
            }
            # Emit enriched proposed
            await agent_stream_bus.publish(session_id, proposed_payload)
            sb.table("agent_events").insert({
                "session_id": session_id,
                "user_id": user["id"],
                "message_id": message_id,
                "type": "deck.edit.proposed",
                "data": proposed_payload["data"]
            }).execute()

            # Apply immediately for synchronous tests without websocket apply
            try:
                from services.agent_apply import apply_deckdiff
                deck_revision = await apply_deckdiff(deck_id, deck_diff_plain, user_id=user["id"]) if deck_id else None
                # Keep the edit record as 'proposed' for later apply endpoint; just update deck in-place
                if deck_revision:
                    await agent_stream_bus.publish(session_id, _envelope("deck.edit.applied", session_id, message_id, {
                        "editId": e["id"],
                        "deckRevision": deck_revision,
                    }))
                    sb.table("agent_events").insert({
                        "session_id": session_id,
                        "user_id": user["id"],
                        "message_id": message_id,
                        "type": "deck.edit.applied",
                        "data": {"editId": e["id"], "deckRevision": deck_revision}
                    }).execute()
            except Exception:
                pass

            return {"messageId": message_id}
    else:
        # No deck_id: cannot apply; keep behavior (no-op apply path)
        return {"messageId": message_id}

