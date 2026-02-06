"""
Modal serverless app for offloading deck generation to dedicated containers.

Deploy:  modal deploy modal_app.py
Dev:     modal serve modal_app.py
"""
from __future__ import annotations

from typing import Optional

import modal

app = modal.App("nextslide")

_local_dir_ignore = [
    "__pycache__", "*.pyc", ".env", ".git", "node_modules",
    "tests/", ".pytest_cache/", ".venv*", "venv/",
    "*.bak", "*.backup", ".DS_Store", "test_output/",
    "scripts/", "migrations/", "schemas/",
]

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install_from_requirements("requirements.txt")
    .env({"PYTHONPATH": "/app", "USE_MODAL": "false"})
    .add_local_dir(".", "/app", ignore=_local_dir_ignore)
)

# Separate lightweight image for Playwright thumbnail rendering (~400MB Chromium)
playwright_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "playwright==1.49.1",
        "Pillow>=10.0.0",
        "python-dotenv>=1.0.0",
        "supabase==2.22.0",
        "supabase-auth==2.22.0",
        "supabase-functions==2.22.0",
        "storage3==2.22.0",
        "postgrest==2.22.0",
        "realtime==2.22.0",
    )
    .run_commands("playwright install chromium", "playwright install-deps chromium")
    .env({"PYTHONPATH": "/app"})
    .add_local_dir(".", "/app", ignore=_local_dir_ignore)
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=900,
    memory=2048,
    cpu=2.0,
)
@modal.concurrent(max_inputs=20)
async def compose_deck_remote(
    outline_dict: dict,
    schemas_dict: dict,
    deck_uuid: str,
    max_parallel: int,
    delay_between_slides: float,
    async_images: bool,
    prefetch_images: bool,
    enable_visual_analysis: Optional[bool],
    user_id: Optional[str],
):
    """Run compose_deck_stream inside a Modal container."""
    from models.requests import DeckOutline
    from models.registry import ComponentRegistry
    from agents.generation.deck_composer import _compose_deck_stream_local

    deck_outline = DeckOutline.model_validate(outline_dict)
    registry = ComponentRegistry(schemas_dict)

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


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=60,
    memory=1024,
    cpu=1.0,
)
@modal.concurrent(max_inputs=8)
async def generate_theme_remote(
    outline_dict: dict,
    available_fonts: list,
) -> dict:
    """Run theme generation inside a Modal container."""
    from models.requests import DeckOutline
    from agents.generation.theme_style_manager import ThemeStyleManager

    deck_outline = DeckOutline.model_validate(outline_dict)
    manager = ThemeStyleManager(available_fonts)
    return await manager.analyze_theme_and_style(deck_outline)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=300,
    memory=2048,
    cpu=1.0,
)
@modal.concurrent(max_inputs=4)
async def generate_outline_remote(
    prompt: str,
    slide_count: int,
    style_context: Optional[str],
    async_images: bool,
    files: Optional[list] = None,
) -> dict:
    """Run OutlineGenerator.generate() inside a Modal container (non-streaming, for public API)."""
    from services.outline import OutlineGenerator, OutlineOptions
    from models.registry import get_global_registry

    registry = get_global_registry()
    generator = OutlineGenerator(registry)

    options = OutlineOptions(
        prompt=prompt,
        slide_count=slide_count,
        style_context=style_context,
        async_images=async_images,
        files=files or [],
    )

    result = await generator.generate(options)

    if not result or not result.slides:
        return {"error": "Failed to generate outline"}

    return {
        "title": result.title,
        "slides": [
            {"title": s.title, "content": s.content or "", "chart_data": getattr(s, "chart_data", None)}
            for s in result.slides
        ],
    }


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=300,
    memory=1024,
    cpu=1.0,
)
@modal.concurrent(max_inputs=4)
async def stream_outline_remote(request_dict: dict):
    """Run outline agent streaming inside a Modal container."""
    from api.requests.outline_agent.models import OutlineAgentRequest
    from api.requests.outline_agent.streaming import stream_agent_response

    request = OutlineAgentRequest.model_validate(request_dict)

    async for sse_chunk in stream_agent_response(request):
        yield sse_chunk


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=120,
    memory=1024,
    cpu=1.0,
)
@modal.concurrent(max_inputs=8)
async def edit_deck_remote(
    deck_data: dict,
    current_slide: Optional[dict],
    schemas_dict: dict,
    message: str,
    chat_history: Optional[list],
    run_uuid: str,
    attachments: Optional[list],
    slide_screenshot: Optional[dict],
    classification_dict: Optional[dict],
):
    """
    Run edit_deck inside a Modal container.

    Yields events from the orchestrator in real-time, then a final result dict.
    """
    import asyncio
    import threading

    from models.registry import ComponentRegistry
    from agents.editing.editing_orchestrator import edit_deck

    registry = ComponentRegistry(schemas_dict)

    # Reconstruct classification model if provided
    classification = None
    if classification_dict:
        try:
            from agents.editing.classifier import MessageClassification
            classification = MessageClassification.model_validate(classification_dict)
        except Exception:
            pass

    # Use asyncio.Queue for zero-latency async bridging (replaces queue.Queue + polling)
    event_queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()

    result_holder: list = [None]
    error_holder: list = [None]
    done_event = asyncio.Event()

    def _event_cb(event_type, data):
        loop.call_soon_threadsafe(
            event_queue.put_nowait,
            {"kind": "event", "event_type": event_type, "data": data},
        )

    def run_edit():
        try:
            result_holder[0] = edit_deck(
                deck_data=deck_data,
                current_slide=current_slide,
                registry=registry,
                message=message,
                chat_history=chat_history,
                run_uuid=run_uuid,
                event_cb=_event_cb,
                attachments=attachments,
                slide_screenshot=slide_screenshot,
                classification=classification,
            )
        except Exception as e:
            error_holder[0] = e
        finally:
            loop.call_soon_threadsafe(done_event.set)

    thread = threading.Thread(target=run_edit, daemon=True)
    thread.start()

    # Yield events as they arrive — no polling, no sleep
    while True:
        get_task = asyncio.ensure_future(event_queue.get())
        done_task = asyncio.ensure_future(done_event.wait())
        finished, pending = await asyncio.wait(
            {get_task, done_task}, return_when=asyncio.FIRST_COMPLETED,
        )
        if get_task in finished:
            yield get_task.result()
            if done_task in pending:
                done_task.cancel()
        else:
            get_task.cancel()
            # Drain remaining events
            while not event_queue.empty():
                yield event_queue.get_nowait()
            break

    if error_holder[0]:
        yield {"kind": "error", "error": str(error_holder[0])}
    else:
        # Normalize result to plain-dict serializable form
        result = result_holder[0] or {}
        diff = result.get("deck_diff")
        if diff is not None:
            if hasattr(diff, "deck_diff"):
                diff = diff.deck_diff
            if hasattr(diff, "model_dump"):
                diff = diff.model_dump(exclude_none=False, exclude_unset=False)
            result["deck_diff"] = diff
        yield {"kind": "result", "result": result}


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=120,
    memory=1024,
    cpu=1.0,
)
@modal.concurrent(max_inputs=8)
async def edit_outline_remote(request_dict: dict):
    """
    Run outline edit (tool-powered) inside a Modal container.

    Returns the response dict directly (not a generator -- single LLM call).
    """
    from api.requests.api_outline_chat import EditOutlineRequest
    from services.outline.outline_editing import edit_outline_core

    request = EditOutlineRequest.model_validate(request_dict)
    return await edit_outline_core(request)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=120,
    memory=1024,
    cpu=1.0,
)
@modal.concurrent(max_inputs=8)
async def generate_narrative_flow_remote(
    outline_dict: dict,
    deck_uuid: str,
    context: Optional[str] = None,
) -> dict:
    """
    Generate narrative flow analysis inside a Modal container.

    Analyzes the outline and saves the result to decks.notes.
    Returns the narrative flow dict or {"error": "..."}.
    """
    from services.narrative_flow_analyzer import NarrativeFlowAnalyzer
    from utils.supabase import update_deck_notes

    analyzer = NarrativeFlowAnalyzer()
    narrative_flow = await analyzer.analyze_narrative_flow(outline_dict, context=context)

    if not narrative_flow:
        return {"error": "Narrative flow generation returned None"}

    flow_dict = narrative_flow.model_dump()

    # Persist to database
    success = update_deck_notes(deck_uuid, flow_dict)
    if not success:
        return {"error": "Failed to save narrative flow to database", "narrative_flow": flow_dict}

    return {"success": True, "narrative_flow": flow_dict}


