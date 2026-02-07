"""
Theme generation endpoints for outline phase (SSE + JSON fallback).
"""

from typing import Any, Dict, Optional, AsyncIterator
import asyncio
import json
import logging
import re
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


_DOMAIN_HINT_RE = re.compile(r"\b([a-z0-9][a-z0-9\-]+\.[a-z]{2,})\b", re.IGNORECASE)


def _guess_domain_hint(value: Optional[str]) -> Optional[str]:
    if not value or not isinstance(value, str):
        return None
    match = _DOMAIN_HINT_RE.search(value)
    if not match:
        return None
    return match.group(1).lower()


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

            # FAST PATH #1: Direct brand cache lookup
            # If we have a brandDomain or vibeContext that looks like a domain, check cache first
            brand_domain = getattr(style_prefs, 'brandDomain', None) if style_prefs else None
            vibe_context_raw = getattr(style_prefs, 'vibeContext', None) if style_prefs else None
            brand_name_raw = getattr(style_prefs, 'brandName', None) if style_prefs else None

            outline_title = getattr(outline, "title", None)

            # Try direct cache lookup (only use domain-like hints, avoid full prompt strings)
            cache_lookup_key = brand_domain
            if not cache_lookup_key:
                cache_lookup_key = (
                    _guess_domain_hint(vibe_context_raw)
                    or _guess_domain_hint(brand_name_raw)
                    or _guess_domain_hint(outline_title)
                )
            if not cache_lookup_key and brand_name_raw:
                trimmed = " ".join(str(brand_name_raw).split()).strip()
                if trimmed and len(trimmed) <= 64:
                    cache_lookup_key = trimmed
            if cache_lookup_key:
                try:
                    from services.brand_cache_direct import get_cached_brand_direct
                    cached_brand = get_cached_brand_direct(cache_lookup_key)

                    if cached_brand and cached_brand.get("found"):
                        colors = cached_brand.get("colors", {})
                        fonts = cached_brand.get("fonts", {})

                        # Check if cache has meaningful data
                        has_colors = colors.get("accent") or colors.get("background") not in (None, "#FFFFFF")
                        has_fonts = fonts.get("hero") and fonts.get("hero") not in ("Montserrat", "Inter", "Open Sans", None)

                        if has_colors or has_fonts:
                            hero_font = fonts.get("hero") or "Montserrat"
                            body_font = fonts.get("body") or hero_font

                            cached_theme = {
                                "theme_name": f"{cached_brand.get('brand_name', 'Brand')} Theme",
                                "color_palette": {
                                    "primary_background": colors.get("background") or "#FFFFFF",
                                    "primary_text": colors.get("text") or "#1A1A1A",
                                    "accent_1": colors.get("accent"),
                                    "accent_2": colors.get("accent2"),
                                    "backgrounds": [colors.get("background") or "#FFFFFF"],
                                    "accents": [c for c in [colors.get("accent"), colors.get("accent2")] if c],
                                    "text_colors": {"primary": colors.get("text") or "#1A1A1A"},
                                    "colors": [c for c in [colors.get("accent"), colors.get("accent2"), colors.get("background")] if c],
                                    "metadata": {"logo_url": cached_brand.get("logo_url")} if cached_brand.get("logo_url") else {}
                                },
                                "typography": {
                                    "hero_title": {"family": hero_font},
                                    "body_text": {"family": body_font}
                                },
                                "brandInfo": {
                                    "logoUrl": cached_brand.get("logo_url"),
                                    "brandName": cached_brand.get("brand_name"),
                                    "brandDomain": cached_brand.get("domain"),
                                },
                                "visual_style": {}
                            }

                            logger.info(
                                f"[THEME API] FAST PATH: Using cached brand data for {cache_lookup_key} - "
                                f"bg={colors.get('background')}, accent={colors.get('accent')}, fonts={hero_font}/{body_font}"
                            )

                            yield _sse({
                                "type": "theme_generated",
                                "timestamp": datetime.now().isoformat(),
                                "theme": cached_theme,
                                "palette": cached_theme["color_palette"],
                                "cached": True,
                                "source": "brand_cache_direct"
                            })
                            yield _sse({"type": "end", "message": "Stream complete"})
                            return

                except Exception as cache_err:
                    logger.warning(f"[THEME API] Direct cache lookup failed: {cache_err}")
                    # Continue with normal flow

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

            # DEFAULT COLORS that should NOT trigger fast path reconstruction
            # These are placeholders, not real brand colors
            DEFAULT_PLACEHOLDER_COLORS = {
                '#3b82f6', '#6b7280', '#9ca3af', '#ffffff', '#1a1a1a', '#1f2937',
                '#3B82F6', '#6B7280', '#9CA3AF', '#FFFFFF', '#1A1A1A', '#1F2937',  # Uppercase variants
            }

            # Check if colors are just defaults (not real brand colors)
            is_default_colors = brand_colors and all(c in DEFAULT_PLACEHOLDER_COLORS for c in brand_colors)
            if is_default_colors:
                logger.info("[THEME API] Skipping fast path - default placeholder colors detected")
                brand_colors = []  # Clear to trigger ThemeDirector path

            if style_prefs and brand_colors:
                logger.info(f"[THEME API] ✅ CREATING THEME FROM BRAND DATA (avoiding regeneration)")
                logger.info(f"[THEME API] Brand colors: {brand_colors}")
                logger.info(f"[THEME API] Brand fonts: {brand_fonts}")
                logger.info(f"[THEME API] Logo URL: {logo_url}")
                logger.info(f"[THEME API] Vibe context: {vibe_context}")

                # Create theme from brand data matching frontend format
                bg_color = background if background else "#FFFFFF"
                text_color = text if text else "#1F2937"
                accent_color = brand_colors[0] if len(brand_colors) > 0 else "#FF4301"
                
                # Get fonts from stylePreferences (hero font AND body font separately)
                hero_font = brand_fonts  # This is style_prefs.font
                body_font_from_prefs = getattr(style_prefs, 'bodyFont', None)
                body_font = body_font_from_prefs if body_font_from_prefs else brand_fonts

                # If no fonts set, use neutral defaults
                if not brand_fonts:
                    hero_font = 'Inter'
                    body_font = 'Inter'
                    logger.info("[THEME API] Using default fonts: %s/%s", hero_font, body_font)

                brand_domain = getattr(style_prefs, 'brandDomain', None)
                brand_name = getattr(style_prefs, 'brandName', None)
                needs_confirmation = getattr(style_prefs, 'needsBrandDomainConfirmation', None)

                brand_info = {}
                if logo_url:
                    brand_info["logoUrl"] = logo_url
                if brand_name:
                    brand_info["brandName"] = brand_name
                if brand_domain:
                    brand_info["brandDomain"] = brand_domain
                if needs_confirmation:
                    brand_info["needsBrandDomainConfirmation"] = True

                reconstructed_theme = {
                    "theme_name": f"{vibe_context.replace('.com', '').replace('www.', '').title()} Brand Theme" if vibe_context else "Brand Theme",
                    "color_palette": {
                        # Named fields (for slide generation)
                        "primary_background": bg_color,
                        "primary_text": text_color,
                        "accent_1": accent_color,
                        "accent_2": brand_colors[1] if len(brand_colors) > 1 else accent_color,
                        # Array fields (for theme dropdown/swatches)
                        "backgrounds": [bg_color],
                        "accents": [accent_color],
                        "text_colors": {
                            "primary": text_color
                        },
                        "colors": brand_colors[:6],  # Limit to 6 colors for frontend
                        "metadata": {
                            "logo_url": logo_url
                        } if logo_url else {}
                    },
                    "typography": {
                        "hero_title": {"family": hero_font},
                        "body_text": {"family": body_font}
                    },
                    "brandInfo": brand_info,
                    "visual_style": {}
                }

                # Create compatible palette structure
                palette = {
                    "colors": brand_colors[:6],
                    "fonts": [hero_font, body_font] if hero_font else [],
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

        # NOTE: Brand detection is handled by ThemeDirector using AI
        # We previously had a regex-based "fast path" here that caused bugs
        # (e.g., matching "The" from title and returning NYTimes branding)
        # The AI in ThemeDirector is much smarter at understanding context

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

            # Extract theme + full palette + search_terms from ThemeDocument
            deck_theme = theme_doc.deck_theme if hasattr(theme_doc, "deck_theme") else None
            search_terms = theme_doc.search_terms if hasattr(theme_doc, "search_terms") else []

            logger.info(f"[THEME API] Extracted {len(search_terms)} search terms from ThemeDocument: {search_terms}")

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
                is_temp_uuid = (deck_id.startswith('temp-') or deck_id.startswith('theme-')) if deck_id else True
                if is_temp_uuid:
                    logger.info(
                        "[THEME API] Skipping persistence for temp UUID: %s - theme will be passed via stylePreferences",
                        deck_id,
                    )
                else:
                    try:
                        from utils.supabase import get_deck, upload_deck

                        existing = get_deck(deck_id) or {}
                        data_field = existing.get("data", {}) if isinstance(existing.get("data"), dict) else {}
                        data_field["theme"] = deck_theme

                        # CRITICAL: Store search_terms for image search during deck generation
                        if search_terms and len(search_terms) > 0:
                            data_field["search_terms"] = search_terms
                            logger.info(f"[THEME API] Persisting {len(search_terms)} search terms to deck data")

                        # Also store palette under style_spec if available
                        if isinstance(palette, dict):
                            data_field.setdefault("style_spec", {})
                            if isinstance(data_field["style_spec"], dict):
                                data_field["style_spec"]["palette"] = palette

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

            # DEFAULT COLORS that should NOT trigger fast path reconstruction
            DEFAULT_PLACEHOLDER_COLORS = {
                '#3b82f6', '#6b7280', '#9ca3af', '#ffffff', '#1a1a1a', '#1f2937',
                '#3B82F6', '#6B7280', '#9CA3AF', '#FFFFFF', '#1A1A1A', '#1F2937',
            }

            is_default_colors = brand_colors and all(c in DEFAULT_PLACEHOLDER_COLORS for c in brand_colors)
            if is_default_colors:
                logger.info("[THEME JSON] Skipping fast path - default placeholder colors detected")
                brand_colors = []

            if style_prefs and brand_colors:
                logger.info(f"[THEME JSON] ✅ CREATING THEME FROM BRAND DATA (avoiding regeneration)")
                logger.info(f"[THEME JSON] Brand colors: {brand_colors}")
                logger.info(f"[THEME JSON] Brand fonts: {brand_fonts}")
                logger.info(f"[THEME JSON] Logo URL: {logo_url}")
                logger.info(f"[THEME JSON] Vibe context: {vibe_context}")

                # Create theme from brand data matching frontend format
                bg_color = background if background else "#FFFFFF"
                text_color = text if text else "#1F2937"
                accent_color = brand_colors[0] if len(brand_colors) > 0 else "#FF4301"

                # Get fonts from stylePreferences (hero font AND body font separately)
                hero_font = brand_fonts  # This is style_prefs.font
                body_font_from_prefs = getattr(style_prefs, 'bodyFont', None)
                body_font = body_font_from_prefs if body_font_from_prefs else brand_fonts

                # If no fonts set, use neutral defaults
                if not brand_fonts:
                    hero_font = 'Inter'
                    body_font = 'Inter'
                    logger.info("[THEME JSON] Using default fonts: %s/%s", hero_font, body_font)

                # Ensure hero and body are different
                if hero_font and body_font and hero_font.lower() == body_font.lower():
                    body_font = 'Roboto' if hero_font != 'Roboto' else 'Open Sans'
                    logger.info(f"[THEME JSON] 🔄 Ensured different fonts: hero={hero_font}, body={body_font}")

                reconstructed_theme = {
                    "theme_name": f"{vibe_context.replace('.com', '').replace('www.', '').title()} Brand Theme" if vibe_context else "Brand Theme",
                    "color_palette": {
                        # Named fields (for slide generation)
                        "primary_background": bg_color,
                        "primary_text": text_color,
                        "accent_1": accent_color,
                        "accent_2": brand_colors[1] if len(brand_colors) > 1 else accent_color,
                        # Array fields (for theme dropdown/swatches)
                        "backgrounds": [bg_color],
                        "accents": [accent_color],
                        "text_colors": {
                            "primary": text_color
                        },
                        "colors": brand_colors[:6],  # Limit to 6 colors for frontend
                        "metadata": {
                            "logo_url": logo_url
                        } if logo_url else {}
                    },
                    "typography": {
                        "hero_title": {"family": hero_font},
                        "body_text": {"family": body_font}
                    },
                    "brandInfo": brand_info,
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

        # Optionally persist (skip for temp UUIDs)
        is_temp_uuid = (deck_id.startswith('temp-') or deck_id.startswith('theme-')) if deck_id else True
        if deck_id and isinstance(deck_theme, dict) and not is_temp_uuid:
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
        elif is_temp_uuid:
            logger.info(f"[THEME API JSON] Skipping persistence for temp UUID: {deck_id}")

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
