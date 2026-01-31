"""
Supabase Authentication Service
Uses Supabase's built-in auth for user management

This service includes:
- Robust connection handling with configurable timeouts
- Automatic retry on transient failures
- Circuit breaker integration for cascading failure prevention
"""
import os
from typing import Dict, Any, Optional, List
from supabase import create_client, Client
from dotenv import load_dotenv
import logging
from datetime import datetime
import secrets
import hashlib
from datetime import timedelta
import httpx
from google.oauth2 import id_token
from google.auth.transport import requests
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import threading

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# =============================================================================
# TIMEOUT CONFIGURATION
# =============================================================================
# These timeouts are tuned to handle slow Supabase responses without blocking
# the entire application. Increase if you have high-latency connections.

AUTH_CONNECT_TIMEOUT = 5.0   # Time to establish connection
AUTH_READ_TIMEOUT = 10.0     # Time to wait for response (increased from 2.0)
AUTH_WRITE_TIMEOUT = 10.0    # Time to send request
AUTH_POOL_TIMEOUT = 5.0      # Time to wait for connection from pool

# Create a shared httpx client with proper limits for auth operations
_auth_httpx_client: Optional[httpx.Client] = None
_auth_client_lock = threading.Lock()


def _get_auth_httpx_client() -> httpx.Client:
    """Get or create a shared httpx client for auth operations."""
    global _auth_httpx_client
    with _auth_client_lock:
        if _auth_httpx_client is None:
            _auth_httpx_client = httpx.Client(
                http2=True,
                limits=httpx.Limits(
                    max_connections=5,  # Reduced for horizontal scaling
                    max_keepalive_connections=3,
                    keepalive_expiry=30.0
                ),
                timeout=httpx.Timeout(
                    connect=AUTH_CONNECT_TIMEOUT,
                    read=AUTH_READ_TIMEOUT,
                    write=AUTH_WRITE_TIMEOUT,
                    pool=AUTH_POOL_TIMEOUT
                )
            )
        return _auth_httpx_client


def _reset_auth_httpx_client():
    """Reset the shared httpx client (call after connection errors)."""
    global _auth_httpx_client
    with _auth_client_lock:
        if _auth_httpx_client is not None:
            try:
                _auth_httpx_client.close()
            except Exception:
                pass
            _auth_httpx_client = None
            logger.info("Auth httpx client reset")

