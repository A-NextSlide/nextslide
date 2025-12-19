#!/usr/bin/env python3
"""
Firecrawl Agent test with higher credit limits.
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


def test_agent(name: str, prompt: str, urls: list = None, max_credits: int = 100):
    """Test Firecrawl Agent with higher credit limit."""
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
    print(f"TEST: {name}")
    print(f"PROMPT: {prompt}")
    if urls:
        print(f"URLS: {urls}")
    print(f"MAX CREDITS: {max_credits}")
    print(f"{'='*60}")

    start = time.time()
    resp = requests.post(f"{BASE_URL}/v2/agent", json=payload, headers=headers, timeout=30)

    if resp.status_code != 200:
        print(f"❌ Start failed: {resp.status_code} - {resp.text[:200]}")
        return None

    result = resp.json()
    if not result.get("success"):
        print(f"❌ Failed: {result}")
        return None

    job_id = result.get("id")
    print(f"Job started: {job_id}")

    # Poll
    max_wait = 300  # 5 minutes
    poll_interval = 5
    elapsed = 0

    while elapsed < max_wait:
        time.sleep(poll_interval)
        elapsed += poll_interval

        status_resp = requests.get(f"{BASE_URL}/v2/agent/{job_id}", headers=headers, timeout=30)
        if status_resp.status_code != 200:
            continue

        status = status_resp.json()
        state = status.get("status", "unknown")
        credits_so_far = status.get("creditsUsed", 0)
        print(f"  [{elapsed}s] {state} | credits: {credits_so_far}")

        if state == "completed":
            data = status.get("data")
            credits = status.get("creditsUsed")
            duration = time.time() - start

            print(f"\n✅ SUCCESS in {duration:.1f}s | {credits} credits")
            print(f"\nDATA ({type(data).__name__}):")
            print(json.dumps(data, indent=2)[:2000] if data else "No data")

            return {
                "name": name,
                "success": True,
                "duration": duration,
                "credits": credits,
                "data": data
            }

        elif state == "failed":
            error = status.get("error", "Unknown error")
            print(f"\n❌ FAILED: {error}")
            return {"name": name, "success": False, "error": error}

    print(f"\n⏰ TIMEOUT")
    return {"name": name, "success": False, "error": "Timeout"}


def main():
    print("="*60)
    print("FIRECRAWL AGENT TESTS (Higher Credit Limits)")
    print(f"Time: {datetime.now().isoformat()}")
    print("="*60)

    results = []

    # Test 1: Simple single-page extraction (should be cheap)
    r = test_agent(
        name="Simple: Anthropic homepage",
        prompt="Extract the main headline and product description from anthropic.com homepage.",
        urls=["https://anthropic.com"],
        max_credits=50
    )
    results.append(r)

    # Test 2: Video discovery (medium complexity)
    r = test_agent(
        name="Videos: Linear website",
        prompt="Find any demo or product videos on Linear's website. Return video URLs and titles.",
        urls=["https://linear.app"],
        max_credits=100
    )
    results.append(r)

    # Test 3: Multi-page navigation (higher complexity)
    r = test_agent(
        name="Case Studies: Figma",
        prompt="Find 3 customer case studies from Figma's website. For each: company name and one key result/quote.",
        urls=["https://figma.com/customers"],
        max_credits=150
    )
    results.append(r)

    # Summary
    print("\n" + "="*60)
    print("FINAL SUMMARY")
    print("="*60)
    for r in results:
        if r and r.get("success"):
            print(f"✅ {r['name']}: {r['duration']:.0f}s, {r['credits']} credits")
        else:
            err = r.get("error", "Failed") if r else "No result"
            print(f"❌ {r['name'] if r else 'Unknown'}: {err}")


if __name__ == "__main__":
    main()
