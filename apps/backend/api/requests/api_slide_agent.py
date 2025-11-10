"""
Slide Editing Agent - Conversational AI for editing slides in real-time.

Uses Anthropic's Claude with streaming to have natural conversations
and make slide edits when ready.
"""
import logging
import json
from typing import Dict, Any, List, Optional, AsyncGenerator
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agents.ai.clients import get_client, invoke
from agents.editing.editing_orchestrator import edit_deck
from services.supabase_auth_service import get_auth_service
from api.requests.api_auth import get_auth_header
from setup_logging_optimized import get_logger
from models.registry import ComponentRegistry
from utils.deck import find_current_slide

logger = get_logger(__name__)

router = APIRouter(prefix="/api/slide-agent", tags=["slide-agent"])


# Request/Response Models
class ChatMessage(BaseModel):
    """A single chat message."""
    role: str  # 'user' or 'assistant'
    content: str


class SlideAgentRequest(BaseModel):
    """Request to the slide editing agent."""
    message: str = Field(..., description="User's message")
    chat_history: List[ChatMessage] = Field(default_factory=list, description="Previous conversation")
    deck_data: Optional[Dict[str, Any]] = Field(default=None, description="Current deck state")
    current_slide_index: Optional[int] = Field(default=None, description="Index of current slide")
    slide_id: Optional[str] = Field(default=None, description="ID of current slide")
    selections: Optional[List[Dict[str, Any]]] = Field(default=None, description="Selected elements")


# Conversational Agent System Prompt
SLIDE_AGENT_SYSTEM_PROMPT = """You are a friendly, expert slide editing assistant. Your job is to help users edit their presentation slides through natural conversation.

**Your Approach:**
1. **Be conversational and helpful** - You're like ChatGPT or Claude, having a natural dialogue
2. **Ask clarifying questions** when the user's intent isn't clear
3. **Acknowledge requests naturally** before taking action
4. **Explain what you're doing** in friendly, simple language
5. **Stream your responses naturally** - Write as if typing to the user in real-time

**What You Can Do:**
- Edit text, titles, subtitles on slides
- Add, remove, or modify slide elements (text boxes, images, shapes, charts)
- Change colors, fonts, sizes, positions
- Rearrange elements on slides
- Add new slides or remove existing ones
- Change backgrounds and themes
- And much more!

**When to Ask Clarifying Questions:**
- If user says "change the title" but there are multiple titles, ask "Which slide's title?"
- If user says "make it bigger" without context, ask "What would you like me to make bigger?"
- If user says "add a chart" without details, ask "What type of chart and what data should it show?"

**How to Respond:**

**Step 1: Acknowledge & Clarify (if needed)**
First, acknowledge what the user wants in a friendly way:
- "Got it! I'll change the title color to blue."
- "Sure! Let me add a new slide for you."
- "I can help with that! Which slide would you like me to edit?"

**Step 2: Take Action**
Use the available tools to make the requested edits. Think step-by-step about what tools to call.

**Step 3: Confirm**
After making changes, briefly confirm what you did:
- "Done! I've changed the title to 'Introduction to AI'."
- "All set! Added a blue circle in the center of slide 2."

**Important Guidelines:**
- Be warm and encouraging, not robotic
- If something isn't possible, explain why politely and suggest alternatives
- If you're not sure what the user wants, ask before making changes
- Keep responses concise but friendly

**Examples:**

User: "change the title"
Assistant: I can help with that! Which slide's title would you like me to change, and what should the new title be?

User: "change slide 3 title to Introduction"
Assistant: Got it! Changing slide 3's title to "Introduction" now.
[Makes the edit using tools]
Done! Slide 3 now has the title "Introduction".

User: "make the background blue"
Assistant: Sure! I'll change the background to blue.
[Makes the edit using tools]
All set! The background is now blue.

User: "add a circle"
Assistant: I can add a circle for you! What color would you like it to be, and where should I put it?

User: "red circle in the middle"
Assistant: Perfect! Adding a red circle in the center now.
[Makes the edit using tools]
Done! Added a red circle in the middle of the slide.

**Remember**: You're having a conversation, not just executing commands. Be helpful, ask when needed, and make editing feel easy and natural!
"""


async def stream_slide_agent_response(
    request: SlideAgentRequest,
    registry: ComponentRegistry
) -> AsyncGenerator[str, None]:
    """
    Stream the agent's response - conversational wrapper around editing tools.
    """
    try:
        # Get the raw Claude client for streaming
        client, model = get_client("claude-haiku-4-5", wrap_with_instructor=False)

        # Build message history
        messages = []
        for msg in request.chat_history:
            if msg.content and msg.content.strip():
                messages.append({
                    "role": msg.role,
                    "content": msg.content
                })

        # Add current user message
        messages.append({
            "role": "user",
            "content": request.message
        })

        logger.info(f"[SlideAgent] Processing message with {len(messages)} messages in history")

        # First, stream a conversational response
        response_text = ""
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=SLIDE_AGENT_SYSTEM_PROMPT,
            messages=messages,
            temperature=0.7
        ) as stream:
            for event in stream:
                if hasattr(event, 'type') and event.type == 'content_block_delta':
                    if hasattr(event, 'delta') and hasattr(event.delta, 'text'):
                        text = event.delta.text
                        response_text += text
                        yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"

        # Now execute the actual editing action
        # Find current slide
        current_slide = None
        if request.deck_data:
            current_slide = find_current_slide(
                deck_data=request.deck_data,
                slide_id=request.slide_id,
                current_slide_index=request.current_slide_index
            )

        # Call the editing orchestrator
        try:
            # Inject selections into message if present
            user_message = request.message
            if request.selections:
                sel_summaries = []
                for s in request.selections:
                    sid = s.get('slideId') or s.get('slide_id')
                    cid = s.get('elementId') or s.get('componentId')
                    typ = s.get('elementType') or s.get('componentType')
                    if cid:
                        sel_summaries.append(
                            f"{cid} ({typ})@{sid}" if typ else (f"{cid}@{sid}" if sid else f"{cid}")
                        )
                if sel_summaries:
                    user_message += "\n\n[USER_SELECTIONS] " + ", ".join(sel_summaries)

            result = edit_deck(
                deck_data=request.deck_data,
                current_slide=current_slide,
                registry=registry,
                message=user_message,
                chat_history=request.chat_history
            )

            # Send the deck diff back
            deck_diff = result.get("deck_diff", None)
            if deck_diff:
                yield f"data: {json.dumps({'type': 'deck_diff', 'diff': deck_diff})}\n\n"

        except Exception as e:
            logger.error(f"[SlideAgent] Error executing edits: {str(e)}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': f'Sorry, I had trouble making that change: {str(e)}'})}\n\n"

        # Send done event
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.error(f"[SlideAgent] Error in stream: {str(e)}", exc_info=True)
        error_msg = f"I encountered an error: {str(e)}. Could you try again?"
        yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"


@router.post("/chat")
async def slide_agent_chat(
    request: SlideAgentRequest,
    registry: ComponentRegistry = Depends(lambda: None),  # TODO: Inject registry
    token: Optional[str] = Depends(get_auth_header)
):
    """
    Chat with the slide editing agent.
    Returns a streaming response with conversational edits.
    """
    try:
        logger.info(f"[SlideAgent] Received chat request: {request.message[:100]}")

        # Get registry if not provided
        if registry is None:
            from models.registry import ComponentRegistry
            registry = ComponentRegistry()

        return StreamingResponse(
            stream_slide_agent_response(request, registry),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    except Exception as e:
        logger.error(f"[SlideAgent] Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
