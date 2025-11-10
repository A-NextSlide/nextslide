from models.requests import ChatRequest, ChatResponse
from models.registry import ComponentRegistry
from agents.editing.editing_orchestrator import edit_deck
from utils.deck import find_current_slide
from utils.threading import run_in_threadpool
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
import logging

# Create a thread pool executor for running CPU-bound tasks
thread_pool = ThreadPoolExecutor(max_workers=32)

logger = logging.getLogger(__name__)

async def process_api_chat(request: ChatRequest, registry: Optional[ComponentRegistry]):
    """
    Process a chat message and return a response with deck updates
    """

    # Validate the deck using the registry
    if registry is None:
        return ChatResponse(
            message="Error: Registry not loaded",
            timestamp=datetime.now(),
            deck_diff=None
        )

    # Try to get the current slide from the slide_id or current_slide_index
    current_slide = None
    deck_diff = None  # Store deck diff for updates

    if request.deck_data:
        logger.debug(f"Received deck data with {len(request.deck_data.slides)} slides")
        current_slide = find_current_slide(
            deck_data=request.deck_data,
            slide_id=request.slide_id,
            current_slide_index=request.current_slide_index
        )

    # Process with conversational agent approach
    try:
        # Inject selection context into the user message to bias tools
        user_message = request.message
        try:
            if getattr(request, 'selections', None):
                sel_summaries = []
                for s in request.selections or []:
                    sid = s.get('slideId') or s.get('slide_id')
                    cid = s.get('elementId') or s.get('componentId')
                    typ = s.get('elementType') or s.get('componentType')
                    if cid:
                        sel_summaries.append(f"{cid} ({typ})@{sid}" if typ else (f"{cid}@{sid}" if sid else f"{cid}"))
                if sel_summaries:
                    user_message += "\n\n[USER_SELECTIONS] " + ", ".join(sel_summaries)
        except Exception:
            pass

        # Generate conversational acknowledgment first (fast response)
        from agents.ai.clients import get_client
        try:
            client, model = get_client("claude-haiku-4-5", wrap_with_instructor=False)

            # Build minimal chat history for context
            messages = []
            # Only include last 3 messages for speed
            recent_history = request.chat_history[-4:-1] if len(request.chat_history) > 1 else []
            for msg in recent_history:
                messages.append({
                    "role": "user" if msg.role == "user" else "assistant",
                    "content": msg.content
                })
            messages.append({
                "role": "user",
                "content": user_message
            })

            # Conversational system prompt
            system_prompt = """You are a friendly slide editing assistant.

Acknowledge the user's request naturally and briefly. Be warm and conversational like ChatGPT.
Keep it SHORT - just 1 sentence.

Examples:
- "Got it! Changing the title color to blue now."
- "Sure thing! I'll add that chart for you."
- "On it! Making the text bigger."
- "Perfect! Adding a new slide."

If you need clarification, ask ONE specific question:
- "Which slide should I edit?"
- "What color would you like?"
- "Where should I place it?"

Be friendly, not robotic!"""

            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=128,
                system=system_prompt,
                messages=messages,
                temperature=0.7
            )

            # Extract conversational response
            ai_response = response.content[0].text if response.content else "Let me help you with that!"
        except Exception as conv_err:
            logger.warning(f"Conversational response failed, using default: {conv_err}")
            ai_response = "Got it! Let me make that change for you."

        # Now execute the actual editing action in parallel
        result = await run_in_threadpool(
            thread_pool,
            edit_deck,
            deck_data=request.deck_data,
            current_slide=current_slide,
            registry=registry,
            message=user_message,
            chat_history=request.chat_history[:-1],
            run_uuid=request.run_uuid
        )

        # Get the deck diff
        deck_diff = result.get("deck_diff", None)
        logger.debug(f"deck_diff: {deck_diff}")

    except Exception as e:
        import traceback
        logger.error(f"Error processing with deck editor agent: {str(e)}")
        logger.error(traceback.format_exc())

        # Conversational error response
        ai_response = "Hmm, I'm having trouble with that. Could you try rephrasing your request?"
        deck_diff = None

    # Return the response with deck updates
    return ChatResponse(
        message=ai_response,
        timestamp=datetime.now(),
        deck_diff=deck_diff
    ) 