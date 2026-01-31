#!/usr/bin/env python3
"""
Seed landing page featured decks by recreating the 12 showcase presentations.

Creates an API key, fires off all presentations in parallel,
polls for completion, and adds them to featured_decks.

Usage:
    cd apps/backend
    python scripts/seed_landing_page.py
"""

import os
import sys
import time
import asyncio
import random
from datetime import datetime, timedelta

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import httpx
from services.supabase import get_supabase_client
from services.api_key_service import get_api_key_service

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"
API_BASE = "http://localhost:9090"

# ─────────────────────────────────────────────────────────────────────
# The 15 landing page presentations with carefully crafted prompts
# ─────────────────────────────────────────────────────────────────────

FONT_INSTRUCTIONS = (
    "Use clean, professional fonts only — Inter, Montserrat, or similar sans-serif. "
    "No decorative or script fonts. Keep text minimal and impactful. "
    "Large bold headings, short bullet points. Lots of whitespace. "
    "Make it visually stunning with strong layout and color choices."
)

PRESENTATIONS = [
    {
        "id": "startup",
        "topic": "Pitch deck for VCs who've already seen 500 this month",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "This is a startup pitch deck. Make it punchy and confident. "
            "Include slides for: problem, solution, market size (use large numbers with charts), "
            "business model, traction metrics (show growth charts), team, competitive advantage, "
            "and the ask. Use bold data visualizations for TAM/SAM/SOM. "
            "Keep each slide to ONE key point. No walls of text."
        ),
    },
    {
        "id": "investment",
        "topic": "Short-term stock analysis that reads like a Goldman memo",
        "slides": 12,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "This is a financial analysis deck. Be EXTREMELY data-driven. "
            "Include multiple charts: candlestick-style price charts, bar charts for revenue, "
            "line graphs for trends, pie charts for portfolio allocation. "
            "Use financial metrics: P/E ratios, EPS, revenue growth %, margin analysis. "
            "Include a risk assessment matrix. Make it look like a real Wall Street memo. "
            "Dense with data but cleanly formatted. Tables with financial data are encouraged."
        ),
    },
    {
        "id": "education-algebra",
        "topic": "Algebra for kids who ask 'when will I use this'",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Make this fun and relatable for students. Use real-world examples: "
            "calculating game stats, splitting bills, music streaming algorithms. "
            "Include visual equations with color-coded variables. "
            "Show before/after of solving problems. Keep it light and engaging. "
            "Use diagrams and visual representations of algebraic concepts."
        ),
    },
    {
        "id": "learn-coffee",
        "topic": "How coffee conquered the world",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "A visual storytelling journey through coffee history. "
            "Include a world map showing coffee's spread from Ethiopia. "
            "Timeline of key moments. Stats on global consumption with bar charts. "
            "Rich imagery descriptions. Cover the economics: show production data by country, "
            "price trends, and market size. Make it feel like a documentary."
        ),
    },
    {
        "id": "pitch-demo",
        "topic": "Demo day pitch that actually fits in 3 minutes",
        "slides": 8,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Ultra-concise demo day format. Each slide should be digestible in 15-20 seconds. "
            "ONE stat or point per slide. Big bold numbers. "
            "Problem → Solution → Demo → Traction → Ask. "
            "Use progress bars and metric callouts. No fluff whatsoever. "
            "This should feel fast, confident, and investor-ready."
        ),
    },
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
        "id": "learn-history",
        "topic": "The French Revolution: From Monarchy to Republic",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Historical narrative with a timeline spine. "
            "Include key dates, figures, and events. "
            "Show the social structure (estates) as a diagram. "
            "Timeline from 1789 to 1799 with key milestones. "
            "Cause and effect relationships shown visually. "
            "Include a comparison: before vs after the revolution. "
            "Make it dramatic and engaging, like a history documentary."
        ),
    },
    {
        "id": "sales",
        "topic": "Client proposal that closes itself",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Professional B2B sales proposal. Include: "
            "client pain points, proposed solution, case study with metrics, "
            "ROI projections with charts, implementation timeline (Gantt-style), "
            "pricing tiers in a comparison table, and social proof. "
            "Use progress bars for projected improvements. "
            "Make the value proposition impossible to ignore."
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
        "id": "science-zombie",
        "topic": "How to Survive a Zombie Apocalypse Using Science",
        "slides": 10,
        "additional_instructions": (
            f"{FONT_INSTRUCTIONS} "
            "Fun science presentation. Cover: virology (how a zombie virus could spread), "
            "epidemiology (R0 value charts, infection curves), "
            "survival science (water purification, nutrition), "
            "defense strategies backed by physics and chemistry. "
            "Include an exponential spread chart and a survival checklist. "
            "Educational but entertaining. Think science meets pop culture."
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


async def create_api_key():
    """Create a fresh API key for seeding."""
    service = get_api_key_service()
    full_key, record = await service.create_api_key(
        user_id=USER_ID,
        name="Landing Page Seeder v2",
        context_instructions=(
            "Generate visually striking presentations with clean, modern design. "
            "Use only professional sans-serif fonts like Inter, Montserrat, or system defaults. "
            "Prioritize visual elements: charts, diagrams, and data visualizations. "
            "Keep text minimal — big headings, short bullets. Lots of whitespace."
        ),
        include_edit_link=True,
    )
    return full_key, record


async def create_deck(client: httpx.AsyncClient, api_key: str, pres: dict) -> dict:
    """Create a single deck via API."""
    response = await client.post(
        f"{API_BASE}/v1/decks",
        headers={
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        },
        json={
            "topic": pres["topic"],
            "slides": pres["slides"],
            "additional_instructions": pres.get("additional_instructions", ""),
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()


async def poll_status(client: httpx.AsyncClient, api_key: str, deck_id: str, max_wait: int = 600) -> dict:
    """Poll until deck is completed or failed."""
    start = time.time()
    while time.time() - start < max_wait:
        response = await client.get(
            f"{API_BASE}/v1/decks/{deck_id}/status",
            headers={"X-API-Key": api_key},
            timeout=10.0,
        )
        response.raise_for_status()
        status = response.json()

        if status["status"] == "completed":
            return status
        elif status["status"] == "failed":
            raise Exception(f"Failed: {status.get('error_message', 'Unknown')}")

        await asyncio.sleep(5)

    raise Exception(f"Timeout after {max_wait}s for deck {deck_id}")


def add_to_featured(deck_uuid: str, pres: dict, order_index: int) -> bool:
    """Add completed deck to featured_decks table."""
    try:
        supabase = get_supabase_client()

        # Get deck data
        deck_result = supabase.table("decks").select(
            "slides, data, slide_count, first_slide, short_code"
        ).eq("uuid", deck_uuid).single().execute()

        if not deck_result.data:
            print(f"    Deck {deck_uuid} not found in DB")
            return False

        deck = deck_result.data
        slides = deck.get("slides", [])
        theme = deck.get("data", {}).get("theme") if deck.get("data") else None

        featured_data = {
            "deck_uuid": deck_uuid,
            "user_id": USER_ID,
            "title": pres["topic"],
            "category": pres["id"],
            "order_index": order_index,
            "is_active": True,
            "slide_count": len(slides),
            "first_slide": slides[0] if slides else None,
            "slides_snapshot": slides,
            "theme_snapshot": theme,
        }

        # Upsert — replace if same order_index exists
        supabase.table("featured_decks").upsert(
            featured_data, on_conflict="order_index"
        ).execute()
        return True

    except Exception as e:
        print(f"    Error adding to featured: {e}")
        return False


async def generate_one(
    client: httpx.AsyncClient,
    api_key: str,
    pres: dict,
    index: int,
    total: int,
) -> dict:
    """Generate a single presentation end-to-end."""
    label = pres["topic"][:55]
    try:
        print(f"  [{index+1:2d}/{total}] Firing: {label}...")
        result = await create_deck(client, api_key, pres)
        deck_id = result["deck_id"]
        print(f"  [{index+1:2d}/{total}] Queued: {deck_id[:8]}... -> polling...")

        status = await poll_status(client, api_key, deck_id)
        slides_count = status.get("slides_count", "?")
        print(f"  [{index+1:2d}/{total}] Done:   {label} ({slides_count} slides)")

        return {"success": True, "deck_id": deck_id, "pres": pres, "index": index}

    except Exception as e:
        print(f"  [{index+1:2d}/{total}] FAILED: {label} — {e}")
        return {"success": False, "error": str(e), "pres": pres, "index": index}


async def main():
    total = len(PRESENTATIONS)

    print("=" * 65)
    print("  Landing Page Deck Seeder")
    print(f"  Generating {total} presentations in parallel")
    print("=" * 65)
    print()

    # Step 1: Create API key
    print("Step 1: Creating API key...")
    api_key, record = await create_api_key()
    print(f"  Key:    {api_key}")
    print(f"  Name:   {record.name}")
    print(f"  Prefix: {record.key_prefix}")
    print()

    # Step 2: Fire all presentations in parallel
    print(f"Step 2: Launching {total} presentations...")
    print("-" * 65)

    async with httpx.AsyncClient() as client:
        # Fire all at once in batches of 5 to respect concurrency
        results = []
        batch_size = 5
        for i in range(0, total, batch_size):
            batch = PRESENTATIONS[i:i + batch_size]
            tasks = [
                generate_one(client, api_key, pres, i + j, total)
                for j, pres in enumerate(batch)
            ]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            results.extend(batch_results)

            if i + batch_size < total:
                print(f"  --- batch done, next batch ---")
                await asyncio.sleep(1)

    print("-" * 65)
    print()

    # Step 3: Add successful decks to featured_decks
    print("Step 3: Adding to featured_decks...")
    success = 0
    failed = 0
    for r in results:
        if isinstance(r, Exception):
            failed += 1
            continue
        if r["success"]:
            if add_to_featured(r["deck_id"], r["pres"], r["index"]):
                success += 1
                print(f"  Added: [{r['index']+1}] {r['pres']['topic'][:50]}")
            else:
                failed += 1
        else:
            failed += 1

    print()
    print("=" * 65)
    print(f"  COMPLETE")
    print(f"  Success: {success}/{total}")
    print(f"  Failed:  {failed}/{total}")
    print(f"  API Key: {api_key}")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
