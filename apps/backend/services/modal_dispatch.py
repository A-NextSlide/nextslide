"""
Dispatch layer that routes generation to Modal serverless containers.

Falls back to local execution on any Modal error.
"""

import asyncio
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import AsyncGenerator, AsyncIterator, Dict, Any, List, Optional
from models.requests import DeckOutline
from models.registry import ComponentRegistry
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# ── Module-level resources ──────────────────────────────────────────────────
# Reused across fallback calls to avoid leaking thread pools (Fix 3)
_fallback_pool = ThreadPoolExecutor(max_workers=4)

# Lightweight dispatch observability counters (Fix 12)
_modal_dispatch_success = 0
_modal_dispatch_fallback = 0


def _log_dispatch(func_name: str, success: bool):
    """Bump counters and emit a summary log line."""
    global _modal_dispatch_success, _modal_dispatch_fallback
    if success:
        _modal_dispatch_success += 1
    else:
        _modal_dispatch_fallback += 1
    logger.debug(
        "[modal_dispatch] %s %s (totals: success=%d fallback=%d)",
        func_name,
        "OK" if success else "FALLBACK",
        _modal_dispatch_success,
        _modal_dispatch_fallback,
    )


def _log_modal_failure(label: str, exc: Exception):
    """Log Modal dispatch failure — quiet for missing module, loud for real errors."""
    if isinstance(exc, ModuleNotFoundError):
        logger.debug("[modal_dispatch] %s → local (modal not installed)", label)
    else:
        logger.error("[modal_dispatch] %s FAILED, falling back to local: %s", label, exc)


# ── Retry helper for non-streaming calls (Fix 11) ──────────────────────────

async def _retry_modal_call(fn, *args, retries: int = 1, delay: float = 1.0, **kwargs):
    """
    Call *fn* with a single retry before giving up.

    Only suitable for non-streaming (request/response) Modal calls.
    """
    last_exc = None
    for attempt in range(1 + retries):
        try:
            return await fn(*args, **kwargs)
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                logger.warning(
                    "[modal_dispatch] Attempt %d failed, retrying in %.1fs: %s",
                    attempt + 1, delay, exc,
                )
                await asyncio.sleep(delay)
    raise last_exc


# ── Serialization helpers ───────────────────────────────────────────────────

def _serialize_classification(classification) -> Optional[dict]:
    """Serialize a MessageClassification (or None) to a plain dict."""
    if classification is None:
        return None
    if hasattr(classification, "model_dump"):
        return classification.model_dump()
    if hasattr(classification, "dict"):
        return classification.dict()
    if isinstance(classification, dict):
        return classification
    return None


# ── Dispatch functions ──────────────────────────────────────────────────────

async def generate_theme_via_modal(
    outline_dict: dict,
    available_fonts: list,
) -> dict:
    """
    Proxy theme generation through a Modal container.

    Returns the theme result dict.  Falls back to local execution on error.
    """
    try:
        import modal

        theme_fn = modal.Function.from_name("nextslide", "generate_theme_remote")

        logger.info("[modal_dispatch] Dispatching theme generation to Modal")

        result = await _retry_modal_call(
            theme_fn.remote.aio,
            outline_dict=outline_dict,
            available_fonts=available_fonts,
        )

        _log_dispatch("generate_theme", success=True)
        return result

    except Exception as exc:
        _log_modal_failure("generate_theme", exc)
        _log_dispatch("generate_theme", success=False)

        # Local fallback
        from models.requests import DeckOutline
        from agents.generation.theme_style_manager import ThemeStyleManager

        deck_outline = DeckOutline.model_validate(outline_dict)
        manager = ThemeStyleManager(available_fonts)
        return await manager.analyze_theme_and_style(deck_outline)


