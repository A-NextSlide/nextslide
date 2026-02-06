"""
Admin Playground API — two-phase generation for comparing models.

Phase 1 (Preview):  POST /generate-preview
    Generate ONE shared outline + theme (same pipeline as /app).
    Returns JSON immediately.

Phase 2 (Batch):    POST /generate-batch
    Accepts pre-generated outline + theme, fans out slide HTML
    generation to each selected model over a single SSE stream.
"""
import json
import time
import logging
import asyncio
import concurrent.futures
from typing import Optional, Dict, Any, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.requests.api_admin import verify_admin_role
from services.supabase import get_supabase_client
from agents.ai.clients import get_client, invoke, MODELS, MODEL_MAX_TOKENS
from agents.config import OUTLINE_AGENT_MODEL, USE_MODAL
from agents.generation.playground_component_generator import PlaygroundComponentGenerator
from agents.theme.theme_agent import ThemeAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/playground", tags=["Playground"])

# Dedicated thread pool so 14+ parallel models don't starve the default executor.
_PLAYGROUND_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=60)

# ── Available models ────────────────────────────────────────────────────────
PLAYGROUND_MODELS: Dict[str, str] = {
    # Google
    "gemini-3-pro-preview": "Gemini 3 Pro",
    "gemini-3-flash-preview": "Gemini 3 Flash",
    # Anthropic
    "claude-opus-4-6": "Claude Opus 4.6",
    "claude-opus-4-5": "Claude Opus 4.5",
    "claude-sonnet-4-5": "Claude Sonnet 4.5",
    "claude-haiku-4-5": "Claude Haiku 4.5",
    # OpenAI
    "gpt-5.2": "GPT-5.2",
    "gpt-5": "GPT-5",
    "gpt-5-mini": "GPT-5 Mini",
    "gpt-4.1": "GPT-4.1",
    # xAI
    "grok-4": "Grok 4",
    "grok-4-fast": "Grok 4 Fast",
    # Mistral
    "mistral-large-3": "Mistral Large 3",
}


def _safe_max_tokens(model_id: str, desired: int) -> int:
    """Return the min of desired and the model's known limit."""
    limit = MODEL_MAX_TOKENS.get(model_id)
    if limit is None:
        entry = MODELS.get(model_id)
        if entry:
            limit = MODEL_MAX_TOKENS.get(entry[1])
    return min(desired, limit or 8192)


# ── Pydantic models for structured output ───────────────────────────────────
class PlaygroundSlide(BaseModel):
    title: str
    content: str
    key_points: list[str] = []
    speaker_notes: str = ""


class PlaygroundOutline(BaseModel):
    title: str
    subtitle: str = ""
    slides: list[PlaygroundSlide]


# ── Request models ─────────────────────────────────────────────────────────
class PlaygroundPreviewRequest(BaseModel):
    prompt: str
    slide_count: Optional[int] = None
    detail_level: Optional[str] = "standard"


class PlaygroundBatchRequest(BaseModel):
    outline: dict          # PlaygroundOutline serialized
    theme: dict            # Full slide theme dict (from preview response)
    model_ids: List[str]
    slide_mode: Optional[str] = "interactive"
    temperature: Optional[float] = 0.8
    prompt: Optional[str] = None  # Original user prompt — passed as presentation_context


# ── Content enrichment (mirrors production CustomComponentEnhancer) ─────────
def _enrich_slide_content(
    slide: PlaygroundSlide,
    prompt: str,
    outline_summary: str,
) -> str:
    """Enrich slide content with deck context, matching production pipeline.

    Production uses _enrich_content_with_research() to append research_context,
    scraped_context, and presentation_context. Playground has no research data
    but passes the full outline summary + user prompt for equivalent richness.
    """
    parts = [slide.title]
    if slide.content:
        parts.append(slide.content)
    if slide.key_points:
        for kp in slide.key_points:
            parts.append(f"- {kp}")

    # Append outline summary (like production's research_context)
    if outline_summary:
        parts.append(f"\n\nDECK OUTLINE (for context — design THIS slide, not the others):\n{outline_summary}")

    # Append prompt as presentation context (like production's presentation_context)
    if prompt:
        parts.append(f"\n\nPRESENTATION CONTEXT: {prompt}")

    return "\n".join(parts)


