"""
Pause/Resume Manager for Deck Generation

Handles:
- Pausing active generations
- Cancelling in-progress tasks cleanly
- Persisting generation state
- Resuming from saved state
"""

import asyncio
import json
import logging
from typing import Dict, Any, Set, Optional, List
from datetime import datetime
from dataclasses import dataclass, field, asdict
from enum import Enum

from agents.core.interfaces import GenerationOptions
from models.requests import DeckOutline

logger = logging.getLogger(__name__)


class GenerationState(Enum):
    """Generation states"""
    INITIALIZING = "initializing"
    THEME_GENERATED = "theme_generated"
    MEDIA_PROCESSED = "media_processed"
    SLIDES_IN_PROGRESS = "slides_in_progress"
    FINALIZING = "finalizing"
    COMPLETED = "completed"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    ERROR = "error"


@dataclass
class SlideState:
    """State of an individual slide"""
    index: int
    status: str  # pending, in_progress, completed, error, cancelled
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    error: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    substep: Optional[str] = None  # Current substep if in progress


@dataclass 
class DeckGenerationState:
    """Complete state of a deck generation"""
    generation_id: str
    deck_id: str
    user_id: str
    state: GenerationState
    
    # Outline and configuration
    deck_outline: Dict[str, Any]  # Serialized DeckOutline
    options: Dict[str, Any]  # Serialized GenerationOptions
    
    # Progress tracking
    completed_steps: int = 0
    total_steps: int = 0
    current_phase: str = "initialization"
    
    # Generated data
    theme: Optional[Dict[str, Any]] = None
    palette: Optional[Dict[str, Any]] = None
    processed_media: Optional[List[Dict[str, Any]]] = None
    
    # Slide states
    slide_states: Dict[int, SlideState] = field(default_factory=dict)
    
    # Timing
    start_time: float = field(default_factory=lambda: datetime.now().timestamp())
    pause_time: Optional[float] = None
    resume_time: Optional[float] = None
    total_pause_duration: float = 0.0
    
    # Active tasks to cancel on pause
    active_task_ids: Set[str] = field(default_factory=set)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for persistence"""
        return {
            **asdict(self),
            'state': self.state.value,
            'slide_states': {
                str(k): asdict(v) for k, v in self.slide_states.items()
            },
            'active_task_ids': list(self.active_task_ids)
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DeckGenerationState':
        """Create from persisted dictionary"""
        data['state'] = GenerationState(data['state'])
        data['slide_states'] = {
            int(k): SlideState(**v) 
            for k, v in data.get('slide_states', {}).items()
        }
        data['active_task_ids'] = set(data.get('active_task_ids', []))
        return cls(**data)


class PauseResumeManager:
    """
    Manages pause/resume functionality for deck generation.
    
    Key features:
    - Clean task cancellation
    - State persistence
    - Efficient resume from last checkpoint
    - Resource cleanup
    """
    
    def __init__(self, persistence_backend: Optional[Any] = None):
        self.persistence = persistence_backend
        self.active_generations: Dict[str, DeckGenerationState] = {}
        self.active_tasks: Dict[str, asyncio.Task] = {}
        self._cleanup_task = None
        
    async def register_generation(
        self,
        generation_id: str,
        deck_id: str,
        user_id: str,
        deck_outline: DeckOutline,
        options: GenerationOptions
    ) -> DeckGenerationState:
        """Register a new generation for tracking"""
        state = DeckGenerationState(
            generation_id=generation_id,
            deck_id=deck_id,
            user_id=user_id,
            state=GenerationState.INITIALIZING,
            deck_outline=deck_outline.model_dump(),
            options=asdict(options),
            total_steps=self._calculate_total_steps(deck_outline)
        )
        
        # Initialize slide states
        for i, slide in enumerate(deck_outline.slides):
            state.slide_states[i] = SlideState(
                index=i,
                status="pending"
            )
        
        self.active_generations[generation_id] = state
        await self._persist_state(state)
        
        logger.info(f"Registered generation {generation_id} for deck {deck_id}")
        return state
    
    async def update_generation_state(
        self,
        generation_id: str,
        updates: Dict[str, Any]
    ) -> None:
        """Update generation state and persist"""
        if generation_id not in self.active_generations:
            logger.warning(f"Generation {generation_id} not found")
            return
            
        state = self.active_generations[generation_id]
        
        # Update fields
        for key, value in updates.items():
            if hasattr(state, key):
                setattr(state, key, value)
        
        await self._persist_state(state)
    
    async def update_slide_state(
        self,
        generation_id: str,
        slide_index: int,
        status: str,
        **kwargs
    ) -> None:
        """Update individual slide state"""
        if generation_id not in self.active_generations:
            return
            
        state = self.active_generations[generation_id]
        if slide_index in state.slide_states:
            slide_state = state.slide_states[slide_index]
            slide_state.status = status
            
            # Update timing
            if status == "in_progress" and not slide_state.start_time:
                slide_state.start_time = datetime.now().timestamp()
            elif status in ["completed", "error", "cancelled"]:
                slide_state.end_time = datetime.now().timestamp()
            
            # Update additional fields
            for key, value in kwargs.items():
                if hasattr(slide_state, key):
                    setattr(slide_state, key, value)
            
            await self._persist_state(state)
    
    def register_task(self, generation_id: str, task_id: str, task: asyncio.Task) -> None:
        """Register an active task for a generation"""
        if generation_id in self.active_generations:
            self.active_generations[generation_id].active_task_ids.add(task_id)
            self.active_tasks[task_id] = task
    
    def unregister_task(self, generation_id: str, task_id: str) -> None:
        """Unregister a completed/cancelled task"""
        if generation_id in self.active_generations:
            self.active_generations[generation_id].active_task_ids.discard(task_id)
        self.active_tasks.pop(task_id, None)
    
    async def pause_generation(self, generation_id: str) -> bool:
        """
        Pause an active generation.
        
        Returns:
            True if successfully paused, False otherwise
        """
        if generation_id not in self.active_generations:
            logger.warning(f"Cannot pause: generation {generation_id} not found")
            return False
            
        state = self.active_generations[generation_id]
        
        if state.state not in [GenerationState.SLIDES_IN_PROGRESS, GenerationState.MEDIA_PROCESSED]:
            logger.warning(f"Cannot pause generation in state: {state.state}")
            return False
        
        logger.info(f"Pausing generation {generation_id}")
        
        # Cancel all active tasks
        cancelled_count = 0
        for task_id in list(state.active_task_ids):
            if task_id in self.active_tasks:
                task = self.active_tasks[task_id]
                if not task.done():
                    task.cancel()
                    cancelled_count += 1
                    
                    # Mark corresponding slide as cancelled if it was in progress
                    for slide_index, slide_state in state.slide_states.items():
                        if slide_state.status == "in_progress":
                            slide_state.status = "cancelled"
                            slide_state.end_time = datetime.now().timestamp()
        
        # Update state
        state.state = GenerationState.PAUSED
        state.pause_time = datetime.now().timestamp()
        
        # Clear active tasks
        state.active_task_ids.clear()
        
        await self._persist_state(state)
        
        logger.info(f"Paused generation {generation_id}, cancelled {cancelled_count} tasks")
        return True
    
    async def can_resume(self, generation_id: str) -> bool:
        """Check if a generation can be resumed"""
        if generation_id not in self.active_generations:
            # Try to load from persistence
            state = await self._load_state(generation_id)
            if state:
                self.active_generations[generation_id] = state
            else:
                return False
        
        state = self.active_generations[generation_id]
        return state.state == GenerationState.PAUSED
    
    def get_resume_context(self, generation_id: str) -> Optional[Dict[str, Any]]:
        """
        Get context needed to resume generation.
        
        Returns:
            Dictionary with:
            - deck_outline: The original outline
            - options: Generation options
            - completed_slides: Set of completed slide indices
            - pending_slides: List of slides to generate
            - theme: Generated theme (if any)
            - palette: Generated palette (if any)
            - processed_media: Processed media (if any)
        """
        if generation_id not in self.active_generations:
            return None
            
        state = self.active_generations[generation_id]
        
        # Determine what needs to be done
        completed_slides = {
            idx for idx, slide in state.slide_states.items()
            if slide.status == "completed"
        }
        
        pending_slides = [
            idx for idx, slide in state.slide_states.items()
            if slide.status in ["pending", "cancelled", "error"]
        ]
        
        return {
            'generation_id': generation_id,
            'deck_id': state.deck_id,
            'deck_outline': state.deck_outline,
            'options': state.options,
            'completed_slides': completed_slides,
            'pending_slides': pending_slides,
            'theme': state.theme,
            'palette': state.palette,
            'processed_media': state.processed_media,
            'completed_steps': state.completed_steps,
            'total_steps': state.total_steps,
            'pause_duration': state.total_pause_duration
        }
    
    async def mark_resumed(self, generation_id: str) -> None:
        """Mark a generation as resumed"""
        if generation_id not in self.active_generations:
            return
            
        state = self.active_generations[generation_id]
        
        if state.pause_time and not state.resume_time:
            state.resume_time = datetime.now().timestamp()
            state.total_pause_duration += (state.resume_time - state.pause_time)
        
        state.state = GenerationState.SLIDES_IN_PROGRESS
        state.pause_time = None
        state.resume_time = None
        
        await self._persist_state(state)
    
    async def cleanup_generation(self, generation_id: str) -> None:
        """Clean up a completed/cancelled generation"""
        if generation_id in self.active_generations:
            state = self.active_generations[generation_id]
            
            # Cancel any remaining tasks
            for task_id in state.active_task_ids:
                if task_id in self.active_tasks:
                    task = self.active_tasks[task_id]
                    if not task.done():
                        task.cancel()
            
            # Remove from active tracking
            del self.active_generations[generation_id]
            
            # Optionally archive the state
            if self.persistence:
                await self._archive_state(state)
    
    def _calculate_total_steps(self, deck_outline: DeckOutline) -> int:
        """Calculate total steps for progress tracking"""
        # Base: init(1) + theme(2) + media(1) + finalize(1) = 5
        # Each slide: 5 sub-steps
        return 5 + (len(deck_outline.slides) * 5)
    
    async def _persist_state(self, state: DeckGenerationState) -> None:
        """Persist state to backend"""
        if self.persistence:
            try:
                await self.persistence.save_generation_state(
                    state.generation_id,
                    state.to_dict()
                )
            except Exception as e:
                logger.error(f"Failed to persist state: {e}")
    
    async def _load_state(self, generation_id: str) -> Optional[DeckGenerationState]:
        """Load state from persistence"""
        if not self.persistence:
            return None
            
        try:
            data = await self.persistence.load_generation_state(generation_id)
            if data:
                return DeckGenerationState.from_dict(data)
        except Exception as e:
            logger.error(f"Failed to load state: {e}")
        
        return None
    
    async def _archive_state(self, state: DeckGenerationState) -> None:
        """Archive completed state"""
        if self.persistence:
            try:
                await self.persistence.archive_generation_state(
                    state.generation_id,
                    state.to_dict()
                )
            except Exception as e:
                logger.error(f"Failed to archive state: {e}")


# Global instance
pause_resume_manager = PauseResumeManager() 