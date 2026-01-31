"""
Notification Service

Handles:
- Creating in-app notifications
- Retrieving and paginating notifications
- Marking notifications as read
- Managing notification preferences
- Recording daily view stats and triggering view-threshold notifications
"""

import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, date

from services.supabase import get_supabase_client
from services.growth_config_service import get_growth_config
from services.email_service import send_view_notification_email

logger = logging.getLogger(__name__)

# Threshold: create a notification when a deck hits this many views in a day
DAILY_VIEW_NOTIFICATION_THRESHOLD = 5


class NotificationService:
    """Service for managing user notifications and view tracking."""

    def __init__(self):
        # Don't cache the supabase client - get fresh one for each operation
        # to avoid "client has been closed" errors when the connection pool recycles
        pass

    @property
    def supabase(self):
        """Get a fresh Supabase client for each operation."""
        return get_supabase_client()

    # ------------------------------------------------------------------
    # Notification CRUD
    # ------------------------------------------------------------------

    async def create_notification(
        self,
        user_id: str,
        type: str,
        title: str,
        message: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Create an in-app notification for a user."""
        try:
            result = (
                self.supabase.table("notifications")
                .insert({
                    "user_id": user_id,
                    "type": type,
                    "title": title,
                    "message": message,
                    "data": data or {},
                })
                .execute()
            )
            if result.data:
                logger.info(f"Notification created for user {user_id}: {title}")
                return result.data[0]
            return None
        except Exception as e:
            logger.error(f"Failed to create notification for {user_id}: {e}")
            return None

    async def get_notifications(
        self,
        user_id: str,
        limit: int = 20,
        unread_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """Retrieve notifications for a user, newest first."""
        try:
            query = (
                self.supabase.table("notifications")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(limit)
            )
            if unread_only:
                query = query.eq("read", False)
            result = query.execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Failed to get notifications for {user_id}: {e}")
            return []

    async def mark_read(self, user_id: str, notification_id: str) -> bool:
        """Mark a single notification as read."""
        try:
            result = (
                self.supabase.table("notifications")
                .update({"read": True})
                .eq("id", notification_id)
                .eq("user_id", user_id)
                .execute()
            )
            return bool(result.data)
        except Exception as e:
            logger.error(f"Failed to mark notification {notification_id} read: {e}")
            return False

    async def mark_all_read(self, user_id: str) -> bool:
        """Mark all unread notifications as read for a user."""
        try:
            result = (
                self.supabase.table("notifications")
                .update({"read": True})
                .eq("user_id", user_id)
                .eq("read", False)
                .execute()
            )
            return True
        except Exception as e:
            logger.error(f"Failed to mark all notifications read for {user_id}: {e}")
            return False

    async def get_unread_count(self, user_id: str) -> int:
        """Return the count of unread notifications for a user."""
        try:
            result = (
                self.supabase.table("notifications")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .eq("read", False)
                .execute()
            )
            return result.count or 0
        except Exception as e:
            logger.error(f"Failed to get unread count for {user_id}: {e}")
            return 0

    # ------------------------------------------------------------------
    # Notification Preferences
    # ------------------------------------------------------------------

    async def get_preferences(self, user_id: str) -> Dict[str, Any]:
        """Get notification preferences for a user, creating defaults if missing."""
        try:
            result = (
                self.supabase.table("notification_preferences")
                .select("*")
                .eq("user_id", user_id)
                .execute()
            )
            if result.data:
                return result.data[0]

            # Create default preferences
            default = {
                "user_id": user_id,
                "email_on_views": True,
                "email_weekly_digest": True,
                "email_on_badges": True,
                "in_app_notifications": True,
            }
            insert_result = (
                self.supabase.table("notification_preferences")
                .insert(default)
                .execute()
            )
            if insert_result.data:
                return insert_result.data[0]
            return default
        except Exception as e:
            logger.error(f"Failed to get preferences for {user_id}: {e}")
            return {
                "user_id": user_id,
                "email_on_views": True,
                "email_weekly_digest": True,
                "email_on_badges": True,
                "in_app_notifications": True,
            }

    async def update_preferences(
        self, user_id: str, prefs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update notification preferences for a user."""
        try:
            allowed_keys = {
                "email_on_views",
                "email_weekly_digest",
                "email_on_badges",
                "in_app_notifications",
            }
            update_data = {k: v for k, v in prefs.items() if k in allowed_keys}
            update_data["updated_at"] = datetime.utcnow().isoformat()

            result = (
                self.supabase.table("notification_preferences")
                .upsert({"user_id": user_id, **update_data})
                .execute()
            )
            if result.data:
                return result.data[0]
            return await self.get_preferences(user_id)
        except Exception as e:
            logger.error(f"Failed to update preferences for {user_id}: {e}")
            return await self.get_preferences(user_id)

    # ------------------------------------------------------------------
    # Daily View Stats & View Threshold Notifications
    # ------------------------------------------------------------------

    async def record_view(self, deck_uuid: str, user_id: str) -> None:
        """
        Increment the daily view count for a deck and create a notification
        if the threshold is met (e.g., 5+ views in a day).
        """
        today = date.today().isoformat()

        try:
            # Check if a record already exists for this deck + day
            existing = (
                self.supabase.table("daily_view_stats")
                .select("id, view_count")
                .eq("deck_uuid", deck_uuid)
                .eq("view_date", today)
                .execute()
            )

            if existing.data:
                row = existing.data[0]
                new_count = row["view_count"] + 1
                self.supabase.table("daily_view_stats").update(
                    {"view_count": new_count}
                ).eq("id", row["id"]).execute()
            else:
                new_count = 1
                self.supabase.table("daily_view_stats").insert({
                    "deck_uuid": deck_uuid,
                    "user_id": user_id,
                    "view_date": today,
                    "view_count": 1,
                }).execute()

            # Trigger notification at threshold (config-driven)
            threshold = get_growth_config().get_int("notifications.view_threshold", DAILY_VIEW_NOTIFICATION_THRESHOLD)
            if new_count == threshold:
                # Get deck title for the notification
                deck_title = await self._get_deck_title(deck_uuid)
                display_title = deck_title or "your presentation"

                # Check preferences before creating notification
                prefs = await self.get_preferences(user_id)
                if prefs.get("in_app_notifications", True):
                    await self.create_notification(
                        user_id=user_id,
                        type="view",
                        title="Your presentation is trending",
                        message=f'"{display_title}" has been viewed {new_count} times today!',
                        data={
                            "deck_uuid": deck_uuid,
                            "deck_title": display_title,
                            "view_count": new_count,
                        },
                    )

                # Send email notification if enabled
                if prefs.get("email_on_views", True):
                    try:
                        user_result = (
                            self.supabase.table("users")
                            .select("email, full_name")
                            .eq("id", user_id)
                            .limit(1)
                            .execute()
                        )
                        if user_result.data:
                            user_email = user_result.data[0].get("email", "")
                            user_name = user_result.data[0].get("full_name") or user_email.split("@")[0]
                            deck_url = f"https://app.nextslide.ai/p/{deck_uuid}"
                            send_view_notification_email(
                                email=user_email,
                                user_name=user_name,
                                deck_title=display_title,
                                view_count=new_count,
                                deck_url=deck_url,
                            )
                    except Exception as email_err:
                        logger.error(f"Failed to send view notification email for user {user_id}: {email_err}")
        except Exception as e:
            logger.error(f"Failed to record view for deck {deck_uuid}: {e}")

    async def get_weekly_view_stats(
        self, user_id: str
    ) -> Dict[str, Any]:
        """
        Return aggregated view stats for the past 7 days for all decks owned
        by the given user.  Used by the weekly digest.
        """
        from datetime import timedelta

        week_ago = (date.today() - timedelta(days=7)).isoformat()

        try:
            result = (
                self.supabase.table("daily_view_stats")
                .select("deck_uuid, view_count, view_date")
                .eq("user_id", user_id)
                .gte("view_date", week_ago)
                .order("view_count", desc=True)
                .execute()
            )

            rows = result.data or []
            total_views = sum(r["view_count"] for r in rows)

            # Determine most-viewed deck
            deck_views: Dict[str, int] = {}
            for r in rows:
                deck_views[r["deck_uuid"]] = (
                    deck_views.get(r["deck_uuid"], 0) + r["view_count"]
                )

            most_viewed_uuid = None
            most_viewed_count = 0
            for uuid, count in deck_views.items():
                if count > most_viewed_count:
                    most_viewed_uuid = uuid
                    most_viewed_count = count

            most_viewed_title = None
            if most_viewed_uuid:
                most_viewed_title = await self._get_deck_title(most_viewed_uuid)

            return {
                "total_views": total_views,
                "most_viewed_uuid": most_viewed_uuid,
                "most_viewed_title": most_viewed_title,
                "most_viewed_count": most_viewed_count,
                "deck_count": len(deck_views),
            }
        except Exception as e:
            logger.error(f"Failed to get weekly view stats for {user_id}: {e}")
            return {
                "total_views": 0,
                "most_viewed_uuid": None,
                "most_viewed_title": None,
                "most_viewed_count": 0,
                "deck_count": 0,
            }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_deck_title(self, deck_uuid: str) -> Optional[str]:
        """Fetch the title (name) of a deck by its uuid."""
        try:
            result = (
                self.supabase.table("decks")
                .select("name")
                .eq("uuid", deck_uuid)
                .limit(1)
                .execute()
            )
            if result.data:
                return result.data[0].get("name")
            return None
        except Exception:
            return None


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
