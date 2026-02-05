#!/usr/bin/env python3
"""
Seed community decks by calling generation functions directly.

This bypasses the API HTTP layer and Cloudflare protection by calling
the generation pipeline functions directly.

Features diverse color palettes, age ranges, pop culture, and engaging content.
60%+ adult content, mix of professional and fun.

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

# ── DESIGN PHILOSOPHY ─────────────────────────────────────────────
# Every prompt bakes in color palette + design direction:
#   - "Keep text minimal" — max 3-4 bullets or one short paragraph per slide
#   - "Favour large imagery" — hero images, full-bleed backgrounds, icon grids
#   - Diverse palettes: warm, cool, neon, earthy, pastel, dark, vibrant
#   - Fun decks get playful energy; pro decks stay sharp but never boring
# ──────────────────────────────────────────────────────────────────

TOPICS = {
    # ═══════ BUSINESS & PROFESSIONAL (Adult, ~20 topics) ═══════
    "business": [
        (
            "Q4 Financial Results and Growth Analysis for a SaaS company. "
            "DESIGN: Deep navy and gold palette. Clean, confident. Big hero numbers per slide. "
            "Use dramatic data visualizations and whitespace. Minimal text — one headline, one chart per slide."
        ),
        (
            "Startup Pitch Deck — Series A for an AI-powered health tech company. "
            "DESIGN: Gradient from electric blue to teal. Bold, modern. "
            "One punchy sentence per slide. Large product mockups and hockey-stick charts. "
            "The vibe is 'we're the future and we know it.'"
        ),
        (
            "Remote Work Culture Playbook — how to build a thriving distributed team. "
            "DESIGN: Warm sunset palette — soft corals, amber, cream. Friendly and human. "
            "Use photos of real people, cozy workspaces, and simple icon grids. Inviting, not corporate."
        ),
        (
            "Personal Branding Masterclass — how to stand out on LinkedIn and beyond. "
            "DESIGN: Black and bright yellow. Bold and punchy like a Nike ad. "
            "Big typography, minimal words. Each slide = one actionable tip with a strong visual."
        ),
        (
            "Customer Experience Strategy — turning buyers into superfans. "
            "DESIGN: Vibrant purple and white. Clean and energetic. "
            "Journey maps, NPS visualizations, and customer quotes in big pull-quote style."
        ),
        (
            "Annual Business Review and Strategic Outlook for 2026. "
            "DESIGN: Dark charcoal with emerald green accents. Sophisticated and data-rich. "
            "Each slide: one key insight with a clean chart. Executive-level polish."
        ),
        (
            "Freelancer's Guide to Pricing — know your worth and charge accordingly. "
            "DESIGN: Warm terracotta and cream. Approachable, not intimidating. "
            "Use fun comparisons, real examples, and simple formulas. Friendly expert vibe."
        ),
        (
            "Product-Led Growth Strategy — how the product sells itself. "
            "DESIGN: Clean white with bright coral accents. Modern SaaS aesthetic. "
            "Funnel diagrams, user journey visuals, and big metric callouts. Sleek and minimal."
        ),
        (
            "Investor Relations Quarterly Update — Q1 performance and outlook. "
            "DESIGN: Classic navy and white with subtle silver. Wall Street polished. "
            "Clean financials, one chart per slide, crisp headlines. Confidence without flash."
        ),
        (
            "Side Hustle to Startup — turning your passion project into a real business. "
            "DESIGN: Electric lime and dark grey. Energetic and scrappy. "
            "Timeline visuals, milestone markers, and real numbers. Aspirational but grounded."
        ),
        (
            "Negotiation Skills for Professionals — get what you deserve. "
            "DESIGN: Rich burgundy and gold. Powerful and commanding. "
            "One technique per slide with a strong visual metaphor. Minimal text, maximum impact."
        ),
        (
            "E-Commerce Trends 2026 — what's working now in online retail. "
            "DESIGN: Gradient from hot pink to peach. Fun, modern commerce vibe. "
            "Stats in big bold numbers, product photography style, trend arrows."
        ),
        (
            "Financial Literacy for Young Professionals — budgeting, investing, and building wealth in your 20s and 30s. "
            "DESIGN: Fresh mint green and charcoal. Clean, youthful, not stuffy. "
            "Simple charts, relatable scenarios, and big action items per slide."
        ),
        (
            "Merger and Acquisition Strategy — evaluating targets and integration planning. "
            "DESIGN: Steel blue and slate grey. Serious, precise, institutional. "
            "Process diagrams, valuation frameworks, one concept per slide."
        ),
        (
            "The Art of the Cold Email — outreach that actually gets replies. "
            "DESIGN: Bright orange and dark navy. Bold and attention-grabbing. "
            "Before/after email examples, response rate stats, template breakdowns."
        ),
    ],

    # ═══════ LIFESTYLE & FUN (Adult, ~18 topics) ═══════
    "lifestyle": [
        (
            "How Coffee Conquered the World — from Ethiopia to your morning latte. "
            "DESIGN: Warm earthy tones — espresso brown, cream, caramel. Rich and inviting. "
            "Full-bleed coffee photography, short headlines, almost no bullets. "
            "Like a beautifully designed coffee-table book."
        ),
        (
            "Home Cooking Essentials — 10 dishes everyone should master. "
            "DESIGN: Warm kitchen palette — soft butter yellow, sage green, terracotta. "
            "Gorgeous food photography, one recipe per slide, clean ingredient lists. Cozy and appetizing."
        ),
        (
            "Budget Travel Hacks — see the world without going broke. "
            "DESIGN: Bright tropical palette — turquoise, coral, sunny yellow. "
            "Full-bleed travel photography, big bold tip per slide, passport stamp aesthetic. Wanderlust energy."
        ),
        (
            "The Science of Sleep — why you need 8 hours and how to actually get them. "
            "DESIGN: Dreamy gradient from deep indigo to soft lavender. Calm and soothing. "
            "Clean infographics, sleep cycle diagrams, one tip per slide. Zen vibes."
        ),
        (
            "Wine for Beginners — from grape to glass, everything you need to know. "
            "DESIGN: Deep plum, gold, and cream. Elegant and warm. "
            "Beautiful vineyard imagery, flavor wheel graphics, tasting note cards. Sophisticated but accessible."
        ),
        (
            "Indoor Plant Guide — how to not kill your houseplants. "
            "DESIGN: Lush greens, warm white, and terracotta. Fresh and natural. "
            "Beautiful plant photography, care level icons, light requirement diagrams. Earthy and calming."
        ),
        (
            "Street Food Around the World — the best bites from Bangkok to Mexico City. "
            "DESIGN: Bold, vibrant, saturated — hot reds, bright yellows, street-art energy. "
            "Mouth-watering food photography, location stamps, flavor profiles. High energy."
        ),
        (
            "Minimalist Living — declutter your life and find more joy with less. "
            "DESIGN: Pure white, soft grey, one accent in muted sage. Ultra-clean. "
            "Massive whitespace, one statement per slide, serene imagery. Breathable and calm."
        ),
        (
            "Running Your First Marathon — from couch to 26.2 miles. "
            "DESIGN: Energetic gradient — electric blue to neon green. Athletic and motivating. "
            "Training calendar visuals, milestone markers, gear checklists. Nike-ad energy."
        ),
        (
            "Dubai Chocolate and Viral Food Trends — the treats breaking the internet in 2026. "
            "DESIGN: Luxurious — glossy chocolate brown, gold foil, pistachio green accents. "
            "Close-up food photography, social media stats, trend timelines. Indulgent and trendy."
        ),
        (
            "Meditation and Mindfulness for Beginners — finding calm in the chaos. "
            "DESIGN: Soft pastels — blush pink, sky blue, cream. Peaceful and gentle. "
            "Minimal text, breathing exercise visuals, nature imagery. Spa-like serenity."
        ),
        (
            "The History of Sneaker Culture — from basketball courts to billion-dollar collabs. "
            "DESIGN: Street style — black, white, and a pop of fire engine red. Bold and urban. "
            "Iconic sneaker photography, timeline graphics, collab highlight cards. Hype energy."
        ),
        (
            "Cocktail Crafting 101 — classic recipes and the science behind the shake. "
            "DESIGN: Art deco — deep teal, copper, and black. Moody speakeasy vibes. "
            "Beautiful cocktail photography, ingredient diagrams, flavor pairing charts. Classy and fun."
        ),
        (
            "Photography for Beginners — composition, lighting, and finding your eye. "
            "DESIGN: Monochrome with subtle warm accents. Gallery-clean. "
            "Full-bleed photo examples, rule-of-thirds overlays, before/after edits. Artful and inspiring."
        ),
        (
            "The Ultimate Road Trip Planner — routes, playlists, and pit stops. "
            "DESIGN: Retro Americana — dusty orange, sky blue, cream. Vintage map aesthetic. "
            "Route maps, packing checklists, playlist cards, diner typography. Nostalgic adventure."
        ),
        (
            "Functional Fitness — strength training for real life, not just the mirror. "
            "DESIGN: Raw and earthy — charcoal, warm grey, copper accents. Industrial gym aesthetic. "
            "Movement diagrams, progressive overload charts, form guides. Gritty and real."
        ),
        (
            "The Psychology of Color — how colors affect mood, behavior, and buying decisions. "
            "DESIGN: Rainbow gradient transitions between slides, each slide in a different color family. "
            "Big color swatches, brand examples, emotional association maps. Visual feast."
        ),
        (
            "Sustainable Fashion Guide — look good without wrecking the planet. "
            "DESIGN: Sage green, natural linen, warm taupe. Organic and honest. "
            "Brand comparisons, material guides, capsule wardrobe visuals. Conscious and chic."
        ),
    ],

    # ═══════ POP CULTURE & TRENDING (Mixed ages, ~16 topics) ═══════
    "pop_culture": [
        (
            "The Marvel Cinematic Universe Explained — from Iron Man to Avengers: Doomsday. "
            "DESIGN: Comic book bold — bright reds, blues, and yellows on dark backgrounds. "
            "Hero splash art, timeline infographics, phase breakdowns. Epic and geeky."
        ),
        (
            "GTA 6 Hype — everything we know about the most anticipated game ever. "
            "DESIGN: Vice City neon — hot pink, electric blue, palm tree silhouettes. "
            "Map comparisons, feature speculation cards, franchise revenue stats. Absolute hype energy."
        ),
        (
            "Taylor Swift's Eras — a journey through every album and reinvention. "
            "DESIGN: Each slide matches an album's palette — country gold to Midnights lavender. "
            "Album artwork, era-defining stats, tour revenue numbers. Swiftie-approved storytelling."
        ),
        (
            "The Evolution of Memes — from Advice Animals to Brainrot. How internet humor shaped culture. "
            "DESIGN: Chaotic and intentionally messy — mixed fonts, bright clashing colors, screenshot aesthetic. "
            "Meme timelines, cultural impact stats, platform migration charts. Unhinged on purpose."
        ),
        (
            "Stranger Things: A Complete Guide — all 5 seasons, every monster, the Upside Down explained. "
            "DESIGN: Retro 80s — dark red, flickering light bulb aesthetic, VHS grain. "
            "Character maps, season timelines, monster bestiary cards. Nostalgic horror."
        ),
        (
            "FIFA World Cup 2026 Preview — the biggest tournament ever comes to North America. "
            "DESIGN: Bold stadium green, white, and gold. Athletic and international. "
            "Group stage brackets, host city maps, player spotlight cards. Tournament energy."
        ),
        (
            "The Rise of K-Pop — from Gangnam Style to global domination. "
            "DESIGN: Neon pink, holographic purple, and white. K-pop idol aesthetic. "
            "Streaming stats, world tour maps, fandom infographics. Glittery and energetic."
        ),
        (
            "Anime for Beginners — where to start and what to watch in 2026. "
            "DESIGN: Vibrant anime palette — cherry blossom pink, ocean blue, sunset orange. "
            "Genre guides, top-10 lists, studio spotlights. Colorful and inviting, not gatekeepy."
        ),
        (
            "Bad Bunny's Impact — how a Puerto Rican artist became the world's most-streamed musician. "
            "DESIGN: Bold reggaeton energy — neon green, black, hot pink splashes. "
            "Streaming records, album evolution, cultural impact stats. Unapologetically loud."
        ),
        (
            "The Nintendo Switch 2 Era — Mario Kart World, GTA 6, and the new generation of gaming. "
            "DESIGN: Nintendo-bright — cherry red, electric blue, white. Playful and clean. "
            "Game lineup grids, hardware comparison charts, launch title cards. Fun and hype."
        ),
        (
            "The Golden Age of TV — why we're living in the best era for television. "
            "DESIGN: Cinematic — dark backgrounds, warm amber lighting, film grain texture. "
            "Show rating comparisons, streaming wars charts, decade timelines. Prestige TV aesthetic."
        ),
        (
            "Kendrick vs. Drake — the beef that defined a generation of hip-hop. "
            "DESIGN: Split-screen black and white with red divider. Confrontational and dramatic. "
            "Diss track timelines, streaming battle stats, cultural moment breakdowns. Raw and real."
        ),
        (
            "2026 is the New 2016 — the biggest nostalgia trend on social media. "
            "DESIGN: Faded Instagram-filter warmth — soft vintage tones, Polaroid borders. "
            "Then vs. now comparisons, viral stats, cultural parallels. Warm and wistful."
        ),
        (
            "The AI Revolution in Pop Culture — from ChatGPT caricatures to AI music and deepfakes. "
            "DESIGN: Cyberpunk — electric purple, chrome silver, glitch effects on black. "
            "Trend timelines, public opinion charts, viral moment screenshots. Futuristic and edgy."
        ),
        (
            "Hollow Knight: Silksong and the Indie Game Renaissance — small studios, massive impact. "
            "DESIGN: Hand-drawn aesthetic — parchment backgrounds, ink illustrations, soft blues. "
            "Sales milestones, genre breakdowns, studio spotlight cards. Artistic and warm."
        ),
        (
            "The White Lotus Effect — how one TV show became the internet's favorite meme machine. "
            "DESIGN: Tropical luxury — palm green, ocean blue, gold, white linen textures. "
            "Meme compilations, viewership charts, cultural moment timelines. Satirical luxury."
        ),
    ],

    # ═══════ KIDS (Ages 5-12, ~10 topics) ═══════
    "kids": [
        (
            "The Solar System Adventure — meet every planet from Mercury to Neptune! "
            "DESIGN: Deep space black with bright planet colors — Saturn's gold, Mars red, Neptune blue. "
            "HUGE planet illustrations, fun facts in big bubbly text, astronaut mascot. "
            "Playful and awe-inspiring for kids ages 5-10."
        ),
        (
            "Dinosaurs: The Coolest Creatures That Ever Lived — T-Rex, Triceratops, and friends! "
            "DESIGN: Jungle green, volcanic orange, and sandy beige. Adventurous! "
            "Big dinosaur illustrations, size comparison charts, fun fossil facts. "
            "Exciting and slightly silly for ages 5-10."
        ),
        (
            "How Do Animals Talk? — the weird and wonderful ways animals communicate. "
            "DESIGN: Bright and cheerful — sky blue, sunshine yellow, grass green. "
            "Cute animal illustrations, speech bubble graphics, sound wave visuals. "
            "Fun and surprising for ages 6-10."
        ),
        (
            "Math is Actually Fun — real-world math with pizza, Minecraft, and sports! "
            "DESIGN: Bold and colorful like a comic book — bright blue, red, yellow panels. "
            "Big equations embedded in fun illustrations, game-style scoring. "
            "Makes math feel cool for ages 7-11."
        ),
        (
            "The Ocean Deep — exploring the craziest creatures in the deep sea. "
            "DESIGN: Deep ocean gradient — from surface turquoise to midnight black. "
            "Glowing deep-sea creatures, depth scale graphics, fun fact bubbles. "
            "Mysterious and fascinating for ages 6-11."
        ),
        (
            "Build Your Own Robot — introduction to robotics and coding for kids. "
            "DESIGN: Techy and playful — electric blue, neon green, metallic silver. "
            "Robot character mascot, simple circuit diagrams, step-by-step builds. "
            "Empowering and creative for ages 8-12."
        ),
        (
            "Volcanoes, Earthquakes, and Tornadoes — Earth's most awesome forces! "
            "DESIGN: Dramatic — molten orange, stormy grey, electric yellow. "
            "Cross-section diagrams, eruption sequences, storm chasers imagery. "
            "Thrilling and educational for ages 7-11."
        ),
        (
            "The Life Cycle of a Butterfly — from tiny egg to beautiful wings. "
            "DESIGN: Garden pastels — soft pink, lavender, leaf green, sunny yellow. "
            "Stage-by-stage illustrations, nature photography, transformation timeline. "
            "Magical and gentle for ages 5-8."
        ),
        (
            "Space Explorers — the brave astronauts who went to the Moon and beyond! "
            "DESIGN: Retro space — midnight blue, rocket red, star white, moon silver. "
            "Rocket diagrams, mission patches, astronaut portraits, timeline of exploration. "
            "Inspiring and heroic for ages 7-12."
        ),
        (
            "World Holidays and Celebrations — how kids around the world celebrate! "
            "DESIGN: Festive rainbow — each slide a different cultural color palette. "
            "Cultural illustrations, world map pins, celebration photography. "
            "Colorful and inclusive for ages 6-10."
        ),
    ],

    # ═══════ TEENS (Ages 13-18, ~10 topics) ═══════
    "teens": [
        (
            "AP Biology Crash Course: Cellular Respiration — ATP, glycolysis, and the Krebs cycle made simple. "
            "DESIGN: Clean and study-friendly — white backgrounds, teal and coral accents. "
            "Clear diagrams, step-by-step process flows, mnemonic devices. "
            "Actually helpful for exam prep, grades 10-12."
        ),
        (
            "How Social Media Actually Works — algorithms, dopamine loops, and taking back your attention. "
            "DESIGN: Phone-screen aesthetic — dark mode black with notification-red and blue accents. "
            "App mockups, brain chemistry infographics, screen time stats. "
            "Eye-opening for teens 13-18."
        ),
        (
            "Start Your First Business as a Teen — from lemonade stands to Shopify stores. "
            "DESIGN: Fresh and youthful — bright teal, warm peach, and white. "
            "Step-by-step roadmaps, real teen entrepreneur examples, revenue calculators. "
            "Empowering for ages 14-18."
        ),
        (
            "The History of Hip-Hop — from block parties in the Bronx to a global billion-dollar culture. "
            "DESIGN: Street art — spray paint textures, bold black and gold, graffiti typography. "
            "Era timelines, artist spotlights, cultural impact stats. Authentic and respectful."
        ),
        (
            "Climate Change Explained for Gen Z — the science, the stakes, and what you can actually do. "
            "DESIGN: Split palette — burnt orange/red for danger, cool blue/green for solutions. "
            "Data visualizations, action checklists, impact calculators. Urgent but empowering."
        ),
        (
            "SAT Math Strategies That Actually Work — beat the test, not just study harder. "
            "DESIGN: Clean notebook aesthetic — lined paper texture, blue and red pen marks. "
            "Worked examples, strategy cards, time management tips. Practical, not boring."
        ),
        (
            "Film Analysis 101 — how to watch movies like a director. Camera angles, lighting, and storytelling. "
            "DESIGN: Cinematic — dark backgrounds, wide aspect ratio frames, spotlight lighting. "
            "Shot comparison frames, director techniques, film still analysis. Cool and smart."
        ),
        (
            "Intro to Python Programming — write your first code, build your first game. "
            "DESIGN: Code editor dark theme — charcoal background, syntax-highlighted code in green, blue, orange. "
            "Code snippets, output screenshots, project milestone cards. Geeky and rewarding."
        ),
        (
            "The Science of Sports Performance — why athletes train the way they do. "
            "DESIGN: Athletic — dark navy, electric orange, and white. ESPN-broadcast energy. "
            "Biomechanics diagrams, training split charts, nutrition breakdowns. Sporty and data-driven."
        ),
        (
            "College Application Decoded — essays, extracurriculars, and standing out from 100,000 applicants. "
            "DESIGN: Ivy-league-meets-modern — forest green, cream, with clean sans-serif type. "
            "Timeline planners, essay structure diagrams, acceptance rate stats. Helpful and calming."
        ),
    ],

    # ═══════ TECHNOLOGY (Adult, ~12 topics) ═══════
    "technology": [
        (
            "AI in 2026 — where we are, what's real, and what's still hype. "
            "DESIGN: Futuristic minimal — white and soft blue with one electric accent. "
            "Capability comparison charts, timeline forecasts, industry adoption stats. Grounded futurism."
        ),
        (
            "Cybersecurity for Normal People — protect yourself without becoming paranoid. "
            "DESIGN: Dark mode — near-black with neon green matrix-style accents. "
            "Threat level diagrams, password strength visuals, phishing examples. Serious but accessible."
        ),
        (
            "Building Your First Mobile App — from idea to App Store in 2026. "
            "DESIGN: Bright and modern — gradient from sky blue to soft purple. "
            "Wireframe mockups, tech stack comparisons, launch checklist. Fresh and encouraging."
        ),
        (
            "The Cloud Explained — AWS, Azure, GCP for decision-makers. "
            "DESIGN: Enterprise clean — white, steel blue, subtle gradients. "
            "Architecture diagrams, cost comparisons, migration roadmaps. Professional clarity."
        ),
        (
            "No-Code Revolution — build apps, automate workflows, and launch products without writing code. "
            "DESIGN: Friendly and accessible — warm purple, soft pink, white. "
            "Tool comparison grids, workflow diagrams, before/after visuals. Empowering, not intimidating."
        ),
        (
            "Web3 and Crypto in 2026 — what survived the hype cycle and what's actually useful. "
            "DESIGN: Blockchain aesthetic — dark backgrounds, holographic gradients, neon blue and purple. "
            "Market cap timelines, use-case matrices, adoption curves. Skeptical but fair."
        ),
        (
            "System Design Interview Prep — designing scalable systems from scratch. "
            "DESIGN: Whiteboard aesthetic — clean white, markers in blue/red/green. "
            "Architecture diagrams, capacity math, trade-off tables. Technical and clear."
        ),
        (
            "The Data Science Pipeline — from raw data to actionable insights. "
            "DESIGN: Analytical — dark charcoal, data-blue, orange accents for highlights. "
            "Pipeline flow diagrams, before/after data visuals, tool ecosystem maps. Sharp and smart."
        ),
        (
            "DevOps in Practice — CI/CD, containers, and shipping faster without breaking things. "
            "DESIGN: Terminal green on dark backgrounds, pipeline flow aesthetic. "
            "Deployment pipeline visuals, tool comparison grids, metric dashboards. Engineer-approved."
        ),
        (
            "Electric Vehicles in 2026 — the state of EVs, charging infrastructure, and what's next. "
            "DESIGN: Sleek automotive — glossy black, electric blue, silver chrome. "
            "Range comparison charts, charging network maps, cost-of-ownership calculators. Tesla-showroom clean."
        ),
        (
            "Smart Home Setup Guide — automate your home without losing your mind. "
            "DESIGN: Cozy tech — warm wood tones, soft white, with blue smart-device accents. "
            "Room-by-room setups, device comparison tables, automation flow diagrams. Practical and inviting."
        ),
        (
            "API Design Best Practices — building APIs developers actually want to use. "
            "DESIGN: Developer docs aesthetic — clean white, code-block grey, blue links. "
            "Endpoint structure examples, versioning strategies, error handling patterns. Clean and authoritative."
        ),
    ],

    # ═══════ EDUCATION & LEARNING (Adult, ~12 topics) ═══════
    "education": [
        (
            "The History of Money — from seashells to Bitcoin, how we decided what has value. "
            "DESIGN: Rich and layered — antique gold, parchment cream, deep brown. "
            "Timeline visuals, currency photography, economic diagrams. Museum-exhibit quality."
        ),
        (
            "How Your Brain Actually Learns — neuroscience of memory, habits, and focus. "
            "DESIGN: Warm science — soft blue brain imagery, neural network patterns, cream backgrounds. "
            "Brain region diagrams, learning curve charts, technique comparisons. Smart and approachable."
        ),
        (
            "World War II in 10 Slides — the key moments that shaped the modern world. "
            "DESIGN: Documentary — desaturated photography, sepia tones, bold white headlines on dark. "
            "Timeline bars, map movements, casualty infographics. Respectful and impactful."
        ),
        (
            "Philosophy for Everyone — the big questions humans have asked for 3,000 years. "
            "DESIGN: Thoughtful and elegant — deep midnight blue, warm ivory, gold accents. "
            "Philosopher portraits, concept maps, thought experiment cards. Intellectual but not pretentious."
        ),
        (
            "The Physics of Everyday Life — why planes fly, phones work, and ice is slippery. "
            "DESIGN: Playful science — white with bright accent colors per topic. "
            "Force diagrams made fun, real-world photo examples, surprising fact callouts. Curious and delightful."
        ),
        (
            "Introduction to Investing — stocks, bonds, ETFs, and building wealth over time. "
            "DESIGN: Clean finance — white, forest green, subtle gold. Trust-building aesthetic. "
            "Portfolio pie charts, compound growth curves, risk comparison tables. Calm and confidence-building."
        ),
        (
            "The Renaissance Explained — art, science, and the rebirth that changed everything. "
            "DESIGN: Renaissance-inspired — rich oil painting colors, warm golds, deep reds, marble textures. "
            "Artwork close-ups, inventor diagrams, timeline of masterpieces. Beautiful and cultured."
        ),
        (
            "How Languages Work — the fascinating science of human communication. "
            "DESIGN: Global and warm — earth tones with pops of different cultural colors. "
            "Language family trees, phonetic charts, writing system comparisons. Scholarly and beautiful."
        ),
        (
            "Space Exploration 2026 — Mars missions, the Artemis program, and the new space race. "
            "DESIGN: NASA-inspired — deep space black, rocket white, mission-patch colors. "
            "Mission timelines, rocket comparisons, orbital diagrams. Awe-inspiring and factual."
        ),
        (
            "Nutrition Science — what the research actually says about diet, not what influencers tell you. "
            "DESIGN: Fresh and clean — crisp white, leafy green, warm orange food tones. "
            "Macro breakdowns, myth-busting comparison cards, meal example photos. Evidence-based and practical."
        ),
        (
            "The History of Video Games — from Pong to photorealism in 50 years. "
            "DESIGN: Retro to modern gradient — pixel art greens evolving into modern RGB. "
            "Console timeline, revenue growth charts, genre evolution trees. Nostalgic and fascinating."
        ),
        (
            "Public Speaking Without the Panic — practical techniques for confident presentations. "
            "DESIGN: Stage-inspired — dark curtain backgrounds, spotlight white, confident red. "
            "Body language guides, structure frameworks, anxiety management techniques. Empowering and warm."
        ),
    ],

    # ═══════ CREATIVE & DESIGN (Adult, ~8 topics) ═══════
    "creative": [
        (
            "Color Theory for Everyone — why certain colors make you feel things. "
            "DESIGN: Showcase palette — each slide explores a different color family with full-bleed swatches. "
            "Color wheels, brand examples, emotional association maps. A visual feast."
        ),
        (
            "Typography That Speaks — choosing fonts that match your message. "
            "DESIGN: Type-specimen aesthetic — giant letterforms, clean white space, black and one accent. "
            "Font pairing examples, hierarchy demonstrations, mood boards. Elegant and educational."
        ),
        (
            "Mobile Photography Tips — pro-level shots with just your phone. "
            "DESIGN: Gallery minimal — white borders, full-bleed photo examples, subtle grey text. "
            "Before/after comparisons, composition overlays, editing app workflows. Inspiring and actionable."
        ),
        (
            "Design Thinking Workshop — solve real problems with empathy and creativity. "
            "DESIGN: Sticky-note colorful — bright yellow, pink, blue, green on white. "
            "Process flow diagrams, persona cards, ideation frameworks. Collaborative and energetic."
        ),
        (
            "Brand Identity from Scratch — building a visual brand that people remember. "
            "DESIGN: Case-study style — clean white with one bold brand color per example. "
            "Logo evolution stories, moodboard layouts, brand guideline excerpts. Professional portfolio quality."
        ),
        (
            "The Art of Data Visualization — turn boring spreadsheets into compelling stories. "
            "DESIGN: Infographic-rich — dark backgrounds with bright, clear chart colors. "
            "Before/after chart makeovers, visual hierarchy examples, tool comparisons. Data made beautiful."
        ),
        (
            "Interior Design Basics — creating spaces that feel as good as they look. "
            "DESIGN: Magazine editorial — soft neutrals with one statement color per room. "
            "Room layouts, color palette cards, before/after transformations. Aspirational and achievable."
        ),
        (
            "Canva vs. Figma vs. Adobe — choosing the right design tool for your needs. "
            "DESIGN: Tool comparison — clean grid layout, each tool's brand colors in its section. "
            "Feature matrices, use-case flowcharts, pricing breakdowns. Practical decision-making."
        ),
    ],
}

TAG_POOLS = {
    "business": ["strategy", "finance", "growth", "startup", "investment", "leadership", "career", "entrepreneurship"],
    "lifestyle": ["wellness", "cooking", "travel", "hobbies", "self-improvement", "culture", "food", "fitness"],
    "pop_culture": ["movies", "music", "gaming", "trending", "entertainment", "TV shows", "social media", "viral"],
    "kids": ["kids", "elementary", "fun learning", "interactive", "colorful", "playful", "science", "adventure"],
    "teens": ["high school", "study tips", "exam prep", "teen life", "college prep", "coding", "sports"],
    "technology": ["software", "AI", "cloud", "development", "data", "security", "apps", "automation"],
    "education": ["learning", "history", "science", "tutorial", "knowledge", "research", "academic", "culture"],
    "creative": ["design", "art", "visual", "branding", "photography", "typography", "UX", "portfolio"],
}

# Category-specific descriptions for community_decks
CATEGORY_DESCRIPTIONS = {
    "business": "professionals and entrepreneurs",
    "lifestyle": "anyone looking to learn something new and fun",
    "pop_culture": "fans and culture enthusiasts",
    "kids": "young learners and curious kids",
    "teens": "students and teens",
    "technology": "developers and tech enthusiasts",
    "education": "lifelong learners and curious minds",
    "creative": "designers and creative professionals",
}

# Map to community_decks category values
CATEGORY_MAP = {
    "business": "business",
    "lifestyle": "personal",
    "pop_culture": "creative",
    "kids": "education",
    "teens": "education",
    "technology": "technology",
    "education": "education",
    "creative": "creative",
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

        audience = CATEGORY_DESCRIPTIONS.get(category, "everyone")
        mapped_category = CATEGORY_MAP.get(category, category)
        description = f"AI-generated presentation covering {title.lower()}. Perfect for {audience}."

        community_data = {
            "deck_uuid": deck_uuid,
            "user_id": USER_ID,
            "title": title,
            "description": description,
            "category": mapped_category,
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


def extract_title(topic: str) -> str:
    """Extract a clean title from the topic prompt (first sentence or clause)."""
    # Take text before the first period, dash, or DESIGN:
    for delimiter in [" — ", " - ", ". ", " DESIGN:"]:
        if delimiter in topic:
            return topic.split(delimiter)[0].strip()
    return topic[:80].strip()


async def process_topic(topic: str, category: str, index: int, total: int) -> bool:
    """Process a single topic."""
    tags = random.sample(TAG_POOLS.get(category, []), min(3, len(TAG_POOLS.get(category, []))))
    num_slides = random.randint(6, 10)
    title = extract_title(topic)

    try:
        print(f"  [{index+1:2d}/{total}] {title[:50]}...")
        print(f"           Generating {num_slides} slides...", end="", flush=True)

        deck_uuid, slides_count = await generate_deck_direct(topic, num_slides)
        print(f" done ({slides_count} slides)")

        print(f"           Adding to community...", end="", flush=True)
        if add_to_community(deck_uuid, title, category, tags):
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
    print("Diverse palettes, age ranges, pop culture, and engaging content")
    print("=" * 70)

    # Build presentation list
    presentations = []
    for category, topics in TOPICS.items():
        for topic in topics:
            presentations.append({"category": category, "topic": topic})

    random.shuffle(presentations)
    total_available = len(presentations)
    presentations = presentations[:100]  # Limit to 100

    # Count by category
    category_counts = {}
    for p in presentations:
        category_counts[p["category"]] = category_counts.get(p["category"], 0) + 1

    print(f"\nWill create {len(presentations)} presentations (from {total_available} available)")
    print("Category breakdown:")
    for cat, count in sorted(category_counts.items()):
        print(f"  {cat:15s}: {count}")
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
    print(f"\nCategory results:")
    for cat, count in sorted(category_counts.items()):
        print(f"  {cat:15s}: {count} attempted")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
