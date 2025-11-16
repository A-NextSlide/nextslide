"""
Outline Generation Prompts - CLEAN VERSION

Simple, focused prompts for creating presentation outlines.
"""

from typing import Dict, Any, Optional, List
import json


def get_flow_requirements(slide_count: Optional[int]) -> str:
    """Get flow requirements based on slide count."""
    if not slide_count:
        return "- Build logical narrative flow"

    requirements = []

    if slide_count >= 8:
        requirements.extend([
            "- Slide 2: Agenda showing roadmap",
            "- Transition slides every 4-5 content slides",
            "- Dividers for major sections"
        ])

    if slide_count >= 12:
        requirements.extend([
            "- 2-3 stat slides for metrics (business/data topics only)",
            "- Quote slide for testimonials",
            "- Checkpoint transitions"
        ])

    if slide_count >= 20:
        requirements.extend([
            "- Break into clear chapters",
            "- Sub-section dividers",
            "- Multiple checkpoints"
        ])

    return "\n".join(requirements) if requirements else "- Logical flow"


def get_outline_planning_prompt(user_prompt: str, style_context: Optional[str], detail_level: str, slide_count: Optional[int] = None) -> str:
    """Generate prompt for creating outline plan (slide titles)."""

    # Slide count instruction
    if slide_count:
        if slide_count == 1:
            count_inst = f"""EXACTLY 1 SLIDE! Just ONE content slide.
Example: {{"slides": ["Key Insights"], "slide_types": ["content"]}}"""
        elif slide_count == 2:
            count_inst = f"""EXACTLY 2 SLIDES! Two content slides only.
Example: {{"slides": ["Current State", "Future Vision"], "slide_types": ["content", "content"]}}"""
        else:
            count_inst = f"""EXACTLY {slide_count} SLIDES!
Slide 1: Title
Slides 2-{slide_count-1}: Content
Slide {slide_count}: Conclusion
COUNT CHECK: slides.length === {slide_count}"""
    else:
        # Give minimal guidance, let model decide
        if detail_level == "detailed":
            count_inst = "Use as many slides as needed to comprehensively explain the topic. Each slide = one focused concept."
        elif detail_level == "standard":
            count_inst = "Create an appropriate number of slides to properly cover the topic. Break it down logically."
        else:  # quick
            count_inst = "Create a concise presentation. Use your judgment on slide count."

    enforcement = f"\n\n*** MUST GENERATE EXACTLY {slide_count} SLIDES ***" if slide_count else ""

    return f"""Create slide titles for: {user_prompt}

SLIDE COUNT: {count_inst}

CONTEXT DETECTION:
- Business: pitch, investor, company, financial
- Educational: school, teaching, learning, academic
- Personal: hobby, party, birthday, fun, creative
- How-to: tutorial, guide, recipe, DIY

RULES:
1. Title reflects ACTUAL topic (not generic)
2. Use company/product/topic name
3. Flow: {get_flow_requirements(slide_count)}
4. Context-aware:
   - Educational: NO market size/TAM/ROI, use learning objectives
   - Personal/How-to: NO stats/charts/business metrics, keep FUN
   - Business: Professional structure with data
5. ONE CONCEPT PER SLIDE - never cram multiple ideas together
6. Create logical structure with proper flow
7. End with appropriate closing

TITLE FORMULAS:
- Business: "[Company]: [Value Prop]" or "[Result] with [Product]"
- Tech: "[Platform]: [What It Enables]"
- Educational: "[Topic]: [Approach]" or "Understanding [Concept]"
- Personal: "[Activity]: [Angle]" or "Exploring [Topic]"
- How-to: "Mastering [Skill]" or "Guide to [Topic]"

Keep titles 2-8 words, specific, memorable.

Output JSON:
{{
  "title": "Presentation Title",
  "slides": ["slide 1 title", "slide 2 title", ...],
  "slide_types": ["title", "content", "conclusion", ...],
  "context": "business|educational|personal|informational"
}}

Slide types: title, agenda, content, transition, divider, stat, quote, team, quiz, conclusion

📝 Use 'quiz' type for interactive checkpoint slides in educational presentations

Style: {style_context or 'Professional'}

{enforcement}"""


