#!/usr/bin/env python3
"""
Run SEO content generation on Modal (remote server).

This script runs entirely on Modal's infrastructure — no local compute needed.
It hits the Render-deployed API for deck generation and Supabase directly for
table population.

Usage:
    cd apps/backend
    modal run scripts/seed_modal.py             # generate missing + populate tables
    modal run scripts/seed_modal.py --populate-only  # skip generation, just populate
    modal run scripts/seed_modal.py --cleanup    # delete partial decks first
"""

from __future__ import annotations
import modal

app = modal.App("nextslide-seed")

# Image that includes scripts/ (unlike main modal_app.py which excludes them)
seed_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "httpx>=0.28.1",
        "python-dotenv>=1.0.0",
        "supabase>=2.3.5",
    )
    .env({"PYTHONPATH": "/app"})
    .add_local_dir(
        ".",
        "/app",
        ignore=[
            "__pycache__", "*.pyc", ".env", ".git", "node_modules",
            "tests/", ".pytest_cache/", ".venv*", "venv/",
            "*.bak", "*.backup", ".DS_Store", "test_output/",
            "migrations/", "schemas/",
            "agents/", "api/", "models/", "utils/", "services/",
        ],
    )
)

API_BASE = "https://nextslide-backend.onrender.com"
USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"
BATCH_SIZE = 10
MAX_WAIT = 600
QUALITY_CHECK_AFTER = 120  # start checking slide quality after 120s