async def compose_deck_stream_via_modal(
    deck_outline: DeckOutline,
    registry: ComponentRegistry,
    deck_uuid: str,
    max_parallel: int,
    delay_between_slides: float,
    async_images: bool,
    prefetch_images: bool,
    enable_visual_analysis: Optional[bool],
    user_id: Optional[str],
) -> AsyncIterator[Dict[str, Any]]:
    """
    Proxy compose_deck_stream through a Modal container.

    Serializes inputs, calls the remote generator, and yields events back.
    On any Modal-side failure, falls back to local generation so the user
    still gets their deck.
    """
    try:
        import modal

        compose_deck_remote = modal.Function.from_name("nextslide", "compose_deck_remote")

        outline_dict = deck_outline.model_dump()
        schemas_dict = registry.get_json_schemas()

        logger.info(f"[modal_dispatch] Dispatching deck {deck_uuid} to Modal")

        async for event in compose_deck_remote.remote_gen.aio(
            outline_dict=outline_dict,
            schemas_dict=schemas_dict,
            deck_uuid=deck_uuid,
            max_parallel=max_parallel,
            delay_between_slides=delay_between_slides,
            async_images=async_images,
            prefetch_images=prefetch_images,
            enable_visual_analysis=enable_visual_analysis,
            user_id=user_id,
        ):
            yield event

        _log_dispatch("compose_deck_stream", success=True)

    except Exception as exc:
        _log_modal_failure(f"compose_deck_stream ({deck_uuid})", exc)
        _log_dispatch("compose_deck_stream", success=False)
        yield {
            "type": "info",
            "message": "Switched to local generation",
        }

        from agents.generation.deck_composer import _compose_deck_stream_local

        async for event in _compose_deck_stream_local(
            deck_outline=deck_outline,
            registry=registry,
            deck_uuid=deck_uuid,
            max_parallel=max_parallel,
            delay_between_slides=delay_between_slides,
            async_images=async_images,
            prefetch_images=prefetch_images,
            enable_visual_analysis=enable_visual_analysis,
            user_id=user_id,
        ):
            yield event


async def stream_outline_via_modal(
    request,
) -> AsyncGenerator[str, None]:
    """
    Proxy outline agent streaming through a Modal container.

    Falls back to local stream_agent_response on any error.
    """
    try:
        import modal

        stream_outline_remote = modal.Function.from_name("nextslide", "stream_outline_remote")

        request_dict = request.model_dump()

        logger.info("[modal_dispatch] Dispatching outline to Modal")

        async for sse_chunk in stream_outline_remote.remote_gen.aio(
            request_dict=request_dict,
        ):
            yield sse_chunk

        _log_dispatch("stream_outline", success=True)

    except Exception as exc:
        _log_modal_failure("stream_outline", exc)
        _log_dispatch("stream_outline", success=False)

        from api.requests.outline_agent.streaming import stream_agent_response

        async for sse_chunk in stream_agent_response(request):
            yield sse_chunk


async def edit_deck_via_modal(
    deck_data: dict,
    current_slide: Optional[dict],
    registry: ComponentRegistry,
    message: str,
    chat_history: Optional[List] = None,
    run_uuid: Optional[str] = None,
    event_cb: Optional[callable] = None,
    attachments: Optional[List[Dict]] = None,
    slide_screenshot: Optional[Dict] = None,
    classification=None,
) -> Dict[str, Any]:
    """
    Proxy edit_deck through a Modal container.

    Streams events back to the local ``event_cb`` in real-time, then returns
    the orchestrator result dict.  Falls back to local execution on error.
    """
    try:
        import modal

        edit_deck_fn = modal.Function.from_name("nextslide", "edit_deck_remote")

        schemas_dict = registry.get_json_schemas()
        classification_dict = _serialize_classification(classification)

        logger.info("[modal_dispatch] Dispatching edit_deck to Modal")

        result: Optional[Dict] = None
        async for item in edit_deck_fn.remote_gen.aio(
            deck_data=deck_data,
            current_slide=current_slide,
            schemas_dict=schemas_dict,
            message=message,
            chat_history=chat_history,
            run_uuid=run_uuid or "",
            attachments=attachments,
            slide_screenshot=slide_screenshot,
            classification_dict=classification_dict,
        ):
            kind = item.get("kind")
            if kind == "event" and event_cb:
                try:
                    event_cb(item["event_type"], item["data"])
                except Exception:
                    pass
            elif kind == "result":
                result = item["result"]
            elif kind == "error":
                raise RuntimeError(item.get("error", "edit_deck_remote failed"))

        if result is None:
            raise RuntimeError("edit_deck_remote returned no result")

        _log_dispatch("edit_deck", success=True)
        return result

    except Exception as exc:
        _log_modal_failure("edit_deck", exc)
        _log_dispatch("edit_deck", success=False)

        from agents.editing.editing_orchestrator import edit_deck
        from utils.threading import run_in_threadpool

        return await run_in_threadpool(
            _fallback_pool,
            edit_deck,
            deck_data=deck_data,
            current_slide=current_slide,
            registry=registry,
            message=message,
            chat_history=chat_history,
            run_uuid=run_uuid,
            event_cb=event_cb,
            attachments=attachments,
            slide_screenshot=slide_screenshot,
            classification=classification,
        )


