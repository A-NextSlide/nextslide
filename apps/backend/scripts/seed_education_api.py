#!/usr/bin/env python3
"""
Seed community with educational lessons via the PUBLIC API.
Uses localhost:9090/v1/decks - the same API as docs.

- Kids (K-5): Playful, colorful, fun
- Middle School (6-8): Engaging foundations
- High School (9-12): Academic, AP prep
- College/Adult: In-depth, professional

20 parallel requests, 60 lessons total.
"""

import os
import sys
import random
import asyncio
import httpx
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client

# Configuration
API_KEY = "ns_live_J4jcuVdm-HE0zyEFLSm-A4pC6mBJFKZR"
API_BASE = "http://localhost:9090"  # Local backend (production API has Cloudflare protection)
USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"

# Educational lessons - specific classes for each age group
LESSONS = {
    "kids": [
        {"topic": "The Solar System for Kids - A Fun Space Adventure! Learn about all 8 planets with colorful pictures and fun facts. Mercury is super hot, Jupiter is HUGE, Saturn has pretty rings! Perfect for young explorers ages 5-10. Make it playful, colorful, and exciting!", "title": "Solar System Adventure", "age": "Ages 5-10"},
        {"topic": "Dinosaur Discovery for Kids! Meet T-Rex, Triceratops, Velociraptor and more prehistoric friends. Fun facts about what they ate, how big they were, and why they disappeared. Colorful, playful presentation for children.", "title": "Dinosaur Friends", "age": "Ages 5-10"},
        {"topic": "The Water Cycle - Where Does Rain Come From? A fun, simple explanation of evaporation, clouds, and precipitation for young learners. With colorful illustrations and easy words!", "title": "Where Rain Comes From", "age": "Ages 6-10"},
        {"topic": "Learning to Count and Add - Math Fun for Kids! Adding numbers with pictures of animals, fruits, and toys. 2+2=4, 5+3=8. Colorful, playful math for beginners.", "title": "Counting & Adding Fun", "age": "Ages 5-8"},
        {"topic": "My Amazing Body - A Kid's Guide! Learn about your heart that pumps, lungs that breathe, and brain that thinks! Fun body facts for curious kids with colorful pictures.", "title": "My Amazing Body", "age": "Ages 6-10"},
        {"topic": "Animal Homes Around the World! Where do polar bears live? What about monkeys? Lions? Fish? Explore jungles, oceans, deserts and more! Fun and colorful for kids.", "title": "Where Animals Live", "age": "Ages 5-9"},
        {"topic": "From Caterpillar to Butterfly - A Magical Journey! Watch the amazing transformation with beautiful pictures. Egg, caterpillar, chrysalis, butterfly! Nature magic for kids.", "title": "Butterfly Magic", "age": "Ages 5-8"},
        {"topic": "Weather Fun - Sun, Rain, Snow and Wind! Why is the sky blue? What makes thunder? Learn about weather with fun pictures and simple explanations for kids!", "title": "Weather Wonders", "age": "Ages 5-9"},
        {"topic": "Learning to Tell Time - Clock Reading for Kids! Big hand, little hand, what do they mean? Hours and minutes made easy with colorful clock faces!", "title": "Clock Time Fun", "age": "Ages 6-8"},
        {"topic": "Colors, Shapes and Patterns - Art Fun for Little Learners! Red, blue, yellow! Circles, squares, triangles! Making patterns and having fun with shapes!", "title": "Shapes & Colors", "age": "Ages 4-6"},
    ],

    "middle_school": [
        {"topic": "Introduction to Algebra - Understanding Variables and Equations. What is x? How do we solve 2x + 5 = 15? Clear step-by-step explanations with practice problems for grades 6-8.", "title": "Algebra Basics", "age": "Grades 6-8"},
        {"topic": "The American Revolution - From Colonies to Independence. Boston Tea Party, Declaration of Independence, George Washington. Key events and figures for middle school history.", "title": "American Revolution", "age": "Grades 6-8"},
        {"topic": "Cell Biology Basics - The Building Blocks of Life. Plant vs animal cells, nucleus, mitochondria, cell membrane. Middle school science with clear diagrams.", "title": "Cells: Building Blocks of Life", "age": "Grades 6-8"},
        {"topic": "Introduction to the Periodic Table - Elements and Atoms. What are elements? How is the table organized? Hydrogen, oxygen, carbon explained for middle schoolers.", "title": "The Periodic Table", "age": "Grades 6-8"},
        {"topic": "Plate Tectonics - Why Continents Move! How earthquakes and volcanoes happen. Continental drift, tectonic plates, the Ring of Fire. Earth science for grades 6-8.", "title": "Moving Continents", "age": "Grades 6-8"},
        {"topic": "Fractions Made Easy - Adding, Subtracting, Multiplying. Common denominators, simplifying, mixed numbers. Clear examples and practice for middle school math.", "title": "Mastering Fractions", "age": "Grades 6-7"},
        {"topic": "The Civil War - Causes, Battles, and Aftermath. Lincoln, slavery, Gettysburg, Reconstruction. Comprehensive middle school American history.", "title": "The Civil War", "age": "Grades 7-8"},
        {"topic": "Writing Better Sentences - Grammar and Punctuation. Subject-verb agreement, commas, avoiding run-ons. Improve your writing for middle school English.", "title": "Grammar Power", "age": "Grades 6-8"},
        {"topic": "The Scientific Method - How Scientists Think. Hypothesis, experiment, data, conclusion. Learn to think like a scientist with real examples.", "title": "Think Like a Scientist", "age": "Grades 6-8"},
        {"topic": "Geometry Foundations - Angles, Triangles, and Area. Measuring angles, types of triangles, calculating area and perimeter. Visual math for middle school.", "title": "Geometry Basics", "age": "Grades 6-8"},
    ],

    "high_school": [
        {"topic": "AP Biology: Cellular Respiration - ATP, Glycolysis, Krebs Cycle, Electron Transport Chain. Detailed breakdown for AP exam preparation with diagrams and mnemonics.", "title": "AP Bio: Cellular Respiration", "age": "Grades 10-12"},
        {"topic": "AP US History: World War II - Causes, D-Day, Pacific Theater, Holocaust, Atomic Bombs, Aftermath. Comprehensive APUSH review for exam prep.", "title": "APUSH: World War II", "age": "Grades 10-12"},
        {"topic": "Calculus: Understanding Derivatives - Limits, derivative rules, power rule, chain rule. Step-by-step with worked examples for high school calculus.", "title": "Calculus Derivatives", "age": "Grades 11-12"},
        {"topic": "AP Chemistry: Chemical Bonding - Ionic vs covalent, Lewis structures, VSEPR theory, molecular geometry, polarity. AP exam focused content.", "title": "AP Chem: Chemical Bonds", "age": "Grades 10-12"},
        {"topic": "Shakespeare's Macbeth - Themes, Characters, Literary Analysis. Ambition, guilt, fate vs free will. AP Literature level analysis with quotes.", "title": "Macbeth Deep Dive", "age": "Grades 9-12"},
        {"topic": "Physics: Newton's Laws of Motion - F=ma, action-reaction, inertia. Free body diagrams, friction, problem solving strategies.", "title": "Newton's Laws", "age": "Grades 9-11"},
        {"topic": "AP European History: The French Revolution - Causes, Reign of Terror, Napoleon's rise. Key figures, events, and consequences for AP Euro.", "title": "AP Euro: French Revolution", "age": "Grades 10-12"},
        {"topic": "Trigonometry: Unit Circle and Trig Functions - Sin, cos, tan, their graphs, identities. Building foundation for calculus.", "title": "Trig & Unit Circle", "age": "Grades 10-11"},
        {"topic": "AP Psychology: Memory - Encoding, storage, retrieval, types of memory, forgetting. AP Psych exam prep with key studies.", "title": "AP Psych: Memory", "age": "Grades 11-12"},
        {"topic": "SAT Math Strategies - Problem types, time management, key formulas, common traps. Score-boosting strategies with practice.", "title": "SAT Math Prep", "age": "Grades 10-12"},
    ],

    "college": [
        {"topic": "Microeconomics 101: Supply and Demand - Market equilibrium, elasticity, consumer surplus, producer surplus. University introductory economics with graphs.", "title": "Econ: Supply & Demand", "age": "College"},
        {"topic": "Organic Chemistry: Reaction Mechanisms - SN1, SN2, E1, E2. Nucleophiles, electrophiles, leaving groups. Step-by-step mechanism analysis.", "title": "Orgo: Reaction Mechanisms", "age": "College"},
        {"topic": "Statistics: Hypothesis Testing - Null hypothesis, p-values, t-tests, Type I/II errors, confidence intervals. Research methods essentials.", "title": "Stats: Hypothesis Testing", "age": "College"},
        {"topic": "Constitutional Law: First Amendment - Freedom of speech, religion, press, assembly. Landmark Supreme Court cases and their implications.", "title": "Con Law: 1st Amendment", "age": "College/Law"},
        {"topic": "Molecular Biology: DNA Replication - Helicase, primase, DNA polymerase, leading and lagging strands. Detailed molecular mechanisms.", "title": "DNA Replication", "age": "College"},
        {"topic": "Marketing: Consumer Behavior - Decision-making process, psychological factors, segmentation, targeting, positioning. MBA-level marketing.", "title": "Consumer Behavior", "age": "College/MBA"},
        {"topic": "Linear Algebra: Matrices and Vectors - Matrix operations, determinants, eigenvalues, eigenvectors. Applied mathematics essentials.", "title": "Linear Algebra", "age": "College"},
        {"topic": "Abnormal Psychology: Mood Disorders - Major depression, bipolar disorder, DSM criteria, treatment approaches. Clinical psychology.", "title": "Psych: Mood Disorders", "age": "College"},
        {"topic": "Data Structures: Arrays, Lists, Trees - Big O notation, linked lists, binary trees, hash tables. Computer science fundamentals.", "title": "CS: Data Structures", "age": "College"},
        {"topic": "Philosophy: Ethical Theories - Utilitarianism, deontology, virtue ethics. Mill, Kant, Aristotle. Applied ethical reasoning.", "title": "Ethics & Philosophy", "age": "College"},
    ],

    "adult": [
        {"topic": "Personal Finance 101: Budgeting, Saving, and Investing - 401k, IRA, emergency funds, compound interest. Practical money management for adults.", "title": "Personal Finance Basics", "age": "Adult"},
        {"topic": "Public Speaking Mastery - Overcoming anxiety, structuring presentations, engaging audiences, handling Q&A. Professional communication skills.", "title": "Public Speaking", "age": "Adult"},
        {"topic": "Excel for Professionals - VLOOKUP, pivot tables, conditional formatting, charts. Essential workplace spreadsheet skills.", "title": "Excel Mastery", "age": "Professional"},
        {"topic": "Project Management Essentials - Agile, Scrum, Kanban, Gantt charts, stakeholder management. Managing projects effectively.", "title": "Project Management", "age": "Professional"},
        {"topic": "Business Writing Skills - Professional emails, reports, proposals. Clear, concise, effective workplace communication.", "title": "Business Writing", "age": "Professional"},
        {"topic": "Critical Thinking - Logical reasoning, cognitive biases, decision frameworks. Better analysis and problem solving.", "title": "Critical Thinking", "age": "Adult"},
        {"topic": "Nutrition Fundamentals - Macros, micros, meal planning, reading labels. Science-based healthy eating for adults.", "title": "Nutrition Basics", "age": "Adult"},
        {"topic": "First-Time Home Buying - Mortgages, down payments, closing costs, inspections, negotiations. Complete buyer's guide.", "title": "Home Buying 101", "age": "Adult"},
        {"topic": "Job Interview Skills - STAR method, common questions, salary negotiation, follow-up. Land your dream job.", "title": "Ace the Interview", "age": "Adult"},
        {"topic": "Investing for Beginners - Stocks, bonds, ETFs, index funds, diversification, risk management. Start building wealth.", "title": "Investing 101", "age": "Adult"},
    ],
}


