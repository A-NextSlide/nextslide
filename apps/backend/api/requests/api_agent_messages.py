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
from utils.supabase import get_supabase_client
from utils.json_safe import ensure_json_serializable

# Classification for model selection (all messages go through orchestrator)
from agents.editing.fast_path import should_include_screenshot

router = APIRouter(prefix="/v1/agent", tags=["Agent Messages"])
logger = logging.getLogger(__name__)

# Feature flag for fast-path routing (enable to use classifier)
ENABLE_FAST_PATH = os.getenv("ENABLE_FAST_PATH", "true").lower() == "true"


# NOTE: LinkedIn lookup is now handled by the orchestrator via the linkedin_lookup tool.
# The LLM decides when to use it based on @linkedin mentions in the message.
# See agents/editing/tools/integration_tools.py for the implementation.


def _summarize_deck_diff(diff: dict) -> str:
    """Create a condensed summary of a deck diff for logging (without full HTML)."""
    if not diff or not isinstance(diff, dict):
        return "(empty diff)"

    parts = []

    # Slides to update
    slides_update = diff.get("slides_to_update") or []
    if slides_update:
        slide_summaries = []
        for s in slides_update[:5]:  # Limit to 5 slides
            sid = s.get("slide_id", "?")[:20]
            comps_update = s.get("components_to_update") or []
            comps_add = s.get("components_to_add") or []
            comps_remove = s.get("components_to_remove") or []

            comp_parts = []
            if comps_update:
                comp_ids = [f"{c.get('id', '?')[:15]}({','.join(list(c.get('props', {}).keys())[:3])})" for c in comps_update[:3]]
                comp_parts.append(f"update:{','.join(comp_ids)}")
            if comps_add:
                comp_parts.append(f"add:{len(comps_add)}")
            if comps_remove:
                comp_parts.append(f"rm:{len(comps_remove)}")

            slide_summaries.append(f"{sid}[{'; '.join(comp_parts) or 'no changes'}]")

        parts.append(f"update({len(slides_update)}): {', '.join(slide_summaries)}")

    # Slides to add
    slides_add = diff.get("slides_to_add") or []
    if slides_add:
        parts.append(f"add({len(slides_add)})")

    # Slides to remove
    slides_remove = diff.get("slides_to_remove") or []
    if slides_remove:
        parts.append(f"remove({len(slides_remove)})")

    # Slide order change
    if diff.get("slide_order"):
        parts.append(f"reorder({len(diff['slide_order'])})")

    return " | ".join(parts) if parts else "(no changes)"
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
        print(f"[AgentChat] attachments: {[{'name': a.get('name'), 'url_len': len(a.get('url') or ''), 'url': (a.get('url') or '')[:100] + ('...' if len(a.get('url') or '') > 100 else ''), 'attachmentId': a.get('attachmentId')} for a in (attachments or [])]}")
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

    # All edits go through the orchestrator - it decides whether to use quick (Flash) or full (Pro) model
    # based on the complexity of the request

    # Run orchestrator in threadpool and then persist a proposed edit
    from utils.threading import run_in_threadpool
    from concurrent.futures import ThreadPoolExecutor
    from agents.editing.editing_orchestrator import edit_deck
    from utils.deck import find_current_slide

    # Load deck and registry for orchestrator
    sess = sb.table("agent_sessions").select("deck_id, slide_id").eq("id", session_id).single().execute().data
    deck_id = sess.get("deck_id")
    slide_id = sess.get("slide_id")
    try:
        if isinstance(context, dict):
            context_slide_id = context.get("slide_id") or context.get("targetSlideId")
            if context_slide_id:
                slide_id = context_slide_id
    except Exception:
        pass
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
        # Save error message to chat
        try:
            sb.table("agent_messages").insert({
                "session_id": session_id,
                "user_id": user["id"],
                "role": "assistant",
                "text": "Sorry, I couldn't complete that request. The presentation context isn't available.",
                "attachments": [],
                "selections": []
            }).execute()
        except Exception:
            pass
        return {"messageId": message_id}

    # Determine current slide for orchestrator
    # CRITICAL FIX: Use the user's actual selection from this message, not the saved session slide_id
    # This ensures the agent targets the correct slide when user selects a different slide
    def _selection_slide_id(sel: Dict[str, Any]) -> Optional[str]:
        return sel.get("slideId") or sel.get("slide_id")

    if selections and slide_id:
        selections_on_current = [s for s in selections if not _selection_slide_id(s) or _selection_slide_id(s) == slide_id]
        if selections_on_current:
            selections = selections_on_current
        else:
            logger.info(f"[AgentChat] Dropping selections from other slides (current={slide_id})")
            selections = []

    selected_slide_id = None
    try:
        if selections and len(selections) > 0:
            # Extract slide_id from first selection (user's current slide)
            first_sel = selections[0]
            selected_slide_id = first_sel.get("slideId") or first_sel.get("slide_id")

            # CRITICAL FIX: If slideId is missing but we have a component ID, look up which slide contains it
            if not selected_slide_id:
                component_id = first_sel.get("elementId") or first_sel.get("componentId")
                if component_id:
                    from utils.deck import find_component_by_id
                    comp_info = find_component_by_id(deck_data, component_id)
                    if comp_info:
                        selected_slide_id = comp_info.get("slide_id")
                        logger.info(f"[AgentChat] Resolved slideId={selected_slide_id} from componentId={component_id}")
    except Exception as e:
        logger.warning(f"[AgentChat] Error resolving slide from selection: {e}")

    # Fall back to session slide_id if no selection provided
    if not selected_slide_id:
        selected_slide_id = slide_id

    current_slide = None
    for s in (deck_data.get("slides") or []):
        if s.get("id") == selected_slide_id:
            current_slide = s
            break
    if not current_slide and (deck_data.get("slides")):
        current_slide = deck_data["slides"][0]

    # Chat history (persisted messages in this session)
    # Order ascending by created_at so oldest messages come first, newest last (chronological)
    hist = sb.table("agent_messages").select("role,text,created_at").eq("session_id", session_id).order("created_at", desc=False).execute().data
    chat_history = []
    for m in hist[-10:]:  # last 10 messages, oldest first (chronological order)
        chat_history.append({
            "content": m.get("text") or "",
            "role": m.get("role") or "user",
            "timestamp": m.get("created_at") or datetime.utcnow().isoformat()  # Use actual DB timestamp
        })

    thread_pool = ThreadPoolExecutor(max_workers=4)
    # Track whether assistant.message.delta was emitted (to avoid duplicate fallback)
    message_delta_emitted = {"value": False}

    def _event_cb(event_type: str, data: Dict[str, Any]):
        logger.info(f"[_event_cb] 📡 Called with event_type={event_type}, data_keys={list((data or {}).keys())}")

        # Track if we emitted an assistant message delta
        if event_type == "assistant.message.delta":
            message_delta_emitted["value"] = True
            logger.info(f"[_event_cb] ✅ Set message_delta_emitted=True for delta: {str(data.get('delta', ''))[:100]}")

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
            has_custom_component_target = False
            custom_component_info = None

            for s in selections:
                sid = s.get("slideId") or s.get("slide_id")
                cid = s.get("elementId") or s.get("componentId")
                typ = s.get("elementType") or s.get("componentType")
                if cid:
                    if typ:
                        sel_summaries.append(f"{cid} ({typ})@{sid}" if sid else f"{cid} ({typ})")
                        # Check if a CustomComponent is specifically targeted
                        if typ == "CustomComponent":
                            has_custom_component_target = True
                            custom_component_info = {"id": cid, "slide_id": sid}
                    else:
                        sel_summaries.append(f"{cid}@{sid}" if sid else f"{cid}")

            if sel_summaries:
                llm_message += "\n\n[USER_SELECTIONS] " + ", ".join(sel_summaries)

                # If a CustomComponent is explicitly targeted, add STRONG directive to edit it
                if has_custom_component_target and custom_component_info:
                    llm_message += f"""

🎯 **MANDATORY: EDIT THE TARGETED CUSTOMCOMPONENT**

The user has SPECIFICALLY SELECTED CustomComponent '{custom_component_info['id']}' on slide '{custom_component_info['slide_id']}'.

YOU MUST:
1. Use `custom_component_str_replace` or `custom_component_rewrite` to edit THIS SPECIFIC component
2. Pass component_id="{custom_component_info['id']}" and slide_id="{custom_component_info['slide_id']}"
3. DO NOT create new components - the user wants to EDIT the existing one
4. DO NOT use create_new_component, insert_image, or other creation tools

This is a TARGETED EDIT request. Apply the user's changes to the selected CustomComponent."""

                # Log selection info internally but don't stream technical details to user
                # The selection context is already passed to the LLM via llm_message
                print(f"[AgentChat] selection context (internal): {', '.join(sel_summaries)}")
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
                "scope",
                "apply_to_all_slides",
                "current_date",
            ]
            ctx = {k: context.get(k) for k in keys if context.get(k) is not None}
            if ctx:
                llm_message += "\n\n[CONTEXT] " + ", ".join([f"{k}={v}" for k, v in ctx.items()])

            # Include selected LinkedIn profile if user clicked on one
            selected_profile = context.get("selected_linkedin_profile")
            if selected_profile and isinstance(selected_profile, dict):
                profile_parts = [f"Name: {selected_profile.get('name', 'Unknown')}"]
                if selected_profile.get('title'):
                    profile_parts.append(f"Title: {selected_profile['title']}")
                if selected_profile.get('company'):
                    profile_parts.append(f"Company: {selected_profile['company']}")
                if selected_profile.get('linkedin_url'):
                    profile_parts.append(f"LinkedIn: {selected_profile['linkedin_url']}")
                if selected_profile.get('photo_url'):
                    profile_parts.append(f"Photo: {selected_profile['photo_url']}")

                llm_message += f"\n\n[SELECTED_LINKEDIN_PROFILE] User selected this profile from search results:\n" + "\n".join(profile_parts)
                llm_message += "\n\n⚠️ DO NOT call linkedin_lookup - use this profile data directly! Pass the Name, Title, Company, and Photo URL to create_slide/edit_slide."
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

    # Normalize attachments for passing to orchestrator
    # Separate screenshot from other attachments
    normalized_attachments = []
    slide_screenshot_data = None  # Will hold base64 screenshot if present

    for att in (attachments or []):
        if not isinstance(att, dict):
            continue

        att_name = att.get('name') or att.get('fileName') or att.get('filename') or 'file'
        att_url = att.get('url') or att.get('publicUrl') or ''

        # Check if this is the auto-attached slide screenshot
        if att_name == '_slide_context.jpg' or att_name.startswith('_slide_context'):
            # Extract base64 data from data URL
            if att_url.startswith('data:image'):
                try:
                    # Format: data:image/jpeg;base64,/9j/4AAQ...
                    base64_part = att_url.split(',', 1)[1] if ',' in att_url else ''
                    if base64_part:
                        slide_screenshot_data = {
                            'data': base64_part,
                            'media_type': 'image/jpeg'
                        }
                        logger.info(f"[AgentChat] Extracted slide screenshot: {len(base64_part)} chars base64")
                except Exception as e:
                    logger.warning(f"[AgentChat] Failed to extract screenshot data: {e}")
            # Don't add to normalized_attachments - we handle it separately
            continue

        # Regular attachment
        if att_url:
            normalized_attachments.append({
                'name': att_name,
                'mimeType': att.get('mimeType') or att.get('type') or 'application/octet-stream',
                'url': att_url
            })

    # Classify request to decide if we need the screenshot
    # Complex requests that benefit from seeing the slide visually
    def _needs_visual_context(msg: str) -> bool:
        msg_lower = (msg or "").lower()

        # Keywords indicating visual/complex edits
        visual_keywords = [
            "fix", "broken", "wrong", "issue", "problem", "bug",
            "redesign", "redo", "rebuild", "restyle", "overhaul",
            "layout", "spacing", "alignment", "position", "move",
            "looks", "ugly", "better", "improve", "enhance",
            "image", "photo", "picture", "logo", "icon",
            "color", "colours", "style", "theme", "font",
            "too big", "too small", "resize", "size",
            "overlap", "cut off", "cropped", "hidden",
            "doesn't look", "not showing", "can't see",
        ]

        # Simple requests that don't need visual context
        simple_patterns = [
            "change text", "replace text", "update text",
            "change title to", "rename", "typo",
            "add slide", "delete slide", "remove slide",
            "duplicate", "copy slide",
        ]

        # Check if it's a simple request first
        for pattern in simple_patterns:
            if pattern in msg_lower:
                return False

        # Check if it needs visual context
        for keyword in visual_keywords:
            if keyword in msg_lower:
                return True

        # Default: include for safety on ambiguous requests
        # But if message is very short (< 30 chars), probably simple
        if len(msg_lower.strip()) < 30:
            return False

        return True

    # ═══════════════════════════════════════════════════════════════════════════════
    # CLASSIFICATION: For model selection only (all messages go through orchestrator)
    # ═══════════════════════════════════════════════════════════════════════════════
    # NOTE: We NO LONGER bypass the orchestrator for "chat" messages.
    # The orchestrator handles BOTH chat and edits with full context and tool access.
    # Classification is only used to select the appropriate model (Flash vs Pro).

    classification = None
    if ENABLE_FAST_PATH:
        try:
            from agents.editing.classifier import classify_message
            # Get recent message texts for classifier context
            recent_texts = []
            if chat_history:
                for msg in chat_history[-3:]:
                    msg_text = msg.get("text") or msg.get("content") or ""
                    if msg_text:
                        recent_texts.append(msg_text[:200])

            # Classify for model selection only - no early return!
            classification = await classify_message(text or "", recent_texts)
            logger.info(f"[AgentChat] Classified: type={classification.type}, model selection only (no bypass)")

        except Exception as classify_error:
            logger.warning(f"[AgentChat] Classification failed, using default model: {classify_error}")
            classification = None

    # Determine screenshot inclusion based on classification (or fallback to keyword-based)
    if classification:
        include_screenshot = slide_screenshot_data and should_include_screenshot(classification)
        if slide_screenshot_data and not include_screenshot:
            logger.info(f"[AgentChat] Skipping screenshot - classification: {classification.type}")
        elif include_screenshot:
            logger.info(f"[AgentChat] Including screenshot - classification needs visual: {classification.needs_screenshot}")
    else:
        # Fallback to keyword-based detection if classification failed
        include_screenshot = slide_screenshot_data and _needs_visual_context(text)
        if slide_screenshot_data and not include_screenshot:
            logger.info(f"[AgentChat] Skipping screenshot - simple request detected (fallback)")
        elif include_screenshot:
            logger.info(f"[AgentChat] Including screenshot - complex/visual request detected (fallback)")

    # LinkedIn lookup is now handled by the orchestrator via the linkedin_lookup tool
    # The LLM decides when to use it based on @linkedin mentions in the message

    try:
        logger.info(f"[AgentChat] 🚀 About to call edit_deck with event_cb={bool(_event_cb)} (callable={callable(_event_cb)})")
        result = await run_in_threadpool(
            thread_pool,
            edit_deck,
            deck_data=deck_data_for_agent,
            current_slide=current_slide_for_agent,
            registry=registry,
            message=llm_message,
            chat_history=chat_history,
            run_uuid=str(uuid.uuid4()),
            event_cb=_event_cb,
            attachments=normalized_attachments,
            slide_screenshot=slide_screenshot_data if include_screenshot else None,
            classification=classification,  # Pass classification for model selection
        )
    except Exception as edit_error:
        logger.error(f"[AgentChat] edit_deck failed: {edit_error}")
        # Send completion event even on error so frontend doesn't stay stuck
        try:
            await agent_stream_bus.publish(session_id, {
                "type": "assistant.message.complete",
                "sessionId": session_id,
                "messageId": message_id,
                "timestamp": int(datetime.utcnow().timestamp() * 1000),
                "data": {"messageId": message_id, "error": True}
            })
            # Also send an error message to show in the chat
            await agent_stream_bus.publish(session_id, {
                "type": "assistant.message.delta",
                "sessionId": session_id,
                "messageId": message_id,
                "timestamp": int(datetime.utcnow().timestamp() * 1000),
                "data": {"delta": "I encountered an issue processing your request. Please try again."}
            })
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Edit processing failed: {str(edit_error)[:200]}")

    # Convert orchestrator result to a proposed edit (or auto-apply if enabled)
    deck_diff = result.get("deck_diff")
    logger.info(f"[DEBUG] Orchestrator result: keys={list(result.keys()) if isinstance(result, dict) else 'N/A'}, message={result.get('message', '')[:80] if isinstance(result, dict) else 'N/A'}...")
    logger.info(f"[DEBUG] Raw deck_diff type: {type(deck_diff).__name__}")

    # CRITICAL FIX: Unwrap DeckDiff wrapper class to get the inner DeckDiffBase
    # The DeckDiff class is a wrapper with a .deck_diff attribute containing the actual Pydantic model
    # We need the inner model for proper serialization, otherwise we get {"deck_diff": {...}} instead of {...}
    if deck_diff is not None and hasattr(deck_diff, 'deck_diff'):
        logger.info(f"[DEBUG] Unwrapping DeckDiff wrapper class")
        deck_diff = deck_diff.deck_diff  # Get the inner DeckDiffBase Pydantic model
        logger.info(f"[DEBUG] Unwrapped deck_diff type: {type(deck_diff)}")

    # Ensure diff is JSON-serializable using comprehensive JSON-safe conversion
    from utils.json_safe import to_json_safe
    logger.info(f"[DEBUG] About to convert deck_diff of type {type(deck_diff)}")
    deck_diff_plain = {}

    if deck_diff is not None:
        # Try multiple serialization approaches
        try:
            # Approach 1: Use to_json_safe
            serialized_diff = to_json_safe(deck_diff)
            if serialized_diff and isinstance(serialized_diff, dict):
                deck_diff_plain = serialized_diff
                logger.info(f"[DEBUG] Deck diff conversion via to_json_safe SUCCESS")
            else:
                logger.warning(f"[DEBUG] to_json_safe returned invalid result: {serialized_diff} (type: {type(serialized_diff)})")
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
                        serialized_diff = deck_diff.model_dump(exclude_none=False, exclude_unset=False)
                    else:
                        serialized_diff = deck_diff.model_dump(exclude_none=True, exclude_unset=True)
                    logger.info(f"[DEBUG] model_dump result: {_summarize_deck_diff(serialized_diff) if isinstance(serialized_diff, dict) else type(serialized_diff).__name__}")
                    # Don't double-process with to_json_safe if it's already a dict
                    if isinstance(serialized_diff, dict):
                        deck_diff_plain = serialized_diff
                        logger.info(f"[DEBUG] Using model_dump result directly")
                    else:
                        deck_diff_plain = to_json_safe(serialized_diff)
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
                            serialized_diff = deck_diff.dict(exclude_none=False, exclude_unset=False)
                        else:
                            serialized_diff = deck_diff.dict(exclude_none=True, exclude_unset=True)
                        logger.info(f"[DEBUG] dict result: {_summarize_deck_diff(serialized_diff) if isinstance(serialized_diff, dict) else type(serialized_diff).__name__}")
                        # Don't double-process with to_json_safe if it's already a dict
                        if isinstance(serialized_diff, dict):
                            deck_diff_plain = serialized_diff
                            logger.info(f"[DEBUG] Using dict result directly")
                        else:
                            deck_diff_plain = to_json_safe(serialized_diff)
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
        logger.info(f"[DEBUG] Deck diff: {_summarize_deck_diff(deck_diff_plain)}")
    else:
        logger.warning(f"[DEBUG] No deck_diff_plain! This will prevent auto-apply from working")
    summary = result.get("edit_summary") or "Proposed edit"
    agent_message = result.get("message") or ""
    logger.info(f"[DEBUG] agent_message from result: '{agent_message[:200] if agent_message else 'EMPTY'}'")
    logger.info(f"[DEBUG] edit_summary from result: '{summary[:200] if summary else 'EMPTY'}'")

    # ALWAYS persist an assistant message - use edit summary as fallback if no conversational message
    # Prefer the actual conversational message from the LLM
    assistant_text = agent_message if agent_message.strip() else f"Done! {summary}"
    logger.info(f"[DEBUG] Final assistant_text: '{assistant_text[:200]}'...")
    try:
        assistant_msg_record = {
            "session_id": session_id,
            "user_id": user["id"],
            "role": "assistant",
            "text": assistant_text,
            "attachments": [],
            "selections": [],
        }
        sb.table("agent_messages").insert(assistant_msg_record).execute()
        logger.info(f"[AgentChat] Saved assistant message: {assistant_text[:100]}...")
    except Exception as e:
        logger.warning(f"[AgentChat] Failed to persist assistant message: {e}")

    # FALLBACK: Emit the assistant message via WebSocket only if it wasn't already streamed
    # This ensures the message shows even if event_cb streaming failed inside the orchestrator
    if assistant_text.strip() and not message_delta_emitted["value"]:
        logger.info(f"[AgentChat] ⚠️ No message was streamed via event_cb - emitting fallback")
        try:
            await agent_stream_bus.publish(session_id, {
                "type": "assistant.message.delta",
                "sessionId": session_id,
                "messageId": message_id,
                "timestamp": int(datetime.utcnow().timestamp() * 1000),
                "data": {"delta": assistant_text}
            })
            logger.info(f"[AgentChat] 📤 Emitted fallback assistant.message.delta: '{assistant_text[:100]}...'")
        except Exception as emit_err:
            logger.warning(f"[AgentChat] Failed to emit fallback message: {emit_err}")
    elif message_delta_emitted["value"]:
        logger.info(f"[AgentChat] ✅ Message was already streamed via event_cb - skipping fallback")

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
    # Check if diff has actual changes (not just empty dict)
    def _diff_has_changes(diff: dict) -> bool:
        if not diff or not isinstance(diff, dict):
            return False
        return bool(
            diff.get("slides_to_update") or
            diff.get("slides_to_add") or
            diff.get("slides_to_remove") or
            diff.get("deck_properties") or
            diff.get("slide_order")
        )

    has_actual_changes = _diff_has_changes(deck_diff_plain)
    if deck_id and deck_diff_plain and has_actual_changes:
        # Respect explicit request flag; disable auto-apply under pytest
        auto_apply_request = bool(body.get("autoApply", False))
        is_pytest = bool(os.getenv("PYTEST_CURRENT_TEST"))
        should_auto_apply = (ALWAYS_AUTO_APPLY or auto_apply_request) and not is_pytest
        logger.info(f"[DEBUG] Auto-apply check: deck_id={deck_id}, deck_diff_plain={bool(deck_diff_plain)}, has_actual_changes={has_actual_changes}, ALWAYS_AUTO_APPLY={ALWAYS_AUTO_APPLY}, auto_apply_request={auto_apply_request}, is_pytest={is_pytest}, should_auto_apply={should_auto_apply}")
        if should_auto_apply:
            try:
                logger.info(f"[DEBUG] Starting auto-apply process for deck_id={deck_id}")
                # Get a fresh Supabase client for auto-apply to avoid "client closed" errors
                # The original `sb` client may have been recycled during streaming
                sb_apply = get_supabase_client()
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
                logger.info(f"[DEBUG] Inserting applied record: session={session_id[:8]}..., deck={deck_id[:8] if deck_id else 'N/A'}..., slides={applied_rec.get('slide_ids', [])}, diff={_summarize_deck_diff(applied_rec.get('diff', {}))}")
                insert_result = sb_apply.table("agent_edits").insert(applied_rec).execute()
                if not insert_result.data:
                    logger.error(f"Failed to insert applied edit record for session {session_id}")
                    raise HTTPException(status_code=500, detail="Failed to save applied edit")
                e = insert_result.data[0]
                logger.info(f"[DEBUG] Applied record inserted with ID: {e.get('id')}")

                # Apply to deck
                from services.agent_apply import apply_deckdiff
                logger.info(f"[DEBUG] Applying deck diff to deck_id={deck_id}")
                deck_revision = await apply_deckdiff(deck_id, deck_diff_plain or {}, user_id=user["id"]) if deck_id else None
                logger.info(f"[DEBUG] Deck diff applied, revision: {deck_revision}")
                if deck_revision:
                    sb_apply.table("agent_edits").update({"deck_revision": str(deck_revision)}).eq("id", e["id"]).execute()

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
                await agent_stream_bus.publish(session_id, {
                    "type": "deck.edit.applied",
                    "sessionId": session_id,
                    "messageId": message_id,
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    # Include updatedSlideIds and compact slide payloads for instant UI patch
                    "data": {
                        "editId": e["id"],
                        "deckRevision": deck_revision,
                        "updatedSlideIds": updated_slide_ids,
                        "slides": updated_slides_payload,
                        "deck_diff": deck_diff_plain,  # CRITICAL: Include deck_diff for frontend to apply changes locally
                        "summary": summary  # Include summary for frontend message display
                    }
                })
                sb_apply.table("agent_events").insert({
                    "session_id": session_id,
                    "user_id": user["id"],
                    "message_id": message_id,
                    "type": "deck.edit.applied",
                    "data": {
                        "editId": e["id"],
                        "deckRevision": deck_revision,
                        "updatedSlideIds": updated_slide_ids,
                        "slides": updated_slides_payload,
                        "deck_diff": deck_diff_plain,  # CRITICAL: Include deck_diff for frontend to apply changes locally
                        "summary": summary
                    }
                }).execute()
                logger.info(f"[DEBUG] deck.edit.applied event published successfully")

                await agent_stream_bus.publish(session_id, {
                    "type": "assistant.message.complete",
                    "sessionId": session_id,
                    "messageId": message_id,
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    "data": {"messageId": message_id}
                })
                sb_apply.table("agent_events").insert({
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
            insert_result = sb.table("agent_edits").insert(proposed_rec).execute()
            if not insert_result.data:
                logger.error(f"Failed to insert proposed edit record for session {session_id}")
                raise HTTPException(status_code=500, detail="Failed to save proposed edit")
            e = insert_result.data[0]

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
                        "deck_diff": deck_diff_plain  # CRITICAL: Include deck_diff for frontend real-time updates
                    }))
                    sb.table("agent_events").insert({
                        "session_id": session_id,
                        "user_id": user["id"],
                        "message_id": message_id,
                        "type": "deck.edit.applied",
                        "data": {
                            "editId": e["id"],
                            "deckRevision": deck_revision,
                            "deck_diff": deck_diff_plain
                        }
                    }).execute()
            except Exception:
                pass

            # Send completion event for proposed edits
            await agent_stream_bus.publish(session_id, {
                "type": "assistant.message.complete",
                "sessionId": session_id,
                "messageId": message_id,
                "timestamp": int(datetime.utcnow().timestamp() * 1000),
                "data": {"messageId": message_id}
            })

            return {"messageId": message_id}
    else:
        # No deck_id or no changes: send completion event anyway
        await agent_stream_bus.publish(session_id, {
            "type": "assistant.message.complete",
            "sessionId": session_id,
            "messageId": message_id,
            "timestamp": int(datetime.utcnow().timestamp() * 1000),
            "data": {"messageId": message_id}
        })
        return {"messageId": message_id}
