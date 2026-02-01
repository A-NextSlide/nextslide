"""
API endpoints for browsing public presentations.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Query

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/browse", tags=["browse"])


@router.get("/presentations")
async def browse_presentations(
    category: Optional[str] = Query(None, description="Category filter"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(24, ge=1, le=100, description="Items per page"),
    sort: str = Query("recent", regex="^(recent|popular)$"),
):
    """
    Browse public presentations.
    Merges community decks + public user decks into a unified feed.
    """
    try:
        supabase = get_supabase_client()
        results = []
        offset = (page - 1) * limit

        # 1. Get public share links
        try:
            query = supabase.table("deck_shares").select(
                "id, short_code, public_title, public_description, public_category, "
                "access_count, created_at, deck_uuid"
            ).eq("is_active", True).eq("is_public", True)

            if category and category != "all":
                query = query.eq("public_category", category)

            if sort == "popular":
                query = query.order("access_count", desc=True)
            else:
                query = query.order("created_at", desc=True)

            query = query.range(offset, offset + limit - 1)
            shares_result = query.execute()

            # Batch-fetch first slides for all deck_uuids
            deck_uuids = [
                s["deck_uuid"] for s in (shares_result.data or []) if s.get("deck_uuid")
            ]
            first_slides_map: dict = {}
            slide_size_map: dict = {}
            if deck_uuids:
                try:
                    decks_result = supabase.table("decks").select(
                        "uuid, slides, data"
                    ).in_("uuid", deck_uuids).execute()
                    for d in (decks_result.data or []):
                        slides = d.get("slides") or []
                        if slides:
                            first_slides_map[d["uuid"]] = slides[0]
                        deck_data = d.get("data") or {}
                        if isinstance(deck_data, dict) and deck_data.get("size"):
                            slide_size_map[d["uuid"]] = deck_data["size"]
                except Exception as e:
                    logger.warning(f"Could not batch-fetch slides for shares: {e}")

            for share in (shares_result.data or []):
                deck_uuid = share.get("deck_uuid")
                entry = {
                    "type": "public_share",
                    "id": share["id"],
                    "shareCode": share["short_code"],
                    "title": share.get("public_title") or "Untitled",
                    "description": share.get("public_description") or "",
                    "category": share.get("public_category") or "",
                    "viewCount": share.get("access_count", 0),
                    "createdAt": share.get("created_at"),
                    "url": f"/p/{share['short_code']}",
                }
                if deck_uuid and deck_uuid in first_slides_map:
                    entry["firstSlide"] = first_slides_map[deck_uuid]
                if deck_uuid and deck_uuid in slide_size_map:
                    entry["slideSize"] = slide_size_map[deck_uuid]
                results.append(entry)
        except Exception as e:
            logger.warning(f"Could not query public deck_shares: {e}")

        # 2. Get community decks to fill remaining slots
        if len(results) < limit:
            remaining = limit - len(results)
            try:
                comm_cols = "id, title, description, category, view_count, approved_at, first_slide"
                try:
                    comm_query = supabase.table("community_decks").select(
                        comm_cols
                    ).eq("status", "approved")
                except Exception:
                    # Fallback without first_slide if column doesn't exist
                    comm_cols = "id, title, description, category, view_count, approved_at"
                    comm_query = supabase.table("community_decks").select(
                        comm_cols
                    ).eq("status", "approved")

                if category and category != "all":
                    comm_query = comm_query.eq("category", category)

                if sort == "popular":
                    comm_query = comm_query.order("view_count", desc=True)
                else:
                    comm_query = comm_query.order("approved_at", desc=True)

                comm_query = comm_query.limit(remaining)
                comm_result = comm_query.execute()

                for deck in (comm_result.data or []):
                    entry = {
                        "type": "community",
                        "id": deck["id"],
                        "title": deck.get("title") or "Untitled",
                        "description": deck.get("description") or "",
                        "category": deck.get("category") or "",
                        "viewCount": deck.get("view_count", 0),
                        "createdAt": deck.get("approved_at"),
                        "url": f"/community/{deck['id']}",
                    }
                    if deck.get("first_slide"):
                        entry["firstSlide"] = deck["first_slide"]
                    results.append(entry)
            except Exception as e:
                logger.warning(f"Could not query community_decks: {e}")

        return {
            "presentations": results,
            "page": page,
            "limit": limit,
            "hasMore": len(results) == limit,
        }

    except Exception as e:
        logger.error(f"Error browsing presentations: {e}")
        return {"presentations": [], "page": page, "limit": limit, "hasMore": False}
