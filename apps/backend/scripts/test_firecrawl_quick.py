#!/usr/bin/env python3
"""
Quick test of Firecrawl Agent for key scenarios.
"""

import os
import sys
import json
import time
import requests
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
BASE_URL = "https://api.firecrawl.dev"


def test_agent(prompt: str, urls: list = None, max_credits: int = 30):
    """Test Firecrawl Agent."""
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "prompt": prompt,
        "maxCredits": max_credits
    }
    if urls:
        payload["urls"] = urls

    print(f"\n{'='*60}")
    print(f"PROMPT: {prompt[:100]}...")
    if urls:
        print(f"URLS: {urls}")
    print(f"{'='*60}")

    # Start task
    print("Starting agent...")
    start = time.time()
    resp = requests.post(f"{BASE_URL}/v2/agent", json=payload, headers=headers, timeout=30)

    if resp.status_code != 200:
        print(f"❌ Start failed: {resp.status_code}")
        print(resp.text[:500])
        return None

    result = resp.json()
    print(f"Response: {json.dumps(result, indent=2)[:500]}")

    if not result.get("success"):
        print(f"❌ Failed: {result}")
        return None

    job_id = result.get("id")
    print(f"Job ID: {job_id}")

    # Poll for results
    max_wait = 180  # 3 minutes
    poll_interval = 5
    elapsed = 0

    while elapsed < max_wait:
        time.sleep(poll_interval)
        elapsed += poll_interval

        status_resp = requests.get(f"{BASE_URL}/v2/agent/{job_id}", headers=headers, timeout=30)

        if status_resp.status_code != 200:
            print(f"  Status check failed: {status_resp.status_code}")
            continue

        status = status_resp.json()
        state = status.get("status", "unknown")

        # Show progress
        steps = status.get("steps", [])
        if steps:
            last_step = steps[-1] if steps else {}
            print(f"  [{elapsed}s] Status: {state} | Steps: {len(steps)} | Last: {str(last_step.get('action', ''))[:50]}")
        else:
            print(f"  [{elapsed}s] Status: {state}")

        if state == "completed":
            duration = time.time() - start
            data = status.get("data")
            credits = status.get("creditsUsed")

            print(f"\n✅ COMPLETED in {duration:.1f}s")
            print(f"Credits used: {credits}")
            print(f"Data type: {type(data)}")
            print(f"Data preview: {str(data)[:1000]}...")

            return {
                "success": True,
                "data": data,
                "credits": credits,
                "duration": duration,
                "steps": len(steps)
            }

        elif state == "failed":
            print(f"\n❌ FAILED: {status.get('error')}")
            return None

    print(f"\n⏰ TIMEOUT after {max_wait}s")
    return None


def main():
    print("="*60)
    print("FIRECRAWL AGENT TEST")
    print(f"Time: {datetime.now().isoformat()}")
    print("="*60)

    if not FIRECRAWL_API_KEY:
        print("❌ FIRECRAWL_API_KEY not set")
        return

    # Test 1: Company info extraction (specific site)
    result1 = test_agent(
        prompt="Extract all product features from Linear's homepage. For each feature get: name, description, and any icons/images.",
        urls=["https://linear.app"]
    )

    # Test 2: Video discovery
    result2 = test_agent(
        prompt="Find all videos on Figma's website. Check the homepage, resources, and any video sections. For each video get: URL, title, thumbnail if visible, and video platform (YouTube/Vimeo/etc).",
        urls=["https://figma.com"]
    )

    # Test 3: Investor extraction (no URL - let agent search)
    result3 = test_agent(
        prompt="Find all investors who have funded Notion. List each investor name and the funding round. Search Crunchbase and company pages."
    )

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    tests = [
        ("Product Features (Linear)", result1),
        ("Video Discovery (Figma)", result2),
        ("Investor Search (Notion)", result3)
    ]

    for name, result in tests:
        if result:
            print(f"✅ {name}: {result['duration']:.1f}s, {result['credits']} credits, {result['steps']} steps")
        else:
            print(f"❌ {name}: FAILED")


if __name__ == "__main__":
    main()
