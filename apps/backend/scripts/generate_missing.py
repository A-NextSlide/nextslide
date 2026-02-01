#!/usr/bin/env python3
"""
Generate missing presentations in small batches, with fast auto-fix.
Picks up where the main seed script left off.
"""

import os, sys, time, asyncio
sys.stdout.reconfigure(line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

import httpx
from services.supabase import get_supabase_client
from services.api_key_service import get_api_key_service

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"
API_BASE = "http://localhost:9090"

FONT = (
    "Use clean, professional fonts only — Inter, Montserrat, or similar sans-serif. "
    "No decorative or script fonts. Keep text minimal and impactful. "
    "Large bold headings, short bullet points. Lots of whitespace. "
    "Make it visually stunning with strong layout and color choices."
)

# Full list of 100 presentations (topic, slides, additional_instructions)
ALL_100 = [
    # BATCH 1 (0-19)
    ("SaaS Metrics Dashboard: The 12 Numbers Every Founder Must Track", 12, f"{FONT} Data-heavy SaaS metrics deck."),
    ("Series B Fundraising Playbook: From $10M to $50M ARR", 12, f"{FONT} Growth-stage fundraising deck."),
    ("Building a World-Class Remote Team Culture", 10, f"{FONT} Remote culture deck."),
    ("Two-Sided Marketplace Pitch: Solving the Chicken-and-Egg Problem", 10, f"{FONT} Marketplace pitch."),
    ("A Tour of Our Solar System: From Mercury to the Kuiper Belt", 10, f"{FONT} Space education deck."),
    ("Creative Writing Workshop: Crafting Stories That Stick", 10, f"{FONT} Creative writing education."),
    ("Machine Learning for Beginners: From Data to Predictions", 10, f"{FONT} ML education deck."),
    ("World War II: A Visual Timeline of the Global Conflict", 12, f"{FONT} History education."),
    ("Brand Positioning Strategy: Standing Out in a Crowded Market", 10, f"{FONT} Brand strategy deck."),
    ("Email Marketing Masterclass: Sequences That Convert at 40%", 10, f"{FONT} Email marketing deck."),
    ("Enterprise Sales Playbook: Closing Six-Figure Deals", 10, f"{FONT} Enterprise sales deck."),
    ("SaaS Product Demo: Turning Free Trials into Enterprise Contracts", 10, f"{FONT} Product demo deck."),
    ("Cryptocurrency Market Analysis: DeFi, NFTs, and Layer 2 Trends", 12, f"{FONT} Crypto analysis."),
    ("Real Estate Investment Analysis: Residential vs Commercial ROI", 12, f"{FONT} Real estate analysis."),
    ("Modern API Architecture: REST vs GraphQL vs gRPC", 10, f"{FONT} Tech architecture deck."),
    ("Cybersecurity Essentials: Protecting Your Organization in 2025", 10, f"{FONT} Cybersecurity deck."),
    ("Photography Fundamentals: Composition, Lighting, and Storytelling", 10, f"{FONT} Photography education."),
    ("Ancient Egypt: Pyramids, Pharaohs, and the Nile Civilization", 10, f"{FONT} History education."),
    ("Music Theory Crash Course: Scales, Chords, and Progressions", 10, f"{FONT} Music education."),
    ("Growth Hacking Playbook: 10 Tactics That Took Startups from 0 to 1M Users", 12, f"{FONT} Growth hacking deck."),
    # BATCH 2 (20-39)
    ("Digital Transformation Roadmap: Legacy to Cloud-Native in 18 Months", 12, f"{FONT} Digital transformation."),
    ("Market Entry Strategy: Expanding into Southeast Asia", 10, f"{FONT} Market entry strategy."),
    ("Organizational Restructuring: From Silos to Cross-Functional Teams", 10, f"{FONT} Org restructuring."),
    ("DEI Strategy Report: Building an Inclusive Workplace", 10, f"{FONT} DEI strategy."),
    ("Performance Review Framework: OKRs, 360 Feedback, and Growth Plans", 10, f"{FONT} Performance review."),
    ("Employer Branding Playbook: Attracting Top Talent in a Competitive Market", 10, f"{FONT} Employer branding."),
    ("UX Research Report: User Behavior Patterns in Mobile Banking Apps", 10, f"{FONT} UX research."),
    ("Climate Tech Investment Landscape: Where Capital Meets Carbon Reduction", 12, f"{FONT} Climate tech."),
    ("The Science of Nutrition: Macros, Micros, and Metabolic Health", 10, f"{FONT} Nutrition science."),
    ("Mental Health Awareness: Understanding Anxiety, Depression, and Resilience", 10, f"{FONT} Mental health."),
    ("Annual Impact Report: How Your Donations Changed 10,000 Lives", 10, f"{FONT} Impact report."),
    ("Grant Proposal Presentation: Securing Funding for Community Education", 10, f"{FONT} Grant proposal."),
    ("The Future of Space Exploration: Mars Colonies to Interstellar Travel", 12, f"{FONT} Space exploration."),
    ("The Evolution of Video Games: From Pong to Virtual Reality", 10, f"{FONT} Gaming history."),
    ("The Science of Sleep: Why Your Brain Needs 8 Hours", 10, f"{FONT} Sleep science."),
    ("Street Food Around the World: A Culinary Journey Across 6 Continents", 10, f"{FONT} Food culture."),
    ("Scaling an Ecommerce Brand from $0 to $1M in 12 Months", 10, f"{FONT} Ecommerce growth."),
    ("Direct-to-Consumer Brand Strategy: Building Loyalty Without Retailers", 10, f"{FONT} DTC strategy."),
    ("Intellectual Property Strategy for Startups: Patents, Trademarks, and Trade Secrets", 10, f"{FONT} IP strategy."),
    ("GDPR & Data Privacy Compliance: A Practical Guide for Product Teams", 10, f"{FONT} Privacy compliance."),
    # BATCH 3 (40-59)
    ("Sports Analytics: How Data Science is Changing Professional Basketball", 10, f"{FONT} Sports analytics."),
    ("Evidence-Based Strength Training: Programming for Maximum Results", 10, f"{FONT} Fitness science."),
    ("Disrupting Travel: AI-Powered Personalized Trip Planning", 10, f"{FONT} Travel tech."),
    ("Hotel Revenue Management: Dynamic Pricing Strategies for Maximum Occupancy", 10, f"{FONT} Hotel revenue."),
    ("ESG Report: Our Journey Toward Net Zero by 2035", 10, f"{FONT} ESG report."),
    ("The Circular Economy: Rethinking Waste in the 21st Century", 10, f"{FONT} Circular economy."),
    ("Product Strategy Framework: From Vision to Roadmap to Execution", 10, f"{FONT} Product strategy."),
    ("Go-to-Market Launch Plan: Coordinating Product, Sales, and Marketing", 10, f"{FONT} GTM plan."),
    ("Modern Data Stack: Building a Data Warehouse That Scales", 10, f"{FONT} Data stack."),
    ("Fine-Tuning LLMs for Production: A Practical Engineering Guide", 10, f"{FONT} LLM engineering."),
    ("The Art of Public Speaking: From Nervous to Confident in 10 Steps", 10, f"{FONT} Public speaking."),
    ("Time Management for Knowledge Workers: Beyond To-Do Lists", 10, f"{FONT} Time management."),
    ("Sustainable Architecture: Designing Buildings That Heal the Planet", 10, f"{FONT} Sustainable arch."),
    ("UI Design Trends 2025: Glassmorphism, 3D, and Spatial Computing", 10, f"{FONT} UI design."),
    ("Understanding Inflation: Why Prices Rise and What It Means for You", 10, f"{FONT} Economics education."),
    ("Supply Chain Resilience: Lessons from Global Disruptions", 10, f"{FONT} Supply chain."),
    ("Quantum Computing Explained: Qubits, Superposition, and Real-World Applications", 10, f"{FONT} Quantum computing."),
    ("Genetics and DNA: The Blueprint of Life", 10, f"{FONT} Genetics education."),
    ("The Streaming Wars: Who Wins When Everyone Has a Platform", 10, f"{FONT} Streaming industry."),
    ("Building a Podcast Empire: Content Strategy to Monetization", 10, f"{FONT} Podcast strategy."),
    # BATCH 4 (60-79)
    ("Restaurant Business Plan: From Concept to Grand Opening", 10, f"{FONT} Restaurant plan."),
    ("AI in Healthcare: Diagnosis, Treatment, and the Future of Medicine", 12, f"{FONT} Healthcare AI."),
    ("Fintech Disruption: Neobanks, BNPL, and Embedded Finance", 10, f"{FONT} Fintech overview."),
    ("Venture Capital Fund Overview: $100M Fund III Performance Report", 12, f"{FONT} VC fund report."),
    ("Climate Change for Kids: What's Happening to Our Planet and How We Can Help", 10, f"{FONT} Kids education."),
    ("Introduction to Psychology: How the Mind Works", 10, f"{FONT} Psychology intro."),
    ("Personal Finance 101: Budgeting, Investing, and Building Wealth", 10, f"{FONT} Personal finance."),
    ("Ethics in the Age of AI: Philosophical Frameworks for Modern Dilemmas", 10, f"{FONT} AI ethics."),
    ("Influencer Marketing Strategy: Micro vs Macro vs Nano Creators", 10, f"{FONT} Influencer marketing."),
    ("SEO Strategy for 2025: Technical, Content, and Authority Building", 10, f"{FONT} SEO strategy."),
    ("Customer Success Playbook: Reducing Churn from 8% to 2%", 10, f"{FONT} Customer success."),
    ("Channel Partner Program: Scaling Revenue Through Strategic Alliances", 10, f"{FONT} Channel partners."),
    ("Deep Ocean Exploration: What Lives in the Abyss", 10, f"{FONT} Ocean science."),
    ("Renewable Energy Comparison: Solar vs Wind vs Nuclear vs Hydro", 10, f"{FONT} Energy comparison."),
    ("The Age of Dinosaurs: 165 Million Years of Prehistoric Life", 10, f"{FONT} Dinosaur education."),
    ("The History of Anime: From Astro Boy to Demon Slayer", 10, f"{FONT} Anime history."),
    ("The $500 Billion Coffee Industry: From Bean to Cup Economics", 10, f"{FONT} Coffee industry."),
    ("The Economics of Hollywood: What Makes a Blockbuster Profitable", 10, f"{FONT} Movie economics."),
    ("The Renaissance of Board Games: Why Analog Gaming is Booming", 10, f"{FONT} Board games."),
    ("The Science of Language Learning: Why Immersion Beats Textbooks", 10, f"{FONT} Language learning."),
    # BATCH 5 (80-99)
    ("Mergers & Acquisitions: Due Diligence Framework for Tech Companies", 12, f"{FONT} M&A framework."),
    ("Board Meeting Deck: Q4 Performance, Strategy Update, and 2025 Planning", 12, f"{FONT} Board meeting."),
    ("Pricing Strategy Deep Dive: Value-Based Pricing for SaaS Products", 10, f"{FONT} Pricing strategy."),
    ("Customer Journey Mapping: Every Touchpoint from Awareness to Advocacy", 10, f"{FONT} Journey mapping."),
    ("Statistics for Everyone: Mean, Median, Mode, and Why They Matter", 10, f"{FONT} Statistics education."),
    ("The U.S. Constitution: Branches of Government and the Bill of Rights", 10, f"{FONT} Civics education."),
    ("The Periodic Table: Understanding Elements and Chemical Bonds", 10, f"{FONT} Chemistry education."),
    ("World Geography: Continents, Climates, and Cultures", 10, f"{FONT} Geography education."),
    ("DevOps Best Practices: CI/CD Pipelines That Ship with Confidence", 10, f"{FONT} DevOps practices."),
    ("Web3 and Blockchain: Beyond Crypto — Real-World Enterprise Applications", 10, f"{FONT} Web3 enterprise."),
    ("The Psychology of Persuasion: 6 Principles That Change Minds", 10, f"{FONT} Persuasion psychology."),
    ("The Electric Vehicle Revolution: Market Trends, Technology, and the Road Ahead", 12, f"{FONT} EV revolution."),
    ("The Science of Cooking: Chemistry Behind Every Delicious Meal", 10, f"{FONT} Food science."),
    ("Architectural Movements Through History: Gothic to Deconstructivism", 10, f"{FONT} Architecture history."),
    ("Why Startups Fail: Data-Driven Analysis of 1,000 Post-Mortems", 10, f"{FONT} Startup failure."),
    ("The Future of Work: Remote, Hybrid, AI, and the Skills That Matter", 10, f"{FONT} Future of work."),
    ("UX Case Study: Redesigning a Banking App for 5 Million Users", 10, f"{FONT} UX case study."),
    ("World Religions Compared: Beliefs, Practices, and Global Impact", 10, f"{FONT} World religions."),
    ("The Venture Studio Model: Building Companies in Parallel", 10, f"{FONT} Venture studios."),
    ("The Art of Data Visualization: Telling Stories with Charts", 10, f"{FONT} Data visualization."),
]


def fix_stuck_deck(deck_id: str) -> bool:
    sb = get_supabase_client()
    try:
        result = sb.table("decks").select("uuid, status, slide_count, slides").eq("uuid", deck_id).single().execute()
        if not result.data:
            return False
        d = result.data
        status = d.get("status", {})
        state = status.get("state", "") if isinstance(status, dict) else ""
        slides = d.get("slides") or []
        expected = d.get("slide_count") or 0
        if state == "generating" and len(slides) >= expected and len(slides) > 0:
            sb.table("decks").update({"status": {"state": "completed", "progress": 100}}).eq("uuid", deck_id).execute()
            return True
        return state == "completed"
    except Exception:
        return False


async def create_and_wait(client, api_key, topic, slides, instructions, idx):
    """Create deck and wait for completion with fast auto-fix."""
    label = topic[:55]
    try:
        resp = await client.post(
            f"{API_BASE}/v1/decks",
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            json={"topic": topic, "slides": slides, "additional_instructions": instructions},
            timeout=120.0,
        )
        resp.raise_for_status()
        deck_id = resp.json()["deck_id"]
        print(f"  [{idx+1:3d}/100] Queued: {deck_id[:8]}... {label}")
    except Exception as e:
        print(f"  [{idx+1:3d}/100] POST FAILED: {label} — {e}")
        return None

    # Poll with fast auto-fix (60s instead of 5min)
    start = time.time()
    while time.time() - start < 600:
        try:
            r = await client.get(
                f"{API_BASE}/v1/decks/{deck_id}/status",
                headers={"X-API-Key": api_key},
                timeout=10.0,
            )
            r.raise_for_status()
            status = r.json()
            if status["status"] == "completed":
                print(f"  [{idx+1:3d}/100] Done:   {deck_id[:8]}... {label}")
                return deck_id
            if status["status"] == "failed":
                print(f"  [{idx+1:3d}/100] FAILED: {label}")
                return None
        except Exception:
            pass

        # Fast auto-fix after 60s
        if time.time() - start > 60:
            if fix_stuck_deck(deck_id):
                print(f"  [{idx+1:3d}/100] Fixed:  {deck_id[:8]}... {label}")
                return deck_id

        await asyncio.sleep(5)

    # Last resort
    if fix_stuck_deck(deck_id):
        print(f"  [{idx+1:3d}/100] Fixed:  {deck_id[:8]}... {label}")
        return deck_id

    print(f"  [{idx+1:3d}/100] TIMEOUT: {label}")
    return None


def find_existing_matches():
    """Find which topics already have decks generated."""
    sb = get_supabase_client()
    decks = sb.table("decks").select("uuid, name").is_("user_id", "null").execute()

    existing_first_words = {}
    for d in decks.data:
        name = d.get("name", "")
        if name:
            # Key by first 3 significant words
            words = [w for w in name.lower().split() if len(w) > 2][:4]
            key = " ".join(words)
            existing_first_words[key] = d["uuid"]

    matched = {}
    for i, (topic, _, _) in enumerate(ALL_100):
        words = [w for w in topic.lower().split() if len(w) > 2][:4]
        key = " ".join(words)

        # Try exact key match
        if key in existing_first_words:
            matched[i] = existing_first_words[key]
            continue

        # Try partial match (first 3 words in any existing name)
        topic_words_3 = " ".join(words[:3])
        for ek, euuid in existing_first_words.items():
            if topic_words_3 in ek or ek[:len(topic_words_3)] == topic_words_3:
                matched[i] = euuid
                break

    return matched


async def main():
    print("=" * 65)
    print("  Generate Missing Presentations")
    print("=" * 65)

    # Find what exists
    matched = find_existing_matches()
    missing_indices = [i for i in range(100) if i not in matched]
    print(f"\nAlready matched: {len(matched)}/100")
    print(f"Missing: {len(missing_indices)}")

    if not missing_indices:
        print("All 100 topics covered!")
        return matched

    # Create API key
    service = get_api_key_service()
    api_key, record = await service.create_api_key(
        user_id=USER_ID,
        name="Missing Deck Generator",
        context_instructions="Generate visually striking presentations with clean, modern design.",
        include_edit_link=True,
    )
    print(f"\nAPI Key: {record.key_prefix}")

    # Generate missing in batches of 10
    BATCH_SIZE = 10
    all_deck_ids = dict(matched)  # Start with existing

    for batch_start in range(0, len(missing_indices), BATCH_SIZE):
        batch = missing_indices[batch_start:batch_start + BATCH_SIZE]
        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (len(missing_indices) + BATCH_SIZE - 1) // BATCH_SIZE

        print(f"\n--- Batch {batch_num}/{total_batches}: indices {batch} ---")

        async with httpx.AsyncClient() as client:
            tasks = []
            for idx in batch:
                topic, slides, instructions = ALL_100[idx]
                tasks.append(create_and_wait(client, api_key, topic, slides, instructions, idx))

            results = await asyncio.gather(*tasks, return_exceptions=True)

            for idx, result in zip(batch, results):
                if isinstance(result, str) and result:
                    all_deck_ids[idx] = result
                elif isinstance(result, Exception):
                    print(f"  Exception for index {idx}: {result}")

        # Brief pause between batches
        if batch_start + BATCH_SIZE < len(missing_indices):
            await asyncio.sleep(5)

    print(f"\n{'=' * 65}")
    print(f"  GENERATION COMPLETE: {len(all_deck_ids)}/100 decks")
    print(f"{'=' * 65}")

    return all_deck_ids


if __name__ == "__main__":
    result = asyncio.run(main())

    # Save mapping for featured_decks population
    if result:
        import json
        with open("/tmp/deck_mapping.json", "w") as f:
            json.dump({str(k): v for k, v in result.items()}, f)
        print(f"\nDeck mapping saved to /tmp/deck_mapping.json ({len(result)} entries)")
