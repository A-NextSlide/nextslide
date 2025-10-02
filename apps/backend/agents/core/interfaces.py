"""
Clean interfaces for the generation system.

Design principles:
- Single responsibility
- Small, focused interfaces
- Clear contracts
- Testability
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, AsyncIterator
from dataclasses import dataclass
from datetime import datetime


# ============= Data Models =============

@dataclass
class SlideContext:
    """Everything needed to generate a slide"""
    outline: 'SlideOutline'
    index: int
    deck_title: str
    theme: Dict[str, Any]
    palette: Dict[str, Any]
    style_manifesto: str
    tagged_media: List[Dict[str, Any]]
    deck_id: str
    
    @property
    def is_title_slide(self) -> bool:
        return self.index == 0


@dataclass 
class GenerationEvent:
    """Event emitted during generation"""
    type: str  # 'started', 'progress', 'completed', 'error'
    timestamp: datetime
    data: Dict[str, Any]
    
    @classmethod
    def started(cls, slide_index: int, title: str) -> 'GenerationEvent':
        return cls(
            type='started',
            timestamp=datetime.now(),
            data={'slide_index': slide_index, 'title': title}
        )
    
    @classmethod
    def completed(cls, slide_index: int, slide_data: Dict[str, Any]) -> 'GenerationEvent':
        return cls(
            type='completed', 
            timestamp=datetime.now(),
            data={'slide_index': slide_index, 'slide_data': slide_data}
        )
    
    @classmethod
    def error(cls, slide_index: int, error: str) -> 'GenerationEvent':
        return cls(
            type='error',
            timestamp=datetime.now(), 
            data={'slide_index': slide_index, 'error': error}
        )


@dataclass
class GenerationOptions:
    """Options for generation process"""
    max_parallel: int = 4
    timeout_seconds: int = 60
    max_retries: int = 3
    delay_between_slides: float = 0.5
    async_images: bool = True


# ============= Core Interfaces =============

class ISlideGenerator(ABC):
    """Generates individual slides"""
    
    @abstractmethod
    async def generate(self, context: SlideContext) -> Dict[str, Any]:
        """Generate a single slide"""
        pass


class IThemeGenerator(ABC):
    """Generates themes and palettes"""
    
    @abstractmethod
    async def generate_theme(self, deck_outline: 'DeckOutline') -> Dict[str, Any]:
        """Generate theme for deck"""
        pass
    
    @abstractmethod
    async def generate_palette(self, deck_outline: 'DeckOutline', theme: Dict[str, Any]) -> Dict[str, Any]:
        """Generate color palette"""
        pass


class IMediaProcessor(ABC):
    """Processes media files"""
    
    @abstractmethod
    async def process(self, media_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process media items (upload, validate, etc)"""
        pass


class IDeckOrchestrator(ABC):
    """Orchestrates deck generation"""
    
    @abstractmethod
    async def orchestrate(
        self,
        deck_outline: 'DeckOutline',
        deck_id: str,
        options: GenerationOptions
    ) -> AsyncIterator[GenerationEvent]:
        """Orchestrate complete deck generation"""
        pass


# ============= Infrastructure Interfaces =============

class IRAGService(ABC):
    """Retrieves relevant context for generation"""
    
    @abstractmethod
    async def get_context(self, context: SlideContext) -> Dict[str, Any]:
        """Get RAG context for slide"""
        pass


class IAIClient(ABC):
    """Interface to AI models"""
    
    @abstractmethod
    async def generate(
        self,
        messages: List[Dict[str, str]],
        response_model: Any,
        max_tokens: int = 4000,
        temperature: float = 0.7
    ) -> Any:
        """Generate response from AI"""
        pass


class IPersistence(ABC):
    """Persists generation results"""
    
    @abstractmethod
    async def save_slide(self, deck_id: str, slide_index: int, slide_data: Dict[str, Any]) -> None:
        """Save slide data"""
        pass
    
    @abstractmethod
    async def save_deck_metadata(self, deck_id: str, metadata: Dict[str, Any]) -> None:
        """Save deck metadata"""
        pass


class IImageService(ABC):
    """Manages images"""
    
    @abstractmethod
    async def search_images(self, queries: List[str]) -> Dict[str, List[Dict[str, Any]]]:
        """Search for images"""
        pass
    
    @abstractmethod
    async def upload_image(self, image_data: bytes, filename: str) -> str:
        """Upload image and return URL"""
        pass 