"""Custom component edit helpers for slide tools."""

from typing import Any, Dict, List
import logging
import uuid
from datetime import datetime, timezone

from models.deck import DeckDiff, DeckDiffBase
from models.component import ComponentDiffBase
from models.registry import ComponentRegistry
from agents.config import CUSTOM_COMPONENT_EDIT_MODEL
from agents.editing.tools.async_utils import run_async
from agents.editing.tools.llm_utils import get_model_and_client, invoke_with_fallback
from agents.editing.tools.slide_tool_debug import _dbg
from agents.editing.tools.slide_tool_helpers import (
    _build_attachment_context,
    _build_chat_context,
    _detect_slide_mode_from_html,
    _extract_slide_content_for_redesign,
    _gather_reference_images,
    _build_uploaded_media_from_attachments,
)
from agents.editing.tools.slide_tool_models import _ReplacePlan
from agents.editing.tools.struct_utils import get_attr as _get_attr

logger = logging.getLogger(__name__)


def _current_date_note() -> str:
    """Return a short current-date note for prompt grounding."""
    return f"CURRENT DATE (UTC): {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"


def _generate_full_bleed_custom_component(
    slide_id: str,
    instruction: str,
    deck_data: Dict,
    current_slide: Dict,
    attachments: List[Dict] = None,
    use_attachments: bool = False,
    available_videos: List[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generate a full-bleed CustomComponent via CustomComponentGenerator (same quality path as generation).
    Returns a normalized component dict {id,type,props}.
    """
    from agents.generation.custom_component_generator import CustomComponentGenerator

    theme = (deck_data or {}).get("theme") or {}
    colors = theme.get("color_palette") or theme.get("colors") or {}
    reference_images = _gather_reference_images("", attachments)
    uploaded_media = _build_uploaded_media_from_attachments(attachments or []) if use_attachments else None

    gen = CustomComponentGenerator(model=CUSTOM_COMPONENT_EDIT_MODEL)
    slide_context = {
        "title": _get_attr(current_slide, "title", "") or (deck_data or {}).get("name") or "Slide",
        "slide_index": 0,
        "total_slides": len((deck_data or {}).get("slides") or []) or 1,
        "slide_type": "content",
        "is_full_slide": True,
        "presentation_context": (deck_data or {}).get("name") or "",
        "background_color": (colors.get("primary_background") if isinstance(colors, dict) else None),
        "use_uploaded_images": use_attachments,
    }

    # Extract actual slide content - DO NOT pass user instructions as content
    actual_content = _extract_slide_content_for_redesign(current_slide)

    uploads_note = ""
    if use_attachments and attachments:
        uploads_note = "\n\nUPLOADS: Use the attached images as real assets in this redesign."

        generated = run_async(
            gen.generate(
                content=f"""REDESIGN REQUEST: {instruction}{uploads_note}

EXISTING SLIDE CONTENT TO REDESIGN:
{actual_content}

IMPORTANT:
- Fill the entire 1920x1080 canvas.
- If reference images are provided, match their layout/style and transcribe any visible text the user asks to use exactly.
- DO NOT display the redesign request text in the slide. Use it only to guide your design approach.
- Base the slide content on the EXISTING SLIDE CONTENT above, but DO honor explicit user requests to add/remove elements (e.g., add a video, remove cards).""",
            theme=theme if isinstance(theme, dict) else {},
            slide_context=slide_context,
            component_purpose="visualize",
            width=1920,
            height=1080,
            position={"x": 0, "y": 0},
            reference_images=reference_images or None,
            uploaded_media=uploaded_media,
            available_videos=available_videos,
        )
    )
    html = ((generated or {}).get("props") or {}).get("render") or ""
    if not html:
        raise ValueError("CustomComponentGenerator returned empty render")

    props = (generated or {}).get("props") or {}
    props = dict(props) if isinstance(props, dict) else {}
    props["render"] = html
    props["position"] = {"x": 0, "y": 0}
    props["width"] = 1920
    props["height"] = 1080

    return {"id": str(uuid.uuid4()), "type": "CustomComponent", "props": props}


def _targeted_custom_component_edit(
    slide_id: str,
    custom_component: Dict,
    instruction: str,
    deck_data: Dict,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Perform a surgical edit on CustomComponent HTML:
    - Use AI to propose exact old_string/new_string replacements (1-3)
    - Apply replacements mechanically (no HTML regeneration)
    If plan fails (no exact match), fall back to rewrite ONLY if needed.
    """
    comp_id = _get_attr(custom_component, "id")
    props = _get_attr(custom_component, "props", {}) or {}
    current_html = props.get("render", "") if isinstance(props, dict) else getattr(props, "render", "")

    # CRITICAL: Strip frontend editing scripts from HTML before processing
    from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts
    current_html = strip_frontend_editing_scripts(current_html)

    # Theme context
    theme = (deck_data or {}).get("theme") or {}
    colors = theme.get("color_palette") or theme.get("colors") or {}
    typography = theme.get("typography") or {}
    att_hint = _build_attachment_context(attachments, "FILES AVAILABLE:") if attachments else ""

    prompt = f"""{_current_date_note()}

You are a precise HTML editor. You must make a SMALL, TARGETED change without redesigning.

RULES:
- Do NOT rewrite the whole HTML.
- Propose 1-3 exact search/replace operations.
- old_string MUST exist verbatim in the provided HTML.
- Keep changes minimal and localized.

THEME (for color/font consistency):
- accent_1: {colors.get('accent_1')}
- accent_2: {colors.get('accent_2')}
- primary_text: {colors.get('primary_text')}
- primary_background: {colors.get('primary_background')}
- typography: {str(typography)[:500]}

CURRENT HTML (truncated to 25k):
{current_html[:25000]}

USER REQUEST:
{instruction}{att_hint}

Return a JSON object with:
{{"ops":[{{"old_string":"...", "new_string":"..."}}], "note":"..."}}"""

    client, model = get_model_and_client("validation", log_prefix="SLIDE_TOOLS")
    plan = invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=_ReplacePlan,
        max_tokens=8000,  # Increased from 2500 to handle larger HTML replacements for style changes
        log_prefix="SLIDE_TOOLS",
    )

    _dbg(
        "B",
        "slide_tools.py:_targeted_custom_component_edit",
        "replace_plan",
        {"slide_id": slide_id, "component_id": comp_id, "ops": len(plan.ops), "note": plan.note[:200]},
        runId="pre-fix",
    )

    # Apply ops
    new_html = current_html
    applied = 0
    failed_ops = []
    for op in (plan.ops or [])[:3]:
        if not op.old_string:
            continue
        if op.old_string not in new_html:
            _dbg(
                "B",
                "slide_tools.py:_targeted_custom_component_edit",
                "old_string_missing",
                {"missing_preview": op.old_string[:120], "component_id": comp_id},
                runId="pre-fix",
            )
            failed_ops.append(op)
            continue  # Try remaining ops instead of breaking
        new_html = new_html.replace(op.old_string, op.new_string or "", 1)
        applied += 1

    if applied == 0 and failed_ops:
        # RETRY: Ask AI for exact strings with more context about what failed
        retry_prompt = f"""{_current_date_note()}

You are a precise HTML editor. Your previous replacement suggestions did not match the HTML exactly.

RULES:
- old_string MUST be an EXACT substring from the HTML (copy-paste, including whitespace)
- Look for the specific text/element mentioned in the user request
- Keep changes minimal - just the specific edit requested

CURRENT HTML (truncated to 25k):
{current_html[:25000]}

USER REQUEST:
{instruction}

PREVIOUS FAILED ATTEMPTS (these strings were NOT found verbatim):
{chr(10).join(f'- "{op.old_string[:200]}"' for op in failed_ops[:3])}

Return a JSON object with EXACT old_string matches:
{{"ops":[{{"old_string":"...", "new_string":"..."}}], "note":"..."}}"""

        retry_plan = invoke_with_fallback(
            client=client,
            model=model,
            messages=[{"role": "user", "content": retry_prompt}],
            response_model=_ReplacePlan,
            max_tokens=8000,
            log_prefix="SLIDE_TOOLS",
        )

        # Try retry ops
        for op in (retry_plan.ops or [])[:3]:
            if not op.old_string:
                continue
            if op.old_string in new_html:
                new_html = new_html.replace(op.old_string, op.new_string or "", 1)
                applied += 1

        _dbg(
            "B",
            "slide_tools.py:_targeted_custom_component_edit",
            "retry_result",
            {"applied_after_retry": applied, "component_id": comp_id},
            runId="pre-fix",
        )

    if applied == 0:
        # Still no matches - raise error instead of silently doing full rewrite
        # The orchestrator can decide to use custom_component_rewrite explicitly if needed
        raise ValueError(
            f"Could not find matching text in CustomComponent HTML. "
            f"The requested edit '{instruction[:100]}...' could not be applied as a targeted replacement. "
            f"Consider using edit_slide for a full rewrite if needed."
        )

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        slide_id,
        comp_id,
        ComponentDiffBase(id=comp_id, type="CustomComponent", props={"render": new_html}),
    )
    _dbg(
        "B",
        "slide_tools.py:_targeted_custom_component_edit",
        "applied_replace_ops",
        {"applied": applied, "old_len": len(current_html), "new_len": len(new_html)},
        runId="pre-fix",
    )
    return deck_diff


