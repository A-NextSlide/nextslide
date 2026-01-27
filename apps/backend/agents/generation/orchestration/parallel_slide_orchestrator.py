"""
Orchestrator for parallel slide generation.
"""

import asyncio
import sys
from contextlib import asynccontextmanager
from typing import Dict, Any, List, AsyncIterator, Tuple, Optional
from datetime import datetime

from agents.core import ISlideGenerator, IPersistence


# Python 3.11+ has asyncio.timeout, but we need to support 3.9+
if sys.version_info >= (3, 11):
    from asyncio import timeout as async_timeout
else:
    @asynccontextmanager
    async def async_timeout(delay: float):
        """Compatibility wrapper for asyncio.timeout (Python 3.9+)."""
        async def _timeout_coro():
            await asyncio.sleep(delay)
            raise asyncio.TimeoutError(f"Operation timed out after {delay}s")

        timeout_task = asyncio.create_task(_timeout_coro())
        try:
            yield
        finally:
            timeout_task.cancel()
            try:
                await timeout_task
            except asyncio.CancelledError:
                pass
from agents.domain.models import (
    DeckState, CompositionOptions, SlideGenerationContext,
    SlideStatus, ThemeSpec
)
from agents.generation.context_builder import build_slide_context
from agents.application.event_bus import get_event_bus, Events
from setup_logging_optimized import get_logger
from agents.config import ENABLE_PROMPT_CACHE_PREWARM
from services.gemini_cache_manager import get_gemini_cache_manager

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
        
        outline_slides = deck_state.deck_outline.slides if hasattr(deck_state.deck_outline, 'slides') else []
        total_slides = len(outline_slides) or len(deck_state.slides)

        # Debug logging for taggedMedia in deck_outline
        logger.info(f"Starting parallel generation for {len(outline_slides)} slides")
        for i, slide in enumerate(outline_slides):
            tm_count = 0
            if hasattr(slide, 'taggedMedia') and slide.taggedMedia:
                tm_count = len(slide.taggedMedia)
                logger.debug(f"Slide {i+1} '{slide.title}' has {tm_count} taggedMedia items")
                for j, media in enumerate(slide.taggedMedia[:2]):  # First 2
                    media_dict = media.model_dump() if hasattr(media, 'model_dump') else media
                    logger.debug(f"  Media {j+1}: {media_dict.get('filename', 'unknown')} - URL: {media_dict.get('previewUrl', '')[:100]}")
            else:
                logger.debug(f"Slide {i+1} '{slide.title}' has NO taggedMedia")

        logger.debug(f"Creating semaphore with max_parallel_slides={options.max_parallel_slides}")
        semaphore = asyncio.Semaphore(options.max_parallel_slides)
        completed_slides = 0
        slides_in_progress = set()
        total_slides = len(outline_slides) or len(deck_state.slides)
        
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
                if outline_slides:
                    first_slide = outline_slides[0]
                    theme_to_pass = deck_state.theme or ThemeSpec.from_dict({})
                    context = build_slide_context(
                        deck_outline=deck_state.deck_outline,
                        slide_outline=first_slide,
                        slide_index=0,
                        theme=theme_to_pass,
                        palette=deck_state.palette or {},
                        style_manifesto=deck_state.style_manifesto or "",
                        deck_uuid=deck_state.deck_uuid,
                        async_images=options.async_images,
                        available_images=[],
                        user_id=getattr(deck_state, "user_id", None),
                        visual_density=self._resolve_visual_density(deck_state, first_slide),
                    )
                    # Build prompts using the same code paths
                    try:
                        system_prompt, user_prompt = await self.slide_generator._build_prompts(context)
                    except Exception:
                        # Fallback: build minimal prompts synchronously
                        system_prompt = self.slide_generator.prompt_builder.build_system_prompt()
                        try:
                            static_block, slide_block = self.slide_generator.prompt_builder.build_user_prompt_blocks(context)
                            user_prompt = f"{static_block}\n<<<CACHE_BREAKPOINT>>>\n{slide_block}"
                        except Exception:
                            user_prompt = self.slide_generator.prompt_builder.build_user_prompt(context)
                    # Issue tiny Anthropic call via clients.invoke with low max_tokens to write cache
                    from agents.ai.clients import get_client, invoke
                    # Use the same model as slide generation
                    from agents.config import COMPOSER_MODEL
                    model_alias = getattr(self.slide_generator.ai_generator, 'model', None)
                    client, model_name = get_client(model_alias or COMPOSER_MODEL)
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
                        logger.debug("[PREWARM] Anthropic prompt cache prewarmed successfully")
                        yield {
                            'type': 'info',
                            'message': 'Prewarmed prompt cache'
                        }
                    except Exception as e:
                        logger.warning(f"[PREWARM] Failed to prewarm cache: {e}")
            except Exception as e:
                logger.warning(f"[PREWARM] Skipped due to error: {e}")

        # Create Gemini context cache for deck-wide content (research, theme, etc.)
        # This caches the static block once and uses it for all slide generations
        gemini_cache_name = None
        try:
            if outline_slides:
                first_slide = outline_slides[0]
                theme_to_pass = deck_state.theme or ThemeSpec.from_dict({})
                context = build_slide_context(
                    deck_outline=deck_state.deck_outline,
                    slide_outline=first_slide,
                    slide_index=0,
                    theme=theme_to_pass,
                    palette=deck_state.palette or {},
                    style_manifesto=deck_state.style_manifesto or "",
                    deck_uuid=deck_state.deck_uuid,
                    async_images=options.async_images,
                    available_images=[],
                    user_id=getattr(deck_state, "user_id", None),
                    visual_density=self._resolve_visual_density(deck_state, first_slide),
                )

                # Get the static block for caching
                system_prompt = self.slide_generator.prompt_builder.build_system_prompt()
                try:
                    static_block, _ = self.slide_generator.prompt_builder.build_user_prompt_blocks(context)
                except Exception:
                    static_block = ""

                if static_block and len(static_block) > 2000:  # Only cache substantial content
                    cache_manager = get_gemini_cache_manager()
                    from agents.config import COMPOSER_MODEL
                    model_alias = getattr(self.slide_generator.ai_generator, 'model', None) or COMPOSER_MODEL

                    # Only create cache if using a Gemini model
                    if 'gemini' in model_alias.lower():
                        from agents.ai.clients import MODELS
                        _, actual_model = MODELS.get(model_alias, (None, model_alias))

                        gemini_cache_name = cache_manager.get_or_create_cache(
                            deck_uuid=deck_state.deck_uuid,
                            model=actual_model,
                            system_prompt=system_prompt,
                            static_block=static_block,
                            ttl="600s",  # 10 minutes - enough for deck generation
                        )

                        if gemini_cache_name:
                            # Store cache name in deck_state for access during slide generation
                            deck_state.gemini_cache_name = gemini_cache_name
                            logger.info(f"[GEMINI_CACHE] Created cache for deck {deck_state.deck_uuid[:8]}")
                            yield {
                                'type': 'info',
                                'message': 'Created Gemini context cache for deck-wide content'
                            }
        except Exception as e:
            logger.warning(f"[GEMINI_CACHE] Failed to create cache: {e}")

        # Create ALL tasks at once for true parallelism - semaphore controls concurrency
        tasks = []
        logger.debug(f"Creating {len(outline_slides)} slide tasks in parallel")
        for i, slide_outline in enumerate(outline_slides):
            logger.debug(f"Creating task for slide {i+1}: {slide_outline.title}")
            task = asyncio.create_task(
                self._generate_slide_with_streaming(
                    deck_state, i, slide_outline, semaphore,
                    options, slides_in_progress, event_queue
                )
            )
            tasks.append(task)
        logger.info(f"[PARALLEL] All {len(tasks)} slide tasks created simultaneously (max concurrent: {options.max_parallel_slides})")
        
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
                        event['total_slides'] = total_slides
                        logger.debug(f"slide_started: slide {event.get('slide_index')+1}, in_progress={len(slides_in_progress)}, completed={completed_slides}")
                        if len(slides_in_progress) > 1:
                            logger.debug(f"{len(slides_in_progress)} slides generating in parallel")
                    
                    elif event.get('type') == 'slide_generated':
                        completed_slides += 1
                        slide_idx = event.get('slide_index', -1)
                        slides_in_progress.discard(slide_idx)
                        progress = self._calculate_progress(
                            completed_slides, len(slides_in_progress), total_slides
                        )
                        event['progress'] = progress
                        event['slides_completed'] = completed_slides
                        logger.debug(f"slide_generated: slide {slide_idx+1}, in_progress={len(slides_in_progress)}, completed={completed_slides}")
                        event['slides_total'] = total_slides
                        
                        # Add force_update flag to trigger immediate frontend update
                        event['force_update'] = True
                        event['timestamp'] = datetime.now().isoformat()
                        
                        slide_data = event.get('slide_data', {})
                        # Update deck state
                        deck_state.mark_slide_complete(slide_idx, slide_data)
                        
                        logger.debug(f"Slide {slide_idx + 1} completed")
                    
                    elif event.get('type') == 'slide_error':
                        slide_idx = event.get('slide_index', -1)
                        slides_in_progress.discard(slide_idx)
                        # Treat errored slides as "completed" for progress tracking purposes
                        completed_slides += 1
                        progress = self._calculate_progress(
                            completed_slides, len(slides_in_progress), total_slides
                        )
                        event['progress'] = progress
                        event['slides_completed'] = completed_slides
                        event['slides_total'] = total_slides
                        logger.warning(f"slide_error: slide {slide_idx+1}, in_progress={len(slides_in_progress)}, completed={completed_slides}")
                    
                    yield event
                    
                except asyncio.TimeoutError:
                    # Check if all tasks are done
                    if all(task.done() for task in tasks):
                        break
                    continue
        
        # Process events and wait for tasks
        event_processor = asyncio.create_task(process_events().__anext__())
        pending_tasks = set(tasks)
        
        # Add a global timeout to prevent infinite hangs
        max_wait_time = 600  # 10 minutes total for all slides
        start_time = datetime.now()
        
        while pending_tasks or not event_queue.empty():
            # Check for global timeout
            elapsed = (datetime.now() - start_time).total_seconds()
            if elapsed > max_wait_time:
                # SLIDE-BACKEND-19S: Log as warning, not error - timeouts are expected for very large decks
                logger.warning(f"⚠️ Global timeout reached after {elapsed}s. Cancelling {len(pending_tasks)} pending tasks.")
                for task in pending_tasks:
                    if not task.done():
                        task.cancel()
                break
            
            # Wait for either an event or a task to complete (with short timeout)
            try:
                done, pending = await asyncio.wait(
                    {event_processor} | pending_tasks,
                    return_when=asyncio.FIRST_COMPLETED,
                    timeout=5.0  # Add 5-second timeout to prevent infinite waits
                )
            except asyncio.TimeoutError:
                logger.warning(f"⚠️ Wait timeout - checking task status. Pending: {len(pending_tasks)}, Elapsed: {elapsed}s")
                # Check if any tasks are stuck
                stuck_tasks = [task for task in pending_tasks if not task.done()]
                if stuck_tasks and elapsed > 360:  # After 6 minutes, be more aggressive
                    logger.error(f"❌ Found {len(stuck_tasks)} stuck tasks after {elapsed}s. Cancelling them.")
                    for task in stuck_tasks:
                        task.cancel()
                    pending_tasks = set()
                    break
                continue
            
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
                    except Exception as e:
                        logger.error(f"Event processor error: {e}")
                        break
                else:
                    # Task completed, remove from pending
                    pending_tasks.discard(task)
                    try:
                        task.result()  # Check for exceptions
                    except asyncio.CancelledError:
                        logger.warning("Slide task was cancelled")
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
        
        # Cancel any remaining pending tasks
        for task in pending_tasks:
            if not task.done():
                logger.warning(f"Cancelling pending task that didn't complete")
                task.cancel()
        
        # Final cleanup: Mark any slides still in "pending" status as ERROR
        # This catches edge cases where error persistence failed or tasks were cancelled unexpectedly
        pending_slides = [
            (i, s) for i, s in enumerate(deck_state.slides)
            if s.get('status') == SlideStatus.PENDING.value
        ]
        if pending_slides:
            logger.warning(f"[PARALLEL_ORCH] Found {len(pending_slides)} slides still pending after generation - marking as ERROR")
            for idx, slide in pending_slides:
                try:
                    slide['status'] = SlideStatus.ERROR.value
                    slide['error'] = 'Generation did not complete'
                    error_slide_data = {
                        'id': slide.get('id', f"{deck_state.deck_uuid}-slide-{idx}"),
                        'title': slide.get('title', f'Slide {idx + 1}'),
                        'order': idx,
                        'status': SlideStatus.ERROR.value,
                        'components': slide.get('components', []),
                        'error': 'Generation did not complete'
                    }
                    await self.persistence.update_slide(
                        deck_state.deck_uuid, idx, error_slide_data, force_immediate=True
                    )
                    logger.info(f"  ⚠️ Marked slide {idx + 1} as ERROR (was pending)")
                except Exception as e:
                    logger.warning(f"Failed to mark slide {idx + 1} as error: {e}")

        # Final completion event
        # Count successful vs failed slides
        successful_slides = sum(1 for s in deck_state.slides if s.get('status') == SlideStatus.COMPLETED.value)
        failed_slides = sum(1 for s in deck_state.slides if s.get('status') == SlideStatus.ERROR.value)

        logger.info(f"[PARALLEL_ORCH] Generation complete: {successful_slides} successful, {failed_slides} failed, {total_slides} total")

        # Clean up Gemini context cache (let TTL expire naturally, but log stats)
        try:
            cache_manager = get_gemini_cache_manager()
            cache_name = cache_manager.get_cache_name(deck_state.deck_uuid)
            if cache_name:
                stats = cache_manager.get_stats()
                logger.info(f"[GEMINI_CACHE] Cache used for deck {deck_state.deck_uuid[:8]}, active caches: {stats.get('active_caches', 0)}")
                # Optionally delete the cache now (or let TTL expire)
                # cache_manager.delete_cache(deck_state.deck_uuid)
        except Exception as e:
            logger.debug(f"[GEMINI_CACHE] Cleanup skipped: {e}")

        yield {
            'type': 'slides_generation_complete',
            'total_slides': total_slides,
            'completed_slides': successful_slides,
            'failed_slides': failed_slides,
            'message': f'Generated {successful_slides} of {total_slides} slides' + (f' ({failed_slides} failed)' if failed_slides > 0 else ''),
            'success': successful_slides > 0  # Consider success if at least one slide was generated
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
        
        logger.debug(f"Slide {slide_index + 1} waiting for semaphore...")
        async with semaphore:
            logger.debug(f"Acquired semaphore for slide {slide_index + 1}/{len(deck_state.deck_outline.slides) if hasattr(deck_state.deck_outline, 'slides') else len(deck_state.slides)}")
            slides_in_progress.add(slide_index)
            logger.debug(f"Slides in progress: {sorted(list(slides_in_progress))}")
            total_slides = len(deck_state.deck_outline.slides) if hasattr(deck_state.deck_outline, 'slides') else len(deck_state.slides)
            safe_total_slides = max(1, total_slides)

            def mark_slide_error():
                if 0 <= slide_index < len(deck_state.slides):
                    deck_state.slides[slide_index]['status'] = SlideStatus.ERROR.value
            
            try:
                # Log what we're working with
                logger.debug(f"[SLIDE GENERATION] Processing slide {slide_index + 1}: {slide_outline.title}")
                
                # Check if slide_outline has taggedMedia
                tagged_media_count = 0
                if hasattr(slide_outline, 'taggedMedia'):
                    if slide_outline.taggedMedia is not None:
                        tagged_media_count = len(slide_outline.taggedMedia)
                        logger.debug(f"[SLIDE GENERATION] Slide has {tagged_media_count} tagged media items")
                        for i, media in enumerate(slide_outline.taggedMedia[:3]):  # Log first 3
                            if hasattr(media, 'model_dump'):
                                media_dict = media.model_dump()
                            else:
                                media_dict = media
                            logger.debug(f"[SLIDE GENERATION] Media {i+1}: {media_dict.get('filename')} - URL: {media_dict.get('previewUrl', '')[:100]}")
                    else:
                        logger.debug(f"[SLIDE GENERATION] Slide has taggedMedia attribute but it's None")
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
                        logger.debug(f"[SLIDE GENERATION] Found {len(pending_images)} pending images for slide {slide_index + 1}")
                        print(f"[SLIDE GENERATION] ✓ Found {len(pending_images)} pending images for slide {slide_index + 1}")
                        available_images = pending_images
                    else:
                        print(f"[SLIDE GENERATION] ✗ No pending images found for slide {slide_index + 1}")
                else:
                    print(f"[SLIDE GENERATION] Skipping image check - async_images: {options.async_images}, has image_manager: {self.image_manager is not None}")
                
                # Log theme information before creating context
                logger.debug(f"[SLIDE {slide_index + 1}] deck_state.theme exists: {deck_state.theme is not None}")
                if deck_state.theme:
                    logger.debug(f"[SLIDE {slide_index + 1}] Theme type: {type(deck_state.theme)}")
                    if hasattr(deck_state.theme, 'theme_name'):
                        logger.debug(f"[SLIDE {slide_index + 1}] Theme name: {deck_state.theme.theme_name}")
                    if hasattr(deck_state.theme, 'color_palette'):
                        logger.debug(f"[SLIDE {slide_index + 1}] Theme has color_palette: {deck_state.theme.color_palette is not None}")
                
                # Get user_id from deck_state or persistence
                user_id = None
                if hasattr(deck_state, 'user_id'):
                    user_id = deck_state.user_id
                elif hasattr(self.persistence, 'user_id'):
                    user_id = self.persistence.user_id
                
                # Pass theme directly - now supports both ThemeDocument and ThemeSpec
                theme_to_pass = deck_state.theme or ThemeSpec.from_dict({})
                
                # ✅ DEBUG: Log if extractedData exists on slide_outline
                has_extracted = hasattr(slide_outline, 'extractedData') and slide_outline.extractedData is not None
                has_manual_charts = hasattr(slide_outline, 'manualCharts') and slide_outline.manualCharts is not None
                logger.debug(f"[CHART DEBUG] Slide {slide_index + 1} '{slide_outline.title}' - extractedData: {has_extracted}, manualCharts: {has_manual_charts}")
                if has_extracted:
                    try:
                        chart_type = slide_outline.extractedData.chartType if hasattr(slide_outline.extractedData, 'chartType') else slide_outline.extractedData.get('chartType', 'unknown')
                        data_count = len(slide_outline.extractedData.data) if hasattr(slide_outline.extractedData, 'data') else len(slide_outline.extractedData.get('data', []))
                        logger.debug(f"[CHART DEBUG] Slide {slide_index + 1} extractedData: {chart_type} with {data_count} points")
                    except Exception as e:
                        logger.warning(f"[CHART DEBUG] Error accessing extractedData details: {e}")

                context = build_slide_context(
                    deck_outline=deck_state.deck_outline,
                    slide_outline=slide_outline,
                    slide_index=slide_index,
                    theme=theme_to_pass,
                    palette=deck_state.palette or {},
                    style_manifesto=deck_state.style_manifesto or "",
                    deck_uuid=deck_state.deck_uuid,
                    async_images=options.async_images,
                    available_images=available_images,
                    user_id=user_id,
                    visual_density=self._resolve_visual_density(deck_state, slide_outline),
                    conversation_history=deck_state.conversation_history,
                )
                
                logger.debug(f"[SLIDE GENERATION] Created context with {len(context.tagged_media)} tagged media items")
                logger.debug(f"[SLIDE GENERATION] Context has_chart_data property: {context.has_chart_data}")
                if context.reference_images:
                    logger.info(f"[SLIDE GENERATION] 📸 Slide {slide_index + 1} has {len(context.reference_images)} reference images for design inspiration")
                
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
                    'totalSlides': total_slides,
                    'message': f'Generating slide {slide_index + 1} of {total_slides}',
                    'progress': int((slide_index / safe_total_slides) * 40 + 55),  # 55-95% range
                    'phase': 'slide_generation'
                }
                
                # Skip saving deck status here to avoid lock contention
                # Status will be saved after slide completion
                logger.debug(f"Skipping pre-generation save for slide {slide_index + 1} to enable parallelism")

                # Generate slide with timeout
                logger.debug(f"Starting generation for slide {slide_index + 1} with 300s timeout...")
                start_time = datetime.now()
                
                # Stream updates directly from slide generator
                slide_data = None
                elapsed = 0
                
                try:
                    async with async_timeout(300.0):  # 5 minute timeout per slide
                        async for update in self.slide_generator.generate_slide(context):
                            # Add slide index to all updates
                            update['slide_index'] = slide_index
                            
                            if update.get('type') == 'slide_generated':
                                slide_data = update.get('slide_data')
                                elapsed = (datetime.now() - start_time).total_seconds()
                                update['duration'] = elapsed
                                update['slide_title'] = slide_outline.title
                                update['message'] = f'Slide {slide_index + 1} generated successfully'
                                logger.debug(f"  Slide {slide_index + 1} generated in {elapsed:.2f}s")
                            
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
                        'totalSlides': total_slides,
                        'message': f'Generated {completed_count} of {total_slides} slides',
                        'progress': int((completed_count / safe_total_slides) * 40 + 55),  # 55-95% range
                        'phase': 'slide_generation'
                    }
                    
                    # Save the updated deck with new status
                    await self.persistence.save_deck(deck_state.to_dict())
                    logger.debug(f"  Updated deck status: {completed_count}/{total_slides} slides")
                    
                    # Emit slide saved event
                    await self.event_bus.emit(Events.SLIDE_SAVED, {
                        'deck_uuid': deck_state.deck_uuid,
                        'slide_index': slide_index,
                        'component_count': len(slide_data.get('components', []))
                    })

                    # Do not auto-apply pending images during slide generation (use placeholders)
                
            except asyncio.TimeoutError:
                logger.error(f"❌ Slide {slide_index + 1} timed out after 300 seconds")
                # Mark slide as errored but continue processing other slides
                mark_slide_error()

                # CRITICAL: Persist error status to database immediately
                # This fixes the bug where slides stay "pending" with 0 components
                try:
                    error_slide_data = {
                        'id': deck_state.slides[slide_index].get('id', f"{deck_state.deck_uuid}-slide-{slide_index}"),
                        'title': slide_outline.title,
                        'order': slide_index,
                        'status': SlideStatus.ERROR.value,
                        'components': [],  # Empty but status is ERROR not pending
                        'error': 'Generation timed out after 300 seconds'
                    }
                    await self.persistence.update_slide(
                        deck_state.deck_uuid, slide_index, error_slide_data, force_immediate=True
                    )
                    logger.info(f"  ⚠️ Persisted ERROR status for slide {slide_index + 1} (timeout)")
                except Exception as persist_err:
                    logger.warning(f"Failed to persist error status for slide {slide_index + 1}: {persist_err}")

                await event_queue.put({
                    'type': 'slide_error',
                    'slide_index': slide_index,
                    'error': 'Generation timed out after 300 seconds',
                    'message': f'Slide {slide_index + 1} generation timed out',
                    'slide_title': slide_outline.title
                })
                
            except asyncio.CancelledError:
                logger.warning(f"⚠️ Slide {slide_index + 1} generation was cancelled")
                mark_slide_error()

                # CRITICAL: Persist error status to database immediately
                try:
                    error_slide_data = {
                        'id': deck_state.slides[slide_index].get('id', f"{deck_state.deck_uuid}-slide-{slide_index}"),
                        'title': slide_outline.title,
                        'order': slide_index,
                        'status': SlideStatus.ERROR.value,
                        'components': [],
                        'error': 'Generation was cancelled'
                    }
                    await self.persistence.update_slide(
                        deck_state.deck_uuid, slide_index, error_slide_data, force_immediate=True
                    )
                    logger.info(f"  ⚠️ Persisted ERROR status for slide {slide_index + 1} (cancelled)")
                except Exception as persist_err:
                    logger.warning(f"Failed to persist error status for slide {slide_index + 1}: {persist_err}")

                await event_queue.put({
                    'type': 'slide_error',
                    'slide_index': slide_index,
                    'error': 'Generation was cancelled',
                    'message': f'Slide {slide_index + 1} generation was cancelled',
                    'slide_title': slide_outline.title
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

                # Mark slide as errored
                mark_slide_error()

                # CRITICAL: Persist error status to database immediately
                # This fixes the bug where slides stay "pending" with 0 components
                try:
                    error_slide_data = {
                        'id': deck_state.slides[slide_index].get('id', f"{deck_state.deck_uuid}-slide-{slide_index}"),
                        'title': slide_outline.title,
                        'order': slide_index,
                        'status': SlideStatus.ERROR.value,
                        'components': [],
                        'error': error_message,
                        'retryable': is_retryable(e)
                    }
                    await self.persistence.update_slide(
                        deck_state.deck_uuid, slide_index, error_slide_data, force_immediate=True
                    )
                    logger.info(f"  ⚠️ Persisted ERROR status for slide {slide_index + 1}")
                except Exception as persist_err:
                    logger.warning(f"Failed to persist error status for slide {slide_index + 1}: {persist_err}")

                await event_queue.put({
                    'type': 'slide_error',
                    'slide_index': slide_index,
                    'error': error_message,
                    'message': f'Error generating slide {slide_index + 1}: {error_message}',
                    'retryable': is_retryable(e),
                    'slide_title': slide_outline.title
                })
                
            finally:
                logger.debug(f"  Slide {slide_index + 1} releasing semaphore")
                slides_in_progress.discard(slide_index)

    def _resolve_visual_density(self, deck_state: DeckState, slide_outline: Any) -> Optional[str]:
        """Resolve visual density from explicit inputs only."""
        try:
            for attr in ("visual_density", "visualDensity"):
                value = getattr(slide_outline, attr, None)
                if isinstance(value, str) and value.strip():
                    return value.strip().lower()

            style_prefs = getattr(deck_state.deck_outline, "stylePreferences", None)
            if style_prefs:
                for key in ("visual_density", "visualDensity"):
                    if isinstance(style_prefs, dict):
                        value = style_prefs.get(key)
                    else:
                        value = getattr(style_prefs, key, None)
                    if isinstance(value, str) and value.strip():
                        return value.strip().lower()
        except Exception:
            pass
        return None
    
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
        
        # Give partial credit for in-progress slides to avoid big jumps
        in_progress_weight = 0.1
        effective_completed = completed + (in_progress * in_progress_weight)
        progress_ratio = effective_completed / total
        
        return int(55 + (progress_ratio * slide_progress_range)) 
