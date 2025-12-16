"""
Authentication API endpoints using Supabase
"""
from fastapi import APIRouter, HTTPException, Depends, Header, Query, Request
from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, EmailStr, ValidationError
from services.supabase_auth_service import get_auth_service
from utils.supabase import get_deck
import logging
import os
import httpx
import json
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/auth", tags=["authentication"])

# Request/Response models
class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    company: Optional[str] = None

class SignInRequest(BaseModel):
    email: EmailStr
    password: str

class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    company: Optional[str] = None
    avatar_url: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class ShareDeckRequest(BaseModel):
    deck_uuid: str
    with_user_email: EmailStr
    permissions: Optional[List[str]] = ["view"]

class AuthResponse(BaseModel):
    user: Dict[str, Any]
    session: Optional[Dict[str, Any]] = None
    message: str = "Success"

# Google OAuth models
class GoogleSignInRequest(BaseModel):
    credential: str

class GoogleSignUpRequest(BaseModel):
    credential: str

# Magic Link models
class MagicLinkSendRequest(BaseModel):
    email: EmailStr

class MagicLinkVerifyRequest(BaseModel):
    token: str

class CheckEmailRequest(BaseModel):
    email: EmailStr

class CheckEmailResponse(BaseModel):
    exists: bool

# Helper function to get auth header
async def get_auth_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract JWT token from Authorization header"""
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "")
    return None

# Authentication endpoints
@router.post("/signup", response_model=AuthResponse)
async def sign_up(request: SignUpRequest):
    """Sign up a new user"""
    try:
        auth_service = get_auth_service()
        
        # Prepare metadata
        metadata = {}
        if request.full_name:
            metadata["full_name"] = request.full_name
        if request.company:
            metadata["company"] = request.company
        
        result = auth_service.sign_up(
            email=request.email,
            password=request.password,
            metadata=metadata if metadata else None
        )
        
        return AuthResponse(
            user=result["user"],
            session=result["session"],
            message="User created successfully"
        )
    except Exception as e:
        logger.error(f"Sign up error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/signin", response_model=AuthResponse)
async def sign_in(request: SignInRequest):
    """Sign in an existing user"""
    try:
        auth_service = get_auth_service()
        result = auth_service.sign_in(
            email=request.email,
            password=request.password
        )
        
        return AuthResponse(
            user=result["user"],
            session=result["session"],
            message="Sign in successful"
        )
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Sign in error for {request.email}: {error_msg}")
        
        # Check for specific error messages from Supabase
        if "Invalid login credentials" in error_msg:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        elif "Email not confirmed" in error_msg:
            raise HTTPException(status_code=401, detail="Please confirm your email before signing in")
        elif "User not found" in error_msg:
            raise HTTPException(status_code=401, detail="No account found with this email")
        else:
            # Log the full error for debugging
            logger.error(f"Unexpected sign in error: {error_msg}", exc_info=True)
            raise HTTPException(status_code=500, detail="Authentication service error. Please try again.")

@router.post("/signout")
async def sign_out(token: Optional[str] = Depends(get_auth_header)):
    """Sign out the current user"""
    try:
        auth_service = get_auth_service()
        auth_service.sign_out()
        return {"message": "Sign out successful"}
    except Exception as e:
        logger.error(f"Sign out error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/me")
async def get_current_user(token: Optional[str] = Depends(get_auth_header)):
    """Get the current authenticated user"""
    try:
        auth_service = get_auth_service()
        
        # Use the token if provided
        if token:
            user = auth_service.get_user_with_token(token)
        else:
            user = auth_service.get_user()
        
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Try to get profile, but don't fail if it doesn't exist
        profile = None
        try:
            profile = auth_service.get_user_profile(user["id"])
        except Exception as profile_error:
            logger.warning(f"Could not fetch profile for user {user['id']}: {str(profile_error)}")
            # Profile might not exist yet, that's okay
            profile = {
                "id": user["id"],
                "email": user["email"],
                "full_name": user.get("user_metadata", {}).get("full_name"),
                "company": user.get("user_metadata", {}).get("company"),
                "created_at": user.get("created_at"),
                "updated_at": user.get("updated_at")
            }
        
        return {
            "user": user,
            "profile": profile
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get current user error: {str(e)}")
        raise HTTPException(status_code=401, detail="Not authenticated")

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@router.post("/refresh")
async def refresh_token(request: RefreshTokenRequest):
    """Refresh the authentication token using a refresh token"""
    try:
        auth_service = get_auth_service()
        
        # Make direct API call to refresh token
        import httpx
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        
        headers = {
            "apikey": key,
            "Content-Type": "application/json"
        }
        
        data = {
            "refresh_token": request.refresh_token
        }
        
        response = httpx.post(
            f"{url}/auth/v1/token?grant_type=refresh_token",
            headers=headers,
            json=data,
            timeout=10.0
        )
        
        if response.status_code == 200:
            token_data = response.json()
            
            # Get user data with the new token
            user_headers = {
                "Authorization": f"Bearer {token_data['access_token']}",
                "apikey": key
            }
            user_response = httpx.get(
                f"{url}/auth/v1/user",
                headers=user_headers
            )
            
            if user_response.status_code == 200:
                user_data = user_response.json()
                
                return AuthResponse(
                    user={
                        "id": user_data.get("id"),
                        "email": user_data.get("email"),
                        "created_at": user_data.get("created_at"),
                        "updated_at": user_data.get("updated_at"),
                        "user_metadata": user_data.get("user_metadata", {}),
                        "app_metadata": user_data.get("app_metadata", {}),
                    },
                    session={
                        "access_token": token_data.get("access_token"),
                        "refresh_token": token_data.get("refresh_token"),
                        "expires_in": token_data.get("expires_in"),
                        "expires_at": token_data.get("expires_at"),
                        "token_type": token_data.get("token_type"),
                    },
                    message="Session refreshed"
                )
        
        raise HTTPException(status_code=401, detail="Could not refresh session")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Refresh token error: {str(e)}")
        raise HTTPException(status_code=401, detail="Could not refresh session")

# Profile endpoints
@router.put("/profile/{user_id}")
async def update_profile(
    user_id: str,
    request: UpdateProfileRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """Update user profile"""
    try:
        auth_service = get_auth_service()
        
        # Prepare updates
        updates = {}
        if request.full_name is not None:
            updates["full_name"] = request.full_name
        if request.company is not None:
            updates["company"] = request.company
        if request.avatar_url is not None:
            updates["avatar_url"] = request.avatar_url
        if request.metadata is not None:
            updates["metadata"] = request.metadata
        
        profile = auth_service.update_user_profile(user_id, updates)
        
        if not profile:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {"profile": profile, "message": "Profile updated successfully"}
    except Exception as e:
        logger.error(f"Update profile error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

# Deck association endpoints
@router.get("/decks")
async def get_user_decks(
    token: Optional[str] = Depends(get_auth_header),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    filter: str = Query("owned", regex="^(owned|shared|all)$", description="Filter decks by ownership"),
    search: Optional[str] = Query(None, min_length=1, max_length=100, description="Search query to filter decks by name")
):
    """
    Get decks for the authenticated user with pagination and filtering

    Query parameters:
    - filter: "owned" (default) | "shared" | "all"
        - owned: Only user's own decks
        - shared: Only decks shared with the user
        - all: Both owned and shared decks
    - limit: Number of decks to return (max 100)
    - offset: Number of decks to skip for pagination
    - search: Optional search query to filter decks by name (case-insensitive)
    """
    # Debug logging
    logger.debug(f"Getting user decks - Token present: {token is not None}, Token length: {len(token) if token else 0}")
    
    # Check authentication first
    if not token:
        logger.error("No token provided - returning 401")
        raise HTTPException(
            status_code=401, 
            detail="Authentication required. Please log in again."
        )
    
    try:
        # Use session manager for token validation instead of auth service
        from services.session_manager import validate_token
        user = validate_token(token)
        
        logger.debug(f"User retrieved: {user is not None}, User ID: {user.get('id') if user else 'None'}")
        
        if not user:
            logger.error("No user found for token - returning 401")
            raise HTTPException(
                status_code=401, 
                detail="Session expired. Please refresh your token or log in again."
            )
        
        # Get auth service for deck operations (uses service key for RLS bypass)
        auth_service = get_auth_service()
        logger.info(f"[get_user_decks] Search query: '{search}', filter: {filter}, limit: {limit}, offset: {offset}")
        result = auth_service.get_user_decks_filtered(
            user["id"],
            filter_type=filter,
            limit=limit,
            offset=offset,
            search_query=search
        )
        logger.info(f"[get_user_decks] Found {len(result.get('decks', []))} decks")

        return {
            "decks": result.get("decks", []),
            "count": len(result.get("decks", [])),
            "total": result.get("total", 0),
            "has_more": result.get("has_more", False),
            "limit": limit,
            "offset": offset,
            "filter": filter,
            "search": search
        }
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Get user decks error: {str(e)}", exc_info=True)
        # Only return 500 for actual server errors, not auth errors
        raise HTTPException(status_code=500, detail="Failed to get decks")

@router.get("/shared-decks")
async def get_shared_decks(
    token: Optional[str] = Depends(get_auth_header),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """
    Get only decks that have been shared with the current user.
    This is a convenience endpoint equivalent to /decks?filter=shared
    """
    try:
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else auth_service.get_user()
        
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Call with timeout protection
        import asyncio
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
        
        def get_shared_decks_with_timeout():
            return auth_service.get_shared_decks(user["id"], limit=limit, offset=offset)
        
        # Run with a 5-second timeout to prevent freezing
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(get_shared_decks_with_timeout)
            try:
                result = future.result(timeout=5.0)
            except FutureTimeoutError:
                logger.warning(f"Get shared decks timed out after 5 seconds for user {user['id']}")
                # Return empty result on timeout instead of freezing
                result = {"decks": [], "total": 0, "has_more": False}
                future.cancel()
        
        return {
            "decks": result.get("decks", []), 
            "count": len(result.get("decks", [])), 
            "total": result.get("total", 0),
            "has_more": result.get("has_more", False),
            "limit": limit,
            "offset": offset
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get shared decks error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get shared decks")

@router.post("/decks/thumbnails")
async def get_deck_thumbnails(
    deck_uuids: List[str],
    token: Optional[str] = Depends(get_auth_header)
):
    """Get thumbnail data for multiple decks"""
    try:
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else auth_service.get_user()
        
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Limit the number of thumbnails to prevent abuse
        if len(deck_uuids) > 20:
            raise HTTPException(status_code=400, detail="Maximum 20 thumbnails per request")
        
        # Get thumbnail data for the requested decks
        supabase = auth_service.supabase
        thumbnails = {}
        
        # Fetch only first_slide and slide_count (not full slides array)
        response = supabase.table("decks").select(
            "uuid,first_slide,slide_count,user_id"
        ).in_("uuid", deck_uuids).execute()

        for deck in response.data:
            # Only include if user has access
            if deck.get("user_id") == user["id"]:
                thumbnails[deck["uuid"]] = {
                    "first_slide": deck.get("first_slide"),
                    "slide_count": deck.get("slide_count", 0) or 0
                }
        
        return {"thumbnails": thumbnails}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get deck thumbnails error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/decks/{deck_uuid}")
async def get_single_deck(deck_uuid: str, token: Optional[str] = Depends(get_auth_header)):
    """Get a single deck by UUID"""
    try:
        # Validate UUID format
        import uuid
        try:
            uuid.UUID(deck_uuid)
        except ValueError:
            logger.error(f"Invalid UUID format: {deck_uuid}")
            raise HTTPException(status_code=400, detail=f"Invalid deck ID format: {deck_uuid}")
        
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else auth_service.get_user()
        
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Get the deck using the utility function
        deck = get_deck(deck_uuid)
        
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        # Check if user has access to this deck
        user_id = user["id"]
        deck_user_id = deck.get("user_id")
        
        # Check ownership
        if deck_user_id == user_id:
            deck["is_owner"] = True
            deck["permissions"] = ["view", "edit", "delete"]
        else:
            # Check if deck is shared with user
            supabase = auth_service.supabase
            shared_response = supabase.table("user_decks").select("*").eq("user_id", user_id).eq("deck_uuid", deck_uuid).execute()
            
            if not shared_response.data:
                raise HTTPException(status_code=403, detail="You don't have access to this deck")
            
            deck["is_owner"] = False
            deck["permissions"] = shared_response.data[0].get("permissions", ["view"])
        
        # Don't send the huge JSON fields unless specifically requested
        # You can add a query parameter later to include full data
        if "slides" in deck:
            deck["slide_count"] = len(deck["slides"])
            # Remove the actual slides data to reduce payload
            del deck["slides"]
        if "data" in deck:
            # Keep only essential theme info
            theme_data = deck.get("data", {})
            deck["theme_summary"] = {
                "colors": theme_data.get("theme", {}).get("colors", {}),
                "fonts": theme_data.get("theme", {}).get("fonts", {})
            }
            del deck["data"]
        if "outline" in deck:
            # Remove outline to reduce payload
            del deck["outline"]
        
        return deck
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get single deck error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/decks/{deck_uuid}/full")
async def get_full_deck(deck_uuid: str, token: Optional[str] = Depends(get_auth_header)):
    """Get a full deck including all slides"""
    try:
        # Validate UUID format
        import uuid
        try:
            uuid.UUID(deck_uuid)
        except ValueError:
            logger.error(f"Invalid UUID format: {deck_uuid}")
            raise HTTPException(status_code=400, detail=f"Invalid deck ID format: {deck_uuid}")
        
        # Extract user from token
        user_id = None
        if token:
            auth_service = get_auth_service()
            user = auth_service.get_user_with_token(token)
            if user:
                user_id = user.get('id')
                logger.debug("Getting deck %s for user %s", deck_uuid, user_id)
            else:
                logger.warning(f"⚠️ Invalid token when fetching deck {deck_uuid}")
        else:
            logger.debug("Getting deck %s without authentication", deck_uuid)

        # Get deck from database
        logger.debug("Querying database for deck %s...", deck_uuid)
        deck = get_deck(deck_uuid)

        if not deck:
            logger.error(f"❌ Deck {deck_uuid} NOT FOUND in database (user: {user_id or 'anonymous'})")
            # Try a direct query to see if the deck exists at all
            try:
                from utils.supabase import get_supabase_client
                supabase = get_supabase_client()
                direct_check = supabase.table("decks").select("uuid,user_id,name,created_at").eq("uuid", deck_uuid).execute()
                if direct_check.data:
                    logger.error(f"❌ CRITICAL: Deck EXISTS in database but get_deck() returned None!")
                    logger.error(f"   Direct query result: {direct_check.data[0]}")
                else:
                    logger.error(f"❌ Deck truly does not exist in database")
            except Exception as direct_error:
                logger.error(f"❌ Direct query also failed: {direct_error}")
            raise HTTPException(status_code=404, detail="Deck not found")

        logger.debug(
            "Deck %s found (owner=%s, slides=%s)",
            deck_uuid,
            deck.get("user_id"),
            len(deck.get("slides", []) or []),
        )
        # Keep per-slide/per-component logging disabled by default; it was too noisy.
        if logger.isEnabledFor(logging.DEBUG):
            try:
                custom_components = 0
                for slide in (deck.get("slides", []) or []):
                    comps = slide.get("components") or []
                    custom_components += sum(1 for c in comps if c.get("type") == "CustomComponent")
                logger.debug("Deck %s contains %s CustomComponents", deck_uuid, custom_components)
            except Exception:
                pass
        
        # Check access permissions
        deck_user_id = deck.get('user_id')
        
        # Allow access if:
        # 1. Deck is anonymous (user_id is None)
        # 2. User owns the deck
        # 3. User has access through collaboration
        if deck_user_id is None:
            # Anonymous deck - allow access
            logger.debug(f"Allowing access to anonymous deck {deck_uuid}")
        elif user_id and deck_user_id == user_id:
            # User owns the deck
            logger.debug(f"User {user_id} owns deck {deck_uuid}")
        elif user_id:
            # Check if user has collaboration access
            from services.deck_sharing_service import DeckSharingService
            sharing_service = DeckSharingService()
            
            if not sharing_service.user_has_deck_access(deck_uuid, user_id):
                logger.warning(f"User {user_id} does not have access to deck {deck_uuid}")
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            # No authentication and deck is not anonymous
            logger.warning(f"Unauthenticated access denied to deck {deck_uuid}")
            raise HTTPException(status_code=401, detail="Authentication required")
        
        return {
            "deck": deck,
            "access_type": "owner" if deck_user_id == user_id else "shared" if user_id else "anonymous"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting deck: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class CreateDeckRequest(BaseModel):
    uuid: str
    name: str
    slides: List[Dict[str, Any]] = []
    theme: Optional[Dict[str, Any]] = None
    data: Optional[Dict[str, Any]] = None
    outline: Optional[Dict[str, Any]] = None
    version: Optional[Union[str, int]] = None
    last_modified: Optional[str] = None

class UpdateDeckRequest(BaseModel):
    name: Optional[str] = None
    slides: Optional[List[Dict[str, Any]]] = None
    theme: Optional[Dict[str, Any]] = None
    data: Optional[Dict[str, Any]] = None
    outline: Optional[Dict[str, Any]] = None
    version: Optional[Union[str, int]] = None  # Accept both string UUID and integer
    last_modified: Optional[str] = None

@router.post("/decks") 
async def create_deck(
    request: Request,
    token: Optional[str] = Depends(get_auth_header)
):
    """Create a new deck"""
    try:
        # Get raw body to debug
        body = await request.json()
        logger.debug(f"Deck creation request for: {body.get('name', 'Unknown')}")
        
        # Manually validate
        try:
            deck_request = CreateDeckRequest(**body)
        except ValidationError as e:
            logger.error(f"Validation failed: {e.json()}")
            raise HTTPException(status_code=422, detail=e.errors())
        
        logger.debug(f"Deck creation request received: uuid={deck_request.uuid}, name={deck_request.name}")
        
        if not token:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        # Validate token and get user
        from services.session_manager import validate_token
        user = validate_token(token)
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Prepare deck data
        from datetime import datetime
        now = datetime.utcnow().isoformat()
        
        # Handle version field - frontend sends UUID string, but we'll use integer
        version = 1
        if deck_request.version:
            if isinstance(deck_request.version, int):
                version = deck_request.version
            # If it's a string (UUID), just use default version 1
        
        # Build deck data - theme goes inside data column
        data_field = deck_request.data or {}
        if deck_request.theme:
            data_field["theme"] = deck_request.theme
        
        deck_data = {
            "uuid": deck_request.uuid,
            "user_id": user["id"],
            "name": deck_request.name,
            "slides": deck_request.slides,
            "data": data_field,
            "outline": deck_request.outline,
            "created_at": now,
            "last_modified": deck_request.last_modified or now,
            "version": version
        }
        
        # Insert deck into database
        from utils.supabase import get_supabase_client, get_deck
        supabase = get_supabase_client()

        logger.info(f"🔵 Creating deck {deck_request.uuid} for user {user['id']}")
        result = supabase.table("decks").insert(deck_data).execute()

        if result.data:
            logger.info(f"✅ Deck {deck_request.uuid} inserted successfully")

            # Verify the deck was actually created by immediately fetching it
            try:
                verification_deck = get_deck(deck_request.uuid)
                if verification_deck:
                    logger.info(f"✅ VERIFIED: Deck {deck_request.uuid} is retrievable immediately after creation")
                else:
                    logger.error(f"❌ CRITICAL: Deck {deck_request.uuid} was inserted but cannot be retrieved!")
            except Exception as verify_error:
                logger.error(f"❌ CRITICAL: Error verifying deck creation: {verify_error}")

            # Also create user_decks association
            try:
                supabase.table("user_decks").upsert({
                    "user_id": user["id"],
                    "deck_uuid": deck_request.uuid,
                    "last_accessed": now
                }, on_conflict="user_id,deck_uuid").execute()
                logger.info(f"✅ Created user_decks association for deck {deck_request.uuid}")
            except Exception as e:
                logger.warning(f"Could not create user_decks association: {e}")

            return result.data[0]
        else:
            logger.error(f"❌ Failed to insert deck {deck_request.uuid}")
            raise HTTPException(status_code=400, detail="Failed to create deck")
            
    except HTTPException:
        raise
    except ValidationError as e:
        logger.error(f"Deck validation error: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Create deck error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/decks/{deck_uuid}")
async def update_deck(
    deck_uuid: str,
    request: UpdateDeckRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """Update an existing deck"""
    try:
        if not token:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        # Validate token and get user
        from services.session_manager import validate_token
        user = validate_token(token)
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Get the deck to verify ownership
        from utils.supabase import get_deck, get_supabase_client
        deck = get_deck(deck_uuid)
        
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        # Check ownership
        if deck.get("user_id") != user["id"]:
            # Check if user has edit permissions through sharing
            supabase = get_supabase_client()
            from utils.supabase import perform_supabase_operation_with_retry
            shared = perform_supabase_operation_with_retry(
                lambda: supabase.table("user_decks").select("permissions").eq("user_id", user["id"]).eq("deck_uuid", deck_uuid).execute(),
                description=f"check deck permissions for user {user['id']} and deck {deck_uuid}",
                max_attempts=3,
                timeout_seconds=8.0
            )
            
            if not shared.data or "edit" not in shared.data[0].get("permissions", []):
                raise HTTPException(status_code=403, detail="You don't have permission to edit this deck")
        
        # Prepare update data
        from datetime import datetime
        update_data = {}
        
        if request.name is not None:
            update_data["name"] = request.name
        if request.slides is not None:
            update_data["slides"] = request.slides
            
        # Handle theme - it goes inside data column
        if request.data is not None or request.theme is not None:
            existing_data = deck.get("data", {}) or {}
            new_data = request.data if request.data is not None else existing_data
            if request.theme is not None:
                new_data["theme"] = request.theme
            update_data["data"] = new_data
            
        if request.outline is not None:
            update_data["outline"] = request.outline
            
        # Handle version - convert string UUID to integer if needed
        if request.version is not None:
            if isinstance(request.version, int):
                update_data["version"] = request.version
            else:
                # If it's a string (UUID), increment the existing version
                current_version = deck.get("version", 1) or 1
                # Handle both string and int versions
                if isinstance(current_version, str):
                    # If it's a UUID or other string, just use a new UUID
                    update_data["version"] = str(uuid.uuid4())
                else:
                    # If it's an integer, increment it
                    update_data["version"] = int(current_version) + 1
        
        # CRITICAL: Check if deck is currently being generated by the AI
        # If so, REJECT any slide updates to prevent overwriting the AI's work
        if request.slides is not None:
            from agents.generation.concurrency_manager import concurrency_manager
            if concurrency_manager.is_deck_generating(deck_uuid):
                logger.warning(f"⚠️ REJECTING update for deck {deck_uuid} - AI is currently generating slides")
                raise HTTPException(
                    status_code=409, 
                    detail="Deck is currently being generated. Please wait for completion before making changes."
                )
            
            # SAFEGUARD: Prevent overwriting recently generated content (within 30s)
            # This handles the race condition where generation finishes but frontend hasn't refreshed yet
            try:
                last_mod_str = deck.get('last_modified')
                if last_mod_str:
                    from datetime import datetime, timezone
                    # Handle Z suffix for UTC
                    if last_mod_str.endswith('Z'):
                        last_mod_str = last_mod_str[:-1]
                    
                    last_mod = datetime.fromisoformat(last_mod_str)
                    # Ensure timezone awareness
                    if last_mod.tzinfo is None:
                        last_mod = last_mod.replace(tzinfo=timezone.utc)
                        
                    now = datetime.now(timezone.utc)
                    time_diff = (now - last_mod).total_seconds()
                    
                    # If modified in last 30 seconds
                    if time_diff < 30:
                        # Check if this update is destructive (wiping components)
                        current_slides = deck.get('slides') or []
                        new_slides = request.slides or []
                        
                        current_comp_count = sum(len(s.get('components', [])) for s in current_slides)
                        new_comp_count = sum(len(s.get('components', [])) for s in new_slides)
                        
                        # If we are losing more than 50% of components or going to 0 from non-zero
                        if (current_comp_count > 0 and new_comp_count == 0) or \
                           (current_comp_count > 10 and new_comp_count < current_comp_count * 0.5):
                            logger.warning(f"⚠️ REJECTING destructive update for deck {deck_uuid} - Recently updated ({time_diff:.1f}s ago)")
                            logger.warning(f"   Current components: {current_comp_count} -> New components: {new_comp_count}")
                            raise HTTPException(
                                status_code=409,
                                detail="Deck was recently updated by AI. Please refresh the page to see changes."
                            )
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error checking for destructive update: {e}")

        
        # Always update last_modified
        update_data["last_modified"] = request.last_modified or datetime.utcnow().isoformat()
        
        # Update deck with retries to avoid transient HTTP/2/SSL failures
        supabase = get_supabase_client()
        from utils.supabase import perform_supabase_operation_with_retry
        result = perform_supabase_operation_with_retry(
            lambda: supabase.table("decks").update(update_data).eq("uuid", deck_uuid).execute(),
            description=f"update deck {deck_uuid}",
            max_attempts=3,
            timeout_seconds=8.0
        )
        
        if result.data:
            logger.debug(f"Deck {deck_uuid} updated by user {user['id']}")
            return result.data[0]
        else:
            raise HTTPException(status_code=400, detail="Failed to update deck")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update deck error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/decks/{deck_uuid}/associate")
async def associate_deck(deck_uuid: str, token: Optional[str] = Depends(get_auth_header)):
    """Associate a deck with the authenticated user"""
    try:
        auth_service = get_auth_service()
        
        # Get user from token directly
        user = auth_service.get_user_with_token(token) if token else None
        
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        association = auth_service.associate_deck_with_user(user["id"], deck_uuid)
        return {"association": association, "message": "Deck associated successfully"}
    except Exception as e:
        logger.error(f"Associate deck error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/decks/share")
async def share_deck(request: ShareDeckRequest, token: Optional[str] = Depends(get_auth_header)):
    """Share a deck with another user"""
    try:
        auth_service = get_auth_service()
        share = auth_service.share_deck(
            deck_uuid=request.deck_uuid,
            with_user_email=request.with_user_email,
            permissions=request.permissions
        )
        return {"share": share, "message": f"Deck shared with {request.with_user_email}"}
    except Exception as e:
        logger.error(f"Share deck error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/decks/{deck_uuid}/share/{user_id}")
async def revoke_deck_share(
    deck_uuid: str,
    user_id: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Revoke deck access for a user"""
    try:
        auth_service = get_auth_service()
        success = auth_service.revoke_deck_share(deck_uuid, user_id)
        
        if not success:
            raise HTTPException(status_code=400, detail="Could not revoke access")
        
        return {"message": "Access revoked successfully"}
    except Exception as e:
        logger.error(f"Revoke share error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/decks/{deck_uuid}")