def _build_outline_summary(outline: 'PlaygroundOutline') -> str:
    """Build a compact deck outline summary for context injection."""
    lines = [f'Deck: "{outline.title}"']
    if outline.subtitle:
        lines.append(f"Subtitle: {outline.subtitle}")
    for i, s in enumerate(outline.slides):
        lines.append(f"  Slide {i + 1}: {s.title}")
    return "\n".join(lines)


def _build_slide_context(
    slide: PlaygroundSlide,
    index: int,
    total: int,
    outline_title: str,
    slide_mode: str,
    prompt: str,
) -> Dict[str, Any]:
    """Build rich slide_context matching production's build_custom_component_context."""
    return {
        "title": slide.title,
        "slide_index": index,
        "total_slides": total,
        "slide_type": "content",
        "slide_mode": slide_mode,
        "deck_title": outline_title,
        "is_full_slide": True,
        "presentation_context": prompt,
        "initial_idea": prompt,
        "vibe_context": prompt,
    }


# ── Slide HTML generation (uses real CustomComponentGenerator pipeline) ─────
async def _generate_slide_html(
    model_id: str,
    theme: Dict[str, Any],
    slide: PlaygroundSlide,
    index: int,
    total: int,
    outline_title: str,
    slide_mode: str = "interactive",
    temperature: float = 0.8,
    prompt: str = "",
    outline_summary: str = "",
) -> tuple:
    """Generate slide HTML using the production CustomComponentGenerator.

    When USE_MODAL is enabled, dispatches each slide to a Modal serverless
    container for massive parallelism (14 models x 10 slides = 140 concurrent).
    """
    try:
        content = _enrich_slide_content(slide, prompt, outline_summary)
        slide_ctx = _build_slide_context(slide, index, total, outline_title, slide_mode, prompt)

        if USE_MODAL:
            from services.modal_dispatch import generate_playground_slide_via_modal
            result = await generate_playground_slide_via_modal(
                model_id=model_id,
                theme=theme,
                slide_content=content,
                slide_title=slide.title,
                slide_index=index,
                total_slides=total,
                outline_title=outline_title,
                slide_mode=slide_mode,
                temperature=temperature,
                prompt=prompt,
                outline_summary=outline_summary,
            )
            return result["index"], result.get("html")

        # Local path
        generator = PlaygroundComponentGenerator(model=model_id)
        generator.temperature = temperature
        component = await generator.generate(
            content=content,
            theme=theme,
            slide_context=slide_ctx,
            width=1920,
            height=1080,
            auto_prefetch=False,
        )

        if component and component.get("props", {}).get("render"):
            return index, component["props"]["render"]
        return index, None
    except Exception as e:
        logger.error(f"Slide HTML generation error (slide {index}, {model_id}): {e}")
        return index, None


# ── Per-model slide generation (shared outline + theme, per-model slides) ──
async def _run_model_slides(
    model_id: str,
    outline: PlaygroundOutline,
    theme: Dict[str, Any],
    slide_mode: str,
    queue: asyncio.Queue,
    temperature: float = 0.8,
    prompt: str = "",
):
    """Generate slide HTML for one model using shared outline + theme."""
    start = time.time()
    outline_summary = _build_outline_summary(outline)

    async def emit(data: dict):
        data["model_id"] = model_id
        await queue.put(data)

    try:
        await emit({"type": "status", "message": "Generating slides..."})

        # All slides fire in parallel — global AI semaphore (25) in
        # CustomComponentGenerator handles cross-model throttling.
        tasks = [
            asyncio.create_task(
                _generate_slide_html(
                    model_id, theme,
                    slide, i, len(outline.slides), outline.title,
                    slide_mode=slide_mode,
                    temperature=temperature,
                    prompt=prompt,
                    outline_summary=outline_summary,
                )
            )
            for i, slide in enumerate(outline.slides)
        ]

        completed = 0
        for coro in asyncio.as_completed(tasks):
            idx, html = await coro
            completed += 1
            await emit({"type": "slide_html", "index": idx, "html": html})
            await emit({"type": "status", "message": f"Slides: {completed}/{len(outline.slides)}"})

        elapsed = round(time.time() - start, 2)
        await emit({"type": "complete", "elapsed_seconds": elapsed})

    except Exception as exc:
        elapsed = round(time.time() - start, 2)
        logger.error(f"Playground slide generation error ({model_id}): {exc}", exc_info=True)
        await emit({"type": "error", "message": str(exc), "elapsed_seconds": elapsed})
    finally:
        await queue.put({"model_id": model_id, "type": "__done__"})