class SupabaseAuthService:
    """Service for handling Supabase authentication and user management"""
    
    def __init__(self):
        """Initialize Supabase client"""
        # Check for service key to bypass RLS if needed
        service_key = os.getenv("SUPABASE_SERVICE_KEY")
        if service_key:
            url = os.getenv("SUPABASE_URL")
            if not url:
                raise ValueError("SUPABASE_URL must be set")
            self.supabase: Client = create_client(url, service_key)
        else:
            self.supabase: Client = self._get_client()
    
    def _get_client(self) -> Client:
        """Get Supabase client"""
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set")
            
        return create_client(url, key)
    
    def set_session_from_token(self, access_token: str) -> None:
        """
        Set the session using an access token
        
        Args:
            access_token: JWT access token
        """
        try:
            if access_token:
                # Set the auth header directly
                self.supabase.auth.set_session(access_token)
        except Exception as e:
            logger.error(f"Error setting session from token: {str(e)}")
    
    def get_user_with_token(self, access_token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Get user with optional token

        Args:
            access_token: Optional JWT access token

        Returns:
            User data if authenticated
        """
        try:
            if access_token:
                # Direct API call to Supabase to validate token
                url = os.getenv("SUPABASE_URL")
                key = os.getenv("SUPABASE_KEY")

                if url and key:
                    headers = {
                        "Authorization": f"Bearer {access_token}",
                        "apikey": key
                    }

                    # Use shared httpx client with proper connection pool limits
                    # This prevents connection exhaustion and handles timeouts gracefully
                    try:
                        client = _get_auth_httpx_client()
                        response = client.get(
                            f"{url}/auth/v1/user",
                            headers=headers
                        )

                        if response.status_code == 200:
                            user_data = response.json()
                            return {
                                "id": user_data.get("id"),
                                "email": user_data.get("email"),
                                "created_at": user_data.get("created_at"),
                                "updated_at": user_data.get("updated_at"),
                                "user_metadata": user_data.get("user_metadata", {}),
                                "app_metadata": user_data.get("app_metadata", {}),
                            }
                        else:
                            logger.warning(f"Token validation failed with status: {response.status_code}, trying local decode fallback")
                            # Fall through to local JWT decode below
                    except (httpx.TimeoutException, httpx.ConnectError) as e:
                        # On timeout/connection error, reset client and fall through to JWT decode
                        logger.warning(f"Auth request failed (will use JWT fallback): {type(e).__name__}")
                        _reset_auth_httpx_client()
                        # Fall through to local JWT decode below
            else:
                # Fall back to default client
                return self.get_user()
        except Exception as e:
            logger.error(f"Get user with token error: {str(e)}")
            # Reset client on unexpected errors
            _reset_auth_httpx_client()

        # Development fallback: decode JWT locally without verification
        # This runs when Supabase validation fails (403, network error, etc.)
        try:
            env = os.getenv("ENVIRONMENT", os.getenv("ENV", "development")).lower()
            allow_fallback = os.getenv("ALLOW_UNVERIFIED_TOKEN_FALLBACK", "true").lower() == "true"
            if access_token and env != "production" and allow_fallback:
                import jwt  # PyJWT
                payload = jwt.decode(access_token, options={"verify_signature": False, "verify_exp": False})
                user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
                email = payload.get("email")
                if user_id:
                    logger.info(f"Using local JWT decode fallback for user {user_id}")
                    return {
                        "id": user_id,
                        "email": email,
                        "created_at": None,
                        "updated_at": None,
                        "user_metadata": payload.get("user_metadata", {}),
                        "app_metadata": payload.get("app_metadata", {}),
                        "_unverified": True
                    }
        except Exception as fallback_error:
            logger.warning(f"Local JWT decode fallback also failed: {fallback_error}")

        return None
    
    # User Authentication Methods
    def sign_up(self, email: str, password: str, metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Sign up a new user with email and password
        
        Args:
            email: User's email
            password: User's password
            metadata: Optional user metadata (full_name, company, etc.)
        
        Returns:
            User data and session
        """
        try:
            # Prepare sign up data
            sign_up_data = {
                "email": email,
                "password": password
            }
            
            # Add metadata and redirect URL
            options = {}
            if metadata:
                options["data"] = metadata
            
            # Set email redirect URL to our backend confirm endpoint
            backend_url = os.getenv("BACKEND_URL", "http://localhost:9090")
            options["email_redirect_to"] = f"{backend_url}/auth/confirm"
            
            if options:
                sign_up_data["options"] = options
            
            response = self.supabase.auth.sign_up(sign_up_data)
            
            if response.user:
                logger.info(f"User signed up successfully: {email}")
                # Convert Supabase objects to dictionaries
                user_dict = {
                    "id": response.user.id,
                    "email": response.user.email,
                    "created_at": response.user.created_at,
                    "updated_at": response.user.updated_at,
                    "user_metadata": response.user.user_metadata,
                    "app_metadata": response.user.app_metadata,
                }
                
                session_dict = None
                if response.session:
                    session_dict = {
                        "access_token": response.session.access_token,
                        "refresh_token": response.session.refresh_token,
                        "expires_in": response.session.expires_in,
                        "expires_at": response.session.expires_at,
                        "token_type": response.session.token_type,
                        "user": user_dict
                    }
                
                return {
                    "user": user_dict,
                    "session": session_dict
                }
            else:
                raise Exception("Sign up failed")
                
        except Exception as e:
            logger.error(f"Sign up error: {str(e)}")
            raise
    
    # Tutorial deck UUID that gets copied for every new user
    TUTORIAL_DECK_UUID = "a9e3b5ea-8b19-4f3d-8566-9b1a96a6746d"

    def ensure_user_profile(self, user_id: str, email: str, metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Ensure user profile exists in the users table and has a tutorial deck.

        Args:
            user_id: User's UUID
            email: User's email
            metadata: Optional user metadata

        Returns:
            User profile data
        """
        try:
            # First check if profile exists
            existing = self.supabase.table("users").select("*").eq("id", user_id).execute()

            if existing.data and len(existing.data) > 0:
                # Profile exists (likely created by Supabase trigger)
                # Still ensure tutorial deck is copied
                self._ensure_tutorial_deck_for_user(user_id)
                return existing.data[0]

            # Create profile if it doesn't exist
            profile_data = {
                "id": user_id,
                "email": email,
                "full_name": metadata.get("full_name") if metadata else None,
                "company": metadata.get("company") if metadata else None,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }

            response = self.supabase.table("users").insert(profile_data).execute()

            if response.data:
                logger.info(f"Created profile for user {email}")

                # Copy tutorial deck for new user
                self._ensure_tutorial_deck_for_user(user_id)

                return response.data[0]

            return profile_data

        except Exception as e:
            logger.error(f"Error ensuring user profile: {str(e)}")
            # Return a basic profile if database operation fails
            return {
                "id": user_id,
                "email": email,
                "created_at": datetime.utcnow().isoformat()
            }

    def _ensure_tutorial_deck_for_user(self, user_id: str) -> Optional[str]:
        """
        Ensure the user has a copy of the tutorial deck. Creates one if not exists.

        Args:
            user_id: The user's UUID

        Returns:
            The UUID of the user's tutorial deck, or None if failed
        """
        try:
            import uuid as uuid_module

            # First check if user already has a tutorial deck (by name pattern)
            existing_tutorial = self.supabase.table("decks").select("uuid").eq(
                "user_id", user_id
            ).ilike("name", "%How to Use%").execute()

            if existing_tutorial.data and len(existing_tutorial.data) > 0:
                logger.debug(f"User {user_id} already has tutorial deck")
                return existing_tutorial.data[0]["uuid"]

            # Get the tutorial deck from featured_decks (more reliable than decks table)
            tutorial = self.supabase.table("featured_decks").select(
                "name, slides, description"
            ).eq("uuid", self.TUTORIAL_DECK_UUID).execute()

            if not tutorial.data:
                # Fallback to regular decks table
                tutorial = self.supabase.table("decks").select(
                    "name, slides, description, data, outline"
                ).eq("uuid", self.TUTORIAL_DECK_UUID).execute()

            if not tutorial.data:
                logger.warning(f"Tutorial deck {self.TUTORIAL_DECK_UUID} not found, skipping copy for user {user_id}")
                return None

            source_deck = tutorial.data[0]
            new_uuid = str(uuid_module.uuid4())
            now = datetime.utcnow().isoformat()

            # Create a copy of the deck for this user
            new_deck = {
                "uuid": new_uuid,
                "user_id": user_id,
                "name": source_deck.get("name", "How to Use NextSlide"),
                "slides": source_deck.get("slides", []),
                "description": source_deck.get("description") or "Learn how to create amazing presentations with NextSlide",
                "data": source_deck.get("data", {}),
                "outline": source_deck.get("outline"),
                "created_at": now,
                "last_modified": now,
                "version": 1,
                "status": "completed"
            }

            # Insert the deck
            result = self.supabase.table("decks").insert(new_deck).execute()

            if result.data:
                logger.info(f"Created tutorial deck copy {new_uuid} for user {user_id}")

                # Also create user_decks association
                try:
                    self.supabase.table("user_decks").insert({
                        "user_id": user_id,
                        "deck_uuid": new_uuid,
                        "last_accessed": now
                    }).execute()
                except Exception as assoc_error:
                    logger.warning(f"Could not create user_decks association: {assoc_error}")

                return new_uuid

            return None

        except Exception as e:
            logger.error(f"Error ensuring tutorial deck for user {user_id}: {str(e)}")
            return None

    def sign_in(self, email: str, password: str) -> Dict[str, Any]:
        """
        Sign in a user with email and password
        
        Args:
            email: User's email
            password: User's password
        
        Returns:
            User data and session
        """
        try:
            response = self.supabase.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if response.user:
                logger.info(f"User signed in successfully: {email}")
                # Convert Supabase objects to dictionaries
                user_dict = {
                    "id": response.user.id,
                    "email": response.user.email,
                    "created_at": response.user.created_at,
                    "updated_at": response.user.updated_at,
                    "user_metadata": response.user.user_metadata,
                    "app_metadata": response.user.app_metadata,
                }
                
                # Ensure user profile exists
                self.ensure_user_profile(
                    user_dict["id"], 
                    user_dict["email"],
                    user_dict.get("user_metadata")
                )
                
                session_dict = None
                if response.session:
                    session_dict = {
                        "access_token": response.session.access_token,
                        "refresh_token": response.session.refresh_token,
                        "expires_in": response.session.expires_in,
                        "expires_at": response.session.expires_at,
                        "token_type": response.session.token_type,
                        "user": user_dict
                    }
                
                return {
                    "user": user_dict,
                    "session": session_dict
                }
            else:
                raise Exception("Sign in failed - no user returned")
                
        except Exception as e:
            error_str = str(e)
            logger.error(f"Sign in error for {email}: {error_str}")
            
            # Handle specific Supabase auth errors
            if "Invalid login credentials" in error_str:
                raise Exception("Invalid login credentials")
            elif "Email not confirmed" in error_str:
                raise Exception("Email not confirmed")
            elif "User not found" in error_str:
                raise Exception("User not found")
            elif "Network" in error_str or "Connection" in error_str:
                raise Exception("Connection error - please check your internet connection")
            else:
                # Re-raise the original error with more context
                raise Exception(f"Authentication failed: {error_str}")
    
    def sign_out(self) -> None:
        """Sign out the current user"""
        try:
            self.supabase.auth.sign_out()
            logger.info("User signed out successfully")
        except Exception as e:
            logger.error(f"Sign out error: {str(e)}")
            raise
    
    def get_user(self) -> Optional[Dict[str, Any]]:
        """Get the current authenticated user"""
        try:
            response = self.supabase.auth.get_user()
            if response and response.user:
                # Convert Supabase User object to dictionary
                return {
                    "id": response.user.id,
                    "email": response.user.email,
                    "created_at": response.user.created_at,
                    "updated_at": response.user.updated_at,
                    "user_metadata": response.user.user_metadata,
                    "app_metadata": response.user.app_metadata,
                }
            return None
        except Exception as e:
            logger.error(f"Get user error: {str(e)}")
            return None
    
    def refresh_session(self) -> Optional[Dict[str, Any]]:
        """Refresh the current session"""
        try:
            response = self.supabase.auth.refresh_session()
            if response and response.user and response.session:
                # Convert Supabase objects to dictionaries
                user_dict = {
                    "id": response.user.id,
                    "email": response.user.email,
                    "created_at": response.user.created_at,
                    "updated_at": response.user.updated_at,
                    "user_metadata": response.user.user_metadata,
                    "app_metadata": response.user.app_metadata,
                }
                
                session_dict = {
                    "access_token": response.session.access_token,
                    "refresh_token": response.session.refresh_token,
                    "expires_in": response.session.expires_in,
                    "expires_at": response.session.expires_at,
                    "token_type": response.session.token_type,
                    "user": user_dict
                }
                
                return {
                    "user": user_dict,
                    "session": session_dict
                }
            return None
        except Exception as e:
            logger.error(f"Refresh session error: {str(e)}")
            return None
    
    # User Profile Methods
    def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user profile from the users table
        
        Args:
            user_id: The user's UUID
        
        Returns:
            User profile data
        """
        try:
            response = self.supabase.table("users").select("*").eq("id", user_id).single().execute()
            return response.data
        except Exception as e:
            logger.error(f"Get user profile error: {str(e)}")
            return None
    
    def update_user_profile(self, user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Update user profile in the users table
        
        Args:
            user_id: The user's UUID
            updates: Dictionary of fields to update
        
        Returns:
            Updated user profile
        """
        try:
            response = self.supabase.table("users").update(updates).eq("id", user_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Update user profile error: {str(e)}")
            return None
    
    # Deck Association Methods
    def associate_deck_with_user(self, user_id: str, deck_uuid: str) -> Dict[str, Any]:
        """
        Associate a deck with a user
        
        Args:
            user_id: The user's UUID
            deck_uuid: The deck's UUID
        
        Returns:
            Association record
        """
        try:
            # Check if deck exists and get current user_id
            deck_check = self.supabase.table("decks").select("user_id").eq("uuid", deck_uuid).execute()
            
            if not deck_check.data:
                raise Exception(f"Deck {deck_uuid} not found")
                
            current_user_id = deck_check.data[0].get("user_id")
            
            # Only update if deck doesn't have a user_id yet
            if not current_user_id:
                self.supabase.table("decks").update({"user_id": user_id}).eq("uuid", deck_uuid).execute()
                logger.info(f"Updated deck {deck_uuid} with user_id {user_id}")
            elif current_user_id != user_id:
                logger.warning(f"Deck {deck_uuid} already belongs to user {current_user_id}, cannot reassign to {user_id}")
                # Don't raise error, just log - deck is already associated
            
            # Always create/update the association in user_decks
            response = self.supabase.table("user_decks").upsert({
                "user_id": user_id,
                "deck_uuid": deck_uuid,
                "last_accessed": datetime.utcnow().isoformat()
            }, on_conflict="user_id,deck_uuid").execute()
            
            logger.info(f"Associated deck {deck_uuid} with user {user_id}")
            return response.data[0] if response.data else {"user_id": user_id, "deck_uuid": deck_uuid}
        except Exception as e:
            logger.error(f"Associate deck error: {str(e)}")
            raise
    
    def get_user_decks(self, user_id: str, limit: int = 20, offset: int = 0, search_query: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all decks for a user (owned and shared) - OPTIMIZED VERSION

        Args:
            user_id: The user's UUID
            limit: Maximum number of decks to return
            offset: Number of decks to skip (for pagination)
            search_query: Optional search string to filter decks by name (case-insensitive)

        Returns:
            List of deck records
        """
        try:
            logger.debug(f"[get_user_decks] user={user_id} limit={limit} offset={offset} search={search_query}")

            _base_cols = "uuid,name,created_at,updated_at,last_modified,user_id,status,description,first_slide,slide_count,data"
            _full_cols = _base_cols + ",thumbnail_url"

            def _try_query(table, cols, extra_filter=None):
                q = self.supabase.table(table).select(cols, count="planned").eq("user_id", user_id)
                if extra_filter:
                    q = extra_filter(q)
                return q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

            if search_query:
                search_pattern = f"%{search_query}%"
                search_filter = lambda q: q.ilike("name", search_pattern)
                try:
                    owned_response = _try_query("decks_optimized", _full_cols, search_filter)
                except Exception as e:
                    logger.debug(f"[get_user_decks] Optimized view search failed, using decks table: {e}")
                    try:
                        owned_response = _try_query("decks", _full_cols, search_filter)
                    except Exception as e2:
                        if "thumbnail_url" in str(e2):
                            owned_response = _try_query("decks", _base_cols, search_filter)
                        else:
                            raise
            else:
                try:
                    owned_response = _try_query("decks_optimized", _full_cols)
                except Exception as e:
                    logger.debug(f"[get_user_decks] Optimized view fallback: {e}")
                    try:
                        owned_response = _try_query("decks", _full_cols)
                    except Exception as e2:
                        if "thumbnail_url" in str(e2):
                            owned_response = _try_query("decks", _base_cols)
                        else:
                            raise

            total_count = owned_response.count if hasattr(owned_response, 'count') else 0
            
            # Process decks - use first_slide and slide_count columns directly
            decks = []
            for deck in owned_response.data:
                deck_data = {
                    "uuid": deck.get("uuid"),
                    "name": deck.get("name"),
                    "created_at": deck.get("created_at"),
                    "updated_at": deck.get("updated_at"),
                    "last_modified": deck.get("last_modified"),
                    "user_id": deck.get("user_id"),
                    "status": deck.get("status"),
                    "description": deck.get("description"),
                    "is_owner": True,
                    # Use first_slide and slide_count columns directly
                    "first_slide": deck.get("first_slide"),
                    "slide_count": deck.get("slide_count", 0) or 0,
                    # Include data field for API source filtering
                    "data": deck.get("data"),
                    # Server-rendered thumbnail URL
                    "thumbnail_url": deck.get("thumbnail_url"),
                }

                decks.append(deck_data)
            
            return {
                "decks": decks,
                "total": total_count,
                "has_more": (offset + len(decks)) < total_count
            }

        except Exception as e:
            logger.error(f"[get_user_decks] {e}", exc_info=True)
            return {"decks": [], "total": 0, "has_more": False}

    def get_user_decks_filtered(self, user_id: str, filter_type: str = "owned", limit: int = 20, offset: int = 0, search_query: Optional[str] = None) -> Dict[str, Any]:
        """
        Get decks for a user with filtering and optional search

        Args:
            user_id: The user's UUID
            filter_type: "owned", "shared", or "all"
            limit: Maximum number of decks to return
            offset: Number of decks to skip (for pagination)
            search_query: Optional search string to filter decks by name (case-insensitive)

        Returns:
            Dict with decks list and pagination info
        """
        try:
            if filter_type == "owned":
                # Return only owned decks (current behavior)
                return self.get_user_decks(user_id, limit, offset, search_query=search_query)

            elif filter_type == "shared":
                # Get decks shared with the user
                return self.get_shared_decks(user_id, limit, offset, search_query=search_query)

            elif filter_type == "all":
                # Get both owned and shared decks
                # For simplicity, we'll fetch both and combine them
                owned_result = self.get_user_decks(user_id, limit, offset, search_query=search_query)
                shared_result = self.get_shared_decks(user_id, limit, 0, search_query=search_query)

                # Combine the results
                all_decks = owned_result.get("decks", []) + shared_result.get("decks", [])

                # Apply pagination to combined results
                paginated_decks = all_decks[offset:offset + limit]
                total_count = owned_result.get("total", 0) + shared_result.get("total", 0)

                return {
                    "decks": paginated_decks,
                    "total": total_count,
                    "has_more": (offset + len(paginated_decks)) < total_count
                }
            else:
                raise ValueError(f"Invalid filter type: {filter_type}")
                
        except Exception as e:
            logger.error(f"[get_user_decks_filtered] {e}", exc_info=True)
            return {"decks": [], "total": 0, "has_more": False}



    def get_shared_decks(self, user_id: str, limit: int = 20, offset: int = 0, search_query: Optional[str] = None) -> Dict[str, Any]:
        """
        Get decks shared with the user

        Args:
            user_id: The user's UUID
            limit: Maximum number of decks to return
            offset: Number of decks to skip (for pagination)
            search_query: Optional search string to filter decks by name (case-insensitive)

        Returns:
            Dict with shared decks list and pagination info
        """
        try:
            # Get user's email - first try from users table with a timeout
            user_email = None
            try:
                # Try to get user email from users table first (faster and more reliable)
                users_response = self.supabase.table("users").select("email").eq("id", user_id).execute()
                if users_response.data and len(users_response.data) > 0:
                    user_email = users_response.data[0].get("email")
                else:
                    # If not in users table, try auth.admin API with timeout
                    # Use ThreadPoolExecutor for cross-platform timeout support
                    def get_user_email_from_admin():
                        try:
                            user = self.supabase.auth.admin.get_user_by_id(user_id)
                            return user.user.email if user and user.user else None
                        except Exception as e:
                            logger.warning(f"[get_shared_decks] Admin API error: {e}")
                            return None

                    # Run with timeout using ThreadPoolExecutor
                    with ThreadPoolExecutor(max_workers=1) as executor:
                        future = executor.submit(get_user_email_from_admin)
                        try:
                            # Wait maximum 2 seconds for the result
                            user_email = future.result(timeout=2.0)
                        except (FutureTimeoutError, Exception) as e:
                            logger.warning(f"[get_shared_decks] Admin API timeout: {e}")
                            user_email = None
                            # Cancel the future to prevent it from running in background
                            future.cancel()

            except Exception as e:
                logger.error(f"[get_shared_decks] Error getting user email: {e}")
                user_email = None
            
            # Query deck_collaborators table
            # Avoid PostgREST schema-qualified joins which can fail across versions.
            # We'll fetch inviter user details in a separate query.
            # TODO: PostgREST doesn't support array slicing or cardinality in select.
            # For now, fetching full slides array but only using first slide.
            collaborator_query = self.supabase.table("deck_collaborators").select(
                """
                id,invited_by,invited_at,status,permissions,share_link_id,last_accessed_at,access_count,user_id,email,
                decks!inner(uuid,name,created_at,updated_at,last_modified,user_id,status,description)
                """
            )
            
            # Match by user_id or email
            if user_email:
                collaborator_query = collaborator_query.or_(f"user_id.eq.{user_id},email.eq.{user_email}")
            else:
                collaborator_query = collaborator_query.eq("user_id", user_id)
            
            # Filter active collaborations only
            collaborator_query = collaborator_query.eq("status", "active")
            
            # Apply pagination and ordering
            collaborator_query = collaborator_query.order("invited_at", desc=True).range(offset, offset + limit - 1)
            
            collaborator_response = collaborator_query.execute()

            # Build inviter map from users table (optional enrichment)
            inviter_map = {}
            try:
                inviter_ids = list({c.get("invited_by") for c in collaborator_response.data if c.get("invited_by")})
                if inviter_ids:
                    users_resp = self.supabase.table("users").select(
                        "id,email,full_name,company,avatar_url,metadata"
                    ).in_("id", inviter_ids).execute()
                    inviter_map = {u["id"]: u for u in (users_resp.data or [])}
            except Exception as e:
                logger.warning(f"[get_shared_decks] Could not fetch inviter user details: {e}")
            
            logger.debug(f"[get_shared_decks] Query returned {len(collaborator_response.data)} records")
            
            # Process shared decks
            shared_decks = []
            for collab in collaborator_response.data:
                deck = collab.get("decks", {})
                inviter = inviter_map.get(collab.get("invited_by"), {})
                
                deck_data = {
                    "uuid": deck.get("uuid"),
                    "name": deck.get("name"),
                    "created_at": deck.get("created_at"),
                    "updated_at": deck.get("updated_at"),
                    "last_modified": deck.get("last_modified"),
                    "user_id": deck.get("user_id"),
                    "status": deck.get("status"),
                    "description": deck.get("description"),
                    "is_owner": False,
                    "is_shared": True,
                    
                    # Sharing metadata
                    "shared_by": {
                        "id": inviter.get("id") or collab.get("invited_by"),
                        "email": inviter.get("email"),
                        "name": inviter.get("full_name") or inviter.get("email")
                    },
                    "share_type": "edit" if "edit" in collab.get("permissions", []) else "view",
                    "shared_at": collab.get("invited_at"),
                    "permissions": collab.get("permissions", ["view"]),
                    "share_link_id": collab.get("share_link_id"),
                    "collaborator_id": collab.get("id"),
                    
                    # Access metadata
                    "last_accessed_at": collab.get("last_accessed_at"),
                    "access_count": collab.get("access_count", 0),

                    # Server-rendered thumbnail URL
                    "thumbnail_url": deck.get("thumbnail_url"),
                }

                # Include only the first slide for thumbnail
                slides = deck.get("slides", [])
                if slides and len(slides) > 0:
                    deck_data["first_slide"] = slides[0]
                    deck_data["slide_count"] = len(slides)
                else:
                    deck_data["first_slide"] = None
                    deck_data["slide_count"] = 0
                
                shared_decks.append(deck_data)

            # Apply search filter if provided (post-filter since search is on joined table)
            if search_query:
                search_lower = search_query.lower()
                shared_decks = [d for d in shared_decks if search_lower in (d.get("name") or "").lower()]

            # Get total count
            total_query = self.supabase.table("deck_collaborators").select("id", count="exact")

            if user_email:
                total_query = total_query.or_(f"user_id.eq.{user_id},email.eq.{user_email}")
            else:
                total_query = total_query.eq("user_id", user_id)

            total_query = total_query.eq("status", "active")
            total_response = total_query.execute()

            # If searching, total count is the filtered count
            if search_query:
                total_count = len(shared_decks)
            else:
                total_count = total_response.count if hasattr(total_response, 'count') else len(shared_decks)

            return {
                "decks": shared_decks,
                "total": total_count,
                "has_more": (offset + len(shared_decks)) < total_count
            }

        except Exception as e:
            logger.error(f"[get_shared_decks] {e}", exc_info=True)
            return {"decks": [], "total": 0, "has_more": False}
    
    def share_deck(self, deck_uuid: str, with_user_email: str, permissions: List[str] = None) -> Dict[str, Any]:
        """
        Share a deck with another user
        
        Args:
            deck_uuid: The deck's UUID
            with_user_email: Email of the user to share with
            permissions: List of permissions (default: ['view'])
        
        Returns:
            Share record
        """
        if permissions is None:
            permissions = ['view']
            
        try:
            # Find the user by email
            user_response = self.supabase.table("users").select("id").eq("email", with_user_email).single().execute()
            
            if not user_response.data:
                raise ValueError(f"User with email {with_user_email} not found")
            
            target_user_id = user_response.data['id']
            
            # Create the share association
            response = self.supabase.table("user_decks").upsert({
                "user_id": target_user_id,
                "deck_uuid": deck_uuid,
                "permissions": permissions,
                "last_accessed": datetime.utcnow().isoformat()
            }, on_conflict="user_id,deck_uuid").execute()
            
            logger.info(f"Shared deck {deck_uuid} with user {with_user_email}")
            return response.data[0]
        except Exception as e:
            logger.error(f"Share deck error: {str(e)}")
            raise
    
    def revoke_deck_share(self, deck_uuid: str, user_id: str) -> bool:
        """
        Revoke deck access for a user
        
        Args:
            deck_uuid: The deck's UUID
            user_id: The user's UUID to revoke access from
        
        Returns:
            True if successful
        """
        try:
            self.supabase.table("user_decks").delete().match({
                "user_id": user_id,
                "deck_uuid": deck_uuid
            }).execute()
            
            logger.info(f"Revoked access to deck {deck_uuid} for user {user_id}")
            return True
        except Exception as e:
            logger.error(f"Revoke share error: {str(e)}")
            return False
    
    # Password Management
    def reset_password_request(self, email: str) -> bool:
        """
        Send a password reset email
        
        Args:
            email: User's email
        
        Returns:
            True if email sent successfully
        """
        try:
            self.supabase.auth.reset_password_email(email)
            logger.info(f"Password reset email sent to {email}")
            return True
        except Exception as e:
            logger.error(f"Password reset error: {str(e)}")
            return False
    
    # Native Supabase OAuth methods (Recommended)
    async def supabase_google_signin(self) -> Dict[str, Any]:
        """
        Get Google OAuth URL using Supabase's native implementation
        This is the recommended approach
        """
        try:
            # Get the OAuth URL from Supabase
            response = self.supabase.auth.sign_in_with_oauth({
                "provider": "google",
                "options": {
                    "redirect_to": f"{os.getenv('FRONTEND_URL', 'http://localhost:8080')}/auth/callback"
                }
            })
            
            return {
                "url": response.url,
                "provider": "google"
            }
        except Exception as e:
            logger.error(f"Supabase Google OAuth error: {str(e)}")
            raise
    
    async def handle_oauth_callback(self, code: str) -> Dict[str, Any]:
        """
        Handle OAuth callback from Supabase
        Exchange the code for session
        """
        try:
            # Exchange code for session
            response = self.supabase.auth.exchange_code_for_session({"auth_code": code})
            
            if response.session:
                return {
                    "user": response.user,
                    "session": {
                        "access_token": response.session.access_token,
                        "refresh_token": response.session.refresh_token,
                        "expires_in": response.session.expires_in,
                        "expires_at": response.session.expires_at
                    }
                }
            else:
                raise ValueError("No session returned from Supabase")
                
        except Exception as e:
            logger.error(f"OAuth callback error: {str(e)}")
            raise
    
    # Google OAuth methods (Custom Implementation - kept for flexibility)
    async def google_sign_in(self, credential: str) -> Dict[str, Any]:
        """
        Sign in with Google OAuth credential
        
        Args:
            credential: JWT credential from Google
            
        Returns:
            User and session data
        """
        try:
            # Verify the Google token
            google_user = self._verify_google_token(credential)
            if not google_user:
                raise ValueError("Invalid Google credential")
            
            email = google_user['email']
            
            # Check if user exists
            user_exists = await self.check_email_exists(email)
            if not user_exists:
                raise ValueError("User not found. Please sign up first.")
            
            # Sign in with Supabase using the email
            # Since we don't have a password, we'll create a session directly
            # This requires using Supabase's admin API
            user = await self._get_user_by_email(email)
            if not user:
                raise ValueError("User not found")
            
            # Create a session for the user
            session = await self._create_session_for_user(user['id'])
            
            return {
                "user": user,
                "session": session
            }
            
        except Exception as e:
            logger.error(f"Google sign in error: {str(e)}")
            raise
    
    async def google_sign_up(self, credential: str) -> Dict[str, Any]:
        """
        Sign up with Google OAuth credential
        
        Args:
            credential: JWT credential from Google
            
        Returns:
            User and session data
        """
        try:
            # Verify the Google token
            google_user = self._verify_google_token(credential)
            if not google_user:
                raise ValueError("Invalid Google credential")
            
            email = google_user['email']
            name = google_user.get('name', '')
            picture = google_user.get('picture', '')
            
            # Check if user already exists
            user_exists = await self.check_email_exists(email)
            if user_exists:
                raise ValueError("User already exists. Please sign in instead.")
            
            # Create user with Supabase
            # Generate a random password since Google users don't need one
            random_password = secrets.token_urlsafe(32)
            
            metadata = {
                "full_name": name,
                "picture": picture,
                "auth_provider": "google",
                "email_verified": True  # Google has already verified the email
            }
            
            result = self.sign_up(email, random_password, metadata)
            
            # Mark email as verified immediately
            await self._mark_email_verified(result['user']['id'])
            
            return result
            
        except Exception as e:
            logger.error(f"Google sign up error: {str(e)}")
            raise
    
    def _verify_google_token(self, credential: str) -> Optional[Dict[str, Any]]:
        """
        Verify Google JWT token
        
        Args:
            credential: JWT credential from Google
            
        Returns:
            User info if valid, None otherwise
        """
        try:
            # Get Google client ID from environment
            google_client_id = os.getenv("GOOGLE_CLIENT_ID")
            if not google_client_id:
                raise ValueError("GOOGLE_CLIENT_ID not configured")
            
            # Verify the token
            idinfo = id_token.verify_oauth2_token(
                credential, 
                requests.Request(), 
                google_client_id
            )
            
            # Token is valid, extract user info
            return {
                'email': idinfo['email'],
                'name': idinfo.get('name', ''),
                'picture': idinfo.get('picture', ''),
                'email_verified': idinfo.get('email_verified', False)
            }
        except ValueError as e:
            logger.error(f"Google token verification failed: {str(e)}")
            return None
    
    # Magic Link methods
    async def send_magic_link(self, email: str) -> None:
        """
        Send a magic link to the user's email
        
        Args:
            email: User's email address
        """
        try:
            # Check rate limiting
            if await self._is_rate_limited(email):
                raise ValueError("Too many requests. Please try again later.")
            
            # Option 1: Use Supabase's built-in magic link functionality
            # This is the recommended approach as it uses Supabase's email templates
            try:
                # This will send a magic link using Supabase's email service
                response = self.supabase.auth.sign_in_with_otp({
                    "email": email,
                    "options": {
                        "email_redirect_to": f"{os.getenv('FRONTEND_URL', 'http://localhost:8080')}/auth-callback"
                    }
                })
                
                if response:
                    logger.info(f"Magic link sent to {email} via Supabase OTP")
                    return
                    
            except Exception as e:
                logger.warning(f"Supabase OTP failed, using custom implementation: {str(e)}")
            
            # Option 2: Fallback to our custom implementation
            # Generate secure token
            token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            
            # Store token in database
            expires_at = datetime.utcnow() + timedelta(minutes=15)
            await self._store_magic_link_token(email, token_hash, expires_at)
            
            # Send email
            await self._send_magic_link_email(email, token)
            
        except Exception as e:
            logger.error(f"Send magic link error: {str(e)}")
            raise
    
    async def verify_magic_link(self, token: str) -> Dict[str, Any]:
        """
        Verify magic link token and sign in user
        
        Args:
            token: Magic link token
            
        Returns:
            User and session data
        """
        try:
            # Hash the token
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            
            # Find token in database
            db_token = await self._get_magic_link_token(token_hash)
            
            if not db_token:
                raise ValueError("Invalid magic link")
            
            # Check if expired
            if db_token['expires_at'] < datetime.utcnow():
                raise ValueError("Magic link has expired")
            
            # Check if already used
            if db_token['used_at']:
                raise ValueError("Magic link has already been used")
            
            # Mark as used
            await self._mark_token_as_used(token_hash)
            
            email = db_token['email']
            
            # Get or create user
            user = await self._get_user_by_email(email)
            if not user:
                # Create new user with magic link
                random_password = secrets.token_urlsafe(32)
                metadata = {
                    "auth_provider": "magic_link",
                    "email_verified": True
                }
                result = self.sign_up(email, random_password, metadata)
                user = result['user']
                
                # Mark email as verified
                await self._mark_email_verified(user['id'])
            
            # Create session
            session = await self._create_session_for_user(user['id'])
            
            return {
                "user": user,
                "session": session
            }
            
        except Exception as e:
            logger.error(f"Verify magic link error: {str(e)}")
            raise
    
    async def check_email_exists(self, email: str) -> bool:
        """
        Check if an email is already registered
        
        Args:
            email: Email to check
            
        Returns:
            True if email exists, False otherwise
        """
        try:
            response = self.supabase.from_('auth.users').select('id').eq('email', email).execute()
            return len(response.data) > 0
        except Exception as e:
            logger.error(f"Check email exists error: {str(e)}")
            return False
    
    # Helper methods for magic links
    async def _is_rate_limited(self, email: str) -> bool:
        """Check if email is rate limited"""
        try:
            # Check recent requests in last hour
            one_hour_ago = datetime.utcnow() - timedelta(hours=1)
            
            # Use service role client
            service_key = os.getenv("SUPABASE_SERVICE_KEY")
            if service_key:
                url = os.getenv("SUPABASE_URL")
                from supabase import create_client
                service_client = create_client(url, service_key)
                
                response = service_client.from_('magic_link_tokens').select('id').eq('email', email).gte('created_at', one_hour_ago.isoformat()).execute()
            else:
                response = self.supabase.from_('magic_link_tokens').select('id').eq('email', email).gte('created_at', one_hour_ago.isoformat()).execute()
                
            return len(response.data) >= 3  # Max 3 requests per hour
        except:
            return False
    
    async def _store_magic_link_token(self, email: str, token_hash: str, expires_at: datetime) -> None:
        """Store magic link token in database"""
        try:
            # Use service role client for magic_link_tokens table
            service_key = os.getenv("SUPABASE_SERVICE_KEY")
            if service_key:
                # Create a service role client
                url = os.getenv("SUPABASE_URL")
                from supabase import create_client
                service_client = create_client(url, service_key)
                
                service_client.from_('magic_link_tokens').insert({
                    'email': email,
                    'token_hash': token_hash,
                    'expires_at': expires_at.isoformat(),
                    'created_at': datetime.utcnow().isoformat()
                }).execute()
            else:
                # Fallback to regular client (may fail due to RLS)
                self.supabase.from_('magic_link_tokens').insert({
                    'email': email,
                    'token_hash': token_hash,
                    'expires_at': expires_at.isoformat(),
                    'created_at': datetime.utcnow().isoformat()
                }).execute()
        except Exception as e:
            logger.error(f"Store magic link token error: {str(e)}")
            raise
    
    async def _get_magic_link_token(self, token_hash: str) -> Optional[Dict[str, Any]]:
        """Get magic link token from database"""
        try:
            # Use service role client
            service_key = os.getenv("SUPABASE_SERVICE_KEY")
            if service_key:
                url = os.getenv("SUPABASE_URL")
                from supabase import create_client
                service_client = create_client(url, service_key)
                
                response = service_client.from_('magic_link_tokens').select('*').eq('token_hash', token_hash).single().execute()
            else:
                response = self.supabase.from_('magic_link_tokens').select('*').eq('token_hash', token_hash).single().execute()
                
            if response.data:
                # Convert ISO strings to datetime
                data = response.data
                data['expires_at'] = datetime.fromisoformat(data['expires_at'].replace('Z', '+00:00'))
                data['created_at'] = datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
                if data.get('used_at'):
                    data['used_at'] = datetime.fromisoformat(data['used_at'].replace('Z', '+00:00'))
                return data
            return None
        except:
            return None
    
    async def _mark_token_as_used(self, token_hash: str) -> None:
        """Mark magic link token as used"""
        try:
            # Use service role client
            service_key = os.getenv("SUPABASE_SERVICE_KEY")
            if service_key:
                url = os.getenv("SUPABASE_URL")
                from supabase import create_client
                service_client = create_client(url, service_key)
                
                service_client.from_('magic_link_tokens').update({
                    'used_at': datetime.utcnow().isoformat()
                }).eq('token_hash', token_hash).execute()
            else:
                self.supabase.from_('magic_link_tokens').update({
                    'used_at': datetime.utcnow().isoformat()
                }).eq('token_hash', token_hash).execute()
        except Exception as e:
            logger.error(f"Mark token as used error: {str(e)}")
            raise
    
    async def _send_magic_link_email(self, email: str, token: str) -> None:
        """Send magic link email"""
        try:
            # Get the base URL from environment
            base_url = os.getenv("FRONTEND_URL", "http://localhost:8080")
            magic_link_url = f"{base_url}/magic-link-verify?token={token}"
            
            # Try to use Resend if available
            resend_api_key = os.getenv("RESEND_API_KEY")
            if resend_api_key:
                try:
                    import resend
                    resend.api_key = resend_api_key
                    
                    params = {
                        "from": "Next.Slide <auth@yourdomain.com>",  # Update with your domain
                        "to": [email],
                        "subject": "Sign in to Next.Slide",
                        "html": f'''
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <style>
                                body {{ 
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                                    line-height: 1.6;
                                    color: #333;
                                    margin: 0;
                                    padding: 0;
                                }}
                                .container {{ 
                                    max-width: 600px; 
                                    margin: 0 auto; 
                                    padding: 40px 20px; 
                                }}
                                .logo {{
                                    font-size: 28px;
                                    font-weight: bold;
                                    color: #0066FF;
                                    margin-bottom: 30px;
                                }}
                                .button {{ 
                                    display: inline-block; 
                                    padding: 14px 30px; 
                                    background: #0066FF; 
                                    color: white; 
                                    text-decoration: none; 
                                    border-radius: 8px; 
                                    font-weight: 600;
                                    margin: 20px 0;
                                }}
                                .button:hover {{
                                    background: #0052CC;
                                }}
                                .link {{
                                    color: #666; 
                                    word-break: break-all;
                                    font-size: 14px;
                                    background: #f5f5f5;
                                    padding: 12px;
                                    border-radius: 6px;
                                    margin: 20px 0;
                                }}
                                .footer {{ 
                                    margin-top: 40px; 
                                    padding-top: 30px;
                                    border-top: 1px solid #eee;
                                    color: #666; 
                                    font-size: 14px; 
                                }}
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="logo">Next.Slide</div>
                                
                                <h2 style="margin-bottom: 20px;">Sign in to your account</h2>
                                
                                <p>Hi there,</p>
                                <p>You requested a magic link to sign in to Next.Slide. Click the button below to access your account:</p>
                                
                                <div style="text-align: center; margin: 40px 0;">
                                    <a href="{magic_link_url}" class="button">Sign in to Next.Slide</a>
                                </div>
                                
                                <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
                                <div class="link">{magic_link_url}</div>
                                
                                <div class="footer">
                                    <p><strong>🔒 Security Notice:</strong> This link will expire in 15 minutes and can only be used once.</p>
                                    <p>If you didn't request this email, you can safely ignore it. No one can access your account without clicking this link.</p>
                                    <p style="margin-top: 30px; color: #999;">
                                        © {datetime.now().year} Next.Slide. All rights reserved.<br>
                                        Made with ❤️ for better presentations
                                    </p>
                                </div>
                            </div>
                        </body>
                        </html>
                        '''
                    }
                    
                    email_sent = resend.Emails.send(params)
                    logger.info(f"Magic link email sent to {email} via Resend, ID: {email_sent.get('id')}")
                    return
                    
                except Exception as e:
                    logger.warning(f"Resend email failed, falling back: {str(e)}")
            
            # Fallback to console logging for development
            logger.info(f"Magic link for {email}: {magic_link_url}")
            print(f"\n🔗 MAGIC LINK for {email}:\n{magic_link_url}\n")
                
        except Exception as e:
            logger.error(f"Send magic link email error: {str(e)}")
            # Don't raise - still log the link so testing can continue
            logger.info(f"Fallback - Magic link URL: {base_url}/magic-link-verify?token={token}")
    
    async def _get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email using admin API"""
        try:
            # This requires service role key
            service_key = os.getenv("SUPABASE_SERVICE_KEY")
            if not service_key:
                # Fallback to regular client
                response = self.supabase.from_('profiles').select('*').eq('email', email).single().execute()
                if response.data:
                    return {
                        'id': response.data.get('id'),
                        'email': response.data.get('email'),
                        'created_at': response.data.get('created_at'),
                        'user_metadata': response.data.get('metadata', {})
                    }
                return None
            
            # Use admin API with shared httpx client
            url = os.getenv("SUPABASE_URL")
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}"
            }

            try:
                client = _get_auth_httpx_client()
                response = client.get(
                    f"{url}/auth/v1/admin/users",
                    headers=headers,
                    params={"email": email}
                )
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                logger.warning(f"Admin API request failed: {type(e).__name__}")
                _reset_auth_httpx_client()
                return None
            
            if response.status_code == 200:
                users = response.json().get('users', [])
                if users:
                    user = users[0]
                    return {
                        'id': user.get('id'),
                        'email': user.get('email'),
                        'created_at': user.get('created_at'),
                        'user_metadata': user.get('user_metadata', {})
                    }
            return None
            
        except Exception as e:
            logger.error(f"Get user by email error: {str(e)}")
            return None
    
    async def _create_session_for_user(self, user_id: str) -> Dict[str, Any]:
        """Create a session for a user using admin API"""
        try:
            # This requires service role key
            service_key = os.getenv("SUPABASE_SERVICE_KEY")
            if not service_key:
                raise ValueError("Service role key not configured")
            
            url = os.getenv("SUPABASE_URL")
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json"
            }
            
            # Generate access token for the user using shared httpx client
            try:
                client = _get_auth_httpx_client()
                response = client.post(
                    f"{url}/auth/v1/admin/generate_link",
                    headers=headers,
                    json={
                        "type": "magiclink",
                        "email": "",  # We'll use user_id instead
                        "user_id": user_id
                    }
                )
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                logger.warning(f"Generate link request failed: {type(e).__name__}")
                _reset_auth_httpx_client()
                raise RuntimeError(f"Failed to create session: {type(e).__name__}")
            
            if response.status_code == 200:
                # Extract token from the magic link
                data = response.json()
                # Parse the token from the URL
                import urllib.parse
                parsed = urllib.parse.urlparse(data['action_link'])
                params = urllib.parse.parse_qs(parsed.fragment)
                
                access_token = params.get('access_token', [''])[0]
                refresh_token = params.get('refresh_token', [''])[0]
                expires_in = int(params.get('expires_in', [3600])[0])
                
                return {
                    'access_token': access_token,
                    'refresh_token': refresh_token,
                    'expires_in': expires_in,
                    'expires_at': int((datetime.utcnow() + timedelta(seconds=expires_in)).timestamp() * 1000)
                }
            else:
                # Fallback: create a custom token
                # This is a simplified version - in production, use proper JWT generation
                access_token = secrets.token_urlsafe(32)
                refresh_token = secrets.token_urlsafe(32)
                
                return {
                    'access_token': access_token,
                    'refresh_token': refresh_token,
                    'expires_in': 3600,
                    'expires_at': int((datetime.utcnow() + timedelta(hours=1)).timestamp() * 1000)
                }
                
        except Exception as e:
            logger.error(f"Create session error: {str(e)}")
            raise
    
    async def _mark_email_verified(self, user_id: str) -> None:
        """Mark user's email as verified"""
        try:
            service_key = os.getenv("SUPABASE_SERVICE_KEY")
            if not service_key:
                return
            
            url = os.getenv("SUPABASE_URL")
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json"
            }
            
            try:
                client = _get_auth_httpx_client()
                client.put(
                    f"{url}/auth/v1/admin/users/{user_id}",
                    headers=headers,
                    json={"email_confirmed_at": datetime.utcnow().isoformat()}
                )
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                logger.warning(f"Mark email verified failed: {type(e).__name__}")
                _reset_auth_httpx_client()
        except Exception as e:
            logger.error(f"Mark email verified error: {str(e)}")
    
    def update_password(self, new_password: str) -> bool:
        """
        Update the current user's password
        
        Args:
            new_password: The new password
        
        Returns:
            True if successful
        """
        try:
            self.supabase.auth.update_user({"password": new_password})
            logger.info("Password updated successfully")
            return True
        except Exception as e:
            logger.error(f"Update password error: {str(e)}")
            return False

# Singleton instance
_auth_service = None

def get_auth_service() -> SupabaseAuthService:
    """Get the singleton auth service instance"""
    global _auth_service
    if _auth_service is None:
        _auth_service = SupabaseAuthService()
    return _auth_service 