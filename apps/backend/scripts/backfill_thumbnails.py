"""
Backfill thumbnails for all existing decks that don't have one yet.

Usage:
    cd apps/backend
    python scripts/backfill_thumbnails.py [--limit 50] [--dry-run] [--concurrency 10]
"""

import asyncio
import argparse
import logging
import sys
import os

# Add parent dir to path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Counters (atomic enough for single-threaded asyncio)
success = 0
failed = 0
skipped = 0


async def render_one(sem: asyncio.Semaphore, i: int, total: int, deck: dict, *, local: bool = False):
    global success, failed, skipped
    import json as _json

    uuid = deck["uuid"]

    # Prefer the first_slide column (actual display-order first slide);
    # fall back to slides[0] only if first_slide is missing.
    first_slide = deck.get("first_slide")
    if first_slide and isinstance(first_slide, str):
        try:
            first_slide = _json.loads(first_slide)
        except (ValueError, TypeError):
            first_slide = None

    if not first_slide:
        slides = deck.get("slides") or []
        first_slide = slides[0] if slides else None

    if not first_slide:
        logger.info("  [%d/%d] Skipping %s (no slides)", i, total, uuid)
        skipped += 1
        return

    slide_size = deck.get("size")
    deck_data = deck.get("data") or {}
    theme_data = deck_data.get("theme")

    async with sem:
        logger.info("  [%d/%d] Rendering %s (first slide) ...", i, total, uuid)
        try:
            if local:
                from services.thumbnail_renderer import render_and_upload_thumbnail
                result = await render_and_upload_thumbnail(
                    deck_uuid=uuid,
                    slide_data=first_slide,
                    slide_size=slide_size,
                    theme_data=theme_data,
                    slide_index=0,
                )
            else:
                from services.thumbnail_dispatch import render_thumbnail_via_modal
                result = await render_thumbnail_via_modal(
                    deck_uuid=uuid,
                    slide_data=first_slide,
                    slide_size=slide_size,
                    theme_data=theme_data,
                    slide_index=0,
                )
            if result:
                logger.info("    OK [%d/%d]: %s", i, total, result.get("url", "")[:80])
                success += 1
            else:
                logger.warning("    FAILED [%d/%d] (returned None)", i, total)
                failed += 1
        except Exception as e:
            logger.error("    ERROR [%d/%d]: %s", i, total, e)
            failed += 1


def _collect_public_deck_uuids(supabase) -> list:
    """Collect all deck UUIDs that are publicly visible (community, shared, featured)."""
    uuids = set()

    # 1. Approved community decks
    try:
        result = supabase.table("community_decks").select("deck_uuid").eq("status", "approved").execute()
        for row in (result.data or []):
            if row.get("deck_uuid"):
                uuids.add(row["deck_uuid"])
        logger.info("  Community (approved): %d deck UUIDs", len(result.data or []))
    except Exception as e:
        logger.warning("  Failed to query community_decks: %s", e)

    # 2. Public active share links
    try:
        result = supabase.table("deck_shares").select("deck_uuid").eq("is_public", True).eq("is_active", True).execute()
        for row in (result.data or []):
            if row.get("deck_uuid"):
                uuids.add(row["deck_uuid"])
        logger.info("  Public shares: %d deck UUIDs", len(result.data or []))
    except Exception as e:
        logger.warning("  Failed to query deck_shares: %s", e)

    # 3. Featured / landing page decks
    try:
        result = supabase.table("featured_decks").select("uuid").eq("is_active", True).execute()
        for row in (result.data or []):
            if row.get("uuid"):
                uuids.add(row["uuid"])
        logger.info("  Featured decks: %d deck UUIDs", len(result.data or []))
    except Exception as e:
        logger.warning("  Failed to query featured_decks: %s", e)

    return list(uuids)


async def backfill(limit: int, dry_run: bool, concurrency: int, force: bool = False, local: bool = False, public_only: bool = False):
    global success, failed, skipped
    from services.supabase import get_supabase_client

    supabase = get_supabase_client()

    if public_only:
        # Collect UUIDs from community, shares, featured tables
        logger.info("Collecting public/SEO deck UUIDs...")
        public_uuids = _collect_public_deck_uuids(supabase)
        if not public_uuids:
            logger.info("No public decks found.")
            return

        # Fetch full deck data for those UUIDs (in batches of 50 for Supabase)
        all_decks = []
        batch_size = 50
        for i in range(0, len(public_uuids), batch_size):
            batch_uuids = public_uuids[i:i + batch_size]
            query = (
                supabase.table("decks")
                .select("uuid, first_slide, slides, size, data")
                .in_("uuid", batch_uuids)
            )
            if not force:
                query = query.is_("thumbnail_url", "null")
            result = query.execute()
            all_decks.extend(result.data or [])
        decks = all_decks[:limit]
    else:
        # Original behaviour: paginate through all decks
        all_decks = []
        page_size = 1000
        offset = 0
        while offset < limit:
            fetch = min(page_size, limit - offset)
            query = (
                supabase.table("decks")
                .select("uuid, first_slide, slides, size, data")
                .order("created_at", desc=True)
                .limit(fetch)
                .offset(offset)
            )
            if not force:
                query = query.is_("thumbnail_url", "null")
            result = query.execute()
            batch = result.data or []
            all_decks.extend(batch)
            if len(batch) < fetch:
                break
            offset += fetch
        decks = all_decks

    mode = "PUBLIC/SEO only" if public_only else ("ALL (force re-render)" if force else "missing thumbnails only")
    renderer = "LOCAL Playwright" if local else "Modal (with local fallback)"
    logger.info("Found %d decks [%s] (limit=%d, concurrency=%d, renderer=%s)", len(decks), mode, limit, concurrency, renderer)

    if dry_run:
        for d in decks:
            slide_count = len(d.get("slides") or [])
            logger.info("  [DRY RUN] Would render: %s (%d slides)", d["uuid"], slide_count)
        return

    sem = asyncio.Semaphore(concurrency)
    tasks = [
        render_one(sem, i + 1, len(decks), deck, local=local)
        for i, deck in enumerate(decks)
    ]
    await asyncio.gather(*tasks)

    logger.info("Done: %d success, %d failed, %d skipped, %d total", success, failed, skipped, len(decks))


def main():
    parser = argparse.ArgumentParser(description="Backfill thumbnails for existing decks")
    parser.add_argument("--limit", type=int, default=50, help="Max decks to process (default: 50)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without rendering")
    parser.add_argument("--concurrency", type=int, default=10, help="Max parallel renders (default: 10)")
    parser.add_argument("--force", action="store_true", help="Re-render ALL decks, even those with existing thumbnails")
    parser.add_argument("--local", action="store_true", help="Use local Playwright directly, bypassing Modal")
    parser.add_argument("--public", action="store_true", help="Only re-render public/SEO decks (community, shared, featured)")
    args = parser.parse_args()

    asyncio.run(backfill(args.limit, args.dry_run, args.concurrency, args.force, args.local, args.public))


if __name__ == "__main__":
    main()
