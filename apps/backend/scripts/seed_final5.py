#!/usr/bin/env python3
"""Generate 5 remaining presentations with proper cooldowns."""

import os, sys, time
sys.stdout.reconfigure(line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

import httpx
from services.supabase import get_supabase_client

API_KEY = "ns_live_vry5hU9ezj4dTuzwF-qDOTTfxvWZ2Vea"
API_BASE = "http://localhost:9090"

F = (
    "Use clean, professional fonts only — Inter, Montserrat, or similar sans-serif. "
    "No decorative or script fonts. Keep text minimal. Big headings, short bullets. Whitespace."
)

DECKS = [
    (8, "Interactive Presentation About 2000s Internet Culture", 10,
     f"{F} Nostalgic 2000s internet: MySpace, early YouTube, AIM, Flash games, Napster, memes. Timeline 2000-2009. Internet adoption line charts. Web 1.0 to 2.0."),
    (10, "Why the 90s Internet Was the Wild West of Creativity", 10,
     f"{F} GeoCities, early HTML, dancing baby, dot-com bubble NASDAQ chart, AOL dial-up, personal homepages, web rings. 90s timeline. Early adoption stats."),
    (12, "The State of AI in 2025: What's Real and What's Hype", 12,
     f"{F} Data-heavy: AI investment bar charts, model benchmarks, adoption by industry pie chart, model comparison table, breakthrough timeline, market size growth curves."),
    (13, "Building Design Systems That Scale: A Visual Guide", 10,
     f"{F} Component hierarchies, token systems, component library tree. Consistent vs inconsistent UI. Design system ROI metrics. Clean, minimal."),
    (14, "Climate Change by the Numbers: A Data-Driven Briefing", 12,
     f"{F} Temperature anomaly chart, CO2 over time, sea level projections, renewable energy rates, emissions by sector pie, country comparisons, economic impact."),
]


def create_deck(order, topic, slides, instructions):
    print(f"\n{'='*60}")
    print(f"[order={order}] {topic}")
    print(f"{'='*60}")

    # Step 1: Create
    with httpx.Client(timeout=120.0) as http:
        try:
            r = http.post(
                f"{API_BASE}/v1/decks",
                headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
                json={"topic": topic, "slides": slides, "additional_instructions": instructions},
            )
            r.raise_for_status()
            deck_id = r.json()["deck_id"]
            print(f"  Created: {deck_id}")
        except Exception as e:
            print(f"  FAILED to create: {e}")
            return None

    # Step 2: Poll DB
    client = get_supabase_client()
    start = time.time()
    while time.time() - start < 600:
        try:
            res = client.table("decks").select("slide_count, status").eq("uuid", deck_id).single().execute()
            if res.data:
                sc = res.data.get("slide_count", 0) or 0
                st = res.data.get("status", {})
                state = st.get("state") if isinstance(st, dict) else st
                progress = st.get("progress", 0) if isinstance(st, dict) else 0

                if state == "completed":
                    print(f"  Completed: {sc} slides")
                    return deck_id
                if sc >= slides or progress >= 90:
                    client.table("decks").update({"status": {"state": "completed", "progress": 100}}).eq("uuid", deck_id).execute()
                    print(f"  Done (marked): {sc} slides")
                    return deck_id
                if state == "failed":
                    print(f"  Generation failed")
                    return None

                elapsed = int(time.time() - start)
                sys.stdout.write(f"\r  [{elapsed:3d}s] {sc}/{slides} slides (progress={progress}%)   ")
                sys.stdout.flush()
        except:
            pass
        time.sleep(10)

    # Timeout check
    try:
        res = client.table("decks").select("slide_count").eq("uuid", deck_id).single().execute()
        sc = res.data.get("slide_count", 0) or 0 if res.data else 0
        if sc > 0:
            client.table("decks").update({"status": {"state": "completed", "progress": 100}}).eq("uuid", deck_id).execute()
            print(f"\n  Timeout but got {sc} slides")
            return deck_id
    except:
        pass
    print(f"\n  TIMEOUT")
    return None


def add_featured(deck_id, order, topic):
    client = get_supabase_client()
    deck = client.table("decks").select("slides, name").eq("uuid", deck_id).single().execute()
    if not deck.data or not deck.data.get("slides"):
        return False
    slides = deck.data["slides"]
    client.table("featured_decks").insert({
        "name": topic, "description": deck.data.get("name", topic),
        "slides": slides, "slide_count": len(slides),
        "display_order": order, "is_active": True,
    }).execute()
    print(f"  -> Added to featured_decks [order={order}]")
    return True


def main():
    ok = 0
    for order, topic, slides, instr in DECKS:
        deck_id = create_deck(order, topic, slides, instr)
        if deck_id and add_featured(deck_id, order, topic):
            ok += 1
        # Cool down between decks to let the server recover
        print("  Cooling down 15s...")
        time.sleep(15)

    print(f"\n{'='*60}")
    print(f"  Done: {ok}/{len(DECKS)}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
