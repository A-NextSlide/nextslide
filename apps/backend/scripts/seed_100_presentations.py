#!/usr/bin/env python3
"""
Seed 100 community presentations across 5 API keys (20 each).

Creates diverse presentations spanning every category and use case
for SEO landing pages, templates page, and community showcase.

Usage:
    cd apps/backend
    python scripts/seed_100_presentations.py
"""

import os
import sys
import time
import asyncio

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import httpx
from services.supabase import get_supabase_client
from services.api_key_service import get_api_key_service

USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"
API_BASE = "http://localhost:9090"

# ─────────────────────────────────────────────────────────────────────
# Font & style instructions shared across all presentations
# ─────────────────────────────────────────────────────────────────────

FONT = (
    "Use clean, professional fonts only — Inter, Montserrat, or similar sans-serif. "
    "No decorative or script fonts. Keep text minimal and impactful. "
    "Large bold headings, short bullet points. Lots of whitespace. "
    "Make it visually stunning with strong layout and color choices."
)

# ─────────────────────────────────────────────────────────────────────
# 100 presentations organized in 5 batches of 20
# Each batch uses a separate API key
# ─────────────────────────────────────────────────────────────────────

BATCH_1 = [
    # ── Startup & Business ──────────────────────────────────────
    {
        "id": "saas-metrics",
        "category": "business",
        "topic": "SaaS Metrics Dashboard: The 12 Numbers Every Founder Must Track",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Data-heavy SaaS metrics deck. Include: MRR/ARR charts, churn rate waterfall, "
            "LTV/CAC ratio gauge, net revenue retention graph, magic number calculation. "
            "Use dashboard-style layouts with metric cards and sparklines. "
            "Color-code healthy vs warning vs critical thresholds."
        ),
    },
    {
        "id": "series-b-fundraise",
        "category": "business",
        "topic": "Series B Fundraising Playbook: From $10M to $50M ARR",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Growth-stage fundraising deck. Show revenue trajectory charts, "
            "cohort analysis heatmaps, unit economics breakdown, expansion revenue pie charts. "
            "Include a competitive landscape quadrant chart. "
            "Make it feel like a top-tier VC memo with data on every slide."
        ),
    },
    {
        "id": "remote-culture",
        "category": "business",
        "topic": "Building a World-Class Remote Team Culture",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Modern remote work presentation. Include timezone overlap diagrams, "
            "communication tool stack comparison, async vs sync workflow charts. "
            "Show employee satisfaction metrics and retention data. "
            "Use a warm, human-centered design with team-oriented visuals."
        ),
    },
    {
        "id": "marketplace-pitch",
        "category": "business",
        "topic": "Two-Sided Marketplace Pitch: Solving the Chicken-and-Egg Problem",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Marketplace startup pitch. Show network effects flywheel diagram, "
            "supply/demand growth charts, take rate analysis, GMV projections. "
            "Include a liquidity score framework. Visual and data-rich."
        ),
    },
    # ── Education ───────────────────────────────────────────────
    {
        "id": "solar-system",
        "category": "education",
        "topic": "A Tour of Our Solar System: From Mercury to the Kuiper Belt",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Space science educational deck. Include comparative planet size diagrams, "
            "orbital distance scale charts, surface temperature bar graphs, "
            "composition pie charts for each planet. "
            "Make it visually stunning with a dark space theme."
        ),
    },
    {
        "id": "creative-writing",
        "category": "education",
        "topic": "Creative Writing Workshop: Crafting Stories That Stick",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Engaging writing workshop slides. Include story arc diagrams (Freytag's pyramid), "
            "character development frameworks, dialogue formatting examples. "
            "Show before/after writing samples. Clean, literary design aesthetic."
        ),
    },
    {
        "id": "machine-learning-101",
        "category": "education",
        "topic": "Machine Learning for Beginners: From Data to Predictions",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Technical but accessible ML intro. Include decision tree diagrams, "
            "neural network layer visualizations, training vs validation loss curves, "
            "confusion matrix examples, bias-variance tradeoff chart. "
            "Use code snippets sparingly for key concepts."
        ),
    },
    {
        "id": "world-war-2",
        "category": "education",
        "topic": "World War II: A Visual Timeline of the Global Conflict",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Historical timeline presentation. Include campaign maps, "
            "casualty statistics by country (bar charts), timeline of key battles, "
            "economic impact charts, before/after territorial maps. "
            "Respectful, documentary-style tone with heavy data visualization."
        ),
    },
    # ── Marketing & Sales ───────────────────────────────────────
    {
        "id": "brand-positioning",
        "category": "marketing",
        "topic": "Brand Positioning Strategy: Standing Out in a Crowded Market",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Strategic brand deck. Include perceptual positioning maps (2x2 grids), "
            "brand archetype wheel, competitor brand audit table, "
            "brand voice spectrum chart, messaging hierarchy pyramid. "
            "Polished and strategic, like a brand agency deliverable."
        ),
    },
    {
        "id": "email-marketing",
        "category": "marketing",
        "topic": "Email Marketing Masterclass: Sequences That Convert at 40%",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Email marketing strategy deck. Include funnel visualization with conversion rates, "
            "A/B test results comparison charts, open rate benchmarks by industry table, "
            "email sequence flow diagrams, subject line analysis. "
            "Data-driven with clear actionable takeaways."
        ),
    },
    {
        "id": "enterprise-sales",
        "category": "sales",
        "topic": "Enterprise Sales Playbook: Closing Six-Figure Deals",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Enterprise sales methodology deck. Include sales cycle timeline, "
            "MEDDIC framework diagram, stakeholder mapping matrix, "
            "deal qualification scorecard, pipeline velocity metrics. "
            "Professional and methodical, like a Salesforce consulting deck."
        ),
    },
    {
        "id": "product-demo-saas",
        "category": "sales",
        "topic": "SaaS Product Demo: Turning Free Trials into Enterprise Contracts",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Product demonstration deck. Include feature comparison table vs competitors, "
            "workflow before/after diagrams, customer success metrics, "
            "integration ecosystem diagram, pricing tier comparison. "
            "Clean and persuasive with clear value demonstration."
        ),
    },
    # ── Finance ─────────────────────────────────────────────────
    {
        "id": "crypto-analysis",
        "category": "finance",
        "topic": "Cryptocurrency Market Analysis: DeFi, NFTs, and Layer 2 Trends",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Crypto market analysis with heavy data. Include TVL charts for DeFi protocols, "
            "blockchain transaction volume comparisons, gas fee trend lines, "
            "market cap dominance pie charts, layer 2 scaling comparison table. "
            "Modern tech-finance aesthetic with dark theme option."
        ),
    },
    {
        "id": "real-estate-invest",
        "category": "finance",
        "topic": "Real Estate Investment Analysis: Residential vs Commercial ROI",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Investment analysis deck. Include cap rate comparison charts, "
            "cash flow projection tables, market trend line graphs, "
            "risk assessment matrix, geographic heat maps of returns. "
            "Professional financial presentation with clean data tables."
        ),
    },
    # ── Technology ──────────────────────────────────────────────
    {
        "id": "api-architecture",
        "category": "technology",
        "topic": "Modern API Architecture: REST vs GraphQL vs gRPC",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Technical architecture comparison. Include request/response flow diagrams, "
            "performance benchmark bar charts, feature comparison matrix, "
            "use case decision tree, migration path flowcharts. "
            "Developer-focused with clean diagrams and minimal code samples."
        ),
    },
    {
        "id": "cybersecurity-101",
        "category": "technology",
        "topic": "Cybersecurity Essentials: Protecting Your Organization in 2025",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Security awareness presentation. Include threat landscape overview with statistics, "
            "attack vector diagrams, zero trust architecture flowchart, "
            "incident response timeline, compliance checklist comparison table. "
            "Authoritative and data-driven, suitable for executive audience."
        ),
    },
    # ── Creative & Fun ──────────────────────────────────────────
    {
        "id": "photography-basics",
        "category": "creative",
        "topic": "Photography Fundamentals: Composition, Lighting, and Storytelling",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Visual arts education deck. Include rule of thirds grid diagrams, "
            "exposure triangle visualization, aperture comparison chart, "
            "color theory wheel, composition technique examples. "
            "Clean and visual, letting the concepts speak through layout."
        ),
    },
    {
        "id": "ancient-egypt",
        "category": "education",
        "topic": "Ancient Egypt: Pyramids, Pharaohs, and the Nile Civilization",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Historical educational deck. Include timeline of dynasties, "
            "architectural diagrams of pyramid construction, Nile flood cycle charts, "
            "hieroglyph examples, trade route maps. "
            "Rich and immersive with a warm, sand-toned color palette."
        ),
    },
    {
        "id": "music-theory",
        "category": "education",
        "topic": "Music Theory Crash Course: Scales, Chords, and Progressions",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Music education presentation. Include scale diagrams, "
            "chord construction visualizations, circle of fifths diagram, "
            "common progression charts, frequency/note relationship graphs. "
            "Modern and clean with a creative, rhythmic layout."
        ),
    },
    {
        "id": "growth-hacking",
        "category": "marketing",
        "topic": "Growth Hacking Playbook: 10 Tactics That Took Startups from 0 to 1M Users",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Growth marketing case study. Include viral coefficient calculations, "
            "referral loop diagrams, A/B test result comparisons, "
            "channel performance waterfall chart, growth experiment framework. "
            "Energetic, startup-flavored design with strong data storytelling."
        ),
    },
]