async def delete_deck(
    deck_uuid: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Delete a deck by UUID"""
    try:
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token) if token else auth_service.get_user()
        
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Check if user owns the deck
        from utils.supabase import get_deck, get_supabase_client
        deck = get_deck(deck_uuid)
        
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        # Verify ownership
        if deck.get("user_id") != user["id"]:
            raise HTTPException(status_code=403, detail="You don't have permission to delete this deck")
        
        # Delete the deck
        supabase = get_supabase_client()
        
        # First, delete from user_decks table (associations)
        supabase.table("user_decks").delete().eq("deck_uuid", deck_uuid).execute()
        
        # Then delete the deck itself
        result = supabase.table("decks").delete().eq("uuid", deck_uuid).execute()
        
        if result.data:
            logger.info(f"Deck {deck_uuid} deleted by user {user['id']}")
            return {"message": "Deck deleted successfully", "deck_uuid": deck_uuid}
        else:
            raise HTTPException(status_code=400, detail="Could not delete deck")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete deck error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

# Password management endpoints
@router.post("/password/reset")
async def request_password_reset(email: EmailStr):
    """Request a password reset email"""
    try:
        auth_service = get_auth_service()
        success = auth_service.reset_password_request(email)
        
        if not success:
            raise HTTPException(status_code=400, detail="Could not send reset email")
        
        return {"message": "Password reset email sent"}
    except Exception as e:
        logger.error(f"Password reset request error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/password")
async def update_password(
    new_password: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Update the current user's password"""
    try:
        auth_service = get_auth_service()
        success = auth_service.update_password(new_password)
        
        if not success:
            raise HTTPException(status_code=400, detail="Could not update password")
        
        return {"message": "Password updated successfully"}
    except Exception as e:
        logger.error(f"Update password error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e)) 

@router.get("/debug/session")
async def debug_session(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Depends(get_auth_header)
):
    """Debug endpoint to check session status"""
    return {
        "has_auth_header": authorization is not None,
        "auth_header": authorization[:20] + "..." if authorization else None,
        "extracted_token": token[:20] + "..." if token else None,
        "token_length": len(token) if token else 0
    } 

@router.post("/validate-token")
async def validate_stored_token(token: Optional[str] = Depends(get_auth_header)):
    """
    Validate a stored token and return its status.
    This helps the frontend determine if it should clear stored credentials.
    """
    try:
        if not token:
            return {
                "valid": False,
                "reason": "No token provided",
                "should_clear_storage": False
            }
        
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token)
        
        if user:
            return {
                "valid": True,
                "user": {
                    "id": user["id"],
                    "email": user["email"]
                }
            }
        else:
            return {
                "valid": False,
                "reason": "Token is invalid or expired",
                "should_clear_storage": True
            }
            
    except Exception as e:
        logger.error(f"Token validation error: {str(e)}")
        return {
            "valid": False,
            "reason": "Token validation failed",
            "should_clear_storage": True
        }

# Google OAuth endpoints
@router.post("/google/signin", response_model=AuthResponse)
async def google_sign_in(request: GoogleSignInRequest):
    """Sign in with Google OAuth"""
    try:
        auth_service = get_auth_service()
        result = await auth_service.google_sign_in(request.credential)
        
        return AuthResponse(
            user=result["user"],
            session=result["session"],
            message="Google sign in successful"
        )
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Google sign in error: {error_msg}")
        
        if "User not found" in error_msg:
            raise HTTPException(status_code=404, detail="User not found. Please sign up first.")
        else:
            raise HTTPException(status_code=400, detail=str(e))

@router.post("/google/signup", response_model=AuthResponse)
async def google_sign_up(request: GoogleSignUpRequest):
    """Sign up with Google OAuth"""
    try:
        auth_service = get_auth_service()
        result = await auth_service.google_sign_up(request.credential)
        
        return AuthResponse(
            user=result["user"],
            session=result["session"],
            message="Google sign up successful"
        )
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Google sign up error: {error_msg}")
        
        if "User already exists" in error_msg:
            raise HTTPException(status_code=409, detail="User already exists. Please sign in instead.")
        else:
            raise HTTPException(status_code=400, detail=str(e))

# Magic Link endpoints
@router.post("/magic-link/send")
async def send_magic_link(request: MagicLinkSendRequest):
    """Send a magic link to user's email"""
    try:
        auth_service = get_auth_service()
        await auth_service.send_magic_link(request.email)
        
        return {
            "success": True,
            "message": "Magic link sent to your email"
        }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Send magic link error: {error_msg}")
        
        if "rate limit" in error_msg.lower():
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
        else:
            raise HTTPException(status_code=400, detail=str(e))

@router.post("/magic-link/verify", response_model=AuthResponse)
async def verify_magic_link(request: MagicLinkVerifyRequest):
    """Verify magic link token and sign in user"""
    try:
        auth_service = get_auth_service()
        result = await auth_service.verify_magic_link(request.token)
        
        return AuthResponse(
            user=result["user"],
            session=result["session"],
            message="Magic link verified successfully"
        )
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Verify magic link error: {error_msg}")
        
        if "expired" in error_msg.lower():
            raise HTTPException(status_code=400, detail="This magic link has expired. Please request a new one.")
        elif "already used" in error_msg.lower():
            raise HTTPException(status_code=400, detail="This magic link has already been used. Please request a new one.")
        elif "invalid" in error_msg.lower() or "not found" in error_msg.lower():
            raise HTTPException(status_code=400, detail="Invalid magic link. Please request a new one.")
        else:
            raise HTTPException(status_code=400, detail=str(e))

@router.post("/check-email", response_model=CheckEmailResponse)
async def check_email_exists(request: CheckEmailRequest):
    """Check if an email is already registered"""
    try:
        auth_service = get_auth_service()
        exists = await auth_service.check_email_exists(request.email)
        
        return CheckEmailResponse(exists=exists)
    except Exception as e:
        logger.error(f"Check email error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check email")

@router.get("/confirm")
async def confirm_email(
    token_hash: str = Query(..., description="Email confirmation token hash"),
    type: str = Query("signup", description="Confirmation type"),
    next: Optional[str] = Query("/", description="Redirect URL after confirmation")
):
    """
    Handle email confirmation from Supabase email links.
    This endpoint processes the confirmation and redirects to the frontend.
    """
    try:
        logger.info(f"Email confirmation request: type={type}, token_hash={token_hash[:10]}...")
        
        # Get Supabase URL and key
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        
        if not url or not key:
            logger.error("Missing Supabase configuration")
            raise HTTPException(status_code=500, detail="Server configuration error")
        
        # Verify the email confirmation token with Supabase
        headers = {
            "apikey": key,
            "Content-Type": "application/json"
        }
        
        # Exchange the token for a session
        verify_data = {
            "token_hash": token_hash,
            "type": type
        }
        
        verify_response = httpx.post(
            f"{url}/auth/v1/verify",
            headers=headers,
            json=verify_data,
            timeout=10.0
        )
        
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:8080")
        
        if verify_response.status_code == 200:
            # Email confirmed successfully
            session_data = verify_response.json()
            
            # Redirect to frontend with session tokens
            redirect_url = f"{frontend_url}/auth-callback"
            redirect_url += f"?access_token={session_data.get('access_token', '')}"
            redirect_url += f"&refresh_token={session_data.get('refresh_token', '')}"
            redirect_url += f"&expires_in={session_data.get('expires_in', 3600)}"
            redirect_url += f"&type=email_confirmation"
            redirect_url += f"&next={next}"
            
            logger.info(f"Email confirmed successfully, redirecting to frontend")
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=redirect_url, status_code=302)
        else:
            # Confirmation failed
            error_msg = verify_response.json().get("error_description", "Email confirmation failed")
            logger.error(f"Email confirmation failed: {error_msg}")
            
            # Redirect to frontend with error
            redirect_url = f"{frontend_url}/auth-callback"
            redirect_url += f"?error=confirmation_failed"
            redirect_url += f"&error_description={error_msg}"
            
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=redirect_url, status_code=302)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email confirmation error: {str(e)}", exc_info=True)
        
        # Redirect to frontend with error
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:8080")
        redirect_url = f"{frontend_url}/auth-callback"
        redirect_url += f"?error=server_error"
        redirect_url += f"&error_description=Email confirmation failed"
        
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url, status_code=302)

