#!/usr/bin/env python3
"""
Seed community decks by calling generation functions directly.

This bypasses the API HTTP layer and Cloudflare protection by calling
the generation pipeline functions directly.

Usage:
    cd apps/backend
    python scripts/seed_community_direct.py
"""

import os
import sys
import uuid
import random
import asyncio
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client
from utils.supabase import upload_deck, get_deck

# Configuration
USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"  # abeshry@gmail.com

# Presentation topics by category (fewer for faster seeding)
TOPICS = {
    "business": [
        "Q4 Financial Results and Growth Analysis",
        "Startup Pitch Deck for Series A Funding",
        "Annual Business Review and Strategic Outlook",
        "Market Entry Strategy for International Expansion",
        "Competitive Analysis and Market Positioning",
        "Business Model Canvas Workshop",
        "Investor Relations Quarterly Update",
        "Cost Optimization and Efficiency Strategy",
        "Business Development and Sales Strategy",
        "Financial Forecasting and Planning",
        "Executive Leadership Summit",
        "Merger and Acquisition Strategy",
        "Corporate Governance Best Practices",
    ],
    "education": [
        "Introduction to Machine Learning Fundamentals",
        "Climate Change Science and Impact",
        "History of the Internet and Web Technologies",
        "Quantum Computing Explained Simply",
        "Effective Study Techniques for Students",
        "Biology: Cell Structure and Function",
        "Creative Writing Workshop Techniques",
        "Mathematical Problem Solving Strategies",
        "The Scientific Method in Research",
        "Art History: Renaissance Masters",
        "Economics Principles and Markets",
        "Psychology 101: Understanding Behavior",
        "World Geography and Cultures",
    ],
    "marketing": [
        "Social Media Marketing Strategy 2025",
        "Content Marketing Playbook for Growth",
        "Brand Identity and Design Guidelines",
        "Email Marketing Campaign Strategies",
        "SEO Best Practices and Optimization",
        "Influencer Marketing Strategy Guide",
        "Customer Journey Mapping Framework",
        "Product Launch Marketing Campaign",
        "Marketing Analytics and KPIs",
        "Growth Hacking for Startups",
        "Customer Retention Strategies",
        "Viral Marketing Techniques",
        "Digital Advertising Mastery",
    ],
    "creative": [
        "Design Thinking Workshop Methods",
        "Color Theory for Designers",
        "Typography Essentials Guide",
        "Photography Composition Tips",
        "Digital Illustration Techniques",
        "UX Design Principles and Patterns",
        "Motion Graphics Fundamentals",
        "Creative Portfolio Showcase",
        "Brand Design Process Guide",
        "Visual Storytelling Techniques",
        "Design System Architecture",
        "Minimalist Design Philosophy",
        "Creative Brief Template",
    ],
    "technology": [
        "Cloud Architecture Best Practices",
        "Cybersecurity Fundamentals",
        "API Design and Development",
        "DevOps CI/CD Pipeline Guide",
        "Microservices Architecture Deep Dive",
        "Database Performance Optimization",
        "AI and Machine Learning Implementation",
        "Blockchain Technology Overview",
        "Mobile App Development Guide",
        "System Design Interview Prep",
        "Technology Stack Comparison",
        "Code Review Best Practices",
        "Agile Development Methodology",
    ],
    "personal": [
        "Personal Finance and Wealth Building",
        "Time Management and Productivity",
        "Public Speaking Skills Workshop",
        "Career Development Growth Plan",
        "Work-Life Balance Strategies",
        "Goal Setting with SMART Goals",
        "Professional Networking Guide",
        "Job Interview Preparation",
        "Personal Branding for Success",
        "Leadership Skills Development",
        "Mindfulness and Meditation",
        "Healthy Lifestyle Habits",
        "Resume Writing Mastery",
    ]
}

TAG_POOLS = {
    "business": ["strategy", "finance", "growth", "startup", "investment", "enterprise", "leadership"],
    "education": ["learning", "science", "tutorial", "course", "students", "research", "academic"],
    "marketing": ["digital", "brand", "social media", "content", "advertising", "analytics", "campaigns"],
    "creative": ["design", "art", "visual", "UX", "UI", "branding", "portfolio"],
    "technology": ["software", "cloud", "security", "development", "data", "AI", "infrastructure"],
    "personal": ["productivity", "career", "wellness", "skills", "self-improvement", "motivation"],
}