BATCH_2 = [
    # ── Consulting ──────────────────────────────────────────────
    {
        "id": "digital-transformation",
        "category": "consulting",
        "topic": "Digital Transformation Roadmap: Legacy to Cloud-Native in 18 Months",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Enterprise consulting deliverable. Include maturity assessment framework, "
            "migration roadmap Gantt chart, cost-benefit analysis table, "
            "risk heatmap, technology stack comparison, change management timeline. "
            "McKinsey-quality with structured frameworks on every slide."
        ),
    },
    {
        "id": "market-entry",
        "category": "consulting",
        "topic": "Market Entry Strategy: Expanding into Southeast Asia",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Market analysis consulting deck. Include market size by country bar charts, "
            "regulatory comparison matrix, competitive landscape mapping, "
            "entry mode decision tree, financial projections by scenario. "
            "Data-rich with geographic visualizations."
        ),
    },
    {
        "id": "org-restructure",
        "category": "consulting",
        "topic": "Organizational Restructuring: From Silos to Cross-Functional Teams",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Change management consulting deck. Include current vs proposed org charts, "
            "RACI matrix, communication flow diagrams, transition timeline, "
            "success metrics dashboard. Professional and structured."
        ),
    },
    # ── HR & People ─────────────────────────────────────────────
    {
        "id": "dei-strategy",
        "category": "hr",
        "topic": "DEI Strategy Report: Building an Inclusive Workplace",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "People & culture presentation. Include diversity metrics dashboard, "
            "representation bar charts, pay equity analysis, inclusion survey results, "
            "initiative timeline with milestones. "
            "Warm, inclusive design with data backing every point."
        ),
    },
    {
        "id": "performance-review",
        "category": "hr",
        "topic": "Performance Review Framework: OKRs, 360 Feedback, and Growth Plans",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "HR process deck. Include OKR hierarchy diagram, "
            "feedback collection workflow, competency matrix, "
            "growth plan template, review cycle calendar. "
            "Clean and systematic with framework visualizations."
        ),
    },
    {
        "id": "employer-branding",
        "category": "hr",
        "topic": "Employer Branding Playbook: Attracting Top Talent in a Competitive Market",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Talent acquisition strategy. Include employer brand funnel, "
            "candidate experience journey map, EVP framework, "
            "recruitment channel ROI comparison, glassdoor score benchmarks. "
            "Modern and aspirational design."
        ),
    },
    # ── Research ────────────────────────────────────────────────
    {
        "id": "user-research",
        "category": "research",
        "topic": "UX Research Report: User Behavior Patterns in Mobile Banking Apps",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Research findings deck. Include user journey maps, "
            "task completion rate bar charts, heatmap visualizations, "
            "persona cards, affinity diagram summary, "
            "recommendation priority matrix. Professional UX research format."
        ),
    },
    {
        "id": "climate-tech",
        "category": "research",
        "topic": "Climate Tech Investment Landscape: Where Capital Meets Carbon Reduction",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Research and investment analysis. Include funding by sector bar charts, "
            "carbon reduction potential vs cost scatter plot, "
            "technology readiness levels comparison, geographic investment heatmap, "
            "timeline of policy drivers. Authoritative and data-dense."
        ),
    },
    # ── Health & Wellness ───────────────────────────────────────
    {
        "id": "nutrition-science",
        "category": "education",
        "topic": "The Science of Nutrition: Macros, Micros, and Metabolic Health",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Health science educational deck. Include macronutrient ratio pie charts, "
            "vitamin function comparison table, metabolic pathway diagrams, "
            "daily intake recommendation bar charts, meal planning framework. "
            "Clean, scientific design with health-focused color palette."
        ),
    },
    {
        "id": "mental-health",
        "category": "education",
        "topic": "Mental Health Awareness: Understanding Anxiety, Depression, and Resilience",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Sensitive, well-designed educational deck. Include prevalence statistics, "
            "stress response cycle diagram, coping strategy frameworks, "
            "resource guide table, self-assessment checklist. "
            "Calming color palette, empathetic tone, evidence-based content."
        ),
    },
    # ── Nonprofit ───────────────────────────────────────────────
    {
        "id": "nonprofit-impact",
        "category": "business",
        "topic": "Annual Impact Report: How Your Donations Changed 10,000 Lives",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Nonprofit impact presentation. Include beneficiary count growth charts, "
            "program allocation pie chart, geographic reach map, "
            "before/after impact metrics, donor ROI visualization, "
            "testimonial highlights. Warm, impactful design with storytelling."
        ),
    },
    {
        "id": "grant-proposal",
        "category": "business",
        "topic": "Grant Proposal Presentation: Securing Funding for Community Education",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Formal grant proposal deck. Include needs assessment data, "
            "program logic model diagram, budget breakdown table, "
            "evaluation framework, sustainability plan timeline. "
            "Professional and evidence-based, suitable for foundation review."
        ),
    },
    # ── Fun & Viral ─────────────────────────────────────────────
    {
        "id": "space-exploration",
        "category": "education",
        "topic": "The Future of Space Exploration: Mars Colonies to Interstellar Travel",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Futuristic space science deck. Include mission timeline charts, "
            "rocket comparison diagrams, cost-per-kg to orbit trends, "
            "planetary colonization feasibility matrix, technology roadmap. "
            "Inspiring, forward-looking design with dark space aesthetic."
        ),
    },
    {
        "id": "evolution-of-gaming",
        "category": "creative",
        "topic": "The Evolution of Video Games: From Pong to Virtual Reality",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Gaming history presentation. Include console generation timeline, "
            "industry revenue growth charts, genre popularity trends, "
            "graphics evolution comparison, market size by platform pie charts. "
            "Fun, colorful design with nostalgic and modern contrast."
        ),
    },
    {
        "id": "sleep-science",
        "category": "education",
        "topic": "The Science of Sleep: Why Your Brain Needs 8 Hours",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Sleep science educational deck. Include sleep cycle stage diagrams, "
            "circadian rhythm graphs, sleep deprivation impact statistics, "
            "sleep hygiene checklist, age-based sleep needs chart. "
            "Calming design with blues and purples, scientific but accessible."
        ),
    },
    {
        "id": "street-food",
        "category": "creative",
        "topic": "Street Food Around the World: A Culinary Journey Across 6 Continents",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Culinary exploration presentation. Include world map of iconic street foods, "
            "price comparison charts by country, ingredient breakdown diagrams, "
            "popularity rankings, food culture timelines. "
            "Vibrant, warm design that makes you hungry."
        ),
    },
    # ── Ecommerce ───────────────────────────────────────────────
    {
        "id": "ecommerce-growth",
        "category": "business",
        "topic": "Scaling an Ecommerce Brand from $0 to $1M in 12 Months",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Growth case study deck. Include revenue ramp chart, "
            "marketing channel attribution pie chart, CAC payback timeline, "
            "product-market fit metrics, inventory management framework. "
            "Entrepreneurial energy with clean data storytelling."
        ),
    },
    {
        "id": "d2c-brand",
        "category": "marketing",
        "topic": "Direct-to-Consumer Brand Strategy: Building Loyalty Without Retailers",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Brand strategy presentation. Include customer lifecycle diagram, "
            "retention cohort charts, brand touchpoint map, "
            "community flywheel visualization, LTV projections by channel. "
            "Modern, bold design with strong brand aesthetic."
        ),
    },
    # ── Legal ───────────────────────────────────────────────────
    {
        "id": "ip-strategy",
        "category": "business",
        "topic": "Intellectual Property Strategy for Startups: Patents, Trademarks, and Trade Secrets",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Legal strategy deck. Include IP protection type comparison table, "
            "filing timeline flowchart, cost breakdown by IP type, "
            "risk assessment matrix, portfolio management framework. "
            "Professional and authoritative with clean legal formatting."
        ),
    },
    {
        "id": "compliance-gdpr",
        "category": "technology",
        "topic": "GDPR & Data Privacy Compliance: A Practical Guide for Product Teams",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Compliance training deck. Include data flow diagrams, "
            "consent management workflow, rights request process flowchart, "
            "penalty severity scale, compliance checklist by role. "
            "Clear, structured design suitable for training sessions."
        ),
    },
]

