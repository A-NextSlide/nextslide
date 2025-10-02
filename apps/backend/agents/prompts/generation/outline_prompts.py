"""
Outline Generation Prompts

This module contains all prompts used for generating presentation outlines.
Extracted from services/outline_service.py for better organization.
"""

from typing import Dict, Any, Optional, List
import json


def get_flow_requirements(slide_count: Optional[int]) -> str:
    """Get flow requirements based on slide count."""
    if not slide_count:
        return "- Build a logical narrative flow from beginning to end"
    
    requirements = []
    
    if slide_count >= 8:
        requirements.extend([
            "- Slide 2 MUST be an 'agenda' type slide showing the presentation roadmap",
            "- Include 'transition' type slides every 4-5 content slides to show progress",
            "- Example transition: 'Problem ✓ | >> Solution | Implementation | Results'",
            "- Use 'divider' type slides for major section changes"
        ])
    
    if slide_count >= 12:
        requirements.extend([
            "- Include at least 2-3 'stat' type slides for single impactful metrics (ONLY for business/data topics or when extracted data is present; SKIP for personal/how-to/creative)",
            "- Add a 'quote' type slide for testimonials or thought-provoking insights",
            "- Include checkpoint transitions showing completed and upcoming sections"
        ])
    
    if slide_count >= 20:
        requirements.extend([
            "- Break presentation into clear chapters with intro/summary for each",
            "- Add sub-section dividers within major topics",
            "- Include multiple checkpoint transitions throughout"
        ])
    
    return "\n".join(requirements) if requirements else "- Keep a logical flow from introduction to conclusion"


