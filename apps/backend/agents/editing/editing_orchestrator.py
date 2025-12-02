from typing import Union, List, TypedDict, Dict, Tuple
from pydantic import BaseModel, Field, create_model

try:
    from langgraph.graph import StateGraph, START, END
except Exception:
    StateGraph = None
    START = None
    END = None
try:
    from langchain.callbacks.manager import collect_runs
except Exception:
    def collect_runs(*args, **kwargs):
        return None

from models.registry import ComponentRegistry
from models.deck import DeckDiff, DeckDiffBase
from models.requests import ChatMessage
from models.tools import undefined_tool, get_tools_descriptions

from agents.editing.tools.registry import get_tools_and_call_map

from agents.ai.clients import get_client, invoke
from agents.config import ORCHESTRATOR_MODEL
from agents.prompts.editing.editor_notes import get_editor_notes

from utils.numbers import round_numbers
from services.context_cache import get_deck_context_snapshot
from utils.summaries import summarize_registry, summarize_chat_history
from utils.deck import get_all_component_ids, get_all_slide_ids
import logging

logger = logging.getLogger(__name__)

# NOTE: call_map is now created per-request to avoid thread-safety issues
# See get_tools_and_call_map() for the call_map creation

class AgentState(TypedDict):
    """State maintained by the agent during processing"""
    deck_data: Dict
    deck_summary: str
    current_slide: Dict
    registry: ComponentRegistry
    user_message: str
    chat_history: List[ChatMessage]
    prompt_context: str
    deck_diff: DeckDiffBase
    edit_summary: str
    attachments: List[Dict]  # User-uploaded images/files with {name, type/mimeType, url}

