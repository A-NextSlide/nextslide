"""
Clean deck orchestrator implementation.

Handles:
- Parallel slide generation
- Progress tracking
- Error recovery
- Event emission
"""

import asyncio
import logging
from typing import Dict, Any, List, AsyncIterator, Optional, Set
from datetime import datetime

from agents.core.interfaces import (
    IDeckOrchestrator, ISlideGenerator, IThemeGenerator,
    IMediaProcessor, IPersistence,
    GenerationEvent, GenerationOptions, SlideContext
)
from agents.generation.config import get_config, get_generation_config
from agents.generation.exceptions import (
    OrchestrationError, SlideGenerationError,
    DeckGenerationError, should_skip_slide
)
from models.requests import DeckOutline
from agents.generation.pause_resume_manager import pause_resume_manager, GenerationState as PauseState
import uuid

logger = logging.getLogger(__name__)


class DeckOrchestrator(IDeckOrchestrator):
    """
    Orchestrates deck generation process.
    
    Responsibilities:
    - Coordinate theme and slide generation
    - Manage parallelism
    - Track progress
    - Handle failures gracefully
    - Support pause/resume functionality
    """
    
    def __init__(
        self,
        slide_generator: ISlideGenerator,
        theme_generator: IThemeGenerator,
        media_processor: IMediaProcessor,
        persistence: IPersistence,
        config: Optional[Any] = None
    ):
        self.slide_generator = slide_generator
        self.theme_generator = theme_generator
        self.media_processor = media_processor
        self.persistence = persistence
        self.config = config or get_config()
        self.gen_config = get_generation_config()
        
        # Progress tracking
        self.total_steps = 0
        self.completed_steps = 0
        self.phase_weights = {
            'initialization': 5,
            'theme_generation': 10,
            'media_processing': 10,
            'slide_generation': 70,
            'finalization': 5
        }
        
        # Track generation for pause/resume
        self.generation_id = None
        self.is_resuming = False
        self.resume_context = None
        
    async def orchestrate(
        self,
        deck_outline: DeckOutline,
        deck_id: str,
        options: GenerationOptions,
        generation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        resume_context: Optional[Dict[str, Any]] = None
    ) -> AsyncIterator[GenerationEvent]:
        """Orchestrate complete deck generation with pause/resume support"""
        
        # Set generation ID
        self.generation_id = generation_id or str(uuid.uuid4())
        self.is_resuming = resume_context is not None
        self.resume_context = resume_context
        
        logger.info(f"Starting deck generation for '{deck_outline.title}' ({deck_id})")
        if self.is_resuming:
            logger.info(f"Resuming from previous state with {len(resume_context.get('completed_slides', []))} completed slides")
        
        start_time = datetime.now()
        failed_slides = []
        
        # Calculate total steps for accurate progress
        self._calculate_total_steps(deck_outline)
        
        try:
            # Phase 0: Initialization
            yield self._emit_progress_event(
                'phase_started',
                phase='initialization',
                message='Initializing deck generation...',
                progress_increment=2
            )
            
            # Phase 1: Generate theme
            yield self._emit_progress_event(
                'phase_started',
                phase='theme_generation',
                message='Creating design theme...',
                progress_increment=3
            )
            
            theme = None
            palette = None
            
            # Sub-step: Generate theme
            yield self._emit_progress_event(
                'substep_started',
                substep='theme_creation',
                message='Analyzing content for theme selection...',
                progress_increment=2
            )
            
            # Run theme generation with heartbeat support
            theme_task = asyncio.create_task(self.theme_generator.generate_theme(deck_outline))
            
            # Emit heartbeats while waiting for theme generation
            while not theme_task.done():
                try:
                    theme = await asyncio.wait_for(theme_task, timeout=15)
                    break
                except asyncio.TimeoutError:
                    # Still running, send heartbeat
                    yield self._emit_progress_event(
                        'heartbeat',
                        message='Creating theme design...',
                        progress_increment=0
                    )
                    logger.debug("Heartbeat sent during theme generation")
            
            # Get result
            theme = await theme_task
            
            yield self._emit_progress_event(
                'substep_completed',
                substep='theme_creation',
                message='Theme created successfully',
                progress_increment=3
            )
            
            # Sub-step: Generate palette
            yield self._emit_progress_event(
                'substep_started',
                substep='palette_generation',
                message='Generating color palette...',
                progress_increment=2
            )
            
            # Run palette generation with heartbeat support
            palette_task = asyncio.create_task(self.theme_generator.generate_palette(deck_outline, theme))
            
            # Emit heartbeats while waiting for palette generation
            while not palette_task.done():
                try:
                    palette = await asyncio.wait_for(palette_task, timeout=15)
                    break
                except asyncio.TimeoutError:
                    # Still running, send heartbeat
                    yield self._emit_progress_event(
                        'heartbeat',
                        message='Generating color palette...',
                        progress_increment=0
                    )
                    logger.debug("Heartbeat sent during palette generation")
            
            # Get result
            palette = await palette_task
            
            yield self._emit_progress_event(
                'theme_generated',
                theme=theme,
                palette=palette,
                message='Theme and palette ready',
                progress_increment=3
            )
            
            if not theme or not palette:
                raise OrchestrationError("Failed to generate theme")
            
            # Phase 2: Process media if needed
            if deck_outline.slides:
                all_media = []
                for slide in deck_outline.slides:
                    if hasattr(slide, 'taggedMedia') and slide.taggedMedia:
                        all_media.extend(slide.taggedMedia)
                
                if all_media:
                    yield self._emit_progress_event(
                        'phase_started',
                        phase='media_processing',
                        total_items=len(all_media),
                        message=f'Processing {len(all_media)} media items...',
                        progress_increment=2
                    )
                    
                    processed_media = await self.media_processor.process(all_media)
                    
                    yield self._emit_progress_event(
                        'media_processed',
                        processed_count=len(processed_media),
                        media=processed_media,
                        message='Media processing complete',
                        progress_increment=8
                    )
            
            # Phase 3: Generate slides in parallel
            yield self._emit_progress_event(
                'phase_started',
                phase='slide_generation',
                total_slides=len(deck_outline.slides),
                max_parallel=options.max_parallel,
                message=f'Generating {len(deck_outline.slides)} slides...',
                progress_increment=0  # Progress handled per slide
            )
            
            # Create enhanced slide generator that emits sub-events
            async for event in self._generate_slides_phase_enhanced(
                deck_outline, deck_id, theme, palette, options
            ):
                yield event
                if event.type == 'error':
                    failed_slides.append(event.data.get('slide_index'))
            
            # Phase 4: Finalization
            yield self._emit_progress_event(
                'phase_started',
                phase='finalization',
                message='Finalizing deck...',
                progress_increment=2
            )
            
            elapsed = (datetime.now() - start_time).total_seconds()
            
            if failed_slides:
                yield self._emit_progress_event(
                    'deck_completed_with_errors',
                    deck_id=deck_id,
                    total_slides=len(deck_outline.slides),
                    failed_slides=failed_slides,
                    elapsed_seconds=elapsed,
                    message=f'Deck completed with {len(failed_slides)} errors',
                    progress_increment=3
                )
            else:
                yield self._emit_progress_event(
                    'deck_completed',
                    deck_id=deck_id,
                    total_slides=len(deck_outline.slides),
                    elapsed_seconds=elapsed,
                    message='Deck generation completed successfully!',
                    progress_increment=3
                )
                
        except Exception as e:
            logger.error(f"Deck generation failed: {str(e)}")
            yield GenerationEvent.error(-1, str(e))
    
    def _calculate_total_steps(self, deck_outline: DeckOutline):
        """Calculate total steps for accurate progress tracking"""
        # Base steps: init(1) + theme(2) + media(1) + finalize(1)
        base_steps = 5
        
        # Each slide has 5 sub-steps
        slide_steps = len(deck_outline.slides) * 5
        
        self.total_steps = base_steps + slide_steps
        self.completed_steps = 0
        
    def _emit_progress_event(
        self,
        event_type: str,
        progress_increment: int = 0,
        **data
    ) -> GenerationEvent:
        """Emit a progress event with calculated percentage"""
        if progress_increment > 0:
            self.completed_steps += progress_increment
            
        # Calculate overall progress
        progress_percentage = min(100, int((self.completed_steps / self.total_steps) * 100))
        
        return GenerationEvent(
            type=event_type,
            timestamp=datetime.now(),
            data={
                **data,
                'progress': progress_percentage,
                'completed_steps': self.completed_steps,
                'total_steps': self.total_steps
            }
        )
    
    async def _generate_slides_phase_enhanced(
        self,
        deck_outline: DeckOutline,
        deck_id: str,
        theme: Dict[str, Any],
        palette: Dict[str, Any],
        options: GenerationOptions
    ) -> AsyncIterator[GenerationEvent]:
        """Enhanced slide generation with sub-step progress and pause/resume support"""
        # Create semaphore for parallelism control
        semaphore = asyncio.Semaphore(options.max_parallel)
        
        # Track progress
        completed = 0
        in_progress: Set[int] = set()
        total = len(deck_outline.slides)
        
        # Calculate progress increment per slide
        slide_progress_total = self.phase_weights['slide_generation']
        progress_per_slide = slide_progress_total / total
        
        # Create heartbeat mechanism to prevent frontend timeout
        heartbeat_task = None
        heartbeat_event = asyncio.Event()
        heartbeat_queue = asyncio.Queue()
        
        async def heartbeat_worker():
            """Emit heartbeat events every 20 seconds to prevent frontend timeout"""
            try:
                while not heartbeat_event.is_set():
                    await asyncio.sleep(20)  # Send heartbeat every 20 seconds
                    if not heartbeat_event.is_set():
                        heartbeat_event_obj = self._emit_progress_event(
                            'heartbeat',
                            message='Processing slides...',
                            progress_increment=0  # Don't increment progress
                        )
                        await heartbeat_queue.put(heartbeat_event_obj)
                        logger.debug(f"Heartbeat queued for deck {deck_id}")
            except asyncio.CancelledError:
                logger.debug("Heartbeat task cancelled")
                pass
        
        # Start heartbeat task
        heartbeat_task = asyncio.create_task(heartbeat_worker())
        
        # Check for resume context
        completed_slides = set()
        if self.is_resuming and self.resume_context:
            completed_slides = self.resume_context.get('completed_slides', set())
            completed = len(completed_slides)
            logger.info(f"Resuming with {completed} slides already completed: {completed_slides}")
        
        # Create tasks
        tasks = []
        for i, slide_outline in enumerate(deck_outline.slides):
            # Skip already completed slides when resuming
            if i in completed_slides:
                logger.info(f"Skipping already completed slide {i + 1}")
                continue
                
            task = asyncio.create_task(
                self._generate_slide_with_progress(
                    slide_outline, i, deck_outline, deck_id,
                    theme, palette, semaphore, in_progress, 
                    options, progress_per_slide
                )
            )
            
            # Register task with pause/resume manager
            task_id = f"{self.generation_id}_slide_{i}"
            if self.generation_id:
                pause_resume_manager.register_task(self.generation_id, task_id, task)
                
            # Add done callback to unregister task
            def make_callback(tid):
                def callback(future):
                    if self.generation_id:
                        pause_resume_manager.unregister_task(self.generation_id, tid)
                return callback
            
            task.add_done_callback(make_callback(task_id))
            tasks.append((i, task))
        
        # Process as they complete
        try:
            for i, task in tasks:
                # Check for heartbeat events while waiting for task
                while not task.done():
                    try:
                        # Check for heartbeat with short timeout
                        heartbeat_event_obj = await asyncio.wait_for(
                            heartbeat_queue.get(), 
                            timeout=0.1
                        )
                        yield heartbeat_event_obj
                    except asyncio.TimeoutError:
                        # No heartbeat, continue waiting for task
                        await asyncio.sleep(0.1)
                
                try:
                    events = await task
                    
                    for event in events:
                        # Add slide-level metadata
                        if 'slide_index' not in event.data:
                            event.data['slide_index'] = i
                        event.data['slides_completed'] = completed
                        event.data['slides_total'] = total
                        event.data['slides_in_progress'] = len(in_progress)
                        
                        # Update tracking
                        if event.type == 'slide_started':
                            in_progress.add(i)
                        elif event.type in ['slide_generated', 'completed']:
                            completed += 1
                            in_progress.discard(i)
                        elif event.type in ['error', 'slide_error', 'slide_skipped']:
                            in_progress.discard(i)
                            
                        yield event
                        
                        # Also check for heartbeats after each event
                        try:
                            heartbeat_event_obj = await asyncio.wait_for(
                                heartbeat_queue.get(), 
                                timeout=0.01
                            )
                            yield heartbeat_event_obj
                        except asyncio.TimeoutError:
                            pass
                        
                except Exception as e:
                    logger.error(f"Task {i} failed: {str(e)}")
                    in_progress.discard(i)
                    yield self._emit_progress_event(
                        'error',
                        slide_index=i,
                        error=str(e),
                        message=f'Slide {i + 1} failed'
                    )
        finally:
            # Stop heartbeat task
            heartbeat_event.set()
            if heartbeat_task:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass
    
    async def _generate_slide_with_progress(
        self,
        slide_outline: Any,
        index: int,
        deck_outline: DeckOutline,
        deck_id: str,
        theme: Dict[str, Any],
        palette: Dict[str, Any],
        semaphore: asyncio.Semaphore,
        in_progress: Set[int],
        options: GenerationOptions,
        progress_per_slide: float
    ) -> List[GenerationEvent]:
        """Generate a single slide with detailed progress tracking and cancellation support"""
        events = []
        
        # Sub-step progress for this slide (5 steps total)
        step_progress = progress_per_slide / 5
        
        async with semaphore:
            try:
                # Check for cancellation before starting
                if asyncio.current_task().cancelled():
                    logger.info(f"Slide {index + 1} generation cancelled before start")
                    return events
                    
                # Update slide state in pause/resume manager
                if self.generation_id:
                    await pause_resume_manager.update_slide_state(
                        self.generation_id, index, "in_progress"
                    )

                # Remove artificial delays - let natural parallelism handle timing
                # Delays were causing sequential processing even with parallel infrastructure
                
                # Step 1: Start
                events.append(self._emit_progress_event(
                    'slide_started',
                    slide_index=index,
                    slide_title=slide_outline.title,
                    message=f'Starting slide {index + 1}: {slide_outline.title}',
                    progress_increment=int(step_progress)
                ))
                
                try:
                    # Step 2: Prepare context
                    events.append(self._emit_progress_event(
                        'slide_substep',
                        slide_index=index,
                        substep='preparing_context',
                        message=f'Preparing context for slide {index + 1}',
                        progress_increment=int(step_progress)
                    ))
                    
                    # Create context
                    tagged_media_for_slide = self._get_slide_media(slide_outline)
                    context = SlideContext(
                        outline=slide_outline,
                        index=index,
                        deck_title=deck_outline.title,
                        theme=theme,
                        palette=palette,
                        style_manifesto=self._create_style_manifesto(theme, palette),
                        tagged_media=tagged_media_for_slide,
                        deck_id=deck_id
                    )
                    
                    # Step 3: RAG lookup
                    events.append(self._emit_progress_event(
                        'slide_substep',
                        slide_index=index,
                        substep='rag_lookup',
                        message=f'Finding best design patterns for slide {index + 1}',
                        progress_increment=int(step_progress)
                    ))
                    
                    # Step 4: AI Generation
                    events.append(self._emit_progress_event(
                        'slide_substep',
                        slide_index=index,
                        substep='ai_generation',
                        message=f'Generating content for slide {index + 1}',
                        progress_increment=int(step_progress)
                    ))
                    
                    # Generate with timeout
                    slide_data = await asyncio.wait_for(
                        self.slide_generator.generate(context),
                        timeout=options.timeout_seconds
                    )
                    
                    # Step 5: Saving
                    events.append(self._emit_progress_event(
                        'slide_substep',
                        slide_index=index,
                        substep='saving',
                        message=f'Saving slide {index + 1}',
                        progress_increment=int(step_progress)
                    ))
                    
                    # Save immediately
                    await self.persistence.save_slide(deck_id, index, slide_data)
                    
                    # Emit completion with proper event type
                    completion_event = GenerationEvent(
                        type='slide_generated',  # Changed from 'completed' to match expected type
                        timestamp=datetime.now(),
                        data={
                            'slide_index': index,
                            'slide_data': slide_data,
                            'message': f'Completed slide {index + 1}'
                        }
                    )
                    events.append(completion_event)
                    
                except asyncio.CancelledError:
                    # Handle clean cancellation
                    logger.info(f"Slide {index + 1} generation cancelled during processing")
                    if self.generation_id:
                        await pause_resume_manager.update_slide_state(
                            self.generation_id, index, "cancelled"
                        )
                    raise  # Re-raise to properly cancel the task
                    
                except asyncio.TimeoutError:
                    error_msg = f"Slide {index + 1} timed out after {options.timeout_seconds}s"
                    logger.error(error_msg)
                    events.append(self._emit_progress_event(
                        'slide_error',
                        slide_index=index,
                        error=error_msg,
                        message=error_msg,
                        progress_increment=int(step_progress)  # Still increment to show progress
                    ))
                    
                except Exception as e:
                    error_msg = f"Slide {index + 1} failed: {str(e)}"
                    logger.error(error_msg)
                    
                    # Check if we should skip this slide
                    if should_skip_slide(e):
                        logger.info(f"Skipping slide {index + 1} and continuing")
                        events.append(self._emit_progress_event(
                            'slide_skipped',
                            slide_index=index,
                            reason=str(e),
                            message=f'Skipping slide {index + 1}',
                            progress_increment=int(step_progress)
                        ))
                    else:
                        events.append(self._emit_progress_event(
                            'slide_error',
                            slide_index=index,
                            error=error_msg,
                            message=error_msg,
                            progress_increment=int(step_progress)
                        ))
                        
                # Mark slide as completed in pause/resume manager
                if self.generation_id:
                    await pause_resume_manager.update_slide_state(
                        self.generation_id, index, "completed",
                        data=slide_data
                    )
                    
            except asyncio.CancelledError:
                # Handle clean cancellation
                logger.info(f"Slide {index + 1} generation cancelled")
                if self.generation_id:
                    await pause_resume_manager.update_slide_state(
                        self.generation_id, index, "cancelled"
                    )
                raise  # Re-raise to properly cancel the task
                
            except asyncio.TimeoutError:
                error_msg = f"Slide {index + 1} timed out after {options.timeout_seconds}s"
                logger.error(error_msg)
                events.append(self._emit_progress_event(
                    'slide_error',
                    slide_index=index,
                    error=error_msg,
                    message=error_msg,
                    progress_increment=int(step_progress)  # Still increment to show progress
                ))
                
            except Exception as e:
                error_msg = f"Slide {index + 1} failed: {str(e)}"
                logger.error(error_msg)
                
                # Check if we should skip this slide
                if should_skip_slide(e):
                    logger.info(f"Skipping slide {index + 1} and continuing")
                    events.append(self._emit_progress_event(
                        'slide_skipped',
                        slide_index=index,
                        reason=str(e),
                        message=f'Skipping slide {index + 1}',
                        progress_increment=int(step_progress)
                    ))
                else:
                    events.append(self._emit_progress_event(
                        'slide_error',
                        slide_index=index,
                        error=error_msg,
                        message=error_msg,
                        progress_increment=int(step_progress)
                    ))
                    
        return events
    
    def _calculate_progress(self, completed: int, in_progress: int, total: int) -> int:
        """Calculate overall progress percentage"""
        if total == 0:
            return 100
            
        # Give partial credit for in-progress slides
        effective_completed = completed + (in_progress * 0.5)
        return int((effective_completed / total) * 100)
    
    def _create_style_manifesto(self, theme: Dict[str, Any], palette: Dict[str, Any]) -> str:
        """Create style manifesto from theme and palette"""
        parts = []
        
        # Theme info
        parts.append(f"Theme: {theme.get('theme_name', 'Modern')}")
        parts.append(f"Philosophy: {theme.get('design_philosophy', 'Clean and professional')}")
        
        # Colors
        if palette:
            colors = [f"{k}: {v}" for k, v in palette.items() if k != 'name']
            parts.append(f"Colors: {', '.join(colors[:3])}")
        
        return " | ".join(parts)
    
    def _get_slide_media(self, slide_outline: Any) -> List[Dict[str, Any]]:
        """Extract media from slide outline"""
        print(f"[DECK ORCHESTRATOR] Checking slide_outline type: {type(slide_outline)}")
        print(f"[DECK ORCHESTRATOR] slide_outline attributes: {[attr for attr in dir(slide_outline) if not attr.startswith('_')][:10]}")
        if hasattr(slide_outline, 'taggedMedia') and slide_outline.taggedMedia:
            # Convert to dict if needed
            media_list = []
            for media in slide_outline.taggedMedia:
                if hasattr(media, 'model_dump'):
                    media_dict = media.model_dump()
                else:
                    media_dict = media
                media_list.append(media_dict)
            
            print(f"[DECK ORCHESTRATOR] Extracted {len(media_list)} tagged media items for slide")
            for media in media_list:
                print(f"[DECK ORCHESTRATOR] - {media.get('filename')} - URL: {media.get('previewUrl', '')[:100] if media.get('previewUrl') else 'NO URL'}")
            
            return media_list
        print(f"[DECK ORCHESTRATOR] No tagged media found for slide")
        # Also check if slide has taggedMedia attribute at all
        if hasattr(slide_outline, 'taggedMedia'):
            print(f"[DECK ORCHESTRATOR] Slide has taggedMedia attribute but it's empty/None: {slide_outline.taggedMedia}")
        else:
            print(f"[DECK ORCHESTRATOR] Slide doesn't have taggedMedia attribute at all!")
        return [] 