#!/usr/bin/env python3
"""
Seed community decks using the public API for AI generation.

This script:
1. Calls POST /v1/decks to generate real AI presentations
2. Polls for completion
3. Adds completed decks to community_decks with status='approved'

Usage:
    cd apps/backend
    python scripts/seed_community_via_api.py
"""

import os
import sys
import time
import random
import asyncio
import httpx
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client

# Configuration
API_KEY = "ns_live_md37SyDxLTuSsMzaw0VHHptBbxCkYxLg"
API_BASE = "http://localhost:9090"  # Local backend
USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"  # abeshry@gmail.com

# Presentation topics by category
TOPICS = {
    "business": [
        "Q4 2024 Financial Results and Growth Analysis",
        "Startup Pitch Deck for Series A Funding",
        "Annual Business Review and Strategic Outlook",
        "Market Entry Strategy for International Expansion",
        "Competitive Analysis and Market Positioning",
        "Revenue Growth Playbook for SaaS Companies",
        "Business Model Canvas Workshop",
        "Investor Relations Quarterly Update",
        "Strategic Partnership Proposal Framework",
        "Cost Optimization and Efficiency Strategy",
        "Executive Summary for Board Presentation",
        "Business Development and Sales Plan",
        "Financial Forecast and Projections Model",
    ],
    "education": [
        "Introduction to Machine Learning and AI",
        "Climate Change Science and Impact",
        "History of the Internet and Web Technologies",
        "Quantum Computing Fundamentals Explained",
        "Effective Study Techniques for Students",
        "World Geography and Cultural Overview",
        "Cell Biology and Molecular Structure",
        "Creative Writing Workshop Techniques",
        "Mathematical Problem Solving Strategies",
        "Language Learning Methods and Tips",
        "The Scientific Method in Research",
        "Renaissance Art History Overview",
        "Economics Principles and Concepts",
    ],
    "marketing": [
        "Social Media Marketing Strategy 2025",
        "Content Marketing Playbook for Growth",
        "Brand Identity and Design Guidelines",
        "Email Marketing Campaigns Masterclass",
        "SEO Best Practices and Optimization",
        "Influencer Marketing Strategy Guide",
        "Customer Journey Mapping Framework",
        "Product Launch Marketing Campaign",
        "Marketing Analytics and KPI Dashboard",
        "Paid Advertising Strategy and ROI",
        "Growth Hacking Techniques for Startups",
        "Customer Retention and Loyalty Program",
        "Viral Marketing and Content Strategy",
    ],
    "creative": [
        "Design Thinking Workshop and Methods",
        "Color Theory Fundamentals for Designers",
        "Typography Essentials and Best Practices",
        "Photography Composition Rules and Tips",
        "Digital Illustration Techniques Guide",
        "UX Design Principles and Patterns",
        "Motion Graphics and Animation Basics",
        "Creative Portfolio Showcase Tips",
        "Brand Design Process Step by Step",
        "Visual Storytelling for Presentations",
        "Creative Brief Template and Process",
        "Design System Architecture Overview",
        "Minimalist Design Philosophy Guide",
    ],
    "technology": [
        "Cloud Architecture Patterns and Best Practices",
        "Cybersecurity Fundamentals and Threats",
        "API Design and Development Best Practices",
        "DevOps CI/CD Pipeline Implementation",
        "Microservices Architecture Deep Dive",
        "Database Optimization and Performance",
        "AI and Machine Learning Implementation",
        "Blockchain Technology Overview",
        "Cross-Platform Mobile App Development",
        "System Design Interview Preparation",
        "Technology Stack Comparison Guide",
        "Code Review Best Practices Guide",
        "Agile Development Methodology",
    ],
    "personal": [
        "Personal Finance and Wealth Building",
        "Time Management and Productivity Tips",
        "Public Speaking and Presentation Skills",
        "Career Development and Growth Plan",
        "Work-Life Balance Strategies",
        "Goal Setting Framework SMART Goals",
        "Professional Networking Strategies",
        "Job Interview Preparation Guide",
        "Personal Branding for Professionals",
        "Leadership Skills Development Program",
        "Mindfulness and Meditation Practice",
        "Healthy Lifestyle Habits Guide",
        "Resume Writing and Career Tips",
    ]
}

# Tag pools
TAG_POOLS = {
    "business": ["strategy", "finance", "growth", "startup", "investment", "enterprise", "leadership"],
    "education": ["learning", "science", "tutorial", "course", "students", "research", "academic"],
    "marketing": ["digital", "brand", "social media", "content", "advertising", "analytics", "campaigns"],
    "creative": ["design", "art", "visual", "UX", "UI", "branding", "portfolio"],
    "technology": ["software", "cloud", "security", "development", "data", "AI", "infrastructure"],
    "personal": ["productivity", "career", "wellness", "skills", "self-improvement", "motivation"],
}


