#!/usr/bin/env python3
"""Fix categories and remove non-seed decks from community browse."""
import os, sys, re, random
import uuid as _uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client
from scripts.seed_100_presentations import BATCH_1, BATCH_2, BATCH_3, BATCH_4, BATCH_5, TEMPLATE_DEFS

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"
VALID_COMMUNITY_CATS = {"business", "education", "marketing", "creative", "technology", "personal"}
CAT_REMAP = {"sales": "business", "finance": "business", "consulting": "business",
             "hr": "personal", "research": "education"}

ALL_PRES = BATCH_1 + BATCH_2 + BATCH_3 + BATCH_4 + BATCH_5


def normalize(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', s.lower())[:40]


# Build lookup: normalized topic prefix -> config
TOPIC_LOOKUP = {}
for p in ALL_PRES:
    key = normalize(p["topic"])
    TOPIC_LOOKUP[key] = p


def match_config(deck_name: str):
    """Match a deck name to its batch config."""
    norm = normalize(deck_name)
    # Exact prefix match
    for key, config in TOPIC_LOOKUP.items():
        if norm[:20] == key[:20] or key[:20] == norm[:20]:
            return config
    # Fuzzy: check word overlap (2+ significant words)
    name_words = set(re.findall(r'[a-z]{4,}', deck_name.lower()))
    best_match = None
    best_score = 0
    for config in ALL_PRES:
        topic_words = set(re.findall(r'[a-z]{4,}', config["topic"].lower()))
        overlap = name_words & topic_words
        # Remove very common words
        common = {"with", "from", "that", "this", "your", "into", "every", "what"}
        overlap -= common
        if len(overlap) >= 2 and len(overlap) > best_score:
            best_score = len(overlap)
            best_match = config
    return best_match


def main():
    sb = get_supabase_client()

    # Step 1: Clean up existing seeded data
    print("Step 1: Cleaning up existing seeded data...")
    try:
        r = sb.table("community_decks").delete().eq("author_name", "NextSlide Team").execute()
        print(f"  Deleted {len(r.data or [])} community_decks")
    except Exception as e:
        print(f"  community_decks: {e}")

    try:
        r = sb.table("deck_shares").delete().eq("is_public", True).eq("created_by", USER_ID).execute()
        print(f"  Deleted {len(r.data or [])} public deck_shares")
    except Exception as e:
        print(f"  deck_shares: {e}")

    try:
        r = sb.table("templates").delete().eq("is_active", True).execute()
        print(f"  Deleted {len(r.data or [])} templates")
    except Exception as e:
        print(f"  templates: {e}")

    # Step 2: Get all completed decks
    print("\nStep 2: Finding seed decks...")
    r = sb.table("decks").select(
        "uuid, name, slides, slide_count, status"
    ).order("created_at", desc=True).limit(200).execute()

    seed_matches = []
    non_matches = []
    for d in (r.data or []):
        s = d.get("status", {})
        state = s.get("state", "?") if isinstance(s, dict) else str(s)
        slides = d.get("slides") or []
        if state != "completed" or len(slides) == 0:
            continue

        name = d.get("name") or ""
        config = match_config(name)
        if config:
            seed_matches.append((d, config))
        else:
            non_matches.append(name)

    print(f"  Matched seed decks: {len(seed_matches)}")
    print(f"  Non-seed (skipped): {len(non_matches)}")
    if non_matches:
        for nm in non_matches[:5]:
            print(f"    skip: {nm[:60]}")

    # Step 3: Insert with correct categories
    print(f"\nStep 3: Inserting {len(seed_matches)} decks with correct categories...")
    comm_ok = share_ok = 0
    seen_uuids = set()

    for i, (deck, config) in enumerate(seed_matches):
        uuid = deck["uuid"]
        if uuid in seen_uuids:
            continue
        seen_uuids.add(uuid)

        name = deck.get("name") or config["topic"]
        slides = deck.get("slides") or []
        raw_cat = config.get("category", "business")
        cat = raw_cat if raw_cat in VALID_COMMUNITY_CATS else CAT_REMAP.get(raw_cat, "business")

        topic = config.get("topic", name)
        words = re.findall(r'[a-zA-Z]{3,}', topic.lower())
        stop = {"the", "and", "for", "from", "with", "how", "what", "why", "that", "this", "our", "your"}
        tags = [w for w in words if w not in stop][:5]

        days_ago = random.randint(1, 30)
        approved_at = (datetime.utcnow() - timedelta(days=days_ago)).isoformat()

        # community_deck
        try:
            sb.table("community_decks").insert({
                "deck_uuid": uuid,
                "user_id": USER_ID,
                "title": name,
                "description": topic,
                "category": cat,
                "tags": tags,
                "status": "approved",
                "slide_count": len(slides),
                "first_slide": slides[0] if slides else None,
                "slides_snapshot": slides,
                "theme_snapshot": {},
                "author_name": "NextSlide Team",
                "submitted_at": approved_at,
                "approved_at": approved_at,
                "view_count": random.randint(50, 800),
            }).execute()
            comm_ok += 1
        except Exception as e:
            if "duplicate" not in str(e).lower():
                print(f"    comm ERR [{uuid[:8]}]: {str(e)[:50]}")

        # deck_share
        try:
            short_code = _uuid.uuid4().hex[:8]
            sb.table("deck_shares").insert({
                "deck_uuid": uuid,
                "short_code": short_code,
                "share_type": "view",
                "created_by": USER_ID,
                "shared_by": USER_ID,
                "is_active": True,
                "is_public": True,
                "access_count": random.randint(20, 500),
                "public_title": name,
                "public_description": topic,
                "public_category": cat,
            }).execute()
            share_ok += 1
        except Exception as e:
            if "duplicate" not in str(e).lower():
                print(f"    share ERR [{uuid[:8]}]: {str(e)[:50]}")

        if (i + 1) % 20 == 0:
            print(f"  Progress: {i+1}/{len(seed_matches)}  (comm={comm_ok}, share={share_ok})")

    print(f"\n  community_decks: {comm_ok}")
    print(f"  deck_shares: {share_ok}")

    # Step 4: Templates
    print(f"\nStep 4: Seeding {len(TEMPLATE_DEFS)} templates...")
    completed_with_slides = [d for d, _ in seed_matches if len(d.get("slides") or []) > 0]
    t_ok = 0
    for i, tdef in enumerate(TEMPLATE_DEFS):
        donor = completed_with_slides[i % len(completed_with_slides)]
        slides = donor.get("slides") or []
        try:
            sb.table("templates").insert({
                "slug": tdef["slug"],
                "title": tdef["title"],
                "description": tdef["description"],
                "category": tdef["category"],
                "tags": tdef["tags"],
                "deck_data": {
                    "title": tdef["title"],
                    "slides": slides,
                    "slideCount": len(slides),
                    "version": "template-v1",
                    "size": {"width": 1920, "height": 1080},
                },
                "use_count": random.randint(5, 100),
                "is_active": True,
            }).execute()
            t_ok += 1
        except Exception as e:
            print(f"    template ERR [{tdef['slug']}]: {str(e)[:50]}")

    print(f"  templates: {t_ok}")

    # Mark decks public
    for d, _ in seed_matches:
        try:
            sb.table("decks").update({"visibility": "public"}).eq("uuid", d["uuid"]).execute()
        except Exception:
            pass

    # Final verification
    r1 = sb.table("community_decks").select("category", count="exact").execute()
    r2 = sb.table("deck_shares").select("public_category", count="exact").eq("is_public", True).execute()
    r3 = sb.table("templates").select("id", count="exact").eq("is_active", True).execute()

    cats = {}
    for d in (r1.data or []):
        c = d.get("category", "?")
        cats[c] = cats.get(c, 0) + 1

    share_cats = {}
    for d in (r2.data or []):
        c = d.get("public_category", "?")
        share_cats[c] = share_cats.get(c, 0) + 1

    print(f"\n{'=' * 50}")
    print(f"FINAL STATE:")
    print(f"  community_decks: {r1.count}")
    for k, v in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"    {k}: {v}")
    print(f"  public shares: {r2.count}")
    for k, v in sorted(share_cats.items(), key=lambda x: -x[1]):
        print(f"    {k}: {v}")
    print(f"  templates: {r3.count}")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
