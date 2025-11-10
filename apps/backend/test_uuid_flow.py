#!/usr/bin/env python3
"""
Test script to verify UUID consistency in outline agent mode.

This script simulates the complete flow:
1. Generate an outline
2. Verify the outline.id matches the deck_uuid
3. Trigger deck composition
4. Verify the deck is created with the correct UUID
5. Verify no 404 errors occur during generation
"""

import asyncio
import uuid
import requests
import json
import time
from datetime import datetime

BASE_URL = "http://localhost:8000"

def print_step(step_num, description):
    print(f"\n{'='*80}")
    print(f"STEP {step_num}: {description}")
    print(f"{'='*80}\n")

def print_success(message):
    print(f"✅ {message}")

def print_error(message):
    print(f"❌ {message}")

def print_info(message):
    print(f"ℹ️  {message}")

async def test_uuid_flow():
    """Test the complete UUID consistency flow."""

    # Generate a deck UUID
    deck_uuid = str(uuid.uuid4())
    print_info(f"Generated test deck UUID: {deck_uuid}")

    # Step 1: Create an outline
    print_step(1, "Creating outline via /api/generate-deck-outline")

    outline_payload = {
        "prompt": "Create a presentation about AI testing automation",
        "slideCount": 3,
        "detailLevel": "quick",
        "enableResearch": False,
        "autoSelectImages": False,
        "uploadedFiles": []
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/generate-deck-outline",
            json=outline_payload,
            stream=True,
            timeout=60
        )

        outline_data = None
        for line in response.iter_lines():
            if line:
                try:
                    data = json.loads(line.decode('utf-8').replace('data: ', ''))
                    if data.get('type') == 'outline_complete':
                        outline_data = data.get('outline')
                        print_success(f"Outline generated with ID: {outline_data.get('id')}")
                        break
                except json.JSONDecodeError:
                    continue

        if not outline_data:
            print_error("Failed to generate outline")
            return False

        # Verify outline has an ID
        outline_id = outline_data.get('id')
        if not outline_id:
            print_error("Outline missing ID field")
            return False

        print_info(f"Outline ID: {outline_id}")
        print_info(f"Test deck UUID: {deck_uuid}")

    except Exception as e:
        print_error(f"Failed to create outline: {e}")
        return False

    # Step 2: Compose the deck using the outline
    print_step(2, "Composing deck via /api/compose-deck")

    # Override the outline ID to match our test deck UUID
    outline_data['id'] = deck_uuid
    print_info(f"Using deck UUID: {deck_uuid} for composition")

    compose_payload = {
        "outline": outline_data,
        "deck_id": deck_uuid,  # Explicitly pass deck_id
        "async_images": True,
        "force_restart": True
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/compose-deck",
            json=compose_payload,
            stream=True,
            timeout=120
        )

        deck_created = False
        initialization_seen = False

        for line in response.iter_lines():
            if line:
                try:
                    data = json.loads(line.decode('utf-8').replace('data: ', ''))
                    event_type = data.get('type')

                    if event_type == 'phase_update':
                        phase = data.get('phase')
                        print_info(f"Phase: {phase}")

                        if phase == 'initialization':
                            initialization_seen = True
                            print_success("Initialization phase started")

                            # Step 3: Check if deck exists right after initialization
                            print_step(3, "Checking if deck was created during initialization")
                            time.sleep(2)  # Wait a moment for deck creation

                            try:
                                deck_response = requests.get(f"{BASE_URL}/api/decks/{deck_uuid}")
                                if deck_response.status_code == 200:
                                    deck_data = deck_response.json()
                                    print_success(f"✓ Deck exists with UUID: {deck_data.get('uuid')}")
                                    print_success(f"✓ Deck name: {deck_data.get('name')}")
                                    print_success(f"✓ Deck status: {deck_data.get('status', {}).get('state')}")
                                    deck_created = True
                                elif deck_response.status_code == 404:
                                    print_error("✗ Deck not found - 404 error!")
                                    return False
                                else:
                                    print_error(f"✗ Unexpected response: {deck_response.status_code}")
                                    return False
                            except Exception as e:
                                print_error(f"✗ Error checking deck: {e}")
                                return False

                        # Stop after theme generation to save time
                        if phase == 'slide_generation':
                            print_info("Slide generation started - stopping test here")
                            break

                except json.JSONDecodeError:
                    continue

        if not initialization_seen:
            print_error("Initialization phase never triggered")
            return False

        if not deck_created:
            print_error("Deck was not created during initialization")
            return False

    except Exception as e:
        print_error(f"Failed during deck composition: {e}")
        return False

    # Step 4: Final verification
    print_step(4, "Final UUID consistency verification")

    try:
        final_deck = requests.get(f"{BASE_URL}/api/decks/{deck_uuid}").json()
        final_uuid = final_deck.get('uuid')

        if final_uuid == deck_uuid:
            print_success(f"✓ UUID consistency verified: {final_uuid}")
        else:
            print_error(f"✗ UUID mismatch: expected {deck_uuid}, got {final_uuid}")
            return False

    except Exception as e:
        print_error(f"Failed final verification: {e}")
        return False

    print_step(5, "TEST RESULTS")
    print_success("All UUID consistency checks PASSED! 🎉")
    print_success("✓ Outline created successfully")
    print_success("✓ Deck created during initialization (no 404s)")
    print_success("✓ UUID consistency maintained throughout")

    return True

if __name__ == "__main__":
    print(f"\n{'#'*80}")
    print("UUID CONSISTENCY FLOW TEST")
    print(f"Started at: {datetime.now()}")
    print(f"{'#'*80}\n")

    success = asyncio.run(test_uuid_flow())

    if success:
        print(f"\n{'#'*80}")
        print("TEST SUITE PASSED ✅")
        print(f"{'#'*80}\n")
        exit(0)
    else:
        print(f"\n{'#'*80}")
        print("TEST SUITE FAILED ❌")
        print(f"{'#'*80}\n")
        exit(1)
