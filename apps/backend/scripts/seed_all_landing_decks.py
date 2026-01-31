#!/usr/bin/env python3
"""
Seed ALL featured decks for every landing page prompt.

Creates an API key, generates 30 decks in parallel, polls completion,
then seeds featured_decks table.

Usage:
    cd apps/backend
    python3 scripts/seed_all_landing_decks.py
"""

import os
import sys
import time
import asyncio
import hashlib
import secrets
from typing import Optional, Dict, List, Tuple

import httpx

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client

API_BASE = os.getenv("API_BASE", "https://nextslide-backend.onrender.com")

# ── DESIGN PHILOSOPHY ─────────────────────────────────────────────
# Every prompt below bakes in:
#   - "Keep text minimal" — max 3-4 bullet points or one short paragraph per slide
#   - "Favour large imagery" — hero images, full-bleed backgrounds, icon grids
#   - "Use readable fonts" — clean sans-serifs for serious, bolder/rounded for fun
#   - Fun decks get playful, slightly silly energy
#   - All decks get 6–8 slides (fewer = punchier for a showcase)
# ──────────────────────────────────────────────────────────────────

# ── All 30 presentations in display order ──────────────────────────
# 0-11: Main landing page hero carousel
# 12-29: Additional decks for SEO landing pages
DECKS = [
    # ═══════ MAIN LANDING PAGE (0-11) ═══════

    # 0. Startup pitch
    {
        "topic": (
            "Startup pitch deck for VCs. "
            "DESIGN: Bold, clean, confident. Big hero numbers on each slide. "
            "Keep body text to ONE punchy sentence per slide — let the visuals do the talking. "
            "Use large data visualisations, full-bleed background imagery, and dramatic whitespace. "
            "Slides: hook (one-liner problem), solution (show-don't-tell), market size (one big number), "
            "traction (single hockey-stick chart), business model (simple diagram), team (headshots + titles), "
            "the ask (bold number, center-screen)."
        ),
        "slides": 8,
        "style": "corporate",
        "display_name": "Pitch deck for VCs who've already seen 500 this month",
        "description": "A startup pitch deck designed to stand out from the crowd",
    },
    # 1. Banking / Investment analysis
    {
        "topic": (
            "Short-term stock trading strategies — professional Wall Street briefing style. "
            "DESIGN: Dark background, clean data visuals, minimal text. "
            "Each slide should be ONE chart or ONE key insight with a short headline. "
            "Use candlestick charts, heat maps, and clean financial graphics. "
            "Slides: market overview (single volatility chart), technical signals (RSI + MACD visual), "
            "sector rotation (flow diagram), momentum strategies (visual comparison), "
            "risk management (position sizing visual), outlook (one bold takeaway)."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Short-term stock analysis that reads like a Goldman memo",
        "description": "Professional banking analysis of short-term stock trading strategies",
    },
    # 2. Education - Algebra (FUN)
    {
        "topic": (
            "Algebra for kids who ask 'when will I ever use this?' "
            "DESIGN: Bright, bold, and playful — like a fun magazine spread, not a textbook. "
            "Use HUGE icons, colourful backgrounds, and minimal text (max 2 short sentences per slide). "
            "Each slide = one real-world example: video game physics, Spotify algorithm, "
            "recipe scaling, sports stats, budgeting for a PS5. "
            "Make the equations BIG and visual, embedded in fun illustrations. "
            "The vibe is energetic, slightly silly, and makes math feel cool."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Algebra for kids who ask 'when will I use this'",
        "description": "Real-world algebra that kids actually want to learn",
    },
    # 3. Learn - Coffee
    {
        "topic": (
            "How coffee conquered the world — from Ethiopia to your morning latte. "
            "DESIGN: Warm earthy tones, rich full-bleed coffee photography, elegant and inviting. "
            "Keep each slide to a short headline + one gorgeous visual. Almost no bullet points. "
            "Tell the story visually: Ethiopian origin, Ottoman coffeehouses, "
            "espresso revolution in Italy, Starbucks era, the $500B global economy, "
            "and the science of caffeine. Make it feel like a beautifully designed coffee-table book."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "How coffee conquered the world",
        "description": "The fascinating journey of coffee from Ethiopian legend to global obsession",
    },
    # 4. Pitch - Demo Day
    {
        "topic": (
            "YC demo day pitch — 3 minutes, zero fluff. "
            "DESIGN: One idea per slide. Giant typography for the key message. "
            "Minimal body text — each slide should be readable from the back of the room. "
            "Clean white/dark backgrounds, maximum contrast. "
            "Slides: one-liner hook, problem, product screenshot, key metric (huge number), "
            "why now, team photo, the ask. Every slide = 5 seconds to absorb."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Demo day pitch that actually fits in 3 minutes",
        "description": "A razor-sharp YC-style demo day pitch with zero fluff",
    },
    # 5. Education - Biology
    {
        "topic": (
            "Cellular Respiration: From Glucose to ATP — beautiful science education. "
            "DESIGN: Clean, modern scientific aesthetic. Gradient colour schemes (deep teal to emerald). "
            "Each slide = one diagram or one concept with a SHORT explanation (2 sentences max). "
            "Let the diagrams be the star. Big, clear, labelled process diagrams. "
            "Slides: what is cellular respiration (one visual), glycolysis, "
            "Krebs cycle, electron transport chain, total ATP yield (big number), "
            "real-world connection (why you pant when running). Make it gorgeous and educational."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Cellular Respiration: From Glucose to ATP",
        "description": "Beautiful biology that makes cellular respiration click",
    },
    # 6. Learn - History
    {
        "topic": (
            "The French Revolution: From Monarchy to Republic — history as a thriller. "
            "DESIGN: Dramatic and cinematic. Rich, dark backgrounds with bold accent colours. "
            "Each slide = one dramatic moment with a powerful headline + striking image. "
            "Minimal body text — two sentences maximum, like movie captions. "
            "Slides: Versailles excess vs starving Paris, storming the Bastille, "
            "Declaration of Rights, the Reign of Terror, Marie Antoinette, "
            "Napoleon rises, lasting impact on democracy."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "The French Revolution: From Monarchy to Republic",
        "description": "The dramatic story of how France changed the world",
    },
    # 7. Sales - Client proposal
    {
        "topic": (
            "Client proposal that practically closes itself. "
            "DESIGN: Premium, trust-building, polished. Clean layouts with lots of breathing room. "
            "Each slide = one clear message. Use icons, diagrams, and social proof screenshots. "
            "Keep body text to 3 short bullets MAX per slide. "
            "Slides: client pain points (mirror their language), proposed solution (clear visual), "
            "implementation timeline (simple Gantt), ROI projection (one big chart), "
            "case studies (logos + one-line quotes), pricing as investment, next steps."
        ),
        "slides": 8,
        "style": "corporate",
        "display_name": "Client proposal that closes itself",
        "description": "A sales proposal so persuasive it practically signs itself",
    },
    # 8. Learn - 2000s Internet (FUN)
    {
        "topic": (
            "2000s internet culture — a nostalgic trip through the golden age of the weird web. "
            "DESIGN: Retro, playful, slightly chaotic on purpose. Bold rounded fonts, bright neon-on-dark. "
            "Keep text to short fun captions — let the nostalgia imagery carry each slide. "
            "Slides: MySpace profile pages, early YouTube viral hits, AIM/MSN away messages, "
            "Newgrounds & Flash games, birth of memes (lolcats, rickroll), "
            "the blog era, how 2000s DNA lives in today's internet. "
            "Make it feel like browsing the internet on a chunky laptop in 2006."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Interactive Presentation About 2000s Internet Culture",
        "description": "A nostalgic trip through the weird and wonderful 2000s internet",
    },
    # 9. Science - Zombie Apocalypse (FUN)
    {
        "topic": (
            "How to Survive a Zombie Apocalypse Using Science — real STEM, ridiculous premise. "
            "DESIGN: Bold, punchy, and funny. Comic-book energy with big dramatic fonts. "
            "Each slide = one survival tip backed by real science + a fun zombie illustration. "
            "Keep text to a catchy headline + 2 short lines. The vibe is entertaining education. "
            "Slides: virus spread (R0 chart), fortification physics, "
            "chemistry of water purification, biology of decomposition (zombies expire!), "
            "game theory (who to trust), your actual survival odds (statistics), "
            "your personal survival action plan."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "How to Survive a Zombie Apocalypse Using Science",
        "description": "Real STEM education disguised as zombie apocalypse survival training",
    },
    # 10. Culture - 90s Internet Wild West (FUN)
    {
        "topic": (
            "Why the 90s Internet Was the Wild West of Creativity — a love letter to GeoCities. "
            "DESIGN: Deliberately retro. Bright garish colours, pixel-art vibes, fun chunky fonts. "
            "Each slide = one beautiful mess of 90s web culture with a playful caption. "
            "Keep text super short — let the imagery and nostalgia do the work. "
            "Slides: the homepage era (blinking text, visitor counters), dial-up sounds, "
            "GeoCities/Angelfire masterpieces, early chat rooms (A/S/L?), "
            "Napster and the music revolution, the dot-com boom, and the wild west spirit that built today's web."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Why the 90s Internet Was the Wild West of Creativity",
        "description": "A nostalgic trip through the beautifully chaotic early internet",
    },
    # 11. Marketing - Social Media Strategy
    {
        "topic": (
            "Social media strategy that actually converts — not just likes. "
            "DESIGN: Modern, bold, scroll-stopping. Bright gradients, clean icons, punchy typography. "
            "Each slide = one key tactic with a striking visual and a single headline. "
            "Keep text to one short sentence per slide — think Instagram carousel energy. "
            "Slides: the hook (why most strategies fail), content pillars (visual diagram), "
            "platform-specific playbook (icons + one-liners), posting cadence (simple calendar visual), "
            "engagement tactics (community > followers), analytics that matter (one dashboard mockup), "
            "your 30-day launch plan (timeline graphic)."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Social media strategy that actually converts",
        "description": "A no-fluff social media playbook built for real results",
    },

    # ═══════ SEO LANDING PAGES — ADDITIONAL (12-29) ═══════

    # 12. Series A Funding Narrative
    {
        "topic": (
            "Series A fundraising deck showing 10x growth potential. "
            "DESIGN: Premium, data-forward, but not cluttered. Dark mode with vibrant accent colours. "
            "Each slide = one massive metric or one compelling chart. Minimal text — let numbers speak. "
            "Slides: 3-year revenue trajectory (hockey stick), unit economics (clean LTV:CAC visual), "
            "market expansion map, product roadmap (visual timeline), competitive moat (simple diagram), "
            "team + advisors (photos + one-line bios), the raise (amount + use of funds pie chart)."
        ),
        "slides": 8,
        "style": "corporate",
        "display_name": "Series A narrative showing 10x growth potential",
        "description": "A data-driven Series A deck that makes the growth story undeniable",
    },
    # 13. Monthly Investor Update
    {
        "topic": (
            "Monthly investor update email-style deck — clean, transparent, actionable. "
            "DESIGN: Light, professional, easy to scan. Clean grids and simple charts. "
            "Each slide = one metric category with clear up/down indicators. Green/red accent colours. "
            "Slides: executive summary (3 bullet dashboard), MRR + growth chart, "
            "key wins this month (icons + one-liners), challenges + plan (honest, brief), "
            "product updates (screenshot + caption), upcoming milestones, ask from investors."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Investor update that makes everyone reply",
        "description": "A monthly investor update that's transparent, concise, and actionable",
    },
    # 14. All-Hands Team Meeting
    {
        "topic": (
            "All-hands team meeting deck that actually gets people excited. "
            "DESIGN: Energetic, warm, celebratory. Bright colours, team photos, big bold headlines. "
            "Each slide = one announcement or celebration with minimal text. "
            "Slides: company mission reminder (one powerful line), quarterly highlights (big numbers), "
            "team wins + shoutouts (names + achievements), product milestones (visual timeline), "
            "customer love (quote + logo), what's next (roadmap visual), team photo + values."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "All-hands deck that actually gets people excited",
        "description": "A team all-hands that celebrates wins and builds momentum",
    },
    # 15. Interactive Workshop
    {
        "topic": (
            "Interactive teaching workshop that keeps every participant engaged. "
            "DESIGN: Clean, friendly, inviting. Soft gradients with pops of bright colour. "
            "Each slide = one activity or concept with clear visual instructions. "
            "Slides: welcome + goals (simple checklist), icebreaker activity (visual prompt), "
            "core concept #1 (big diagram), group exercise (step-by-step visual), "
            "core concept #2 (infographic), reflection activity (thought prompt), "
            "key takeaways (3 icons + one-liners), resources + next steps."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "Interactive workshop that keeps everyone engaged",
        "description": "A workshop template designed for maximum participation and learning",
    },
    # 16. Science Experiment Walkthrough
    {
        "topic": (
            "Science experiment walkthrough with beautiful step-by-step visuals. "
            "DESIGN: Clean lab aesthetic — white backgrounds, precise diagrams, gentle blue/green accents. "
            "Each slide = one step with a clear illustration and SHORT instruction (1-2 sentences). "
            "Topic: extracting DNA from strawberries (a classic, visually stunning experiment). "
            "Slides: what is DNA (one gorgeous diagram), materials needed (clean flat-lay photo), "
            "step 1 mash berries, step 2 add soap solution, step 3 filter, step 4 add alcohol, "
            "the reveal (stringy DNA!), the science behind it (simple molecular diagram)."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "Science experiment walkthrough with visual steps",
        "description": "A beautiful step-by-step science experiment guide",
    },
    # 17. Q4 Campaign Report
    {
        "topic": (
            "Q4 marketing campaign performance report that gets next quarter's budget approved. "
            "DESIGN: Data-rich but clean. White background, bold metric cards, professional charts. "
            "Each slide = one campaign metric with a clear visual and SHORT insight. "
            "Slides: Q4 overview (dashboard with key KPIs), paid media performance (ROAS chart), "
            "content marketing results (traffic + engagement graph), email campaign metrics, "
            "social media growth (platform comparison), top-performing content (thumbnails + numbers), "
            "Q1 budget request (simple allocation pie chart)."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Q4 campaign report that gets budget approved",
        "description": "A campaign report so clear it practically approves its own budget",
    },
    # 18. Brand Positioning Deck
    {
        "topic": (
            "Brand positioning deck that the C-suite remembers weeks later. "
            "DESIGN: Sophisticated, bold, memorable. Rich colour palette, strong typography, lots of whitespace. "
            "Each slide = one positioning insight with a powerful visual metaphor. "
            "Slides: market landscape (competitive map), target audience persona (visual profile), "
            "brand promise (one bold statement, centre-screen), positioning statement, "
            "brand personality (mood board style), messaging framework (simple hierarchy), "
            "visual identity preview (colour + font samples)."
        ),
        "slides": 7,
        "style": "creative",
        "display_name": "Brand positioning deck the C-suite remembers",
        "description": "A brand positioning deck that's impossible to forget",
    },
    # 19. Content Marketing Roadmap
    {
        "topic": (
            "Content marketing roadmap with real metrics and a clear visual plan. "
            "DESIGN: Modern, structured, visually organised. Clean grids, timeline graphics, icon sets. "
            "Each slide = one content pillar or phase with a clear visual. "
            "Slides: content audit results (what's working — simple chart), audience content preferences, "
            "content pillar strategy (4 pillars with icons), quarterly content calendar (visual grid), "
            "distribution channels (platform icons + strategy), SEO roadmap (keyword clusters visual), "
            "success metrics + KPIs (dashboard mockup)."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Content marketing roadmap with real metrics",
        "description": "A content strategy roadmap backed by data and built for execution",
    },
    # 20. Product Launch Campaign
    {
        "topic": (
            "Product launch campaign deck that breaks through the noise. "
            "DESIGN: High-energy, bold, visually stunning. Gradient backgrounds, dramatic product shots. "
            "Each slide = one launch phase with a visual and a punchy headline. "
            "Slides: the product (hero shot, full-bleed), target market (persona visual), "
            "launch timeline (visual countdown), channel strategy (icons + one-liners), "
            "pre-launch buzz tactics, launch day plan (hour-by-hour visual), "
            "success metrics (target dashboard), post-launch feedback loop."
        ),
        "slides": 8,
        "style": "creative",
        "display_name": "Product launch campaign that breaks through noise",
        "description": "A launch campaign so bold it demands attention",
    },
    # 21. McKinsey-Style Strategy Analysis
    {
        "topic": (
            "Strategy consulting analysis presentation — McKinsey quality, zero jargon. "
            "DESIGN: Ultra-clean, framework-driven, premium. Navy/white colour scheme. "
            "Each slide = one framework or insight with a clear diagram. Minimal text. "
            "Slides: executive summary (3 key findings), market analysis (Porter's Five Forces visual), "
            "SWOT analysis (clean 2x2 grid), strategic options (decision matrix), "
            "recommended strategy (one bold direction), implementation roadmap (phased timeline), "
            "expected impact (before/after metrics)."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Strategy analysis that reads like a McKinsey memo",
        "description": "Consulting-grade strategy analysis with clear frameworks and recommendations",
    },
    # 22. Market Research Visualization
    {
        "topic": (
            "Market research findings with clean, compelling data visualization. "
            "DESIGN: Data-forward, modern, trustworthy. Clean charts, muted colour palette with one accent. "
            "Each slide = one research finding with a single striking visual. "
            "Slides: research methodology (simple diagram), market size + TAM (big donut chart), "
            "customer segments (visual personas), competitive landscape (positioning map), "
            "key trends (trend lines with icons), customer pain points (ranked bar chart), "
            "opportunities (bubble chart), strategic recommendations."
        ),
        "slides": 8,
        "style": "corporate",
        "display_name": "Market research with clean data visualization",
        "description": "Market research that turns complex data into clear, actionable insights",
    },
    # 23. Change Management Plan
    {
        "topic": (
            "Change management plan with clear stakeholder buy-in strategy. "
            "DESIGN: Professional, structured, reassuring. Calm blue/green palette, clean diagrams. "
            "Each slide = one phase or stakeholder group with a visual framework. "
            "Slides: why change is needed (current vs future state visual), "
            "change impact assessment (heat map), stakeholder map (influence/interest grid), "
            "communication plan (timeline + channels), training roadmap (phased visual), "
            "resistance mitigation (strategies with icons), success metrics, quick wins timeline."
        ),
        "slides": 8,
        "style": "corporate",
        "display_name": "Change management plan with stakeholder buy-in",
        "description": "A change management plan that brings everyone along for the ride",
    },
    # 24. Competitive Analysis
    {
        "topic": (
            "Competitive analysis presentation — thorough but visually clean. "
            "DESIGN: Sharp, professional, confidential feel. Dark backgrounds, clean comparison tables. "
            "Each slide = one competitive dimension with a clear visual comparison. "
            "Slides: competitive landscape overview (positioning map), feature comparison matrix, "
            "pricing comparison (clean table), market share (pie/bar chart), "
            "competitor strengths/weaknesses (visual scorecard), "
            "our differentiators (icons + bold statements), strategic recommendations."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Competitive analysis that stays confidential",
        "description": "A thorough competitive analysis with clear strategic implications",
    },
    # 25. Seed Round Pitch
    {
        "topic": (
            "Seed round pitch deck — turning a coffee chat into a term sheet. "
            "DESIGN: Personal, authentic, compelling. Clean white backgrounds with warm accent colours. "
            "Each slide = one honest, punchy message. Big founder photos, real product screenshots. "
            "Slides: the personal story (why you care), the problem (from lived experience), "
            "the product (real screenshot, not mockup), early traction (honest numbers, big font), "
            "the vision (10-year dream in one visual), why now (market timing diagram), "
            "the team (genuine photos + superpowers), the ask (simple, clear, bold)."
        ),
        "slides": 8,
        "style": "corporate",
        "display_name": "Seed round deck that turns coffee chats into term sheets",
        "description": "An authentic seed round pitch that builds genuine investor conviction",
    },
    # 26. Product Demo for Skeptics
    {
        "topic": (
            "Product demo presentation that turns skeptics into champions. "
            "DESIGN: Modern, product-focused, confidence-building. Clean backgrounds, real UI screenshots. "
            "Each slide = one product capability with a clear before/after or demo visual. "
            "Slides: the status quo problem (pain point visual), product overview (hero screenshot), "
            "key workflow #1 (step-by-step demo), key workflow #2 (time-saved comparison), "
            "integration ecosystem (connected icons), customer testimonial (quote + metrics), "
            "getting started (3-step onboarding visual)."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Product demo that turns skeptics into champions",
        "description": "A product demo so compelling it creates internal champions",
    },
    # 27. Quarterly Business Review
    {
        "topic": (
            "Quarterly business review with clean, executive-ready metrics. "
            "DESIGN: Executive-level clarity. White backgrounds, strong data hierarchy, professional charts. "
            "Each slide = one business area with clear metrics and trend indicators. "
            "Slides: Q4 executive summary (traffic-light dashboard), revenue + pipeline (waterfall chart), "
            "customer metrics (NPS + retention graphs), product milestones (visual checklist), "
            "team performance (headcount + productivity), challenges + mitigations, "
            "Q1 targets (clean goal cards)."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Quarterly business review with clean metrics",
        "description": "A QBR that gives executives exactly the clarity they need",
    },
    # 28. Partnership Pitch
    {
        "topic": (
            "Partnership pitch that shows how two roadmaps align perfectly. "
            "DESIGN: Collaborative, professional, forward-looking. Dual-brand feel with split layouts. "
            "Each slide = one alignment point with a clear visual. "
            "Slides: market opportunity (shared TAM visual), complementary strengths (Venn diagram), "
            "joint value proposition (combined offering visual), target customer overlap (segment map), "
            "go-to-market plan (joint timeline), revenue model (split projection chart), "
            "next steps (clear action items with owners)."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "Partnership pitch that aligns both roadmaps",
        "description": "A partnership deck that makes collaboration feel inevitable",
    },
    # 29. ROI Case Study
    {
        "topic": (
            "ROI case study presentation that finance teams actually believe. "
            "DESIGN: Numbers-first, credible, clean. White backgrounds, minimal decoration, big metrics. "
            "Each slide = one metric or proof point. Conservative, honest framing. "
            "Slides: client challenge (brief context), solution implemented (simple diagram), "
            "timeline to value (milestone chart), hard ROI metrics (before/after comparison), "
            "soft benefits (icons + one-liners), total cost of ownership (simple breakdown), "
            "payback period (one bold number, centre-screen)."
        ),
        "slides": 7,
        "style": "corporate",
        "display_name": "ROI case study that finance teams actually believe",
        "description": "An ROI case study built on hard numbers and honest framing",
    },
]


async def create_api_key() -> str:
    """Create a fresh API key for deck generation."""
    from services.api_key_service import get_api_key_service

    USER_ID = "942ccba7-5346-4f99-8189-82284dafb255"  # abeshry@gmail.com
    service = get_api_key_service()

    full_key, record = await service.create_api_key(
        user_id=USER_ID,
        name="Landing Page Seeder v2",
        context_instructions=(
            "Generate visually striking, low-text presentations with bold typography and big imagery. "
            "Keep slides clean and punchy — favour large visuals over walls of text."
        ),
        include_edit_link=True,
    )
    print(f"  Created API key: {full_key[:20]}...")
    print(f"  Key ID: {record.id}")
    return full_key


async def create_deck(client: httpx.AsyncClient, api_key: str, deck_info: dict, retry: int = 3) -> Optional[str]:
    """Create a deck via API. Returns deck_id or None."""
    payload = {
        "topic": deck_info["topic"],
        "slides": deck_info["slides"],
    }
    if deck_info.get("style"):
        payload["style"] = deck_info["style"]

    for attempt in range(1, retry + 2):
        try:
            response = await client.post(
                f"{API_BASE}/v1/decks",
                headers={"X-API-Key": api_key, "Content-Type": "application/json"},
                json=payload,
                timeout=120.0
            )
            if response.status_code == 200:
                return response.json()["deck_id"]
            if response.status_code == 429:
                wait = int(response.headers.get("Retry-After", "30"))
                print(f"  429 rate limited (waiting {wait}s)...", flush=True)
                await asyncio.sleep(wait + 2)
                continue
            if response.status_code == 409:
                body = response.json()
                existing = body.get("existing_deck_id")
                if existing:
                    print(f"  409 reusing existing {existing[:8]}...", flush=True)
                    return existing
            print(f"  API Error {response.status_code}: {response.text[:200]}")
            if attempt <= retry:
                await asyncio.sleep(5)
        except Exception as e:
            print(f"  Create error: {type(e).__name__}: {e}")
            if attempt <= retry:
                await asyncio.sleep(5)
    return None


async def poll_one(client: httpx.AsyncClient, api_key: str, deck_id: str, name: str, max_wait: int = 1800) -> bool:
    """Poll a single deck until completed/failed/timeout."""
    start = time.time()
    last_print = 0
    while time.time() - start < max_wait:
        try:
            response = await client.get(
                f"{API_BASE}/v1/decks/{deck_id}/status",
                headers={"X-API-Key": api_key},
                timeout=60.0
            )
            response.raise_for_status()
            status = response.json()

            if status["status"] == "completed":
                slides = status.get('slides_count', '?')
                elapsed = int(time.time() - start)
                print(f"    DONE: {name} ({slides} slides, {elapsed}s)")
                return True
            elif status["status"] == "failed":
                print(f"    FAIL: {name} — {status.get('error_message', 'Unknown')}")
                return False
        except Exception:
            pass

        elapsed = int(time.time() - start)
        if elapsed - last_print >= 30:
            print(f"    ... {name} still generating ({elapsed}s)")
            last_print = elapsed

        await asyncio.sleep(12)

    print(f"    TIMEOUT: {name} (>{max_wait}s)")
    return False


async def main():
    total = len(DECKS)

    print("=" * 65)
    print(f"  Landing Page Deck Seeder — {total} Presentations")
    print("=" * 65)
    print(f"  API: {API_BASE}")
    print()

    # ── Phase 0: Create API key ──────────────────────────────────
    print("[Phase 0] Creating API key...")
    api_key = await create_api_key()
    print()

    # ── Phase 1: Submit all creation requests ────────────────────
    print(f"[Phase 1] Submitting {total} deck creation requests...")
    print("-" * 65)

    all_decks: Dict[int, Tuple[str, dict]] = {}
    sem = asyncio.Semaphore(3)  # Max 3 concurrent submissions

    async with httpx.AsyncClient() as client:
        async def submit_one(i: int, deck_info: dict):
            async with sem:
                order = i + 1
                name = deck_info["display_name"]
                print(f"  [{order:2d}/{total}] Submitting: {name}...", end=" ", flush=True)
                deck_id = await create_deck(client, api_key, deck_info)
                if deck_id:
                    print(f"OK ({deck_id[:8]}...)")
                    all_decks[order] = (deck_id, deck_info)
                else:
                    print("FAILED")
                await asyncio.sleep(2)  # Brief pause between submissions

        # Submit in batches to respect concurrency
        tasks = [submit_one(i, deck) for i, deck in enumerate(DECKS)]
        await asyncio.gather(*tasks)

    submitted = len(all_decks)
    print(f"\n  Submitted: {submitted}/{total}")

    # ── Phase 2: Poll all decks in parallel ────────────────────────
    print()
    print("[Phase 2] Waiting for all decks to complete...")
    print("-" * 65)

    completed_orders = set()

    async with httpx.AsyncClient() as client:
        async def check_one(order: int, deck_id: str, info: dict) -> bool:
            ok = await poll_one(client, api_key, deck_id, info["display_name"])
            if ok:
                completed_orders.add(order)
            return ok

        tasks = [
            check_one(order, uuid, info)
            for order, (uuid, info) in sorted(all_decks.items())
        ]
        await asyncio.gather(*tasks)

    print(f"\n  Completed: {len(completed_orders)}/{submitted}")

    if len(completed_orders) < submitted:
        failed = [all_decks[o][1]["display_name"] for o in sorted(all_decks.keys()) if o not in completed_orders]
        print(f"\n  WARNING: {len(failed)} decks failed:")
        for name in failed:
            print(f"    - {name}")
        print("  Continuing with completed decks...")

    # ── Phase 3: Update featured_decks ─────────────────────────────
    print()
    print(f"[Phase 3] Updating featured_decks table...")
    print("-" * 65)

    supabase = get_supabase_client()

    # Deactivate existing
    try:
        supabase.table('featured_decks').update({
            "is_active": False
        }).eq('is_active', True).execute()
        print("  Deactivated old featured decks")
    except Exception as e:
        print(f"  Warning deactivating: {e}")

    success = 0
    for order in sorted(completed_orders):
        uuid, info = all_decks[order]
        name = info["display_name"]
        desc = info["description"]

        try:
            deck_result = supabase.table('decks').select(
                'slides, name'
            ).eq('uuid', uuid).single().execute()

            if not deck_result.data:
                print(f"  [{order:2d}] MISSING from decks table: {name}")
                continue

            slides = deck_result.data.get('slides', [])
            supabase.table('featured_decks').upsert({
                "uuid": uuid,
                "name": name,
                "description": desc,
                "slides": slides,
                "slide_count": len(slides),
                "display_order": order,
                "is_active": True,
            }, on_conflict='uuid').execute()

            print(f"  [{order:2d}] Featured: {name} ({len(slides)} slides)")
            success += 1
        except Exception as e:
            print(f"  [{order:2d}] Error: {e}")

    # ── Summary ────────────────────────────────────────────────────
    print()
    print("=" * 65)
    print(f"DONE! Featured: {success}/{total}")
    print()
    print("Display order → deck index mapping:")
    for order in sorted(all_decks.keys()):
        if order in completed_orders:
            uuid, info = all_decks[order]
            print(f"  [{order-1:2d}] {info['display_name']}")
            print(f"       UUID: {uuid}")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
