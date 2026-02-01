#!/usr/bin/env python3
"""
Re-sync featured_decks and community_decks with current slide data from decks table.

Fixes blank slides caused by early snapshots that captured decks before
slide generation completed.

Usage:
    cd apps/backend
    python3 scripts/resync_slide_data.py
"""

import os
import sys
import logging
from typing import Optional, Tuple

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    logger.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sys.exit(1)


def has_good_slides(slides: list) -> bool:
    """
    A deck has 'good' slides if the first slide contains at least one
    component whose type is 'CustomComponent'.
    """
    if not slides or not isinstance(slides, list):
        return False
    first = slides[0]
    if not isinstance(first, dict):
        return False
    components = first.get("components", [])
    if not isinstance(components, list) or len(components) == 0:
        return False
    return any(
        isinstance(c, dict) and c.get("type") == "CustomComponent"
        for c in components
    )


def fetch_current_slides(supabase, deck_uuid: str) -> Optional[list]:
    """Fetch current slides from the decks table for a given uuid."""
    try:
        result = supabase.table("decks").select("slides").eq("uuid", deck_uuid).execute()
        if result.data and len(result.data) > 0:
            return result.data[0].get("slides")
    except Exception as e:
        logger.warning("  Error fetching deck %s: %s", deck_uuid, e)
    return None


def sync_featured_decks(supabase) -> Tuple[int, int, int, int]:
    """
    Re-sync all featured_decks rows with current slide data.
    Returns (total, updated, already_good, still_broken).
    """
    print()
    print("=" * 65)
    print("  FEATURED DECKS SYNC")
    print("=" * 65)

    result = supabase.table("featured_decks").select("id, uuid, name, slides, slide_count").execute()
    rows = result.data or []
    total = len(rows)
    print(f"Found {total} featured_decks entries\n")

    updated = 0
    already_good = 0
    still_broken = 0

    for row in rows:
        deck_uuid = row["uuid"]
        name = row.get("name", "(untitled)")
        old_slides = row.get("slides", [])

        # Fetch latest slides from decks table
        current_slides = fetch_current_slides(supabase, deck_uuid)

        if current_slides is None:
            print(f"  [MISSING] {name} -- deck {deck_uuid} not found in decks table")
            still_broken += 1
            continue

        if not has_good_slides(current_slides):
            print(f"  [BROKEN]  {name} -- source deck still has no CustomComponent slides")
            still_broken += 1
            continue

        # Check if the snapshot already matches (avoid unnecessary writes)
        if has_good_slides(old_slides) and len(old_slides) == len(current_slides):
            print(f"  [OK]      {name} ({len(old_slides)} slides, already up to date)")
            already_good += 1
            continue

        # Update featured_decks with current slides
        try:
            supabase.table("featured_decks").update({
                "slides": current_slides,
                "slide_count": len(current_slides),
            }).eq("id", row["id"]).execute()
            print(f"  [UPDATED] {name} -- {len(old_slides or [])} -> {len(current_slides)} slides")
            updated += 1
        except Exception as e:
            print(f"  [ERROR]   {name} -- {e}")
            still_broken += 1

    return total, updated, already_good, still_broken


def sync_community_decks(supabase) -> Tuple[int, int, int, int]:
    """
    Re-sync all community_decks rows with current slide data.
    Returns (total, updated, already_good, still_broken).
    """
    print()
    print("=" * 65)
    print("  COMMUNITY DECKS SYNC")
    print("=" * 65)

    # Paginate: supabase-py returns max 1000 by default
    all_rows = []
    page_size = 500
    offset = 0

    while True:
        result = (
            supabase.table("community_decks")
            .select("id, deck_uuid, title, slides_snapshot, slide_count, first_slide")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = result.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    total = len(all_rows)
    print(f"Found {total} community_decks entries\n")

    updated = 0
    already_good = 0
    still_broken = 0

    for row in all_rows:
        deck_uuid = row["deck_uuid"]
        title = row.get("title", "(untitled)")
        old_snapshot = row.get("slides_snapshot", [])

        # Fetch latest slides from decks table
        current_slides = fetch_current_slides(supabase, deck_uuid)

        if current_slides is None:
            print(f"  [MISSING] {title} -- deck {deck_uuid} not found")
            still_broken += 1
            continue

        if not has_good_slides(current_slides):
            print(f"  [BROKEN]  {title} -- source deck still has no CustomComponent slides")
            still_broken += 1
            continue

        # Check if already good
        if has_good_slides(old_snapshot) and len(old_snapshot or []) == len(current_slides):
            print(f"  [OK]      {title} ({len(old_snapshot)} slides, already up to date)")
            already_good += 1
            continue

        # Update community_decks with current slides
        try:
            supabase.table("community_decks").update({
                "first_slide": current_slides[0],
                "slides_snapshot": current_slides,
                "slide_count": len(current_slides),
            }).eq("id", row["id"]).execute()
            print(f"  [UPDATED] {title} -- {len(old_snapshot or [])} -> {len(current_slides)} slides")
            updated += 1
        except Exception as e:
            print(f"  [ERROR]   {title} -- {e}")
            still_broken += 1

    return total, updated, already_good, still_broken


def main():
    print("Connecting to Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("Connected.\n")

    # --- Featured Decks ---
    f_total, f_updated, f_good, f_broken = sync_featured_decks(supabase)

    # --- Community Decks ---
    c_total, c_updated, c_good, c_broken = sync_community_decks(supabase)

    # --- Summary ---
    print()
    print("=" * 65)
    print("  SUMMARY")
    print("=" * 65)
    print()
    print(f"  Featured Decks:  {f_total} total | {f_updated} updated | {f_good} already good | {f_broken} still broken")
    print(f"  Community Decks: {c_total} total | {c_updated} updated | {c_good} already good | {c_broken} still broken")
    print()
    if f_broken + c_broken > 0:
        print(f"  WARNING: {f_broken + c_broken} entries still have broken/missing slides.")
        print("  These decks may need to be regenerated.")
    else:
        print("  All entries now have good slide data.")
    print()


if __name__ == "__main__":
    main()