def custom_component_rewrite(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    chat_history: List[Dict] = None,
) -> DeckDiff:
    """
    High-quality rewrite for a specific CustomComponent using CustomComponentGenerator prompts.
    Only use when user explicitly requests redesign/redo/etc., or as last resort fallback.

    Args: {"slide_id": str, "component_id": str, "instruction": str}
    chat_history: Full chat history for context (user messages AND assistant responses)
    """
    slide_id = args.get("slide_id") or _get_attr(current_slide, "id")
    component_id = args.get("component_id")
    instruction = args.get("instruction", "")
    use_attachments = bool(args.get("use_attachments"))
    available_videos = args.get("available_videos")
    if not isinstance(available_videos, list):
        available_videos = None

    components = _get_attr(current_slide, "components", []) or []
    custom_component = next((c for c in components if _get_attr(c, "id") == component_id), None)
    if not custom_component:
        custom_component = next((c for c in components if _get_attr(c, "type") == "CustomComponent"), None)
    if not custom_component:
        raise ValueError("CustomComponent not found for rewrite")

    logger.info("[custom_component_rewrite] Rewriting custom component")

    comp_id = _get_attr(custom_component, 'id')
    props = _get_attr(custom_component, 'props', {}) or {}
    current_html = props.get('render', '') if isinstance(props, dict) else getattr(props, 'render', '')

    # CRITICAL: Strip frontend editing scripts from HTML before processing
    from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts
    current_html = strip_frontend_editing_scripts(current_html)

    # Extract theme context from deck
    theme = (deck_data or {}).get("theme") or {}
    colors = theme.get("color_palette") or theme.get("colors") or {}
    typography = theme.get("typography") or {}

    slide_mode = _detect_slide_mode_from_html(current_html)

    # Gather ALL reference images (we embed a few as multimodal, but include all URLs in text context)
    reference_images = _gather_reference_images(current_html, attachments)
    uploaded_media = _build_uploaded_media_from_attachments(attachments or []) if use_attachments else None

    try:
        from agents.generation.custom_component_generator import CustomComponentGenerator
        gen = CustomComponentGenerator(model=CUSTOM_COMPONENT_EDIT_MODEL)
        # Compute slide index if present in deck_data
        try:
            slides = (deck_data or {}).get("slides") or []
            slide_index = next((i for i, s in enumerate(slides) if isinstance(s, dict) and s.get("id") == slide_id), 0)
        except Exception:
            slide_index = 0

        slide_context = {
            "title": _get_attr(current_slide, "title", "") or (deck_data or {}).get("name") or "Slide",
            "slide_index": slide_index,
            "total_slides": len((deck_data or {}).get("slides") or []) or 1,
            "slide_type": "content",
            "is_full_slide": True,
            "presentation_context": (deck_data or {}).get("name") or "",
            "background_color": (colors.get("primary_background") if isinstance(colors, dict) else None),
            "chat_history": chat_history,  # Pass full chat history for context
            "use_uploaded_images": use_attachments,
        }
        theme_for_gen = theme if isinstance(theme, dict) else {}
        # Include all attachment URLs in the prompt text so the model can infer intent without UI buttons.
        attachment_context = _build_attachment_context(
            attachments,
            "FILES (infer intent; if user says 'use this' and images exist, treat as primary reference and recreate):",
        )

        # Build chat context string (chronological: oldest first, newest last)
        chat_context, chat_count = _build_chat_context(chat_history, max_messages=10)
        if chat_count:
            logger.info(
                f"[custom_component_rewrite] Including {chat_count} chat messages as context (chronological order)"
            )

        # Extract actual content from existing HTML - DO NOT pass user instructions as content
        actual_content = _extract_slide_content_for_redesign(current_slide, current_html)

        uploads_note = ""
        if use_attachments and attachments:
            uploads_note = "\n\nUPLOADS: Use the attached images as real assets in this redesign."

        generated = run_async(
            gen.generate(
                content=f"""REDESIGN REQUEST: {instruction}{attachment_context}{chat_context}{uploads_note}

EXISTING SLIDE CONTENT TO REDESIGN:
{actual_content}

IMPORTANT:
- Fill the entire 1920x1080 canvas. Do not use max-width containers.
- If reference images are provided, match their layout and style.
- Use the conversation context above to understand what the user wants and any preferences they discussed.
- DO NOT display the redesign request text in the slide. Use it only to guide your design approach.
- Base the slide content on the EXISTING SLIDE CONTENT above, but DO honor explicit user requests to add/remove elements (e.g., add a video, remove cards).""",
                theme=theme_for_gen,
                slide_context=slide_context,
                component_purpose="visualize",
                width=1920,
                height=1080,
                position={"x": 0, "y": 0},
                reference_images=reference_images or None,
                uploaded_media=uploaded_media,
                available_videos=available_videos,
            )
        )
        new_html = ((generated or {}).get("props") or {}).get("render") or ""
        if not new_html:
            raise ValueError("generator returned empty render")

        # Build diff with render + full-bleed sizing
        deck_diff = DeckDiff(DeckDiffBase())
        component_diff = ComponentDiffBase(
            id=comp_id,
            type="CustomComponent",
            props={"render": new_html, "position": {"x": 0, "y": 0}, "width": 1920, "height": 1080},
        )
        deck_diff.update_component(slide_id, comp_id, component_diff)

        _dbg(
            "B",
            "slide_tools.py:custom_component_rewrite",
            "rewrite_done",
            {
                "slide_id": slide_id,
                "component_id": comp_id,
                "mode": slide_mode,
                "model": getattr(gen, "model", None),
                "reference_images": reference_images,
                "old_len": len(current_html),
                "new_len": len(new_html),
            },
            runId="pre-fix",
        )
        logger.info(f"[custom_component_rewrite] Rewrote via CustomComponentGenerator ({len(current_html)} → {len(new_html)} chars)")
        return deck_diff
    except Exception as e:
        logger.warning(f"[custom_component_rewrite] Generator path failed, falling back to prompt-based rewrite: {e}")

    # Fallback: prompt-based rewrite (kept for safety)
    # Reuse CustomComponentGenerator prompt builder for quality parity
    try:
        from agents.generation.custom_component_generator import CustomComponentGenerator
        gen = CustomComponentGenerator(model=CUSTOM_COMPONENT_EDIT_MODEL)
        system_prompt = gen._build_system_prompt(
            colors=colors if isinstance(colors, dict) else {},
            typography=typography if isinstance(typography, dict) else {},
            style_keywords=[],
            slide_mode=slide_mode,
            logo_url=None,
        )
    except Exception as e:
        system_prompt = "You are an expert HTML/CSS designer. Modify the CustomComponent with high quality and theme consistency. Fill 1920x1080."
        logger.warning(f"[custom_component_rewrite] Failed to build generator prompt, using fallback: {e}")

    user_prompt = f"""{_current_date_note()}

CURRENT CUSTOMCOMPONENT HTML:
{current_html[:25000]}

REFERENCE IMAGE URLS (if any): {', '.join(reference_images) if reference_images else 'none'}

USER REQUEST (use this to guide your redesign, do NOT display this text in the slide):
{instruction}

IMPORTANT:
- Fill the entire 1920x1080 canvas.
- Do not use max-width containers (no max-w-7xl).
- DO NOT include the user request text as visible content in the slide.
- The slide content should be based on the CURRENT CUSTOMCOMPONENT HTML above, redesigned according to the user request.
- If the user explicitly requests new elements (e.g., a video), include them in the redesign.

Return ONLY the complete updated HTML (starting with <!DOCTYPE html>)."""

    client, model = get_model_and_client("custom_component_rewrite", log_prefix="SLIDE_TOOLS")

    new_html = invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        response_model=None,  # Raw output
        max_tokens=32000,
        log_prefix="SLIDE_TOOLS",
    )

    # Clean up response (extract HTML if wrapped in markdown)
    if '```html' in new_html:
        new_html = new_html.split('```html')[1].split('```')[0].strip()
    elif '```' in new_html:
        new_html = new_html.split('```')[1].split('```')[0].strip()

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())
    component_diff = ComponentDiffBase(
        id=comp_id,
        type="CustomComponent",
        props={"render": new_html}
    )
    deck_diff.update_component(slide_id, comp_id, component_diff)

    _dbg(
        "B",
        "slide_tools.py:custom_component_rewrite",
        "rewrite_done",
        {
            "slide_id": slide_id,
            "component_id": comp_id,
            "mode": slide_mode,
            "model": model,
            "sys_len": len(system_prompt),
            "user_len": len(user_prompt),
            "old_len": len(current_html),
            "new_len": len(new_html),
        },
        runId="pre-fix",
    )
    logger.info(f"[custom_component_rewrite] Rewrote HTML ({len(current_html)} → {len(new_html)} chars)")
    return deck_diff


