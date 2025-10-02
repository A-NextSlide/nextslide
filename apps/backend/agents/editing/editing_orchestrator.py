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
from concurrent.futures import ThreadPoolExecutor

call_map = {
    "undefined": undefined_tool,
}

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

def get_orchestrator_prompt(state: AgentState, descriptions: str):
    """
    Get the prompt for the orchestrator
    """

    # Resolve canvas size and current slide id for typed/dict inputs
    _deck = state.get('deck_data', {})
    canvas_size = getattr(_deck, 'size', None) if not isinstance(_deck, dict) else _deck.get('size')
    _cur = state.get('current_slide', {})
    current_slide_id = getattr(_cur, 'id', None) if not isinstance(_cur, dict) else _cur.get('id')

    prompt = f"""
    Based on the deck summary, current slide, chat history, user request, and already gathered context, determine which tools to call in order to edit the deck.
    
    <chat_history>
    {summarize_chat_history(state.get('chat_history', []))}
    </chat_history>

    <user_message>
    {state.get('user_message', '')}
    </user_message>

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
    Orchestrate the editing process
    Fill the deck diff and the edit summary
    """

    # Resolve current slide id for both typed and dict slides
    _cur = state.get('current_slide', {})
    _cur_id = getattr(_cur, 'id', None) if not isinstance(_cur, dict) else _cur.get('id')
    tools, _map = get_tools_and_call_map(
        deck_data=state.get('deck_data', {}),
        registry=state.get('registry', {}),
        current_slide_id=_cur_id,
    )
    call_map.update(_map)

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
        max_tokens=2048,
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

    for tool_call in tool_calls:
        if event_cb:
            try:
                event_cb("agent.tool.start", {"tool": getattr(tool_call.tool, 'tool_name', 'unknown')})
            except Exception:
                pass
        print(f"    DEBUG: Tool call: {tool_call}")

    # Initialize an empty deck diff
    deck_diff = DeckDiff(DeckDiffBase())
    edit_summaries = []
    
    # Define a function to process a single tool call
    def process_tool_call(tool_call):
        if tool_call.tool.tool_name not in call_map:
            raise ValueError(f"Tool name {tool_call.tool.tool_name} not found in call_map")

        tool_fn = call_map.get(tool_call.tool.tool_name, undefined_tool)
        # Create a new deck diff for each tool call
        tool_diff = tool_fn(tool_call.tool, state.get('registry'), state.get('deck_data'), DeckDiff(DeckDiffBase()))
        return (tool_diff, tool_call.edit_request_summary)
    
    # Process tool calls in parallel
    with ThreadPoolExecutor() as executor:
        # Submit all tool calls to the executor
        future_results = [executor.submit(process_tool_call, tool_call) for tool_call in tool_calls]
        
        # Collect results as they complete
        for idx, future in enumerate(future_results):
            tool_call = tool_calls[idx]
            tool_name = getattr(tool_call.tool, 'tool_name', 'unknown')
            tool_diff, summary = future.result()
            # Merge the tool diff into the main deck diff
            deck_diff = deck_diff.merge(tool_diff)
            edit_summaries.append(summary)
            if event_cb:
                try:
                    event_cb("agent.tool.finish", {"tool": tool_name, "summary": summary})
                except Exception:
                    pass

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

def edit_deck(deck_data, current_slide, registry, message, chat_history, run_uuid=None, event_cb=None):
    # Create a structured deck summary using cached digest snapshots
    # Support dict or typed slide
    _cur_id = None
    try:
        _cur_id = current_slide.id
    except Exception:
        if isinstance(current_slide, dict):
            _cur_id = current_slide.get('id')
    snapshot = get_deck_context_snapshot(
        getattr(deck_data, 'uuid', None) or (deck_data.get('uuid') if isinstance(deck_data, dict) else None),
        deck_data,
        current_slide_id=_cur_id,
    )
    deck_summary = snapshot.get('summary_text', 'Deck summary unavailable')

    # Initialize the agent state
    initial_state = AgentState(
        route="gather_context",  # Start by gathering context
        deck_data=deck_data,
        registry=registry,
        deck_summary=deck_summary,
        current_slide=current_slide,
        user_message=message,
        context=[],
        chat_history=chat_history
    )

    config = {
        "tags": ["edit_deck"],
        "metadata": {
            "deck_id": getattr(deck_data, 'uuid', None) or (deck_data.get('uuid') if isinstance(deck_data, dict) else None),
            "edit_uuid": run_uuid or 'unknown'
        }
    }

    print(f"DEBUG: Config: {config}")
    # Build a new agent instance for each request to avoid state sharing
    print(f"DEBUG: Running orchestrate() directly with streaming callbacks")
    # Direct call to orchestrate so we can use event_cb for streaming
    end_state = orchestrate(initial_state, event_cb=event_cb)
    deck_diff = end_state.get('deck_diff')
    edit_summary = end_state.get('edit_summary')

    print(f"DEBUG: End state keys: {list(end_state.keys())}")
    print(f"DEBUG: Deck diff object: {deck_diff}, type: {type(deck_diff)}")
    print(f"DEBUG: Edit summary: {edit_summary}")
    
    # Safe extraction of deck_diff data
    deck_diff_data = None
    try:
        if deck_diff:
            if hasattr(deck_diff, 'deck_diff'):
                deck_diff_data = deck_diff.deck_diff
                print(f"DEBUG: Extracted deck_diff.deck_diff: {deck_diff_data}")
            else:
                deck_diff_data = deck_diff
                print(f"DEBUG: Using deck_diff directly: {deck_diff_data}")
        else:
            print(f"DEBUG: No deck_diff in end_state")
    except Exception as e:
        print(f"DEBUG: Error extracting deck_diff: {e}")
        deck_diff_data = None
    
    # Return the slide diff along with other metadata
    result = {
        "deck_diff": deck_diff_data,
        "verification": "not implemented",
        "edit_summary": edit_summary
    }
    print(f"DEBUG: Returning result: {result}")
    return result
