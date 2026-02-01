#!/usr/bin/env python3
"""
Generate all 100 SEO presentations and populate every downstream table.

Combines generation (like generate_missing.py) with full database seeding
(like seed_from_featured.py) in a single idempotent script.

Populates:
  1. decks              — the raw generated presentations
  2. featured_decks     — display_order 0-99, powers landing page heroes
  3. community_decks    — powers /presentations browse page
  4. deck_shares        — public share links (/p/{short_code})
  5. templates          — powers /presentation-templates/:slug pages

Usage:
    cd apps/backend
    python scripts/generate_seo_content.py
    python scripts/generate_seo_content.py --base-url https://your-api.modal.run
    python scripts/generate_seo_content.py --skip-generate   # only populate tables
    python scripts/generate_seo_content.py --batch-size 10   # smaller batches
"""

import os
import re
import sys
import time
import uuid
import random
import asyncio
import argparse

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import httpx
from services.supabase import get_supabase_client
from services.api_key_service import get_api_key_service

# Import the 100 topic definitions from the existing seed script
from scripts.seed_100_presentations import ALL_BATCHES

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"
API_BASE = "http://localhost:9090"
DEFAULT_BATCH_SIZE = 20
AUTO_FIX_AFTER_SECS = 90
MAX_WAIT_SECS = 600

# ──────────────────────────────────────────────────────────────────────
# Category mapping (same as seed_from_featured.py)
# ──────────────────────────────────────────────────────────────────────

VALID_CATEGORIES = {"business", "education", "marketing", "creative", "technology", "personal"}
CATEGORY_REMAP = {
    "sales": "business",
    "finance": "business",
    "consulting": "business",
    "hr": "personal",
    "research": "education",
}


def remap_category(cat: str) -> str:
    if cat in VALID_CATEGORIES:
        return cat
    return CATEGORY_REMAP.get(cat, "business")


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s-]+', '-', text)
    return text.strip('-')[:80]


def build_tags(name: str, category: str) -> list:
    words = re.findall(r'[a-zA-Z]{3,}', name.lower())
    stop = {"the", "and", "for", "from", "with", "how", "what", "why", "that", "this",
            "are", "was", "our", "your", "every", "must", "track", "about"}
    tags = [w for w in words if w not in stop][:5]
    if category not in tags:
        tags.append(category)
    return tags[:6]


# ──────────────────────────────────────────────────────────────────────
# Template definitions (for /presentation-templates/:slug)
# ──────────────────────────────────────────────────────────────────────

