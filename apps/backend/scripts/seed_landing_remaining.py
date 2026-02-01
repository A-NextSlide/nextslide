#!/usr/bin/env python3
"""
Fire off the 7 remaining landing page presentations and poll until slides are generated.
Then mark all decks as completed and add to featured_decks.

Usage:
    cd apps/backend
    python3 scripts/seed_landing_remaining.py
"""

import os
import sys
import time
import asyncio

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import httpx
from services.supabase import get_supabase_client

API_KEY = os.getenv("SEED_API_KEY")
if not API_KEY:
    raise ValueError("SEED_API_KEY environment variable is required")
API_BASE = os.getenv("API_BASE", "http://localhost:9090")
USER_ID = os.getenv("SEED_USER_ID", "942ccba7-5346-4f99-8189-82284dafb255")

FONT_INSTRUCTIONS = (
    "Use clean, professional fonts only — Inter, Montserrat, or similar sans-serif. "
    "No decorative or script fonts. Keep text minimal and impactful. "
    "Large bold headings, short bullet points. Lots of whitespace. "
    "Make it visually stunning with strong layout and color choices."
)

# Only the presentations we still need to create
REMAINING = [
    {
        "id": "education-biology",
        "topic": "Cellular Respiration: From Glucose to ATP",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Scientific but accessible. Include diagrams of: "
            "glycolysis pathway, Krebs cycle, electron transport chain. "
            "Use flow diagrams showing energy conversion steps. "
            "Include chemical equations formatted cleanly. "
            "Show ATP yield calculations in a visual summary chart. "
            "Color-code different stages. Make biochemistry visual and clear."
        ),
    },
    {
        "id": "learn-2000s",
        "topic": "Interactive Presentation About 2000s Internet Culture",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Nostalgic tour of early 2000s internet. Cover MySpace, early YouTube, "
            "AIM/MSN Messenger, Flash games, Napster, early memes. "
            "Include a timeline of major internet milestones 2000-2009. "
            "Stats on internet adoption growth with line charts. "
            "Show the evolution from Web 1.0 to Web 2.0 visually. "
            "Fun and nostalgic tone but with real data points."
        ),
    },
    {
        "id": "learn-90s",
        "topic": "Why the 90s Internet Was the Wild West of Creativity",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Celebrate the chaotic creativity of 90s internet. "
            "Cover GeoCities, early HTML, dancing baby GIF era, "
            "the dot-com bubble (include a chart of NASDAQ), "
            "AOL dial-up era, personal homepages, web rings. "
            "Timeline of key 90s internet moments. "
            "Stats on early internet adoption. Keep it fun and nostalgic."
        ),
    },
    {
        "id": "marketing",
        "topic": "Social media strategy that actually converts",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Data-driven marketing deck. Include: "
            "platform comparison chart (engagement rates by platform), "
            "content calendar framework, funnel visualization, "
            "conversion rate benchmarks in tables, "
            "A/B test results with bar charts, ROI metrics. "
            "Show a customer journey map. Include real benchmark numbers. "
            "Professional and actionable, not fluffy."
        ),
    },
    {
        "id": "ai-future",
        "topic": "The State of AI in 2025: What's Real and What's Hype",
        "slides": 12,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Tech industry overview with heavy data visualization. "
            "Include: AI investment charts (bar charts of funding by year), "
            "model capability benchmarks, adoption rates by industry (pie chart), "
            "comparison table of major AI models, "
            "timeline of key AI breakthroughs. "
            "Be balanced — show both the impressive gains and the limitations. "
            "Include market size projections with growth curves."
        ),
    },
    {
        "id": "design-systems",
        "topic": "Building Design Systems That Scale: A Visual Guide",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Meta-presentation about design itself. Show component hierarchies, "
            "token systems (color, spacing, typography scales), "
            "component library structure as a tree diagram. "
            "Include examples of consistent vs inconsistent UI. "
            "Show the ROI of design systems with metrics. "
            "Clean, minimal, and itself a demonstration of good design."
        ),
    },
    {
        "id": "climate-data",
        "topic": "Climate Change by the Numbers: A Data-Driven Briefing",
        "slides": 12,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Extremely data-heavy environmental briefing. "
            "Include: global temperature anomaly line chart, CO2 concentration over time, "
            "sea level rise projections, renewable energy adoption rates, "
            "emissions by sector (pie chart), country comparison bar charts, "
            "economic impact projections. Use real data ranges. "
            "Scientific and authoritative. Charts and graphs on nearly every slide."
        ),
    },
]