def get_orchestrator_prompt(state: AgentState, descriptions: str):
    """
    Get the prompt for the orchestrator
    """

    # Resolve canvas size and current slide id for typed/dict inputs
    _deck = state.get('deck_data', {})
    canvas_size = getattr(_deck, 'size', None) if not isinstance(_deck, dict) else _deck.get('size')
    _cur = state.get('current_slide', {})
    current_slide_id = getattr(_cur, 'id', None) if not isinstance(_cur, dict) else _cur.get('id')

    # Build attachments section if user uploaded images/files
    attachments = state.get('attachments', [])
    attachments_section = ""
    if attachments:
        att_list = []
        for att in attachments:
            name = att.get('name') or att.get('fileName') or 'file'
            mime = att.get('mimeType') or att.get('type') or 'unknown'
            url = att.get('url') or att.get('publicUrl') or ''
            att_list.append(f"- {name} ({mime}): {url}")
        attachments_section = f"""
    <user_uploaded_files>
    The user has uploaded the following files as design references.
    {chr(10).join(att_list)}

    **HOW TO USE REFERENCE IMAGES:**

    1. **For STYLING existing content** (colors, fonts, effects):
       - Use `style_slide` - it can see and analyze these images
       - This ONLY styles existing components, cannot change layout

    2. **For RECREATING a slide from reference** (new layout/structure):
       - Use `remove_all_content` first to clear the slide
       - Then use `create_new_component` with type='CustomComponent'
       - Describe the design from the reference image in component_request
       - The component generator can see reference images and replicate the design

    Choose based on whether user wants to:
    - "Style like this" → style_slide (keeps existing components)
    - "Make it look like this" / "Recreate this" → remove_all_content + create_new_component
    </user_uploaded_files>
"""

    # Check if current slide has a CustomComponent and build context
    custom_component_section = ""
    _cur = state.get('current_slide', {})
    components = []
    if hasattr(_cur, 'components'):
        components = list(getattr(_cur, 'components', []) or [])
    elif isinstance(_cur, dict):
        components = list(_cur.get('components', []) or [])

    for comp in components:
        ctype = getattr(comp, 'type', None) if not isinstance(comp, dict) else comp.get('type')
        cid = getattr(comp, 'id', None) if not isinstance(comp, dict) else comp.get('id')
        cprops = getattr(comp, 'props', None) if not isinstance(comp, dict) else comp.get('props', {})

        if ctype == 'CustomComponent' and isinstance(cprops, dict) and cprops.get('render'):
            html_content = cprops.get('render', '')
            custom_component_section = f"""
    <custom_component_context>
    🚨 THIS SLIDE CONTAINS A CustomComponent - USE SPECIAL EDITING APPROACH!

    Component ID: {cid}
    Slide ID: {current_slide_id}

    **EDITING STRATEGY:**
    - For TARGETED edits (color, text, font, size changes): Use `custom_component_str_replace`
      - Find the exact string in the HTML below
      - Replace it with the new value
      - Call once per edit (one old_string → new_string replacement per call)
      - Example: old_string="color: #333" new_string="color: #ff0000"

    - For BROAD changes (new layout, complete redesign): Use `replace_component`
      - Only if user wants a fundamentally different design

    **DO NOT use `edit_component` with made-up IDs - the entire slide is ONE component!**

    **IMPORTANT for str_replace:**
    - Copy the EXACT string from the HTML below (including any special characters)
    - Don't modify or truncate the old_string - it must match exactly
    - If the HTML is truncated (ends with ...), the full text might continue
    - Make one str_replace call per change (multiple calls if multiple changes needed)

    <html_content>
    {html_content[:15000]}{"... [TRUNCATED - full HTML is " + str(len(html_content)) + " chars]" if len(html_content) > 15000 else ""}
    </html_content>
    </custom_component_context>
"""
            break  # Only handle first CustomComponent

    prompt = f"""
    Based on the deck summary, current slide, chat history, user request, and already gathered context, determine which tools to call in order to edit the deck.

    <chat_history>
    {summarize_chat_history(state.get('chat_history', []))}
    </chat_history>

    <user_message>
    {state.get('user_message', '')}
    </user_message>
{attachments_section}{custom_component_section}
    <deck_summary>
    {state.get('deck_summary', 'No summary available')}
    </deck_summary>

    <current_slide_id>
    {current_slide_id}
    </current_slide_id>

    <available_tools>
    {descriptions}
    </available_tools>

    Do not concern yourself with the exact properites of a component, the editor downstream will handle that for you

    If the user request is clear and can be handled with the information provided, indicate that no more context is needed.
    You do not need to ask for more information about a component if the id/identifier is already in the gathered context.

    NOTE: The canvas size is {canvas_size} and the position is in terms of this coordinate system from (0,0)-(1920,1080)
    NOTE: The width and height of the components are in terms of units/pixels in this coordinate system. And element of width 1920 would be 100% of the canvas width.
    """
    return prompt


