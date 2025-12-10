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
from agents.editing.tools.view_slide import get_viewed_slides_context
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
    <user_attachments>
    The user has uploaded files with their request:
    {chr(10).join(att_list)}

    **REASON ABOUT THE USER'S INTENT:**

    First, understand WHAT the user wants to do with the attachment:

    1. **USE AS CONTENT** - "use this logo", "add this image", "put this photo here"
       → The file itself should appear in the slide

    2. **ANALYZE & EXTRACT** - "analyze this", "extract data from this", "create a chart from this"
       → Extract information from the file and create components based on it

    3. **USE AS REFERENCE** - "make it look like this", "match this style", "copy this design"
       → Use the file as a visual reference for styling/recreating

    4. **REPLACE CONTENT** - "use this instead of the title", "swap the image for this"
       → Replace existing content with the uploaded file

    **TOOLS THAT CAN SEE/USE ATTACHMENTS:**

    These tools receive the uploaded files and can reason about them:
    - `custom_component_rewrite` - Can see images, analyze them, and incorporate them into HTML
    - `custom_component_add_media` - Can inject uploaded images into CustomComponent HTML
      - Use type="uploaded" to use the user's file directly
      - Use type="analyze" to have AI analyze the image and decide how to use it
    - `create_new_component` - Can see reference images for styling/content
    - `style_slide` - Can analyze images for color/style extraction
    - `insert_image` - Direct insertion using the attachment URL

    **EXAMPLES OF FLEXIBLE REASONING:**

    User: "Analyze this chart image and recreate it as an interactive component"
    → Use `custom_component_rewrite` with request to analyze the image and create a similar chart

    User: "Use this as my logo in the top left"
    → Use `custom_component_add_media` with type="uploaded", placement="top-left"

    User: "Extract the data from this spreadsheet and make a bar chart"
    → Use `create_new_component` type="Chart" - the data will be extracted automatically

    User: "Replace the title with this image"
    → First identify the title component, then use `custom_component_rewrite` to replace text with image

    User: "Make this slide look like the uploaded screenshot"
    → Use `custom_component_rewrite` with instructions to match the visual style

    **KEY PRINCIPLE:** The AI tools can SEE the attachments. Describe what you want done with
    them in natural language in the tool's request/instructions field. The downstream AI will
    analyze the attachment and execute your intent intelligently.
    </user_attachments>
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
    🚨 THIS SLIDE HAS A CustomComponent - YOU MUST EDIT IT, NOT CREATE NEW COMPONENTS!

    Component ID: {cid}
    Slide ID: {current_slide_id}

    ⚠️ **MANDATORY: ALWAYS EDIT THIS EXISTING COMPONENT**
    When the user asks to change ANYTHING on this slide, you MUST edit this CustomComponent.
    DO NOT use create_new_component, insert_image, or other creation tools.
    The CustomComponent contains ALL the slide's content - edit it directly.

    **EDITING TOOLS (Use these, NOT creation tools!):**

    ┌─────────────────────────────────────────────────────────────────┐
    │ `custom_component_str_replace` - FASTEST, use for most edits   │
    │ • Color changes: "change title color to red"                   │
    │ • Text updates: "change the heading text"                      │
    │ • Size changes: "make the font bigger"                         │
    │ • Add/replace images: str_replace the img src                  │
    └─────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │ `custom_component_rewrite` - For structural changes            │
    │ • Adding new elements: "add a logo to the top left"            │
    │ • Layout changes: "reorganize as a grid"                       │
    │ • Style overhauls: "make it more modern"                       │
    │ • Using uploaded images: can see and incorporate them          │
    └─────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │ `custom_component_add_media` - For adding images/logos         │
    │ • "add my uploaded logo" → type="uploaded"                     │
    │ • "add the Apple logo" → type="logo"                           │
    │ • "add a stock photo of..." → type="stock"                     │
    └─────────────────────────────────────────────────────────────────┘

    **CRITICAL RULES:**
    ✗ NEVER use `create_new_component` when this CustomComponent exists
    ✗ NEVER use `insert_image` - use custom_component_add_media instead
    ✗ NEVER use `edit_component` - CustomComponents are a single unit
    ✓ ALWAYS use component_id="{cid}" and slide_id="{current_slide_id}"
    ✓ Use str_replace for precise changes (faster, safer)
    ✓ Use rewrite for adding elements or structural changes

    <html_content>
    {html_content[:50000]}{"... [TRUNCATED - full HTML is " + str(len(html_content)) + " chars]" if len(html_content) > 50000 else ""}
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

    system_message = f"""You are a deck editing assistant. You MUST use tool calls to make changes.

IMPORTANT: You can ONLY respond with tool calls. Do NOT output raw HTML, code, or text.
Every edit must be made through a tool call.

Canvas size: {_canvas_size}

CROSS-SLIDE AWARENESS:
If the user asks to reference, copy, or compare with another slide, use `view_slide` first
to see that slide's full details before making edits."""

    try:
        response = invoke(
            client=client,
            model=model,
            max_tokens=16384,
            response_model=ToolsCalls,
            messages=[
                {
                    "role": "system",
                    "content": system_message
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )
    except Exception as e:
        error_str = str(e)
        # If the model returned raw HTML instead of tool calls, retry with stricter prompt
        if 'Invalid JSON' in error_str or 'html' in error_str.lower():
            logger.warning(f"[ORCHESTRATOR] Model returned non-JSON output, retrying with stricter prompt: {error_str[:100]}")
            strict_prompt = f"""⚠️ OUTPUT FORMAT ERROR - YOU MUST USE TOOL CALLS ONLY

The previous request failed because you output raw text/HTML instead of tool calls.

RULES:
1. You MUST respond ONLY with tool_calls (structured JSON)
2. Do NOT write any HTML, code, or explanations
3. Every change goes through a tool call

ORIGINAL REQUEST:
{prompt}

Respond with tool_calls ONLY."""
            response = invoke(
                client=client,
                model=model,
                max_tokens=16384,
                response_model=ToolsCalls,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": strict_prompt}
                ]
            )
        else:
            raise

    # TWO-PHASE EXECUTION: Check for view_slide calls that need context enrichment
    tool_calls = list(getattr(response, 'tool_calls', []) or [])
    view_slide_calls = [tc for tc in tool_calls if getattr(tc.tool, 'tool_name', '') == 'view_slide']

    if view_slide_calls:
        logger.info(f"[ORCHESTRATOR] Two-phase execution: {len(view_slide_calls)} view_slide calls detected")

        # Phase 1: Execute view_slide tools to gather context
        temp_diff = DeckDiff(DeckDiffBase())
        viewed_context_parts = []

        for view_call in view_slide_calls:
            try:
                tool_fn = call_map.get('view_slide')
                if tool_fn:
                    if event_cb:
                        event_cb("agent.tool.start", {"tool": "view_slide"})

                    temp_diff = tool_fn(
                        view_call.tool,
                        state.get('registry'),
                        state.get('deck_data'),
                        temp_diff
                    )

                    if event_cb:
                        event_cb("agent.tool.finish", {"tool": "view_slide", "summary": f"Viewed slide {view_call.tool.slide_id}"})
            except Exception as e:
                logger.warning(f"[ORCHESTRATOR] view_slide failed: {e}")

        # Extract viewed slide context
        viewed_context = get_viewed_slides_context(temp_diff)

        if viewed_context:
            logger.info(f"[ORCHESTRATOR] Enriching context with viewed slides")

            # Phase 2: Re-invoke LLM with enriched context
            enriched_prompt = f"""{prompt}

{viewed_context}

🚨 CRITICAL: You have now viewed the referenced slide(s) above. You have ALL the information you need.

DO NOT call any more view tools (view_slide, custom_component_view, etc.) - you already have the details!

NOW YOU MUST MAKE THE ACTUAL EDITS:
- If copying CustomComponent style: Use `custom_component_rewrite` on the current slide with instructions to match the viewed slide's design
- If copying colors/fonts: Use `style_slide` or `edit_component` with the specific values from the viewed slide
- If recreating layout: Use `custom_component_rewrite` describing the layout you saw

The user asked to make their slide look like the viewed slide - EXECUTE THAT NOW with editing tools.
"""

            response = invoke(
                client=client,
                model=model,
                max_tokens=16384,
                response_model=ToolsCalls,
                messages=[
                    {
                        "role": "system",
                        "content": system_message
                    },
                    {
                        "role": "user",
                        "content": enriched_prompt
                    }
                ]
            )

            # Filter out ALL view tools from the new response (we already have the context)
            view_tool_names = {'view_slide', 'custom_component_view'}
            tool_calls = [tc for tc in list(getattr(response, 'tool_calls', []) or [])
                         if getattr(tc.tool, 'tool_name', '') not in view_tool_names]

            # Log if we filtered out view tools
            filtered_count = len(list(getattr(response, 'tool_calls', []) or [])) - len(tool_calls)
            if filtered_count > 0:
                logger.info(f"[ORCHESTRATOR] Filtered out {filtered_count} view tool(s) from second phase")

            # Safety net: if we filtered ALL tools (agent only called view tools), force a third try
            if len(tool_calls) == 0 and filtered_count > 0:
                logger.warning(f"[ORCHESTRATOR] Second phase only had view tools! Forcing third invocation...")

                force_edit_prompt = f"""{enriched_prompt}

⚠️ WARNING: You just called view tools again instead of making edits!

The slide you viewed has this styling (from the HTML above):
- Colors, fonts, layout patterns
- CSS variables and classes

You MUST now call one of these EDITING tools:
1. `custom_component_rewrite` - to rewrite the current slide's CustomComponent with similar styling
2. `style_slide` - to apply similar colors/fonts to the current slide
3. `edit_component` - to update specific component properties

DO NOT CALL ANY VIEW TOOLS. MAKE THE EDIT NOW.
"""

                response = invoke(
                    client=client,
                    model=model,
                    max_tokens=16384,
                    response_model=ToolsCalls,
                    messages=[
                        {"role": "system", "content": system_message},
                        {"role": "user", "content": force_edit_prompt}
                    ]
                )

                # Filter view tools one more time
                tool_calls = [tc for tc in list(getattr(response, 'tool_calls', []) or [])
                             if getattr(tc.tool, 'tool_name', '') not in view_tool_names]
                logger.info(f"[ORCHESTRATOR] Third phase returned {len(tool_calls)} editing tool(s)")
        else:
            # No context was gathered, remove view_slide calls and proceed
            tool_calls = [tc for tc in tool_calls if getattr(tc.tool, 'tool_name', '') != 'view_slide']

    # Reorder tool calls for deterministic, high-quality results
    # Strategy: Run deck-wide font application LAST so per-slide stylers don't leave fonts inconsistent
    # Note: tool_calls may have been filtered by two-phase execution above
    if not view_slide_calls:
        # Only re-extract if we didn't already process view_slide calls
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

            friendly_plan = []
            for tc in tool_calls:
                # Use the full model-provided edit_request_summary when present (no truncation)
                summary = (_get_attr(tc, 'edit_request_summary', '') or '').strip()
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

    # QUALITY GATE: Log validation summary
    from agents.config import EDIT_VALIDATE_HTML
    if EDIT_VALIDATE_HTML:
        validation_summary = {
            "tools_executed": len(tool_calls),
            "tools_succeeded": len(edit_summaries),
            "tools_failed": len(tool_calls) - len(edit_summaries),
        }
        logger.info(f"Edit orchestration complete: {validation_summary}")

        if validation_summary["tools_failed"] > 0:
            logger.warning(f"{validation_summary['tools_failed']} tool(s) failed during orchestration")

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
