from models.requests import ChatRequest, ChatResponse
from models.registry import ComponentRegistry
from agents.editing.editing_orchestrator import edit_deck
from utils.deck import find_current_slide
from utils.threading import run_in_threadpool
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import logging

# Create a thread pool executor for running CPU-bound tasks
thread_pool = ThreadPoolExecutor(max_workers=32)

logger = logging.getLogger(__name__)

async def process_api_chat(request: ChatRequest, registry: ComponentRegistry | None):
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
    
    # If we found a slide, process it with the agent
    try:
        # HACK WE SHOULDN"T NEED THIS ANYMORE
        # request.deck_data["size"] = {"width": 1920, "height": 1080}
        
        # Process the message with the deck editor agent in a separate thread to avoid blocking
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

        result = await run_in_threadpool(
            thread_pool,
            edit_deck,
            deck_data=request.deck_data,
            current_slide=current_slide,
            registry=registry,
            message=user_message,
            chat_history=request.chat_history[:-1], # remove the most recent message from the chat history
            run_uuid=request.run_uuid
        )
        
        # Extract the response
        ai_response = result.get("edit_summary", "I've processed your request and made the requested changes.")
        
        # Create a deck diff from the agent result using slide_diff
        deck_diff = result.get("deck_diff", None)
        logger.debug(f"deck_diff: {deck_diff}")
        
    except Exception as e:
        import traceback
        logger.error(f"Error processing with deck editor agent: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Fallback to a generic response
        ai_response = "I'm having trouble processing your request. Could you try again?"
        deck_diff = None

    # Return the response with deck updates
    return ChatResponse(
        message=ai_response,
        timestamp=datetime.now(),
        deck_diff=deck_diff
    ) 