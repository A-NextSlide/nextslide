"""
API endpoints for public deck access via share links.
These endpoints don't require authentication.
"""
import logging
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, EmailStr

from services.deck_sharing_service import get_sharing_service
from utils.supabase import get_deck, get_supabase_client

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

        # Look up deck owner's subscription plan (for badge/watermark visibility)
        owner_plan = 'free'
        deck_user_id = deck.get('user_id')
        if deck_user_id:
            try:
                supabase = get_supabase_client()
                sub_result = supabase.table('subscriptions').select(
                    'plan_id, status'
                ).eq('user_id', deck_user_id).execute()
                if sub_result.data:
                    active_subs = [s for s in sub_result.data if s.get('status') == 'active']
                    sub = active_subs[0] if active_subs else sub_result.data[0]
                    owner_plan = sub.get('plan_id', 'free')
            except Exception as e:
                logger.warning(f"Failed to fetch owner plan: {e}")

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
                'accessed_at': datetime.utcnow().isoformat(),
                'owner_plan': owner_plan,
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


# Viewer registration models
class ViewerRegistrationRequest(BaseModel):
    """Request to register a viewer's email for a shared deck."""
    email: EmailStr = Field(..., description="Viewer's email address")
    name: Optional[str] = Field(None, description="Viewer's name (optional)")
    company: Optional[str] = Field(None, description="Viewer's company (optional)")


class ViewerRegistrationResponse(BaseModel):
    """Response after registering viewer email."""
    success: bool
    message: str
    viewer_id: Optional[str] = None


