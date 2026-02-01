#!/usr/bin/env python3
"""
Recovery script: Populate community_decks + deck_shares + templates
from already-generated decks.
"""
import os, sys, re, random
import uuid as _uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"

VALID_COMMUNITY_CATS = {"business", "education", "marketing", "creative", "technology", "personal"}
CAT_REMAP = {"sales": "business", "finance": "business", "consulting": "business",
             "hr": "personal", "research": "education"}

# Import batch configs for category mapping
from scripts.seed_100_presentations import BATCH_1, BATCH_2, BATCH_3, BATCH_4, BATCH_5, TEMPLATE_DEFS

ALL_PRES = BATCH_1 + BATCH_2 + BATCH_3 + BATCH_4 + BATCH_5

# Build topic -> config lookup
TOPIC_MAP = {}
for p in ALL_PRES:
    # Use first 40 chars of topic as key (names get truncated in DB)
    key = p["topic"][:60].lower().strip()
    TOPIC_MAP[key] = p

# Category inference from deck name
CATEGORY_KEYWORDS = {
    "business": ["saas", "startup", "fundrais", "remote team", "marketplace", "ecommerce", "restaurant",
                 "board meeting", "pricing strategy", "venture studio", "supply chain", "streaming",
                 "coffee industry", "nonprofit", "grant proposal", "ip strategy", "future of work",
                 "startup fail"],
    "education": ["solar system", "creative writing", "machine learning", "world war", "ancient egypt",
                  "music theory", "nutrition", "mental health", "space exploration", "sleep",
                  "public speaking", "time management", "inflation", "circular economy",
                  "fitness", "genetics", "dinosaur", "language learning", "statistics",
                  "constitution", "periodic table", "geography", "psychology", "cooking",
                  "world religion", "climate change kids", "personal finance", "philosophy",
                  "persuasion", "ocean"],
    "marketing": ["brand position", "email marketing", "growth hack", "d2c", "product launch",
                  "go-to-market", "influencer", "seo strategy", "customer journey", "podcast",
                  "social media"],
    "technology": ["api architecture", "cybersecurity", "product strategy", "data warehouse",
                   "llm", "healthcare ai", "quantum computing", "renewable energy", "devops",
                   "web3", "blockchain", "electric vehicle", "compliance", "gdpr"],
    "creative": ["photography", "evolution of gaming", "street food", "sustainable arch",
                 "ui design", "anime", "movie economics", "board game", "architecture movement",
                 "ux case study", "data viz", "portfolio"],
    "personal": ["dei strategy", "performance review", "employer brand", "team onboard"],
}


def guess_category(name: str) -> str:
    lower = name.lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in lower:
                return cat
    return "business"


def find_config(name: str) -> dict:
    """Find the batch config matching a deck name."""
    lower = name.lower().strip()
    for key, config in TOPIC_MAP.items():
        if key[:30] in lower[:40] or lower[:30] in key[:40]:
            return config
    return None