@app.function(
    image=seed_image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=3600,  # 1 hour max
    memory=1024,
    cpu=1.0,
)
async def seed_seo_content(populate_only: bool = False, cleanup: bool = False):
    """Generate all 100 SEO presentations and populate downstream tables."""
    import os
    import re
    import sys
    import time
    import uuid
    import random
    import asyncio
    from datetime import datetime, timedelta

    sys.path.insert(0, "/app")
    import httpx
    from supabase import create_client

    SUPABASE_URL = os.environ["SUPABASE_URL"]
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ── Load the 100 presentation definitions ─────────────────────────
    from scripts.seed_100_presentations import ALL_BATCHES
    all_pres = [p for batch in ALL_BATCHES for p in batch]
    total = len(all_pres)
    print(f"Loaded {total} presentation definitions")

    # ── Category helpers ──────────────────────────────────────────────
    VALID_CATS = {"business", "education", "marketing", "creative", "technology", "personal"}
    CAT_REMAP = {"sales": "business", "finance": "business", "consulting": "business",
                 "hr": "personal", "research": "education"}

    def remap(cat):
        return cat if cat in VALID_CATS else CAT_REMAP.get(cat, "business")

    def build_tags(name, cat):
        words = re.findall(r'[a-zA-Z]{3,}', name.lower())
        stop = {"the", "and", "for", "from", "with", "how", "what", "why", "that",
                "this", "are", "was", "our", "your", "every", "must", "track", "about"}
        tags = [w for w in words if w not in stop][:5]
        if cat not in tags:
            tags.append(cat)
        return tags[:6]

    # ── Cleanup ───────────────────────────────────────────────────────
    if cleanup:
        print("\n[0] Cleaning up partial/broken decks...")
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()

        r1 = sb.table("decks").select("uuid, status, slides").eq(
            "user_id", USER_ID).gte("created_at", week_ago).execute()
        r2 = sb.table("decks").select("uuid, status, slides").is_(
            "user_id", "null").gte("created_at", week_ago).execute()

        partial = []
        for d in (r1.data or []) + (r2.data or []):
            st = d.get("status", {})
            state = st.get("state", "") if isinstance(st, dict) else str(st)
            if state != "completed" or not d.get("slides"):
                partial.append(d["uuid"])

        for u in partial:
            for tbl in ["featured_decks", "community_decks", "deck_shares"]:
                try:
                    col = "uuid" if tbl == "featured_decks" else "deck_uuid"
                    sb.table(tbl).delete().eq(col, u).execute()
                except Exception:
                    pass
            try:
                sb.table("decks").delete().eq("uuid", u).execute()
            except Exception:
                pass

        print(f"    Deleted {len(partial)} partial decks")

    # ── Find existing decks ───────────────────────────────────────────
    print("\n[1] Checking existing decks...")
    r1 = sb.table("decks").select("uuid, name, slides, status").eq(
        "user_id", USER_ID).order("created_at").execute()
    r2 = sb.table("decks").select("uuid, name, slides, status").is_(
        "user_id", "null").order("created_at").execute()

    deck_lookup = {}
    for d in (r1.data or []) + (r2.data or []):
        name = d.get("name", "")
        if not name:
            continue
        words = [w.lower() for w in name.split() if len(w) > 2][:4]
        key = " ".join(words)
        slides = d.get("slides") or []
        st = d.get("status", {})
        state = st.get("state", "") if isinstance(st, dict) else str(st)
        if len(slides) > 0 or state == "completed":
            deck_lookup[key] = d["uuid"]

    matched = {}
    for i, pres in enumerate(all_pres):
        words = [w.lower() for w in pres["topic"].split() if len(w) > 2][:4]
        key = " ".join(words)
        if key in deck_lookup:
            matched[i] = deck_lookup[key]
            continue
        key3 = " ".join(words[:3])
        for ek, euuid in deck_lookup.items():
            if key3 in ek or ek.startswith(key3):
                matched[i] = euuid
                break

    missing = [i for i in range(total) if i not in matched]
    print(f"    Matched: {len(matched)}/{total}")
    print(f"    Missing: {len(missing)}")

    # ── Generate missing presentations ────────────────────────────────
    if not populate_only and missing:
        print(f"\n[2] Creating API key...")

        import hashlib
        import secrets as sec

        random_part = sec.token_urlsafe(32)[:32]
        api_key = f"ns_live_{random_part}"
        key_prefix = api_key[:16] + "..."
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        key_data = {
            "user_id": USER_ID,
            "key_prefix": key_prefix,
            "key_hash": key_hash,
            "name": "Modal SEO Seed",
            "context_instructions": (
                "Generate premium, showcase-quality presentations. "
                "Use infographic layouts, data visualizations, charts, and metric cards. "
                "Keep text minimal with large bold headings. Use Inter or Montserrat fonts."
            ),
            "context_images": [],
            "include_edit_link": True,
            "is_active": True,
            "request_count": 0,
        }
        key_result = sb.table("api_keys").insert(key_data).execute()
        key_id = key_result.data[0]["id"] if key_result.data else None
        print(f"    Key: {key_prefix}")

        # ── Helper: check if deck has properly rendered slides ────────
        def check_slide_quality(deck_id):
            """Return True only if deck has slides with actual CustomComponent content."""
            try:
                r = sb.table("decks").select("uuid, status, slides").eq("uuid", deck_id).single().execute()
                if not r.data:
                    return False
                slides = r.data.get("slides") or []
                if not slides:
                    return False
                # Check first slide has a CustomComponent with rendered HTML
                first = slides[0]
                components = first.get("components") or []
                for comp in components:
                    if comp.get("type") == "CustomComponent":
                        render = (comp.get("props") or {}).get("render", "")
                        if len(render) > 100:  # must have substantial HTML
                            return True
                return False
            except Exception:
                return False

        async def create_and_wait(client, pres, idx):
            topic = pres["topic"]
            label = topic[:50]
            deck_id = None
            for attempt in range(4):
                try:
                    resp = await client.post(
                        f"{API_BASE}/v1/decks",
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
                    break
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < 3:
                        wait = 30 * (attempt + 1)
                        print(f"  [{idx+1:3d}/{total}] Rate limited, waiting {wait}s...")
                        await asyncio.sleep(wait)
                        continue
                    print(f"  [{idx+1:3d}/{total}] FAILED: {label} — {e}")
                    return None
                except Exception as e:
                    print(f"  [{idx+1:3d}/{total}] FAILED: {label} — {e}")
                    return None
            if not deck_id:
                return None

            start = time.time()
            while time.time() - start < MAX_WAIT:
                try:
                    r = await client.get(
                        f"{API_BASE}/v1/decks/{deck_id}/status",
                        headers={"X-API-Key": api_key},
                        timeout=10.0,
                    )
                    r.raise_for_status()
                    st = r.json()
                    if st["status"] == "completed":
                        # Verify slides actually have content
                        if check_slide_quality(deck_id):
                            print(f"  [{idx+1:3d}/{total}] Done:   {deck_id[:8]}... ({time.time()-start:.0f}s) {label}")
                            return deck_id
                        else:
                            print(f"  [{idx+1:3d}/{total}] Status=completed but slides empty, waiting...")
                    if st["status"] == "failed":
                        print(f"  [{idx+1:3d}/{total}] FAILED: {label}")
                        return None
                except Exception:
                    pass

                # After QUALITY_CHECK_AFTER, check DB directly for rendered slides
                if time.time() - start > QUALITY_CHECK_AFTER:
                    if check_slide_quality(deck_id):
                        print(f"  [{idx+1:3d}/{total}] Ready:  {deck_id[:8]}... ({time.time()-start:.0f}s) {label}")
                        return deck_id

                await asyncio.sleep(8)

            # Final quality check at timeout
            if check_slide_quality(deck_id):
                print(f"  [{idx+1:3d}/{total}] Ready:  {deck_id[:8]}... ({time.time()-start:.0f}s) {label}")
                return deck_id

            print(f"  [{idx+1:3d}/{total}] TIMEOUT (no content): {label}")
            return None

        # ── Generate in batches of 20 ─────────────────────────────────
        total_batches = (len(missing) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"\n[3] Generating {len(missing)} presentations in {total_batches} batches of {BATCH_SIZE}...")
        print("=" * 70)

        gen_start = time.time()

        for batch_start in range(0, len(missing), BATCH_SIZE):
            batch = missing[batch_start:batch_start + BATCH_SIZE]
            batch_num = batch_start // BATCH_SIZE + 1
            print(f"\n--- Batch {batch_num}/{total_batches} ({len(batch)} decks) ---")

            async with httpx.AsyncClient() as client:
                tasks = [create_and_wait(client, all_pres[idx], idx) for idx in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for idx, result in zip(batch, results):
                    if isinstance(result, str) and result:
                        matched[idx] = result

            batch_ok = sum(1 for r in results if isinstance(r, str) and r)
            print(f"    Batch {batch_num}: {batch_ok}/{len(batch)} succeeded")

            if batch_start + BATCH_SIZE < len(missing):
                print("    Waiting 65s for rate limit window to reset...")
                await asyncio.sleep(65)

        print(f"\n{'=' * 70}")
        print(f"  Generation: {len(matched)}/{total} decks ({time.time()-gen_start:.0f}s)")

        # Cleanup API key
        if key_id:
            try:
                sb.table("api_keys").delete().eq("id", key_id).execute()
                print("  Test API key cleaned up.")
            except Exception:
                pass

    elif populate_only:
        print("\n  Skipping generation (--populate-only)")

    if not matched:
        print("  No decks available. Cannot populate tables.")
        return {"decks": 0}

    # ── Populate featured_decks ───────────────────────────────────────
    print(f"\n[4] Populating featured_decks...")
    existing_fd = set()
    try:
        r = sb.table("featured_decks").select("uuid").execute()
        existing_fd = {d["uuid"] for d in (r.data or [])}
    except Exception:
        pass

    fd_ok = fd_skip = 0
    for idx, deck_uuid in sorted(matched.items()):
        if deck_uuid in existing_fd:
            # Update display_order
            try:
                sb.table("featured_decks").update(
                    {"display_order": idx, "is_active": True}
                ).eq("uuid", deck_uuid).execute()
            except Exception:
                pass
            fd_skip += 1
            continue

        try:
            dr = sb.table("decks").select("uuid, name, slides, slide_count").eq(
                "uuid", deck_uuid).single().execute()
            if not dr.data:
                continue
            d = dr.data
        except Exception:
            continue

        slides = d.get("slides") or []
        row = {
            "uuid": deck_uuid,
            "name": d.get("name") or all_pres[idx]["topic"],
            "description": all_pres[idx]["topic"],
            "slides": slides,
            "slide_count": len(slides),
            "display_order": idx,
            "is_active": True,
        }
        try:
            sb.table("featured_decks").upsert(row, on_conflict="uuid").execute()
            fd_ok += 1
        except Exception as e:
            print(f"    ERR featured_decks: {str(e)[:60]}")

    print(f"    featured_decks: {fd_ok} new, {fd_skip} updated")

    # ── Populate community_decks ──────────────────────────────────────
    print(f"\n[5] Populating community_decks...")
    existing_cd = set()
    try:
        r = sb.table("community_decks").select("deck_uuid").execute()
        existing_cd = {d["deck_uuid"] for d in (r.data or [])}
    except Exception:
        pass

    cd_ok = cd_skip = 0
    for idx, deck_uuid in sorted(matched.items()):
        if deck_uuid in existing_cd:
            cd_skip += 1
            continue

        pres = all_pres[idx]
        cat = remap(pres.get("category", "business"))
        tags = build_tags(pres["topic"], pres.get("category", "business"))

        try:
            dr = sb.table("decks").select("slides").eq("uuid", deck_uuid).single().execute()
            slides = (dr.data or {}).get("slides") or []
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
            existing_cd.add(deck_uuid)
            cd_ok += 1
        except Exception:
            pass

    print(f"    community_decks: {cd_ok} new, {cd_skip} existing")

    # ── Populate deck_shares ──────────────────────────────────────────
    print(f"\n[6] Populating deck_shares...")
    existing_ds = set()
    try:
        r = sb.table("deck_shares").select("deck_uuid").eq("is_public", True).execute()
        existing_ds = {d["deck_uuid"] for d in (r.data or [])}
    except Exception:
        pass

    ds_ok = 0
    for idx, deck_uuid in sorted(matched.items()):
        if deck_uuid in existing_ds:
            continue
        pres = all_pres[idx]
        cat = remap(pres.get("category", "business"))
        row = {
            "deck_uuid": deck_uuid,
            "short_code": uuid.uuid4().hex[:8],
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
            ds_ok += 1
        except Exception:
            pass

    print(f"    deck_shares: {ds_ok} new")

    # ── Populate templates ────────────────────────────────────────────
    print(f"\n[7] Populating templates...")
    TEMPLATE_DEFS = [
        {"slug": "startup-pitch-deck", "title": "Free Startup Pitch Deck Template",
         "desc": "Investor-ready pitch deck: problem, solution, market, traction, team, ask.",
         "cat": "business", "tags": ["startup", "pitch", "investor", "fundraising", "vc"], "src": 0},
        {"slug": "sales-deck", "title": "Free Sales Deck Template",
         "desc": "Persuasive sales presentation to win new clients.",
         "cat": "business", "tags": ["sales", "proposal", "client", "B2B"], "src": 10},
        {"slug": "marketing-strategy", "title": "Free Marketing Strategy Template",
         "desc": "Market analysis, target audience, channels, and KPIs.",
         "cat": "marketing", "tags": ["marketing", "strategy", "digital", "campaign"], "src": 8},
        {"slug": "quarterly-review", "title": "Free Quarterly Business Review Template",
         "desc": "Quarterly results with performance highlights and goals.",
         "cat": "business", "tags": ["quarterly", "review", "QBR", "performance"], "src": 81},
        {"slug": "business-plan", "title": "Free Business Plan Template",
         "desc": "Executive summary, market analysis, financials, and roadmap.",
         "cat": "business", "tags": ["business plan", "strategy", "executive"], "src": 1},
        {"slug": "investor-update", "title": "Free Investor Update Template",
         "desc": "KPIs, financials, product progress, and asks.",
         "cat": "business", "tags": ["investor", "update", "KPI", "board"], "src": 63},
        {"slug": "product-launch", "title": "Free Product Launch Template",
         "desc": "Features, positioning, and go-to-market plan.",
         "cat": "marketing", "tags": ["product", "launch", "go-to-market"], "src": 47},
        {"slug": "team-onboarding", "title": "Free Team Onboarding Template",
         "desc": "Culture, tools, processes, and first-week plan.",
         "cat": "personal", "tags": ["onboarding", "HR", "team", "culture"], "src": 2},
        {"slug": "course-lecture", "title": "Free Course Lecture Template",
         "desc": "Learning objectives, key concepts, and review questions.",
         "cat": "education", "tags": ["education", "lecture", "course", "teaching"], "src": 6},
        {"slug": "project-proposal", "title": "Free Project Proposal Template",
         "desc": "Objectives, scope, timeline, budget, and risks.",
         "cat": "business", "tags": ["project", "proposal", "management"], "src": 20},
        {"slug": "company-overview", "title": "Free Company Overview Template",
         "desc": "Introduce your company to partners, clients, or new hires.",
         "cat": "business", "tags": ["company", "overview", "corporate"], "src": 3},
        {"slug": "case-study", "title": "Free Case Study Template",
         "desc": "Challenge, approach, solution, and results.",
         "cat": "business", "tags": ["case study", "results", "success"], "src": 70},
        {"slug": "workshop-training", "title": "Free Workshop Template",
         "desc": "Agenda, exercises, and wrap-up for training sessions.",
         "cat": "education", "tags": ["workshop", "training", "interactive"], "src": 50},
        {"slug": "conference-talk", "title": "Free Conference Talk Template",
         "desc": "Strong hook, narrative flow, and powerful closing.",
         "cat": "creative", "tags": ["conference", "talk", "keynote"], "src": 99},
        {"slug": "research-presentation", "title": "Free Research Presentation Template",
         "desc": "Methodology, analysis, findings, and conclusions.",
         "cat": "education", "tags": ["research", "academic", "findings"], "src": 26},
        {"slug": "consulting-deliverable", "title": "Free Consulting Deliverable Template",
         "desc": "Executive summary, analysis, recommendations, and plan.",
         "cat": "business", "tags": ["consulting", "deliverable", "strategy"], "src": 22},
    ]

    existing_tpl = set()
    try:
        r = sb.table("templates").select("slug").execute()
        existing_tpl = {d["slug"] for d in (r.data or [])}
    except Exception:
        pass

    tpl_ok = 0
    for tdef in TEMPLATE_DEFS:
        if tdef["slug"] in existing_tpl:
            continue
        deck_uuid = matched.get(tdef["src"])
        slides = []
        if deck_uuid:
            try:
                dr = sb.table("decks").select("slides").eq("uuid", deck_uuid).single().execute()
                slides = (dr.data or {}).get("slides") or []
            except Exception:
                pass

        deck_data = {
            "title": tdef["title"],
            "slides": slides,
            "slideCount": len(slides),
            "version": "template-v1",
            "size": {"width": 1920, "height": 1080},
        }
        row = {
            "slug": tdef["slug"],
            "title": tdef["title"],
            "description": tdef["desc"],
            "category": tdef["cat"],
            "tags": tdef["tags"],
            "deck_data": deck_data,
            "thumbnail_url": None,
            "use_count": random.randint(5, 100),
            "is_active": True,
        }
        try:
            sb.table("templates").insert(row).execute()
            tpl_ok += 1
        except Exception:
            pass

    print(f"    templates: {tpl_ok} new")

    # ── Summary ───────────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print(f"  DONE!")
    print(f"  Decks: {len(matched)}/{total}")
    print(f"  featured_decks: {fd_ok} new + {fd_skip} updated")
    print(f"  community_decks: {cd_ok} new")
    print(f"  deck_shares: {ds_ok} new")
    print(f"  templates: {tpl_ok} new")
    print(f"{'=' * 70}")

    return {
        "total_decks": len(matched),
        "featured": fd_ok,
        "community": cd_ok,
        "shares": ds_ok,
        "templates": tpl_ok,
    }


@app.local_entrypoint()
def main(populate_only: bool = False, cleanup: bool = False):
    """Entry point: modal run scripts/seed_modal.py [--populate-only] [--cleanup]"""
    result = seed_seo_content.remote(populate_only=populate_only, cleanup=cleanup)
    print(f"\nResult: {result}")
