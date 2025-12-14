#!/usr/bin/env python3
"""
Script to clean up test user decks.
Run from the backend directory: python scripts/cleanup_test_decks.py
"""
import os
import sys
import asyncio
from datetime import datetime, timedelta

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import asyncpg

# Parse DATABASE_URL to get connection parameters
# Expected format: postgresql://user:password@host:port/database
DATABASE_URL = os.getenv("DATABASE_URL", "")

# For Supabase pooler, use port 5432 instead of 6543 for direct connection
# This avoids SCRAM authentication issues with the pooler
def parse_db_url(url: str):
    """Parse DATABASE_URL and extract connection parameters."""
    import re
    match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', url)
    if not match:
        raise ValueError(f"Invalid DATABASE_URL format")
    return {
        'user': match.group(1),
        'password': match.group(2),
        'host': match.group(3),
        'port': 5432,  # Use direct connection port
        'database': match.group(5)
    }

async def main():
    print(f"Connecting to database...")
    params = parse_db_url(DATABASE_URL)
    conn = await asyncpg.connect(
        **params,
        statement_cache_size=0
    )

    # Find user with "abeshry" in email (case insensitive)
    print("Searching for users with 'abeshry' in email...")
    users = await conn.fetch("SELECT id, email FROM users WHERE email ILIKE $1", "%abeshry%")

    if not users:
        print("No users found with 'abeshry' in email")
        await conn.close()
        return

    print(f"Found {len(users)} user(s):")
    for user in users:
        print(f"  - {user['email']} (ID: {user['id']})")

    # Use the first matching user
    user = users[0]
    user_id = user["id"]
    user_email = user["email"]

    print(f"\nUsing user: {user_email}")

    # Get all decks for this user
    print("Fetching all decks...")
    all_decks = await conn.fetch(
        "SELECT uuid, name, created_at FROM decks WHERE user_id = $1 ORDER BY created_at ASC",
        user_id
    )
    total_decks = len(all_decks)

    print(f"Total decks: {total_decks}")

    if total_decks == 0:
        print("No decks to clean up")
        await conn.close()
        return

    # Configuration
    keep_last_days = 10
    keep_every_nth = 10
    keep_first_n = 10

    print(f"\nCleanup rules:")
    print(f"  - Keep all decks from the last {keep_last_days} days")
    print(f"  - Keep every {keep_every_nth}th deck from older decks")
    print(f"  - Keep first {keep_first_n} decks ever created")

    # Calculate cutoff date
    cutoff_date = datetime.utcnow() - timedelta(days=keep_last_days)
    print(f"  - Cutoff date: {cutoff_date.isoformat()}")

    decks_to_keep = set()
    decks_to_delete = set()

    # Rule 1: Keep first N decks
    first_n = min(keep_first_n, total_decks)
    for i in range(first_n):
        decks_to_keep.add(all_decks[i]["uuid"])

    # Process remaining decks
    older_deck_index = 0
    for i, deck in enumerate(all_decks):
        deck_id = deck["uuid"]
        created_at = deck.get("created_at")

        if created_at:
            # Make sure it's timezone naive for comparison
            if hasattr(created_at, 'tzinfo') and created_at.tzinfo is not None:
                created_at = created_at.replace(tzinfo=None)
        else:
            created_at = datetime.min

        # Rule 2: Keep all decks from the last N days
        if created_at >= cutoff_date:
            decks_to_keep.add(deck_id)
            continue

        # Rule 3: For older decks (not in first N), keep every Nth
        if deck_id not in decks_to_keep:
            if older_deck_index % keep_every_nth == 0:
                decks_to_keep.add(deck_id)
            else:
                decks_to_delete.add(deck_id)
            older_deck_index += 1

    # Remove any decks from delete list that are in keep list
    decks_to_delete = decks_to_delete - decks_to_keep

    print(f"\n=== DRY RUN RESULTS ===")
    print(f"Total decks: {total_decks}")
    print(f"Decks to keep: {len(decks_to_keep)}")
    print(f"Decks to delete: {len(decks_to_delete)}")

    if len(decks_to_delete) == 0:
        print("\nNo decks to delete!")
        await conn.close()
        return

    # Auto-confirm since we're piping "yes"
    print(f"\nProceeding with deleting {len(decks_to_delete)} decks...")

    # Perform deletion
    deleted_count = 0
    failed_count = 0

    deck_ids_list = list(decks_to_delete)
    batch_size = 100

    for i in range(0, len(deck_ids_list), batch_size):
        batch = deck_ids_list[i:i+batch_size]
        try:
            await conn.execute(
                "DELETE FROM decks WHERE uuid = ANY($1::uuid[])",
                batch
            )
            deleted_count += len(batch)
            print(f"  Progress: {min(i + batch_size, len(deck_ids_list))}/{len(deck_ids_list)} deleted")
        except Exception as e:
            print(f"  Failed to delete batch: {e}")
            failed_count += len(batch)

    await conn.close()

    print(f"\n=== COMPLETE ===")
    print(f"Successfully deleted: {deleted_count}")
    print(f"Failed: {failed_count}")
    print(f"Kept: {len(decks_to_keep)}")

if __name__ == "__main__":
    asyncio.run(main())
