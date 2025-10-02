"""
Infrastructure implementations for generation system.

Provides concrete implementations of infrastructure interfaces.
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional, Callable, AsyncIterator
import json
import os
import time

from agents.core.interfaces import (
    IRAGService, IAIClient, IThemeGenerator,
    IPersistence, IImageService, SlideContext
)
from agents.rag.slide_context_retriever import SlideContextRetriever
from agents.ai.clients import get_client, invoke
from agents.persistence.deck_persistence import DeckPersistence
from services.image_storage_service import ImageStorageService
from agents.generation.theme_style_manager import ThemeStyleManager
from agents.generation.config import get_config

logger = logging.getLogger(__name__)


class RAGService(IRAGService):
    """RAG service implementation using SlideContextRetriever"""
    
    def __init__(self):
        self.retriever = SlideContextRetriever()
        
    async def get_context(self, context: SlideContext) -> Dict[str, Any]:
        """Get RAG context for slide"""
        # SlideContextRetriever is synchronous, so we run it in executor
        loop = asyncio.get_event_loop()
        
        return await loop.run_in_executor(
            None,
            self.retriever.get_slide_context,
            context.outline,
            context.index,
            {
                'title': context.deck_title,
                'slides': [{'title': s.title} for s in [context.outline]]  # Simplified
            },
            context.theme,
            context.palette
        )


class AIClient(IAIClient):
    """AI client implementation using existing AI infrastructure"""
    
    def __init__(self, model: Optional[str] = None):
        config = get_config()
        self.model = model or config.ai.model
        
    async def generate(
        self,
        messages: List[Dict[str, str]],
        response_model: Any,
        max_tokens: int = 4000,
        temperature: float = 0.7
    ) -> Any:
        """Generate response from AI"""
        # Get client
        client, model_name = get_client(self.model)
        
        # Run blocking invoke in executor
        loop = asyncio.get_event_loop()
        
        return await loop.run_in_executor(
            None,
            invoke,
            client,
            model_name,
            messages,
            response_model,
            max_tokens,
            temperature,
            None,  # deck_uuid
            True,  # slide_generation
            0      # slide_index
        )


class ThemeGenerator(IThemeGenerator):
    """Theme generator implementation"""
    
    def __init__(self, ai_client: IAIClient):
        self.ai_client = ai_client
        self.theme_manager = ThemeStyleManager(
            available_fonts=[],  # Will be loaded
            all_fonts_list=[]    # Will be loaded
        )
        
    async def generate_theme(self, deck_outline: Any) -> Dict[str, Any]:
        """Generate theme for deck"""
        # Use existing theme manager
        global_theme = {"system": "AI-generated"}
        
        # Run blocking operation in executor
        loop = asyncio.get_event_loop()
        theme = await loop.run_in_executor(
            None,
            self.theme_manager.generate_theme,
            deck_outline,
            global_theme
        )
        
        # Convert to dict if needed
        if hasattr(theme, 'to_dict'):
            return theme.to_dict()
        return theme
        
    async def generate_palette(self, deck_outline: Any, theme: Dict[str, Any]) -> Dict[str, Any]:
        """Generate color palette"""
        # Run blocking operation in executor
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self.theme_manager.generate_palette,
            deck_outline,
            theme
        )


class Persistence(IPersistence):
    """Persistence implementation using DeckPersistence"""
    
    def __init__(self):
        self.deck_persistence = DeckPersistence()
        
    async def save_slide(self, deck_id: str, slide_index: int, slide_data: Dict[str, Any]) -> None:
        """Save slide data"""
        # Call async method directly
        await self.deck_persistence.update_slide(
            deck_id,
            slide_index,
            slide_data
        )
        
    async def save_deck_metadata(self, deck_id: str, metadata: Dict[str, Any]) -> None:
        """Save deck metadata"""
        # Call async method directly
        await self.deck_persistence.save_deck(
            deck_id,
            metadata
        )


class ImageService(IImageService):
    """Image service implementation"""
    
    def __init__(self):
        self.storage_service = ImageStorageService()
        
    async def search_images(self, queries: List[str]) -> Dict[str, List[Dict[str, Any]]]:
        """Search for images"""
        # This would integrate with image search services
        # For now, return empty results
        return {query: [] for query in queries}
        
    async def upload_image(self, image_data: bytes, filename: str) -> str:
        """Upload image and return URL"""
        async with self.storage_service as storage:
            result = await storage.upload_image(
                image_data=image_data,
                filename=filename,
                content_type='image/png'  # Default, should detect
            )
            
            if 'error' in result:
                raise Exception(f"Upload failed: {result['error']}")
                
            return result['url'] 


class ThrottledEventEmitter:
    """
    Event emitter that throttles progress updates to prevent overwhelming the frontend.
    
    Features:
    - Batches rapid progress updates
    - Ensures minimum time between updates
    - Always sends important events immediately (errors, completions)
    """
    
    def __init__(self, min_interval: float = 0.1):
        """
        Initialize throttled event emitter.
        
        Args:
            min_interval: Minimum seconds between progress updates (default: 0.1)
        """
        self.min_interval = min_interval
        self.last_emit_time = 0
        self.pending_progress_event = None
        self.progress_lock = asyncio.Lock()
        
        # Event types that should always be sent immediately
        self.priority_events = {
            'error', 'slide_error', 'deck_complete',
            'theme_generated', 'phase_started',
            'slide_generated', 'slide_started'
        }
    
    async def emit(self, event: GenerationEvent) -> Optional[GenerationEvent]:
        """
        Emit an event, potentially throttling progress updates.
        
        Args:
            event: The event to emit
            
        Returns:
            The event if it should be emitted now, None if throttled
        """
        # Always emit priority events immediately
        if event.type in self.priority_events:
            self.last_emit_time = time.time()
            return event
            
        # For progress events, check throttling
        if 'progress' in event.data:
            async with self.progress_lock:
                current_time = time.time()
                time_since_last = current_time - self.last_emit_time
                
                # If enough time has passed, emit immediately
                if time_since_last >= self.min_interval:
                    self.last_emit_time = current_time
                    self.pending_progress_event = None
                    return event
                else:
                    # Store as pending and wait
                    self.pending_progress_event = event
                    
                    # Schedule emission after the remaining interval
                    remaining_time = self.min_interval - time_since_last
                    await asyncio.sleep(remaining_time)
                    
                    # Emit the most recent pending event
                    if self.pending_progress_event:
                        self.last_emit_time = time.time()
                        event_to_emit = self.pending_progress_event
                        self.pending_progress_event = None
                        return event_to_emit
                    
        # For other events, emit immediately
        return event
        
    async def stream_with_throttling(
        self,
        event_generator: AsyncIterator[GenerationEvent]
    ) -> AsyncIterator[GenerationEvent]:
        """
        Stream events with throttling applied.
        
        Args:
            event_generator: The original event generator
            
        Yields:
            Throttled events
        """
        async for event in event_generator:
            emitted_event = await self.emit(event)
            if emitted_event:
                yield emitted_event
                
        # Emit any final pending progress event
        async with self.progress_lock:
            if self.pending_progress_event:
                yield self.pending_progress_event 