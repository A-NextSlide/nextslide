"""
Event bus for decoupling components through events.
"""

import asyncio
from typing import Dict, List, Callable, Any, Optional
from collections import defaultdict
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class EventBus:
    """Simple event bus for decoupling components."""
    
    def __init__(self):
        self._handlers: Dict[str, List[Callable]] = defaultdict(list)
        self._async_handlers: Dict[str, List[Callable]] = defaultdict(list)
    
    def subscribe(self, event_type: str, handler: Callable):
        """Subscribe to an event type."""
        if asyncio.iscoroutinefunction(handler):
            self._async_handlers[event_type].append(handler)
        else:
            self._handlers[event_type].append(handler)
        logger.debug(f"Subscribed handler to event type: {event_type}")
    
    def unsubscribe(self, event_type: str, handler: Callable):
        """Unsubscribe from an event type."""
        if handler in self._handlers[event_type]:
            self._handlers[event_type].remove(handler)
        if handler in self._async_handlers[event_type]:
            self._async_handlers[event_type].remove(handler)
    
    async def emit(self, event_type: str, data: Dict[str, Any]):
        """Emit an event to all subscribers."""
        logger.debug(f"Emitting event: {event_type}")
        
        # Handle sync handlers
        for handler in self._handlers[event_type]:
            try:
                handler(data)
            except Exception as e:
                logger.error(f"Error in sync handler for {event_type}: {e}")
        
        # Handle async handlers
        tasks = []
        for handler in self._async_handlers[event_type]:
            task = asyncio.create_task(self._handle_async(handler, data, event_type))
            tasks.append(task)
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _handle_async(self, handler: Callable, data: Dict[str, Any], event_type: str):
        """Handle async event handler with error handling."""
        try:
            await handler(data)
        except Exception as e:
            logger.error(f"Error in async handler for {event_type}: {e}")


# Global event bus instance
_event_bus: Optional[EventBus] = None


def get_event_bus() -> EventBus:
    """Get the global event bus instance."""
    global _event_bus
    if _event_bus is None:
        _event_bus = EventBus()
    return _event_bus


# Event type constants
class Events:
    """Event types for the application."""
    
    # Deck events
    DECK_CREATED = "deck.created"
    DECK_UPDATED = "deck.updated"
    DECK_COMPLETED = "deck.completed"
    
    # Slide events
    SLIDE_REQUESTED = "slide.requested"
    SLIDE_STARTED = "slide.started"
    SLIDE_SUBSTEP = "slide.substep"
    SLIDE_GENERATED = "slide.generated"
    SLIDE_SAVED = "slide.saved"
    SLIDE_ERROR = "slide.error"
    
    # Theme events
    THEME_ANALYZED = "theme.analyzed"
    PALETTE_GENERATED = "palette.generated"
    
    # Visual analysis events
    VISUAL_ANALYSIS_STARTED = "visual.analysis.started"
    VISUAL_ANALYSIS_COMPLETED = "visual.analysis.completed"
    VISUAL_FIXES_APPLIED = "visual.fixes.applied"
    
    # Image events
    IMAGE_SEARCH_STARTED = "image.search.started"
    IMAGE_SEARCH_COMPLETED = "image.search.completed"
    IMAGES_APPLIED = "images.applied"
    
    # Progress events
    PROGRESS_UPDATE = "progress.update" 