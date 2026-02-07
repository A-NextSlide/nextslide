#!/usr/bin/env python3
"""Quick test: generate 1 seed deck locally to verify slides get components."""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())

from setup_logging_optimized import get_logger
logger = get_logger("test_seed")


async def main():
    import uuid as uuid_module
    from services.supabase import get_supabase_client, reset_supabase_client
    from api.requests.api_admin import _admin_generate_deck

    ADMIN_USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"

    reset_supabase_client()
    supabase = get_supabase_client()

    deck_uuid = str(uuid_module.uuid4())
    topic = "The Science of Sleep: Why Your Brain Needs 8 Hours"

    # Create deck row
    supabase.table("decks").insert({
        "uuid": deck_uuid,
        "user_id": ADMIN_USER_ID,
        "name": topic[:100],
        "slides": [],
        "size": {"width": 1920, "height": 1080},
        "status": {"state": "generating", "message": "Starting..."},
        "data": {"source": "admin_seed"},
        "slide_count": 0,
    }).execute()

    print(f"Created deck {deck_uuid}")
    print(f"Topic: {topic}")
    print(f"Starting generation (LOCAL, no Modal)...\n")

    t0 = time.time()
    try:
        await _admin_generate_deck(
            deck_uuid, ADMIN_USER_ID, topic,
            num_slides=8, style=None, temperature=0.9,
        )
        elapsed = time.time() - t0
        print(f"\nGeneration completed in {elapsed:.0f}s")
    except Exception as e:
        elapsed = time.time() - t0
        print(f"\nGeneration FAILED after {elapsed:.0f}s: {e}")

    # Verify
    reset_supabase_client()
    supabase = get_supabase_client()
    row = supabase.table("decks").select("slides, status").eq("uuid", deck_uuid).single().execute()
    if row.data:
        slides = row.data.get("slides") or []
        print(f"\nSlides: {len(slides)}")
        for i, s in enumerate(slides):
            comps = len(s.get("components") or [])
            status = s.get("status", "?")
            print(f"  Slide {i+1}: status={status}, components={comps}")
        print(f"\nDeck status: {row.data.get('status')}")
    else:
        print("Could not fetch deck!")


if __name__ == "__main__":
    asyncio.run(main())
