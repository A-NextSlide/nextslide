"""
Outline Generation Prompts - CLEAN VERSION

Simple, focused prompts for creating presentation outlines.
"""

from typing import Dict, Any, Optional, List
import json
from datetime import datetime, timezone

STRUCTURED_OUTPUT_HEADER = """

OUTPUT FORMAT - Return JSON with this exact structure:
{
  "content": "• Clean bullet points here\\n• Another bullet with data [1]",
  "chartData": [
    {"name": "Category 1", "value": 123.45},
    {"name": "Category 2", "value": 234.56}
  ],
  "chartType": "bar"
}

⚠️ WHEN TO OMIT chartData (set to null or empty array):
DO NOT include chartData if ANY of these are true:
1. Slide is educational/explanatory (concepts, processes, how-to, tutorials)
2. Slide is narrative/storytelling (history, vision, mission, case studies)
3. Content is qualitative (features, benefits, testimonials, quotes)
4. The deck is not data-driven/analytical/scientific and does not explicitly ask for charts
5. You do not have enough consistent quantitative data to show a meaningful pattern
6. Data points are not comparable (mixed measurement types)
7. The content works better as text/bullets/images

✅ ONLY include chartData if ALL of these are true:
1. The deck is data-driven/analytical/scientific OR explicitly asks for charts
2. Slide's PRIMARY PURPOSE is data/metrics/analytics
3. You have enough quantitative data points in ONE measurement type to show a meaningful pattern
4. The data shows a clear numerical trend/pattern/distribution
5. Visual representation is superior to text for understanding
6. When chartData is used, include as many consistent points as available, scaled to the domain (few for sparse topics, full series for long histories)

CHART TYPE DECISION TREE - Follow this logic (ONLY if you decided to include chartData):

1. Is data over TIME (months/quarters/years)? → "line" or "area"
2. Is data PARTS OF 100% (market share/budget)? → "pie"
3. Is data showing FLOW (funnel/conversion)? → "sankey" or "funnel"
4. Is data SEQUENTIAL CHANGES (+/-/cumulative)? → "waterfall"
5. Is data HIERARCHICAL (parent→child)? → "treemap"
6. Is data comparing MULTIPLE METRICS per item? → "radar"
7. Otherwise (category comparison)? → "bar" or "column"

EXAMPLES OF WHEN TO USE EACH TYPE:

"Market share by company" → PIE (parts of 100%)
"Revenue Q1 through Q4 2024" → LINE (time series)
"Website visitors → signups → paid" → SANKEY (funnel)
"Starting profit $100K + Revenue $50K - Costs $30K" → WATERFALL (sequential)
"Company performance: Speed 8/10, Quality 9/10, Price 6/10" → RADAR (multi-metric)
"Sales by region" → BAR (static category comparison)

📊 COMPONENT CAPABILITIES - Choose based on what you need to communicate:

CHARTS (Chart component):
- Strength: Visualizing numerical data on axes for comparison and pattern recognition
- Requires: Quantitative values in consistent units (all $, all %, all counts)
- Best for: Statistical data from research, metrics, time series, distributions
- Limitation: Cannot effectively show text hierarchies, non-numerical relationships, or qualitative structures

CUSTOM COMPONENTS (CustomComponent):
- Strength: Structured layouts, hierarchies, interactions, qualitative relationships
- Can create: Org trees, timelines, comparison cards, interactive elements, decision flows
- Best for: People/roles, event sequences, before/after, processes, engagement
- Limitation: Not ideal for quantitative data that benefits from axis-based comparison

YOUR TASK: Look at the content you're presenting. Does it need axis-based numerical comparison? Use Chart. Does it need structured layout or qualitative relationships? Use CustomComponent. Let the content guide you.

🚨 CHART DATA RULES (if you choose to use chartData):

⚠️ CRITICAL: SAME MEASUREMENT TYPE REQUIRED ⚠️
ALL data points must represent THE SAME TYPE of measurement.
ONE chart = ONE measurement. Do NOT mix different types of data.

✅ GOOD EXAMPLES (Same Measurement):
1. Revenue chart: [{"name": "Q1", "value": 2500000}, {"name": "Q2", "value": 3100000}, {"name": "Q3", "value": 2800000}]
   - All values are revenue in same unit ($)

2. Growth chart: [{"name": "Jan", "value": 35}, {"name": "Feb", "value": 42}, {"name": "Mar", "value": 28}]
   - All values are growth percentages

3. User count: [{"name": "Week 1", "value": 1200}, {"name": "Week 2", "value": 1800}, {"name": "Week 3", "value": 2300}]
   - All values are user counts

❌ BAD EXAMPLES (Mixed Measurements) - NEVER DO THIS:
1. [{"name": "Years Since Pyramid", "value": 4525}, {"name": "Pyramid Height (feet)", "value": 200}, {"name": "Void Distance (meters)", "value": 1.4}]
   - ❌ WRONG: Mixing years + feet + meters (3 different measurement types!)

2. [{"name": "Establishments", "value": 20000}, {"name": "Growth %", "value": 4.4}, {"name": "Revenue ($M)", "value": 205}]
   - ❌ WRONG: Mixing counts + percentages + dollars (3 different types!)

3. [{"name": "Traffic %", "value": 30}, {"name": "Rent %", "value": 11}, {"name": "Space (sq ft)", "value": 750}, {"name": "Years", "value": 4}]
   - ❌ WRONG: Mixing percentages + area + time (3+ different types!)

4. [{"name": "Revenue", "value": 2500000}, {"name": "Employees", "value": 1200}, {"name": "Growth %", "value": 35}]
   - ❌ WRONG: Mixing dollars + people + percentages (3 different types!)

🔧 SOLUTION FOR MULTI-TYPE DATA:
If you have MULTIPLE measurements (e.g., Revenue AND Growth %), use the "series" field:
✅ [{"name": "Q1", "value": 2500000, "series": "Revenue $M"}, {"name": "Q1", "value": 35, "series": "Growth %"}, ...]
   - This creates a multi-series chart with SEPARATE Y-axes
   - Maximum 2 different measurement types allowed

⚠️ IF YOU CANNOT FIND enough consistent data points in one measurement type to show a clear pattern:
- DO NOT create chartData
- Omit chartData field completely
- Use text/bullets instead

📊 CHART TYPE VARIETY - Don't default to bar/line! Match chart type to data structure:
"""