def get_slide_content_prompt(
    slide_title: str,
    slide_type: str,
    user_prompt: str,
    presentation_title: str,
    formatted_slide_title: str,
    context: Optional[Dict[str, Any]] = None,
    chart_type_descriptions: str = ""
) -> str:
    """Generate prompt for slide content - CLEAN and OUTLINE-FOCUSED."""

    base = f"""Slide: {slide_title}
Topic: {user_prompt}
Presentation: {presentation_title}"""

    detail = context.get('detail_level', 'standard') if context else 'standard'
    pres_context = context.get('context', 'business') if context else 'business'
    has_data = context and context.get('processed_files', {}).get('extracted_data')

    # Special types
    if slide_type == 'title':
        return f"""{base}

Create title slide (20-35 words):
- Main title
- Optional subtitle (8-12 words)
- Optional: [Your Name], [Organization], [Date]"""

    if slide_type == 'agenda':
        return f"""{base}

List 4-7 main sections as bullets."""

    if slide_type == 'conclusion':
        return f"""{base}

4-6 key takeaways + call to action"""

    if slide_type == 'stat':
        return f"""{base}

One big number + 2-5 word context (under 10 words total)"""

    if slide_type == 'quote':
        return f"""{base}

Powerful quote (1-2 sentences, under 24 words) + attribution"""

    if slide_type == 'divider':
        return f"""{base}

Section title + optional 3-5 word tagline"""

    if slide_type == 'transition':
        return f"""{base}

Progress indicator: "Section ✓ | >> Current | Upcoming"
Use >> for current section, ✓ for completed"""

    if slide_type == 'team':
        return f"""{base}

TEAM SLIDE (text-dense is OK):
- List 6–12 members, each as one line
- Format: Name — Role — credential/achievement (3–7 words)
- Keep credentials short (e.g., ex-Company, exited $XM, PhD AI)
- No full bios, no paragraphs
"""

    if slide_type == 'quiz':
        return f"""{base}

INTERACTIVE QUIZ/CHECKPOINT SLIDE:
Create an engaging quiz to test understanding of previous concepts.

FORMAT:
## Quiz: [Topic]

**Question:** [Clear, specific question about the concept just taught]

**Options:**
A) [Option 1]
B) [Option 2]
C) [Option 3]
D) [Option 4]

**Answer:** [Correct answer letter]
**Why:** [Brief 1-sentence explanation]

QUIZ DESIGN RULES:
- Question should test UNDERSTANDING, not just memorization
- Make wrong answers plausible but clearly incorrect
- Keep question and answers concise (under 15 words each)
- Focus on the KEY concept from previous 2-3 slides
- Make it engaging and relevant to real-world application

EXAMPLE:
## Quick Check: Photosynthesis

**Question:** What do plants produce during photosynthesis?

**Options:**
A) Carbon dioxide and water
B) Glucose and oxygen
C) Nitrogen and oxygen
D) Glucose and carbon dioxide

**Answer:** B
**Why:** Plants use CO₂ and water to create glucose (food) and oxygen (byproduct)"""

    # CONTENT SLIDES
    data_note = "\n\nUSE REAL DATA from files!" if has_data else ""

    if detail == 'detailed':
        mode = """DETAILED MODE - EDUCATIONAL APPROACH:

🎓 GOAL: Deep understanding through clear, focused explanations.
This is NOT about cramming information - it's about TEACHING concepts properly.

CONTENT PER SLIDE:
- 40-60 words MAX per slide (less is better!)
- ONE clear concept or idea per slide
- If you need to explain multiple related points, they should be SIMPLE bullets, not paragraphs
- Think "textbook clarity" not "presentation density"

FORMAT:
## Concept Title (2-5 words)
• Clear, simple point (6-10 words)
• Supporting detail (6-10 words)
• Optional example (6-10 words)

EDUCATIONAL CONTENT RULES:
✅ Break complex topics into multiple slides (already done in outline)
✅ Each slide focuses on ONE learning objective
✅ Use simple, accessible language
✅ Include concrete examples when helpful
✅ Progressive complexity: simple → advanced
✅ For processes: ONE step per slide
✅ For concepts: definition → explanation → example
✅ For comparisons: overview → item A → item B → synthesis

INTERACTIVE ELEMENTS for Educational Content:
- For key concepts: add "💡 Quick Check: [simple question to test understanding]"
- For processes: add "✓ Checkpoint: What did we learn?"
- For complex topics: add "🤔 Think: How would you apply this?"

EXAMPLES BY TOPIC TYPE:

Educational Concept:
## Photosynthesis Overview
• Plants convert sunlight into chemical energy
• Occurs in chloroplasts (green parts of plants)
• Produces glucose and oxygen

💡 Quick Check: What do plants need for photosynthesis?

Tutorial Step:
## Step 3: Mixing the Batter
• Combine dry and wet ingredients separately first
• Gently fold wet into dry - don't overmix
• Stop when just combined (some lumps OK)

✓ Checkpoint: Batter should be slightly lumpy, not smooth

Technical Concept:
## What is an API?
• Application Programming Interface
• Allows different software to communicate
• Like a waiter taking your order to the kitchen

🤔 Think: What APIs do you use every day?

** CRITICAL: IF THE USER PROVIDED SPECIFIC CONTENT/TEXT:
- Output EXACTLY what they wrote - word for word
- DO NOT add research, examples, or additional information
- DO NOT expand or elaborate on their content
- Your role is to format and structure their exact words, not to add content

CHARTS: ALMOST NEVER in educational/detailed mode
- Educational content needs TEXT and EXAMPLES, not charts
- ONLY use charts if you have 15+ quantitative data points showing a clear pattern
- Default to text explanations and examples"""
    else:
        mode = """PRESENTATION MODE:

GOAL: Simple, visual-first slides the audience can absorb in seconds.

APPROACH: Think like the example slides shown - clean sections with minimal text.

FORMAT:
## Section Title (2-5 words)
• Concise point (5-10 words max)
• Another key point (5-10 words max)

## Another Section (if needed)
• Supporting insight (5-10 words max)

EXAMPLE - PITCH DECK SLIDE:
## Sector Insights

## Fintech
Fintech has shown **notable growth** with higher mega outcome incidence

## SaaS
The SaaS sector has maintained **steady outcomes**, demonstrating resilience

## Consumer
Consumer sectors exhibit **high variance** in returns

CONTENT RULES:
- EXTREME BREVITY: Each bullet is 5-10 words MAX - headlines only!
- MAXIMUM 30-40 words per slide (excluding title)
- 2-3 sections max per slide (don't cram!)
- 2-3 bullets per section
- Bold key numbers and metrics with **
- Test: "Can you READ this in 3 seconds?"
- DO NOT include IMAGE tags - those are added separately
- DO NOT write paragraphs or full sentences - use short phrases

** CRITICAL: IF THE USER PROVIDED SPECIFIC CONTENT/TEXT:
- Output EXACTLY what they wrote - word for word
- DO NOT add research, examples, or additional information
- DO NOT expand or elaborate on their content
- Your role is to format and structure their exact words, not to add content

VISUALS:
🎨 Images/Icons: PRIMARY visual element (60-80% of slides should have images)
📊 Charts: EXTREMELY RARE (only 5-10% of slides MAX, and ONLY for truly exceptional data stories)

CHARTS - WHEN TO USE THEM:
🚫 NO CHARTS FOR (use text/images instead):
   - Educational/explanatory content (concepts, processes, how-to)
   - Historical narratives or stories
   - Feature lists or benefits
   - Comparisons that work as bullet points
   - Simple statistics (2-3 numbers)
   - Qualitative information (opinions, quotes, descriptions)
   - Product features, team members, testimonials
   - Vision statements, mission, values
   - ANY slide where an image or text would work just as well

✅ ONLY USE CHARTS WHEN ALL CONDITIONS MET:
   - You have 10-20+ QUANTITATIVE data points to compare
   - The data shows a clear TREND, PATTERN, or DISTRIBUTION
   - The visual representation reveals insights text CANNOT
   - The slide's PRIMARY PURPOSE is data analysis/metrics (not storytelling)
   - Examples: quarterly revenue over 3+ years, market share distribution across 10+ companies, user growth over 12+ months
   - The presentation is business/data-focused (NOT educational, personal, or creative)

⚠️ ASK YOURSELF: "Is this slide IMPOSSIBLE to understand without a chart?"
   - If the answer is "no" or "text/images would work" → NO CHART
   - Default to NO CHART unless you're 100% certain it's necessary"""

    charts = """
CHART VALIDATION (ALL MUST PASS OR NO CHART):

🚨 CRITICAL #1: SAME UNITS & MEASUREMENT TYPE
❌ NEVER mix different types of data in ONE chart:
   - NO mixing years + heights + distances (e.g., 4525 years, 200 feet, 1.4 meters)
   - NO mixing revenue + employee count + percentages
   - NO mixing dates + measurements + counts

✅ ALL values must represent THE SAME MEASUREMENT:
   - Revenue chart: ONLY revenue values in consistent units ($M)
   - Employee chart: ONLY employee counts
   - Time series: ONLY values of same type across time points

EXAMPLE FAILURES:
❌ [{"name": "Years", "value": 4525}, {"name": "Height (ft)", "value": 200}, {"name": "Distance (m)", "value": 1.4}]
❌ [{"name": "Revenue ($M)", "value": 500}, {"name": "Employees", "value": 2000}, {"name": "Growth %", "value": 15}]

EXAMPLE SUCCESS:
✅ [{"name": "Q1 Revenue", "value": 500}, {"name": "Q2 Revenue", "value": 550}, {"name": "Q3 Revenue", "value": 600}]
✅ [{"name": "North", "value": 1200}, {"name": "South", "value": 1500}, {"name": "East", "value": 1100}]

2. SAME SCALE: Comparable magnitudes (within 100x range)
3. MAKES SENSE: Realistic (pie=100%, chronological time series)
4. SUFFICIENT: 3+ points minimum, 8-15+ for trends
5. NUMBERS ONLY: 4500000 not "$4.5M" (no formatted strings)
6. REAL LABELS: "North America" not "Category A"

TYPES: bar/column (categories), line/area (time trends), pie (distribution=100%),
waterfall (sequential), scatter/bubble (correlation), radar (multi-dimensional),
heatmap (2D intensity), sankey (flow), treemap/sunburst (hierarchical)

Multi-series: add "series" field → [{"name": "Q1", "value": 450, "series": "Revenue"}, ...]

Titles need units: "Revenue by Region ($M)"

If ANY rule fails → NO CHART, use text or bullet points instead"""

    return f"""{base}

MODE: {detail.upper()}
Context: {pres_context.upper()}{data_note}

{mode}

{charts}

- Include ACTUAL content (words, examples, code, steps)
- Metrics in text - generator formats them
- {pres_context.upper()}: {'data-driven' if pres_context == 'business' else 'NO charts unless quantitative data'}
"""


