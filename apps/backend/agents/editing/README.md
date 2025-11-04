# Conversational Agent for Deck Editing

## Overview

This directory contains a **proper conversational agent** for editing presentation decks. The agent uses Claude's Messages API with tool calling to provide an intelligent, iterative, and user-friendly editing experience.

## Architecture

### New Conversational Agent (Recommended)

**File:** `conversational_agent.py`

The new agent implements a proper agentic workflow:

1. **Conversational Loop** - Agent can iterate, communicate with users, and adapt based on tool results
2. **Claude Tool Calling** - Uses Claude's Messages API with proper tool definitions (not structured output)
3. **User Communication** - Agent explains what it's doing, asks for clarification, and reports results
4. **Error Recovery** - Gracefully handles failures and tries alternative approaches
5. **Context Management** - Uses prompt caching for efficient token usage
6. **Streaming Support** - Real-time updates via event callbacks

### Legacy Orchestrator (Backward Compatibility)

**File:** `editing_orchestrator.py`

The legacy system uses structured output with Pydantic models. It:
- Decides all tool calls upfront in one shot
- Executes tools in parallel without iteration
- No user communication during execution
- Tools contain embedded LLM calls (problematic architecture)

## Key Components

### 1. Conversational Agent (`conversational_agent.py`)

Main agent class that:
- Maintains conversation history
- Calls Claude with tools
- Executes tools based on Claude's decisions
- Iterates until task is complete
- Emits events for streaming UX

**Usage:**
```python
from agents.editing.conversational_agent import ConversationalAgent

agent = ConversationalAgent(
    deck_data=deck_data,
    current_slide=current_slide,
    registry=registry,
    event_cb=event_callback  # Optional, for streaming
)

result = agent.run(
    user_message="Make the title bigger and red",
    chat_history=previous_messages  # Optional
)

# Result contains:
# - deck_diff: Changes to apply
# - edit_summary: Human-readable summary
# - final_message: Agent's final response to user
# - tool_use_count: Number of tools used
```

### 2. Tool Definitions (`tools/claude_tools.py`)

Defines tools in Claude-compatible format (JSON schemas). Each tool:
- Has a clear name and description
- Specifies input schema with types and constraints
- Is deterministic (no LLM calls within tools)
- Returns results that the agent can interpret

**Available Tools:**

**Component Tools:**
- `update_component_properties` - Update colors, fonts, positions, etc.
- `create_component` - Add new components (text, images, shapes, charts)
- `remove_component` - Delete components
- `replace_component` - Swap component types

**Slide Tools:**
- `update_background` - Change slide backgrounds (solid/gradient)
- `create_slide` - Add new slides
- `duplicate_slide` - Clone slides
- `remove_slide` - Delete slides

**Media Tools:**
- `insert_image` - Add images
- `search_and_add_logo` - Find and add brand logos

**Theme Tools:**
- `apply_color_palette` - Apply color schemes (brand/website/keyword/random)
- `apply_theme_fonts` - Apply consistent fonts

**Utility Tools:**
- `fetch_website_content` - Extract content from URLs

### 3. System Prompt (`prompts/system_prompt.py`)

Comprehensive prompt that teaches the agent:
- How to communicate clearly with users
- When to ask for clarification
- How to use tools effectively
- Design principles and best practices
- Error handling strategies
- Canvas coordinate system (1920x1080)

### 4. Tool Execution (`tools/claude_tools.py`)

The `execute_tool()` function:
- Routes tool calls to appropriate handlers
- Performs deterministic operations (no LLM calls)
- Returns structured results
- Updates the deck_diff
- Handles errors gracefully

## Configuration

### Environment Variables

```bash
# Use new conversational agent (recommended)
USE_CONVERSATIONAL_AGENT=true

# Use legacy orchestrator (backward compatibility)
USE_CONVERSATIONAL_AGENT=false

# Anthropic API key (required for new agent)
ANTHROPIC_API_KEY=your_key_here

# Model selection (for both agents)
ORCHESTRATOR_MODEL=sonnet  # or opus, haiku
```

### Model Selection

The conversational agent supports:
- `opus` → claude-opus-4-20250514 (most capable)
- `sonnet` → claude-sonnet-4-20250514 (balanced, recommended)
- `haiku` → claude-3-5-haiku-20241022 (fastest, cheapest)

## Migration Guide

### Switching to New Agent

1. **Set environment variable:**
   ```bash
   export USE_CONVERSATIONAL_AGENT=true
   export ANTHROPIC_API_KEY=your_key_here
   ```

2. **Test your workflows:**
   - The new agent is designed to be a drop-in replacement
   - Same API endpoints and data formats
   - Better UX with conversational responses

3. **Monitor behavior:**
   - Check logs for agent iteration count
   - Watch for tool execution patterns
   - Verify streaming events work correctly

### Rollback Plan

If issues occur, simply set:
```bash
export USE_CONVERSATIONAL_AGENT=false
```

The system will fall back to the legacy orchestrator.

## Advantages of New Agent

### 1. **Proper Agent Architecture**

**Old:** One-shot tool calling with structured output
```python
# Old: Decide everything upfront
tools = llm.call(message, return_structured_tools)
execute_all(tools)  # Hope for the best
```

**New:** Iterative conversation loop
```python
# New: Iterate and adapt
while not done:
    response = claude.call(messages, tools)
    if response.has_tools:
        results = execute_tools(response.tools)
        messages.append(results)  # Let agent see results
        continue  # Agent can adjust based on results
    done = True
```

### 2. **User Communication**

**Old:** Silent execution, user sees nothing until done

**New:** Agent explains actions in real-time
```
Agent: "I'll make the title larger and change its color to red."
[executes tool]
Agent: "I've updated the title to 72px and changed the color to #FF0000. Would you like me to adjust anything else?"
```