TEMPLATE_DEFS = [
    {"slug": "startup-pitch-deck", "title": "Free Startup Pitch Deck Template",
     "description": "A clean, investor-ready pitch deck template for startups. Covers problem, solution, market size, traction, business model, team, and the ask.",
     "category": "business", "tags": ["startup", "pitch", "investor", "fundraising", "vc"],
     "source_index": 0},  # SaaS Metrics
    {"slug": "sales-deck", "title": "Free Sales Deck Template",
     "description": "A persuasive sales presentation template to win new clients.",
     "category": "business", "tags": ["sales", "proposal", "client", "B2B", "closing"],
     "source_index": 10},  # Enterprise Sales
    {"slug": "marketing-strategy", "title": "Free Marketing Strategy Template",
     "description": "Plan and present your marketing strategy with market analysis, channels, and KPIs.",
     "category": "marketing", "tags": ["marketing", "strategy", "digital", "campaign", "growth"],
     "source_index": 8},  # Brand Positioning
    {"slug": "quarterly-review", "title": "Free Quarterly Business Review Template",
     "description": "Present quarterly results with performance highlights and next-quarter goals.",
     "category": "business", "tags": ["quarterly", "review", "QBR", "performance", "reporting"],
     "source_index": 81},  # Board Meeting
    {"slug": "business-plan", "title": "Free Business Plan Presentation Template",
     "description": "Present a compelling business plan with executive summary, market analysis, and roadmap.",
     "category": "business", "tags": ["business plan", "strategy", "executive", "planning"],
     "source_index": 1},  # Series B
    {"slug": "investor-update", "title": "Free Investor Update Template",
     "description": "Keep investors informed with KPIs, financials, and product progress.",
     "category": "business", "tags": ["investor", "update", "fundraising", "KPI", "board"],
     "source_index": 63},  # VC Fund
    {"slug": "product-launch", "title": "Free Product Launch Presentation Template",
     "description": "Announce your product launch with features, positioning, and go-to-market plan.",
     "category": "marketing", "tags": ["product", "launch", "go-to-market", "announcement"],
     "source_index": 47},  # GTM Launch
    {"slug": "team-onboarding", "title": "Free Team Onboarding Presentation Template",
     "description": "Welcome new team members with culture, tools, and first-week plan.",
     "category": "personal", "tags": ["onboarding", "HR", "team", "culture", "new hire"],
     "source_index": 2},  # Remote Culture
    {"slug": "course-lecture", "title": "Free Course Lecture Presentation Template",
     "description": "Deliver engaging course lectures with learning objectives and review questions.",
     "category": "education", "tags": ["education", "lecture", "course", "teaching", "academic"],
     "source_index": 6},  # ML for Beginners
    {"slug": "project-proposal", "title": "Free Project Proposal Presentation Template",
     "description": "Win project approvals with objectives, scope, timeline, and budget.",
     "category": "business", "tags": ["project", "proposal", "management", "approval"],
     "source_index": 20},  # Digital Transformation
    {"slug": "annual-report", "title": "Free Annual Report Presentation Template",
     "description": "Summarize your year with highlights, financial performance, and outlook.",
     "category": "business", "tags": ["annual", "report", "yearly", "performance"],
     "source_index": 44},  # ESG Report
    {"slug": "company-overview", "title": "Free Company Overview Presentation Template",
     "description": "Introduce your company to partners, clients, or new hires.",
     "category": "business", "tags": ["company", "overview", "corporate", "introduction"],
     "source_index": 3},  # Marketplace Pitch
    {"slug": "portfolio-showcase", "title": "Free Portfolio Showcase Presentation Template",
     "description": "Show off your best work. Perfect for designers, agencies, and freelancers.",
     "category": "creative", "tags": ["portfolio", "showcase", "design", "agency"],
     "source_index": 96},  # UX Case Study
    {"slug": "case-study", "title": "Free Case Study Presentation Template",
     "description": "Present compelling case studies with challenge, approach, and results.",
     "category": "business", "tags": ["case study", "results", "client", "success"],
     "source_index": 70},  # Customer Success
    {"slug": "workshop-training", "title": "Free Workshop & Training Presentation Template",
     "description": "Run engaging workshops with agenda, exercises, and wrap-up.",
     "category": "education", "tags": ["workshop", "training", "interactive", "learning"],
     "source_index": 50},  # Public Speaking
    {"slug": "conference-talk", "title": "Free Conference Talk Presentation Template",
     "description": "Deliver memorable conference presentations with strong narrative flow.",
     "category": "creative", "tags": ["conference", "talk", "speaking", "keynote"],
     "source_index": 99},  # Data Visualization
    {"slug": "research-presentation", "title": "Free Research Presentation Template",
     "description": "Present research findings with methodology, analysis, and conclusions.",
     "category": "education", "tags": ["research", "academic", "findings", "methodology"],
     "source_index": 26},  # UX Research
    {"slug": "consulting-deliverable", "title": "Free Consulting Deliverable Presentation Template",
     "description": "Deliver polished consulting presentations with analysis and recommendations.",
     "category": "business", "tags": ["consulting", "deliverable", "strategy", "recommendation"],
     "source_index": 22},  # Org Restructuring
    {"slug": "social-media-strategy", "title": "Free Social Media Strategy Presentation Template",
     "description": "Plan your social media strategy with audience analysis and content calendar.",
     "category": "marketing", "tags": ["social media", "strategy", "content", "LinkedIn"],
     "source_index": 68},  # Influencer Marketing
    {"slug": "budget-review", "title": "Free Budget Review Presentation Template",
     "description": "Present budget reviews with variance analysis and forecasts.",
     "category": "business", "tags": ["budget", "review", "finance", "planning"],
     "source_index": 13},  # Real Estate Investment
]