def orchestrate(state: AgentState, event_cb=None):
    """
    Orchestrate the editing process.

    Executes tools SEQUENTIALLY to ensure proper ordering (e.g., remove before create).
    Returns deck_diff and edit_summary.
    """
    from agents.editing.core import get_attr

    # Get current slide ID using unified accessor
    current_slide = state.get('current_slide', {})
    current_slide_id = get_attr(current_slide, 'id')

    # Create per-request call_map (thread-safe)
    tools, call_map = get_tools_and_call_map(
        deck_data=state.get('deck_data', {}),
        registry=state.get('registry', {}),
        current_slide_id=current_slide_id,
        attachments=state.get('attachments', []),
    )

    # Add undefined handler
    call_map["undefined"] = undefined_tool

    descriptions = get_tools_descriptions(tools)

    prompt = get_orchestrator_prompt(state, descriptions)
    client, model = get_client(ORCHESTRATOR_MODEL)

    # Dynamically create the EditRequest model based on the available ids and types
    EditRequest = create_model("EditRequest", 
        edit_request_summary=(str, Field(description="A succinct description of the edit request")),
        tool=(
            Union[tuple(tools)], Field(description="The tool call to use to edit the deck"))
    )

    ToolsCalls = create_model("ToolsCalls", 
        tool_calls=(List[EditRequest], Field(description="The list of tool calls to use to edit the deck"))
    )

    # Resolve canvas size for typed/dict deck_data for system prompt
    _deck_for_size = state.get('deck_data', {})
    _canvas_size = getattr(_deck_for_size, 'size', None) if not isinstance(_deck_for_size, dict) else _deck_for_size.get('size')

    response = invoke(
        client=client,
        model=model,
        max_tokens=16384,
        response_model=ToolsCalls,
        messages=[
            {
                "role": "system",
                "content": f"""
                You are a helpful assistant that helps with deck editing.
                In order to make changes to the deck, you need to call tools to edit the deck.
                The detailed break down of the edits will be important for sucessfully applying the edits to the deck.
                The canvas size is {_canvas_size}
                """
            },
            {
                "role": "user", 
                "content": prompt
            }
        ]
    )

    # Reorder tool calls for deterministic, high-quality results
    # Strategy: Run deck-wide font application LAST so per-slide stylers don't leave fonts inconsistent
    tool_calls = list(getattr(response, 'tool_calls', []) or [])
    def _priority(tc) -> int:
        try:
            name = getattr(tc.tool, 'tool_name', '') or ''
            if name == 'apply_theme_fonts':
                return 100  # run last
            return 0
        except Exception:
            return 0
    tool_calls.sort(key=_priority)

    # Emit a dynamic, user-friendly plan based on the actual (reordered) tool calls
    if event_cb:
        try:
            def _get_attr(obj, name, default=None):
                try:
                    return getattr(obj, name)
                except Exception:
                    try:
                        return obj.get(name, default) if isinstance(obj, dict) else default
                    except Exception:
                        return default

            def _shorten(text: str, limit: int = 80) -> str:
                if not isinstance(text, str):
                    return ""
                return text if len(text) <= limit else text[:limit - 1] + "…"

            friendly_plan = []
            for tc in tool_calls:
                # Prefer the model-provided edit_request_summary when present
                summary = _shorten(_get_attr(tc, 'edit_request_summary', '') or '')
                if summary:
                    friendly_plan.append({"title": summary})
                    continue

                tool = _get_attr(tc, 'tool')
                tool_name = _get_attr(tool, 'tool_name', '') or ''

                title = None
                if tool_name == 'edit_component':
                    meta = _get_attr(tool, 'metadata', {}) or {}
                    ctype = _get_attr(meta, 'component_type', '') or ''
                    # Map common component types to user-friendly labels
                    type_map = {
                        'TiptapTextBlock': 'text',
                        'TextBlock': 'text',
                        'Title': 'title',
                        'Chart': 'chart',
                        'Image': 'image',
                        'Background': 'background',
                        'Shape': 'shape',
                    }
                    label = type_map.get(ctype, (ctype or 'component')).lower()
                    title = f"Update {label}"
                elif tool_name == 'create_new_component':
                    ctype = _get_attr(tool, 'component_type', '') or ''
                    title = f"Add {ctype.lower() or 'component'}"
                elif tool_name == 'replace_component':
                    ntype = _get_attr(tool, 'new_component_type', '') or ''
                    title = f"Replace with {ntype.lower() or 'component'}"
                elif tool_name == 'remove_component':
                    title = "Remove component"
                elif tool_name == 'style_slide':
                    title = "Improve slide style"
                else:
                    title = tool_name.replace('_', ' ').strip().title() or 'Apply edit'

                friendly_plan.append({"title": title})

            if friendly_plan:
                event_cb("agent.plan.update", {"plan": friendly_plan})
        except Exception:
            pass

    # Initialize deck diff
    deck_diff = DeckDiff(DeckDiffBase())
    edit_summaries = []

    # Execute tools SEQUENTIALLY to ensure proper ordering
    # This is critical for operations like remove_all_content → create_new_component
    for idx, tool_call in enumerate(tool_calls):
        tool_name = getattr(tool_call.tool, 'tool_name', 'unknown')

        if event_cb:
            try:
                event_cb("agent.tool.start", {"tool": tool_name})
            except Exception:
                pass

        logger.debug(f"Executing tool {idx + 1}/{len(tool_calls)}: {tool_name}")

        if tool_name not in call_map:
            logger.error(f"Tool '{tool_name}' not found in call_map")
            continue

        try:
            tool_fn = call_map[tool_name]
            # Each tool gets its own diff, then merged
            tool_diff = tool_fn(
                tool_call.tool,
                state.get('registry'),
                state.get('deck_data'),
                DeckDiff(DeckDiffBase())
            )
            deck_diff = deck_diff.merge(tool_diff)
            edit_summaries.append(tool_call.edit_request_summary)

            if event_cb:
                try:
                    event_cb("agent.tool.finish", {"tool": tool_name, "summary": tool_call.edit_request_summary})
                except Exception:
                    pass

        except Exception as e:
            logger.error(f"Tool '{tool_name}' failed: {e}")
            if event_cb:
                try:
                    event_cb("agent.tool.error", {"tool": tool_name, "error": str(e)})
                except Exception:
                    pass
            # Continue with other tools instead of failing completely
            continue

    return {
        "deck_diff": deck_diff,
        "edit_summary": "\n".join(edit_summaries)
    }


