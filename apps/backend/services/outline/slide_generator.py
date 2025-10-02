"""Slide content generation module"""

import asyncio
import uuid
import re
import json
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from agents.ai.clients import get_client, invoke, get_max_tokens_for_model
from agents.prompts.generation.outline_prompts import (
    get_slide_content_prompt,
    get_fallback_content,
    get_smart_content_guidance
)
from .models import SlideContent, OutlineOptions, ChartData, TypedSlideResponse
from .chart_generator import ChartGenerator
from setup_logging_optimized import get_logger
from agents import config as agents_config

logger = get_logger(__name__)


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
        slide_max_tokens = min(int(model_max_tokens * 0.25), 8000)
        
        logger.info(f"Using {slide_max_tokens} max tokens for slide generation with {model}")
        
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
                # Add web research citations if available
                try:
                    findings = (processed_files or {}).get("web_research_findings") or []
                    if findings:
                        title_l = (actual_title or "").lower()
                        scored = []
                        for f in findings:
                            text = ((f.get('title') or '') + ' ' + (f.get('summary') or '')).lower()
                            score = sum(1 for w in title_l.split() if w and w in text)
                            scored.append((score, f))
                        scored.sort(key=lambda x: x[0], reverse=True)
                        # Prefer more citations per slide: take up to 5 matches; if none match, take top 3 overall
                        top_n = 5
                        matched = [f for s, f in scored if s > 0][:top_n]
                        if not matched:
                            matched = [f for _, f in scored[:3]]
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
                    slide = SlideContent(
                        id=str(uuid.uuid4()),
                        title=actual_title,
                        content=self._create_fallback_content(actual_title, slide_type, outline_plan["title"]),
                        slide_type=slide_type
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
        title_lower_guard = (slide_title or '').lower()
        narrative_keywords = ['biography', 'biographical', 'historical', 'history', 'story', 'timeline of life', 'about', 'who is', 'early life']
        is_narrative_topic = (
            any(k in ((options.prompt or '').lower()) for k in ['biography', 'historical', 'history']) or
            any(k in title_lower_guard for k in narrative_keywords)
        )
        
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
                sources_block += "\n\nWEB SOURCES (INDEXED):"
                for idx, c in enumerate(context['web_citations'], start=1):
                    src = (c.get('source') or '').strip()
                    url = (c.get('url') or '').strip()
                    title = (c.get('title') or '').strip()
                    sources_block += f"\n[{idx}] {title or src or url}: {url}"
                sources_block += (
                    "\n\nCITATION STYLE: Append numeric citations like [1], [2] to bullets that use facts from these sources. Use the index above. If a bullet is general background, omit citations."
                    "\nSOURCES FOOTER RULES: Render a SINGLE micro 'Sources: [1][2][3]' FOOTNOTE anchored to the SLIDE BOTTOM-RIGHT (footer zone), not within the content area. Use small font, muted color, right-aligned. Add a thin short divider line above the footer zone. Never create more than one sources block per slide."
                )
            except Exception:
                sources_block = ""

        # Create simple prompt
        prompt = f"""Create content for this presentation slide:
Title: {slide_title}
Type: {slide_type}
Presentation: {presentation_title}
Context: {presentation_context}

USER REQUEST AND FILE DATA:
{options.prompt}

{data_context}

{sources_block}

Content Style: {guidance['content_style']}
Visual Emphasis: {guidance['visual_emphasis']}
{guidance['reasoning']}

Word count: {guidance['word_count_range'][0]}-{guidance['word_count_range'][1]} words
Chart appropriateness: {guidance['chart_appropriateness']}

FORMAT RULES (STRICT):
- No paragraphs. Every line MUST be a bullet starting with •
- Keep bullets concise: 12–20 words each (never long sentences)
- Avoid "Header: paragraph" lines; convert into separate bullets instead
 - Single-line bullets: Avoid manual line breaks within a bullet. If a point is long, split it into multiple bullets or shorten it.
Format the content with bullet points using • and proper spacing.
Focus on being specific and relevant to the topic.

IMPORTANT: Do NOT reference images in the slide content text. Images will be added separately through the design system.
Do NOT include text like "[Image 1: filename.jpg]" or any image descriptions in the content.
{f'USE THE REAL DATA PROVIDED ABOVE!' if data_context else ''}"""

        model = self._get_model("content", options)
        client, model_name = get_client(model)
        
        try:
            content = invoke(
                client=client,
                model=model_name,
                messages=[{"role": "user", "content": prompt}],
                response_model=None,
                max_tokens=1000,
                temperature=0.7
            )
            
            # Ensure proper formatting
            content = content.strip() if slide_type == 'title' else self._ensure_proper_formatting(content)
            
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
                        max_tokens=1000,
                        temperature=0.5
                    )
                    
                    content = self._ensure_proper_formatting(retry_content)
                    
                    # Final cleanup
                    if self._contains_placeholders(content):
                        content = self._remove_placeholders_with_defaults(content, context)
            
            # Check if we should generate a chart
            should_generate_chart = False
            
            # Check appropriateness level
            if guidance['chart_appropriateness'] == 'never':
                should_generate_chart = False
            elif guidance['chart_appropriateness'] == 'always':
                should_generate_chart = True
            elif guidance['chart_appropriateness'] == 'likely':
                # Generate chart if slide type suggests data
                should_generate_chart = slide_type in ['content', 'chart', 'keymetrics', 'data']
            elif guidance['chart_appropriateness'] == 'selective':
                # Only generate if content has quantitative data
                has_numbers = any(char.isdigit() for char in content)
                has_percentage = '%' in content
                has_data_words = any(word in content.lower() for word in ['data', 'percent', 'increase', 'decrease', 'growth', 'trend'])
                should_generate_chart = (has_numbers or has_percentage) and has_data_words and slide_type in ['content', 'chart', 'keymetrics', 'data']
            elif guidance['chart_appropriateness'] == 'rare':
                # Very selective - only if explicitly about metrics
                should_generate_chart = False  # Let structured output decide
            else:  # 'let_ai_decide' or default
                should_generate_chart = (
                    guidance['chart_appropriateness'] in ['high', 'essential', 'let_ai_decide'] and
                    slide_type in ['content', 'chart', 'keymetrics', 'data']
                )

            # Global guardrails: avoid charts on tiny decks and narrative topics
            total_slides_guard = 0
            try:
                total_slides_guard = int((context or {}).get('total_slides', 0))
            except Exception:
                pass
            title_lower_guard = (slide_title or '').lower()
            narrative_keywords = ['biography', 'biographical', 'historical', 'history', 'story', 'timeline of life', 'about', 'who is', 'early life']
            is_narrative_topic = (
                any(k in ((options.prompt or '').lower()) for k in ['biography', 'historical', 'history']) or
                any(k in title_lower_guard for k in narrative_keywords)
            )
            if total_slides_guard and total_slides_guard <= 3:
                should_generate_chart = False
            elif total_slides_guard and total_slides_guard <= 5 and is_narrative_topic:
                should_generate_chart = False
            
            logger.info(f"[CHART DEBUG] Slide: {slide_title}")
            logger.info(f"[CHART DEBUG] Presentation title: {presentation_title}")
            logger.info(f"[CHART DEBUG] Chart appropriateness: {guidance['chart_appropriateness']}")
            logger.info(f"[CHART DEBUG] Slide type: {slide_type}")
            logger.info(f"[CHART DEBUG] Total slides: {total_slides_guard}")
            logger.info(f"[CHART DEBUG] Narrative topic: {is_narrative_topic}")
            logger.info(f"[CHART DEBUG] Should generate chart: {should_generate_chart}")
            
            chart_data = None
            extracted_data = None
            if should_generate_chart:
                # For Gemini, we need to extract chart data from the content
                logger.info(f"[CHART DEBUG] Generating chart for Gemini model")
                
                # Try to extract data points from the content
                ai_chart_data = self._extract_chart_data_from_content(content, slide_title)
                
                if ai_chart_data:
                    chart_type, data = await self.chart_generator.determine_optimal_chart_type_and_data(
                        slide_title, content, ai_chart_data, model_name, context
                    )
                    
                    # Only create chart if we have valid data
                    if chart_type and data:
                        chart_title = await self.chart_generator.generate_chart_title(
                            slide_title, chart_type, data, presentation_title
                        )
                        chart_data = ChartData(
                            chart_type=chart_type,
                            data=data,
                            title=chart_title
                        )
                        # Convert to extractedData format for frontend
                        extracted_data = self.chart_generator.convert_chart_data_to_extracted_data(
                            chart_data, slide_title
                        )
                        logger.info(f"[CHART DEBUG] Generated {chart_type} chart with {len(data)} data points")
                    else:
                        logger.warning(f"[CHART DEBUG] No valid chart type/data for slide '{slide_title}'")
                else:
                    logger.warning(f"[CHART DEBUG] Could not extract chart data from content for slide '{slide_title}'")
            
            # Build citations metadata and footer if available
            slide_citations = context.get('web_citations') if isinstance(context, dict) else None
            if slide_citations and not extracted_data:
                extracted_data = {
                    "chartType": "annotations",
                    "data": [],
                    "title": slide_title,
                    "metadata": {"citations": slide_citations}
                }
            citations_footer = None
            if slide_citations and isinstance(slide_citations, list):
                try:
                    urls = []
                    for c in slide_citations:
                        u = (c.get('url') or '').strip()
                        if u:
                            urls.append(u)
                    if urls:
                        citations_footer = {"showThinDivider": True, "urls": urls}
                except Exception:
                    pass

            return SlideContent(
                id=str(uuid.uuid4()),
                title=slide_title,
                content=content,
                slide_type=slide_type,
                chart_data=chart_data,
                extractedData=extracted_data,
                research_notes=("Citations available" if slide_citations else None),
                citationsFooter=citations_footer,
                comparison=self._maybe_build_comparison(slide_title, content)
            )
            
        except Exception as e:
            logger.error(f"Failed to generate slide '{slide_title}': {e}")
            return SlideContent(
                id=str(uuid.uuid4()),
                title=slide_title,
                content=self._create_fallback_content(slide_title, slide_type, presentation_title),
                slide_type=slide_type
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
            
            # Process response
            content = response.content.strip() if slide_type in ['title', 'stat', 'quote', 'divider', 'transition'] else self._ensure_proper_formatting(response.content)
            
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
                    chart_type, data = await self.chart_generator.determine_optimal_chart_type_and_data(
                        slide_title, content, ai_chart_data, model_name, context
                    )
                    if chart_type and data:
                        chart_title = await self.chart_generator.generate_chart_title(
                            slide_title, chart_type, data, presentation_title
                        )
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
                        logger.info(f"[CHART DEBUG] Fallback chart created: {chart_type} with {len(data)} points")
                
            # If AI didn't request chart but content looks data-rich, opportunistically add one
            if not chart_data and not extracted_data:
                # Local guard values for this function
                local_total_slides_guard = 0
                try:
                    local_total_slides_guard = int((context or {}).get('total_slides', 0))
                except Exception:
                    pass
                title_lower_guard2 = (slide_title or '').lower()
                narrative_keywords2 = ['biography', 'biographical', 'historical', 'history', 'story', 'timeline of life', 'about', 'who is', 'early life']
                local_is_narrative = (
                    any(k in ((options.prompt or '').lower()) for k in ['biography', 'historical', 'history']) or
                    any(k in title_lower_guard2 for k in narrative_keywords2)
                )
                has_numbers = any(ch.isdigit() for ch in content)
                has_percentage = '%' in content
                has_data_words = any(word in content.lower() for word in ['data', 'percent', 'increase', 'decrease', 'growth', 'trend', 'revenue', 'cost', 'users'])
                allow_opportunistic = True
                if local_total_slides_guard and local_total_slides_guard <= 3:
                    allow_opportunistic = False
                if local_is_narrative and local_total_slides_guard and local_total_slides_guard <= 5:
                    allow_opportunistic = False
                if allow_opportunistic and (has_numbers or has_percentage) and has_data_words and slide_type in ['content', 'chart', 'keymetrics', 'data']:
                    ai_chart_data = self._extract_chart_data_from_content(content, slide_title)
                    if ai_chart_data:
                        logger.info(f"[CHART DEBUG] Opportunistic chart: found {len(ai_chart_data)} data points in content")
                        chart_type, data = await self.chart_generator.determine_optimal_chart_type_and_data(
                            slide_title, content, ai_chart_data, model_name, context
                        )
                        if chart_type and data:
                            chart_title = await self.chart_generator.generate_chart_title(
                                slide_title, chart_type, data, presentation_title
                            )
                            chart_data = ChartData(
                                chart_type=chart_type,
                                data=data,
                                title=chart_title
                            )
                            # Attach citations if present
                            if context.get('web_citations'):
                                chart_data.metadata = chart_data.metadata or {}
                                chart_data.metadata['citations'] = context['web_citations']
                            extracted_data = self.chart_generator.convert_chart_data_to_extracted_data(
                                chart_data, slide_title
                            )
                            logger.info(f"[CHART DEBUG] Opportunistic chart created: {chart_type} with {len(data)} points")
            
            # Build a small-footnote style citations footer for the frontend
            slide_citations = context.get('web_citations') if isinstance(context, dict) else None
            citations_footer = None
            if slide_citations and isinstance(slide_citations, list):
                try:
                    urls = []
                    for c in slide_citations:
                        u = (c.get('url') or '').strip()
                        if u:
                            urls.append(u)
                    if urls:
                        citations_footer = {"showThinDivider": True, "urls": urls}
                except Exception:
                    pass

            return SlideContent(
                id=str(uuid.uuid4()),
                title=slide_title,
                content=content,
                slide_type=slide_type,
                chart_data=chart_data,
                extractedData=extracted_data,
                research_notes=("Citations available" if slide_citations else None),
                citationsFooter=citations_footer,
                comparison=self._maybe_build_comparison(slide_title, content)
            )
            
        except Exception as e:
            logger.error(f"Failed to generate slide '{slide_title}': {e}")
            return SlideContent(
                id=str(uuid.uuid4()),
                title=slide_title,
                content=self._create_fallback_content(slide_title, slide_type, presentation_title),
                slide_type=slide_type
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
            if len(raw_lines) <= 1 and len(text) > 200:
                raw_lines = [seg.strip() for seg in re.split(r'(?<=[\.!?])\s+', text) if seg and seg.strip()]

            # Flatten into segments
            segments: list[str] = []
            for raw in raw_lines:
                # If a raw line is very long, pre-split it before normalization
                if len(raw) > 160 and any(ch in raw for ch in '.;!?'):
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
                # Trim to ~18–20 words for concision
                words = seg.split()
                max_words = 20
                if len(words) > max_words:
                    seg = ' '.join(words[:max_words]) + '…'
                # Re-attach citation
                if citation:
                    seg = f"{seg} {citation}"
                formatted.append(f"• {seg}")

            # Ensure at least one bullet if content existed
            if not formatted and text:
                trimmed = ' '.join(text.split()[:20]) + ('…' if len(text.split()) > 20 else '')
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