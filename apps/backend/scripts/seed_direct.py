#!/usr/bin/env python3
"""
Direct SEO deck generation on Modal — bypasses HTTP API entirely.

Calls the internal outline generator + deck composer directly inside Modal
containers. No rate limits, no polling, no fix_stuck. Each deck generates
fully with CustomComponent HTML before moving to the next.

Usage:
    cd apps/backend
    modal run scripts/seed_direct.py
    modal run scripts/seed_direct.py --cleanup
    modal run scripts/seed_direct.py --populate-only
"""
from __future__ import annotations
import modal

app = modal.App("nextslide-seed-direct")

# Full backend image — includes schemas, agents, models, services, everything
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install_from_requirements("requirements.txt")
    .env({"PYTHONPATH": "/app", "USE_MODAL": "false"})
    .add_local_dir(
        ".",
        "/app",
        ignore=[
            "__pycache__", "*.pyc", ".env", ".git", "node_modules",
            "tests/", ".pytest_cache/", ".venv*", "venv/",
            "*.bak", "*.backup", ".DS_Store", "test_output/",
            "migrations/",
        ],
    )
)

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"
PARALLEL_SLIDES = 4   # slides within one deck
PARALLEL_DECKS = 25   # concurrent deck generations


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("nextslide-env")],
    timeout=7200,   # 2 hours max
    memory=8192,
    cpu=2.0,
)
async def seed_all(populate_only: bool = False, cleanup: bool = False):
    """Generate all missing SEO decks directly (no HTTP API)."""
    import os
    import re
    import sys
    import json
    import time
    import uuid
    import random
    import asyncio
    import logging
    from datetime import datetime, timedelta

    logging.basicConfig(level=logging.WARNING)
    sys.path.insert(0, "/app")

    from supabase import create_client

    SUPABASE_URL = os.environ["SUPABASE_URL"]
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ── Load presentation definitions ──────────────────────────────
    from scripts.seed_100_presentations import ALL_BATCHES
    all_pres = [p for batch in ALL_BATCHES for p in batch]
    total = len(all_pres)
    print(f"Loaded {total} presentation definitions")

    # ── Load component registry ────────────────────────────────────
    schemas_path = "/app/schemas/typebox_schemas_latest.json"
    with open(schemas_path) as f:
        schemas = json.load(f)
    from models.registry import ComponentRegistry, set_global_registry
    registry = ComponentRegistry(schemas)
    set_global_registry(registry)
    print(f"Registry loaded ({len(schemas)} schemas)")

    # ── Category helpers ───────────────────────────────────────────
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

    # ── Cleanup ────────────────────────────────────────────────────
    if cleanup:
        print("\n[0] Cleaning up broken decks (outline-only, no CustomComponent)...")
        r1 = sb.table("decks").select("uuid, name, slides, status").eq(
            "user_id", USER_ID).execute()
        r2 = sb.table("decks").select("uuid, name, slides, status").is_(
            "user_id", "null").execute()

        broken = []
        for d in (r1.data or []) + (r2.data or []):
            slides = d.get("slides") or []
            if not slides:
                broken.append(d["uuid"])
                continue
            first = slides[0]
            components = first.get("components") or []
            has_cc = any(
                c.get("type") == "CustomComponent"
                and len((c.get("props") or {}).get("render", "")) > 100
                for c in components
            )
            if not has_cc:
                broken.append(d["uuid"])

        for u in broken:
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
        print(f"    Deleted {len(broken)} broken decks")

    # ── Find existing good decks ───────────────────────────────────
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
        slides = d.get("slides") or []
        if not slides:
            continue
        # Only count as existing if it has CustomComponent content
        first = slides[0]
        components = first.get("components") or []
        has_cc = any(
            c.get("type") == "CustomComponent"
            and len((c.get("props") or {}).get("render", "")) > 100
            for c in components
        )
        if not has_cc:
            continue
        words = [w.lower() for w in name.split() if len(w) > 2][:4]
        key = " ".join(words)
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
    print(f"    Good decks: {len(matched)}/{total}")
    print(f"    Missing:    {len(missing)}")

    # ── Direct generation ──────────────────────────────────────────
    if not populate_only and missing:
        from services.outline import OutlineGenerator, OutlineOptions
        from agents.generation.deck_composer import _compose_deck_stream_local

        outline_gen = OutlineGenerator(registry)

        async def generate_one(pres_idx: int) -> str | None:
            """Generate a single deck end-to-end. Returns deck_uuid or None."""
            pres = all_pres[pres_idx]
            topic = pres["topic"]
            label = topic[:55]
            slide_count = pres.get("slides", 10)
            instructions = pres.get("additional_instructions", "")

            deck_uuid = str(uuid.uuid4())
            start = time.time()

            try:
                # Phase 1: Generate outline
                style_ctx = instructions if instructions else None
                options = OutlineOptions(
                    prompt=topic,
                    slide_count=slide_count,
                    style_context=style_ctx,
                    async_images=False,
                    files=[],
                )
                outline_result = await outline_gen.generate(options)

                if not outline_result or not outline_result.slides:
                    print(f"  [{pres_idx+1:3d}/{total}] OUTLINE FAILED: {label}")
                    return None

                # Build DeckOutline model
                from models.requests import DeckOutline
                deck_outline = DeckOutline.model_validate({
                    "id": deck_uuid,
                    "title": outline_result.title,
                    "slides": [
                        {
                            "id": str(uuid.uuid4()),
                            "title": s.title,
                            "content": s.content or "",
                            "taggedMedia": [],
                        }
                        for s in outline_result.slides
                    ],
                })
                print(f"  [{pres_idx+1:3d}/{total}] Outline: {len(outline_result.slides)} slides ({time.time()-start:.0f}s) {label}")

                # Phase 2: Compose deck (theme + slides + CustomComponent)
                final_event = None
                async for event in _compose_deck_stream_local(
                    deck_outline=deck_outline,
                    registry=registry,
                    deck_uuid=deck_uuid,
                    max_parallel=PARALLEL_SLIDES,
                    delay_between_slides=0.5,
                    async_images=False,
                    prefetch_images=False,
                    enable_visual_analysis=True,
                    user_id=USER_ID,
                ):
                    evt_type = event.get("type", "")
                    if evt_type == "deck_complete":
                        final_event = event

                if not final_event:
                    print(f"  [{pres_idx+1:3d}/{total}] COMPOSE FAILED: {label}")
                    return None

                elapsed = time.time() - start
                print(f"  [{pres_idx+1:3d}/{total}] DONE:    {deck_uuid[:8]}... ({elapsed:.0f}s) {label}")
                return deck_uuid

            except Exception as e:
                elapsed = time.time() - start
                print(f"  [{pres_idx+1:3d}/{total}] ERROR:   ({elapsed:.0f}s) {label} — {str(e)[:80]}")
                return None

        # ── Generate in batches ────────────────────────────────────
        total_batches = (len(missing) + PARALLEL_DECKS - 1) // PARALLEL_DECKS
        print(f"\n[2] Generating {len(missing)} decks ({PARALLEL_DECKS} concurrent, {PARALLEL_SLIDES} slides parallel)...")
        print("=" * 70)

        gen_start = time.time()
        for batch_start in range(0, len(missing), PARALLEL_DECKS):
            batch = missing[batch_start:batch_start + PARALLEL_DECKS]
            batch_num = batch_start // PARALLEL_DECKS + 1
            print(f"\n--- Batch {batch_num}/{total_batches} ({len(batch)} decks) ---")

            tasks = [generate_one(idx) for idx in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for idx, result in zip(batch, results):
                if isinstance(result, str) and result:
                    matched[idx] = result
                elif isinstance(result, Exception):
                    print(f"  [{idx+1:3d}/{total}] EXCEPTION: {str(result)[:80]}")

            ok = sum(1 for r in results if isinstance(r, str) and r)
            print(f"    Batch {batch_num}: {ok}/{len(batch)} succeeded")

        elapsed = time.time() - gen_start
        print(f"\n{'=' * 70}")
        print(f"  Generation: {len(matched)}/{total} decks ({elapsed:.0f}s)")

    elif populate_only:
        print("\n  Skipping generation (--populate-only)")

    if not matched:
        print("  No decks available. Cannot populate tables.")
        return {"decks": 0}

    # ── Populate featured_decks ────────────────────────────────────
    print(f"\n[3] Populating featured_decks...")
    existing_fd = set()
    try:
        r = sb.table("featured_decks").select("uuid").execute()
        existing_fd = {d["uuid"] for d in (r.data or [])}
    except Exception:
        pass

    fd_ok = fd_skip = 0
    for idx, deck_uuid in sorted(matched.items()):
        pres = all_pres[idx]

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
            "name": d.get("name") or pres["topic"],
            "description": pres["topic"],
            "slides": slides,
            "slide_count": len(slides),
            "display_order": idx,
            "is_active": True,
        }
        try:
            sb.table("featured_decks").upsert(row, on_conflict="uuid").execute()
            if deck_uuid in existing_fd:
                fd_skip += 1
            else:
                fd_ok += 1
        except Exception as e:
            print(f"    ERR featured_decks: {str(e)[:60]}")

    print(f"    featured_decks: {fd_ok} new, {fd_skip} updated")

    # ── Populate community_decks ───────────────────────────────────
    print(f"\n[4] Populating community_decks...")
    existing_cd = set()
    try:
        r = sb.table("community_decks").select("deck_uuid").execute()
        existing_cd = {d["deck_uuid"] for d in (r.data or [])}
    except Exception:
        pass

    cd_ok = cd_skip = 0
    for idx, deck_uuid in sorted(matched.items()):
        pres = all_pres[idx]
        cat = remap(pres.get("category", "business"))
        tags = build_tags(pres["topic"], pres.get("category", "business"))

        try:
            dr = sb.table("decks").select("slides").eq("uuid", deck_uuid).single().execute()
            slides = (dr.data or {}).get("slides") or []
        except Exception:
            slides = []

        if deck_uuid in existing_cd:
            # Update existing with fresh slide data
            try:
                sb.table("community_decks").update({
                    "first_slide": slides[0] if slides else None,
                    "slides_snapshot": slides,
                    "slide_count": len(slides),
                }).eq("deck_uuid", deck_uuid).execute()
            except Exception:
                pass
            cd_skip += 1
            continue

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

    print(f"    community_decks: {cd_ok} new, {cd_skip} updated")

    # ── Populate deck_shares ───────────────────────────────────────
    print(f"\n[5] Populating deck_shares...")
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

    # ── Populate templates ─────────────────────────────────────────
    print(f"\n[6] Populating templates...")
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
            sb.table("templates").upsert(row, on_conflict="slug").execute()
            if tdef["slug"] not in existing_tpl:
                tpl_ok += 1
        except Exception:
            pass

    print(f"    templates: {tpl_ok} new")

    # ── Summary ────────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print(f"  DONE!")
    print(f"  Decks: {len(matched)}/{total}")
    print(f"  featured_decks: {fd_ok} new + {fd_skip} updated")
    print(f"  community_decks: {cd_ok} new + {cd_skip} updated")
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
    """Entry point: modal run scripts/seed_direct.py [--populate-only] [--cleanup]"""
    result = seed_all.remote(populate_only=populate_only, cleanup=cleanup)
    print(f"\nResult: {result}")
