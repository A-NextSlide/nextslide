"""Slide content generation module"""

import asyncio
import uuid
import re
import json
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel

from agents.ai.clients import get_client, invoke, get_max_tokens_for_model
from agents.prompts.generation.outline_prompts import (
    get_slide_content_prompt,
    get_fallback_content,
    get_smart_content_guidance
)
from .models import SlideContent, OutlineOptions, ChartData, TypedSlideResponse, StructuredSlideOutput
from .chart_generator import ChartGenerator
from setup_logging_optimized import get_logger
from agents import config as agents_config

logger = get_logger(__name__)


def extract_image_prompt_from_content(content: str) -> Tuple[str, Optional[str]]:
    """
    Extract [IMAGE: ...] tag from content and return cleaned content and extracted prompt.
    
    Args:
        content: The slide content potentially containing [IMAGE: ...] tags
        
    Returns:
        Tuple of (cleaned_content, image_prompt)
    """
    # Match [IMAGE: ...] with case insensitive
    pattern = r'\[IMAGE:\s*([^\]]+)\]'
    match = re.search(pattern, content, re.IGNORECASE)
    
    if match:
        image_prompt = match.group(1).strip()
        # Remove the [IMAGE: ...] tag from content
        cleaned_content = re.sub(pattern, '', content, flags=re.IGNORECASE).strip()
        # Clean up any extra newlines that might be left
        cleaned_content = re.sub(r'\n{3,}', '\n\n', cleaned_content)
        logger.info(f"[IMAGE EXTRACT] Extracted image prompt: '{image_prompt}'")
        return cleaned_content, image_prompt
    
    return content, None


def extract_citations_from_content(content: str) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """
    Extract citations from content that has [1], [2], [3] markers and a SOURCES section.
    
    Args:
        content: The slide content potentially containing citation markers and sources
        
    Returns:
        Tuple of (citations_list, marker_to_index_map)
    """
    citations = []
    marker_map = {}
    
    # Check if content has citation markers like [1], [2], [3]
    citation_markers = set(re.findall(r'\[(\d+)\]', content))
    if not citation_markers:
        return citations, marker_map
    
    # Look for SOURCES section in content
    sources_match = re.search(r'(?:^|\n)SOURCES?:\s*\n((?:.+\n?)+)', content, re.IGNORECASE | re.MULTILINE)
    
    if sources_match:
        sources_text = sources_match.group(1)
        lines = sources_text.strip().split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Try to match pattern: [1] Title - URL or 1. Title - URL
            numbered_match = re.match(r'[\[\(]?(\d+)[\]\)]?\.?\s+(.+)', line)
            if numbered_match:
                index = int(numbered_match.group(1))
                rest = numbered_match.group(2).strip()
                
                # Try to extract URL
                url_match = re.search(r'https?://[^\s]+', rest)
                url = url_match.group(0) if url_match else None
                
                # Title is everything before the URL (or everything if no URL)
                if url:
                    title = rest[:url_match.start()].strip().rstrip('-–—:')
                else:
                    title = rest
                
                citations.append({
                    "title": title,
                    "url": url or "",
                    "source": title
                })
                marker_map[str(index)] = index
        
        logger.info(f"[CITATION EXTRACT] Found {len(citations)} citations from SOURCES section")
    
    # If no SOURCES section but has markers, create placeholder citations
    elif citation_markers:
        # Create placeholder citations for the markers found
        sorted_markers = sorted([int(m) for m in citation_markers])
        for idx, marker_num in enumerate(sorted_markers, 1):
            citations.append({
                "title": f"Source {marker_num}",
                "url": "",
                "source": f"Source {marker_num}"
            })
            marker_map[str(marker_num)] = idx
        
        logger.warning(f"[CITATION EXTRACT] Found {len(citation_markers)} citation markers but no SOURCES section")
    
    return citations, marker_map

# ===== CONSTANTS =====
# Title slide constraints (ALWAYS ENFORCED - NEVER OVERRIDE REGARDLESS OF MODE!)
# Title slides must be clean hero slides in ALL modes (detailed, standard, quick)
TITLE_SLIDE_MAX_WORDS = 30
TITLE_SLIDE_MAX_LINES = 4
TITLE_FIRST_LINE_MAX_WORDS = 15

# Token limits (mode-aware)
SLIDE_MAX_TOKENS_MULTIPLIER = 0.5
DETAILED_MODE_MAX_TOKENS_CAP = None  # No cap for detailed mode - unlimited!
PRESENTATION_MODE_MAX_TOKENS_CAP = 8000  # Reasonable cap for presentation mode
SIMPLE_SLIDE_MAX_TOKENS = 4000  # For simple/Gemini paths

# Content formatting (mode-aware)
DETAILED_MODE_MAX_BULLET_WORDS = 60  # Comprehensive bullets with full context
PRESENTATION_MODE_MAX_BULLET_WORDS = 50  # Hero content with supporting text (increased from 20)
MAX_LINE_LENGTH = 180  # Increased to allow for hero statements
SENTENCE_SPLIT_THRESHOLD = 250  # Increased to support longer supporting text

# Chart decision thresholds
MIN_SLIDES_FOR_CHARTS = 3
MIN_NARRATIVE_SLIDES_FOR_CHARTS = 5

# Narrative topic keywords (extended to include personal/creative indicators)
NARRATIVE_KEYWORDS = [
    'biography', 'biographical', 'historical', 'history',
    'story', 'timeline of life', 'about', 'who is', 'early life',
    # 🎉 Personal/creative indicators
    'birthday', 'party', 'celebration', 'silly', 'fun', 'pikachu',
    'pokemon', 'mario', 'disney', 'cartoon', 'hobby', 'personal',
    'slideshow for', 'vacation', 'travel', 'pet', 'recipe'
]


def _is_narrative_topic(prompt: str, slide_title: str) -> bool:
    """Check if the topic is narrative/biographical/personal (not suited for heavy chart usage)."""
    prompt_lower = (prompt or '').lower()
    title_lower = (slide_title or '').lower()

    return (
        any(keyword in prompt_lower for keyword in ['biography', 'historical', 'history', 'birthday', 'party', 'silly', 'pikachu', 'pokemon', 'hobby', 'personal']) or
        any(keyword in title_lower for keyword in NARRATIVE_KEYWORDS)
    )