BATCH_3 = [
    # ── Sports & Fitness ────────────────────────────────────────
    {
        "id": "sports-analytics",
        "category": "research",
        "topic": "Sports Analytics: How Data Science is Changing Professional Basketball",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Sports data science presentation. Include shot chart heatmaps, "
            "player efficiency rating comparisons, win probability models, "
            "salary cap analysis charts, draft pick value curves. "
            "Dynamic, energetic design with sports-themed visualization."
        ),
    },
    {
        "id": "fitness-programming",
        "category": "education",
        "topic": "Evidence-Based Strength Training: Programming for Maximum Results",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Fitness education deck. Include progressive overload charts, "
            "muscle group activation diagrams, rep scheme comparison table, "
            "periodization calendar, recovery timeline visualization. "
            "Clean, modern fitness aesthetic with scientific backing."
        ),
    },
    # ── Travel & Hospitality ────────────────────────────────────
    {
        "id": "travel-startup",
        "category": "business",
        "topic": "Disrupting Travel: AI-Powered Personalized Trip Planning",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Travel tech startup pitch. Include market size charts, "
            "user flow diagrams, booking funnel metrics, "
            "competitor feature matrix, revenue model visualization. "
            "Wanderlust-inspired design with clean tech aesthetics."
        ),
    },
    {
        "id": "hotel-revenue",
        "category": "business",
        "topic": "Hotel Revenue Management: Dynamic Pricing Strategies for Maximum Occupancy",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Hospitality business deck. Include occupancy rate trend charts, "
            "RevPAR comparison by season, pricing elasticity curves, "
            "channel distribution pie chart, demand forecasting models. "
            "Elegant hospitality design with sharp financial data."
        ),
    },
    # ── Sustainability ──────────────────────────────────────────
    {
        "id": "esg-report",
        "category": "business",
        "topic": "ESG Report: Our Journey Toward Net Zero by 2035",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Corporate sustainability report. Include emissions reduction trajectory, "
            "scope 1/2/3 breakdown pie chart, renewable energy adoption line graph, "
            "supply chain sustainability scorecard, water usage trends. "
            "Green-themed, professional corporate report style."
        ),
    },
    {
        "id": "circular-economy",
        "category": "education",
        "topic": "The Circular Economy: Rethinking Waste in the 21st Century",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Educational sustainability deck. Include linear vs circular model diagrams, "
            "waste reduction statistics, material flow charts, "
            "business model innovation examples, lifecycle analysis visualization. "
            "Modern, eco-conscious design with earth tones."
        ),
    },
    # ── Product Management ──────────────────────────────────────
    {
        "id": "product-strategy",
        "category": "technology",
        "topic": "Product Strategy Framework: From Vision to Roadmap to Execution",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Product management framework deck. Include vision-strategy-execution pyramid, "
            "opportunity scoring matrix, RICE prioritization table, "
            "roadmap timeline visualization, product-market fit canvas. "
            "Clean, structured design favored by top PMs."
        ),
    },
    {
        "id": "product-launch-plan",
        "category": "marketing",
        "topic": "Go-to-Market Launch Plan: Coordinating Product, Sales, and Marketing",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Cross-functional launch plan. Include launch timeline Gantt chart, "
            "team responsibility matrix, channel activation checklist, "
            "launch metrics dashboard, feedback loop diagram. "
            "Action-oriented with clear ownership and deadlines."
        ),
    },
    # ── Data & AI ───────────────────────────────────────────────
    {
        "id": "data-warehouse",
        "category": "technology",
        "topic": "Modern Data Stack: Building a Data Warehouse That Scales",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Technical architecture deck. Include data pipeline flow diagram, "
            "tool comparison matrix (Snowflake vs BigQuery vs Databricks), "
            "cost optimization charts, data governance framework, "
            "query performance benchmarks. Clean technical diagrams."
        ),
    },
    {
        "id": "llm-fine-tuning",
        "category": "technology",
        "topic": "Fine-Tuning LLMs for Production: A Practical Engineering Guide",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Technical AI engineering deck. Include model size vs performance curves, "
            "training cost comparison table, evaluation metric dashboards, "
            "deployment architecture diagram, inference latency benchmarks. "
            "Developer-focused with technical depth and clean visuals."
        ),
    },
    # ── Personal Development ────────────────────────────────────
    {
        "id": "public-speaking",
        "category": "education",
        "topic": "The Art of Public Speaking: From Nervous to Confident in 10 Steps",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Personal development presentation. Include fear vs confidence spectrum, "
            "preparation framework checklist, body language guide, "
            "speech structure templates, practice progression chart. "
            "Encouraging, warm design with clear action steps."
        ),
    },
    {
        "id": "time-management",
        "category": "education",
        "topic": "Time Management for Knowledge Workers: Beyond To-Do Lists",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Productivity methodology deck. Include Eisenhower matrix, "
            "time audit pie charts, energy management curves, "
            "deep work block scheduling templates, tool comparison table. "
            "Clean, minimal design that practices what it preaches."
        ),
    },
    # ── Architecture & Design ───────────────────────────────────
    {
        "id": "sustainable-arch",
        "category": "creative",
        "topic": "Sustainable Architecture: Designing Buildings That Heal the Planet",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Architecture and design presentation. Include building energy efficiency comparisons, "
            "LEED certification criteria table, material lifecycle diagrams, "
            "passive design strategy illustrations, cost-benefit analysis. "
            "Elegant, architectural design aesthetic with clean lines."
        ),
    },
    {
        "id": "ui-design-trends",
        "category": "creative",
        "topic": "UI Design Trends 2025: Glassmorphism, 3D, and Spatial Computing",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Design trends overview. Include trend timeline evolution chart, "
            "style comparison matrix, adoption rate statistics, "
            "platform-specific design guidelines, tool ecosystem map. "
            "Itself a showcase of modern design with cutting-edge aesthetics."
        ),
    },
    # ── Economics ────────────────────────────────────────────────
    {
        "id": "inflation-explained",
        "category": "education",
        "topic": "Understanding Inflation: Why Prices Rise and What It Means for You",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Economics educational deck. Include CPI trend line charts, "
            "money supply vs inflation scatter plots, purchasing power over time graphs, "
            "central bank rate comparison table, sector-by-sector price impact bars. "
            "Accessible economic education with clear data storytelling."
        ),
    },
    {
        "id": "supply-chain",
        "category": "business",
        "topic": "Supply Chain Resilience: Lessons from Global Disruptions",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Supply chain strategy deck. Include global shipping route maps, "
            "lead time comparison charts, inventory management models, "
            "risk mitigation framework, supplier diversification matrix. "
            "Professional with logistics-focused visualizations."
        ),
    },
    # ── Science ─────────────────────────────────────────────────
    {
        "id": "quantum-computing",
        "category": "technology",
        "topic": "Quantum Computing Explained: Qubits, Superposition, and Real-World Applications",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Advanced tech explainer. Include qubit vs bit comparison diagrams, "
            "quantum gate visualizations, algorithm performance comparison charts, "
            "industry application mapping, technology timeline roadmap. "
            "Futuristic design with clean technical illustrations."
        ),
    },
    {
        "id": "genetics-101",
        "category": "education",
        "topic": "Genetics and DNA: The Blueprint of Life",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Biology education deck. Include DNA double helix structure diagram, "
            "gene expression flowchart, Punnett square examples, "
            "genome sequencing cost over time chart, CRISPR mechanism diagram. "
            "Scientific but beautiful with molecular biology aesthetics."
        ),
    },
    # ── Media & Entertainment ───────────────────────────────────
    {
        "id": "streaming-wars",
        "category": "business",
        "topic": "The Streaming Wars: Who Wins When Everyone Has a Platform",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Industry analysis deck. Include subscriber count comparison bar charts, "
            "content spending trend lines, market share pie charts over time, "
            "ARPU comparison table, churn rate analysis by platform. "
            "Media industry aesthetic with bold data visualizations."
        ),
    },
    {
        "id": "podcast-business",
        "category": "marketing",
        "topic": "Building a Podcast Empire: Content Strategy to Monetization",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Content business strategy. Include listener growth curves, "
            "monetization model comparison table, content pillar framework, "
            "audience demographic pie charts, sponsorship rate benchmarks. "
            "Creative and modern with audio/media design elements."
        ),
    },
]