# ── ThemeAgent result → CustomComponentGenerator theme dict ────────────────
def _theme_agent_to_slide_theme(agent_result: Dict[str, Any]) -> Dict[str, Any]:
    """Convert ThemeAgent.run() output to the dict format CustomComponentGenerator expects."""
    colors = agent_result.get("colors", []) or []
    fonts = agent_result.get("fonts", {}) or {}
    return {
        "color_palette": {
            "primary_background": agent_result.get("background") or "#0f172a",
            "primary_text": agent_result.get("text") or "#ffffff",
            "accent_1": agent_result.get("accent") or (colors[0] if colors else "#FF4301"),
            "accent_2": agent_result.get("accent2") or (colors[1] if len(colors) > 1 else "#FFB81D"),
            "colors": colors,
        },
        "typography": {
            "heading": fonts.get("hero", "Montserrat"),
            "body": fonts.get("body", "Open Sans"),
        },
        "design_philosophy": "Cohesive, professional slides with clear hierarchy.",
        "logo_url": agent_result.get("logo_url"),
    }


# ── Endpoints ───────────────────────────────────────────────────────────────
@router.get("/models")
async def list_models(_admin: dict = Depends(verify_admin_role)):
    """Return the list of models available in the playground."""
    models = []
    for model_id, display_name in PLAYGROUND_MODELS.items():
        provider = MODELS.get(model_id, (None,))[0] or "unknown"
        models.append({"id": model_id, "name": display_name, "provider": provider})
    return {"models": models}


@router.post("/generate-preview")
async def generate_preview(
    request: PlaygroundPreviewRequest,
    admin: dict = Depends(verify_admin_role),
):
    """
    Phase 1: Generate shared outline + theme (same pipeline as /app).
    Returns JSON with outline data, full theme (for batch), and display-friendly theme summary.
    """
    loop = asyncio.get_event_loop()
    outline_model_id = OUTLINE_AGENT_MODEL
    slide_count = request.slide_count or 10

    system_prompt = (
        "You are a presentation outline generator. "
        "Create a well-structured presentation outline from the user's prompt. "
        "For each slide, write out ALL the text that should appear on the final slide — "
        "every heading, sentence, stat, quote, and bullet point. "
        "A slide designer will take your output WORD FOR WORD and create the visual layout, "
        "so everything must be presentation-ready text (concise, punchy, written to be presented, not read). "
        "Be smart about content depth: a title slide needs just a title and subtitle; "
        "a data slide needs specific numbers and comparisons; "
        "a process slide needs step names and short descriptions. "
        "Match the content volume to what each slide actually needs — "
        "don't force every slide into the same format. "
        f"Generate exactly {slide_count} slides."
    )
    user_prompt = (
        f"Create a presentation outline for:\n\n"
        f"{request.prompt}\n\n"
        f"Generate exactly {slide_count} slides. "
        f"Write the EXACT text for each slide — every word you write will appear on the final slide. "
        f"Keep it presentation-ready: concise, impactful, designed to be presented not read."
    )

    # ── Outline ───────────────────────────────────────────────────────────
    client, model = get_client(outline_model_id)
    outline: PlaygroundOutline = await loop.run_in_executor(
        _PLAYGROUND_EXECUTOR,
        lambda: invoke(
            client, model,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_model=PlaygroundOutline,
            max_tokens=_safe_max_tokens(outline_model_id, 8192),
            temperature=0.7,
        ),
    )

    # ── Theme ─────────────────────────────────────────────────────────────
    try:
        agent = ThemeAgent()
        agent_result = await agent.run(
            title=outline.title,
            prompt=request.prompt,
            context=outline.subtitle,
        )
        slide_theme = _theme_agent_to_slide_theme(agent_result)
    except Exception as theme_err:
        logger.warning(f"ThemeAgent failed, using defaults: {theme_err}")
        slide_theme = {
            "color_palette": {
                "accent_1": "#FF4301",
                "accent_2": "#FFB81D",
                "primary_text": "#ffffff",
                "primary_background": "#0f172a",
            },
            "typography": {"heading": "Inter", "body": "Inter"},
            "design_philosophy": "Create visually compelling, professional slides.",
        }

    # Build display-friendly summary
    palette = slide_theme["color_palette"]
    typo = slide_theme["typography"]
    theme_summary = {
        "accent_color": palette.get("accent_1", "#FF4301"),
        "secondary_color": palette.get("accent_2", "#FFB81D"),
        "background_color": palette.get("primary_background", "#0f172a"),
        "text_color": palette.get("primary_text", "#ffffff"),
        "heading_font": typo.get("heading", "Montserrat"),
        "body_font": typo.get("body", "Open Sans"),
        "design_philosophy": slide_theme.get("design_philosophy", ""),
    }

    return {
        "outline": outline.model_dump(),
        "theme": slide_theme,           # Full theme — pass this to /generate-batch
        "theme_summary": theme_summary,  # Display-friendly for the UI
    }


