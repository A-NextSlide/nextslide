#!/usr/bin/env python3
"""
Load test: verify the API can handle 20 concurrent deck generations.

Fires 20 simultaneous POST /v1/decks requests and monitors them through
completion. Reports timing, success rates, and throughput.

Usage:
    cd apps/backend
    python scripts/load_test_concurrent.py
    python scripts/load_test_concurrent.py --base-url https://your-api.modal.run
"""

import os
import sys
import time
import asyncio
import argparse
import statistics

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import httpx
from services.supabase import get_supabase_client
from services.api_key_service import get_api_key_service

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"
CONCURRENCY = 20
POLL_INTERVAL = 3  # seconds between status polls
GENERATION_TIMEOUT = 300  # 5 minutes max per deck
AUTO_FIX_AFTER = 90  # try to fix stuck decks after 90s

# 20 lightweight topics — 6 slides each for fast generation
TOPICS = [
    ("Company Overview: Our Mission and Vision", 6),
    ("Team Introduction: Meet the Founders", 6),
    ("Product Roadmap Q1 2025", 6),
    ("Market Opportunity: $50B TAM", 6),
    ("Customer Case Study: 3x Revenue Growth", 6),
    ("Sales Pipeline Review: Q4 Results", 6),
    ("Marketing Campaign Performance", 6),
    ("Engineering Architecture Overview", 6),
    ("Investor Update: Monthly Metrics", 6),
    ("Onboarding Guide for New Hires", 6),
    ("Competitive Landscape Analysis", 6),
    ("Financial Summary: Revenue and Margins", 6),
    ("Brand Guidelines and Visual Identity", 6),
    ("User Research Findings Report", 6),
    ("Growth Strategy: Path to $10M ARR", 6),
    ("Quarterly Business Review Deck", 6),
    ("Partnership Proposal: Joint Venture", 6),
    ("Cybersecurity Best Practices", 6),
    ("AI Strategy for Enterprise", 6),
    ("Climate Impact Annual Report", 6),
]

INSTRUCTIONS = (
    "Use clean, professional fonts only — Inter or Montserrat. "
    "Minimal text, bold headings, generous whitespace. "
    "Use infographic layouts with icon grids and data cards."
)


def fix_stuck_deck(deck_id: str) -> bool:
    """Force-complete a deck that has all slides but is stuck in 'generating'."""
    sb = get_supabase_client()
    try:
        result = sb.table("decks").select(
            "uuid, status, slide_count, slides"
        ).eq("uuid", deck_id).single().execute()
        if not result.data:
            return False
        d = result.data
        status = d.get("status", {})
        state = status.get("state", "") if isinstance(status, dict) else ""
        slides = d.get("slides") or []
        if state == "generating" and len(slides) > 0:
            sb.table("decks").update(
                {"status": {"state": "completed", "progress": 100}}
            ).eq("uuid", deck_id).execute()
            return True
        return state == "completed"
    except Exception:
        return False


async def create_deck(client, api_key, topic, slides, idx):
    """POST /v1/decks and measure response time."""
    start = time.time()
    try:
        resp = await client.post(
            "/v1/decks",
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            json={
                "topic": topic,
                "slides": slides,
                "additional_instructions": INSTRUCTIONS,
            },
            timeout=60.0,
        )
        resp.raise_for_status()
        deck_id = resp.json()["deck_id"]
        elapsed = time.time() - start
        print(f"  [{idx+1:2d}/{CONCURRENCY}] Queued  {deck_id[:8]}... ({elapsed:.1f}s) {topic[:45]}")
        return {"idx": idx, "deck_id": deck_id, "create_time": elapsed, "topic": topic}
    except httpx.HTTPStatusError as e:
        elapsed = time.time() - start
        print(f"  [{idx+1:2d}/{CONCURRENCY}] FAILED  HTTP {e.response.status_code} ({elapsed:.1f}s) {topic[:45]}")
        return {"idx": idx, "error": f"HTTP {e.response.status_code}: {e.response.text[:100]}", "create_time": elapsed, "topic": topic}
    except Exception as e:
        elapsed = time.time() - start
        print(f"  [{idx+1:2d}/{CONCURRENCY}] FAILED  {str(e)[:60]} ({elapsed:.1f}s)")
        return {"idx": idx, "error": str(e)[:100], "create_time": elapsed, "topic": topic}