@router.post("/deck/{short_code}/viewer", response_model=ViewerRegistrationResponse)
async def register_viewer(
    short_code: str,
    request: ViewerRegistrationRequest,
    http_request: Request
):
    """
    Register a viewer's email before they can access an email-gated deck.
    This stores the viewer info and returns a viewer_id that can be used to access the deck.
    """
    try:
        supabase = get_supabase_client()

        # Get share link info to verify it exists and requires email
        share_result = supabase.table('deck_shares').select(
            'id, deck_uuid, metadata, is_active'
        ).eq('short_code', short_code).eq('is_active', True).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found or expired")

        share_data = share_result.data[0]
        share_id = share_data['id']

        # Get client info
        client_ip = http_request.client.host if http_request.client else "unknown"
        user_agent = http_request.headers.get("user-agent", "unknown")

        # Normalize email
        email_normalized = request.email.strip().lower()

        # Check if viewer already registered for this share link (same email, same day)
        existing = supabase.table('share_viewers').select('id').eq(
            'share_id', share_id
        ).eq('email', email_normalized).execute()

        if existing.data:
            # Viewer already registered, return their existing ID
            return ViewerRegistrationResponse(
                success=True,
                message="Welcome back! You can now view the presentation.",
                viewer_id=existing.data[0]['id']
            )

        # Insert new viewer record
        viewer_data = {
            'share_id': share_id,
            'email': email_normalized,
            'name': request.name,
            'company': request.company,
            'client_ip': client_ip,
            'user_agent': user_agent,
            'registered_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('share_viewers').insert(viewer_data).execute()

        if result.data:
            viewer_id = result.data[0]['id']
            logger.info(f"Registered viewer {email_normalized} for share {short_code}")

            return ViewerRegistrationResponse(
                success=True,
                message="Thanks! You can now view the presentation.",
                viewer_id=viewer_id
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to register viewer")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering viewer: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to register viewer")


@router.get("/deck/{short_code}/check-email-required")
async def check_email_required(short_code: str):
    """
    Check if a share link requires email registration before viewing.
    Returns whether email is required and the deck metadata for preview.
    """
    try:
        supabase = get_supabase_client()

        # Get share link info
        share_result = supabase.table('deck_shares').select(
            'id, deck_uuid, metadata, is_active, share_type'
        ).eq('short_code', short_code).eq('is_active', True).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found or expired")

        share_data = share_result.data[0]
        metadata = share_data.get('metadata') or {}
        require_email = metadata.get('require_email', False)

        # Get basic deck info for preview (name only)
        deck_result = supabase.table('decks').select('name').eq(
            'uuid', share_data['deck_uuid']
        ).execute()

        deck_name = deck_result.data[0]['name'] if deck_result.data else "Untitled Presentation"

        return {
            'require_email': require_email,
            'share_type': share_data['share_type'],
            'deck_name': deck_name
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking email requirement: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check share link")


# View tracking models
class StartViewSessionRequest(BaseModel):
    """Request to start a view tracking session."""
    session_id: str = Field(..., description="Unique browser session ID")
    viewer_id: Optional[str] = Field(None, description="Viewer ID if email was collected")
    device_type: Optional[str] = Field(None, description="desktop, mobile, or tablet")
    referrer_url: Optional[str] = Field(None, description="Referrer URL")


class UpdateViewSessionRequest(BaseModel):
    """Request to update a view session with slide data."""
    session_id: str = Field(..., description="Session ID to update")
    slide_views: list = Field(default=[], description="Array of {slideIndex, timeSpentMs}")
    duration_seconds: int = Field(0, description="Total view duration in seconds")
    slides_viewed: int = Field(0, description="Number of unique slides viewed")


@router.post("/deck/{short_code}/view/start")
async def start_view_session(
    short_code: str,
    request: StartViewSessionRequest,
    http_request: Request
):
    """Start tracking a view session for analytics."""
    try:
        supabase = get_supabase_client()

        # Get share link info
        share_result = supabase.table('deck_shares').select('id').eq(
            'short_code', short_code
        ).eq('is_active', True).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found")

        share_id = share_result.data[0]['id']

        # Get client info
        client_ip = http_request.client.host if http_request.client else "unknown"
        user_agent = http_request.headers.get("user-agent", "")

        # Parse user agent for browser/OS (basic parsing)
        browser = "Unknown"
        os_name = "Unknown"
        if "Chrome" in user_agent:
            browser = "Chrome"
        elif "Firefox" in user_agent:
            browser = "Firefox"
        elif "Safari" in user_agent:
            browser = "Safari"
        elif "Edge" in user_agent:
            browser = "Edge"

        if "Windows" in user_agent:
            os_name = "Windows"
        elif "Mac" in user_agent:
            os_name = "macOS"
        elif "Linux" in user_agent:
            os_name = "Linux"
        elif "Android" in user_agent:
            os_name = "Android"
        elif "iOS" in user_agent or "iPhone" in user_agent:
            os_name = "iOS"

        # Create view event
        event_data = {
            'share_id': share_id,
            'session_id': request.session_id,
            'viewer_id': request.viewer_id,
            'device_type': request.device_type or 'desktop',
            'browser': browser,
            'os': os_name,
            'referrer_url': request.referrer_url,
            'referrer_source': 'direct' if not request.referrer_url else 'referral',
            'client_ip': client_ip,
            'user_agent': user_agent[:500] if user_agent else None
        }

        result = supabase.table('share_view_events').insert(event_data).execute()

        if result.data:
            return {'success': True, 'event_id': result.data[0]['id']}
        else:
            return {'success': False}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting view session: {str(e)}")
        # Don't fail the view - just log the error
        return {'success': False, 'error': str(e)}


@router.post("/deck/{short_code}/view/update")
async def update_view_session(
    short_code: str,
    request: UpdateViewSessionRequest
):
    """Update a view session with slide engagement data."""
    try:
        supabase = get_supabase_client()

        # Get share ID
        share_result = supabase.table('deck_shares').select('id').eq(
            'short_code', short_code
        ).eq('is_active', True).execute()

        if not share_result.data:
            return {'success': False}

        share_id = share_result.data[0]['id']

        # Update the view event
        update_data = {
            'slide_views': request.slide_views,
            'duration_seconds': request.duration_seconds,
            'slides_viewed': request.slides_viewed,
            'ended_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('share_view_events').update(update_data).eq(
            'share_id', share_id
        ).eq('session_id', request.session_id).execute()

        return {'success': bool(result.data)}

    except Exception as e:
        logger.error(f"Error updating view session: {str(e)}")
        return {'success': False}