@router.post("/generate-batch")
async def generate_batch(
    request: PlaygroundBatchRequest,
    admin: dict = Depends(verify_admin_role),
):
    """
    Phase 2: Fan out slide HTML generation to each selected model.
    Accepts pre-generated outline + theme from /generate-preview.
    """

    async def _stream():
        queue: asyncio.Queue = asyncio.Queue()
        slide_mode = request.slide_mode or "interactive"

        # Reconstruct outline from dict
        outline = PlaygroundOutline(**request.outline)
        start = time.time()

        # Initialize every model as "starting"
        for mid in request.model_ids:
            yield f"data: {json.dumps({'type': 'status', 'model_id': mid, 'message': 'Starting...', 'slide_count': len(outline.slides)})}\n\n"

        temperature = request.temperature or 0.8
        prompt = request.prompt or ""
        tasks = [
            asyncio.create_task(
                _run_model_slides(mid, outline, request.theme, slide_mode, queue, temperature=temperature, prompt=prompt)
            )
            for mid in request.model_ids
        ]
        remaining = len(tasks)

        while remaining > 0:
            event = await queue.get()
            if event.get("type") == "__done__":
                remaining -= 1
                continue
            yield f"data: {json.dumps(event)}\n\n"

        total_elapsed = round(time.time() - start, 2)
        yield f"data: {json.dumps({'type': 'all_complete', 'elapsed_seconds': total_elapsed})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Persistence: request models ──────────────────────────────────────────────
class ModelResultPayload(BaseModel):
    model_id: str
    model_name: str
    status: str = "pending"
    slide_htmls: List[Optional[str]] = []
    elapsed_seconds: Optional[float] = None
    error: Optional[str] = None


class SaveRunRequest(BaseModel):
    prompt: str
    temperature: float
    slide_mode: str
    slide_count: int
    outline: dict
    theme: dict
    theme_summary: Optional[dict] = None
    model_ids: List[str]
    total_elapsed_seconds: Optional[float] = None
    label: Optional[str] = None
    model_results: List[ModelResultPayload]


class UpsertModelResultRequest(BaseModel):
    model_name: str
    status: str
    slide_htmls: List[Optional[str]] = []
    elapsed_seconds: Optional[float] = None
    error: Optional[str] = None