async def create_deck(client: httpx.AsyncClient, topic: str, slides: int = 8) -> dict:
    """Create a deck via the API."""
    response = await client.post(
        f"{API_BASE}/v1/decks",
        headers={
            "X-API-Key": API_KEY,
            "Content-Type": "application/json"
        },
        json={
            "topic": topic,
            "slides": slides,
        },
        timeout=30.0
    )
    response.raise_for_status()
    return response.json()


async def poll_status(client: httpx.AsyncClient, deck_id: str, max_wait: int = 300) -> dict:
    """Poll for deck completion."""
    start = time.time()
    while time.time() - start < max_wait:
        response = await client.get(
            f"{API_BASE}/v1/decks/{deck_id}/status",
            headers={"X-API-Key": API_KEY},
            timeout=10.0
        )
        response.raise_for_status()
        status = response.json()

        if status["status"] == "completed":
            return status
        elif status["status"] == "failed":
            raise Exception(f"Deck generation failed: {status.get('error_message', 'Unknown error')}")

        await asyncio.sleep(5)

    raise Exception(f"Timeout waiting for deck {deck_id}")


def add_to_community(deck_uuid: str, title: str, description: str, category: str, tags: list) -> bool:
    """Add a completed deck to the community."""
    try:
        supabase = get_supabase_client()

        # Get the deck data
        deck_result = supabase.table('decks').select(
            'slides, data, slide_count, first_slide'
        ).eq('uuid', deck_uuid).single().execute()

        if not deck_result.data:
            print(f"    Deck {deck_uuid} not found")
            return False

        deck = deck_result.data
        slides = deck.get('slides', [])
        theme = deck.get('data', {}).get('theme') if deck.get('data') else None

        # Random stats for variety
        days_ago = random.randint(1, 30)
        approved_at = (datetime.utcnow() - timedelta(days=days_ago)).isoformat()

        community_data = {
            "deck_uuid": deck_uuid,
            "user_id": USER_ID,
            "title": title,
            "description": description,
            "category": category,
            "tags": tags,
            "status": "approved",
            "slide_count": len(slides),
            "first_slide": slides[0] if slides else None,
            "slides_snapshot": slides,
            "theme_snapshot": theme,
            "author_name": "NextSlide Team",
            "author_email": "team@nextslide.ai",
            "submitted_at": approved_at,
            "approved_at": approved_at,
            "remix_count": random.randint(0, 30),
            "view_count": random.randint(20, 300),
        }

        supabase.table('community_decks').insert(community_data).execute()
        return True

    except Exception as e:
        print(f"    Error adding to community: {e}")
        return False


async def generate_and_add(
    client: httpx.AsyncClient,
    topic: str,
    category: str,
    index: int,
    total: int
) -> bool:
    """Generate a deck and add to community."""
    tags = random.sample(TAG_POOLS.get(category, []), min(3, len(TAG_POOLS.get(category, []))))

    try:
        # Create deck
        print(f"  [{index+1:2d}/{total}] Creating: {topic[:50]}...")
        result = await create_deck(client, topic, slides=random.randint(6, 10))
        deck_id = result["deck_id"]

        # Poll for completion
        print(f"           Waiting for generation...")
        status = await poll_status(client, deck_id)

        # Add to community
        description = f"AI-generated presentation about {topic.lower()}. Perfect for {category} professionals."
        if add_to_community(deck_id, topic, description, category, tags):
            print(f"           ✓ Added to community ({status['slides_count']} slides)")
            return True
        else:
            print(f"           ✗ Failed to add to community")
            return False

    except Exception as e:
        print(f"           ✗ Error: {e}")
        return False


async def main():
    """Main function."""
    print("=" * 60)
    print("Community Deck Seeder (via API)")
    print("=" * 60)
    print(f"API Base: {API_BASE}")
    print()

    # Build list of presentations (target 80)
    presentations = []
    for category, topics in TOPICS.items():
        for topic in topics:
            presentations.append({"category": category, "topic": topic})

    random.shuffle(presentations)
    presentations = presentations[:80]  # Limit to 80

    print(f"Will create {len(presentations)} presentations")
    print("-" * 60)

    success_count = 0
    error_count = 0

    async with httpx.AsyncClient() as client:
        # Process in batches of 3 (concurrent limit)
        batch_size = 3
        for i in range(0, len(presentations), batch_size):
            batch = presentations[i:i + batch_size]

            tasks = [
                generate_and_add(
                    client,
                    p["topic"],
                    p["category"],
                    i + j,
                    len(presentations)
                )
                for j, p in enumerate(batch)
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            for r in results:
                if r is True:
                    success_count += 1
                else:
                    error_count += 1

            # Small delay between batches
            if i + batch_size < len(presentations):
                await asyncio.sleep(2)

    print("-" * 60)
    print(f"\nSummary:")
    print(f"  ✓ Successfully created: {success_count}")
    print(f"  ✗ Errors: {error_count}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