def get_outline_planning_prompt(user_prompt: str, style_context: Optional[str], detail_level: str, slide_count: Optional[int] = None) -> str:
    """Generate the prompt for creating the outline plan with slide titles.
    Adds smart bias to produce fewer slides when the user's prompt clearly implies a single slide.
    """
    
    # Determine slide count instruction
    if slide_count:
        # Special handling for very small slide counts
        if slide_count == 1:
            slide_count_instruction = f"""
CRITICAL: YOU MUST GENERATE EXACTLY 1 SLIDE!
WARNING: ONE SLIDE ONLY - NOT a title slide, NOT a conclusion - just ONE content slide
NOTE: The "slides" array MUST contain EXACTLY 1 item
CORRECT Example: {{"slides": ["Key Insights"], "slide_types": ["content"]}}
WRONG: {{"slides": ["Title", "Content", "Conclusion"]}} - This has 3 slides!
COUNT CHECK: Your response MUST have slides.length === 1
"""
        elif slide_count == 2:
            slide_count_instruction = f"""
CRITICAL: YOU MUST GENERATE EXACTLY 2 SLIDES!
WARNING: TWO CONTENT SLIDES ONLY - NO title slide, NO conclusion
NOTE: The "slides" array MUST contain EXACTLY 2 items
CORRECT Example: {{"slides": ["Current State", "Future Vision"], "slide_types": ["content", "content"]}}
WRONG: {{"slides": ["Title", "Overview", "Details", "Conclusion"]}} - This has 4 slides!
COUNT CHECK: Your response MUST have slides.length === 2
"""
        else:
            slide_count_instruction = f"""
EXACT SLIDE COUNT REQUIRED: Generate EXACTLY {slide_count} slides (including title and conclusion).
CRITICAL: Your "slides" array MUST have EXACTLY {slide_count} items. No more, no less.
COUNTING: First slide = 1, Last slide = {slide_count}. Total must equal {slide_count}.
WRONG EXAMPLES:
   - If I ask for 5 slides and you give 8, that's WRONG
   - If I ask for 10 slides and you give 7, that's WRONG
RIGHT: If I ask for {slide_count} slides, you give EXACTLY {slide_count} slides
COUNT CHECK: Your response MUST have slides.length === {slide_count}

DISTRIBUTION FOR {slide_count} SLIDES:
"""
            if slide_count == 3:
                slide_count_instruction += """- Slide 1: Title
- Slide 2: Main Content
- Slide 3: Conclusion"""
            elif slide_count == 4:
                slide_count_instruction += """- Slide 1: Title
- Slide 2: Problem/Overview
- Slide 3: Solution/Details
- Slide 4: Conclusion"""
            elif slide_count == 5:
                slide_count_instruction += """- Slide 1: Title
- Slide 2: Problem/Challenge
- Slide 3: Solution/Approach
- Slide 4: Benefits/Impact
- Slide 5: Conclusion"""
            elif slide_count <= 10:
                slide_count_instruction += f"""- Slide 1: Title
- Slides 2-{slide_count-1}: Content slides (split topic into {slide_count-2} logical parts)
- Slide {slide_count}: Conclusion"""
            else:
                slide_count_instruction += f"""- Slide 1: Title
- Slide 2: Agenda/Overview (if appropriate)
- Slides 3-{slide_count-1}: Content slides (split topic into {slide_count-3} logical parts)
- Slide {slide_count}: Conclusion/Thank You"""
    else:
        # Smart bias: if the raw prompt suggests a single slide, steer toward 1-2 slides
        single_slide_bias = ""
        try:
            prompt_l = (user_prompt or "").lower().strip()
            if any(p in prompt_l for p in [
                "i want a slide about",
                "make a slide about",
                "a slide about",
                "one slide about",
                "create a slide about",
                "generate a slide about",
            ]):
                if not any(w in prompt_l for w in ["slides", "multi", "several", "many", "couple of slides", "few slides"]):
                    single_slide_bias = "\nSTRONG PREFERENCE: The user asked for a single slide; generate 1 (or at most 2 if truly necessary)."
        except Exception:
            pass

        slide_count_instruction = f"""
GENERATE SLIDE COUNT BASED ON DETAIL LEVEL:
- quick: 1-3 slides
- standard: 4-8 slides  
- detailed: 8+ slides
Current detail level: {detail_level}{single_slide_bias}
"""
    
    # Add enforcement at the end
    if slide_count:
        count_enforcement = f"""

*** FINAL REMINDER ***
YOU MUST GENERATE EXACTLY {slide_count} SLIDES!
Before responding, COUNT your slides:
1. Count the items in your "slides" array
2. Verify the count equals {slide_count}
3. If not, adjust by:
   - Combining slides if you have too many
   - Splitting content if you have too few
   - Remember: EXACTLY {slide_count} slides, no exceptions!
"""
    else:
        count_enforcement = ""
    
    return f"""You are creating slide titles for a presentation about: {user_prompt}

CRITICAL: FIRST CHECK FOR EXTRACTED DATA!
If the prompt contains "EXTRACTED DATA:" or mentions specific data like:
- Portfolio holdings (X shares of Y worth $Z)
- Price history data
- Financial metrics
- Any numerical data from files

YOU MUST CREATE SLIDES THAT USE THIS DATA!

For example:
- If portfolio data exists → Create "Portfolio Holdings" or "Investment Overview" slide
- If price history exists → Create "Price Trend Analysis" slide  
- If both exist → Create slides for BOTH
- Don't just focus on one aspect when multiple data types are present

FIRST, ANALYZE THE CONTEXT:
- Check for extracted data in the prompt
- Is this for business/work? (pitch deck, company presentation, investor meeting, business proposal)
- Is this educational? (school project, teaching material, academic presentation)
- Is this personal/creative? (hobby, personal interest, creative project)
- Is this informational? (how-to guide, explainer, general knowledge)

CRITICAL RULES:
1. Create a title that reflects the ACTUAL topic, not generic phrases
2. Use the company/product/topic name when appropriate
3. SLIDE COUNT REQUIREMENTS:{slide_count_instruction}
4. FLOW REQUIREMENTS:
{get_flow_requirements(slide_count)}
5. CONTEXT-AWARE SLIDES:
   - If context indicates SCHOOL/EDUCATIONAL (e.g., "school", "class", "high school", "students", "teacher"): DO NOT include market size, TAM/SAM/SOM, ROI, or investor/pitch content
   - Prefer learning objectives, definitions, examples, misconceptions, and quick checks for understanding
   - ONLY include agenda slides for business/professional contexts; for school, use learning objectives instead
   - ONLY include team slides for business/pitch/company presentations
   - If context indicates PERSONAL/CREATIVE or GENERAL/HOW-TO (e.g., recipes, hobbies, crafts, travel, lifestyle):
     - AVOID statistics, market data, ROI, performance metrics, or charts unless the user explicitly asks for data
     - Make it FUN, story-driven, and directly based on the user's request
     - Focus on steps, tips, anecdotes, flavors, textures, examples, and creative ideas
     - Use engaging wording; do not add business-y sections (market size, TAM/SAM/SOM, KPIs)
6. End with appropriate closing (Thank You for business, Questions/Review for academic)
8. If exact slide count is specified, you MUST fit the content into that number of slides
9. CRITICAL: IF EXTRACTED DATA EXISTS, CREATE SLIDES THAT SHOWCASE IT!

NARRATIVE FLOW REQUIREMENTS:
- Start with a hook (quote, stat, or question) to grab attention
- Build tension/curiosity before revealing solutions
- Use section dividers to create clear chapters in your story
- Alternate between different slide types for visual variety
- Each slide should naturally lead to the next - no abrupt jumps
- Use progressive disclosure - don't reveal everything at once
- Create "aha moments" with strategic stat and quote slides
- End sections with transitions that preview what's next

VARIANTS AND COMPARISONS:
- VARIANT COVERAGE (multi-item topics like NBA teams, countries, products, frameworks):
  - Identify the core entity set and select representative items based on slide_count
    • quick (1–3): 3–4 items in a single "Variant Snapshots" slide with identical fields
    • standard (4–8): 3–6 items; prefer 1 slide per item when possible
    • detailed (8+): 6–12 items; use sub-sections with dividers and a brief transition after the block
  - Use a CONSISTENT micro-structure per item (e.g., Overview • Key stats • Strengths • Weaknesses • Notable)
  - Keep slide titles consistent: "Team: Lakers — Profile", "Team: Celtics — Profile" (same pattern)
  - Group variant slides under a clear section with a divider; add a checkpoint transition after the series
- COMPARISON SECTIONS (keep distinct from variant profiles):
  - Include explicit comparison slides titled with "X vs Y" or "Comparison: X, Y, Z"
  - For pairwise comparisons: plan 1–3 slides using a side-by-side structure and end with a synthesis/takeaway slide
  - For multi-way comparisons: plan a single ranked or matrix comparison slide plus a synthesis
  - Order: variants first (profiles/snapshots), then comparison slide(s), then synthesis/decision

STAT DENSITY & NARRATIVE RULES:
- Do NOT create back-to-back stat slides. Maximum 1 stat slide per 4 slides overall (except investor/financial decks).
- For training, educational, nonprofit/fundraising, personal/creative, and how‑to decks: limit each slide to at most 1–2 numbers total.
- Transform stat lists into stories: lead with a short scenario (context → action → outcome), optionally support with ONE key metric.
- Favor vignettes, testimonials, examples, and checklists over numeric lists.
- Use numbers sparingly to underscore the narrative, not replace it.

CRITICAL: PRESENTATIONS MUST BE PUNCHY BUT SUBSTANTIVE!
- Target 80-120 words per slide (not too sparse, not too dense)
- Use impactful bullet points (8-15 words each) with specifics
- Use charts SELECTIVELY: only when quantitative data exists AND forms a valid comparable series
- NO PARAGRAPHS - use structured bullet points
- Include specific metrics, percentages, and data points for charts
- Every slide with numbers/percentages/comparisons should produce chart data in the outline ONLY if the numbers form a valid comparable series (same x-category type, same y units). Otherwise, keep them as STAT text in the outline

CHART USAGE GUARDRAILS:
- For PERSONAL/CREATIVE and GENERAL/HOW-TO topics (e.g., recipes, crafts, hobbies): do NOT include charts or statistics unless explicitly requested by the user
- For very small decks (1-3 slides): avoid charts unless the user explicitly asks for visualization
- For small decks (3-5 slides): include at most ONE chart, and only if the topic is data-centric
- For narrative/biographical/historical topics (e.g., Benjamin Franklin): favor quotes and imagery; only chart when specific comparable metrics are requested
- Never add charts to introductions, overviews, or conclusions

STORY-FIRST TOPICS (apply to training, nonprofit/fundraising, personal, how‑to):
- Prefer stories, scenarios, and step-by-step guidance; avoid dense data blocks
- Use one supporting metric only when it meaningfully strengthens the story
- Replace long stat sequences with: short vignette, concrete example, and actionable takeaway

IMPORTANT STRUCTURAL ELEMENTS TO INCLUDE:
- Title slides: Hero title with supporting elements (not just a big title)
  - Include: optional kicker/subtitle, presenter name, organization/company, date
  - Optional: small logo, optional short quote/tagline, optional thin divider line
  - Layout: centered or left-aligned hero; allow dynamic divider line above/below metadata
  - For narrative/biographical/historical topics: Prefer a HERO IMAGE background on the title slide over charts
- Quote slides: Powerful quotes or testimonials (1-2 sentences max)
- Stat slides: Single impactful statistic or metric
- Progress indicators: Visual progress through sections
- Divider slides: Section transitions with minimal text
- Call-to-action slides: Clear next steps

IMPORTANT: CREATE A PROPER FLOW WITH MORE SLIDES:
- Each slide should have ONE clear message or purpose
- Build a narrative flow - each slide leads naturally to the next
- MANDATORY: Add agenda slide as #2 for any deck 8+ slides
- Use transition slides to guide the audience through sections
- Split complex topics into digestible pieces:
  
  Example flow for "Market Analysis" (12 slides):
  1. Title Slide
  2. AGENDA: "Today's Journey" (Overview | Market | Opportunity | Next Steps)
  3. "The Market Today" (section divider)
  4. "$5.2 Billion" (stat slide - market size)
  5. "Key Market Players" (competitive landscape)
  6. TRANSITION: "Market ✓ | >> Opportunity | Strategy | Next Steps"
  7. "135% Annual Growth" (stat slide - growth rate)
  8. "Emerging Trends" (3 key trends)
  9. "Our Market Opportunity" (where we fit)
  10. TRANSITION: "Market ✓ | Opportunity ✓ | >> Strategy | Next Steps"
  11. "Strategic Approach" (our plan)
  12. "Let's Connect" (conclusion)
  
- Use variety: mix content slides with stats, quotes, and visuals
- Create anticipation: tease what's coming next
- Add checkpoints: show progress through the presentation
  - TARGET: For standard detail level, generate 4-8 slides
- Each major point deserves 2-3 slides to fully explore

SLIDE COUNT ADAPTATION:
When a specific slide count is given, you MUST generate EXACTLY that many slides:
- For very small counts (1-2 slides):
  * 1 slide: ONE comprehensive content slide covering the key message (NO title or conclusion)
  * 2 slides: TWO content slides with main points (NO title or conclusion, just content)
- For small counts (3-5 slides):
  * 3 slides: Title, Core Content, Conclusion
  * 4 slides: Title, Problem, Solution, Conclusion
  * 5 slides: Title, Problem, Solution, Impact, Conclusion
- For medium counts (6-15 slides):
  * First slide is title
  * Last slide is conclusion
  * Fill middle with content slides
- For business presentations: Include agenda (1) and team (1) ONLY if count >= 8
- For larger counts (> 15): Expand key sections with multiple parts
- CRITICAL: The total number of slides in your response MUST equal the requested count

THEME & HERO IMAGE GUIDANCE:
- Let the generated theme guide imagery decisions
- Historical/biographical topics: use large hero imagery for title and section dividers; minimize charts unless prompted
- Business/data topics: keep small decks text-forward; introduce charts only with real, comparable metrics

PRESENTATION STRUCTURE (adapt based on slide count):

BUSINESS/CORPORATE (15-20 slides recommended) - USE WHEN: Company presentations, business proposals, investor meetings
1. Title Slide - Company/Topic name (Hero title + metadata; can include kicker/logo)
2. [QUOTE SLIDE] - Opening hook or vision statement
3. Agenda - "What We'll Cover" (brief overview)
4. [DIVIDER] - "The Challenge"
5. Market Context - Current landscape
6. [STAT SLIDE] - "$X Billion Market"
7. The Problem - Pain points (3 max)
8. [QUOTE SLIDE] - Customer testimonial about the problem
9. [STAT SLIDE] - "87% of companies struggle with..."
10. [DIVIDER] - "Our Solution"
11. Solution Overview - High-level approach
12. How It Works - Step 1
13. How It Works - Step 2  
14. How It Works - Step 3
15. [STAT SLIDE] - Key benefit metric
16. Case Study - Client success
17. [STAT SLIDE] - ROI achieved
18. Implementation Timeline
19. [DIVIDER] - "Next Steps"
20. Call to Action
21. Thank You/Contact

PITCH DECK (12-15 slides, adapt if specific count given) - USE WHEN: Seeking investment, startup presentations
1. Title - Company Name (minimal: logo + tagline)
2. [STAT SLIDE] - The Problem in Numbers
3. Problem Deep Dive
4. [QUOTE SLIDE] - Customer Testimonial
5. Our Solution
6. Product Demo - Key Features (visual)
7. [STAT SLIDE] - Market Size ($X Billion)
8. Business Model - How We Make Money
9. Go-to-Market Strategy
10. [STAT SLIDE] - Traction (users/revenue/growth)
11. Competition/Our Advantage
12. Team (REQUIRED - photos + brief bios)
13. [STAT SLIDE] - Financial Projections
14. The Ask - Investment & Use of Funds
15. Thank You/Contact

EDUCATIONAL/ACADEMIC (12-16 slides recommended) - USE WHEN: Teaching, school projects, research presentations
1. Title Slide (Hero title + optional kicker + metadata)
2. [QUOTE SLIDE] - Thought-provoking opening
3. Learning Objectives - 3 key outcomes
4. [DIVIDER] - "Introduction"
5. Context/Background - Why this matters
6. [STAT SLIDE] - Surprising fact
7. Core Concept - Definition
8. [DIVIDER] - "Deep Dive"
9. Key Component 1 - Detailed explanation
10. Key Component 2 - With examples
11. Key Component 3 - Visual representation
12. [STAT SLIDE] - Research finding (cite a reputable source; NO market data unless explicitly about the curriculum)
13. Real-World Application 1
14. Real-World Application 2
15. [DIVIDER] - "Conclusion"
16. Key Takeaways - 3 main points
17. Questions for Discussion / Quick Knowledge Check
18. Further Resources (textbook or reputable educational sites)

INFORMATIONAL/HOW-TO (6-10 slides, adapt if specific count given) - USE WHEN: Tutorials, guides, explaining topics
1. Title - What You'll Learn
2. Why This Matters
3. Step-by-Step Process (3-5 slides)
4. Tips & Best Practices
5. Common Mistakes
6. Wrap Up/Resources
(NO AGENDA OR TEAM NEEDED)

RULES FOR GENERAL/HOW-TO:
- Keep it practical and fun; NO stats, market sizing, or ROI
- Do not add charts unless the user explicitly asks for visualization
- Emphasize steps, techniques, ingredients/tools, timing, variations, and creative twists

PERSONAL/CREATIVE (6-10 slides, adapt if specific count given) - USE WHEN: Hobbies, personal interests, creative projects
1. Title - Your Topic
2. Why I Love This
3. The Story/Journey
4. Cool Facts/Details (2-3 slides)
5. What's Next
6. Thanks!
(NO AGENDA OR TEAM NEEDED)

RULES FOR PERSONAL/CREATIVE:
- Keep it light and engaging; NO stats, market sizing, or ROI
- Avoid charts unless the user explicitly asks for data
- Use anecdotes, sensory descriptions, inspirations, and personal tips

NONPROFIT/FUNDRAISING (8–12 slides recommended) - USE WHEN: Donor pitches, grant proposals
1. Title - Mission and Promise
2. Opening Story - 1–2 paragraph vignette (no dense stats)
3. Who We Serve - Personas and needs (narrative + 1 key metric max)
4. Our Proven Model - Steps and how it works (3–5 bullets)
5. Outcomes That Matter - Before/after stories (optional: 1 support stat)
6. Budget Snapshot - SIMPLE breakdown (chart optional, only if asked)
7. Funding Ask - Clear amount and what it funds (human terms per person/impact)
8. Donor Experience - Recognition, reporting, engagement
9. 90‑Day Plan - Practical next steps and milestones
10. Call to Action - How to give / partner
(Stat density: max 1 stat per slide; never consecutive stat slides)

SECURITY TRAINING (6–12 slides recommended) - USE WHEN: Employee awareness/training
1. Title - Theme of the session
2. Threat Vignettes - 2–3 short stories (no heavy stats)
3. Red Flags - Checklist of signals to watch for
4. Do/Don’t - Clear actions with examples
5. Reporting - What to do and how (step by step)
6. Practice Scenario - Guided walk‑through or mini‑quiz
7. Policy Highlights - Plain‑English, company‑friendly rules
8. Wrap‑Up - Key takeaways and resources
(Stats optional: max 1 metric to frame urgency; avoid multiple numeric bullets)

SLIDE TYPE RULES:
- "title": First slide only - include hero title plus supporting metadata (kicker/subtitle optional; presenter, organization, date; optional logo/quote)
- "agenda": Slides showing outline/roadmap
- "transition": Progress checkpoints with >> markers ONLY (e.g., "Problem ✓ | >> Solution | Next Steps")
- "divider": Section breaks with minimal text
- "stat": Single statistic or metric slides (one big number)
- "quote": Quote or testimonial slides (1-2 sentences)
- "team": Team/About Us slides
- "content": Main content slides including ALL solution, problem, market, analysis, strategy slides
- "conclusion": Thank you/final slides

IMPORTANT: 
- Solution Overview, Problem Statement, Market Analysis, etc. are CONTENT slides, not transitions!
- Stat slides should contain ONLY the statistic and brief context
- Quote slides should be visually distinct with large, impactful text
- Divider slides mark major section changes
 - Stat slides: max 1 per 4 slides overall (except investor/financial decks); never place two stat slides back‑to‑back

CRITICAL FLOW RULES - MUST FOLLOW:
For decks with 8+ slides:
- ALWAYS include an agenda slide as slide #2 (after title)
- Add transition slides every 4-5 content slides to show progress
- Include section dividers for major topic changes

For decks with 12+ slides:
- Mandatory agenda slide showing full roadmap
- Add "checkpoint" transition slides showing completed/current/upcoming sections
- Use divider slides between major sections (e.g., Problem → Solution)
- Include a summary/recap slide before conclusion

For decks with 20+ slides:
- Add sub-section dividers within major sections
- Include multiple checkpoint slides throughout
- Consider breaking into clear chapters with intro/summary for each

TRANSITION SLIDE EXAMPLES:
- Slide 7: "Problem ✓ | >> Solution | Implementation | Results"
- Slide 12: "Background ✓ | Analysis ✓ | >> Strategy | Next Steps"
- Slide 18: "Introduction ✓ | Core Concepts ✓ | Applications ✓ | >> Conclusion"

PROGRESSION INDICATORS:
- Use ">>" to show current section in agenda checkpoints
- Example: "Introduction ✓ | >> Problem | Solution | Next Steps"
- This shows completed (✓), current (>>), and upcoming sections

Style: {style_context if style_context else 'Professional and engaging'}

CRITICAL - TITLE GENERATION:
First, analyze the prompt and generate a clear, professional presentation title:
- For educational topics: Use format like "Photosynthesis: A Comprehensive Guide" or "Understanding [Topic]"
- For business: "[Company Name]: [Value Proposition]" or "[Product] Platform"
- For informational: "[Topic]: [Angle/Focus]"
- Keep it concise (1-8 words) but descriptive
- Make it engaging and professional
- Extract the core topic from long descriptions

Output a JSON object with:
- title: The overall presentation title (GENERATE THIS FIRST - make it clear and professional)
- slides: Array of slide titles OR objects. When total slides > 3, return a structured object for the first slide as a dedicated Title page with placeholders that the UI will fill later:
  {{
    "title": "Title Slide",
    "elements": [
      {{"type": "title", "text": "[Generated Title]"}},
      {{"type": "subtitle", "text": "[Subtitle]"}},
      {{"type": "presenter", "text": "[Your Name]"}},
      {{"type": "organization", "text": "[Organization/Company]"}},
      {{"type": "date", "text": "[Today]"}},
      {{"type": "optional", "kind": "logo", "src": "[Logo URL or placeholder]"}},
      {{"type": "optional", "kind": "quote", "text": "[Optional short quote]"}}
    ]
  }}
- slide_types: Array of types (title, agenda, content, team, transition, conclusion)
- context: One of [business, educational, personal, informational]

Remember to adapt the structure based on the context you identify!{count_enforcement}"""