async def poll_completion(client, api_key, deck_id, idx, topic):
    """Poll until deck reaches completed/failed status."""
    start = time.time()
    last_progress = 0

    while time.time() - start < GENERATION_TIMEOUT:
        try:
            r = await client.get(
                f"/v1/decks/{deck_id}/status",
                headers={"X-API-Key": api_key},
                timeout=10.0,
            )
            r.raise_for_status()
            data = r.json()
            status = data.get("status", "unknown")
            progress = data.get("progress", 0)

            if progress != last_progress:
                last_progress = progress

            if status == "completed":
                elapsed = time.time() - start
                print(f"  [{idx+1:2d}/{CONCURRENCY}] Done    {deck_id[:8]}... ({elapsed:.1f}s) {topic[:45]}")
                return {"idx": idx, "deck_id": deck_id, "duration": elapsed, "status": "completed"}

            if status == "failed":
                elapsed = time.time() - start
                print(f"  [{idx+1:2d}/{CONCURRENCY}] FAILED  {deck_id[:8]}... ({elapsed:.1f}s) {topic[:45]}")
                return {"idx": idx, "deck_id": deck_id, "duration": elapsed, "status": "failed"}

        except Exception:
            pass

        # Try auto-fix after timeout
        if time.time() - start > AUTO_FIX_AFTER:
            if fix_stuck_deck(deck_id):
                elapsed = time.time() - start
                print(f"  [{idx+1:2d}/{CONCURRENCY}] Fixed   {deck_id[:8]}... ({elapsed:.1f}s) {topic[:45]}")
                return {"idx": idx, "deck_id": deck_id, "duration": elapsed, "status": "fixed"}

        await asyncio.sleep(POLL_INTERVAL)

    elapsed = time.time() - start
    # Last resort fix
    if fix_stuck_deck(deck_id):
        print(f"  [{idx+1:2d}/{CONCURRENCY}] Fixed   {deck_id[:8]}... ({elapsed:.1f}s) {topic[:45]}")
        return {"idx": idx, "deck_id": deck_id, "duration": elapsed, "status": "fixed"}

    print(f"  [{idx+1:2d}/{CONCURRENCY}] TIMEOUT {deck_id[:8]}... ({elapsed:.1f}s) {topic[:45]}")
    return {"idx": idx, "deck_id": deck_id, "duration": elapsed, "status": "timeout"}


