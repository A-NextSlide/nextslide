"""
Streaming API endpoint for creating and composing a deck from an outline.

This endpoint handles the entire flow:
1. Creates the deck in the database
2. Streams composition progress using the new structured approach
"""

import asyncio
import json
import logging
import uuid
from typing import Dict, Any, AsyncIterator, Optional, List
from datetime import datetime, timezone

from pydantic import BaseModel, Field
from models.requests import DeckOutline
from models.registry import ComponentRegistry
from models.deck import DeckBase
from utils.supabase import upload_deck, get_deck

# Import new deck composition method
from agents.generation.deck_composer import compose_deck_stream, SCHEMA_VERSION
from agents.domain.models import SlideStatus
from agents.config import COMPOSER_MODEL, MAX_PARALLEL_SLIDES, DELAY_BETWEEN_SLIDES

import sentry_sdk
from sentry_sdk import start_transaction, start_span

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
    async_images: bool = Field(True, description="If True, images are searched asynchronously without blocking composition")


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
    print(f"[TOP LEVEL] stream_deck_creation called")
    
    # Get settings from request
    # Force parallelism to 8 as requested
    max_parallel_val = 8
    delay_val = request.delay_between_slides

    logger.info(f"Starting deck creation (Schema: {SCHEMA_VERSION})")
    logger.info(f"Settings: Max Parallel={max_parallel_val}, Slide Delay={delay_val}s")
    
    # Extract user_id if available
    user_id = getattr(request, '_user_id', None)
    if user_id:
        logger.info(f"Creating deck for authenticated user: {user_id}")
    
    async def generate():
        # Emit bytes for SSE and always close with an explicit end marker
        def _sse(event: Dict[str, Any]) -> bytes:
            try:
                return f"data: {json.dumps(event)}\n\n".encode("utf-8")
            except Exception:
                return b"data: {\"type\": \"error\", \"error\": \"serialization_failed\"}\n\n"
        # Start Sentry transaction for deck creation
        print(f"[DEBUG] stream_deck_creation generate() called")
        logger.info(f"[DEBUG] stream_deck_creation generate() called")
        # Proactively open the SSE stream for proxies and clients
        try:
            yield _sse({'type': 'connection_established', 'message': 'SSE stream open'})
        except Exception:
            # If the client already disconnected, stop early
            return
        
        with sentry_sdk.start_transaction(op="deck.create", name="Create Deck from Outline") as transaction:
            try:
                # Initialize outline_dict here where it's used
                outline_dict = request.outline
                if 'id' not in outline_dict: outline_dict['id'] = str(uuid.uuid4())
                if 'title' not in outline_dict: outline_dict['title'] = 'Untitled Presentation'
                if 'stylePreferences' not in outline_dict and request.stylePreferences:
                    outline_dict['stylePreferences'] = request.stylePreferences
                
                for i, slide in enumerate(outline_dict.get('slides', [])):
                    if 'id' not in slide: slide['id'] = f"slide-{outline_dict['id']}-{i}"
                    # Ensure other essential slide fields have defaults if missing
                    slide.setdefault('title', f"Slide {i + 1}")
                    slide.setdefault('content', "")
                    slide.setdefault('uploadedMedia', None)
                    slide.setdefault('extracted_data', None)
                    slide.setdefault('speaker_notes', "")
                    slide.setdefault('media_items', [])
                
                deck_outline = DeckOutline(**outline_dict)
                
                # Debug logging for taggedMedia
                logger.info(f"[DECK_CREATE] Parsed deck outline: {deck_outline.title}")
                
                # Fix "Untitled Deck" issue
                logger.info(f"[DECK_TITLE_DEBUG] Title from outline: '{deck_outline.title}'")
                if deck_outline.title == "Untitled Deck" or not deck_outline.title.strip():
                    logger.warning(f"[DECK_TITLE_DEBUG] Deck is using default/empty title: '{deck_outline.title}'")
                    
                    # Try to generate a better title from available data
                    new_title = None
                    
                    # Option 1: Use the first slide title
                    if deck_outline.slides and len(deck_outline.slides) > 0:
                        first_slide_title = deck_outline.slides[0].title
                        if first_slide_title and first_slide_title.strip() and first_slide_title != "Untitled Slide":
                            new_title = first_slide_title
                            logger.info(f"[DECK_TITLE_DEBUG] Using first slide title: '{new_title}'")
                    
                    # Option 2: Use context from style preferences if available
                    if not new_title and hasattr(deck_outline, 'stylePreferences') and deck_outline.stylePreferences:
                        if hasattr(deck_outline.stylePreferences, 'vibeContext') and deck_outline.stylePreferences.vibeContext:
                            # Extract a title from the vibe context (first sentence or phrase)
                            vibe = deck_outline.stylePreferences.vibeContext
                            if len(vibe) > 50:
                                # Take first 50 chars and try to end at a word boundary
                                new_title = vibe[:50].rsplit(' ', 1)[0] + "..."
                            else:
                                new_title = vibe
                            logger.info(f"[DECK_TITLE_DEBUG] Using vibe context as title: '{new_title}'")
                    
                    # Option 3: Generate from date/time
                    if not new_title:
                        new_title = f"Presentation {datetime.now().strftime('%B %d, %Y')}"
                        logger.info(f"[DECK_TITLE_DEBUG] Using date-based title: '{new_title}'")
                    
                    # Update the deck outline title
                    deck_outline.title = new_title
                
                # Check if notes are present in the outline
                if hasattr(deck_outline, 'notes') and deck_outline.notes:
                    logger.info(f"[DECK_CREATE] ✅ Outline has narrative flow notes")
                else:
                    logger.warning(f"[DECK_CREATE] ⚠️ Outline is missing narrative flow notes")
                
                for i, slide in enumerate(deck_outline.slides):
                    tm_count = len(slide.taggedMedia) if slide.taggedMedia else 0
                    logger.info(f"[DECK_CREATE] Slide {i+1} '{slide.title}' has {tm_count} taggedMedia items")
                    if tm_count > 0 and slide.taggedMedia:
                        for j, media in enumerate(slide.taggedMedia[:2]):  # First 2 media items
                            media_dict = media.model_dump() if hasattr(media, 'model_dump') else media
                            logger.info(f"[DECK_CREATE]   Media {j+1}: {media_dict.get('filename', 'unknown')} - URL: {media_dict.get('previewUrl', 'none')[:100]}")
                            
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
            
            deck_uuid = deck_outline.id
            
            # Validate that deck_uuid is a valid UUID format
            try:
                # Try to parse as UUID to validate format
                uuid.UUID(deck_uuid)
            except ValueError:
                # If deck_uuid is not a valid UUID (e.g., "outline-1234567890"), generate a new one
                logger.warning(f"Invalid UUID format in outline.id: {deck_uuid}, generating new UUID")
                deck_uuid = str(uuid.uuid4())
                logger.info(f"Generated new deck UUID: {deck_uuid}")
            
            # CRITICAL: Check if deck already exists in database before proceeding
            from utils.supabase import get_deck
            existing_deck = get_deck(deck_uuid)
            if existing_deck:
                logger.warning(f"🚨 DECK ALREADY EXISTS - UUID: {deck_uuid}")
                logger.warning(f"  - Existing deck status: {existing_deck.get('status', {}).get('state', 'unknown')}")
                logger.warning(f"  - Existing deck created: {existing_deck.get('created_at', 'unknown')}")
                
                # If deck is already completed or generating, reject this request
                status_state = existing_deck.get('status', {}).get('state', '')
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
                logger.warning(f"❌ Deck {deck_uuid} already exists and is completed - rejecting duplicate request")
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
            
            logger.info(f"🔍 Checking if deck {deck_uuid} is already being generated...")
            if concurrency_manager.is_deck_generating(deck_uuid):
                logger.warning(f"❌ Deck {deck_uuid} is already being generated - rejecting duplicate request")
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
                logger.warning(f"❌ Failed to acquire lock for deck {deck_uuid}")
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
            
            logger.info(f"✅ Acquired deck lock for {deck_uuid}")
            
            # Log to detect duplicate creation attempts
            logger.warning(f"🔍 DECK CREATION ATTEMPT - UUID: {deck_uuid}, Title: '{deck_outline.title}', User: {user_id or 'anonymous'}")
            
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
            
            initial_slides = [
                {
                    "id": so.id, 
                    "title": so.title, 
                    "components": [], 
                    "status": SlideStatus.PENDING,
                    "extractedData": so.extractedData.model_dump() if so.extractedData else None
                }
                for so in deck_outline.slides
            ]
            
            initial_deck_status = {
                "state": "creating", 
                "currentSlide": 0, 
                "totalSlides": len(deck_outline.slides),
                "message": "Deck structure created, preparing for composition.",
                "startedAt": datetime.now(timezone.utc).isoformat(), 
                "progress": 5,
                "phase": "initialization"
            }
            initial_deck = DeckBase(
                uuid=deck_uuid, name=deck_outline.title, slides=initial_slides,
                size={"width": 1920, "height": 1080}, status=initial_deck_status
            )
            
            # Add the outline to the deck data before uploading
            deck_data_with_outline = initial_deck.model_dump()
            deck_data_with_outline["outline"] = deck_outline.model_dump()
            
            # Include notes (narrative flow) if present in the outline
            outline_dict = deck_outline.model_dump()
            if 'notes' in outline_dict and outline_dict['notes']:
                deck_data_with_outline["notes"] = outline_dict['notes']
                logger.info(f"Including narrative flow notes in deck creation")
                logger.info(f"Notes data: {json.dumps(outline_dict['notes'])[:200]}...")  # Log first 200 chars
            else:
                logger.warning(f"No notes found in outline. Outline keys: {list(outline_dict.keys())}")
                if 'notes' in outline_dict:
                    logger.warning(f"Notes field exists but is empty/None: {outline_dict['notes']}")

            # If an embedded theme exists in outline notes or stylePreferences, persist it now
            # so the composer can reuse it and skip re-generating via ThemeDirector
            try:
                provided_theme = None
                # 1) Prefer outline.notes.theme
                if isinstance(outline_dict.get('notes'), dict):
                    provided_theme = outline_dict['notes'].get('theme') or outline_dict['notes'].get('Theme')
                # 2) Fallback to stylePreferences.theme (supports dict or pydantic model)
                if not provided_theme and hasattr(deck_outline, 'stylePreferences') and deck_outline.stylePreferences:
                    sp = deck_outline.stylePreferences
                    if isinstance(sp, dict):
                        provided_theme = sp.get('theme')
                    else:
                        provided_theme = getattr(sp, 'theme', None)
                if isinstance(provided_theme, dict) and provided_theme:
                    deck_data_with_outline['theme'] = provided_theme
                    logger.info("[DECK_CREATE] ✅ Embedded theme found in outline and will be persisted to deck data")
                    # Also mirror into data field for immediate availability
                    try:
                        deck_data_with_outline.setdefault('data', {})
                        if isinstance(deck_data_with_outline['data'], dict):
                            deck_data_with_outline['data']['theme'] = provided_theme
                    except Exception:
                        pass
                else:
                    logger.info("[DECK_CREATE] No embedded theme found in outline to persist")
            except Exception as _embed_err:
                logger.warning(f"[DECK_CREATE] Skipped embedded theme persistence due to error: {_embed_err}")
            
            # ALWAYS generate narrative flow in background
            # This ensures it's created even when users interrupt outline generation
            print(f"[NARRATIVE FLOW] Starting background generation for deck {deck_uuid}")
            logger.info(f"[NARRATIVE FLOW] Starting background generation for deck {deck_uuid}")
            logger.info(f"[NARRATIVE FLOW] Outline title: {deck_outline.title}")
            logger.info(f"[NARRATIVE FLOW] Number of slides: {len(deck_outline.slides)}")
            
            # Start narrative flow generation immediately in background
            async def generate_and_save_narrative_flow_background():
                """Generate narrative flow in background and update deck when ready"""
                print(f"[NARRATIVE FLOW DEBUG] Function called for deck {deck_uuid}")
                logger.info(f"[NARRATIVE FLOW DEBUG] Function called for deck {deck_uuid}")
                await asyncio.sleep(0.1)  # Small delay to ensure deck is created
                
                try:
                    logger.info(f"[NARRATIVE FLOW DEBUG] Starting import and initialization")
                    from services.narrative_flow_analyzer import NarrativeFlowAnalyzer
                    flow_analyzer = NarrativeFlowAnalyzer()
                    logger.info(f"[NARRATIVE FLOW DEBUG] NarrativeFlowAnalyzer initialized")
                    
                    # Create outline dict for analysis
                    analysis_outline = {
                        "id": deck_outline.id,
                        "title": deck_outline.title,
                        "slides": [
                            {
                                "id": slide.id,
                                "title": slide.title,
                                "content": slide.content,
                                "speaker_notes": getattr(slide, 'speaker_notes', '')
                            }
                            for slide in deck_outline.slides
                        ]
                    }
                    
                    logger.info(f"[NARRATIVE FLOW] Generating narrative flow for {len(analysis_outline['slides'])} slides...")
                    
                    # Generate narrative flow
                    narrative_flow = await flow_analyzer.analyze_narrative_flow(
                        analysis_outline,
                        context=deck_outline.title  # Use title as context
                    )
                    
                    if narrative_flow:
                        logger.info(f"[NARRATIVE FLOW] Generation successful, saving to deck {deck_uuid}")
                        
                        # Save to deck immediately
                        from utils.supabase import update_deck_notes
                        
                        # Try multiple times to ensure deck exists
                        for attempt in range(3):
                            success = update_deck_notes(deck_uuid, narrative_flow.model_dump())
                            if success:
                                logger.info(f"[NARRATIVE FLOW] Successfully saved narrative flow for deck {deck_uuid} on attempt {attempt + 1}")
                                return narrative_flow
                            else:
                                logger.warning(f"[NARRATIVE FLOW] Failed to save on attempt {attempt + 1}, retrying in 2 seconds...")
                                await asyncio.sleep(2)
                        
                        logger.error(f"[NARRATIVE FLOW] Failed to save after 3 attempts for deck {deck_uuid}")
                    else:
                        logger.warning(f"[NARRATIVE FLOW] Generation returned None for deck {deck_uuid}")
                    
                    return None
                except Exception as e:
                    logger.error(f"[NARRATIVE FLOW] Failed to generate narrative flow for deck {deck_uuid}: {e}", exc_info=True)
                    return None
            
            # Start the background task immediately
            narrative_flow_task = asyncio.create_task(generate_and_save_narrative_flow_background())
            # Keep a reference to prevent garbage collection
            _background_tasks.add(narrative_flow_task)
            
            # Also ensure it runs even if we don't await it
            def task_done_callback(task):
                try:
                    result = task.result()
                    if result:
                        logger.info(f"[NARRATIVE FLOW] Background task completed successfully for deck {deck_uuid}")
                    else:
                        logger.warning(f"[NARRATIVE FLOW] Background task completed but returned None for deck {deck_uuid}")
                except Exception as e:
                    logger.error(f"[NARRATIVE FLOW] Background task failed for deck {deck_uuid}: {e}")
            
            narrative_flow_task.add_done_callback(task_done_callback)
            logger.info(f"[NARRATIVE FLOW] Background generation task started and tracked for deck {deck_uuid}")
            
            # CRITICAL: Save deck to database BEFORE sending deck_created event
            try:
                upload_deck(deck_data_with_outline, deck_uuid, user_id)
                logger.info(f"Successfully created deck {deck_uuid} in database for user {user_id or 'anonymous'}")
                
                # NOW send deck_created event - deck exists in database!
                yield _sse({
                    'type': 'deck_created',
                    'deck_id': deck_uuid,  # Frontend expects 'deck_id' not 'deck_uuid'
                    'deck_url': f'/deck/{deck_uuid}',
                    'status': 'pending',
                    'message': 'Deck created, starting generation...'
                })
                
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
                print(f"\n🟡🟡🟡 [API] About to start composition for deck {deck_uuid}")
                logger.info(f"Starting composition for deck {deck_uuid} with new structured approach")
                
                # Track composition phase
                with sentry_sdk.start_span(op="deck.compose", description="Compose deck"):
                    # Use new compose_deck_stream with structured three-phase approach
                    print(f"🟡🟡🟡 [API] Calling compose_deck_stream")
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
                    
                # Send a final summary event without duplicating the 'deck_complete' event
                response_data = {
                    'type': 'composition_complete',
                    'deck_uuid': deck_uuid,
                    'version': SCHEMA_VERSION
                }
                yield _sse(response_data)
                composition_completed = True
                
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
                # Always release the deck lock
                if 'deck_lock_acquired' in locals() and deck_lock_acquired:
                    from agents.generation.concurrency_manager import concurrency_manager
                    concurrency_manager.release_deck_lock(deck_uuid)
                    logger.info(f"✅ Released deck lock for {deck_uuid}")
                # If we reached here without a completion or error, emit an explicit incomplete signal
                if not emitted_error:
                    try:
                        if not locals().get('composition_completed', False):
                            yield _sse({'type': 'error', 'error': 'stream_incomplete', 'message': 'Stream ended before composition completed', 'deck_uuid': deck_uuid})
                    except Exception:
                        pass
                # Emit an explicit end-of-stream marker to close SSE cleanly
                try:
                    yield _sse({'type': 'end', 'message': 'Stream complete'})
                except Exception:
                    # If client disconnected, just return
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
        try:
            # TODO: Implement image review in refactored version
            # The old DeckComposerV2 had review_and_assign_images method
            # This needs to be implemented in the new architecture if needed
            yield f"data: {json.dumps({'type': 'error', 'error': 'Image review not implemented in refactored version'})}\n\n"
                
        except Exception as e:
            logger.error(f"Error during image review for {request.deck_uuid}: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': f'Image review failed: {str(e)}'})}\n\n"
    
    return generate() 