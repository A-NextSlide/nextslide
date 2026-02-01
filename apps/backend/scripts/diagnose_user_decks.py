#!/usr/bin/env python3
"""
Read-only diagnostic script: classify all decks for a given user
and check featured_decks quality.

Usage:
    cd apps/backend
    python3 scripts/diagnose_user_decks.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

if SUPABASE_URL and not SUPABASE_URL.startswith(("http://", "https://")):
    SUPABASE_URL = f"https://{SUPABASE_URL}"

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"

# -- helpers ------------------------------------------------------------------

def has_custom_component(slides) -> bool:
    """Return True if at least the first slide has a non-empty components list
    containing at least one CustomComponent."""
    if not slides or not isinstance(slides, list) or len(slides) == 0:
        return False
    first = slides[0]
    components = first.get("components") if isinstance(first, dict) else None
    if not components or not isinstance(components, list) or len(components) == 0:
        return False
    return any(
        isinstance(c, dict) and c.get("type") == "CustomComponent"
        for c in components
    )


def classify_deck(deck: dict) -> str:
    """Classify a single deck row."""
    status = deck.get("status", "")
    slides = deck.get("slides")

    if status == "error":
        return "error"

    if not slides or (isinstance(slides, list) and len(slides) == 0):
        return "empty"

    if has_custom_component(slides):
        return "good"

    return "outline_only"


# -- 1. fetch ALL decks for the user (paginated) -----------------------------

print(f"Fetching decks for user {USER_ID} ...")

all_decks = []
page_size = 1000
offset = 0

while True:
    resp = (
        sb.table("decks")
        .select("uuid, name, slides, status")
        .eq("user_id", USER_ID)
        .range(offset, offset + page_size - 1)
        .execute()
    )
    batch = resp.data or []
    all_decks.extend(batch)
    if len(batch) < page_size:
        break
    offset += page_size

print(f"Total decks retrieved: {len(all_decks)}\n")

# -- 2. classify --------------------------------------------------------------

buckets = {
    "good": [],
    "outline_only": [],
    "error": [],
    "empty": [],
}

for d in all_decks:
    label = classify_deck(d)
    buckets[label].append(d)

# -- 3. summary ---------------------------------------------------------------

print("=" * 60)
print("DECK CLASSIFICATION SUMMARY")
print("=" * 60)
for label in ("good", "outline_only", "error", "empty"):
    print(f"  {label:15s}: {len(buckets[label])}")
print(f"  {'TOTAL':15s}: {len(all_decks)}")
print()

for label in ("good", "outline_only"):
    names = [d.get("name") or "(untitled)" for d in buckets[label]]
    print(f"First 5 '{label}' deck names:")
    for i, n in enumerate(names[:5], 1):
        print(f"  {i}. {n}")
    if not names:
        print("  (none)")
    print()

# -- 4. featured_decks check -------------------------------------------------

print("=" * 60)
print("FEATURED DECKS ANALYSIS")
print("=" * 60)

featured_all = []
offset = 0

while True:
    resp = (
        sb.table("featured_decks")
        .select("id, name, slides, is_active")
        .range(offset, offset + page_size - 1)
        .execute()
    )
    batch = resp.data or []
    featured_all.extend(batch)
    if len(batch) < page_size:
        break
    offset += page_size

print(f"Total featured_decks rows: {len(featured_all)}\n")

feat_good = []
feat_empty = []

for fd in featured_all:
    slides = fd.get("slides")
    if has_custom_component(slides):
        feat_good.append(fd)
    else:
        feat_empty.append(fd)

print(f"  good  (has CustomComponent): {len(feat_good)}")
print(f"  empty (no CustomComponent) : {len(feat_empty)}")
print()

if feat_good:
    print("Featured decks WITH good slides:")
    for fd in feat_good[:10]:
        name = fd.get("name") or "(untitled)"
        active = fd.get("is_active", False)
        slide_count = len(fd["slides"]) if isinstance(fd.get("slides"), list) else 0
        print(f"  - {name}  (slides={slide_count}, active={active})")
    if len(feat_good) > 10:
        print(f"  ... and {len(feat_good) - 10} more")
    print()

if feat_empty:
    print("Featured decks WITHOUT good slides:")
    for fd in feat_empty[:10]:
        name = fd.get("name") or "(untitled)"
        active = fd.get("is_active", False)
        slide_count = len(fd["slides"]) if isinstance(fd.get("slides"), list) else 0
        print(f"  - {name}  (slides={slide_count}, active={active})")
    if len(feat_empty) > 10:
        print(f"  ... and {len(feat_empty) - 10} more")

print("\nDone.")
