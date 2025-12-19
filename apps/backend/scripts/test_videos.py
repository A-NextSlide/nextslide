#!/usr/bin/env python3
"""
Test video discovery strategies.
"""

import os
import sys
import json
import time
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
BASE_URL = "https://api.firecrawl.dev"


def test_agent(name: str, prompt: str, urls: list = None, max_credits: int = 100):
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {"prompt": prompt, "maxCredits": max_credits}
    if urls:
        payload["urls"] = urls

    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print(f"Max credits: {max_credits}")

    start = time.time()
    resp = requests.post(f"{BASE_URL}/v2/agent", json=payload, headers=headers, timeout=30)

    if resp.status_code != 200:
        print(f"❌ Start failed")
        return None

    result = resp.json()
    job_id = result.get("id")
    print(f"Job: {job_id}")

    max_wait = 180
    elapsed = 0

    while elapsed < max_wait:
        time.sleep(5)
        elapsed += 5

        status_resp = requests.get(f"{BASE_URL}/v2/agent/{job_id}", headers=headers, timeout=30)
        status = status_resp.json()
        state = status.get("status")
        credits = status.get("creditsUsed", 0)
        print(f"  [{elapsed}s] {state} | {credits} credits")

        if state == "completed":
            data = status.get("data")
            print(f"\n✅ SUCCESS: {credits} credits, {time.time()-start:.0f}s")
            print(f"Data: {json.dumps(data, indent=2)[:1500]}")
            return {"success": True, "credits": credits, "data": data}

        elif state == "failed":
            print(f"\n❌ FAILED: {status.get('error')}")
            return None

    return None


def test_scrape_for_videos(url: str):
    """Use regular scrape to find videos (cheaper)."""
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json"
    }

    print(f"\n{'='*60}")
    print(f"SCRAPE (not agent): {url}")

    # Scrape with all formats
    payload = {
        "url": url,
        "formats": ["markdown", "html", "links"]
    }

    start = time.time()
    resp = requests.post(f"{BASE_URL}/v1/scrape", json=payload, headers=headers, timeout=60)

    if resp.status_code != 200:
        print(f"❌ Failed: {resp.status_code}")
        return None

    result = resp.json()
    data = result.get("data", {})

    # Look for video URLs in the content
    html = data.get("html", "") or ""
    markdown = data.get("markdown", "") or ""
    links = data.get("links", []) or []

    # Find video patterns
    import re
    video_patterns = [
        r'youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})',
        r'youtu\.be/([a-zA-Z0-9_-]{11})',
        r'youtube\.com/embed/([a-zA-Z0-9_-]{11})',
        r'vimeo\.com/(\d+)',
        r'player\.vimeo\.com/video/(\d+)',
        r'wistia\.(?:com|net)/(?:medias|embed)/([a-zA-Z0-9]+)',
        r'loom\.com/(?:share|embed)/([a-zA-Z0-9]+)',
    ]

    found_videos = set()
    content = html + " " + markdown

    for pattern in video_patterns:
        matches = re.findall(pattern, content)
        for m in matches:
            found_videos.add(m)

    # Also check links
    video_links = [l for l in links if any(v in l.lower() for v in ['youtube', 'vimeo', 'wistia', 'loom', 'video', '.mp4'])]

    print(f"✅ Scrape completed in {time.time()-start:.1f}s")
    print(f"Found {len(found_videos)} video IDs, {len(video_links)} video links")
    print(f"Video IDs: {list(found_videos)[:5]}")
    print(f"Video links: {video_links[:5]}")

    return {
        "video_ids": list(found_videos),
        "video_links": video_links
    }


def main():
    print("VIDEO DISCOVERY STRATEGIES")
    print("="*60)

    # Strategy 1: Agent with specific single page
    test_agent(
        name="Agent: Single page (Linear homepage)",
        prompt="Look for any YouTube, Vimeo, or Loom video embeds on this page. Return video URLs.",
        urls=["https://linear.app"],
        max_credits=50
    )

    # Strategy 2: Regular scrape (cheaper)
    test_scrape_for_videos("https://linear.app")
    test_scrape_for_videos("https://figma.com")

    # Strategy 3: Agent for YouTube channel (search capability)
    test_agent(
        name="Agent: Find YouTube channel",
        prompt="Find the official YouTube channel for Linear and list 3 recent video titles and URLs.",
        max_credits=80
    )


if __name__ == "__main__":
    main()
