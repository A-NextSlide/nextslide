#!/usr/bin/env python3
"""
Seed 20 presentation templates for the Template Gallery.

Each template has a SEO-friendly slug, title, description, category, tags,
and a minimal but valid deck_data with 5-6 placeholder slides.

Usage:
    cd apps/backend
    python3 scripts/seed_templates.py
"""

import os
import sys
import json
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client


# ---------------------------------------------------------------------------
# Helper: build a minimal valid deck_data with placeholder slides
# ---------------------------------------------------------------------------

def make_slide(title: str, subtitle: str = "", bullets: list = None):
    """Create a single slide object matching the NextSlide slide structure."""
    content_blocks = []
    if subtitle:
        content_blocks.append({"type": "subtitle", "text": subtitle})
    if bullets:
        for b in bullets:
            content_blocks.append({"type": "bullet", "text": b})

    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "subtitle": subtitle,
        "content": content_blocks,
        "notes": "",
    }


def build_deck_data(template_title: str, slides_def: list):
    """Build a full deck_data JSONB blob."""
    slides = [make_slide(**s) for s in slides_def]
    return {
        "title": template_title,
        "slides": slides,
        "slideCount": len(slides),
        "version": "template-v1",
        "size": {"width": 1920, "height": 1080},
    }


# ---------------------------------------------------------------------------
# Template definitions
# ---------------------------------------------------------------------------

