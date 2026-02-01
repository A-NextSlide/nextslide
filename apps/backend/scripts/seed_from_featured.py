#!/usr/bin/env python3
"""
Populate community_decks, templates, and deck_shares from existing deck entries.

Reads the seed user's deck entries (created by seed_100_presentations.py),
generates placeholder slides for any that are missing them, then inserts into:

  1. community_decks  — powers /presentations browse page
  2. templates         — powers /presentation-templates/:slug pages
  3. deck_shares       — powers the browse API (public share links)

Usage:
    cd apps/backend
    python3 scripts/seed_from_featured.py
"""

import os
import re
import sys
import uuid
import random
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"

# ---------------------------------------------------------------------------
# Valid categories for community_decks CHECK constraint
# ---------------------------------------------------------------------------
VALID_COMMUNITY_CATEGORIES = {"business", "education", "marketing", "creative", "technology", "personal"}

CATEGORY_REMAP = {
    "sales": "business",
    "finance": "business",
    "consulting": "business",
    "hr": "personal",
    "research": "education",
}

# ---------------------------------------------------------------------------
# Color themes for placeholder slides
# ---------------------------------------------------------------------------
COLOR_THEMES = [
    {"primary": "#3B82F6", "secondary": "#1E40AF", "bg": "#F8FAFC", "text": "#1E293B"},
    {"primary": "#8B5CF6", "secondary": "#6D28D9", "bg": "#FAF5FF", "text": "#1E1B4B"},
    {"primary": "#10B981", "secondary": "#059669", "bg": "#F0FDF4", "text": "#14532D"},
    {"primary": "#F59E0B", "secondary": "#D97706", "bg": "#FFFBEB", "text": "#78350F"},
    {"primary": "#EF4444", "secondary": "#DC2626", "bg": "#FEF2F2", "text": "#7F1D1D"},
    {"primary": "#EC4899", "secondary": "#DB2777", "bg": "#FDF2F8", "text": "#831843"},
    {"primary": "#06B6D4", "secondary": "#0891B2", "bg": "#ECFEFF", "text": "#164E63"},
    {"primary": "#6366F1", "secondary": "#4F46E5", "bg": "#EEF2FF", "text": "#312E81"},
    {"primary": "#14B8A6", "secondary": "#0D9488", "bg": "#F0FDFA", "text": "#134E4A"},
    {"primary": "#F97316", "secondary": "#EA580C", "bg": "#FFF7ED", "text": "#7C2D12"},
]

# ---------------------------------------------------------------------------
# Category inference
# ---------------------------------------------------------------------------
KEYWORD_CATEGORIES = {
    "business": ["pitch", "startup", "revenue", "investor", "company", "business", "fund",
                  "market entry", "board meeting", "pricing", "ecommerce", "restaurant",
                  "fintech", "venture", "supply chain", "streaming", "coffee industry",
                  "nonprofit", "grant", "merger", "acquisition", "future of work",
                  "ip strategy", "intellectual property"],
    "education": ["learn", "science", "history", "course", "lecture", "study", "school",
                   "solar system", "machine learning for beginners", "world war",
                   "ancient egypt", "music theory", "nutrition", "mental health",
                   "space exploration", "sleep", "strength training", "circular economy",
                   "public speaking", "time management", "inflation", "genetics", "dna",
                   "ocean", "dinosaur", "language learning", "climate change for kids",
                   "psychology", "personal finance 101", "ethics", "philosophy",
                   "statistics", "constitution", "periodic table", "chemistry",
                   "geography", "persuasion", "cooking", "religion"],
    "marketing": ["marketing", "brand", "seo", "campaign", "content", "social media",
                   "growth hacking", "email marketing", "d2c", "direct-to-consumer",
                   "go-to-market", "launch plan", "influencer", "podcast",
                   "customer journey"],
    "technology": ["api", "software", "cloud", "cybersecurity", "gdpr", "compliance",
                    "product strategy", "data warehouse", "data stack", "llm",
                    "fine-tuning", "quantum computing", "renewable energy", "healthcare ai",
                    "devops", "ci/cd", "web3", "blockchain", "electric vehicle"],
    "creative": ["design", "photography", "video games", "street food", "ui design",
                  "sustainable architecture", "anime", "hollywood", "movie economics",
                  "board games", "architecture movements", "ux case study",
                  "data visualization", "evolution of"],
    "sales": ["enterprise sales", "saas product demo", "customer success", "channel partner"],
    "finance": ["cryptocurrency", "real estate invest", "venture capital fund",
                 "mergers & acquisitions", "due diligence"],
    "consulting": ["digital transformation", "market entry strategy", "organizational restructur"],
    "hr": ["dei strategy", "performance review", "employer branding"],
    "research": ["ux research", "climate tech", "sports analytics"],
}


