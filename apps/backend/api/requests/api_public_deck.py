"""
API endpoints for public deck access via share links.
These endpoints don't require authentication.
"""
import logging
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from services.deck_sharing_service import get_sharing_service
from utils.supabase import get_deck

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public", tags=["public-deck"])


# Response Models
class PublicDeckResponse(BaseModel):
    """Response for public deck access."""
    deck: Dict[str, Any] = Field(..., description="The deck data")
    share_info: Dict[str, Any] = Field(..., description="Share link information")
    is_editable: bool = Field(..., description="Whether the deck can be edited")
    access_recorded: bool = Field(True, description="Whether access was recorded")


# Endpoints
@router.get("/deck/{short_code}", response_model=PublicDeckResponse)
async def get_public_deck(
    short_code: str,
    request: Request,
    include_slides: bool = Query(True, description="Include slide data in response")
):
    """
    Get a deck using a public share link (no authentication required).
    
    This endpoint:
    - Records the access
    - Returns deck data based on share permissions
    - Works for both view-only and edit share links
    """
    try:
        # Get deck using share code
        sharing_service = get_sharing_service()
        deck = sharing_service.get_deck_by_share_code(short_code)
        
        if not deck:
            raise HTTPException(
                status_code=404, 
                detail="Invalid share link or deck not found"
            )
        
        # Extract share info
        share_info = deck.pop('share_info', {})
        is_editable = share_info.get('is_editable', False)
        
        # For view-only links, ensure certain fields are read-only
        if not is_editable:
            # Remove sensitive information
            deck.pop('user_id', None)
            deck.pop('status', None)  # Internal generation status
            
            # Mark as read-only
            deck['read_only'] = True
        
        # Optionally exclude slides for faster loading
        if not include_slides and 'slides' in deck:
            deck['slide_count'] = len(deck.get('slides', []))
            deck.pop('slides', None)
        
        # Log access with IP for analytics
        client_ip = request.client.host if request.client else "unknown"
        logger.info(f"Public deck access: {short_code} from IP {client_ip}")
        
        return PublicDeckResponse(
            deck=deck,
            share_info={
                'share_type': share_info.get('share_type', 'view'),
                'accessed_at': datetime.utcnow().isoformat()
            },
            is_editable=is_editable,
            access_recorded=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accessing public deck: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to access deck")


@router.get("/deck/{short_code}/metadata")
async def get_public_deck_metadata(short_code: str):
    """
    Get minimal deck metadata for preview purposes.
    Useful for generating link previews, OG tags, etc.
    """
    try:
        # Get deck using share code
        sharing_service = get_sharing_service()
        deck = sharing_service.get_deck_by_share_code(short_code)
        
        if not deck:
            raise HTTPException(
                status_code=404, 
                detail="Invalid share link or deck not found"
            )
        
        # Extract metadata
        first_slide = None
        if deck.get('slides') and len(deck['slides']) > 0:
            slide = deck['slides'][0]
            # Get title from first slide
            first_slide = {
                'title': slide.get('title', ''),
                'has_image': any(
                    comp.get('type') == 'IMAGE' 
                    for comp in slide.get('components', [])
                )
            }
        
        metadata = {
            'title': deck.get('name', 'Untitled Presentation'),
            'slide_count': len(deck.get('slides', [])),
            'created_at': deck.get('created_at'),
            'first_slide': first_slide,
            'theme': {
                'colors': deck.get('data', {}).get('theme', {}).get('colors', {}),
                'fonts': deck.get('data', {}).get('theme', {}).get('fonts', {})
            } if deck.get('data') else None
        }
        
        return metadata
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting deck metadata: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get deck metadata")


@router.post("/deck/{short_code}/duplicate")
async def duplicate_public_deck(
    short_code: str,
    user_id: Optional[str] = Query(None, description="User ID to assign the duplicate to")
):
    """
    Create a copy of a publicly shared deck.
    This allows users to duplicate shared decks to their own account.
    """
    try:
        # Get deck using share code
        sharing_service = get_sharing_service()
        deck = sharing_service.get_deck_by_share_code(short_code)
        
        if not deck:
            raise HTTPException(
                status_code=404, 
                detail="Invalid share link or deck not found"
            )
        
        # Only allow duplication of view-only shares
        share_info = deck.get('share_info', {})
        if share_info.get('share_type') != 'view':
            raise HTTPException(
                status_code=403,
                detail="This deck cannot be duplicated. Only view-only shared decks can be duplicated."
            )
        
        # Create a new deck with copied content
        import uuid
        from utils.supabase import upload_deck
        
        new_deck_uuid = str(uuid.uuid4())
        
        # Prepare the new deck data
        new_deck = {
            'uuid': new_deck_uuid,
            'name': f"{deck.get('name', 'Untitled')} (Copy)",
            'slides': deck.get('slides', []),
            'size': deck.get('size', {'width': 1920, 'height': 1080}),
            'data': deck.get('data'),
            'outline': deck.get('outline'),
            'version': str(uuid.uuid4()),
            'status': {
                'state': 'completed',
                'message': 'Duplicated from shared deck'
            }
        }
        
        # Upload the new deck
        uploaded_deck = upload_deck(new_deck, new_deck_uuid, user_id)
        
        if not uploaded_deck:
            raise HTTPException(status_code=500, detail="Failed to create duplicate deck")
        
        logger.info(f"Duplicated deck from share {short_code} to new deck {new_deck_uuid}")
        
        return {
            'message': 'Deck duplicated successfully',
            'deck_uuid': new_deck_uuid,
            'deck_name': new_deck['name']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error duplicating deck: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to duplicate deck") 