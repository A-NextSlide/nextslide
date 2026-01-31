#!/usr/bin/env python3
"""
Seed 12 featured decks for the landing page.

Submits all creation requests, polls all in parallel,
and only updates featured_decks if ALL 12 complete successfully.

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

API_KEY = os.getenv("SEED_API_KEY", "ns_live_Lwd5HS7g4O7jJCZT2yr1OrU6wQdlCElt")
API_BASE = os.getenv("API_BASE", "https://nextslide-backend.onrender.com")

# ── DESIGN PHILOSOPHY ─────────────────────────────────────────────
# Every prompt below bakes in:
#   - "Keep text minimal" — max 3-4 bullet points or one short paragraph per slide
#   - "Favour large imagery" — hero images, full-bleed backgrounds, icon grids
#   - "Use readable fonts" — clean sans-serifs for serious, bolder/rounded for fun
#   - Fun decks get playful, slightly silly energy
#   - All decks get 6–8 slides (fewer = punchier for a showcase)
# ──────────────────────────────────────────────────────────────────

# ── All 12 presentations in display order ──────────────────────────
DECKS = [
    # 1. Startup pitch
    {
        "topic": (
            "Startup pitch deck for VCs. "
            "DESIGN: Bold, clean, confident. Big hero numbers on each slide. "
            "Keep body text to ONE punchy sentence per slide — let the visuals do the talking. "
            "Use large data visualisations, full-bleed background imagery, and dramatic whitespace. "
            "Slides: hook (one-liner problem), solution (show-don't-tell), market size (one big number), "
            "traction (single hockey-stick chart), business model (simple diagram), team (headshots + titles), "
            "the ask (bold number, center-screen)."
        ),
        "slides": 8,
        "style": "corporate",
        "display_name": "Pitch deck for VCs who've already seen 500 this month",
        "description": "A startup pitch deck designed to stand out from the crowd",
        "generate": True,
    },
    # 2. Banking / Investment analysis
    {
        "topic": (
            "Short-term stock trading strategies — professional Wall Street briefing style. "
            "DESIGN: Dark background, clean data visuals, minimal text. "
            "Each slide should be ONE chart or ONE key insight with a short headline. "
            "Use candlestick charts, heat maps, and clean financial graphics. "
            "Slides: market overview (single volatility chart), technical signals (RSI + MACD visual), "
            "sector rotation (flow diagram), momentum strategies (visual comparison), "
            "risk management (position sizing visual), outlook (one bold takeaway)."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Short-term stock analysis that reads like a Goldman memo",
        "description": "Professional banking analysis of short-term stock trading strategies",
        "generate": True,
    },
    # 3. Education - Algebra (FUN)
    {
        "topic": (
            "Algebra for kids who ask 'when will I ever use this?' "
            "DESIGN: Bright, bold, and playful — like a fun magazine spread, not a textbook. "
            "Use HUGE icons, colourful backgrounds, and minimal text (max 2 short sentences per slide). "
            "Each slide = one real-world example: video game physics, Spotify algorithm, "
            "recipe scaling, sports stats, budgeting for a PS5. "
            "Make the equations BIG and visual, embedded in fun illustrations. "
            "The vibe is energetic, slightly silly, and makes math feel cool."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Algebra for kids who ask 'when will I use this'",
        "description": "Real-world algebra that kids actually want to learn",
        "generate": True,
    },
    # 4. Learn - Coffee
    {
        "topic": (
            "How coffee conquered the world — from Ethiopia to your morning latte. "
            "DESIGN: Warm earthy tones, rich full-bleed coffee photography, elegant and inviting. "
            "Keep each slide to a short headline + one gorgeous visual. Almost no bullet points. "
            "Tell the story visually: Ethiopian origin, Ottoman coffeehouses, "
            "espresso revolution in Italy, Starbucks era, the $500B global economy, "
            "and the science of caffeine. Make it feel like a beautifully designed coffee-table book."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "How coffee conquered the world",
        "description": "The fascinating journey of coffee from Ethiopian legend to global obsession",
        "generate": True,
    },
    # 5. Pitch - Demo Day
    {
        "topic": (
            "YC demo day pitch — 3 minutes, zero fluff. "
            "DESIGN: One idea per slide. Giant typography for the key message. "
            "Minimal body text — each slide should be readable from the back of the room. "
            "Clean white/dark backgrounds, maximum contrast. "
            "Slides: one-liner hook, problem, product screenshot, key metric (huge number), "
            "why now, team photo, the ask. Every slide = 5 seconds to absorb."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Demo day pitch that actually fits in 3 minutes",
        "description": "A razor-sharp YC-style demo day pitch with zero fluff",
        "generate": True,
    },
    # 6. Education - Biology
    {
        "topic": (
            "Cellular Respiration: From Glucose to ATP — beautiful science education. "
            "DESIGN: Clean, modern scientific aesthetic. Gradient colour schemes. "
            "Each slide = one diagram or one concept with a SHORT explanation (2 sentences max). "
            "Let the diagrams be the star. Big, clear, labelled process diagrams. "
            "Slides: what is cellular respiration (one visual), glycolysis, "
            "Krebs cycle, electron transport chain, total ATP yield (big number), "
            "real-world connection (why you pant when running)."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Cellular Respiration: From Glucose to ATP",
        "description": "Beautiful biology that makes cellular respiration click",
        "generate": True,
    },
    # 7. Learn - History
    {
        "topic": (
            "The French Revolution: From Monarchy to Republic — history as a thriller. "
            "DESIGN: Dramatic and cinematic. Rich, dark backgrounds with bold accent colours. "
            "Each slide = one dramatic moment with a powerful headline + striking image. "
            "Minimal body text — two sentences maximum, like movie captions. "
            "Slides: Versailles excess vs starving Paris, storming the Bastille, "
            "Declaration of Rights, the Reign of Terror, Marie Antoinette, "
            "Napoleon rises, lasting impact on democracy."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "The French Revolution: From Monarchy to Republic",
        "description": "The dramatic story of how France changed the world",
        "generate": True,
    },
    # 8. Sales - Client proposal
    {
        "topic": (
            "Client proposal that practically closes itself. "
            "DESIGN: Premium, trust-building, polished. Clean layouts with lots of breathing room. "
            "Each slide = one clear message. Use icons, diagrams, and social proof screenshots. "
            "Keep body text to 3 short bullets MAX per slide. "
            "Slides: client pain points (mirror their language), proposed solution (clear visual), "
            "implementation timeline (simple Gantt), ROI projection (one big chart), "
            "case studies (logos + one-line quotes), pricing as investment, next steps."
        ),
        "slides": 8,
        "style": "corporate",
        "display_name": "Client proposal that closes itself",
        "description": "A sales proposal so persuasive it practically signs itself",
        "generate": True,
    },
    # 9. Learn - 2000s Internet (FUN)
    {
        "topic": (
            "2000s internet culture — a nostalgic trip through the golden age of the weird web. "
            "DESIGN: Retro, playful, slightly chaotic on purpose. Bold rounded fonts, bright neon-on-dark. "
            "Keep text to short fun captions — let the nostalgia imagery carry each slide. "
            "Slides: MySpace profile pages, early YouTube viral hits, AIM/MSN away messages, "
            "Newgrounds & Flash games, birth of memes (lolcats, rickroll), "
            "the blog era, how 2000s DNA lives in today's internet. "
            "Make it feel like browsing the internet on a chunky laptop in 2006."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Interactive Presentation About 2000s Internet Culture",
        "description": "A nostalgic trip through the weird and wonderful 2000s internet",
        "generate": True,
    },
    # 10. Science - Zombie Apocalypse (FUN)
    {
        "topic": (
            "How to Survive a Zombie Apocalypse Using Science — real STEM, ridiculous premise. "
            "DESIGN: Bold, punchy, and funny. Comic-book energy with big dramatic fonts. "
            "Each slide = one survival tip backed by real science + a fun zombie illustration. "
            "Keep text to a catchy headline + 2 short lines. The vibe is entertaining education. "
            "Slides: virus spread (R0 chart), fortification physics, "
            "chemistry of water purification, biology of decomposition (zombies expire!), "
            "game theory (who to trust), your actual survival odds (statistics), "
            "your personal survival action plan."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "How to Survive a Zombie Apocalypse Using Science",
        "description": "Real STEM education disguised as zombie apocalypse survival training",
        "generate": True,
    },
    # 11. Culture - 90s Internet Wild West (FUN)
    {
        "topic": (
            "Why the 90s Internet Was the Wild West of Creativity — a love letter to GeoCities. "
            "DESIGN: Deliberately retro. Bright garish colours, pixel-art vibes, fun chunky fonts. "
            "Each slide = one beautiful mess of 90s web culture with a playful caption. "
            "Keep text super short — let the imagery and nostalgia do the work. "
            "Slides: the homepage era (blinking text, visitor counters), dial-up sounds, "
            "GeoCities/Angelfire masterpieces, early chat rooms (A/S/L?), "
            "Napster and the music revolution, the dot-com boom, and the wild west spirit that built today's web."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Why the 90s Internet Was the Wild West of Creativity",
        "description": "A nostalgic trip through the beautifully chaotic early internet",
        "generate": True,
    },
    # 12. Marketing - Social Media Strategy
    {
        "topic": (
            "Social media strategy that actually converts — not just likes. "
            "DESIGN: Modern, bold, scroll-stopping. Bright gradients, clean icons, punchy typography. "
            "Each slide = one key tactic with a striking visual and a single headline. "
            "Keep text to one short sentence per slide — think Instagram carousel energy. "
            "Slides: the hook (why most strategies fail), content pillars (visual diagram), "
            "platform-specific playbook (icons + one-liners), posting cadence (simple calendar visual), "
            "engagement tactics (community > followers), analytics that matter (one dashboard mockup), "
            "your 30-day launch plan (timeline graphic)."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Social media strategy that actually converts",
        "description": "A no-fluff social media playbook built for real results",
        "generate": True,
    },
]


async def create_deck(client: httpx.AsyncClient, deck_info: dict, retry: int = 2) -> Optional[str]:
    """Create a deck via API. Returns deck_id or None. Retries on 429."""
    payload = {
        "topic": deck_info["topic"],
        "slides": deck_info["slides"],
    }
    if deck_info.get("style"):
        payload["style"] = deck_info["style"]

    for attempt in range(1, retry + 2):
        try:
            response = await client.post(
                f"{API_BASE}/v1/decks",
                headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
                json=payload,
                timeout=120.0
            )
            if response.status_code == 200:
                return response.json()["deck_id"]
            if response.status_code == 429:
                wait = int(response.headers.get("Retry-After", "30"))
                print(f"429 (waiting {wait}s)...", end=" ", flush=True)
                await asyncio.sleep(wait)
                continue
            if response.status_code == 409:
                # Dedup — deck already exists from a previous run
                body = response.json()
                existing = body.get("existing_deck_id")
                if existing:
                    print(f"409 (reusing {existing[:8]}...)", end=" ", flush=True)
                    return existing
            print(f"API Error {response.status_code}: {response.text[:200]}")
            return None
        except Exception as e:
            print(f"Create error: {type(e).__name__}: {e}")
            if attempt <= retry:
                await asyncio.sleep(5)
    return None


async def poll_one(client: httpx.AsyncClient, deck_id: str, name: str, max_wait: int = 1800) -> bool:
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
    to_generate = [d for d in DECKS if d.get("generate", True)]

    print("=" * 65)
    print(f"  Featured Decks Seeder — {total} Landing Page Presentations")
    print("  (visual, minimal-text, nice fonts, fun energy)")
    print("=" * 65)
    print(f"  API: {API_BASE}")
    print(f"  To generate: {len(to_generate)}")
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

    # ── Phase 1: Submit all creation requests ────────────────────
    # (API allows up to 20 concurrent per key)
    print(f"[Phase 1] Submitting {len(to_generate)} deck creation requests...")
    print("-" * 65)

    # Map: display_order -> (deck_uuid, deck_info)
    all_decks: Dict[int, Tuple[str, dict]] = {}

    async with httpx.AsyncClient() as client:
        for i, deck_info in enumerate(DECKS):
            order = i + 1
            name = deck_info["display_name"]

            if not deck_info.get("generate", True):
                uuid = deck_info.get("existing_uuid", "")
                if uuid:
                    print(f"  [{order:2d}/{total}] EXISTING: {name} ({uuid[:8]}...)")
                    all_decks[order] = (uuid, deck_info)
                continue

            print(f"  [{order:2d}/{total}] Submitting: {name}...", end=" ", flush=True)
            deck_id = await create_deck(client, deck_info)
            if deck_id:
                print(f"OK ({deck_id[:8]}...)")
                all_decks[order] = (deck_id, deck_info)
            else:
                print("FAILED")

            await asyncio.sleep(1)

    submitted = len(all_decks)
    print(f"\n  Submitted/registered: {submitted}/{total}")
    if submitted < total:
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
    if len(completed_orders) < submitted:
        missing = []
        for order, (uuid, info) in sorted(all_decks.items()):
            if order not in completed_orders:
                missing.append(f"  #{order} {info['display_name']} ({uuid[:8]}...)")
        not_submitted = [i+1 for i in range(total) if (i+1) not in all_decks]

        print()
        print(f"ABORT: Not all {total} decks completed.")
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
    print(f"[Phase 3] All {total} complete! Updating featured_decks table...")
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
    print(f"  Featured: {success}/{total}")
    print()
    print("Display order:")
    for order in sorted(all_decks.keys()):
        uuid, info = all_decks[order]
        print(f"  {order:2d}. {info['display_name']}")
        print(f"      UUID: {uuid}")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