def infer_category(name: str) -> str:
    """Infer category from deck name."""
    text = name.lower()
    for cat, keywords in KEYWORD_CATEGORIES.items():
        for kw in keywords:
            if kw in text:
                return cat
    return "business"


def remap_category(category: str) -> str:
    """Remap to valid community_decks category."""
    if category in VALID_COMMUNITY_CATEGORIES:
        return category
    return CATEGORY_REMAP.get(category, "business")


def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s-]+', '-', text)
    text = text.strip('-')
    return text[:80]


def build_tags(name: str, category: str) -> list:
    """Generate tags from deck name and category."""
    words = re.findall(r'[a-zA-Z]{3,}', name.lower())
    stop = {"the", "and", "for", "from", "with", "how", "what", "why", "that", "this",
            "are", "was", "our", "your", "every", "must", "track", "about"}
    tags = [w for w in words if w not in stop][:5]
    if category not in tags:
        tags.append(category)
    return tags[:6]


# ---------------------------------------------------------------------------
# Placeholder slide generation (adapted from seed_community_decks.py)
# ---------------------------------------------------------------------------
def _cid():
    return str(uuid.uuid4())[:8]


def _sid():
    return str(uuid.uuid4())


def make_title_slide(title: str, subtitle: str, theme: dict) -> dict:
    return {
        "id": _sid(),
        "title": title,
        "components": [
            {"id": _cid(), "type": "Background", "props": {
                "backgroundType": "gradient", "gradientType": "linear", "gradientAngle": 135,
                "gradientStops": [
                    {"color": theme["primary"], "position": 0},
                    {"color": theme["secondary"], "position": 100},
                ], "opacity": 1,
            }},
            {"id": _cid(), "type": "TiptapTextBlock", "props": {
                "position": {"x": 120, "y": 380}, "width": 1680, "height": 150,
                "texts": [{"text": title, "fontSize": 72, "fontWeight": 700, "textColor": "#FFFFFF", "style": []}],
                "textAlign": "center", "verticalAlign": "middle", "zIndex": 10,
            }},
            {"id": _cid(), "type": "TiptapTextBlock", "props": {
                "position": {"x": 120, "y": 550}, "width": 1680, "height": 60,
                "texts": [{"text": subtitle, "fontSize": 28, "fontWeight": 400, "textColor": "#FFFFFF", "style": []}],
                "textAlign": "center", "verticalAlign": "top", "zIndex": 10,
            }},
        ],
    }


def make_content_slide(title: str, bullets: list, theme: dict) -> dict:
    comps = [
        {"id": _cid(), "type": "Background", "props": {
            "backgroundType": "color", "backgroundColor": theme["bg"], "opacity": 1,
        }},
        {"id": _cid(), "type": "TiptapTextBlock", "props": {
            "position": {"x": 120, "y": 100}, "width": 1680, "height": 100,
            "texts": [{"text": title, "fontSize": 48, "fontWeight": 700, "textColor": theme["primary"], "style": []}],
            "textAlign": "left", "verticalAlign": "middle", "zIndex": 5,
        }},
    ]
    y = 280
    for i, b in enumerate(bullets[:5]):
        comps.append({"id": _cid(), "type": "TiptapTextBlock", "props": {
            "position": {"x": 120, "y": y}, "width": 1680, "height": 80,
            "texts": [{"text": f"\u2022 {b}", "fontSize": 32, "fontWeight": 400, "textColor": theme["text"], "style": []}],
            "textAlign": "left", "verticalAlign": "middle", "zIndex": 10 + i,
        }})
        y += 100
    return {"id": _sid(), "title": title, "components": comps}