def get_title_extraction_prompt(user_prompt: str) -> str:
    """Generate prompt for extracting a clean title from the user's prompt."""
    # This function is now deprecated - title generation happens in the outline planning
    return ""


def get_slide_content_prompt(
    slide_title: str, 
    slide_type: str, 
    user_prompt: str,
    presentation_title: str,
    formatted_slide_title: str,
    context: Optional[Dict[str, Any]] = None,
    chart_type_descriptions: str = ""
) -> str:
    """Generate the prompt for creating slide content based on slide type."""
    
    # Handle special slide types with adaptive title behavior
    if slide_type == "title":
        total_slides_ctx = context.get('total_slides', 10) if isinstance(context, dict) else 10
        provided_elems = []
        provided_texts = []
        if isinstance(context, dict):
            provided_elems = context.get('title_elements') or []
            provided_texts = context.get('title_outline_texts') or []

        # If the outline already specified structured title elements, PRESERVE THEM and render a rich title slide
        if provided_elems or provided_texts:
            elems_list = ", ".join(provided_elems) if provided_elems else "title"
            preview_text = "; ".join(provided_texts[:3]) if provided_texts else ""
            return f"""Create a title slide for: {presentation_title}

PRESERVE PROVIDED TITLE ELEMENTS:
- Elements present in outline: {elems_list}
- Provided texts to preserve (if used): {preview_text}

RENDERING RULES (RICH, DYNAMIC TITLE):
- NO bullets or lists; use separate lines for each element
- Include a SHORT kicker/subtitle ABOVE the main title if present (2–8 words)
- Include ALL provided metadata (presenter, organization, date; optional logo mention)
- Do not invent new fields; do not remove or shorten provided ones
- Optional: one short quote/tagline line if provided in outline
- Optional: indicate a thin divider line (e.g., "—" on its own line) above/below metadata
- Alignment can be centered or left-aligned depending on vibe

OUTPUT:
- Return multiple lines in this order when available:
  1) Kicker (optional)
  2) HERO Title (required)
  3) Short subtitle/tagline (optional)
  4) Divider line (optional, use a single em dash "—")
  5) Metadata row: "[Presenter] — [Organization] — [Date]"
  6) Optional short quote (if provided)
- Do NOT add body paragraphs.
"""

        # Otherwise, create a dynamic title even for small decks
        return f"""Create a title slide for: {presentation_title}

TITLE REQUIREMENTS (DYNAMIC, NOT MINIMAL):
- Use separate lines (no bullets): optional Kicker, HERO Title, optional Subtitle, optional Divider "—", Metadata row
- Metadata row format: "[Your Name] — [Organization/Company] — [Date]"
- Optional short quote last if appropriate
- Keep it elegant and readable; do not trim provided details

Do not add body paragraphs or lists. Focus on title hierarchy and metadata only."""

    elif slide_type == "stat":
        return f"""Create a statistic slide for: {formatted_slide_title}
Topic: {user_prompt}

Generate ONE KEY STATISTIC (big-text only):
- Single impactful number or percentage on its own line
- One short context line (2-5 words)
- Optional: Source attribution (short)

FORMAT:
"87%"
"increase in productivity"

OR

"$2.5M"
"saved annually"

Constraints:
- No bullet points, no paragraphs
- Max 10 total words across both lines (excluding source)
- Output just the two lines (plus optional third line for source)"""

    elif slide_type == "quote":
        return f"""Create a quote slide for: {formatted_slide_title}
Topic: {user_prompt}

Generate a SINGLE QUOTE (big-text):
- 1-2 short sentences, maximum 24 words total
- Attribution line with name and role/company

FORMAT:
"Innovation distinguishes between a leader and a follower."
- Steve Jobs, Apple

Constraints:
- No bullets, no extra commentary
- Output exactly two lines (quote, attribution)"""

    elif slide_type == "divider":
        return f"""Create a section divider slide for: {formatted_slide_title}

Generate MINIMAL content:
- Section title only
- Optional: Brief tagline (3-5 words)

Keep it clean and simple. This marks a transition."""
    
    # Regular content slides
    base_topic = f"Topic: {user_prompt}\nPresentation: {presentation_title}\nSlide: {formatted_slide_title}"
    
    # Get presentation context from the context parameter
    presentation_context = context.get('presentation_context', 'business') if context else 'business'
    
    # Get total slide count from context if available
    total_slides = context.get('total_slides', 10) if context else 10
    
    # Get smart content guidance (use visual_density from context if provided)
    visual_density = context.get('visual_density', 'moderate') if context else 'moderate'
    guidance = get_smart_content_guidance(slide_title, presentation_title, presentation_context, visual_density)
    
    # Add context information if available
    if context and context.get('is_continuation'):
        context_info = f"\n\nThis is Part {context['part_number']} of a multi-part topic."
        if context['previous_slides']:
            context_info += "\n\nPrevious parts covered:"
            for prev in context['previous_slides']:
                context_info += f"\n- {prev['title']}: {prev['content']}"
        
        if context['used_charts']:
            context_info += "\n\nCharts already used (avoid duplicating):"
            for chart in context['used_charts']:
                context_info += f"\n- {chart['slide']}: {chart['type']} chart - {chart['title']}"
        
        base_topic += context_info
    
    # Add file-related context if available
    if context and context.get('suggested_images'):
        file_context = "\n\nAVAILABLE IMAGES FOR THIS SLIDE:"
        for img in context['suggested_images']:
            file_context += f"\n- {img['filename']}: {img['interpretation']}"
            if img.get('should_use_everywhere'):
                file_context += " (REQUIRED - use on all important slides)"
        base_topic += file_context
    
    if context and context.get('suggested_data'):
        data_context = "\n\nDATA FILES FOR THIS SLIDE:"
        for data in context['suggested_data']:
            data_context += f"\n- {data['filename']}: {data['interpretation']}"
            if 'chart_suggestion' in data:
                data_context += f"\n  Suggested visualization: {data['chart_suggestion']['type']} chart"
                if 'data' in data:
                    # Include a sample of the data
                    headers = data['data'].get('headers', [])
                    if headers:
                        data_context += f"\n  Columns: {', '.join(headers[:5])}"
        base_topic += data_context
    
    # NEW: Add web research citations (indexed for inline [n] references)
    if context and isinstance(context, dict) and context.get('web_citations'):
        base_topic += "\n\nWEB SOURCES (INDEXED):"
        for idx, c in enumerate(context['web_citations'], start=1):
            src = (c.get('source') or '').strip()
            url = (c.get('url') or '').strip()
            title = (c.get('title') or '').strip()
            base_topic += f"\n[{idx}] {title or src or url}: {url}"
        base_topic += (
            "\n\nCITATION STYLE: Append numeric citations like [1], [2] to bullets that use facts from these sources. Use the index above. If a bullet is general background, omit citations."
            "\nSOURCES FOOTER RULES: Consolidate into ONE micro 'Sources: [1][2][3]' footnote anchored to the SLIDE BOTTOM-RIGHT (footer zone), not within the content area. Use small font (12–14pt), muted color, right-aligned. Add a thin short divider line above the footer zone. Never create more than one sources block per slide."
        )

    # Add extracted data context if available
    if context and context.get('processed_files') and context['processed_files'].get('extracted_data'):
        extracted_data_context = "\n\n*** CRITICAL: REAL DATA FROM YOUR FILES ***"
        extracted_data_context += "\nYOU MUST USE THIS EXACT DATA IN YOUR SLIDE CONTENT!"
        extracted_data_context += "\nDO NOT GENERATE GENERIC CONTENT - USE THESE SPECIFIC VALUES:"
        
        for data_item in context['processed_files']['extracted_data']:
            if isinstance(data_item, dict):
                # Handle different data types
                data_type = data_item.get('dataType', 'unknown')
                
                # Generic data with structured format
                if 'dataType' in data_item and data_item['dataType'] != 'unknown':
                    extracted_data_context += f"\n\n**{data_type.replace('_', ' ').title()}:**"
                    
                    # Add summary info
                    if 'summary' in data_item and isinstance(data_item['summary'], dict):
                        for key, value in data_item['summary'].items():
                            if not key.endswith('_stats'):  # Skip detailed stats
                                extracted_data_context += f"\n- {key.replace('_', ' ').title()}: {value}"
                    
                    # Add specific data points based on slide title
                    if 'data' in data_item and isinstance(data_item['data'], list) and data_item['data']:
                        # Analyze slide title to determine what data to highlight
                        slide_lower = slide_title.lower()
                        
                        # Time-based data
                        if any(word in slide_lower for word in ['trend', 'over time', 'timeline', 'historical', 'growth']):
                            # Find time-based columns
                            if isinstance(data_item['data'][0], dict):
                                time_cols = [k for k in data_item['data'][0].keys() 
                                           if any(t in k.lower() for t in ['date', 'time', 'month', 'year', 'period'])]
                                if time_cols:
                                    extracted_data_context += f"\n- Time series data available with {len(data_item['data'])} data points"
                                    # Show range
                                    first_time = data_item['data'][0].get(time_cols[0])
                                    last_time = data_item['data'][-1].get(time_cols[0])
                                    extracted_data_context += f"\n- Period: {first_time} to {last_time}"
                        
                        # Top/bottom analysis
                        elif any(word in slide_lower for word in ['top', 'best', 'highest', 'lowest', 'worst', 'ranking']):
                            # Find numeric columns for ranking
                            if isinstance(data_item['data'][0], dict):
                                numeric_cols = []
                                for key in data_item['data'][0].keys():
                                    if isinstance(data_item['data'][0][key], (int, float)):
                                        numeric_cols.append(key)
                                
                                if numeric_cols:
                                    # Sort by first numeric column
                                    sorted_data = sorted(data_item['data'], 
                                                       key=lambda x: x.get(numeric_cols[0], 0), 
                                                       reverse=True)
                                    extracted_data_context += f"\n- Top 3 by {numeric_cols[0]}:"
                                    for i, item in enumerate(sorted_data[:3]):
                                        name_col = next((k for k in item.keys() if isinstance(item[k], str)), 'Item')
                                        extracted_data_context += f"\n  {i+1}. {item.get(name_col, f'Item {i+1}')}: {item.get(numeric_cols[0])}"
                        
                        # Comparison/breakdown
                        elif any(word in slide_lower for word in ['comparison', 'breakdown', 'distribution', 'composition']):
                            if isinstance(data_item['data'][0], dict) and len(data_item['data']) <= 10:
                                # Show all items for breakdown
                                extracted_data_context += f"\n- Breakdown of {len(data_item['data'])} items:"
                                for item in data_item['data']:
                                    # Find name and value columns
                                    name_col = next((k for k in item.keys() if isinstance(item[k], str)), None)
                                    value_col = next((k for k in item.keys() if isinstance(item[k], (int, float))), None)
                                    if name_col and value_col:
                                        extracted_data_context += f"\n  - {item[name_col]}: {item[value_col]}"
                        
                        # Performance metrics
                        elif any(word in slide_lower for word in ['performance', 'metrics', 'kpi', 'statistics']):
                            # Show summary statistics if available
                            if 'summary' in data_item:
                                for key, value in data_item['summary'].items():
                                    if key.endswith('_stats') and isinstance(value, dict):
                                        col_name = key.replace('_stats', '')
                                        extracted_data_context += f"\n- {col_name} statistics:"
                                        for stat_key, stat_val in value.items():
                                            if isinstance(stat_val, (int, float)):
                                                extracted_data_context += f"\n  - {stat_key}: {stat_val:.2f}"
                
                # Stock data (legacy format for compatibility)
                elif 'summary' in data_item and 'symbol' in data_item.get('summary', {}):
                    summary = data_item.get('summary', {})
                    metrics = data_item.get('keyMetrics', {})
                    symbol = summary.get('symbol', 'Unknown')
                    
                    extracted_data_context += f"\n\n**{symbol} Stock Data:**"
                    
                    # Check if this is portfolio/watchlist data
                    if summary.get('shares', 0) > 0:
                        extracted_data_context += f"\n[PORTFOLIO HOLDINGS]: {summary.get('shares')} shares @ ${summary.get('currentPrice')} = ${summary.get('totalValue')} total"
                        extracted_data_context += f"\nIMPORTANT: YOU MUST MENTION: '{summary.get('shares')} shares worth ${summary.get('totalValue')}'"
                    else:
                        extracted_data_context += f"\n- Current Price: ${summary.get('currentPrice', 'N/A')}"
                    
                    extracted_data_context += f"\n- Market Cap: {metrics.get('marketCap', 'N/A')}"
                    extracted_data_context += f"\n- P/E Ratio: {metrics.get('peRatio', 'N/A')}"
                    
                    if 'priceData' in data_item and data_item['priceData']:
                        prices = [p.get('close', 0) for p in data_item['priceData']]
                        if prices:
                            extracted_data_context += f"\n- Price Range: ${min(prices):.2f} - ${max(prices):.2f}"
                            price_change = prices[-1] - prices[0]
                            pct_change = (price_change / prices[0] * 100) if prices[0] else 0
                            extracted_data_context += f"\n- Total Change: {pct_change:+.1f}%"
                            
                            # Add specific data points for different slide types
                            if 'volume' in slide_title.lower() or 'trading' in slide_title.lower() or 'activity' in slide_title.lower():
                                volumes = [p.get('volume', 0) for p in data_item['priceData']]
                                if volumes:
                                    avg_volume = sum(volumes) / len(volumes)
                                    max_volume = max(volumes)
                                    extracted_data_context += f"\n- Average Daily Volume: {avg_volume:,.0f}"
                                    extracted_data_context += f"\n- Peak Volume: {max_volume:,.0f}"
                                    # Find dates with highest volumes
                                    volume_spikes = sorted([(p['date'], p['volume']) for p in data_item['priceData']], 
                                                         key=lambda x: x[1], reverse=True)[:3]
                                    extracted_data_context += f"\n- Volume Spikes: {', '.join([f'{date} ({vol:,})' for date, vol in volume_spikes])}"
                            
                            elif 'price' in slide_title.lower() or 'trend' in slide_title.lower():
                                # Add price trend specifics
                                recent_prices = data_item['priceData'][-5:]
                                extracted_data_context += f"\n- Recent trend: {recent_prices[0]['date']} (${recent_prices[0]['close']:.2f}) → {recent_prices[-1]['date']} (${recent_prices[-1]['close']:.2f})"
                                
                                # Find 52-week high/low from data
                                year_high = max(p['high'] for p in data_item['priceData'])
                                year_low = min(p['low'] for p in data_item['priceData'])
                                extracted_data_context += f"\n- 52-Week Range: ${year_low:.2f} - ${year_high:.2f}"
                            
                            elif 'volatility' in slide_title.lower():
                                # Calculate volatility metrics
                                daily_changes = []
                                for i in range(1, len(data_item['priceData'])):
                                    prev_close = data_item['priceData'][i-1]['close']
                                    curr_close = data_item['priceData'][i]['close']
                                    daily_change = abs((curr_close - prev_close) / prev_close * 100)
                                    daily_changes.append(daily_change)
                                
                                if daily_changes:
                                    avg_volatility = sum(daily_changes) / len(daily_changes)
                                    max_volatility = max(daily_changes)
                                    extracted_data_context += f"\n- Average Daily Volatility: {avg_volatility:.2f}%"
                                    extracted_data_context += f"\n- Maximum Daily Move: {max_volatility:.2f}%"
                                    
                                    # Find most volatile days
                                    volatile_days = []
                                    for i in range(1, len(data_item['priceData'])):
                                        prev_close = data_item['priceData'][i-1]['close']
                                        curr_close = data_item['priceData'][i]['close']
                                        change_pct = (curr_close - prev_close) / prev_close * 100
                                        if abs(change_pct) > 3:  # Days with >3% move
                                            volatile_days.append((data_item['priceData'][i]['date'], change_pct))
                                    
                                    if volatile_days:
                                        extracted_data_context += f"\n- Volatile Days (>3% move): {len(volatile_days)} days"
                                        top_moves = sorted(volatile_days, key=lambda x: abs(x[1]), reverse=True)[:3]
                                        extracted_data_context += f"\n- Biggest Moves: {', '.join([f'{date} ({change:+.1f}%)' for date, change in top_moves])}"
                
                # Portfolio/Watchlist data
                elif 'shares' in data_item or 'currentValue' in data_item:
                    extracted_data_context += f"\n\n**Portfolio/Watchlist Position:**"
                    
                    if 'symbol' in data_item:
                        extracted_data_context += f"\n- Symbol: {data_item.get('symbol')}"
                    if 'shares' in data_item:
                        extracted_data_context += f"\n- Shares Owned: {data_item.get('shares')}"
                    if 'currentPrice' in data_item:
                        extracted_data_context += f"\n- Current Price: ${data_item.get('currentPrice')}"
                    if 'currentValue' in data_item:
                        extracted_data_context += f"\n- Position Value: ${data_item.get('currentValue')}"
                    if 'costBasis' in data_item:
                        extracted_data_context += f"\n- Cost Basis: ${data_item.get('costBasis')}"
                    if 'unrealizedGain' in data_item:
                        extracted_data_context += f"\n- Unrealized Gain/Loss: ${data_item.get('unrealizedGain')}"
                    if 'percentChange' in data_item:
                        extracted_data_context += f"\n- Percent Change: {data_item.get('percentChange')*100:.2f}%"
                    
                    extracted_data_context += f"\n\nCRITICAL: Use these EXACT portfolio values! Do NOT make up different share counts or values!"
                
                # Generic data object
                elif 'data' in data_item and isinstance(data_item['data'], list):
                    extracted_data_context += f"\n\n**Data Table ({len(data_item['data'])} rows):**"
                    if data_item['data']:
                        # Show sample of data
                        sample = data_item['data'][:3]
                        extracted_data_context += f"\n{json.dumps(sample, indent=2)}"
        
        # Add this AFTER the data context
        extracted_data_context += "\n\nREMEMBER: Use these SPECIFIC numbers in your content!"
        
        # Add RIGHT vs WRONG examples for extracted data
        extracted_data_context += "\n\nCRITICAL DATA ACCURACY:"
        
        # Add specific examples based on slide title
        slide_lower = slide_title.lower()
        if any(word in slide_lower for word in ['portfolio', 'holdings', 'position', 'allocation']):
            extracted_data_context += "\n\nFOR THIS PORTFOLIO SLIDE, YOU MUST:"
            extracted_data_context += "\n- State the EXACT number of shares and total value"
            extracted_data_context += "\n- Example: 'Our portfolio contains [X] shares of [SYMBOL] worth $[TOTAL]'"
            extracted_data_context += "\n- NOT: 'significant portion' or 'substantial holdings'"
        
        extracted_data_context += "\n\nRIGHT (use exact data from file):"
        extracted_data_context += "\n- Use actual numbers: 'Sales increased from $380K to $450K'"
        extracted_data_context += "\n- Use real names: 'Widget A has 150 units in stock'"
        extracted_data_context += "\n- Use calculated values: 'Average satisfaction score: 4.2/5'"
        extracted_data_context += "\n- Reference specific time periods: 'Q1 2024 performance'"
        
        extracted_data_context += "\n\nWRONG (generic placeholders):"
        extracted_data_context += "\n- '[Insert sales figure here]'"
        extracted_data_context += "\n- 'Sales grew by X%' (when you have the actual percentage)"
        extracted_data_context += "\n- 'Various products' (when you have specific product names)"
        extracted_data_context += "\n- 'Recent period' (when you have exact dates)"
        extracted_data_context += "\n- Making up data not in the file"
        
        extracted_data_context += "\n\nALWAYS use the EXACT data from the extracted files!"
        
        base_topic += extracted_data_context
    
    if slide_type == 'title':
        # Adjust title slide based on total slide count
        if total_slides <= 3:
            return f"""{base_topic}

Create a MINIMAL title slide - just the essence.

CRITICAL FOR SHORT PRESENTATIONS ({total_slides} slides):
**DO NOT include any subtitle, tagline, or additional text beyond the core title.**
**DO NOT include "[Your Name]" or any presenter information.**

ULTRA-MINIMALIST APPROACH:
- Use ONLY the presentation title itself
- NO quotes, NO questions, NO statistics
- NO "Presented by" or name placeholders
- Just the pure, clean title - nothing else
- Let the title stand alone with maximum impact

Example outputs:
- "Climate Action Now"
- "The Future of AI"
- "Digital Transformation"

That's it. Nothing more."""
        
        else:
            return f"""{base_topic}

Create a MINIMAL title slide.

CRITICAL - KEEP IT SIMPLE:
- Main title: The presentation title
- Optional subtitle: 3-5 words max
- Optional: "[Your Name]"
- Optional: "[Organization/Company]"
- Optional: "[Date]"

MAXIMUM 20 WORDS TOTAL - NO EXCEPTIONS

DO NOT INCLUDE:
- Bullet points or lists
- Multiple paragraphs
- Impact statements
- Brand ambassador mentions
- Cultural touchstone descriptions
- Any body content whatsoever

**QUESTION-BASED** (for thought-provoking topics):
- Compelling question that frames the entire presentation
- Example: "What if we could reverse climate change in 10 years?"
- Add: "[Your Name]"

**DATA-DRIVEN** (for analytical topics):
- Shocking statistic or fact
- Example: "2°C: The Number That Could Change Everything"
- Add: "By [Your Name]"

**ACTION-ORIENTED** (for solution-focused topics):
- Call to action or bold statement
- Example: "Time to Act: Building a Sustainable Future"
- Add: "[Your Name]"

**STORYTELLING** (for narrative topics):
- Brief, intriguing narrative hook
- Example: "Once, our planet was different. It can be again."
- Add: "A presentation by [Your Name]"

CONTENT GUIDELINES:
- Analyze the topic "{user_prompt}" and choose the most fitting style
- Consider the context: business, education, activism, science, etc.
- Keep it IMPACTFUL and MEMORABLE
- Length can vary: 2 words to 3 sentences depending on style
- NO generic "Welcome to..." or "Introduction to..." phrases
- Make it so compelling people want to hear more
- If the title contains a colon (:), treat it as a natural break point
- ALWAYS end with a name placeholder like "[Your Name]" or "Presented by [Your Name]"

TOPIC-SPECIFIC CONSIDERATIONS:
- Climate/Environment: Could be urgent, hopeful, or data-driven
- Business: Professional, results-oriented, or visionary (use "Presented by [Your Name]")
- Technology: Future-focused, innovative, or disruptive
- Health: Personal, scientific, or empowering
- Education: Inspiring, questioning, or discovery-focused (use "[Your Name]")
- Social Issues: Emotional, urgent, or solution-oriented

Generate a title slide that makes people sit up and pay attention, with a name placeholder."""
    
    elif slide_type == 'agenda':
        return f"""{base_topic}

Create a clear agenda slide that outlines the presentation structure.

REQUIREMENTS:
- List 4-8 main sections/topics to be covered
- Use bullet points or numbered list
- Keep each item concise (3-6 words)
- NO charts needed for agenda slides
- Make it scannable and easy to follow
- IMPORTANT: Add a blank line between each bullet point for better readability

Format example:
• Introduction & Context

• Current Challenges

• Our Solution Approach

• Implementation Strategy

• Financial Projections

• Next Steps

Keep it professional and organized. Each bullet point should be on its own line with a blank line after it."""
    
    elif slide_type == 'team':
        return f"""{base_topic}

Create a team slide showcasing key people. Output ONE CLEAR BLOCK PER PERSON with structured fields.

REQUIREMENTS:
- Include 3–6 team members
- For EACH person, include EXACTLY these fields on separate lines:
  Name: <Full Name>
  Title: <Role/Title>
  Description: <1–2 concise lines about expertise/achievements>
  Brands: <2–4 relevant companies/brands or domains tied to this person (e.g., 'Apple, Google' or 'openai.com, microsoft.com')>
- Add a BLANK LINE between people blocks
- Keep it scannable and professional

STRICT FORMAT EXAMPLE (copy this structure exactly, editing values):
Name: John Smith
Title: CEO & Founder
Description: 15+ years in tech leadership; former VP at TechCorp
Brands: TechCorp, Stripe, google.com

Name: Sarah Johnson
Title: CTO
Description: PhD in Computer Science; 10 years in AI/ML
Brands: OpenAI, microsoft.com, Hugging Face

Name: Michael Chen
Title: Head of Sales
Description: Built and scaled enterprise sales teams across SaaS startups
Brands: Salesforce, HubSpot

Only produce content using this exact block format. No bullets. No extra text before/after."""
    
    elif slide_type == 'transition':
        return f"""{base_topic}

Create a progress indicator or transition slide showing presentation flow.

REQUIREMENTS:
- Show progression through the presentation
- Use ">>" to indicate current section
- Use "✓" for completed sections
- Keep it visual and clear
- NO charts needed

Examples:
- "Introduction ✓ | >> Problem Analysis | Solution | Implementation"
- "✓ Background | ✓ Research | >> Key Findings | Recommendations"
- For simple transitions: "Now let's explore how this works in practice..."

Make it clear where we are in the presentation journey."""
    
    elif slide_type == 'conclusion':
        return f"""{base_topic}

Create a strong conclusion slide that summarizes key points.

REQUIREMENTS:
- Use BULLET POINTS format (NOT paragraphs)
- Include 4-6 key takeaways
- Add call to action or next steps
- NO charts needed for conclusion slides
- End on an inspiring or motivating note
- IMPORTANT: Add a blank line between each bullet point for better readability

FORMAT EXAMPLE:
• Key Insight 1: Brief explanation

• Key Insight 2: Brief explanation

• Key Insight 3: Brief explanation

• Next Steps: Clear action items

• Final Thought: Inspiring closing message

Keep each bullet point concise (1-2 lines max). Separate each point with a blank line."""
    
    else:  # content slide
        continuation_guidance = ""
        if context and context.get('is_continuation'):
            continuation_guidance = f"""
CONTINUATION GUIDANCE:
- This is Part {context['part_number']} - build on previous parts, don't repeat
- Focus on NEW aspects not covered in previous parts
- Reference previous insights briefly if needed for flow
- Avoid duplicating any charts already shown
"""
        
        # Determine if this is a high-importance/detailed content slide
        is_detailed_content = any(keyword in slide_title.lower() for keyword in [
            'solution', 'overview', 'strategy', 'analysis', 'framework', 
            'methodology', 'approach', 'model', 'system', 'architecture',
            'roadmap', 'plan', 'implementation'
        ])
        
        # Check if we have extracted data to use
        has_extracted_data = (context and context.get('processed_files') and 
                            context['processed_files'].get('extracted_data'))
        
        # Special handling for solution slides (keep existing detailed prompt)
        if 'solution' in slide_title.lower():
            return f"""{base_topic}

Create compelling content for this SOLUTION slide.{continuation_guidance}

THIS IS A CRITICAL SLIDE - Make it impactful and detailed!

REQUIREMENTS:
- Write 80-120 words - SUBSTANTIVE BUT PUNCHY!
- Use 5-7 bullet points (8-12 words each)
- Include KEY benefits with specific metrics
- Support with large, impactful charts and CustomComponents
- Include metrics or data points that demonstrate effectiveness
- IMPORTANT: Format with proper line breaks between bullet points

SOLUTION SLIDE STRUCTURE:
• Core Technology/Approach
  Explain the fundamental innovation or methodology

• Key Features & Capabilities
  List 3-4 specific features with brief descriptions

• Unique Value Proposition
  What sets this solution apart from alternatives

• Implementation Benefits
  Tangible outcomes and improvements users will see

• Proven Results (if applicable)
  Include metrics, percentages, or success indicators

EXAMPLE FORMAT:
• Our AI-powered platform leverages advanced machine learning algorithms
  Processes data 50% faster than traditional methods

• Real-time predictive analytics with 95% accuracy
  Enables proactive decision-making and risk mitigation

• Seamless integration with existing enterprise systems
  Reduces implementation time from months to weeks

• Customizable dashboards tailored to each department
  Increases user adoption by 80% compared to generic solutions

Remember: This slide should make investors/audience excited about your solution!
Include data for charts if you mention specific metrics or comparisons."""
        
        # Adjust word count based on content importance
        if is_detailed_content:
            # Important slides need substance but still punchy
            word_range = (100, 150)
            bullet_guidance = "5-7 KEY POINTS with impactful data"
            style_guidance = "substantive but punchy"
        else:
            # Regular content slides - balanced approach
            word_range = (80, 120)
            bullet_guidance = "4-6 punchy bullet points"
            style_guidance = "concise and impactful"
        
        # Special guidance when real data is available
        data_guidance = ""
        if has_extracted_data:
            data_guidance = """

CRITICAL: USE THE EXTRACTED DATA!
You have REAL DATA available - use it instead of placeholders!

FORBIDDEN PHRASES - DO NOT USE ANY OF THESE:
- "[Insert specific..."
- "[mention a specific..."
- "[specific value]"
- "[Your Name]" (except on title slides)
- Any text in square brackets that asks for data to be inserted later
- Generic phrases like "specific price point" without the actual number

REQUIRED: Use the ACTUAL numbers provided above:
- Stock prices (e.g., $182.81)
- Percentages (e.g., 40.4% increase)
- Volumes (e.g., 21.2M shares)
- Dates (e.g., October 30)
- All other specific data points

EXAMPLES OF WHAT TO WRITE:
WRONG: "The stock has shown strong growth"
RIGHT: "GOOG stock grew from $147.54 to $207.08, a 40.4% increase"

WRONG: "Trading volume has been significant"
RIGHT: "Trading volume averaged 21.2M shares daily, with peaks of 49.7M on October 30"

WRONG: "Monitor key support zones around [Insert Specific Price Point]"
RIGHT: "Monitor key support zones around $175.50 based on recent trading patterns"

WRONG: "The stock exhibits volatility"
RIGHT: "GOOG experienced 15 days with >3% moves, including a 7.5% drop on February 5"

IMPORTANT: NEVER use emojis in your content. Write professional text only.

FINAL CHECK: Before outputting, verify NO placeholders remain in your content!
USE THE SPECIFIC NUMBERS PROVIDED ABOVE!"""
        
        decision_framework = """
CHART GENERATION GUIDELINES:
When generating chart data, you MUST:

1. **Use Real, Contextual Data**:
   - NEVER use generic labels like "Category A", "Item 1", "Group 2"
   - Extract actual names from the slide content and title
   - Examples of GOOD labels:
     - For a sales slide: "Q1 Revenue", "Online Sales", "North America"
     - For a process: "Research Phase", "Development", "Testing"
     - For market data: "Mobile Devices", "Desktop", "Tablets"
   - Examples of BAD labels:
     - "Category 1", "Item A", "Data Point 2"

2. **Provide Actual Numeric Values**:
   - ALWAYS include specific numeric values for each data point
   - Use realistic numbers based on the context
   - Prefer richer datasets: if categories/time series exist, include 10–20+ points rather than 4–5
   - If discussing percentages, ensure they make sense (e.g., parts of a whole should sum to 100%)
   - If discussing trends, show realistic progression
   - NEVER leave values empty or as placeholders

3. **Vary Chart Types Across Presentation**:
   - Check previously used charts in context
   - Popular charts (use frequently): bar, column, pie, line, area
   - Unique charts (use sparingly - MAX 1 per presentation): sankey, treemap, radar, waterfall
   - NEVER use funnel charts - use bar/column for process data instead

4. **Match Chart Type to Data**:
   - Pie/Donut: For percentages/distributions (max 8 segments)
   - Bar/Column: For comparisons between categories or process stages
   - Line/Area: For trends over time (min 5 data points)
   - Waterfall: For showing cumulative changes or process flows

5. **Data Point Requirements**:
   - Include 10–20+ data points when appropriate (avoid under-populated charts)
   - Each data point MUST have both a name/label AND a numeric value
   - Values MUST be plain numbers only (no symbols), e.g., 35 not "35%", 4500000 not "$4.5M"
   - Ensure values are COMPARABLE and use ONE measurement type only (all are %, or all are USD, or all are counts)
   - If using percentages, they MUST sum to exactly 100 (adjust the final segment to fix rounding)
   - VALIDITY: x-axis labels must be same type; y-axis values must all share a single unit/measure across the whole series

6. **Chart Visual Style (defaults)**:
   - Background: Transparent by default (no panel background) unless a strong stylistic choice is justified explicitly
   - Size: Make charts LARGE and prominent (aim for 60-80% of slide width/height)
   - Axis labels: If category names are long, increase angle (sharper tilt) to prevent overlap and keep labels readable
   - Bottom axis labels: Rotate to 30–45° and increase bottom margin to prevent cropping
   - Set axisBottom.tickRotation and margins.bottom (or in Highcharts: xAxis.labels.rotation and chart.marginBottom; xAxis.labels.autoRotation is OK for dense labels)
   - Density: Prefer richer datasets when appropriate (more categories/bars if content supports it)

7. **Chart Titles**:
   - Be specific about what the chart shows
   - Good: "Q4 2024 Revenue by Region", "Customer Acquisition Process"
   - Bad: "Data Chart", "Statistics", "Chart Title"

CRITICAL: If you decide a chart is needed (requires_chart=true), you MUST populate the chart_data array with real data points. Each point needs:
- name: A descriptive label (not generic)
- value: An actual number (not zero or placeholder)

Example of CORRECT chart data:
[
  {"name": "North America", "value": 4500000},
  {"name": "Europe", "value": 3200000},
  {"name": "Asia Pacific", "value": 2800000}
]

Example of INCORRECT chart data:
[
  {"name": "Category A", "value": 0},
  {"name": "Item 1", "value": 0}
]

Consider these decision criteria:
- The slide title and content explicitly reference quantitative data
- You can extract specific categories and values from the content
- The data would be clearer when visualized
- The slide is comparing multiple items, showing trends, or displaying distributions

Do NOT generate a chart when:
- Content is purely narrative or strategic without specific data
- The slide is about concepts, ideas, or qualitative information only
- You're discussing future plans without concrete projections
- The content is an introduction or overview without metrics
 - The topic is PERSONAL/CREATIVE or GENERAL/HOW-TO (e.g., recipes, hobbies, crafts, lifestyle) unless the user explicitly asked for data visualization
 - You only have isolated one-off stats that do not form a comparable series (keep them as STAT text in the outline)
 - The available data mixes incompatible units or scales (e.g., percentages with currency, revenue with headcount); in this case set requires_chart=false

VALIDATION CHECKLIST BEFORE RETURNING:
1) All values are numbers (no %, $, or unit strings)
2) All values share the SAME unit/measurement type
3) Pie/distribution charts add up to 100 exactly
4) Labels are contextual and non-generic
If any check fails, set requires_chart=false and provide only content.
"""

        return f"""{base_topic}

Create {'detailed' if is_detailed_content else 'SIMPLE'} content for this slide.{continuation_guidance}{data_guidance}

CONTENT GUIDANCE:
- Context: {presentation_context.upper()} presentation
- Content Style: {'Detailed and comprehensive' if is_detailed_content else 'SIMPLE AND CONCISE'}
- Visual Emphasis: {guidance['visual_emphasis']}

REQUIREMENTS:
- Write {word_range[0]}-{word_range[1]} words - PUNCHY BUT SUBSTANTIVE!
- Use bullet points (8-15 words each) with specific details
- Include {bullet_guidance}
- Every word must add value - include metrics and specifics when relevant
- Include charts ONLY when they improve clarity and data form a comparable series
- Avoid charts for narrative/overview slides unless explicitly warranted
- For PERSONAL/CREATIVE and GENERAL/HOW-TO topics: DO NOT include stats or charts unless explicitly requested; keep tone fun, engaging, and based only on the user's request
- For TRAINING/NONPROFIT/FUNDRAISING: Lead with a short scenario or story; support with at most one key metric
- IMPORTANT: Format with proper line breaks between bullet points
 - HEIGHT-AWARE BULLETS: Each bullet should be a single line. If a bullet would wrap into multiple lines within a small text area, either reduce line breaks by making it more concise, or split into additional bullets. Multi-line bullets are discouraged unless height is increased appropriately in the layout.
{f'- USE REAL DATA: Reference the actual extracted data provided above!' if has_extracted_data else ''}
- FACTS AND METRICS MUST BE EITHER:
  (a) FROM THE WEB SOURCES LISTED ABOVE (append a numeric [n] at end of the bullet referencing the source index), OR
  (b) WELL-KNOWN BACKGROUND KNOWLEDGE (avoid speculative claims). Use at most one [n] per bullet; if uncertain, omit.
- DO NOT reference images in the content text (no "[Image 1: filename]" or image descriptions)
- Images will be added separately through the design system
- CRITICAL: Avoid long paragraphs - use short, punchy statements
- Each bullet point should be scannable and impactful
- Focus on KEY insights, not exhaustive details
- EXTRACT KEY NUMBERS: If content has stats, pull them out for visual emphasis
- NEVER bury important data in paragraphs - highlight it separately
- Think VISUAL: How can this data be displayed beautifully, not just written?

COMPARISON FORMAT (applies when the title includes "vs", "versus", "comparison", or "compare"):
- Create PAIRED bullets: alternate Side A then Side B with parallel phrasing
- Prefix each bullet with the side label (e.g., "Lakers — ..", "Celtics — ..")
- Include 4–6 matched pairs; keep symmetry in count and phrasing
- Reserve the final bullet for the key takeaway or recommendation
- If a chart is warranted, use bar/column with IDENTICAL categories for both sides

STRUCTURED COMPARISON OUTPUT (when comparisons detected):
- In addition to the bullets, ensure the final content supports extracting a "comparison" object with:
  - layout: "split_50_50" or "split_60_40" (default split_50_50)
  - leftLabel and rightLabel based on the title (e.g., "Before"/"After" or entities around "vs")
  - leftBullets: the exact left-side bullets (without labels)
  - rightBullets: the matching right-side bullets (without labels)
- Keep the bullets concise (≤ 20 words) so they fit in columns.

VARIANT SERIES FORMAT (when this slide is part of a multi-item set, e.g., teams/products):
- Use the SAME micro-structure across items: Overview; Key stats; Strengths; Weaknesses; Notable
- For a single "snapshots" slide, list 3–6 items with identical fields and order
- Maintain identical ordering/wording of subheadings across variant slides

{'DETAILED CONTENT APPROACH:' if is_detailed_content else 'SIMPLIFIED CONTENT APPROACH:'}
{'- Include context, examples, and supporting data' if is_detailed_content else '- State main points directly'}
{'- Explain concepts thoroughly' if is_detailed_content else '- Avoid lengthy explanations'}
{'- Add metrics and specifics where relevant' if is_detailed_content else '- Focus on key takeaways only'}

FORMATTING EXAMPLE:
• {'Short vignette: who/context → action → outcome' if not is_detailed_content else 'Story-led point with concise supporting detail'}
  {'Optional: one supporting metric in parentheses' if not has_extracted_data else 'Use real numbers if provided above'}

• {'Checklist item or concrete example with an actionable takeaway' if not is_detailed_content else 'Another story-led point with example'}
  {'Keep numbers minimal unless extracted data is provided' if not has_extracted_data else 'Reference the exact values from extracted data'}

{decision_framework}

Available chart types and when to use them:
{chart_type_descriptions}

IMPORTANT CHART DATA RULES:
- Use REAL, CONTEXTUAL labels from your content (e.g., "Q1 2024 Revenue" not "Category A")
- Include as many data points as make sense (don't limit to 4-5 if more would be valuable)
- Ensure all data points use consistent units (all percentages, all millions, etc.)
- Make chart titles specific and descriptive
- If you mention specific numbers in your content, use those exact numbers in the chart

{'For detailed content, include relevant data and metrics that MUST be visualized when possible.' if is_detailed_content else 'For simple slides, include charts whenever there are numbers or percentages.'}
{f'CHART DATA: Use the REAL extracted data for any charts - do not make up data!' if has_extracted_data else ''}

Remember: {'This is important content - be thorough!' if is_detailed_content else 'Keep it simple and scannable!'}
{f'USE THE REAL DATA PROVIDED - no placeholders!' if has_extracted_data else ''}"""