# ──────────────────────────────────────────────────────────────────────
# DB helpers
# ──────────────────────────────────────────────────────────────────────

def fix_stuck_deck(deck_id: str) -> bool:
    """Force-complete a deck that has slides but is stuck in 'generating'."""
    sb = get_supabase_client()
    try:
        result = sb.table("decks").select(
            "uuid, status, slide_count, slides"
        ).eq("uuid", deck_id).single().execute()
        if not result.data:
            return False
        d = result.data
        status = d.get("status", {})
        state = status.get("state", "") if isinstance(status, dict) else str(status)
        slides = d.get("slides") or []
        if state in ("generating", "queued") and len(slides) > 0:
            sb.table("decks").update(
                {"status": {"state": "completed", "progress": 100}}
            ).eq("uuid", deck_id).execute()
            return True
        return state == "completed"
    except Exception:
        return False


def find_existing_decks():
    """Find which of the 100 topics already have generated decks."""
    sb = get_supabase_client()

    # Get all decks from seed user
    result = sb.table("decks").select("uuid, name, slides, status").eq(
        "user_id", USER_ID
    ).order("created_at", desc=False).execute()
    user_decks = result.data or []

    # Also check decks with no user_id (from API key generation)
    api_result = sb.table("decks").select("uuid, name, slides, status").is_(
        "user_id", "null"
    ).order("created_at", desc=False).execute()
    api_decks = api_result.data or []

    all_decks = user_decks + api_decks

    # Build lookup by first N significant words
    deck_lookup = {}
    for d in all_decks:
        name = d.get("name", "")
        if not name:
            continue
        words = [w.lower() for w in name.split() if len(w) > 2][:4]
        key = " ".join(words)
        slides = d.get("slides") or []
        status = d.get("status", {})
        state = status.get("state", "") if isinstance(status, dict) else str(status)

        # Only count decks that have slides
        if len(slides) > 0 or state == "completed":
            deck_lookup[key] = d["uuid"]

    # Match against our 100 topics
    all_pres = [p for batch in ALL_BATCHES for p in batch]
    matched = {}

    for i, pres in enumerate(all_pres):
        topic = pres["topic"]
        words = [w.lower() for w in topic.split() if len(w) > 2][:4]
        key = " ".join(words)

        if key in deck_lookup:
            matched[i] = deck_lookup[key]
            continue

        # Partial match
        key3 = " ".join(words[:3])
        for ek, euuid in deck_lookup.items():
            if key3 in ek or ek.startswith(key3):
                matched[i] = euuid
                break

    return matched


# ──────────────────────────────────────────────────────────────────────
# Generation
# ──────────────────────────────────────────────────────────────────────

async def create_and_wait(client, api_key, pres, idx, total):
    """Create deck via API and wait for completion."""
    topic = pres["topic"]
    label = topic[:50]

    try:
        resp = await client.post(
            "/v1/decks",
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            json={
                "topic": topic,
                "slides": pres["slides"],
                "additional_instructions": pres.get("additional_instructions", ""),
            },
            timeout=120.0,
        )
        resp.raise_for_status()
        deck_id = resp.json()["deck_id"]
        print(f"  [{idx+1:3d}/{total}] Queued: {deck_id[:8]}... {label}")
    except Exception as e:
        print(f"  [{idx+1:3d}/{total}] FAILED to create: {label} — {e}")
        return None

    # Poll for completion with auto-fix
    start = time.time()
    while time.time() - start < MAX_WAIT_SECS:
        try:
            r = await client.get(
                f"/v1/decks/{deck_id}/status",
                headers={"X-API-Key": api_key},
                timeout=10.0,
            )
            r.raise_for_status()
            status = r.json()
            if status["status"] == "completed":
                elapsed = time.time() - start
                print(f"  [{idx+1:3d}/{total}] Done:   {deck_id[:8]}... ({elapsed:.0f}s) {label}")
                return deck_id
            if status["status"] == "failed":
                print(f"  [{idx+1:3d}/{total}] FAILED: {label}")
                return None
        except Exception:
            pass

        # Auto-fix stuck decks
        if time.time() - start > AUTO_FIX_AFTER_SECS:
            if fix_stuck_deck(deck_id):
                elapsed = time.time() - start
                print(f"  [{idx+1:3d}/{total}] Fixed:  {deck_id[:8]}... ({elapsed:.0f}s) {label}")
                return deck_id

        await asyncio.sleep(5)

    # Last resort
    if fix_stuck_deck(deck_id):
        elapsed = time.time() - start
        print(f"  [{idx+1:3d}/{total}] Fixed:  {deck_id[:8]}... ({elapsed:.0f}s) {label}")
        return deck_id

    print(f"  [{idx+1:3d}/{total}] TIMEOUT: {label}")
    return None