def make_closing_slide(theme: dict) -> dict:
    return {
        "id": _sid(), "title": "Thank You",
        "components": [
            {"id": _cid(), "type": "Background", "props": {
                "backgroundType": "gradient", "gradientType": "linear", "gradientAngle": 315,
                "gradientStops": [
                    {"color": theme["secondary"], "position": 0},
                    {"color": theme["primary"], "position": 100},
                ], "opacity": 1,
            }},
            {"id": _cid(), "type": "TiptapTextBlock", "props": {
                "position": {"x": 120, "y": 400}, "width": 1680, "height": 120,
                "texts": [{"text": "Thank You", "fontSize": 64, "fontWeight": 700, "textColor": "#FFFFFF", "style": []}],
                "textAlign": "center", "verticalAlign": "middle", "zIndex": 10,
            }},
            {"id": _cid(), "type": "TiptapTextBlock", "props": {
                "position": {"x": 120, "y": 540}, "width": 1680, "height": 60,
                "texts": [{"text": "Questions?", "fontSize": 28, "fontWeight": 400, "textColor": "#FFFFFF", "style": []}],
                "textAlign": "center", "verticalAlign": "top", "zIndex": 10,
            }},
        ],
    }


CONTENT_POOLS = {
    "business": [
        "Identify key performance metrics and KPIs",
        "Analyze market trends and competitive landscape",
        "Develop strategic initiatives for growth",
        "Optimize operational efficiency and reduce costs",
        "Build strong stakeholder relationships",
        "Implement data-driven decision making",
        "Scale operations sustainably across regions",
        "Manage risk and ensure regulatory compliance",
        "Foster innovation culture within teams",
        "Drive digital transformation initiatives",
    ],
    "education": [
        "Understand fundamental concepts and principles",
        "Apply theoretical knowledge to real scenarios",
        "Develop critical thinking and analysis skills",
        "Engage with hands-on exercises and projects",
        "Review and reinforce key learnings",
        "Explore advanced topics and applications",
        "Connect concepts across multiple disciplines",
        "Practice problem-solving techniques",
        "Collaborate with peers for deeper understanding",
        "Assess progress through practical examples",
    ],
    "marketing": [
        "Define target audience and buyer personas",
        "Create compelling value propositions",
        "Build multi-channel marketing strategies",
        "Measure and optimize campaign performance",
        "Leverage data analytics for actionable insights",
        "Develop engaging content experiences",
        "Build brand awareness and customer loyalty",
        "Optimize conversion funnels end-to-end",
        "Implement marketing automation workflows",
        "Track ROI across all marketing channels",
    ],
    "creative": [
        "Establish clear design principles and systems",
        "Create consistent visual language across media",
        "Balance form and function in every element",
        "Iterate designs based on user feedback",
        "Consider accessibility and usability standards",
        "Maintain brand consistency across touchpoints",
        "Push creative boundaries with purpose",
        "Document design decisions and rationale",
        "Collaborate across design and engineering",
        "Test with real users in real contexts",
    ],
    "technology": [
        "Design for scalability and high performance",
        "Implement security best practices at every layer",
        "Write maintainable, well-tested code",
        "Automate testing and deployment pipelines",
        "Monitor and optimize production systems",
        "Document architecture decisions thoroughly",
        "Plan for disaster recovery and failover",
        "Stay current with emerging technology trends",
        "Foster knowledge sharing across teams",
        "Build with future extensibility in mind",
    ],
    "personal": [
        "Set clear and achievable personal goals",
        "Build consistent daily habits for success",
        "Track progress and adjust your approach",
        "Seek feedback and mentorship actively",
        "Invest in continuous learning and growth",
        "Maintain healthy work-life balance",
        "Build your professional network strategically",
        "Communicate effectively in all contexts",
        "Embrace challenges as growth opportunities",
        "Celebrate wins and learn from setbacks",
    ],
}

SECTION_TITLES = ["Overview", "Key Points", "Strategy & Approach", "Implementation",
                  "Best Practices", "Framework", "Deep Dive", "Analysis"]


def generate_slides(title: str, description: str, category: str, index: int) -> list:
    """Generate 6-8 placeholder slides for a deck."""
    theme = COLOR_THEMES[index % len(COLOR_THEMES)]
    pool = CONTENT_POOLS.get(category, CONTENT_POOLS["business"])

    slides = [make_title_slide(title, description[:100] if description else "Created with NextSlide AI", theme)]

    num_content = random.randint(4, 6)
    sections = random.sample(SECTION_TITLES, min(num_content, len(SECTION_TITLES)))
    for sec in sections:
        bullets = random.sample(pool, min(4, len(pool)))
        slides.append(make_content_slide(sec, bullets, theme))

    slides.append(make_closing_slide(theme))
    return slides


