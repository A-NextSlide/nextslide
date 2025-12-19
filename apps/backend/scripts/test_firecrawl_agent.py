#!/usr/bin/env python3
"""
Test script to evaluate Firecrawl Agent vs Perplexity for different use cases.

Run: python scripts/test_firecrawl_agent.py

This tests various scenarios to understand when to use each tool.
"""

import os
import sys
import json
import time
import asyncio
import requests
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
PPLX_API_KEY = os.getenv("PPLX_API_KEY") or os.getenv("PERPLEXITY_API_KEY")

BASE_URL = "https://api.firecrawl.dev"


@dataclass
class TestResult:
    scenario: str
    tool: str
    success: bool
    duration_seconds: float
    credits_used: Optional[int] = None
    data_quality: str = ""  # "excellent", "good", "partial", "poor"
    notes: str = ""
    raw_response: Optional[Dict] = None


def firecrawl_agent_sync(prompt: str, urls: list = None, schema: dict = None, max_credits: int = 50) -> Dict[str, Any]:
    """
    Call Firecrawl Agent and wait for results.
    """
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json"
    }

    # Start agent task
    payload = {
        "prompt": prompt,
        "maxCredits": max_credits
    }
    if urls:
        payload["urls"] = urls
    if schema:
        payload["schema"] = schema

    print(f"  Starting agent task...")
    start_resp = requests.post(f"{BASE_URL}/v2/agent", json=payload, headers=headers, timeout=30)

    if start_resp.status_code != 200:
        return {"success": False, "error": f"Start failed: {start_resp.status_code} - {start_resp.text}"}

    result = start_resp.json()
    if not result.get("success"):
        return {"success": False, "error": result.get("error", "Unknown error")}

    job_id = result.get("id")
    print(f"  Job ID: {job_id}")

    # Poll for completion
    max_wait = 120  # 2 minutes
    poll_interval = 3
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
        print(f"  Status: {state} ({elapsed}s)")

        if state == "completed":
            return {
                "success": True,
                "data": status.get("data"),
                "creditsUsed": status.get("creditsUsed"),
                "duration": elapsed
            }
        elif state == "failed":
            return {"success": False, "error": status.get("error", "Agent failed")}

    return {"success": False, "error": "Timeout waiting for agent"}


def perplexity_search(query: str) -> Dict[str, Any]:
    """
    Call Perplexity Sonar for research.
    """
    headers = {
        "Authorization": f"Bearer {PPLX_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "sonar",
        "messages": [
            {"role": "system", "content": "You are a research assistant. Provide accurate, structured information with specific facts and data."},
            {"role": "user", "content": query}
        ],
        "max_tokens": 2000,
        "return_citations": True,
        "search_recency_filter": "month"
    }

    resp = requests.post("https://api.perplexity.ai/chat/completions", json=payload, headers=headers, timeout=60)

    if resp.status_code != 200:
        return {"success": False, "error": f"Perplexity failed: {resp.status_code}"}

    result = resp.json()
    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    citations = result.get("citations", [])

    return {
        "success": True,
        "content": content,
        "citations": citations
    }


