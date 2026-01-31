"""
Sharing Service

Handles:
- Sharing decks between users
- Retrieving shared-with-me / shared-by-me lists
- Marking shares as read
- Removing shares
- Team invite prompt dismissal tracking
- User stats for prompt logic
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)


class SharingService:
    """Service for managing deck shares and team invite prompts."""

    def _get_client(self):
        return get_supabase_client()

    # ------------------------------------------------------------------
    # Deck Sharing
    # ------------------------------------------------------------------

    async def share_deck_with_user(
        self,
        deck_id: str,
        shared_by: str,
        shared_with_email: str,
        permission: str = "view",
        message: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Share a deck with another user by email.

        Returns the created share record or raises on error.
        """
        try:
            client = self._get_client()

            # Look up the target user by email
            user_result = (
                client.table("users")
                .select("id, email, full_name")
                .eq("email", shared_with_email)
                .execute()
            )

            if not user_result.data or len(user_result.data) == 0:
                raise ValueError(f"No user found with email: {shared_with_email}")

            shared_with_id = user_result.data[0]["id"]

            # Prevent sharing with yourself
            if shared_with_id == shared_by:
                raise ValueError("You cannot share a deck with yourself")

            # Upsert the share (update permission/message if already shared)
            share_data = {
                "deck_uuid": deck_id,
                "shared_by": shared_by,
                "shared_with": shared_with_id,
                "permission": permission,
                "message": message,
                "is_read": False,
            }

            result = (
                client.table("deck_shares")
                .upsert(share_data, on_conflict="deck_uuid,shared_with")
                .execute()
            )

            if result.data and len(result.data) > 0:
                logger.info(
                    f"Shared deck {deck_id} with {shared_with_email} (permission={permission})"
                )
                return result.data[0]

            raise RuntimeError("Failed to create share record")

        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Error sharing deck {deck_id} with {shared_with_email}: {e}")
            raise

    async def get_shared_with_me(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all decks shared with this user, including deck info and sharer info."""
        try:
            client = self._get_client()

            result = (
                client.table("deck_shares")
                .select("*")
                .eq("shared_with", user_id)
                .order("created_at", desc=True)
                .execute()
            )

            shares = []
            for share in result.data or []:
                # Fetch deck info
                deck_info = None
                try:
                    deck_result = (
                        client.table("decks")
                        .select("uuid, title, slide_count, created_at")
                        .eq("uuid", share["deck_uuid"])
                        .execute()
                    )
                    if deck_result.data and len(deck_result.data) > 0:
                        deck_info = deck_result.data[0]
                except Exception:
                    pass

                # Fetch sharer info
                sharer_info = None
                try:
                    sharer_result = (
                        client.table("users")
                        .select("email, full_name")
                        .eq("id", share["shared_by"])
                        .execute()
                    )
                    if sharer_result.data and len(sharer_result.data) > 0:
                        sharer_info = sharer_result.data[0]
                except Exception:
                    pass

                shares.append({
                    "id": share["id"],
                    "deck_id": share["deck_uuid"],
                    "deck_title": deck_info.get("title", "Untitled") if deck_info else "Untitled",
                    "deck_slide_count": deck_info.get("slide_count", 0) if deck_info else 0,
                    "shared_by_email": sharer_info.get("email", "Unknown") if sharer_info else "Unknown",
                    "shared_by_name": sharer_info.get("full_name") if sharer_info else None,
                    "permission": share["permission"],
                    "message": share.get("message"),
                    "is_read": share["is_read"],
                    "created_at": share["created_at"],
                })

            return shares

        except Exception as e:
            logger.error(f"Error getting shared-with-me for {user_id}: {e}")
            return []

    async def get_shared_by_me(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all decks this user has shared with others."""
        try:
            client = self._get_client()

            result = (
                client.table("deck_shares")
                .select("*")
                .eq("shared_by", user_id)
                .order("created_at", desc=True)
                .execute()
            )

            shares = []
            for share in result.data or []:
                # Fetch deck info
                deck_info = None
                try:
                    deck_result = (
                        client.table("decks")
                        .select("uuid, title, slide_count")
                        .eq("uuid", share["deck_uuid"])
                        .execute()
                    )
                    if deck_result.data and len(deck_result.data) > 0:
                        deck_info = deck_result.data[0]
                except Exception:
                    pass

                # Fetch recipient info
                recipient_info = None
                try:
                    recipient_result = (
                        client.table("users")
                        .select("email, full_name")
                        .eq("id", share["shared_with"])
                        .execute()
                    )
                    if recipient_result.data and len(recipient_result.data) > 0:
                        recipient_info = recipient_result.data[0]
                except Exception:
                    pass

                shares.append({
                    "id": share["id"],
                    "deck_id": share["deck_uuid"],
                    "deck_title": deck_info.get("title", "Untitled") if deck_info else "Untitled",
                    "shared_with_email": recipient_info.get("email", "Unknown") if recipient_info else "Unknown",
                    "shared_with_name": recipient_info.get("full_name") if recipient_info else None,
                    "permission": share["permission"],
                    "message": share.get("message"),
                    "is_read": share["is_read"],
                    "created_at": share["created_at"],
                })

            return shares

        except Exception as e:
            logger.error(f"Error getting shared-by-me for {user_id}: {e}")
            return []

    async def mark_share_as_read(self, share_id: str, user_id: str) -> bool:
        """Mark a share notification as read. Only the recipient can do this."""
        try:
            client = self._get_client()

            result = (
                client.table("deck_shares")
                .update({"is_read": True})
                .eq("id", share_id)
                .eq("shared_with", user_id)
                .execute()
            )

            if result.data and len(result.data) > 0:
                logger.info(f"Marked share {share_id} as read for user {user_id}")
                return True

            return False

        except Exception as e:
            logger.error(f"Error marking share {share_id} as read: {e}")
            return False

    async def remove_share(self, share_id: str, user_id: str) -> bool:
        """Remove a share. The sharer or recipient can remove it."""
        try:
            client = self._get_client()

            # Verify the user is the sharer or recipient
            check = (
                client.table("deck_shares")
                .select("id, shared_by, shared_with")
                .eq("id", share_id)
                .execute()
            )

            if not check.data or len(check.data) == 0:
                return False

            share = check.data[0]
            if share["shared_by"] != user_id and share["shared_with"] != user_id:
                return False

            client.table("deck_shares").delete().eq("id", share_id).execute()
            logger.info(f"Removed share {share_id} by user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Error removing share {share_id}: {e}")
            return False

    # ------------------------------------------------------------------
    # Team Invite Prompt Dismissals
    # ------------------------------------------------------------------

    async def check_prompt_dismissed(self, user_id: str, prompt_type: str) -> bool:
        """
        Check if a prompt was dismissed and is still within the cooldown window.
        Returns True if the prompt is currently dismissed (should NOT be shown).
        """
        try:
            client = self._get_client()

            result = (
                client.table("team_invite_prompts_dismissed")
                .select("show_again_after")
                .eq("user_id", user_id)
                .eq("prompt_type", prompt_type)
                .execute()
            )

            if not result.data or len(result.data) == 0:
                return False  # Never dismissed -> should be shown

            show_again_after = result.data[0]["show_again_after"]
            # If show_again_after is in the future, it's still dismissed
            now = datetime.utcnow().isoformat()
            return show_again_after > now

        except Exception as e:
            logger.error(f"Error checking prompt dismissal for {user_id}/{prompt_type}: {e}")
            return False

    async def dismiss_prompt(self, user_id: str, prompt_type: str) -> bool:
        """Dismiss a prompt for 7 days."""
        try:
            client = self._get_client()

            now = datetime.utcnow()
            show_again = now + timedelta(days=7)

            data = {
                "user_id": user_id,
                "prompt_type": prompt_type,
                "dismissed_at": now.isoformat(),
                "show_again_after": show_again.isoformat(),
            }

            client.table("team_invite_prompts_dismissed").upsert(
                data, on_conflict="user_id,prompt_type"
            ).execute()

            logger.info(f"Dismissed prompt '{prompt_type}' for user {user_id} until {show_again.isoformat()}")
            return True

        except Exception as e:
            logger.error(f"Error dismissing prompt {prompt_type} for {user_id}: {e}")
            return False

    # ------------------------------------------------------------------
    # User Stats for Prompt Logic
    # ------------------------------------------------------------------

    async def get_user_stats_for_prompts(self, user_id: str) -> Dict[str, Any]:
        """
        Get user stats needed to determine which prompts to show:
        - deck_count: number of decks created
        - share_count: number of decks shared
        - total_views: total presentation views
        """
        try:
            client = self._get_client()

            # Count decks created
            deck_count = 0
            try:
                decks_result = (
                    client.table("decks")
                    .select("uuid", count="exact")
                    .eq("user_id", user_id)
                    .execute()
                )
                deck_count = decks_result.count if decks_result.count is not None else 0
            except Exception:
                pass

            # Count shares sent
            share_count = 0
            try:
                shares_result = (
                    client.table("deck_shares")
                    .select("id", count="exact")
                    .eq("shared_by", user_id)
                    .execute()
                )
                share_count = shares_result.count if shares_result.count is not None else 0
            except Exception:
                pass

            # Total views across all decks
            total_views = 0
            try:
                views_result = (
                    client.table("decks")
                    .select("view_count")
                    .eq("user_id", user_id)
                    .execute()
                )
                for deck in views_result.data or []:
                    total_views += deck.get("view_count", 0) or 0
            except Exception:
                pass

            return {
                "deck_count": deck_count,
                "share_count": share_count,
                "total_views": total_views,
            }

        except Exception as e:
            logger.error(f"Error getting user stats for prompts ({user_id}): {e}")
            return {"deck_count": 0, "share_count": 0, "total_views": 0}


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
_sharing_service: Optional[SharingService] = None


def get_sharing_service() -> SharingService:
    """Get sharing service singleton."""
    global _sharing_service
    if _sharing_service is None:
        _sharing_service = SharingService()
    return _sharing_service
