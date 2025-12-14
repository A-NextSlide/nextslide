"""
Comprehensive Admin Analytics API
Provides deep analytics capabilities for data-driven decision making
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta, date
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel
from services.supabase import get_supabase_client
from api.requests.api_admin import verify_admin_role, log_admin_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/analytics", tags=["Admin Analytics"])


# ============================================================================
# MODELS
# ============================================================================

class DateRangeParams(BaseModel):
    start_date: str
    end_date: str
    granularity: str = "day"  # hour, day, week, month


class TimeSeriesPoint(BaseModel):
    timestamp: str
    value: float
    label: Optional[str] = None


class MetricWithChange(BaseModel):
    current: float
    previous: float
    change_percent: float
    trend: str  # up, down, flat


class UserSegment(BaseModel):
    segment: str
    count: int
    percentage: float


class CohortRow(BaseModel):
    cohort: str
    size: int
    retention: List[float]


class TopUser(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    metric_value: float
    metric_label: str


class CreditUsageByType(BaseModel):
    type: str
    total_credits: float
    transaction_count: int
    percentage: float


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def parse_date(date_str: str) -> datetime:
    """Parse date string to datetime"""
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except:
        return datetime.strptime(date_str, "%Y-%m-%d")


def get_date_range_filter(start_date: str, end_date: str):
    """Convert date strings to datetime objects for filtering"""
    start = parse_date(start_date)
    end = parse_date(end_date)
    # Ensure end date includes the full day
    if end.hour == 0 and end.minute == 0:
        end = end.replace(hour=23, minute=59, second=59)
    return start, end


def calculate_change(current: float, previous: float) -> tuple:
    """Calculate percentage change and trend"""
    if previous == 0:
        if current > 0:
            return 100.0, "up"
        return 0.0, "flat"

    change = ((current - previous) / previous) * 100
    trend = "up" if change > 0 else "down" if change < 0 else "flat"
    return round(change, 1), trend


def generate_date_series(start: datetime, end: datetime, granularity: str) -> List[datetime]:
    """Generate a series of dates between start and end"""
    dates = []
    current = start

    if granularity == "hour":
        delta = timedelta(hours=1)
    elif granularity == "week":
        delta = timedelta(weeks=1)
    elif granularity == "month":
        delta = timedelta(days=30)
    else:  # day
        delta = timedelta(days=1)

    while current <= end:
        dates.append(current)
        current += delta

    return dates


# ============================================================================
# OVERVIEW METRICS
# ============================================================================

@router.get("/overview")
async def get_analytics_overview(
    request: Request,
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    compare: bool = Query(True, description="Include comparison with previous period"),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get comprehensive overview metrics with period comparison
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)
        period_days = (end - start).days + 1

        # Previous period for comparison
        prev_end = start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=period_days - 1)

        metrics = {}

        # ---- USER METRICS ----
        # Current period signups
        signups_current = supabase.table("users").select("id", count="exact").gte(
            "created_at", start.isoformat()
        ).lte("created_at", end.isoformat()).execute()

        # Previous period signups
        signups_prev = supabase.table("users").select("id", count="exact").gte(
            "created_at", prev_start.isoformat()
        ).lte("created_at", prev_end.isoformat()).execute()

        signups_change, signups_trend = calculate_change(
            signups_current.count or 0,
            signups_prev.count or 0
        )

        # Total users
        total_users = supabase.table("users").select("id", count="exact").execute()

        # Active users in period
        active_users = supabase.table("users").select("id", count="exact").gte(
            "last_sign_in_at", start.isoformat()
        ).execute()

        metrics["users"] = {
            "total": total_users.count or 0,
            "new_signups": {
                "current": signups_current.count or 0,
                "previous": signups_prev.count or 0,
                "change_percent": signups_change,
                "trend": signups_trend
            },
            "active_in_period": active_users.count or 0
        }

        # ---- DECK METRICS ----
        decks_current = supabase.table("decks").select("uuid", count="exact").gte(
            "created_at", start.isoformat()
        ).lte("created_at", end.isoformat()).execute()

        decks_prev = supabase.table("decks").select("uuid", count="exact").gte(
            "created_at", prev_start.isoformat()
        ).lte("created_at", prev_end.isoformat()).execute()

        decks_change, decks_trend = calculate_change(
            decks_current.count or 0,
            decks_prev.count or 0
        )

        total_decks = supabase.table("decks").select("uuid", count="exact").execute()

        metrics["decks"] = {
            "total": total_decks.count or 0,
            "created": {
                "current": decks_current.count or 0,
                "previous": decks_prev.count or 0,
                "change_percent": decks_change,
                "trend": decks_trend
            }
        }

        # ---- CREDIT METRICS ----
        try:
            credits_used_current = supabase.table("credit_transactions").select(
                "amount"
            ).lt("amount", 0).gte(
                "created_at", start.isoformat()
            ).lte("created_at", end.isoformat()).execute()

            credits_used_prev = supabase.table("credit_transactions").select(
                "amount"
            ).lt("amount", 0).gte(
                "created_at", prev_start.isoformat()
            ).lte("created_at", prev_end.isoformat()).execute()

            current_credits = abs(sum(t.get("amount", 0) for t in credits_used_current.data)) if credits_used_current.data else 0
            prev_credits = abs(sum(t.get("amount", 0) for t in credits_used_prev.data)) if credits_used_prev.data else 0

            credits_change, credits_trend = calculate_change(current_credits, prev_credits)

            metrics["credits"] = {
                "used": {
                    "current": current_credits,
                    "previous": prev_credits,
                    "change_percent": credits_change,
                    "trend": credits_trend
                }
            }
        except Exception as e:
            logger.warning(f"Could not fetch credit metrics: {e}")
            metrics["credits"] = {"used": {"current": 0, "previous": 0, "change_percent": 0, "trend": "flat"}}

        # ---- SHARING METRICS ----
        try:
            shares_current = supabase.table("deck_shares").select("id", count="exact").gte(
                "created_at", start.isoformat()
            ).lte("created_at", end.isoformat()).execute()

            shares_prev = supabase.table("deck_shares").select("id", count="exact").gte(
                "created_at", prev_start.isoformat()
            ).lte("created_at", prev_end.isoformat()).execute()

            shares_change, shares_trend = calculate_change(
                shares_current.count or 0,
                shares_prev.count or 0
            )

            metrics["sharing"] = {
                "shares_created": {
                    "current": shares_current.count or 0,
                    "previous": shares_prev.count or 0,
                    "change_percent": shares_change,
                    "trend": shares_trend
                }
            }
        except:
            metrics["sharing"] = {"shares_created": {"current": 0, "previous": 0, "change_percent": 0, "trend": "flat"}}

        await log_admin_action(admin["id"], "view_analytics_overview", request)

        return {
            "period": {"start": start_date, "end": end_date, "days": period_days},
            "comparison_period": {"start": prev_start.strftime("%Y-%m-%d"), "end": prev_end.strftime("%Y-%m-%d")},
            "metrics": metrics
        }

    except Exception as e:
        logger.error(f"Analytics overview error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# TIME SERIES DATA
# ============================================================================

@router.get("/timeseries/users")
async def get_user_timeseries(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    granularity: str = Query("day", enum=["hour", "day", "week", "month"]),
    metric: str = Query("signups", enum=["signups", "logins", "active", "cumulative"]),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get user metrics as time series data
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)

        data_points = []
        dates = generate_date_series(start, end, granularity)

        for i, date_point in enumerate(dates):
            if granularity == "hour":
                next_point = date_point + timedelta(hours=1)
                label = date_point.strftime("%H:%M")
            elif granularity == "week":
                next_point = date_point + timedelta(weeks=1)
                label = f"Week {date_point.isocalendar()[1]}"
            elif granularity == "month":
                next_point = date_point + timedelta(days=30)
                label = date_point.strftime("%b %Y")
            else:
                next_point = date_point + timedelta(days=1)
                label = date_point.strftime("%b %d")

            if metric == "signups":
                result = supabase.table("users").select("id", count="exact").gte(
                    "created_at", date_point.isoformat()
                ).lt("created_at", next_point.isoformat()).execute()
                value = result.count or 0

            elif metric == "logins":
                # Try RPC first, fall back to last_sign_in_at
                try:
                    login_data = supabase.rpc("get_daily_login_counts", {"days_back": 30}).execute()
                    date_str = date_point.strftime("%Y-%m-%d")
                    value = next((r.get("login_count", 0) for r in (login_data.data or [])
                                 if r.get("login_date") == date_str), 0)
                except:
                    result = supabase.table("users").select("id", count="exact").gte(
                        "last_sign_in_at", date_point.isoformat()
                    ).lt("last_sign_in_at", next_point.isoformat()).execute()
                    value = result.count or 0

            elif metric == "active":
                result = supabase.table("users").select("id", count="exact").gte(
                    "last_sign_in_at", date_point.isoformat()
                ).lt("last_sign_in_at", next_point.isoformat()).execute()
                value = result.count or 0

            elif metric == "cumulative":
                result = supabase.table("users").select("id", count="exact").lt(
                    "created_at", next_point.isoformat()
                ).execute()
                value = result.count or 0

            data_points.append({
                "timestamp": date_point.isoformat(),
                "value": value,
                "label": label
            })

        return {
            "metric": metric,
            "granularity": granularity,
            "data": data_points
        }

    except Exception as e:
        logger.error(f"User timeseries error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeseries/decks")
async def get_deck_timeseries(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    granularity: str = Query("day", enum=["hour", "day", "week", "month"]),
    metric: str = Query("created", enum=["created", "cumulative", "slides"]),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get deck metrics as time series data
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)

        data_points = []
        dates = generate_date_series(start, end, granularity)

        for date_point in dates:
            if granularity == "hour":
                next_point = date_point + timedelta(hours=1)
                label = date_point.strftime("%H:%M")
            elif granularity == "week":
                next_point = date_point + timedelta(weeks=1)
                label = f"Week {date_point.isocalendar()[1]}"
            elif granularity == "month":
                next_point = date_point + timedelta(days=30)
                label = date_point.strftime("%b %Y")
            else:
                next_point = date_point + timedelta(days=1)
                label = date_point.strftime("%b %d")

            if metric == "created":
                result = supabase.table("decks").select("uuid", count="exact").gte(
                    "created_at", date_point.isoformat()
                ).lt("created_at", next_point.isoformat()).execute()
                value = result.count or 0

            elif metric == "cumulative":
                result = supabase.table("decks").select("uuid", count="exact").lt(
                    "created_at", next_point.isoformat()
                ).execute()
                value = result.count or 0

            elif metric == "slides":
                # Get decks created in this period and count their slides
                result = supabase.table("decks").select("slides").gte(
                    "created_at", date_point.isoformat()
                ).lt("created_at", next_point.isoformat()).execute()
                value = sum(len(d.get("slides", [])) for d in (result.data or []))

            data_points.append({
                "timestamp": date_point.isoformat(),
                "value": value,
                "label": label
            })

        return {
            "metric": metric,
            "granularity": granularity,
            "data": data_points
        }

    except Exception as e:
        logger.error(f"Deck timeseries error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeseries/credits")
async def get_credit_timeseries(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    granularity: str = Query("day", enum=["hour", "day", "week", "month"]),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get credit usage as time series data
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)

        data_points = []
        dates = generate_date_series(start, end, granularity)

        for date_point in dates:
            if granularity == "hour":
                next_point = date_point + timedelta(hours=1)
                label = date_point.strftime("%H:%M")
            elif granularity == "week":
                next_point = date_point + timedelta(weeks=1)
                label = f"Week {date_point.isocalendar()[1]}"
            elif granularity == "month":
                next_point = date_point + timedelta(days=30)
                label = date_point.strftime("%b %Y")
            else:
                next_point = date_point + timedelta(days=1)
                label = date_point.strftime("%b %d")

            result = supabase.table("credit_transactions").select("amount").lt(
                "amount", 0
            ).gte(
                "created_at", date_point.isoformat()
            ).lt("created_at", next_point.isoformat()).execute()

            value = abs(sum(t.get("amount", 0) for t in (result.data or [])))

            data_points.append({
                "timestamp": date_point.isoformat(),
                "value": value,
                "label": label
            })

        return {
            "metric": "credits_used",
            "granularity": granularity,
            "data": data_points
        }

    except Exception as e:
        logger.error(f"Credit timeseries error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# USER ANALYTICS
# ============================================================================

@router.get("/users/segments")
async def get_user_segments(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    segment_by: str = Query("activity", enum=["activity", "plan", "role", "signup_source"]),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Segment users by various criteria
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)

        segments = []

        if segment_by == "activity":
            # Segment by activity level
            total = supabase.table("users").select("id", count="exact").execute()
            total_count = total.count or 1

            # Power users (logged in last 7 days AND have 5+ decks)
            now = datetime.utcnow()
            week_ago = now - timedelta(days=7)

            active_recent = supabase.table("users").select("id", count="exact").gte(
                "last_sign_in_at", week_ago.isoformat()
            ).execute()

            month_ago = now - timedelta(days=30)
            active_month = supabase.table("users").select("id", count="exact").gte(
                "last_sign_in_at", month_ago.isoformat()
            ).lt("last_sign_in_at", week_ago.isoformat()).execute()

            inactive = supabase.table("users").select("id", count="exact").lt(
                "last_sign_in_at", month_ago.isoformat()
            ).execute()

            never_active = supabase.table("users").select("id", count="exact").is_(
                "last_sign_in_at", "null"
            ).execute()

            segments = [
                {"segment": "Active (7d)", "count": active_recent.count or 0,
                 "percentage": round(((active_recent.count or 0) / total_count) * 100, 1)},
                {"segment": "Recent (30d)", "count": active_month.count or 0,
                 "percentage": round(((active_month.count or 0) / total_count) * 100, 1)},
                {"segment": "Inactive", "count": inactive.count or 0,
                 "percentage": round(((inactive.count or 0) / total_count) * 100, 1)},
                {"segment": "Never Active", "count": never_active.count or 0,
                 "percentage": round(((never_active.count or 0) / total_count) * 100, 1)},
            ]

        elif segment_by == "plan":
            # Segment by subscription plan
            try:
                subscriptions = supabase.table("subscriptions").select(
                    "plan_id, user_id"
                ).eq("status", "active").execute()

                plan_counts = {}
                for sub in (subscriptions.data or []):
                    plan = sub.get("plan_id", "unknown")
                    plan_counts[plan] = plan_counts.get(plan, 0) + 1

                total_subscribed = sum(plan_counts.values())
                total_users = supabase.table("users").select("id", count="exact").execute()
                free_users = (total_users.count or 0) - total_subscribed

                segments = [{"segment": "Free", "count": free_users,
                            "percentage": round((free_users / max(total_users.count or 1, 1)) * 100, 1)}]

                for plan, count in plan_counts.items():
                    segments.append({
                        "segment": plan.replace("_", " ").title(),
                        "count": count,
                        "percentage": round((count / max(total_users.count or 1, 1)) * 100, 1)
                    })
            except:
                segments = [{"segment": "Free", "count": 0, "percentage": 100}]

        elif segment_by == "role":
            roles = supabase.table("users").select("role").execute()
            role_counts = {}
            for user in (roles.data or []):
                role = user.get("role", "user")
                role_counts[role] = role_counts.get(role, 0) + 1

            total = sum(role_counts.values()) or 1
            segments = [
                {"segment": role.replace("_", " ").title(), "count": count,
                 "percentage": round((count / total) * 100, 1)}
                for role, count in role_counts.items()
            ]

        return {"segment_by": segment_by, "segments": segments}

    except Exception as e:
        logger.error(f"User segments error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/cohorts")
async def get_user_cohorts(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    cohort_size: str = Query("week", enum=["day", "week", "month"]),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get cohort retention analysis
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)

        cohorts = []

        # Determine cohort boundaries
        if cohort_size == "week":
            delta = timedelta(weeks=1)
            date_format = "Week of %b %d"
        elif cohort_size == "month":
            delta = timedelta(days=30)
            date_format = "%b %Y"
        else:
            delta = timedelta(days=1)
            date_format = "%b %d"

        current_cohort_start = start
        cohort_num = 0

        while current_cohort_start < end and cohort_num < 12:  # Max 12 cohorts
            cohort_end = current_cohort_start + delta

            # Get users in this cohort
            cohort_users = supabase.table("users").select("id, last_sign_in_at").gte(
                "created_at", current_cohort_start.isoformat()
            ).lt("created_at", cohort_end.isoformat()).execute()

            cohort_size_count = len(cohort_users.data) if cohort_users.data else 0

            if cohort_size_count > 0:
                # Calculate retention for subsequent periods
                retention = []
                for period in range(8):  # Track 8 periods
                    retention_start = current_cohort_start + (delta * period)
                    retention_end = retention_start + delta

                    if retention_end > datetime.utcnow():
                        break

                    # Count users from this cohort who were active in this period
                    active_count = 0
                    for user in cohort_users.data:
                        last_sign_in = user.get("last_sign_in_at")
                        if last_sign_in:
                            try:
                                sign_in_dt = parse_date(last_sign_in)
                                if retention_start <= sign_in_dt < retention_end:
                                    active_count += 1
                            except:
                                pass

                    retention_rate = round((active_count / cohort_size_count) * 100, 1)
                    retention.append(retention_rate)

                cohorts.append({
                    "cohort": current_cohort_start.strftime(date_format),
                    "size": cohort_size_count,
                    "retention": retention
                })

            current_cohort_start = cohort_end
            cohort_num += 1

        return {
            "cohort_size": cohort_size,
            "periods": ["Period 0", "Period 1", "Period 2", "Period 3", "Period 4", "Period 5", "Period 6", "Period 7"][:max(len(c.get("retention", [])) for c in cohorts) if cohorts else 1],
            "cohorts": cohorts
        }

    except Exception as e:
        logger.error(f"Cohort analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/top")
async def get_top_users(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    metric: str = Query("decks", enum=["decks", "credits", "logins", "shares"]),
    limit: int = Query(20, ge=1, le=100),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get top users by various metrics
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)

        top_users = []

        if metric == "decks":
            # Get users with most decks created in period
            decks = supabase.table("decks").select("user_id").gte(
                "created_at", start.isoformat()
            ).lte("created_at", end.isoformat()).execute()

            user_deck_counts = {}
            for deck in (decks.data or []):
                user_id = deck.get("user_id")
                if user_id:
                    user_deck_counts[user_id] = user_deck_counts.get(user_id, 0) + 1

            # Sort and get top users
            sorted_users = sorted(user_deck_counts.items(), key=lambda x: x[1], reverse=True)[:limit]

            if sorted_users:
                user_ids = [u[0] for u in sorted_users]
                users_data = supabase.table("users").select("id, email, full_name").in_("id", user_ids).execute()
                users_map = {u["id"]: u for u in (users_data.data or [])}

                for user_id, count in sorted_users:
                    user = users_map.get(user_id, {})
                    top_users.append({
                        "id": user_id,
                        "email": user.get("email", "Unknown"),
                        "full_name": user.get("full_name"),
                        "metric_value": count,
                        "metric_label": "decks created"
                    })

        elif metric == "credits":
            # Get users with most credits consumed
            transactions = supabase.table("credit_transactions").select("user_id, amount").lt(
                "amount", 0
            ).gte("created_at", start.isoformat()).lte("created_at", end.isoformat()).execute()

            user_credits = {}
            for tx in (transactions.data or []):
                user_id = tx.get("user_id")
                if user_id:
                    user_credits[user_id] = user_credits.get(user_id, 0) + abs(tx.get("amount", 0))

            sorted_users = sorted(user_credits.items(), key=lambda x: x[1], reverse=True)[:limit]

            if sorted_users:
                user_ids = [u[0] for u in sorted_users]
                users_data = supabase.table("users").select("id, email, full_name").in_("id", user_ids).execute()
                users_map = {u["id"]: u for u in (users_data.data or [])}

                for user_id, amount in sorted_users:
                    user = users_map.get(user_id, {})
                    top_users.append({
                        "id": user_id,
                        "email": user.get("email", "Unknown"),
                        "full_name": user.get("full_name"),
                        "metric_value": amount,
                        "metric_label": "credits used"
                    })

        elif metric == "shares":
            # Get users with most shares created
            shares = supabase.table("deck_shares").select("created_by").gte(
                "created_at", start.isoformat()
            ).lte("created_at", end.isoformat()).execute()

            user_share_counts = {}
            for share in (shares.data or []):
                user_id = share.get("created_by")
                if user_id:
                    user_share_counts[user_id] = user_share_counts.get(user_id, 0) + 1

            sorted_users = sorted(user_share_counts.items(), key=lambda x: x[1], reverse=True)[:limit]

            if sorted_users:
                user_ids = [u[0] for u in sorted_users]
                users_data = supabase.table("users").select("id, email, full_name").in_("id", user_ids).execute()
                users_map = {u["id"]: u for u in (users_data.data or [])}

                for user_id, count in sorted_users:
                    user = users_map.get(user_id, {})
                    top_users.append({
                        "id": user_id,
                        "email": user.get("email", "Unknown"),
                        "full_name": user.get("full_name"),
                        "metric_value": count,
                        "metric_label": "shares created"
                    })

        return {
            "metric": metric,
            "period": {"start": start_date, "end": end_date},
            "users": top_users
        }

    except Exception as e:
        logger.error(f"Top users error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CONTENT ANALYTICS
# ============================================================================

@router.get("/content/distribution")
async def get_content_distribution(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get content distribution analytics
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)

        # Get decks created in period
        decks = supabase.table("decks").select("slides, visibility").gte(
            "created_at", start.isoformat()
        ).lte("created_at", end.isoformat()).execute()

        # Slide count distribution
        slide_counts = [len(d.get("slides", [])) for d in (decks.data or [])]

        # Group into buckets
        buckets = {"1-5": 0, "6-10": 0, "11-20": 0, "21-50": 0, "50+": 0}
        for count in slide_counts:
            if count <= 5:
                buckets["1-5"] += 1
            elif count <= 10:
                buckets["6-10"] += 1
            elif count <= 20:
                buckets["11-20"] += 1
            elif count <= 50:
                buckets["21-50"] += 1
            else:
                buckets["50+"] += 1

        total_decks = len(slide_counts) or 1
        slide_distribution = [
            {"bucket": k, "count": v, "percentage": round((v / total_decks) * 100, 1)}
            for k, v in buckets.items()
        ]

        # Visibility distribution
        visibility_counts = {"private": 0, "public": 0, "unlisted": 0}
        for deck in (decks.data or []):
            vis = deck.get("visibility", "private")
            visibility_counts[vis] = visibility_counts.get(vis, 0) + 1

        visibility_distribution = [
            {"visibility": k, "count": v, "percentage": round((v / total_decks) * 100, 1)}
            for k, v in visibility_counts.items()
        ]

        return {
            "period": {"start": start_date, "end": end_date},
            "total_decks": len(decks.data or []),
            "total_slides": sum(slide_counts),
            "avg_slides_per_deck": round(sum(slide_counts) / max(len(slide_counts), 1), 1),
            "slide_count_distribution": slide_distribution,
            "visibility_distribution": visibility_distribution
        }

    except Exception as e:
        logger.error(f"Content distribution error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/content/sharing")
async def get_sharing_analytics(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get sharing and collaboration analytics
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)

        # Get shares in period
        shares = supabase.table("deck_shares").select(
            "id, share_type, access_count, created_at"
        ).gte("created_at", start.isoformat()).lte("created_at", end.isoformat()).execute()

        share_data = shares.data or []

        # Share type distribution
        share_types = {"view": 0, "edit": 0}
        total_access = 0
        for share in share_data:
            st = share.get("share_type", "view")
            share_types[st] = share_types.get(st, 0) + 1
            total_access += share.get("access_count", 0)

        # Get view events if available
        try:
            view_events = supabase.table("share_view_events").select(
                "id, duration_seconds, slides_viewed, device_type"
            ).gte("started_at", start.isoformat()).lte("started_at", end.isoformat()).execute()

            views = view_events.data or []
            avg_duration = sum(v.get("duration_seconds", 0) for v in views) / max(len(views), 1)
            avg_slides = sum(v.get("slides_viewed", 0) for v in views) / max(len(views), 1)

            device_breakdown = {}
            for v in views:
                device = v.get("device_type", "unknown")
                device_breakdown[device] = device_breakdown.get(device, 0) + 1
        except:
            avg_duration = 0
            avg_slides = 0
            device_breakdown = {}

        return {
            "period": {"start": start_date, "end": end_date},
            "shares_created": len(share_data),
            "total_share_views": total_access,
            "share_type_distribution": [
                {"type": k, "count": v, "percentage": round((v / max(len(share_data), 1)) * 100, 1)}
                for k, v in share_types.items()
            ],
            "avg_view_duration_seconds": round(avg_duration, 1),
            "avg_slides_viewed": round(avg_slides, 1),
            "device_breakdown": [
                {"device": k, "count": v} for k, v in device_breakdown.items()
            ]
        }

    except Exception as e:
        logger.error(f"Sharing analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CREDIT ANALYTICS
# ============================================================================

@router.get("/credits/breakdown")
async def get_credit_breakdown(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get detailed credit usage breakdown
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)

        # Get all credit transactions in period
        transactions = supabase.table("credit_transactions").select(
            "transaction_type, amount"
        ).gte("created_at", start.isoformat()).lte("created_at", end.isoformat()).execute()

        tx_data = transactions.data or []

        # Separate consumption and additions
        consumption_by_type = {}
        additions_by_type = {}

        for tx in tx_data:
            tx_type = tx.get("transaction_type", "unknown")
            amount = tx.get("amount", 0)

            if amount < 0:
                consumption_by_type[tx_type] = consumption_by_type.get(tx_type, 0) + abs(amount)
            else:
                additions_by_type[tx_type] = additions_by_type.get(tx_type, 0) + amount

        total_consumed = sum(consumption_by_type.values()) or 1
        total_added = sum(additions_by_type.values()) or 1

        consumption_breakdown = [
            {
                "type": k.replace("_", " ").title(),
                "total_credits": v,
                "transaction_count": sum(1 for t in tx_data if t.get("transaction_type") == k and t.get("amount", 0) < 0),
                "percentage": round((v / total_consumed) * 100, 1)
            }
            for k, v in sorted(consumption_by_type.items(), key=lambda x: x[1], reverse=True)
        ]

        additions_breakdown = [
            {
                "type": k.replace("_", " ").title(),
                "total_credits": v,
                "transaction_count": sum(1 for t in tx_data if t.get("transaction_type") == k and t.get("amount", 0) > 0),
                "percentage": round((v / total_added) * 100, 1)
            }
            for k, v in sorted(additions_by_type.items(), key=lambda x: x[1], reverse=True)
        ]

        return {
            "period": {"start": start_date, "end": end_date},
            "total_consumed": sum(consumption_by_type.values()),
            "total_added": sum(additions_by_type.values()),
            "net_change": sum(additions_by_type.values()) - sum(consumption_by_type.values()),
            "consumption_breakdown": consumption_breakdown,
            "additions_breakdown": additions_breakdown
        }

    except Exception as e:
        logger.error(f"Credit breakdown error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# REAL-TIME / RECENT ACTIVITY
# ============================================================================

@router.get("/activity/recent")
async def get_recent_activity(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get recent platform activity
    """
    try:
        supabase = get_supabase_client()

        activities = []

        # Recent signups
        signups = supabase.table("users").select(
            "id, email, full_name, created_at"
        ).order("created_at", desc=True).limit(limit // 4).execute()

        for user in (signups.data or []):
            activities.append({
                "type": "signup",
                "timestamp": user.get("created_at"),
                "description": f"New user signed up: {user.get('email')}",
                "user_id": user.get("id"),
                "user_email": user.get("email")
            })

        # Recent decks
        decks = supabase.table("decks").select(
            "uuid, name, user_id, created_at"
        ).order("created_at", desc=True).limit(limit // 4).execute()

        if decks.data:
            user_ids = list(set(d.get("user_id") for d in decks.data if d.get("user_id")))
            users = supabase.table("users").select("id, email").in_("id", user_ids).execute()
            user_map = {u["id"]: u["email"] for u in (users.data or [])}

            for deck in decks.data:
                activities.append({
                    "type": "deck_created",
                    "timestamp": deck.get("created_at"),
                    "description": f"Deck created: {deck.get('name', 'Untitled')}",
                    "user_id": deck.get("user_id"),
                    "user_email": user_map.get(deck.get("user_id"), "Unknown"),
                    "deck_id": deck.get("uuid")
                })

        # Recent shares
        try:
            shares = supabase.table("deck_shares").select(
                "id, deck_uuid, created_by, share_type, created_at"
            ).order("created_at", desc=True).limit(limit // 4).execute()

            if shares.data:
                user_ids = list(set(s.get("created_by") for s in shares.data if s.get("created_by")))
                users = supabase.table("users").select("id, email").in_("id", user_ids).execute()
                user_map = {u["id"]: u["email"] for u in (users.data or [])}

                for share in shares.data:
                    activities.append({
                        "type": "share_created",
                        "timestamp": share.get("created_at"),
                        "description": f"Share link created ({share.get('share_type', 'view')} access)",
                        "user_id": share.get("created_by"),
                        "user_email": user_map.get(share.get("created_by"), "Unknown"),
                        "deck_id": share.get("deck_uuid")
                    })
        except:
            pass

        # Sort all activities by timestamp
        activities.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        return {
            "activities": activities[:limit]
        }

    except Exception as e:
        logger.error(f"Recent activity error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# EXPORT
# ============================================================================

@router.get("/export")
async def export_analytics(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    format: str = Query("json", enum=["json", "csv"]),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Export analytics data
    """
    try:
        supabase = get_supabase_client()
        start, end = get_date_range_filter(start_date, end_date)

        # Gather comprehensive data
        users = supabase.table("users").select(
            "id, email, full_name, created_at, last_sign_in_at, role"
        ).gte("created_at", start.isoformat()).lte("created_at", end.isoformat()).execute()

        decks = supabase.table("decks").select(
            "uuid, name, user_id, created_at, visibility"
        ).gte("created_at", start.isoformat()).lte("created_at", end.isoformat()).execute()

        # Add slide counts to decks
        deck_data = []
        for deck in (decks.data or []):
            deck_info = {**deck}
            deck_data.append(deck_info)

        export_data = {
            "period": {"start": start_date, "end": end_date},
            "exported_at": datetime.utcnow().isoformat(),
            "users": users.data or [],
            "decks": deck_data
        }

        if format == "csv":
            # Return CSV format
            import csv
            import io

            output = io.StringIO()

            # Users CSV
            if users.data:
                writer = csv.DictWriter(output, fieldnames=users.data[0].keys())
                writer.writeheader()
                writer.writerows(users.data)

            return {
                "format": "csv",
                "data": output.getvalue()
            }

        return export_data

    except Exception as e:
        logger.error(f"Export error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