def get_fallback_content(slide_title: str, slide_type: str, topic: str) -> str:
    """Generate fallback content dynamically based on slide type."""
    
    if slide_type == 'title':
        return f"# {slide_title}\n\n{topic}\n\n[Your Name]"
    
    elif slide_type == 'agenda':
        return f"## {slide_title}\n\n• Introduction\n\n• Key Challenges\n\n• Our Approach\n\n• Implementation\n\n• Results\n\n• Next Steps"
    
    elif slide_type == 'team':
        return f"## {slide_title}\n\nName: Jane Doe\nTitle: CEO\nDescription: 12+ years leading product-led growth and strategic partnerships\nBrands: Stripe, Shopify\n\nName: Alex Kim\nTitle: CTO\nDescription: Ex-FAANG senior engineer; scaled ML infra to millions of users\nBrands: google.com, OpenAI\n\nName: Priya Singh\nTitle: Head of Operations\nDescription: Built global ops teams; improved SLA adherence by 35%\nBrands: Uber, Amazon"
    
    elif slide_type == 'transition':
        if '>>' in slide_title:
            return f"## {slide_title}"
        else:
            return f"## {slide_title}\n\nMoving forward to explore the next aspect of our presentation."
    
    elif slide_type == 'conclusion':
        return f"## {slide_title}\n\n• Thank you for your time and attention\n\n• Key takeaways from this presentation will guide our next steps\n\n• Questions and discussion welcome"
    
    else:  # content slide
        # Special handling for solution slides
        if 'solution' in slide_title.lower():
            return f"## {slide_title}\n\n• **Core Innovation**: Our platform leverages cutting-edge technology to deliver unprecedented results\n\n• **Key Features**: Real-time processing, intuitive interface, and seamless integration capabilities\n\n• **Proven Benefits**: 40% improvement in efficiency, 60% reduction in costs, 95% user satisfaction rate\n\n• **Competitive Advantage**: Unique algorithms and proprietary methods set us apart from alternatives\n\n• **Implementation**: Quick deployment with minimal disruption to existing workflows"
        else:
            return f"## {slide_title}\n\n• This section covers important aspects related to the topic at hand\n\n• Key insights and data will be presented\n\n• Focus on practical applications and outcomes"


