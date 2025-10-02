"""
API endpoint for getting real-time deck generation status
"""

from typing import Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field

from utils.supabase import get_deck
from services.session_manager import SessionManager
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class SlideStatus(BaseModel):
    """Status of a single slide"""
    index: int
    id: str
    title: str
    status: str = Field(default="pending")  # pending, generating, completed, failed
    progress: int = Field(default=0, ge=0, le=100)
    

class DeckProgress(BaseModel):
    """Progress information for deck generation"""
    current_slide: int = Field(default=0)
    total_slides: int
    percentage: int = Field(default=0, ge=0, le=100)
    slides_completed: int = Field(default=0)
    

class DeckStatusResponse(BaseModel):
    """Response for deck status endpoint"""
    id: str
    status: str  # pending, generating, completed, failed
    progress: DeckProgress
    slides: list[SlideStatus]
    generation_started_at: Optional[str] = None
    generation_completed_at: Optional[str] = None
    error: Optional[str] = None
    message: Optional[str] = None


async def get_deck_status(deck_id: str, auth_token: Optional[str] = None) -> DeckStatusResponse:
    """
    Get current generation status for a deck
    
    Args:
        deck_id: The deck UUID
        auth_token: Optional auth token for user verification
        
    Returns:
        DeckStatusResponse with current status
    """
    logger.info(f"Getting status for deck {deck_id}")
    
    # Get deck from database
    deck = get_deck(deck_id)
    if not deck:
        logger.warning(f"Deck {deck_id} not found")
        raise ValueError(f"Deck {deck_id} not found")
    
    # Check user access if auth token provided
    if auth_token:
        session_mgr = SessionManager()
        user_data = await session_mgr.validate_token(auth_token)
        if user_data and deck.get('user_id') and deck['user_id'] != user_data.get('id'):
            logger.warning(f"User {user_data.get('id')} attempted to access deck {deck_id} owned by {deck['user_id']}")
            raise ValueError("Access denied")
    
    # Extract status information
    deck_data = deck.get('data', {})
    status_info = deck_data.get('status', {})
    slides = deck_data.get('slides', [])
    
    # Determine overall status
    if status_info.get('state'):
        overall_status = status_info['state']
    else:
        # Infer status from slides
        completed_slides = [s for s in slides if s.get('components') and len(s['components']) > 0]
        if len(completed_slides) == len(slides) and slides:
            overall_status = 'completed'
        elif completed_slides:
            overall_status = 'generating'
        else:
            overall_status = 'pending'
    
    # Calculate progress
    completed_count = len([s for s in slides if s.get('components') and len(s['components']) > 0])
    total_count = len(slides)
    percentage = int((completed_count / total_count * 100)) if total_count > 0 else 0
    
    # Build slide status list
    slide_statuses = []
    for i, slide in enumerate(slides):
        has_components = bool(slide.get('components') and len(slide['components']) > 0)
        slide_status = SlideStatus(
            index=i,
            id=slide.get('id', f'slide_{i}'),
            title=slide.get('title', f'Slide {i+1}'),
            status='completed' if has_components else 'pending',
            progress=100 if has_components else 0
        )
        slide_statuses.append(slide_status)
    
    # Build response
    return DeckStatusResponse(
        id=deck_id,
        status=overall_status,
        progress=DeckProgress(
            current_slide=completed_count,
            total_slides=total_count,
            percentage=percentage,
            slides_completed=completed_count
        ),
        slides=slide_statuses,
        generation_started_at=status_info.get('generation_started_at'),
        generation_completed_at=status_info.get('generation_completed_at'),
        error=status_info.get('error'),
        message=status_info.get('message')
    )


# For FastAPI router registration
async def get_deck_status_endpoint(deck_id: str, auth_token: Optional[str] = None):
    """FastAPI endpoint wrapper"""
    try:
        return await get_deck_status(deck_id, auth_token)
    except ValueError as e:
        # In actual FastAPI, this would be an HTTPException
        return {"error": str(e)}, 404
    except Exception as e:
        logger.error(f"Error getting deck status: {e}", exc_info=True)
        return {"error": "Internal server error"}, 500