@app.function(
    image=playwright_image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=60,
    memory=2048,
    cpu=1.0,
)
@modal.concurrent(max_inputs=4)
async def render_slide_thumbnail_remote(
    deck_uuid: str,
    slide_data: dict,
    slide_size: dict,
    theme_data: Optional[dict] = None,
    slide_index: int = 0,
) -> dict:
    """Render a slide thumbnail via Playwright inside a Modal container."""
    from services.thumbnail_renderer import render_and_upload_thumbnail

    return await render_and_upload_thumbnail(
        deck_uuid=deck_uuid,
        slide_data=slide_data,
        slide_size=slide_size,
        theme_data=theme_data,
        slide_index=slide_index,
    )


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=300,
    memory=2048,
    cpu=1.0,
)
@modal.concurrent(max_inputs=40)
async def generate_playground_slide_remote(
    model_id: str,
    theme: dict,
    slide_content: str,
    slide_title: str,
    slide_index: int,
    total_slides: int,
    outline_title: str,
    slide_mode: str = "interactive",
    temperature: float = 0.8,
    prompt: str = "",
    outline_summary: str = "",
) -> dict:
    """Generate a single playground slide via PlaygroundComponentGenerator in a Modal container."""
    from agents.generation.playground_component_generator import PlaygroundComponentGenerator

    slide_context = {
        "title": slide_title,
        "slide_index": slide_index,
        "total_slides": total_slides,
        "slide_type": "content",
        "slide_mode": slide_mode,
        "deck_title": outline_title,
        "is_full_slide": True,
        "presentation_context": prompt,
        "initial_idea": prompt,
        "vibe_context": prompt,
    }

    generator = PlaygroundComponentGenerator(model=model_id)
    generator.temperature = temperature
    component = await generator.generate(
        content=slide_content,
        theme=theme,
        slide_context=slide_context,
        width=1920,
        height=1080,
        auto_prefetch=False,
    )

    html = None
    if component and component.get("props", {}).get("render"):
        html = component["props"]["render"]

    return {"index": slide_index, "html": html}