def build_agent():
    """Build the agent graph with all necessary nodes and connections (unused for streaming v0.1)."""
    print(f"DEBUG: Building agent graph")
    if StateGraph is None or START is None or END is None:
        print("DEBUG: langgraph not installed; returning direct orchestrate function as fallback")
        # Fallback: return the orchestrate function directly
        return orchestrate
    graph = StateGraph(AgentState)
    graph.add_node("orchestrate", orchestrate)
    graph.add_edge(START, "orchestrate")
    graph.add_edge("orchestrate", END)
    return graph.compile() 

def edit_deck(deck_data, current_slide, registry, message, chat_history, run_uuid=None, event_cb=None, attachments=None):
    """
    Main entry point for deck editing.

    Args:
        deck_data: The deck to edit (Pydantic model or dict)
        current_slide: The currently selected slide
        registry: Component registry
        message: User's edit request
        chat_history: Previous messages in conversation
        run_uuid: Optional run identifier for tracing
        event_cb: Optional callback for streaming events
        attachments: User-uploaded files (images, data files)

    Returns:
        Dict with deck_diff, edit_summary
    """
    from agents.editing.core import get_attr

    # Get IDs using unified accessor
    current_slide_id = get_attr(current_slide, 'id')
    deck_uuid = get_attr(deck_data, 'uuid')

    # Get deck context snapshot
    snapshot = get_deck_context_snapshot(
        deck_uuid,
        deck_data,
        current_slide_id=current_slide_id,
    )
    deck_summary = snapshot.get('summary_text', 'Deck summary unavailable')

    # Initialize agent state
    initial_state = AgentState(
        deck_data=deck_data,
        registry=registry,
        deck_summary=deck_summary,
        current_slide=current_slide,
        user_message=message,
        chat_history=chat_history,
        attachments=attachments or []
    )

    logger.info(f"Starting edit for deck {deck_uuid}, slide {current_slide_id}")

    # Execute orchestration
    end_state = orchestrate(initial_state, event_cb=event_cb)
    deck_diff = end_state.get('deck_diff')
    edit_summary = end_state.get('edit_summary')

    # Extract deck_diff data
    deck_diff_data = None
    if deck_diff:
        if hasattr(deck_diff, 'deck_diff'):
            deck_diff_data = deck_diff.deck_diff
        else:
            deck_diff_data = deck_diff

    logger.info(f"Edit complete: {len(edit_summary.split(chr(10))) if edit_summary else 0} operations")

    return {
        "deck_diff": deck_diff_data,
        "edit_summary": edit_summary
    }
