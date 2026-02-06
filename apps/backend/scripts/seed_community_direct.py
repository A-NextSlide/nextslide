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
    # ═══════ BOARDROOM — Wall Street polish, McKinsey precision (12) ═══════
    "boardroom": [
        (
            "Q4 Financial Results and Growth Analysis for a SaaS company. "
            "DESIGN: Deep navy and gold palette. Goldman Sachs-grade polish. Big hero numbers per slide. "
            "INTERACTIVE: Build a tabbed dashboard — one tab per KPI (ARR, churn, NRR, CAC payback). "
            "Each tab reveals an animated chart that draws on click."
        ),
        (
            "Series A Pitch Deck for an AI-powered climate-tech startup. "
            "DESIGN: Gradient from electric blue to teal. One punchy sentence per slide. "
            "INTERACTIVE: Create a flip-card grid — front shows the problem metric, back reveals the solution. "
            "Add a live TAM/SAM/SOM slider that recalculates market size on drag."
        ),
        (
            "Management Consulting Framework Toolkit — MECE, Porter's Five Forces, BCG Matrix in action. "
            "DEEP DIVE FORMAT: This is an information-dense reference deck. Use detailed explanations, "
            "comprehensive bullet lists, worked examples, and thorough framework breakdowns on each slide. "
            "DESIGN: Crisp white, charcoal, one red accent. McKinsey-clean. "
            "INTERACTIVE: Each framework is a clickable card that expands into a fully labeled interactive diagram. "
            "Add a quiz slide — 'Which framework fits this scenario?' with reveal-on-click answers."
        ),
        (
            "Annual Strategic Planning Offsite — vision, OKRs, and resource allocation for 2027. "
            "DESIGN: Dark charcoal with emerald green accents. Executive gravitas. "
            "INTERACTIVE: Build a draggable priority matrix (Impact vs. Effort) where users place OKRs. "
            "Add an expandable accordion for each strategic pillar with nested goals."
        ),
        (
            "Investor Relations Quarterly Update — Q1 performance, guidance, and capital allocation. "
            "DESIGN: Classic navy and white with subtle silver. Wall Street polished. "
            "INTERACTIVE: Add an interactive waterfall chart showing revenue bridge from Q4 to Q1. "
            "Include tabbed views for Income Statement, Balance Sheet, and Cash Flow."
        ),
        (
            "M&A Due Diligence Playbook — from LOI to close in 90 days. "
            "DEEP DIVE FORMAT: This is an information-dense reference deck. Use detailed process descriptions, "
            "comprehensive checklists, legal/financial term definitions, and thorough phase breakdowns on each slide. "
            "DESIGN: Steel blue and slate grey. Serious, precise, institutional. "
            "INTERACTIVE: Build an interactive timeline with expandable milestone cards for each due diligence phase. "
            "Add a checklist per phase that toggles complete/incomplete."
        ),
        (
            "Customer Experience Strategy — turning NPS detractors into promoters. "
            "DESIGN: Vibrant purple and white, clean and energetic. "
            "INTERACTIVE: Create an interactive customer journey map — click each touchpoint to reveal pain points and solutions. "
            "Add a before/after slider showing CX metrics improvement."
        ),
        (
            "Product-Led Growth Playbook — how the product sells itself. "
            "DESIGN: Clean white with bright coral accents. Modern SaaS aesthetic. "
            "INTERACTIVE: Build an interactive funnel — click each stage (Awareness → Activation → Revenue → Referral) to see conversion tactics. "
            "Add a calculator that estimates revenue impact of improving each stage by 10%."
        ),
        (
            "Board of Directors Meeting Deck — governance, financials, and strategic decisions. "
            "DESIGN: Midnight blue, warm ivory, gold dividers. Boardroom gravitas. "
            "INTERACTIVE: Build tabbed sections for each agenda item with expandable detail panels. "
            "Add voting cards — 'Approve / Discuss / Table' for each resolution."
        ),
        (
            "Private Equity Value Creation Plan — 100-day playbook post-acquisition. "
            "DESIGN: Black, gold, and white. Premium and commanding. "
            "INTERACTIVE: Create a Gantt-style interactive timeline for the 100-day plan. "
            "Each workstream is a clickable row that expands to show milestones and owners."
        ),
        (
            "Competitive Intelligence Briefing — landscape analysis across 8 market players. "
            "DESIGN: Dark background, neon data accents (cyan, lime, magenta). War-room aesthetic. "
            "INTERACTIVE: Build a comparison matrix — click any competitor to highlight their row. "
            "Add a radar chart that overlays competitors on click for visual comparison."
        ),
        (
            "Pricing Strategy Workshop — from cost-plus to value-based pricing. "
            "DESIGN: Rich burgundy and gold. Powerful and commanding. "
            "INTERACTIVE: Build a pricing calculator with sliders for cost, margin, and willingness-to-pay. "
            "Add a flip-card deck — front shows pricing model name, back reveals when to use it."
        ),
    ],

    # ═══════ STORYTELLING — Cinematic narrative, documentary, emotional (12) ═══════
    "storytelling": [
        (
            "How Coffee Conquered the World — from Ethiopian goat herders to your $7 oat latte. "
            "DESIGN: Warm earthy tones — espresso brown, cream, caramel. Coffee-table book quality. "
            "INTERACTIVE: Build an interactive world map — click each region (Ethiopia, Yemen, Colombia, Italy, Japan) "
            "to reveal its coffee story in a slide-out panel with timeline."
        ),
        (
            "The Unsinkable Story of the Titanic — engineering marvel, human hubris, and the aftermath. "
            "DESIGN: Deep ocean midnight blue, icy white, rusted copper. Cinematic and haunting. "
            "INTERACTIVE: Build a cross-section diagram of the ship — click each deck to reveal stories of passengers. "
            "Add a timeline that scrolls through the night of the sinking in real time."
        ),
        (
            "The Rise and Fall of Blockbuster — and why Netflix saw what they couldn't. "
            "DESIGN: Retro blue and yellow (Blockbuster brand), fading into Netflix red. Nostalgic to modern. "
            "INTERACTIVE: Build a timeline with pivotal decision points — click each to see 'What they did' vs 'What they should have done'. "
            "Add a revenue comparison chart that animates the crossover moment."
        ),
        (
            "How One Photograph Changed the World — 10 images that altered history. "
            "DESIGN: Gallery black with soft spotlight lighting. Reverent and powerful. "
            "INTERACTIVE: Each photo is a hover-to-reveal card — the image loads first, then context fades in below. "
            "Add a before/after slider for the 'Napalm Girl' photo showing Vietnam then vs. now."
        ),
        (
            "The Space Race — how cold war rivalry put humans on the Moon. "
            "DESIGN: Retro NASA — midnight blue, rocket red, star white, mission-patch styling. "
            "INTERACTIVE: Build a dual-timeline — USA on top, USSR on bottom — scrolling side by side. "
            "Click any mission to expand a card with crew, objectives, and outcome."
        ),
        (
            "Street Food Around the World — the best bites from Bangkok to Mexico City to Lagos. "
            "DESIGN: Bold, vibrant, saturated — hot reds, bright yellows, street-art energy. "
            "INTERACTIVE: Build an interactive food map — click a city pin to reveal its signature dish with "
            "a flip card showing recipe on the back. Add a 'taste profile' radar chart per dish."
        ),
        (
            "The Silk Road — how ancient trade routes connected civilizations and shaped the modern world. "
            "DESIGN: Rich warm golds, deep reds, sandy beige, turquoise mosaic patterns. "
            "INTERACTIVE: Build an animated route map — click each stop (Xi'an, Samarkand, Constantinople) "
            "to reveal what was traded there. Add a timeline slider from 200 BC to 1400 AD."
        ),
        (
            "The Psychology of Cults — why smart people join and how they get out. "
            "DESIGN: Dark, moody — deep purple, smoky grey, one piercing red accent. Unsettling but elegant. "
            "INTERACTIVE: Build a step-by-step 'influence funnel' — click each stage to reveal manipulation tactics. "
            "Add a quiz: 'Can you spot the cult recruitment technique?' with reveal answers."
        ),
        (
            "Taylor Swift's Eras — a journey through every album and reinvention. "
            "DESIGN: Each slide matches an album's palette — country gold to Midnights lavender. "
            "INTERACTIVE: Build a tabbed era selector at the top — clicking each era changes the entire slide's "
            "color scheme and content. Add streaming stats that animate on reveal."
        ),
        (
            "The History of Sneaker Culture — from basketball courts to billion-dollar collabs. "
            "DESIGN: Street style — black, white, and a pop of fire engine red. Bold and urban. "
            "INTERACTIVE: Build a sneaker timeline — click each era to reveal the defining shoe with a 360° "
            "card rotation. Add a price tracker that shows resale value over time."
        ),
        (
            "Chernobyl — the disaster, the cover-up, and the 1000-year aftermath. "
            "DESIGN: Desaturated, eerie — grey-green, hazard yellow, concrete textures. Documentary grit. "
            "INTERACTIVE: Build an interactive reactor cross-section — click each component to learn what failed. "
            "Add a radiation decay timeline slider showing Pripyat's contamination levels over decades."
        ),
        (
            "The Golden Age of Piracy — Blackbeard, Anne Bonny, and the real pirates of the Caribbean. "
            "DESIGN: Aged parchment, deep sea navy, weathered gold, rum amber. Treasure map aesthetic. "
            "INTERACTIVE: Build a pirate route map — click each port to reveal pirate stories and loot records. "
            "Add flip cards for each legendary pirate — portrait on front, biography on back."
        ),
    ],

    # ═══════ DATA BEAUTIFUL — Visualization-forward, information-dense (12) ═══════
    "data_beautiful": [
        (
            "The World in Numbers — 2026 global statistics that will surprise you. "
            "DESIGN: Dark background, neon data accents (cyan, magenta, lime). Information-is-beautiful style. "
            "INTERACTIVE: Build a tabbed dashboard — Demographics, Economy, Environment, Technology. "
            "Each tab shows animated counters, comparison bars, and a 'Did you know?' flip card."
        ),
        (
            "How the Internet Moves — undersea cables, data centers, and the physical infrastructure of the web. "
            "DESIGN: Deep ocean blue to electric cyan gradient. Technical elegance. "
            "INTERACTIVE: Build an interactive world map showing undersea cable routes — click any cable to see "
            "its capacity, owner, and year laid. Add a bandwidth calculator: 'How much data flows through here per second?'"
        ),
        (
            "The Economics of Fast Fashion — from $5 t-shirts to environmental disaster. "
            "DESIGN: Split aesthetic — glossy magazine pink on one side, industrial grey-brown on the other. "
            "INTERACTIVE: Build a before/after comparison slider — glamour shot vs. factory reality. "
            "Add an interactive cost breakdown: 'Where does your $30 go?' with animated pie chart segments."
        ),
        (
            "Global Energy Transition — fossil fuels to renewables in real-time data. "
            "DESIGN: Gradient from smoky coal grey to clean solar gold to wind-turbine white. "
            "INTERACTIVE: Build a stacked area chart with a year slider (2000-2030) showing energy mix evolution. "
            "Add country comparison tabs — click a flag to see that nation's energy breakdown."
        ),
        (
            "The Anatomy of a Viral Tweet — what 10 million data points tell us about going viral. "
            "DESIGN: Twitter blue, algorithmic green, notification red on dark. Social data aesthetic. "
            "INTERACTIVE: Build an interactive scatter plot — click any cluster to see example tweets. "
            "Add sliders for 'Post Time', 'Word Count', 'Has Image?' to see predicted virality score."
        ),
        (
            "City vs. City — comparing the world's great cities across 20 metrics. "
            "DESIGN: Urban nightscape — dark with colorful city-light accents per city. "
            "INTERACTIVE: Build a radar chart comparing 6 cities across dimensions (cost, safety, culture, transit, food, nightlife). "
            "Click any city to highlight its line. Add a ranking table that sorts on column click."
        ),
        (
            "The Data Behind Olympic Greatness — what the numbers reveal about peak human performance. "
            "DESIGN: Olympic gold, silver, bronze on clean white. Athletic precision. "
            "INTERACTIVE: Build a sport selector dropdown — choosing a sport shows how world records have improved. "
            "Add a body-type comparison panel: click a sport to see the ideal athlete's proportions."
        ),
        (
            "Spotify Wrapped: Deconstructed — how they analyze 600 million users' listening habits. "
            "DESIGN: Spotify green and gradient purple to pink. Wrapped-campaign energy. "
            "INTERACTIVE: Build a mock 'Your Wrapped' experience — click through slides that reveal genre stats, "
            "top artist rankings, and listening time with animated number counters."
        ),
        (
            "The Real Cost of Living — comparing purchasing power across 30 global cities. "
            "DESIGN: Clean finance — white, forest green, subtle gold. Trust-building aesthetic. "
            "INTERACTIVE: Build a city comparison tool — pick two cities from dropdowns to see side-by-side "
            "cost breakdowns (rent, food, transport). Add a 'salary needed' calculator."
        ),
        (
            "Carbon Footprint by the Numbers — your daily choices in CO₂ equivalents. "
            "DESIGN: Earth tones fading to alarm red. Urgent but data-driven. "
            "INTERACTIVE: Build a personal carbon calculator — sliders for diet, transport, housing, shopping. "
            "Each slider updates a live total. Add comparison bars: 'You vs. average American vs. average Indian.'"
        ),
        (
            "The Wealth Gap Visualized — from minimum wage to Elon Musk in one scrollable scale. "
            "DESIGN: Stark — plain white with a single blue bar that extends absurdly far. Powerful minimalism. "
            "INTERACTIVE: Build a scrollable wealth comparison — the bar literally extends off-screen. "
            "Add clickable wealth milestones: '$100K savings', '$1M net worth', '$1B' with context cards."
        ),
        (
            "Sleep Around the World — how different countries sleep and why it matters. "
            "DESIGN: Dreamy gradient from deep indigo to soft lavender. Calm and soothing. "
            "INTERACTIVE: Build a world map colored by average sleep hours — click any country for a breakdown. "
            "Add a quiz: 'Guess which country sleeps the most?' with animated reveal."
        ),
    ],

    # ═══════ WEIRD KNOWLEDGE — Niche, surprising, 'I had no idea' topics (14) ═══════
    "weird_knowledge": [
        (
            "The Secret Lives of Fungi — how mushroom networks run the forest internet. "
            "DESIGN: Dark forest greens, bioluminescent blue, mycelium white on near-black. Otherworldly. "
            "INTERACTIVE: Build an interactive forest cross-section — click any tree to see its fungal connections. "
            "Add a 'Did You Know?' accordion with 8 mind-blowing fungi facts."
        ),
        (
            "Why Do We Dream? — the 5 competing theories and what neuroscience actually knows. "
            "DESIGN: Surreal gradient — deep purple through soft pink to dawn gold. Dreamy and mysterious. "
            "INTERACTIVE: Build a theory carousel — swipe through each theory card with supporting evidence. "
            "Add a 'Dream Type Quiz' — pick your common dream, get the psychological interpretation."
        ),
        (
            "The Fascinating World of Competitive Eating — strategy, training, and the science of the human stomach. "
            "DESIGN: Bold diner aesthetic — ketchup red, mustard yellow, checker pattern. Playfully gross. "
            "INTERACTIVE: Build a leaderboard table that sorts by food type (hot dogs, pies, wings). "
            "Add a stomach capacity calculator with a visual that fills as you drag a slider."
        ),
        (
            "Colors That Don't Exist — impossible colors, tetrachromacy, and the limits of human vision. "
            "DESIGN: Each slide showcases a different impossible/unusual color phenomenon. Mind-bending palette. "
            "INTERACTIVE: Build interactive optical illusions — hover to see colors shift. "
            "Add a 'test your color vision' mini-game with hex-code matching."
        ),
        (
            "The History of Timekeeping — from sundials to atomic clocks to why time zones make no sense. "
            "DESIGN: Steampunk-meets-modern — brass, dark wood, with clean digital accents. "
            "INTERACTIVE: Build a timeline (meta!) from 3000 BC to present — click each era for its timekeeping method. "
            "Add an interactive world time zone map showing the weird exceptions (Nepal is UTC+5:45)."
        ),
        (
            "How Bridges Actually Work — the engineering magic hiding in plain sight. "
            "DESIGN: Blueprint aesthetic — dark blue background, white technical drawings, orange force arrows. "
            "INTERACTIVE: Build interactive bridge cross-sections — click to see force distribution with animated arrows. "
            "Add a 'Bridge Type Selector' — pick constraints (span, load, budget) and it recommends a bridge type."
        ),
        (
            "The Psychology of Superstitions — why your brain needs to see patterns that aren't there. "
            "DESIGN: Mystical — deep midnight blue, gold star patterns, tarot-card borders. "
            "INTERACTIVE: Build a superstition world map — click regions to see local superstitions. "
            "Add a 'How Superstitious Are You?' quiz with a score reveal."
        ),
        (
            "Fermentation Nation — how rotting food became humanity's greatest culinary innovation. "
            "DESIGN: Warm, earthy, bubbling — amber, cream, with fizzy animated accents. "
            "INTERACTIVE: Build a 'Fermentation Family Tree' — click any fermented food to see process, origin, and science. "
            "Add a timeline: 'Earliest known fermented food by region' with expandable cards."
        ),
        (
            "Why Do Cats Purr? — 10 animal mysteries science still can't fully explain. "
            "DESIGN: National Geographic style — stunning nature photography, clean white text overlays. "
            "INTERACTIVE: Build a mystery card grid — click each animal to flip and reveal the mystery. "
            "Add a 'Most Surprising' voting panel where you pick which fact shocked you most."
        ),
        (
            "The Mathematics of Origami — how paper folding solved real engineering problems. "
            "DESIGN: Minimal Japanese aesthetic — white, soft grey, one origami-red accent. Clean and precise. "
            "INTERACTIVE: Build step-by-step fold diagrams — click 'Next Fold' to see each step animate. "
            "Add a difficulty selector: Beginner → Intermediate → Engineering-Grade."
        ),
        (
            "The Deadliest Animals on Earth — ranked by actual human fatalities (spoiler: it's not sharks). "
            "DESIGN: Dark, dramatic — blood red accents on deep charcoal. Nature documentary intensity. "
            "INTERACTIVE: Build an interactive ranking — guess the top 10 before revealing. "
            "Add a comparison tool: click any two animals to see a side-by-side stat card."
        ),
        (
            "How Elevators Changed Cities — the hidden technology that made skyscrapers possible. "
            "DESIGN: Art deco — brass, marble cream, deep green. Grand lobby aesthetic. "
            "INTERACTIVE: Build a building cross-section — click floors to see how elevator routing works. "
            "Add a 'Design Your Elevator System' mini-game with capacity and wait-time calculations."
        ),
        (
            "The Science of Cooking — Maillard reactions, emulsification, and why onions make you cry. "
            "DEEP DIVE FORMAT: This is an information-dense science-meets-food reference. Use detailed chemical reactions, "
            "temperature charts, molecular explanations, and thorough technique breakdowns. Explain the WHY behind each process. "
            "DESIGN: Kitchen lab — white tile, copper accents, ingredient photography. Science meets food. "
            "INTERACTIVE: Build a 'Cooking Technique Explorer' — click a technique (sear, braise, ferment) "
            "to see the chemistry animated. Add a temperature guide slider showing what happens at each degree."
        ),
        (
            "Why We Have Accents — the fascinating linguistics of how we speak differently. "
            "DESIGN: Global warmth — earth tones with pops of cultural accent colors. "
            "INTERACTIVE: Build an interactive accent map — click any region to read a phonetic breakdown. "
            "Add a 'Guess the Accent' quiz with audio descriptions and reveal answers."
        ),
    ],

    # ═══════ KIDS WONDER — Ages 5-12, playful, Magic School Bus energy (12) ═══════
    "kids_wonder": [
        (
            "The Solar System Adventure — meet every planet from Mercury to Neptune! "
            "DESIGN: Deep space black with bright planet colors — Saturn's gold, Mars red, Neptune blue. "
            "INTERACTIVE: Build a clickable solar system — click any planet to zoom in and see fun facts in a pop-up card. "
            "Add a 'Planet Size Slider' that shows scale comparisons."
        ),
        (
            "Dinosaurs: The Ultimate Guide — T-Rex, Triceratops, Spinosaurus, and the ones you've never heard of! "
            "DESIGN: Jungle green, volcanic orange, sandy beige. Adventure explorer vibes. "
            "INTERACTIVE: Build a 'Dino Size-O-Meter' — drag a slider to compare dinosaur sizes to a school bus. "
            "Add flip cards for each dinosaur — front is a silhouette, click to reveal the full picture and facts."
        ),
        (
            "How Do Animals Talk? — whale songs, bee dances, elephant rumbles, and more! "
            "DESIGN: Bright and cheerful — sky blue, sunshine yellow, grass green. "
            "INTERACTIVE: Build an animal communication board — click each animal to see HOW it communicates "
            "with animated speech bubbles. Add a 'Match the Sound to the Animal' quiz."
        ),
        (
            "The Ocean Deep — bioluminescent creatures, giant squids, and the Mariana Trench! "
            "DESIGN: Deep ocean gradient — from surface turquoise to midnight black. "
            "INTERACTIVE: Build a depth explorer — scroll/drag to dive deeper. At each depth zone, creatures appear "
            "with clickable fact cards. Add a pressure calculator: 'How much would you weigh here?'"
        ),
        (
            "Volcanoes, Earthquakes, and Tornadoes — Earth's most awesome forces! "
            "DESIGN: Dramatic — molten orange, stormy grey, electric yellow. "
            "INTERACTIVE: Build a volcano cross-section — click layers (magma chamber, vent, crater) to learn each part. "
            "Add a 'Disaster Scale' slider showing intensity from 1 to 10 with real examples."
        ),
        (
            "Build Your Own Robot — introduction to robotics and coding for kids! "
            "DESIGN: Techy and playful — electric blue, neon green, metallic silver. "
            "INTERACTIVE: Build a 'Design Your Robot' panel — click to add parts (wheels, arms, sensors) to a robot body. "
            "Add a simple code-block puzzle: drag commands into the right order to make the robot move."
        ),
        (
            "The Human Body Machine — your heart pumps, lungs breathe, and brain thinks 24/7! "
            "DESIGN: Medical illustration style but fun — warm reds, soft blues, clean white. Kid-friendly anatomy. "
            "INTERACTIVE: Build a body explorer — click each organ to see what it does with animated diagrams. "
            "Add a 'Beat Counter' that shows how many times your heart has beaten since you were born."
        ),
        (
            "Bug Safari — the incredible world of insects living in your backyard! "
            "DESIGN: Garden greens, wildflower colors, magnifying glass motif. Explorer energy. "
            "INTERACTIVE: Build a bug identification card grid — click each bug to flip and see habitat, diet, and superpowers. "
            "Add a 'Bug Size Comparison' tool — see how big a flea would be if it were human-sized."
        ),
        (
            "Math is a Superpower — real-world math with pizza, Minecraft, and sports! "
            "DESIGN: Comic book panels — bright blue, red, yellow. Kapow! energy. "
            "INTERACTIVE: Build interactive math challenges — click to reveal the problem, solve it, then click again for the answer. "
            "Add a 'Math Power Score' that tracks how many you get right across slides."
        ),
        (
            "World Holidays and Celebrations — how kids around the world celebrate! "
            "DESIGN: Festive rainbow — each slide a different cultural color palette. "
            "INTERACTIVE: Build a world map with celebration pins — click any country to see its biggest holiday "
            "with a flip card showing traditions. Add a 'Calendar Wheel' showing celebrations by month."
        ),
        (
            "The Life Cycle of Everything — butterflies, frogs, stars, and even mountains! "
            "DESIGN: Nature-inspired pastels through vivid — soft pinks to deep volcanic reds. "
            "INTERACTIVE: Build a cycle wheel for each subject — click 'Next Stage' to rotate through the lifecycle. "
            "Add a comparison panel: 'How long does each stage take? Days? Millions of years?'"
        ),
        (
            "Space Explorers — the brave astronauts who went to the Moon and beyond! "
            "DESIGN: Retro space — midnight blue, rocket red, star white, mission-patch styling. "
            "INTERACTIVE: Build a mission selector — click any Apollo/Artemis mission for a mission card with crew and objectives. "
            "Add a 'Pack Your Spacesuit' checklist — drag items into a backpack for a moon mission."
        ),
    ],

    # ═══════ TEEN REAL — Ages 13-18, useful, not patronizing (12) ═══════
    "teen_real": [
        (
            "AP Biology Crash Course: Cellular Respiration — ATP, glycolysis, and the Krebs cycle actually explained. "
            "DEEP DIVE FORMAT: This is an information-dense study guide. Use detailed explanations, chemical equations, "
            "step-by-step pathway breakdowns, and mnemonic devices. More text is better — students need the detail. "
            "DESIGN: Clean study aesthetic — white backgrounds, teal and coral accents. "
            "INTERACTIVE: Build a step-by-step pathway diagram — click each stage (glycolysis → Krebs → ETC) "
            "to expand detail. Add a quiz slide with immediate feedback: right answer turns green, wrong turns red."
        ),
        (
            "How Social Media Algorithms Actually Work — and how to take back your attention. "
            "DESIGN: Dark mode black with notification-red and dopamine-blue accents. Phone-screen aesthetic. "
            "INTERACTIVE: Build a simulated feed algorithm — sliders for 'engagement', 'recency', 'friend closeness' "
            "that rearrange a mock feed in real-time. Add a 'Screen Time Impact Calculator.'"
        ),
        (
            "SAT Math Strategies That Actually Work — beat the test, not just study harder. "
            "DEEP DIVE FORMAT: This is an information-dense study guide. Include fully worked example problems, "
            "step-by-step solutions, strategy explanations, and detailed tip breakdowns. Students need the depth. "
            "DESIGN: Notebook aesthetic — lined paper texture, blue and red pen marks. "
            "INTERACTIVE: Build practice problems with 'Show Work' expandable panels. "
            "Add a timer challenge: 'Solve 3 problems in 90 seconds' with a countdown."
        ),
        (
            "Start Your First Business as a Teen — from ideas to income. "
            "DESIGN: Fresh teal, warm peach, and white. Youthful energy. "
            "INTERACTIVE: Build a 'Business Idea Generator' — click through random combinations of skill + market + format. "
            "Add a revenue calculator: inputs for price, customers/week, costs → shows monthly profit."
        ),
        (
            "Climate Change Explained for Gen Z — the science, the stakes, and what you can actually do. "
            "DESIGN: Split palette — burnt orange/red for danger, cool blue/green for solutions. "
            "INTERACTIVE: Build a personal impact calculator — checkboxes for actions you'll take, running total of CO₂ saved. "
            "Add a before/after slider showing climate projections at 1.5°C vs. 3°C warming."
        ),
        (
            "Film Analysis 101 — how to watch movies like a director. Camera angles, lighting, and storytelling. "
            "DESIGN: Cinematic — dark backgrounds, wide aspect ratio frames, spotlight lighting. "
            "INTERACTIVE: Build a shot-type gallery — click each shot type (close-up, wide, Dutch angle) to see an example "
            "with annotation overlay. Add a 'Break Down This Scene' interactive where you identify techniques."
        ),
        (
            "Intro to Python Programming — write your first code, build your first game. "
            "DESIGN: Code editor dark theme — charcoal background, syntax-highlighted code in green, blue, orange. "
            "INTERACTIVE: Build code snippet slides with 'Predict the Output' — click to reveal what the code actually does. "
            "Add a difficulty progression tracker showing your journey from 'Hello World' to 'Game Loop.'"
        ),
        (
            "The Psychology of Procrastination — why your brain sabotages you and 5 evidence-based fixes. "
            "DESIGN: Split — chaotic colorful mess on the left (procrastination), calm organized blue-white on the right (flow). "
            "INTERACTIVE: Build a 'Procrastination Type Quiz' — 5 questions with instant results. "
            "Add an accordion of strategies — click each to expand with the neuroscience explanation."
        ),
        (
            "College Application Decoded — essays, extracurriculars, and standing out from 100,000 applicants. "
            "DESIGN: Ivy-league-meets-modern — forest green, cream, clean sans-serif type. "
            "INTERACTIVE: Build a timeline planner — click each month (Jr. summer → Sr. winter) for a checklist of tasks. "
            "Add a 'Strong vs. Weak Essay' comparison flip card."
        ),
        (
            "The History of Hip-Hop — from block parties in the Bronx to a trillion-dollar culture. "
            "DESIGN: Street art — spray paint textures, bold black and gold, graffiti typography. "
            "INTERACTIVE: Build an era timeline — click each decade for the defining artists, songs, and cultural moments. "
            "Add a 'Guess the Sample' quiz with before/after audio descriptions."
        ),
        (
            "Personal Finance for Teens — the money stuff nobody teaches you in school. "
            "DESIGN: Fresh mint green and charcoal. Clean, youthful, not stuffy. "
            "INTERACTIVE: Build a budget simulator — input a monthly income, drag sliders for spending categories. "
            "Add a compound interest calculator: 'If you save $50/month starting NOW vs. at 30.'"
        ),
        (
            "The Science of Sports Performance — why elite athletes train the way they do. "
            "DESIGN: Athletic — dark navy, electric orange, white. ESPN-broadcast energy. "
            "INTERACTIVE: Build a sport selector — pick a sport to see the key performance metrics and training methods. "
            "Add a 'Body System Explorer' — click muscles, heart, lungs to see how training adapts them."
        ),
    ],

    # ═══════ MAKER BUILDER — DIY, technical craftsmanship, how-to (10) ═══════
    "maker_builder": [
        (
            "Build a Mechanical Keyboard from Scratch — switches, PCBs, and the perfect thock. "
            "DESIGN: Product photography style — dark desk, warm lighting, macro lens detail. Premium craft. "
            "INTERACTIVE: Build a 'Switch Selector' — click switch types (linear, tactile, clicky) to compare "
            "sound profiles and force curves. Add a parts checklist with cost calculator."
        ),
        (
            "Woodworking for Beginners — from a cutting board to a bookshelf in 5 projects. "
            "DESIGN: Warm wood tones, workshop aesthetic, blueprint accents. Honest craftsmanship. "
            "INTERACTIVE: Build a project difficulty ladder — click each project to expand with tools needed, "
            "time estimate, and step-by-step photos. Add a 'Wood Type Guide' flip cards."
        ),
        (
            "Home Espresso Setup — from beans to perfect extraction on any budget. "
            "DESIGN: Coffee shop aesthetic — espresso brown, marble white, brass accents. Artisan warmth. "
            "INTERACTIVE: Build a budget selector (Under $200 / $500 / $1000+) that changes the recommended gear. "
            "Add an extraction calculator: grind size + dose + time → predicted quality rating."
        ),
        (
            "Raspberry Pi Projects That Actually Do Something — 8 builds from security camera to retro arcade. "
            "DESIGN: Terminal green on dark, circuit-board trace patterns, maker-space energy. "
            "INTERACTIVE: Build a project grid — click each project for a difficulty badge, parts list, and wiring diagram. "
            "Add a 'What Should I Build?' quiz based on your interests and skill level."
        ),
        (
            "Sourdough Bread Mastery — the science and art of the perfect loaf. "
            "DESIGN: Rustic warm — golden crust colors, flour-white, kitchen slate. Bakery morning light. "
            "INTERACTIVE: Build a fermentation timeline — slider shows what's happening in the dough at each hour. "
            "Add a troubleshooting accordion: 'Too dense?', 'No rise?', 'Gummy inside?' with fixes."
        ),
        (
            "DIY Smart Home on a Budget — $200 worth of sensors and automations that change your life. "
            "DESIGN: Cozy tech — warm wood tones, soft white, blue smart-device accents. "
            "INTERACTIVE: Build a room selector — click Kitchen, Bedroom, Entrance to see recommended automations. "
            "Add a total cost calculator that updates as you add/remove devices."
        ),
        (
            "Screen Printing at Home — design, burn, pull: the complete guide. "
            "DESIGN: Ink-splatter aesthetic — bold Pantone swatches, halftone patterns, studio grey. "
            "INTERACTIVE: Build a step-by-step process flow — click each stage for a photo guide and tips. "
            "Add a 'Mesh Count Selector' that shows print quality at different mesh counts."
        ),
        (
            "Electric Skateboard Build — motors, batteries, and 30mph on a deck you made. "
            "DESIGN: Street energy — asphalt grey, electric blue, safety orange. Urban builder. "
            "INTERACTIVE: Build a component configurator — choose motor, battery, deck to see speed, range, and cost. "
            "Add a comparison table: DIY build vs. commercial boards."
        ),
        (
            "Leather Crafting Basics — wallets, belts, and bags you'll keep for decades. "
            "DESIGN: Rich leather browns, brass hardware, stitching-line patterns. Timeless workshop. "
            "INTERACTIVE: Build a leather type comparison — click each (full-grain, top-grain, bonded) to see properties. "
            "Add a project selector with estimated time and skill level badges."
        ),
        (
            "Cocktail Crafting Masterclass — classic recipes, the science behind the shake, and home bar essentials. "
            "DESIGN: Art deco — deep teal, copper, and black. Moody speakeasy vibes. "
            "INTERACTIVE: Build a cocktail explorer — select a spirit base to see classic recipes fan out. "
            "Add a 'Build Your Home Bar' checklist with budget tiers."
        ),
    ],

    # ═══════ CULTURE LENS — Global culture, anthropology, social phenomena (12) ═══════
    "culture_lens": [
        (
            "How Different Cultures Say 'I Love You' — the 5 love languages around the world. "
            "DESIGN: Warm, romantic — rose pink, deep red, soft gold. Culturally diverse photography. "
            "INTERACTIVE: Build a world map of love expressions — click each country for the phrase, context, and cultural meaning. "
            "Add a 'Love Language Quiz' adapted for cross-cultural understanding."
        ),
        (
            "The Architecture of Sacred Spaces — from Gothic cathedrals to Zen temples. "
            "DESIGN: Reverent — stone grey, stained-glass color pops, gold leaf accents. "
            "INTERACTIVE: Build a comparison gallery — click to toggle between traditions (Christian, Islamic, Buddhist, Hindu). "
            "Add an architectural element identifier — click parts of a building to learn their names and purpose."
        ),
        (
            "Street Art as Resistance — Banksy, Basquiat, and the walls that talk back. "
            "DESIGN: Raw urban — concrete grey, spray paint neon, wheat-paste texture. "
            "INTERACTIVE: Build a street art world tour — click cities to see iconic works with context cards. "
            "Add a 'Legal or Illegal?' quiz about famous street art installations."
        ),
        (
            "The Evolution of Beauty Standards — how 'attractive' changes across cultures and centuries. "
            "DESIGN: Magazine editorial meets museum — clean white, one bold image per slide. "
            "INTERACTIVE: Build a timeline slider — drag through centuries to see beauty ideals shift. "
            "Add a world map showing simultaneous but different beauty standards today."
        ),
        (
            "Death Rituals Around the World — how different cultures honor the departed. "
            "DESIGN: Respectful and beautiful — deep indigo, marigold gold (Día de los Muertos), white lily. "
            "INTERACTIVE: Build a tradition explorer — click each culture (Mexico, Japan, Ghana, Bali, Tibet) for rituals. "
            "Add a comparison panel showing the philosophy behind each approach."
        ),
        (
            "The Psychology of Color Across Cultures — white means mourning in China and purity in the West. "
            "DESIGN: Each slide dedicated to one color with culturally contrasting meanings. Visual feast. "
            "INTERACTIVE: Build a color-culture matrix — click any color to see its meaning across 6 cultures. "
            "Add a 'Design for a Culture' challenge: pick a brand + target culture for color recommendations."
        ),
        (
            "How Music Traveled the World — blues begat rock begat punk, and jazz went everywhere. "
            "DESIGN: Vinyl record aesthetic — grooved circles, warm analog tones, concert poster typography. "
            "INTERACTIVE: Build a genre family tree — click any genre to hear its description and see what it influenced. "
            "Add a timeline that shows simultaneous musical movements across continents."
        ),
        (
            "Dining Etiquette Around the World — chopsticks, hands, forks, and the rules nobody tells tourists. "
            "DESIGN: Elegant table settings — white linen, cultural tableware photography, warm ambient lighting. "
            "INTERACTIVE: Build a 'Dinner Table Simulator' — pick a country, see the place setting, click items to learn rules. "
            "Add a quiz: 'Polite or Rude?' with cultural context reveals."
        ),
        (
            "The World's Oldest Still-Operating Businesses — a 1,400-year-old hotel in Japan and other survivors. "
            "DESIGN: Timeless — aged parchment, serif typography, archival photography aesthetic. "
            "INTERACTIVE: Build a ranked list with expandable cards — click each business to see its full story. "
            "Add a 'Guess How Old' game — see the business, guess the founding year."
        ),
        (
            "Superstitions by Country — why the number 4 is deadly in East Asia and 13 haunts the West. "
            "DESIGN: Mystical — deep midnight blue, gold star patterns, tarot-card borders. "
            "INTERACTIVE: Build a superstition map — click any country for a flip-card grid of local superstitions. "
            "Add a 'How Superstitious Is Your Country?' ranked bar chart."
        ),
        (
            "The Immigrant Kitchen — how diaspora communities transform a nation's food culture. "
            "DESIGN: Vibrant fusion — warm spice colors, market photography, handwritten recipe aesthetic. "
            "INTERACTIVE: Build a 'Fusion Food Tree' — click a dish to trace its origin and adaptation journey. "
            "Add a city selector showing the immigrant food scene in London, NYC, Melbourne, Dubai."
        ),
        (
            "Coming of Age Around the World — Bar Mitzvahs, Quinceañeras, and a Maasai lion hunt. "
            "DESIGN: Celebratory — each slide in the cultural palette of that tradition. "
            "INTERACTIVE: Build a world map of rituals — click pins to see the ceremony details and age. "
            "Add a comparison timeline: at age 13, what does each culture expect?"
        ),
    ],

    # ═══════ ART EXPERIMENTAL — Avant-garde, rule-breaking visual design (10) ═══════
    "art_experimental": [
        (
            "The Anti-Presentation — a presentation about why most presentations are terrible. "
            "DESIGN: Deliberately ugly first slides that progressively become gorgeous. Self-aware meta-design. "
            "INTERACTIVE: Build a 'Rate This Slide' panel on each slide — users vote, results reveal the lesson. "
            "Add before/after sliders showing the same content with bad vs. good design."
        ),
        (
            "Bauhaus Changed Everything — how 105-year-old design principles still rule our screens. "
            "DESIGN: Primary colors, geometric shapes, grid-heavy layout. Pure Bauhaus homage. "
            "INTERACTIVE: Build a principle explorer — click each Bauhaus principle to see it applied to modern UI examples. "
            "Add a 'Spot the Bauhaus' quiz with screenshots of apps."
        ),
        (
            "Typography Crimes — the worst font choices in history and what we can learn from them. "
            "DESIGN: Showcase of horror — Comic Sans headings, Papyrus subheads, then redemption in clean type. "
            "INTERACTIVE: Build a 'Font Crime Lineup' — rate each font pairing from 1-5 stars. "
            "Add a before/after slider showing the same text in terrible vs. perfect typography."
        ),
        (
            "Data Art — when spreadsheets become sculptures and algorithms paint. "
            "DESIGN: Museum gallery — white walls, single piece per slide, subtle shadow borders. "
            "INTERACTIVE: Build a gallery with clickable pieces — each reveals the data source and algorithm behind it. "
            "Add a 'Create Your Own' panel with simple parameter sliders that modify a generative pattern."
        ),
        (
            "The Brutalism Revival — why ugly concrete is beautiful again (in architecture and web design). "
            "DESIGN: Raw concrete textures, monospace type, exposed-grid layout. Deliberately harsh. "
            "INTERACTIVE: Build a comparison gallery — click to toggle between brutalist architecture and its web design equivalent. "
            "Add a 'Brutalist or Modernist?' quiz with photo reveals."
        ),
        (
            "Wabi-Sabi Design — the Japanese art of imperfect beauty in a pixel-perfect world. "
            "DESIGN: Minimal Japanese — asymmetric layouts, natural textures, muted earth tones, intentional emptiness. "
            "INTERACTIVE: Build a 'Perfect vs. Wabi-Sabi' side-by-side slider for design elements. "
            "Add a principle accordion — click each concept (fukinsei, kanso, koko) for visual examples."
        ),
        (
            "Synesthesia Design — what if we designed for people who taste colors and hear shapes? "
            "DESIGN: Cross-sensory — shapes that suggest sounds, color gradients that evoke textures. Experimental. "
            "INTERACTIVE: Build a sensory mapping tool — pick a color and see what taste/texture/sound it maps to. "
            "Add a 'Design for Synesthesia' challenge with comparison panels."
        ),
        (
            "The Color Theory Masterclass — why certain colors make you feel things and buy stuff. "
            "DESIGN: Each slide explores a different color family with full-bleed swatches. Visual feast. "
            "INTERACTIVE: Build an emotional color wheel — click any color segment for its psychological profile. "
            "Add a 'Brand Color Decoder' — pick a famous brand to see why they chose their colors."
        ),
        (
            "Glitch Aesthetics — how digital errors became a deliberate art movement. "
            "DESIGN: Deliberately corrupted — scan lines, RGB channel splits, pixel sorting, static noise. "
            "INTERACTIVE: Build a 'Glitch-O-Matic' — sliders for distortion, color shift, and pixel sort that update a live image. "
            "Add a gallery of intentional glitch art with artist credits."
        ),
        (
            "Infographic Design Rules — the 10 commandments of information design. "
            "DESIGN: Meta — each slide IS an infographic demonstrating the rule it teaches. "
            "INTERACTIVE: Build good/bad comparison sliders for each rule. "
            "Add a 'Fix This Infographic' challenge where you identify 3 problems."
        ),
    ],

    # ═══════ SCIENCE FRONTIER — Cutting-edge science explained accessibly (12) ═══════
    "science_frontier": [
        (
            "CRISPR Explained — gene editing from bacteria to designer babies to curing sickle cell. "
            "DEEP DIVE FORMAT: This is an information-dense science explainer. Use detailed molecular mechanisms, "
            "step-by-step process descriptions, real clinical trial data, and thorough ethical analysis. Go deep. "
            "DESIGN: Biotech — deep teal, DNA-helix patterns, lab-white accents. Precise and clean. "
            "INTERACTIVE: Build an interactive DNA strand — click sections to 'edit' them with a CRISPR animation. "
            "Add a 'Possible or Not Yet?' flip card quiz about gene editing applications."
        ),
        (
            "Quantum Computing for Normal People — qubits, superposition, and why it matters. "
            "DESIGN: Quantum-inspired — deep purple, probability-wave blue, particle-gold on dark. "
            "INTERACTIVE: Build a 'Classical vs. Quantum' comparison panel — click a problem to see solving time on each. "
            "Add a qubit state visualizer with a Bloch sphere you can rotate."
        ),
        (
            "The James Webb Space Telescope — first images and what they reveal about the universe. "
            "DESIGN: Deep space — ultra-dark backgrounds with vivid nebula colors. Awe-inspiring. "
            "INTERACTIVE: Build an image gallery — click each JWST image to zoom in with annotation overlays. "
            "Add a comparison slider: Hubble image on the left, JWST on the right."
        ),
        (
            "The Microbiome Revolution — the 39 trillion bacteria running your body. "
            "DESIGN: Bio-art — microscopy imagery, soft organic colors, cell-membrane textures. "
            "INTERACTIVE: Build a body map — click each organ/region to see its unique microbiome. "
            "Add a 'Diet Impact Simulator' — select foods to see how they affect gut diversity."
        ),
        (
            "Nuclear Fusion Update 2026 — are we actually 10 years away this time? "
            "DESIGN: Energy-forward — sun gold, plasma blue, engineering grey. Powerful and hopeful. "
            "INTERACTIVE: Build a tokamak cross-section — click components to see temperatures and functions. "
            "Add a progress timeline: 'Milestones achieved vs. milestones remaining' with expandable details."
        ),
        (
            "The Science of Aging — why we get old and the 8 drugs being tested to slow it down. "
            "DESIGN: Clinical elegance — clean white, soft blue, subtle aging-to-youth gradient. "
            "INTERACTIVE: Build a 'Hallmarks of Aging' card grid — click each hallmark for mechanism and drug candidates. "
            "Add a longevity calculator: lifestyle inputs → estimated biological age."
        ),
        (
            "Neuroplasticity — your brain rewires itself every day and you can control how. "
            "DESIGN: Neural network aesthetic — dark background, glowing synaptic connections, warm node colors. "
            "INTERACTIVE: Build an interactive brain map — click regions to see what activities strengthen them. "
            "Add a '30-Day Neuroplasticity Challenge' accordion with daily exercises."
        ),
        (
            "The Physics of Black Holes — event horizons, spaghettification, and Hawking radiation. "
            "DESIGN: Cosmic dark — pure black with gravitational lensing effects and accretion disk colors. "
            "INTERACTIVE: Build a black hole simulator — a slider for mass that changes the visual size and Schwarzschild radius. "
            "Add a 'What Happens If You Fall In?' step-by-step timeline with expandable physics."
        ),
        (
            "mRNA Vaccines — how they work, why they were fast, and what's next after COVID. "
            "DESIGN: Biomedical precision — clean white, vaccine-vial blue, cell-diagram pink. "
            "INTERACTIVE: Build a step-by-step cell diagram — click each stage of mRNA translation. "
            "Add a comparison table: traditional vaccines vs. mRNA with flip cards for each difference."
        ),
        (
            "The Ocean's Twilight Zone — the largest unexplored ecosystem on Earth. "
            "DESIGN: Deep gradient — sunlit surface gold fading to abyssal midnight blue-black. "
            "INTERACTIVE: Build a depth-dive scroller — creatures appear at their actual depth with fact cards. "
            "Add a 'What Lives Here?' quiz at each depth zone."
        ),
        (
            "Lab-Grown Meat — the science, the taste tests, and the $50 to $5 price journey. "
            "DESIGN: Food science — clean white lab meets warm kitchen. Half clinical, half appetizing. "
            "INTERACTIVE: Build a process flow — click each step from cell biopsy to burger to see the science. "
            "Add a cost curve chart with a year slider showing price per pound declining."
        ),
        (
            "Dark Matter and Dark Energy — the 95% of the universe we can't see or explain. "
            "DESIGN: Cosmic mystery — deep space black with faint galaxy rotation curves and purple dark matter halos. "
            "INTERACTIVE: Build a universe composition pie chart — click each slice (dark energy, dark matter, normal matter) "
            "to expand into what we know. Add a 'Leading Theories' card carousel."
        ),
    ],

    # ═══════ MONEY STREET — Street-smart finance, real numbers (10) ═══════
    "money_street": [
        (
            "How to Actually Build Wealth in Your 20s — not crypto moonshots, just math. "
            "DESIGN: Fresh mint green and charcoal. Clean, honest, no financial-bro energy. "
            "INTERACTIVE: Build a compound interest calculator — sliders for starting amount, monthly contribution, and years. "
            "Add a 'Where Does Your Money Go?' drag-and-drop budget builder."
        ),
        (
            "The Stock Market Explained — from IPO to your retirement fund in plain English. "
            "DESIGN: Finance-clean — white, deep green, thin gold lines. Bloomberg-terminal meets Apple simplicity. "
            "INTERACTIVE: Build a simulated stock ticker — click a company to see a 10-year chart with key events annotated. "
            "Add a 'Bull or Bear?' quiz with market scenario descriptions."
        ),
        (
            "Real Estate Investing 101 — buy, rent, REIT: which path is right for your money? "
            "DESIGN: Property warm — brick red, cream, forest green, brass accents. Solid and grounded. "
            "INTERACTIVE: Build a property calculator — input price, down payment, rent to see cash-on-cash return. "
            "Add a comparison table: buying vs. renting vs. REITs with pros/cons flip cards."
        ),
        (
            "Side Hustle Economics — the real numbers behind 10 popular side hustles. "
            "DESIGN: Electric lime and dark grey. Scrappy and energetic. "
            "INTERACTIVE: Build a side hustle comparison grid — click each for startup cost, time investment, and realistic monthly income. "
            "Add a 'Best Side Hustle For You' quiz based on skills and time availability."
        ),
        (
            "Cryptocurrency in 2026 — what survived, what died, and where the real value lives. "
            "DESIGN: Blockchain aesthetic — dark backgrounds, holographic gradients, neon blue and purple. "
            "INTERACTIVE: Build a crypto timeline — click years to see market events, crashes, and recoveries. "
            "Add a portfolio simulator: invest a hypothetical $10K across assets and see 1-year projected outcomes."
        ),
        (
            "The Psychology of Money — why smart people make dumb financial decisions. "
            "DESIGN: Thoughtful elegance — deep midnight blue, warm ivory, gold accents. "
            "INTERACTIVE: Build a 'Money Bias Quiz' — 6 scenario questions that reveal your cognitive biases. "
            "Add a comparison panel: 'What people THINK vs. What the data shows' with animated reveals."
        ),
        (
            "Taxes Decoded — how income tax actually works (brackets, deductions, and the W-2 mystery). "
            "DEEP DIVE FORMAT: This is an information-dense financial reference. Use real tax bracket numbers, "
            "detailed deduction explanations, worked examples with actual dollar amounts, and thorough W-2 line-by-line breakdowns. "
            "DESIGN: IRS-meets-modern — patriotic blue and red made sleek with white and clean type. "
            "INTERACTIVE: Build a tax bracket visualizer — input income to see where each dollar goes across brackets. "
            "Add a 'Deduction Finder' checklist — click deductions you qualify for to see estimated savings."
        ),
        (
            "Negotiating Your Salary — scripts, data, and the exact words to use. "
            "DESIGN: Rich burgundy and gold. Power and confidence. "
            "INTERACTIVE: Build a salary comparison tool — pick role + city + experience for market rate ranges. "
            "Add a negotiation script accordion — click each objection to see the recommended response."
        ),
        (
            "Emergency Fund to Financial Freedom — the 7 levels of wealth and how to climb them. "
            "DESIGN: Gradient from survival grey at the bottom to prosperity gold at the top. Journey aesthetic. "
            "INTERACTIVE: Build a 7-level staircase — click each level to see the target, timeline, and strategy. "
            "Add a 'Where Are You Now?' self-assessment quiz with personalized next steps."
        ),
        (
            "Credit Scores Demystified — the 5 factors, the myths, and the 90-day fix plan. "
            "DESIGN: Clean finance — white background, green/amber/red score indicators, dashboard aesthetic. "
            "INTERACTIVE: Build a score factor breakdown — 5 bars showing the weight of each factor with explanatory tooltips. "
            "Add a '90-Day Action Plan' timeline with expandable task cards."
        ),
    ],

    # ═══════ FUTURE NOW — Near-future technology and society (12) ═══════
    "future_now": [
        (
            "AI in 2026 — where we are, what's real, and what's still hype. "
            "DESIGN: Futuristic minimal — white and soft blue with one electric accent. "
            "INTERACTIVE: Build a capability matrix — click each AI domain (vision, language, code, robotics) "
            "for current state vs. 2-year forecast. Add a 'Real or Hype?' quiz with sourced answers."
        ),
        (
            "The Electric Vehicle Tipping Point — 2026 is the year EVs went mainstream. "
            "DESIGN: Sleek automotive — glossy black, electric blue, silver chrome. Tesla-showroom clean. "
            "INTERACTIVE: Build a car comparison tool — select 3 EVs to compare range, price, charge time in a table. "
            "Add a 'Total Cost of Ownership' calculator: EV vs. gas over 5 years."
        ),
        (
            "Space Tourism 2026 — who's going, how much it costs, and when you might afford it. "
            "DESIGN: Premium space — deep black, stardust silver, rocket-flame orange. Aspirational luxury. "
            "INTERACTIVE: Build a space tourism comparison — click SpaceX, Blue Origin, Virgin Galactic for experience details. "
            "Add a price trajectory chart with a 'When will it cost as much as a car?' projection."
        ),
        (
            "The Future of Work — remote, hybrid, AI teammates, and the skills that still matter. "
            "DESIGN: Warm modern — soft coral, cream, clean blue. Human and optimistic. "
            "INTERACTIVE: Build a 'Future-Proof Your Career' tool — select your role to see automation risk and upskill recommendations. "
            "Add a skills radar chart comparing current vs. needed competencies."
        ),
        (
            "Brain-Computer Interfaces — Neuralink, Synchron, and the first human trials. "
            "DESIGN: Neuroscience meets cyberpunk — neural blue, synaptic gold, circuit-dark background. "
            "INTERACTIVE: Build a BCI timeline — click each milestone from cochlear implants to Neuralink N1. "
            "Add a use-case explorer: medical → communication → enhancement with ethical concern ratings."
        ),
        (
            "Autonomous Vehicles — the 6 levels of self-driving and where every company stands. "
            "DESIGN: Dashboard aesthetic — dark backgrounds, HUD-style overlays, sensor-green accents. "
            "INTERACTIVE: Build a level selector (L0-L5) — click each level to see what's automated and which cars qualify. "
            "Add a company tracker: who's at what level with a sortable comparison table."
        ),
        (
            "The Metaverse Reality Check — what happened to the $100B bet on virtual worlds. "
            "DESIGN: Split reality — pixel-glitch VR on one half, clean real-world on the other. "
            "INTERACTIVE: Build a 'Promise vs. Reality' comparison slider for each metaverse claim. "
            "Add an investment tracker showing where the billions actually went."
        ),
        (
            "Synthetic Biology — programming living cells like software. "
            "DESIGN: Biotech future — DNA green, cell-membrane blue, clean white lab aesthetic. "
            "INTERACTIVE: Build a 'Design Your Organism' panel — click traits (glow, produce insulin, eat plastic) "
            "to see the genetic modifications needed. Add an applications accordion by industry."
        ),
        (
            "Smart Cities 2030 — what Singapore, Seoul, and Dubai are building right now. "
            "DESIGN: Urban future — architectural white, IoT blue, digital twin green. Clean and connected. "
            "INTERACTIVE: Build a city comparison dashboard — click each city for its smart initiatives. "
            "Add a 'Smart Feature Finder' — select a domain (transport, energy, safety) to compare city approaches."
        ),
        (
            "The Future of Food — vertical farms, insect protein, and AI-optimized nutrition. "
            "DESIGN: Fresh and futuristic — leafy green, lab white, subtle tech-blue grid lines. "
            "INTERACTIVE: Build a food source comparison — click each (vertical farm, insect, cultured meat, traditional) "
            "for water, land, CO₂, and cost metrics. Add a 'Would You Eat This?' quiz."
        ),
        (
            "Robotics in Everyday Life — from Roomba to humanoids in 20 years. "
            "DESIGN: Friendly tech — soft white, robot-chrome, warm orange interaction points. "
            "INTERACTIVE: Build a robotics timeline from 2005 to 2030 — click eras to see the defining robots. "
            "Add a 'Robot Capability Radar' comparing Tesla Optimus, Figure 01, Boston Dynamics Atlas."
        ),
        (
            "The Energy Storage Revolution — batteries, hydrogen, and the grid of 2030. "
            "DESIGN: Energy gradient — solar gold to battery green to grid electric blue. Clean and powerful. "
            "INTERACTIVE: Build a technology comparison matrix — click each storage type for energy density, cost, and lifespan. "
            "Add a calculator: 'How much battery storage does your home need?' with solar input."
        ),
    ],
}

