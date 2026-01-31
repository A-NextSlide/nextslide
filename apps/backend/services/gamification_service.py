"""
Gamification Service

Handles:
- Badge definitions and awarding
- Daily streak tracking
- Leaderboard queries
- Credit rewards for achievements
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, date, timedelta

from services.supabase import get_supabase_client
from services.growth_config_service import get_growth_config

logger = logging.getLogger(__name__)


# ============================================================================
# Badge Definitions
# ============================================================================

BADGE_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    # Creation milestones
    "first_deck": {
        "name": "First Deck",
        "description": "Created first presentation",
        "credits": 10,
        "icon": "sparkles",
        "category": "creation",
    },
    "prolific_10": {
        "name": "Prolific Creator",
        "description": "Created 10 presentations",
        "credits": 15,
        "icon": "layers",
        "category": "creation",
    },
    "prolific_25": {
        "name": "Master Creator",
        "description": "Created 25 presentations",
        "credits": 20,
        "icon": "trophy",
        "category": "creation",
    },
    "prolific_50": {
        "name": "Deck Machine",
        "description": "Created 50 presentations",
        "credits": 25,
        "icon": "zap",
        "category": "creation",
    },
    # View milestones
    "crowd_100": {
        "name": "Crowd Pleaser",
        "description": "100 total views",
        "credits": 10,
        "icon": "eye",
        "category": "views",
    },
    "crowd_500": {
        "name": "Rising Star",
        "description": "500 total views",
        "credits": 15,
        "icon": "star",
        "category": "views",
    },
    "crowd_1000": {
        "name": "View Magnet",
        "description": "1,000 total views",
        "credits": 25,
        "icon": "flame",
        "category": "views",
    },
    # Community
    "remix_master": {
        "name": "Remix Master",
        "description": "Presentation remixed 10+ times",
        "credits": 20,
        "icon": "repeat",
        "category": "community",
    },
    "community_star": {
        "name": "Community Star",
        "description": "Featured in weekly top 5",
        "credits": 25,
        "icon": "award",
        "category": "community",
    },
    "team_player": {
        "name": "Team Player",
        "description": "Invited 3+ team members",
        "credits": 15,
        "icon": "users",
        "category": "community",
    },
    "sharing_champ": {
        "name": "Sharing Champion",
        "description": "Shared 10+ presentations",
        "credits": 15,
        "icon": "share2",
        "category": "community",
    },
    # Streak badges
    "streak_3": {
        "name": "Streak Starter",
        "description": "3-day creation streak",
        "credits": 10,
        "icon": "flame",
        "category": "streak",
    },
    "streak_7": {
        "name": "Streak Master",
        "description": "7-day creation streak",
        "credits": 25,
        "icon": "flame",
        "category": "streak",
    },
    "streak_30": {
        "name": "Streak Legend",
        "description": "30-day creation streak",
        "credits": 100,
        "icon": "crown",
        "category": "streak",
    },
}

# Streak milestone rewards (days -> credits)
STREAK_MILESTONES: Dict[int, int] = {
    3: 10,
    7: 25,
    30: 100,
}


# ============================================================================
# Badge checking logic
# ============================================================================

def _get_client():
    return get_supabase_client()


async def check_and_award_badges(user_id: str) -> List[Dict[str, Any]]:
    """
    Check all badge conditions for a user and award any newly earned badges.
    Returns a list of newly awarded badges.
    """
    newly_awarded: List[Dict[str, Any]] = []

    try:
        client = _get_client()

        # Get existing badges
        existing_result = client.table("user_badges").select("badge_type").eq("user_id", user_id).execute()
        existing_badges = {row["badge_type"] for row in (existing_result.data or [])}

        # Gather user stats for badge checks
        stats = await _gather_user_stats(user_id)

        # Check each badge
        badges_to_award: List[str] = []

        # Creation milestones
        deck_count = stats.get("deck_count", 0)
        if deck_count >= 1 and "first_deck" not in existing_badges:
            badges_to_award.append("first_deck")
        if deck_count >= 10 and "prolific_10" not in existing_badges:
            badges_to_award.append("prolific_10")
        if deck_count >= 25 and "prolific_25" not in existing_badges:
            badges_to_award.append("prolific_25")
        if deck_count >= 50 and "prolific_50" not in existing_badges:
            badges_to_award.append("prolific_50")

        # View milestones
        total_views = stats.get("total_views", 0)
        if total_views >= 100 and "crowd_100" not in existing_badges:
            badges_to_award.append("crowd_100")
        if total_views >= 500 and "crowd_500" not in existing_badges:
            badges_to_award.append("crowd_500")
        if total_views >= 1000 and "crowd_1000" not in existing_badges:
            badges_to_award.append("crowd_1000")

        # Remix milestones
        max_remixes = stats.get("max_remixes", 0)
        if max_remixes >= 10 and "remix_master" not in existing_badges:
            badges_to_award.append("remix_master")

        # Team milestones
        team_invites = stats.get("team_invites", 0)
        if team_invites >= 3 and "team_player" not in existing_badges:
            badges_to_award.append("team_player")

        # Sharing milestones
        share_count = stats.get("share_count", 0)
        if share_count >= 10 and "sharing_champ" not in existing_badges:
            badges_to_award.append("sharing_champ")

        # Streak badges
        current_streak = stats.get("current_streak", 0)
        if current_streak >= 3 and "streak_3" not in existing_badges:
            badges_to_award.append("streak_3")
        if current_streak >= 7 and "streak_7" not in existing_badges:
            badges_to_award.append("streak_7")
        if current_streak >= 30 and "streak_30" not in existing_badges:
            badges_to_award.append("streak_30")

        # Award the badges
        for badge_type in badges_to_award:
            badge_def = BADGE_DEFINITIONS.get(badge_type)
            if not badge_def:
                continue

            default_credits = badge_def.get("credits", 0)
            credits = get_growth_config().get_int(
                f"badges.credits.{badge_type}", default_credits
            )

            try:
                client.table("user_badges").insert({
                    "user_id": user_id,
                    "badge_type": badge_type,
                    "credits_awarded": credits,
                }).execute()

                # Award credits if applicable
                if credits > 0:
                    await _award_credits(user_id, credits, f"Badge earned: {badge_def['name']}")

                newly_awarded.append({
                    "badge_type": badge_type,
                    **badge_def,
                })

                logger.info(f"Awarded badge '{badge_type}' to user {user_id} (+{credits} credits)")

            except Exception as e:
                # Unique constraint violation means badge already awarded (race condition)
                if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                    logger.debug(f"Badge '{badge_type}' already awarded to user {user_id}")
                else:
                    logger.error(f"Failed to award badge '{badge_type}' to user {user_id}: {e}")

    except Exception as e:
        logger.error(f"Error checking badges for user {user_id}: {e}")

    return newly_awarded


async def _gather_user_stats(user_id: str) -> Dict[str, Any]:
    """Gather all user stats needed for badge checks."""
    stats: Dict[str, Any] = {}
    client = _get_client()

    try:
        # Deck count
        deck_result = client.table("decks").select("uuid", count="exact").eq("user_id", user_id).execute()
        stats["deck_count"] = deck_result.count if deck_result.count else 0
    except Exception as e:
        logger.warning(f"Failed to get deck count for {user_id}: {e}")
        stats["deck_count"] = 0

    try:
        # Total views from community decks
        community_result = client.table("community_decks").select("view_count").eq("user_id", user_id).eq("status", "approved").execute()
        stats["total_views"] = sum(d.get("view_count", 0) for d in (community_result.data or []))
    except Exception as e:
        logger.warning(f"Failed to get view count for {user_id}: {e}")
        stats["total_views"] = 0

    try:
        # Max remixes on a single community deck
        remix_result = client.table("community_decks").select("remix_count").eq("user_id", user_id).eq("status", "approved").execute()
        remix_counts = [d.get("remix_count", 0) for d in (remix_result.data or [])]
        stats["max_remixes"] = max(remix_counts) if remix_counts else 0
    except Exception as e:
        logger.warning(f"Failed to get remix count for {user_id}: {e}")
        stats["max_remixes"] = 0

    try:
        # Team invites sent
        invite_result = client.table("invitations").select("id", count="exact").eq("invited_by_user_id", user_id).not_.is_("accepted_at", "null").execute()
        stats["team_invites"] = invite_result.count if invite_result.count else 0
    except Exception as e:
        logger.warning(f"Failed to get team invites for {user_id}: {e}")
        stats["team_invites"] = 0

    try:
        # Share count
        share_result = client.table("deck_shares").select("id", count="exact").eq("created_by", user_id).execute()
        stats["share_count"] = share_result.count if share_result.count else 0
    except Exception as e:
        logger.warning(f"Failed to get share count for {user_id}: {e}")
        stats["share_count"] = 0

    try:
        # Current streak
        streak_result = client.table("user_streaks").select("current_streak").eq("user_id", user_id).execute()
        if streak_result.data and len(streak_result.data) > 0:
            stats["current_streak"] = streak_result.data[0].get("current_streak", 0)
        else:
            stats["current_streak"] = 0
    except Exception as e:
        logger.warning(f"Failed to get streak for {user_id}: {e}")
        stats["current_streak"] = 0

    return stats


# ============================================================================
# Badge queries
# ============================================================================

async def get_user_badges(user_id: str) -> List[Dict[str, Any]]:
    """Get all badges for a user, with definition details."""
    try:
        client = _get_client()
        result = client.table("user_badges").select("*").eq("user_id", user_id).order("earned_at", desc=True).execute()

        badges = []
        for row in (result.data or []):
            badge_type = row["badge_type"]
            definition = BADGE_DEFINITIONS.get(badge_type, {})
            badges.append({
                "id": row["id"],
                "badge_type": badge_type,
                "earned_at": row["earned_at"],
                "credits_awarded": row["credits_awarded"],
                "name": definition.get("name", badge_type),
                "description": definition.get("description", ""),
                "icon": definition.get("icon", "award"),
                "category": definition.get("category", ""),
            })

        return badges

    except Exception as e:
        logger.error(f"Error getting badges for user {user_id}: {e}")
        return []


async def get_all_badge_definitions() -> List[Dict[str, Any]]:
    """Get all badge definitions for display purposes."""
    return [
        {"badge_type": key, **value}
        for key, value in BADGE_DEFINITIONS.items()
    ]


# ============================================================================
# Streak management
# ============================================================================

async def update_streak(user_id: str) -> Dict[str, Any]:
    """
    Update daily streak for a user. Call when the user performs a daily activity
    (e.g. creates a deck, logs in).
    Returns current streak info.
    """
    try:
        client = _get_client()
        today = date.today()

        # Get or create streak record
        result = client.table("user_streaks").select("*").eq("user_id", user_id).execute()

        if not result.data or len(result.data) == 0:
            # Create new streak record
            client.table("user_streaks").insert({
                "user_id": user_id,
                "current_streak": 1,
                "longest_streak": 1,
                "last_activity_date": today.isoformat(),
                "streak_credits_claimed": {},
                "updated_at": datetime.utcnow().isoformat(),
            }).execute()

            return {
                "current_streak": 1,
                "longest_streak": 1,
                "last_activity_date": today.isoformat(),
                "streak_credits_claimed": {},
                "is_new_day": True,
            }

        streak = result.data[0]
        last_date_str = streak.get("last_activity_date")
        current_streak = streak.get("current_streak", 0)
        longest_streak = streak.get("longest_streak", 0)

        # Parse last activity date
        if last_date_str:
            if isinstance(last_date_str, str):
                last_date = date.fromisoformat(last_date_str)
            else:
                last_date = last_date_str
        else:
            last_date = None

        is_new_day = False

        if last_date == today:
            # Already checked in today, no change
            pass
        elif last_date == today - timedelta(days=1):
            # Consecutive day - increment streak
            current_streak += 1
            is_new_day = True
        else:
            # Streak broken - reset to 1
            current_streak = 1
            is_new_day = True

        # Update longest streak
        if current_streak > longest_streak:
            longest_streak = current_streak

        # Update database
        client.table("user_streaks").update({
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "last_activity_date": today.isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("user_id", user_id).execute()

        return {
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "last_activity_date": today.isoformat(),
            "streak_credits_claimed": streak.get("streak_credits_claimed", {}),
            "is_new_day": is_new_day,
        }

    except Exception as e:
        logger.error(f"Error updating streak for user {user_id}: {e}")
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "last_activity_date": None,
            "streak_credits_claimed": {},
            "is_new_day": False,
        }


async def get_streak(user_id: str) -> Dict[str, Any]:
    """Get current streak data for a user."""
    try:
        client = _get_client()
        result = client.table("user_streaks").select("*").eq("user_id", user_id).execute()

        if not result.data or len(result.data) == 0:
            return {
                "current_streak": 0,
                "longest_streak": 0,
                "last_activity_date": None,
                "streak_credits_claimed": {},
            }

        streak = result.data[0]
        current_streak = streak.get("current_streak", 0)
        last_date_str = streak.get("last_activity_date")

        # Check if streak is still active (was activity yesterday or today)
        if last_date_str:
            if isinstance(last_date_str, str):
                last_date = date.fromisoformat(last_date_str)
            else:
                last_date = last_date_str

            today = date.today()
            if last_date < today - timedelta(days=1):
                # Streak has expired
                current_streak = 0

        # Compute next milestone
        config = get_growth_config()
        next_milestone = None
        next_milestone_credits = 0
        for milestone_days in sorted(STREAK_MILESTONES.keys()):
            if current_streak < milestone_days:
                next_milestone = milestone_days
                default_credits = STREAK_MILESTONES[milestone_days]
                next_milestone_credits = config.get_int(
                    f"streaks.milestone.{milestone_days}_day_credits", default_credits
                )
                break

        return {
            "current_streak": current_streak,
            "longest_streak": streak.get("longest_streak", 0),
            "last_activity_date": last_date_str,
            "streak_credits_claimed": streak.get("streak_credits_claimed", {}),
            "next_milestone": next_milestone,
            "next_milestone_credits": next_milestone_credits,
            "days_until_next": (next_milestone - current_streak) if next_milestone else None,
        }

    except Exception as e:
        logger.error(f"Error getting streak for user {user_id}: {e}")
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "last_activity_date": None,
            "streak_credits_claimed": {},
        }


async def claim_streak_reward(user_id: str, milestone: int) -> Dict[str, Any]:
    """
    Claim bonus credits for reaching a streak milestone.
    Returns success status and credits awarded.
    """
    if milestone not in STREAK_MILESTONES:
        return {"success": False, "error": f"Invalid milestone: {milestone}"}

    try:
        client = _get_client()

        # Get current streak
        result = client.table("user_streaks").select("*").eq("user_id", user_id).execute()

        if not result.data or len(result.data) == 0:
            return {"success": False, "error": "No streak data found"}

        streak = result.data[0]
        current_streak = streak.get("current_streak", 0)
        claimed = streak.get("streak_credits_claimed", {})

        # Verify streak meets milestone
        if current_streak < milestone:
            return {
                "success": False,
                "error": f"Current streak ({current_streak}) is less than milestone ({milestone})",
            }

        # Check if already claimed
        milestone_key = str(milestone)
        if claimed.get(milestone_key):
            return {"success": False, "error": "Already claimed this milestone reward"}

        # Award credits (read from growth_config, fall back to hardcoded default)
        default_credits = STREAK_MILESTONES[milestone]
        credits = get_growth_config().get_int(
            f"streaks.milestone.{milestone}_day_credits", default_credits
        )
        await _award_credits(user_id, credits, f"Streak milestone: {milestone} days")

        # Mark as claimed
        claimed[milestone_key] = datetime.utcnow().isoformat()
        client.table("user_streaks").update({
            "streak_credits_claimed": claimed,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("user_id", user_id).execute()

        logger.info(f"User {user_id} claimed streak reward: {milestone} days = {credits} credits")

        return {
            "success": True,
            "credits_awarded": credits,
            "milestone": milestone,
        }

    except Exception as e:
        logger.error(f"Error claiming streak reward for user {user_id}: {e}")
        return {"success": False, "error": "Internal error"}


# ============================================================================
# Leaderboard
# ============================================================================

_DECK_LEADERBOARD_FIELDS = (
    "id, deck_uuid, title, description, category, tags, slide_count, "
    "first_slide, thumbnail_url, author_name, remix_count, view_count, upvote_count, "
    "is_featured, approved_at"
)


async def get_leaderboard(
    period: str = "weekly",
    metric: str = "views",
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """
    Get deck leaderboard data.
    period: 'weekly' or 'all_time'
    metric: 'views' or 'remixes'
    """
    try:
        client = _get_client()

        if metric == "remixes":
            return await _leaderboard_by_remixes(client, period, limit)
        else:
            return await _leaderboard_by_views(client, period, limit)

    except Exception as e:
        logger.error(f"Error getting leaderboard: {e}")
        return []


async def _leaderboard_by_views(client, period: str, limit: int) -> List[Dict[str, Any]]:
    """Deck leaderboard ranked by view_count."""
    query = client.table("community_decks").select(
        _DECK_LEADERBOARD_FIELDS
    ).eq("status", "approved").order("view_count", desc=True).limit(limit)

    if period == "weekly":
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        query = query.gte("approved_at", week_ago)

    result = query.execute()

    entries = []
    for i, row in enumerate(result.data or []):
        entries.append({
            "rank": i + 1,
            "id": row.get("id"),
            "deck_uuid": row.get("deck_uuid"),
            "title": row.get("title"),
            "description": row.get("description"),
            "category": row.get("category"),
            "tags": row.get("tags"),
            "slide_count": row.get("slide_count"),
            "first_slide": row.get("first_slide"),
            "thumbnail_url": row.get("thumbnail_url"),
            "author_name": row.get("author_name", "Anonymous"),
            "view_count": row.get("view_count", 0),
            "remix_count": row.get("remix_count", 0),
            "upvote_count": row.get("upvote_count", 0),
            "is_featured": row.get("is_featured", False),
            "approved_at": row.get("approved_at"),
            "score": row.get("view_count", 0),
        })

    return entries


async def _leaderboard_by_remixes(client, period: str, limit: int) -> List[Dict[str, Any]]:
    """Deck leaderboard ranked by remix_count."""
    query = client.table("community_decks").select(
        _DECK_LEADERBOARD_FIELDS
    ).eq("status", "approved").order("remix_count", desc=True).limit(limit)

    if period == "weekly":
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        query = query.gte("approved_at", week_ago)

    result = query.execute()

    entries = []
    for i, row in enumerate(result.data or []):
        entries.append({
            "rank": i + 1,
            "id": row.get("id"),
            "deck_uuid": row.get("deck_uuid"),
            "title": row.get("title"),
            "description": row.get("description"),
            "category": row.get("category"),
            "tags": row.get("tags"),
            "slide_count": row.get("slide_count"),
            "first_slide": row.get("first_slide"),
            "thumbnail_url": row.get("thumbnail_url"),
            "author_name": row.get("author_name", "Anonymous"),
            "view_count": row.get("view_count", 0),
            "remix_count": row.get("remix_count", 0),
            "upvote_count": row.get("upvote_count", 0),
            "is_featured": row.get("is_featured", False),
            "approved_at": row.get("approved_at"),
            "score": row.get("remix_count", 0),
        })

    return entries


# ============================================================================
# Credit helpers
# ============================================================================

async def _award_credits(user_id: str, amount: int, description: str) -> bool:
    """Award bonus credits to a user (adds to purchased_credits)."""
    try:
        client = _get_client()

        # Get current balance
        balance_result = client.table("credit_balances").select("purchased_credits").eq("user_id", user_id).execute()

        if not balance_result.data:
            logger.warning(f"No credit balance found for user {user_id}")
            return False

        current_purchased = balance_result.data[0].get("purchased_credits", 0)
        new_purchased = current_purchased + amount

        # Update balance
        client.table("credit_balances").update({
            "purchased_credits": new_purchased,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("user_id", user_id).execute()

        # Log the transaction
        try:
            client.table("credit_transactions").insert({
                "user_id": user_id,
                "amount": amount,
                "balance_after": new_purchased,
                "transaction_type": "bonus",
                "description": description,
                "metadata": {"source": "gamification"},
            }).execute()
        except Exception as tx_err:
            logger.warning(f"Failed to log credit transaction: {tx_err}")

        logger.info(f"Awarded {amount} credits to user {user_id}: {description}")
        return True

    except Exception as e:
        logger.error(f"Failed to award credits to user {user_id}: {e}")
        return False
