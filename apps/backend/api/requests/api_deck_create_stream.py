"""
Streaming API endpoint for creating and composing a deck from an outline.

This endpoint handles the entire flow:
1. Creates the deck in the database
2. Streams composition progress using the new structured approach
"""

import asyncio
import logging
import uuid
from typing import Dict, Any, AsyncIterator, Optional, List
from datetime import datetime, timezone

from pydantic import BaseModel, Field
from models.requests import DeckOutline
from models.registry import ComponentRegistry
from utils.supabase import upload_deck, get_deck
from agents.generation.events import sse_encode
from api.requests.deck_create import (
    build_initial_deck_payload,
    ensure_deck_title,
    initialize_conversation_history,
    assign_uploaded_media_to_slides_with_ai,
    broadcast_uploaded_media_to_slide_models,
    log_tagged_media_summary,
    prepare_outline_dict,
    start_narrative_flow_task,
    add_locked_slide_info_if_needed,
)

# Import new deck composition method
from agents.generation.deck_composer import compose_deck_stream, SCHEMA_VERSION
from agents.config import COMPOSER_MODEL, MAX_PARALLEL_SLIDES, DELAY_BETWEEN_SLIDES

import sentry_sdk

import weakref

logger = logging.getLogger(__name__)

# Global set to track background tasks
_background_tasks = weakref.WeakSet()


class CreateDeckFromOutlineRequest(BaseModel):
    """Request for creating a deck from an outline with streaming"""
    outline: Dict[str, Any] = Field(description="The deck outline")
    stylePreferences: Optional[Dict[str, Any]] = Field(default=None, description="Style preferences for the deck")
    max_parallel: int = Field(default=MAX_PARALLEL_SLIDES, description="Maximum number of slides to generate in parallel")
    delay_between_slides: float = Field(default=DELAY_BETWEEN_SLIDES, description="Delay in seconds between starting each slide generation")
    model: str = Field(COMPOSER_MODEL, description="The model to use for generation")
    streaming: bool = Field(True, description="Whether to use token streaming where applicable")
    deck_uuid: Optional[str] = Field(None, description="Optional deck UUID. If not provided, one will be generated.")
    async_images: bool = Field(True, description="If False, images are auto-applied synchronously; if True, images are searched asynchronously and user selects manually (default: True = placeholders)")


