"""
Orchestrator for parallel slide generation.
"""

import asyncio
from typing import Dict, Any, List, AsyncIterator, Tuple, Optional
from datetime import datetime

from agents.core import ISlideGenerator, IPersistence
from agents.domain.models import (
    DeckState, CompositionOptions, SlideGenerationContext,
    SlideStatus, ThemeSpec
)
from agents.application.event_bus import get_event_bus, Events
from setup_logging_optimized import get_logger
from agents.config import ENABLE_PROMPT_CACHE_PREWARM

logger = get_logger(__name__)


class ParallelSlideOrchestrator:
    """Orchestrates parallel slide generation."""
    
    def __init__(self, slide_generator: ISlideGenerator, persistence: IPersistence, image_manager=None):
        self.slide_generator = slide_generator
        self.persistence = persistence
        self.event_bus = get_event_bus()
        self.image_manager = image_manager
    
    async def generate_slides_parallel(
        self,
        deck_state: DeckState,
        options: CompositionOptions
    ) -> AsyncIterator[Dict[str, Any]]:
        """Generate slides in parallel with proper orchestration."""
        
        # Debug logging for taggedMedia in deck_outline
        logger.info(f"[PARALLEL_ORCH] Starting parallel generation for {len(deck_state.deck_outline.slides)} slides")
        for i, slide in enumerate(deck_state.deck_outline.slides):
            tm_count = 0
            if hasattr(slide, 'taggedMedia') and slide.taggedMedia:
                tm_count = len(slide.taggedMedia)
                logger.info(f"[PARALLEL_ORCH] Slide {i+1} '{slide.title}' has {tm_count} taggedMedia items")
                for j, media in enumerate(slide.taggedMedia[:2]):  # First 2
                    media_dict = media.model_dump() if hasattr(media, 'model_dump') else media
                    logger.info(f"[PARALLEL_ORCH]   Media {j+1}: {media_dict.get('filename', 'unknown')} - URL: {media_dict.get('previewUrl', '')[:100]}")
            else:
                logger.info(f"[PARALLEL_ORCH] Slide {i+1} '{slide.title}' has NO taggedMedia")
        
        logger.info(f"[PARALLEL_ORCH] Creating semaphore with max_parallel_slides={options.max_parallel_slides}")
        semaphore = asyncio.Semaphore(options.max_parallel_slides)
        completed_slides = 0
        slides_in_progress = set()
        total_slides = len(deck_state.deck_outline.slides)
        
        # Create a queue for immediate event streaming
        event_queue = asyncio.Queue()
        
        # Start slide generation phase event
        yield {
            'type': 'slides_generation_started',
            'total_slides': total_slides,
            'max_parallel': options.max_parallel_slides,
            'message': f'Starting generation of {total_slides} slides'
        }
        
        # Prewarm Anthropic prompt cache once per deck before fan-out
        if ENABLE_PROMPT_CACHE_PREWARM:
            try:
                # Use first slide to build prompts but issue a tiny request to write cached prefix
                if deck_state.deck_outline.slides:
                    first_slide = deck_state.deck_outline.slides[0]
                    theme_to_pass = deck_state.theme or ThemeSpec.from_dict({})
                    context = SlideGenerationContext(
                        slide_outline=first_slide,
                        slide_index=0,
                        deck_outline=deck_state.deck_outline,
                        theme=theme_to_pass,
                        palette=deck_state.palette or {},
                        style_manifesto=deck_state.style_manifesto or "",
                        deck_uuid=deck_state.deck_uuid,
                        available_images=[],
                        async_images=options.async_images,
                        visual_density=self._infer_visual_density(deck_state, first_slide),
                        tagged_media=[
                            media.model_dump() if hasattr(first_slide, 'taggedMedia') and hasattr(media, 'model_dump') else media
                            for media in (first_slide.taggedMedia if hasattr(first_slide, 'taggedMedia') and first_slide.taggedMedia else [])
                        ],
                        user_id=getattr(deck_state, 'user_id', None)
                    )
                    # Build prompts using the same code paths
                    try:
                        rag_ctx = await self.slide_generator._retrieve_rag_context(context)
                        system_prompt, user_prompt = await self.slide_generator._build_prompts(context, rag_ctx)
                    except Exception:
                        # Fallback: build minimal prompts synchronously
                        system_prompt = self.slide_generator.prompt_builder.build_system_prompt()
                        try:
                            static_block, slide_block = self.slide_generator.prompt_builder.build_user_prompt_blocks(context, {"predicted_components": []})
                            user_prompt = f"{static_block}\n<<<CACHE_BREAKPOINT>>>\n{slide_block}"
                        except Exception:
                            user_prompt = self.slide_generator.prompt_builder.build_user_prompt(context, {"predicted_components": []})
                    # Issue tiny Anthropic call via clients.invoke with low max_tokens to write cache
                    from agents.ai.clients import get_client, invoke
                    # Use the same model as slide generation
                    model_alias = getattr(self.slide_generator.ai_generator, 'model', None)
                    client, model_name = get_client(model_alias or 'claude-3-7-sonnet')
                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt + "\n[PREWARM] Reply with OK"}
                    ]
                    try:
                        _ = invoke(
                            client=client,
                            model=model_name,
                            messages=messages,
                            response_model=None,
                            max_tokens=4,
                            temperature=0.0,
                            deck_uuid=deck_state.deck_uuid,
                            slide_generation=False
                        )
                        logger.info("[PREWARM] Anthropic prompt cache prewarmed successfully")
                        yield {
                            'type': 'info',
                            'message': 'Prewarmed prompt cache'
                        }
                    except Exception as e:
                        logger.warning(f"[PREWARM] Failed to prewarm cache: {e}")
            except Exception as e:
                logger.warning(f"[PREWARM] Skipped due to error: {e}")
        
        # Create tasks for all slides with minimal delay
        tasks = []
        logger.info(f"[PARALLEL_ORCH] Creating tasks for {len(deck_state.deck_outline.slides)} slides")
        for i, slide_outline in enumerate(deck_state.deck_outline.slides):
            # Add small delay between starting slides to avoid overwhelming the system
            if i > 0 and options.delay_between_slides > 0:
                delay = min(options.delay_between_slides * 0.1, 0.1)
                logger.info(f"[PARALLEL_ORCH] Adding {delay}s delay before starting slide {i+1}")
                await asyncio.sleep(delay)
            
            logger.info(f"[PARALLEL_ORCH] Creating task for slide {i+1}: {slide_outline.title}")
            task = asyncio.create_task(
                self._generate_slide_with_streaming(
                    deck_state, i, slide_outline, semaphore,
                    options, slides_in_progress, event_queue
                )
            )
            tasks.append(task)
        logger.info(f"[PARALLEL_ORCH] All {len(tasks)} slide tasks created")
        
        # Process events from queue as they arrive
        async def process_events():
            nonlocal completed_slides  # Declare at the beginning
            while True:
                try:
                    # Use timeout to check if all tasks are done
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                    
                    # Track progress
                    if event.get('type') == 'slide_started':
                        progress = self._calculate_progress(
                            completed_slides, len(slides_in_progress), total_slides
                        )
                        event['progress'] = progress
                        event['slides_in_progress'] = len(slides_in_progress)
                        event['slides_completed'] = completed_slides
                        logger.info(f"[PARALLEL] slide_started: slide {event.get('slide_index')+1}, in_progress={len(slides_in_progress)}, completed={completed_slides}")
                        if len(slides_in_progress) > 1:
                            logger.info(f"[PARALLEL] 🎉 {len(slides_in_progress)} slides generating in parallel!")
                    
                    elif event.get('type') == 'slide_generated':
                        completed_slides += 1
                        slide_idx = event.get('slide_index', -1)
                        slides_in_progress.discard(slide_idx)
                        progress = self._calculate_progress(
                            completed_slides, len(slides_in_progress), total_slides
                        )
                        event['progress'] = progress
                        event['slides_completed'] = completed_slides
                        logger.info(f"[PARALLEL] slide_generated: slide {slide_idx+1}, in_progress={len(slides_in_progress)}, completed={completed_slides}")
                        event['slides_total'] = total_slides
                        
                        # Add force_update flag to trigger immediate frontend update
                        event['force_update'] = True
                        event['timestamp'] = datetime.now().isoformat()
                        
                        slide_data = event.get('slide_data', {})
                        # Update deck state
                        deck_state.mark_slide_complete(slide_idx, slide_data)
                        
                        logger.info(f"[PARALLEL_ORCH] Slide {slide_idx + 1} completed")
                    
                    elif event.get('type') == 'slide_error':
                        slide_idx = event.get('slide_index', -1)
                        slides_in_progress.discard(slide_idx)
                    
                    yield event
                    
                except asyncio.TimeoutError:
                    # Check if all tasks are done
                    if all(task.done() for task in tasks):
                        break
                    continue
        
        # Process events and wait for tasks
        event_processor = asyncio.create_task(process_events().__anext__())
        pending_tasks = set(tasks)
        
        while pending_tasks or not event_queue.empty():
            # Wait for either an event or a task to complete
            done, pending = await asyncio.wait(
                {event_processor} | pending_tasks,
                return_when=asyncio.FIRST_COMPLETED
            )
            
            # Process completed tasks
            for task in done:
                if task == event_processor:
                    # Yield the event
                    try:
                        event = task.result()
                        yield event
                        # Create new event processor task
                        event_processor = asyncio.create_task(process_events().__anext__())
                    except StopAsyncIteration:
                        break
                else:
                    # Task completed, remove from pending
                    pending_tasks.discard(task)
                    try:
                        task.result()  # Check for exceptions
                    except Exception as e:
                        logger.error(f"Slide task failed: {e}")
                        await event_queue.put({
                            'type': 'slide_error',
                            'error': str(e),
                            'message': f'Error generating slide: {str(e)}'
                        })
        
        # Cancel event processor if still running
        if not event_processor.done():
            event_processor.cancel()
        
        # Final completion event
        yield {
            'type': 'slides_generation_complete',
            'total_slides': total_slides,
            'completed_slides': completed_slides,
            'message': f'Generated {completed_slides} slides'
        }
    
    async def _generate_slide_with_streaming(
        self,
        deck_state: DeckState,
        slide_index: int,
        slide_outline: Any,
        semaphore: asyncio.Semaphore,
        options: CompositionOptions,
        slides_in_progress: set,
        event_queue: asyncio.Queue
    ):
        """Generate a single slide with streaming events."""
        
        logger.info(f"[PARALLEL_ORCH] Slide {slide_index + 1} waiting for semaphore...")
        async with semaphore:
            logger.info(f"[PARALLEL_ORCH] ✅ Acquired semaphore for slide {slide_index + 1}/{len(deck_state.deck_outline.slides)}")
            slides_in_progress.add(slide_index)
            logger.info(f"[PARALLEL_ORCH] Slides in progress: {sorted(list(slides_in_progress))}")
            
            try:
                # Log what we're working with
                logger.info(f"[SLIDE GENERATION] Processing slide {slide_index + 1}: {slide_outline.title}")
                
                # Check if slide_outline has taggedMedia
                tagged_media_count = 0
                if hasattr(slide_outline, 'taggedMedia'):
                    if slide_outline.taggedMedia is not None:
                        tagged_media_count = len(slide_outline.taggedMedia)
                        logger.info(f"[SLIDE GENERATION] Slide has {tagged_media_count} tagged media items")
                        for i, media in enumerate(slide_outline.taggedMedia[:3]):  # Log first 3
                            if hasattr(media, 'model_dump'):
                                media_dict = media.model_dump()
                            else:
                                media_dict = media
                            logger.info(f"[SLIDE GENERATION] Media {i+1}: {media_dict.get('filename')} - URL: {media_dict.get('previewUrl', '')[:100]}")
                    else:
                        logger.info(f"[SLIDE GENERATION] Slide has taggedMedia attribute but it's None")
                else:
                    logger.warning(f"[SLIDE GENERATION] Slide outline missing taggedMedia attribute!")
                
                # Create slide generation context
                available_images = []
                
                # If async_images is enabled and we have an image manager, get pending images
                if options.async_images and self.image_manager:
                    slide_id = getattr(slide_outline, 'id', None)
                    print(f"\n[SLIDE GENERATION] Checking pending images for slide {slide_index + 1} (ID: {slide_id})")
                    pending_images = self.image_manager.get_pending_images_for_slide(slide_id) if slide_id else []
                    if pending_images:
                        logger.info(f"[SLIDE GENERATION] Found {len(pending_images)} pending images for slide {slide_index + 1}")
                        print(f"[SLIDE GENERATION] ✓ Found {len(pending_images)} pending images for slide {slide_index + 1}")
                        available_images = pending_images
                    else:
                        print(f"[SLIDE GENERATION] ✗ No pending images found for slide {slide_index + 1}")
                else:
                    print(f"[SLIDE GENERATION] Skipping image check - async_images: {options.async_images}, has image_manager: {self.image_manager is not None}")
                
                # Log theme information before creating context
                logger.info(f"[SLIDE {slide_index + 1}] deck_state.theme exists: {deck_state.theme is not None}")
                if deck_state.theme:
                    logger.info(f"[SLIDE {slide_index + 1}] Theme type: {type(deck_state.theme)}")
                    if hasattr(deck_state.theme, 'theme_name'):
                        logger.info(f"[SLIDE {slide_index + 1}] Theme name: {deck_state.theme.theme_name}")
                    if hasattr(deck_state.theme, 'color_palette'):
                        logger.info(f"[SLIDE {slide_index + 1}] Theme has color_palette: {deck_state.theme.color_palette is not None}")
                
                # Get user_id from deck_state or persistence
                user_id = None
                if hasattr(deck_state, 'user_id'):
                    user_id = deck_state.user_id
                elif hasattr(self.persistence, 'user_id'):
                    user_id = self.persistence.user_id
                
                # Pass theme directly - now supports both ThemeDocument and ThemeSpec
                theme_to_pass = deck_state.theme or ThemeSpec.from_dict({})
                
                context = SlideGenerationContext(
                    slide_outline=slide_outline,
                    slide_index=slide_index,
                    deck_outline=deck_state.deck_outline,
                    theme=theme_to_pass,
                    palette=deck_state.palette or {},
                    style_manifesto=deck_state.style_manifesto or "",
                    deck_uuid=deck_state.deck_uuid,
                    available_images=available_images,
                    async_images=options.async_images,
                    visual_density=self._infer_visual_density(deck_state, slide_outline),
                    tagged_media=[
                        # Convert to dict if it's a Pydantic model
                        media.model_dump() if hasattr(media, 'model_dump') else media
                        for media in (slide_outline.taggedMedia if hasattr(slide_outline, 'taggedMedia') and slide_outline.taggedMedia else [])
                    ],
                    user_id=user_id
                )
                
                logger.info(f"[SLIDE GENERATION] Created context with {len(context.tagged_media)} tagged media items")
                
                # Immediately emit slide_started event
                await event_queue.put({
                    'type': 'slide_started',
                    'slide_index': slide_index,
                    'slide_title': slide_outline.title,
                    'message': f'Starting generation for slide {slide_index + 1}'
                })
                
                # Update deck status for slide start
                deck_state.status = {
                    'state': 'generating',
                    'currentSlide': slide_index,
                    'totalSlides': len(deck_state.slides),
                    'message': f'Generating slide {slide_index + 1} of {len(deck_state.slides)}',
                    'progress': int((slide_index / len(deck_state.slides)) * 40 + 55),  # 55-95% range
                    'phase': 'slide_generation'
                }
                
                # Skip saving deck status here to avoid lock contention
                # Status will be saved after slide completion
                logger.info(f"[PARALLEL_ORCH] Skipping pre-generation save for slide {slide_index + 1} to enable parallelism")
                
                # Generate slide with timeout
                logger.info(f"  Starting generation for slide {slide_index + 1} with 300s timeout...")
                start_time = datetime.now()
                
                # Stream updates directly from slide generator
                slide_data = None
                elapsed = 0
                
                try:
                    async with asyncio.timeout(300.0):  # 5 minute timeout per slide
                        async for update in self.slide_generator.generate_slide(context):
                            # Add slide index to all updates
                            update['slide_index'] = slide_index
                            
                            if update.get('type') == 'slide_generated':
                                slide_data = update.get('slide_data')
                                elapsed = (datetime.now() - start_time).total_seconds()
                                update['duration'] = elapsed
                                update['slide_title'] = slide_outline.title
                                update['message'] = f'Slide {slide_index + 1} generated successfully'
                                logger.info(f"  ✅ Slide {slide_index + 1} generated in {elapsed:.2f}s")
                            
                            # Stream the update immediately
                            await event_queue.put(update)
                            
                except asyncio.TimeoutError:
                    raise  # Re-raise to be handled by outer try/except
                
                # Save slide immediately with force flag for real-time updates
                if slide_data:
                    await self.persistence.update_slide(
                        deck_state.deck_uuid, slide_index, slide_data, force_immediate=True
                    )
                    logger.info(
                        f"  ✅ Saved slide {slide_index + 1} with "
                        f"{len(slide_data.get('components', []))} components"
                    )
                    
                    # Update deck status in database
                    completed_count = sum(1 for s in deck_state.slides if s.get('status') == SlideStatus.COMPLETED.value)
                    deck_state.status = {
                        'state': 'generating',
                        'currentSlide': completed_count,
                        'totalSlides': len(deck_state.slides),
                        'message': f'Generated {completed_count} of {len(deck_state.slides)} slides',
                        'progress': int((completed_count / len(deck_state.slides)) * 40 + 55),  # 55-95% range
                        'phase': 'slide_generation'
                    }
                    
                    # Save the updated deck with new status
                    await self.persistence.save_deck(deck_state.to_dict())
                    logger.info(f"  📊 Updated deck status: {completed_count}/{len(deck_state.slides)} slides")
                    
                    # Emit slide saved event
                    await self.event_bus.emit(Events.SLIDE_SAVED, {
                        'deck_uuid': deck_state.deck_uuid,
                        'slide_index': slide_index,
                        'component_count': len(slide_data.get('components', []))
                    })

                    # Do not auto-apply pending images during slide generation (use placeholders)
                
            except asyncio.TimeoutError:
                logger.error(f"❌ Slide {slide_index + 1} timed out after 300 seconds")
                await event_queue.put({
                    'type': 'slide_error',
                    'slide_index': slide_index,
                    'error': 'Generation timed out after 300 seconds',
                    'message': f'Slide {slide_index + 1} generation timed out'
                })
                
            except Exception as e:
                # Import exception types
                from agents.generation.exceptions import AIOverloadedError, is_retryable, get_retry_delay
                
                # Determine user-friendly error message
                if isinstance(e, AIOverloadedError):
                    error_message = "AI service is temporarily overloaded. Please retry in a moment."
                    logger.warning(f"⚠️ Slide {slide_index + 1} failed due to AI overload (529)")
                else:
                    error_message = str(e)
                    logger.error(f"Error generating slide {slide_index + 1}: {error_message}")
                
                await event_queue.put({
                    'type': 'slide_error',
                    'slide_index': slide_index,
                    'error': error_message,
                    'message': f'Error generating slide {slide_index + 1}: {error_message}',
                    'retryable': is_retryable(e)
                })
                
            finally:
                logger.info(f"  Slide {slide_index + 1} releasing semaphore")
                slides_in_progress.discard(slide_index)

    def _infer_visual_density(self, deck_state: DeckState, slide_outline: Any) -> str:
        """Infer a simple visual density hint from theme and slide type/title.
        Returns one of: 'minimal', 'moderate', 'rich', 'data-heavy'.
        """
        try:
            title = (getattr(slide_outline, 'title', '') or '').lower()
            content = (getattr(slide_outline, 'content', '') or '')
            # If extracted data present or data-like title, prefer data-heavy
            if hasattr(slide_outline, 'extractedData') and getattr(slide_outline, 'extractedData'):
                return 'data-heavy'
            if any(k in title for k in ['data', 'metrics', 'analysis', 'results', 'growth', 'trend', 'kpi']):
                return 'data-heavy'
            # Title slide or dividers are minimal by design
            if any(k in title for k in ['title', 'cover']) or deck_state.deck_outline.slides and slide_outline == deck_state.deck_outline.slides[0]:
                return 'minimal'
            if any(k in title for k in ['divider', 'section', 'chapter']):
                return 'minimal'
            # If content already long, choose rich
            if isinstance(content, str) and len(content.split()) > 110:
                return 'rich'
            # Default moderate
            return 'moderate'
        except Exception:
            return 'moderate'
    
    async def _collect_slide_updates(
        self,
        context: SlideGenerationContext
    ) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
        """Collect all updates from slide generation."""
        updates = []
        slide_data = None
        
        async for update in self.slide_generator.generate_slide(context):
            updates.append(update)
            if update.get('type') == 'slide_generated':
                slide_data = update.get('slide_data')
        
        return updates, slide_data
    
    def _calculate_progress(self, completed: int, in_progress: int, total: int) -> int:
        """Calculate overall progress percentage."""
        if total == 0:
            return 55  # Start of slide generation phase
        
        # Base progress starts at 55 (after theme/image collection)
        # Goes up to 95 (before finalization)
        slide_progress_range = 40  # 95 - 55
        
        # Give partial credit for in-progress slides
        effective_completed = completed + (in_progress * 0.5)
        progress_ratio = effective_completed / total
        
        return int(55 + (progress_ratio * slide_progress_range)) 