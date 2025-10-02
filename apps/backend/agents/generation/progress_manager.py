"""
Progress manager for standardized deck generation events.

This module provides consistent progress tracking and event formatting
according to the frontend's expectations.
"""

from typing import Dict, Any, Optional, Tuple
from datetime import datetime
from enum import Enum


class GenerationPhase(Enum):
    """Standardized phase names for deck generation."""
    INITIALIZATION = "initialization"
    THEME_GENERATION = "theme_generation"
    IMAGE_COLLECTION = "image_collection"
    SLIDE_GENERATION = "slide_generation"
    FINALIZATION = "finalization"
    COMPLETE = "generation_complete"


class DeckGenerationProgress:
    """
    Manages progress tracking and event formatting for deck generation.
    
    Ensures consistent event structure and progress calculations
    aligned with frontend expectations.
    """
    
    # Phase progress ranges (start, end percentages)
    PHASE_PROGRESS = {
        GenerationPhase.INITIALIZATION: (0, 15),      # 0-15% (15% range)
        GenerationPhase.THEME_GENERATION: (15, 30),   # 15-30% (15% range)
        GenerationPhase.IMAGE_COLLECTION: (30, 55),   # 30-55% (25% range)
        GenerationPhase.SLIDE_GENERATION: (55, 95),   # 55-95% (40% range)
        GenerationPhase.FINALIZATION: (95, 100),      # 95-100% (5% range)
    }
    
    def __init__(self):
        """Initialize progress tracker."""
        self.current_phase = GenerationPhase.INITIALIZATION
        self.progress = 0
        self.total_slides = 0
        self.completed_slides = 0
        self.phase_start_time = datetime.now()
        
    def start_phase(self, phase: GenerationPhase, total_slides: Optional[int] = None) -> Dict[str, Any]:
        """
        Start a new phase and return progress event.
        
        Args:
            phase: The phase to start
            total_slides: Total number of slides (for slide_generation phase)
            
        Returns:
            Standardized progress event
        """
        self.current_phase = phase
        self.phase_start_time = datetime.now()
        
        if total_slides is not None:
            self.total_slides = total_slides
            
        # Get base progress for this phase
        self.progress = self.PHASE_PROGRESS[phase][0]
        
        return self._create_event(
            phase=phase.value,
            message=self._get_phase_message(phase)
        )
    
    def update_slide_progress(
        self, 
        current_slide: int, 
        substep: Optional[str] = None,
        is_complete: bool = False,
        message: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update progress during slide generation.
        
        Args:
            current_slide: Current slide number (1-based)
            substep: Optional substep name
            is_complete: Whether the slide is complete
            
        Returns:
            Standardized progress event
        """
        if is_complete:
            self.completed_slides = current_slide
            
        # Calculate progress within slide generation phase (30-90%)
        phase_start, phase_end = self.PHASE_PROGRESS[GenerationPhase.SLIDE_GENERATION]
        phase_range = phase_end - phase_start
        
        # Progress based on completed slides
        if self.total_slides > 0:
            slide_progress = self.completed_slides / self.total_slides
            self.progress = int(phase_start + (slide_progress * phase_range))
        
        # Use provided message or generate default
        if message is None:
            message = f"Generating slide {current_slide} of {self.total_slides}"
            if substep:
                substep_messages = {
                    "preparing_context": "Preparing context",
                    "rag_lookup": "Finding design patterns",
                    "ai_generation": "Generating content",
                    "saving": "Saving slide"
                }
                message = f"{substep_messages.get(substep, substep)} for slide {current_slide}"
        
        return self._create_event(
            phase=GenerationPhase.SLIDE_GENERATION.value,
            message=message,
            currentSlide=current_slide,
            totalSlides=self.total_slides,
            substep=substep
        )
    
    def update_phase_progress(
        self,
        phase: GenerationPhase,
        progress_within_phase: float,
        message: Optional[str] = None,
        **extra_data
    ) -> Dict[str, Any]:
        """
        Update progress within a specific phase.
        
        Args:
            phase: Current phase
            progress_within_phase: Progress within the phase (0.0 to 1.0)
            message: Optional custom message
            **extra_data: Additional event data
            
        Returns:
            Standardized progress event
        """
        phase_start, phase_end = self.PHASE_PROGRESS[phase]
        phase_range = phase_end - phase_start
        
        # Calculate absolute progress
        self.progress = int(phase_start + (progress_within_phase * phase_range))
        
        return self._create_event(
            phase=phase.value,
            message=message or self._get_phase_message(phase),
            **extra_data
        )
    
    def complete(self, deck_id: str) -> Dict[str, Any]:
        """
        Generate completion event.
        
        Args:
            deck_id: UUID of the completed deck
            
        Returns:
            Standardized completion event
        """
        # Emit a minimal completion event; avoid any progress overlay text on finished slides
        return {
            "type": "deck_complete",
            "data": {
                "phase": GenerationPhase.COMPLETE.value,
                "progress": 100,
                "deckId": deck_id
            }
        }
    
    def error(self, error_message: str, **extra_data) -> Dict[str, Any]:
        """
        Generate error event.
        
        Args:
            error_message: Error description
            **extra_data: Additional error context
            
        Returns:
            Standardized error event
        """
        return {
            "type": "error",
            "data": {
                "phase": self.current_phase.value,
                "progress": self.progress,
                "message": error_message,
                "error": True,
                **extra_data
            }
        }
    
    def _create_event(self, **data) -> Dict[str, Any]:
        """
        Create standardized progress event.
        
        Args:
            **data: Event data fields
            
        Returns:
            Standardized event structure
        """
        # Ensure progress is always included
        if "progress" not in data:
            data["progress"] = self.progress
            
        return {
            "type": "progress",
            "data": data
        }
    
    def _get_phase_message(self, phase: GenerationPhase) -> str:
        """Get default message for a phase."""
        messages = {
            GenerationPhase.INITIALIZATION: "Initializing deck generation",
            GenerationPhase.THEME_GENERATION: "Creating design theme",
            GenerationPhase.IMAGE_COLLECTION: "Collecting images",
            GenerationPhase.SLIDE_GENERATION: "Generating slides",
            GenerationPhase.FINALIZATION: "Finalizing your presentation"
        }
        return messages.get(phase, f"Processing {phase.value}")


def create_progress_manager() -> DeckGenerationProgress:
    """Factory function to create progress manager."""
    return DeckGenerationProgress() 