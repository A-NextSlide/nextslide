"""
Simple single-pass orchestrator for deck editing.

Philosophy:
- ONE LLM call to decide what tools to use
- Execute tools in order
- No complex multi-phase execution
- Trust the AI, fix output afterward
"""

from typing import Dict, List, Optional, Any, Union
import json
from pydantic import BaseModel, Field, create_model
import logging
import uuid

from models.deck import DeckDiff, DeckDiffBase
from models.registry import ComponentRegistry
from agents.ai.clients import get_client, invoke
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from agents.config import get_model, MODEL_FALLBACK
from services.context_cache import get_deck_context_snapshot
from utils.summaries import summarize_chat_history

logger = logging.getLogger(__name__)

# region agent log
def _dbg(hypothesisId: str, location: str, message: str, data: Dict[str, Any], runId: str = "pre-fix") -> None:
    try:
        import json, time
        payload = {
            "sessionId": "debug-session",
            "runId": runId,
            "hypothesisId": hypothesisId,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with open("/Users/ahmed/Documents/Dev/nextslide/.cursor/debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
# endregion


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER - Dict/Pydantic safe access
# ═══════════════════════════════════════════════════════════════════════════════

def _get_attr(obj, key, default=None):
    """Safely get attribute from dict or Pydantic model."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT - Keep it simple and direct
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are a slide deck editor. Execute the user's request using tools.

RULES:
1. Use tools to make changes. Never output raw HTML/code.
2. Be precise - if user says "red", use red (#FF0000 or similar)
3. For creative requests (like "make a slide about X"), use edit_slide or create_slide
4. You can call multiple tools in one response

CANVAS: 1920x1080 pixels. Origin (0,0) top-left.

CRITICAL: TARGETED EDITS vs FULL REWRITES

USE edit_slide (FULL REWRITE) when:
- User wants to change branding/co-brand ("make it co-branded with X", "rebrand")
- User wants significant visual changes ("make it nicer", "improve the design", "more professional")
- User wants to change the theme/style/look ("different style", "change the theme")
- User wants to add/remove multiple elements
- User explicitly asks: "redesign", "redo", "rebuild", "from scratch", "completely different", "overhaul"
- The change affects the overall look/feel of the slide

USE custom_component_str_replace (SURGICAL EDIT) ONLY when:
- User wants ONE specific text change ("change 'Hello' to 'Hi'")
- User wants to fix ONE color ("make the title red")
- User wants to update ONE URL or image path
- The change is literally replacing one string with another

⚠️ DO NOT use multiple str_replace operations for substantial changes!
If you find yourself needing 3+ str_replace operations, use edit_slide instead.

CRITICAL - EMPTY SLIDE HANDLING:
If the current slide only has a Background (or is empty), and user wants content:
→ Use edit_slide with instruction describing what to create
→ The tool will generate full content for the empty slide

TOOL SELECTION:
- edit_slide: Edit/add content to existing slide (handles empty slides too!) - USE FOR MOST EDITS
- create_slide: Create a NEW slide (adds to deck)
- delete_slide: Remove a slide
- edit_component: Edit a specific component by ID
- create_component: Add a component to a slide
- delete_component: Remove a component
- apply_theme: Change colors/fonts across deck
- custom_component_str_replace: ONLY for single, specific string replacements in HTML
- component_prop_update: Mechanical prop update for an existing component
- view_component: Inspect a component's current props/HTML preview before surgical edits
"""


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL CALL MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class ToolCall(BaseModel):
    """A single tool invocation from the LLM."""
    tool_name: str = Field(description="Name of the tool to call")
    tool_args: Dict[str, Any] = Field(description="Arguments for the tool")
    summary: str = Field(description="Brief description of what this edit does")


class OrchestratorResponse(BaseModel):
    """LLM response containing tool calls."""
    tool_calls: List[ToolCall] = Field(description="List of tools to execute")

def parse_selections_from_message(user_message: str) -> tuple[str, List[Dict[str, Any]]]:
    """
    Extract selections appended by upstream as:
      "... \n\n[USER_SELECTIONS] comp_id (Type)@slide_id, ..."
    Returns (clean_message, selections)
    selections: [{id, type, slide_id}]
    """
    if not user_message or "[USER_SELECTIONS]" not in user_message:
        return user_message, []

    try:
        parts = user_message.split("[USER_SELECTIONS]", 1)
        clean = parts[0].strip()
        sel_line = parts[1].split("\n", 1)[0].strip()
        selections: List[Dict[str, Any]] = []
        for raw in (sel_line.split(",") if sel_line else []):
            s = raw.strip()
            if not s:
                continue
            cid = None
            ctype = None
            sid = None
            # formats: "id (Type)@slide", "id (Type)", "id@slide"
            if "(" in s:
                cid = s.split("(", 1)[0].strip()
                inside = s.split("(", 1)[1]
                ctype = inside.split(")", 1)[0].strip() if ")" in inside else None
                after = inside.split(")", 1)[1] if ")" in inside else ""
                if "@" in after:
                    sid = after.split("@", 1)[1].strip()
            else:
                if "@" in s:
                    cid, sid = [p.strip() for p in s.split("@", 1)]
                else:
                    cid = s.strip()
            if cid:
                selections.append({"id": cid, "type": ctype, "slide_id": sid})
        return clean, selections
    except Exception:
        return user_message, []


# ═══════════════════════════════════════════════════════════════════════════════
# CONTEXT BUILDER
# ═══════════════════════════════════════════════════════════════════════════════

def build_context(
    deck_data,
    current_slide,
    attachments: List[Dict] = None,
    chat_history: List = None,
    selections: List[Dict[str, Any]] = None,
) -> str:
    """Build concise context for LLM."""

    # Current slide info
    slide_id = _get_attr(current_slide, 'id', 'unknown')
    components = _get_attr(current_slide, 'components', []) or []

    # Analyze what's on the slide
    non_bg_components = [c for c in components if _get_attr(c, 'type') != 'Background']
    has_custom = any(_get_attr(c, 'type') == 'CustomComponent' for c in components)
    is_empty = len(non_bg_components) == 0

    # Slide status
    if is_empty:
        slide_status = "⚠️ SLIDE IS EMPTY (only has background). Use edit_slide to add content."
    elif has_custom:
        slide_status = "Slide has CustomComponent - edit_slide will rewrite the HTML."
    else:
        slide_status = f"Slide has {len(non_bg_components)} components."

    # Component list
    component_list = []
    for c in components:
        ctype = _get_attr(c, 'type', 'Unknown')
        cid = _get_attr(c, 'id', 'no-id')
        props = _get_attr(c, 'props', {}) or {}

        # Helper to get props (might be dict or Pydantic)
        def get_prop(key, default=''):
            if isinstance(props, dict):
                return props.get(key, default)
            return getattr(props, key, default)

        if ctype == 'Background':
            component_list.append(f"  - Background")
        elif ctype == 'CustomComponent':
            html = str(get_prop('render', ''))[:200]
            component_list.append(f"  - CustomComponent [{cid}]: {len(str(get_prop('render', '')))} chars HTML")
        elif ctype == 'TiptapTextBlock':
            text = str(get_prop('text', ''))[:50]
            component_list.append(f"  - TiptapTextBlock [{cid}]: \"{text}...\"")
        elif ctype == 'Image':
            src = str(get_prop('src', ''))[:50]
            component_list.append(f"  - Image [{cid}]: {src}...")
        else:
            component_list.append(f"  - {ctype} [{cid}]")

    components_str = "\n".join(component_list) if component_list else "  (no components)"

    # Selections (critical for "this" references)
    sel_str = ""
    if selections:
        sel_lines = []
        for sel in selections:
            sid = sel.get("slide_id")
            cid = sel.get("id")
            ctype = sel.get("type")
            # If selection is a slide, call it out explicitly
            if ctype == "Slide" or (cid and sid and cid == sid):
                sel_lines.append(f"  - Slide selected: {sid or cid}")
                continue
            # Otherwise try to find component details on current slide
            comp = next((c for c in components if _get_attr(c, "id") == cid), None)
            if comp:
                ctype2 = _get_attr(comp, "type", ctype or "Unknown")
                props = _get_attr(comp, "props", {}) or {}
                preview = ""
                if ctype2 == "CustomComponent":
                    html = ""
                    if isinstance(props, dict):
                        html = str(props.get("render", ""))[:300]
                    else:
                        html = str(getattr(props, "render", ""))[:300]
                    preview = f" (HTML preview: {html}...)"
                elif ctype2 == "TiptapTextBlock":
                    t = props.get("text") if isinstance(props, dict) else getattr(props, "text", "")
                    preview = f" (text preview: {str(t)[:120]}...)"
                sel_lines.append(f"  - {ctype2} [{cid}] on slide {sid or slide_id}{preview}")
            else:
                sel_lines.append(f"  - Selection: {cid} ({ctype or 'Unknown'})@{sid or slide_id}")
        if sel_lines:
            sel_str = "\n\n🎯 SELECTED (user likely refers to these as 'this'):\n" + "\n".join(sel_lines)

    # Attachments
    att_str = ""
    if attachments:
        att_list = [f"  - {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
        att_str = f"\n\nATTACHMENTS (user uploaded):\n" + "\n".join(att_list)

    # Chat history (brief)
    history_str = ""
    if chat_history:
        recent = chat_history[-3:]  # Last 3 messages
        history_lines = [f"  {m.get('role', 'user')}: {str(m.get('content', ''))[:100]}" for m in recent]
        history_str = f"\n\nRECENT CHAT:\n" + "\n".join(history_lines)

    context = f"""CURRENT SLIDE: {slide_id}
STATUS: {slide_status}

COMPONENTS:
{components_str}{sel_str}{att_str}{history_str}"""
    _dbg("A", "orchestrator_v2.py:build_context", "built_context", {"slide_id": slide_id, "has_selections": bool(selections), "selection_count": len(selections or []), "context_len": len(context)}, runId="pre-fix")
    return context


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL DEFINITIONS (for LLM to know what's available)
# ═══════════════════════════════════════════════════════════════════════════════

TOOL_DESCRIPTIONS = """
AVAILABLE TOOLS:

1. edit_slide ⭐ PREFERRED FOR MOST EDITS
   - Edit content on the current slide (AI rewrites the component)
   - Use for: branding changes, design improvements, style changes, adding/removing elements
   - If slide is empty, generates new content
   - Args: { "slide_id": str, "instruction": str }
   - Example: {"slide_id": "abc", "instruction": "Make this co-branded with Nike, use their colors and add their logo"}

2. create_slide
   - Create a brand new slide (adds to deck)
   - Args: { "instruction": str, "insert_after": optional str }
   - Example: {"instruction": "Create a slide about market trends with a chart"}

3. delete_slide
   - Remove a slide from the deck
   - Args: { "slide_id": str }

4. duplicate_slide
   - Duplicate a slide (mechanical)
   - Args: { "slide_id": str, "insert_after": optional str }

5. reorder_slides
   - Reorder slides (mechanical)
   - Args: { "slide_id": str, "new_index": int } OR { "slide_order": [slide_id,...] }

6. edit_component
   - Edit a specific component by ID
   - Args: { "slide_id": str, "component_id": str, "instruction": str }
   - Example: {"component_id": "xyz", "instruction": "Change the color to blue"}

7. create_component
   - Add a new component to a slide
   - Args: { "slide_id": str, "component_type": str, "instruction": str }
   - component_type: TiptapTextBlock, Image, Chart, Shape, CustomComponent

8. delete_component
   - Remove a component from a slide
   - Args: { "slide_id": str, "component_id": str }

9. apply_theme
   - Apply colors/fonts to the deck
   - Args: { "instruction": str }
   - Example: {"instruction": "Use Apple's brand colors"}

10. custom_component_str_replace ⚠️ USE SPARINGLY
   - Surgical edit for CustomComponent HTML (single search/replace)
   - ONLY use when: changing ONE specific string (e.g., ONE word, ONE color, ONE URL)
   - DO NOT use for: branding changes, design improvements, multiple changes
   - If you need 2+ str_replace calls, use edit_slide instead!
   - Args: { "slide_id": str, "component_id": str, "old_string": str, "new_string": str }

11. component_prop_update
   - Mechanical prop merge for a component (no AI)
   - WHEN: User wants to move/resize/change font size/color on a selected component
   - Args: { "slide_id": str, "component_id": str, "updates": { ... } }

12. view_component
   - Return a component's current props (and HTML preview for CustomComponent)
   - WHEN: Before a surgical edit so you can reference exact strings/classes
   - Args: { "slide_id": str, "component_id": str }
"""


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

def orchestrate(
    deck_data: Dict,
    current_slide: Dict,
    user_message: str,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    chat_history: List = None,
    event_cb: callable = None,
) -> Dict:
    """
    Single-pass orchestration.

    1. Build context
    2. Call LLM to get tool calls
    3. Execute tools sequentially
    4. Return deck_diff

    Args:
        deck_data: Full deck object
        current_slide: Currently selected slide
        user_message: User's edit request
        registry: Component registry (for validation)
        attachments: User-uploaded files
        chat_history: Previous messages
        event_cb: Callback for streaming events

    Returns:
        {"deck_diff": DeckDiff, "edit_summary": str}
    """
    from agents.editing.tools.tool_executor import execute_tool

    def _is_empty_deckdiff(dd: DeckDiff) -> bool:
        try:
            base = dd.deck_diff if hasattr(dd, "deck_diff") else dd
            if hasattr(base, "model_dump"):
                payload = base.model_dump()
            elif hasattr(base, "dict"):
                payload = base.dict()
            else:
                payload = base
            return (
                not (payload.get("slides_to_update") or [])
                and not (payload.get("slides_to_add") or [])
                and not (payload.get("slides_to_remove") or [])
                and not (payload.get("slide_order") or None)
            )
        except Exception:
            return False

    clean_message, selections = parse_selections_from_message(user_message or "")
    _dbg(
        "A",
        "orchestrator_v2.py:orchestrate",
        "parsed_selections",
        {"has_marker": "[USER_SELECTIONS]" in (user_message or ""), "selection_count": len(selections), "msg_len": len(user_message or ""), "clean_len": len(clean_message or "")},
        runId="pre-fix",
    )

    # Build context (include selection info)
    context = build_context(deck_data, current_slide, attachments, chat_history, selections=selections)

    # Full prompt
    prompt = f"""{context}

{TOOL_DESCRIPTIONS}

USER REQUEST: {clean_message}

Respond with the tool_calls to execute."""

    # Get client (use Haiku for orchestration - fast and smart enough)
    model = get_model("orchestrator")

    # Check for rate limits
    if "gemini" in model and is_provider_in_cooldown("gemini"):
        model = get_model("fallback")
        logger.info(f"[ORCHESTRATOR] Gemini in cooldown, using fallback: {model}")

    client, actual_model = get_client(model)

    # Single LLM call
    try:
        response = invoke(
            client=client,
            model=actual_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            response_model=OrchestratorResponse,
            max_tokens=4096,
        )
    except Exception as e:
        error_str = str(e).lower()
        if '429' in error_str or 'rate' in error_str:
            # Try fallback
            logger.warning(f"[ORCHESTRATOR] Rate limited, trying fallback")
            mark_provider_rate_limited("gemini" if "gemini" in model else "anthropic")
            fallback_client, fallback_model = get_client(MODEL_FALLBACK)
            response = invoke(
                client=fallback_client,
                model=fallback_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                response_model=OrchestratorResponse,
                max_tokens=4096,
            )
        else:
            raise

    # Emit plan if callback provided
    if event_cb and response.tool_calls:
        plan = [{"title": tc.summary} for tc in response.tool_calls]
        try:
            event_cb("agent.plan.update", {"plan": plan})
        except Exception:
            pass

    def _execute_tool_calls(tool_calls: List[ToolCall]) -> tuple[DeckDiff, List[str], List[Dict[str, Any]]]:
        """Execute tool calls and collect any attached observations."""
        dd = DeckDiff(DeckDiffBase())
        summaries: List[str] = []
        observations: List[Dict[str, Any]] = []

        # Track accumulated component updates so sequential str_replace ops see previous results
        # Key: component_id, Value: latest props dict (especially 'render' for CustomComponent)
        accumulated_props: Dict[str, Dict[str, Any]] = {}

        for tool_call in tool_calls or []:
            tool_name = tool_call.tool_name
            tool_args = tool_call.tool_args

            # Emit tool start
            if event_cb:
                try:
                    event_cb("agent.tool.start", {"tool": tool_name})
                except Exception:
                    pass

            logger.info(f"[ORCHESTRATOR] Executing tool: {tool_name}")

            # CRITICAL FIX: For str_replace operations, use accumulated HTML from previous ops
            # This prevents each operation from reading stale original HTML
            effective_slide = current_slide
            if tool_name == "custom_component_str_replace" and accumulated_props:
                comp_id = tool_args.get("component_id")
                if comp_id and comp_id in accumulated_props:
                    # Create a patched slide with the accumulated props
                    import copy
                    effective_slide = copy.deepcopy(current_slide)
                    for c in (effective_slide.get("components") or []):
                        if isinstance(c, dict) and c.get("id") == comp_id:
                            c["props"] = accumulated_props[comp_id]
                            break
                    logger.info(f"[ORCHESTRATOR] Using accumulated HTML for {comp_id} ({len(accumulated_props[comp_id].get('render', ''))} chars)")

            try:
                tool_diff = execute_tool(
                    tool_name=tool_name,
                    tool_args=tool_args,
                    deck_data=deck_data,
                    current_slide=effective_slide,
                    registry=registry,
                    attachments=attachments,
                )

                # Collect read-only observation payloads (e.g., view_component)
                try:
                    obs = getattr(tool_diff, "observation", None)
                    if isinstance(obs, dict) and obs:
                        observations.append({"tool": tool_name, "data": obs})
                except Exception:
                    pass

                if tool_diff:
                    # Ensure tool_diff is a DeckDiff object, not a dict
                    if isinstance(tool_diff, dict):
                        logger.warning(f"[ORCHESTRATOR] Tool {tool_name} returned dict instead of DeckDiff, skipping merge")
                    else:
                        dd = dd.merge(tool_diff)

                        # CRITICAL: Track accumulated props for sequential operations
                        # Extract updated props from the diff so next operations see the changes
                        try:
                            # Safely access deck_diff - some DeckDiff wrappers may not have it
                            deck_diff_inner = getattr(tool_diff, 'deck_diff', None)
                            if deck_diff_inner and hasattr(deck_diff_inner, 'slides_to_update'):
                                for slide_diff in (deck_diff_inner.slides_to_update or []):
                                    for comp_diff in (getattr(slide_diff, 'components_to_update', None) or []):
                                        comp_id = getattr(comp_diff, 'id', None)
                                        comp_props = getattr(comp_diff, 'props', None)
                                        if comp_id and comp_props:
                                            # Get existing accumulated props and merge
                                            existing = accumulated_props.get(comp_id, {})
                                            if hasattr(comp_props, 'model_dump'):
                                                new_props = comp_props.model_dump(exclude_none=True)
                                            elif hasattr(comp_props, 'dict'):
                                                new_props = comp_props.dict(exclude_none=True)
                                            elif isinstance(comp_props, dict):
                                                new_props = comp_props
                                            else:
                                                new_props = {}
                                            accumulated_props[comp_id] = {**existing, **new_props}
                                            logger.info(f"[ORCHESTRATOR] Accumulated props for {comp_id}: {list(new_props.keys())}")
                        except Exception as e:
                            logger.warning(f"[ORCHESTRATOR] Failed to accumulate props: {e}")

                summaries.append(tool_call.summary)

                if event_cb:
                    try:
                        event_cb("agent.tool.finish", {"tool": tool_name, "summary": tool_call.summary})
                    except Exception:
                        pass

            except Exception as e:
                logger.error(f"[ORCHESTRATOR] Tool {tool_name} failed: {e}")
                if event_cb:
                    try:
                        event_cb("agent.tool.error", {"tool": tool_name, "error": str(e)})
                    except Exception:
                        pass
                continue

        return dd, summaries, observations

    # Pass 1: execute initial tool calls
    deck_diff, edit_summaries, observations = _execute_tool_calls(response.tool_calls)

    # Pass 2 (lightweight): if the agent only "looked" (e.g., view_component) and made no changes,
    # immediately feed the observation back in and ask for actionable tool calls.
    # This prevents the frustrating "we viewed it, now user must re-ask" loop.
    if observations and _is_empty_deckdiff(deck_diff):
        try:
            followup_prompt = f"""{context}

{TOOL_DESCRIPTIONS}

USER REQUEST: {clean_message}

You already executed read-only tools and obtained these observations (JSON):
{json.dumps(observations, ensure_ascii=False)[:24000]}

Now propose the NEXT tool_calls needed to actually satisfy the user request.
- Do NOT call view_component again unless absolutely necessary.
- Prefer targeted edits (custom_component_str_replace / component_prop_update) when possible.

Respond with the tool_calls to execute."""

            followup = invoke(
                client=client,
                model=actual_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": followup_prompt},
                ],
                response_model=OrchestratorResponse,
                max_tokens=4096,
            )

            # Prevent redundant re-views in follow-up when we already have the observation.
            try:
                followup.tool_calls = [
                    tc for tc in (followup.tool_calls or [])
                    if tc.tool_name != "view_component"
                ]
            except Exception:
                pass

            if event_cb and followup.tool_calls:
                plan = [{"title": tc.summary} for tc in followup.tool_calls]
                try:
                    event_cb("agent.plan.update", {"plan": plan})
                except Exception:
                    pass

            dd2, summaries2, _obs2 = _execute_tool_calls(followup.tool_calls)
            deck_diff = deck_diff.merge(dd2)
            edit_summaries.extend(summaries2)
        except Exception as e:
            logger.warning(f"[ORCHESTRATOR] Follow-up after observation failed: {e}")

    return {"deck_diff": deck_diff, "edit_summary": "\n".join(edit_summaries)}


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT (matches old edit_deck signature)
# ═══════════════════════════════════════════════════════════════════════════════

def edit_deck(
    deck_data,
    current_slide,
    registry,
    message: str,
    chat_history: List = None,
    run_uuid: str = None,
    event_cb: callable = None,
    attachments: List[Dict] = None,
) -> Dict:
    """
    Main entry point for deck editing.
    Signature matches the old orchestrator for drop-in replacement.
    """

    # Convert to dict if needed (handle both old .dict() and new .model_dump())
    if hasattr(deck_data, 'model_dump'):
        deck_data = deck_data.model_dump()
    elif hasattr(deck_data, 'dict'):
        deck_data = deck_data.dict()

    if hasattr(current_slide, 'model_dump'):
        current_slide = current_slide.model_dump()
    elif hasattr(current_slide, 'dict'):
        current_slide = current_slide.dict()

    result = orchestrate(
        deck_data=deck_data,
        current_slide=current_slide,
        user_message=message,
        registry=registry,
        attachments=attachments,
        chat_history=chat_history,
        event_cb=event_cb,
    )

    # Extract deck_diff_data for API compatibility
    deck_diff = result.get('deck_diff')
    deck_diff_data = None
    if deck_diff:
        if hasattr(deck_diff, 'deck_diff'):
            deck_diff_data = deck_diff.deck_diff
        else:
            deck_diff_data = deck_diff

    return {
        "deck_diff": deck_diff_data,
        "edit_summary": result.get('edit_summary', '')
    }