TEMPLATES = [
    # 1
    {
        "slug": "startup-pitch-deck",
        "title": "Free Startup Pitch Deck Template",
        "description": "A clean, investor-ready pitch deck template for startups. Covers problem, solution, market size, traction, business model, team, and the ask.",
        "category": "business",
        "tags": ["startup", "pitch", "investor", "fundraising", "vc"],
        "slides": [
            {"title": "The Problem", "subtitle": "What pain point exists in the market?", "bullets": ["Describe the core problem your target audience faces", "Quantify the impact"]},
            {"title": "Our Solution", "subtitle": "How we solve it differently", "bullets": ["Your unique value proposition", "Key differentiator"]},
            {"title": "Market Opportunity", "subtitle": "$X Billion Total Addressable Market", "bullets": ["TAM / SAM / SOM breakdown", "Growth rate"]},
            {"title": "Traction", "subtitle": "Key metrics and milestones", "bullets": ["Revenue or user growth", "Notable partnerships"]},
            {"title": "Business Model", "subtitle": "How we make money", "bullets": ["Pricing tiers", "Unit economics"]},
            {"title": "The Ask", "subtitle": "Raising $X to achieve Y", "bullets": ["Use of funds", "Expected milestones"]},
        ],
    },
    # 2
    {
        "slug": "sales-deck",
        "title": "Free Sales Deck Template",
        "description": "A persuasive sales presentation template to win new clients. Features problem framing, solution overview, case studies, pricing, and next steps.",
        "category": "sales",
        "tags": ["sales", "proposal", "client", "B2B", "closing"],
        "slides": [
            {"title": "Client Challenges", "subtitle": "We understand your pain", "bullets": ["Pain point 1", "Pain point 2", "Pain point 3"]},
            {"title": "Our Solution", "subtitle": "Tailored to your needs", "bullets": ["Feature A", "Feature B"]},
            {"title": "Case Study", "subtitle": "How Company X achieved 3x ROI", "bullets": ["Starting point", "Actions taken", "Results"]},
            {"title": "Implementation Timeline", "subtitle": "From kickoff to value in 30 days", "bullets": ["Week 1-2: Onboarding", "Week 3-4: Go-live"]},
            {"title": "Pricing", "subtitle": "Investment options", "bullets": ["Starter plan", "Growth plan", "Enterprise plan"]},
            {"title": "Next Steps", "subtitle": "Let us get started", "bullets": ["Schedule onboarding call", "Sign agreement"]},
        ],
    },
    # 3
    {
        "slug": "marketing-strategy",
        "title": "Free Marketing Strategy Template",
        "description": "Plan and present your marketing strategy with this ready-to-use template. Includes market analysis, target audience, channels, budget, and KPIs.",
        "category": "marketing",
        "tags": ["marketing", "strategy", "digital", "campaign", "growth"],
        "slides": [
            {"title": "Marketing Overview", "subtitle": "Our strategic direction for Q4", "bullets": ["Key objectives", "Budget summary"]},
            {"title": "Target Audience", "subtitle": "Who we are reaching", "bullets": ["Persona 1: Enterprise buyers", "Persona 2: SMB owners"]},
            {"title": "Channel Strategy", "subtitle": "Where we will show up", "bullets": ["Content marketing", "Paid social", "SEO", "Email"]},
            {"title": "Campaign Calendar", "subtitle": "Key dates and launches", "bullets": ["Month 1: Brand awareness", "Month 2: Lead generation", "Month 3: Conversion"]},
            {"title": "Budget Allocation", "subtitle": "Spend breakdown by channel", "bullets": ["40% Paid media", "30% Content", "20% Events", "10% Tools"]},
            {"title": "KPIs & Measurement", "subtitle": "How we track success", "bullets": ["MQLs generated", "CAC reduction", "Brand awareness lift"]},
        ],
    },
    # 4
    {
        "slug": "quarterly-review",
        "title": "Free Quarterly Business Review Template",
        "description": "Present quarterly results with clarity. This QBR template covers performance highlights, financial summary, team updates, and next-quarter goals.",
        "category": "business",
        "tags": ["quarterly", "review", "QBR", "performance", "reporting"],
        "slides": [
            {"title": "Q4 Performance Highlights", "subtitle": "Key wins this quarter", "bullets": ["Revenue up 15%", "Customer satisfaction at 92%"]},
            {"title": "Financial Summary", "subtitle": "Revenue, costs, and margins", "bullets": ["Total revenue: $X", "Gross margin: Y%"]},
            {"title": "Product Updates", "subtitle": "What we shipped", "bullets": ["Feature A launched", "Feature B in beta"]},
            {"title": "Team & Hiring", "subtitle": "Growing the team", "bullets": ["5 new hires", "2 open roles"]},
            {"title": "Challenges & Lessons", "subtitle": "What we learned", "bullets": ["Challenge 1 and mitigation", "Challenge 2 and mitigation"]},
            {"title": "Next Quarter Goals", "subtitle": "Q1 priorities", "bullets": ["Goal 1: Launch v2", "Goal 2: Expand to EU"]},
        ],
    },
    # 5
    {
        "slug": "business-plan",
        "title": "Free Business Plan Presentation Template",
        "description": "Present a compelling business plan to stakeholders, banks, or investors. Covers executive summary, market analysis, operations, financials, and roadmap.",
        "category": "business",
        "tags": ["business plan", "strategy", "executive", "planning", "roadmap"],
        "slides": [
            {"title": "Executive Summary", "subtitle": "Our mission and vision", "bullets": ["Mission statement", "Core value proposition"]},
            {"title": "Market Analysis", "subtitle": "Industry landscape", "bullets": ["Market size and growth", "Competitive overview"]},
            {"title": "Products & Services", "subtitle": "What we offer", "bullets": ["Product line 1", "Product line 2"]},
            {"title": "Operations Plan", "subtitle": "How we deliver", "bullets": ["Supply chain", "Technology stack"]},
            {"title": "Financial Projections", "subtitle": "3-year outlook", "bullets": ["Year 1 revenue target", "Break-even timeline"]},
            {"title": "Roadmap & Milestones", "subtitle": "Key milestones ahead", "bullets": ["Q1: Product launch", "Q3: Series A"]},
        ],
    },
    # 6
    {
        "slug": "investor-update",
        "title": "Free Investor Update Template",
        "description": "Keep your investors informed with a professional monthly or quarterly update. Covers KPIs, financials, product progress, and asks.",
        "category": "finance",
        "tags": ["investor", "update", "fundraising", "KPI", "board"],
        "slides": [
            {"title": "Highlights This Period", "subtitle": "Top 3 wins", "bullets": ["Win 1", "Win 2", "Win 3"]},
            {"title": "Key Metrics", "subtitle": "MRR, churn, growth", "bullets": ["MRR: $X (+Y%)", "Churn: Z%"]},
            {"title": "Product Progress", "subtitle": "What we built", "bullets": ["Shipped feature X", "Beta for feature Y"]},
            {"title": "Financial Overview", "subtitle": "Burn rate and runway", "bullets": ["Monthly burn: $X", "Runway: Y months"]},
            {"title": "Challenges", "subtitle": "Where we need help", "bullets": ["Hiring senior engineers", "Enterprise pipeline"]},
        ],
    },
    # 7
    {
        "slug": "product-launch",
        "title": "Free Product Launch Presentation Template",
        "description": "Announce and present your product launch with impact. Includes product overview, features, competitive positioning, go-to-market plan, and launch timeline.",
        "category": "marketing",
        "tags": ["product", "launch", "go-to-market", "announcement", "release"],
        "slides": [
            {"title": "Introducing [Product Name]", "subtitle": "The future of [category]", "bullets": ["Tagline or one-liner", "Key benefit"]},
            {"title": "The Problem We Solve", "subtitle": "Why this matters now", "bullets": ["Market gap", "User frustration"]},
            {"title": "Key Features", "subtitle": "What makes it great", "bullets": ["Feature 1", "Feature 2", "Feature 3"]},
            {"title": "Competitive Positioning", "subtitle": "How we compare", "bullets": ["vs Competitor A", "vs Competitor B"]},
            {"title": "Go-to-Market Plan", "subtitle": "Launch strategy", "bullets": ["Pre-launch: Beta program", "Launch: PR + Product Hunt", "Post-launch: Content flywheel"]},
            {"title": "Launch Timeline", "subtitle": "Key dates", "bullets": ["Week 1: Internal launch", "Week 2: Public launch"]},
        ],
    },
    # 8
    {
        "slug": "team-onboarding",
        "title": "Free Team Onboarding Presentation Template",
        "description": "Welcome new team members with a structured onboarding presentation. Covers company culture, tools, processes, team introductions, and first-week plan.",
        "category": "hr",
        "tags": ["onboarding", "HR", "team", "culture", "new hire"],
        "slides": [
            {"title": "Welcome to [Company]!", "subtitle": "We are thrilled to have you", "bullets": ["Our mission", "What we value"]},
            {"title": "Company Culture", "subtitle": "How we work together", "bullets": ["Core values", "Communication norms"]},
            {"title": "Tools & Access", "subtitle": "Everything you need", "bullets": ["Slack, Notion, GitHub", "Request access here"]},
            {"title": "Meet the Team", "subtitle": "Your new colleagues", "bullets": ["Engineering team", "Design team", "Product team"]},
            {"title": "Your First Week", "subtitle": "Day-by-day plan", "bullets": ["Day 1: Setup & orientation", "Day 2-3: Shadow sessions", "Day 4-5: First task"]},
        ],
    },
    # 9
    {
        "slug": "course-lecture",
        "title": "Free Course Lecture Presentation Template",
        "description": "Deliver engaging course lectures with this education template. Structured for learning objectives, key concepts, examples, and review questions.",
        "category": "education",
        "tags": ["education", "lecture", "course", "teaching", "academic"],
        "slides": [
            {"title": "Lecture: [Topic Name]", "subtitle": "Module X - Week Y", "bullets": ["Instructor name", "Date"]},
            {"title": "Learning Objectives", "subtitle": "By the end of this lecture you will...", "bullets": ["Understand concept A", "Apply concept B", "Analyze scenario C"]},
            {"title": "Key Concept 1", "subtitle": "Definition and context", "bullets": ["Explanation", "Real-world example"]},
            {"title": "Key Concept 2", "subtitle": "Going deeper", "bullets": ["Detailed breakdown", "Visual diagram reference"]},
            {"title": "Practical Example", "subtitle": "Applying what we learned", "bullets": ["Step 1", "Step 2", "Expected outcome"]},
            {"title": "Review & Questions", "subtitle": "Test your understanding", "bullets": ["Question 1", "Question 2", "Next lecture preview"]},
        ],
    },
    # 10
    {
        "slug": "project-proposal",
        "title": "Free Project Proposal Presentation Template",
        "description": "Win project approvals with this professional proposal template. Covers objectives, scope, timeline, budget, risks, and expected outcomes.",
        "category": "business",
        "tags": ["project", "proposal", "management", "approval", "scope"],
        "slides": [
            {"title": "Project Proposal", "subtitle": "[Project Name]", "bullets": ["Proposed by: [Name]", "Date: [Date]"]},
            {"title": "Objectives", "subtitle": "What we aim to achieve", "bullets": ["Objective 1", "Objective 2"]},
            {"title": "Scope & Deliverables", "subtitle": "What is included", "bullets": ["Deliverable A", "Deliverable B", "Out of scope items"]},
            {"title": "Timeline", "subtitle": "Phase-by-phase plan", "bullets": ["Phase 1: Discovery (2 weeks)", "Phase 2: Build (4 weeks)", "Phase 3: Launch (1 week)"]},
            {"title": "Budget", "subtitle": "Estimated investment", "bullets": ["Personnel: $X", "Tools: $Y", "Contingency: $Z"]},
            {"title": "Risks & Mitigation", "subtitle": "What could go wrong", "bullets": ["Risk 1 and mitigation", "Risk 2 and mitigation"]},
        ],
    },
    # 11
    {
        "slug": "annual-report",
        "title": "Free Annual Report Presentation Template",
        "description": "Summarize your year with a polished annual report. Covers yearly highlights, financial performance, growth metrics, and outlook.",
        "category": "finance",
        "tags": ["annual", "report", "yearly", "performance", "corporate"],
        "slides": [
            {"title": "Annual Report 2024", "subtitle": "A year of growth", "bullets": ["CEO message", "Key theme"]},
            {"title": "Year in Numbers", "subtitle": "Headline metrics", "bullets": ["Revenue: $X", "Customers: Y", "Team: Z people"]},
            {"title": "Financial Performance", "subtitle": "Revenue and profitability", "bullets": ["Revenue growth: X%", "EBITDA margin: Y%"]},
            {"title": "Key Achievements", "subtitle": "What we accomplished", "bullets": ["Achievement 1", "Achievement 2", "Achievement 3"]},
            {"title": "Looking Ahead", "subtitle": "2025 priorities", "bullets": ["Strategic priority 1", "Strategic priority 2"]},
        ],
    },
    # 12
    {
        "slug": "company-overview",
        "title": "Free Company Overview Presentation Template",
        "description": "Introduce your company to partners, clients, or new hires. Covers mission, products, team, traction, and contact information.",
        "category": "business",
        "tags": ["company", "overview", "corporate", "introduction", "about"],
        "slides": [
            {"title": "About [Company Name]", "subtitle": "Who we are", "bullets": ["Founded in [Year]", "Headquartered in [City]"]},
            {"title": "Our Mission", "subtitle": "Why we exist", "bullets": ["Mission statement", "Vision for the future"]},
            {"title": "What We Do", "subtitle": "Products and services", "bullets": ["Product 1", "Product 2", "Service offering"]},
            {"title": "By the Numbers", "subtitle": "Our traction", "bullets": ["X customers", "Y countries", "Z team members"]},
            {"title": "Our Team", "subtitle": "Leadership", "bullets": ["CEO - Name", "CTO - Name", "VP Sales - Name"]},
            {"title": "Get in Touch", "subtitle": "Let us talk", "bullets": ["Email", "Website", "Social media"]},
        ],
    },
    # 13
    {
        "slug": "portfolio-showcase",
        "title": "Free Portfolio Showcase Presentation Template",
        "description": "Show off your best work with a stunning portfolio presentation. Perfect for designers, agencies, and freelancers.",
        "category": "creative",
        "tags": ["portfolio", "showcase", "design", "agency", "freelancer"],
        "slides": [
            {"title": "My Portfolio", "subtitle": "[Your Name] - [Your Role]", "bullets": ["Specialization", "Years of experience"]},
            {"title": "Project 1", "subtitle": "Client name / Project name", "bullets": ["Brief", "Approach", "Results"]},
            {"title": "Project 2", "subtitle": "Client name / Project name", "bullets": ["Brief", "Approach", "Results"]},
            {"title": "Project 3", "subtitle": "Client name / Project name", "bullets": ["Brief", "Approach", "Results"]},
            {"title": "What Clients Say", "subtitle": "Testimonials", "bullets": ["Quote from Client A", "Quote from Client B"]},
            {"title": "Let us Work Together", "subtitle": "Contact and availability", "bullets": ["Email", "LinkedIn", "Available from [Date]"]},
        ],
    },
    # 14
    {
        "slug": "case-study",
        "title": "Free Case Study Presentation Template",
        "description": "Present compelling case studies that showcase results. Covers challenge, approach, solution, results, and key takeaways.",
        "category": "sales",
        "tags": ["case study", "results", "client", "success", "B2B"],
        "slides": [
            {"title": "Case Study: [Client Name]", "subtitle": "How we helped achieve X", "bullets": ["Industry", "Company size"]},
            {"title": "The Challenge", "subtitle": "What the client was facing", "bullets": ["Challenge 1", "Challenge 2"]},
            {"title": "Our Approach", "subtitle": "How we tackled it", "bullets": ["Step 1", "Step 2", "Step 3"]},
            {"title": "The Solution", "subtitle": "What we delivered", "bullets": ["Deliverable A", "Deliverable B"]},
            {"title": "Results", "subtitle": "Measurable impact", "bullets": ["Metric 1: +X%", "Metric 2: -Y%", "ROI: Z%"]},
            {"title": "Key Takeaways", "subtitle": "Lessons learned", "bullets": ["Takeaway 1", "Takeaway 2"]},
        ],
    },
    # 15
    {
        "slug": "workshop-training",
        "title": "Free Workshop & Training Presentation Template",
        "description": "Run engaging workshops and training sessions. Includes agenda, learning objectives, interactive exercises, and wrap-up.",
        "category": "education",
        "tags": ["workshop", "training", "interactive", "learning", "facilitation"],
        "slides": [
            {"title": "Workshop: [Topic]", "subtitle": "Facilitator: [Name]", "bullets": ["Duration: X hours", "Date: [Date]"]},
            {"title": "Agenda", "subtitle": "What we will cover", "bullets": ["Section 1: Introduction (15 min)", "Section 2: Core concepts (30 min)", "Section 3: Hands-on exercise (30 min)", "Section 4: Wrap-up (15 min)"]},
            {"title": "Learning Objectives", "subtitle": "By the end you will be able to...", "bullets": ["Skill 1", "Skill 2", "Skill 3"]},
            {"title": "Core Concepts", "subtitle": "Key ideas to understand", "bullets": ["Concept A", "Concept B"]},
            {"title": "Hands-On Exercise", "subtitle": "Put it into practice", "bullets": ["Instructions", "Expected output", "Time: 20 minutes"]},
            {"title": "Wrap-Up & Resources", "subtitle": "What to do next", "bullets": ["Key takeaways", "Recommended reading", "Follow-up survey link"]},
        ],
    },
    # 16
    {
        "slug": "conference-talk",
        "title": "Free Conference Talk Presentation Template",
        "description": "Deliver memorable conference presentations. Structured for a strong hook, narrative flow, key insights, and a powerful closing.",
        "category": "creative",
        "tags": ["conference", "talk", "speaking", "keynote", "presentation"],
        "slides": [
            {"title": "[Talk Title]", "subtitle": "[Your Name] - [Event Name]", "bullets": ["One-line hook"]},
            {"title": "The Story", "subtitle": "Why this matters", "bullets": ["Personal anecdote or industry trend", "The question we are answering"]},
            {"title": "Insight #1", "subtitle": "First key takeaway", "bullets": ["Supporting evidence", "Real example"]},
            {"title": "Insight #2", "subtitle": "Second key takeaway", "bullets": ["Supporting evidence", "Real example"]},
            {"title": "Insight #3", "subtitle": "Third key takeaway", "bullets": ["Supporting evidence", "Real example"]},
            {"title": "The Takeaway", "subtitle": "One thing to remember", "bullets": ["Call to action", "Where to learn more"]},
        ],
    },
    # 17
    {
        "slug": "research-presentation",
        "title": "Free Research Presentation Template",
        "description": "Present research findings professionally. Covers research question, methodology, data analysis, findings, and conclusions.",
        "category": "research",
        "tags": ["research", "academic", "findings", "methodology", "data"],
        "slides": [
            {"title": "Research Presentation", "subtitle": "[Research Title]", "bullets": ["Researcher(s)", "Institution / Date"]},
            {"title": "Research Question", "subtitle": "What we set out to discover", "bullets": ["Primary question", "Hypothesis"]},
            {"title": "Methodology", "subtitle": "How we conducted the research", "bullets": ["Sample size: N", "Method: qualitative/quantitative", "Tools used"]},
            {"title": "Key Findings", "subtitle": "What the data shows", "bullets": ["Finding 1", "Finding 2", "Finding 3"]},
            {"title": "Analysis & Discussion", "subtitle": "What it means", "bullets": ["Interpretation", "Comparison to existing literature"]},
            {"title": "Conclusions & Next Steps", "subtitle": "Where we go from here", "bullets": ["Summary", "Limitations", "Future research"]},
        ],
    },
    # 18
    {
        "slug": "consulting-deliverable",
        "title": "Free Consulting Deliverable Presentation Template",
        "description": "Deliver polished consulting presentations. Includes executive summary, analysis, recommendations, implementation plan, and appendix.",
        "category": "consulting",
        "tags": ["consulting", "deliverable", "strategy", "recommendation", "McKinsey"],
        "slides": [
            {"title": "Executive Summary", "subtitle": "Key findings and recommendations", "bullets": ["Finding 1", "Finding 2", "Top recommendation"]},
            {"title": "Situation Analysis", "subtitle": "Current state assessment", "bullets": ["Market context", "Internal capabilities", "Gap analysis"]},
            {"title": "Key Findings", "subtitle": "What the data tells us", "bullets": ["Insight 1", "Insight 2", "Insight 3"]},
            {"title": "Recommendations", "subtitle": "Prioritized actions", "bullets": ["Priority 1: Quick win", "Priority 2: Strategic initiative", "Priority 3: Long-term investment"]},
            {"title": "Implementation Roadmap", "subtitle": "Phase-by-phase plan", "bullets": ["Phase 1 (0-3 months)", "Phase 2 (3-6 months)", "Phase 3 (6-12 months)"]},
            {"title": "Appendix", "subtitle": "Supporting data and methodology", "bullets": ["Data sources", "Detailed analysis tables"]},
        ],
    },
    # 19
    {
        "slug": "social-media-strategy",
        "title": "Free Social Media Strategy Presentation Template",
        "description": "Plan your social media strategy with this comprehensive template. Covers audience analysis, platform strategy, content calendar, and metrics.",
        "category": "marketing",
        "tags": ["social media", "strategy", "content", "Instagram", "LinkedIn"],
        "slides": [
            {"title": "Social Media Strategy", "subtitle": "[Brand Name] - [Year]", "bullets": ["Overview and goals"]},
            {"title": "Audience Analysis", "subtitle": "Who we are reaching", "bullets": ["Demographics", "Platforms they use", "Content preferences"]},
            {"title": "Platform Strategy", "subtitle": "Where and how we will show up", "bullets": ["LinkedIn: Thought leadership", "Instagram: Brand storytelling", "Twitter/X: Community engagement"]},
            {"title": "Content Pillars", "subtitle": "What we will post", "bullets": ["Pillar 1: Educational content", "Pillar 2: Behind the scenes", "Pillar 3: User-generated content"]},
            {"title": "Content Calendar", "subtitle": "Monthly posting schedule", "bullets": ["Monday: Tips & tricks", "Wednesday: Case study", "Friday: Fun / culture"]},
            {"title": "Metrics & KPIs", "subtitle": "How we measure success", "bullets": ["Engagement rate target", "Follower growth target", "Click-through rate"]},
        ],
    },
    # 20
    {
        "slug": "budget-review",
        "title": "Free Budget Review Presentation Template",
        "description": "Present budget reviews and financial planning with clarity. Covers actual vs plan, variance analysis, department breakdown, and forecasts.",
        "category": "finance",
        "tags": ["budget", "review", "finance", "planning", "forecast"],
        "slides": [
            {"title": "Budget Review", "subtitle": "[Period] - [Department / Company]", "bullets": ["Presented by: [Name]", "Date"]},
            {"title": "Budget vs Actual", "subtitle": "How we tracked against plan", "bullets": ["Total budget: $X", "Total spent: $Y", "Variance: $Z"]},
            {"title": "Variance Analysis", "subtitle": "Where we over/under spent", "bullets": ["Over budget: Category A (+$X)", "Under budget: Category B (-$Y)"]},
            {"title": "Department Breakdown", "subtitle": "Spend by team", "bullets": ["Engineering: $X", "Marketing: $Y", "Operations: $Z"]},
            {"title": "Forecast", "subtitle": "Next period outlook", "bullets": ["Expected revenue: $X", "Planned spend: $Y", "Projected margin: Z%"]},
        ],
    },
]