async def edit_outline_via_modal(request_dict: dict) -> Dict[str, Any]:
    """
    Proxy outline edit through a Modal container.

    Returns the response dict.  Falls back to local execution on error.
    """
    try:
        import modal

        edit_outline_fn = modal.Function.from_name("nextslide", "edit_outline_remote")

        logger.info("[modal_dispatch] Dispatching edit_outline to Modal")

        result = await _retry_modal_call(
            edit_outline_fn.remote.aio, request_dict=request_dict,
        )

        _log_dispatch("edit_outline", success=True)
        return result

    except Exception as exc:
        _log_modal_failure("edit_outline", exc)
        _log_dispatch("edit_outline", success=False)

        # Local fallback: run edit_outline_core directly
        from api.requests.api_outline_chat import EditOutlineRequest
        from services.outline.outline_editing import edit_outline_core

        request = EditOutlineRequest.model_validate(request_dict)
        return await edit_outline_core(request)


async def generate_narrative_flow_via_modal(
    outline_dict: dict,
    deck_uuid: str,
    context: Optional[str] = None,
) -> Optional[dict]:
    """
    Run narrative flow analysis in a Modal container.

    Generates the narrative flow and persists it to decks.notes.
    Falls back to local execution on any Modal error.
    Returns the result dict or None.
    """
    try:
        import modal

        narrative_fn = modal.Function.from_name(
            "nextslide", "generate_narrative_flow_remote"
        )

        logger.info(
            "[modal_dispatch] Dispatching narrative flow for deck %s to Modal",
            deck_uuid,
        )

        result = await _retry_modal_call(
            narrative_fn.remote.aio,
            outline_dict=outline_dict,
            deck_uuid=deck_uuid,
            context=context,
        )

        if result and result.get("error"):
            raise RuntimeError(result["error"])

        _log_dispatch("generate_narrative_flow", success=True)
        return result

    except Exception as exc:
        _log_modal_failure(f"generate_narrative_flow ({deck_uuid})", exc)
        _log_dispatch("generate_narrative_flow", success=False)

        # Local fallback
        from services.narrative_flow_analyzer import NarrativeFlowAnalyzer
        from utils.supabase import update_deck_notes

        analyzer = NarrativeFlowAnalyzer()
        narrative_flow = await analyzer.analyze_narrative_flow(
            outline_dict, context=context
        )

        if narrative_flow:
            flow_dict = narrative_flow.model_dump()
            update_deck_notes(deck_uuid, flow_dict)
            return {"success": True, "narrative_flow": flow_dict}
        return None


async def generate_outline_via_modal(
    prompt: str,
    slide_count: int,
    style_context: Optional[str],
    async_images: bool,
    files: Optional[list] = None,
) -> Optional[dict]:
    """
    Run OutlineGenerator.generate() in a Modal container (non-streaming).

    Returns a dict with {title, slides} or None on failure.
    Falls back to local on error.
    """
    try:
        import modal

        generate_outline_fn = modal.Function.from_name("nextslide", "generate_outline_remote")

        logger.info("[modal_dispatch] Dispatching outline generation to Modal")

        result = await _retry_modal_call(
            generate_outline_fn.remote.aio,
            prompt=prompt,
            slide_count=slide_count,
            style_context=style_context,
            async_images=async_images,
            files=files,
        )

        if result and result.get("error"):
            raise RuntimeError(result["error"])

        _log_dispatch("generate_outline", success=True)
        return result

    except Exception as exc:
        _log_modal_failure("generate_outline", exc)
        _log_dispatch("generate_outline", success=False)
        return None