class SlideGenerator:
    """Handles individual slide content generation"""

    def __init__(self, chart_generator: ChartGenerator):
        self.chart_generator = chart_generator
    
    async def generate_slides_with_charts(
        self,
        outline_plan: Dict[str, Any],
        options: OutlineOptions,
        progress_callback=None,
        processed_files=None
    ) -> List[SlideContent]:
        """Generate slide content with charts inline (parallelized)."""
        
        model = self._get_model("content", options)
        client, model_name = get_client(model)

        # Get model's max token capability
        model_max_tokens = get_max_tokens_for_model(model)

        # Mode-aware token limits: NO LIMITS for detailed mode, reasonable caps for presentation
        if options.detail_level == "detailed":
            # DETAILED MODE: Truly unlimited - use model's full capability
            slide_max_tokens = int(model_max_tokens * SLIDE_MAX_TOKENS_MULTIPLIER)
            logger.info(f"Using UNLIMITED tokens ({slide_max_tokens}) for detailed mode with {model}")
        else:
            # PRESENTATION MODE: Capped for concise, punchy content
            slide_max_tokens = min(int(model_max_tokens * SLIDE_MAX_TOKENS_MULTIPLIER), PRESENTATION_MODE_MAX_TOKENS_CAP)
            logger.info(f"Using capped tokens ({slide_max_tokens}) for presentation mode with {model}")
        
        total_slides = len(outline_plan["slides"])
        slide_types = outline_plan.get("slide_types", ["content"] * total_slides)
        presentation_context = outline_plan.get("context", "business")
        
        # Concurrency controls
        max_parallel = max(1, int(getattr(agents_config, "MAX_PARALLEL_SLIDES", 4)))
        delay_between = float(getattr(agents_config, "DELAY_BETWEEN_SLIDES", 0.0))
        semaphore = asyncio.Semaphore(max_parallel)
        
        results: List[Optional[SlideContent]] = [None] * total_slides
        
        async def generate_one(index: int) -> None:
            slide_title = outline_plan["slides"][index]
            slide_type = slide_types[index]
            
            # Handle dict slide titles
            if isinstance(slide_title, dict):
                logger.warning(f"Slide {index+1} title is dict: {slide_title}")
                actual_title = slide_title.get('title', str(slide_title))
            else:
                actual_title = slide_title
            
            # Minimal, static context sufficient for parallel generation
            context: Dict[str, Any] = {
                'is_continuation': False,
                'previous_slides': [],
                'used_charts': [],
                'part_number': None,
                'presentation_context': presentation_context,
                'detail_level': options.detail_level,  # Pass through detail level for mode differentiation
                'total_slides': total_slides,
                'slide_index': index
            }

            # If the outline provided a structured title slide, surface its elements
            try:
                if isinstance(slide_title, dict):
                    elements = slide_title.get('elements') or []
                    title_elements: List[str] = []
                    title_outline_texts: List[str] = []
                    if isinstance(elements, list):
                        for el in elements:
                            if isinstance(el, dict):
                                el_type = el.get('type')
                                if isinstance(el_type, str):
                                    title_elements.append(el_type)
                                text_val = el.get('text')
                                if isinstance(text_val, str) and text_val.strip():
                                    title_outline_texts.append(text_val.strip())
                    context['title_elements'] = title_elements
                    context['title_outline_texts'] = title_outline_texts
                    context['outline_title_struct'] = slide_title
            except Exception as e:
                logger.debug(f"Failed extracting title elements for slide {index+1}: {e}")
            
            if processed_files:
                context['processed_files'] = processed_files
                # If PPTX outlines are present, try to ground slide content from the matching PPTX slide
                try:
                    pptx_outlines = (processed_files or {}).get('pptx_outlines') or []
                    if pptx_outlines:
                        # Heuristic: use first uploaded PPTX, map by index
                        ppt = pptx_outlines[0]
                        slides_meta = ppt.get('slides', [])
                        if 0 <= index < len(slides_meta):
                            pptx_slide = slides_meta[index]
                            context['pptx_source'] = {
                                'title': pptx_slide.get('title', ''),
                                'text': pptx_slide.get('text', ''),
                                'notes': pptx_slide.get('notes', '')
                            }
                except Exception:
                    pass
                try:
                    self._add_file_suggestions_to_context(context, processed_files, slide_type, actual_title)
                except Exception as e:
                    logger.warning(f"Failed adding file suggestions for slide {index+1}: {e}")
                # Add web research citations if available - ONLY when content is HIGHLY relevant
                try:
                    findings = (processed_files or {}).get("web_research_findings") or []
                    if findings:
                        title_l = (actual_title or "").lower()
                        scored = []
                        for f in findings:
                            text = ((f.get('title') or '') + ' ' + (f.get('summary') or '')).lower()
                            # Count matching words (>3 chars, excluding common words)
                            common_words = {'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'about'}
                            score = sum(1 for w in title_l.split() if w and len(w) > 3 and w not in common_words and w in text)
                            scored.append((score, f))
                        scored.sort(key=lambda x: x[0], reverse=True)

                        # STRICT MATCHING: Require minimum score threshold based on slide type
                        # Quote/stat slides: need high relevance (score >= 2), max 1-2 sources
                        # Content slides: moderate relevance (score >= 2), max 2-3 sources
                        min_score = 2  # Require at least 2 meaningful word matches
                        if slide_type.lower() in ['quote', 'stat', 'transition']:
                            max_sources = 1  # Quotes/stats should cite ONE primary source
                        elif slide_type.lower() in ['content', 'data']:
                            max_sources = 3  # Content slides can have up to 3 sources
                        else:
                            max_sources = 2  # Default: max 2 sources

                        matched = [f for s, f in scored if s >= min_score][:max_sources]
                        # DO NOT add sources if no strong matches - we're citing sources, not showing search results
                        if matched:
                            context['web_citations'] = [
                                {'title': f.get('title'), 'url': f.get('url'), 'source': f.get('source')}
                                for f in matched if isinstance(f, dict)
                            ]
                except Exception:
                    pass
            
            if progress_callback:
                try:
                    await self._call_progress(progress_callback, index, total_slides, slide_type)
                except Exception as e:
                    logger.debug(f"Progress callback failed for slide {index+1}: {e}")
            
            async with semaphore:
                try:
                    slide = await self._generate_single_slide(
                        actual_title,
                        slide_type,
                        options,
                        outline_plan["title"],
                        presentation_context,
                        context,
                        client,
                        model_name,
                        slide_max_tokens
                    )
                except Exception as e:
                    logger.error(f"Failed to generate slide '{actual_title}': {e}")
                    fallback_content = self._create_fallback_content(actual_title, slide_type, outline_plan["title"])
                    cleaned_fallback_content, fallback_image_prompt = extract_image_prompt_from_content(fallback_content)
                    slide = SlideContent(
                        id=str(uuid.uuid4()),
                        title=actual_title,
                        content=cleaned_fallback_content,
                        slide_type=slide_type,
                        suggestedImagePrompt=fallback_image_prompt
                    )
            
            results[index] = slide
            logger.info(f"Slide {index+1}/{total_slides} completed: '{slide.title}'")
        
        # Schedule tasks with optional pacing
        tasks = []
        for i in range(total_slides):
            tasks.append(asyncio.create_task(generate_one(i)))
            if delay_between:
                # brief delay between scheduling to avoid sudden bursts
                await asyncio.sleep(delay_between)
        
        # Await all tasks
        await asyncio.gather(*tasks)
        
        # results list is ordered by index
        return [slide for slide in results if slide is not None]
    
    async def generate_slide_simple(
        self,
        slide_title: str,
        slide_type: str,
        options: OutlineOptions,
        presentation_title: str,
        presentation_context: str = "business",
        context: Optional[Dict[str, Any]] = None
    ) -> SlideContent:
        """Generate a single slide with simple approach (for Gemini)"""
        
        # Get smart content guidance (respect visual_density if present)
        visual_density = (context or {}).get('visual_density', 'moderate') if isinstance(context, dict) else 'moderate'
        guidance = get_smart_content_guidance(
            slide_title,
            presentation_title,
            presentation_context,
            visual_density
        )
        # Global guardrails used later for chart decisions
        try:
            total_slides_guard = int((context or {}).get('total_slides', 0))
        except Exception:
            total_slides_guard = 0
        is_narrative_topic = _is_narrative_topic(options.prompt, slide_title)
        
        # Add extracted data to prompt if available
        data_context = ""
        
        # Check if the prompt already contains extracted data (from file_context)
        if "EXTRACTED DATA:" in options.prompt:
            data_context = "\n\n🚨 CRITICAL: USE THE EXACT DATA FROM THE UPLOADED FILES SHOWN BELOW:\n"
            data_context += "\n⚠️ The data has already been extracted and is shown in the prompt above."
            data_context += "\n📌 Look for the 'EXTRACTED DATA:' section and use those EXACT values!"
            
            # Add specific instructions for different slide types
            if any(word in slide_title.lower() for word in ['portfolio', 'holdings', 'allocation', 'position']):
                data_context += "\n\n🔴 THIS IS A PORTFOLIO SLIDE - YOU MUST MENTION THE EXACT HOLDINGS!"
                data_context += "\n❌ DO NOT say 'significant portion' or 'substantial holdings'"
                data_context += "\n✅ DO say the EXACT numbers: shares and dollar value from the extracted data"
            
            if any(word in slide_title.lower() for word in ['price', 'trend', 'chart', 'movement']):
                data_context += "\n\n📈 THIS IS A PRICE/TREND SLIDE - USE THE EXACT PRICE DATA!"
                data_context += "\n❌ DO NOT use placeholders like '[Insert Opening Price]'"
                data_context += "\n✅ DO use the actual prices and dates from the extracted data"
                data_context += "\n💡 Example: 'The stock opened at $188.19 on July 15' (using real data)"
        
        # Build sources block if citations are present
        sources_block = ""
        if isinstance(context, dict) and context.get('web_citations'):
            try:
                sources_block += "\n\nWEB SOURCES AVAILABLE (USE ONLY IF CONTENT REFERENCES THEM):"
                for idx, c in enumerate(context['web_citations'], start=1):
                    src = (c.get('source') or '').strip()
                    url = (c.get('url') or '').strip()
                    title = (c.get('title') or '').strip()
                    sources_block += f"\n[{idx}] {title or src or 'Source'}"
                    if url:
                        sources_block += f" - {url}"
                sources_block += (
                    "\n\nCITATION INSTRUCTIONS:"
                    "\n• ONLY use these sources if you actually reference their facts/data in the slide content"
                    "\n• When you use information from these sources, cite them in your content"
                    "\n• If the slide content is general knowledge or doesn't use these sources, DO NOT include any citations"
                    "\n• This is NOT a search results page - sources are for attribution only when relevant"
                    "\n\nNote: These sources are available for reference. The slide design will handle citation formatting automatically."
                )
            except Exception:
                sources_block = ""

        # Use the enhanced slide content prompt that respects detail_level
        from agents.prompts.generation.outline_prompts import get_slide_content_prompt
        
        # Get chart type descriptions for the prompt
        chart_descriptions = self.chart_generator.get_chart_descriptions() if hasattr(self.chart_generator, 'get_chart_descriptions') else ""
        
        # Create comprehensive prompt using our enhanced function
        prompt = get_slide_content_prompt(
            slide_title=slide_title,
            slide_type=slide_type,
            user_prompt=options.prompt,
            presentation_title=presentation_title,
            formatted_slide_title=slide_title,
            context=context,
            chart_type_descriptions=chart_descriptions
        )

        model = self._get_model("content", options)
        client, model_name = get_client(model)
        
        # Use structured outputs for Perplexity to get clean chart data
        use_structured = model_name.startswith('perplexity-') or 'sonar' in model_name
        
        try:
            if use_structured:
                # Request structured JSON with chartData from Perplexity
                structured_prompt = prompt + """

OUTPUT FORMAT - Return JSON with this exact structure:
{
  "content": "• Clean bullet points here\\n• Another bullet with data [1]",
  "chartData": [
    {"name": "Category 1", "value": 123.45},
    {"name": "Category 2", "value": 234.56}
  ],
  "chartType": "bar"
}

CHART TYPE DECISION TREE - Follow this logic:

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

UNIT CONSISTENCY IS MANDATORY:
ALL values must use the EXACT SAME measurement unit.

✅ GOOD (Same Unit):
- All revenue: 2.5M, 3.1M, 2.8M, 4.2M, 3.9M (all millions of dollars)
- All growth: 35%, 42%, 28%, 51%, 19% (all percentages)
- All users: 1200, 1800, 2300, 2900, 3400 (all user counts)

❌ BAD (Mixed Units):
- Establishments 20000, Growth 4.4%, Revenue 205, Locations 500
- Traffic 30%, Rent 11%, Space 750, Years 4
- Revenue 2.5M, Growth 35%, Users 1200

For 2 different units, use series field:
✅ [{"name": "Q1", "value": 2500000, "series": "Revenue $M"}, {"name": "Q1", "value": 35, "series": "Growth %"}]

Otherwise: If you CANNOT find 5+ data points in ONE UNIT, omit chartData completely.

📊 CHART TYPE VARIETY - Don't default to bar/line! Match chart type to data structure:
""" + chart_descriptions + """

Choose the chart type that best reveals the pattern in your data. Use variety across slides!"""

                result = invoke(
                    client=client,
                    model=model_name,
                    messages=[{"role": "user", "content": structured_prompt}],
                    response_model=StructuredSlideOutput,
                    max_tokens=SIMPLE_SLIDE_MAX_TOKENS,
                    temperature=0.7,
                    extra_body={
                        "return_citations": True,
                        "search_recency_filter": "week",
                        "num_search_results": 5
                    }
                )
                
                # Handle dict return (with citations)
                model_obj = result
                slide_citations = []
                if isinstance(result, dict):
                    # invoke returned {"model": model_obj, "citations": [...]}
                    model_obj = result.get("model", result)
                    slide_citations = result.get("citations", [])
                    logger.info(f"[STRUCTURED] Got {len(slide_citations)} citations from wrapper")
                
                # Extract structured data from model
                content = model_obj.content if hasattr(model_obj, 'content') else str(model_obj)
                chart_data_from_api = model_obj.chartData if hasattr(model_obj, 'chartData') else None
                chart_type_from_api = model_obj.chartType if hasattr(model_obj, 'chartType') else None
                
                logger.info(f"[STRUCTURED] Got structured output, chartData: {len(chart_data_from_api) if chart_data_from_api else 0} points")
                
                # Add citations to context
                if slide_citations and context:
                    context['web_citations'] = slide_citations
                
            else:
                # Non-Perplexity models: use old approach
                result = invoke(
                    client=client,
                    model=model_name,
                    messages=[{"role": "user", "content": prompt}],
                    response_model=None,
                    max_tokens=SIMPLE_SLIDE_MAX_TOKENS,
                    temperature=0.7
                )
                
                content = result
                chart_data_from_api = None
                chart_type_from_api = None
                slide_citations = []
            
            # Citations already handled above for structured path
            # For non-structured path, they would come here but we already processed them

            # Ensure proper formatting (with strict validation for title slides)
            if slide_type == 'title':
                # CRITICAL: Title slides are ALWAYS limited to 30 words, even in detailed mode
                logger.info(f"[TITLE VALIDATION] Validating title slide (mode: {options.detail_level})")
                content = self._validate_title_slide_content(content, max_words=TITLE_SLIDE_MAX_WORDS)
            else:
                content = self._ensure_proper_formatting(content)
            
            # Check for placeholders and fix if found
            if self._contains_placeholders(content) and slide_type != 'title':
                logger.warning(f"Placeholders detected in slide '{slide_title}', attempting to fix...")
                content = self._remove_placeholders_with_defaults(content, context)
                
                # If still has placeholders, try again with stricter prompt
                if self._contains_placeholders(content):
                    strict_prompt = prompt + "\n\nIMPORTANT: Use REAL numbers, not placeholders like [insert value]!"
                    
                    retry_content = invoke(
                        client=client,
                        model=model_name,
                        messages=[{"role": "user", "content": strict_prompt}],
                        response_model=None,
                        max_tokens=SIMPLE_SLIDE_MAX_TOKENS,
                        temperature=0.5
                    )
                    
                    content = self._ensure_proper_formatting(retry_content)
                    
                    # Final cleanup
                    if self._contains_placeholders(content):
                        content = self._remove_placeholders_with_defaults(content, context)
            
            # Use structured chart data if available (from Perplexity)
            chart_data = None
            extracted_data = None
            
            if chart_data_from_api and chart_type_from_api and len(chart_data_from_api) >= 5:
                # We have clean structured chart data from Perplexity!
                logger.info(f"[STRUCTURED CHART] Using {len(chart_data_from_api)} data points from Perplexity")
                
                try:
                    # VALIDATE UNIT CONSISTENCY BEFORE creating chart
                    if not self.chart_generator._validate_unit_consistency(chart_data_from_api):
                        logger.warning(f"[STRUCTURED CHART] REJECTED - Mixed units detected in chart data for '{slide_title}'")
                        logger.warning(f"[STRUCTURED CHART] Data points: {[p.get('name', '') for p in chart_data_from_api[:5]]}")
                        chart_data = None
                        extracted_data = None
                    else:
                        # Convert to ChartData model
                        chart_data = ChartData(
                            chart_type=chart_type_from_api,
                            data=chart_data_from_api,
                            title=slide_title,
                            metadata=None
                        )
                        
                        # Convert to frontend extractedData format
                        extracted_data = self.chart_generator.convert_chart_data_to_extracted_data(
                            chart_data,
                            slide_title
                        )
                        
                        if extracted_data:
                            logger.info(f"[STRUCTURED CHART] ✓ VALIDATED & Created {chart_type_from_api} chart with {len(chart_data_from_api)} points")
                        else:
                            logger.warning(f"[STRUCTURED CHART] Chart validation failed, skipping")
                            chart_data = None
                        
                except Exception as e:
                    logger.warning(f"[STRUCTURED CHART] Failed to create chart: {e}")
                    chart_data = None
                    extracted_data = None
            else:
                logger.info(f"[CHART] No structured chart data from API (had {len(chart_data_from_api) if chart_data_from_api else 0} points, need 5+)")
            
            # Build citations metadata and footer if available
            slide_citations = context.get('web_citations') if isinstance(context, dict) else None
            
            # If no web_citations but content has [1], [2], [3] markers, try to extract citations from content
            if not slide_citations or len(slide_citations) == 0:
                extracted_citations, marker_map = extract_citations_from_content(content)
                if extracted_citations:
                    slide_citations = extracted_citations
                    logger.info(f"[SIMPLE SLIDE] Extracted {len(extracted_citations)} citations from content for '{slide_title}'")
            
            # Create footnotes for citation panel
            footnotes = []
            if slide_citations and isinstance(slide_citations, list):
                for i, citation in enumerate(slide_citations):
                    # Handle both dict citations and malformed ones
                    if isinstance(citation, dict):
                        footnotes.append({
                            "index": i + 1,
                            "label": citation.get("title", citation.get("source", "Unknown Source")),
                            "url": citation.get("url", "")
                        })
                    elif isinstance(citation, str):
                        # If citation is just a string
                        footnotes.append({
                            "index": i + 1,
                            "label": citation,
                            "url": ""
                        })
                if footnotes:
                    logger.info(f"[SIMPLE SLIDE] Created {len(footnotes)} footnotes for '{slide_title}'")
            
            # Add citations to extractedData if no chart
            if slide_citations and not extracted_data:
                extracted_data = {
                    "chartType": "annotations",
                    "data": [],
                    "title": slide_title,
                    "metadata": {"citations": slide_citations, "footnotes": footnotes}
                }

            # Extract [IMAGE: ...] tag if present
            cleaned_content, image_prompt = extract_image_prompt_from_content(content)
            
            # Clean up any metadata headers
            import re
            cleaned_content = re.sub(r'^Slide\s+\d+:\s*[^\n]+\n*', '', cleaned_content, flags=re.IGNORECASE)
            cleaned_content = re.sub(r'[\s\n]*---[\s\n]*(?:SPEAKABLE CONTENT|SPEAKER NOTES?|SPEAKING NOTES?):[\s\S]*?(?=\n---|$)', '', cleaned_content, flags=re.IGNORECASE)
            cleaned_content = re.sub(r'[\s\n]*---[\s\n]*CITATIONS?:[\s\S]*$', '', cleaned_content, flags=re.IGNORECASE)
            cleaned_content = cleaned_content.strip()

            return SlideContent(
                id=str(uuid.uuid4()),
                title=slide_title,
                content=cleaned_content,
                slide_type=slide_type,
                chart_data=chart_data,
                extractedData=extracted_data,
                citations=slide_citations or [],
                footnotes=footnotes,
                research_notes=("Citations available" if slide_citations else None),
                comparison=self._maybe_build_comparison(slide_title, content),
                suggestedImagePrompt=image_prompt
            )
            
        except Exception as e:
            logger.error(f"Failed to generate slide '{slide_title}': {e}")
            fallback_content = self._create_fallback_content(slide_title, slide_type, presentation_title)
            cleaned_fallback_content, fallback_image_prompt = extract_image_prompt_from_content(fallback_content)
            return SlideContent(
                id=str(uuid.uuid4()),
                title=slide_title,
                content=cleaned_fallback_content,
                slide_type=slide_type,
                suggestedImagePrompt=fallback_image_prompt
            )
    
    def _build_slide_context(
        self,
        current_title: str,
        slides: List[SlideContent],
        previous_content: List[Dict],
        used_charts: List[Dict],
        presentation_context: str = "business"
    ) -> Dict[str, Any]:
        """Build context from previous slides for narrative continuity"""
        context = {
            'is_continuation': False,
            'previous_slides': [],
            'used_charts': used_charts,
            'part_number': None,
            'presentation_context': presentation_context
        }
        
        # Handle dict titles
        if isinstance(current_title, dict):
            logger.warning(f"Slide title is a dict: {current_title}")
            current_title = current_title.get('title', str(current_title))
        
        # Ensure current_title is a string
        current_title = str(current_title)
        
        # Check if this is a multi-part slide
        part_match = re.search(r'Part (\d+)', current_title, re.IGNORECASE)
        if part_match:
            context['is_continuation'] = True
            context['part_number'] = int(part_match.group(1))
            
            # Find related previous parts
            base_title = re.sub(r' - Part \d+.*', '', current_title)
            for prev in previous_content:
                if base_title in prev['title']:
                    context['previous_slides'].append(prev)
        
        # For any content slide, include last 2 slides for flow
        elif len(previous_content) > 0:
            context['previous_slides'] = previous_content[-2:]
        
        return context
    
    def _add_file_suggestions_to_context(
        self,
        context: Dict[str, Any],
        processed_files: Dict[str, Any],
        slide_type: str,
        slide_title: str
    ) -> None:
        """Add file suggestions to context"""
        context['suggested_images'] = []
        context['suggested_data'] = []
        
        # Ensure slide_title is a string
        if isinstance(slide_title, dict):
            slide_title = slide_title.get('title', str(slide_title))
        slide_title = str(slide_title)

        # Build broad-but-specific search terms for external image search
        try:
            context['image_search_terms'] = self._build_image_search_terms(slide_title, slide_type, context)
        except Exception:
            context['image_search_terms'] = slide_title[:60]
        
        # Check images
        for img in processed_files.get('images', []):
            if img['category'] != 'rejected':
                if slide_type in img.get('suggested_slides', []) or 'all' in img.get('suggested_slides', []):
                    img_copy = dict(img)
                    # Attach per-image search query hint
                    img_copy['search_query'] = self._refine_query_with_interpretation(
                        context.get('image_search_terms', ''), img.get('interpretation', '')
                    )
                    context['suggested_images'].append(img_copy)
                else:
                    # Match against slide title tokens in a more lenient way
                    interp = str(img.get('interpretation', ''))
                    title_l = slide_title.lower()
                    tokens = [t for t in re.findall(r"[A-Za-z][A-Za-z\-']+", interp) if len(t) >= 3]
                    if any(t.lower() in title_l for t in tokens):
                        img_copy = dict(img)
                        img_copy['search_query'] = self._refine_query_with_interpretation(
                            context.get('image_search_terms', ''), interp
                        )
                        context['suggested_images'].append(img_copy)
        
        # Check data files
        for data_file in processed_files.get('data_files', []):
            if any(word in slide_title.lower() for word in ['data', 'chart', 'analysis', 'results', 'metrics']):
                context['suggested_data'].append(data_file)

    def _build_image_search_terms(self, slide_title: str, slide_type: str, context: Dict[str, Any]) -> str:
        """Create concise, high-signal search terms for image providers.

        Uses slide title plus optional PPTX text/notes, filters stopwords and numbers,
        and adds a broad type modifier (e.g., background, analytics concept).
        """
        # Gather source text
        extra_text = ''
        try:
            pptx = context.get('pptx_source') or {}
            extra_text = f" {pptx.get('text','')} {pptx.get('notes','')}"
        except Exception:
            extra_text = ''
        text = f"{slide_title or ''}{extra_text}"
        # Tokenize
        words = re.findall(r"[A-Za-z][A-Za-z\-']+", text)
        stop_words = {
            'the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','are','was','were',
            'been','being','have','has','had','do','does','did','will','would','could','should','may','might','must',
            'can','this','that','these','those','it','as','from','about','into','through','during','before','after',
            'above','below','between','under','over','please','make','apply','using','use','create','new','component',
            'replace','original','request','slide','context','maintaining','appropriate','style','styled','effect','effects',
            'section','chapter','overview','introduction','summary','agenda','goal','goals','objective','objectives'
        }
        generic = {'image','photo','picture','graphic','visual','data','information'}
        candidates: list[str] = []
        for w in words:
            wl = w.lower()
            if wl in stop_words or wl in generic:
                continue
            if any(ch.isdigit() for ch in wl):
                continue
            if len(wl) < 3:
                continue
            if wl not in candidates:
                candidates.append(wl)
        base_tokens = candidates[:4] if len(candidates) >= 3 else candidates[:3]
        st = (slide_type or '').lower()
        type_mod = ''
        if st in {'title','closing','summary','transition','divider'}:
            type_mod = 'background'
        elif st in {'data','chart','keymetrics'}:
            type_mod = 'analytics concept'
        elif st in {'team','about'} or any(k in (slide_title or '').lower() for k in ['team','about us','who we are']):
            type_mod = 'office teamwork'
        query = ' '.join(base_tokens[:3])
        if type_mod and type_mod not in query:
            query = f"{query} {type_mod}".strip()
        if len(query) > 60:
            query = query[:60]
        return query or (slide_title[:60] if slide_title else 'presentation background')

    def _refine_query_with_interpretation(self, base_query: str, interpretation: str) -> str:
        """Lightly refine a base query with 1–2 tokens from interpretation."""
        try:
            tokens = re.findall(r"[A-Za-z][A-Za-z\-']+", str(interpretation))
            stop = {'the','a','an','and','or','in','on','at','for','of','with','by','is','are','was','were'}
            generic = {'image','photo','picture','graphic','visual','background'}
            keep: list[str] = []
            for t in tokens:
                tl = t.lower()
                if tl in stop or tl in generic:
                    continue
                if any(ch.isdigit() for ch in tl):
                    continue
                if len(tl) < 3:
                    continue
                if tl not in keep:
                    keep.append(tl)
                if len(keep) >= 2:
                    break
            refined = base_query.strip()
            for t in keep:
                if t not in refined:
                    refined = f"{refined} {t}".strip()
            return refined[:70]
        except Exception:
            return base_query[:70]
    
    async def _generate_single_slide(
        self,
        slide_title: str,
        slide_type: str,
        options: OutlineOptions,
        presentation_title: str,
        presentation_context: str,
        context: Dict[str, Any],
        client,
        model_name: str,
        max_tokens: int
    ) -> SlideContent:
        """Generate a single slide with structured output"""
        
        try:
            # Check if using Gemini or Perplexity - use simpler approach
            if "gemini" in model_name.lower() or "sonar" in model_name.lower() or "perplexity" in model_name.lower():
                return await self.generate_slide_simple(
                    slide_title, slide_type, options,
                    presentation_title, presentation_context, context
                )
            
            # Create prompt
            prompt = self._create_slide_prompt(
                slide_title, slide_type, options, presentation_title, context
            )
            
            # Get available chart types
            available_chart_types = self.chart_generator.chart_types or ["pie", "line", "bar", "scatter"]
            
            # Generate with structured output
            temperature = 0.7 if not self._requires_default_temperature(model_name) else 1.0
            
            response = invoke(
                client=client,
                model=model_name,
                messages=[{"role": "user", "content": prompt}],
                response_model=TypedSlideResponse,
                max_tokens=max_tokens,
                temperature=temperature
            )
            
            # Process response (with strict validation for title slides)
            if slide_type == 'title':
                # CRITICAL: Title slides are ALWAYS limited to 30 words, even in detailed mode
                logger.info(f"[TITLE VALIDATION] Validating title slide (mode: {options.detail_level})")
                content = self._validate_title_slide_content(response.content, max_words=TITLE_SLIDE_MAX_WORDS)
            elif slide_type in ['stat', 'quote', 'divider', 'transition']:
                content = response.content.strip()
            else:
                content = self._ensure_proper_formatting(response.content)
            
            # Check for placeholders and retry if found
            if self._contains_placeholders(content) and slide_type != 'title':
                logger.warning(f"Placeholders detected in slide '{slide_title}', attempting to fix...")
                
                # First try: Remove placeholders with defaults from extracted data
                content = self._remove_placeholders_with_defaults(content, context)
                
                # If still has placeholders, retry generation with more forceful prompt
                if self._contains_placeholders(content):
                    logger.warning(f"Still has placeholders after replacement, retrying generation...")
                    
                    # Add more forceful instruction to prompt
                    forceful_prompt = prompt + "\n\n⚠️ CRITICAL: Your previous response contained placeholders. This is NOT acceptable. Use ONLY real data from the extracted information above. NO BRACKETS, NO 'INSERT', NO 'SPECIFIC' without actual values!"
                    
                    retry_response = invoke(
                        client=client,
                        model=model_name,
                        messages=[{"role": "user", "content": forceful_prompt}],
                        response_model=TypedSlideResponse,
                        max_tokens=max_tokens,
                        temperature=0.5  # Lower temperature for more deterministic output
                    )
                    
                    content = self._ensure_proper_formatting(retry_response.content)
                    response = retry_response  # Update response to use retry data
                    
                    # Final fallback: forcefully remove any remaining placeholders
                    if self._contains_placeholders(content):
                        content = self._remove_placeholders_with_defaults(content, context)
                        logger.info(f"Applied final placeholder removal for slide '{slide_title}'")
            
            # Generate chart if the AI decided it needs one
            chart_data = None
            extracted_data = None
            if slide_type in ['stat', 'quote', 'divider', 'transition']:
                # Never attach charts to these minimal slide types
                pass
            elif response.requires_chart and response.chart_type and response.chart_data:
                # Log the AI-generated data
                logger.info(f"[CHART DEBUG] AI decided chart needed: {response.chart_type}")
                logger.info(f"[CHART DEBUG] AI generated {len(response.chart_data)} data points")
                
                if response.chart_data:
                    # Log sample of AI data
                    for i, point in enumerate(response.chart_data[:3]):
                        if hasattr(point, 'name'):
                            logger.info(f"[CHART DEBUG] Data point {i}: name='{point.name}', value={point.value}")
                
                # Pass the AI-generated chart data!
                chart_type, data = await self.chart_generator.determine_optimal_chart_type_and_data(
                    slide_title, content, response.chart_data, model_name, context
                )
                
                # Only create chart if we have valid data
                if chart_type and data:
                    # Use AI's suggested title if available, otherwise generate one
                    chart_title = response.chart_title if response.chart_title else await self.chart_generator.generate_chart_title(
                        slide_title, chart_type, data, presentation_title
                    )
                    
                    # Heuristic: map each data point to the first citation (sourceIndex=0) if available
                    citations = context.get('web_citations') if isinstance(context, dict) else None
                    if citations:
                        for d in data:
                            if isinstance(d, dict) and 'sourceIndex' not in d:
                                d['sourceIndex'] = 0
                    chart_data = ChartData(
                        chart_type=chart_type,
                        data=data,
                        title=chart_title,
                        metadata={'citations': citations} if citations else None
                    )
                    # Convert to extractedData format for frontend
                    extracted_data = self.chart_generator.convert_chart_data_to_extracted_data(
                        chart_data, slide_title
                    )
                    logger.info(f"[CHART DEBUG] Final chart: {chart_type} with {len(data)} data points")
                else:
                    logger.warning(f"[CHART DEBUG] No valid chart data available for slide '{slide_title}'")
            elif response.requires_chart:
                logger.warning(f"[CHART DEBUG] Chart required but no data provided by AI for slide '{slide_title}'")
                # Fallback: try to extract chart data from generated content
                ai_chart_data = self._extract_chart_data_from_content(content, slide_title)
                if ai_chart_data:
                    logger.info(f"[CHART DEBUG] Fallback extracted {len(ai_chart_data)} points from content; attempting chart build")
                    chart_data, extracted_data = await self._create_chart_from_data(
                        slide_title, content, ai_chart_data, model_name, context, presentation_title
                    )
                    if chart_data:
                        logger.info(f"[CHART DEBUG] Fallback chart created successfully")
                
            # If AI didn't request chart but content looks data-rich, opportunistically add one
            if not chart_data and not extracted_data:
                # Check if we should allow opportunistic chart generation
                local_total_slides_guard = 0
                try:
                    local_total_slides_guard = int((context or {}).get('total_slides', 0))
                except Exception:
                    pass
                local_is_narrative = False  # No hardcoded narrative detection
                has_numbers = any(ch.isdigit() for ch in content)
                has_percentage = '%' in content
                has_data_words = any(word in content.lower() for word in ['data', 'percent', 'increase', 'decrease', 'growth', 'trend', 'revenue', 'cost', 'users'])

                allow_opportunistic = not self._should_skip_charts_for_deck(local_total_slides_guard, local_is_narrative)
                if allow_opportunistic and (has_numbers or has_percentage) and has_data_words and slide_type in ['content', 'chart', 'keymetrics', 'data']:
                    ai_chart_data = self._extract_chart_data_from_content(content, slide_title)
                    if ai_chart_data:
                        logger.info(f"[CHART DEBUG] Opportunistic chart: found {len(ai_chart_data)} data points in content")
                        chart_data, extracted_data = await self._create_chart_from_data(
                            slide_title, content, ai_chart_data, model_name, context, presentation_title
                        )
                        if chart_data:
                            logger.info(f"[CHART DEBUG] Opportunistic chart created successfully")
            
            # This is inside _generate_single_slide() - we don't have slide_citations here yet
            # Get citations from context (web_citations)
            context_citations = context.get('web_citations') if isinstance(context, dict) else None
            final_citations = context_citations or []
            
            # If no web_citations but content has [1], [2], [3] markers, try to extract citations from content
            if not final_citations or len(final_citations) == 0:
                extracted_citations, marker_map = extract_citations_from_content(content)
                if extracted_citations:
                    final_citations = extracted_citations
                    logger.info(f"[SINGLE SLIDE] Extracted {len(extracted_citations)} citations from content for '{slide_title}'")
            
            # Create footnotes for citation panel
            footnotes = []
            if final_citations:
                for i, citation in enumerate(final_citations):
                    # Handle both dict citations and malformed ones
                    if isinstance(citation, dict):
                        footnotes.append({
                            "index": i + 1,
                            "label": citation.get("title", citation.get("source", "Unknown Source")),
                            "url": citation.get("url", "")
                        })
                    elif isinstance(citation, str):
                        footnotes.append({
                            "index": i + 1,
                            "label": citation,
                            "url": ""
                        })
                if footnotes:
                    logger.info(f"[SINGLE SLIDE] Created {len(footnotes)} footnotes for '{slide_title}'")

            # Extract [IMAGE: ...] tag if present
            cleaned_content, image_prompt = extract_image_prompt_from_content(content)
            
            # Clean up any metadata headers
            import re
            cleaned_content = re.sub(r'^Slide\s+\d+:\s*[^\n]+\n*', '', cleaned_content, flags=re.IGNORECASE)
            cleaned_content = re.sub(r'[\s\n]*---[\s\n]*(?:SPEAKABLE CONTENT|SPEAKER NOTES?|SPEAKING NOTES?):[\s\S]*?(?=\n---|$)', '', cleaned_content, flags=re.IGNORECASE)
            cleaned_content = re.sub(r'[\s\n]*---[\s\n]*CITATIONS?:[\s\S]*$', '', cleaned_content, flags=re.IGNORECASE)
            cleaned_content = cleaned_content.strip()

            return SlideContent(
                id=str(uuid.uuid4()),
                title=slide_title,
                content=cleaned_content,
                slide_type=slide_type,
                chart_data=chart_data,
                extractedData=extracted_data,
                citations=final_citations,
                footnotes=footnotes,
                research_notes=("Citations available" if final_citations else None),
                comparison=self._maybe_build_comparison(slide_title, content),
                suggestedImagePrompt=image_prompt
            )
            
        except Exception as e:
            logger.error(f"Failed to generate slide '{slide_title}': {e}")
            fallback_content = self._create_fallback_content(slide_title, slide_type, presentation_title)
            cleaned_fallback_content, fallback_image_prompt = extract_image_prompt_from_content(fallback_content)
            return SlideContent(
                id=str(uuid.uuid4()),
                title=slide_title,
                content=cleaned_fallback_content,
                slide_type=slide_type,
                suggestedImagePrompt=fallback_image_prompt
            )

    def _maybe_build_comparison(self, slide_title: str, content: str) -> Optional[Dict[str, Any]]:
        """Detect comparison patterns and build a structured left/right comparison block.

        Heuristics:
        - Slide title contains ' vs ', 'versus', 'before/after', 'old/new', 'comparison'
        - Or content has paired bullets like 'Left — text' and 'Right — text'
        """
        try:
            title_l = (slide_title or '').lower()
            triggers = [' vs ', 'versus', 'comparison', 'before', 'after', 'old', 'new']
            likely = any(t in title_l for t in triggers)
            if not likely and ('•' not in str(content)):
                return None

            # Try to infer default labels from title
            left_label = None
            right_label = None
            if ' vs ' in title_l:
                parts = slide_title.split(' vs ')
                if len(parts) == 2:
                    left_label = parts[0].strip()
                    right_label = parts[1].strip()
            elif ' versus ' in title_l:
                parts = slide_title.split(' versus ')
                if len(parts) == 2:
                    left_label = parts[0].strip()
                    right_label = parts[1].strip()
            elif 'before' in title_l and 'after' in title_l:
                left_label, right_label = 'Before', 'After'
            elif 'old' in title_l and 'new' in title_l:
                left_label, right_label = 'Old', 'New'

            # Parse bullets and attempt to split into pairs
            lines = [ln.strip() for ln in str(content).split('\n') if ln.strip()]
            bullets = [ln[1:].strip() if ln.startswith('•') else ln for ln in lines if ln.startswith('•')]
            if not bullets:
                return None

            left_bullets: list[str] = []
            right_bullets: list[str] = []

            # Pairing strategy: even-indexed bullets -> left, odd-indexed -> right
            # If a bullet begins with an explicit side label (e.g., "Lakers —"), strip it
            def _strip_label(b: str) -> str:
                # Normalize em/en dashes and colon
                return b.split(' — ', 1)[-1].split(' - ', 1)[-1].split(': ', 1)[-1].strip()

            for i, b in enumerate(bullets):
                clean = _strip_label(b)
                if i % 2 == 0:
                    left_bullets.append(clean)
                else:
                    right_bullets.append(clean)

            # Balance counts (trim extra from longer side)
            pairs = min(len(left_bullets), len(right_bullets))
            left_bullets = left_bullets[:pairs]
            right_bullets = right_bullets[:pairs]

            if pairs == 0:
                return None

            return {
                'layout': 'split_50_50',
                'leftLabel': left_label,
                'rightLabel': right_label,
                'leftBullets': left_bullets,
                'rightBullets': right_bullets
            }
        except Exception:
            return None
    
    def _create_slide_prompt(
        self,
        slide_title: str,
        slide_type: str,
        options: OutlineOptions,
        presentation_title: str,
        context: Dict[str, Any] = None
    ) -> str:
        """Create prompt for slide generation"""
        # Get available chart types
        chart_descriptions = self.chart_generator.get_chart_type_descriptions()
        
        # Log what context we have
        if context and context.get('processed_files') and context['processed_files'].get('extracted_data'):
            logger.info(f"[SLIDE PROMPT] Creating prompt for '{slide_title}' with extracted data available")
            for data_item in context['processed_files']['extracted_data']:
                if isinstance(data_item, dict) and 'summary' in data_item:
                    logger.info(f"[SLIDE PROMPT] Data available: {data_item['summary']}")
        else:
            logger.warning(f"[SLIDE PROMPT] No extracted data in context for slide: {slide_title}")
        
        # Attach web citations into context so the prompt can include sources
        if context and context.get('web_citations'):
            try:
                cites = context['web_citations']
                logger.info(f"[SLIDE PROMPT] Citations for '{slide_title}': {', '.join([c.get('source') or c.get('url','') for c in cites])}")
            except Exception:
                pass

        return get_slide_content_prompt(
            slide_title,
            slide_type,
            options.prompt,
            presentation_title,
            slide_title,  # Use slide_title as formatted_slide_title
            context,
            chart_descriptions
        )
    
    def _create_fallback_content(self, slide_title: str, slide_type: str, topic: str) -> str:
        """Create fallback content when generation fails"""
        return get_fallback_content(slide_title, slide_type, topic)

    def _should_skip_charts_for_deck(
        self,
        total_slides: int,
        is_narrative: bool
    ) -> bool:
        """Check if charts should be skipped based on deck size and topic type.

        Args:
            total_slides: Total number of slides in the deck
            is_narrative: Whether this is a narrative/biographical topic

        Returns:
            bool: True if charts should be skipped, False otherwise
        """
        if total_slides and total_slides <= MIN_SLIDES_FOR_CHARTS:
            return True
        if is_narrative and total_slides and total_slides <= MIN_NARRATIVE_SLIDES_FOR_CHARTS:
            return True
        return False

    async def _create_chart_from_data(
        self,
        slide_title: str,
        content: str,
        ai_chart_data: List[Dict[str, Any]],
        model_name: str,
        context: Optional[Dict[str, Any]],
        presentation_title: str
    ) -> tuple[Optional[ChartData], Optional[Dict[str, Any]]]:
        """Helper method to create chart data from AI-generated data points.

        Returns:
            tuple: (chart_data, extracted_data) or (None, None) if chart creation fails
        """
        if not ai_chart_data:
            return None, None

        try:
            chart_type, data = await self.chart_generator.determine_optimal_chart_type_and_data(
                slide_title, content, ai_chart_data, model_name, context
            )

            if not chart_type or not data:
                return None, None

            chart_title = await self.chart_generator.generate_chart_title(
                slide_title, chart_type, data, presentation_title
            )

            # Attach citations if present
            citations = context.get('web_citations') if isinstance(context, dict) else None
            if citations:
                for d in data:
                    if isinstance(d, dict) and 'sourceIndex' not in d:
                        d['sourceIndex'] = 0

            chart_data = ChartData(
                chart_type=chart_type,
                data=data,
                title=chart_title,
                metadata={'citations': citations} if citations else None
            )

            extracted_data = self.chart_generator.convert_chart_data_to_extracted_data(
                chart_data, slide_title
            )

            logger.info(f"[CHART] Created {chart_type} chart with {len(data)} data points")
            return chart_data, extracted_data

        except Exception as e:
            logger.error(f"[CHART] Failed to create chart: {e}")
            return None, None
    
    def _validate_title_slide_content(self, content: str, max_words: int = TITLE_SLIDE_MAX_WORDS) -> str:
        """Validate and enforce title slide content constraints.

        ⚠️ CRITICAL: Title slides must ALWAYS be CLEAN HERO SLIDES in ALL MODES!
        This applies to detailed, standard, AND quick modes - NO EXCEPTIONS!

        Title slide requirements:
        - Maximum 20-30 words total
        - Only: title + optional subtitle + metadata
        - NO bullets, NO paragraphs, NO extra content
        - NO comprehensive analysis on title slides (save that for content slides)

        Args:
            content: Raw content generated for the title slide
            max_words: Maximum word count (default: 30, NEVER increase this)

        Returns:
            Validated and potentially truncated title slide content
        """
        try:
            if not content:
                return ""

            # Strip and normalize
            text = re.sub(r'\r\n?', '\n', str(content)).strip()

            # Count total words
            word_count = len(text.split())

            # If under limit, return as-is
            if word_count <= max_words:
                logger.info(f"[TITLE VALIDATION] Title slide word count: {word_count} (OK)")
                return text

            # VIOLATION: Title slide has too much content
            logger.warning(f"[TITLE VALIDATION] Title slide exceeded {max_words} words ({word_count} words). Stripping excess content.")

            # Extract key elements (preserve structure but enforce limits)
            lines = [line.strip() for line in text.split('\n') if line.strip()]

            # Keep first 3-4 lines maximum (title, subtitle, metadata)
            # Remove any bullets, paragraphs, or extra content
            cleaned_lines = []
            for i, line in enumerate(lines[:TITLE_SLIDE_MAX_LINES]):
                # Skip bullet points
                if line.startswith('•') or line.startswith('-') or line.startswith('*'):
                    logger.info(f"[TITLE VALIDATION] Removing bullet point from title slide: {line[:50]}")
                    continue

                # Skip very long lines (likely paragraphs)
                if len(line.split()) > TITLE_FIRST_LINE_MAX_WORDS and i > 0:  # Allow longer first line (title)
                    logger.info(f"[TITLE VALIDATION] Removing long line from title slide: {line[:50]}")
                    continue

                cleaned_lines.append(line)

            # Rebuild content
            cleaned = '\n'.join(cleaned_lines)
            final_word_count = len(cleaned.split())

            # If still too long, truncate to max_words
            if final_word_count > max_words:
                words = cleaned.split()
                cleaned = ' '.join(words[:max_words])
                logger.warning(f"[TITLE VALIDATION] Truncated title slide from {final_word_count} to {max_words} words")

            logger.info(f"[TITLE VALIDATION] Final title slide word count: {len(cleaned.split())}")
            return cleaned

        except Exception as e:
            logger.error(f"[TITLE VALIDATION] Error validating title slide: {e}")
            # Fallback: just take first 30 words
            words = str(content).split()[:max_words]
            return ' '.join(words)

    def _ensure_proper_formatting(self, content: str) -> str:
        """Ensure content is formatted as concise bullet points.
        - Converts paragraphs and long lines to short bullets
        - Splits "Header: paragraph" into a short header bullet + callout bullets
        - Normalizes bullet markers and trims each bullet to a readable length
        """
        try:
            if not content:
                return ""

            # Normalize line breaks and whitespace
            text = re.sub(r'\r\n?', '\n', str(content)).strip()

            # Helper: split a clause into shorter callouts if it's long
            def _split_clauses(s: str) -> list[str]:
                s = s.strip()
                if not s:
                    return []
                # First, split by end-of-sentence punctuation
                parts = [p.strip() for p in re.split(r'(?<=[\.!?;])\s+', s) if p and p.strip()]
                result: list[str] = []
                for part in parts:
                    # If still lengthy and packed with multiple metrics, split by commas
                    if len(part.split()) > 20 and (part.count('%') + len(re.findall(r'\d+', part)) >= 2):
                        result.extend([p.strip() for p in part.split(',') if p.strip()])
                    else:
                        result.append(part)
                return result

            # Helper: normalize incoming lines (numbers/bullets/headings)
            def _normalize_line(line: str) -> list[str]:
                if not line:
                    return []
                # Remove leading list markers or numbering
                line = re.sub(r'^\s*(?:[-*\u2022•\u2013\u2014]|#+|\d+\.)\s*', '', line).strip()
                if not line:
                    return []
                # If "Header: rest" pattern, split into header + clauses
                if ':' in line:
                    try:
                        colon_idx = line.index(':')
                    except ValueError:
                        colon_idx = -1
                    if 0 <= colon_idx < 50:
                        header = line[:colon_idx].strip()
                        rest = line[colon_idx + 1:].strip()
                        segs: list[str] = []
                        if header:
                            segs.append(header)
                        if rest:
                            segs.extend(_split_clauses(rest))
                        return segs
                # Otherwise split long sentences into clauses
                return _split_clauses(line) or [line]

            # Build candidate lines: if there are no line breaks but text is long, split by sentences
            raw_lines = [l for l in (ln.strip() for ln in text.split('\n')) if l]
            if len(raw_lines) <= 1 and len(text) > SENTENCE_SPLIT_THRESHOLD:
                raw_lines = [seg.strip() for seg in re.split(r'(?<=[\.!?])\s+', text) if seg and seg.strip()]

            # Flatten into segments
            segments: list[str] = []
            for raw in raw_lines:
                # If a raw line is very long, pre-split it before normalization
                if len(raw) > MAX_LINE_LENGTH and any(ch in raw for ch in '.;!?'):
                    for chunk in re.split(r'(?<=[\.!?;])\s+', raw):
                        segments.extend(_normalize_line(chunk))
                else:
                    segments.extend(_normalize_line(raw))

            # Final cleanup, trimming, and bulletization
            formatted: list[str] = []
            for seg in segments:
                seg = seg.strip().strip('"')
                if not seg:
                    continue
                # Preserve trailing citation like [1]
                citation = ''
                m = re.search(r'(\s*\[\d+\])\s*$', seg)
                if m:
                    citation = m.group(1).strip()
                    seg = seg[:m.start()].rstrip()
                # Trim to reasonable length (45 words for detailed mode, 20 for presentation)
                # Using 45 as default to not limit detailed mode comprehensive bullets
                words = seg.split()
                max_words_for_bullet = DETAILED_MODE_MAX_BULLET_WORDS  # Allow comprehensive bullets
                if len(words) > max_words_for_bullet:
                    seg = ' '.join(words[:max_words_for_bullet]) + '…'
                # Re-attach citation
                if citation:
                    seg = f"{seg} {citation}"
                formatted.append(f"• {seg}")

            # Ensure at least one bullet if content existed
            if not formatted and text:
                max_words_for_bullet = DETAILED_MODE_MAX_BULLET_WORDS  # Allow comprehensive bullets
                trimmed = ' '.join(text.split()[:max_words_for_bullet]) + ('…' if len(text.split()) > max_words_for_bullet else '')
                formatted = [f"• {trimmed}"]

            return '\n\n'.join(formatted)
        except Exception:
            # Fallback: safest path, prefix each non-empty line with a bullet
            safe_lines = []
            for ln in str(content).split('\n'):
                ln = ln.strip()
                if not ln:
                    continue
                if not ln.startswith('•'):
                    ln = f"• {ln}"
                safe_lines.append(ln)
            return '\n\n'.join(safe_lines)
    
    def _contains_placeholders(self, content: str) -> bool:
        """Check if content contains placeholder text that should be replaced with real data"""
        placeholder_patterns = [
            r'\[insert\s+.*?\]',
            r'\[mention\s+.*?\]',
            r'\[specific\s+.*?\]',
            r'\[.*?value.*?\]',
            r'\[.*?percentage.*?\]',
            r'\[.*?number.*?\]',
            r'\[.*?amount.*?\]',
            r'\[your\s+name\]',  # Except for title slides
            r'insert\s+specific',
            r'mention\s+a\s+specific',
            r'specific\s+price\s+point(?!\s*:)',  # Not followed by colon
            r'specific\s+percentage\s+or\s+value',
        ]
        
        content_lower = content.lower()
        for pattern in placeholder_patterns:
            if re.search(pattern, content_lower, re.IGNORECASE):
                return True
        
        return False
    
    def _remove_placeholders_with_defaults(self, content: str, context: Dict[str, Any]) -> str:
        """Replace placeholder text with actual data or reasonable defaults"""
        # Extract available data from context
        extracted_data = {}
        if context and context.get('processed_files') and context['processed_files'].get('extracted_data'):
            logger.info(f"[PLACEHOLDER REMOVAL] Found extracted data in context")
            for data_item in context['processed_files']['extracted_data']:
                if isinstance(data_item, dict) and 'summary' in data_item:
                    summary = data_item.get('summary', {})
                    metrics = data_item.get('keyMetrics', {})
                    
                    # Log what we found
                    logger.info(f"[PLACEHOLDER REMOVAL] Summary data: {json.dumps(summary, indent=2)}")
                    
                    extracted_data.update({
                        'symbol': summary.get('symbol', 'Unknown'),
                        'shares': summary.get('shares', 0),
                        'current_price': summary.get('currentPrice', 0),
                        'total_value': summary.get('totalValue', 0),
                        'market_cap': metrics.get('marketCap', 'N/A'),
                        'pe_ratio': metrics.get('peRatio', 0),
                        'year_high': metrics.get('52WeekHigh', 0),
                        'year_low': metrics.get('52WeekLow', 0)
                    })
                    
                    # Get price data for trends
                    if 'priceData' in data_item and data_item['priceData']:
                        prices = [p.get('close', 0) for p in data_item['priceData']]
                        if prices:
                            extracted_data['price_range_low'] = round(min(prices), 2)
                            extracted_data['price_range_high'] = round(max(prices), 2)
                            extracted_data['avg_price'] = round(sum(prices) / len(prices), 2)
        
        # Default values if no data - use the actual extracted values
        defaults = {
            'symbol': extracted_data.get('symbol', '[SYMBOL]'),
            'shares': extracted_data.get('shares', 0),
            'current_price': extracted_data.get('current_price', 0),
            'total_value': extracted_data.get('total_value', 0),
            'price_range_low': extracted_data.get('price_range_low', 0),
            'price_range_high': extracted_data.get('price_range_high', 0),
            'support_level': extracted_data.get('price_range_low', 0),
            'resistance_level': extracted_data.get('price_range_high', 0),
            'percentage': extracted_data.get('percentage', 0),
            'volume': extracted_data.get('volume', '0'),
            'date': extracted_data.get('date', 'N/A')
        }
        
        # If we have real data, log it
        if extracted_data:
            logger.info(f"[PLACEHOLDER REMOVAL] Using actual values: {defaults['shares']} shares @ ${defaults['current_price']} = ${defaults['total_value']}")
        
        # Replace common placeholder patterns AND stock-specific patterns
        replacements = {
            r'\[insert\s+specific\s+price\s+point\]': f"${defaults['current_price']}",
            r'\[insert\s+specific\s+percentage.*?\]': f"{defaults['percentage']}%",
            r'\[insert\s+specific\s+value.*?\]': f"${defaults['current_price']}",
            r'\[mention\s+a?\s+specific.*?\]': f"the ${defaults['current_price']} level",
            r'around\s+\[.*?price.*?\]': f"around ${defaults['support_level']}",
            r'near\s+\[.*?price.*?\]': f"near ${defaults['resistance_level']}",
            r'\[your\s+name\]': "[Your Name]",  # Keep this for title slides
            # Stock-specific replacements
            r'current\s+stock\s+price:\s*\$[\d.]+': f"Current Stock Price: ${defaults['current_price']}",
            r'(\d+)\s*shares?\s*worth\s*\$[\d.]+': f"{defaults['shares']} shares worth ${defaults['total_value']}",
            r'if\s+[A-Z]+\s+represented\s+\d+%': f"With {defaults['shares']} shares of {defaults['symbol']}",
            r'\$[\d,]+\s+portfolio': f"${defaults['total_value']} position",
        }
        
        # Apply replacements
        result = content
        for pattern, replacement in replacements.items():
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
        
        return result
    
    async def _call_progress(self, callback, slide_index: int, total_slides: int, slide_type: str):
        """Call progress callback"""
        from .models import ProgressUpdate
        
        update = ProgressUpdate(
            stage="generating",
            message=f"Generating {slide_type} slide {slide_index + 1} with chart...",
            progress=20 + (slide_index * 50 / total_slides)
        )
        
        if asyncio.iscoroutinefunction(callback):
            await callback(update)
        else:
            callback(update)
    
    def _get_model(self, task: str, options: Optional[OutlineOptions] = None) -> str:
        """Select model for task"""
        if options and options.model:
            return options.model
        
        # Import here to avoid circular dependency
        from agents.config import OUTLINE_CONTENT_MODEL
        return OUTLINE_CONTENT_MODEL
    
    def _requires_default_temperature(self, model_name: str) -> bool:
        """Check if model requires default temperature"""
        return "o3" in model_name or "o4" in model_name

    def _extract_chart_data_from_content(self, content: str, slide_title: str) -> List[Dict[str, Any]]:
        """Attempt to extract chart data points from the generated content."""
        logger.info(f"[CHART EXTRACTION] Attempting to extract chart data from content for '{slide_title}'")
        extracted_data = []
        
        # Split content into lines and look for bullet points with percentages or numbers
        lines = content.split('\n')
        for line in lines:
            line = line.strip()
            if not line or not line.startswith('•'):
                continue
                
            # Look for patterns like "• Category: 45%" or "• Item - $123"
            # Pattern 1: "• Name: Value%" or "• Name: Value"
            match = re.search(r'^•\s*([^:]+):\s*(\d+(?:\.\d+)?)\s*%?', line)
            if match:
                name = match.group(1).strip()
                value = float(match.group(2))
                extracted_data.append({"name": name, "value": value})
                logger.info(f"[CHART EXTRACTION] Found: {name} = {value}")
                continue
                
            # Pattern 2: "• Name - Value" or "• Name – Value"
            match = re.search(r'^•\s*([^-–]+)[-–]\s*\$?(\d+(?:\.\d+)?)', line)
            if match:
                name = match.group(1).strip()
                value = float(match.group(2))
                extracted_data.append({"name": name, "value": value})
                logger.info(f"[CHART EXTRACTION] Found: {name} = {value}")
                continue
                
            # Pattern 3: Look for percentages anywhere in the line
            match = re.search(r'^•\s*([^(]+).*?(\d+(?:\.\d+)?)\s*%', line)
            if match:
                name = match.group(1).strip().rstrip(':')
                value = float(match.group(2))
                extracted_data.append({"name": name, "value": value})
                logger.info(f"[CHART EXTRACTION] Found: {name} = {value}%")
        
        logger.info(f"[CHART EXTRACTION] Extracted {len(extracted_data)} data points from content")
        return extracted_data