def custom_component_str_replace(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Make a targeted edit to a CustomComponent.
    Can accept either:
    - instruction: str - AI will figure out what to change
    - old_string/new_string: str - Direct replacement
    Args: {"slide_id": str, "component_id": str, "instruction": str} OR {"slide_id": str, "component_id": str, "old_string": str, "new_string": str}
    """
    slide_id = args.get("slide_id") or _get_attr(current_slide, "id")
    component_id = args.get("component_id")
    instruction = args.get("instruction") or ""
    old_string = args.get("old_string") or ""
    new_string = args.get("new_string") or ""

    components = _get_attr(current_slide, "components", []) or []

    # Find the component - first try by ID, then find any CustomComponent
    comp = None
    if component_id:
        comp = next((c for c in components if _get_attr(c, "id") == component_id), None)
    if not comp:
        comp = next((c for c in components if _get_attr(c, "type") == "CustomComponent"), None)
    if not comp or _get_attr(comp, "type") != "CustomComponent":
        raise ValueError("CustomComponent not found on slide")

    component_id = _get_attr(comp, "id")

    # If we have instruction but no old_string, use AI to figure out the replacement
    if instruction and not old_string:
        logger.info(f"[custom_component_str_replace] Using AI to determine replacement for: {instruction[:50]}...")
        return _targeted_custom_component_edit(slide_id, comp, instruction, deck_data, attachments)

    # Otherwise do direct replacement
    if not old_string:
        raise ValueError("Either 'instruction' or 'old_string' is required")

    props = _get_attr(comp, "props", {}) or {}
    html = props.get("render", "") if isinstance(props, dict) else getattr(props, "render", "")

    # CRITICAL: Strip frontend editing scripts from HTML before processing
    from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts
    html = strip_frontend_editing_scripts(html)

    if old_string not in html:
        # Provide more context about what went wrong
        html_preview = html[:500] if html else "(empty)"
        raise ValueError(
            "old_string not found in CustomComponent HTML. "
            f"Searched for: '{old_string[:100]}...' in HTML starting with: '{html_preview}...'"
        )

    new_html = html.replace(old_string, new_string, 1)
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        slide_id,
        component_id,
        ComponentDiffBase(id=component_id, type="CustomComponent", props={"render": new_html}),
    )
    _dbg(
        "B",
        "slide_tools.py:custom_component_str_replace",
        "str_replace_applied",
        {
            "slide_id": slide_id,
            "component_id": component_id,
            "old_preview": old_string[:120],
            "new_preview": new_string[:120],
        },
        runId="pre-fix",
    )
    return deck_diff


def component_prop_update(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Mechanical prop merge for a component. No AI.
    Args: {"slide_id": str, "component_id": str, "updates": { ... }}
    """
    slide_id = args.get("slide_id") or _get_attr(current_slide, "id")
    component_id = args.get("component_id")
    updates = args.get("updates") or {}
    if not component_id:
        raise ValueError("component_id is required")
    if not isinstance(updates, dict):
        raise ValueError("updates must be an object")

    components = _get_attr(current_slide, "components", []) or []
    comp = next((c for c in components if _get_attr(c, "id") == component_id), None)
    if not comp:
        raise ValueError(f"Component {component_id} not found")

    ctype = _get_attr(comp, "type", "Unknown")
    props = _get_attr(comp, "props", {}) or {}
    if not isinstance(props, dict):
        props = dict(props) if hasattr(props, "__iter__") else {}
    new_props = {**props, **updates}

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        slide_id,
        component_id,
        ComponentDiffBase(id=component_id, type=ctype, props=new_props),
    )
    _dbg(
        "B",
        "slide_tools.py:component_prop_update",
        "prop_update",
        {"slide_id": slide_id, "component_id": component_id, "type": ctype, "keys": list(updates.keys())[:30]},
        runId="pre-fix",
    )
    return deck_diff


