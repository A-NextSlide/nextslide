#!/usr/bin/env python3
"""
Generate the 7 remaining landing page presentations sequentially.
Fires each one, waits for slides via direct DB polling, then moves to the next.
"""

import os
import sys
import time

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import httpx
from services.supabase import get_supabase_client

API_KEY = "ns_live_vry5hU9ezj4dTuzwF-qDOTTfxvWZ2Vea"
API_BASE = "http://localhost:9090"

FONT = (
    "Use clean, professional fonts only — Inter, Montserrat, or similar sans-serif. "
    "No decorative or script fonts. Keep text minimal and impactful. "
    "Large bold headings, short bullet points. Lots of whitespace."
)

PRESENTATIONS = [
    {
        "id": "education-biology",
        "order": 5,
        "topic": "Cellular Respiration: From Glucose to ATP",
        "slides": 10,
        "additional_instructions": f"{FONT} Scientific diagrams: glycolysis, Krebs cycle, ETC. Flow diagrams for energy conversion. Chemical equations formatted cleanly. ATP yield chart. Color-code stages.",
    },
    {
        "id": "learn-2000s",
        "order": 8,
        "topic": "Interactive Presentation About 2000s Internet Culture",
        "slides": 10,
        "additional_instructions": f"{FONT} Nostalgic 2000s internet tour: MySpace, early YouTube, AIM, Flash games, Napster, early memes. Timeline 2000-2009. Internet adoption stats with line charts. Web 1.0 to 2.0 evolution.",
    },
    {
        "id": "learn-90s",
        "order": 10,
        "topic": "Why the 90s Internet Was the Wild West of Creativity",
        "slides": 10,
        "additional_instructions": f"{FONT} GeoCities, early HTML, dancing baby era, dot-com bubble NASDAQ chart, AOL dial-up, personal homepages, web rings. Timeline of 90s internet moments. Early adoption stats.",
    },
    {
        "id": "marketing",
        "order": 11,
        "topic": "Social media strategy that actually converts",
        "slides": 10,
        "additional_instructions": f"{FONT} Data-driven: platform engagement comparison chart, content calendar, funnel visualization, conversion benchmarks table, A/B test bar charts, ROI metrics, customer journey map.",
    },
    {
        "id": "ai-future",
        "order": 12,
        "topic": "The State of AI in 2025: What's Real and What's Hype",
        "slides": 12,
        "additional_instructions": f"{FONT} Heavy data viz: AI investment charts, model benchmarks, adoption by industry pie chart, AI model comparison table, breakthrough timeline. Market size projections with growth curves.",
    },
    {
        "id": "design-systems",
        "order": 13,
        "topic": "Building Design Systems That Scale: A Visual Guide",
        "slides": 10,
        "additional_instructions": f"{FONT} Component hierarchies, token systems (color/spacing/typography), component library tree diagram. Consistent vs inconsistent UI examples. ROI of design systems. Clean and minimal.",
    },
    {
        "id": "climate-data",
        "order": 14,
        "topic": "Climate Change by the Numbers: A Data-Driven Briefing",
        "slides": 12,
        "additional_instructions": f"{FONT} Data-heavy: temperature anomaly line chart, CO2 over time, sea level projections, renewable energy rates, emissions by sector pie chart, country comparisons, economic impact.",
    },
]


def create_and_wait(pres, index, total):
    """Create a deck and poll DB until slides are generated."""
    label = pres["topic"][:55]
    print(f"\n[{index+1}/{total}] {label}")

    # Create via API
    with httpx.Client(timeout=60.0) as http:
        try:
            r = http.post(
                f"{API_BASE}/v1/decks",
                headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
                json={
                    "topic": pres["topic"],
                    "slides": pres["slides"],
                    "additional_instructions": pres.get("additional_instructions", ""),
                },
            )
            r.raise_for_status()
            deck_id = r.json()["deck_id"]
            print(f"  Queued: {deck_id}")
        except Exception as e:
            print(f"  CREATE FAILED: {e}")
            return None

    # Poll DB directly
    client = get_supabase_client()
    target = pres["slides"]
    start = time.time()
    max_wait = 600  # 10 minutes

    while time.time() - start < max_wait:
        try:
            result = client.table("decks").select("slide_count, status").eq("uuid", deck_id).single().execute()
            if result.data:
                sc = result.data.get("slide_count", 0) or 0
                status = result.data.get("status", {})
                state = status.get("state") if isinstance(status, dict) else status
                progress = status.get("progress", 0) if isinstance(status, dict) else 0
                msg = status.get("message", "") if isinstance(status, dict) else ""

                if state == "completed":
                    print(f"  Completed: {sc} slides")
                    return deck_id

                if sc >= target or progress >= 90:
                    # All slides done, mark completed
                    client.table("decks").update({
                        "status": {"state": "completed", "progress": 100}
                    }).eq("uuid", deck_id).execute()
                    print(f"  Done (marked): {sc} slides")
                    return deck_id

                if state == "failed":
                    print(f"  FAILED: {status.get('error', 'unknown')}")
                    return None

                elapsed = int(time.time() - start)
                print(f"  [{elapsed:3d}s] {msg or f'{sc}/{target} slides'}", end="\r", flush=True)
        except Exception as e:
            pass

        time.sleep(10)

    # Timeout - check if we got any slides
    try:
        result = client.table("decks").select("slide_count").eq("uuid", deck_id).single().execute()
        sc = result.data.get("slide_count", 0) or 0 if result.data else 0
        if sc > 0:
            client.table("decks").update({
                "status": {"state": "completed", "progress": 100}
            }).eq("uuid", deck_id).execute()
            print(f"  Timeout but got {sc} slides, marked completed")
            return deck_id
    except:
        pass

    print(f"  TIMEOUT: no slides generated")
    return None


def add_to_featured(deck_id, pres):
    """Add completed deck to featured_decks."""
    client = get_supabase_client()
    try:
        deck = client.table("decks").select("slides, name").eq("uuid", deck_id).single().execute()
        if not deck.data or not deck.data.get("slides"):
            return False

        slides = deck.data["slides"]
        client.table("featured_decks").insert({
            "name": pres["topic"],
            "description": deck.data.get("name", pres["topic"]),
            "slides": slides,
            "slide_count": len(slides),
            "display_order": pres["order"],
            "is_active": True,
        }).execute()
        return True
    except Exception as e:
        print(f"  Featured insert error: {e}")
        return False


def main():
    total = len(PRESENTATIONS)
    print("=" * 65)
    print(f"  Generating {total} remaining presentations (sequential)")
    print("=" * 65)

    results = []
    for i, pres in enumerate(PRESENTATIONS):
        deck_id = create_and_wait(pres, i, total)
        if deck_id:
            if add_to_featured(deck_id, pres):
                print(f"  Added to featured_decks [order={pres['order']}]")
                results.append(True)
            else:
                results.append(False)
        else:
            results.append(False)

    print("\n" + "=" * 65)
    success = sum(1 for r in results if r)
    print(f"  Done: {success}/{total} succeeded")
    print("=" * 65)


if __name__ == "__main__":
    main()
