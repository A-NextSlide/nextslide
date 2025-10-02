"""
Simple Session Manager for Consistent Authentication
Handles token validation, user retrieval, and deck association
"""

import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import httpx
from functools import lru_cache
import json

logger = logging.getLogger(__name__)

class SessionManager:
    """Centralized session management for the entire application"""
    
    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        self._token_cache = {}  # Token -> User cache with expiry
        
    def validate_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Validate a JWT token and return user data
        Uses caching to avoid hitting Supabase on every request
        """
        if not token:
            return None
            
        # Check cache first
        cached = self._token_cache.get(token)
        if cached:
            expiry = cached.get('_cache_expiry')
            if expiry and datetime.now() < expiry:
                logger.debug(f"Token cache hit for user {cached.get('id')}")
                return cached
        
        try:
            # Validate with Supabase
            headers = {
                "Authorization": f"Bearer {token}",
                "apikey": self.key
            }
            
            # Keep token validation snappy to avoid UI hangs
            # Use tight timeouts so network issues don't block requests for long
            response = httpx.get(
                f"{self.url}/auth/v1/user",
                headers=headers,
                timeout=httpx.Timeout(connect=1.5, read=2.0, write=2.0, pool=1.0)
            )
            
            if response.status_code == 200:
                user_data = response.json()
                
                # Simplified user object
                user = {
                    "id": user_data.get("id"),
                    "email": user_data.get("email"),
                    "created_at": user_data.get("created_at"),
                    "user_metadata": user_data.get("user_metadata", {})
                }
                
                # Cache for 5 minutes
                user['_cache_expiry'] = datetime.now() + timedelta(minutes=5)
                self._token_cache[token] = user
                
                logger.info(f"Token validated for user {user['id']}")
                return user
            elif response.status_code == 401:
                logger.warning(f"Token validation failed with 401 - token may be expired")
                logger.debug(f"Response: {response.text}")
                # Remove from cache if invalid
                self._token_cache.pop(token, None)
                return None
            else:
                logger.warning(f"Token validation failed: {response.status_code}")
                logger.debug(f"Response: {response.text}")
                # Remove from cache if invalid
                self._token_cache.pop(token, None)
                return None
                
        except Exception as e:
            logger.error(f"Token validation error: {str(e)}")
            # Development fallback: decode JWT locally without verification to avoid UI hangs
            try:
                env = os.getenv("ENVIRONMENT", os.getenv("ENV", "development")).lower()
                allow_fallback = os.getenv("ALLOW_UNVERIFIED_TOKEN_FALLBACK", "true").lower() == "true"
                if token and env != "production" and allow_fallback:
                    import jwt  # PyJWT
                    payload = jwt.decode(token, options={"verify_signature": False, "verify_exp": False})
                    user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
                    email = payload.get("email")
                    if user_id:
                        user = {
                            "id": user_id,
                            "email": email,
                            "created_at": None,
                            "user_metadata": payload.get("user_metadata", {}),
                            "_unverified": True,
                            "_cache_expiry": datetime.now() + timedelta(minutes=5)
                        }
                        self._token_cache[token] = user
                        logger.warning("Using unverified token fallback for development")
                        return user
            except Exception:
                pass
            return None
    
    def clear_token_cache(self, token: str = None):
        """Clear token cache - either specific token or all"""
        if token:
            self._token_cache.pop(token, None)
        else:
            self._token_cache.clear()
    
    def get_user_id_from_token(self, token: str) -> Optional[str]:
        """Quick helper to just get user ID"""
        user = self.validate_token(token)
        return user.get('id') if user else None
    
    def ensure_deck_ownership(self, deck_uuid: str, user_id: str) -> bool:
        """
        Ensure a deck is associated with a user
        This is called after deck creation to guarantee attribution
        """
        if not user_id or not deck_uuid:
            return False
            
        try:
            from utils.supabase import get_supabase_client
            supabase = get_supabase_client()
            
            # Update deck to set user_id
            result = supabase.table("decks").update({
                "user_id": user_id
            }).eq("uuid", deck_uuid).execute()
            
            if result.data:
                logger.info(f"Deck {deck_uuid} attributed to user {user_id}")
                
                # Also create user_decks association
                try:
                    supabase.table("user_decks").upsert({
                        "user_id": user_id,
                        "deck_uuid": deck_uuid,
                        "last_accessed": datetime.utcnow().isoformat()
                    }, on_conflict="user_id,deck_uuid").execute()
                except Exception as e:
                    logger.warning(f"Could not create user_decks association: {e}")
                
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to ensure deck ownership: {e}")
            return False


# Global singleton instance
_session_manager = None

def get_session_manager() -> SessionManager:
    """Get the global session manager instance"""
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager


# Convenience functions
def validate_token(token: str) -> Optional[Dict[str, Any]]:
    """Validate a token and return user data"""
    return get_session_manager().validate_token(token)


def get_user_id(token: str) -> Optional[str]:
    """Get user ID from token"""
    return get_session_manager().get_user_id_from_token(token)


def ensure_deck_ownership(deck_uuid: str, token: str) -> bool:
    """Ensure deck is owned by the token's user"""
    user_id = get_user_id(token)
    if user_id:
        return get_session_manager().ensure_deck_ownership(deck_uuid, user_id)
    return False 