def view_component(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Return component details (and HTML preview for CustomComponent).
    This is a read-only tool - returns an empty DeckDiff.
    The component info is logged for the AI to see in context.

    Args: {"slide_id": str, "component_id": str}
    """
    component_id = args.get("component_id")
    components = _get_attr(current_slide, "components", []) or []

    # If no component_id provided, try to find the first CustomComponent or the first non-Background component
    if not component_id:
        # Prefer CustomComponent as that's usually what users want to inspect
        comp = next((c for c in components if _get_attr(c, "type") == "CustomComponent"), None)
        if not comp:
            # Fall back to first non-Background component
            comp = next((c for c in components if _get_attr(c, "type") != "Background"), None)
        if not comp:
            raise ValueError("component_id is required - no suitable component found on slide")
        component_id = _get_attr(comp, "id")
        logger.info(f"[view_component] No component_id provided, defaulting to {component_id}")
    else:
        comp = next((c for c in components if _get_attr(c, "id") == component_id), None)
        if not comp:
            raise ValueError(f"Component {component_id} not found")

    ctype = _get_attr(comp, "type", "Unknown")
    props = _get_attr(comp, "props", {}) or {}
    out: Dict[str, Any] = {"id": component_id, "type": ctype, "props": props}
    if ctype == "CustomComponent":
        html = props.get("render", "") if isinstance(props, dict) else getattr(props, "render", "")
        # CRITICAL: Strip frontend editing scripts before showing to AI
        from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts
        html = strip_frontend_editing_scripts(html)
        # Provide full HTML so the agent can actually reason + do targeted edits.
        # (Logs are not fed back into the LLM prompt; orchestrator will read this observation.)
        out["html"] = html or ""
        out["html_preview"] = (html or "")[:2000]

    # Log the component info for debugging/AI context
    logger.info(
        f"[view_component] Viewed component {component_id}: type={ctype}, "
        f"props_keys={list(props.keys()) if isinstance(props, dict) else 'N/A'}"
    )
    _dbg("B", "slide_tools.py:view_component", "component_viewed", out, runId="pre-fix")

    # Return empty DeckDiff since this is a read-only operation,
    # but attach the observation so orchestrator can feed it back to the agent.
    dd = DeckDiff(DeckDiffBase())
    try:
        setattr(dd, "observation", out)
    except Exception:
        pass
    return dd