STRUCTURED_OUTPUT_FOOTER = """

Choose the chart type that best reveals the pattern in your data. Use variety across slides!"""


def _current_date_line() -> str:
    return f"Today (UTC): {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"


def get_flow_requirements(slide_count: Optional[int]) -> str:
    """Get flow requirements based on slide count."""
    if slide_count:
        return "- Coherent narrative from intro to close"
    return "- Coherent narrative"


def get_outline_planning_prompt(user_prompt: str, style_context: Optional[str], detail_level: str, slide_count: Optional[int] = None) -> str:
    """Generate prompt for creating outline plan (slide titles)."""
    if slide_count:
        count_inst = f"Slide count: exactly {slide_count}."
    else:
        count_inst = "Slide count: choose the appropriate number."

    detail_inst = f"Detail level: {detail_level or 'standard'}."
    context_inst = f"Context: {style_context}" if style_context else ""

    return (
        f"{_current_date_line()}\n"
        f"Create a slide outline plan for: {user_prompt}\n"
        f"{count_inst}\n"
        f"{detail_inst}\n"
        f"{context_inst}\n"
        f"Flow: {get_flow_requirements(slide_count)}\n"
        "Include a title slide and a closing slide when appropriate.\n\n"
        "GROUNDING RULES:\n"
        "- Treat the user's prompt and any uploaded-file excerpts as source-of-truth.\n"
        "- Prioritize explicit requirements in the provided context.\n"
        "- Do not introduce unsupported facts, statistics, people, dates, or quotes.\n\n"
        "SLIDE TITLE FORMATTING:\n"
        "- Use Title Case (capitalize first letter of major words)\n"
        "- Keep titles concise (2-6 words ideal)\n"
        "- Make titles engaging and specific, not generic\n"
        "- Use strong nouns and action words\n"
        "- Avoid filler words like 'A', 'The' at the start when possible\n"
        "Examples of GOOD titles: \"The Wit of Mark Twain\", \"Revolutionary Innovations\", \"Key Market Insights\"\n"
        "Examples of BAD titles: \"life and works of someone\", \"introduction to the topic\", \"some key points\"\n\n"
        "Return JSON with fields: {\"slides\": [\"Title\", ...], \"slide_types\": [\"title\", ...]}."
    )