TAG_POOLS = {
    "boardroom": ["strategy", "finance", "consulting", "leadership", "M&A", "growth", "investor relations", "pricing"],
    "storytelling": ["narrative", "history", "documentary", "culture", "biography", "adventure", "longform", "cinematic"],
    "data_beautiful": ["data viz", "analytics", "infographics", "statistics", "dashboards", "economics", "research", "metrics"],
    "weird_knowledge": ["trivia", "science", "psychology", "niche", "surprising facts", "engineering", "linguistics", "nature"],
    "kids_wonder": ["kids", "elementary", "fun learning", "interactive", "colorful", "playful", "science", "adventure"],
    "teen_real": ["high school", "study tips", "exam prep", "teen life", "college prep", "coding", "sports", "finance"],
    "maker_builder": ["DIY", "crafts", "woodworking", "electronics", "cooking", "workshop", "hands-on", "projects"],
    "culture_lens": ["anthropology", "global culture", "food", "traditions", "travel", "language", "art", "religion"],
    "art_experimental": ["design", "typography", "brutalism", "aesthetics", "visual art", "avant-garde", "UX", "color theory"],
    "science_frontier": ["CRISPR", "quantum", "space", "biology", "physics", "medicine", "neuroscience", "climate"],
    "money_street": ["personal finance", "investing", "budgeting", "real estate", "crypto", "taxes", "salary", "wealth"],
    "future_now": ["AI", "EVs", "robotics", "space tech", "biotech", "smart cities", "autonomous", "energy"],
}

