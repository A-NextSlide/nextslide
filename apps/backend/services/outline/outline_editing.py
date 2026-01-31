"""
Core outline editing logic shared between the API endpoint and Modal remote execution.

Extracts the tool-planning → tool-execution → normalization pipeline so that
both ``api_outline_chat.edit_outline_chat`` and ``modal_app.edit_outline_remote``
call the same code.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from setup_logging_optimized import get_logger

logger = get_logger(__name__)


async def edit_outline_core(request) -> dict:
    """
    Run the full outline-edit pipeline on *request* (an ``EditOutlineRequest``).

    Returns a plain dict with keys:
        updatedOutline, changes, updatedNarrativeFlow, narrativeChanges
    """
    from pydantic import create_model, Field
    from typing import List as TList, Union

    from agents.ai.clients import get_client, invoke
    from agents.config import OUTLINE_CONTENT_MODEL, OUTLINE_AGENT_MODEL
    from models.narrative_flow import NarrativeFlowChanges
    from services.narrative_flow_analyzer import NarrativeFlowAnalyzer
    from services.outline.chart_normalization import normalize_slide_chart_fields

    # Lazy imports from the endpoint module for shared models / helpers
    from api.requests.api_outline_chat import (
        OutlineData,
        OutlineChanges,
        _build_context_prompt,
        _format_outline_for_prompt,
        _invoke_ai_with_retry,
        _parse_ai_response,
    )

    # ── Build prompts ───────────────────────────────────────────────────
    context_prompt = _build_context_prompt(request)

    history_lines: List[str] = []
    try:
        if request.chatHistory:
            for msg in request.chatHistory[-6:]:
                role = (msg.get("role") or "").lower()
                text = (msg.get("content") or "").strip()
                if role in ("user", "assistant") and text:
                    history_lines.append(f"[{role}] {text}")
    except Exception:
        pass
    chat_history_block = (
        "\n\nChat history (most recent last):\n" + "\n".join(history_lines)
    ) if history_lines else ""

    target_label = (
        f"Slide {request.target_slide_index + 1} only"
        if request.target_slide_index is not None
        else "Any relevant slides"
    )
    user_prompt = f"""Current outline:
{_format_outline_for_prompt(request.outline)}

User request: "{request.message}"
{chat_history_block}

{context_prompt}

Target: {target_label}

