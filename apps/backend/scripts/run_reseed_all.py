#!/usr/bin/env python3
"""
Standalone script to run a full reseed of all featured + community decks.
Runs directly using backend functions — no API auth needed.

Usage:
    cd apps/backend
    python scripts/run_reseed_all.py
"""
import asyncio
import os
import sys
import time
import uuid as uuid_module

# Ensure the backend root is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # Manual .env loading fallback
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())

from setup_logging_optimized import get_logger
logger = get_logger("reseed_all")


async def main():
    from services.supabase import get_supabase_client, reset_supabase_client
    from api.requests.api_admin import (
        _admin_generate_deck,
        _run_reseed_batch,
        HERO_SLOT_PROMPTS,
        HERO_SLOT_CATEGORIES,
    )
    from agents.config import SEED_TEMPERATURE

    ADMIN_USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"
    NUM_SLIDES = 8
    STYLE = None
    CONCURRENCY = 20

    reset_supabase_client()
    supabase = get_supabase_client()

    # ── Gather all featured decks ──
    featured = supabase.table("featured_decks").select(
        "uuid, name, display_order"
    ).eq("is_active", True).order("display_order").execute()

    # ── Gather all community decks ──
    community = supabase.table("community_decks").select(
        "deck_uuid, title, category"
    ).eq("status", "approved").execute()

    featured_data = featured.data or []
    community_data = community.data or []

    # De-duplicate: community decks that are also featured (same deck_uuid)
    featured_uuids = {d["uuid"] for d in featured_data}
    community_only = [d for d in community_data if d["deck_uuid"] not in featured_uuids]

    print(f"\n{'='*60}")
    print(f"RESEED ALL")
    print(f"{'='*60}")
    print(f"Featured decks:  {len(featured_data)}")
    print(f"Community decks: {len(community_only)} (excluding featured dupes)")
    print(f"Total to reseed: {len(featured_data) + len(community_only)}")
    print(f"Concurrency:     {CONCURRENCY}")
    print(f"Slides per deck: {NUM_SLIDES}")
    print(f"{'='*60}\n")

    # ── Build work items ──
    work_items = []

    for d in featured_data:
        new_uuid = str(uuid_module.uuid4())
        display_order = d.get("display_order", 0)
        title = HERO_SLOT_PROMPTS.get(display_order, d.get("name", "presentation"))
        reseed_info = {
            "old_uuid": d["uuid"],
            "source": "featured",
            "display_order": display_order,
        }
        work_items.append({
            "new_uuid": new_uuid,
            "title": title,
            "reseed_info": reseed_info,
            "old_uuid": d["uuid"],
            "source": "featured",
        })

    for d in community_only:
        new_uuid = str(uuid_module.uuid4())
        title = d.get("title", "presentation")
        reseed_info = {
            "old_uuid": d["deck_uuid"],
            "source": "community",
            "category": d.get("category", "business"),
        }
        work_items.append({
            "new_uuid": new_uuid,
            "title": title,
            "reseed_info": reseed_info,
            "old_uuid": d["deck_uuid"],
            "source": "community",
        })

    print(f"Starting reseed of {len(work_items)} decks...\n")
    t0 = time.time()

    # ── Run the batch ──
    await _run_reseed_batch(work_items, ADMIN_USER_ID, NUM_SLIDES, STYLE, CONCURRENCY)

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"Reseed batch finished in {elapsed:.0f}s ({elapsed/60:.1f}m)")
    print(f"{'='*60}\n")

    # ── Verify results ──
    print("Verifying results...\n")
    reset_supabase_client()
    supabase = get_supabase_client()

    # Check featured decks
    featured_check = supabase.table("featured_decks").select(
        "uuid, name, display_order, slide_count"
    ).eq("is_active", True).order("display_order").execute()

    featured_ok = 0
    featured_bad = 0
    for d in (featured_check.data or []):
        sc = d.get("slide_count", 0)
        if sc >= 6:
            featured_ok += 1
        else:
            featured_bad += 1
            print(f"  WARN: Featured slot {d['display_order']} '{d['name'][:50]}' has only {sc} slides")

    # Check community decks
    community_check = supabase.table("community_decks").select(
        "deck_uuid, title, slide_count, slides_snapshot"
    ).eq("status", "approved").execute()

    community_ok = 0
    community_no_snapshot = 0
    community_bad = 0
    for d in (community_check.data or []):
        sc = d.get("slide_count", 0)
        has_snapshot = d.get("slides_snapshot") and len(d["slides_snapshot"]) > 0
        if sc >= 6 and has_snapshot:
            community_ok += 1
        elif not has_snapshot:
            community_no_snapshot += 1
            print(f"  WARN: Community '{d['title'][:50]}' missing slides_snapshot")
        else:
            community_bad += 1
            print(f"  WARN: Community '{d['title'][:50]}' has only {sc} slides")

    print(f"\n{'='*60}")
    print(f"VERIFICATION RESULTS")
    print(f"{'='*60}")
    print(f"Featured:  {featured_ok} OK, {featured_bad} incomplete")
    print(f"Community: {community_ok} OK, {community_no_snapshot} missing snapshot, {community_bad} incomplete")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    asyncio.run(main())