async def generate_deck_direct(topic: str, num_slides: int = 8) -> tuple:
    """Generate a deck using the internal generation pipeline."""
    from services.outline import OutlineGenerator, OutlineOptions
    from models.registry import get_global_registry
    from models.requests import DeckOutline, SlideOutline
    from api.requests.deck_create import build_initial_deck_payload
    from agents.generation.deck_composer import compose_deck_stream
    from agents.config import MAX_PARALLEL_SLIDES, DELAY_BETWEEN_SLIDES

    deck_uuid = str(uuid.uuid4())

    try:
        # Generate outline
        registry = get_global_registry()
        generator = OutlineGenerator(registry)

        options = OutlineOptions(
            prompt=topic,
            slide_count=num_slides,
            async_images=False,
        )

        outline_result = await generator.generate(options)

        if not outline_result or not outline_result.slides:
            raise Exception("Failed to generate outline")

        # Convert to DeckOutline
        deck_outline = DeckOutline(
            id=deck_uuid,
            title=outline_result.title or topic[:100],
            slides=[
                SlideOutline(
                    id=str(uuid.uuid4()),
                    title=slide.title,
                    content=slide.content or ""
                )
                for slide in outline_result.slides
            ]
        )

        # Build initial deck
        deck_data = build_initial_deck_payload(deck_outline, deck_uuid)
        deck_data["data"] = deck_data.get("data", {})
        deck_data["data"]["source"] = "community_seed"

        # Upload initial deck
        upload_deck(deck_data, deck_uuid, USER_ID)

        # Run composition
        slides_generated = 0
        async for update in compose_deck_stream(
            deck_outline, registry, deck_uuid,
            max_parallel=MAX_PARALLEL_SLIDES,
            delay_between_slides=DELAY_BETWEEN_SLIDES,
            async_images=False,
            user_id=USER_ID
        ):
            utype = update.get('type', '')
            if utype == 'slide_generated':
                slides_generated += 1
            elif utype in ('deck_complete', 'composition_complete', 'complete'):
                break

        # Mark as completed
        supabase = get_supabase_client()
        supabase.table("decks").update({
            "status": {"state": "completed"}
        }).eq("uuid", deck_uuid).execute()

        return deck_uuid, slides_generated

    except Exception as e:
        raise Exception(f"Generation failed: {e}")


def add_to_community(deck_uuid: str, title: str, category: str, tags: list) -> bool:
    """Add a completed deck to community_decks."""
    try:
        supabase = get_supabase_client()

        # Get deck data
        deck_result = supabase.table('decks').select(
            'slides, data, slide_count, first_slide'
        ).eq('uuid', deck_uuid).single().execute()

        if not deck_result.data:
            return False

        deck = deck_result.data
        slides = deck.get('slides', [])
        theme = deck.get('data', {}).get('theme') if deck.get('data') else None

        # Random timestamps
        days_ago = random.randint(1, 30)
        approved_at = (datetime.utcnow() - timedelta(days=days_ago)).isoformat()

        description = f"AI-generated presentation covering {title.lower()}. Perfect for {category} professionals and enthusiasts."

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
            "remix_count": random.randint(5, 50),
            "view_count": random.randint(50, 500),
        }

        supabase.table('community_decks').insert(community_data).execute()
        return True

    except Exception as e:
        print(f"      Error: {e}")
        return False


async def process_topic(topic: str, category: str, index: int, total: int) -> bool:
    """Process a single topic."""
    tags = random.sample(TAG_POOLS.get(category, []), min(3, len(TAG_POOLS.get(category, []))))
    num_slides = random.randint(6, 10)

    try:
        print(f"  [{index+1:2d}/{total}] {topic[:45]}...")
        print(f"           Generating {num_slides} slides...", end="", flush=True)

        deck_uuid, slides_count = await generate_deck_direct(topic, num_slides)
        print(f" done ({slides_count} slides)")

        print(f"           Adding to community...", end="", flush=True)
        if add_to_community(deck_uuid, topic, category, tags):
            print(" ✓")
            return True
        else:
            print(" ✗")
            return False

    except Exception as e:
        print(f"\n           ✗ Error: {e}")
        return False


async def main():
    """Main function."""
    print("=" * 70)
    print("Community Deck Seeder (Direct Generation - PARALLEL)")
    print("=" * 70)

    # Build presentation list
    presentations = []
    for category, topics in TOPICS.items():
        for topic in topics:
            presentations.append({"category": category, "topic": topic})

    random.shuffle(presentations)
    presentations = presentations[:80]  # Limit to 80

    print(f"Will create {len(presentations)} presentations")
    print("-" * 70)

    # Track results
    success_count = 0
    error_count = 0
    results_lock = asyncio.Lock()

    async def process_with_tracking(topic, category, index, total):
        nonlocal success_count, error_count
        result = await process_topic(topic, category, index, total)
        async with results_lock:
            if result:
                success_count += 1
            else:
                error_count += 1
        return result

    # Run in parallel batches of 5
    BATCH_SIZE = 5
    total = len(presentations)

    for batch_start in range(0, total, BATCH_SIZE):
        batch = presentations[batch_start:batch_start + BATCH_SIZE]
        tasks = [
            process_with_tracking(
                p["topic"],
                p["category"],
                batch_start + i,
                total
            )
            for i, p in enumerate(batch)
        ]

        # Run batch in parallel
        await asyncio.gather(*tasks, return_exceptions=True)

        # Small delay between batches
        if batch_start + BATCH_SIZE < total:
            print(f"\n  --- Batch complete ({batch_start + len(batch)}/{total}) ---\n")
            await asyncio.sleep(2)

    print("-" * 70)
    print(f"\nSummary:")
    print(f"  ✓ Success: {success_count}")
    print(f"  ✗ Errors: {error_count}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
