"""
Core interfaces and contracts for the agents system.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, AsyncIterator
from models.requests import SlideOutline, DeckOutline


class ISlideGenerator(ABC):
    """Interface for slide generation."""
    
    @abstractmethod
    async def generate_slide(
        self,
        context: 'SlideGenerationContext'
    ) -> AsyncIterator[Dict[str, Any]]:
        """Generate a single slide with the given context."""
        pass


class IDeckComposer(ABC):
    """Interface for deck composition."""
    
    @abstractmethod
    async def compose_deck(
        self,
        deck_outline: DeckOutline,
        deck_uuid: str,
        options: 'CompositionOptions'
    ) -> AsyncIterator[Dict[str, Any]]:
        """Compose a complete deck."""
        pass


class IThemeManager(ABC):
    """Interface for theme management."""
    
    @abstractmethod
    async def generate_theme(self, deck_outline: DeckOutline, global_theme: Dict[str, Any]) -> 'ThemeSpec':
        """Generate theme from deck outline."""
        pass
    
    @abstractmethod
    async def generate_palette(self, deck_outline: DeckOutline, theme: 'ThemeSpec') -> Dict[str, Any]:
        """Generate color palette for theme."""
        pass
    
    @abstractmethod
    def create_style_manifesto(self, style_spec: Dict[str, Any]) -> str:
        """Create style manifesto from spec."""
        pass


class IPersistence(ABC):
    """Interface for data persistence."""
    
    @abstractmethod
    async def save_deck(self, deck_data: Dict[str, Any]) -> None:
        """Save deck data."""
        pass
    
    @abstractmethod
    async def update_slide(self, deck_uuid: str, slide_index: int, slide_data: Dict[str, Any]) -> None:
        """Update a specific slide."""
        pass
    
    @abstractmethod
    async def get_deck(self, deck_uuid: str) -> Optional[Dict[str, Any]]:
        """Get deck data."""
        pass


class IRAGRepository(ABC):
    """Interface for RAG context retrieval."""
    
    @abstractmethod
    def get_slide_context(
        self,
        slide_outline: SlideOutline,
        slide_index: int,
        deck_outline: DeckOutline,
        theme: Dict[str, Any],
        palette: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get relevant context for slide generation."""
        pass


class IImageService(ABC):
    """Interface for image management."""
    
    @abstractmethod
    async def search_images(self, queries: List[str]) -> Dict[str, List[Dict[str, Any]]]:
        """Search for images based on queries."""
        pass
    
    @abstractmethod
    async def apply_images(self, slide_id: str, slide_data: Dict[str, Any]) -> bool:
        """Apply pending images to slide."""
        pass 