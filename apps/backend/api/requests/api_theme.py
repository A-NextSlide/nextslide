"""
Theme generation endpoints for outline phase (SSE + JSON fallback).
"""

from typing import Any, Dict, Optional, AsyncIterator
import asyncio
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse

from models.requests import DeckOutline
from agents.generation.theme_director import ThemeDirector, ThemeDirectorOptions
from agents.application import get_event_bus, AGENT_EVENT, TOOL_CALL_EVENT, TOOL_RESULT_EVENT, ARTIFACT_EVENT
from api.requests.api_auth import get_auth_header

router = APIRouter(prefix="/api/theme", tags=["theme"])

logger = logging.getLogger(__name__)


def _sse(event: Dict[str, Any]) -> bytes:
    try:
        return f"data: {json.dumps(event)}\n\n".encode("utf-8")
    except Exception:
        return b"data: {\"type\": \"error\", \"error\": \"serialization_failed\"}\n\n"


# In-flight request coalescing to avoid duplicate theme generation for the same outline
_inflight_theme_tasks: Dict[str, asyncio.Task] = {}
_inflight_theme_lock = asyncio.Lock()

def _compute_outline_key(outline: DeckOutline) -> str:
    try:
        # Prefer stable outline ID if present
        outline_id = getattr(outline, "id", None) or (outline.dict().get("id") if hasattr(outline, "dict") else None)
        if outline_id:
            return f"outline:{outline_id}"
        # Fallback: hash minimal identifying fields
        import hashlib
        payload = {
            "title": getattr(outline, "title", ""),
            "slide_titles": [getattr(s, "title", "") for s in getattr(outline, "slides", [])],
        }
        return "outlinehash:" + hashlib.md5(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
    except Exception:
        # Ultimate fallback
        return f"outlinehash:{id(outline)}"


@router.post("/from-outline")
async def stream_theme_from_outline(
    outline: DeckOutline,
    deck_id: Optional[str] = None,
    store: bool = True,
    token: Optional[str] = Depends(get_auth_header),
):
    """
    Generate a theme document from a DeckOutline and stream agent/tool events via SSE.

    If deck_id is provided and store=True, persist the generated theme to the deck
    in Supabase before returning (so generation can reuse it).
    """

    async def generate() -> AsyncIterator[bytes]:
        # Open stream
        yield _sse({"type": "connection_established", "message": "SSE stream open"})

        # Short-circuit: if deck already has a theme, return it immediately
        try:
            if deck_id:
                from utils.supabase import get_deck
                existing = get_deck(deck_id) or {}
                existing_theme = (existing.get("data") or {}).get("theme") if isinstance(existing.get("data"), dict) else None
                existing_palette = (existing.get("data") or {}).get("style_spec", {}).get("palette") if isinstance(existing.get("data"), dict) else None
                if isinstance(existing_theme, dict):
                    yield _sse({
                        "type": "theme_generated",
                        "timestamp": datetime.now().isoformat(),
                        "theme": existing_theme,
                        "palette": existing_palette,
                        "cached": True
                    })
                    yield _sse({"type": "end", "message": "Stream complete"})
                    return
        except Exception:
            pass

        # CRITICAL: Check if stylePreferences already has brand data (outline generation already happened)
        # If so, immediately reconstruct theme from that data instead of generating new one
        try:
            style_prefs = getattr(outline, 'stylePreferences', None)
            logger.info(f"[THEME API] DEBUG: Checking stylePreferences for theme reconstruction - type: {type(style_prefs)}")
            
            # Access brand data from stylePreferences (ColorConfigItem structure)
            brand_colors = []
            brand_fonts = None
            logo_url = None
            vibe_context = None
            background = None
            text = None
            
            if style_prefs:
                # Get vibe context
                vibe_context = getattr(style_prefs, 'vibeContext', None)
                
                # Get font
                brand_fonts = getattr(style_prefs, 'font', None)
                
                # Get logo
                logo_url = getattr(style_prefs, 'logoUrl', None)
                
                # Get colors from ColorConfigItem
                colors_config = getattr(style_prefs, 'colors', None)
                logger.info(f"[THEME API] DEBUG: colors_config type: {type(colors_config)}")
                
                if colors_config:
                    # Extract colors from ColorConfigItem (background, accent1, accent2, accent3, text)
                    background = getattr(colors_config, 'background', None)
                    accent1 = getattr(colors_config, 'accent1', None)
                    accent2 = getattr(colors_config, 'accent2', None)
                    accent3 = getattr(colors_config, 'accent3', None)
                    text = getattr(colors_config, 'text', None)
                    
                    logger.info(f"[THEME API] DEBUG: Raw colors - background: {background}, accent1: {accent1}, accent2: {accent2}, accent3: {accent3}, text: {text}")
                    
                    raw_colors = []
                    if accent1:
                        raw_colors.append(accent1)
                    if accent2:
                        raw_colors.append(accent2)
                    if accent3:
                        raw_colors.append(accent3)
                    if background:
                        raw_colors.append(background)
                    for color in raw_colors:
                        if color and color not in brand_colors:
                            brand_colors.append(color)
            
            if style_prefs and brand_colors:
                logger.info(f"[THEME API] ✅ CREATING THEME FROM BRAND DATA (avoiding regeneration)")
                logger.info(f"[THEME API] Brand colors: {brand_colors}")
                logger.info(f"[THEME API] Brand fonts: {brand_fonts}")
                logger.info(f"[THEME API] Logo URL: {logo_url}")
                logger.info(f"[THEME API] Vibe context: {vibe_context}")
                
                # Create theme from brand data matching frontend format
                reconstructed_theme = {
                    "theme_name": f"{vibe_context.replace('.com', '').replace('www.', '').title()} Brand Theme" if vibe_context else "Brand Theme",
                    "color_palette": {
                        "primary_background": background if background else "#FFFFFF",
                        "primary_text": text if text else "#1F2937",
                        "accent_1": brand_colors[0] if len(brand_colors) > 0 else "#FF4301",
                        "accent_2": brand_colors[1] if len(brand_colors) > 1 else (brand_colors[0] if len(brand_colors) > 0 else "#F59E0B"),
                        "colors": brand_colors[:6],  # Limit to 6 colors for frontend
                        "metadata": {
                            "logo_url": logo_url
                        } if logo_url else {}
                    },
                    "typography": {
                        "hero_title": {"family": brand_fonts if brand_fonts else "Inter"},
                        "body_text": {"family": brand_fonts if brand_fonts else "Inter"}
                    },
                    "brandInfo": {
                        "logoUrl": logo_url
                    } if logo_url else {},
                    "visual_style": {}
                }
                
                # Create compatible palette structure
                palette = {
                    "colors": brand_colors[:6],
                    "fonts": [brand_fonts] if brand_fonts else [],
                    "logo_url": logo_url
                }
                
                logger.info(f"[THEME API] ✅ THEME RECONSTRUCTED FROM STYLEPREFERENCES - SKIPPING GENERATION")
                
                # Yield the reconstructed theme
                yield _sse({
                    "type": "theme_generated",
                    "timestamp": datetime.now().isoformat(),
                    "theme": reconstructed_theme,
                    "palette": palette,
                    "cached": False,
                    "source": "stylePreferences_reconstruction"
                })
                yield _sse({"type": "end", "message": "Stream complete"})
                return
                
        except Exception as e:
            logger.warning(f"[THEME API] Error during stylePreferences reconstruction: {e}")

        # Prepare director + event forwarding
        event_bus = get_event_bus()
        director = ThemeDirector()

        # Local buffer to forward captured events
        buffered: list[dict] = []

        def _make_handler(event_type: str):
            def _handler(data):
                try:
                    payload = dict(data)
                    payload["type"] = event_type
                    buffered.append(payload)
                except Exception:
                    pass
            return _handler

        agent_h = _make_handler("agent_event")
        tool_call_h = _make_handler("tool_call")
        tool_res_h = _make_handler("tool_result")
        artifact_h = _make_handler("artifact")

        # Subscribe to agent events
        try:
            event_bus.subscribe(AGENT_EVENT, agent_h)
            event_bus.subscribe(TOOL_CALL_EVENT, tool_call_h)
            event_bus.subscribe(TOOL_RESULT_EVENT, tool_res_h)
            event_bus.subscribe(ARTIFACT_EVENT, artifact_h)
        except Exception:
            pass

        try:
            # Announce start immediately so clients don't wait
            yield _sse({
                "type": "theme_generation_started",
                "timestamp": datetime.now().isoformat(),
                "title": outline.title,
            })

            # Coalesce concurrent requests for the same outline
            outline_key = _compute_outline_key(outline)
            is_owner = False
            async with _inflight_theme_lock:
                existing = _inflight_theme_tasks.get(outline_key)
                if existing and not existing.done():
                    theme_task = existing
                    logger.info(f"[THEME] Attaching to in-flight theme generation for {outline_key}")
                else:
                    # Run generation in background so we can stream agent/tool events as they occur
                    opts = ThemeDirectorOptions()
                    theme_task = asyncio.create_task(director.generate_theme_document(outline, opts))
                    _inflight_theme_tasks[outline_key] = theme_task
                    is_owner = True
                    logger.info(f"[THEME] Started new theme generation for {outline_key}")

            # Stream buffered events in real-time while the theme is being generated
            while not theme_task.done():
                try:
                    # Drain any captured events
                    while buffered:
                        evt = buffered.pop(0)
                        try:
                            yield _sse(evt)
                        except Exception:
                            pass
                except Exception:
                    pass

                # Small sleep to avoid busy loop and allow IO flush
                await asyncio.sleep(0.05)

            # Await result
            theme_doc = await theme_task

            # Final flush of any remaining buffered events
            try:
                while buffered:
                    evt = buffered.pop(0)
                    yield _sse(evt)
            except Exception:
                pass

            # Extract theme + full palette for clients. Do not shrink colors to accents only
            deck_theme = theme_doc.deck_theme if hasattr(theme_doc, "deck_theme") else None
            palette = None
            try:
                if isinstance(deck_theme, dict):
                    palette = deck_theme.get("color_palette")
                    # Ensure colors include any explicit backgrounds (non-neutral) to avoid collapsing to 2
                    if isinstance(palette, dict):
                        cp = dict(palette)
                        maybe_colors = [c for c in (cp.get('colors') or []) if isinstance(c, str)]
                        bgs = [c for c in (cp.get('backgrounds') or []) if isinstance(c, str)]
                        for extra in bgs:
                            if extra and extra.upper() not in ['#FFFFFF', '#FFF'] and extra not in maybe_colors:
                                maybe_colors.append(extra)
                        if maybe_colors:
                            cp['colors'] = maybe_colors
                        palette = cp
            except Exception:
                palette = None

            # Optionally persist theme to deck (only by the owner to avoid duplicate writes)
            if is_owner and store and deck_id and isinstance(deck_theme, dict):
                try:
                    from utils.supabase import get_deck, upload_deck

                    existing = get_deck(deck_id) or {}
                    data_field = existing.get("data", {}) if isinstance(existing.get("data"), dict) else {}
                    data_field["theme"] = deck_theme
                    # Also store palette under style_spec if available
                    if isinstance(palette, dict):
                        data_field.setdefault("style_spec", {})
                        if isinstance(data_field["style_spec"], dict):
                            data_field["style_spec"]["palette"] = palette

                    # IMPORTANT: Persist only theme data to avoid overwriting concurrent slide updates
                    payload = {
                        "uuid": deck_id,
                        "name": outline.title,
                        "data": data_field,
                    }
                    upload_deck(payload, deck_id)
                    yield _sse({
                        "type": "theme_stored",
                        "timestamp": datetime.now().isoformat(),
                        "deck_id": deck_id,
                    })
                except Exception as e:
                    logger.warning(f"Failed to persist theme for deck {deck_id}: {e}")

            # Emit final theme payload
            yield _sse({
                "type": "theme_generated",
                "timestamp": datetime.now().isoformat(),
                "theme": deck_theme,
                "palette": palette,
            })

            # End
            yield _sse({"type": "end", "message": "Stream complete"})

        except Exception as e:
            logger.error(f"Theme generation failed: {e}")
            yield _sse({"type": "error", "error": str(e)})
        finally:
            # Unsubscribe
            try:
                event_bus.unsubscribe(AGENT_EVENT, agent_h)
                event_bus.unsubscribe(TOOL_CALL_EVENT, tool_call_h)
                event_bus.unsubscribe(TOOL_RESULT_EVENT, tool_res_h)
                event_bus.unsubscribe(ARTIFACT_EVENT, artifact_h)
            except Exception:
                pass
            # Cleanup in-flight map if we are the owner or task completed
            try:
                outline_key = _compute_outline_key(outline)
                async with _inflight_theme_lock:
                    task = _inflight_theme_tasks.get(outline_key)
                    if task and task.done():
                        _inflight_theme_tasks.pop(outline_key, None)
            except Exception:
                pass

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/from-outline/json")
async def theme_from_outline_json(
    outline: DeckOutline,
    deck_id: Optional[str] = None,
    token: Optional[str] = Depends(get_auth_header),
):
    """
    JSON fallback: generate theme from outline and return the theme payload directly.
    Does not stream events.
    """
    logger.info(f"[THEME JSON ENDPOINT] CALLED! Outline title: {outline.title}")
    logger.info(f"[THEME JSON ENDPOINT] Has stylePreferences: {hasattr(outline, 'stylePreferences')}")

    # Short-circuit: if deck already has a theme, return it immediately to avoid duplicate generation
    try:
        # Prefer explicit deck_id; fallback to outline.id if available
        deck_ref = deck_id or getattr(outline, "id", None) or (outline.dict().get("id") if hasattr(outline, "dict") else None)
        if deck_ref:
            from utils.supabase import get_deck
            existing = get_deck(deck_ref) or {}
            existing_theme = (existing.get("data") or {}).get("theme") if isinstance(existing.get("data"), dict) else None
            existing_palette = (existing.get("data") or {}).get("style_spec", {}).get("palette") if isinstance(existing.get("data"), dict) else None
            if isinstance(existing_theme, dict):
                return JSONResponse({
                    "success": True,
                    "theme": existing_theme,
                    "palette": existing_palette,
                    "cached": True
                })
    except Exception:
        pass
    try:
        # CRITICAL FALLBACK: Use stylePreferences brand data to reconstruct theme BEFORE generating new one
        try:
            style_prefs = getattr(outline, 'stylePreferences', None)
            logger.info(f"[THEME JSON] DEBUG: Checking stylePreferences for theme reconstruction - type: {type(style_prefs)}")
            
            # Access brand data from stylePreferences (ColorConfigItem structure)
            brand_colors = []
            brand_fonts = None
            logo_url = None
            vibe_context = None
            
            if style_prefs:
                # Get vibe context
                vibe_context = getattr(style_prefs, 'vibeContext', None)
                
                # Get font
                brand_fonts = getattr(style_prefs, 'font', None)
                
                # Get logo
                logo_url = getattr(style_prefs, 'logoUrl', None)
                
                # Get colors from ColorConfigItem
                colors_config = getattr(style_prefs, 'colors', None)
                logger.info(f"[THEME JSON] DEBUG: colors_config type: {type(colors_config)}")
                
                if colors_config:
                    # Extract colors from ColorConfigItem (background, accent1, accent2, accent3, text)
                    background = getattr(colors_config, 'background', None)
                    accent1 = getattr(colors_config, 'accent1', None)
                    accent2 = getattr(colors_config, 'accent2', None)
                    accent3 = getattr(colors_config, 'accent3', None)
                    text = getattr(colors_config, 'text', None)
                    
                    logger.info(f"[THEME JSON] DEBUG: Raw colors - background: {background}, accent1: {accent1}, accent2: {accent2}, accent3: {accent3}, text: {text}")
                    
                    raw_colors = []
                    if accent1:
                        raw_colors.append(accent1)
                    if accent2:
                        raw_colors.append(accent2)
                    if accent3:
                        raw_colors.append(accent3)
                    if background:
                        raw_colors.append(background)
                    for color in raw_colors:
                        if color and color not in brand_colors:
                            brand_colors.append(color)
            
            if style_prefs and brand_colors:
                logger.info(f"[THEME JSON] ✅ CREATING THEME FROM BRAND DATA (avoiding regeneration)")
                logger.info(f"[THEME JSON] Brand colors: {brand_colors}")
                logger.info(f"[THEME JSON] Brand fonts: {brand_fonts}")
                logger.info(f"[THEME JSON] Logo URL: {logo_url}")
                logger.info(f"[THEME JSON] Vibe context: {vibe_context}")
                
                # Create theme from brand data matching frontend format
                reconstructed_theme = {
                    "theme_name": f"{vibe_context.replace('.com', '').replace('www.', '').title()} Brand Theme" if vibe_context else "Brand Theme",
                    "color_palette": {
                        "primary_background": background if background else "#FFFFFF",
                        "primary_text": text if text else "#1F2937",
                        "accent_1": brand_colors[0] if len(brand_colors) > 0 else "#FF4301",
                        "accent_2": brand_colors[1] if len(brand_colors) > 1 else (brand_colors[0] if len(brand_colors) > 0 else "#F59E0B"),
                        "colors": brand_colors[:6],  # Limit to 6 colors for frontend
                        "metadata": {
                            "logo_url": logo_url
                        } if logo_url else {}
                    },
                    "typography": {
                        "hero_title": {"family": brand_fonts if brand_fonts else "Inter"},
                        "body_text": {"family": brand_fonts if brand_fonts else "Inter"}
                    },
                    "brandInfo": {
                        "logoUrl": logo_url
                    } if logo_url else {},
                    "visual_style": {}
                }
                
                # Create compatible palette structure
                palette = {
                    "colors": brand_colors[:6],
                    "fonts": [brand_fonts] if brand_fonts else [],
                    "logo_url": logo_url
                }
                
                logger.info(f"[THEME JSON] ✅ THEME RECONSTRUCTED FROM STYLEPREFERENCES - SKIPPING GENERATION")
                
                return JSONResponse({
                    "success": True,
                    "theme": reconstructed_theme,
                    "palette": palette,
                    "source": "stylePreferences_reconstruction"
                })
                
        except Exception as e:
            logger.warning(f"[THEME JSON] Error during stylePreferences reconstruction: {e}")

        # Coalesce with any in-flight SSE theme generation for the same outline
        director = ThemeDirector()
        outline_key = _compute_outline_key(outline)
        is_owner = False
        theme_task: Optional[asyncio.Task] = None
        try:
            async with _inflight_theme_lock:
                existing = _inflight_theme_tasks.get(outline_key)
                if existing and not existing.done():
                    theme_task = existing
                    logger.info(f"[THEME JSON] Attaching to in-flight theme generation for {outline_key}")
                else:
                    theme_task = asyncio.create_task(director.generate_theme_document(outline, ThemeDirectorOptions()))
                    _inflight_theme_tasks[outline_key] = theme_task
                    is_owner = True
                    logger.info(f"[THEME JSON] Started new theme generation for {outline_key}")
        except Exception:
            # Fallback: if lock fails for any reason, just run synchronously
            theme_task = asyncio.create_task(director.generate_theme_document(outline, ThemeDirectorOptions()))

        # Await result
        theme_doc = await theme_task
        deck_theme = theme_doc.deck_theme if hasattr(theme_doc, "deck_theme") else None
        palette = None
        try:
            if isinstance(deck_theme, dict):
                palette = deck_theme.get("color_palette")
        except Exception:
            palette = None

        # Optionally persist
        if deck_id and isinstance(deck_theme, dict):
            try:
                from utils.supabase import get_deck, upload_deck
                existing = get_deck(deck_id) or {}
                data_field = existing.get("data", {}) if isinstance(existing.get("data"), dict) else {}
                data_field["theme"] = deck_theme
                if isinstance(palette, dict):
                    data_field.setdefault("style_spec", {})
                    if isinstance(data_field["style_spec"], dict):
                        data_field["style_spec"]["palette"] = palette
                # Persist only theme data; avoid overwriting slides/status
                payload = {
                    "uuid": deck_id,
                    "name": outline.title,
                    "data": data_field,
                }
                upload_deck(payload, deck_id)
            except Exception as e:
                logger.warning(f"Failed to persist theme for deck {deck_id}: {e}")

        response = JSONResponse({
            "success": True,
            "theme": deck_theme,
            "palette": palette,
        })
        # Cleanup in-flight map if we owned the task
        try:
            if is_owner:
                async with _inflight_theme_lock:
                    current = _inflight_theme_tasks.get(outline_key)
                    if current and current.done():
                        _inflight_theme_tasks.pop(outline_key, None)
        except Exception:
            pass
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