def get_slide_content_prompt(
    slide_title: str,
    slide_type: str,
    user_prompt: str,
    presentation_title: str,
    formatted_slide_title: str,
    context: Optional[Dict[str, Any]] = None,
    chart_type_descriptions: str = ""
) -> str:
    """Generate prompt for slide content - minimal, presentation-ready."""
    _ = formatted_slide_title
    _ = chart_type_descriptions

    lines = [
        _current_date_line(),
        f"Slide: {slide_title}",
        f"Topic: {user_prompt}",
        f"Presentation: {presentation_title}",
    ]

    if context:
        detail = context.get("detail_level")
        if detail:
            lines.append(f"Detail: {detail}")
        pres_context = context.get("context")
        if pres_context:
            lines.append(f"Context: {pres_context}")
        has_data = bool(context.get("processed_files", {}).get("extracted_data"))
        if has_data:
            lines.append("Data available: include a chart suggestion if it clarifies the slide.")

    if slide_type:
        lines.append(f"Slide type: {slide_type}")
    lines.append(
        "Grounding rules: use only facts supported by the provided topic/context/file excerpts. "
        "Do not invent statistics, names, dates, or quotes."
    )
    lines.append(
        "If key details are missing, keep wording high-level instead of fabricating specifics."
    )
    lines.append(
        "Write for a presentation slide — let the content decide density: "
        "data-heavy analysis can be detailed, but most slides should be concise and visual."
    )
    lines.append("Return only slide content text; no extra metadata.")
    return "\n".join(lines)


def build_structured_slide_output_prompt(base_prompt: str, chart_type_descriptions: str) -> str:
    """Append structured-output instructions for Perplexity/sonar."""
    return base_prompt + STRUCTURED_OUTPUT_HEADER + (chart_type_descriptions or "") + STRUCTURED_OUTPUT_FOOTER


def get_chart_type_determination_prompt(slide_content: str, slide_title: str) -> str:
    """Determine chart type for slide."""
    return (
        "Decide if a chart helps this slide.\n"
        f"Title: {slide_title}\n"
        f"Content: {slide_content}\n"
        "Return JSON: {\"requires_chart\": bool, \"chart_type\": \"bar|line|pie|area|scatter\" or null, \"reason\": \"...\"}."
    )


def get_title_extraction_prompt(user_prompt: str) -> str:
    """Extract clean title."""
    return f"""Extract professional title from: {user_prompt}

2-8 words, specific, memorable, use power verbs.

JSON: {{"title": "Title Here"}}"""


def get_fallback_content(slide_title: str, slide_type: str, topic: str) -> str:
    """Generate fallback content for a slide."""
    _ = slide_type
    return f"## {slide_title}\n\n• {topic}\n• Key points"


def get_smart_content_guidance(slide_title: str, presentation_title: str, presentation_context: str = "general", visual_density: str = "moderate") -> dict:
    """Provide content generation guidance based on slide context."""
    _ = slide_title
    _ = presentation_title
    _ = presentation_context

    density = (visual_density or "moderate").lower()
    ranges = {
        "minimal": (20, 40),
        "moderate": (40, 80),
        "rich": (80, 120),
        "data-heavy": (80, 140),
    }
    word_count_range = ranges.get(density, (40, 80))

    return {
        "word_count_range": word_count_range,
        "content_style": "concise",
        "should_include_chart": False,
        "chart_appropriateness": "model_decides",
        "visual_emphasis": "high",
        "reasoning": "Keep content clear and visual-first.",
    }