async def create_deck(client: httpx.AsyncClient, topic: str, slides: int = 8) -> dict:
    """Create a deck via the local API."""
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
        timeout=60.0
    )
    response.raise_for_status()
    return response.json()


async def poll_status(client: httpx.AsyncClient, deck_id: str, max_wait: int = 300) -> dict:
    """Poll for deck completion - checks both API status and actual slides in DB."""
    start = asyncio.get_event_loop().time()
    supabase = get_supabase_client()

    while asyncio.get_event_loop().time() - start < max_wait:
        response = await client.get(
            f"{API_BASE}/v1/decks/{deck_id}/status",
            headers={"X-API-Key": API_KEY},
            timeout=30.0
        )
        response.raise_for_status()
        status = response.json()

        if status["status"] == "completed":
            return status
        elif status["status"] == "failed":
            raise Exception(f"Generation failed: {status.get('error_message', 'Unknown')}")

        # Also check if slides are actually complete in DB (workaround for status bug)
        deck = supabase.table('decks').select('slides').eq('uuid', deck_id).single().execute()
        if deck.data:
            slides = deck.data.get('slides', [])
            if slides:
                completed_slides = sum(1 for s in slides if s.get('components') and len(s.get('components', [])) > 0)
                if completed_slides == len(slides) and completed_slides > 0:
                    # All slides have content - manually mark as complete
                    supabase.table('decks').update({
                        'status': {'state': 'completed'}
                    }).eq('uuid', deck_id).execute()
                    return {'status': 'completed', 'slides_count': len(slides), 'deck_id': deck_id}

        await asyncio.sleep(8)

    raise Exception(f"Timeout waiting for deck {deck_id}")