@router.get("/decks-optional")
async def get_user_decks_optional(
    token: Optional[str] = Depends(get_auth_header),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    filter: str = Query("owned", regex="^(owned|shared|all)$", description="Filter decks by ownership")
):
    """
    TEMPORARY: Get decks with optional authentication
    Returns empty list if not authenticated instead of 401 error
    """
    logger.debug(f"Getting user decks (optional auth) - Token present: {token is not None}")
    
    # If no token, return empty results
    if not token:
        logger.info("No token provided - returning empty deck list")
        return {
            "decks": [],
            "count": 0,
            "total": 0,
            "has_more": False,
            "limit": limit,
            "offset": offset,
            "filter": filter,
            "authenticated": False
        }
    
    try:
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token)
        
        if not user:
            logger.warning("Invalid token - returning empty deck list")
            return {
                "decks": [],
                "count": 0,
                "total": 0,
                "has_more": False,
                "limit": limit,
                "offset": offset,
                "filter": filter,
                "authenticated": False
            }
        
        # User is authenticated, get their decks
        result = auth_service.get_user_decks_filtered(
            user["id"], 
            filter_type=filter,
            limit=limit, 
            offset=offset
        )
        
        return {
            "decks": result.get("decks", []), 
            "count": len(result.get("decks", [])), 
            "total": result.get("total", 0),
            "has_more": result.get("has_more", False),
            "limit": limit,
            "offset": offset,
            "filter": filter,
            "authenticated": True
        }
    except Exception as e:
        logger.error(f"Get user decks (optional) error: {str(e)}", exc_info=True)
        # Return empty results on error
        return {
            "decks": [],
            "count": 0,
            "total": 0,
            "has_more": False,
            "limit": limit,
            "offset": offset,
            "filter": filter,
            "authenticated": False,
            "error": str(e)
        }