BATCH_4 = [
    # ── More Business Verticals ─────────────────────────────────
    {
        "id": "restaurant-business",
        "category": "business",
        "topic": "Restaurant Business Plan: From Concept to Grand Opening",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Restaurant pitch deck. Include floor plan layout, "
            "menu pricing strategy table, break-even analysis chart, "
            "location analysis comparison, revenue projection by meal period. "
            "Warm, appetizing design with clean business data."
        ),
    },
    {
        "id": "healthcare-ai",
        "category": "technology",
        "topic": "AI in Healthcare: Diagnosis, Treatment, and the Future of Medicine",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Health tech presentation. Include AI accuracy vs human doctor comparisons, "
            "diagnostic workflow diagrams, FDA approval timeline, "
            "market size projections, ethical considerations framework. "
            "Clean medical/tech aesthetic with authoritative data."
        ),
    },
    {
        "id": "fintech-pitch",
        "category": "business",
        "topic": "Fintech Disruption: Neobanks, BNPL, and Embedded Finance",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Fintech industry overview. Include market map of fintech segments, "
            "funding trend charts, user adoption curves, "
            "revenue model comparison table, regulatory landscape matrix. "
            "Modern financial design with tech startup energy."
        ),
    },
    {
        "id": "vc-fund-deck",
        "category": "finance",
        "topic": "Venture Capital Fund Overview: $100M Fund III Performance Report",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "LP report for VC fund. Include portfolio company summary table, "
            "fund performance vs benchmark charts, IRR/TVPI metrics, "
            "sector allocation pie chart, deployment pace timeline, "
            "top performer case studies. Institutional investor quality."
        ),
    },
    # ── Education Continued ─────────────────────────────────────
    {
        "id": "climate-change-kids",
        "category": "education",
        "topic": "Climate Change for Kids: What's Happening to Our Planet and How We Can Help",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Kid-friendly educational deck. Include temperature change bar chart (simplified), "
            "cause and effect diagrams, action steps checklist, "
            "endangered species counter, recycling process flow. "
            "Bright, friendly colors with simple but accurate data."
        ),
    },
    {
        "id": "psychology-101",
        "category": "education",
        "topic": "Introduction to Psychology: How the Mind Works",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Psychology course lecture. Include brain region diagram, "
            "classical conditioning flow chart, Maslow's hierarchy pyramid, "
            "cognitive bias examples table, research methodology overview. "
            "Academic but engaging with mind/brain-themed design."
        ),
    },
    {
        "id": "personal-finance",
        "category": "education",
        "topic": "Personal Finance 101: Budgeting, Investing, and Building Wealth",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Financial literacy education. Include budget allocation pie chart, "
            "compound interest growth curves, investment vehicle comparison table, "
            "emergency fund calculator, debt payoff strategy comparison. "
            "Friendly, accessible design that makes money less scary."
        ),
    },
    {
        "id": "philosophy-ethics",
        "category": "education",
        "topic": "Ethics in the Age of AI: Philosophical Frameworks for Modern Dilemmas",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Philosophy and ethics presentation. Include ethical framework comparison table, "
            "trolley problem variations diagram, stakeholder impact matrix, "
            "AI decision-making flowchart, historical timeline of ethics. "
            "Thoughtful, minimalist design with philosophical depth."
        ),
    },
    # ── Marketing Continued ─────────────────────────────────────
    {
        "id": "influencer-marketing",
        "category": "marketing",
        "topic": "Influencer Marketing Strategy: Micro vs Macro vs Nano Creators",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Influencer strategy deck. Include creator tier comparison table, "
            "engagement rate benchmarks by follower count, campaign ROI charts, "
            "platform distribution pie chart, content format performance bars. "
            "Modern social media aesthetic with bold colors."
        ),
    },
    {
        "id": "seo-strategy",
        "category": "marketing",
        "topic": "SEO Strategy for 2025: Technical, Content, and Authority Building",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "SEO strategy presentation. Include keyword difficulty vs volume scatter plot, "
            "technical SEO audit checklist, content gap analysis, "
            "link building strategy funnel, rank tracking dashboard. "
            "Data-driven marketing design with clear action items."
        ),
    },
    # ── Sales Continued ─────────────────────────────────────────
    {
        "id": "customer-success",
        "category": "sales",
        "topic": "Customer Success Playbook: Reducing Churn from 8% to 2%",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "CS strategy deck. Include churn reduction waterfall chart, "
            "health score framework, customer journey touchpoint map, "
            "NPS trend lines, expansion revenue metrics. "
            "Success-focused green/blue palette with strong metrics."
        ),
    },
    {
        "id": "channel-partner",
        "category": "sales",
        "topic": "Channel Partner Program: Scaling Revenue Through Strategic Alliances",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Partner program deck. Include partner tier structure diagram, "
            "revenue share model comparison, enablement program timeline, "
            "partner performance scorecard, co-marketing framework. "
            "Professional partnership design with clear value props."
        ),
    },
    # ── Science & Nature ────────────────────────────────────────
    {
        "id": "ocean-exploration",
        "category": "education",
        "topic": "Deep Ocean Exploration: What Lives in the Abyss",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Marine science educational deck. Include ocean depth zone diagrams, "
            "species diversity by depth chart, pressure comparison visualization, "
            "underwater exploration technology timeline, biodiversity statistics. "
            "Deep blue oceanic design with wonder-inspiring visuals."
        ),
    },
    {
        "id": "renewable-energy",
        "category": "technology",
        "topic": "Renewable Energy Comparison: Solar vs Wind vs Nuclear vs Hydro",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Energy technology comparison. Include levelized cost of energy bar chart, "
            "capacity factor comparison, global adoption trend lines, "
            "environmental impact matrix, grid integration challenges table. "
            "Green energy design with comprehensive data comparison."
        ),
    },
    {
        "id": "dinosaurs",
        "category": "education",
        "topic": "The Age of Dinosaurs: 165 Million Years of Prehistoric Life",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Paleontology educational deck. Include geologic timeline, "
            "dinosaur size comparison charts, extinction event data, "
            "fossil discovery map, evolution tree diagram. "
            "Dramatic, prehistoric design with rich earth tones."
        ),
    },
    # ── Fun & Culture ───────────────────────────────────────────
    {
        "id": "anime-history",
        "category": "creative",
        "topic": "The History of Anime: From Astro Boy to Demon Slayer",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Entertainment history presentation. Include anime industry revenue charts, "
            "genre popularity evolution timeline, studio comparison table, "
            "global viewership growth, cultural impact metrics. "
            "Vibrant, dynamic design inspired by anime aesthetics."
        ),
    },
    {
        "id": "coffee-business",
        "category": "business",
        "topic": "The $500 Billion Coffee Industry: From Bean to Cup Economics",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Industry analysis presentation. Include global production map, "
            "supply chain value breakdown, price trend charts, "
            "consumption per capita rankings, specialty coffee market growth. "
            "Rich, warm coffee-inspired design with sharp data."
        ),
    },
    {
        "id": "movie-economics",
        "category": "creative",
        "topic": "The Economics of Hollywood: What Makes a Blockbuster Profitable",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Entertainment economics deck. Include budget vs box office scatter plot, "
            "revenue stream breakdown pie chart, franchise value rankings, "
            "marketing spend ROI analysis, streaming vs theatrical comparison. "
            "Cinematic design with bold data visualization."
        ),
    },
    {
        "id": "board-games",
        "category": "creative",
        "topic": "The Renaissance of Board Games: Why Analog Gaming is Booming",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Hobby industry presentation. Include market growth line charts, "
            "Kickstarter funding trends, genre popularity breakdown, "
            "demographic data pie charts, game mechanic comparison table. "
            "Playful but polished design with game-inspired elements."
        ),
    },
    {
        "id": "language-learning",
        "category": "education",
        "topic": "The Science of Language Learning: Why Immersion Beats Textbooks",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Linguistics education deck. Include language acquisition stage diagram, "
            "method comparison effectiveness chart, memory retention curves, "
            "polyglot strategy framework, app comparison matrix. "
            "International, multicultural design with learning science data."
        ),
    },
]

