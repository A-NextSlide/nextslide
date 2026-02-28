"""
Streaming endpoint for composing slides from an existing deck outline.
This endpoint assumes the deck already exists in the database.
"""

from typing import Optional, AsyncIterator, Dict, Any
import asyncio
import logging

from pydantic import BaseModel, Field
from models.requests import DeckOutline # DeckComposeRequest is not used here.

# Import the new deck composer and its relevant components
from agents.generation.deck_composer import compose_deck_stream, SCHEMA_VERSION
from agents.generation.concurrency_manager import concurrency_manager
from agents.domain.models import SlideStatus
from agents.config import DELAY_BETWEEN_SLIDES, CONTINUE_GENERATION_ON_DISCONNECT
from models.registry import ComponentRegistry
from services.outline.context_store import merge_outline_context_into_notes
from utils.supabase import get_deck, upload_deck
from agents.generation.events import sse_encode

logger = logging.getLogger(__name__)


async def _fire_thumbnail_render(deck_uuid: str) -> None:
    """Fire-and-forget thumbnail rendering. Never raises."""
    try:
        from services.thumbnail_dispatch import trigger_thumbnail_render
        await trigger_thumbnail_render(deck_uuid)
    except Exception as e:
        logger.warning("Thumbnail render failed (non-fatal) for %s: %s", deck_uuid, e)


def _hydrate_outline_notes_from_existing_deck(
    deck_outline: DeckOutline,
    existing_deck: Optional[Dict[str, Any]],
) -> None:
    """Restore grounding context into outline.notes from the persisted deck outline."""
    if not isinstance(existing_deck, dict):
        return

    persisted_outline = existing_deck.get("outline")
    if not isinstance(persisted_outline, dict):
        return

    incoming_outline = (
        deck_outline.model_dump()
        if hasattr(deck_outline, "model_dump")
        else {}
    )
    if not isinstance(incoming_outline, dict):
        incoming_outline = {}

    merged_outline = dict(persisted_outline)
    merged_outline.update(incoming_outline)

    persisted_notes = persisted_outline.get("notes")
    if not isinstance(persisted_notes, dict):
        persisted_notes = existing_deck.get("notes") if isinstance(existing_deck.get("notes"), dict) else {}
    incoming_notes = incoming_outline.get("notes") if isinstance(incoming_outline.get("notes"), dict) else {}
    merged_notes: Dict[str, Any] = {}
    if persisted_notes:
        merged_notes.update(persisted_notes)
    if incoming_notes:
        merged_notes.update(incoming_notes)

    user_notes = ""
    existing_data = existing_deck.get("data")
    if isinstance(existing_data, dict):
        user_notes = str(existing_data.get("user_notes") or "").strip()
    if user_notes:
        merged_notes.setdefault("user_notes", user_notes)

    if merged_notes:
        merged_outline["notes"] = merged_notes

    merge_outline_context_into_notes(
        merged_outline,
        user_notes=user_notes or None,
    )
    normalized_notes = merged_outline.get("notes")
    if isinstance(normalized_notes, dict):
        deck_outline.notes = normalized_notes

class StreamingDeckComposeRequest(BaseModel):
    deck_id: str = Field(description="The UUID of the deck to compose")
    outline: DeckOutline = Field(description="The deck outline containing slide information")
    force_restart: bool = Field(default=False, description="Force restart composition from beginning")
    delay_between_slides: float = Field(default=DELAY_BETWEEN_SLIDES, description="Delay between starting each slide")
    async_images: bool = Field(default=True, description="If True, images are searched in background and user selects them later (default: True = placeholders)")
    prefetch_images: bool = Field(default=False, description="If True with async_images, pre-fetches all images before starting slides")