def get_chart_type_determination_prompt(slide_title: str, content: str, chart_descriptions: str) -> str:
    """Generate prompt for determining the best chart type for given content."""
    return f"""Determine the best chart type for this data from the available options.

Slide title: {slide_title}
Content preview: {content[:300]}...

AVAILABLE CHART TYPES:
{chart_descriptions}

ANALYSIS GUIDELINES:
- For parts of whole, percentages, distributions: STRONGLY PREFER pie, treemap, or donut
- For time trends: line, area, spline, areaspline
- For comparisons: bar, column, radar
- For correlations: scatter, bubble
- For hierarchical data: treemap, sunburst, packedbubble
- For processes/flows: waterfall, sankey
- For networks/relationships: networkgraph, dependencywheel
- For statistical data: boxplot, errorbar, gauge
- For specialized cases: heatmap, streamgraph

IMPORTANT: 
- If content mentions percentages (%), market share, or parts of a whole, ALWAYS choose "pie"
- Vary chart types across slides - avoid using the same type repeatedly
- Consider visual appeal and data clarity

Return ONLY the chart type name (e.g., "pie", "treemap", "sankey", "bar")"""


def get_waterfall_chart_data_prompt(title: str, content: str) -> str:
    """Generate prompt for creating waterfall chart data."""
    return f"""Generate waterfall chart data for this slide.
Slide title: {title}
Content context: {content[:200]}...

Create realistic waterfall data showing progression/changes with:
1. Starting value
2. 2-4 increases/decreases with contextual names
3. Final value
4. Values that make sense for the topic

Return ONLY a JSON array like:
[{{"name": "Initial Revenue", "value": 1000, "type": "start"}}, {{"name": "Q1 Growth", "value": 150, "type": "positive"}}, ...]"""