async def generate_missing(base_url: str, batch_size: int):
    """Generate all missing presentations and return index→deck_id mapping."""
    all_pres = [p for batch in ALL_BATCHES for p in batch]
    total = len(all_pres)

    print(f"\n[1] Checking existing decks...")
    matched = find_existing_decks()
    missing_indices = [i for i in range(total) if i not in matched]
    print(f"    Matched: {len(matched)}/{total}")
    print(f"    Missing: {len(missing_indices)}")

    if not missing_indices:
        print("    All 100 presentations exist!")
        return matched

    # Create API key
    print(f"\n[2] Creating API key...")
    service = get_api_key_service()
    api_key, record = await service.create_api_key(
        user_id=USER_ID,
        name="SEO Content Generator",
        context_instructions=(
            "Generate premium, showcase-quality presentations. "
            "Use infographic layouts, data visualizations, charts, and metric cards. "
            "Keep text minimal with large bold headings. Use Inter or Montserrat fonts. "
            "Each slide should have one hero visual element. Make it stunning."
        ),
        include_edit_link=True,
    )
    print(f"    Key: {record.key_prefix}")

    # Generate in batches
    all_deck_ids = dict(matched)
    total_batches = (len(missing_indices) + batch_size - 1) // batch_size

    print(f"\n[3] Generating {len(missing_indices)} presentations in batches of {batch_size}...")
    print("=" * 70)

    gen_start = time.time()

    for batch_start in range(0, len(missing_indices), batch_size):
        batch = missing_indices[batch_start:batch_start + batch_size]
        batch_num = batch_start // batch_size + 1

        print(f"\n--- Batch {batch_num}/{total_batches} ({len(batch)} decks) ---")
        batch_start_time = time.time()

        async with httpx.AsyncClient(base_url=base_url) as client:
            tasks = [
                create_and_wait(client, api_key, all_pres[idx], idx, total)
                for idx in batch
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for idx, result in zip(batch, results):
                if isinstance(result, str) and result:
                    all_deck_ids[idx] = result
                elif isinstance(result, Exception):
                    print(f"    Exception for index {idx}: {result}")

        batch_elapsed = time.time() - batch_start_time
        batch_ok = sum(1 for idx, r in zip(batch, results) if isinstance(r, str) and r)
        print(f"    Batch done: {batch_ok}/{len(batch)} succeeded ({batch_elapsed:.0f}s)")

        # Brief pause between batches
        if batch_start + batch_size < len(missing_indices):
            await asyncio.sleep(3)

    gen_elapsed = time.time() - gen_start
    print(f"\n{'=' * 70}")
    print(f"  Generation complete: {len(all_deck_ids)}/{total} decks ({gen_elapsed:.0f}s)")
    print(f"{'=' * 70}")

    return all_deck_ids


# ──────────────────────────────────────────────────────────────────────
# Table population
# ──────────────────────────────────────────────────────────────────────

def populate_featured_decks(deck_mapping: dict):
    """Insert/update featured_decks with display_order matching deckIndex."""
    sb = get_supabase_client()
    all_pres = [p for batch in ALL_BATCHES for p in batch]

    print(f"\n[4] Populating featured_decks...")
    print("-" * 70)

    # Get existing featured_decks
    existing = {}
    try:
        result = sb.table("featured_decks").select("uuid, display_order").execute()
        existing = {r["uuid"]: r["display_order"] for r in (result.data or [])}
    except Exception:
        pass

    ok = skip = err = 0

    for idx, deck_uuid in sorted(deck_mapping.items()):
        pres = all_pres[idx]

        if deck_uuid in existing:
            # Update display_order if different
            if existing[deck_uuid] != idx:
                try:
                    sb.table("featured_decks").update(
                        {"display_order": idx, "is_active": True}
                    ).eq("uuid", deck_uuid).execute()
                except Exception:
                    pass
            skip += 1
            continue

        # Fetch deck slides
        try:
            deck_result = sb.table("decks").select(
                "uuid, name, slides, slide_count"
            ).eq("uuid", deck_uuid).single().execute()
            if not deck_result.data:
                err += 1
                continue
            d = deck_result.data
        except Exception as e:
            print(f"    ERR fetching {deck_uuid[:8]}: {e}")
            err += 1
            continue

        slides = d.get("slides") or []
        name = d.get("name") or pres["topic"]

        row = {
            "uuid": deck_uuid,
            "name": name,
            "description": pres["topic"],
            "slides": slides,
            "slide_count": len(slides),
            "display_order": idx,
            "is_active": True,
        }

        try:
            sb.table("featured_decks").upsert(row, on_conflict="uuid").execute()
            ok += 1
            if ok <= 10 or ok % 20 == 0:
                print(f"  [{ok:3d}] order={idx:2d} {name[:50]}")
        except Exception as e:
            print(f"    ERR: {name[:40]} — {str(e)[:60]}")
            err += 1

    print(f"    featured_decks: {ok} new, {skip} existing, {err} errors")


def populate_community_decks(deck_mapping: dict):
    """Insert into community_decks for the browse page."""
    sb = get_supabase_client()
    all_pres = [p for batch in ALL_BATCHES for p in batch]

    print(f"\n[5] Populating community_decks...")
    print("-" * 70)

    # Get existing
    existing = set()
    try:
        result = sb.table("community_decks").select("deck_uuid").execute()
        existing = {r["deck_uuid"] for r in (result.data or [])}
    except Exception:
        pass

    ok = skip = err = 0
    from datetime import datetime, timedelta

    for idx, deck_uuid in sorted(deck_mapping.items()):
        if deck_uuid in existing:
            skip += 1
            continue

        pres = all_pres[idx]
        raw_cat = pres.get("category", "business")
        cat = remap_category(raw_cat)
        tags = build_tags(pres["topic"], raw_cat)

        # Fetch first slide
        try:
            deck_result = sb.table("decks").select("slides").eq("uuid", deck_uuid).single().execute()
            slides = (deck_result.data or {}).get("slides") or []
        except Exception:
            slides = []

        days_ago = random.randint(1, 90)
        approved_at = (datetime.utcnow() - timedelta(days=days_ago)).isoformat()

        row = {
            "deck_uuid": deck_uuid,
            "user_id": USER_ID,
            "title": pres["topic"],
            "description": pres["topic"],
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
            "remix_count": random.randint(0, 40),
            "view_count": random.randint(100, 2000),
        }

        try:
            sb.table("community_decks").insert(row).execute()
            existing.add(deck_uuid)
            ok += 1
            if ok <= 5 or ok % 20 == 0:
                print(f"  [{ok:3d}] ({cat:12s}) {pres['topic'][:45]}")
        except Exception as e:
            print(f"    ERR: {pres['topic'][:40]} — {str(e)[:60]}")
            err += 1

    print(f"    community_decks: {ok} new, {skip} existing, {err} errors")


def populate_public_shares(deck_mapping: dict):
    """Create public deck_shares for the browse API."""
    sb = get_supabase_client()
    all_pres = [p for batch in ALL_BATCHES for p in batch]

    print(f"\n[6] Populating deck_shares...")
    print("-" * 70)

    existing = set()
    try:
        result = sb.table("deck_shares").select("deck_uuid").eq("is_public", True).execute()
        existing = {r["deck_uuid"] for r in (result.data or [])}
    except Exception:
        pass

    ok = skip = err = 0

    for idx, deck_uuid in sorted(deck_mapping.items()):
        if deck_uuid in existing:
            skip += 1
            continue

        pres = all_pres[idx]
        cat = remap_category(pres.get("category", "business"))
        short_code = uuid.uuid4().hex[:8]

        row = {
            "deck_uuid": deck_uuid,
            "short_code": short_code,
            "share_type": "view",
            "created_by": USER_ID,
            "shared_by": USER_ID,
            "is_active": True,
            "is_public": True,
            "access_count": random.randint(50, 1000),
            "public_title": pres["topic"],
            "public_description": pres["topic"],
            "public_category": cat,
        }

        try:
            sb.table("deck_shares").insert(row).execute()
            existing.add(deck_uuid)
            ok += 1
        except Exception as e:
            err += 1

    print(f"    deck_shares: {ok} new, {skip} existing, {err} errors")


def populate_templates(deck_mapping: dict):
    """Create template entries linked to actual generated decks."""
    sb = get_supabase_client()

    print(f"\n[7] Populating templates...")
    print("-" * 70)

    existing = set()
    try:
        result = sb.table("templates").select("slug").execute()
        existing = {r["slug"] for r in (result.data or [])}
    except Exception:
        pass

    ok = skip = err = 0

    for tdef in TEMPLATE_DEFS:
        slug = tdef["slug"]
        if slug in existing:
            skip += 1
            continue

        source_idx = tdef.get("source_index", 0)
        deck_uuid = deck_mapping.get(source_idx)

        # Fetch slides from the source deck
        slides = []
        if deck_uuid:
            try:
                result = sb.table("decks").select("slides").eq("uuid", deck_uuid).single().execute()
                slides = (result.data or {}).get("slides") or []
            except Exception:
                pass

        if not slides:
            # Generate placeholder slides if no source deck
            from scripts.seed_from_featured import generate_slides
            cat = remap_category(tdef["category"])
            slides = generate_slides(tdef["title"], tdef["description"], cat, source_idx)

        deck_data = {
            "title": tdef["title"],
            "slides": slides,
            "slideCount": len(slides),
            "version": "template-v1",
            "size": {"width": 1920, "height": 1080},
        }

        row = {
            "slug": slug,
            "title": tdef["title"],
            "description": tdef["description"],
            "category": tdef["category"],
            "tags": tdef["tags"],
            "deck_data": deck_data,
            "thumbnail_url": None,
            "use_count": random.randint(5, 100),
            "is_active": True,
        }

        try:
            sb.table("templates").insert(row).execute()
            existing.add(slug)
            ok += 1
            print(f"  [{ok:2d}] {slug}")
        except Exception as e:
            print(f"    ERR: {slug} — {str(e)[:60]}")
            err += 1

    print(f"    templates: {ok} new, {skip} existing, {err} errors")


# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="Generate SEO presentations and populate all tables")
    parser.add_argument("--base-url", default=API_BASE, help="API base URL")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Concurrent batch size")
    parser.add_argument("--skip-generate", action="store_true", help="Skip generation, only populate tables")
    args = parser.parse_args()

    all_pres = [p for batch in ALL_BATCHES for p in batch]

    print("=" * 70)
    print("  NextSlide SEO Content Generator")
    print(f"  {len(all_pres)} presentations | batch size {args.batch_size}")
    print(f"  Target: {args.base_url}")
    print("=" * 70)

    if args.skip_generate:
        print("\n  Skipping generation, using existing decks...")
        deck_mapping = find_existing_decks()
        print(f"  Found {len(deck_mapping)}/{len(all_pres)} existing decks")
    else:
        deck_mapping = await generate_missing(args.base_url, args.batch_size)

    if not deck_mapping:
        print("\n  No decks available. Cannot populate tables.")
        return

    # Populate all downstream tables
    populate_featured_decks(deck_mapping)
    populate_community_decks(deck_mapping)
    populate_public_shares(deck_mapping)
    populate_templates(deck_mapping)

    # Final summary
    print(f"\n{'=' * 70}")
    print(f"  ALL DONE!")
    print(f"  Decks generated/matched: {len(deck_mapping)}/{len(all_pres)}")
    print(f"  Tables populated: featured_decks, community_decks, deck_shares, templates")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    asyncio.run(main())