@router.get("/debug/headers")
async def debug_headers(
    request: Request,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Depends(get_auth_header)
):
    """Debug endpoint to check all headers being sent"""
    headers_dict = dict(request.headers)
    
    # Sanitize sensitive headers
    safe_headers = {}
    for key, value in headers_dict.items():
        if key.lower() in ['authorization', 'cookie']:
            # Only show partial values for sensitive headers
            safe_headers[key] = value[:20] + "..." if len(value) > 20 else value
        else:
            safe_headers[key] = value
    
    return {
        "all_headers": safe_headers,
        "authorization_header": authorization[:30] + "..." if authorization and len(authorization) > 30 else authorization,
        "extracted_token": token[:30] + "..." if token and len(token) > 30 else token,
        "token_present": token is not None,
        "auth_header_present": authorization is not None
    }

@router.post("/debug/deck-test")
async def debug_deck_test(request: Request):
    """Debug endpoint to test deck creation payload"""
    try:
        body = await request.json()
        
        # Try to validate with our model
        validation_errors = []
        try:
            CreateDeckRequest(**body)
            validation_status = "VALID"
        except ValidationError as e:
            validation_status = "INVALID"
            validation_errors = e.errors()
        
        return {
            "received_payload": body,
            "validation_status": validation_status,
            "validation_errors": validation_errors,
            "received_fields": list(body.keys()),
            "expected_fields": ["uuid", "name", "slides", "theme", "data", "outline", "version"],
            "required_fields": ["uuid", "name"]
        }
    except Exception as e:
        return {"error": str(e)}