def get_network_chart_data_prompt(chart_type: str, title: str, content: str) -> str:
    """Generate prompt for creating network chart data (sankey, networkgraph, etc.)."""
    return f"""Generate {chart_type} chart data for this slide.
Slide title: {title}
Content context: {content[:200]}...

Create realistic network/flow data with:
1. 4-6 connections between nodes
2. Node names that relate to the content
3. Realistic flow values

Return ONLY a JSON array like:
[{{"from": "Source Node", "to": "Target Node", "value": 100}}, ...]"""


def get_pie_chart_data_prompt(title: str, content: str) -> str:
    """Generate prompt for creating pie chart data."""
    return f"""Generate pie chart data for this slide.
Slide title: {title}
Content context: {content[:200]}...

Create realistic percentage distribution that:
1. Totals to exactly 100%
2. Has 3-6 categories
3. Uses specific, contextual names (not generic labels)
4. Matches the content theme
5. ALL values represent the SAME type of measurement (e.g., all product categories, all regions, all departments)

IMPORTANT: Pie charts show parts of a whole. All segments must:
- Represent the same type of thing (e.g., all product categories, all regions, all departments)
- Use percentages that add up to 100%
- Have meaningful, related category names

Return ONLY a JSON array like:
[{{"name": "Specific Category", "value": 35}}, {{"name": "Another Category", "value": 25}}, ...]"""


