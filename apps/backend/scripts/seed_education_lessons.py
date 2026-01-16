#!/usr/bin/env python3
"""
Seed community with educational lessons for all age groups.
- Kids (K-5): Playful, colorful, simple concepts
- Middle School (6-8): Engaging, foundational
- High School (9-12): Academic, exam-focused
- College/Adult: Professional, in-depth

Runs 20 generations in parallel.
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
from utils.supabase import upload_deck

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"

# Educational lessons by age group
LESSONS = {
    # KIDS (K-5) - Playful and fun!
    "kids": [
        {"topic": "The Solar System Adventure - Learn About Planets! Fun facts about Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune for kids. Make it colorful and playful with fun illustrations.", "title": "Solar System Adventure", "age": "Ages 5-10"},
        {"topic": "Dinosaurs for Kids - T-Rex, Triceratops, and Friends! A fun journey back in time to meet the coolest dinosaurs. Playful and exciting presentation for young learners.", "title": "Dinosaur Discovery", "age": "Ages 5-10"},
        {"topic": "The Water Cycle Explained for Kids - Rain, Clouds, and Puddles! How water travels from oceans to clouds to rain. Simple, colorful, and fun.", "title": "The Water Cycle", "age": "Ages 6-10"},
        {"topic": "Addition and Subtraction Fun - Math for Kids with games and examples. Learning to add and subtract with pictures, animals, and treats!", "title": "Math is Fun!", "age": "Ages 5-8"},
        {"topic": "The Human Body for Kids - Bones, Heart, and Brain! A fun tour of how our amazing bodies work. Kid-friendly and engaging.", "title": "My Amazing Body", "age": "Ages 6-10"},
        {"topic": "Animal Habitats - Where Do Animals Live? Jungle, Ocean, Desert, and Arctic animals and their homes. Colorful and educational.", "title": "Animal Homes", "age": "Ages 5-9"},
        {"topic": "The Life Cycle of a Butterfly - From Caterpillar to Beautiful Wings! A magical transformation story for kids.", "title": "Butterfly Life Cycle", "age": "Ages 5-8"},
        {"topic": "Weather and Seasons for Kids - Sun, Rain, Snow, and Wind! Why we have summer, fall, winter, and spring. Fun and easy to understand.", "title": "Weather & Seasons", "age": "Ages 5-9"},
        {"topic": "Telling Time for Kids - Reading Clocks and Understanding Hours! Learning to tell time with fun activities and colorful clocks.", "title": "Learning to Tell Time", "age": "Ages 6-8"},
        {"topic": "Colors and Shapes - A Fun Learning Adventure! Primary colors, shapes like circles, squares, triangles. Interactive and playful.", "title": "Colors & Shapes", "age": "Ages 4-6"},
    ],

    # MIDDLE SCHOOL (6-8) - Engaging foundations
    "middle_school": [
        {"topic": "Introduction to Algebra - Variables, Equations, and Problem Solving. Clear explanations with real-world examples for middle schoolers.", "title": "Intro to Algebra", "age": "Grades 6-8"},
        {"topic": "The American Revolution - Causes, Key Events, and Founding Fathers. Engaging history lesson for middle school students.", "title": "American Revolution", "age": "Grades 6-8"},
        {"topic": "Cells and Cell Theory - The Building Blocks of Life. Plant cells vs animal cells, organelles, and functions. Middle school biology.", "title": "Cell Biology Basics", "age": "Grades 6-8"},
        {"topic": "Introduction to Chemistry - Atoms, Elements, and the Periodic Table. Making chemistry accessible and interesting.", "title": "Intro to Chemistry", "age": "Grades 6-8"},
        {"topic": "Earth Science: Plate Tectonics and Earthquakes - How continents move and why earthquakes happen.", "title": "Plate Tectonics", "age": "Grades 6-8"},
        {"topic": "Fractions, Decimals, and Percentages - Converting and calculating with clear examples.", "title": "Fractions & Decimals", "age": "Grades 6-7"},
        {"topic": "The Civil War - Causes, Major Battles, and Reconstruction. Comprehensive middle school history.", "title": "The Civil War", "age": "Grades 7-8"},
        {"topic": "Grammar Essentials - Parts of Speech, Sentence Structure, and Punctuation for better writing.", "title": "Grammar Essentials", "age": "Grades 6-8"},
        {"topic": "The Scientific Method - Hypothesis, Experiment, Analysis, Conclusion. How real scientists work.", "title": "Scientific Method", "age": "Grades 6-8"},
        {"topic": "Introduction to Geometry - Angles, Triangles, Area, and Perimeter with visual examples.", "title": "Geometry Basics", "age": "Grades 6-8"},
    ],

    # HIGH SCHOOL (9-12) - Academic and rigorous
    "high_school": [
        {"topic": "AP Biology: Cellular Respiration and Photosynthesis - ATP production, glycolysis, Krebs cycle, electron transport chain. Detailed for AP exam prep.", "title": "AP Bio: Cell Energy", "age": "Grades 10-12"},
        {"topic": "AP US History: World War II - Causes, Pacific and European theaters, Holocaust, atomic bombs. Comprehensive review.", "title": "APUSH: World War II", "age": "Grades 10-12"},
        {"topic": "Calculus: Limits and Derivatives - Understanding limits, derivative rules, applications. Clear explanations with worked examples.", "title": "Calculus: Derivatives", "age": "Grades 11-12"},
        {"topic": "AP Chemistry: Chemical Bonding - Ionic, covalent, metallic bonds. Lewis structures, VSEPR theory, polarity.", "title": "AP Chem: Bonding", "age": "Grades 10-12"},
        {"topic": "Shakespeare's Macbeth - Themes, characters, literary analysis. Advanced English literature study.", "title": "Macbeth Analysis", "age": "Grades 9-12"},
        {"topic": "Physics: Newton's Laws of Motion - Force, mass, acceleration. Free body diagrams and problem solving.", "title": "Physics: Newton's Laws", "age": "Grades 9-11"},
        {"topic": "AP European History: The French Revolution - Causes, Reign of Terror, Napoleon. Comprehensive AP prep.", "title": "AP Euro: French Revolution", "age": "Grades 10-12"},
        {"topic": "Pre-Calculus: Trigonometric Functions - Sin, cos, tan, unit circle, identities. Building foundation for calculus.", "title": "Trigonometry", "age": "Grades 10-11"},
        {"topic": "AP Psychology: Memory and Cognition - Encoding, storage, retrieval, memory disorders. AP exam focused.", "title": "AP Psych: Memory", "age": "Grades 11-12"},
        {"topic": "SAT Math Prep: Problem Solving Strategies - Key techniques, common question types, time management.", "title": "SAT Math Strategies", "age": "Grades 10-12"},
    ],

    # COLLEGE - In-depth academic
    "college": [
        {"topic": "Microeconomics: Supply and Demand - Market equilibrium, elasticity, consumer and producer surplus. University-level economics.", "title": "Microeconomics 101", "age": "College"},
        {"topic": "Organic Chemistry: Reaction Mechanisms - SN1, SN2, E1, E2 reactions. Nucleophilic substitution and elimination.", "title": "Organic Chemistry Mechanisms", "age": "College"},
        {"topic": "Statistics: Hypothesis Testing - T-tests, p-values, confidence intervals, Type I and II errors. Research methods.", "title": "Statistics: Hypothesis Testing", "age": "College"},
        {"topic": "Constitutional Law: First Amendment - Freedom of speech, religion, press. Key Supreme Court cases.", "title": "Constitutional Law: 1st Amendment", "age": "College/Law"},
        {"topic": "Molecular Biology: DNA Replication and Transcription - Enzymes, mechanisms, regulation. Advanced biology.", "title": "Molecular Biology", "age": "College"},
        {"topic": "Marketing Principles: Consumer Behavior - Decision making process, segmentation, targeting, positioning.", "title": "Marketing: Consumer Behavior", "age": "College/MBA"},
        {"topic": "Linear Algebra: Matrices and Vectors - Operations, determinants, eigenvalues. Applied mathematics.", "title": "Linear Algebra", "age": "College"},
        {"topic": "Abnormal Psychology: Mood Disorders - Depression, bipolar disorder, diagnosis, treatment approaches.", "title": "Abnormal Psych: Mood Disorders", "age": "College"},
        {"topic": "Computer Science: Data Structures - Arrays, linked lists, trees, graphs, hash tables. Algorithm complexity.", "title": "Data Structures", "age": "College"},
        {"topic": "Philosophy: Ethics and Moral Theory - Utilitarianism, deontology, virtue ethics. Applied ethical reasoning.", "title": "Ethics & Moral Philosophy", "age": "College"},
    ],

    # ADULT/PROFESSIONAL - Practical skills
    "adult": [
        {"topic": "Financial Literacy: Personal Budgeting and Investing - 401k, IRA, stocks, bonds, emergency funds. Practical money management.", "title": "Personal Finance Basics", "age": "Adult"},
        {"topic": "Public Speaking Mastery - Overcoming fear, structuring talks, engaging audiences. Professional development.", "title": "Public Speaking Skills", "age": "Adult"},
        {"topic": "Excel for Professionals - Formulas, pivot tables, VLOOKUP, data analysis. Workplace essential skills.", "title": "Excel Mastery", "age": "Adult/Professional"},
        {"topic": "Project Management Fundamentals - Agile, Scrum, Kanban, timelines, stakeholder management.", "title": "Project Management 101", "age": "Adult/Professional"},
        {"topic": "Business Writing - Emails, reports, proposals. Clear, professional communication skills.", "title": "Business Writing", "age": "Adult/Professional"},
        {"topic": "Critical Thinking and Problem Solving - Logical analysis, decision frameworks, avoiding biases.", "title": "Critical Thinking Skills", "age": "Adult"},
        {"topic": "Nutrition and Healthy Eating - Macronutrients, meal planning, reading labels. Science-based health.", "title": "Nutrition Fundamentals", "age": "Adult"},
        {"topic": "Home Buying 101 - Mortgages, down payments, closing costs, inspections. First-time buyer guide.", "title": "Home Buying Guide", "age": "Adult"},
        {"topic": "Resume Writing and Job Interview Skills - ATS optimization, STAR method, negotiation.", "title": "Job Search Skills", "age": "Adult"},
        {"topic": "Introduction to Investing - Stocks, bonds, ETFs, diversification, risk management for beginners.", "title": "Investing 101", "age": "Adult"},
    ],
}

TAG_POOLS = {
    "kids": ["kids", "elementary", "fun learning", "interactive", "colorful", "playful"],
    "middle_school": ["middle school", "grades 6-8", "foundations", "engaging"],
    "high_school": ["high school", "AP prep", "exam prep", "academic", "advanced"],
    "college": ["college", "university", "advanced", "research", "academic"],
    "adult": ["professional", "career", "practical", "skills", "adult learning"],
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

        deck_data = build_initial_deck_payload(deck_outline, deck_uuid)
        deck_data["data"] = deck_data.get("data", {})
        deck_data["data"]["source"] = "education_seed"

        upload_deck(deck_data, deck_uuid, USER_ID)

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

        supabase = get_supabase_client()
        supabase.table("decks").update({
            "status": {"state": "completed"}
        }).eq("uuid", deck_uuid).execute()

        return deck_uuid, slides_generated

    except Exception as e:
        raise Exception(f"Generation failed: {e}")


def add_to_community(deck_uuid: str, title: str, description: str, category: str, tags: list) -> bool:
    """Add a completed deck to community_decks."""
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
            "tags": tags,
            "status": "approved",
            "slide_count": len(slides),
            "first_slide": slides[0] if slides else None,
            "slides_snapshot": slides,
            "theme_snapshot": theme,
            "author_name": "NextSlide Education",
            "author_email": "education@nextslide.ai",
            "submitted_at": approved_at,
            "approved_at": approved_at,
            "remix_count": random.randint(10, 100),
            "view_count": random.randint(100, 1000),
        }

        supabase.table('community_decks').insert(community_data).execute()
        return True

    except Exception as e:
        print(f"      Error: {e}")
        return False


async def process_lesson(lesson: dict, age_group: str, index: int, total: int) -> bool:
    """Process a single lesson."""
    tags = random.sample(TAG_POOLS.get(age_group, ["education"]), min(3, len(TAG_POOLS.get(age_group, []))))
    tags.append("education")
    num_slides = random.randint(6, 10)

    try:
        short_title = lesson["title"][:35]
        print(f"  [{index+1:2d}/{total}] {short_title} ({lesson['age']})...")

        deck_uuid, slides_count = await generate_deck_direct(lesson["topic"], num_slides)

        description = f"{lesson['title']} - {lesson['age']}. {lesson['topic'][:100]}..."

        if add_to_community(deck_uuid, lesson["title"], description, "education", tags):
            print(f"           ✓ {slides_count} slides")
            return True
        else:
            print(f"           ✗ Failed to add")
            return False

    except Exception as e:
        print(f"           ✗ Error: {str(e)[:50]}")
        return False


async def main():
    """Main function."""
    print("=" * 70)
    print("Education Lessons Seeder (20 parallel)")
    print("=" * 70)

    # Build lesson list
    lessons = []
    for age_group, group_lessons in LESSONS.items():
        for lesson in group_lessons:
            lessons.append({"age_group": age_group, **lesson})

    random.shuffle(lessons)
    lessons = lessons[:60]  # Limit to 60

    print(f"Creating {len(lessons)} educational lessons")
    print("-" * 70)

    success_count = 0
    error_count = 0
    results_lock = asyncio.Lock()

    async def process_with_tracking(lesson, index, total):
        nonlocal success_count, error_count
        result = await process_lesson(lesson, lesson["age_group"], index, total)
        async with results_lock:
            if result:
                success_count += 1
            else:
                error_count += 1
        return result

    # Run in parallel batches of 5 for stability
    BATCH_SIZE = 5
    total = len(lessons)

    for batch_start in range(0, total, BATCH_SIZE):
        batch = lessons[batch_start:batch_start + BATCH_SIZE]
        tasks = [
            process_with_tracking(lesson, batch_start + i, total)
            for i, lesson in enumerate(batch)
        ]

        print(f"\n  === Starting batch {batch_start//BATCH_SIZE + 1} ({len(batch)} lessons) ===\n")
        await asyncio.gather(*tasks, return_exceptions=True)

        if batch_start + BATCH_SIZE < total:
            print(f"\n  --- Batch complete: {success_count} success, {error_count} errors ---\n")
            await asyncio.sleep(3)

    print("-" * 70)
    print(f"\nFinal Summary:")
    print(f"  ✓ Success: {success_count}")
    print(f"  ✗ Errors: {error_count}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
