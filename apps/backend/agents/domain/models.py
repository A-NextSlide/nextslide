"""
Domain models representing core business concepts.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Set, Union
from datetime import datetime
from enum import Enum

from models.requests import SlideOutline, DeckOutline


class SlideStatus(str, Enum):
    """Slide generation status."""
    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    ERROR = "error"
    FIXED = "fixed"


@dataclass
class ThemeSpec:
    """Theme specification containing all design elements."""
    theme_name: str
    design_philosophy: str
    color_palette: Dict[str, Any]
    typography: Dict[str, Any]
    layout_style: str
    visual_effects: Dict[str, Any]
    image_treatment: Dict[str, Any]
    # Extended fields to carry full theme across pipeline
    visual_style: Dict[str, Any] = field(default_factory=dict)
    background_variations: List[Dict[str, Any]] = field(default_factory=list)
    slide_templates: Dict[str, Any] = field(default_factory=dict)
    design_rules: Dict[str, Any] = field(default_factory=dict)
    slide_themes: Dict[str, Any] = field(default_factory=dict)  # Per-slide theme variations
    # Brand information including logo URL
    brandInfo: Dict[str, Any] = field(default_factory=dict)
    # Design reference images (e.g., brand website screenshots from Firecrawl)
    reference_images: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ThemeSpec':
        """Create ThemeSpec from dictionary."""
        return cls(
            theme_name=data.get('theme_name', 'Huemint AI'),
            design_philosophy=data.get('design_philosophy', ''),
            color_palette=data.get('color_palette', {}),
            typography=data.get('typography', {}),
            layout_style=data.get('layout_style', 'grid'),
            visual_effects=data.get('visual_effects', {}),
            image_treatment=data.get('image_treatment', {}),
            visual_style=data.get('visual_style', {}),
            background_variations=data.get('background_variations', []),
            slide_templates=data.get('slide_templates', {}),
            design_rules=data.get('design_rules', {}),
            slide_themes=data.get('slide_themes', {}),
            brandInfo=data.get('brandInfo', {}),
            reference_images=data.get('reference_images', [])
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'theme_name': self.theme_name,
            'design_philosophy': self.design_philosophy,
            'color_palette': self.color_palette,
            'typography': self.typography,
            'layout_style': self.layout_style,
            'visual_effects': self.visual_effects,
            'image_treatment': self.image_treatment,
            'visual_style': self.visual_style,
            'background_variations': self.background_variations,
            'slide_templates': self.slide_templates,
            'design_rules': self.design_rules,
            'slide_themes': self.slide_themes,
            'brandInfo': self.brandInfo,
            'reference_images': self.reference_images
        }


@dataclass
class ThemeDocument:
    """Concrete theme document persisted with a deck.

    - deck_theme: deck-wide system and tokens
    - slide_themes: per-slide overlays/instructions keyed by slide id
    - search_terms: AI-generated image search terms for the deck
    - agent_trace: optional list of structured agent/tool events
    """
    deck_theme: Dict[str, Any]
    slide_themes: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    search_terms: List[str] = field(default_factory=list)
    agent_trace: List[Dict[str, Any]] = field(default_factory=list)

    @classmethod
    def empty(cls) -> 'ThemeDocument':
        return cls(deck_theme={}, slide_themes={}, search_terms=[], agent_trace=[])

    def to_dict(self) -> Dict[str, Any]:
        return {
            'deck_theme': self.deck_theme,
            'slide_themes': self.slide_themes,
            'search_terms': self.search_terms,
            'agent_trace': self.agent_trace
        }

@dataclass
class SlideGenerationContext:
    """Context for generating a single slide."""
    slide_outline: SlideOutline
    slide_index: int
    deck_outline: DeckOutline
    theme: Union[ThemeSpec, ThemeDocument]
    palette: Dict[str, Any]
    style_manifesto: str
    deck_uuid: str
    available_images: List[Dict[str, Any]] = field(default_factory=list)
    available_videos: List[Dict[str, Any]] = field(default_factory=list)  # Videos from brand website
    async_images: bool = False
    tagged_media: List[Dict[str, Any]] = field(default_factory=list)
    # Visual density guidance for content amount: "minimal" | "moderate" | "rich" | "data-heavy"
    visual_density: Optional[str] = "moderate"
    # User ID for personalization
    user_id: Optional[str] = None
    # Presentation context from user's initial request (for design context only)
    presentation_context: Optional[str] = None
    # Conversation history with user customization details
    conversation_history: Optional[Dict[str, Any]] = None
    # Design reference images (e.g., PPT screenshots) for AI to match style from
    reference_images: List[str] = field(default_factory=list)
    
    @property
    def total_slides(self) -> int:
        """Get total number of slides in deck."""
        return len(self.deck_outline.slides)
    
    @property
    def is_title_slide(self) -> bool:
        """Check if this is the title slide."""
        return self.slide_index == 0
    
    @property
    def has_extracted_data(self) -> bool:
        """Check if slide has extractedData with usable points."""
        if not getattr(self.slide_outline, "extractedData", None):
            return False
        extracted = self.slide_outline.extractedData
        if hasattr(extracted, "data") and extracted.data:
            return isinstance(extracted.data, list) and len(extracted.data) > 0
        return False

    @property
    def has_manual_charts(self) -> bool:
        """Check if slide has user-provided manualCharts."""
        manual_charts = getattr(self.slide_outline, "manualCharts", None)
        return isinstance(manual_charts, list) and len(manual_charts) > 0

    @property
    def has_chart_data(self) -> bool:
        """Check if slide has any chart data (extracted or manual)."""
        return self.has_extracted_data or self.has_manual_charts

    @property
    def has_tabular_data(self) -> bool:
        """Heuristic: true if extractedData looks like multi-column tabular data.

        We treat data as tabular when it's a list of dicts where the union of keys
        across the first few rows is at least 3 (more than typical name/value).
        """
        try:
            extracted = getattr(self.slide_outline, 'extractedData', None)
            data = getattr(extracted, 'data', None)
            if not isinstance(data, list) or not data:
                return False
            # Only consider dict-shaped rows
            sample = [row for row in data[:5] if isinstance(row, dict)]
            if not sample:
                return False
            keys_union = set()
            for row in sample:
                keys_union.update([k for k in row.keys()])
            # Common chart pairs often use 1-2 keys; tables usually have >= 3
            return len(keys_union) >= 3
        except Exception:
            return False


@dataclass
class CompositionOptions:
    """Options for deck composition."""
    max_parallel_slides: int = 50  # Generate all slides in parallel (Gemini Tier 3)
    delay_between_slides: float = 0.05
    async_images: bool = False
    enable_visual_analysis: bool = False  # DISABLED
    prefetch_images: bool = False

    @classmethod
    def from_kwargs(cls, **kwargs) -> 'CompositionOptions':
        """Create from keyword arguments."""
        return cls(
            max_parallel_slides=kwargs.get('max_parallel', 50),
            delay_between_slides=kwargs.get('delay_between_slides', 0.05),
            async_images=kwargs.get('async_images', False),
            enable_visual_analysis=kwargs.get('enable_visual_analysis', False),  # DISABLED
            prefetch_images=kwargs.get('prefetch_images', False)
        )


@dataclass
class DeckState:
    """Represents the current state of a deck being generated."""
    deck_uuid: str
    deck_outline: DeckOutline
    conversation_history: Optional[Dict[str, Any]] = None
    theme: Optional[Union[ThemeSpec, ThemeDocument]] = None
    palette: Optional[Dict[str, Any]] = None
    style_manifesto: Optional[str] = None
    slides: List[Dict[str, Any]] = field(default_factory=list)
    notes: Optional[Dict[str, Any]] = None  # Add notes field for narrative flow
    status: Dict[str, Any] = field(default_factory=lambda: {
        'state': 'initializing',
        'progress': 0,
        'message': 'Starting deck generation...'
    })
    generation_started_at: datetime = field(default_factory=datetime.now)
    
    def update_progress(self, progress: int, message: str):
        """Update deck generation progress."""
        self.status['progress'] = progress
        self.status['message'] = message
    
    def mark_slide_complete(self, index: int, slide_data: Dict[str, Any]):
        """Mark a slide as complete."""
        import logging
        logger = logging.getLogger(__name__)

        logger.debug(f"[DECK_STATE] mark_slide_complete called for slide {index}")
        logger.debug(f"[DECK_STATE] Slide data has {len(slide_data.get('components', []))} components")

        if index < len(self.slides):
            # Log what we're replacing
            old_components = len(self.slides[index].get('components', []))
            logger.debug(f"[DECK_STATE] Replacing slide {index} (had {old_components} components)")

            # Preserve critical fields from the original placeholder slide.
            # The generator builds an unreliable id (slide-{slide_index+1}) which
            # can collide during parallel generation; the placeholder id is unique.
            original_slide = self.slides[index]
            if 'id' in original_slide:
                slide_data['id'] = original_slide['id']
            if 'order' not in slide_data and 'order' in original_slide:
                slide_data['order'] = original_slide['order']
            if 'deckId' not in slide_data and 'deckId' in original_slide:
                slide_data['deckId'] = original_slide['deckId']
            # Ensure order is set even if the original didn't have it
            if 'order' not in slide_data:
                slide_data['order'] = index

            # Replace the entire slide data instead of updating
            # This ensures components array is properly replaced
            self.slides[index] = slide_data
            # Ensure status is set to completed
            self.slides[index]['status'] = SlideStatus.COMPLETED.value

            logger.debug(f"[DECK_STATE] Slide {index} now has {len(self.slides[index].get('components', []))} components")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for persistence."""
        return {
            'uuid': self.deck_uuid,
            'name': self.deck_outline.title,
            'slides': self.slides,
            'size': {'width': 1920, 'height': 1080},
            'status': self.status,
            'outline': self.deck_outline.model_dump(),
            'theme': self.theme.to_dict() if self.theme else None,
            'palette': self.palette,
            'style_manifesto': self.style_manifesto,
            'generation_started_at': self.generation_started_at.isoformat(),
            'notes': self.notes
        }


@dataclass
class SlideComponent:
    """Represents a component on a slide."""
    id: str
    type: str
    props: Dict[str, Any]
    
    def validate(self, registry) -> bool:
        """Validate component against registry."""
        if self.type not in registry._component_models:
            return False
        
        try:
            ComponentModel = registry._component_models[self.type]
            ComponentModel(**{'id': self.id, 'type': self.type, 'props': self.props})
            return True
        except Exception:
            return False


@dataclass
class GenerationEvent:
    """Base class for generation events."""
    event_type: str
    timestamp: datetime = field(default_factory=datetime.now)
    data: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'type': self.event_type,
            'timestamp': self.timestamp.isoformat(),
            **self.data
        }


@dataclass
class SlideGeneratedEvent:
    """Event emitted when a slide is generated."""
    slide_index: int
    slide_data: Dict[str, Any]
    deck_uuid: Optional[str] = None
    event_type: str = field(default='slide_generated')
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'type': self.event_type,
            'timestamp': self.timestamp.isoformat(),
            'slide_index': self.slide_index,
            'slide_data': self.slide_data,
            'deck_uuid': self.deck_uuid,
            'message': f'Generated slide {self.slide_index + 1}'
        } 