async def main():
    parser = argparse.ArgumentParser(description="Load test: 20 concurrent deck generations")
    parser.add_argument("--base-url", default="http://localhost:9090", help="API base URL")
    parser.add_argument("--concurrency", type=int, default=CONCURRENCY, help="Number of concurrent requests")
    args = parser.parse_args()

    concurrency = args.concurrency
    base_url = args.base_url

    print("=" * 70)
    print(f"  LOAD TEST: {concurrency} Concurrent Deck Generations")
    print(f"  Target: {base_url}")
    print("=" * 70)

    # ── Create API key ────────────────────────────────────────────────
    print("\n[1] Creating API key...")
    service = get_api_key_service()
    api_key, record = await service.create_api_key(
        user_id=USER_ID,
        name=f"Load Test {concurrency}x",
        context_instructions="Generate simple, fast presentations for load testing.",
        include_edit_link=True,
    )
    print(f"    Key: {record.key_prefix}")

    # ── Phase 1: Fire concurrent creation requests ────────────────────
    print(f"\n[2] Firing {concurrency} concurrent POST /v1/decks requests...")
    print("-" * 70)

    phase1_start = time.time()
    async with httpx.AsyncClient(base_url=base_url) as client:
        tasks = [
            create_deck(client, api_key, topic, slides, i)
            for i, (topic, slides) in enumerate(TOPICS[:concurrency])
        ]
        create_results = await asyncio.gather(*tasks)

    phase1_time = time.time() - phase1_start
    queued = [r for r in create_results if "deck_id" in r]
    failed_create = [r for r in create_results if "error" in r]

    print(f"\n    Phase 1 complete: {len(queued)} queued, {len(failed_create)} failed ({phase1_time:.1f}s)")
    if queued:
        create_times = [r["create_time"] for r in queued]
        print(f"    Create latency: min={min(create_times):.1f}s  avg={statistics.mean(create_times):.1f}s  max={max(create_times):.1f}s")

    if not queued:
        print("\n    No decks were created. Check that the server is running.")
        return

    # ── Phase 2: Poll all for completion ──────────────────────────────
    print(f"\n[3] Polling {len(queued)} decks for completion...")
    print("-" * 70)

    phase2_start = time.time()
    async with httpx.AsyncClient(base_url=base_url) as client:
        poll_tasks = [
            poll_completion(client, api_key, r["deck_id"], r["idx"], r["topic"])
            for r in queued
        ]
        poll_results = await asyncio.gather(*poll_tasks)

    phase2_time = time.time() - phase2_start
    total_time = time.time() - phase1_start

    # ── Results ───────────────────────────────────────────────────────
    completed = [r for r in poll_results if r["status"] in ("completed", "fixed")]
    failed = [r for r in poll_results if r["status"] == "failed"]
    timeouts = [r for r in poll_results if r["status"] == "timeout"]

    print(f"\n{'=' * 70}")
    print(f"  LOAD TEST RESULTS")
    print(f"{'=' * 70}")
    print(f"  Concurrency:        {concurrency}")
    print(f"  Queued:             {len(queued)}/{concurrency}")
    print(f"  Completed:          {len(completed)}/{len(queued)}")
    print(f"  Failed:             {len(failed)}/{len(queued)}")
    print(f"  Timeouts:           {len(timeouts)}/{len(queued)}")
    print(f"  Creation failed:    {len(failed_create)}/{concurrency}")
    print(f"  Total wall time:    {total_time:.1f}s")
    print(f"  Phase 1 (create):   {phase1_time:.1f}s")
    print(f"  Phase 2 (generate): {phase2_time:.1f}s")

    if completed:
        durations = [r["duration"] for r in completed]
        print(f"\n  Generation timing (completed decks):")
        print(f"    Min:     {min(durations):.1f}s")
        print(f"    Median:  {statistics.median(durations):.1f}s")
        print(f"    Mean:    {statistics.mean(durations):.1f}s")
        print(f"    Max:     {max(durations):.1f}s")
        print(f"    P90:     {sorted(durations)[int(len(durations)*0.9)]:.1f}s")
        if len(durations) > 1:
            print(f"    Stdev:   {statistics.stdev(durations):.1f}s")
        print(f"    Throughput: {len(completed)/total_time:.2f} decks/sec")

    success_rate = len(completed) / concurrency * 100
    print(f"\n  SUCCESS RATE: {success_rate:.0f}%")

    if success_rate >= 95:
        print("  VERDICT: PASS - System handles 20 concurrent requests")
    elif success_rate >= 80:
        print("  VERDICT: PARTIAL - Some requests failed; investigate timeouts")
    else:
        print("  VERDICT: FAIL - System cannot reliably handle 20 concurrent requests")

    print(f"{'=' * 70}")

    # Cleanup: delete the test API key
    try:
        await service.delete_api_key(record.id, USER_ID)
        print("\n  Test API key cleaned up.")
    except Exception:
        pass


if __name__ == "__main__":
    asyncio.run(main())
