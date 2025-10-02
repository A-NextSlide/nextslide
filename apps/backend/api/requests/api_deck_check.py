from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from utils.supabase import get_deck
from models.deck import DeckBase
from agents import config
import logging

logger = logging.getLogger(__name__)

class DeckCheckRequest(BaseModel):
    deck_id: str

class DeckCheckResponse(BaseModel):
    exists: bool
    deck: Optional[Dict[str, Any]] = None
    is_ready: bool = False  # Indicates if all slides are processed
    status: Optional[Dict[str, Any]] = None  # Generation status

async def check_deck_exists(request: DeckCheckRequest) -> DeckCheckResponse:
    """
    Check if a deck exists in the database.
    
    Args:
        request: Contains the deck_id to check
        
    Returns:
        DeckCheckResponse with exists flag, deck data, and generation status
    """
    deck = get_deck(request.deck_id)
    
    # Check if all slides are processed
    is_ready = False
    status = None
    
    if deck:
        slides = deck.get('slides', [])
        # Deck is ready if all slides have components or are marked as completed/error
        is_ready = all(
            slide.get('status') in ['completed', 'error'] or
            (slide.get('components') is not None and len(slide.get('components', [])) > 0)
            for slide in slides
        )
        
        # Get the status field
        status = deck.get('status', {
            "state": "unknown",
            "message": "No status information available"
        })
        
        # If no status field exists but deck exists, infer status
        if not deck.get('status'):
            if is_ready:
                status = {
                    "state": "completed",
                    "message": "Deck is ready",
                    "progress": 100
                }
            else:
                status = {
                    "state": "generating",
                    "message": "Deck is being generated",
                    "progress": 0
                }
    
    return DeckCheckResponse(
        exists=deck is not None,
        deck=deck,
        is_ready=is_ready,
        status=status
    ) 

async def get_concurrency_stats():
    """Get current concurrency statistics for monitoring."""
    try:
        from agents.generation.concurrency_manager import concurrency_manager
        
        stats = concurrency_manager.get_stats()
        
        # Add additional useful information
        stats['limits'] = {
            'max_decks_per_user': config.MAX_DECKS_PER_USER,
            'max_slides_per_user': config.MAX_SLIDES_PER_USER,
            'max_global_slides': config.MAX_GLOBAL_CONCURRENT_SLIDES,
            'api_calls_per_minute': config.API_CALLS_PER_MINUTE
        }
        
        return {
            'success': True,
            'stats': stats
        }
    except Exception as e:
        logger.error(f"Error getting concurrency stats: {e}")
        return {
            'success': False,
            'error': str(e)
        } 