def get_chart_type_determination_prompt(slide_content: str, slide_title: str) -> str:
    """Determine chart type for slide."""
    return f"""Analyze: {slide_title}

Content: {slide_content}

NEEDS CHART if ALL true:
1. Has QUANTITATIVE DATA (real numbers)
2. Forms COMPARABLE SERIES (same units)
3. Visualization CLEARER than text
4. Topic DATA-CENTRIC (finance/analytics/research)

NO for: educational/explanatory, personal/creative, descriptions

Types:
- bar/column: categories
- line: time trends
- pie: distribution (=100%)
- waterfall: sequential
- scatter/bubble/radar/heatmap/sankey/treemap: as appropriate

JSON: {{"requires_chart": bool, "chart_type": "type" or null, "reason": "why"}}"""


def get_title_extraction_prompt(user_prompt: str) -> str:
    """Extract clean title."""
    return f"""Extract professional title from: {user_prompt}

2-8 words, specific, memorable, use power verbs.

JSON: {{"title": "Title Here"}}"""


def get_fallback_content(slide_title: str, slide_type: str, topic: str) -> str:
    """Generate fallback content for a slide."""
    if slide_type == 'title':
        return f"# {slide_title}\n\n{topic}\n\n[Your Name]"

    if slide_type == 'agenda':
        return f"## {slide_title}\n\n• Introduction\n• Key Topics\n• Next Steps"

    if slide_type == 'team':
        return f"## {slide_title}\n\nName: Team Member\nTitle: Role\nDescription: Background and expertise"

    if slide_type == 'transition':
        return f"## {slide_title}"

    if slide_type == 'conclusion':
        return f"## {slide_title}\n\n• Thank you\n• Key takeaways\n• Questions welcome"

    # Content slide
    if 'solution' in slide_title.lower():
        return f"## {slide_title}\n\n• Core approach\n• Key features\n• Benefits"

    return f"## {slide_title}\n\n• Key points\n• Supporting details"