# Category-specific descriptions for community_decks
CATEGORY_DESCRIPTIONS = {
    "boardroom": "executives, consultants, and business leaders",
    "storytelling": "story lovers and curious minds",
    "data_beautiful": "data enthusiasts and analysts",
    "weird_knowledge": "trivia lovers and the endlessly curious",
    "kids_wonder": "young learners and curious kids ages 5-12",
    "teen_real": "students and teens ages 13-18",
    "maker_builder": "makers, DIYers, and hands-on builders",
    "culture_lens": "culture enthusiasts and global citizens",
    "art_experimental": "designers and creative professionals",
    "science_frontier": "science enthusiasts and lifelong learners",
    "money_street": "anyone looking to level up their finances",
    "future_now": "tech optimists and future-watchers",
}

# Map to community_decks category values
CATEGORY_MAP = {
    "boardroom": "business",
    "storytelling": "creative",
    "data_beautiful": "technology",
    "weird_knowledge": "education",
    "kids_wonder": "education",
    "teen_real": "education",
    "maker_builder": "technology",
    "culture_lens": "personal",
    "art_experimental": "creative",
    "science_frontier": "education",
    "money_street": "business",
    "future_now": "technology",
}


DESIGN_DIRECTIVE = (
    "\n\nDESIGN DIRECTIVES: "
    "Keep text minimal — max 3-4 bullet points or one short paragraph per slide "
    "(UNLESS the topic says 'DEEP DIVE FORMAT', in which case use detailed, information-dense content). "
    "Favour large imagery, full-bleed backgrounds, icon grids, and dramatic whitespace. "
    "Use clean sans-serif fonts. Each slide should convey ONE clear idea with a powerful visual. "
    "Make it look like a premium design agency produced it. "
    "INTERACTIVITY: If the topic requests interactive elements (tabs, flip cards, "
    "quizzes, timelines, sliders, accordions, calculators, before/after comparisons), "
    "implement those EXACT interaction types in HTML/CSS/JS. "
    "VARIETY: Mix layouts across slides — hero images, split layouts, card grids, "
    "diagrams, and interactive panels. No two consecutive slides should look the same."
)


