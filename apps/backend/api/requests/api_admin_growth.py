"""
Admin Growth API
Dashboard endpoints for monitoring and configuring PLG growth features:
referrals, gamification, notifications, PQA, and viral loops.
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from services.supabase import get_supabase_client
from services.growth_config_service import get_growth_config
from api.requests.api_admin import verify_admin_role, log_admin_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/growth", tags=["Admin Growth"])


# ============================================================================
# REQUEST / RESPONSE MODELS
# ============================================================================

class ConfigUpdateRequest(BaseModel):
    key: str
    value: Any


class TestEmailRequest(BaseModel):
    email: str
    template: str  # "view_notification"


# ============================================================================
# GET /stats  -  Overview stats for the growth dashboard
# ============================================================================

@router.get("/stats")
async def get_growth_stats(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Overview stats for the growth dashboard."""
    try:
        supabase = get_supabase_client()
        stats: Dict[str, Any] = {}

        # Referral codes count
        try:
            result = supabase.table("referral_codes").select("id", count="exact").execute()
            stats["total_referral_codes"] = result.count or 0
        except Exception:
            stats["total_referral_codes"] = 0

        # Activated referrals + total credits awarded
        try:
            result = supabase.table("referrals").select("status, referrer_credits_awarded, referee_credits_awarded").execute()
            rows = result.data or []
            stats["total_referral_signups"] = len(rows)
            stats["activated_referrals"] = sum(1 for r in rows if r.get("status") in ("activated", "rewarded"))
            stats["total_referral_credits"] = sum(
                (r.get("referrer_credits_awarded") or 0) + (r.get("referee_credits_awarded") or 0)
                for r in rows
            )
        except Exception:
            stats["total_referral_signups"] = 0
            stats["activated_referrals"] = 0
            stats["total_referral_credits"] = 0

        # Badges earned
        try:
            result = supabase.table("user_badges").select("id", count="exact").execute()
            stats["total_badges_earned"] = result.count or 0
        except Exception:
            stats["total_badges_earned"] = 0

        # Active streaks
        try:
            result = supabase.table("user_streaks").select("id, current_streak").execute()
            rows = result.data or []
            stats["active_streaks"] = sum(1 for r in rows if (r.get("current_streak") or 0) > 0)
        except Exception:
            stats["active_streaks"] = 0

        # Community decks
        try:
            result = supabase.table("community_decks").select("id, status").execute()
            rows = result.data or []
            stats["community_pending"] = sum(1 for r in rows if r.get("status") == "pending")
            stats["community_approved"] = sum(1 for r in rows if r.get("status") == "approved")
            stats["community_rejected"] = sum(1 for r in rows if r.get("status") == "rejected")
        except Exception:
            stats["community_pending"] = 0
            stats["community_approved"] = 0
            stats["community_rejected"] = 0

        # Notifications sent in last 7 days
        try:
            seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
            result = (
                supabase.table("notifications")
                .select("id", count="exact")
                .gte("created_at", seven_days_ago)
                .execute()
            )
            stats["notifications_last_7d"] = result.count or 0
        except Exception:
            stats["notifications_last_7d"] = 0

        # PQA domains
        try:
            result = supabase.table("pqa_domains").select("id", count="exact").execute()
            stats["total_pqa_domains"] = result.count or 0
        except Exception:
            stats["total_pqa_domains"] = 0

        await log_admin_action(admin["id"], "view_growth_stats", request)
        return stats

    except Exception as e:
        logger.error(f"Growth stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GET /referrals
# ============================================================================

@router.get("/referrals")
async def get_referral_overview(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Referral program overview: stats, top referrers, config."""
    try:
        supabase = get_supabase_client()
        config = get_growth_config()

        # Stats
        codes_result = supabase.table("referral_codes").select("id", count="exact").execute()
        total_codes = codes_result.count or 0

        referrals_result = supabase.table("referrals").select(
            "referrer_id, status, referrer_credits_awarded, referee_credits_awarded"
        ).execute()
        rows = referrals_result.data or []

        total_signups = len(rows)
        total_activated = sum(1 for r in rows if r.get("status") in ("activated", "rewarded"))
        total_credits = sum(
            (r.get("referrer_credits_awarded") or 0) + (r.get("referee_credits_awarded") or 0)
            for r in rows
        )

        # Top 10 referrers
        referrer_counts: Dict[str, int] = {}
        for r in rows:
            rid = r.get("referrer_id")
            if rid:
                referrer_counts[rid] = referrer_counts.get(rid, 0) + 1

        sorted_referrers = sorted(referrer_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        top_referrers = []
        if sorted_referrers:
            user_ids = [u[0] for u in sorted_referrers]
            users_data = supabase.table("users").select("id, email, full_name").in_("id", user_ids).execute()
            users_map = {u["id"]: u for u in (users_data.data or [])}
            for user_id, count in sorted_referrers:
                user = users_map.get(user_id, {})
                top_referrers.append({
                    "user_id": user_id,
                    "email": user.get("email", "Unknown"),
                    "full_name": user.get("full_name"),
                    "referral_count": count,
                })

        # Config
        referral_config = {
            "referee_signup_credits": config.get_int("referral.referee_signup_credits", 25),
            "referrer_activation_credits": config.get_int("referral.referrer_activation_credits", 50),
            "enabled": config.get_bool("referral.enabled", True),
        }

        await log_admin_action(admin["id"], "view_growth_referrals", request)
        return {
            "stats": {
                "total_codes": total_codes,
                "total_signups": total_signups,
                "total_activated": total_activated,
                "total_credits": total_credits,
            },
            "top_referrers": top_referrers,
            "config": referral_config,
        }

    except Exception as e:
        logger.error(f"Referral overview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GET /gamification
# ============================================================================

@router.get("/gamification")
async def get_gamification_overview(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Gamification overview: badges, streaks, leaderboard, config."""
    try:
        supabase = get_supabase_client()
        config = get_growth_config()

        # Badge stats
        try:
            badges_result = supabase.table("user_badges").select("badge_type").execute()
            badge_rows = badges_result.data or []
            total_badges = len(badge_rows)
            badge_type_counts: Dict[str, int] = {}
            for b in badge_rows:
                bt = b.get("badge_type", "unknown")
                badge_type_counts[bt] = badge_type_counts.get(bt, 0) + 1
        except Exception:
            total_badges = 0
            badge_type_counts = {}

        badge_credit_config = {
            "first_deck": config.get_int("badges.credits.first_deck", 10),
            "streak_7": config.get_int("badges.credits.streak_7", 25),
            "streak_30": config.get_int("badges.credits.streak_30", 100),
            "community_contributor": config.get_int("badges.credits.community_contributor", 15),
            "referral_champion": config.get_int("badges.credits.referral_champion", 50),
        }

        # Streak stats
        try:
            streaks_result = supabase.table("user_streaks").select("current_streak").execute()
            streak_rows = streaks_result.data or []
            active_streaks = [r.get("current_streak", 0) for r in streak_rows if (r.get("current_streak") or 0) > 0]
            total_active_streaks = len(active_streaks)
            avg_streak_length = round(sum(active_streaks) / max(len(active_streaks), 1), 1)
        except Exception:
            total_active_streaks = 0
            avg_streak_length = 0

        streak_milestone_config = {
            "3_day_credits": config.get_int("streaks.milestone.3_day_credits", 10),
            "7_day_credits": config.get_int("streaks.milestone.7_day_credits", 25),
            "30_day_credits": config.get_int("streaks.milestone.30_day_credits", 100),
        }

        # Leaderboard top 5 (views metric, weekly)
        leaderboard = []
        try:
            seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
            views_result = (
                supabase.table("daily_view_stats")
                .select("user_id, view_count")
                .gte("view_date", seven_days_ago[:10])
                .execute()
            )
            user_views: Dict[str, int] = {}
            for r in (views_result.data or []):
                uid = r.get("user_id")
                if uid:
                    user_views[uid] = user_views.get(uid, 0) + (r.get("view_count") or 0)

            sorted_views = sorted(user_views.items(), key=lambda x: x[1], reverse=True)[:5]
            if sorted_views:
                user_ids = [u[0] for u in sorted_views]
                users_data = supabase.table("users").select("id, email, full_name").in_("id", user_ids).execute()
                users_map = {u["id"]: u for u in (users_data.data or [])}
                for uid, views in sorted_views:
                    user = users_map.get(uid, {})
                    leaderboard.append({
                        "user_id": uid,
                        "email": user.get("email", "Unknown"),
                        "full_name": user.get("full_name"),
                        "views": views,
                    })
        except Exception:
            pass

        # Reward presets (token amounts for reward modals)
        reward_config = {
            "welcome_bonus": config.get_int("rewards.welcome_bonus", 450),
            "referral_bonus": config.get_int("rewards.referral_bonus", 50),
            "achievement_bonus": config.get_int("rewards.achievement_bonus", 25),
            "promo_bonus": config.get_int("rewards.promo_bonus", 100),
        }

        # Build leaderboard_preview with name/score/rank shape
        leaderboard_preview = []
        for idx, entry in enumerate(leaderboard):
            leaderboard_preview.append({
                "name": entry.get("full_name") or entry.get("email", "Unknown"),
                "score": entry.get("views", 0),
                "rank": idx + 1,
            })

        await log_admin_action(admin["id"], "view_growth_gamification", request)
        return {
            "enabled": config.get_bool("gamification.enabled", True),
            "badge_stats": {
                "total_earned": total_badges,
                "by_type": badge_type_counts,
            },
            "badge_config": badge_credit_config,
            "streak_stats": {
                "active_streaks": total_active_streaks,
                "avg_streak": avg_streak_length,
            },
            "streak_config": streak_milestone_config,
            "leaderboard_preview": leaderboard_preview,
            "reward_config": reward_config,
        }

    except Exception as e:
        logger.error(f"Gamification overview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GET /notifications
# ============================================================================

@router.get("/notifications")
async def get_notifications_overview(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Notifications overview: stats, preferences, config."""
    try:
        supabase = get_supabase_client()
        config = get_growth_config()

        # Stats (last 7 days)
        seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        try:
            notifs_result = (
                supabase.table("notifications")
                .select("type")
                .gte("created_at", seven_days_ago)
                .execute()
            )
            notif_rows = notifs_result.data or []
            total_notifications = len(notif_rows)
            by_type: Dict[str, int] = {}
            for n in notif_rows:
                nt = n.get("type", "unknown")
                by_type[nt] = by_type.get(nt, 0) + 1
        except Exception:
            total_notifications = 0
            by_type = {}

        # Preference stats
        try:
            prefs_result = supabase.table("notification_preferences").select(
                "email_on_views, email_weekly_digest, email_on_badges, in_app_notifications"
            ).execute()
            pref_rows = prefs_result.data or []
            pref_stats = {
                "email_on_views": sum(1 for p in pref_rows if p.get("email_on_views", True)),
                "email_weekly_digest": sum(1 for p in pref_rows if p.get("email_weekly_digest", True)),
                "email_on_badges": sum(1 for p in pref_rows if p.get("email_on_badges", True)),
                "in_app_notifications": sum(1 for p in pref_rows if p.get("in_app_notifications", True)),
                "total_users_with_prefs": len(pref_rows),
            }
        except Exception:
            pref_stats = {}

        # Config
        notification_config = {
            "enabled": config.get_bool("notifications.enabled", True),
            "view_threshold": config.get_int("notifications.view_threshold", 5),
            "email_on_views": config.get_bool("notifications.email_on_views", True),
            "weekly_digest_enabled": config.get_bool("notifications.weekly_digest_enabled", True),
        }

        await log_admin_action(admin["id"], "view_growth_notifications", request)
        return {
            "stats": {
                "total_last_7d": total_notifications,
                "by_type": by_type,
            },
            "preferences": pref_stats,
            "config": notification_config,
        }

    except Exception as e:
        logger.error(f"Notifications overview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PUT /config
# ============================================================================

@router.put("/config")
async def update_growth_config(
    request: Request,
    body: ConfigUpdateRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Update a growth config value."""
    try:
        config = get_growth_config()
        success = config.update_config(body.key, body.value, admin_id=admin.get("id"))
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update config")

        await log_admin_action(admin["id"], f"update_growth_config:{body.key}", request)
        return {"success": True, "key": body.key, "value": body.value}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Config update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# POST /test-email
# ============================================================================

@router.post("/test-email")
async def send_test_email(
    request: Request,
    body: TestEmailRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Send a test email. Only allows sending to the admin's own email."""
    try:
        # Safety: only allow sending to admin's own email
        admin_email = admin.get("email", "")
        if body.email != admin_email:
            raise HTTPException(
                status_code=403,
                detail="Test emails can only be sent to your own admin email address.",
            )

        if body.template == "view_notification":
            from services.email_service import send_view_notification_email

            success = send_view_notification_email(
                email=body.email,
                user_name=admin.get("full_name") or admin_email.split("@")[0],
                deck_title="Sample Presentation",
                view_count=25,
                deck_url="https://app.nextslide.ai/p/sample-deck",
            )
            if not success:
                raise HTTPException(status_code=500, detail="Failed to send test email")
        else:
            raise HTTPException(status_code=400, detail=f"Unknown template: {body.template}")

        await log_admin_action(admin["id"], f"send_test_email:{body.template}", request)
        return {"success": True, "message": "Test email sent"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Test email error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GET /pqa
# ============================================================================

@router.get("/pqa")
async def get_pqa_overview(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """PQA overview: domains list and config."""
    try:
        supabase = get_supabase_client()
        config = get_growth_config()

        # PQA domains (top 20 by user_count desc)
        try:
            domains_result = (
                supabase.table("pqa_domains")
                .select("*")
                .order("user_count", desc=True)
                .limit(20)
                .execute()
            )
            domains = domains_result.data or []
        except Exception:
            domains = []

        pqa_config = {
            "threshold": config.get_int("pqa.threshold", 3),
            "enabled": config.get_bool("pqa.enabled", True),
        }

        await log_admin_action(admin["id"], "view_growth_pqa", request)
        return {
            "domains": domains,
            "config": pqa_config,
        }

    except Exception as e:
        logger.error(f"PQA overview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GET /viral
# ============================================================================

@router.get("/viral")
async def get_viral_overview(
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Viral loops overview: sharing stats, embed views, config."""
    try:
        supabase = get_supabase_client()
        config = get_growth_config()

        # Shared decks count
        try:
            shares_result = supabase.table("deck_shares").select("id", count="exact").execute()
            shared_decks = shares_result.count or 0
        except Exception:
            shared_decks = 0

        # Embed views (community decks count as proxy)
        try:
            community_result = supabase.table("community_decks").select("id", count="exact").execute()
            embed_views = community_result.count or 0
        except Exception:
            embed_views = 0

        # Badge impressions estimate (total badges earned as proxy)
        try:
            badges_result = supabase.table("user_badges").select("id", count="exact").execute()
            badge_impressions = badges_result.count or 0
        except Exception:
            badge_impressions = 0

        viral_config = {
            "badge_enabled": config.get_bool("viral.badge_enabled", True),
            "embed_enabled": config.get_bool("viral.embed_enabled", True),
            "og_previews_enabled": config.get_bool("viral.og_previews_enabled", True),
        }

        await log_admin_action(admin["id"], "view_growth_viral", request)
        return {
            "stats": {
                "shared_decks": shared_decks,
                "embed_views": embed_views,
                "badge_impressions": badge_impressions,
            },
            "config": viral_config,
        }

    except Exception as e:
        logger.error(f"Viral overview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# POST /notifications/broadcast  -  Admin push notification
# ============================================================================

class BroadcastNotificationRequest(BaseModel):
    title: str
    message: str
    image_url: Optional[str] = None
    target: str = "all"  # "all" or a specific user_id
    notification_type: str = "system"


@router.post("/notifications/broadcast")
async def broadcast_notification(
    request: Request,
    body: BroadcastNotificationRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Send a notification to all users or a specific user."""
    try:
        supabase = get_supabase_client()
        data: Dict[str, Any] = {}
        if body.image_url:
            data["image_url"] = body.image_url
        data["sent_by"] = admin.get("id")

        if body.target == "all":
            users_result = supabase.table("users").select("id").execute()
            user_ids = [u["id"] for u in (users_result.data or [])]
        else:
            user_ids = [body.target]

        notifications = []
        for uid in user_ids:
            notifications.append({
                "user_id": uid,
                "type": body.notification_type,
                "title": body.title,
                "message": body.message,
                "data": data,
                "read": False,
            })

        if notifications:
            for i in range(0, len(notifications), 500):
                batch = notifications[i : i + 500]
                supabase.table("notifications").insert(batch).execute()

        await log_admin_action(admin["id"], f"broadcast_notification:{body.target}", request)
        return {
            "success": True,
            "sent_to": len(user_ids),
            "title": body.title,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Broadcast notification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GET /notifications/history  -  Admin notification history
# ============================================================================

@router.get("/notifications/history")
async def get_notification_history(
    request: Request,
    page: int = 1,
    limit: int = 50,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Get recent notification history (most recent first)."""
    try:
        supabase = get_supabase_client()
        offset = (page - 1) * limit

        result = (
            supabase.table("notifications")
            .select("id, type, title, message, data, created_at, read, user_id")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        count_result = supabase.table("notifications").select("id", count="exact").execute()
        total = count_result.count or 0

        await log_admin_action(admin["id"], "view_notification_history", request)
        return {
            "notifications": result.data or [],
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit if total > 0 else 0,
        }

    except Exception as e:
        logger.error(f"Notification history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
