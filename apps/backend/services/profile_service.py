"""
Profile Service

Handles:
- Public profile retrieval by username
- Profile updates (bio, social links, avatar, public toggle)
- Username setting and validation
- Follow / unfollow
- Follower / following lists
- Creator tier calculation
- User public presentations
"""

import re
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

# Creator tier thresholds (based on total presentation views)
CREATOR_TIERS = [
    ("diamond", 10000),
    ("platinum", 5000),
    ("gold", 1000),
    ("silver", 500),
    ("bronze", 100),
]

# Username validation regex: 3-30 chars, alphanumeric and hyphens
USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9-]{1,28}[a-zA-Z0-9]$")

# Reserved usernames that cannot be claimed
RESERVED_USERNAMES = {
    "admin", "api", "app", "help", "support", "team", "settings",
    "profile", "login", "signup", "logout", "dashboard", "null", "undefined",
    "showcase", "templates", "pricing", "developers", "community",
}


class ProfileService:
    """Service for managing public profiles and creator pages."""

    def _get_client(self):
        return get_supabase_client()

    # ------------------------------------------------------------------
    # Public Profile
    # ------------------------------------------------------------------

    async def get_public_profile(self, username: str, viewer_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Fetch a user's public profile by username.
        Includes stats: total presentations, total views, follower/following counts.
        Returns None if user not found or profile is not public.
        """
        try:
            client = self._get_client()

            # Get user by username
            result = client.table("users").select(
                "id, full_name, email, username, bio, avatar_url, social_links, "
                "is_profile_public, creator_tier, created_at"
            ).eq("username", username).execute()

            if not result.data:
                return None

            user = result.data[0]

            # Only return if profile is public
            if not user.get("is_profile_public", False):
                return None

            user_id = user["id"]

            # Get total presentations count (published decks)
            decks_result = client.table("decks").select(
                "uuid", count="exact"
            ).eq("user_id", user_id).execute()
            total_presentations = decks_result.count if decks_result.count else 0

            # Get total views across all presentations
            total_views = 0
            try:
                views_result = client.table("presentation_views").select(
                    "id", count="exact"
                ).in_(
                    "deck_uuid",
                    [d["uuid"] for d in (decks_result.data or [])]
                ).execute() if decks_result.data else None
                if views_result and views_result.count:
                    total_views = views_result.count
            except Exception:
                pass  # Views table may not exist yet

            # Get total remixes from community_decks
            total_remixes = 0
            try:
                community_result = client.table("community_decks").select(
                    "remix_count"
                ).eq("user_id", user_id).eq("status", "approved").execute()
                total_remixes = sum(d.get("remix_count", 0) for d in (community_result.data or []))
            except Exception:
                pass

            # Get follower and following counts
            followers_result = client.table("user_follows").select(
                "id", count="exact"
            ).eq("following_id", user_id).execute()
            follower_count = followers_result.count if followers_result.count else 0

            following_result = client.table("user_follows").select(
                "id", count="exact"
            ).eq("follower_id", user_id).execute()
            following_count = following_result.count if following_result.count else 0

            # Check if viewer is following this user
            is_following = False
            if viewer_id and viewer_id != user_id:
                follow_check = client.table("user_follows").select("id").eq(
                    "follower_id", viewer_id
                ).eq("following_id", user_id).execute()
                is_following = bool(follow_check.data)

            # Get streak
            streak_count = 0
            try:
                streak_result = client.table("user_streaks").select(
                    "current_streak"
                ).eq("user_id", user_id).execute()
                if streak_result.data:
                    streak_count = streak_result.data[0].get("current_streak", 0)
            except Exception:
                pass

            # Record profile view (fire and forget)
            try:
                client.table("profile_views").insert({
                    "profile_user_id": user_id,
                    "viewer_id": viewer_id,
                }).execute()
            except Exception:
                pass

            return {
                "id": user_id,
                "username": user.get("username"),
                "full_name": user.get("full_name"),
                "bio": user.get("bio"),
                "avatar_url": user.get("avatar_url"),
                "social_links": user.get("social_links", {}),
                "creator_tier": user.get("creator_tier", "none"),
                "created_at": user.get("created_at"),
                "stats": {
                    "total_presentations": total_presentations,
                    "total_views": total_views,
                    "total_remixes": total_remixes,
                    "follower_count": follower_count,
                    "following_count": following_count,
                    "streak_count": streak_count,
                },
                "is_following": is_following,
            }

        except Exception as e:
            logger.error(f"Error fetching public profile for {username}: {e}")
            return None

    # ------------------------------------------------------------------
    # Profile Updates
    # ------------------------------------------------------------------

    async def update_profile(self, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update a user's profile fields.
        Allowed fields: bio, social_links, is_profile_public, avatar_url.
        """
        try:
            client = self._get_client()

            allowed_fields = {"bio", "social_links", "is_profile_public", "avatar_url"}
            update_data = {k: v for k, v in data.items() if k in allowed_fields}

            if not update_data:
                return {"success": False, "error": "No valid fields to update"}

            # Validate bio length
            if "bio" in update_data and update_data["bio"] and len(update_data["bio"]) > 500:
                return {"success": False, "error": "Bio must be 500 characters or less"}

            result = client.table("users").update(update_data).eq("id", user_id).execute()

            if not result.data:
                return {"success": False, "error": "User not found"}

            # Recalculate creator tier when profile is made public
            if update_data.get("is_profile_public"):
                await self.calculate_creator_tier(user_id)

            return {"success": True, "profile": result.data[0]}

        except Exception as e:
            logger.error(f"Error updating profile for {user_id}: {e}")
            return {"success": False, "error": "Failed to update profile"}

    # ------------------------------------------------------------------
    # Username
    # ------------------------------------------------------------------

    async def set_username(self, user_id: str, username: str) -> Dict[str, Any]:
        """
        Validate and set a unique username.
        Rules: 3-30 chars, alphanumeric + hyphens, cannot start/end with hyphen.
        """
        try:
            # Normalize to lowercase
            username = username.lower().strip()

            # Validate format
            if not USERNAME_REGEX.match(username):
                return {
                    "success": False,
                    "error": "Username must be 3-30 characters, alphanumeric and hyphens only, "
                             "cannot start or end with a hyphen.",
                }

            # Check reserved names
            if username in RESERVED_USERNAMES:
                return {"success": False, "error": "This username is not available."}

            client = self._get_client()

            # Check uniqueness
            existing = client.table("users").select("id").eq("username", username).execute()
            if existing.data:
                # Allow if it's the same user
                if existing.data[0]["id"] == user_id:
                    return {"success": True, "username": username}
                return {"success": False, "error": "This username is already taken."}

            # Set the username
            result = client.table("users").update({"username": username}).eq("id", user_id).execute()

            if not result.data:
                return {"success": False, "error": "User not found"}

            return {"success": True, "username": username}

        except Exception as e:
            logger.error(f"Error setting username for {user_id}: {e}")
            return {"success": False, "error": "Failed to set username"}

    # ------------------------------------------------------------------
    # Follow / Unfollow
    # ------------------------------------------------------------------

    async def follow_user(self, follower_id: str, username: str) -> Dict[str, Any]:
        """Follow a user by their username."""
        try:
            client = self._get_client()

            # Resolve username to user_id
            target = client.table("users").select("id").eq("username", username).execute()
            if not target.data:
                return {"success": False, "error": "User not found"}

            following_id = target.data[0]["id"]

            # Cannot follow yourself
            if follower_id == following_id:
                return {"success": False, "error": "You cannot follow yourself"}

            # Check if already following
            existing = client.table("user_follows").select("id").eq(
                "follower_id", follower_id
            ).eq("following_id", following_id).execute()

            if existing.data:
                return {"success": True, "message": "Already following"}

            # Insert follow
            client.table("user_follows").insert({
                "follower_id": follower_id,
                "following_id": following_id,
            }).execute()

            return {"success": True, "message": "Now following"}

        except Exception as e:
            logger.error(f"Error following user {username}: {e}")
            return {"success": False, "error": "Failed to follow user"}

    async def unfollow_user(self, follower_id: str, username: str) -> Dict[str, Any]:
        """Unfollow a user by their username."""
        try:
            client = self._get_client()

            # Resolve username to user_id
            target = client.table("users").select("id").eq("username", username).execute()
            if not target.data:
                return {"success": False, "error": "User not found"}

            following_id = target.data[0]["id"]

            # Delete follow
            client.table("user_follows").delete().eq(
                "follower_id", follower_id
            ).eq("following_id", following_id).execute()

            return {"success": True, "message": "Unfollowed"}

        except Exception as e:
            logger.error(f"Error unfollowing user {username}: {e}")
            return {"success": False, "error": "Failed to unfollow user"}

    # ------------------------------------------------------------------
    # Followers / Following Lists
    # ------------------------------------------------------------------

    async def get_followers(self, username: str) -> List[Dict[str, Any]]:
        """Get list of users who follow the given username."""
        try:
            client = self._get_client()

            # Resolve username
            target = client.table("users").select("id").eq("username", username).execute()
            if not target.data:
                return []

            user_id = target.data[0]["id"]

            # Get follower IDs
            follows = client.table("user_follows").select(
                "follower_id, created_at"
            ).eq("following_id", user_id).order("created_at", desc=True).limit(100).execute()

            if not follows.data:
                return []

            follower_ids = [f["follower_id"] for f in follows.data]

            # Fetch user details
            users = client.table("users").select(
                "id, full_name, username, avatar_url, creator_tier"
            ).in_("id", follower_ids).execute()

            user_map = {u["id"]: u for u in (users.data or [])}
            result = []
            for f in follows.data:
                u = user_map.get(f["follower_id"])
                if u:
                    result.append({
                        "id": u["id"],
                        "full_name": u.get("full_name"),
                        "username": u.get("username"),
                        "avatar_url": u.get("avatar_url"),
                        "creator_tier": u.get("creator_tier", "none"),
                        "followed_at": f["created_at"],
                    })

            return result

        except Exception as e:
            logger.error(f"Error getting followers for {username}: {e}")
            return []

    async def get_following(self, username: str) -> List[Dict[str, Any]]:
        """Get list of users that the given username follows."""
        try:
            client = self._get_client()

            # Resolve username
            target = client.table("users").select("id").eq("username", username).execute()
            if not target.data:
                return []

            user_id = target.data[0]["id"]

            # Get following IDs
            follows = client.table("user_follows").select(
                "following_id, created_at"
            ).eq("follower_id", user_id).order("created_at", desc=True).limit(100).execute()

            if not follows.data:
                return []

            following_ids = [f["following_id"] for f in follows.data]

            # Fetch user details
            users = client.table("users").select(
                "id, full_name, username, avatar_url, creator_tier"
            ).in_("id", following_ids).execute()

            user_map = {u["id"]: u for u in (users.data or [])}
            result = []
            for f in follows.data:
                u = user_map.get(f["following_id"])
                if u:
                    result.append({
                        "id": u["id"],
                        "full_name": u.get("full_name"),
                        "username": u.get("username"),
                        "avatar_url": u.get("avatar_url"),
                        "creator_tier": u.get("creator_tier", "none"),
                        "followed_at": f["created_at"],
                    })

            return result

        except Exception as e:
            logger.error(f"Error getting following for {username}: {e}")
            return []

    # ------------------------------------------------------------------
    # Creator Tier
    # ------------------------------------------------------------------

    async def calculate_creator_tier(self, user_id: str) -> str:
        """
        Calculate and update the creator tier based on total views.
        Tiers: none, bronze (100+), silver (500+), gold (1000+),
               platinum (5000+), diamond (10000+).
        """
        try:
            client = self._get_client()

            # Get all user deck UUIDs
            decks = client.table("decks").select("uuid").eq("user_id", user_id).execute()
            if not decks.data:
                return "none"

            deck_uuids = [d["uuid"] for d in decks.data]

            # Count total views
            total_views = 0
            try:
                views = client.table("presentation_views").select(
                    "id", count="exact"
                ).in_("deck_uuid", deck_uuids).execute()
                total_views = views.count if views.count else 0
            except Exception:
                pass

            # Determine tier
            tier = "none"
            for tier_name, threshold in CREATOR_TIERS:
                if total_views >= threshold:
                    tier = tier_name
                    break

            # Update user
            client.table("users").update({"creator_tier": tier}).eq("id", user_id).execute()

            return tier

        except Exception as e:
            logger.error(f"Error calculating creator tier for {user_id}: {e}")
            return "none"

    # ------------------------------------------------------------------
    # Public Presentations
    # ------------------------------------------------------------------

    async def get_user_public_presentations(self, username: str, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
        """
        Get published decks for a user's public profile page.
        Returns decks that the user owns.
        """
        try:
            client = self._get_client()

            # Resolve username
            target = client.table("users").select("id").eq("username", username).execute()
            if not target.data:
                return {"presentations": [], "total": 0}

            user_id = target.data[0]["id"]

            # Fetch decks
            result = client.table("decks").select(
                "uuid, name, slide_count, first_slide, created_at, updated_at",
                count="exact"
            ).eq("user_id", user_id).order(
                "updated_at", desc=True
            ).range(offset, offset + limit - 1).execute()

            total = result.count if result.count else 0
            presentations = []
            for deck in (result.data or []):
                presentations.append({
                    "uuid": deck["uuid"],
                    "name": deck.get("name", "Untitled"),
                    "slide_count": deck.get("slide_count", 0),
                    "first_slide": deck.get("first_slide"),
                    "created_at": deck.get("created_at"),
                    "updated_at": deck.get("updated_at"),
                })

            return {
                "presentations": presentations,
                "total": total,
                "has_more": offset + limit < total,
            }

        except Exception as e:
            logger.error(f"Error getting presentations for {username}: {e}")
            return {"presentations": [], "total": 0}

    # ------------------------------------------------------------------
    # Get own profile (for settings)
    # ------------------------------------------------------------------

    async def get_own_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get the authenticated user's own profile data for editing."""
        try:
            client = self._get_client()

            result = client.table("users").select(
                "id, full_name, email, username, bio, avatar_url, social_links, "
                "is_profile_public, creator_tier, created_at"
            ).eq("id", user_id).execute()

            if not result.data:
                return None

            return result.data[0]

        except Exception as e:
            logger.error(f"Error getting own profile for {user_id}: {e}")
            return None


# Singleton pattern (matching referral_service.py)
_profile_service: Optional[ProfileService] = None


def get_profile_service() -> ProfileService:
    global _profile_service
    if _profile_service is None:
        _profile_service = ProfileService()
    return _profile_service
