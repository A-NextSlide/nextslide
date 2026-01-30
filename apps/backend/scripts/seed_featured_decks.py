#!/usr/bin/env python3
"""
Seed 11 featured decks for the landing page.

Submits all creation requests, polls all in parallel,
and only updates featured_decks if ALL 11 complete successfully.

Usage:
    cd apps/backend
    python3 scripts/seed_featured_decks.py
"""

import os
import sys
import time
import asyncio
from typing import Optional, Dict, List, Tuple
import httpx

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client

API_KEY = "ns_live_Lwd5HS7g4O7jJCZT2yr1OrU6wQdlCElt"
API_BASE = "https://nextslide-backend.onrender.com"

# Existing deck to reuse (already generated)
EXISTING_90S_UUID = "f83af87c-9611-42df-a448-4e27c48711da"

# ── All 11 presentations in display order ──────────────────────────
DECKS = [
    # 1. Startup pitch
    {
        "topic": (
            "Create a sharp, visually striking startup pitch deck for VCs who have already seen 500 pitches this month. "
            "Make it impossible to ignore. Cover: the massive problem, the elegant solution, TAM/SAM/SOM market sizing, "
            "traction metrics with hockey-stick charts, business model, competitive moat, the founding team, "
            "and a bold funding ask. Use punchy one-liners, dramatic data visuals, and a confident tone. "
            "This should feel like the pitch deck that actually gets a callback."
        ),
        "slides": 10,
        "style": "corporate",
        "display_name": "Pitch deck for VCs who've already seen 500 this month",
        "description": "A startup pitch deck designed to stand out from the crowd",
        "generate": True,
    },
    # 2. Banking / Short-term stock analysis (NEW)
    {
        "topic": (
            "Create a professional banking and investment analysis presentation on short-term stock trading strategies. "
            "Cover: current market conditions and volatility indicators, technical analysis basics (RSI, MACD, Bollinger Bands), "
            "sector rotation strategies, momentum vs. mean-reversion approaches, risk management and position sizing, "
            "case studies of recent short-term trades, and key economic indicators to watch. "
            "Use financial charts, clean data visualizations, and a professional Wall Street aesthetic. "
            "Make it feel like a Goldman Sachs research briefing."
        ),
        "slides": 10,
        "style": "corporate",
        "display_name": "Short-term stock analysis that reads like a Goldman memo",
        "description": "Professional banking analysis of short-term stock trading strategies",
        "generate": True,
    },
    # 3. Education - Algebra
    {
        "topic": (
            "Create a fun, engaging educational presentation about algebra for kids who always ask 'when will I ever use this?' "
            "Show real-world algebra in action: video game physics, Spotify recommendation algorithms, cooking recipe scaling, "
            "sports statistics, TikTok's algorithm, budgeting for a dream purchase, and building Minecraft redstone circuits. "
            "Each slide should connect an algebra concept to something kids actually care about. "
            "Use colorful visuals, relatable examples, and a tone that's enthusiastic without being condescending."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "Algebra for kids who ask 'when will I use this'",
        "description": "Real-world algebra that kids actually want to learn",
        "generate": True,
    },
    # 4. Learn - Coffee
    {
        "topic": (
            "Create a rich, visually stunning presentation about how coffee conquered the world. "
            "Cover: the Ethiopian origin legend, the Ottoman coffee houses as centers of revolution, "
            "the Boston Tea Party making America a coffee nation, the Italian espresso revolution, "
            "Starbucks and the third-wave coffee movement, the $500 billion global coffee economy, "
            "and the science of caffeine addiction. Mix fascinating history with surprising economics. "
            "Make it warm, inviting, and sophisticated — like a great cup of coffee."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "How coffee conquered the world",
        "description": "The fascinating journey of coffee from Ethiopian legend to global obsession",
        "generate": True,
    },
    # 5. Pitch - Demo Day
    {
        "topic": (
            "Create a razor-sharp demo day pitch that actually fits in 3 minutes. "
            "This is a template for the perfect YC-style demo day presentation. "
            "Cover: the one-liner hook, the problem in human terms, the live product demo moment, "
            "the key metric that proves traction, the 'why now' slide, the team's unfair advantage, "
            "and the crisp funding ask. Every slide should be one idea, one visual, zero fluff. "
            "Use bold typography, clean layouts, and a pace that builds urgency. "
            "Make it feel like the pitch that closes the round on stage."
        ),
        "slides": 8,
        "style": "corporate",
        "display_name": "Demo day pitch that actually fits in 3 minutes",
        "description": "A razor-sharp YC-style demo day pitch with zero fluff",
        "generate": True,
    },
    # 6. Education - Biology
    {
        "topic": (
            "Create a clear, beautifully designed educational presentation about Cellular Respiration: From Glucose to ATP. "
            "Cover: what is cellular respiration and why it matters, glycolysis step by step, "
            "the Krebs cycle with clear diagrams, the electron transport chain, "
            "ATP yield comparison, aerobic vs anaerobic respiration, "
            "and real-world connections (why you breathe harder during exercise). "
            "Use clean scientific diagrams, gradient color schemes, and make complex biology accessible. "
            "Think Khan Academy meets beautiful design."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "Cellular Respiration: From Glucose to ATP",
        "description": "Beautiful biology that makes cellular respiration click",
        "generate": True,
    },
    # 7. Learn - History
    {
        "topic": (
            "Create a dramatic, visually rich presentation about The French Revolution: From Monarchy to Republic. "
            "Cover: the extravagance of Versailles vs starving Paris, the storming of the Bastille, "
            "the Declaration of the Rights of Man, the Reign of Terror and Robespierre, "
            "Marie Antoinette's trial, Napoleon's rise from the chaos, "
            "and the revolution's lasting impact on democracy worldwide. "
            "Use dramatic imagery descriptions, timeline visuals, and a narrative arc. "
            "Make history feel like a thriller."
        ),
        "slides": 10,
        "style": "creative",
        "display_name": "The French Revolution: From Monarchy to Republic",
        "description": "The dramatic story of how France changed the world",
        "generate": True,
    },
    # 8. Sales - Client proposal
    {
        "topic": (
            "Create a sleek, persuasive client proposal presentation that practically closes itself. "
            "Cover: the client's specific pain points (mirror their language), the proposed solution with clear deliverables, "
            "a phased implementation timeline, ROI projections with hard numbers, "
            "social proof (case studies and testimonials), pricing tiers presented as investments not costs, "
            "and a next-steps slide with urgency. Use premium design, trust-building layouts, "
            "and persuasion psychology throughout. Make it feel like saying 'no' would be the risky choice."
        ),
        "slides": 8,
        "style": "corporate",
        "display_name": "Client proposal that closes itself",
        "description": "A sales proposal so persuasive it practically signs itself",
        "generate": True,
    },
    # 9. Learn - 2000s Internet
    {
        "topic": (
            "Create a fun, nostalgic interactive presentation about 2000s internet culture. "
            "Cover: the rise of MySpace and custom profile pages, early YouTube and viral videos (Charlie Bit My Finger, Numa Numa), "
            "AIM and MSN Messenger culture, Newgrounds and Flash games, the birth of memes (lolcats, rickrolling), "
            "early social media (Friendster, Hi5), the blog revolution (LiveJournal, Blogspot), "
            "and how 2000s internet DNA lives on in today's platforms. "
            "Use retro web aesthetics, nostalgic references, and a tone of fond remembrance."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "Interactive Presentation About 2000s Internet Culture",
        "description": "A nostalgic trip through the weird and wonderful 2000s internet",
        "generate": True,
    },
    # 10. Science - Zombie Apocalypse (NEW)
    {
        "topic": (
            "Create an exciting STEM education presentation: 'How to Survive a Zombie Apocalypse Using Science.' "
            "Cover: epidemiology (how the virus would spread using R0 values and SIR models), "
            "physics of fortification (structural engineering for safe houses), "
            "chemistry of improvised supplies (water purification, fire starting), "
            "biology of decomposition (zombies have an expiry date — calculate it), "
            "game theory for group survival decisions, statistics of your actual survival odds, "
            "and a final 'your survival plan' action slide. "
            "Make it fun and educational — teach real STEM through zombie scenarios."
        ),
        "slides": 10,
        "style": "creative",
        "display_name": "How to Survive a Zombie Apocalypse Using Science",
        "description": "Real STEM education disguised as zombie apocalypse survival training",
        "generate": True,
    },
    # 11. Culture - 90s Internet Wild West (EXISTING — skip generation)
    {
        "existing_uuid": EXISTING_90S_UUID,
        "display_name": "Why the 90s Internet Was the Wild West of Creativity",
        "description": "A nostalgic trip through the beautifully chaotic early internet",
        "generate": False,
    },
]


async def create_deck(client: httpx.AsyncClient, deck_info: dict) -> Optional[str]:
    """Create a deck via API. Returns deck_id or None."""
    payload = {
        "topic": deck_info["topic"],
        "slides": deck_info["slides"],
    }
    if deck_info.get("style"):
        payload["style"] = deck_info["style"]

    try:
        response = await client.post(
            f"{API_BASE}/v1/decks",
            headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
            json=payload,
            timeout=120.0
        )
        if response.status_code != 200:
            print(f"      API Error {response.status_code}: {response.text[:300]}")
            return None
        return response.json()["deck_id"]
    except Exception as e:
        print(f"      Create error: {type(e).__name__}: {e}")
        return None


async def poll_one(client: httpx.AsyncClient, deck_id: str, name: str, max_wait: int = 900) -> bool:
    """Poll a single deck until completed/failed/timeout. Returns True if completed."""
    start = time.time()
    last_print = 0
    while time.time() - start < max_wait:
        try:
            response = await client.get(
                f"{API_BASE}/v1/decks/{deck_id}/status",
                headers={"X-API-Key": API_KEY},
                timeout=60.0
            )
            response.raise_for_status()
            status = response.json()

            if status["status"] == "completed":
                slides = status.get('slides_count', '?')
                elapsed = int(time.time() - start)
                print(f"    DONE: {name} ({slides} slides, {elapsed}s)")
                return True
            elif status["status"] == "failed":
                print(f"    FAIL: {name} — {status.get('error_message', 'Unknown')}")
                return False
        except Exception:
            pass

        elapsed = int(time.time() - start)
        if elapsed - last_print >= 30:
            print(f"    ... {name} still generating ({elapsed}s)")
            last_print = elapsed

        await asyncio.sleep(12)

    print(f"    TIMEOUT: {name} (>{max_wait}s)")
    return False


async def main():
    total = len(DECKS)
    to_generate = [d for d in DECKS if d["generate"]]
    existing = [d for d in DECKS if not d["generate"]]

    print("=" * 65)
    print("  Featured Decks Seeder — 11 Landing Page Presentations")
    print("=" * 65)
    print(f"  API: {API_BASE}")
    print(f"  To generate: {len(to_generate)} | Existing: {len(existing)}")
    print()

    # ── Phase 0: Health check ──────────────────────────────────────
    print("[Phase 0] Checking server...")
    async with httpx.AsyncClient() as c:
        try:
            r = await c.get(f"{API_BASE}/api/health", timeout=120.0)
            print(f"  Server OK ({r.status_code})")
        except Exception as e:
            print(f"  {type(e).__name__} — waiting 30s...")
            await asyncio.sleep(30)
    print()

    # ── Phase 1: Submit all creation requests ──────────────────────
    print(f"[Phase 1] Submitting {len(to_generate)} deck creation requests...")
    print("-" * 65)

    # Map: display_order -> (deck_uuid, deck_info)
    all_decks: Dict[int, Tuple[str, dict]] = {}

    async with httpx.AsyncClient() as client:
        for i, deck_info in enumerate(DECKS):
            order = i + 1
            name = deck_info["display_name"]

            if not deck_info["generate"]:
                uuid = deck_info["existing_uuid"]
                print(f"  [{order:2d}/11] EXISTING: {name} ({uuid[:8]}...)")
                all_decks[order] = (uuid, deck_info)
                continue

            print(f"  [{order:2d}/11] Submitting: {name}...", end=" ", flush=True)
            deck_id = await create_deck(client, deck_info)
            if deck_id:
                print(f"OK ({deck_id[:8]}...)")
                all_decks[order] = (deck_id, deck_info)
            else:
                print("FAILED")
            await asyncio.sleep(1)

    submitted = len(all_decks)
    print(f"\n  Submitted/registered: {submitted}/11")
    if submitted < 11:
        print(f"  WARNING: Only {submitted} decks available. Missing decks will cause abort.")

    # ── Phase 2: Poll all decks in parallel ────────────────────────
    print()
    print("[Phase 2] Waiting for all decks to complete...")
    print("-" * 65)

    completed_orders = set()

    async with httpx.AsyncClient() as client:
        async def check_one(order: int, deck_id: str, info: dict) -> bool:
            ok = await poll_one(client, deck_id, info["display_name"])
            if ok:
                completed_orders.add(order)
            return ok

        tasks = [
            check_one(order, uuid, info)
            for order, (uuid, info) in sorted(all_decks.items())
        ]
        await asyncio.gather(*tasks)

    print(f"\n  Completed: {len(completed_orders)}/{submitted}")

    # ── Gate: ALL must succeed ─────────────────────────────────────
    if len(completed_orders) < 11:
        missing = []
        for order, (uuid, info) in sorted(all_decks.items()):
            if order not in completed_orders:
                missing.append(f"  #{order} {info['display_name']} ({uuid[:8]}...)")
        not_submitted = [i+1 for i in range(11) if (i+1) not in all_decks]

        print()
        print("ABORT: Not all 11 decks completed.")
        if missing:
            print("  Failed/timed out:")
            for m in missing:
                print(f"    {m}")
        if not_submitted:
            print(f"  Never submitted: positions {not_submitted}")
        print()
        print("Re-run the script to retry. Existing completed decks remain in the DB.")
        return

    # ── Phase 3: Update featured_decks ─────────────────────────────
    print()
    print("[Phase 3] All 11 complete! Updating featured_decks table...")
    print("-" * 65)

    supabase = get_supabase_client()

    # Deactivate existing
    try:
        supabase.table('featured_decks').update({
            "is_active": False
        }).eq('is_active', True).execute()
        print("  Deactivated old featured decks")
    except Exception as e:
        print(f"  Warning deactivating: {e}")

    # Insert all 11
    success = 0
    for order in sorted(all_decks.keys()):
        uuid, info = all_decks[order]
        name = info["display_name"]
        desc = info["description"]

        try:
            deck_result = supabase.table('decks').select(
                'slides, name'
            ).eq('uuid', uuid).single().execute()

            if not deck_result.data:
                print(f"  [{order:2d}] MISSING from decks table: {name}")
                continue

            slides = deck_result.data.get('slides', [])
            supabase.table('featured_decks').upsert({
                "uuid": uuid,
                "name": name,
                "description": desc,
                "slides": slides,
                "slide_count": len(slides),
                "display_order": order,
                "is_active": True,
            }, on_conflict='uuid').execute()

            print(f"  [{order:2d}] Featured: {name} ({len(slides)} slides)")
            success += 1
        except Exception as e:
            print(f"  [{order:2d}] Error: {e}")

    # ── Summary ────────────────────────────────────────────────────
    print()
    print("=" * 65)
    print("DONE!")
    print(f"  Featured: {success}/11")
    print()
    print("Display order:")
    for order in sorted(all_decks.keys()):
        uuid, info = all_decks[order]
        print(f"  {order:2d}. {info['display_name']}")
        print(f"      UUID: {uuid}")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
