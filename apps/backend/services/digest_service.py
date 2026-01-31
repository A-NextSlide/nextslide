"""
Weekly Digest Email Service

Generates and sends weekly activity digest emails to users who have opted in.
The digest includes:
- Total views across all presentations for the past week
- Most viewed presentation with a direct link
- Number of new remixes (if any)
- CTA to create a new presentation
- Unsubscribe link

NOTE: This service provides the functions to generate and send digests.
It should be invoked via a cron job (e.g. once per week on Mondays).
Example cron trigger:
    from services.digest_service import send_all_weekly_digests
    await send_all_weekly_digests()
"""

import os
import logging
from typing import Optional, Dict, Any, List

from services.supabase import get_supabase_client
from services.notification_service import get_notification_service
from services.email_service import send_invite_email_via_resend

logger = logging.getLogger(__name__)

APP_URL = os.getenv("APP_URL", "https://app.nextslide.ai")


def _build_digest_html(
    user_name: str,
    total_views: int,
    most_viewed_title: Optional[str],
    most_viewed_uuid: Optional[str],
    most_viewed_count: int,
    deck_count: int,
    unsubscribe_url: str,
) -> str:
    """Build the branded HTML email for the weekly digest."""

    # Most-viewed section
    if most_viewed_title and most_viewed_uuid:
        presentation_url = f"{APP_URL}/deck/{most_viewed_uuid}"
        most_viewed_section = f"""
                <div style="background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                    <p style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #999;">Most Viewed</p>
                    <p style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #111;">{most_viewed_title}</p>
                    <p style="margin: 0 0 12px; color: #666; font-size: 14px;">{most_viewed_count} views this week</p>
                    <a href="{presentation_url}" style="color: #FF4301; text-decoration: none; font-weight: 500; font-size: 14px;">
                        View presentation &rarr;
                    </a>
                </div>
"""
    else:
        most_viewed_section = ""

    greeting = user_name if user_name else "there"

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="padding: 32px 40px; border-bottom: 1px solid #eee;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">Nextslide</h1>
            </div>

            <!-- Content -->
            <div style="padding: 32px 40px;">
                <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #111;">Your Weekly Activity</h2>
                <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">
                    Hi {greeting}, here's how your presentations performed this week.
                </p>

                <!-- Stats row -->
                <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                    <div style="flex: 1; background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 16px; text-align: center;">
                        <p style="margin: 0 0 4px; font-size: 28px; font-weight: 700; color: #111;">{total_views}</p>
                        <p style="margin: 0; font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Total Views</p>
                    </div>
                    <div style="flex: 1; background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 16px; text-align: center;">
                        <p style="margin: 0 0 4px; font-size: 28px; font-weight: 700; color: #111;">{deck_count}</p>
                        <p style="margin: 0; font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Presentations Viewed</p>
                    </div>
                </div>

                {most_viewed_section}

                <!-- CTA Button -->
                <a href="{APP_URL}" style="display: inline-block; padding: 14px 28px; background: #FF4301; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">
                    Create Your Next Presentation
                </a>
            </div>

            <!-- Footer -->
            <div style="padding: 24px 40px; background: #fafafa; border-top: 1px solid #eee;">
                <p style="margin: 0 0 8px; color: #999; font-size: 12px;">
                    &copy; Nextslide. Create beautiful presentations with AI.
                </p>
                <p style="margin: 0; font-size: 12px;">
                    <a href="{unsubscribe_url}" style="color: #999; text-decoration: underline;">
                        Unsubscribe from weekly digest
                    </a>
                </p>
            </div>
        </div>
    </body>
    </html>
    """


async def generate_weekly_digest(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Compile weekly stats for a single user.

    Returns a dict with digest data, or None if the user has no activity.
    """
    ns = get_notification_service()
    stats = await ns.get_weekly_view_stats(user_id)

    if stats["total_views"] == 0:
        return None

    return {
        "user_id": user_id,
        "total_views": stats["total_views"],
        "most_viewed_uuid": stats["most_viewed_uuid"],
        "most_viewed_title": stats["most_viewed_title"],
        "most_viewed_count": stats["most_viewed_count"],
        "deck_count": stats["deck_count"],
    }