def get_line_chart_data_prompt(title: str, content: str, start_year: int, end_year: int) -> str:
    """Generate prompt for creating line chart data."""
    return f"""Generate line chart data showing trends over time.
Slide title: {title}
Content context: {content[:200]}...
Time range: {start_year} to {end_year}

Create realistic trend data with:
1. At least 12-15 data points
2. Years as x values (e.g., "2020")
3. Realistic values with natural variation
4. Appropriate scale for the topic
5. Show meaningful trends (growth, decline, fluctuation)
6. CRITICAL: ALL y-values MUST use the SAME unit of measurement

IMPORTANT: Choose ONE consistent scale based on context:
- Console/product sales: ALL in millions (e.g., 61.91 for 61.91 million)
- Revenue: ALL in same unit (e.g., all in millions USD)
- Market share: ALL in percentages (e.g., 35 for 35%)
- User counts: ALL in same scale (all thousands OR all millions)
- Stock prices: ALL in actual dollar amounts

The Y-axis should represent ONE type of measurement only.
NEVER mix different types of data in the same chart.

Return ONLY a JSON array like:
[{{"x": "2020", "y": 520}}, {{"x": "2021", "y": 615}}, ...]"""


def get_bar_chart_data_prompt(title: str, content: str) -> str:
    """Generate prompt for creating bar chart data."""
    return f"""Generate bar chart data for comparisons.
Slide title: {title}
Content context: {content[:200]}...

Create realistic comparison data with:
1. 4-8 categories with contextual names
2. Values that make sense for the topic
3. Names that relate directly to the content
4. CRITICAL: ALL values MUST use the SAME unit of measurement

IMPORTANT: Choose ONE consistent measurement type:
- If comparing sales: ALL in same unit (millions, thousands, etc.)
- If comparing percentages: ALL as percentages
- If comparing counts: ALL as raw numbers
- NEVER mix units like "revenue" with "employee count" or "market share %"

Return ONLY a JSON array like:
[{{"name": "Product A", "value": 450}}, {{"name": "Product B", "value": 380}}, ...]"""