BATCH_5 = [
    # ── Advanced Business ───────────────────────────────────────
    {
        "id": "m-and-a",
        "category": "finance",
        "topic": "Mergers & Acquisitions: Due Diligence Framework for Tech Companies",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Investment banking style deck. Include due diligence checklist matrix, "
            "valuation methodology comparison, synergy analysis waterfall chart, "
            "integration timeline Gantt, financial model summary table. "
            "Corporate finance aesthetic with meticulous data presentation."
        ),
    },
    {
        "id": "board-meeting",
        "category": "business",
        "topic": "Board Meeting Deck: Q4 Performance, Strategy Update, and 2025 Planning",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Executive board deck. Include financial dashboard summary, "
            "KPI traffic light scorecards, strategic initiative status table, "
            "risk register heatmap, capital allocation pie chart, "
            "key decision items with recommendations. Board-ready quality."
        ),
    },
    {
        "id": "pricing-strategy",
        "category": "business",
        "topic": "Pricing Strategy Deep Dive: Value-Based Pricing for SaaS Products",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Strategic pricing deck. Include willingness-to-pay distribution curves, "
            "pricing model comparison table, elasticity analysis charts, "
            "competitive pricing landscape, revenue impact simulation. "
            "Analytical and strategic with clear recommendations."
        ),
    },
    {
        "id": "customer-journey",
        "category": "marketing",
        "topic": "Customer Journey Mapping: Every Touchpoint from Awareness to Advocacy",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Customer experience strategy deck. Include end-to-end journey map, "
            "emotion curve visualization, touchpoint effectiveness matrix, "
            "pain point prioritization, moment of truth framework. "
            "Human-centered design with experience mapping visuals."
        ),
    },
    # ── More Education ──────────────────────────────────────────
    {
        "id": "statistics-101",
        "category": "education",
        "topic": "Statistics for Everyone: Mean, Median, Mode, and Why They Matter",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Math education deck. Include distribution curve visualizations, "
            "comparison of central tendency measures, real-world examples with data, "
            "standard deviation visualization, correlation vs causation examples. "
            "Friendly, approachable math design with clear visuals."
        ),
    },
    {
        "id": "us-constitution",
        "category": "education",
        "topic": "The U.S. Constitution: Branches of Government and the Bill of Rights",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Civics education deck. Include three branches diagram, "
            "checks and balances flowchart, amendment timeline, "
            "constitutional convention key facts, rights comparison table. "
            "Patriotic but clean design with historical authority."
        ),
    },
    {
        "id": "chemistry-elements",
        "category": "education",
        "topic": "The Periodic Table: Understanding Elements and Chemical Bonds",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Chemistry education deck. Include periodic table highlights, "
            "electron shell diagrams, bond type comparison chart, "
            "element property trends, reaction type examples. "
            "Scientific design with chemistry-inspired color coding."
        ),
    },
    {
        "id": "world-geography",
        "category": "education",
        "topic": "World Geography: Continents, Climates, and Cultures",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Geography educational deck. Include continent comparison charts, "
            "climate zone maps, population density visualizations, "
            "natural resource distribution, cultural diversity statistics. "
            "Globe-inspired design with rich map visualizations."
        ),
    },
    # ── More Technology ─────────────────────────────────────────
    {
        "id": "devops-ci-cd",
        "category": "technology",
        "topic": "DevOps Best Practices: CI/CD Pipelines That Ship with Confidence",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "DevOps engineering deck. Include CI/CD pipeline flow diagram, "
            "deployment frequency metrics, MTTR comparison charts, "
            "tool ecosystem comparison matrix, infrastructure-as-code workflow. "
            "Technical design with pipeline and workflow visuals."
        ),
    },
    {
        "id": "web3-blockchain",
        "category": "technology",
        "topic": "Web3 and Blockchain: Beyond Crypto — Real-World Enterprise Applications",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Enterprise blockchain presentation. Include use case matrix by industry, "
            "consensus mechanism comparison, transaction speed benchmarks, "
            "adoption timeline, total value locked trends. "
            "Futuristic tech design with enterprise credibility."
        ),
    },
    # ── More Fun ────────────────────────────────────────────────
    {
        "id": "psychology-persuasion",
        "category": "education",
        "topic": "The Psychology of Persuasion: 6 Principles That Change Minds",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Behavioral psychology deck based on Cialdini's principles. "
            "Include principle framework diagrams, real-world application examples, "
            "experiment result charts, marketing application matrix, "
            "ethical considerations checklist. Engaging and thought-provoking."
        ),
    },
    {
        "id": "electric-vehicles",
        "category": "technology",
        "topic": "The Electric Vehicle Revolution: Market Trends, Technology, and the Road Ahead",
        "slides": 12,
        "additional_instructions": (
            f"{FONT} "
            "Automotive industry analysis. Include EV adoption curves by region, "
            "battery cost decline trend, range comparison chart, "
            "charging infrastructure growth, manufacturer market share evolution. "
            "Clean, modern automotive design with tech-forward aesthetic."
        ),
    },
    {
        "id": "cooking-science",
        "category": "education",
        "topic": "The Science of Cooking: Chemistry Behind Every Delicious Meal",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Food science educational deck. Include Maillard reaction diagram, "
            "temperature vs texture charts, emulsion science visualization, "
            "flavor compound profiles, cooking method comparison table. "
            "Appetizing design that bridges kitchen and laboratory."
        ),
    },
    {
        "id": "architecture-movements",
        "category": "creative",
        "topic": "Architectural Movements Through History: Gothic to Deconstructivism",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Architecture history overview. Include movement timeline, "
            "style characteristic comparison matrix, famous buildings by era, "
            "material evolution chart, geographic spread of movements. "
            "Elegant architectural design with historical photography references."
        ),
    },
    {
        "id": "startup-failure",
        "category": "business",
        "topic": "Why Startups Fail: Data-Driven Analysis of 1,000 Post-Mortems",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Data analysis presentation. Include failure reason ranking bar chart, "
            "survival rate by stage, funding vs outcome analysis, "
            "team composition patterns, market timing visualization. "
            "Honest, data-driven design that's educational not depressing."
        ),
    },
    {
        "id": "future-of-work",
        "category": "business",
        "topic": "The Future of Work: Remote, Hybrid, AI, and the Skills That Matter",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Workplace trends analysis. Include remote vs hybrid vs office comparison, "
            "AI automation risk by job category, skills demand evolution, "
            "productivity metric comparisons, workforce demographic shifts. "
            "Forward-looking design with human-centered data."
        ),
    },
    {
        "id": "ux-case-study",
        "category": "creative",
        "topic": "UX Case Study: Redesigning a Banking App for 5 Million Users",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Design portfolio case study. Include user research summary, "
            "wireframe to final design evolution, A/B test results, "
            "usability score improvements, task completion rate charts. "
            "Clean portfolio design that showcases the process."
        ),
    },
    {
        "id": "world-religions",
        "category": "education",
        "topic": "World Religions Compared: Beliefs, Practices, and Global Impact",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Comparative religion education. Include adherent population charts, "
            "geographic distribution maps, core belief comparison table, "
            "historical timeline of origins, sacred text overview. "
            "Respectful, neutral design with cultural sensitivity."
        ),
    },
    {
        "id": "venture-studio",
        "category": "business",
        "topic": "The Venture Studio Model: Building Companies in Parallel",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Business model overview. Include studio vs traditional VC comparison, "
            "portfolio construction framework, resource allocation model, "
            "success rate benchmarks, operating model diagram. "
            "Innovative, builder-focused design with clean frameworks."
        ),
    },
    {
        "id": "data-viz",
        "category": "creative",
        "topic": "The Art of Data Visualization: Telling Stories with Charts",
        "slides": 10,
        "additional_instructions": (
            f"{FONT} "
            "Meta-presentation about data visualization. Include chart type selection guide, "
            "good vs bad chart comparisons, color theory for data, "
            "accessibility guidelines, tool comparison matrix. "
            "Itself a masterclass in beautiful data presentation."
        ),
    },
]