### 3. **Error Recovery**

**Old:** If a tool fails, the entire operation fails

**New:** Agent sees error and tries alternatives
```
Agent tries: update_component_properties
Tool fails: "Component not found"
Agent sees error
Agent: "I couldn't find that component. Which element did you want to modify?"
```

### 4. **Deterministic Tools**

**Old:** Tools call LLMs internally
```python
def edit_component(args):
    # Tool makes its own LLM call!
    llm_result = call_llm("figure out how to edit this")
    return llm_result
```

**New:** Tools are pure functions
```python
def update_component_properties(args):
    # Direct, deterministic operation
    component_id = args["component_id"]
    properties = args["properties"]
    deck_diff.update_component(slide_id, component_id, properties)
    return {"success": True, "message": "Updated"}
```

### 5. **Context Management**

**Old:** No prompt caching, expensive context on every call

**New:** Prompt caching for deck context
```python
system_blocks = [
    {"type": "text", "text": system_prompt},
    {
        "type": "text",
        "text": deck_context,
        "cache_control": {"type": "ephemeral"}  # Cache this!
    }
]
```

This saves ~90% of input tokens on subsequent calls.

## Event Streaming

The agent emits events for real-time UX:

### Event Types

1. **`assistant.message.delta`**
   ```json
   {
     "type": "assistant.message.delta",
     "data": {"delta": "I'll update the title color..."}
   }
   ```

2. **`agent.tool.start`**
   ```json
   {
     "type": "agent.tool.start",
     "data": {"tool": "update_component_properties"}
   }
   ```

3. **`agent.tool.finish`**
   ```json
   {
     "type": "agent.tool.finish",
     "data": {
       "tool": "update_component_properties",
       "summary": "Updated component properties"
     }
   }
   ```

4. **`agent.tool.error`**
   ```json
   {
     "type": "agent.tool.error",
     "data": {
       "tool": "update_component_properties",
       "error": "Component not found"
     }
   }
   ```

5. **`deck.preview.diff`**
   ```json
   {
     "type": "deck.preview.diff",
     "data": {
       "diff": {...},
       "slides": [...]
     }
   }
   ```

6. **`deck.edit.applied`**
   ```json
   {
     "type": "deck.edit.applied",
     "data": {
       "editId": "uuid",
       "deckRevision": 123,
       "updatedSlideIds": ["slide-1"]
     }
   }
   ```

## Best Practices

### 1. Tool Design

✅ **Good:**
```python
def update_component_properties(tool_input, deck_data, deck_diff):
    """Update specific properties - deterministic"""
    properties = tool_input["properties"]
    deck_diff.update_component(slide_id, component_id, properties)
    return {"message": "Updated", "success": True}
```

❌ **Bad:**
```python
def update_component(tool_input):
    """Let LLM figure out what to update"""
    llm_response = call_llm(f"Update this component: {tool_input}")
    return llm_response
```

### 2. System Prompt

Keep it:
- Clear and specific
- Action-oriented
- Focused on user experience
- Include constraints (canvas size, available types)
- Teach error recovery

### 3. Error Handling

```python
try:
    result = execute_tool(tool_name, tool_input, ...)
    if isinstance(result, dict) and not result.get("success"):
        # Tool executed but reported failure
        # Agent will see this and can adjust
        return result
except Exception as e:
    # Unexpected error - return error for agent to see
    return {
        "message": f"Error: {str(e)}",
        "success": False
    }
```

### 4. Context Management

Use prompt caching for:
- Deck summaries (changes rarely during session)
- Component registry (static)
- System instructions (never change)

Don't cache:
- User messages (always unique)
- Tool results (vary each iteration)

## Testing

### Unit Tests

Test individual tools:
```python
def test_update_component_properties():
    tool_input = {
        "component_id": "comp-123",
        "slide_id": "slide-1",
        "properties": {"textColor": "#FF0000"},
        "reason": "Make text red"
    }
    result = _update_component_properties(
        tool_input, deck_data, deck_diff, registry
    )
    assert result["success"] == True
```

### Integration Tests

Test full agent:
```python
def test_agent_conversation():
    agent = ConversationalAgent(deck_data, slide, registry)
    result = agent.run("Make the title red")

    assert result["deck_diff"] is not None
    assert "red" in result["final_message"].lower()
    assert result["tool_use_count"] > 0
```

## Troubleshooting

### Agent doesn't respond
- Check `ANTHROPIC_API_KEY` is set
- Verify model name is correct
- Check for API rate limits

### Tools fail silently
- Check tool input validation
- Verify component/slide IDs exist
- Review error logs for exceptions

### Infinite loops
- Check `max_iterations` setting (default: 15)
- Review agent's decision-making in logs
- Ensure tools return clear success/failure

### Poor quality edits
- Review system prompt - is it clear enough?
- Check tool descriptions - are they specific?
- Verify deck context is being cached properly

## Future Improvements

### Potential Enhancements

1. **Multi-turn planning**
   - Agent creates plan, user approves, then executes
   - Better for complex multi-step operations

2. **Visual confirmation**
   - Generate preview thumbnails
   - Show before/after comparisons

3. **Learning from feedback**
   - Store user corrections
   - Fine-tune prompts based on patterns

4. **Collaborative editing**
   - Multiple agents working together
   - Specialized agents for design, content, layout

5. **Undo/redo support**
   - Agent tracks change history
   - Can revert specific changes

## Support

For questions or issues:
1. Check this README first
2. Review code comments in `conversational_agent.py`
3. Examine tool definitions in `tools/claude_tools.py`
4. Check logs for detailed error messages

## References

- [Claude Messages API](https://docs.anthropic.com/en/api/messages)
- [Tool Use (Function Calling)](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Building Agents](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