def main():
    print("=" * 65)
    print("  Template Gallery Seeder - 20 Presentation Templates")
    print("=" * 65)

    supabase = get_supabase_client()

    success = 0
    skipped = 0
    errors = 0

    for i, tpl in enumerate(TEMPLATES, 1):
        slug = tpl["slug"]
        title = tpl["title"]

        # Check if template already exists
        existing = supabase.table("templates").select("id").eq("slug", slug).execute()
        if existing.data:
            print(f"  [{i:2d}/20] SKIP (exists): {title}")
            skipped += 1
            continue

        # Build deck_data
        deck_data = build_deck_data(title, tpl["slides"])

        row = {
            "slug": slug,
            "title": title,
            "description": tpl["description"],
            "category": tpl["category"],
            "tags": tpl["tags"],
            "deck_data": deck_data,
            "thumbnail_url": None,
            "use_count": 0,
            "is_active": True,
        }

        try:
            supabase.table("templates").insert(row).execute()
            print(f"  [{i:2d}/20] SEEDED: {title} ({len(tpl['slides'])} slides)")
            success += 1
        except Exception as e:
            print(f"  [{i:2d}/20] ERROR: {title} - {e}")
            errors += 1

    print()
    print("=" * 65)
    print(f"  Done! Seeded: {success}, Skipped: {skipped}, Errors: {errors}")
    print("=" * 65)


if __name__ == "__main__":
    main()
