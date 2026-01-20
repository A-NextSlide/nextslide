"""
Admin API endpoints for the admin dashboard
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, Header, Request, UploadFile, File, Form
from pydantic import BaseModel
import jwt
from services.supabase import get_supabase_client
from services.brand_font_storage import BrandFontStorageService
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
    isAdmin: bool = False
    emailVerified: bool = False
    # Credit info
    creditsRemaining: int = 0
    creditsUsed: int = 0
    creditsTotal: int = 0

class UserStats(BaseModel):
    totalActive: int = 0
    newThisWeek: int = 0
    adminCount: int = 0
    verifiedCount: int = 0

class UsersListResponse(BaseModel):
    users: List[UserSummary]
    total: int
    page: int
    totalPages: int
    stats: UserStats

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

        # Validate target_user_id exists to avoid foreign key constraint violation
        # This can happen when logging actions for deleted users
        validated_target_user_id = None
        if target_user_id:
            try:
                user_check = supabase.table("users").select("id").eq("id", target_user_id).execute()
                if user_check.data and len(user_check.data) > 0:
                    validated_target_user_id = target_user_id
                else:
                    # User doesn't exist, store ID in details instead
                    details = details or {}
                    details["deleted_target_user_id"] = target_user_id
                    logger.warning(f"Target user {target_user_id} not found, storing in details instead")
            except Exception as e:
                logger.warning(f"Could not validate target_user_id: {e}")
                details = details or {}
                details["unvalidated_target_user_id"] = target_user_id

        log_entry = {
            "admin_user_id": admin_user_id,
            "target_user_id": validated_target_user_id,
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
        import os
        supabase = get_supabase_client()
        service_key = os.getenv("SUPABASE_SERVICE_KEY")
        supabase_url = os.getenv("SUPABASE_URL")

        # Map frontend field names to database column names
        sort_field_map = {
            "lastActive": "last_sign_in_at",
            "lastActiveAt": "last_sign_in_at",
            "createdAt": "created_at",
            "email": "email",
            "fullName": "full_name",
            "full_name": "full_name",
            "created_at": "created_at",
            "status": "status",
            "role": "role",
            "deckCount": "created_at",  # Can't sort by deck count at DB level, fallback
        }
        db_sort_by = sort_field_map.get(sort_by, sort_by)

        # For lastActive, we need to sort in Python after merging with auth data
        # So we fetch more data and sort/paginate later
        sort_in_python = sort_by in ["lastActive", "lastActiveAt"]

        # Build query
        query = supabase.table("users").select("*", count="exact")

        # Apply search filter
        if search:
            # Escape special characters in search term for safety
            safe_search = search.replace("%", "\\%").replace("_", "\\_")
            query = query.or_(f"email.ilike.%{safe_search}%,full_name.ilike.%{safe_search}%")

        if sort_in_python:
            # For Python sorting, fetch all matching users (up to 1000)
            query = query.order("created_at", desc=True)
            query = query.range(0, 999)
        else:
            # Apply sorting BEFORE pagination (order matters in PostgREST)
            query = query.order(db_sort_by, desc=(sort_order == "desc"))
            # Apply pagination AFTER sorting
            offset = (page - 1) * limit
            query = query.range(offset, offset + limit - 1)

        # Execute query
        response = query.execute()

        # Get auth data from Supabase Admin API for accurate last_sign_in and email_confirmed
        auth_data_map = {}
        if service_key and supabase_url:
            try:
                # Fetch all auth users to get accurate data
                auth_response = httpx.get(
                    f"{supabase_url}/auth/v1/admin/users",
                    headers={
                        "apikey": service_key,
                        "Authorization": f"Bearer {service_key}"
                    },
                    params={"per_page": 1000},
                    timeout=httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
                )
                if auth_response.status_code == 200:
                    auth_users = auth_response.json().get("users", [])
                    for auth_user in auth_users:
                        auth_data_map[auth_user["id"]] = {
                            "last_sign_in_at": auth_user.get("last_sign_in_at"),
                            "email_confirmed_at": auth_user.get("email_confirmed_at"),
                            "created_at": auth_user.get("created_at"),
                        }
            except Exception as e:
                logger.warning(f"Failed to fetch auth data: {str(e)}")

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

        # Fetch credit balances for all users
        credit_data = {}
        if user_ids:
            try:
                credits_response = supabase.table("credit_balances").select(
                    "user_id,monthly_credits,purchased_credits,used_credits"
                ).in_("user_id", user_ids).execute()
                if credits_response.data:
                    for credit in credits_response.data:
                        user_id = credit["user_id"]
                        monthly = credit.get("monthly_credits", 0) or 0
                        purchased = credit.get("purchased_credits", 0) or 0
                        used = credit.get("used_credits", 0) or 0
                        total = monthly + purchased if monthly != -1 else -1
                        remaining = max(0, total - used) if total != -1 else -1
                        credit_data[user_id] = {
                            "remaining": remaining,
                            "used": used,
                            "total": total
                        }
            except Exception as e:
                logger.warning(f"Failed to fetch credit balances: {str(e)}")

        # Format users - merge with auth data
        users = []
        for user in response.data:
            user_id = user["id"]
            user_role = user.get("role", "user")
            auth_info = auth_data_map.get(user_id, {})

            # Use auth data if available, otherwise fallback to users table
            last_sign_in = auth_info.get("last_sign_in_at") or user.get("last_sign_in_at")
            email_confirmed = auth_info.get("email_confirmed_at") or user.get("email_confirmed_at")
            is_verified = email_confirmed is not None or user.get("email_verified", False)

            # Get credit info for this user
            user_credits = credit_data.get(user_id, {"remaining": 0, "used": 0, "total": 0})

            users.append(UserSummary(
                id=user_id,
                email=user.get("email", ""),
                fullName=user.get("full_name"),
                createdAt=user.get("created_at", datetime.utcnow().isoformat()),
                lastActive=last_sign_in,
                deckCount=deck_counts.get(user_id, 0),
                storageUsed=0,
                status=user.get("status", "active"),
                role=user_role,
                isAdmin=user_role == "admin",
                emailVerified=is_verified,
                creditsRemaining=user_credits["remaining"],
                creditsUsed=user_credits["used"],
                creditsTotal=user_credits["total"]
            ))

        # If sorting in Python (for lastActive), sort and paginate now
        if sort_in_python:
            def parse_date(date_str):
                if not date_str:
                    return datetime.min
                try:
                    return datetime.fromisoformat(date_str.replace("Z", "+00:00")).replace(tzinfo=None)
                except:
                    return datetime.min

            users.sort(key=lambda u: parse_date(u.lastActive), reverse=(sort_order == "desc"))
            # Apply pagination
            offset = (page - 1) * limit
            total_count = len(users)
            users = users[offset:offset + limit]
        else:
            total_count = response.count or 0

        # Calculate aggregate stats using auth data for accuracy
        stats = UserStats()
        try:
            # Get total admin count from users table
            admin_response = supabase.table("users").select("id", count="exact").eq("role", "admin").execute()
            stats.adminCount = admin_response.count or 0

            # Calculate verified and active counts from auth data
            if auth_data_map:
                seven_days_ago = datetime.utcnow() - timedelta(days=7)
                verified_count = 0
                active_count = 0
                new_this_week = 0

                for user_id, auth_info in auth_data_map.items():
                    # Count verified
                    if auth_info.get("email_confirmed_at"):
                        verified_count += 1

                    # Count active in last 7 days
                    if auth_info.get("last_sign_in_at"):
                        try:
                            last_sign_in = datetime.fromisoformat(auth_info["last_sign_in_at"].replace("Z", "+00:00"))
                            if last_sign_in.replace(tzinfo=None) > seven_days_ago:
                                active_count += 1
                        except (ValueError, TypeError):
                            pass  # Invalid date format

                    # Count new this week
                    if auth_info.get("created_at"):
                        try:
                            created = datetime.fromisoformat(auth_info["created_at"].replace("Z", "+00:00"))
                            if created.replace(tzinfo=None) > seven_days_ago:
                                new_this_week += 1
                        except (ValueError, TypeError):
                            pass  # Invalid date format

                stats.verifiedCount = verified_count
                stats.totalActive = active_count
                stats.newThisWeek = new_this_week
            else:
                # Fallback to users table queries
                verified_response = supabase.table("users").select("id", count="exact").eq("email_verified", True).execute()
                stats.verifiedCount = verified_response.count or 0

                seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
                active_response = supabase.table("users").select("id", count="exact").gte("last_sign_in_at", seven_days_ago).execute()
                stats.totalActive = active_response.count or 0

                new_response = supabase.table("users").select("id", count="exact").gte("created_at", seven_days_ago).execute()
                stats.newThisWeek = new_response.count or 0
        except Exception as e:
            logger.warning(f"Error calculating user stats: {str(e)}")

        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="view_users",
            request=request,
            details={"page": page, "search": search}
        )

        # Use total_count from Python sort if applicable, otherwise from DB response
        final_total = total_count if sort_in_python else (response.count or 0)

        return UsersListResponse(
            users=users,
            total=final_total,
            page=page,
            totalPages=max(1, final_total // limit + (1 if final_total % limit > 0 else 0)),
            stats=stats
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
            # Fallback: use slide_count column instead of fetching full slides JSONB
            decks_response = supabase.table("decks").select("slide_count").eq("user_id", user_id).execute()
            if decks_response.data:
                total_slides = sum(d.get("slide_count", 0) or 0 for d in decks_response.data)
        
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
                except (json.JSONDecodeError, ValueError):
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
        valid_actions = ["suspend", "delete", "hard_delete", "reset_password", "clear_sessions", "reactivate"]
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

        elif action_request.action == "hard_delete":
            # Hard delete - permanently remove user from everything
            import os
            service_key = os.getenv("SUPABASE_SERVICE_KEY")
            supabase_url = os.getenv("SUPABASE_URL")

            if not service_key:
                raise HTTPException(status_code=500, detail="Service key not configured for hard delete")

            # 1. Cancel Stripe subscription if exists
            try:
                from services.stripe_service import get_stripe_service
                stripe_service = get_stripe_service()
                sub_data = supabase.table("subscriptions").select("stripe_subscription_id, stripe_customer_id").eq("user_id", user_id).execute()
                if sub_data.data and sub_data.data[0].get("stripe_subscription_id"):
                    try:
                        await stripe_service.cancel_subscription(user_id, at_period_end=False)
                        logger.info(f"Cancelled Stripe subscription for user {user_id}")
                    except Exception as stripe_err:
                        logger.warning(f"Could not cancel Stripe subscription: {stripe_err}")
            except Exception as e:
                logger.warning(f"Error checking/canceling Stripe: {e}")

            # 2. Delete from Supabase Auth using Admin API
            try:
                delete_response = httpx.delete(
                    f"{supabase_url}/auth/v1/admin/users/{user_id}",
                    headers={
                        "apikey": service_key,
                        "Authorization": f"Bearer {service_key}"
                    },
                    timeout=httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
                )

                if delete_response.status_code not in [200, 204]:
                    logger.warning(f"Auth delete response: {delete_response.status_code} - {delete_response.text}")
            except Exception as e:
                logger.error(f"Error deleting from auth.users: {str(e)}")

            # 3. Delete all related data from database tables
            tables_to_clean = [
                ("decks", "user_id"),
                ("subscriptions", "user_id"),
                ("credit_balances", "user_id"),
                ("credit_transactions", "user_id"),
                ("onboarding_states", "user_id"),
                ("team_members", "user_id"),
                ("integrations", "user_id"),
                ("google_drive_watch_channels", "user_id"),
            ]

            for table_name, column in tables_to_clean:
                try:
                    supabase.table(table_name).delete().eq(column, user_id).execute()
                    logger.info(f"Deleted from {table_name} for user {user_id}")
                except Exception as e:
                    logger.warning(f"Could not delete from {table_name}: {e}")

            # 4. Delete from users table (last, as other tables may reference it)
            supabase.table("users").delete().eq("id", user_id).execute()

            logger.info(f"Hard deleted user {user_id} ({user_email}) - removed from all tables and Stripe")

        elif action_request.action == "reset_password":
            # Generate password reset link via Supabase Admin API, then send via Resend
            import os
            from services.email_service import send_password_reset_email

            service_key = os.getenv("SUPABASE_SERVICE_KEY")
            supabase_url = os.getenv("SUPABASE_URL")
            frontend_url = os.getenv("FRONTEND_URL", "https://nextslide.ai")

            logger.info(f"Password reset requested for {user_email}")

            if not service_key:
                logger.error("SUPABASE_SERVICE_KEY not configured")
                raise HTTPException(status_code=500, detail="Service key not configured")

            if not supabase_url:
                logger.error("SUPABASE_URL not configured")
                raise HTTPException(status_code=500, detail="Supabase URL not configured")

            try:
                # Generate password reset link using Admin API
                logger.info(f"Generating reset link via {supabase_url}/auth/v1/admin/generate_link")
                link_response = httpx.post(
                    f"{supabase_url}/auth/v1/admin/generate_link",
                    headers={
                        "apikey": service_key,
                        "Authorization": f"Bearer {service_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "type": "recovery",
                        "email": user_email,
                        "redirect_to": f"{frontend_url}/reset-password"
                    },
                    timeout=httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
                )

                logger.info(f"Generate link response: {link_response.status_code}")

                if link_response.status_code not in [200, 201]:
                    logger.error(f"Generate link failed: {link_response.status_code} - {link_response.text}")
                    raise HTTPException(status_code=500, detail=f"Failed to generate password reset link: {link_response.text}")

                # Extract the reset link from response
                link_data = link_response.json()
                logger.info(f"Link data keys: {link_data.keys()}")
                reset_link = link_data.get("action_link") or link_data.get("properties", {}).get("action_link")

                if not reset_link:
                    logger.error(f"No action_link in response: {link_data}")
                    raise HTTPException(status_code=500, detail="Failed to extract password reset link from response")

                logger.info(f"Got reset link, sending email via Resend")

                # Send email via Resend
                email_sent = send_password_reset_email(user_email, reset_link)
                if not email_sent:
                    logger.error("Resend email failed")
                    raise HTTPException(status_code=500, detail="Failed to send password reset email via Resend")

                logger.info(f"Password reset email sent to {user_email} via Resend")

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Password reset error: {str(e)}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Password reset failed: {str(e)}")

        elif action_request.action == "clear_sessions":
            # Sign out user from all sessions using Supabase Admin API
            import os
            from services.email_service import send_session_cleared_email

            service_key = os.getenv("SUPABASE_SERVICE_KEY")
            supabase_url = os.getenv("SUPABASE_URL")

            if not service_key:
                raise HTTPException(status_code=500, detail="Service key not configured")

            # Use the admin API to sign out the user (invalidates all refresh tokens)
            signout_response = httpx.post(
                f"{supabase_url}/auth/v1/admin/users/{user_id}/logout",
                headers={
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}"
                },
                timeout=httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
            )

            if signout_response.status_code not in [200, 204]:
                logger.warning(f"Session clear response: {signout_response.status_code} - {signout_response.text}")

            # Notify user via email
            send_session_cleared_email(user_email)

            logger.info(f"Cleared all sessions for user {user_id}")
        
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


class UserCreditsResponse(BaseModel):
    user_id: str
    monthly_credits: int
    purchased_credits: int
    used_credits: int
    remaining_credits: int
    plan_id: str
    period_end: Optional[str] = None


class UpdateUserCreditsRequest(BaseModel):
    monthly_credits: Optional[int] = None
    purchased_credits: Optional[int] = None
    used_credits: Optional[int] = None


@router.get("/users/{user_id}/credits", response_model=UserCreditsResponse)
async def get_user_credits(
    user_id: str,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get a user's credit balance
    """
    try:
        supabase = get_supabase_client()

        # Get credit balance
        balance_result = supabase.table("credit_balances").select("*").eq("user_id", user_id).execute()

        if not balance_result.data or len(balance_result.data) == 0:
            raise HTTPException(status_code=404, detail="User credit balance not found")

        balance = balance_result.data[0]

        # Get subscription plan
        sub_result = supabase.table("subscriptions").select("plan_id").eq("user_id", user_id).execute()
        plan_id = "free"
        if sub_result.data and len(sub_result.data) > 0:
            plan_id = sub_result.data[0].get("plan_id", "free")

        # Calculate remaining credits
        monthly = balance.get("monthly_credits", 0)
        purchased = balance.get("purchased_credits", 0)
        used = balance.get("used_credits", 0)

        if monthly == -1:  # Unlimited
            remaining = -1
        else:
            remaining = max(0, monthly + purchased - used)

        return UserCreditsResponse(
            user_id=user_id,
            monthly_credits=monthly,
            purchased_credits=purchased,
            used_credits=used,
            remaining_credits=remaining,
            plan_id=plan_id,
            period_end=balance.get("period_end")
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user credits error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/users/{user_id}/credits")
async def update_user_credits(
    user_id: str,
    request: Request,
    update_request: UpdateUserCreditsRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Update a user's credit balance
    """
    try:
        supabase = get_supabase_client()

        # Check if user exists
        user_result = supabase.table("users").select("id").eq("id", user_id).execute()
        if not user_result.data or len(user_result.data) == 0:
            raise HTTPException(status_code=404, detail="User not found")

        # Build update dict with only provided fields
        update_data = {"updated_at": datetime.utcnow().isoformat()}

        if update_request.monthly_credits is not None:
            update_data["monthly_credits"] = update_request.monthly_credits
        if update_request.purchased_credits is not None:
            update_data["purchased_credits"] = update_request.purchased_credits
        if update_request.used_credits is not None:
            update_data["used_credits"] = update_request.used_credits

        # Update credit balance
        result = supabase.table("credit_balances").update(update_data).eq("user_id", user_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Credit balance not found for user")

        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="update_credits",
            request=request,
            target_user_id=user_id,
            details={"updates": update_data}
        )

        # Fetch and return updated balance
        balance = result.data[0]
        monthly = balance.get("monthly_credits", 0)
        purchased = balance.get("purchased_credits", 0)
        used = balance.get("used_credits", 0)

        if monthly == -1:
            remaining = -1
        else:
            remaining = max(0, monthly + purchased - used)

        return {
            "success": True,
            "message": "Credits updated successfully",
            "credits": {
                "user_id": user_id,
                "monthly_credits": monthly,
                "purchased_credits": purchased,
                "used_credits": used,
                "remaining_credits": remaining
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update user credits error: {str(e)}")
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
        # Use first_slide and slide_count columns instead of full slides array
        query = supabase.table("decks").select(
            "uuid,name,created_at,updated_at,last_modified,user_id,status,description,first_slide,slide_count,visibility,data",
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
            
            # Get first_slide and slide_count from optimized columns
            first_slide = deck.get("first_slide")
            slide_count = deck.get("slide_count", 0) or 0

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

                # Include slide data for thumbnails (use optimized first_slide column)
                "slides": [first_slide] if first_slide else [],  # Only first slide for thumbnail
                "slide_count": slide_count,
                "first_slide": first_slide,

                # Include data which contains theme info
                "data": deck.get("data", {}),
                "theme": deck.get("data", {}).get("theme", {}) if deck.get("data") else {},

                # Admin-specific fields
                "slideCount": slide_count,
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


@router.get("/decks/{deck_id}/full")
async def get_deck_with_slides(
    deck_id: str,
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get a single deck with all slides for admin preview
    """
    try:
        supabase = get_supabase_client()

        # Fetch deck with all slides
        response = supabase.table("decks").select(
            "uuid,name,created_at,updated_at,last_modified,user_id,status,description,slides,slide_count,visibility,data"
        ).eq("uuid", deck_id).single().execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Deck not found")

        deck = response.data

        # Get user info
        user_info = None
        if deck.get("user_id"):
            user_response = supabase.table("users").select("id,email,full_name").eq("id", deck["user_id"]).single().execute()
            user_info = user_response.data if user_response.data else None

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

        # Get slides from deck data
        slides = deck.get("slides", [])
        slide_count = deck.get("slide_count") or len(slides)
        first_slide = slides[0] if slides else None

        # Format deck object
        deck_obj = {
            "id": deck["uuid"],
            "uuid": deck["uuid"],
            "name": deck["name"],
            "description": deck.get("description", ""),
            "status": status,
            "visibility": visibility,
            "is_owner": True,
            "slides": slides,
            "slide_count": slide_count,
            "slideCount": slide_count,
            "first_slide": first_slide,
            "data": deck.get("data", {}),
            "theme": deck.get("data", {}).get("theme", {}) if deck.get("data") else {},
            "createdAt": deck["created_at"],
            "updatedAt": deck.get("updated_at"),
            "lastModified": deck.get("last_modified") or deck.get("updated_at"),
            "size": deck.get("data", {}).get("metadata", {}).get("size", {"width": 1920, "height": 1080}),
            "sharing": {"isShared": False, "sharedWith": 0, "shareType": None},
            "analytics": {"viewCount": 0, "editCount": 0, "shareCount": 0},
            "userId": deck.get("user_id"),
            "user_id": deck.get("user_id"),
        }

        if user_info:
            deck_obj["userEmail"] = user_info.get("email")
            deck_obj["userFullName"] = user_info.get("full_name")

        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="view_deck_detail",
            request=request,
            target_deck_id=deck_id
        )

        return deck_obj

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get deck with slides error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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
        
        # Build query - use first_slide and slide_count columns instead of full slides array
        query = supabase.table("decks").select(
            "uuid,name,created_at,updated_at,last_modified,user_id,status,description,first_slide,slide_count,visibility,data",
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
            
            # Get first_slide and slide_count from optimized columns
            first_slide = deck.get("first_slide")
            slide_count = deck.get("slide_count", 0) or 0

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

                # Include slide data for thumbnails (use optimized first_slide column)
                "slides": [first_slide] if first_slide else [],  # Only first slide for thumbnail
                "slide_count": slide_count,
                "first_slide": first_slide,

                # Include data which contains theme info
                "data": deck.get("data", {}),
                "theme": deck.get("data", {}).get("theme", {}) if deck.get("data") else {},

                # Admin-specific fields
                "slideCount": slide_count,
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

        # Try to get login counts from auth audit log via RPC
        login_counts_by_date = {}
        try:
            login_data = supabase.rpc("get_daily_login_counts", {"days_back": 7}).execute()
            if login_data.data:
                for row in login_data.data:
                    # Convert date string to date object for matching
                    login_date = row.get("login_date")
                    if login_date:
                        login_counts_by_date[login_date] = row.get("login_count", 0)
        except Exception as rpc_err:
            logger.warning(f"Could not get login counts from audit log (RPC may not exist yet): {str(rpc_err)}")
            # Fall back to the old method if RPC doesn't exist

        for i in range(7):
            date = datetime.utcnow() - timedelta(days=6-i)
            date_str = date.strftime("%Y-%m-%d")  # Format for matching with RPC results

            # Get signups for this day
            start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)

            signups = supabase.table("users").select("id", count="exact").gte(
                "created_at", start_of_day.isoformat()
            ).lt("created_at", end_of_day.isoformat()).execute()

            # Get logins from the pre-fetched audit log data, or fall back to old method
            if login_counts_by_date:
                login_count = login_counts_by_date.get(date_str, 0)
            else:
                # Fallback: use last_sign_in_at (less accurate but works without migration)
                logins = supabase.table("users").select("id", count="exact").gte(
                    "last_sign_in_at", start_of_day.isoformat()
                ).lt("last_sign_in_at", end_of_day.isoformat()).execute()
                login_count = logins.count or 0

            # Format date as "Jan 1" - handle platform differences
            day_str = str(date.day)  # Avoid platform-specific strftime codes
            month_str = date.strftime("%b")
            formatted_date = f"{month_str} {day_str}"

            trends.append(UserTrendData(
                date=formatted_date,
                signups=signups.count or 0,
                logins=login_count
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

# ==================== Brand Management Endpoints ====================

class Brand(BaseModel):
    id: str
    identifier: str
    normalized_identifier: str
    api_response: Dict[str, Any]
    success: bool
    created_at: str
    hit_count: int
    last_accessed_at: str

class BrandsListResponse(BaseModel):
    brands: List[Brand]
    total: int
    page: int
    totalPages: int

class UpdateBrandRequest(BaseModel):
    api_response: Dict[str, Any]

@router.get("/brands", response_model=BrandsListResponse)
async def list_brands(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    List all cached brands with pagination and search
    """
    try:
        supabase = get_supabase_client()

        # First get total count with search filter applied
        count_query = supabase.table("brandfetch_cache").select("id", count="exact")
        if search:
            count_query = count_query.or_(f"identifier.ilike.%{search}%,normalized_identifier.ilike.%{search}%")
        count_response = count_query.execute()
        total = count_response.count or 0

        # Calculate pagination
        offset = (page - 1) * limit
        total_pages = max(1, (total + limit - 1) // limit)

        # If offset exceeds total, return empty list (no more data)
        if offset >= total:
            # Log the action
            await log_admin_action(
                admin_user_id=admin["id"],
                action="view_brands",
                request=request,
                details={"page": page, "search": search}
            )
            return BrandsListResponse(
                brands=[],
                total=total,
                page=page,
                totalPages=total_pages
            )

        # Build query for actual data
        query = supabase.table("brandfetch_cache").select("*")

        # Apply search
        if search:
            query = query.or_(f"identifier.ilike.%{search}%,normalized_identifier.ilike.%{search}%")

        # Apply sorting (most recently accessed first) - must come before range
        query = query.order("last_accessed_at", desc=True)

        # Apply pagination with safe range
        end_offset = min(offset + limit - 1, total - 1)
        query = query.range(offset, end_offset)

        # Execute query
        response = query.execute()

        # Format brands
        brands = []
        for brand in response.data:
            brands.append(Brand(
                id=brand["id"],
                identifier=brand["identifier"],
                normalized_identifier=brand["normalized_identifier"],
                api_response=brand.get("api_response", {}),
                success=brand.get("success", False),
                created_at=brand["created_at"],
                hit_count=brand.get("hit_count", 0),
                last_accessed_at=brand.get("last_accessed_at", brand["created_at"])
            ))

        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="view_brands",
            request=request,
            details={"page": page, "search": search}
        )

        return BrandsListResponse(
            brands=brands,
            total=total,
            page=page,
            totalPages=total_pages
        )

    except Exception as e:
        logger.error(f"List brands error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/brands/{brand_id}")
async def update_brand(
    brand_id: str,
    request: Request,
    update_request: UpdateBrandRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Update a brand's data
    """
    try:
        supabase = get_supabase_client()

        # Update brand
        updates = {
            "api_response": update_request.api_response
        }

        response = supabase.table("brandfetch_cache").update(updates).eq("id", brand_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Brand not found")

        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="update_brand",
            request=request,
            details={"brand_id": brand_id}
        )

        return {"success": True, "message": "Brand updated successfully", "brand": response.data[0]}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update brand error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/brands/{brand_id}")
async def delete_brand(
    brand_id: str,
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Delete a brand from the cache
    """
    try:
        supabase = get_supabase_client()

        # First check if brand exists
        check_response = supabase.table("brandfetch_cache").select("id").eq("id", brand_id).execute()
        logger.info(f"Delete brand check: {brand_id}, found: {len(check_response.data) if check_response.data else 0}")

        if not check_response.data or len(check_response.data) == 0:
            raise HTTPException(status_code=404, detail=f"Brand not found: {brand_id}")

        # Delete brand
        response = supabase.table("brandfetch_cache").delete().eq("id", brand_id).execute()
        logger.info(f"Delete brand response: {response.data}")

        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="delete_brand",
            request=request,
            details={"brand_id": brand_id}
        )

        return {"success": True, "message": "Brand deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete brand error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/brands/{brand_id}/fonts/upload")
async def upload_brand_font(
    brand_id: str,
    request: Request,
    font_name: str = Form(...),
    variant: str = Form(...),
    file: UploadFile = File(...),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Upload a font file for a brand
    """
    try:
        supabase = get_supabase_client()

        # Verify brand exists
        brand_response = supabase.table("brandfetch_cache").select("*").eq("id", brand_id).execute()
        if not brand_response.data:
            raise HTTPException(status_code=404, detail="Brand not found")

        brand = brand_response.data[0]

        # Read file bytes
        file_bytes = await file.read()

        # Upload font using storage service
        font_storage = BrandFontStorageService()
        upload_result = await font_storage.upload_font_file(
            brand_id=brand_id,
            font_name=font_name,
            variant=variant,
            file_bytes=file_bytes,
            filename=file.filename
        )

        # Update brand api_response with font file info
        api_response = brand.get("api_response", {})
        if not api_response.get("fonts"):
            api_response["fonts"] = {"names": [], "files": []}

        # Ensure fonts structure exists
        if "files" not in api_response["fonts"]:
            api_response["fonts"]["files"] = []

        # Find or create font entry
        font_entry = next(
            (f for f in api_response["fonts"]["files"] if f["name"] == font_name),
            None
        )

        if not font_entry:
            font_entry = {
                "name": font_name,
                "variants": {},
                "uploaded_at": datetime.utcnow().isoformat(),
                "uploaded_by": admin["id"]
            }
            api_response["fonts"]["files"].append(font_entry)

        # Add variant URL
        font_entry["variants"][variant] = upload_result["url"]

        # Add font name to names list if not present
        if font_name not in api_response["fonts"].get("names", []):
            if "names" not in api_response["fonts"]:
                api_response["fonts"]["names"] = []
            api_response["fonts"]["names"].append(font_name)

        # Update brand in database
        supabase.table("brandfetch_cache").update({
            "api_response": api_response
        }).eq("id", brand_id).execute()

        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="upload_brand_font",
            request=request,
            details={
                "brand_id": brand_id,
                "font_name": font_name,
                "variant": variant,
                "file_size": len(file_bytes)
            }
        )

        return {
            "success": True,
            "message": "Font uploaded successfully",
            "font": {
                "name": font_name,
                "variant": variant,
                "url": upload_result["url"],
                "size": upload_result["size"]
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload brand font error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/brands/{brand_id}/fonts/{font_name}/{variant}")
async def delete_brand_font(
    brand_id: str,
    font_name: str,
    variant: str,
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Delete a specific font variant from a brand
    """
    try:
        supabase = get_supabase_client()

        # Get brand
        brand_response = supabase.table("brandfetch_cache").select("*").eq("id", brand_id).execute()
        if not brand_response.data:
            raise HTTPException(status_code=404, detail="Brand not found")

        brand = brand_response.data[0]
        api_response = brand.get("api_response", {})

        # Find and remove font variant
        fonts_files = api_response.get("fonts", {}).get("files", [])
        font_entry = next((f for f in fonts_files if f["name"] == font_name), None)

        if not font_entry or variant not in font_entry.get("variants", {}):
            raise HTTPException(status_code=404, detail="Font variant not found")

        # Delete from storage
        font_storage = BrandFontStorageService()
        safe_font_name = font_name.lower().replace(' ', '-').replace('_', '-')
        safe_variant = variant.lower().replace(' ', '-')
        file_path = f"fonts/brands/{brand_id}/{safe_font_name}-{safe_variant}"

        # Try to delete with common extensions
        deleted = False
        for ext in ['.woff2', '.woff', '.ttf', '.otf']:
            try:
                await font_storage.delete_font_file(brand_id, file_path + ext)
                deleted = True
                break
            except Exception:
                continue

        # Remove variant from API response
        del font_entry["variants"][variant]

        # If no variants left, remove the font entry
        if not font_entry["variants"]:
            fonts_files.remove(font_entry)
            # Also remove from names list
            if "names" in api_response.get("fonts", {}) and font_name in api_response["fonts"]["names"]:
                api_response["fonts"]["names"].remove(font_name)

        # Update brand
        supabase.table("brandfetch_cache").update({
            "api_response": api_response
        }).eq("id", brand_id).execute()

        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="delete_brand_font",
            request=request,
            details={
                "brand_id": brand_id,
                "font_name": font_name,
                "variant": variant
            }
        )

        return {"success": True, "message": "Font variant deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete brand font error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/brands/{brand_id}/logo/upload")
async def upload_brand_logo(
    brand_id: str,
    request: Request,
    file: UploadFile = File(...),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Upload a logo file for a brand
    """
    try:
        supabase = get_supabase_client()

        # Verify brand exists
        brand_response = supabase.table("brandfetch_cache").select("*").eq("id", brand_id).execute()
        if not brand_response.data:
            raise HTTPException(status_code=404, detail="Brand not found")

        brand = brand_response.data[0]
        api_response = brand.get("api_response", {})
        brand_domain = api_response.get("domain") or brand.get("normalized_identifier", "unknown")

        # Read file bytes
        file_bytes = await file.read()
        content_type = file.content_type or "image/png"

        # Determine file extension
        ext = os.path.splitext(file.filename)[1].lower() if file.filename else ".png"
        if not ext:
            ext = ".svg" if "svg" in content_type else ".png"

        # Generate storage path
        clean_domain = brand_domain.lower().replace('.', '_')
        file_path = f"logos/{clean_domain}/logo{ext}"

        # Upload to storage
        try:
            upload_response = supabase.storage.from_("slide-media").upload(
                path=file_path,
                file=file_bytes,
                file_options={"content-type": content_type, "upsert": "true"}
            )
        except Exception as e:
            if "Duplicate" in str(e):
                # Remove and re-upload
                supabase.storage.from_("slide-media").remove([file_path])
                upload_response = supabase.storage.from_("slide-media").upload(
                    path=file_path,
                    file=file_bytes,
                    file_options={"content-type": content_type}
                )
            else:
                raise

        # Get public URL (strip trailing '?' that Supabase sometimes adds)
        public_url = supabase.storage.from_("slide-media").get_public_url(file_path)
        if public_url and public_url.endswith('?'):
            public_url = public_url[:-1]

        # Update brand api_response with logo
        if not api_response.get("logos"):
            api_response["logos"] = {"light": []}
        if not api_response["logos"].get("light"):
            api_response["logos"]["light"] = []

        # Update or add logo format
        if api_response["logos"]["light"]:
            if not api_response["logos"]["light"][0].get("formats"):
                api_response["logos"]["light"][0]["formats"] = []
            # Add new format at the beginning (highest priority)
            api_response["logos"]["light"][0]["formats"].insert(0, {
                "url": public_url,
                "format": ext.replace(".", ""),
                "uploaded_at": datetime.utcnow().isoformat()
            })
        else:
            api_response["logos"]["light"].append({
                "type": "logo",
                "formats": [{
                    "url": public_url,
                    "format": ext.replace(".", ""),
                    "uploaded_at": datetime.utcnow().isoformat()
                }]
            })

        # Update brand in database
        supabase.table("brandfetch_cache").update({
            "api_response": api_response
        }).eq("id", brand_id).execute()

        # Log the action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="upload_brand_logo",
            request=request,
            details={
                "brand_id": brand_id,
                "file_path": file_path,
                "file_size": len(file_bytes)
            }
        )

        return {
            "success": True,
            "message": "Logo uploaded successfully",
            "logo": {
                "url": public_url,
                "path": file_path,
                "size": len(file_bytes)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload brand logo error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class FetchBrandRequest(BaseModel):
    identifier: str  # Domain or brand name


@router.post("/brands/fetch")
async def fetch_brand_from_brandfetch(
    request: Request,
    fetch_request: FetchBrandRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Fetch or refresh brand data from Brandfetch API
    """
    from services.brandfetch_service import BrandfetchService
    from services.logo_storage_service import LogoStorageService

    try:
        identifier = fetch_request.identifier.strip()
        if not identifier:
            raise HTTPException(status_code=400, detail="Identifier is required")

        supabase = get_supabase_client()

        # Normalize identifier for cache lookup
        normalized = identifier.lower().replace('https://', '').replace('http://', '').replace('www.', '')
        if '/' in normalized:
            normalized = normalized.split('/')[0]

        # Fetch from Brandfetch API
        async with BrandfetchService() as brandfetch:
            logger.info(f"Fetching brand data for: {identifier}")

            # Use search if it doesn't look like a domain
            if '.' in identifier and ' ' not in identifier:
                brand_data = await brandfetch.get_brand_data(identifier)
            else:
                brand_data = await brandfetch.get_brand_data_with_search(identifier)

            if brand_data.get('error'):
                raise HTTPException(
                    status_code=404,
                    detail=f"Brand not found: {brand_data.get('error')} - {brand_data.get('message', '')}"
                )

            # Process logos - download and store in our Supabase storage
            if brand_data.get('logos'):
                try:
                    async with LogoStorageService() as logo_storage:
                        brand_domain = brand_data.get('domain', normalized)
                        logger.info(f"Processing logos for {brand_domain}")
                        brand_data = await logo_storage.process_brand_logos(brand_data, brand_domain)
                except Exception as e:
                    logger.error(f"Error processing logos: {e}")
                    # Continue without processed logos

            # Use the domain from the API response as the cache key
            cache_key = brand_data.get('domain', normalized)

            # Check if brand already exists
            existing = supabase.table("brandfetch_cache").select("id").eq("normalized_identifier", cache_key).execute()

            if existing.data:
                # Update existing entry
                supabase.table("brandfetch_cache").update({
                    "api_response": brand_data,
                    "success": True,
                    "identifier": identifier
                }).eq("normalized_identifier", cache_key).execute()
                action = "updated"
                brand_id = existing.data[0]['id']
            else:
                # Insert new entry
                result = supabase.table("brandfetch_cache").insert({
                    "identifier": identifier,
                    "normalized_identifier": cache_key,
                    "api_response": brand_data,
                    "success": True
                }).execute()
                action = "created"
                brand_id = result.data[0]['id'] if result.data else None

            # Log the action
            await log_admin_action(
                admin_user_id=admin["id"],
                action=f"fetch_brand_{action}",
                request=request,
                details={
                    "identifier": identifier,
                    "domain": brand_data.get('domain'),
                    "brand_name": brand_data.get('brand_name')
                }
            )

            return {
                "success": True,
                "message": f"Brand {action} successfully",
                "action": action,
                "brand": {
                    "id": brand_id,
                    "identifier": identifier,
                    "normalized_identifier": cache_key,
                    "api_response": brand_data,
                    "success": True
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Fetch brand error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Service Health & Status ====================

class ServiceStatus(BaseModel):
    name: str
    status: str  # operational, degraded, down, unknown
    latency_ms: Optional[float] = None
    last_checked: str
    details: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ServiceHealthResponse(BaseModel):
    overall_status: str
    services: List[ServiceStatus]
    checked_at: str


@router.get("/services/health", response_model=ServiceHealthResponse)
async def get_services_health(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Check health status of all external services and APIs
    """
    import os
    import time
    import aiohttp

    services = []
    checked_at = datetime.utcnow().isoformat()

    # Helper to check HTTP endpoint
    async def check_http(name: str, url: str, headers: dict = None, timeout: float = 5.0) -> ServiceStatus:
        start = time.time()
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
                    latency = (time.time() - start) * 1000
                    if resp.status < 400:
                        return ServiceStatus(
                            name=name,
                            status="operational",
                            latency_ms=round(latency, 2),
                            last_checked=checked_at
                        )
                    else:
                        return ServiceStatus(
                            name=name,
                            status="degraded",
                            latency_ms=round(latency, 2),
                            last_checked=checked_at,
                            error=f"HTTP {resp.status}"
                        )
        except asyncio.TimeoutError:
            return ServiceStatus(
                name=name,
                status="degraded",
                latency_ms=timeout * 1000,
                last_checked=checked_at,
                error="Timeout"
            )
        except Exception as e:
            return ServiceStatus(
                name=name,
                status="down",
                last_checked=checked_at,
                error=str(e)[:100]
            )

    import asyncio

    # 1. Supabase Database
    try:
        supabase = get_supabase_client()
        start = time.time()
        result = supabase.table("users").select("id").limit(1).execute()
        latency = (time.time() - start) * 1000
        services.append(ServiceStatus(
            name="Supabase Database",
            status="operational",
            latency_ms=round(latency, 2),
            last_checked=checked_at,
            details={"type": "PostgreSQL"}
        ))
    except Exception as e:
        services.append(ServiceStatus(
            name="Supabase Database",
            status="down",
            last_checked=checked_at,
            error=str(e)[:100]
        ))

    # 2. OpenAI API
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        openai_status = await check_http(
            "OpenAI API",
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {openai_key}"}
        )
        openai_status.details = {"models": "gpt-4, gpt-4o, gpt-image-1"}
        services.append(openai_status)
    else:
        services.append(ServiceStatus(
            name="OpenAI API",
            status="unknown",
            last_checked=checked_at,
            error="API key not configured"
        ))

    # 3. Anthropic API
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        anthropic_status = await check_http(
            "Anthropic API",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": anthropic_key,
                "anthropic-version": "2023-06-01"
            }
        )
        # Anthropic returns 400 for empty body, but that means API is reachable
        if anthropic_status.error and "400" in str(anthropic_status.error):
            anthropic_status.status = "operational"
            anthropic_status.error = None
        anthropic_status.details = {"models": "claude-3, claude-3.5"}
        services.append(anthropic_status)
    else:
        services.append(ServiceStatus(
            name="Anthropic API",
            status="unknown",
            last_checked=checked_at,
            error="API key not configured"
        ))

    # 4. Brandfetch API - service has fallback default key, so always check cache health
    try:
        cache_stats = supabase.table("brandfetch_cache").select("id", count="exact").execute()
        brandfetch_key = os.getenv("BRANDFETCH_BRAND_API_KEY")
        services.append(ServiceStatus(
            name="Brandfetch API",
            status="operational",
            last_checked=checked_at,
            details={
                "cached_brands": cache_stats.count or 0,
                "type": "Brand Data",
                "custom_key": bool(brandfetch_key)
            }
        ))
    except Exception as e:
        services.append(ServiceStatus(
            name="Brandfetch API",
            status="degraded",
            last_checked=checked_at,
            error=f"Cache unavailable: {str(e)[:50]}"
        ))

    # 5. SerpAPI
    serpapi_key = os.getenv("SERPAPI_API_KEY") or os.getenv("SERPAPI_KEY")
    if serpapi_key:
        services.append(ServiceStatus(
            name="SerpAPI",
            status="operational",
            last_checked=checked_at,
            details={"type": "Google Images Search", "rate_limit": "10 req/sec"}
        ))
    else:
        services.append(ServiceStatus(
            name="SerpAPI",
            status="unknown",
            last_checked=checked_at,
            error="API key not configured"
        ))

    # 8. Resend Email
    resend_key = os.getenv("RESEND_API_KEY")
    if resend_key:
        resend_status = await check_http(
            "Resend Email",
            "https://api.resend.com/domains",
            headers={"Authorization": f"Bearer {resend_key}"}
        )
        resend_status.details = {"type": "Email Delivery"}
        services.append(resend_status)
    else:
        services.append(ServiceStatus(
            name="Resend Email",
            status="unknown",
            last_checked=checked_at,
            error="API key not configured"
        ))

    # 9. Perplexity API
    pplx_key = os.getenv("PPLX_API_KEY")
    if pplx_key:
        services.append(ServiceStatus(
            name="Perplexity API",
            status="operational",
            last_checked=checked_at,
            details={"type": "Research & Web Search"}
        ))
    else:
        services.append(ServiceStatus(
            name="Perplexity API",
            status="unknown",
            last_checked=checked_at,
            error="API key not configured"
        ))

    # 10. Google Gemini
    google_key = os.getenv("GOOGLE_API_KEY")
    if google_key:
        services.append(ServiceStatus(
            name="Google Gemini",
            status="operational",
            last_checked=checked_at,
            details={"model": os.getenv("GEMINI_COMPOSER_MODEL", "gemini-2.5-pro"), "type": "Image Generation"}
        ))
    else:
        services.append(ServiceStatus(
            name="Google Gemini",
            status="unknown",
            last_checked=checked_at,
            error="API key not configured"
        ))

    # 11. Firecrawl
    firecrawl_key = os.getenv("FIRECRAWL_API_KEY")
    if firecrawl_key:
        services.append(ServiceStatus(
            name="Firecrawl",
            status="operational",
            last_checked=checked_at,
            details={"type": "Web Scraping"}
        ))
    else:
        services.append(ServiceStatus(
            name="Firecrawl",
            status="unknown",
            last_checked=checked_at,
            error="API key not configured"
        ))

    # 12. Sentry
    sentry_dsn = os.getenv("SENTRY_DSN")
    if sentry_dsn:
        services.append(ServiceStatus(
            name="Sentry",
            status="operational",
            last_checked=checked_at,
            details={"type": "Error Tracking", "sample_rate": "10%"}
        ))
    else:
        services.append(ServiceStatus(
            name="Sentry",
            status="unknown",
            last_checked=checked_at,
            error="Not configured"
        ))

    # Determine overall status
    statuses = [s.status for s in services]
    if all(s == "operational" for s in statuses):
        overall_status = "operational"
    elif any(s == "down" for s in statuses):
        overall_status = "degraded"
    elif any(s == "degraded" for s in statuses):
        overall_status = "degraded"
    else:
        overall_status = "operational"

    return ServiceHealthResponse(
        overall_status=overall_status,
        services=services,
        checked_at=checked_at
    )


@router.get("/services/config")
async def get_services_config(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get actual model configuration used in generation
    """
    try:
        from agents.config import (
            THEME_STYLE_MODEL, COMPOSER_MODEL, VISUAL_LAYOUT_ANALYZER_MODEL,
            OUTLINE_PLANNING_MODEL, OUTLINE_CONTENT_MODEL, OUTLINE_RESEARCH_MODEL,
            OUTLINE_OPENAI_SEARCH_MODEL, PERPLEXITY_OUTLINE_MODEL, PRESENTATION_OUTLINE_MODEL,
            PERPLEXITY_RESEARCH_MODEL, PERPLEXITY_IMAGE_MODEL,
            ORCHESTRATOR_MODEL, DECK_EDITOR_MODEL, SLIDE_STYLE_MODEL, CONTEXT_BUILDER_MODEL,
            QUALITY_EVALUATOR_MODEL, FILE_ANALYSIS_MODEL, OPENAI_IMAGE_MODEL, GEMINI_IMAGE_MODEL,
            CUSTOM_COMPONENT_MODEL, IMAGE_PROVIDER, IMAGE_GENERATION_ENABLED,
            USE_PERPLEXITY_FOR_OUTLINE, USE_PERPLEXITY_FOR_RESEARCH,
            ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN, ENABLE_VISUAL_VALIDATION,
        )

        config = {
            "models": {
                "slide_generation": {
                    "model": COMPOSER_MODEL,
                    "description": "Main slide content generation"
                },
                "theme_generation": {
                    "model": THEME_STYLE_MODEL,
                    "description": "Theme & style decisions"
                },
                "outline_planning": {
                    "model": OUTLINE_PLANNING_MODEL,
                    "description": "Outline structure planning"
                },
                "outline_content": {
                    "model": OUTLINE_CONTENT_MODEL,
                    "description": "Outline content generation"
                },
                "presentation_outline": {
                    "model": PRESENTATION_OUTLINE_MODEL,
                    "description": "Detailed presentation outlines"
                },
                "research": {
                    "model": PERPLEXITY_RESEARCH_MODEL,
                    "description": "Web research & search"
                },
                "image_generation": {
                    "model": GEMINI_IMAGE_MODEL if IMAGE_PROVIDER == "gemini" else OPENAI_IMAGE_MODEL,
                    "provider": IMAGE_PROVIDER,
                    "enabled": IMAGE_GENERATION_ENABLED,
                    "description": "AI image generation"
                },
                "custom_components": {
                    "model": CUSTOM_COMPONENT_MODEL,
                    "enabled": ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN,
                    "description": "Custom component generation"
                },
                "quality_evaluation": {
                    "model": QUALITY_EVALUATOR_MODEL,
                    "description": "Slide quality scoring"
                },
                "visual_analysis": {
                    "model": VISUAL_LAYOUT_ANALYZER_MODEL,
                    "enabled": ENABLE_VISUAL_VALIDATION,
                    "description": "Layout validation"
                },
                "editing": {
                    "model": ORCHESTRATOR_MODEL,
                    "description": "Edit orchestration"
                },
                "file_analysis": {
                    "model": FILE_ANALYSIS_MODEL,
                    "description": "Document parsing"
                },
            },
            "feature_flags": {
                "use_perplexity_outline": USE_PERPLEXITY_FOR_OUTLINE,
                "use_perplexity_research": USE_PERPLEXITY_FOR_RESEARCH,
                "image_generation_enabled": IMAGE_GENERATION_ENABLED,
                "visual_validation_enabled": ENABLE_VISUAL_VALIDATION,
                "custom_component_gen_enabled": ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN,
            }
        }

        return config

    except ImportError as e:
        logger.error(f"Failed to import config: {e}")
        return {"error": "Config not available", "models": {}, "feature_flags": {}}


@router.get("/services/usage")
async def get_services_usage(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get usage statistics for services where available
    """
    import os

    supabase = get_supabase_client()
    usage = {}

    # Brand cache usage
    try:
        cache_result = supabase.table("brandfetch_cache").select("id, hit_count", count="exact").execute()
        total_hits = sum(b.get("hit_count", 0) for b in (cache_result.data or []))
        usage["brandfetch"] = {
            "cached_brands": cache_result.count or 0,
            "total_cache_hits": total_hits,
            "type": "cache"
        }
    except Exception as e:
        logger.error(f"Error getting brandfetch usage: {e}")

    # Deck statistics
    try:
        decks_result = supabase.table("decks").select("id", count="exact").execute()
        usage["decks"] = {
            "total_decks": decks_result.count or 0
        }
    except Exception as e:
        logger.error(f"Error getting deck usage: {e}")

    # User statistics
    try:
        users_result = supabase.table("users").select("id", count="exact").execute()
        usage["users"] = {
            "total_users": users_result.count or 0
        }
    except Exception as e:
        logger.error(f"Error getting user usage: {e}")

    # Font storage (limit to avoid timeout on large tables)
    try:
        fonts_query = supabase.table("brandfetch_cache").select("api_response").limit(200).execute()
        font_count = 0
        for brand in (fonts_query.data or []):
            api_resp = brand.get("api_response")
            if api_resp and isinstance(api_resp, dict):
                fonts = api_resp.get("fonts", {})
                if isinstance(fonts, dict):
                    files = fonts.get("files", [])
                    for f in files:
                        font_count += len(f.get("variants", {}))
        usage["fonts"] = {
            "uploaded_font_files": font_count
        }
    except Exception as e:
        logger.error(f"Error getting font usage: {e}")

    return {
        "usage": usage,
        "checked_at": datetime.utcnow().isoformat()
    }


# Model pricing per million tokens (input, output) in USD
MODEL_PRICING = {
    # Anthropic Claude models
    "claude-haiku-4-5": {"input": 0.80, "output": 4.00, "provider": "anthropic"},
    "claude-3-5-haiku": {"input": 0.80, "output": 4.00, "provider": "anthropic"},
    "claude-sonnet-4": {"input": 3.00, "output": 15.00, "provider": "anthropic"},
    "claude-sonnet-4-5": {"input": 3.00, "output": 15.00, "provider": "anthropic"},
    "claude-3-5-sonnet": {"input": 3.00, "output": 15.00, "provider": "anthropic"},
    "claude-opus-4": {"input": 15.00, "output": 75.00, "provider": "anthropic"},

    # Google Gemini models
    "gemini-2.5-flash": {"input": 0.075, "output": 0.30, "provider": "google"},
    "gemini-2.5-flash-lite": {"input": 0.0375, "output": 0.15, "provider": "google"},
    "gemini-2.5-pro": {"input": 1.25, "output": 10.00, "provider": "google"},
    "gemini-3-pro": {"input": 2.00, "output": 12.00, "provider": "google"},
    "gemini-3-pro-preview": {"input": 2.00, "output": 12.00, "provider": "google"},

    # OpenAI models
    "gpt-4o-mini": {"input": 0.15, "output": 0.60, "provider": "openai"},
    "gpt-4.1": {"input": 2.00, "output": 8.00, "provider": "openai"},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60, "provider": "openai"},

    # Perplexity models (per request, not per token)
    "perplexity-sonar": {"input": 1.00, "output": 1.00, "provider": "perplexity", "per_request": 0.005},
    "perplexity-sonar-pro": {"input": 3.00, "output": 15.00, "provider": "perplexity", "per_request": 0.005},

    # Groq models (very cheap)
    "llama3-8b-8192": {"input": 0.05, "output": 0.08, "provider": "groq"},
    "mistral-saba-24b": {"input": 0.20, "output": 0.60, "provider": "groq"},
}


@router.get("/costs")
async def get_costs(
    request: Request,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get cost data from providers. Attempts to fetch real costs from Anthropic Admin API,
    falls back to estimates based on model pricing.
    """
    import os

    # Default to last 30 days
    if not end_date:
        end_dt = datetime.utcnow()
    else:
        end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00').replace('+00:00', ''))

    if not start_date:
        start_dt = end_dt - timedelta(days=30)
    else:
        start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00').replace('+00:00', ''))

    costs = {
        "period": {
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat()
        },
        "providers": {},
        "total_estimated_usd": 0.0,
        "data_source": "estimated",
        "model_pricing": MODEL_PRICING,
    }

    total_cost = 0.0

    # Try to get real costs from Anthropic Admin API
    # Admin API keys start with "sk-ant-admin-", regular keys start with "sk-ant-api"
    anthropic_admin_key = os.environ.get("ANTHROPIC_ADMIN_API_KEY")
    if anthropic_admin_key and anthropic_admin_key.startswith("sk-ant-admin"):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Fetch cost report - uses daily granularity
                cost_response = await client.get(
                    "https://api.anthropic.com/v1/organizations/cost_report",
                    params={
                        "start_date": start_dt.strftime("%Y-%m-%d"),
                        "end_date": end_dt.strftime("%Y-%m-%d"),
                        "limit": 1000
                    },
                    headers={
                        "anthropic-version": "2023-06-01",
                        "x-api-key": anthropic_admin_key
                    }
                )

                if cost_response.status_code == 200:
                    cost_data = cost_response.json()
                    # Sum up costs - costs are in USD as decimal strings
                    anthropic_total = sum(
                        float(item.get("cost_usd", 0))
                        for item in cost_data.get("data", [])
                    )
                    costs["providers"]["anthropic"] = {
                        "source": "api",
                        "total_usd": round(anthropic_total, 4),
                        "data": cost_data.get("data", [])[:10],  # First 10 entries for preview
                        "total_entries": len(cost_data.get("data", []))
                    }
                    total_cost += anthropic_total
                    costs["data_source"] = "api"

                    # Also fetch usage data for more details
                    usage_response = await client.get(
                        "https://api.anthropic.com/v1/organizations/usage_report/messages",
                        params={
                            "start_date": start_dt.strftime("%Y-%m-%d"),
                            "end_date": end_dt.strftime("%Y-%m-%d"),
                            "group_by": "model",
                            "bucket": "1d",
                            "limit": 1000
                        },
                        headers={
                            "anthropic-version": "2023-06-01",
                            "x-api-key": anthropic_admin_key
                        }
                    )
                    if usage_response.status_code == 200:
                        usage_data = usage_response.json()
                        costs["providers"]["anthropic"]["usage"] = {
                            "by_model": usage_data.get("data", [])[:20],
                            "total_input_tokens": sum(
                                item.get("input_tokens", 0) for item in usage_data.get("data", [])
                            ),
                            "total_output_tokens": sum(
                                item.get("output_tokens", 0) for item in usage_data.get("data", [])
                            )
                        }
                else:
                    logger.warning(f"Anthropic cost API returned {cost_response.status_code}: {cost_response.text}")
                    costs["providers"]["anthropic"] = {
                        "source": "error",
                        "error": f"API returned {cost_response.status_code}",
                        "note": "Check Admin API key permissions"
                    }
        except Exception as e:
            logger.error(f"Error fetching Anthropic costs: {e}")
            costs["providers"]["anthropic"] = {
                "source": "error",
                "error": str(e)
            }
    else:
        # Check if they have a regular key but not admin
        regular_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if regular_key.startswith("sk-ant-api"):
            costs["providers"]["anthropic"] = {
                "source": "no_admin_key",
                "note": "You have a regular API key (sk-ant-api...). For cost data, create an Admin API key (sk-ant-admin...) at console.anthropic.com/settings/admin-keys",
                "setup_url": "https://console.anthropic.com/settings/admin-keys"
            }
        else:
            costs["providers"]["anthropic"] = {
                "source": "no_api_key",
                "note": "No Anthropic API key configured"
            }

    # Google AI Studio - check if we can get usage
    # Google AI Studio doesn't have a direct billing API like Anthropic
    # Would need Google Cloud Billing API with service account
    google_api_key = os.environ.get("GOOGLE_API_KEY")
    if google_api_key:
        costs["providers"]["google"] = {
            "source": "no_billing_api",
            "note": "Google AI Studio doesn't expose usage API. Check console.cloud.google.com/billing for costs.",
            "console_url": "https://console.cloud.google.com/billing"
        }
    else:
        costs["providers"]["google"] = {
            "source": "no_api_key",
            "note": "No GOOGLE_API_KEY configured"
        }

    # OpenAI - has a usage API
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    if openai_api_key:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # OpenAI usage API
                usage_response = await client.get(
                    "https://api.openai.com/v1/organization/usage",
                    params={
                        "start_date": start_dt.strftime("%Y-%m-%d"),
                        "end_date": end_dt.strftime("%Y-%m-%d")
                    },
                    headers={
                        "Authorization": f"Bearer {openai_api_key}"
                    }
                )
                if usage_response.status_code == 200:
                    usage_data = usage_response.json()
                    openai_total = usage_data.get("total_usage", 0) / 100  # Convert cents to dollars
                    costs["providers"]["openai"] = {
                        "source": "api",
                        "total_usd": round(openai_total, 4),
                        "data": usage_data
                    }
                    total_cost += openai_total
                else:
                    costs["providers"]["openai"] = {
                        "source": "api_error",
                        "note": f"API returned {usage_response.status_code}. Check platform.openai.com/usage for costs.",
                        "console_url": "https://platform.openai.com/usage"
                    }
        except Exception as e:
            costs["providers"]["openai"] = {
                "source": "error",
                "error": str(e),
                "console_url": "https://platform.openai.com/usage"
            }
    else:
        costs["providers"]["openai"] = {
            "source": "no_api_key",
            "note": "No OPENAI_API_KEY configured"
        }

    # Perplexity - no billing API
    pplx_key = os.environ.get("PPLX_API_KEY") or os.environ.get("PERPLEXITY_API_KEY")
    if pplx_key:
        costs["providers"]["perplexity"] = {
            "source": "no_billing_api",
            "note": "Perplexity doesn't have a usage API. Check your Perplexity dashboard for costs."
        }
    else:
        costs["providers"]["perplexity"] = {
            "source": "no_api_key",
            "note": "No PPLX_API_KEY configured"
        }

    costs["total_estimated_usd"] = round(total_cost, 2)

    # Add setup instructions
    costs["setup_instructions"] = {
        "anthropic": "Create Admin API key at console.anthropic.com/settings/admin-keys (requires org admin role)",
        "google": "Google AI Studio billing is viewed at console.cloud.google.com/billing",
        "openai": "OpenAI usage is at platform.openai.com/usage"
    }

    return costs


@router.get("/costs/estimate")
async def estimate_costs(
    request: Request,
    decks_per_day: int = Query(10, description="Average decks generated per day"),
    slides_per_deck: int = Query(10, description="Average slides per deck"),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Estimate monthly costs based on usage patterns.
    """
    # Estimated tokens per operation
    TOKENS_PER_SLIDE = {
        "theme_input": 2000,
        "theme_output": 500,
        "slide_input": 3000,
        "slide_output": 2000,
        "outline_input": 1500,
        "outline_output": 1000,
    }

    # Get models from config - use actual task mappings, not legacy aliases
    try:
        from agents.config import (
            MODEL_HARD, MODEL_RESEARCH, CUSTOM_COMPONENT_MODEL, GEMINI_3_PRO
        )
        # These are the actual models used for each operation:
        # - Theme generation: MODEL_HARD (gemini-3-pro-preview)
        # - Slide generation: MODEL_HARD (gemini-3-pro-preview)
        # - Outline/research: MODEL_RESEARCH (perplexity-sonar-pro)
        # - Custom components: CUSTOM_COMPONENT_MODEL (gemini-3-pro-preview)
        THEME_MODEL_ACTUAL = MODEL_HARD  # gemini-3-pro-preview
        SLIDE_MODEL_ACTUAL = MODEL_HARD  # gemini-3-pro-preview
        OUTLINE_MODEL_ACTUAL = MODEL_RESEARCH  # perplexity-sonar-pro
        CUSTOM_MODEL_ACTUAL = CUSTOM_COMPONENT_MODEL  # gemini-3-pro-preview
    except ImportError:
        THEME_MODEL_ACTUAL = "gemini-3-pro-preview"
        SLIDE_MODEL_ACTUAL = "gemini-3-pro-preview"
        OUTLINE_MODEL_ACTUAL = "perplexity-sonar-pro"
        CUSTOM_MODEL_ACTUAL = "gemini-3-pro-preview"

    decks_per_month = decks_per_day * 30
    slides_per_month = decks_per_month * slides_per_deck

    estimates = {
        "input": {
            "decks_per_day": decks_per_day,
            "slides_per_deck": slides_per_deck,
            "decks_per_month": decks_per_month,
            "slides_per_month": slides_per_month
        },
        "breakdown": [],
        "total_monthly_usd": 0.0
    }

    # Theme generation (1 per deck)
    theme_model = THEME_MODEL_ACTUAL
    if theme_model in MODEL_PRICING:
        pricing = MODEL_PRICING[theme_model]
        input_cost = (TOKENS_PER_SLIDE["theme_input"] * decks_per_month / 1_000_000) * pricing["input"]
        output_cost = (TOKENS_PER_SLIDE["theme_output"] * decks_per_month / 1_000_000) * pricing["output"]
        total = input_cost + output_cost
        estimates["breakdown"].append({
            "operation": "Theme Generation",
            "model": theme_model,
            "provider": pricing["provider"],
            "calls_per_month": decks_per_month,
            "cost_usd": round(total, 2)
        })
        estimates["total_monthly_usd"] += total

    # Outline generation (1 per deck)
    outline_model = OUTLINE_MODEL_ACTUAL
    if outline_model in MODEL_PRICING:
        pricing = MODEL_PRICING[outline_model]
        if pricing.get("per_request"):
            total = pricing["per_request"] * decks_per_month
        else:
            input_cost = (TOKENS_PER_SLIDE["outline_input"] * decks_per_month / 1_000_000) * pricing["input"]
            output_cost = (TOKENS_PER_SLIDE["outline_output"] * decks_per_month / 1_000_000) * pricing["output"]
            total = input_cost + output_cost
        estimates["breakdown"].append({
            "operation": "Outline Generation",
            "model": outline_model,
            "provider": pricing["provider"],
            "calls_per_month": decks_per_month,
            "cost_usd": round(total, 2)
        })
        estimates["total_monthly_usd"] += total

    # Slide generation (1 per slide)
    slide_model = SLIDE_MODEL_ACTUAL
    if slide_model in MODEL_PRICING:
        pricing = MODEL_PRICING[slide_model]
        input_cost = (TOKENS_PER_SLIDE["slide_input"] * slides_per_month / 1_000_000) * pricing["input"]
        output_cost = (TOKENS_PER_SLIDE["slide_output"] * slides_per_month / 1_000_000) * pricing["output"]
        total = input_cost + output_cost
        estimates["breakdown"].append({
            "operation": "Slide Generation",
            "model": slide_model,
            "provider": pricing["provider"],
            "calls_per_month": slides_per_month,
            "cost_usd": round(total, 2)
        })
        estimates["total_monthly_usd"] += total

    # Custom components (estimate 30% of slides have custom components)
    custom_slides = int(slides_per_month * 0.3)
    custom_model = CUSTOM_MODEL_ACTUAL
    if custom_model in MODEL_PRICING:
        pricing = MODEL_PRICING[custom_model]
        input_cost = (2000 * custom_slides / 1_000_000) * pricing["input"]
        output_cost = (3000 * custom_slides / 1_000_000) * pricing["output"]
        total = input_cost + output_cost
        estimates["breakdown"].append({
            "operation": "Custom Components",
            "model": custom_model,
            "provider": pricing["provider"],
            "calls_per_month": custom_slides,
            "cost_usd": round(total, 2)
        })
        estimates["total_monthly_usd"] += total

    estimates["total_monthly_usd"] = round(estimates["total_monthly_usd"], 2)

    # Add provider summary
    provider_totals = {}
    for item in estimates["breakdown"]:
        provider = item["provider"]
        if provider not in provider_totals:
            provider_totals[provider] = 0.0
        provider_totals[provider] += item["cost_usd"]

    estimates["by_provider"] = {
        provider: round(total, 2)
        for provider, total in provider_totals.items()
    }

    return estimates


# ==================== Test Data Cleanup ====================

class CleanupRequest(BaseModel):
    user_email: str
    keep_last_days: int = 10
    keep_every_nth: int = 10
    keep_first_n: int = 10
    dry_run: bool = True


class CleanupResponse(BaseModel):
    total_decks: int
    decks_to_keep: int
    decks_to_delete: int
    deleted_deck_ids: List[str]
    kept_deck_ids: List[str]
    dry_run: bool


@router.post("/cleanup/user-decks", response_model=CleanupResponse)
async def cleanup_user_decks(
    request: Request,
    cleanup_request: CleanupRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Clean up test user's decks while preserving important data.

    Rules:
    1. Keep all decks from the last N days
    2. Keep every Nth deck from before that
    3. Keep the first N decks ever created
    """
    try:
        supabase = get_supabase_client()

        # Find the user by email
        user_response = supabase.table("users").select("id").eq(
            "email", cleanup_request.user_email
        ).single().execute()

        if not user_response.data:
            raise HTTPException(status_code=404, detail=f"User not found: {cleanup_request.user_email}")

        user_id = user_response.data["id"]

        # Get all decks for this user, ordered by created_at
        decks_response = supabase.table("decks").select(
            "uuid, name, created_at"
        ).eq("user_id", user_id).order("created_at", desc=False).execute()

        all_decks = decks_response.data or []
        total_decks = len(all_decks)

        if total_decks == 0:
            return CleanupResponse(
                total_decks=0,
                decks_to_keep=0,
                decks_to_delete=0,
                deleted_deck_ids=[],
                kept_deck_ids=[],
                dry_run=cleanup_request.dry_run
            )

        # Calculate cutoff date for "recent" decks
        cutoff_date = datetime.utcnow() - timedelta(days=cleanup_request.keep_last_days)

        decks_to_keep = set()
        decks_to_delete = set()

        # Rule 1: Keep first N decks
        first_n = min(cleanup_request.keep_first_n, total_decks)
        for i in range(first_n):
            decks_to_keep.add(all_decks[i]["uuid"])

        # Process remaining decks
        older_deck_index = 0
        for i, deck in enumerate(all_decks):
            deck_id = deck["uuid"]
            created_at_str = deck.get("created_at", "")

            try:
                created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00")).replace(tzinfo=None)
            except (ValueError, TypeError, AttributeError):
                created_at = datetime.min

            # Rule 2: Keep all decks from the last N days
            if created_at >= cutoff_date:
                decks_to_keep.add(deck_id)
                continue

            # Rule 3: For older decks (not in first N), keep every Nth
            if deck_id not in decks_to_keep:
                if older_deck_index % cleanup_request.keep_every_nth == 0:
                    decks_to_keep.add(deck_id)
                else:
                    decks_to_delete.add(deck_id)
                older_deck_index += 1

        # Remove any decks from delete list that are in keep list
        decks_to_delete = decks_to_delete - decks_to_keep

        deleted_ids = []
        kept_ids = list(decks_to_keep)

        # Perform deletion if not dry run
        if not cleanup_request.dry_run and decks_to_delete:
            for deck_id in decks_to_delete:
                try:
                    # Hard delete the deck
                    supabase.table("decks").delete().eq("uuid", deck_id).execute()
                    deleted_ids.append(deck_id)
                except Exception as del_err:
                    logger.warning(f"Failed to delete deck {deck_id}: {del_err}")

            # Log the action
            await log_admin_action(
                admin_user_id=admin["id"],
                action="bulk_delete_decks",
                request=request,
                action_details={
                    "target_user_email": cleanup_request.user_email,
                    "target_user_id": user_id,
                    "deleted_count": len(deleted_ids),
                    "kept_count": len(decks_to_keep)
                }
            )
        else:
            deleted_ids = list(decks_to_delete)

        return CleanupResponse(
            total_decks=total_decks,
            decks_to_keep=len(decks_to_keep),
            decks_to_delete=len(decks_to_delete),
            deleted_deck_ids=deleted_ids,
            kept_deck_ids=kept_ids,
            dry_run=cleanup_request.dry_run
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cleanup error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SHARE VIEWERS / LEADS ENDPOINTS
# ============================================================================

class ShareViewerSummary(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    company: Optional[str] = None
    registered_at: str
    share_id: str
    deck_name: Optional[str] = None
    deck_owner_email: Optional[str] = None


class ShareViewersListResponse(BaseModel):
    viewers: List[ShareViewerSummary]
    total: int
    page: int
    totalPages: int


@router.get("/share-viewers", response_model=ShareViewersListResponse)
async def list_share_viewers(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None),
    sort_by: str = Query("registered_at"),
    sort_order: str = Query("desc"),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    List all share viewers (collected emails) across all shares
    """
    try:
        supabase = get_supabase_client()

        # Build query for share_viewers with related data
        query = supabase.table("share_viewers").select(
            "id, email, name, company, registered_at, share_id, client_ip",
            count="exact"
        )

        # Apply search filter
        if search:
            safe_search = search.replace("%", "\\%").replace("_", "\\_")
            query = query.or_(f"email.ilike.%{safe_search}%,name.ilike.%{safe_search}%,company.ilike.%{safe_search}%")

        # Apply sorting
        sort_field_map = {
            "registered_at": "registered_at",
            "email": "email",
            "name": "name",
            "company": "company",
        }
        db_sort_by = sort_field_map.get(sort_by, "registered_at")
        query = query.order(db_sort_by, desc=(sort_order == "desc"))

        # Apply pagination
        offset = (page - 1) * limit
        query = query.range(offset, offset + limit - 1)

        # Execute query
        response = query.execute()
        viewers_data = response.data or []
        total = response.count or 0

        # Get related deck and owner info
        share_ids = list(set(v["share_id"] for v in viewers_data if v.get("share_id")))

        deck_info_map = {}
        if share_ids:
            # Get share -> deck mapping
            shares_result = supabase.table("deck_shares").select(
                "id, deck_uuid, created_by"
            ).in_("id", share_ids).execute()

            if shares_result.data:
                deck_uuids = list(set(s["deck_uuid"] for s in shares_result.data if s.get("deck_uuid")))
                owner_ids = list(set(s["created_by"] for s in shares_result.data if s.get("created_by")))

                # Get deck names
                deck_names = {}
                if deck_uuids:
                    decks_result = supabase.table("decks").select("uuid, name").in_("uuid", deck_uuids).execute()
                    deck_names = {d["uuid"]: d["name"] for d in (decks_result.data or [])}

                # Get owner emails
                owner_emails = {}
                if owner_ids:
                    owners_result = supabase.table("users").select("id, email").in_("id", owner_ids).execute()
                    owner_emails = {o["id"]: o["email"] for o in (owners_result.data or [])}

                # Build mapping
                for share in shares_result.data:
                    deck_info_map[share["id"]] = {
                        "deck_name": deck_names.get(share.get("deck_uuid")),
                        "deck_owner_email": owner_emails.get(share.get("created_by"))
                    }

        # Build response
        viewers = []
        for v in viewers_data:
            share_info = deck_info_map.get(v["share_id"], {})
            viewers.append(ShareViewerSummary(
                id=v["id"],
                email=v["email"],
                name=v.get("name"),
                company=v.get("company"),
                registered_at=v["registered_at"],
                share_id=v["share_id"],
                deck_name=share_info.get("deck_name"),
                deck_owner_email=share_info.get("deck_owner_email")
            ))

        total_pages = (total + limit - 1) // limit if total > 0 else 1

        return ShareViewersListResponse(
            viewers=viewers,
            total=total,
            page=page,
            totalPages=total_pages
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing share viewers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/share-viewers/export")
async def export_share_viewers(
    request: Request,
    search: Optional[str] = Query(None),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Export all share viewers as CSV
    """
    from fastapi.responses import StreamingResponse
    import csv
    import io

    try:
        supabase = get_supabase_client()

        # Get all viewers (no pagination for export)
        query = supabase.table("share_viewers").select(
            "id, email, name, company, registered_at, share_id, client_ip"
        )

        if search:
            safe_search = search.replace("%", "\\%").replace("_", "\\_")
            query = query.or_(f"email.ilike.%{safe_search}%,name.ilike.%{safe_search}%,company.ilike.%{safe_search}%")

        query = query.order("registered_at", desc=True)
        response = query.execute()
        viewers_data = response.data or []

        # Get related deck and owner info
        share_ids = list(set(v["share_id"] for v in viewers_data if v.get("share_id")))

        deck_info_map = {}
        if share_ids:
            shares_result = supabase.table("deck_shares").select(
                "id, deck_uuid, created_by"
            ).in_("id", share_ids).execute()

            if shares_result.data:
                deck_uuids = list(set(s["deck_uuid"] for s in shares_result.data if s.get("deck_uuid")))
                owner_ids = list(set(s["created_by"] for s in shares_result.data if s.get("created_by")))

                deck_names = {}
                if deck_uuids:
                    decks_result = supabase.table("decks").select("uuid, name").in_("uuid", deck_uuids).execute()
                    deck_names = {d["uuid"]: d["name"] for d in (decks_result.data or [])}

                owner_emails = {}
                if owner_ids:
                    owners_result = supabase.table("users").select("id, email").in_("id", owner_ids).execute()
                    owner_emails = {o["id"]: o["email"] for o in (owners_result.data or [])}

                for share in shares_result.data:
                    deck_info_map[share["id"]] = {
                        "deck_name": deck_names.get(share.get("deck_uuid")),
                        "deck_owner_email": owner_emails.get(share.get("created_by"))
                    }

        # Create CSV
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow(["Email", "Name", "Company", "Registered At", "Deck Name", "Deck Owner Email"])

        # Data rows
        for v in viewers_data:
            share_info = deck_info_map.get(v["share_id"], {})
            writer.writerow([
                v["email"],
                v.get("name") or "",
                v.get("company") or "",
                v["registered_at"],
                share_info.get("deck_name") or "",
                share_info.get("deck_owner_email") or ""
            ])

        output.seek(0)

        # Log the export action
        await log_admin_action(
            admin_user_id=admin["id"],
            action="export_share_viewers",
            request=request,
            details={"count": len(viewers_data), "search": search}
        )

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=share_viewers_export.csv"}
        )