async def send_weekly_digest(user_id: str) -> bool:
    """
    Generate and send the weekly digest email for a single user.

    Returns True if the email was sent (or skipped because no activity),
    False on error.
    """
    try:
        supabase = get_supabase_client()

        # Get user details
        user_result = supabase.auth.admin.get_user_by_id(user_id)
        if not user_result or not user_result.user:
            logger.warning(f"Could not find user {user_id} for digest")
            return False

        user = user_result.user
        email = user.email
        if not email:
            return False

        user_name = (user.user_metadata or {}).get("full_name", "")

        # Generate digest data
        digest = await generate_weekly_digest(user_id)
        if digest is None:
            logger.info(f"No weekly activity for user {user_id}, skipping digest")
            return True  # Not an error, just no data

        unsubscribe_url = f"{APP_URL}/profile?tab=notifications"

        html = _build_digest_html(
            user_name=user_name,
            total_views=digest["total_views"],
            most_viewed_title=digest["most_viewed_title"],
            most_viewed_uuid=digest["most_viewed_uuid"],
            most_viewed_count=digest["most_viewed_count"],
            deck_count=digest["deck_count"],
            unsubscribe_url=unsubscribe_url,
        )

        subject = f"Your week on Nextslide: {digest['total_views']} views"
        success = send_invite_email_via_resend(email, subject, html)
        if success:
            logger.info(f"Weekly digest sent to {email} ({digest['total_views']} views)")
        else:
            logger.error(f"Failed to send weekly digest to {email}")
        return success

    except Exception as e:
        logger.error(f"Error sending weekly digest for {user_id}: {e}", exc_info=True)
        return False


async def send_all_weekly_digests() -> Dict[str, int]:
    """
    Iterate over all users who have the weekly digest enabled and send
    their digest emails.

    Returns a summary dict: {"sent": N, "skipped": N, "failed": N}

    Call this from a weekly cron job, e.g.:
        import asyncio
        from services.digest_service import send_all_weekly_digests
        asyncio.run(send_all_weekly_digests())
    """
    supabase = get_supabase_client()
    sent = 0
    skipped = 0
    failed = 0

    try:
        # Get all users who have digest enabled
        prefs_result = (
            supabase.table("notification_preferences")
            .select("user_id")
            .eq("email_weekly_digest", True)
            .execute()
        )

        user_ids = [row["user_id"] for row in (prefs_result.data or [])]

        # Also include users without a preferences row (defaults to enabled)
        # Find users that have at least one daily_view_stats row but no
        # preferences row with digest disabled
        all_view_users_result = (
            supabase.table("daily_view_stats")
            .select("user_id")
            .execute()
        )
        all_view_user_ids = set(
            row["user_id"] for row in (all_view_users_result.data or [])
        )

        # Users who explicitly disabled
        disabled_result = (
            supabase.table("notification_preferences")
            .select("user_id")
            .eq("email_weekly_digest", False)
            .execute()
        )
        disabled_ids = set(
            row["user_id"] for row in (disabled_result.data or [])
        )

        # Merge: explicit opt-ins + anyone with views who hasn't opted out
        target_ids = set(user_ids) | (all_view_user_ids - disabled_ids)

        logger.info(f"Sending weekly digests to {len(target_ids)} users")

        for uid in target_ids:
            try:
                success = await send_weekly_digest(uid)
                if success:
                    sent += 1
                else:
                    failed += 1
            except Exception as e:
                logger.error(f"Digest failed for {uid}: {e}")
                failed += 1

    except Exception as e:
        logger.error(f"Failed to run weekly digest batch: {e}", exc_info=True)

    summary = {"sent": sent, "skipped": skipped, "failed": failed}
    logger.info(f"Weekly digest summary: {summary}")
    return summary