def stream_deck_creation(request: CreateDeckFromOutlineRequest, registry: ComponentRegistry) -> AsyncIterator[str]:
    """
    Stream the creation and composition of a deck from an outline using the new structured approach.
    
    This function:
    1. Creates the deck in the database
    2. Streams composition progress using the three-phase approach
    
    Args:
        request: The request containing the outline and style preferences
        registry: The component registry
        
    Yields:
        Server-sent event formatted strings with progress updates
    """
    logger.info("[DECK_CREATE] stream_deck_creation called")

    # Get settings from request - use config for max parallelism (Gemini Tier 3 = no limits)
    from agents import config
    max_parallel_val = config.MAX_PARALLEL_SLIDES
    delay_val = request.delay_between_slides

    logger.info(f"Starting deck creation (Schema: {SCHEMA_VERSION})")
    logger.info(f"Settings: Max Parallel={max_parallel_val}, Slide Delay={delay_val}s")
    
    # Extract user_id if available
    user_id = getattr(request, '_user_id', None)
    if user_id:
        logger.info(f"Creating deck for authenticated user: {user_id}")
    
    async def generate():
        # Emit bytes for SSE and always close with an explicit end marker
        deck_uuid: Optional[str] = None
        sequence = 0

        def _sse(event: Dict[str, Any]) -> bytes:
            nonlocal sequence, deck_uuid
            sequence += 1
            event.setdefault("sequence", sequence)
            if deck_uuid and "deck_uuid" not in event and "deck_id" not in event:
                event["deck_uuid"] = deck_uuid
                event["deck_id"] = deck_uuid
            try:
                return sse_encode(event)
            except Exception:
                return sse_encode({"type": "error", "error": "serialization_failed"})
        logger.info("[DECK_CREATE] generate() called")
        # Proactively open the SSE stream for proxies and clients
        try:
            yield _sse({'type': 'connection_established', 'message': 'SSE stream open'})
        except Exception:
            # If the client already disconnected, stop early
            return
        
        with sentry_sdk.start_transaction(op="deck.create", name="Create Deck from Outline") as transaction:
            try:
                outline_dict = request.outline
                deck_uuid, outline_dict = prepare_outline_dict(
                    outline_dict, request.stylePreferences
                )
                deck_outline = DeckOutline(**outline_dict)
                ensure_deck_title(deck_outline)
                try:
                    assigned = await assign_uploaded_media_to_slides_with_ai(deck_outline)
                    if not assigned:
                        broadcast_uploaded_media_to_slide_models(deck_outline)
                except Exception as exc:
                    logger.warning("[DECK_CREATE] Uploaded media assignment failed: %s", exc)
                    broadcast_uploaded_media_to_slide_models(deck_outline)
                log_tagged_media_summary(deck_outline)
            except Exception as e:
                logger.error(f"Error parsing outline: {e}", exc_info=True)
                # Try to get deck_uuid from request if possible
                import uuid as uuid_module
                temp_deck_uuid = str(uuid_module.uuid4())
                if hasattr(request, 'outline') and isinstance(request.outline, dict):
                    temp_deck_uuid = request.outline.get('id', temp_deck_uuid)
                
                # DON'T send deck_created for validation errors - deck won't be created
                # Just send the error with deck_id for potential navigation
                yield _sse({
                    'type': 'error', 
                    'error': f'Invalid outline format: {str(e)}',
                    'deck_id': temp_deck_uuid,
                    'deck_url': f'/deck/{temp_deck_uuid}',
                    'validation_error': True
                })
                return
            
            # deck_uuid was already set above from outline_dict['id']
            # DO NOT reassign or validate - outline.id is the source of truth

            # Validate that deck_uuid is a valid UUID format
            try:
                # Try to parse as UUID to validate format
                uuid.UUID(deck_uuid)
                logger.info(f"[UUID_FIX] Validated deck UUID format: {deck_uuid}")
            except ValueError:
                # CRITICAL: Do NOT generate a new UUID - this breaks the frontend flow!
                # Instead, raise an error so the outline agent can fix it
                error_msg = f"Invalid UUID format in outline.id: {deck_uuid}. Outline must be created with a valid UUID."
                logger.error(f"[UUID_FIX] {error_msg}")
                yield _sse({
                    'type': 'error',
                    'error': error_msg,
                    'deck_id': deck_uuid,
                    'validation_error': True
                })
                return
            
            # CRITICAL: Check if deck already exists in database before proceeding
            from utils.supabase import get_deck
            existing_deck = get_deck(deck_uuid)
            if existing_deck:
                logger.warning(f"DECK ALREADY EXISTS - UUID: {deck_uuid}")
                existing_status = existing_deck.get('status') or {}
                logger.warning(f"  - Existing deck status: {existing_status.get('state', 'unknown')}")
                logger.warning(f"  - Existing deck created: {existing_deck.get('created_at', 'unknown')}")

                # If deck is already completed or generating, reject this request
                status_state = existing_status.get('state', '')
                if status_state in ['completed', 'generating', 'creating']:
                    # Send deck_created first for navigation
                    yield _sse({
                        'type': 'deck_created',
                        'deck_id': deck_uuid,
                        'deck_url': f'/deck/{deck_uuid}',
                        'status': 'exists',
                        'message': f'Deck already {status_state}'
                    })
                    
                    yield _sse({'type': 'error', 'error': 'DECK_ALREADY_EXISTS', 'message': f'Deck {deck_uuid} already exists and is {status_state}', 'deck_uuid': deck_uuid, 'existing_status': status_state})
                    return
            
            # Set Sentry tags after deck_uuid is defined
            sentry_sdk.set_tag("deck_uuid", deck_uuid)
            sentry_sdk.set_tag("user_id", user_id or "anonymous")
            sentry_sdk.set_context("deck_outline", {
                "title": deck_outline.title,
                "slides_count": len(deck_outline.slides),
                "model": request.model
            })
            
            # Check if deck is already being generated BEFORE creating it in database
            from agents.generation.concurrency_manager import concurrency_manager
            
            # First check if deck already exists and is completed
            existing_deck = get_deck(deck_uuid)
            if existing_deck and existing_deck.get('status') == 'completed':
                logger.warning(f"Deck {deck_uuid} already exists and is completed - rejecting duplicate request")
                # Send deck_created first for navigation
                yield _sse({
                    'type': 'deck_created',
                    'deck_id': deck_uuid,
                    'deck_url': f'/deck/{deck_uuid}',
                    'status': 'completed',
                    'message': 'Deck already completed'
                })
                
                yield _sse({'type': 'error', 'error': 'DECK_ALREADY_COMPLETED', 'message': 'This deck has already been generated. Refresh the page to see the results.', 'deck_uuid': deck_uuid})
                return
            
            logger.info(f"Checking if deck {deck_uuid} is already being generated...")
            if concurrency_manager.is_deck_generating(deck_uuid):
                logger.warning(f"Deck {deck_uuid} is already being generated - rejecting duplicate request")
                # Send deck_created first for navigation
                yield _sse({
                    'type': 'deck_created',
                    'deck_id': deck_uuid,
                    'deck_url': f'/deck/{deck_uuid}',
                    'status': 'generating',
                    'message': 'Deck is already being generated'
                })
                
                yield _sse({'type': 'error', 'error': 'DECK_ALREADY_GENERATING', 'message': 'This deck is already being generated. Please wait for it to complete.', 'deck_uuid': deck_uuid})
                return
                
            # Try to acquire deck lock
            deck_lock_acquired = await concurrency_manager.acquire_deck_lock(deck_uuid)
            if not deck_lock_acquired:
                logger.warning(f"Failed to acquire lock for deck {deck_uuid}")
                # Send deck_created first for navigation
                yield _sse({
                    'type': 'deck_created',
                    'deck_id': deck_uuid,
                    'deck_url': f'/deck/{deck_uuid}',
                    'status': 'locked',
                    'message': 'Deck generation in progress'
                })
                
                yield _sse({'type': 'error', 'error': 'DECK_GENERATION_IN_PROGRESS', 'message': 'This deck is already being generated by another process.', 'deck_uuid': deck_uuid})
                return
            
            logger.info(f"Acquired deck lock for {deck_uuid}")
            
            # Log to detect duplicate creation attempts
            logger.warning(f"DECK CREATION ATTEMPT - UUID: {deck_uuid}, Title: '{deck_outline.title}', User: {user_id or 'anonymous'}")
            
            # Build response data separately to avoid multi-line f-string issues
            response_data = {
                'type': 'deck_creation_started', 'deck_uuid': deck_uuid,
                'title': deck_outline.title, 'total_slides': len(deck_outline.slides),
                'message': f'Creating deck with new structured approach (Schema: {SCHEMA_VERSION})...'
            }
            yield _sse(response_data)
            
            # Send outline_structure event that frontend expects
            outline_structure_data = {
                'type': 'outline_structure',
                'title': deck_outline.title,
                'slideCount': len(deck_outline.slides),
                'slideTitles': [slide.title for slide in deck_outline.slides]
            }
            yield _sse(outline_structure_data)
            
            deck_data_with_outline = build_initial_deck_payload(
                deck_outline, deck_uuid
            )

            # Check if slides should be locked for free users (freemium gating)
            total_slides = len(deck_outline.slides)
            deck_data_with_outline = await add_locked_slide_info_if_needed(
                deck_data_with_outline, user_id, total_slides
            )

            start_narrative_flow_task(
                deck_outline, deck_uuid, _background_tasks
            )
            initialize_conversation_history(deck_data_with_outline, deck_outline)

            # CRITICAL: Save deck to database BEFORE sending deck_created event
            try:
                upload_deck(deck_data_with_outline, deck_uuid, user_id)
                logger.info(f"Successfully created deck {deck_uuid} in database for user {user_id or 'anonymous'}")
                
                # NOW send deck_created event - deck exists in database!
                deck_created_event = {
                    'type': 'deck_created',
                    'deck_id': deck_uuid,  # Frontend expects 'deck_id' not 'deck_uuid'
                    'deck_url': f'/deck/{deck_uuid}',
                    'status': 'pending',
                    'message': 'Deck created, starting generation...'
                }
                # Include locked_slide_info for freemium gating
                if deck_data_with_outline.get('locked_slide_info'):
                    deck_created_event['locked_slide_info'] = deck_data_with_outline['locked_slide_info']
                    logger.info(f"Including locked_slide_info in deck_created event: {deck_data_with_outline['locked_slide_info']}")
                yield _sse(deck_created_event)
                
                # Send deck_saved event to indicate DB persistence complete
                response_data = {
                    'type': 'deck_saved', 'deck_uuid': deck_uuid,
                    'message': f'Deck saved to database, starting composition...'
                }
                yield _sse(response_data)
                
            except Exception as e:
                logger.error(f"Error creating deck {deck_uuid} in database: {e}", exc_info=True)
                yield _sse({'type': 'error', 'error': f'Failed to create deck: {str(e)}'})
                # Release the lock on failure
                concurrency_manager.release_deck_lock(deck_uuid)
                return
            
            # Start composition immediately
            
            try:
                # Track completion state so we don't close the stream early
                composition_completed = False
                emitted_error = False
                slides_complete = False
                logger.info(
                    "Starting composition for deck %s with new structured approach",
                    deck_uuid,
                )

                # Track composition phase
                with sentry_sdk.start_span(op="deck.compose", description="Compose deck"):
                    # Use new compose_deck_stream with structured three-phase approach
                    async for update in compose_deck_stream(
                        deck_outline, registry, deck_uuid,
                        max_parallel=max_parallel_val, delay_between_slides=delay_val,
                        async_images=request.async_images,
                        enable_visual_analysis=None,  # Will use config default (currently False)
                        user_id=user_id  # Pass user_id for proper attribution
                    ):
                        # Detect completion signals to avoid premature stream closure
                        try:
                            utype = update.get('type')
                            if utype in ('deck_complete', 'composition_complete', 'complete'):
                                composition_completed = True
                                logger.info("Received completion event: %s", utype)
                            elif utype == 'slides_generation_complete':
                                slides_complete = True
                                logger.info("Slides generation complete, waiting for finalization...")
                            elif utype == 'progress':
                                data = update.get('data') or {}
                                phase = (data.get('phase') or update.get('phase'))
                                if phase == 'complete':
                                    composition_completed = True
                        except Exception:
                            # Ignore malformed update shapes
                            pass
                        # Also forward agent/tool/artifact events in the same stream
                        try:
                            if update.get('type') in ('agent_event', 'tool_call', 'tool_result', 'artifact'):
                                pass  # already structured; forward as-is
                        except Exception:
                            pass
                        yield _sse(update)
                        await asyncio.sleep(0.01)

                logger.info(
                    "compose_deck_stream loop exited. composition_completed=%s, slides_complete=%s",
                    composition_completed,
                    slides_complete,
                )

                # CRITICAL: Release the deck lock BEFORE sending completion event
                # This prevents 409 errors when frontend tries to save after receiving completion
                if 'deck_lock_acquired' in locals() and deck_lock_acquired:
                    from agents.generation.concurrency_manager import concurrency_manager
                    concurrency_manager.release_deck_lock(deck_uuid)
                    deck_lock_acquired = False  # Mark as released so finally block doesn't double-release
                    logger.info("Released deck lock for %s (before completion event)", deck_uuid)

                # Send a final summary event without duplicating the 'deck_complete' event
                response_data = {
                    'type': 'composition_complete',
                    'deck_uuid': deck_uuid,
                    'version': SCHEMA_VERSION
                }
                yield _sse(response_data)
                composition_completed = True
                logger.info("Sent composition_complete event for deck %s", deck_uuid)
                
            except asyncio.CancelledError:
                # Client likely disconnected or server is shutting down; just log and exit quietly
                logger.info(f"Client disconnected during deck composition for {deck_uuid}; cancelling stream")
                return
            except Exception as e:
                sentry_sdk.capture_exception(e)
                logger.error(f"Error during deck composition for {deck_uuid}: {e}", exc_info=True)
                error_deck = get_deck(deck_uuid)
                if error_deck:
                    error_deck['status'] = {
                        'state': 'error', 'message': f'Composition failed: {str(e)}',
                        'error': str(e), 'errorAt': datetime.now(timezone.utc).isoformat()
                    }
                    try: upload_deck(error_deck, deck_uuid)
                    except Exception as db_e: logger.error(f"Failed to update deck status to error for {deck_uuid}: {db_e}")
                
                yield _sse({'type': 'error', 'error': f'Composition failed: {str(e)}'})
                emitted_error = True
            
            finally:
                logger.info("Entering finally block for deck %s", deck_uuid)
                # Always release the deck lock FIRST before sending any events
                # This prevents 409 errors when frontend tries to save after receiving events
                lock_was_held = 'deck_lock_acquired' in locals() and deck_lock_acquired
                if lock_was_held:
                    from agents.generation.concurrency_manager import concurrency_manager
                    concurrency_manager.release_deck_lock(deck_uuid)
                    deck_lock_acquired = False
                    logger.info("Released deck lock for %s (in finally)", deck_uuid)
                # If we reached here without a completion or error, emit an explicit incomplete signal
                if not emitted_error:
                    try:
                        if not locals().get('composition_completed', False):
                            logger.warning(
                                "Stream ended before composition completed for deck %s",
                                deck_uuid,
                            )
                            yield _sse({'type': 'error', 'error': 'stream_incomplete', 'message': 'Stream ended before composition completed', 'deck_uuid': deck_uuid})
                            # Also send a fallback composition_complete so frontend can proceed
                            yield _sse({
                                'type': 'composition_complete',
                                'deck_uuid': deck_uuid,
                                'version': SCHEMA_VERSION,
                                'warning': 'Finalization may be incomplete'
                            })
                            logger.warning(
                                "Sent fallback composition_complete for deck %s",
                                deck_uuid,
                            )
                    except Exception as e:
                        logger.warning("Error in finally block: %s", e)
                        pass
                # Emit an explicit end-of-stream marker to close SSE cleanly
                try:
                    yield _sse({'type': 'end', 'message': 'Stream complete'})
                    logger.info("Stream ended for deck %s", deck_uuid)
                except Exception:
                    # If client disconnected, just return
                    logger.info("Client disconnected, cannot send end event")
                    return
    
    return generate() 