Return updatedOutline and changes JSON only."""

    # ── Tool definitions ────────────────────────────────────────────────
    from models.tools import get_tools_descriptions
    from agents.outline.tools import (
        UpdateSlideContentArgs, update_slide_content,
        AddSlideArgs, add_slide,
        RemoveSlideArgs, remove_slide_outline,
        MoveSlideArgs, move_slide_outline,
        ResearchSlideArgs, research_slide_outline,
        FirecrawlOutlineArgs, firecrawl_outline_fetch,
        DeepExtractArgs, deep_extract,
    )

    tools = [
        UpdateSlideContentArgs, AddSlideArgs, RemoveSlideArgs,
        MoveSlideArgs, ResearchSlideArgs, FirecrawlOutlineArgs, DeepExtractArgs,
    ]
    descriptions = get_tools_descriptions(tools)

    ToolCall = create_model(
        "OutlineToolCall",
        tool=(Union[tuple(tools)], Field(description="The tool call for outline editing")),
        summary=(str, Field(description="What this tool call does")),
    )
    ToolPlan = create_model(
        "OutlineToolPlan",
        tool_calls=(TList[ToolCall], Field(description="List of tool calls to apply")),
    )

    tool_system = (
        "You are an outline editor. Choose tool calls to modify the outline based on the user's message.\n\n"
        f"Available tools:\n{descriptions}\n\n"
        "Rules:\n"
        "- Keep edits minimal and targeted\n"
        "- Maintain all required slide fields\n"
        "- When research or external data/images are requested, prefer firecrawl_outline_fetch for quick single-page grabs\n"
        "- When the user requests deep, multi-page, or site-specific extraction, use deep_extract\n"
        "- When research is requested, you may also use research_slide_outline to add supporting bullets or chart data\n"
        "- If the user asks to add/remove/reorder slides, pick the appropriate tool\n"
        "- If the user asks to change a specific slide, prefer update_slide_content\n"
    )

    # ── AI planning with fallback chain ─────────────────────────────────
    client, model_name = get_client(OUTLINE_CONTENT_MODEL)
    plan = None
    try:
        plan = invoke(
            client=client, model=model_name, max_tokens=2000,
            response_model=ToolPlan,
            messages=[
                {"role": "system", "content": tool_system},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception:
        try:
            claude_client, claude_model = get_client(OUTLINE_AGENT_MODEL)
            plan = invoke(
                client=claude_client, model=claude_model, max_tokens=1500,
                response_model=ToolPlan,
                messages=[
                    {"role": "system", "content": tool_system},
                    {"role": "user", "content": user_prompt},
                ],
            )
        except Exception:
            response = await _invoke_ai_with_retry(client, model_name, tool_system, user_prompt, max_retries=2)
            parsed = _parse_ai_response(response)
            plan = ToolPlan(**parsed)

    # ── Execute tool calls ──────────────────────────────────────────────
    tool_dispatch = {
        "update_slide_content": update_slide_content,
        "add_slide": add_slide,
        "remove_slide_outline": remove_slide_outline,
        "move_slide_outline": move_slide_outline,
        "research_slide_outline": research_slide_outline,
        "firecrawl_outline_fetch": firecrawl_outline_fetch,
        "deep_extract": deep_extract,
    }

    updated_outline_dict = request.outline.model_dump()
    applied_summaries: List[str] = []
    for call in getattr(plan, "tool_calls", []) or []:
        tool = getattr(call, "tool", None)
        if not tool:
            continue
        tname = getattr(tool, "tool_name", "")
        try:
            handler = tool_dispatch.get(tname)
            if handler:
                updated_outline_dict, s = handler(tool, updated_outline_dict)
            else:
                s = f"Skipped unknown tool {tname}"
            applied_summaries.append(getattr(call, "summary", None) or s)
        except Exception:
            applied_summaries.append(f"Failed {tname}")

    # ── Ensure outline shape ────────────────────────────────────────────
    def _ensure_outline(updated, original_model):
        merged = dict(updated or {})
        original = original_model.model_dump()
        merged.setdefault("id", original.get("id"))
        merged.setdefault("title", original.get("title"))
        merged.setdefault("topic", original.get("topic"))
        merged.setdefault("tone", original.get("tone"))
        merged.setdefault("narrative_arc", original.get("narrative_arc"))
        merged.setdefault("metadata", original.get("metadata") or {})
        if not isinstance(merged.get("slides"), list):
            merged["slides"] = original.get("slides") or []
        normalized = []
        for slide in merged.get("slides", []):
            sd = slide.model_dump() if hasattr(slide, "model_dump") else slide
            if isinstance(sd, dict):
                normalize_slide_chart_fields(sd)
            normalized.append(sd)
        merged["slides"] = normalized
        return OutlineData(**merged)

    updated = _ensure_outline(updated_outline_dict, request.outline)
    changes = OutlineChanges(
        summary="; ".join(applied_summaries) or "Applied outline edits",
        modifiedSlides=[],
    )

    # ── Narrative flow analysis ─────────────────────────────────────────
    updated_narrative_flow = None
    narrative_changes = None
    try:
        flow_analyzer = NarrativeFlowAnalyzer()
        original_dict = request.outline.model_dump()
        updated_dict = updated.model_dump()
        needs_update, flow_adjustments = await flow_analyzer.detect_narrative_changes(original_dict, updated_dict)
        if needs_update:
            updated_narrative_flow = await flow_analyzer.analyze_narrative_flow(updated_dict, context=request.message)
            impact = "high" if len(flow_adjustments) >= 3 else "medium" if len(flow_adjustments) >= 2 else "low"
            narrative_changes = NarrativeFlowChanges(narrative_impact=impact, flow_adjustments=flow_adjustments)
    except Exception:
        pass

    return {
        "updatedOutline": updated.model_dump(),
        "changes": changes.model_dump(),
        "updatedNarrativeFlow": updated_narrative_flow.model_dump() if updated_narrative_flow else None,
        "narrativeChanges": narrative_changes.model_dump() if narrative_changes else None,
    }