def add_to_community(deck_uuid: str, title: str, description: str, age_group: str, tags: list) -> bool:
    """Add completed deck to community."""
    try:
        supabase = get_supabase_client()

        deck_result = supabase.table('decks').select(
            'slides, data, slide_count, first_slide'
        ).eq('uuid', deck_uuid).single().execute()

        if not deck_result.data:
            return False

        deck = deck_result.data
        slides = deck.get('slides', [])
        theme = deck.get('data', {}).get('theme') if deck.get('data') else None

        days_ago = random.randint(1, 30)
        approved_at = (datetime.utcnow() - timedelta(days=days_ago)).isoformat()

        community_data = {
            "deck_uuid": deck_uuid,
            "user_id": USER_ID,
            "title": title,
            "description": description,
            "category": "education",
            "tags": tags + ["education", age_group],
            "status": "approved",
            "slide_count": len(slides),
            "first_slide": slides[0] if slides else None,
            "slides_snapshot": slides,
            "theme_snapshot": theme,
            "author_name": "NextSlide Education",
            "author_email": "education@nextslide.ai",
            "submitted_at": approved_at,
            "approved_at": approved_at,
            "remix_count": random.randint(10, 80),
            "view_count": random.randint(50, 500),
        }

        supabase.table('community_decks').insert(community_data).execute()
        return True

    except Exception as e:
        print(f"      Community error: {e}")
        return False


