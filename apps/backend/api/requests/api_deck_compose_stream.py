"""
Streaming endpoint for composing slides from an existing deck outline.
This endpoint assumes the deck already exists in the database.
"""

from typing import Optional, AsyncIterator, Dict, Any
import asyncio
import json
import logging
from uuid import uuid4

from pydantic import BaseModel, Field
from models.requests import DeckOutline # DeckComposeRequest is not used here.

# Import the new deck composer and its relevant components
from agents.generation.deck_composer import compose_deck_stream, SCHEMA_VERSION
from agents.generation.concurrency_manager import concurrency_manager
from agents.domain.models import SlideStatus
from agents.config import DELAY_BETWEEN_SLIDES, CONTINUE_GENERATION_ON_DISCONNECT
from models.registry import ComponentRegistry
from utils.supabase import get_deck, upload_deck
from fastapi import Request

logger = logging.getLogger(__name__)

class StreamingDeckComposeRequest(BaseModel):
    deck_id: str = Field(description="The UUID of the deck to compose")
    outline: DeckOutline = Field(description="The deck outline containing slide information")
    force_restart: bool = Field(default=False, description="Force restart composition from beginning")
    delay_between_slides: float = Field(default=DELAY_BETWEEN_SLIDES, description="Delay between starting each slide")
    async_images: bool = Field(default=True, description="If True, images are searched in background and user selects them later")
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
            logger.info(f"[COMPOSE_STREAM] VibeContext: {getattr(deck_outline.stylePreferences, 'vibeContext', 'NOT SET')}")
            logger.info(f"[COMPOSE_STREAM] Full stylePreferences: {deck_outline.stylePreferences}")
    else:
        logger.info(f"[COMPOSE_STREAM] ⚠️ NO stylePreferences attribute in outline!")
    
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
        # Helper to format Server-Sent Events as bytes (avoids ASGI encoding edge cases)
        def _sse(event: Dict[str, Any]) -> bytes:
            try:
                return f"data: {json.dumps(event)}\n\n".encode("utf-8")
            except Exception:
                # Fallback to a minimal error envelope
                return b"data: {\"type\": \"error\", \"error\": \"serialization_failed\"}\n\n"
        cancelled = False
        deck_lock_acquired = False
        try:
            existing_deck = get_deck(deck_id)
            if not existing_deck:
                yield _sse({'type': 'error', 'error': f'Deck {deck_id} not found'})
                return
            
            if not request.force_restart:
                status = existing_deck.get('status', {})
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
                logger.warning(f"❌ Failed to acquire lock for deck {deck_id} in compose-stream")
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
            
            print(f"\n🚀🚀🚀 CALLING compose_deck_stream 🚀🚀🚀")
            print(f"  - deck_id: {deck_id}")
            print(f"  - async_images: {request.async_images}")
            print(f"  - delay_between_slides: {delay_val}")
            
            # Use new compose_deck_stream with structured three-phase approach
            async for update in compose_deck_stream(
                deck_outline, registry, deck_id,
                delay_between_slides=delay_val,
                async_images=request.async_images,
                prefetch_images=request.prefetch_images,
                user_id=user_id  # Pass user_id for deck attribution
            ):
                # Log image-related updates
                if 'image' in update.get('type', '').lower():
                    logger.info(f"📡 SENDING IMAGE UPDATE TO FRONTEND: {update.get('type')} - {update.get('message', '')}")
                    if update.get('type') == 'slide_images_found':
                        data = update.get('data', {})
                        logger.info(f"📡 Image details: slide_index={data.get('slide_index')}, images_count={data.get('images_count')}")
                
                yield _sse(update)
                await asyncio.sleep(0.01)  # Small delay to prevent overwhelming the client
                
            # Final success message
            # Build response data separately to avoid multi-line f-string issues
            response_data = {
                'type': 'composition_complete',
                'deck_id': deck_id,
                'message': 'Deck composition completed successfully!',
                'version': SCHEMA_VERSION
            }
            yield _sse(response_data)
            # Emit explicit end-of-stream marker
            yield _sse({'type': 'end', 'message': 'Stream complete'})
            
        except asyncio.CancelledError:
            cancelled = True
            logger.info("Client disconnected during deck compose stream; cancelling gracefully")
            # Optionally continue generation in background per config
            if CONTINUE_GENERATION_ON_DISCONNECT:
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
            return
        except Exception as e:
            logger.error(f"Error in deck composition stream: {e}", exc_info=True)
            yield _sse({'type': 'error', 'error': str(e)})
        finally:
            # Ensure stream termination marker in any case
            try:
                if not cancelled:
                    yield _sse({'type': 'end', 'message': 'Stream complete'})
            except Exception:
                return
            # Always release deck lock if acquired
            try:
                if deck_lock_acquired:
                    concurrency_manager.release_deck_lock(deck_id)
                    logger.info(f"✅ Released deck lock for {deck_id} (compose-stream)")
            except Exception:
                pass
    
    return generate() 