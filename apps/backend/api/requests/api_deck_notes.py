"""
API endpoint for retrieving and updating deck narrative flow notes.
"""
import asyncio
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
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
    generating: bool = False
    error: Optional[str] = None


class UpdateDeckNotesRequest(BaseModel):
    """Request to update deck notes"""
    deck_id: str
    notes: Dict[str, Any]


# Track decks that are currently generating narrative so we don't double-trigger
_generating_decks: set = set()


@router.get("/{deck_id}/notes")
async def get_deck_notes(
    deck_id: str,
    generate: bool = False,
    token: Optional[str] = Depends(get_auth_header)
) -> DeckNotesResponse:
    """
    Retrieve narrative flow notes for a deck.

    Pass ?generate=true to kick off background generation if notes don't exist yet.
    """
    try:
        # Get the deck
        deck = get_deck(deck_id)
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")

        # Extract notes
        notes = deck.get("notes")

        if notes and isinstance(notes, dict) and notes.get("story_arc"):
            return DeckNotesResponse(success=True, notes=notes)

        # No narrative yet — optionally kick off generation
        if generate and deck_id not in _generating_decks:
            outline = deck.get("outline")
            if outline and outline.get("slides"):
                _generating_decks.add(deck_id)
                asyncio.create_task(_generate_narrative_background(deck_id, outline))
                logger.info("Kicked off narrative generation for deck %s", deck_id)
                return DeckNotesResponse(
                    success=True, notes=None, generating=True,
                    error="Narrative generation started"
                )

        already_generating = deck_id in _generating_decks
        return DeckNotesResponse(
            success=True,
            notes=None,
            generating=already_generating,
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


async def _generate_narrative_background(deck_id: str, outline: dict) -> None:
    """Generate narrative flow in the background for an existing deck."""
    try:
        analysis_outline = {
            "id": outline.get("id", deck_id),
            "title": outline.get("title", "Untitled"),
            "slides": [
                {
                    "id": s.get("id", f"slide-{i}"),
                    "title": s.get("title", ""),
                    "content": s.get("content", ""),
                    "speaker_notes": s.get("speaker_notes", ""),
                }
                for i, s in enumerate(outline.get("slides", []))
            ],
        }

        from services.modal_dispatch import generate_narrative_flow_via_modal

        result = await generate_narrative_flow_via_modal(
            outline_dict=analysis_outline,
            deck_uuid=deck_id,
            context=outline.get("title"),
        )

        if result and result.get("success"):
            logger.info("[NARRATIVE] On-demand generation succeeded for deck %s", deck_id)
        else:
            logger.warning("[NARRATIVE] On-demand generation failed for deck %s", deck_id)
    except Exception as exc:
        logger.error("[NARRATIVE] On-demand generation error for deck %s: %s", deck_id, exc, exc_info=True)
    finally:
        _generating_decks.discard(deck_id)


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