class ReviewImagesRequest(BaseModel):
    """Request for reviewing and assigning images after async search"""
    deck_uuid: str = Field(description="The deck UUID to review images for")
    images_by_slide: Dict[str, List[Dict[str, Any]]] = Field(description="Images collected by slide ID")


def stream_image_review(request: ReviewImagesRequest, registry: ComponentRegistry) -> AsyncIterator[str]:
    """
    Stream the review and assignment of images to slides.
    This is called after async image search completes.
    
    Args:
        request: The request containing deck UUID and collected images
        registry: The component registry
        
    Yields:
        Server-sent event formatted strings with progress updates
    """
    
    async def generate():
        sequence = 0

        def _sse(event: Dict[str, Any]) -> bytes:
            nonlocal sequence
            sequence += 1
            event.setdefault("sequence", sequence)
            event.setdefault("deck_uuid", request.deck_uuid)
            event.setdefault("deck_id", request.deck_uuid)
            try:
                return sse_encode(event)
            except Exception:
                return sse_encode({"type": "error", "error": "serialization_failed"})
        try:
            # TODO: Implement image review in refactored version
            # The old DeckComposerV2 had review_and_assign_images method
            # This needs to be implemented in the new architecture if needed
            yield _sse({'type': 'error', 'error': 'Image review not implemented in refactored version'})
                
        except Exception as e:
            logger.error(f"Error during image review for {request.deck_uuid}: {e}", exc_info=True)
            yield _sse({'type': 'error', 'error': f'Image review failed: {str(e)}'})
    
    return generate() 
