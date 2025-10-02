"""
API endpoints for pause and resume functionality.

Provides:
- Pause active generation
- Resume paused generation
- Check generation status
"""

import logging
from typing import Dict, Any, Optional, AsyncIterator
from pydantic import BaseModel, Field

from agents.generation.pause_resume_manager import pause_resume_manager
from agents.generation.deck_composer_clean import DeckComposer
from agents.generation.infrastructure import Persistence
from models.requests import DeckOutline
from models.registry import ComponentRegistry

logger = logging.getLogger(__name__)


class PauseGenerationRequest(BaseModel):
    """Request to pause a generation"""
    generation_id: str = Field(description="The generation ID to pause")


class ResumeGenerationRequest(BaseModel):
    """Request to resume a paused generation"""
    generation_id: str = Field(description="The generation ID to resume")
    streaming: bool = Field(True, description="Whether to stream the resumed generation")


class GenerationStatusResponse(BaseModel):
    """Response with generation status"""
    generation_id: str
    status: str
    can_pause: bool
    can_resume: bool
    progress: Dict[str, Any]


async def pause_generation(request: PauseGenerationRequest) -> Dict[str, Any]:
    """
    Pause an active deck generation.
    
    This will:
    1. Cancel all active slide generation tasks
    2. Save the current state
    3. Allow resumption later
    """
    logger.info(f"Pause request for generation {request.generation_id}")
    
    success = await pause_resume_manager.pause_generation(request.generation_id)
    
    if success:
        return {
            "success": True,
            "message": f"Generation {request.generation_id} paused successfully",
            "generation_id": request.generation_id
        }
    else:
        return {
            "success": False,
            "message": f"Failed to pause generation {request.generation_id}",
            "generation_id": request.generation_id
        }


async def get_generation_status(generation_id: str) -> GenerationStatusResponse:
    """Get the current status of a generation"""
    
    # Check if generation exists
    if generation_id not in pause_resume_manager.active_generations:
        # Try to load from persistence
        state = await pause_resume_manager._load_state(generation_id)
        if not state:
            return GenerationStatusResponse(
                generation_id=generation_id,
                status="not_found",
                can_pause=False,
                can_resume=False,
                progress={}
            )
    else:
        state = pause_resume_manager.active_generations[generation_id]
    
    # Determine capabilities
    can_pause = state.state.value in ["slides_in_progress", "media_processed"]
    can_resume = state.state.value == "paused"
    
    # Build progress info
    progress = {
        "completed_steps": state.completed_steps,
        "total_steps": state.total_steps,
        "current_phase": state.current_phase,
        "completed_slides": sum(1 for s in state.slide_states.values() if s.status == "completed"),
        "total_slides": len(state.slide_states),
        "state": state.state.value
    }
    
    return GenerationStatusResponse(
        generation_id=generation_id,
        status=state.state.value,
        can_pause=can_pause,
        can_resume=can_resume,
        progress=progress
    )


def stream_resume_generation(
    request: ResumeGenerationRequest,
    registry: ComponentRegistry
) -> AsyncIterator[str]:
    """
    Resume a paused generation and stream the progress.
    
    This will:
    1. Load the saved state
    2. Skip already completed slides
    3. Continue from where it left off
    """
    
    async def generate():
        try:
            # Check if can resume
            can_resume = await pause_resume_manager.can_resume(request.generation_id)
            if not can_resume:
                yield f"data: {json.dumps({'type': 'error', 'error': 'Cannot resume generation'})}\n\n"
                return
            
            # Get resume context
            resume_context = pause_resume_manager.get_resume_context(request.generation_id)
            if not resume_context:
                yield f"data: {json.dumps({'type': 'error', 'error': 'Resume context not found'})}\n\n"
                return
            
            # Mark as resumed
            await pause_resume_manager.mark_resumed(request.generation_id)
            
            # Emit resume event
            yield f"data: {json.dumps({
                'type': 'generation_resumed',
                'generation_id': request.generation_id,
                'completed_slides': len(resume_context['completed_slides']),
                'pending_slides': len(resume_context['pending_slides']),
                'message': f'Resuming generation with {len(resume_context["pending_slides"])} slides remaining'
            })}\n\n"
            
            # Reconstruct deck outline
            deck_outline = DeckOutline(**resume_context['deck_outline'])
            deck_id = resume_context['deck_id']
            
            # Create composer
            composer = DeckComposer(registry)
            
            # Continue generation with resume context
            async for event in composer.compose_deck(
                deck_outline=deck_outline,
                deck_id=deck_id,
                generation_id=request.generation_id,
                resume_context=resume_context,
                **resume_context['options']
            ):
                yield f"data: {json.dumps(event)}\n\n"
                
        except Exception as e:
            logger.error(f"Error resuming generation {request.generation_id}: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return generate()


# Persistence implementation for state storage
class GenerationStatePersistence:
    """
    Simple file-based persistence for generation states.
    In production, this should use a database.
    """
    
    def __init__(self, storage_path: str = "/tmp/deck_generation_states"):
        self.storage_path = storage_path
        import os
        os.makedirs(storage_path, exist_ok=True)
    
    async def save_generation_state(self, generation_id: str, state_data: Dict[str, Any]) -> None:
        """Save generation state to disk"""
        import json
        file_path = f"{self.storage_path}/{generation_id}.json"
        with open(file_path, 'w') as f:
            json.dump(state_data, f)
    
    async def load_generation_state(self, generation_id: str) -> Optional[Dict[str, Any]]:
        """Load generation state from disk"""
        import json
        file_path = f"{self.storage_path}/{generation_id}.json"
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return None
    
    async def archive_generation_state(self, generation_id: str, state_data: Dict[str, Any]) -> None:
        """Archive completed generation state"""
        import shutil
        source = f"{self.storage_path}/{generation_id}.json"
        archive_path = f"{self.storage_path}/archive"
        os.makedirs(archive_path, exist_ok=True)
        dest = f"{archive_path}/{generation_id}.json"
        shutil.move(source, dest)


# Initialize pause/resume manager with persistence
import os
storage_path = os.environ.get("GENERATION_STATE_PATH", "/tmp/deck_generation_states")
pause_resume_manager.persistence = GenerationStatePersistence(storage_path) 