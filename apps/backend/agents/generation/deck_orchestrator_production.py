"""
Production-ready deck orchestrator with multi-user concurrency control.
Continues generation in background even if user navigates away.
"""

import asyncio
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime

from agents.core.interfaces import ISlideGenerator, IThemeGenerator, IMediaProcessor
from agents.generation.config import GenerationConfig
from agents.generation.exceptions import GenerationError, SlideGenerationError
from agents.generation.concurrency_manager import concurrency_manager
from agents import config
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class DeckOrchestratorProduction:
    """
    Production orchestrator that handles multi-user concurrency.
    Continues generation in background even if user disconnects.
    """
    
    def __init__(
        self,
        slide_generator: ISlideGenerator,
        theme_generator: IThemeGenerator,
        media_processor: IMediaProcessor,
        generation_config: GenerationConfig
    ):
        self.slide_generator = slide_generator
        self.theme_generator = theme_generator
        self.media_processor = media_processor
        self.generation_config = generation_config
    
    async def generate_deck_for_user(
        self,
        user_id: str,
        deck_request: Dict[str, Any],
        generation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a deck for a specific user with concurrency control.
        Continues in background even if user disconnects.
        
        Args:
            user_id: Unique user identifier
            deck_request: Deck generation request
            generation_id: Optional generation ID for tracking
            
        Returns:
            Generated deck data
            
        Raises:
            GenerationError: If generation fails or user has too many active tasks
        """
        if not generation_id:
            generation_id = str(uuid.uuid4())
        
        logger.info(f"Starting deck generation {generation_id} for user {user_id}")
        
        # Check if user can start a new generation
        active_decks = concurrency_manager.get_user_active_decks(user_id)
        if active_decks >= config.MAX_DECKS_PER_USER:
            raise GenerationError(
                f"Too many active deck generations ({active_decks}). "
                f"Maximum allowed: {config.MAX_DECKS_PER_USER}. "
                "Please wait for current decks to complete.",
                retry_after=30
            )
        
        # Acquire resources for deck generation
        deck_task_id = f"{generation_id}_deck"
        acquired = await concurrency_manager.acquire_for_user(user_id, deck_task_id)
        if not acquired:
            raise GenerationError(
                "Unable to start generation. Too many active requests.",
                retry_after=10
            )
        
        try:
            # Set overall timeout for deck generation
            result = await asyncio.wait_for(
                self._generate_deck_internal(
                    user_id=user_id,
                    generation_id=generation_id,
                    deck_request=deck_request
                ),
                timeout=config.DECK_GENERATION_TIMEOUT
            )
            
            logger.info(f"Successfully generated deck {generation_id} for user {user_id}")
            return result
            
        except asyncio.TimeoutError:
            logger.error(
                f"Deck generation {generation_id} timed out after "
                f"{config.DECK_GENERATION_TIMEOUT} seconds"
            )
            raise GenerationError(
                f"Deck generation timed out after {config.DECK_GENERATION_TIMEOUT} seconds"
            )
            
        except Exception as e:
            logger.error(f"Failed to generate deck {generation_id}: {e}")
            raise GenerationError(f"Deck generation failed: {str(e)}")
            
        finally:
            # Always release resources
            await concurrency_manager.release_for_user(user_id, deck_task_id)
    
    async def _generate_deck_internal(
        self,
        user_id: str,
        generation_id: str,
        deck_request: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Internal deck generation logic."""
        # Generate theme (not parallelizable)
        theme = await self._generate_theme_with_timeout(deck_request)
        
        # Generate slides in parallel with user limits
        slides = await self._generate_slides_for_user(
            user_id=user_id,
            generation_id=generation_id,
            slide_requests=deck_request['slides'],
            theme=theme
        )
        
        # Process media for all slides
        processed_slides = await self._process_media_batch(slides)
        
        return {
            'deck_id': deck_request.get('deck_id'),
            'generation_id': generation_id,
            'theme': theme,
            'slides': processed_slides,
            'generated_at': datetime.utcnow().isoformat(),
            'continued_in_background': config.CONTINUE_GENERATION_ON_DISCONNECT
        }
    
    async def _generate_slides_for_user(
        self,
        user_id: str,
        generation_id: str,
        slide_requests: List[Dict[str, Any]],
        theme: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Generate slides with per-user concurrency control."""
        tasks = []
        
        for idx, slide_request in enumerate(slide_requests):
            task = self._generate_single_slide_for_user(
                user_id=user_id,
                generation_id=generation_id,
                slide_idx=idx,
                slide_request=slide_request,
                theme=theme,
                total_slides=len(slide_requests)
            )
            tasks.append(task)
        
        # Wait for all slides
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        slides = []
        errors = []
        
        for idx, result in enumerate(results):
            if isinstance(result, Exception):
                errors.append(f"Slide {idx}: {str(result)}")
                # Add placeholder slide
                slides.append(self._create_error_slide(idx, str(result)))
            else:
                slides.append(result)
        
        if errors and len(errors) == len(results):
            raise GenerationError(f"All slides failed: {'; '.join(errors)}")
        
        return slides
    
    async def _generate_single_slide_for_user(
        self,
        user_id: str,
        generation_id: str,
        slide_idx: int,
        slide_request: Dict[str, Any],
        theme: Dict[str, Any],
        total_slides: int
    ) -> Dict[str, Any]:
        """Generate a single slide with resource acquisition."""
        slide_task_id = f"{generation_id}_slide_{slide_idx}"
        
        # Acquire resources for this slide
        acquired = await concurrency_manager.acquire_for_user(user_id, slide_task_id)
        if not acquired:
            # This shouldn't happen if deck-level check is working
            raise SlideGenerationError(
                f"Cannot generate slide {slide_idx}: too many active tasks"
            )
        
        try:
            # Add timeout for individual slide generation
            result = await asyncio.wait_for(
                self.slide_generator.generate(slide_request, theme),
                timeout=config.SLIDE_GENERATION_TIMEOUT
            )
            
            logger.info(
                f"Generated slide {slide_idx + 1}/{total_slides} "
                f"for generation {generation_id}"
            )
            
            return result
            
        except asyncio.TimeoutError:
            raise SlideGenerationError(
                f"Slide {slide_idx} generation timed out after "
                f"{config.SLIDE_GENERATION_TIMEOUT}s"
            )
            
        finally:
            # Always release slide resources
            await concurrency_manager.release_for_user(user_id, slide_task_id)
    
    async def _generate_theme_with_timeout(
        self,
        deck_request: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate theme with timeout."""
        try:
            return await asyncio.wait_for(
                self.theme_generator.generate(deck_request),
                timeout=30  # Theme generation should be quick
            )
        except asyncio.TimeoutError:
            logger.error("Theme generation timed out")
            # Return default theme
            return {
                'palette': {
                    'primary': '#1a1a1a',
                    'secondary': '#ffffff',
                    'accent': '#0066cc'
                },
                'fonts': {
                    'heading': 'Montserrat',
                    'body': 'Poppins'
                }
            }
    
    async def _process_media_batch(
        self,
        slides: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Process media for all slides in batch."""
        # Extract all media URLs
        media_urls = []
        for slide in slides:
            for component in slide.get('components', []):
                if component.get('type') == 'Image':
                    media_urls.append(component['props']['url'])
        
        if not media_urls:
            return slides
        
        # Process in batch
        try:
            processed_urls = await self.media_processor.process_batch(media_urls)
            
            # Update slides with processed URLs
            url_map = dict(zip(media_urls, processed_urls))
            
            for slide in slides:
                for component in slide.get('components', []):
                    if component.get('type') == 'Image':
                        old_url = component['props']['url']
                        if old_url in url_map:
                            component['props']['url'] = url_map[old_url]
            
            return slides
            
        except Exception as e:
            logger.error(f"Media processing failed: {e}")
            # Return slides with original URLs
            return slides
    
    def _create_error_slide(self, idx: int, error: str) -> Dict[str, Any]:
        """Create a placeholder slide for errors."""
        return {
            'slide_number': idx + 1,
            'components': [
                {
                    'type': 'TiptapTextBlock',
                    'props': {
                        'content': f'<h1>Slide {idx + 1} Generation Failed</h1>'
                                  f'<p>Error: {error}</p>',
                        'x': 100,
                        'y': 400,
                        'width': 1720,
                        'fontSize': 48
                    }
                }
            ]
        }
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current concurrency statistics."""
        return concurrency_manager.get_stats() 