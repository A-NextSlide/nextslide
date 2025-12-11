"""
Simple single-pass orchestrator for deck editing.

Philosophy:
- ONE LLM call to decide what tools to use
- Execute tools in order
- No complex multi-phase execution
- Trust the AI, fix output afterward
"""

from typing import Dict, List, Optional, Any, Union
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

CRITICAL - EMPTY SLIDE HANDLING:
If the current slide only has a Background (or is empty), and user wants content:
→ Use edit_slide with instruction describing what to create
→ The tool will generate full content for the empty slide

TOOL SELECTION:
- edit_slide: Edit/add content to existing slide (handles empty slides too!)
- create_slide: Create a NEW slide (adds to deck)
- delete_slide: Remove a slide
- edit_component: Edit a specific component by ID
- create_component: Add a component to a slide
- delete_component: Remove a component
- apply_theme: Change colors/fonts across deck
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


# ═══════════════════════════════════════════════════════════════════════════════
# CONTEXT BUILDER
# ═══════════════════════════════════════════════════════════════════════════════

def build_context(
    deck_data,
    current_slide,
    attachments: List[Dict] = None,
    chat_history: List = None,
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

    return f"""CURRENT SLIDE: {slide_id}
STATUS: {slide_status}

COMPONENTS:
{components_str}{att_str}{history_str}"""


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL DEFINITIONS (for LLM to know what's available)
# ═══════════════════════════════════════════════════════════════════════════════

TOOL_DESCRIPTIONS = """
AVAILABLE TOOLS:

1. edit_slide
   - Edit content on the current slide
   - If slide is empty, generates new content
   - Args: { "slide_id": str, "instruction": str }
   - Example: {"slide_id": "abc", "instruction": "Add a title saying 'Welcome' and 3 bullet points about AI"}

2. create_slide
   - Create a brand new slide (adds to deck)
   - Args: { "instruction": str, "insert_after": optional str }
   - Example: {"instruction": "Create a slide about market trends with a chart"}

3. delete_slide
   - Remove a slide from the deck
   - Args: { "slide_id": str }

4. edit_component
   - Edit a specific component by ID
   - Args: { "slide_id": str, "component_id": str, "instruction": str }
   - Example: {"component_id": "xyz", "instruction": "Change the color to blue"}

5. create_component
   - Add a new component to a slide
   - Args: { "slide_id": str, "component_type": str, "instruction": str }
   - component_type: TiptapTextBlock, Image, Chart, Shape, CustomComponent

6. delete_component
   - Remove a component from a slide
   - Args: { "slide_id": str, "component_id": str }

7. apply_theme
   - Apply colors/fonts to the deck
   - Args: { "instruction": str }
   - Example: {"instruction": "Use Apple's brand colors"}
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

    # Build context
    context = build_context(deck_data, current_slide, attachments, chat_history)

    # Full prompt
    prompt = f"""{context}

{TOOL_DESCRIPTIONS}

USER REQUEST: {user_message}

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

    # Execute tools sequentially
    deck_diff = DeckDiff(DeckDiffBase())
    edit_summaries = []

    for tool_call in response.tool_calls:
        tool_name = tool_call.tool_name
        tool_args = tool_call.tool_args

        # Emit tool start
        if event_cb:
            try:
                event_cb("agent.tool.start", {"tool": tool_name})
            except Exception:
                pass

        logger.info(f"[ORCHESTRATOR] Executing tool: {tool_name}")

        try:
            # Execute the tool
            tool_diff = execute_tool(
                tool_name=tool_name,
                tool_args=tool_args,
                deck_data=deck_data,
                current_slide=current_slide,
                registry=registry,
                attachments=attachments,
            )

            # Merge diff
            if tool_diff:
                deck_diff = deck_diff.merge(tool_diff)

            edit_summaries.append(tool_call.summary)

            # Emit tool finish
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
            # Continue with other tools
            continue

    return {
        "deck_diff": deck_diff,
        "edit_summary": "\n".join(edit_summaries)
    }


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