async def process_lesson(client: httpx.AsyncClient, lesson: dict, age_group: str, index: int, total: int) -> bool:
    """Process a single lesson through the API."""
    try:
        short_title = lesson["title"][:30]
        print(f"  [{index+1:2d}/{total}] {short_title} ({lesson['age']})...", flush=True)

        # Create via API
        result = await create_deck(client, lesson["topic"], slides=random.randint(7, 10))
        deck_id = result["deck_id"]

        # Poll for completion
        status = await poll_status(client, deck_id)

        # Add to community
        description = f"{lesson['title']} - {lesson['age']}. Educational content for learners."
        tags = ["lesson", lesson["age"].lower().replace(" ", "-")]

        if add_to_community(deck_id, lesson["title"], description, age_group, tags):
            print(f"           ✓ {status.get('slides_count', '?')} slides", flush=True)
            return True
        else:
            print(f"           ✗ Community add failed", flush=True)
            return False

    except Exception as e:
        print(f"           ✗ {str(e)[:40]}", flush=True)
        return False


async def main():
    print("=" * 70)
    print("Education Lessons via PUBLIC API (localhost:9090)")
    print("=" * 70)

    # Build lesson list
    lessons = []
    for age_group, group_lessons in LESSONS.items():
        for lesson in group_lessons:
            lessons.append({"age_group": age_group, **lesson})

    random.shuffle(lessons)
    lessons = lessons[:60]

    print(f"Creating {len(lessons)} lessons (3 parallel - API limit)")
    print("-" * 70)

    success = 0
    errors = 0
    lock = asyncio.Lock()

    async def track(client, lesson, idx, total):
        nonlocal success, errors
        result = await process_lesson(client, lesson, lesson["age_group"], idx, total)
        async with lock:
            if result:
                success += 1
            else:
                errors += 1

    BATCH_SIZE = 3  # API concurrent limit is 3

    async with httpx.AsyncClient() as client:
        for batch_start in range(0, len(lessons), BATCH_SIZE):
            batch = lessons[batch_start:batch_start + BATCH_SIZE]
            print(f"\n  === Batch {batch_start//BATCH_SIZE + 1} ({len(batch)} lessons) ===\n")

            tasks = [track(client, l, batch_start + i, len(lessons)) for i, l in enumerate(batch)]
            await asyncio.gather(*tasks, return_exceptions=True)

            if batch_start + BATCH_SIZE < len(lessons):
                print(f"\n  --- {success} success, {errors} errors so far ---\n")
                await asyncio.sleep(2)

    print("-" * 70)
    print(f"\nDone! ✓ {success} success, ✗ {errors} errors")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
