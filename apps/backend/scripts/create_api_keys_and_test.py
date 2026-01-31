#!/usr/bin/env python3
"""
Create 3 API keys for user abeshry and test parallelism + rate limiting.

Usage:
    cd apps/backend
    python3 scripts/create_api_keys_and_test.py
"""

import os
import sys
import time
import asyncio
from typing import Optional

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import httpx
from services.supabase import get_supabase_client
from services.api_key_service import get_api_key_service

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"  # abeshry@gmail.com
API_BASE = os.getenv("API_BASE", "https://nextslide-backend.onrender.com")

# ─────────────────────────────────────────────────────────────────────
# Phase 1: Create 3 API keys
# ─────────────────────────────────────────────────────────────────────

async def create_keys():
    service = get_api_key_service()

    key_configs = [
        {"name": "Landing Page Seeder", "context_instructions": "Generate visually striking, low-text presentations with bold typography and big imagery."},
        {"name": "Parallelism Tester", "context_instructions": None},
        {"name": "Rate Limit Tester", "context_instructions": None},
    ]

    keys = []
    print("=" * 65)
    print("  Phase 1: Creating 3 API Keys for abeshry")
    print("=" * 65)

    for cfg in key_configs:
        full_key, record = await service.create_api_key(
            user_id=USER_ID,
            name=cfg["name"],
            context_instructions=cfg["context_instructions"],
            include_edit_link=True,
        )
        keys.append(full_key)
        print(f"  Created: {record.name}")
        print(f"    Key:    {full_key}")
        print(f"    ID:     {record.id}")
        print(f"    Prefix: {record.key_prefix}")
        print()

    return keys


# ─────────────────────────────────────────────────────────────────────
# Phase 2: Test Parallelism (concurrency limit = 3)
# ─────────────────────────────────────────────────────────────────────

async def test_parallelism(api_key: str):
    print("=" * 65)
    print("  Phase 2: Testing Parallelism (5 simultaneous requests)")
    print("  Expected: first 3 accepted, 4th & 5th get 429")
    print("=" * 65)

    async with httpx.AsyncClient(timeout=60.0) as client:
        payload = {
            "topic": f"Test deck for parallelism — {time.time()}",
            "slides": 3,
            "style": "minimal",
        }

        async def send_one(i: int):
            # Each request gets a slightly different topic to avoid dedup
            p = {**payload, "topic": f"Parallelism test #{i} — {time.time()}"}
            start = time.time()
            try:
                r = await client.post(
                    f"{API_BASE}/v1/decks",
                    headers={"X-API-Key": api_key, "Content-Type": "application/json"},
                    json=p,
                )
                elapsed = time.time() - start
                if r.status_code == 200:
                    data = r.json()
                    print(f"  Request {i}: 200 OK — deck {data['deck_id'][:8]}... ({elapsed:.1f}s)")
                elif r.status_code == 429:
                    data = r.json()
                    reason = data.get("error", "rate_limit")
                    print(f"  Request {i}: 429 REJECTED — {reason} ({elapsed:.1f}s)")
                else:
                    print(f"  Request {i}: {r.status_code} — {r.text[:200]} ({elapsed:.1f}s)")
                return r.status_code
            except Exception as e:
                elapsed = time.time() - start
                print(f"  Request {i}: ERROR — {e} ({elapsed:.1f}s)")
                return 0

        # Fire 5 requests simultaneously
        results = await asyncio.gather(*[send_one(i) for i in range(1, 6)])

        accepted = sum(1 for r in results if r == 200)
        rejected = sum(1 for r in results if r == 429)
        print()
        print(f"  Results: {accepted} accepted, {rejected} rejected (429)")
        if rejected >= 2:
            print("  PASS: Concurrency limit is enforced")
        else:
            print("  NOTE: Concurrency limit may not have triggered if requests were sequential")

        # Wait for background tasks to settle so slots are freed
        print("  Waiting 5s for background tasks to start...")
        await asyncio.sleep(5)


# ─────────────────────────────────────────────────────────────────────
# Phase 3: Test Dedup (same request within 60s)
# ─────────────────────────────────────────────────────────────────────

async def test_dedup(api_key: str):
    print()
    print("=" * 65)
    print("  Phase 3: Testing Request Deduplication")
    print("  Expected: 1st accepted, 2nd gets 409 Conflict")
    print("=" * 65)

    topic = f"Dedup test — identical topic {int(time.time())}"
    payload = {"topic": topic, "slides": 3, "style": "minimal"}

    async with httpx.AsyncClient(timeout=60.0) as client:
        # First request
        r1 = await client.post(
            f"{API_BASE}/v1/decks",
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            json=payload,
        )
        print(f"  Request 1: {r1.status_code} — {r1.json().get('deck_id', r1.json().get('error', ''))[:50]}")

        # Same request again
        r2 = await client.post(
            f"{API_BASE}/v1/decks",
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            json=payload,
        )
        body2 = r2.json()
        print(f"  Request 2: {r2.status_code} — {body2.get('error', body2.get('deck_id', ''))[:50]}")

        if r2.status_code == 409:
            print("  PASS: Duplicate request was rejected")
        else:
            print(f"  NOTE: Expected 409, got {r2.status_code}")


# ─────────────────────────────────────────────────────────────────────
# Phase 4: Test Rate Limiting (rapid-fire)
# ─────────────────────────────────────────────────────────────────────

async def test_rate_limit(api_key: str):
    print()
    print("=" * 65)
    print("  Phase 4: Testing Rate Limiting (quick burst of GET requests)")
    print("  Hitting /v1/decks (list endpoint) rapidly")
    print("=" * 65)

    hit_429 = False
    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(65):
            try:
                r = await client.get(
                    f"{API_BASE}/v1/decks?limit=1",
                    headers={"X-API-Key": api_key},
                )
                if r.status_code == 429:
                    print(f"  Request {i+1}: 429 — Rate limit hit!")
                    hit_429 = True
                    break
                elif (i + 1) % 20 == 0:
                    print(f"  Request {i+1}: {r.status_code}")
            except Exception as e:
                print(f"  Request {i+1}: ERROR — {e}")
                break

    if hit_429:
        print("  PASS: Rate limit enforced before 65 requests")
    else:
        print("  NOTE: All 65 requests passed. Rate limit may need Redis or higher burst.")


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

async def main():
    keys = await create_keys()

    if not keys:
        print("No keys created. Exiting.")
        return

    print()
    print("─" * 65)
    print("  API Keys Summary")
    print("─" * 65)
    for i, k in enumerate(keys, 1):
        print(f"  Key {i}: {k}")
    print()

    # Use key #2 for parallelism test, key #3 for rate limit test
    await test_parallelism(keys[1])
    await test_dedup(keys[1])
    await test_rate_limit(keys[2])

    print()
    print("=" * 65)
    print("  ALL TESTS COMPLETE")
    print("=" * 65)
    print()
    print("  Key 1 (Seeder):      ", keys[0])
    print("  Key 2 (Parallelism): ", keys[1])
    print("  Key 3 (Rate Limit):  ", keys[2])
    print()


if __name__ == "__main__":
    asyncio.run(main())