ALL_BATCHES = [BATCH_1, BATCH_2, BATCH_3, BATCH_4, BATCH_5]


# ─────────────────────────────────────────────────────────────────────
# Execution helpers (same pattern as seed_landing_page.py)
# ─────────────────────────────────────────────────────────────────────

async def create_api_key(name: str):
    """Create a fresh API key for seeding."""
    service = get_api_key_service()
    full_key, record = await service.create_api_key(
        user_id=USER_ID,
        name=name,
        context_instructions=(
            "Generate visually striking presentations with clean, modern design. "
            "Use only professional sans-serif fonts like Inter, Montserrat, or system defaults. "
            "Prioritize visual elements: charts, diagrams, and data visualizations. "
            "Keep text minimal — big headings, short bullets. Lots of whitespace."
        ),
        include_edit_link=True,
    )
    return full_key, record


async def create_deck(client: httpx.AsyncClient, api_key: str, pres: dict) -> dict:
    """Create a single deck via API."""
    response = await client.post(
        f"{API_BASE}/v1/decks",
        headers={
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        },
        json={
            "topic": pres["topic"],
            "slides": pres["slides"],
            "additional_instructions": pres.get("additional_instructions", ""),
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()


async def poll_status(client: httpx.AsyncClient, api_key: str, deck_id: str, max_wait: int = 600) -> dict:
    """Poll until deck is completed or failed."""
    start = time.time()
    while time.time() - start < max_wait:
        response = await client.get(
            f"{API_BASE}/v1/decks/{deck_id}/status",
            headers={"X-API-Key": api_key},
            timeout=10.0,
        )
        response.raise_for_status()
        status = response.json()

        if status["status"] == "completed":
            return status
        elif status["status"] == "failed":
            raise Exception(f"Failed: {status.get('error_message', 'Unknown')}")

        await asyncio.sleep(5)

    raise Exception(f"Timeout after {max_wait}s for deck {deck_id}")


def add_to_featured(deck_uuid: str, pres: dict, order_index: int) -> bool:
    """Add completed deck to featured_decks table."""
    try:
        supabase = get_supabase_client()

        deck_result = supabase.table("decks").select(
            "slides, data, slide_count, first_slide, short_code"
        ).eq("uuid", deck_uuid).single().execute()

        if not deck_result.data:
            print(f"    Deck {deck_uuid} not found in DB")
            return False

        deck = deck_result.data
        slides = deck.get("slides", [])
        theme = deck.get("data", {}).get("theme") if deck.get("data") else None

        featured_data = {
            "deck_uuid": deck_uuid,
            "user_id": USER_ID,
            "title": pres["topic"],
            "category": pres.get("category", pres["id"]),
            "order_index": order_index,
            "is_active": True,
            "slide_count": len(slides),
            "first_slide": slides[0] if slides else None,
            "slides_snapshot": slides,
            "theme_snapshot": theme,
        }

        supabase.table("featured_decks").upsert(
            featured_data, on_conflict="order_index"
        ).execute()
        return True

    except Exception as e:
        print(f"    Error adding to featured: {e}")
        return False


def add_to_community(deck_uuid: str, pres: dict) -> bool:
    """Also ensure the deck is visible in community showcase."""
    try:
        supabase = get_supabase_client()

        # Mark the deck as shared/public for community
        supabase.table("decks").update({
            "is_public": True,
            "community_category": pres.get("category", "business"),
        }).eq("uuid", deck_uuid).execute()

        return True
    except Exception as e:
        print(f"    Error adding to community: {e}")
        return False


async def generate_one(
    client: httpx.AsyncClient,
    api_key: str,
    pres: dict,
    batch_num: int,
    index_in_batch: int,
    global_index: int,
) -> dict:
    """Generate a single presentation end-to-end."""
    label = pres["topic"][:60]
    total = 100
    try:
        print(f"  [{global_index+1:3d}/{total}] B{batch_num} Firing: {label}...")
        result = await create_deck(client, api_key, pres)
        deck_id = result["deck_id"]
        print(f"  [{global_index+1:3d}/{total}] B{batch_num} Queued: {deck_id[:8]}... -> polling...")

        status = await poll_status(client, api_key, deck_id)
        slides_count = status.get("slides_count", "?")
        print(f"  [{global_index+1:3d}/{total}] B{batch_num} Done:   {label} ({slides_count} slides)")

        return {
            "success": True,
            "deck_id": deck_id,
            "pres": pres,
            "global_index": global_index,
        }

    except Exception as e:
        print(f"  [{global_index+1:3d}/{total}] B{batch_num} FAILED: {label} — {e}")
        return {
            "success": False,
            "error": str(e),
            "pres": pres,
            "global_index": global_index,
        }


async def run_batch(
    batch_num: int,
    presentations: list,
    api_key: str,
    global_offset: int,
):
    """Run a single batch of 20 presentations with one API key."""
    print(f"\n{'─' * 65}")
    print(f"  BATCH {batch_num}: {len(presentations)} presentations")
    print(f"{'─' * 65}")

    async with httpx.AsyncClient() as client:
        # Process in sub-batches of 5 to respect concurrency limits
        results = []
        sub_batch_size = 5
        for i in range(0, len(presentations), sub_batch_size):
            sub_batch = presentations[i:i + sub_batch_size]
            tasks = [
                generate_one(
                    client,
                    api_key,
                    pres,
                    batch_num,
                    i + j,
                    global_offset + i + j,
                )
                for j, pres in enumerate(sub_batch)
            ]
            sub_results = await asyncio.gather(*tasks, return_exceptions=True)
            results.extend(sub_results)

            if i + sub_batch_size < len(presentations):
                print(f"  --- sub-batch done, next in 2s ---")
                await asyncio.sleep(2)

    return results


async def main():
    total = sum(len(b) for b in ALL_BATCHES)

    print("=" * 65)
    print("  NextSlide Community Seeder — 100 Presentations")
    print(f"  {len(ALL_BATCHES)} API keys × 20 presentations each")
    print(f"  Total: {total} presentations")
    print("=" * 65)

    # Step 1: Create 5 API keys
    print("\nStep 1: Creating 5 API keys...")
    api_keys = []
    key_names = [
        "Community Seeder — Batch 1 (Business/Education/Marketing)",
        "Community Seeder — Batch 2 (Consulting/HR/Research/Fun)",
        "Community Seeder — Batch 3 (Sports/Travel/Sustainability/Tech)",
        "Community Seeder — Batch 4 (Verticals/Education/Science/Culture)",
        "Community Seeder — Batch 5 (Advanced/Finance/Creative/Misc)",
    ]

    for i, name in enumerate(key_names, 1):
        full_key, record = await create_api_key(name)
        api_keys.append(full_key)
        print(f"  Key {i}: {record.key_prefix}  ({name})")

    print(f"\n  All 5 API keys created successfully.")

    # Step 2: Run all batches sequentially (each batch runs 20 in parallel)
    print(f"\nStep 2: Generating {total} presentations...")
    all_results = []

    for batch_idx, (batch, api_key) in enumerate(zip(ALL_BATCHES, api_keys)):
        global_offset = batch_idx * 20
        results = await run_batch(batch_idx + 1, batch, api_key, global_offset)
        all_results.extend(results)

    # Step 3: Add to featured_decks and community
    print(f"\n{'─' * 65}")
    print("Step 3: Adding to featured_decks & community showcase...")
    print(f"{'─' * 65}")

    success = 0
    failed = 0
    for r in all_results:
        if isinstance(r, Exception):
            failed += 1
            continue
        if r["success"]:
            deck_id = r["deck_id"]
            pres = r["pres"]
            idx = r["global_index"]

            added_featured = add_to_featured(deck_id, pres, idx)
            added_community = add_to_community(deck_id, pres)

            if added_featured or added_community:
                success += 1
                print(f"  [{idx+1:3d}] Added: {pres['topic'][:55]}")
            else:
                failed += 1
        else:
            failed += 1

    # Summary
    print()
    print("=" * 65)
    print("  SEEDING COMPLETE")
    print(f"  Success: {success}/{total}")
    print(f"  Failed:  {failed}/{total}")
    print()
    for i, key in enumerate(api_keys, 1):
        print(f"  API Key {i}: {key}")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
