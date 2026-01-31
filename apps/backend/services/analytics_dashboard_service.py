"""
Analytics Dashboard Service

Provides presentation analytics data:
- View tracking (record and query presentation views)
- Slide engagement tracking (time spent per slide)
- Aggregate analytics across all user decks
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from uuid import UUID

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)


def _parse_period(period: str) -> datetime:
    """Convert a period string like '7d', '30d', '90d' to a start datetime."""
    now = datetime.utcnow()
    if period.endswith("d"):
        days = int(period[:-1])
    elif period.endswith("w"):
        days = int(period[:-1]) * 7
    else:
        days = 30  # default
    return now - timedelta(days=days)


# ---------------------------------------------------------------------------
# Recording
# ---------------------------------------------------------------------------

def record_view(
    deck_uuid: str,
    viewer_id: Optional[str] = None,
    session_id: Optional[str] = None,
    source: str = "direct",
    platform: Optional[str] = None,
    device_type: str = "desktop",
    country: Optional[str] = None,
    city: Optional[str] = None,
) -> Dict[str, Any]:
    """Record a presentation view event."""
    try:
        client = get_supabase_client()
        row = {
            "deck_uuid": deck_uuid,
            "session_id": session_id,
            "source": source or "direct",
            "device_type": device_type or "desktop",
        }
        if viewer_id:
            row["viewer_id"] = viewer_id
        if platform:
            row["platform"] = platform
        if country:
            row["country"] = country
        if city:
            row["city"] = city

        result = client.table("presentation_views").insert(row).execute()
        return {"success": True, "id": result.data[0]["id"] if result.data else None}
    except Exception as e:
        logger.error(f"[AnalyticsDashboard] Failed to record view: {e}")
        return {"success": False, "error": str(e)}


def record_slide_engagement(
    deck_uuid: str,
    slide_index: int,
    session_id: str,
    time_spent_ms: int,
) -> Dict[str, Any]:
    """Record slide-level dwell time."""
    try:
        if time_spent_ms < 100:
            # Ignore very short interactions (accidental swipes, etc.)
            return {"success": True, "skipped": True}

        client = get_supabase_client()
        row = {
            "deck_uuid": deck_uuid,
            "slide_index": slide_index,
            "session_id": session_id,
            "time_spent_ms": min(time_spent_ms, 600_000),  # cap at 10 minutes
        }
        result = client.table("slide_engagement").insert(row).execute()
        return {"success": True, "id": result.data[0]["id"] if result.data else None}
    except Exception as e:
        logger.error(f"[AnalyticsDashboard] Failed to record slide engagement: {e}")
        return {"success": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Per-Deck Analytics
# ---------------------------------------------------------------------------

def get_deck_analytics(deck_uuid: str, period: str = "30d") -> Dict[str, Any]:
    """
    Return comprehensive analytics for a single deck.

    Returns:
        total_views, unique_viewers, avg_duration,
        views_over_time, top_slides, device_breakdown,
        source_breakdown, geography
    """
    try:
        client = get_supabase_client()
        start = _parse_period(period)
        start_iso = start.isoformat()

        # Fetch views within the period
        views_resp = (
            client.table("presentation_views")
            .select("*")
            .eq("deck_uuid", deck_uuid)
            .gte("created_at", start_iso)
            .order("created_at", desc=True)
            .limit(10000)
            .execute()
        )
        views: List[Dict] = views_resp.data or []

        total_views = len(views)

        # Unique viewers (by session_id since viewer_id may be null)
        unique_sessions = set()
        unique_viewer_ids = set()
        total_duration = 0

        for v in views:
            if v.get("session_id"):
                unique_sessions.add(v["session_id"])
            if v.get("viewer_id"):
                unique_viewer_ids.add(v["viewer_id"])
            total_duration += v.get("duration_ms", 0)

        unique_viewers = len(unique_viewer_ids) or len(unique_sessions)
        avg_duration = (total_duration // total_views) if total_views > 0 else 0

        # Views over time (daily counts)
        daily_counts: Dict[str, int] = {}
        for v in views:
            date_str = v["created_at"][:10]  # YYYY-MM-DD
            daily_counts[date_str] = daily_counts.get(date_str, 0) + 1

        # Fill in missing days with 0
        views_over_time = []
        current = start.date()
        end_date = datetime.utcnow().date()
        while current <= end_date:
            ds = current.isoformat()
            views_over_time.append({"date": ds, "views": daily_counts.get(ds, 0)})
            current += timedelta(days=1)

        # Device breakdown
        device_counts: Dict[str, int] = {}
        for v in views:
            dt = v.get("device_type", "desktop") or "desktop"
            device_counts[dt] = device_counts.get(dt, 0) + 1

        # Source breakdown
        source_counts: Dict[str, int] = {}
        for v in views:
            src = v.get("source", "direct") or "direct"
            source_counts[src] = source_counts.get(src, 0) + 1

        # Geography (top countries and cities)
        country_counts: Dict[str, int] = {}
        city_counts: Dict[str, int] = {}
        for v in views:
            if v.get("country"):
                country_counts[v["country"]] = country_counts.get(v["country"], 0) + 1
            if v.get("city"):
                city_counts[v["city"]] = city_counts.get(v["city"], 0) + 1

        top_countries = sorted(country_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        top_cities = sorted(city_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        # Slide engagement
        engagement_resp = (
            client.table("slide_engagement")
            .select("slide_index, time_spent_ms")
            .eq("deck_uuid", deck_uuid)
            .gte("created_at", start_iso)
            .limit(10000)
            .execute()
        )
        engagement_data: List[Dict] = engagement_resp.data or []

        slide_totals: Dict[int, int] = {}
        slide_counts: Dict[int, int] = {}
        for e in engagement_data:
            idx = e["slide_index"]
            slide_totals[idx] = slide_totals.get(idx, 0) + e["time_spent_ms"]
            slide_counts[idx] = slide_counts.get(idx, 0) + 1

        top_slides = []
        for idx in sorted(slide_totals.keys()):
            avg_time = slide_totals[idx] // slide_counts[idx] if slide_counts[idx] > 0 else 0
            top_slides.append({
                "slide_index": idx,
                "total_time_ms": slide_totals[idx],
                "avg_time_ms": avg_time,
                "view_count": slide_counts[idx],
            })

        return {
            "total_views": total_views,
            "unique_viewers": unique_viewers,
            "avg_duration_ms": avg_duration,
            "views_over_time": views_over_time,
            "top_slides": top_slides,
            "device_breakdown": device_counts,
            "source_breakdown": source_counts,
            "geography": {
                "countries": [{"name": c, "views": n} for c, n in top_countries],
                "cities": [{"name": c, "views": n} for c, n in top_cities],
            },
        }
    except Exception as e:
        logger.error(f"[AnalyticsDashboard] get_deck_analytics failed: {e}")
        return {
            "total_views": 0,
            "unique_viewers": 0,
            "avg_duration_ms": 0,
            "views_over_time": [],
            "top_slides": [],
            "device_breakdown": {},
            "source_breakdown": {},
            "geography": {"countries": [], "cities": []},
        }


def get_slide_engagement(deck_uuid: str, period: str = "30d") -> List[Dict[str, Any]]:
    """Return slide-by-slide engagement data for a deck."""
    try:
        client = get_supabase_client()
        start_iso = _parse_period(period).isoformat()

        resp = (
            client.table("slide_engagement")
            .select("slide_index, time_spent_ms, session_id")
            .eq("deck_uuid", deck_uuid)
            .gte("created_at", start_iso)
            .limit(10000)
            .execute()
        )
        data: List[Dict] = resp.data or []

        slide_totals: Dict[int, int] = {}
        slide_counts: Dict[int, int] = {}
        slide_sessions: Dict[int, set] = {}

        for row in data:
            idx = row["slide_index"]
            slide_totals[idx] = slide_totals.get(idx, 0) + row["time_spent_ms"]
            slide_counts[idx] = slide_counts.get(idx, 0) + 1
            if idx not in slide_sessions:
                slide_sessions[idx] = set()
            slide_sessions[idx].add(row["session_id"])

        result = []
        for idx in sorted(slide_totals.keys()):
            avg = slide_totals[idx] // slide_counts[idx] if slide_counts[idx] > 0 else 0
            result.append({
                "slide_index": idx,
                "total_time_ms": slide_totals[idx],
                "avg_time_ms": avg,
                "view_count": slide_counts[idx],
                "unique_viewers": len(slide_sessions.get(idx, set())),
            })

        return result
    except Exception as e:
        logger.error(f"[AnalyticsDashboard] get_slide_engagement failed: {e}")
        return []


# ---------------------------------------------------------------------------
# Aggregate Analytics (across all decks for a user)
# ---------------------------------------------------------------------------

def get_aggregate_analytics(user_id: str, period: str = "30d") -> Dict[str, Any]:
    """
    Return aggregate analytics across all decks owned by a user.

    Returns:
        total_views, total_unique_viewers, most_popular_decks, weekly_trend
    """
    try:
        client = get_supabase_client()
        start = _parse_period(period)
        start_iso = start.isoformat()

        # Get all deck UUIDs owned by this user
        decks_resp = (
            client.table("decks")
            .select("uuid, name")
            .eq("user_id", user_id)
            .execute()
        )
        user_decks: List[Dict] = decks_resp.data or []
        if not user_decks:
            return {
                "total_views": 0,
                "total_unique_viewers": 0,
                "most_popular_decks": [],
                "weekly_trend": [],
            }

        deck_uuids = [d["uuid"] for d in user_decks]
        deck_name_map = {d["uuid"]: d.get("name", "Untitled") for d in user_decks}

        # Fetch all views for user's decks in the period
        all_views: List[Dict] = []
        # Query in batches to avoid too-long IN clauses
        batch_size = 50
        for i in range(0, len(deck_uuids), batch_size):
            batch = deck_uuids[i : i + batch_size]
            resp = (
                client.table("presentation_views")
                .select("deck_uuid, session_id, viewer_id, created_at")
                .in_("deck_uuid", batch)
                .gte("created_at", start_iso)
                .limit(10000)
                .execute()
            )
            all_views.extend(resp.data or [])

        total_views = len(all_views)

        # Unique viewers
        unique_sessions = set()
        unique_viewer_ids = set()
        for v in all_views:
            if v.get("session_id"):
                unique_sessions.add(v["session_id"])
            if v.get("viewer_id"):
                unique_viewer_ids.add(v["viewer_id"])
        total_unique_viewers = len(unique_viewer_ids) or len(unique_sessions)

        # Most popular decks
        deck_view_counts: Dict[str, int] = {}
        for v in all_views:
            du = v["deck_uuid"]
            deck_view_counts[du] = deck_view_counts.get(du, 0) + 1

        most_popular = sorted(deck_view_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        most_popular_decks = [
            {
                "deck_uuid": du,
                "name": deck_name_map.get(du, "Untitled"),
                "views": count,
            }
            for du, count in most_popular
        ]

        # Weekly trend
        weekly_counts: Dict[str, int] = {}
        for v in all_views:
            # Group by ISO week
            created = datetime.fromisoformat(v["created_at"].replace("Z", "+00:00"))
            week_start = created - timedelta(days=created.weekday())
            week_key = week_start.strftime("%Y-%m-%d")
            weekly_counts[week_key] = weekly_counts.get(week_key, 0) + 1

        weekly_trend = [
            {"week": w, "views": c}
            for w, c in sorted(weekly_counts.items())
        ]

        return {
            "total_views": total_views,
            "total_unique_viewers": total_unique_viewers,
            "most_popular_decks": most_popular_decks,
            "weekly_trend": weekly_trend,
        }
    except Exception as e:
        logger.error(f"[AnalyticsDashboard] get_aggregate_analytics failed: {e}")
        return {
            "total_views": 0,
            "total_unique_viewers": 0,
            "most_popular_decks": [],
            "weekly_trend": [],
        }
