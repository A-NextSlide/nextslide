"""
Clean deck composer implementation.

Main entry point for deck generation that:
- Coordinates all generation phases
- Provides clean API
- Handles SSE streaming
- Manages lifecycle
"""

import logging
from typing import Dict, Any, AsyncIterator, Optional
import uuid

from agents.core.interfaces import (
    GenerationEvent, GenerationOptions,
    IDeckOrchestrator
)
from agents.generation.slide_generator_clean import SlideGenerator
from agents.generation.deck_orchestrator_clean import DeckOrchestrator
from agents.generation.media_processor_clean import MediaProcessor
from agents.generation.infrastructure import (
    RAGService, AIClient, ThemeGenerator,
    Persistence, ImageService, ThrottledEventEmitter
)
from agents.generation.config import get_config
from models.requests import DeckOutline

logger = logging.getLogger(__name__)


class DeckComposer:
    """
    Clean deck composer that coordinates the entire generation process.
    
    This is the main entry point for deck generation.
    """
    
    def __init__(self, registry: Any, config: Optional[Any] = None):
        """Initialize with component registry and configuration"""
        self.registry = registry
        self.config = config or get_config()
        
        # Initialize infrastructure services
        self.rag_service = RAGService()
        self.ai_client = AIClient()
        self.theme_generator = ThemeGenerator(self.ai_client)
        self.persistence = Persistence()
        self.image_service = ImageService()
        
        # Initialize event throttler
        self.event_throttler = ThrottledEventEmitter(min_interval=0.1)
        
        # Initialize core components
        self.slide_generator = SlideGenerator(
            rag_service=self.rag_service,
            ai_client=self.ai_client,
            registry=registry,
            config=self.config
        )
        
        self.media_processor = MediaProcessor(
            image_service=self.image_service,
            config=self.config
        )
        
        # Initialize orchestrator
        self.orchestrator = DeckOrchestrator(
            slide_generator=self.slide_generator,
            theme_generator=self.theme_generator,
            media_processor=self.media_processor,
            persistence=self.persistence,
            config=self.config
        )
        
        logger.info("DeckComposer initialized with clean architecture")
    
    async def compose_deck(
        self,
        deck_outline: DeckOutline,
        deck_id: Optional[str] = None,
        **kwargs
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Compose a deck from outline.
        
        Args:
            deck_outline: The deck outline to generate from
            deck_id: Optional deck ID (will generate if not provided)
            **kwargs: Additional options
                - max_parallel: Maximum parallel slides (default: 4)
                - timeout_seconds: Timeout per slide (default: 60)
                - async_images: Enable async image search (default: True)
                
        Yields:
            SSE-formatted events for streaming
        """
        # Generate deck ID if not provided
        if not deck_id:
            deck_id = str(uuid.uuid4())
            
        logger.info(f"Starting deck composition for '{deck_outline.title}' (ID: {deck_id})")
        
        # Create options from kwargs
        options = GenerationOptions(
            max_parallel=kwargs.get('max_parallel', 4),
            timeout_seconds=kwargs.get('timeout_seconds', 60),
            max_retries=kwargs.get('max_retries', 3),
            delay_between_slides=kwargs.get('delay_between_slides', 0.5),
            async_images=kwargs.get('async_images', True)
        )
        
        # Validate input
        self._validate_outline(deck_outline)
        
        # Start orchestration
        try:
            async for event in self.orchestrator.orchestrate(deck_outline, deck_id, options):
                # Convert to SSE format
                sse_event = self._format_sse_event(event)
                yield sse_event
                
        except Exception as e:
            logger.error(f"Deck composition failed: {str(e)}")
            # Emit error event
            error_event = GenerationEvent.error(-1, str(e))
            yield self._format_sse_event(error_event)
    
    def _validate_outline(self, deck_outline: DeckOutline) -> None:
        """Validate deck outline before processing"""
        if not deck_outline.title:
            raise ValueError("Deck outline must have a title")
            
        if not deck_outline.slides:
            raise ValueError("Deck outline must have at least one slide")
            
        # Validate each slide
        for i, slide in enumerate(deck_outline.slides):
            if not slide.title:
                raise ValueError(f"Slide {i + 1} must have a title")
            if not slide.content:
                raise ValueError(f"Slide {i + 1} must have content")
    
    def _format_sse_event(self, event: GenerationEvent) -> Dict[str, Any]:
        """Format event for SSE streaming"""
        # Debug logging
        logger.debug(f"[SSE FORMAT] Processing event type: {event.type}")
        if hasattr(event, 'data') and 'slide_data' in event.data:
            slide_data = event.data.get('slide_data', {})
            if 'availableImages' in slide_data:
                logger.debug(f"[SSE FORMAT] Event slide_data has {len(slide_data['availableImages'])} availableImages")
        
        # Map internal event types to API event types
        event_type_map = {
            'phase_started': 'phase_update',
            'theme_generated': 'theme_generated',
            'media_processed': 'media_processed',
            'started': 'slide_started',
            'completed': 'slide_generated',
            'slide_generated': 'slide_generated',  # Add direct mapping
            'error': 'slide_error',
            'slide_skipped': 'slide_skipped',
            'deck_complete': 'deck_complete'  # Single completion event
        }
        
        api_event_type = event_type_map.get(event.type, event.type)
        
        # Build SSE event
        sse_data = {
            'type': api_event_type,
            'timestamp': event.timestamp.isoformat(),
            **event.data
        }
        
        # Add specific fields based on event type
        if api_event_type == 'slide_generated':
            # Ensure slide data is properly formatted
            slide_data = event.data.get('slide_data', {})
            sse_data['slide_index'] = event.data.get('slide_index', 0)
            sse_data['slide_data'] = slide_data
            sse_data['message'] = f"Generated slide {event.data.get('slide_index', 0) + 1}"
            
            # Debug logging for available images
            if 'availableImages' in slide_data:
                logger.debug(f"[SSE DEBUG] Slide {sse_data['slide_index']} has {len(slide_data['availableImages'])} available images")
                if slide_data['availableImages']:
                    logger.debug(f"[SSE DEBUG] First image: {slide_data['availableImages'][0].get('url', 'No URL')[:100]}...")
            else:
                logger.debug(f"[SSE DEBUG] Slide {sse_data['slide_index']} has NO availableImages field")
            
        elif api_event_type == 'deck_complete':
            sse_data['success'] = 'with_errors' not in event.type
            sse_data['message'] = 'Deck generation completed'
            
        return sse_data


async def compose_deck_stream(
    deck_outline: DeckOutline,
    registry: Any,
    deck_uuid: str,
    **options
) -> AsyncIterator[Dict[str, Any]]:
    """
    Convenience function for streaming deck composition.
    
    This maintains backward compatibility with existing code.
    """
    composer = DeckComposer(registry)
    
    async for event in composer.compose_deck(
        deck_outline=deck_outline,
        deck_id=deck_uuid,
        **options
    ):
        yield event 