def main():
    sb = get_supabase_client()

    # Get all completed decks with slides
    print("Fetching completed decks...")
    r = sb.table("decks").select(
        "uuid, status, slides, slide_count, name, created_at"
    ).order("created_at", desc=True).limit(150).execute()

    completed = []
    for d in (r.data or []):
        s = d.get("status", {})
        state = s.get("state", "?") if isinstance(s, dict) else str(s)
        slides = d.get("slides") or []
        if state == "completed" and len(slides) > 0:
            completed.append(d)

    print(f"Found {len(completed)} completed decks with slides")

    # Check existing community_decks
    existing_comm = set()
    try:
        r2 = sb.table("community_decks").select("deck_uuid").execute()
        existing_comm = {d["deck_uuid"] for d in (r2.data or [])}
    except Exception:
        pass

    # Check existing deck_shares
    existing_shares = set()
    try:
        r3 = sb.table("deck_shares").select("deck_uuid").eq("is_public", True).execute()
        existing_shares = {d["deck_uuid"] for d in (r3.data or [])}
    except Exception:
        pass

    print(f"Existing community_decks: {len(existing_comm)}")
    print(f"Existing public shares: {len(existing_shares)}")

    # Filter to only seed decks (recently created, matching batch topics)
    seed_decks = []
    for d in completed:
        name = d.get("name") or ""
        config = find_config(name)
        if config:
            seed_decks.append((d, config))
        else:
            # Also match by category inference
            cat = guess_category(name)
            seed_decks.append((d, {"topic": name, "category": cat}))

    print(f"\nProcessing {len(seed_decks)} decks...")

    # Insert community_decks + deck_shares
    comm_ok = comm_skip = comm_err = 0
    share_ok = share_skip = share_err = 0

    for i, (deck, config) in enumerate(seed_decks):
        uuid = deck["uuid"]
        name = deck.get("name") or config.get("topic", "Untitled")
        slides = deck.get("slides") or []
        raw_cat = config.get("category", "business")
        cat = raw_cat if raw_cat in VALID_COMMUNITY_CATS else CAT_REMAP.get(raw_cat, "business")

        topic = config.get("topic", name)
        words = re.findall(r'[a-zA-Z]{3,}', topic.lower())
        stop = {"the", "and", "for", "from", "with", "how", "what", "why", "that", "this", "our", "your"}
        tags = [w for w in words if w not in stop][:5]

        days_ago = random.randint(1, 30)
        approved_at = (datetime.utcnow() - timedelta(days=days_ago)).isoformat()

        # Community deck
        if uuid not in existing_comm:
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
                err_str = str(e)[:60]
                if "duplicate" in err_str.lower():
                    comm_skip += 1
                else:
                    print(f"  comm ERR [{uuid[:8]}]: {err_str}")
                    comm_err += 1
        else:
            comm_skip += 1

        # Public deck_share
        if uuid not in existing_shares:
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
                err_str = str(e)[:60]
                if "duplicate" in err_str.lower():
                    share_skip += 1
                else:
                    print(f"  share ERR [{uuid[:8]}]: {err_str}")
                    share_err += 1
        else:
            share_skip += 1

        if (i + 1) % 20 == 0:
            print(f"  Progress: {i+1}/{len(seed_decks)}")

    print(f"\ncommunity_decks: {comm_ok} created, {comm_skip} skipped, {comm_err} errors")
    print(f"deck_shares:     {share_ok} created, {share_skip} skipped, {share_err} errors")

    # Seed templates
    print(f"\nSeeding {len(TEMPLATE_DEFS)} templates...")
    existing_templates = set()
    try:
        r4 = sb.table("templates").select("slug").execute()
        existing_templates = {t["slug"] for t in (r4.data or [])}
    except Exception:
        pass

    completed_with_slides = [d for d, _ in seed_decks if len(d.get("slides") or []) > 0]
    t_ok = t_skip = t_err = 0

    for i, tdef in enumerate(TEMPLATE_DEFS):
        if tdef["slug"] in existing_templates:
            t_skip += 1
            continue

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
                "use_count": random.randint(0, 50),
                "is_active": True,
            }).execute()
            t_ok += 1
        except Exception as e:
            print(f"  template ERR [{tdef['slug']}]: {str(e)[:60]}")
            t_err += 1

    print(f"templates: {t_ok} created, {t_skip} skipped, {t_err} errors")

    # Also mark decks as public visibility
    print("\nMarking decks as public visibility...")
    for d, _ in seed_decks:
        try:
            sb.table("decks").update({"visibility": "public"}).eq("uuid", d["uuid"]).execute()
        except Exception:
            pass

    # Final count
    r5 = sb.table("community_decks").select("id", count="exact").execute()
    r6 = sb.table("deck_shares").select("id", count="exact").eq("is_public", True).execute()
    r7 = sb.table("templates").select("id", count="exact").eq("is_active", True).execute()

    print(f"\n{'=' * 50}")
    print(f"FINAL STATE:")
    print(f"  community_decks: {r5.count}")
    print(f"  public shares:   {r6.count}")
    print(f"  templates:       {r7.count}")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