async def _ensure_public_share_inline(supabase, deck_uuid: str, user_id: str):
    """Create a public view share link if none exists."""
    import string

    existing = supabase.table("deck_shares").select("short_code").eq(
        "deck_uuid", deck_uuid
    ).eq("is_active", True).eq("share_type", "view").limit(1).execute()

    if existing.data:
        return existing.data[0]["short_code"]

    chars = string.ascii_letters + string.digits
    chars = chars.replace("0", "").replace("O", "").replace("l", "").replace("I", "")

    for _ in range(5):
        code = "".join(random.choices(chars, k=8))
        collision = supabase.table("deck_shares").select("id").eq("short_code", code).execute()
        if not collision.data:
            supabase.table("deck_shares").insert({
                "id": str(uuid.uuid4()),
                "deck_uuid": deck_uuid,
                "short_code": code,
                "share_type": "view",
                "created_by": user_id,
                "is_active": True,
                "is_public": True,
                "access_count": 0,
            }).execute()
            return code

    return None


async def generate_deck_direct(topic: str, category: str, num_slides: int = 8) -> tuple:
    """Generate a deck using the internal generation pipeline (matches admin pipeline)."""
    from services.outline import OutlineGenerator, OutlineOptions
    from models.registry import get_global_registry
    from models.requests import DeckOutline, SlideOutline, StylePreferencesItem
    from api.requests.deck_create import build_initial_deck_payload
    from agents.generation.deck_composer import compose_deck_stream
    from agents.config import MAX_PARALLEL_SLIDES, DELAY_BETWEEN_SLIDES, SEED_TEMPERATURE

    # Enable component fallback (Gemini → Claude Opus on failure)
    os.environ["CUSTOM_COMPONENT_ALLOW_FALLBACK"] = "true"

    enhanced_topic = topic + DESIGN_DIRECTIVE
    style = CATEGORY_DESCRIPTIONS.get(category, "")
    deck_uuid = str(uuid.uuid4())

    try:
        # Generate outline
        registry = get_global_registry()
        generator = OutlineGenerator(registry)

        options = OutlineOptions(
            prompt=enhanced_topic,
            slide_count=num_slides,
            style_context=style,
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

        # Set style preferences (matches admin pipeline)
        deck_outline.stylePreferences = StylePreferencesItem(
            initialIdea=enhanced_topic,
            vibeContext=f"{style} — {topic}" if style else topic,
        )

        # Build initial deck
        deck_data = build_initial_deck_payload(deck_outline, deck_uuid)
        deck_data["data"] = deck_data.get("data", {})
        deck_data["data"]["source"] = "community_seed"

        # Upload initial deck
        upload_deck(deck_data, deck_uuid, USER_ID)

        # Run composition with temperature
        slides_generated = 0
        async for update in compose_deck_stream(
            deck_outline, registry, deck_uuid,
            max_parallel=MAX_PARALLEL_SLIDES,
            delay_between_slides=DELAY_BETWEEN_SLIDES,
            async_images=False,
            user_id=USER_ID,
            temperature=SEED_TEMPERATURE,
        ):
            utype = update.get('type', '')
            if utype == 'slide_generated':
                slides_generated += 1
            elif utype in ('deck_complete', 'composition_complete', 'complete'):
                break

        # Get final slide count
        supabase = get_supabase_client()
        try:
            data_result = supabase.table("decks").select("slides").eq("uuid", deck_uuid).single().execute()
            if data_result.data:
                slides_generated = len(data_result.data.get("slides") or [])
        except Exception:
            pass

        # Create public share link
        try:
            await _ensure_public_share_inline(supabase, deck_uuid, USER_ID)
        except Exception:
            pass

        # Mark as completed
        supabase.table("decks").update({
            "status": {"state": "completed"},
            "slide_count": slides_generated,
        }).eq("uuid", deck_uuid).execute()

        # Render thumbnail
        try:
            from services.thumbnail_dispatch import trigger_thumbnail_render
            await trigger_thumbnail_render(deck_uuid)
        except Exception:
            pass

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

        # Deterministic thumbnail URL
        supabase_url = os.environ.get('SUPABASE_URL', '')
        thumbnail_url = f"{supabase_url}/storage/v1/object/public/thumbnails/thumbnails/{deck_uuid}_s0.png"

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
            "thumbnail_url": thumbnail_url,
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

        deck_uuid, slides_count = await generate_deck_direct(topic, category, num_slides)
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
