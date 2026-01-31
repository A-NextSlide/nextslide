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

    uuid = deck["uuid"]
    slides = deck.get("slides") or []
    if not slides:
        logger.info("  [%d/%d] Skipping %s (no slides)", i, total, uuid)
        skipped += 1
        return

    first_slide = slides[0]
    slide_size = deck.get("size")
    deck_data = deck.get("data") or {}
    theme_data = deck_data.get("theme")

    async with sem:
        logger.info("  [%d/%d] Rendering %s ...", i, total, uuid)
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


async def backfill(limit: int, dry_run: bool, concurrency: int, force: bool = False, local: bool = False):
    global success, failed, skipped
    from services.supabase import get_supabase_client

    supabase = get_supabase_client()

    # Fetch decks — paginate through all rows to bypass Supabase 1000-row cap
    all_decks = []
    page_size = 1000
    offset = 0
    while offset < limit:
        fetch = min(page_size, limit - offset)
        query = (
            supabase.table("decks")
            .select("uuid, slides, size, data")
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
            break  # no more rows
        offset += fetch

    decks = all_decks
    mode = "ALL (force re-render)" if force else "missing thumbnails only"
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
    args = parser.parse_args()

    asyncio.run(backfill(args.limit, args.dry_run, args.concurrency, args.force, args.local))


if __name__ == "__main__":
    main()
