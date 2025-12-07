"""
Conversational Agent for Deck Editing

This module implements a proper conversational agent that:
- Uses Claude's Messages API with tool calling
- Maintains conversation context
- Communicates with users during execution
- Iterates on tool results
- Handles errors gracefully
"""

from typing import List, Dict, Any, Optional, Callable
import json
import anthropic
from models.registry import ComponentRegistry
from models.deck import DeckBase, DeckDiff, DeckDiffBase
from models.requests import ChatMessage
from agents.editing.tools.claude_tools import get_claude_tools, execute_tool
from agents.editing.prompts.system_prompt import get_system_prompt
from agents.config import ORCHESTRATOR_MODEL
from agents.ai.clients import get_model_id
from services.context_cache import get_deck_context_snapshot
from utils.summaries import format_chat_history
import os


class ConversationalAgent:
    """
    A conversational agent that can edit decks through natural conversation.

    This agent:
    - Maintains conversation history
    - Uses tools to make deck edits
    - Communicates progress to users
    - Iterates based on tool results
    - Handles errors and asks for clarification when needed
    """

    def __init__(
        self,
        deck_data: DeckBase,
        current_slide: Dict,
        registry: ComponentRegistry,
        event_cb: Optional[Callable] = None
    ):
        self.deck_data = deck_data
        self.current_slide = current_slide
        self.registry = registry
        self.event_cb = event_cb

        # Initialize Anthropic client
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")
        self.client = anthropic.Anthropic(api_key=api_key)

        # Model configuration
        self.model = get_model_id(ORCHESTRATOR_MODEL)
        self.max_tokens = 4096
        self.max_iterations = 15  # Prevent infinite loops

        # Conversation state
        self.messages = []
        self.deck_diff = DeckDiff(DeckDiffBase())
        self.tool_use_count = 0

    def _emit_event(self, event_type: str, data: Dict[str, Any]):
        """Emit an event to the event callback if available"""
        if self.event_cb:
            try:
                self.event_cb(event_type, data)
            except Exception as e:
                print(f"Error emitting event {event_type}: {e}")

    def _get_deck_context(self) -> str:
        """Get cached deck context for efficient token usage"""
        deck_id = getattr(self.deck_data, 'uuid', None) or (
            self.deck_data.get('uuid') if isinstance(self.deck_data, dict) else None
        )
        current_slide_id = getattr(self.current_slide, 'id', None) or (
            self.current_slide.get('id') if isinstance(self.current_slide, dict) else None
        )

        snapshot = get_deck_context_snapshot(deck_id, self.deck_data, current_slide_id)
        return snapshot.get('summary_text', 'Deck context unavailable')

    def _build_system_prompt(self) -> List[Dict[str, Any]]:
        """Build system prompt with deck context (using prompt caching)"""
        deck_context = self._get_deck_context()

        system_blocks = [
            {
                "type": "text",
                "text": get_system_prompt(),
            },
            {
                "type": "text",
                "text": f"""
# Current Deck Context

{deck_context}

This context is cached for efficiency. Use it to understand the current state of the deck.
""",
                "cache_control": {"type": "ephemeral"}
            }
        ]

        return system_blocks

    def _build_tools(self) -> List[Dict[str, Any]]:
        """Build Claude-compatible tool definitions"""
        current_slide_id = getattr(self.current_slide, 'id', None) or (
            self.current_slide.get('id') if isinstance(self.current_slide, dict) else None
        )

        return get_claude_tools(
            deck_data=self.deck_data,
            registry=self.registry,
            current_slide_id=current_slide_id
        )

    def run(
        self,
        user_message: str,
        chat_history: Optional[List[ChatMessage]] = None
    ) -> Dict[str, Any]:
        """
        Run the conversational agent.

        Args:
            user_message: The user's message/request
            chat_history: Optional previous conversation history

        Returns:
            Dict containing deck_diff, edit_summary, and final_message
        """
        # Initialize conversation with chat history
        if chat_history:
            self.messages.extend(self._format_chat_history(chat_history))

        # Add user message
        self.messages.append({
            "role": "user",
            "content": user_message
        })

        # Get system prompt and tools
        system_prompt = self._build_system_prompt()
        tools = self._build_tools()

        # Main conversation loop
        iteration = 0
        final_message = ""

        while iteration < self.max_iterations:
            iteration += 1
            print(f"\n=== Agent Iteration {iteration} ===")

            try:
                # Call Claude
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    system=system_prompt,
                    messages=self.messages,
                    tools=tools,
                )

                # Handle response
                stop_reason = response.stop_reason

                # Process response content
                assistant_message = {
                    "role": "assistant",
                    "content": response.content
                }
                self.messages.append(assistant_message)

                # Extract text if any
                text_content = self._extract_text(response.content)
                if text_content:
                    final_message = text_content
                    self._emit_event("assistant.message.delta", {"delta": text_content})

                # Handle tool use
                if stop_reason == "tool_use":
                    tool_results = self._execute_tools(response.content)

                    # Add tool results to conversation
                    self.messages.append({
                        "role": "user",
                        "content": tool_results
                    })

                    # Continue loop to let agent process results
                    continue

                # If we get here, agent is done (end_turn or max_tokens)
                if stop_reason == "end_turn":
                    print("Agent finished successfully")
                    break
                elif stop_reason == "max_tokens":
                    print("Warning: Reached max tokens")
                    break

            except Exception as e:
                print(f"Error in agent loop: {e}")
                self._emit_event("error", {
                    "code": "agent_error",
                    "message": str(e)
                })
                break

        # Build final response
        edit_summary = self._generate_edit_summary()

        self._emit_event("assistant.message.complete", {
            "messageId": f"msg_{iteration}",
            "content": final_message
        })

        return {
            "deck_diff": self.deck_diff.deck_diff if hasattr(self.deck_diff, 'deck_diff') else self.deck_diff,
            "edit_summary": edit_summary,
            "final_message": final_message,
            "tool_use_count": self.tool_use_count
        }

    def _extract_text(self, content: List[Dict]) -> str:
        """Extract text content from response"""
        text_parts = []
        for block in content:
            if block.get("type") == "text":
                text_parts.append(block.get("text", ""))
        return "\n".join(text_parts).strip()

    def _execute_tools(self, content: List[Dict]) -> List[Dict[str, Any]]:
        """Execute all tool uses in the response"""
        tool_results = []

        for block in content:
            if block.get("type") == "tool_use":
                tool_name = block.get("name")
                tool_input = block.get("input", {})
                tool_use_id = block.get("id")

                self.tool_use_count += 1

                print(f"Executing tool: {tool_name}")
                self._emit_event("agent.tool.start", {"tool": tool_name})

                try:
                    # Execute the tool
                    result = execute_tool(
                        tool_name=tool_name,
                        tool_input=tool_input,
                        deck_data=self.deck_data,
                        registry=self.registry,
                        deck_diff=self.deck_diff
                    )

                    # Update deck_diff if returned
                    if isinstance(result, dict) and "deck_diff" in result:
                        self.deck_diff = self.deck_diff.merge(result["deck_diff"])
                        result_content = result.get("message", "Tool executed successfully")
                    else:
                        result_content = str(result)

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": result_content
                    })

                    self._emit_event("agent.tool.finish", {
                        "tool": tool_name,
                        "summary": result_content
                    })

                except Exception as e:
                    error_msg = f"Error executing {tool_name}: {str(e)}"
                    print(error_msg)

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": error_msg,
                        "is_error": True
                    })

                    self._emit_event("agent.tool.error", {
                        "tool": tool_name,
                        "error": str(e)
                    })

        return tool_results

    def _format_chat_history(self, chat_history: List[ChatMessage]) -> List[Dict[str, str]]:
        """Convert chat history to Claude message format"""
        messages = []
        for msg in chat_history:
            role = getattr(msg, 'role', None) or msg.get('role') if isinstance(msg, dict) else None
            content = getattr(msg, 'content', None) or msg.get('content') if isinstance(msg, dict) else None

            if role in ["user", "assistant"] and content:
                messages.append({
                    "role": role,
                    "content": content
                })
        return messages

    def _generate_edit_summary(self) -> str:
        """Generate a summary of edits made"""
        if not self.deck_diff or not hasattr(self.deck_diff, 'deck_diff'):
            return "No edits made"

        diff_data = self.deck_diff.deck_diff
        if not diff_data:
            return "No edits made"

        summaries = []

        # Check for slide updates
        if hasattr(diff_data, 'slides_to_update'):
            for slide_update in diff_data.slides_to_update:
                if hasattr(slide_update, 'components_to_add') and slide_update.components_to_add:
                    summaries.append(f"Added {len(slide_update.components_to_add)} component(s)")
                if hasattr(slide_update, 'components_to_update') and slide_update.components_to_update:
                    summaries.append(f"Updated {len(slide_update.components_to_update)} component(s)")
                if hasattr(slide_update, 'components_to_remove') and slide_update.components_to_remove:
                    summaries.append(f"Removed {len(slide_update.components_to_remove)} component(s)")

        # Check for new slides
        if hasattr(diff_data, 'slides_to_add') and diff_data.slides_to_add:
            summaries.append(f"Added {len(diff_data.slides_to_add)} slide(s)")

        # Check for removed slides
        if hasattr(diff_data, 'slides_to_remove') and diff_data.slides_to_remove:
            summaries.append(f"Removed {len(diff_data.slides_to_remove)} slide(s)")

        return "; ".join(summaries) if summaries else "Made edits to deck"