def run_test(scenario: str, description: str, firecrawl_prompt: str, perplexity_prompt: str,
             urls: list = None, schema: dict = None) -> tuple:
    """
    Run both tools on a scenario and compare.
    """
    print(f"\n{'='*60}")
    print(f"SCENARIO: {scenario}")
    print(f"{'='*60}")
    print(f"Description: {description}\n")

    results = []

    # Test Firecrawl Agent
    if FIRECRAWL_API_KEY:
        print(f"[FIRECRAWL AGENT]")
        print(f"Prompt: {firecrawl_prompt[:100]}...")
        start = time.time()
        try:
            fc_result = firecrawl_agent_sync(firecrawl_prompt, urls=urls, schema=schema)
            duration = time.time() - start

            if fc_result.get("success"):
                data = fc_result.get("data", {})
                # Evaluate quality
                if isinstance(data, dict) and len(str(data)) > 500:
                    quality = "excellent" if len(str(data)) > 2000 else "good"
                elif isinstance(data, str) and len(data) > 200:
                    quality = "good"
                else:
                    quality = "partial"

                results.append(TestResult(
                    scenario=scenario,
                    tool="firecrawl_agent",
                    success=True,
                    duration_seconds=duration,
                    credits_used=fc_result.get("creditsUsed"),
                    data_quality=quality,
                    notes=f"Got {len(str(data))} chars of data",
                    raw_response=data
                ))
                print(f"  ✅ Success in {duration:.1f}s, {fc_result.get('creditsUsed', '?')} credits")
                print(f"  Data preview: {str(data)[:200]}...")
            else:
                results.append(TestResult(
                    scenario=scenario,
                    tool="firecrawl_agent",
                    success=False,
                    duration_seconds=duration,
                    notes=fc_result.get("error", "Unknown error")
                ))
                print(f"  ❌ Failed: {fc_result.get('error')}")
        except Exception as e:
            results.append(TestResult(
                scenario=scenario,
                tool="firecrawl_agent",
                success=False,
                duration_seconds=time.time() - start,
                notes=str(e)
            ))
            print(f"  ❌ Exception: {e}")
    else:
        print("[FIRECRAWL AGENT] Skipped - no API key")

    # Test Perplexity
    if PPLX_API_KEY:
        print(f"\n[PERPLEXITY SONAR]")
        print(f"Prompt: {perplexity_prompt[:100]}...")
        start = time.time()
        try:
            pplx_result = perplexity_search(perplexity_prompt)
            duration = time.time() - start

            if pplx_result.get("success"):
                content = pplx_result.get("content", "")
                citations = pplx_result.get("citations", [])

                if len(content) > 1000 and len(citations) >= 3:
                    quality = "excellent"
                elif len(content) > 500:
                    quality = "good"
                else:
                    quality = "partial"

                results.append(TestResult(
                    scenario=scenario,
                    tool="perplexity",
                    success=True,
                    duration_seconds=duration,
                    data_quality=quality,
                    notes=f"{len(content)} chars, {len(citations)} citations",
                    raw_response={"content": content[:500], "citations": citations[:5]}
                ))
                print(f"  ✅ Success in {duration:.1f}s")
                print(f"  Content preview: {content[:200]}...")
                print(f"  Citations: {len(citations)}")
            else:
                results.append(TestResult(
                    scenario=scenario,
                    tool="perplexity",
                    success=False,
                    duration_seconds=duration,
                    notes=pplx_result.get("error", "Unknown error")
                ))
                print(f"  ❌ Failed: {pplx_result.get('error')}")
        except Exception as e:
            results.append(TestResult(
                scenario=scenario,
                tool="perplexity",
                success=False,
                duration_seconds=time.time() - start,
                notes=str(e)
            ))
            print(f"  ❌ Exception: {e}")
    else:
        print("[PERPLEXITY] Skipped - no API key")

    return results