# ---------------------------------------------------------------------------
# Template definitions for /presentation-templates
# ---------------------------------------------------------------------------
TEMPLATE_DEFS = [
    {"slug": "startup-pitch-deck", "title": "Free Startup Pitch Deck Template",
     "description": "A clean, investor-ready pitch deck template for startups. Covers problem, solution, market size, traction, business model, team, and the ask.",
     "category": "business", "tags": ["startup", "pitch", "investor", "fundraising", "vc"]},
    {"slug": "sales-deck", "title": "Free Sales Deck Template",
     "description": "A persuasive sales presentation template to win new clients. Features problem framing, solution overview, case studies, pricing, and next steps.",
     "category": "sales", "tags": ["sales", "proposal", "client", "B2B", "closing"]},
    {"slug": "marketing-strategy", "title": "Free Marketing Strategy Template",
     "description": "Plan and present your marketing strategy. Includes market analysis, target audience, channels, budget, and KPIs.",
     "category": "marketing", "tags": ["marketing", "strategy", "digital", "campaign", "growth"]},
    {"slug": "quarterly-review", "title": "Free Quarterly Business Review Template",
     "description": "Present quarterly results with clarity. Covers performance highlights, financial summary, team updates, and next-quarter goals.",
     "category": "business", "tags": ["quarterly", "review", "QBR", "performance", "reporting"]},
    {"slug": "business-plan", "title": "Free Business Plan Presentation Template",
     "description": "Present a compelling business plan to stakeholders. Covers executive summary, market analysis, operations, financials, and roadmap.",
     "category": "business", "tags": ["business plan", "strategy", "executive", "planning", "roadmap"]},
    {"slug": "investor-update", "title": "Free Investor Update Template",
     "description": "Keep investors informed with a professional monthly or quarterly update. Covers KPIs, financials, product progress, and asks.",
     "category": "finance", "tags": ["investor", "update", "fundraising", "KPI", "board"]},
    {"slug": "product-launch", "title": "Free Product Launch Presentation Template",
     "description": "Announce your product launch with impact. Includes product overview, features, competitive positioning, and go-to-market plan.",
     "category": "marketing", "tags": ["product", "launch", "go-to-market", "announcement", "release"]},
    {"slug": "team-onboarding", "title": "Free Team Onboarding Presentation Template",
     "description": "Welcome new team members with a structured onboarding presentation. Covers culture, tools, processes, and first-week plan.",
     "category": "hr", "tags": ["onboarding", "HR", "team", "culture", "new hire"]},
    {"slug": "course-lecture", "title": "Free Course Lecture Presentation Template",
     "description": "Deliver engaging course lectures. Structured for learning objectives, key concepts, examples, and review questions.",
     "category": "education", "tags": ["education", "lecture", "course", "teaching", "academic"]},
    {"slug": "project-proposal", "title": "Free Project Proposal Presentation Template",
     "description": "Win project approvals with this professional proposal template. Covers objectives, scope, timeline, budget, and risks.",
     "category": "business", "tags": ["project", "proposal", "management", "approval", "scope"]},
    {"slug": "annual-report", "title": "Free Annual Report Presentation Template",
     "description": "Summarize your year with a polished annual report. Covers yearly highlights, financial performance, and outlook.",
     "category": "finance", "tags": ["annual", "report", "yearly", "performance", "corporate"]},
    {"slug": "company-overview", "title": "Free Company Overview Presentation Template",
     "description": "Introduce your company to partners, clients, or new hires. Covers mission, products, team, and traction.",
     "category": "business", "tags": ["company", "overview", "corporate", "introduction", "about"]},
    {"slug": "portfolio-showcase", "title": "Free Portfolio Showcase Presentation Template",
     "description": "Show off your best work with a stunning portfolio presentation. Perfect for designers, agencies, and freelancers.",
     "category": "creative", "tags": ["portfolio", "showcase", "design", "agency", "freelancer"]},
    {"slug": "case-study", "title": "Free Case Study Presentation Template",
     "description": "Present compelling case studies that showcase results. Covers challenge, approach, solution, and key takeaways.",
     "category": "sales", "tags": ["case study", "results", "client", "success", "B2B"]},
    {"slug": "workshop-training", "title": "Free Workshop & Training Presentation Template",
     "description": "Run engaging workshops and training sessions. Includes agenda, learning objectives, interactive exercises, and wrap-up.",
     "category": "education", "tags": ["workshop", "training", "interactive", "learning", "facilitation"]},
    {"slug": "conference-talk", "title": "Free Conference Talk Presentation Template",
     "description": "Deliver memorable conference presentations. Structured for a strong hook, narrative flow, and a powerful closing.",
     "category": "creative", "tags": ["conference", "talk", "speaking", "keynote", "presentation"]},
    {"slug": "research-presentation", "title": "Free Research Presentation Template",
     "description": "Present research findings professionally. Covers research question, methodology, analysis, findings, and conclusions.",
     "category": "research", "tags": ["research", "academic", "findings", "methodology", "data"]},
    {"slug": "consulting-deliverable", "title": "Free Consulting Deliverable Presentation Template",
     "description": "Deliver polished consulting presentations. Includes executive summary, analysis, recommendations, and implementation plan.",
     "category": "consulting", "tags": ["consulting", "deliverable", "strategy", "recommendation"]},
    {"slug": "social-media-strategy", "title": "Free Social Media Strategy Presentation Template",
     "description": "Plan your social media strategy. Covers audience analysis, platform strategy, content calendar, and metrics.",
     "category": "marketing", "tags": ["social media", "strategy", "content", "Instagram", "LinkedIn"]},
    {"slug": "budget-review", "title": "Free Budget Review Presentation Template",
     "description": "Present budget reviews and financial planning. Covers actual vs plan, variance analysis, and forecasts.",
     "category": "finance", "tags": ["budget", "review", "finance", "planning", "forecast"]},
]