# ============================================================================
# USER ONBOARDING STATE ENDPOINTS
# ============================================================================

class UserOnboardingStateResponse(BaseModel):
    welcome_shown: bool
    presentations_created: int
    show_ai_hints: bool  # True if presentations_created < 2
    tutorial_views_count: int  # Number of times tutorial has been shown (show if < 2)

class MarkWelcomeShownRequest(BaseModel):
    pass  # Empty body, just needs auth

@router.get("/user/onboarding-state", response_model=UserOnboardingStateResponse)
async def get_user_onboarding_state(token: Optional[str] = Depends(get_auth_header)):
    """Get user's onboarding state (welcome shown, presentation count, tutorial views)"""
    try:
        if not token:
            raise HTTPException(status_code=401, detail="Authentication required")

        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token)

        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = user["id"]
        supabase = auth_service.supabase

        # Ensure tutorial deck exists for this user (copies "How to Use Nextslide" deck if not present)
        try:
            auth_service._ensure_tutorial_deck_for_user(user_id)
        except Exception as e:
            logger.warning(f"Failed to ensure tutorial deck for user {user_id}: {e}")

        # Get user's onboarding state from users table
        response = supabase.table("users").select(
            "welcome_shown, presentations_created, tutorial_views_count"
        ).eq("id", user_id).execute()

        if not response.data:
            # User not found in users table, return defaults
            return UserOnboardingStateResponse(
                welcome_shown=False,
                presentations_created=0,
                show_ai_hints=True,
                tutorial_views_count=0
            )

        user_data = response.data[0]
        welcome_shown = user_data.get("welcome_shown", False) or False
        presentations_created = user_data.get("presentations_created", 0) or 0
        tutorial_views_count = user_data.get("tutorial_views_count", 0) or 0

        return UserOnboardingStateResponse(
            welcome_shown=welcome_shown,
            presentations_created=presentations_created,
            show_ai_hints=presentations_created < 2,
            tutorial_views_count=tutorial_views_count
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user onboarding state error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get onboarding state")


@router.post("/user/mark-welcome-shown")
async def mark_welcome_shown(token: Optional[str] = Depends(get_auth_header)):
    """Mark that the welcome message has been shown to the user"""
    try:
        if not token:
            raise HTTPException(status_code=401, detail="Authentication required")

        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token)

        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = user["id"]
        supabase = auth_service.supabase

        # Update user's welcome_shown flag
        response = supabase.table("users").update({
            "welcome_shown": True
        }).eq("id", user_id).execute()

        return {"success": True, "message": "Welcome shown flag updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Mark welcome shown error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update welcome shown flag")


@router.post("/user/increment-tutorial-views")
async def increment_tutorial_views(token: Optional[str] = Depends(get_auth_header)):
    """Increment the tutorial views count for the user (called when tutorial is shown)"""
    try:
        if not token:
            raise HTTPException(status_code=401, detail="Authentication required")

        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token)

        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = user["id"]
        supabase = auth_service.supabase

        # Get current count first
        response = supabase.table("users").select("tutorial_views_count").eq("id", user_id).execute()

        current_count = 0
        if response.data:
            current_count = response.data[0].get("tutorial_views_count", 0) or 0

        # Increment the count
        new_count = current_count + 1
        supabase.table("users").update({
            "tutorial_views_count": new_count
        }).eq("id", user_id).execute()

        return {"success": True, "tutorial_views_count": new_count}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Increment tutorial views error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to increment tutorial views")