def create_deck_compose_stream(
    request: StreamingDeckComposeRequest,
    registry: ComponentRegistry,
    user_id: Optional[str] = None
) -> AsyncIterator[str]:
    """
    Create a streaming response for deck composition using LangGraph workflow.
    """
    deck_outline = request.outline
    deck_id = request.deck_id
    
    logger.info(f"Starting deck composition for deck {deck_id} (Schema: {SCHEMA_VERSION})")
    logger.info(f"Force restart: {request.force_restart}")
    
    # Debug log taggedMedia
    logger.info(f"[COMPOSE_STREAM] Deck outline: {deck_outline.title}")
    
    # Debug log stylePreferences
    if hasattr(deck_outline, 'stylePreferences'):
        logger.info(f"[COMPOSE_STREAM] StylePreferences present: {deck_outline.stylePreferences is not None}")
        if deck_outline.stylePreferences:
            style_prefs = deck_outline.stylePreferences
            ref_images = getattr(style_prefs, 'referenceImages', None)
            ref_count = len(ref_images) if isinstance(ref_images, list) else 0
            logger.info(
                "[COMPOSE_STREAM] StylePreferences: vibe=%s, font=%s, brand=%s, refs=%s",
                getattr(style_prefs, 'vibeContext', 'NOT SET'),
                getattr(style_prefs, 'font', None),
                getattr(style_prefs, 'brandDomain', None) or getattr(style_prefs, 'brandName', None),
                ref_count
            )
    else:
        logger.info("[COMPOSE_STREAM] No stylePreferences attribute in outline")
    
    for i, slide in enumerate(deck_outline.slides):
        tm_count = len(slide.taggedMedia) if slide.taggedMedia else 0
        logger.info(f"[COMPOSE_STREAM] Slide {i+1} '{slide.title}' has {tm_count} taggedMedia items")
        if tm_count > 0 and slide.taggedMedia:
            for j, media in enumerate(slide.taggedMedia[:2]):  # First 2 media items
                media_dict = media.model_dump() if hasattr(media, 'model_dump') else media
                logger.info(f"[COMPOSE_STREAM]   Media {j+1}: {media_dict.get('filename', 'unknown')} - URL: {media_dict.get('previewUrl', 'none')[:100]}")
    
    # Get parallel and delay settings
    delay_val = request.delay_between_slides
    
    logger.info(f"Settings: Slide Delay={delay_val}s")
    
    async def generate():
        sequence = 0

        def _sse(event: Dict[str, Any]) -> bytes:
            nonlocal sequence
            sequence += 1
            event.setdefault("sequence", sequence)
            event.setdefault("deck_uuid", deck_id)
            event.setdefault("deck_id", deck_id)
            try:
                return sse_encode(event)
            except Exception:
                return sse_encode({"type": "error", "error": "serialization_failed"})
        cancelled = False
        deck_lock_acquired = False
        stream_end_sent = False
        composition_completed = False
        try:
            existing_deck = get_deck(deck_id)
            if not existing_deck:
                # Deck doesn't exist yet (common in outline agent mode)
                # Create it now with the outline and basic structure
                logger.info(f"[COMPOSE_STREAM] Deck {deck_id} not found in database, creating it now...")

                # Build initial deck structure from outline
                initial_deck_data = {
                    "name": deck_outline.title or "Untitled Presentation",
                    "slides": [],  # Will be populated during generation
                    "size": {"width": 1920, "height": 1080},
                    "status": {
                        "state": "creating",
                        "progress": 0,
                        "message": "Starting deck composition...",
                        "currentSlide": 0,
                        "totalSlides": len(deck_outline.slides)
                    },
                    "outline": deck_outline.model_dump() if hasattr(deck_outline, 'model_dump') else deck_outline
                }

                # Upload the initial deck
                try:
                    upload_deck(initial_deck_data, deck_id, user_id)
                    logger.info(f"[COMPOSE_STREAM] Successfully created deck {deck_id} in database")
                    existing_deck = get_deck(deck_id)  # Refresh to get the created deck
                except Exception as e:
                    logger.error(f"[COMPOSE_STREAM] Failed to create deck {deck_id}: {e}")
                    yield _sse({'type': 'error', 'error': f'Failed to create deck: {str(e)}'})
                    return

            _hydrate_outline_notes_from_existing_deck(deck_outline, existing_deck)
            
            if not request.force_restart:
                raw_status = existing_deck.get('status')
                if isinstance(raw_status, dict):
                    status = raw_status
                elif isinstance(raw_status, str):
                    status = {'state': raw_status}
                else:
                    status = {}
                if status.get('state') == 'completed':
                    slides = existing_deck.get('slides', [])
                    # Check if all slides are genuinely completed based on new status system
                    if all(s.get('status') == SlideStatus.COMPLETED for s in slides):
                        yield _sse({'type': 'already_complete', 'message': 'Deck composition already completed and all slides processed.'})
                        return
                elif status.get('state') == 'generating':
                    slides = existing_deck.get('slides', [])
                    completed_count = sum(1 for s in slides if s.get('status') == SlideStatus.COMPLETED)
                    yield _sse({'type': 'resuming', 'message': f'Resuming with {completed_count}/{len(slides)} slides completed'})
            
            yield _sse({'type': 'started', 'message': f'Starting deck composition with schema {SCHEMA_VERSION}'})

            # Prevent duplicate composition by acquiring the same global deck lock used by deck creation
            lock = await concurrency_manager.acquire_deck_lock(deck_id)
            if not lock:
                logger.warning(f"Failed to acquire lock for deck {deck_id} in compose-stream")
                yield _sse({'type': 'error', 'error': 'DECK_GENERATION_IN_PROGRESS', 'message': 'This deck is already being generated by another process.', 'deck_uuid': deck_id})
                return
            deck_lock_acquired = True
            
            # Send outline_structure event that frontend expects
            outline_structure_data = {
                'type': 'outline_structure',
                'title': deck_outline.title,
                'slideCount': len(deck_outline.slides),
                'slideTitles': [slide.title for slide in deck_outline.slides]
            }
            yield _sse(outline_structure_data)
            
            logger.info(
                "Calling compose_deck_stream deck_id=%s async_images=%s delay_between_slides=%s",
                deck_id,
                request.async_images,
                delay_val,
            )
            
            # Use new compose_deck_stream with structured three-phase approach
            async for update in compose_deck_stream(
                deck_outline, registry, deck_id,
                delay_between_slides=delay_val,
                async_images=request.async_images,
                prefetch_images=request.prefetch_images,
                user_id=user_id  # Pass user_id for deck attribution
            ):
                if update.get('type') in ('deck_complete', 'composition_complete', 'complete'):
                    composition_completed = True

                # Log image-related updates
                if 'image' in update.get('type', '').lower():
                    logger.info(
                        "SENDING IMAGE UPDATE TO FRONTEND: %s - %s",
                        update.get("type"),
                        update.get("message", ""),
                    )
                    if update.get('type') == 'slide_images_found':
                        data = update.get('data', {})
                        logger.info(
                            "Image details: slide_index=%s, images_count=%s",
                            data.get("slide_index"),
                            data.get("images_count"),
                        )
                
                yield _sse(update)
                await asyncio.sleep(0.01)  # Small delay to prevent overwhelming the client
                
            # Emit completion if upstream stream did not already provide one.
            if not composition_completed:
                response_data = {
                    'type': 'composition_complete',
                    'deck_id': deck_id,
                    'message': 'Deck composition completed successfully!',
                    'version': SCHEMA_VERSION
                }
                yield _sse(response_data)

            # Fire-and-forget thumbnail render
            asyncio.create_task(_fire_thumbnail_render(deck_id))

        except asyncio.CancelledError:
            cancelled = True
            logger.info("Client disconnected during deck compose stream; cancelling gracefully")
            # When Modal is enabled, the container persists independently — no need
            # to restart generation locally, which would dispatch a duplicate container.
            from agents.config import USE_MODAL
            if CONTINUE_GENERATION_ON_DISCONNECT and not USE_MODAL:
                async def _continue_in_background():
                    try:
                        logger.info(f"[COMPOSE_STREAM] Continuing generation in background for deck {deck_id}")
                        async for _ in compose_deck_stream(
                            deck_outline, registry, deck_id,
                            delay_between_slides=delay_val,
                            async_images=request.async_images,
                            prefetch_images=request.prefetch_images,
                            user_id=user_id
                        ):
                            # We intentionally discard updates
                            await asyncio.sleep(0)
                        logger.info(f"[COMPOSE_STREAM] Background generation completed for deck {deck_id}")
                    except Exception as e:
                        logger.error(f"[COMPOSE_STREAM] Background generation failed for deck {deck_id}: {e}")
                try:
                    asyncio.create_task(_continue_in_background())
                except Exception:
                    pass
            elif USE_MODAL:
                logger.info(f"[COMPOSE_STREAM] Modal container persists for deck {deck_id}; skipping local background restart")
            return
        except Exception as e:
            logger.error(f"Error in deck composition stream: {e}", exc_info=True)
            yield _sse({'type': 'error', 'error': str(e)})
        finally:
            # Always release deck lock if acquired
            try:
                if deck_lock_acquired:
                    concurrency_manager.release_deck_lock(deck_id)
                    deck_lock_acquired = False
                    logger.info(f"Released deck lock for {deck_id} (compose-stream)")
            except Exception:
                pass

            # Ensure stream termination marker in any case (single emission only).
            try:
                if not cancelled and not stream_end_sent:
                    yield _sse({'type': 'end', 'message': 'Stream complete'})
                    stream_end_sent = True
            except Exception:
                return
    
    return generate() 
