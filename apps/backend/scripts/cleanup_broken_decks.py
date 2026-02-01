"""
Cleanup broken decks for a specific user and null-user decks.

A deck is "broken" if it has slides but the first slide has NO CustomComponent
in its components array (components is empty or no component with type "CustomComponent").

This script DELETES broken decks from:
  - featured_decks
  - community_decks
  - deck_shares
  - decks
"""

import json
import os
import sys

from dotenv import load_dotenv
from supabase import create_client

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
TARGET_USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"
SELECT_FIELDS = "uuid, name, slides, status"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def is_broken(deck: dict) -> bool:
    """Return True if the deck's first slide lacks a CustomComponent."""
    slides = deck.get("slides")
    if not slides:
        return False  # no slides at all - not "broken" in the described sense

    if isinstance(slides, str):
        try:
            slides = json.loads(slides)
        except (json.JSONDecodeError, TypeError):
            return False

    if not isinstance(slides, list) or len(slides) == 0:
        return False

    first_slide = slides[0]
    components = first_slide.get("components")
    if not components or not isinstance(components, list):
        return True  # empty or missing components -> broken

    for comp in components:
        if isinstance(comp, dict) and comp.get("type") == "CustomComponent":
            return False  # found a CustomComponent -> not broken

    return True


def fetch_all_pages(query_fn, page_size=1000):
    """Paginate through a Supabase query using range()."""
    all_rows = []
    offset = 0
    while True:
        resp = query_fn(offset, offset + page_size - 1)
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return all_rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env")
        sys.exit(1)

    sb = create_client(url, key)

    # ---- Fetch decks for the target user ----
    print(f"Fetching decks for user {TARGET_USER_ID} ...")
    user_decks = fetch_all_pages(
        lambda lo, hi: (
            sb.table("decks")
              .select(SELECT_FIELDS)
              .eq("user_id", TARGET_USER_ID)
              .range(lo, hi)
              .execute()
        )
    )
    print(f"  -> {len(user_decks)} decks found for user")

    # ---- Fetch decks where user_id IS NULL ----
    print("Fetching decks where user_id is NULL ...")
    null_decks = fetch_all_pages(
        lambda lo, hi: (
            sb.table("decks")
              .select(SELECT_FIELDS)
              .is_("user_id", "null")
              .range(lo, hi)
              .execute()
        )
    )
    print(f"  -> {len(null_decks)} decks found with null user_id")

    # ---- Identify broken decks ----
    all_decks = user_decks + null_decks
    broken = [d for d in all_decks if is_broken(d)]

    print(f"\nTotal decks checked : {len(all_decks)}")
    print(f"Broken decks found  : {len(broken)}")

    if not broken:
        print("\nNothing to delete. Exiting.")
        return

    # ---- Print first 10 broken deck names ----
    print("\nFirst 10 broken deck names:")
    for i, d in enumerate(broken[:10]):
        print(f"  {i+1}. {d.get('name', '(no name)')!r}  [status={d.get('status')}]")
    if len(broken) > 10:
        print(f"  ... and {len(broken) - 10} more")

    # ---- Delete broken decks ----
    uuids = [d["uuid"] for d in broken]
    batch_size = 100  # delete in batches to avoid query-string limits

    print(f"\nDeleting {len(uuids)} broken decks across 4 tables ...")

    for start in range(0, len(uuids), batch_size):
        batch = uuids[start : start + batch_size]

        # 1) featured_decks (FK column: uuid)
        try:
            sb.table("featured_decks").delete().in_("uuid", batch).execute()
        except Exception as e:
            print(f"  [warn] featured_decks delete error: {e}")

        # 2) community_decks (FK column: deck_uuid)
        try:
            sb.table("community_decks").delete().in_("deck_uuid", batch).execute()
        except Exception as e:
            print(f"  [warn] community_decks delete error: {e}")

        # 3) deck_shares (FK column: deck_uuid)
        try:
            sb.table("deck_shares").delete().in_("deck_uuid", batch).execute()
        except Exception as e:
            print(f"  [warn] deck_shares delete error: {e}")

        # 4) decks (PK column: uuid)
        try:
            sb.table("decks").delete().in_("uuid", batch).execute()
        except Exception as e:
            print(f"  [warn] decks delete error: {e}")

        print(f"  Batch {start // batch_size + 1}: deleted {len(batch)} decks")

    print(f"\nDone. {len(uuids)} broken decks deleted.")


if __name__ == "__main__":
    main()