def main():
    print("="*60)
    print("FIRECRAWL AGENT vs PERPLEXITY - USE CASE TESTING")
    print(f"Time: {datetime.now().isoformat()}")
    print("="*60)

    all_results = []

    # ═══════════════════════════════════════════════════════════════════════════════
    # SCENARIO 1: General Educational Topic
    # ═══════════════════════════════════════════════════════════════════════════════
    results = run_test(
        scenario="General Educational Topic",
        description="Broad topic for a school presentation - should favor Perplexity",
        firecrawl_prompt="Research chemical bonding for a high school chemistry presentation. Cover ionic bonds, covalent bonds, metallic bonds, and hydrogen bonds. Include definitions, examples, and real-world applications.",
        perplexity_prompt="Research chemical bonding for a high school chemistry presentation. Cover ionic bonds, covalent bonds, metallic bonds, and hydrogen bonds. Include definitions, examples, and real-world applications."
    )
    all_results.extend(results)

    # ═══════════════════════════════════════════════════════════════════════════════
    # SCENARIO 2: Specific Course Syllabus
    # ═══════════════════════════════════════════════════════════════════════════════
    results = run_test(
        scenario="Specific Course Syllabus",
        description="Extract syllabus from a specific university course page - should favor Firecrawl",
        firecrawl_prompt="Navigate to MIT OpenCourseWare and find the 6.006 Introduction to Algorithms course. Extract the complete syllabus including: course topics, lecture schedule, assignments, and recommended textbooks.",
        perplexity_prompt="What are the topics covered in MIT 6.006 Introduction to Algorithms course? List the syllabus, lecture topics, and assignments.",
        urls=["https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/"]
    )
    all_results.extend(results)

    # ═══════════════════════════════════════════════════════════════════════════════
    # SCENARIO 3: Company Investors
    # ═══════════════════════════════════════════════════════════════════════════════
    results = run_test(
        scenario="Company Investors",
        description="Find all investors of a startup - Firecrawl for specific data extraction",
        firecrawl_prompt="Find all investors who have funded Stripe. List each investor name, the funding round they participated in, and the amount if available. Check Crunchbase, company about pages, and press releases.",
        perplexity_prompt="List all investors who have funded Stripe. Include funding rounds and amounts where available."
    )
    all_results.extend(results)

    # ═══════════════════════════════════════════════════════════════════════════════
    # SCENARIO 4: Financial Data / Earnings
    # ═══════════════════════════════════════════════════════════════════════════════
    results = run_test(
        scenario="Financial Earnings Data",
        description="Get specific financial data from earnings reports",
        firecrawl_prompt="Navigate to Morgan Stanley's investor relations page and extract their Q3 2024 earnings highlights: revenue, net income, EPS, and key metrics. Find the specific numbers from their earnings release.",
        perplexity_prompt="What were Morgan Stanley's Q3 2024 earnings? Include revenue, net income, EPS, and key financial highlights.",
        urls=["https://www.morganstanley.com/about-us-ir"]
    )
    all_results.extend(results)

    # ═══════════════════════════════════════════════════════════════════════════════
    # SCENARIO 5: Product Features from Website
    # ═══════════════════════════════════════════════════════════════════════════════
    results = run_test(
        scenario="Product Features Extraction",
        description="Extract all features from a SaaS product website - Firecrawl excels here",
        firecrawl_prompt="Navigate through Notion's website and extract ALL product features. Visit the features page, product tours, and any subpages. For each feature, get the name, description, and any screenshots or icons.",
        perplexity_prompt="What are all the features of Notion? List every feature with descriptions.",
        urls=["https://www.notion.so"]
    )
    all_results.extend(results)

    # ═══════════════════════════════════════════════════════════════════════════════
    # SCENARIO 6: Video Discovery
    # ═══════════════════════════════════════════════════════════════════════════════
    results = run_test(
        scenario="Video Discovery",
        description="Find all videos on a company website - Firecrawl should excel",
        firecrawl_prompt="Find ALL videos on Linear's website (linear.app). Navigate to product pages, resources, about pages, and any video galleries. For each video, extract: URL, title, thumbnail, and whether it's YouTube/Vimeo/other.",
        perplexity_prompt="What videos are available on Linear's website (linear.app)? List video titles and topics.",
        urls=["https://linear.app"]
    )
    all_results.extend(results)

    # ═══════════════════════════════════════════════════════════════════════════════
    # SCENARIO 7: Case Studies
    # ═══════════════════════════════════════════════════════════════════════════════
    results = run_test(
        scenario="Case Studies Extraction",
        description="Extract customer case studies from a website - Firecrawl for navigation",
        firecrawl_prompt="Navigate to Figma's customer stories page and extract ALL case studies. For each, get: company name, industry, key quote, and any metrics mentioned (like '50% faster design').",
        perplexity_prompt="What are Figma's customer success stories? List companies using Figma and their results.",
        urls=["https://www.figma.com/customers/"]
    )
    all_results.extend(results)

    # ═══════════════════════════════════════════════════════════════════════════════
    # SCENARIO 8: Competitive Pricing Comparison
    # ═══════════════════════════════════════════════════════════════════════════════
    results = run_test(
        scenario="Competitive Pricing",
        description="Compare pricing across multiple competitors - Firecrawl for multi-site",
        firecrawl_prompt="Compare pricing for Slack, Microsoft Teams, and Discord. Visit each pricing page and extract: plan names, prices, and key features per plan. Create a comparison matrix.",
        perplexity_prompt="Compare pricing for Slack vs Microsoft Teams vs Discord. What are the plan tiers and prices for each?"
    )
    all_results.extend(results)

    # ═══════════════════════════════════════════════════════════════════════════════
    # SCENARIO 9: Current Events / News
    # ═══════════════════════════════════════════════════════════════════════════════
    results = run_test(
        scenario="Current Events",
        description="Recent news and developments - Perplexity should excel",
        firecrawl_prompt="Find the latest news about OpenAI from the past week. Include announcements, product launches, and any controversies.",
        perplexity_prompt="What are the latest news and developments about OpenAI from the past week? Include recent announcements and updates."
    )
    all_results.extend(results)

    # ═══════════════════════════════════════════════════════════════════════════════
    # SCENARIO 10: Team/Leadership Extraction
    # ═══════════════════════════════════════════════════════════════════════════════
    results = run_test(
        scenario="Team/Leadership Info",
        description="Extract leadership team from company website",
        firecrawl_prompt="Navigate to Anthropic's about/team page and extract all leadership team members. For each person, get: name, title, photo URL, and bio if available.",
        perplexity_prompt="Who are the leadership team members at Anthropic? List names and titles.",
        urls=["https://www.anthropic.com/company"]
    )
    all_results.extend(results)

    # ═══════════════════════════════════════════════════════════════════════════════
    # SUMMARY
    # ═══════════════════════════════════════════════════════════════════════════════
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    # Group by scenario
    scenarios = {}
    for r in all_results:
        if r.scenario not in scenarios:
            scenarios[r.scenario] = {}
        scenarios[r.scenario][r.tool] = r

    print(f"\n{'Scenario':<30} | {'Tool':<15} | {'Success':<8} | {'Time':<8} | {'Quality':<10} | {'Credits':<8}")
    print("-"*100)

    for scenario, tools in scenarios.items():
        for tool, result in tools.items():
            print(f"{scenario[:30]:<30} | {tool:<15} | {'✅' if result.success else '❌':<8} | {result.duration_seconds:>6.1f}s | {result.data_quality:<10} | {result.credits_used or '-':<8}")

    # Recommendations
    print("\n" + "="*60)
    print("RECOMMENDATIONS")
    print("="*60)

    firecrawl_wins = []
    perplexity_wins = []

    for scenario, tools in scenarios.items():
        fc = tools.get("firecrawl_agent")
        pplx = tools.get("perplexity")

        if fc and pplx:
            fc_score = (1 if fc.success else 0) + ({"excellent": 3, "good": 2, "partial": 1, "poor": 0}.get(fc.data_quality, 0))
            pplx_score = (1 if pplx.success else 0) + ({"excellent": 3, "good": 2, "partial": 1, "poor": 0}.get(pplx.data_quality, 0))

            if fc_score > pplx_score:
                firecrawl_wins.append(scenario)
            elif pplx_score > fc_score:
                perplexity_wins.append(scenario)

    print("\n🔥 USE FIRECRAWL AGENT for:")
    for s in firecrawl_wins:
        print(f"  - {s}")

    print("\n🔍 USE PERPLEXITY for:")
    for s in perplexity_wins:
        print(f"  - {s}")

    # Save results
    output_file = "/tmp/firecrawl_test_results.json"
    with open(output_file, "w") as f:
        json.dump([{
            "scenario": r.scenario,
            "tool": r.tool,
            "success": r.success,
            "duration": r.duration_seconds,
            "credits": r.credits_used,
            "quality": r.data_quality,
            "notes": r.notes
        } for r in all_results], f, indent=2)
    print(f"\nResults saved to: {output_file}")


if __name__ == "__main__":
    main()