def main():
    print("=" * 65)
    print("  NextSlide Content Seeder")
    print("  → community_decks + templates + deck_shares")
    print("=" * 65)

    supabase = get_supabase_client()

    # ── Step 1: Gather source decks ──────────────────────────────
    print("\n[1] Gathering source decks...")

    # Try featured_decks first
    fd_result = supabase.table("featured_decks").select(
        "uuid, name, description, slides, slide_count"
    ).eq("is_active", True).execute()
    featured = fd_result.data or []

    # Fall back to seed user's completed decks
    if not featured:
        print("    No featured_decks found, checking seed user's decks...")
        deck_result = supabase.table("decks").select(
            "uuid, name, slides, slide_count"
        ).eq("user_id", USER_ID).order("created_at", desc=True).execute()

        seed_decks = deck_result.data or []
        print(f"    Found {len(seed_decks)} decks from seed user")

        # Use these as our source, generating slides where missing
        for i, d in enumerate(seed_decks):
            name = d.get("name") or "Untitled"
            slides = d.get("slides") or []
            cat = remap_category(infer_category(name))

            if not slides:
                slides = generate_slides(name, "", cat, i)
                # Update the deck with placeholder slides
                try:
                    supabase.table("decks").update({
                        "slides": slides,
                        "slide_count": len(slides),
                        "status": {"state": "completed", "progress": 100},
                    }).eq("uuid", d["uuid"]).execute()
                except Exception:
                    pass

            featured.append({
                "uuid": d["uuid"],
                "name": name,
                "description": d.get("description") or name,
                "slides": slides,
                "slide_count": len(slides),
            })

    print(f"    Source decks: {len(featured)}")

    if not featured:
        print("    No source decks available. Nothing to seed.")
        return

    # ── Step 2: Existing data ────────────────────────────────────
    existing_community = set()
    try:
        ec = supabase.table("community_decks").select("deck_uuid").execute()
        existing_community = {r["deck_uuid"] for r in (ec.data or [])}
    except Exception:
        pass

    existing_tpl_slugs = set()
    try:
        et = supabase.table("templates").select("slug").execute()
        existing_tpl_slugs = {r["slug"] for r in (et.data or [])}
    except Exception:
        pass

    existing_shares = set()
    try:
        es = supabase.table("deck_shares").select("deck_uuid").eq("is_public", True).execute()
        existing_shares = {r["deck_uuid"] for r in (es.data or [])}
    except Exception:
        pass

    print(f"    Existing: {len(existing_community)} community, {len(existing_tpl_slugs)} templates, {len(existing_shares)} public shares")

    # ── Step 3: community_decks ──────────────────────────────────
    print(f"\n[2] Inserting into community_decks...")
    print("-" * 65)

    comm_ok = comm_skip = comm_err = 0

    for i, fd in enumerate(featured):
        deck_uuid = fd["uuid"]
        name = fd.get("name") or "Untitled"
        desc = fd.get("description") or ""
        slides = fd.get("slides") or []

        if deck_uuid in existing_community:
            comm_skip += 1
            continue

        raw_cat = infer_category(name)
        cat = remap_category(raw_cat)
        tags = build_tags(name, raw_cat)

        days_ago = random.randint(1, 60)
        approved_at = (datetime.utcnow() - timedelta(days=days_ago)).isoformat()

        row = {
            "deck_uuid": deck_uuid,
            "user_id": USER_ID,
            "title": name,
            "description": desc,
            "category": cat,
            "tags": tags,
            "status": "approved",
            "slide_count": len(slides),
            "first_slide": slides[0] if slides else None,
            "slides_snapshot": slides,
            "theme_snapshot": {},
            "author_name": "NextSlide Team",
            "submitted_at": approved_at,
            "approved_at": approved_at,
            "remix_count": random.randint(0, 30),
            "view_count": random.randint(50, 800),
        }

        try:
            supabase.table("community_decks").insert(row).execute()
            existing_community.add(deck_uuid)
            print(f"  [{comm_ok+1:3d}] OK ({cat:12s}): {name[:50]}")
            comm_ok += 1
        except Exception as e:
            err_msg = str(e)[:80]
            print(f"       ERR: {name[:40]} — {err_msg}")
            comm_err += 1

    print(f"\n    community_decks: {comm_ok} new, {comm_skip} skipped, {comm_err} errors")

    # ── Step 4: deck_shares (public) ─────────────────────────────
    print(f"\n[3] Creating public deck_shares...")
    print("-" * 65)

    share_ok = share_skip = share_err = 0

    for i, fd in enumerate(featured):
        deck_uuid = fd["uuid"]
        name = fd.get("name") or "Untitled"
        desc = fd.get("description") or ""

        if deck_uuid in existing_shares:
            share_skip += 1
            continue

        cat = remap_category(infer_category(name))
        short_code = uuid.uuid4().hex[:8]

        row = {
            "deck_uuid": deck_uuid,
            "short_code": short_code,
            "share_type": "view",
            "created_by": USER_ID,
            "shared_by": USER_ID,
            "is_active": True,
            "is_public": True,
            "access_count": random.randint(20, 500),
            "public_title": name,
            "public_description": desc,
            "public_category": cat,
        }

        try:
            supabase.table("deck_shares").insert(row).execute()
            existing_shares.add(deck_uuid)
            share_ok += 1
            if share_ok <= 20 or share_ok % 20 == 0:
                print(f"  [{share_ok:3d}] /p/{short_code} — {name[:45]}")
        except Exception as e:
            err_msg = str(e)[:80]
            print(f"       ERR: {name[:40]} — {err_msg}")
            share_err += 1

    print(f"\n    deck_shares: {share_ok} new, {share_skip} skipped, {share_err} errors")

    # ── Step 5: templates ────────────────────────────────────────
    print(f"\n[4] Inserting templates...")
    print("-" * 65)

    tpl_ok = tpl_skip = tpl_err = 0

    for i, tdef in enumerate(TEMPLATE_DEFS):
        slug = tdef["slug"]
        if slug in existing_tpl_slugs:
            tpl_skip += 1
            continue

        cat = tdef["category"]
        display_cat = remap_category(cat)
        slides = generate_slides(tdef["title"], tdef["description"], display_cat, i)

        deck_data = {
            "title": tdef["title"],
            "slides": slides,
            "slideCount": len(slides),
            "version": "template-v1",
            "size": {"width": 1920, "height": 1080},
        }

        row = {
            "slug": slug,
            "title": tdef["title"],
            "description": tdef["description"],
            "category": cat,
            "tags": tdef["tags"],
            "deck_data": deck_data,
            "thumbnail_url": None,
            "use_count": random.randint(0, 50),
            "is_active": True,
        }

        try:
            supabase.table("templates").insert(row).execute()
            existing_tpl_slugs.add(slug)
            print(f"  [{tpl_ok+1:2d}] OK ({cat:12s}): {slug}")
            tpl_ok += 1
        except Exception as e:
            err_msg = str(e)[:80]
            print(f"      ERR: {slug} — {err_msg}")
            tpl_err += 1

    print(f"\n    templates: {tpl_ok} new, {tpl_skip} skipped, {tpl_err} errors")

    # ── Summary ──────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("  DONE!")
    print(f"  community_decks: {comm_ok} new entries")
    print(f"  deck_shares:     {share_ok} new public links")
    print(f"  templates:       {tpl_ok} new templates")
    print("=" * 65)


if __name__ == "__main__":
    main()
