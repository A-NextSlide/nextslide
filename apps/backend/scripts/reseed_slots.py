"""
Reseed specific hero slots.
Usage: python scripts/reseed_slots.py

Regenerates slots 2, 3, 4, 6, 7, 9 and updates featured_decks.
Slot 8 is already swapped to abeshry's deck.
"""
import asyncio
import os
import sys
import uuid as uuid_module

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SLOTS_TO_REGENERATE = [2]


async def main():
    from services.supabase import get_supabase_client, reset_supabase_client
    from api.requests.api_admin import (
        HERO_SLOT_PROMPTS,
        HERO_SLOT_CATEGORIES,
        HERO_SLOT_STATIC,
        _admin_generate_deck,
        _clean_deck_name,
    )
    from agents.config import SEED_TEMPERATURE

    reset_supabase_client()
    sb = get_supabase_client()

    user_id = "942ccba7-5346-4f99-8189-82284dafb255"  # abeshry@gmail.com
    print(f"Using admin user: {user_id}")

    # Delete old featured_decks for these slots
    for slot in SLOTS_TO_REGENERATE:
        sb.table("featured_decks").delete().eq("display_order", slot).execute()
        print(f"Deleted old featured_deck for slot {slot}")

    # Generate each slot
    for slot in SLOTS_TO_REGENERATE:
        prompt = HERO_SLOT_PROMPTS[slot]
        deck_name = _clean_deck_name(prompt)
        deck_uuid = str(uuid_module.uuid4())
        category = HERO_SLOT_CATEGORIES.get(slot, "education")
        slide_mode = "static" if slot in HERO_SLOT_STATIC else None

        print(f"\n{'='*60}")
        print(f"Slot {slot}: {deck_name[:60]}")
        print(f"  Mode: {'TRADITIONAL (static)' if slide_mode else 'interactive'}")
        print(f"  UUID: {deck_uuid}")

        # Create deck row
        sb.table("decks").insert({
            "uuid": deck_uuid,
            "user_id": user_id,
            "name": deck_name[:100],
            "slides": [],
            "size": {"width": 1920, "height": 1080},
            "status": {"state": "generating", "message": f"Generating slot {slot}..."},
            "data": {"source": "admin_seed"},
            "slide_count": 0,
        }).execute()

        # Generate
        try:
            await _admin_generate_deck(
                deck_uuid, user_id, prompt,
                8, "creative",
                reseed_info={"source": "featured", "display_order": slot, "category": category},
                temperature=SEED_TEMPERATURE,
                max_parallel_slides=8,  # single deck, full parallelism is fine
                slide_mode=slide_mode,
            )

            # Copy slides to featured_decks
            reset_supabase_client()
            sb = get_supabase_client()
            deck_row = sb.table("decks").select("slides, description").eq("uuid", deck_uuid).maybe_single().execute()
            slides_data = []
            deck_description = ""
            if deck_row and getattr(deck_row, "data", None):
                slides_data = deck_row.data.get("slides") or []
                deck_description = deck_row.data.get("description") or ""

            sb.table("featured_decks").insert({
                "uuid": deck_uuid,
                "name": deck_name[:100],
                "description": deck_description,
                "slides": slides_data,
                "slide_count": len(slides_data),
                "display_order": slot,
                "is_active": True,
            }).execute()

            # Count good slides
            good = sum(
                1 for s in slides_data
                for c in (s.get("components") or [])
                if c.get("type") == "CustomComponent"
                and len((c.get("props") or {}).get("render") or "") > 500
            )
            print(f"  DONE: {good}/{len(slides_data)} slides with content")

        except Exception as e:
            print(f"  FAILED: {e}")

    print(f"\n{'='*60}")
    print("All slots processed. Verify at the landing page.")


if __name__ == "__main__":
    asyncio.run(main())
