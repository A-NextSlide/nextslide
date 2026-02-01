"""
API endpoints for deck sharing functionality with short URLs.
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query
from uuid import UUID
from pydantic import BaseModel, Field, EmailStr

from services.deck_sharing_service import get_sharing_service, DuplicateCollaboratorError
from services.supabase_auth_service import get_auth_service
from api.requests.api_auth import get_auth_header

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/decks", tags=["deck-sharing"])


# Request/Response Models
class CreateShareLinkRequest(BaseModel):
    """Request to create a share link for a deck."""
    share_type: str = Field('view', description="Type of share: 'view' or 'edit'")
    expires_in_hours: Optional[int] = Field(None, description="Expiration time in hours (optional)")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    require_email: bool = Field(False, description="Require viewer email before viewing")
    is_public: bool = Field(False, description="Make this presentation publicly discoverable")
    public_title: Optional[str] = Field(None, description="Public display title")
    public_description: Optional[str] = Field(None, description="Public description")
    public_category: Optional[str] = Field(None, description="Public category slug")


class ShareLinkResponse(BaseModel):
    """Response containing share link details."""
    id: str = Field(..., description="Share link ID")
    short_code: str = Field(..., description="Short code for the URL")
    share_type: str = Field(..., description="Type of share access")
    full_url: str = Field(..., description="Full shareable URL")
    expires_at: Optional[datetime] = Field(None, description="Expiration timestamp")
    created_at: datetime = Field(..., description="Creation timestamp")
    access_count: int = Field(0, description="Number of times the share link was used")
    last_accessed_at: Optional[datetime] = Field(None, description="When the share link was last used")
    is_active: bool = Field(True, description="Whether the share link is active")
    require_email: bool = Field(False, description="Whether email is required to view")


class AddCollaboratorRequest(BaseModel):
    """Request to add a collaborator to a deck."""
    email: EmailStr = Field(..., description="Email of the collaborator to add")
    permissions: List[str] = Field(['view', 'edit'], description="Permissions to grant")


class CollaboratorResponse(BaseModel):
    """Response for adding a collaborator."""
    share_link: ShareLinkResponse
    collaborator_email: str
    collaborator_exists: bool
    invitation_sent: bool
    invitation_error: Optional[str] = None
    user_id: Optional[str] = None
    message: str


class ShareLinksListResponse(BaseModel):
    """Response containing list of share links."""
    share_links: List[Dict[str, Any]]
    total: int


# Endpoints
@router.post("/{deck_uuid}/share", response_model=ShareLinkResponse)
async def create_share_link(
    deck_uuid: str,
    request: CreateShareLinkRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """Create a share link for a deck with a short URL."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Verify user owns the deck
        from utils.supabase import get_deck
        deck = get_deck(deck_uuid)
        
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        if deck.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to share this deck")
        
        # Create share link
        sharing_service = get_sharing_service()

        # Merge require_email into metadata
        metadata = request.metadata or {}
        if request.require_email:
            metadata['require_email'] = True

        share_link = sharing_service.create_share_link(
            deck_uuid=deck_uuid,
            user_id=user_id,
            share_type=request.share_type,
            expires_in_hours=request.expires_in_hours,
            metadata=metadata if metadata else None,
            is_public=request.is_public,
            public_title=request.public_title,
            public_description=request.public_description,
            public_category=request.public_category,
        )
        
        # Construct full URL (frontend will use appropriate domain)
        base_path = "p" if request.share_type == "view" else "e"  # p for presentation, e for edit
        full_url = f"/{base_path}/{share_link['short_code']}"
        
        return ShareLinkResponse(
            id=share_link['id'],
            short_code=share_link['short_code'],
            share_type=share_link['share_type'],
            full_url=full_url,
            expires_at=share_link.get('expires_at'),
            created_at=datetime.utcnow()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating share link: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create share link")


@router.get("/{deck_uuid}/shares", response_model=ShareLinksListResponse)
async def get_deck_share_links(
    deck_uuid: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Get all share links for a specific deck."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Verify user owns the deck
        from utils.supabase import get_deck
        deck = get_deck(deck_uuid)
        
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        if deck.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to view shares for this deck")
        
        # Get share links
        sharing_service = get_sharing_service()
        share_links = sharing_service.get_user_share_links(user_id, deck_uuid)
        
        # Add full URLs to each link
        for link in share_links:
            base_path = "p" if link.get('share_type') == "view" else "e"
            link['full_url'] = f"/{base_path}/{link['short_code']}"
        
        return ShareLinksListResponse(
            share_links=share_links,
            total=len(share_links)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting share links: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get share links")


@router.delete("/shares/{share_id}")
async def revoke_share_link(
    share_id: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Revoke (deactivate) a share link."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Revoke the share link
        sharing_service = get_sharing_service()
        success = sharing_service.revoke_share_link(share_id, user_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Share link not found or you don't have permission")
        
        return {"message": "Share link revoked successfully", "share_id": share_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking share link: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to revoke share link")


class TogglePublicRequest(BaseModel):
    """Request to toggle public visibility of a share link."""
    is_public: bool = Field(..., description="Whether to make the share publicly discoverable")
    public_title: Optional[str] = Field(None, description="Title for public listing")
    public_description: Optional[str] = Field(None, description="Description for public listing")
    public_category: Optional[str] = Field(None, description="Category for public listing")


@router.patch("/shares/{share_id}/public")
async def toggle_share_public(
    share_id: str,
    request: TogglePublicRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """Toggle whether a share link is publicly discoverable."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None

        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

        user_id = user["id"]

        # Verify ownership and update
        from utils.supabase import get_supabase_client
        supabase = get_supabase_client()

        # Build update data
        update_data = {
            'is_public': request.is_public,
        }
        if request.public_title is not None:
            update_data['public_title'] = request.public_title
        if request.public_description is not None:
            update_data['public_description'] = request.public_description
        if request.public_category is not None:
            update_data['public_category'] = request.public_category

        result = supabase.table('deck_shares').update(update_data).eq(
            'id', share_id
        ).eq('created_by', user_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Share link not found or no permission")

        return {
            "message": "Public visibility updated",
            "share": result.data[0],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling share public: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update public visibility")


@router.post("/{deck_uuid}/collaborators", response_model=CollaboratorResponse)
async def add_collaborator(
    deck_uuid: str,
    request: AddCollaboratorRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """Add a collaborator to a deck by email."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Verify user owns the deck
        from utils.supabase import get_deck
        deck = get_deck(deck_uuid)
        
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        if deck.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to add collaborators to this deck")
        
        # Add collaborator
        sharing_service = get_sharing_service()
        try:
            share_link = sharing_service.add_collaborator(
                deck_uuid=deck_uuid,
                owner_id=user_id,
                collaborator_email=request.email,
                permissions=request.permissions
            )
        except DuplicateCollaboratorError:
            raise HTTPException(status_code=409, detail="Duplicate collaborator")
        
        # Construct response
        full_url = f"/e/{share_link['short_code']}"  # e for edit
        
        share_link_response = ShareLinkResponse(
            id=share_link['id'],
            short_code=share_link['short_code'],
            share_type='edit',
            full_url=full_url,
            expires_at=share_link.get('expires_at'),
            created_at=datetime.utcnow(),
            access_count=share_link.get('access_count', 0),
            last_accessed_at=share_link.get('last_accessed_at'),
            is_active=share_link.get('is_active', True)
        )
        
        # Construct appropriate message based on whether invitation was sent
        message = f"Collaborator {request.email} added successfully"
        if share_link.get('invitation_sent'):
            message += ". An invitation email has been sent"
        else:
            message += ". Please share the link with them: " + full_url
        
        return CollaboratorResponse(
            share_link=share_link_response,
            collaborator_email=request.email,
            collaborator_exists=share_link.get('collaborator_exists', False),
            invitation_sent=bool(share_link.get('invitation_sent', False)),
            invitation_error=share_link.get('invitation_error'),
            user_id=share_link.get('user_id'),
            message=message
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding collaborator: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to add collaborator")


@router.get("/{deck_uuid}/collaborators")
async def get_deck_collaborators(
    deck_uuid: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Get all collaborators for a deck. Returns plain array as per FE expectations."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Verify user owns the deck
        from utils.supabase import get_deck
        deck = get_deck(deck_uuid)
        
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        if deck.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to view collaborators for this deck")
        
        # Get collaborators from database
        from utils.supabase import get_supabase_client
        supabase = get_supabase_client()
        
        # Query collaborators (no joins needed for P0 to avoid schema FK issues)
        response = supabase.table("deck_collaborators").select(
            "id,email,user_id,permissions,status,invited_at,invited_by,accepted_at"
        ).eq("deck_uuid", deck_uuid).neq("status", "revoked").execute()
        
        collaborators = []
        for collab in response.data:
            added_at = collab.get("accepted_at") or collab.get("invited_at")
            collaborators.append({
                "user_id": collab.get("user_id"),
                "email": collab.get("email"),
                "role": "admin" if collab.get("invited_by") == user_id else "member",
                "permissions": collab.get("permissions", ["view", "edit"]),
                "status": collab.get("status", "invited"),
                "invited_by_user_id": collab.get("invited_by"),
                "invited_at": collab.get("invited_at"),
                "added_at": added_at
            })
        
        return collaborators
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting collaborators: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get collaborators")


@router.delete("/{deck_uuid}/collaborators/{identifier}")
async def remove_collaborator(
    deck_uuid: str,
    identifier: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Remove a collaborator from a deck by email or user_id (UUID)."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Verify user owns the deck
        from utils.supabase import get_deck
        deck = get_deck(deck_uuid)
        
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        if deck.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to remove collaborators from this deck")
        
        # Update collaborator status to revoked
        from utils.supabase import get_supabase_client
        supabase = get_supabase_client()
        
        # Determine if identifier is a UUID (user_id) or email
        is_uuid = False
        try:
            from uuid import UUID as _UUID
            _ = _UUID(identifier)
            is_uuid = True
        except Exception:
            is_uuid = False

        query = supabase.table("deck_collaborators").update({
            "status": "revoked",
            "updated_at": datetime.utcnow().isoformat()
        }).eq("deck_uuid", deck_uuid)
        if is_uuid:
            query = query.eq("user_id", identifier)
        else:
            query = query.eq("email", identifier)
        result = query.execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Collaborator not found")
        
        return {
            "message": f"Collaborator {identifier} removed successfully",
            "deck_uuid": deck_uuid,
            "identifier": identifier
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing collaborator: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to remove collaborator")


class UpdateCollaboratorRequest(BaseModel):
    """Request to update collaborator permissions/role."""
    permissions: Optional[List[str]] = Field(None, description="New permissions to set")
    role: Optional[str] = Field(None, description="Role to set: admin | member")


@router.patch("/{deck_uuid}/collaborators/{identifier}")
async def update_collaborator_permissions(
    deck_uuid: str,
    identifier: str,
    request: UpdateCollaboratorRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """Update permissions for a collaborator by email or user_id (UUID)."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Verify user owns the deck
        from utils.supabase import get_deck
        deck = get_deck(deck_uuid)
        
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        if deck.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to update collaborators for this deck")
        
        # Validate permissions if provided
        if request.permissions is not None:
            valid_permissions = ["view", "edit", "share"]
            for perm in request.permissions:
                if perm not in valid_permissions:
                    raise HTTPException(status_code=400, detail=f"Invalid permission: {perm}")
        
        # Update collaborator permissions
        from utils.supabase import get_supabase_client
        supabase = get_supabase_client()
        
        update_data = {"updated_at": datetime.utcnow().isoformat()}
        if request.permissions is not None:
            update_data["permissions"] = request.permissions
        # Determine identifier type
        is_uuid = False
        try:
            from uuid import UUID as _UUID
            _ = _UUID(identifier)
            is_uuid = True
        except Exception:
            is_uuid = False
        query = supabase.table("deck_collaborators").update(update_data).eq("deck_uuid", deck_uuid).neq("status", "revoked")
        if is_uuid:
            query = query.eq("user_id", identifier)
        else:
            query = query.eq("email", identifier)
        result = query.execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Active collaborator not found")
        
        return {
            "message": "Collaborator updated successfully",
            "deck_uuid": deck_uuid,
            "identifier": identifier,
            "permissions": request.permissions
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating collaborator permissions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update permissions")


@router.get("/shares/{share_id}/stats")
async def get_share_stats(
    share_id: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Get usage statistics for a share link."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Get share stats
        sharing_service = get_sharing_service()
        stats = sharing_service.get_share_stats(share_id, user_id)
        
        if not stats:
            raise HTTPException(status_code=404, detail="Share link not found or you don't have permission")
        
        return stats
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting share stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get share statistics")


# Enhanced Analytics Models
class AnalyticsOverview(BaseModel):
    """Analytics overview metrics."""
    total_views: int
    unique_visitors: int
    average_time_spent: int  # seconds
    completion_rate: float  # percentage


class ViewsTimeline(BaseModel):
    """Views timeline data."""
    by_date: List[Dict[str, Any]]  # [{ date: string, views: number }]
    by_hour: List[Dict[str, Any]]  # [{ hour: number, views: number }]


class DeviceStats(BaseModel):
    """Device breakdown statistics."""
    desktop: int
    mobile: int
    tablet: int


class LocationStats(BaseModel):
    """Location-based statistics."""
    countries: List[Dict[str, Any]]  # [{ code, name, views }]
    cities: List[Dict[str, Any]]  # [{ name, country, views }]


class SlideAnalytics(BaseModel):
    """Individual slide analytics."""
    slide_number: int
    title: Optional[str] = None
    total_views: int
    avg_time_spent: float
    drop_off_rate: float


class RecentView(BaseModel):
    """Recent view activity."""
    id: str
    timestamp: datetime
    visitor_id: str
    location: Dict[str, str]  # { city, country }
    device: Dict[str, str]  # { type, browser, os }
    duration: int
    slides_viewed: List[int]
    completion: float  # percentage


class AnalyticsResponse(BaseModel):
    """Complete analytics response."""
    overview: AnalyticsOverview
    views_timeline: ViewsTimeline
    devices: DeviceStats
    locations: LocationStats
    slide_analytics: Dict[str, List[SlideAnalytics]]
    referrers: Dict[str, List[Dict[str, Any]]]
    recent_activity: Dict[str, List[RecentView]]


class UpdateShareLinkRequest(BaseModel):
    """Request to update share link settings."""
    name: Optional[str] = None
    expires_at: Optional[datetime] = None
    password: Optional[str] = None
    max_uses: Optional[int] = None
    is_active: Optional[bool] = None


class NotificationSettingsRequest(BaseModel):
    """Email notification settings."""
    email_on_view: bool = False
    email_on_completion: bool = False
    daily_summary: bool = False
    weekly_report: bool = False


@router.patch("/shares/{share_id}")
async def update_share_link(
    share_id: str,
    request: UpdateShareLinkRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """Update share link settings."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Update share link via Supabase
        from utils.supabase import get_supabase_client
        supabase = get_supabase_client()
        
        # Build update data
        update_data = {}
        if request.name is not None:
            update_data['metadata'] = {'name': request.name}
        if request.expires_at is not None:
            update_data['expires_at'] = request.expires_at.isoformat()
        if request.password is not None:
            # Hash password using PostgreSQL's crypt function
            update_data['password_hash'] = request.password  # Will be hashed by the SQL function
        if request.max_uses is not None:
            update_data['max_uses'] = request.max_uses
        if request.is_active is not None:
            update_data['is_active'] = request.is_active
        
        # Update with RLS check
        result = supabase.table('deck_shares').update(update_data).eq(
            'id', share_id
        ).eq('created_by', user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Share link not found or no permission")
        
        return {"share_link": result.data[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating share link: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update share link")


@router.get("/shares/{share_id}/analytics")
async def get_share_analytics(
    share_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    timezone: Optional[str] = Query('UTC'),
    token: Optional[str] = Depends(get_auth_header)
):
    """Get detailed analytics for a share link."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Get share link details first
        from utils.supabase import get_supabase_client
        supabase = get_supabase_client()
        
        # Get the share link to verify ownership
        share_result = supabase.table('deck_shares').select(
            'id, deck_uuid, created_by, access_count, created_at'
        ).eq('id', share_id).execute()
        
        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found")
        
        share_data = share_result.data[0]
        
        # Verify ownership
        if share_data['created_by'] != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to view analytics for this share")
        
        # For now, return mock analytics data since the SQL function might not exist
        # In production, you would query the share_link_analytics table
        total_views = share_data.get('access_count', 0)
        
        # Mock data structure matching frontend expectations
        views_by_date = [
            {"date": "2024-01-20", "views": 32},
            {"date": "2024-01-21", "views": 45},
            {"date": "2024-01-22", "views": 28}
        ]
        
        hourly_views = [{"hour": i, "views": (i * 3) % 10} for i in range(24)]
        
        # Build response
        response = AnalyticsResponse(
            overview=AnalyticsOverview(
                total_views=total_views,
                unique_visitors=max(1, total_views // 2),
                average_time_spent=185,
                completion_rate=0.68
            ),
            views_timeline=ViewsTimeline(
                by_date=views_by_date,
                by_hour=hourly_views
            ),
            devices=DeviceStats(
                desktop=int(total_views * 0.6),
                mobile=int(total_views * 0.3),
                tablet=int(total_views * 0.1)
            ),
            locations=LocationStats(
                countries=[
                    {"code": "US", "name": "United States", "views": int(total_views * 0.4)},
                    {"code": "GB", "name": "United Kingdom", "views": int(total_views * 0.2)}
                ],
                cities=[
                    {"name": "San Francisco", "country": "United States", "views": int(total_views * 0.2)},
                    {"name": "New York", "country": "United States", "views": int(total_views * 0.15)}
                ]
            ),
            slide_analytics={
                'slides': [
                    SlideAnalytics(
                        slide_number=i + 1,
                        title=f"Slide {i + 1}",
                        total_views=total_views,
                        avg_time_spent=12.5,
                        drop_off_rate=0.05 * i
                    ) for i in range(5)
                ]
            },
            referrers={
                'sources': [
                    {'name': 'Direct', 'views': int(total_views * 0.4)},
                    {'name': 'Email', 'views': int(total_views * 0.3)},
                    {'name': 'Social', 'views': int(total_views * 0.3)}
                ]
            },
            recent_activity={
                'views': [
                    RecentView(
                        id=str(i),
                        timestamp=datetime.utcnow(),
                        visitor_id=f"visitor_{i}",
                        location={"city": "San Francisco", "country": "US"},
                        device={"type": "desktop", "browser": "Chrome", "os": "MacOS"},
                        duration=180 + i * 20,
                        slides_viewed=[1, 2, 3],
                        completion=0.75
                    ) for i in range(5)
                ]
            }
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting analytics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get analytics")


@router.get("/shares/{share_id}/analytics-simple")
async def get_share_analytics_simple(
    share_id: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """
    Get analytics in the simplified format expected by the frontend.
    This endpoint returns data matching the exact structure shown in the frontend docs.
    """
    try:
        # For now, if no token, return mock data to avoid auth issues during testing
        if not token:
            logger.warning(f"Analytics requested without auth for share {share_id}, returning mock data")
            return {
                "totalViews": 247,
                "uniqueVisitors": 89,
                "averageTimeSpent": 185,
                "viewsByDate": [
                    {"date": "2024-01-20", "views": 32},
                    {"date": "2024-01-21", "views": 45},
                    {"date": "2024-01-22", "views": 28}
                ],
                "viewsByHour": [
                    {"hour": i, "views": (i * 3) % 10} for i in range(24)
                ],
                "deviceTypes": {
                    "desktop": 156,
                    "mobile": 78,
                    "tablet": 13
                },
                "topLocations": [
                    {"country": "United States", "city": "San Francisco", "views": 89},
                    {"country": "United Kingdom", "city": "London", "views": 45}
                ],
                "slideEngagement": [
                    {"slideNumber": i + 1, "views": 247 - i * 20, "avgTime": 12.5 + i}
                    for i in range(5)
                ],
                "referrers": [
                    {"source": "Direct", "views": 98},
                    {"source": "Email", "views": 74},
                    {"source": "Social", "views": 75}
                ],
                "recentViews": [
                    {
                        "timestamp": f"2024-01-25T10:{30 + i}:00Z",
                        "location": "San Francisco, US",
                        "device": "Chrome on MacOS",
                        "duration": 245 + i * 10,
                        "slidesViewed": 8 - i
                    }
                    for i in range(5)
                ]
            }
        
        # Get the detailed analytics first
        detailed = await get_share_analytics(share_id, token=token)
        
        # Transform to the simplified format
        simplified = {
            "totalViews": detailed.overview.total_views,
            "uniqueVisitors": detailed.overview.unique_visitors,
            "averageTimeSpent": detailed.overview.average_time_spent,
            "viewsByDate": detailed.views_timeline.by_date,
            "viewsByHour": detailed.views_timeline.by_hour,
            "deviceTypes": {
                "desktop": detailed.devices.desktop,
                "mobile": detailed.devices.mobile,
                "tablet": detailed.devices.tablet
            },
            "topLocations": [
                {
                    "country": city.get('name', '').split(', ')[-1] if ', ' in city.get('name', '') else 'Unknown',
                    "city": city.get('name', '').split(', ')[0] if ', ' in city.get('name', '') else city.get('name', ''),
                    "views": city.get('views', 0)
                }
                for city in detailed.locations.cities[:10]
            ],
            "slideEngagement": [
                {
                    "slideNumber": slide.slide_number,
                    "views": slide.total_views,
                    "avgTime": slide.avg_time_spent
                }
                for slide in detailed.slide_analytics.get('slides', [])
            ],
            "referrers": [
                {"source": source.get('name'), "views": source.get('views')}
                for source in detailed.referrers.get('sources', [])
            ],
            "recentViews": [
                {
                    "timestamp": view.timestamp.isoformat() if hasattr(view.timestamp, 'isoformat') else view.timestamp,
                    "location": f"{view.location.get('city', 'Unknown')}, {view.location.get('country', 'Unknown')}",
                    "device": f"{view.device.get('browser', 'Unknown')} on {view.device.get('os', 'Unknown')}",
                    "duration": view.duration,
                    "slidesViewed": len(view.slides_viewed)
                }
                for view in detailed.recent_activity.get('views', [])[:20]
            ]
        }
        
        return simplified
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting simplified analytics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get analytics")


@router.get("/shares/{share_id}/analytics/export")
async def export_analytics(
    share_id: str,
    format: str = Query('json', regex='^(pdf|csv|json)$'),
    token: Optional[str] = Depends(get_auth_header)
):
    """Export analytics data in various formats."""
    try:
        # Get analytics data first
        analytics = await get_share_analytics(share_id, token=token)
        
        if format == 'json':
            return analytics
        
        elif format == 'csv':
            # Convert to CSV format
            import csv
            import io
            
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Write overview
            writer.writerow(['Metric', 'Value'])
            writer.writerow(['Total Views', analytics.overview.total_views])
            writer.writerow(['Unique Visitors', analytics.overview.unique_visitors])
            writer.writerow(['Average Time Spent (seconds)', analytics.overview.average_time_spent])
            writer.writerow(['Completion Rate (%)', analytics.overview.completion_rate * 100])
            writer.writerow([])
            
            # Write daily views
            writer.writerow(['Date', 'Views'])
            for item in analytics.views_timeline.by_date:
                writer.writerow([item['date'], item['views']])
            
            from fastapi.responses import Response
            return Response(
                content=output.getvalue(),
                media_type='text/csv',
                headers={'Content-Disposition': f'attachment; filename="analytics_{share_id}.csv"'}
            )
        
        else:  # PDF
            # This would require a PDF generation library like reportlab
            raise HTTPException(status_code=501, detail="PDF export not yet implemented")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting analytics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to export analytics")


@router.get("/shares/{share_id}/analytics-real")
async def get_real_analytics(
    share_id: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Get real analytics data from view events table."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None

        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

        user_id = user["id"]

        # Verify user owns this share link
        from utils.supabase import get_supabase_client
        supabase = get_supabase_client()

        share_result = supabase.table('deck_shares').select(
            'id, created_by, access_count, last_accessed_at'
        ).eq('id', share_id).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found")

        share_data = share_result.data[0]
        if share_data['created_by'] != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to view this data")

        # Get view events for this share
        events_result = supabase.table('share_view_events').select(
            'id, session_id, started_at, ended_at, duration_seconds, slides_viewed, slide_views, device_type, browser, os, country, city'
        ).eq('share_id', share_id).order('started_at', desc=True).limit(100).execute()

        events = events_result.data or []

        # Aggregate analytics
        total_views = share_data.get('access_count', 0) or len(events)
        unique_sessions = len(set(e.get('session_id', e['id']) for e in events)) if events else total_views

        # Calculate average time
        durations = [e['duration_seconds'] for e in events if e.get('duration_seconds')]
        avg_time = int(sum(durations) / len(durations)) if durations else 0

        # Device breakdown
        device_counts = {'desktop': 0, 'mobile': 0, 'tablet': 0}
        for e in events:
            device = e.get('device_type', 'desktop')
            if device in device_counts:
                device_counts[device] += 1
            else:
                device_counts['desktop'] += 1

        # If no events yet, use access_count for desktop
        if not events and total_views > 0:
            device_counts['desktop'] = total_views

        # Slide engagement - aggregate from all events
        slide_times = {}  # slideIndex -> total time
        for e in events:
            slide_views = e.get('slide_views', [])
            if isinstance(slide_views, list):
                for sv in slide_views:
                    if isinstance(sv, dict):
                        idx = sv.get('slideIndex', 0)
                        time_ms = sv.get('timeSpentMs', 0)
                        slide_times[idx] = slide_times.get(idx, 0) + time_ms

        # Convert to list sorted by slide index
        slide_engagement = []
        if slide_times:
            for idx in sorted(slide_times.keys()):
                slide_engagement.append({
                    'slideNumber': idx + 1,
                    'views': len([e for e in events if any(
                        sv.get('slideIndex') == idx for sv in (e.get('slide_views') or []) if isinstance(sv, dict)
                    )]),
                    'avgTime': int(slide_times[idx] / 1000)  # Convert to seconds
                })

        # Recent views
        recent_views = []
        for e in events[:5]:
            recent_views.append({
                'timestamp': e['started_at'],
                'location': e.get('city') or e.get('country') or '-',
                'device': e.get('device_type', '-'),
                'duration': e.get('duration_seconds', 0),
                'slidesViewed': e.get('slides_viewed', 0)
            })

        # If no events, add placeholder from last_accessed_at
        if not recent_views and share_data.get('last_accessed_at') and total_views > 0:
            recent_views.append({
                'timestamp': share_data['last_accessed_at'],
                'location': '-',
                'device': '-',
                'duration': 0,
                'slidesViewed': 0
            })

        return {
            'totalViews': total_views,
            'uniqueVisitors': unique_sessions,
            'averageTimeSpent': avg_time,
            'viewsByDate': [],
            'viewsByHour': [],
            'deviceTypes': device_counts,
            'topLocations': [],
            'slideEngagement': slide_engagement,
            'referrers': [],
            'recentViews': recent_views
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting real analytics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get analytics")


class UpdateShareMetadataRequest(BaseModel):
    """Request to update share link metadata (e.g., OG image URL)."""
    metadata: Dict[str, Any] = Field(..., description="Metadata fields to update/merge")


@router.patch("/shares/{share_id}/metadata")
async def update_share_metadata(
    share_id: str,
    request: UpdateShareMetadataRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """
    Update metadata for a share link.
    This merges the provided metadata with existing metadata.
    Used for storing OG image URLs, custom settings, etc.
    """
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None

        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

        user_id = user["id"]

        from utils.supabase import get_supabase_client
        supabase = get_supabase_client()

        # Get existing share link and verify ownership
        share_result = supabase.table('deck_shares').select(
            'id, created_by, metadata'
        ).eq('id', share_id).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found")

        share_data = share_result.data[0]
        if share_data['created_by'] != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to update this share link")

        # Merge new metadata with existing
        existing_metadata = share_data.get('metadata') or {}
        merged_metadata = {**existing_metadata, **request.metadata}

        # Update the share link
        result = supabase.table('deck_shares').update({
            'metadata': merged_metadata
        }).eq('id', share_id).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update metadata")

        return {"message": "Metadata updated successfully", "metadata": merged_metadata}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating share metadata: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update metadata")


@router.get("/shares/{share_id}/viewers")
async def get_share_viewers(
    share_id: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Get all registered viewers for a share link (emails collected)."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None

        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

        user_id = user["id"]

        # Verify user owns this share link
        from utils.supabase import get_supabase_client
        supabase = get_supabase_client()

        share_result = supabase.table('deck_shares').select(
            'id, created_by'
        ).eq('id', share_id).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found")

        if share_result.data[0]['created_by'] != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to view this data")

        # Get all viewers for this share link
        viewers_result = supabase.table('share_viewers').select(
            'id, email, name, company, registered_at, client_ip'
        ).eq('share_id', share_id).order('registered_at', desc=True).execute()

        viewers = viewers_result.data if viewers_result.data else []

        return {
            'viewers': viewers,
            'total': len(viewers)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting share viewers: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get viewers")


@router.post("/shares/{share_id}/notifications")
async def update_notification_settings(
    share_id: str,
    request: NotificationSettingsRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """Update email notification settings for a share link."""
    try:
        # Get authenticated user
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        user_id = user["id"]
        
        # Store notification settings in share metadata
        from utils.supabase import get_supabase_client
        supabase = get_supabase_client()
        
        # Update metadata with notification settings
        notification_settings = {
            'email_on_view': request.email_on_view,
            'email_on_completion': request.email_on_completion,
            'daily_summary': request.daily_summary,
            'weekly_report': request.weekly_report,
            'email': user.get('email')  # Store email for notifications
        }
        
        result = supabase.table('deck_shares').update({
            'metadata': {'notifications': notification_settings}
        }).eq('id', share_id).eq('created_by', user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Share link not found or no permission")
        
        return {"message": "Notification settings updated", "settings": notification_settings}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating notifications: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update notification settings") 