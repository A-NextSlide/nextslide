#!/usr/bin/env python3
"""
Seed featured decks for the landing page using the public API.

Generates 8 fun, unique presentations and inserts them into the
featured_decks table for the InteractiveHero showcase.

Usage:
    cd apps/backend
    python scripts/seed_featured_decks.py
"""

import os
import sys
import time
import asyncio
from typing import Optional, Dict
import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client

# Configuration
API_KEY = os.environ.get("FEATURED_DECK_API_KEY", "ns_live_Lwd5HS7g4O7jJCZT2yr1OrU6wQdlCElt")
API_BASE = os.environ.get("API_BASE", "https://nextslide-backend.onrender.com")

# 8 fun, unique presentations for the landing page
FEATURED_DECKS = [
    {
        "topic": (
            "Create a hilarious startup pitch deck for 'PawPal AI' — an AI startup that teaches pets to order their own treats online. "
            "Include a problem slide (pets are tired of waiting for humans), solution, market size (billions of pets worldwide), "
            "business model, traction metrics (dog testimonials), and a bold ask slide. Make it playful, witty, and visually fun "
            "with bright colors. The tone should be comedic but with real pitch deck structure."
        ),
        "slides": 10,
        "style": "creative",
        "display_name": "PawPal AI Pitch Deck",
        "description": "A hilarious startup pitch for an AI that lets pets order their own treats",
    },
    {
        "topic": (
            "Create a fascinating educational presentation about why octopuses could secretly take over the world. "
            "Cover their incredible intelligence (tool use, escape artistry, problem solving), camouflage superpowers, "
            "three hearts and blue blood, distributed brain across tentacles, and why scientists think they might be aliens. "
            "Make it fun and mind-blowing with a playful conspiratorial tone. Include surprising facts and comparisons."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "Octopus World Domination",
        "description": "Why octopuses are the secret geniuses plotting to take over the world",
    },
    {
        "topic": (
            "Create an engaging time-travel themed presentation: 'A Time Traveler's Survival Guide to Ancient Rome.' "
            "Cover what to wear (togas are complicated), what to eat (garum sauce on everything), gladiator games etiquette, "
            "how to navigate the Forum, bathroom culture (communal sponges), and things that would get you killed. "
            "Mix real historical facts with humorous modern-day comparisons. Educational but entertaining."
        ),
        "slides": 10,
        "style": "creative",
        "display_name": "Time Travel to Ancient Rome",
        "description": "A time traveler's survival guide to not dying in ancient Rome",
    },
    {
        "topic": (
            "Create a captivating psychology presentation about 'The Science of Why We Can't Stop Watching Cat Videos.' "
            "Cover the neuroscience of cute aggression, dopamine loops and infinite scroll, why baby schema triggers nurturing instincts, "
            "the history of internet cats (from Nyan Cat to Grumpy Cat), parasocial relationships with pet influencers, "
            "and real research studies on cat video therapy. Make it scientifically accurate but hilarious."
        ),
        "slides": 8,
        "style": "minimal",
        "display_name": "Psychology of Cat Videos",
        "description": "The neuroscience behind why cat videos hijack your brain",
    },
    {
        "topic": (
            "Create an exciting STEM education presentation: 'How to Survive a Zombie Apocalypse Using Science.' "
            "Cover epidemiology (how the virus would spread using R0 values), physics of fortification, "
            "chemistry of improvised supplies, biology of decomposition (zombies have an expiry date), "
            "game theory for group survival, and statistics of your actual survival odds. "
            "Make it fun and educational — teach real science through zombie scenarios."
        ),
        "slides": 10,
        "style": "creative",
        "display_name": "Zombie Apocalypse Science",
        "description": "Real science disguised as zombie apocalypse survival training",
    },
    {
        "topic": (
            "Create a vibrant cultural presentation about 'How Street Food Conquered Fine Dining.' "
            "Cover the global street food revolution, how tacos went from $1 carts to $30 restaurant plates, "
            "Bangkok's Michelin-starred street stalls, the economics of a food cart vs restaurant, "
            "Instagram's role in food culture, and iconic street foods from 6 continents. "
            "Make it mouthwatering, colorful, and celebrate food culture diversity."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "Street Food Revolution",
        "description": "How $1 street tacos conquered the world of fine dining",
    },
    {
        "topic": (
            "Create a bold investor pitch deck for 'AstroMine Corp' — a space mining startup going after trillion-dollar asteroids. "
            "Cover the market opportunity (single asteroid worth more than Earth's GDP), technology approach (autonomous mining drones), "
            "competitive landscape (SpaceX, NASA partnerships), 5-year roadmap, team backgrounds, "
            "and a jaw-dropping financial projection slide. Make it feel futuristic, ambitious, and visually stunning. "
            "Professional pitch deck format but with a sci-fi edge."
        ),
        "slides": 10,
        "style": "corporate",
        "display_name": "AstroMine Space Pitch",
        "description": "Investor pitch for mining trillion-dollar asteroids in space",
    },
    {
        "topic": (
            "Create a nostalgic and entertaining presentation about 'Why the 90s Internet Was the Wild West of Creativity.' "
            "Cover GeoCities and personal homepages, the sound of dial-up, AIM away messages as an art form, "
            "early meme culture (Dancing Baby, Hamster Dance), Flash games and animations, MySpace as the first social media, "
            "and how the lawless early web shaped modern internet culture. "
            "Make it nostalgic, funny, and celebrate the chaos of early internet creativity."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "90s Internet Wild West",
        "description": "A nostalgic trip through the beautifully chaotic early internet",
    },
]


async def create_deck(client: httpx.AsyncClient, deck_info: dict) -> dict:
    """Create a deck via the API."""
    payload = {
        "topic": deck_info["topic"],
        "slides": deck_info["slides"],
    }
    if deck_info.get("style"):
        payload["style"] = deck_info["style"]

    response = await client.post(
        f"{API_BASE}/v1/decks",
        headers={
            "X-API-Key": API_KEY,
            "Content-Type": "application/json"
        },
        json=payload,
        timeout=120.0
    )
    if response.status_code != 200:
        print(f"           API Error {response.status_code}: {response.text[:500]}")
    response.raise_for_status()
    return response.json()


async def poll_status(client: httpx.AsyncClient, deck_id: str, max_wait: int = 600) -> dict:
    """Poll for deck completion (up to 10 minutes)."""
    start = time.time()
    while time.time() - start < max_wait:
        response = await client.get(
            f"{API_BASE}/v1/decks/{deck_id}/status",
            headers={"X-API-Key": API_KEY},
            timeout=60.0
        )
        response.raise_for_status()
        status = response.json()

        if status["status"] == "completed":
            return status
        elif status["status"] == "failed":
            raise Exception(f"Generation failed: {status.get('error_message', 'Unknown error')}")

        elapsed = int(time.time() - start)
        print(f"           ... still generating ({elapsed}s elapsed)")
        await asyncio.sleep(8)

    raise Exception(f"Timeout waiting for deck {deck_id}")


def add_to_featured(deck_uuid: str, display_name: str, description: str, display_order: int) -> bool:
    """Add a completed deck to featured_decks table."""
    try:
        supabase = get_supabase_client()

        # Get the deck data
        deck_result = supabase.table('decks').select(
            'slides, name'
        ).eq('uuid', deck_uuid).single().execute()

        if not deck_result.data:
            print(f"    Deck {deck_uuid} not found in decks table")
            return False

        deck = deck_result.data
        slides = deck.get('slides', [])

        featured_data = {
            "uuid": deck_uuid,
            "name": display_name,
            "description": description,
            "slides": slides,
            "slide_count": len(slides),
            "display_order": display_order,
            "is_active": True,
        }

        supabase.table('featured_decks').upsert(
            featured_data,
            on_conflict='uuid'
        ).execute()

        return True

    except Exception as e:
        print(f"    Error adding to featured: {e}")
        return False


def deactivate_existing():
    """Deactivate all existing featured decks."""
    try:
        supabase = get_supabase_client()
        supabase.table('featured_decks').update({
            "is_active": False
        }).eq('is_active', True).execute()
        print("  Deactivated existing featured decks")
    except Exception as e:
        print(f"  Warning: Could not deactivate existing: {e}")


async def generate_one(
    client: httpx.AsyncClient,
    deck_info: dict,
    index: int,
    total: int
) -> Optional[Dict]:
    """Generate a single deck and return its UUID."""
    try:
        print(f"  [{index+1}/{total}] Creating: {deck_info['display_name']}")
        result = await create_deck(client, deck_info)
        deck_id = result["deck_id"]
        print(f"           Deck ID: {deck_id}")
        print(f"           Waiting for generation...")

        status = await poll_status(client, deck_id)
        print(f"           Done! ({status.get('slides_count', '?')} slides)")

        return {"uuid": deck_id, "info": deck_info, "status": status}

    except httpx.HTTPStatusError as e:
        print(f"           FAILED (HTTP {e.response.status_code}): {e.response.text[:300]}")
        return None
    except Exception as e:
        print(f"           FAILED: {type(e).__name__}: {e}")
        return None


async def main():
    print("=" * 60)
    print("Featured Decks Seeder")
    print("=" * 60)
    print(f"API: {API_BASE}")
    print(f"Decks to generate: {len(FEATURED_DECKS)}")
    print()

    # Step 0: Wake up the server
    print("[Phase 0] Waking up server...")
    async with httpx.AsyncClient() as wake_client:
        try:
            r = await wake_client.get(f"{API_BASE}/api/health", timeout=120.0)
            print(f"  Server responded: {r.status_code}")
        except Exception as e:
            print(f"  Wake-up request: {type(e).__name__} (server may still be starting)")
            print("  Waiting 30s for cold start...")
            await asyncio.sleep(30)
    print()

    # Step 1: Generate all decks via API (batches of 2)
    print("[Phase 1] Generating presentations via API")
    print("-" * 60)

    results = []
    async with httpx.AsyncClient() as client:
        for i, deck_info in enumerate(FEATURED_DECKS):
            r = await generate_one(client, deck_info, i, len(FEATURED_DECKS))
            if r:
                results.append(r)
            # Brief pause between decks
            if i < len(FEATURED_DECKS) - 1:
                print()
                await asyncio.sleep(2)

    print()
    print(f"  Generated {len(results)}/{len(FEATURED_DECKS)} decks")
    print()

    if not results:
        print("No decks generated. Exiting.")
        return

    # Step 2: Deactivate old featured decks and insert new ones
    print("[Phase 2] Updating featured_decks table")
    print("-" * 60)

    deactivate_existing()

    success_count = 0
    for i, r in enumerate(results):
        deck_info = r["info"]
        deck_uuid = r["uuid"]
        print(f"  [{i+1}/{len(results)}] Adding: {deck_info['display_name']}")

        if add_to_featured(deck_uuid, deck_info["display_name"], deck_info["description"], i + 1):
            print(f"           Added (display_order={i+1})")
            success_count += 1
        else:
            print(f"           Failed to add")

    print()
    print("=" * 60)
    print(f"Summary:")
    print(f"  Generated:  {len(results)}/{len(FEATURED_DECKS)}")
    print(f"  Featured:   {success_count}/{len(results)}")
    print()

    # Print UUIDs for reference
    print("Deck UUIDs (in display order):")
    for i, r in enumerate(results):
        print(f"  {i+1}. {r['uuid']} — {r['info']['display_name']}")

    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
