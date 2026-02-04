"""Campaign audience resolution and execution."""

import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

SEND_CONCURRENCY = 5


def resolve_audience(audience: str, config: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Resolve audience type to a list of users with email addresses.

    Args:
        audience: One of 'all', 'pro', 'free', 'inactive'
        config: Optional config, e.g. {"inactivity_days": 30}

    Returns:
        List of dicts with at least {id, email}
    """
    supabase = get_supabase_client()
    config = config or {}

    if audience == "all":
        result = supabase.table("users").select("id, email").not_.is_("email", "null").execute()
        return result.data or []

    if audience == "pro":
        result = (
            supabase.table("users")
            .select("id, email")
            .not_.is_("email", "null")
            .in_("plan_id", ["pro", "starter", "enterprise"])
            .execute()
        )
        return result.data or []

    if audience == "free":
        result = (
            supabase.table("users")
            .select("id, email")
            .not_.is_("email", "null")
            .or_("plan_id.is.null,plan_id.eq.free")
            .execute()
        )
        return result.data or []

    if audience == "inactive":
        days = config.get("inactivity_days", 30)
        # Use RPC or raw filter for date math
        result = (
            supabase.rpc(
                "get_inactive_users",
                {"days_inactive": days},
            ).execute()
        )
        # Fallback: if RPC doesn't exist, fetch all and filter in Python
        if not result.data:
            all_users = (
                supabase.table("users")
                .select("id, email, last_sign_in_at")
                .not_.is_("email", "null")
                .execute()
            )
            from datetime import timedelta, timezone
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            return [
                u for u in (all_users.data or [])
                if u.get("last_sign_in_at") and datetime.fromisoformat(u["last_sign_in_at"].replace("Z", "+00:00")) < cutoff
            ]
        return result.data or []

    logger.warning(f"Unknown audience type: {audience}")
    return []


def get_audience_count(audience: str, config: Optional[Dict[str, Any]] = None) -> int:
    """Get estimated recipient count without fetching full list."""
    supabase = get_supabase_client()
    config = config or {}

    try:
        if audience == "all":
            result = supabase.table("users").select("id", count="exact").not_.is_("email", "null").execute()
            return result.count or 0

        if audience == "pro":
            result = (
                supabase.table("users")
                .select("id", count="exact")
                .not_.is_("email", "null")
                .in_("plan_id", ["pro", "starter", "enterprise"])
                .execute()
            )
            return result.count or 0

        if audience == "free":
            result = (
                supabase.table("users")
                .select("id", count="exact")
                .not_.is_("email", "null")
                .or_("plan_id.is.null,plan_id.eq.free")
                .execute()
            )
            return result.count or 0

        if audience == "inactive":
            # For inactive, we need to resolve the full list
            users = resolve_audience(audience, config)
            return len(users)

    except Exception as e:
        logger.error(f"Error getting audience count: {e}")

    return 0


async def execute_campaign(campaign_id: str) -> None:
    """Execute a campaign: resolve audience, send emails, update status.

    Args:
        campaign_id: UUID of the campaign to execute
    """
    from services.email_service import send_tracked_email

    supabase = get_supabase_client()

    # Fetch campaign
    campaign = supabase.table("email_campaigns").select("*").eq("id", campaign_id).single().execute()
    if not campaign.data:
        logger.error(f"Campaign {campaign_id} not found")
        return

    camp = campaign.data

    # Mark as sending
    supabase.table("email_campaigns").update({
        "status": "sending",
        "started_at": datetime.utcnow().isoformat(),
    }).eq("id", campaign_id).execute()

    try:
        # Fetch template
        template = None
        if camp.get("template_id"):
            template_result = supabase.table("email_templates").select("*").eq("id", camp["template_id"]).single().execute()
            template = template_result.data

        if not template:
            raise ValueError("Campaign template not found")

        # Resolve audience
        users = resolve_audience(camp["audience"], camp.get("audience_config"))
        total = len(users)

        supabase.table("email_campaigns").update({
            "total_recipients": total,
        }).eq("id", campaign_id).execute()

        if total == 0:
            supabase.table("email_campaigns").update({
                "status": "sent",
                "completed_at": datetime.utcnow().isoformat(),
            }).eq("id", campaign_id).execute()
            return

        subject = camp.get("subject_override") or template["subject"]
        html_body = template["html_body"]
        template_id = template["id"]

        sent_count = 0
        failed_count = 0

        sem = asyncio.Semaphore(SEND_CONCURRENCY)

        async def send_one(user: Dict[str, Any]):
            nonlocal sent_count, failed_count
            async with sem:
                email = user.get("email")
                if not email:
                    return
                try:
                    success = send_tracked_email(
                        to_email=email,
                        subject=subject,
                        html_body=html_body,
                        template_id=template_id,
                        campaign_id=campaign_id,
                        recipient_user_id=user.get("id"),
                    )
                    if success:
                        sent_count += 1
                    else:
                        failed_count += 1
                except Exception as e:
                    logger.error(f"Failed to send to {email}: {e}")
                    failed_count += 1

        tasks = [send_one(user) for user in users]
        await asyncio.gather(*tasks)

        # Update campaign as completed
        supabase.table("email_campaigns").update({
            "status": "sent",
            "completed_at": datetime.utcnow().isoformat(),
            "sent_count": sent_count,
            "failed_count": failed_count,
        }).eq("id", campaign_id).execute()

        logger.info(f"Campaign {campaign_id} completed: {sent_count} sent, {failed_count} failed out of {total}")

    except Exception as e:
        logger.error(f"Campaign {campaign_id} failed: {e}", exc_info=True)
        supabase.table("email_campaigns").update({
            "status": "failed",
            "error_message": str(e)[:500],
            "completed_at": datetime.utcnow().isoformat(),
        }).eq("id", campaign_id).execute()


async def check_and_execute_scheduled_campaigns() -> None:
    """Find campaigns due for sending and execute them."""
    supabase = get_supabase_client()

    try:
        now = datetime.utcnow().isoformat()
        result = (
            supabase.table("email_campaigns")
            .select("id")
            .eq("status", "scheduled")
            .lte("scheduled_at", now)
            .execute()
        )

        campaigns = result.data or []
        if not campaigns:
            return

        logger.info(f"Found {len(campaigns)} scheduled campaigns due for sending")

        for camp in campaigns:
            try:
                await execute_campaign(camp["id"])
            except Exception as e:
                logger.error(f"Error executing scheduled campaign {camp['id']}: {e}")

    except Exception as e:
        logger.error(f"Error checking scheduled campaigns: {e}", exc_info=True)