def get_chart_title_prompt(slide_title: str, chart_type: str, chart_data: List[Dict[str, Any]], topic: str) -> str:
    """Generate prompt for creating a chart title."""
    # Format chart data preview
    data_preview = str(chart_data[:3]) if len(chart_data) > 3 else str(chart_data)
    
    return f"""Generate a professional chart title for this {chart_type} chart.

Slide title: {slide_title}
Topic: {topic}
Chart type: {chart_type}
Data preview: {data_preview}

REQUIREMENTS:
1. Be specific to the data being shown
2. 4-8 words maximum
3. Include key metric or timeframe if relevant
4. No generic titles like "Data Overview"
5. Make it immediately clear what the chart shows

EXAMPLES:
- "Console Sales by Generation (Millions)"
- "Revenue Growth 2020-2024"
- "Market Share Distribution Q4 2023"
- "Customer Acquisition Process"
- "Performance Metrics Comparison"

Return ONLY the title text, nothing else.""" 


def get_smart_content_guidance(slide_title: str, presentation_title: str, presentation_context: str = "general", visual_density: str = "moderate") -> dict:
    """Generate intelligent guidance for slide content generation based on context.
    
    This function analyzes the slide title and presentation context to provide
    smart defaults for content generation, including word count, style, and
    whether charts should be included.
    """
    guidance = {
        "word_count_range": (80, 120),  # Punchy but substantive - not a document!
        "content_style": "punchy",
        "should_include_chart": False,  # Default to NO unless data supports it
        "chart_appropriateness": "selective",
        "visual_emphasis": "high",  # low, medium, high
        "reasoning": "Content-first. Use charts only when they add clarity to real comparable data."
    }
    
    title_lower = slide_title.lower()
    
    # Simple heuristics for word count and style, but let AI decide on charts
    
    # Title slides - never need charts
    if any(word in title_lower for word in ["title", "cover", "welcome"]):
        guidance["word_count_range"] = (5, 20)  # ONLY title, subtitle, name, org, date
        guidance["content_style"] = "minimal"
        guidance["chart_appropriateness"] = "never"
        guidance["visual_emphasis"] = "high"
        guidance["reasoning"] = "Title slides must be minimal - no body content"
    
    # Executive summaries - concise, rarely need charts
    elif any(term in title_lower for term in ["executive summary", "overview", "key takeaways", "highlights"]):
        guidance["word_count_range"] = (60, 90)  # 4-6 punchy bullet points
        guidance["content_style"] = "concise"
        guidance["chart_appropriateness"] = "rare"  # Changed from let_ai_decide
        guidance["visual_emphasis"] = "medium"
        guidance["reasoning"] = "Summary slides should be scannable, charts only if key metrics"
    
    # Conclusion slides - no charts needed
    elif any(word in title_lower for word in ["conclusion", "thank you", "questions", "contact", "next steps"]):
        guidance["word_count_range"] = (20, 40)  # Just key actions/contact
        guidance["content_style"] = "action-oriented"
        guidance["chart_appropriateness"] = "never"
        guidance["visual_emphasis"] = "medium"
        guidance["reasoning"] = "Conclusion slides focus on takeaways and actions"
    
    # Agenda slides - no charts
    elif "agenda" in title_lower or "outline" in title_lower:
        guidance["word_count_range"] = (20, 40)  # Just section names
        guidance["content_style"] = "structured"
        guidance["chart_appropriateness"] = "never"
        guidance["reasoning"] = "Agenda slides are navigational"
    
    # Section headers - brief, no charts
    elif any(term in title_lower for term in ["part", "section", "chapter"]) and len(title_lower.split()) < 5:
        guidance["word_count_range"] = (10, 20)  # Almost no text
        guidance["content_style"] = "transitional"
        guidance["chart_appropriateness"] = "never"
        guidance["visual_emphasis"] = "high"
        guidance["reasoning"] = "Section headers are visual transitions"
    
    # Data-heavy slides - likely need charts
    elif any(word in title_lower for word in ["data", "metrics", "statistics", "analysis", "results", "performance", "growth", "trend"]):
        guidance["word_count_range"] = (50, 80)  # Context for data visuals
        guidance["content_style"] = "data-driven"
        guidance["chart_appropriateness"] = "always"  # ALWAYS include charts for data slides
        guidance["should_include_chart"] = True
        guidance["visual_emphasis"] = "data-focused"
        guidance["reasoning"] = "Data slides benefit from visualization"
    
    # Process/workflow slides - sometimes need charts
    elif any(word in title_lower for word in ["process", "workflow", "steps", "stages", "funnel", "pipeline"]):
        guidance["word_count_range"] = (30, 50)  # Brief step descriptions
        guidance["content_style"] = "structured"
        guidance["chart_appropriateness"] = "selective"  # Only if quantifiable
        guidance["visual_emphasis"] = "medium"
        guidance["reasoning"] = "Process slides may benefit from waterfall/flow charts if quantifiable"
    
    # For all other content slides - be selective with charts
    else:
        guidance["word_count_range"] = (80, 120)  # 5-7 punchy bullet points
        guidance["content_style"] = "punchy"
        guidance["chart_appropriateness"] = "selective"
        guidance["visual_emphasis"] = "high"
        guidance["reasoning"] = "Balance clarity and design; add visuals only when they strengthen the message"
    
    # Scale guidance by visual_density
    try:
        vd = (visual_density or "moderate").lower()
        base_min, base_max = guidance["word_count_range"]
        if vd == "minimal":
            guidance["word_count_range"] = (max(20, int(base_min * 0.4)), max(40, int(base_max * 0.5)))
            guidance["content_style"] = "concise"
            guidance["visual_emphasis"] = "high"
            if guidance.get("chart_appropriateness") == "likely":
                guidance["chart_appropriateness"] = "rare"
        elif vd == "rich":
            guidance["word_count_range"] = (max(base_min, int(base_min * 1.2)), int(base_max * 1.5))
            guidance["content_style"] = "detailed"
            guidance["visual_emphasis"] = "medium"
            if guidance.get("chart_appropriateness") == "selective":
                guidance["chart_appropriateness"] = "selective"
        elif vd == "dense":
            guidance["word_count_range"] = (max(120, int(base_min * 1.5)), int(base_max * 1.8))
            guidance["content_style"] = "detailed"
            guidance["visual_emphasis"] = "medium"
            guidance["chart_appropriateness"] = "rare"
        elif vd == "data-heavy":
            guidance["word_count_range"] = (max(60, int(base_min * 0.9)), max(140, int(base_max * 1.1)))
            guidance["chart_appropriateness"] = "always"
            guidance["should_include_chart"] = True
            guidance["content_style"] = "data-driven"
            guidance["visual_emphasis"] = "data-focused"
    except Exception:
        pass

    return guidance