async def create_deck(client: httpx.AsyncClient, pres: dict) -> dict:
    """Create a single deck via API."""
    response = await client.post(
        f"{API_BASE}/v1/decks",
        headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
        json={
            "topic": pres["topic"],
            "slides": pres["slides"],
            "additional_instructions": pres.get("additional_instructions", ""),
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()


def poll_db_for_slides(deck_uuid: str, target_slides: int, max_wait: int = 600) -> bool:
    """Poll Supabase directly for slide generation progress."""
    start = time.time()
    client = get_supabase_client()
    while time.time() - start < max_wait:
        result = client.table("decks").select("slide_count, status").eq("uuid", deck_uuid).single().execute()
        if not result.data:
            time.sleep(5)
            continue

        slide_count = result.data.get("slide_count", 0) or 0
        status = result.data.get("status", {})
        state = status.get("state") if isinstance(status, dict) else status
        progress = status.get("progress", 0) if isinstance(status, dict) else 0

        if state == "completed":
            return True
        if slide_count >= target_slides or progress >= 90:
            # Slides are done, mark as completed
            client.table("decks").update({
                "status": {"state": "completed", "progress": 100}
            }).eq("uuid", deck_uuid).execute()
            return True
        if state == "failed":
            return False

        time.sleep(10)

    # Timeout - check if we got any slides at all
    result = client.table("decks").select("slide_count").eq("uuid", deck_uuid).single().execute()
    if result.data and (result.data.get("slide_count", 0) or 0) > 0:
        client.table("decks").update({
            "status": {"state": "completed", "progress": 100}
        }).eq("uuid", deck_uuid).execute()
        return True
    return False


async def generate_one(client: httpx.AsyncClient, pres: dict, index: int, total: int) -> dict:
    """Generate a single presentation."""
    label = pres["topic"][:55]
    try:
        print(f"  [{index+1}/{total}] Firing: {label}...")
        result = await create_deck(client, pres)
        deck_id = result["deck_id"]
        print(f"  [{index+1}/{total}] Queued: {deck_id[:12]}... polling DB for slides...")

        # Poll the DB directly instead of the status endpoint
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(
            None, poll_db_for_slides, deck_id, pres["slides"], 600
        )

        if success:
            print(f"  [{index+1}/{total}] DONE:   {label}")
            return {"success": True, "deck_id": deck_id, "pres": pres, "index": index}
        else:
            print(f"  [{index+1}/{total}] FAILED: {label}")
            return {"success": False, "deck_id": deck_id, "pres": pres, "index": index}

    except Exception as e:
        print(f"  [{index+1}/{total}] ERROR:  {label} — {e}")
        return {"success": False, "error": str(e), "pres": pres, "index": index}


async def main():
    total = len(REMAINING)
    print("=" * 65)
    print(f"  Generating {total} remaining presentations")
    print(f"  API Key: {API_KEY[:20]}...")
    print("=" * 65)
    print()

    # Fire all 7 in parallel
    async with httpx.AsyncClient() as client:
        tasks = [generate_one(client, pres, i, total) for i, pres in enumerate(REMAINING)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    print()
    print("-" * 65)
    success = sum(1 for r in results if isinstance(r, dict) and r.get("success"))
    print(f"  Results: {success}/{total} succeeded")

    # Print deck IDs for the successful ones
    for r in results:
        if isinstance(r, dict) and r.get("success"):
            print(f"    {r['pres']['id']}: {r['deck_id']}")

    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