# ── Persistence endpoints ─────────────────────────────────────────────────────
@router.post("/runs")
async def save_run(
    request: SaveRunRequest,
    admin: dict = Depends(verify_admin_role),
):
    """Save a complete playground run (experiment settings + all model results)."""
    sb = get_supabase_client()
    user_id = admin["user_id"]

    # Insert run row
    run_row = {
        "user_id": user_id,
        "prompt": request.prompt,
        "temperature": request.temperature,
        "slide_mode": request.slide_mode,
        "slide_count": request.slide_count,
        "outline": request.outline,
        "theme": request.theme,
        "theme_summary": request.theme_summary,
        "model_ids": request.model_ids,
        "total_elapsed_seconds": request.total_elapsed_seconds,
        "label": request.label,
    }
    run_res = sb.table("playground_runs").insert(run_row).execute()
    run = run_res.data[0]
    run_id = run["id"]

    # Insert model results
    if request.model_results:
        result_rows = [
            {
                "run_id": run_id,
                "model_id": mr.model_id,
                "model_name": mr.model_name,
                "status": mr.status,
                "slide_htmls": mr.slide_htmls,
                "elapsed_seconds": mr.elapsed_seconds,
                "error": mr.error,
            }
            for mr in request.model_results
        ]
        sb.table("playground_model_results").insert(result_rows).execute()

    return {"id": run_id, "created_at": run["created_at"]}


@router.put("/runs/{run_id}/models/{model_id}")
async def upsert_model_result(
    run_id: UUID,
    model_id: str,
    request: UpsertModelResultRequest,
    admin: dict = Depends(verify_admin_role),
):
    """Upsert a single model result (e.g. after regeneration)."""
    sb = get_supabase_client()

    row = {
        "run_id": str(run_id),
        "model_id": model_id,
        "model_name": request.model_name,
        "status": request.status,
        "slide_htmls": request.slide_htmls,
        "elapsed_seconds": request.elapsed_seconds,
        "error": request.error,
    }
    sb.table("playground_model_results").upsert(
        row, on_conflict="run_id,model_id"
    ).execute()

    return {"success": True}


@router.get("/runs")
async def list_runs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: dict = Depends(verify_admin_role),
):
    """List runs (lightweight — no HTML blobs)."""
    sb = get_supabase_client()
    offset = (page - 1) * limit

    # Count total
    count_res = sb.table("playground_runs").select("id", count="exact").execute()
    total = count_res.count or 0

    # Fetch runs ordered by created_at DESC
    runs_res = (
        sb.table("playground_runs")
        .select("id, prompt, temperature, slide_mode, slide_count, model_ids, total_elapsed_seconds, label, theme_summary, created_at")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    runs = runs_res.data or []

    # Fetch lightweight model result summaries (no slide_htmls) for these runs
    if runs:
        run_ids = [r["id"] for r in runs]
        mr_res = (
            sb.table("playground_model_results")
            .select("run_id, model_id, model_name, status, elapsed_seconds, error")
            .in_("run_id", run_ids)
            .execute()
        )
        # Group by run_id
        mr_by_run: Dict[str, list] = {}
        for mr in (mr_res.data or []):
            mr_by_run.setdefault(mr["run_id"], []).append(mr)
        for run in runs:
            run["model_results"] = mr_by_run.get(run["id"], [])

    return {
        "runs": runs,
        "total": total,
        "page": page,
        "total_pages": -(-total // limit) if total > 0 else 0,
    }


@router.get("/runs/{run_id}")
async def get_run(
    run_id: UUID,
    admin: dict = Depends(verify_admin_role),
):
    """Get full run details including all model results with HTML blobs."""
    sb = get_supabase_client()

    run_res = sb.table("playground_runs").select("*").eq("id", str(run_id)).execute()
    if not run_res.data:
        raise HTTPException(status_code=404, detail="Run not found")
    run = run_res.data[0]

    mr_res = (
        sb.table("playground_model_results")
        .select("*")
        .eq("run_id", str(run_id))
        .execute()
    )
    run["model_results"] = mr_res.data or []

    return run


@router.delete("/runs/{run_id}")
async def delete_run(
    run_id: UUID,
    admin: dict = Depends(verify_admin_role),
):
    """Delete a run (CASCADE removes model results)."""
    sb = get_supabase_client()

    # Verify it exists
    check = sb.table("playground_runs").select("id").eq("id", str(run_id)).execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Run not found")

    sb.table("playground_runs").delete().eq("id", str(run_id)).execute()
    return {"success": True}
