"""
Sync thumbnail_url from decks table into community_decks.
Run after backfill_thumbnails.py to propagate server thumbnails to community gallery.

Usage:
    cd apps/backend
    python scripts/sync_community_thumbnails.py
"""

import sys
import os
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main():
    from services.supabase import get_supabase_client

    supabase = get_supabase_client()

    # Find community_decks that are missing thumbnail_url but source deck has one
    result = supabase.table('community_decks').select(
        'id, deck_uuid, thumbnail_url'
    ).is_('thumbnail_url', 'null').execute()

    rows = result.data or []
    logger.info("Found %d community_decks without thumbnail_url", len(rows))

    if not rows:
        logger.info("Nothing to sync")
        return

    updated = 0
    skipped = 0

    for row in rows:
        deck_uuid = row['deck_uuid']
        # Fetch thumbnail_url from source deck
        deck_result = supabase.table('decks').select('thumbnail_url').eq('uuid', deck_uuid).execute()

        if not deck_result.data:
            skipped += 1
            continue

        thumb = deck_result.data[0].get('thumbnail_url')
        if not thumb:
            skipped += 1
            continue

        # Update community_decks
        supabase.table('community_decks').update({
            'thumbnail_url': thumb
        }).eq('id', row['id']).execute()

        logger.info("  Synced %s -> %s", row['id'][:8], thumb[:80])
        updated += 1

    logger.info("Done: %d updated, %d skipped", updated, skipped)


if __name__ == "__main__":
    main()
