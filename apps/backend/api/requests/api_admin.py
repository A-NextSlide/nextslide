"""
Admin API endpoints for the admin dashboard
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, Header, Request
from pydantic import BaseModel
import jwt
from services.supabase import get_supabase_client
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin"])

# Request/Response models
class AdminCheckResponse(BaseModel):
    isAdmin: bool
    role: str
    permissions: List[str] = []

class UserSummary(BaseModel):
    id: str
    email: str
    fullName: Optional[str] = None
    createdAt: str
    lastActive: Optional[str] = None  # Frontend expects lastActive, not lastActiveAt
    deckCount: int = 0  # Frontend expects deckCount, not totalDecks
    storageUsed: int = 0
    status: str = "active"
    role: str = "user"

class UsersListResponse(BaseModel):
    users: List[UserSummary]
    total: int
    page: int
    totalPages: int

class UserMetrics(BaseModel):
    totalDecks: int = 0
    publicDecks: int = 0
    privateDecks: int = 0
    totalSlides: int = 0
    storageUsed: int = 0
    collaborations: int = 0
    lastActiveAt: Optional[str] = None
    averageSessionDuration: int = 0
    totalSessions: int = 0
    loginCount: int = 0

class UserDetail(BaseModel):
    id: str
    email: str
    emailConfirmedAt: Optional[str] = None
    fullName: Optional[str] = None
    avatarUrl: Optional[str] = None
    createdAt: str
    updatedAt: Optional[str] = None
    lastSignInAt: Optional[str] = None
    provider: Optional[str] = None
    role: str = "user"
    status: str = "active"
    metadata: Optional[Dict[str, Any]] = None

class UserDetailResponse(BaseModel):
    user: UserDetail
    metrics: UserMetrics
    recentActivity: List[Dict[str, Any]] = []

class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class UserActionRequest(BaseModel):
    action: str  # suspend, delete, reset_password, clear_sessions
    reason: Optional[str] = None

class DeckSharing(BaseModel):
    isShared: bool = False
    sharedWith: int = 0
    shareType: Optional[str] = None

class DeckAnalytics(BaseModel):
    viewCount: int = 0
    editCount: int = 0
    shareCount: int = 0

class DeckSummary(BaseModel):
    id: str
    uuid: str
    name: str
    description: Optional[str] = None
    slideCount: int = 0
    createdAt: str
    updatedAt: Optional[str] = None
    lastModified: Optional[str] = None
    visibility: str = "private"
    thumbnailUrl: Optional[str] = None
    size: Dict[str, int] = {"width": 1920, "height": 1080}
    sharing: DeckSharing
    analytics: DeckAnalytics
    # Add first slide for thumbnail rendering
    firstSlide: Optional[Dict[str, Any]] = None
    slides: Optional[List[Dict[str, Any]]] = None  # For compatibility with DeckThumbnail component

class DecksListResponse(BaseModel):
    decks: List[Dict[str, Any]]  # Return full deck objects like regular deck list
    total: int
    page: int
    totalPages: int

class PlatformMetrics(BaseModel):
    users: Dict[str, Any]
    decks: Dict[str, Any]
    storage: Dict[str, Any]
    collaboration: Dict[str, Any]
    activity: Dict[str, Any]

class TrendData(BaseModel):
    date: str
    value: int

class UserTrendData(BaseModel):
    date: str
    signups: int
    logins: int

class UserTrendsResponse(BaseModel):
    trends: List[UserTrendData]

class DeckTrendsResponse(BaseModel):
    trends: List[Dict[str, Any]]

class AdminAuditLog(BaseModel):
    id: str
    admin_user_id: str
    admin_email: Optional[str] = None
    target_user_id: Optional[str] = None
    target_deck_id: Optional[str] = None
    action: str
    action_details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: str

class AuditLogsResponse(BaseModel):
    logs: List[AdminAuditLog]
    total: int
    page: int
    totalPages: int

# Helper function to verify admin role
async def verify_admin_role(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Verify that the user has admin role
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No authorization token provided")
    
    token = authorization.replace("Bearer ", "")

    try:
        # Verify token using direct HTTP call with tight timeouts
        import os
        supabase_url = os.getenv("SUPABASE_URL")
        api_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        headers = {"Authorization": f"Bearer {token}", "apikey": api_key}
        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers=headers,
            timeout=httpx.Timeout(connect=1.5, read=2.0, write=2.0, pool=1.0)
        )
        if not resp or resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_json = resp.json()
        user_id = user_json.get("id")
        user_email = user_json.get("email")

        # Check admin role in users table
        supabase = get_supabase_client()
        user_data = supabase.table("users").select("role, permissions").eq("id", user_id).single().execute()

        if not user_data.data or user_data.data.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")

        return {
            "id": user_id,
            "email": user_email,
            "role": user_data.data.get("role"),
            "permissions": user_data.data.get("permissions", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin verification error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Helper function to log admin actions
async def log_admin_action(
    admin_user_id: str,
    action: str,
    request: Request,
    target_user_id: Optional[str] = None,
    target_deck_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """Log admin action to audit log"""
    try:
        supabase = get_supabase_client()
        
        log_entry = {
            "admin_user_id": admin_user_id,
            "target_user_id": target_user_id,
            "target_deck_id": target_deck_id,
            "action": action,
            "action_details": details or {},
            "ip_address": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "created_at": datetime.utcnow().isoformat()
        }
        
        supabase.table("admin_audit_logs").insert(log_entry).execute()
        
    except Exception as e:
        logger.error(f"Failed to log admin action: {str(e)}")
        # Don't fail the request if logging fails

# Endpoints

@router.get("/check", response_model=AdminCheckResponse)
async def check_admin_access(authorization: Optional[str] = Header(None)):
    """
    Check if the current user has admin access
    """
    try:
        if not authorization or not authorization.startswith("Bearer "):
            return AdminCheckResponse(isAdmin=False, role="user", permissions=[])
        
        token = authorization.replace("Bearer ", "")
        supabase = get_supabase_client()

        # Validate token with direct HTTP call using tight timeouts to avoid UI hangs
        try:
            import os
            supabase_url = os.getenv("SUPABASE_URL")
            api_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
            headers = {"Authorization": f"Bearer {token}", "apikey": api_key}
            resp = httpx.get(
                f"{supabase_url}/auth/v1/user",
                headers=headers,
                timeout=httpx.Timeout(connect=1.5, read=2.0, write=2.0, pool=1.0)
            )
            if resp.status_code != 200:
                return AdminCheckResponse(isAdmin=False, role="user", permissions=[])
            user_json = resp.json()
            user_id = user_json.get("id")
            user_email = user_json.get("email")
        except Exception:
            # On any auth error, treat as non-admin quickly
            return AdminCheckResponse(isAdmin=False, role="user", permissions=[])
        
        # Check role in users table
        user_data = supabase.table("users").select("role, permissions").eq("id", user_id).single().execute()
        
        if not user_data.data:
            return AdminCheckResponse(isAdmin=False, role="user", permissions=[])
        
        role = user_data.data.get("role", "user")
        permissions = user_data.data.get("permissions", [])
        
        return AdminCheckResponse(
            isAdmin=role == "admin",
            role=role,
            permissions=permissions
        )
        
    except Exception as e:
        logger.error(f"Admin check error: {str(e)}")
        return AdminCheckResponse(isAdmin=False, role="user", permissions=[])

@router.get("/users", response_model=UsersListResponse)
async def list_users(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    List all users with pagination and search
    """
    try:
        supabase = get_supabase_client()
        
        # Build query
        query = supabase.table("users").select("*", count="exact")
        
        # Apply search
        if search:
            query = query.or_(f"email.ilike.%{search}%,full_name.ilike.%{search}%")
        
        # Apply pagination
        offset = (page - 1) * limit
        query = query.range(offset, offset + limit - 1)
        
        # Apply sorting
        query = query.order(sort_by, desc=(sort_order == "desc"))
        
        # Execute query
        response = query.execute()
        
        # Get deck counts for each user - use fallback if RPC function doesn't exist
        user_ids = [user["id"] for user in response.data]
        deck_counts = {}
        
        if user_ids:
            try:
                # Try RPC function first
                deck_response = supabase.rpc("get_user_deck_counts", {"user_ids": user_ids}).execute()
                if deck_response.data:
                    deck_counts = {item["user_id"]: item["deck_count"] for item in deck_response.data}
            except Exception as e:
                logger.warning(f"RPC function failed, using direct query: {str(e)}")
                # Fallback to direct query
                for user_id in user_ids:
                    count_response = supabase.table("decks").select("uuid", count="exact").eq("user_id", user_id).execute()
                    deck_counts[user_id] = count_response.count or 0
        
        # Format users
        users = []
        for user in response.data:
            users.append(UserSummary(
                id=user["id"],
                email=user.get("email", ""),  # Handle missing email
                fullName=user.get("full_name"),
                createdAt=user.get("created_at", datetime.utcnow().isoformat()),
                lastActive=user.get("last_sign_in_at"),  # Changed to lastActive
                deckCount=deck_counts.get(user["id"], 0),  # Changed to deckCount
                storageUsed=0,  # TODO: Calculate actual storage
                status=user.get("status", "active"),
                role=user.get("role", "user")
            ))
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="view_users",
            request=request,
            details={"page": page, "search": search}
        )
        
        return UsersListResponse(
            users=users,
            total=response.count or 0,
            page=page,
            totalPages=max(1, (response.count or 0) // limit + (1 if (response.count or 0) % limit > 0 else 0))
        )
        
    except Exception as e:
        logger.error(f"List users error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}")
async def get_user_details(
    user_id: str,
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get detailed information about a specific user
    """
    try:
        supabase = get_supabase_client()
        
        # Get user data
        user_response = supabase.table("users").select("*").eq("id", user_id).single().execute()
        
        if not user_response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_data = user_response.data
        
        # Get user metrics
        metrics_data = {
            "totalDecks": 0,
            "publicDecks": 0,
            "privateDecks": 0,
            "totalSlides": 0,
            "storageUsed": 0,
            "collaborations": 0,
            "lastActiveAt": user_data.get("last_sign_in_at"),
            "averageSessionDuration": 0,
            "totalSessions": 0,
            "loginCount": 0
        }
        
        # Get deck statistics - use fallback if RPC fails
        try:
            deck_stats_response = supabase.rpc("get_deck_stats_for_user", {"p_user_id": user_id}).execute()
            
            if deck_stats_response.data and len(deck_stats_response.data) > 0:
                stats = deck_stats_response.data[0]
                metrics_data["totalDecks"] = stats.get("total_decks", 0)
                metrics_data["publicDecks"] = stats.get("public_decks", 0)
                metrics_data["privateDecks"] = metrics_data["totalDecks"] - metrics_data["publicDecks"]
        except Exception as e:
            logger.warning(f"RPC function failed, using direct queries: {str(e)}")
            # Fallback to direct queries
            total_decks_response = supabase.table("decks").select("uuid", count="exact").eq("user_id", user_id).execute()
            metrics_data["totalDecks"] = total_decks_response.count or 0
            
            public_decks_response = supabase.table("decks").select("uuid", count="exact").eq("user_id", user_id).eq("visibility", "public").execute()
            metrics_data["publicDecks"] = public_decks_response.count or 0
            metrics_data["privateDecks"] = metrics_data["totalDecks"] - metrics_data["publicDecks"]
        
        # Calculate account age
        if user_data.get("created_at"):
            created_date = datetime.fromisoformat(user_data["created_at"].replace("Z", "+00:00"))
            metrics_data["account_age_days"] = (datetime.utcnow() - created_date.replace(tzinfo=None)).days
        
        # Get recent activity (placeholder - implement actual activity tracking)
        recent_activity = []
        
        # Get slide counts
        total_slides = 0
        try:
            slide_count_query = supabase.rpc("get_user_total_slides", {"p_user_id": user_id}).execute()
            total_slides = slide_count_query.data[0]["total_slides"] if slide_count_query.data else 0
        except Exception as e:
            logger.warning(f"Slide count RPC failed, using direct query: {str(e)}")
            # Fallback: count slides from decks
            decks_response = supabase.table("decks").select("slides").eq("user_id", user_id).execute()
            if decks_response.data:
                for deck in decks_response.data:
                    if deck.get("slides") and isinstance(deck["slides"], list):
                        total_slides += len(deck["slides"])
        
        # Parse metadata safely (it might be TEXT or JSONB)
        metadata_obj = {}
        raw_metadata = user_data.get("metadata")
        if raw_metadata:
            if isinstance(raw_metadata, dict):
                metadata_obj = raw_metadata
            elif isinstance(raw_metadata, str):
                try:
                    import json
                    metadata_obj = json.loads(raw_metadata)
                except:
                    metadata_obj = {}
        
        # Build response matching frontend requirements exactly
        response = {
            "id": user_data["id"],
            "email": user_data["email"],
            "fullName": user_data.get("full_name"),
            "createdAt": user_data["created_at"],
            "lastActive": user_data.get("last_sign_in_at"),
            "status": user_data.get("status", "active"),
            "role": user_data.get("role", "user"),
            "emailVerified": user_data.get("email_verified", False),
            "metadata": {
                "lastLoginIp": metadata_obj.get("last_login_ip"),
                "signupSource": metadata_obj.get("signup_source", "organic"),
                "browser": metadata_obj.get("browser"),
                "os": metadata_obj.get("os")
            },
            "stats": {
                "totalDecks": metrics_data["totalDecks"],
                "publicDecks": metrics_data["publicDecks"],
                "privateDecks": metrics_data["privateDecks"],
                "totalSlides": total_slides,
                "storageUsed": 0,  # TODO: Calculate actual storage
                "collaborations": metrics_data.get("collaborations", 0),
                "viewsReceived": 0,  # TODO: Implement view tracking
                "sharesCreated": metrics_data["publicDecks"]  # Approximate with public decks
            },
            "recentActivity": recent_activity
        }
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="view_user",
            request=request,
            target_user_id=user_id
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user details error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    request: Request,
    update_request: UpdateUserRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Update user information
    """
    try:
        supabase = get_supabase_client()
        
        # Build update data
        updates = {}
        if update_request.role is not None:
            updates["role"] = update_request.role
        if update_request.status is not None:
            updates["status"] = update_request.status
        if update_request.metadata is not None:
            updates["metadata"] = update_request.metadata
        
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        updates["updated_at"] = datetime.utcnow().isoformat()
        
        # Update user
        response = supabase.table("users").update(updates).eq("id", user_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="update_user",
            request=request,
            target_user_id=user_id,
            details=updates
        )
        
        return {"success": True, "user": response.data[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update user error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/users/{user_id}/actions")
async def perform_user_action(
    user_id: str,
    request: Request,
    action_request: UserActionRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Perform administrative actions on a user
    """
    try:
        supabase = get_supabase_client()
        
        # Validate action
        valid_actions = ["suspend", "delete", "reset_password", "clear_sessions", "reactivate"]
        if action_request.action not in valid_actions:
            raise HTTPException(status_code=400, detail=f"Invalid action. Must be one of: {', '.join(valid_actions)}")
        
        # Get user data first
        user_data = supabase.table("users").select("email, status").eq("id", user_id).single().execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_email = user_data.data.get("email")
        
        # Perform action
        if action_request.action == "suspend":
            supabase.table("users").update({
                "status": "suspended",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", user_id).execute()
            
        elif action_request.action == "reactivate":
            supabase.table("users").update({
                "status": "active",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", user_id).execute()
            
        elif action_request.action == "delete":
            # Soft delete - mark as deleted but keep data
            supabase.table("users").update({
                "status": "deleted",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", user_id).execute()
            
        elif action_request.action == "reset_password":
            # This would need to use Supabase Admin API with service role key
            # For now, we'll just log the action
            logger.info(f"Password reset requested for user {user_email}")
            
        elif action_request.action == "clear_sessions":
            # Mark all active sessions as ended
            supabase.table("user_sessions").update({
                "is_active": False,
                "ended_at": datetime.utcnow().isoformat()
            }).eq("user_id", user_id).eq("is_active", True).execute()
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action=action_request.action,
            request=request,
            target_user_id=user_id,
            details={"reason": action_request.reason}
        )
        
        return {"success": True, "message": f"Action {action_request.action} completed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"User action error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/decks")
async def list_all_decks(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    visibility: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    List all decks with filters
    """
    try:
        supabase = get_supabase_client()
        
        # Build query - select deck data
        # TODO: PostgREST doesn't support array slicing or cardinality in select.
        # For now, fetching full slides array but only using first slide.
        query = supabase.table("decks").select(
            "uuid,name,created_at,updated_at,last_modified,user_id,status,description,slides,visibility,data",
            count="exact"
        )
        
        # Apply filters
        if search:
            query = query.ilike("name", f"%{search}%")
        if visibility:
            query = query.eq("visibility", visibility)
        if user_id:
            query = query.eq("user_id", user_id)
        
        # Apply pagination
        offset = (page - 1) * limit
        query = query.range(offset, offset + limit - 1)
        
        # Apply sorting
        query = query.order("created_at", desc=True)
        
        # Execute query
        response = query.execute()
        
        # Get unique user IDs from decks
        user_ids = list(set(deck["user_id"] for deck in response.data if deck.get("user_id")))
        
        # Fetch user information
        users_map = {}
        if user_ids:
            users_response = supabase.table("users").select("id,email,full_name").in_("id", user_ids).execute()
            users_map = {user["id"]: user for user in users_response.data}
        
        # Format decks
        decks = []
        for deck in response.data:
            # Handle JSON status field
            status = "draft"
            if deck.get("status"):
                if isinstance(deck["status"], dict):
                    status = deck["status"].get("status", "draft")
                else:
                    status = deck.get("status", "draft")
            
            # Handle JSON visibility field
            visibility = "private"
            if deck.get("visibility"):
                if isinstance(deck["visibility"], dict):
                    visibility = deck["visibility"].get("visibility", "private")
                else:
                    visibility = deck.get("visibility", "private")
            
            # Get slides data for thumbnails
            slides_data = deck.get("slides", [])
            
            # Create deck object similar to regular deck list API
            # Include all the fields the frontend expects
            deck_obj = {
                "id": deck["uuid"],
                "uuid": deck["uuid"],
                "name": deck["name"],
                "description": deck.get("description"),
                "created_at": deck["created_at"],
                "updated_at": deck.get("updated_at"),
                "last_modified": deck.get("last_modified", deck.get("updated_at")),
                "user_id": deck["user_id"],
                "status": status,
                "visibility": visibility,
                "is_owner": True,  # Admin can see all decks
                
                # Include slide data for thumbnails
                "slides": slides_data,  # Full slides array for DeckThumbnail
                "slide_count": len(slides_data),
                "first_slide": slides_data[0] if slides_data else None,
                
                # Include data which contains theme info
                "data": deck.get("data", {}),
                "theme": deck.get("data", {}).get("theme", {}) if deck.get("data") else {},
                
                # Admin-specific fields
                "slideCount": len(slides_data),
                "createdAt": deck["created_at"],
                "updatedAt": deck.get("updated_at"),
                "lastModified": deck.get("last_modified", deck.get("updated_at")),
                "thumbnailUrl": None,
                "size": {"width": 1920, "height": 1080},
                "sharing": DeckSharing(
                    isShared=visibility == "public",
                    sharedWith=0,
                    shareType="public" if visibility == "public" else None
                ),
                "analytics": DeckAnalytics(
                    viewCount=0,
                    editCount=0,
                    shareCount=0
                )
            }
            
            # Add user info to deck object
            user_id = deck.get("user_id")
            if user_id and user_id in users_map:
                user_info = users_map[user_id]
                deck_obj["userId"] = user_id
                deck_obj["userEmail"] = user_info.get("email")
                deck_obj["userFullName"] = user_info.get("full_name")
            else:
                deck_obj["userId"] = user_id
                deck_obj["userEmail"] = None
                deck_obj["userFullName"] = None
            
            decks.append(deck_obj)
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="view_decks",
            request=request,
            details={"page": page, "search": search, "filters": {"visibility": visibility, "user_id": user_id}}
        )
        
        return DecksListResponse(
            decks=decks,
            total=response.count or 0,
            page=page,
            totalPages=max(1, (response.count or 0) // limit + (1 if (response.count or 0) % limit > 0 else 0))
        )
        
    except Exception as e:
        logger.error(f"List decks error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/overview", response_model=PlatformMetrics)
async def get_platform_overview(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get platform-wide analytics and metrics - simplified version that handles missing data
    """
    try:
        supabase = get_supabase_client()
        
        # Initialize with safe defaults
        metrics_data = {
            "users": {
                "total": 0,
                "active24h": 0,
                "active7d": 0,
                "active30d": 0,
                "growthRate": 0,
                "newToday": 0,
                "newThisWeek": 0,
                "newThisMonth": 0
            },
            "decks": {
                "total": 0,
                "createdToday": 0,
                "createdThisWeek": 0,
                "createdThisMonth": 0,
                "averagePerUser": 0,
                "totalSlides": 0,
                "averageSlidesPerDeck": 0
            },
            "storage": {
                "totalUsed": 0,
                "averagePerUser": 0,
                "averagePerDeck": 0
            },
            "collaboration": {
                "activeSessions": 0,
                "totalCollaborations": 0,
                "averageCollaboratorsPerDeck": 0
            },
            "activity": {
                "loginsToday": 0,
                "apiCallsToday": 0,
                "errorRate": 0
            }
        }
        
        # Try to get user counts
        try:
            total_users = supabase.table("users").select("id", count="exact").execute()
            metrics_data["users"]["total"] = total_users.count or 0
            
            # Only try active user queries if last_sign_in_at exists
            if metrics_data["users"]["total"] > 0:
                try:
                    # Check if any user has last_sign_in_at
                    test_user = supabase.table("users").select("last_sign_in_at").not_.is_("last_sign_in_at", "null").limit(1).execute()
                    
                    if test_user.data:
                        # last_sign_in_at exists, we can query it
                        active_24h = supabase.table("users").select("id", count="exact").gte(
                            "last_sign_in_at",
                            (datetime.utcnow() - timedelta(hours=24)).isoformat()
                        ).execute()
                        metrics_data["users"]["active24h"] = active_24h.count or 0
                        
                        active_7d = supabase.table("users").select("id", count="exact").gte(
                            "last_sign_in_at",
                            (datetime.utcnow() - timedelta(days=7)).isoformat()
                        ).execute()
                        metrics_data["users"]["active7d"] = active_7d.count or 0
                        
                        active_30d = supabase.table("users").select("id", count="exact").gte(
                            "last_sign_in_at",
                            (datetime.utcnow() - timedelta(days=30)).isoformat()
                        ).execute()
                        metrics_data["users"]["active30d"] = active_30d.count or 0
                        
                        metrics_data["activity"]["loginsToday"] = metrics_data["users"]["active24h"]
                except:
                    # If last_sign_in_at queries fail, continue with defaults
                    pass
                
                # Try to get new user counts
                try:
                    new_today = supabase.table("users").select("id", count="exact").gte(
                        "created_at",
                        datetime.utcnow().date().isoformat()
                    ).execute()
                    metrics_data["users"]["newToday"] = new_today.count or 0
                    
                    new_week = supabase.table("users").select("id", count="exact").gte(
                        "created_at",
                        (datetime.utcnow() - timedelta(days=7)).isoformat()
                    ).execute()
                    metrics_data["users"]["newThisWeek"] = new_week.count or 0
                    
                    new_month = supabase.table("users").select("id", count="exact").gte(
                        "created_at",
                        (datetime.utcnow() - timedelta(days=30)).isoformat()
                    ).execute()
                    metrics_data["users"]["newThisMonth"] = new_month.count or 0
                    
                    # Simple growth calculation
                    if metrics_data["users"]["total"] > 0:
                        metrics_data["users"]["growthRate"] = round(
                            (metrics_data["users"]["newThisWeek"] / metrics_data["users"]["total"]) * 100, 1
                        )
                except:
                    pass
        except Exception as e:
            logger.warning(f"Error getting user metrics: {str(e)}")
        
        # Try to get deck counts
        try:
            total_decks = supabase.table("decks").select("id", count="exact").execute()
            metrics_data["decks"]["total"] = total_decks.count or 0
            
            if metrics_data["decks"]["total"] > 0:
                try:
                    decks_today = supabase.table("decks").select("id", count="exact").gte(
                        "created_at",
                        datetime.utcnow().date().isoformat()
                    ).execute()
                    metrics_data["decks"]["createdToday"] = decks_today.count or 0
                    
                    decks_week = supabase.table("decks").select("id", count="exact").gte(
                        "created_at",
                        (datetime.utcnow() - timedelta(days=7)).isoformat()
                    ).execute()
                    metrics_data["decks"]["createdThisWeek"] = decks_week.count or 0
                    
                    decks_month = supabase.table("decks").select("id", count="exact").gte(
                        "created_at",
                        (datetime.utcnow() - timedelta(days=30)).isoformat()
                    ).execute()
                    metrics_data["decks"]["createdThisMonth"] = decks_month.count or 0
                except:
                    pass
                
                # Calculate average per user
                if metrics_data["users"]["total"] > 0:
                    metrics_data["decks"]["averagePerUser"] = round(
                        metrics_data["decks"]["total"] / metrics_data["users"]["total"], 1
                    )
        except Exception as e:
            logger.warning(f"Error getting deck metrics: {str(e)}")
        
        # Create the response
        metrics = PlatformMetrics(**metrics_data)
        
        # Log the action
        try:
            await log_admin_action(
                admin_user_id=admin["id"],
                action="view_analytics",
                request=request,
                details={"type": "platform_overview"}
            )
        except:
            # Don't fail if logging fails
            pass
        
        return metrics
        
    except Exception as e:
        logger.error(f"Get platform overview error: {str(e)}")
        # Return safe defaults instead of failing
        return PlatformMetrics(
            users={"total": 0, "active24h": 0, "active7d": 0, "active30d": 0, "growthRate": 0, "newToday": 0, "newThisWeek": 0, "newThisMonth": 0},
            decks={"total": 0, "createdToday": 0, "createdThisWeek": 0, "createdThisMonth": 0, "averagePerUser": 0, "totalSlides": 0, "averageSlidesPerDeck": 0},
            storage={"totalUsed": 0, "averagePerUser": 0, "averagePerDeck": 0},
            collaboration={"activeSessions": 0, "totalCollaborations": 0, "averageCollaboratorsPerDeck": 0},
            activity={"loginsToday": 0, "apiCallsToday": 0, "errorRate": 0}
        )

@router.get("/audit-logs", response_model=AuditLogsResponse)
async def get_audit_logs(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    admin_id: Optional[str] = Query(None),
    target_user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get admin audit logs
    """
    try:
        supabase = get_supabase_client()
        
        # Build query
        query = supabase.table("admin_audit_logs").select(
            "*, admin:users!admin_user_id(email, full_name), target_user:users!target_user_id(email, full_name)",
            count="exact"
        )
        
        # Apply filters
        if admin_id:
            query = query.eq("admin_user_id", admin_id)
        if target_user_id:
            query = query.eq("target_user_id", target_user_id)
        if action:
            query = query.eq("action", action)
        
        # Apply pagination
        offset = (page - 1) * limit
        query = query.range(offset, offset + limit - 1)
        
        # Apply sorting (newest first)
        query = query.order("created_at", desc=True)
        
        # Execute query
        response = query.execute()
        
        # Format logs
        logs = []
        for log in response.data:
            logs.append(AdminAuditLog(
                id=log["id"],
                admin_user_id=log["admin_user_id"],
                admin_email=log.get("admin", {}).get("email") if log.get("admin") else None,
                target_user_id=log.get("target_user_id"),
                target_deck_id=log.get("target_deck_id"),
                action=log["action"],
                action_details=log.get("action_details"),
                ip_address=log.get("ip_address"),
                user_agent=log.get("user_agent"),
                created_at=log["created_at"]
            ))
        
        return AuditLogsResponse(
            logs=logs,
            total=response.count or 0,
            page=page,
            totalPages=max(1, (response.count or 0) // limit + (1 if (response.count or 0) % limit > 0 else 0))
        )
        
    except Exception as e:
        logger.error(f"Get audit logs error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}/decks")
async def get_user_decks(
    user_id: str,
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get all decks for a specific user
    """
    try:
        supabase = get_supabase_client()
        
        # Get user info first
        user_response = supabase.table("users").select("email, full_name").eq("id", user_id).single().execute()
        user_info = user_response.data if user_response.data else None
        
        # Build query - use explicit columns to avoid non-existent columns
        # OPTIMIZED: Only fetch first slide and slide count instead of entire slides array
        query = supabase.table("decks").select(
            "uuid,name,created_at,updated_at,last_modified,user_id,status,description,slides[0:1],cardinality(slides) as slide_count,visibility,data",
            count="exact"
        ).eq("user_id", user_id)
        
        # Apply pagination
        offset = (page - 1) * limit
        query = query.range(offset, offset + limit - 1)
        
        # Apply sorting
        query = query.order("created_at", desc=True)
        
        # Execute query
        response = query.execute()
        
        # Format decks
        decks = []
        for deck in response.data:
            # Handle JSON status field
            status = "draft"
            if deck.get("status"):
                if isinstance(deck["status"], dict):
                    status = deck["status"].get("status", "draft")
                else:
                    status = deck.get("status", "draft")
            
            # Handle JSON visibility field
            visibility = "private"
            if deck.get("visibility"):
                if isinstance(deck["visibility"], dict):
                    visibility = deck["visibility"].get("visibility", "private")
                else:
                    visibility = deck.get("visibility", "private")
            
            # Get slides data for thumbnails
            slides_data = deck.get("slides", [])
            
            # Create deck object similar to regular deck list API
            # Include all the fields the frontend expects
            deck_obj = {
                "id": deck["uuid"],
                "uuid": deck["uuid"],
                "name": deck["name"],
                "description": deck.get("description"),
                "created_at": deck["created_at"],
                "updated_at": deck.get("updated_at"),
                "last_modified": deck.get("last_modified", deck.get("updated_at")),
                "user_id": deck["user_id"],
                "status": status,
                "visibility": visibility,
                "is_owner": True,  # Admin can see all decks
                
                # Include slide data for thumbnails
                "slides": slides_data,  # Full slides array for DeckThumbnail
                "slide_count": len(slides_data),
                "first_slide": slides_data[0] if slides_data else None,
                
                # Include data which contains theme info
                "data": deck.get("data", {}),
                "theme": deck.get("data", {}).get("theme", {}) if deck.get("data") else {},
                
                # Admin-specific fields
                "slideCount": len(slides_data),
                "createdAt": deck["created_at"],
                "updatedAt": deck.get("updated_at"),
                "lastModified": deck.get("last_modified", deck.get("updated_at")),
                "thumbnailUrl": None,
                "size": {"width": 1920, "height": 1080},
                "sharing": DeckSharing(
                    isShared=visibility == "public",
                    sharedWith=0,
                    shareType="public" if visibility == "public" else None
                ),
                "analytics": DeckAnalytics(
                    viewCount=0,
                    editCount=0,
                    shareCount=0
                )
            }
            
            # Add user info to deck object
            if user_info:
                deck_obj["userId"] = user_id
                deck_obj["userEmail"] = user_info.get("email")
                deck_obj["userFullName"] = user_info.get("full_name")
            
            decks.append(deck_obj)
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="view_user_decks",
            request=request,
            target_user_id=user_id,
            details={"page": page}
        )
        
        return DecksListResponse(
            decks=decks,
            total=response.count or 0,
            page=page,
            totalPages=max(1, (response.count or 0) // limit + (1 if (response.count or 0) % limit > 0 else 0))
        )
        
    except Exception as e:
        logger.error(f"Get user decks error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/user-trends", response_model=UserTrendsResponse)
async def get_user_trends(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get user signup and login trends for the past week
    """
    try:
        supabase = get_supabase_client()
        
        # Get data for the past 7 days
        trends = []
        
        for i in range(7):
            date = datetime.utcnow() - timedelta(days=6-i)
            
            # Get signups for this day
            start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)
            
            signups = supabase.table("users").select("id", count="exact").gte(
                "created_at", start_of_day.isoformat()
            ).lt("created_at", end_of_day.isoformat()).execute()
            
            # Get logins for this day (using last_sign_in_at)
            logins = supabase.table("users").select("id", count="exact").gte(
                "last_sign_in_at", start_of_day.isoformat()
            ).lt("last_sign_in_at", end_of_day.isoformat()).execute()
            
            # Format date as "Jan 1" - handle platform differences
            day_str = str(date.day)  # Avoid platform-specific strftime codes
            month_str = date.strftime("%b")
            formatted_date = f"{month_str} {day_str}"
            
            trends.append(UserTrendData(
                date=formatted_date,
                signups=signups.count or 0,
                logins=logins.count or 0
            ))
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="view_user_trends",
            request=request
        )
        
        return UserTrendsResponse(trends=trends)
        
    except Exception as e:
        logger.error(f"Get user trends error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/deck-trends", response_model=DeckTrendsResponse)
async def get_deck_trends(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get deck creation trends for the past week
    """
    try:
        supabase = get_supabase_client()
        
        # Get data for the past 7 days
        trends = []
        
        for i in range(7):
            date = datetime.utcnow() - timedelta(days=6-i)
            
            # Get decks created on this day
            start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)
            
            decks_created = supabase.table("decks").select("id", count="exact").gte(
                "created_at", start_of_day.isoformat()
            ).lt("created_at", end_of_day.isoformat()).execute()
            
            # Format date as "Jan 1" - handle platform differences
            day_str = str(date.day)  # Avoid platform-specific strftime codes
            month_str = date.strftime("%b")
            formatted_date = f"{month_str} {day_str}"
            
            trends.append({
                "date": formatted_date,
                "created": decks_created.count or 0
            })
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="view_deck_trends",
            request=request
        )
        
        return DeckTrendsResponse(trends=trends)
        
    except Exception as e:
        logger.error(f"Get deck trends error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Add PATCH endpoints for updating users and decks
@router.patch("/users/{user_id}")
async def update_user_status(
    user_id: str,
    request: Request,
    update_data: Dict[str, Any],
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Update user status or role
    """
    try:
        supabase = get_supabase_client()
        
        # Validate update fields
        allowed_fields = {"status", "role"}
        updates = {k: v for k, v in update_data.items() if k in allowed_fields}
        
        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        
        # Validate values
        if "status" in updates and updates["status"] not in ["active", "suspended"]:
            raise HTTPException(status_code=400, detail="Invalid status value")
        
        if "role" in updates and updates["role"] not in ["user", "admin", "premium"]:
            raise HTTPException(status_code=400, detail="Invalid role value")
        
        updates["updated_at"] = datetime.utcnow().isoformat()
        
        # Update user
        response = supabase.table("users").update(updates).eq("id", user_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="update_user_status",
            request=request,
            target_user_id=user_id,
            details=updates
        )
        
        return {"success": True, "message": "User updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update user status error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/decks/{deck_id}")
async def update_deck(
    deck_id: str,
    request: Request,
    update_data: Dict[str, Any],
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Update deck visibility
    """
    try:
        supabase = get_supabase_client()
        
        # Validate update fields
        allowed_fields = {"visibility"}
        updates = {k: v for k, v in update_data.items() if k in allowed_fields}
        
        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        
        if "visibility" in updates and updates["visibility"] not in ["public", "private"]:
            raise HTTPException(status_code=400, detail="Invalid visibility value")
        
        updates["updated_at"] = datetime.utcnow().isoformat()
        
        # Update deck
        response = supabase.table("decks").update(updates).eq("uuid", deck_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="update_deck",
            request=request,
            target_deck_id=deck_id,
            details=updates
        )
        
        return {"success": True, "message": "Deck updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update deck error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/decks/{deck_id}")
async def delete_deck(
    deck_id: str,
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Delete a deck (soft delete)
    """
    try:
        supabase = get_supabase_client()
        
        # Soft delete by updating status
        updates = {
            "status": "deleted",
            "updated_at": datetime.utcnow().isoformat()
        }
        
        response = supabase.table("decks").update(updates).eq("uuid", deck_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="delete_deck",
            request=request,
            target_deck_id=deck_id
        )
        
        return {"success": True, "message": "Deck deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete deck error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))