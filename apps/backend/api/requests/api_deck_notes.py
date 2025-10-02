"""
API endpoint for retrieving and updating deck narrative flow notes.
"""
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from utils.supabase import get_deck, get_supabase_client
from services.supabase_auth_service import get_auth_service
from api.requests.api_auth import get_auth_header
from setup_logging_optimized import get_logger
from models.narrative_flow import NarrativeFlow

logger = get_logger(__name__)

router = APIRouter(prefix="/api/deck", tags=["deck-notes"])


class DeckNotesResponse(BaseModel):
    """Response containing deck narrative flow notes"""
    success: bool
    notes: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class UpdateDeckNotesRequest(BaseModel):
    """Request to update deck notes"""
    deck_id: str
    notes: Dict[str, Any]


@router.get("/{deck_id}/notes")
async def get_deck_notes(
    deck_id: str,
    token: Optional[str] = Depends(get_auth_header)
) -> DeckNotesResponse:
    """
    Retrieve narrative flow notes for a deck.
    """
    try:
        logger.info(f"Retrieving notes for deck {deck_id}")
        
        # Get the deck
        deck = get_deck(deck_id)
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        # Extract notes
        notes = deck.get("notes")
        
        if notes:
            logger.info(f"Found narrative flow notes for deck {deck_id}")
            return DeckNotesResponse(success=True, notes=notes)
        else:
            logger.info(f"No narrative flow notes found for deck {deck_id}")
            return DeckNotesResponse(
                success=True, 
                notes=None,
                error="No narrative flow notes available for this deck"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving deck notes: {str(e)}")
        return DeckNotesResponse(
            success=False,
            error=f"Failed to retrieve deck notes: {str(e)}"
        )


@router.post("/notes/update")
async def update_deck_notes(
    request: UpdateDeckNotesRequest,
    token: Optional[str] = Depends(get_auth_header)
) -> DeckNotesResponse:
    """
    Update narrative flow notes for a deck.
    """
    try:
        logger.info(f"Updating notes for deck {request.deck_id}")
        
        # Get supabase client
        supabase = get_supabase_client()
        
        # Update deck with new notes
        update_result = supabase.table("decks").update({
            "notes": request.notes
        }).eq("uuid", request.deck_id).execute()
        
        if update_result.data:
            logger.info(f"Successfully updated narrative flow notes for deck {request.deck_id}")
            return DeckNotesResponse(success=True, notes=request.notes)
        else:
            raise Exception("Failed to update deck notes")
        
    except Exception as e:
        logger.error(f"Error updating deck notes: {str(e)}")
        return DeckNotesResponse(
            success=False,
            error=f"Failed to update deck notes: {str(e)}"
        ) 