def get_smart_content_guidance(slide_title: str, presentation_title: str, presentation_context: str = "general", visual_density: str = "moderate") -> dict:
    """Provide content generation guidance based on slide context."""
    guidance = {
        "word_count_range": (80, 120),
        "content_style": "punchy",
        "should_include_chart": False,
        "chart_appropriateness": "selective",
        "visual_emphasis": "high",
        "reasoning": "Content-first. Charts only when data adds clarity."
    }

    title_lower = slide_title.lower()

    # Title slides
    if any(w in title_lower for w in ["title", "cover", "welcome"]):
        guidance["word_count_range"] = (5, 20)
        guidance["content_style"] = "minimal"
        guidance["chart_appropriateness"] = "never"
        guidance["reasoning"] = "Title slides are minimal"

    # Conclusions
    elif any(w in title_lower for w in ["conclusion", "thank you", "questions", "contact", "next steps"]):
        guidance["word_count_range"] = (20, 40)
        guidance["content_style"] = "action-oriented"
        guidance["chart_appropriateness"] = "never"
        guidance["reasoning"] = "Focus on takeaways"

    # Agenda
    elif "agenda" in title_lower or "outline" in title_lower:
        guidance["word_count_range"] = (20, 40)
        guidance["content_style"] = "structured"
        guidance["chart_appropriateness"] = "never"
        guidance["reasoning"] = "Navigational slide"

    # Data/metrics slides
    elif any(w in title_lower for w in ["data", "metrics", "analysis", "results", "performance"]):
        guidance["chart_appropriateness"] = "likely"
        guidance["reasoning"] = "Data-focused slides often benefit from visualization"

    return guidance
