"""
API endpoints for the gamification system.
Includes badge checking, streak tracking, and leaderboard queries.
"""

import logging
import os
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Header
import httpx

from services.gamification_service import (
    check_and_award_badges,
    get_user_badges,
    get_all_badge_definitions,
    update_streak,
    get_streak,
    claim_streak_reward,
    get_leaderboard,
    BADGE_DEFINITIONS,
)
from services.growth_config_service import get_growth_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gamification", tags=["Gamification"])


# ============================================================================
# Auth Helpers (following api_community.py pattern)
# ============================================================================

async def get_auth_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract JWT token from Authorization header."""
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "")
    return None


async def get_current_user_required(token: Optional[str] = Depends(get_auth_header)) -> Dict[str, Any]:
    """Get current user, raises 401 if not authenticated."""
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        supabase_url = os.getenv("SUPABASE_URL")
        api_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        headers = {"Authorization": f"Bearer {token}", "apikey": api_key}

        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers=headers,
            timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=2.0),
        )

        if resp.status_code == 200:
            user_json = resp.json()
            return {
                "id": user_json.get("id"),
                "email": user_json.get("email"),
                "user_metadata": user_json.get("user_metadata", {}),
            }

        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


# ============================================================================
# Helpers
# ============================================================================

def _is_gamification_enabled() -> bool:
    """Check if the gamification system is enabled via growth_config."""
    try:
        config = get_growth_config()
        return config.get_bool("gamification.enabled", True)
    except Exception:
        return True


# ============================================================================
# Status Endpoint
# ============================================================================

@router.get("/status")
async def api_gamification_status(user: Dict[str, Any] = Depends(get_current_user_required)):
    """Public (auth-required) endpoint returning whether gamification is enabled."""
    return {"enabled": _is_gamification_enabled()}


# ============================================================================
# Badge Endpoints
# ============================================================================

@router.get("/badges")
async def api_get_badges(user: Dict[str, Any] = Depends(get_current_user_required)):
    """Get the current user's earned badges and all available badge definitions."""
    all_definitions = await get_all_badge_definitions()

    if not _is_gamification_enabled():
        return {
            "earned": [],
            "all_badges": [
                {**defn, "earned": False, "earned_at": None}
                for defn in all_definitions
            ],
            "total_earned": 0,
            "total_available": len(all_definitions),
            "enabled": False,
        }

    user_id = user["id"]
    earned_badges = await get_user_badges(user_id)
    earned_types = {b["badge_type"] for b in earned_badges}

    return {
        "earned": earned_badges,
        "all_badges": [
            {
                **defn,
                "earned": defn["badge_type"] in earned_types,
                "earned_at": next(
                    (b["earned_at"] for b in earned_badges if b["badge_type"] == defn["badge_type"]),
                    None,
                ),
            }
            for defn in all_definitions
        ],
        "total_earned": len(earned_badges),
        "total_available": len(all_definitions),
        "enabled": True,
    }


@router.post("/check-badges")
async def api_check_badges(user: Dict[str, Any] = Depends(get_current_user_required)):
    """Trigger a badge check for the current user. Returns any newly awarded badges."""
    if not _is_gamification_enabled():
        return {"newly_awarded": [], "count": 0}

    user_id = user["id"]
    newly_awarded = await check_and_award_badges(user_id)

    return {
        "newly_awarded": newly_awarded,
        "count": len(newly_awarded),
    }


# ============================================================================
# Streak Endpoints
# ============================================================================

@router.get("/streak")
async def api_get_streak(user: Dict[str, Any] = Depends(get_current_user_required)):
    """Get the current user's streak information."""
    if not _is_gamification_enabled():
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "last_activity_date": None,
            "streak_credits_claimed": {},
            "next_milestone": None,
            "next_milestone_credits": 0,
            "days_until_next": None,
        }

    user_id = user["id"]
    streak_data = await get_streak(user_id)
    return streak_data


@router.post("/streak/check-in")
async def api_streak_check_in(user: Dict[str, Any] = Depends(get_current_user_required)):
    """
    Record daily activity and update streak.
    Call this after deck creation or other qualifying activities.
    """
    if not _is_gamification_enabled():
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "last_activity_date": None,
            "streak_credits_claimed": {},
            "next_milestone": None,
            "next_milestone_credits": 0,
            "days_until_next": None,
            "newly_awarded_badges": [],
        }

    user_id = user["id"]
    streak_data = await update_streak(user_id)

    # Also trigger badge check for streak badges
    newly_awarded = await check_and_award_badges(user_id)

    return {
        **streak_data,
        "newly_awarded_badges": newly_awarded,
    }


@router.post("/streak/claim/{milestone}")
async def api_claim_streak_reward(
    milestone: int,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """Claim bonus credits for reaching a streak milestone (3, 7, or 30 days)."""
    if not _is_gamification_enabled():
        raise HTTPException(
            status_code=400,
            detail="Gamification is currently disabled",
        )

    user_id = user["id"]
    result = await claim_streak_reward(user_id, milestone)

    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "Failed to claim reward"),
        )

    return result


# ============================================================================
# Leaderboard Endpoints
# ============================================================================

@router.get("/leaderboard")
async def api_get_leaderboard(
    period: str = Query("weekly", description="'weekly' or 'all_time'"),
    metric: str = Query("views", description="'views' or 'remixes'"),
    limit: int = Query(10, ge=1, le=50, description="Number of results"),
):
    """Get the deck leaderboard for a given period and metric."""
    if metric not in ("views", "remixes"):
        metric = "views"

    entries = await get_leaderboard(period=period, metric=metric, limit=limit)

    return {
        "entries": entries,
        "period": period,
        "metric": metric,
    }
