#!/usr/bin/env python3
"""
Internal script to create a deck using the public API logic,
bypassing HTTP to avoid Cloudflare blocks.

Usage:
    python scripts/create_deck_internal.py <api_key> "<topic>" [num_slides]
"""

import asyncio
import sys
import os
import uuid

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()


async def create_deck_with_api_key(api_key: str, topic: str, num_slides: int = 8):
    """Create a deck using the internal API logic."""

    from services.api_key_service import get_api_key_service
    from services.supabase import get_supabase_client
    from api.requests.api_public_v1 import generate_deck_background

    print(f"[1/5] Validating API key...")

    # Validate API key
    service = get_api_key_service()
    result = await service.validate_api_key(api_key)

    if not result:
        print("ERROR: Invalid API key")
        return None

    user_id, key_record = result
    print(f"       API key valid for user: {user_id}")
    print(f"       Key name: {key_record.name}")

    # Generate deck UUID
    deck_uuid = str(uuid.uuid4())
    print(f"\n[2/5] Creating deck: {deck_uuid}")

    # URLs
    base_url = os.getenv("NEXT_PUBLIC_APP_URL", "https://nextslide.app")
    view_url = f"{base_url}/view/{deck_uuid}"
    edit_url = f"{base_url}/deck/{deck_uuid}"

    print(f"\n[3/5] Starting generation...")
    print(f"       Topic: {topic[:100]}...")
    print(f"       Slides: {num_slides}")

    # Run background generation
    await generate_deck_background(
        deck_uuid=deck_uuid,
        user_id=user_id,
        api_key_record=key_record,
        topic=topic,
        num_slides=num_slides,
        style=None,
        additional_instructions=None,
        view_url=view_url,
        edit_url=edit_url,
        metadata={"created_via": "internal_script"}
    )

    print(f"\n[5/5] Generation complete!")
    print(f"\n{'='*60}")
    print(f"DECK CREATED SUCCESSFULLY")
    print(f"{'='*60}")
    print(f"View URL: {view_url}")
    print(f"Edit URL: {edit_url}")
    print(f"Deck ID:  {deck_uuid}")
    print(f"{'='*60}")

    return {
        "deck_id": deck_uuid,
        "view_url": view_url,
        "edit_url": edit_url
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/create_deck_internal.py <api_key> \"<topic>\" [num_slides]")
        print("\nExample:")
        print('  python scripts/create_deck_internal.py ns_live_xxx "Introduction to Machine Learning" 10')
        sys.exit(1)

    api_key = sys.argv[1]
    topic = sys.argv[2]
    num_slides = int(sys.argv[3]) if len(sys.argv) > 3 else 8

    result = asyncio.run(create_deck_with_api_key(api_key, topic, num_slides))

    if result:
        sys.exit(0)
    else:
        sys.exit(1)
