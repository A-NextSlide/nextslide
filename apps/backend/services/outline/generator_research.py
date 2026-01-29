import uuid
from typing import Any, Dict, List, Optional

from agents.ai.clients import get_client, get_max_tokens_for_model, invoke
from agents.config import (
    OUTLINE_CONTENT_MODEL,
    PERPLEXITY_OUTLINE_MODEL,
    PRESENTATION_OUTLINE_MODEL,
    USE_HYBRID_RESEARCH_MODE,
    USE_PERPLEXITY_FOR_OUTLINE,
)
from setup_logging_optimized import get_logger

from .models import ChartData, OutlineOptions, OutlineResult, SlideContent
from .research_decision import get_current_date_context

logger = get_logger(__name__)


class OutlineGeneratorResearchMixin:
    async def _enhance_research(self, slides: list[SlideContent], options: OutlineOptions) -> list[SlideContent]:
        """Enhance slides with research by appending concise citations (non-destructive)."""
        try:
            # Non-blocking, preserve existing content; simply ensure any research notes are present
            for s in slides:
                # If research facts were used during generation, keep them attached
                if not hasattr(s, 'research_notes'):
                    setattr(s, 'research_notes', [])
            return slides
        except Exception:
            logger.info("Skipping research enhancement to prevent timeouts")
            return slides

    async def _generate_with_hybrid_research(self, options: OutlineOptions) -> Optional[OutlineResult]:
        """Two-phase outline generation: Perplexity for research + Haiku for presentation structure.
        
        Phase 1: Use Perplexity to gather comprehensive research and data
        Phase 2: Use Haiku 4.5 to structure it into a digestible presentation
        
        This approach combines Perplexity's research capabilities with Haiku's narrative structuring.
        """
        logger.info("[OUTLINE] Using HYBRID mode: Perplexity research → Haiku structuring")
        
        try:
            # PHASE 1: Research with Perplexity Pro
            logger.info("[HYBRID PHASE 1] Gathering research data with Perplexity Pro...")
            
            research_client, research_model = get_client(PERPLEXITY_OUTLINE_MODEL)
            date_context = get_current_date_context()
            research_prompt = f"""You are a research assistant. Gather comprehensive, fact-based information about the following topic.
{date_context}

Focus on:
- Key statistics, numbers, and data points (prioritize quantitative sources)
- Recent developments and trends with concrete figures
- Important facts and figures with units and dates
- Real-world examples and case studies with measurable outcomes
- Quantifiable metrics, benchmarks, and historical ranges

Topic: {options.prompt}

RESEARCH DEPTH REQUIREMENTS:
- Pull AS MUCH quantitative data as possible from credible sources
- Include a data appendix with tables/lists sized to the domain
- Use a handful of points for sparse topics; include full series for long histories
- Favor time series, category breakdowns, and comparisons
- Always include units and time ranges

Provide detailed research findings with specific data, numbers, and sources.
Return research in structured format with citations."""

            research_invoke_params = {
                "response_model": None,
                "max_tokens": 16000,
                "temperature": 0.1,
                "extra_body": {
                    "return_citations": True,
                    "search_recency_filter": "month",
                    "search_domain_filter": ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"],
                    "num_search_results": 15
                }
            }
            
            research_data = invoke(
                research_client,
                research_model,
                [{"role": "user", "content": research_prompt}],
                **research_invoke_params
            )
            
            logger.info(f"[HYBRID PHASE 1] Research complete: {len(research_data)} chars")
            logger.debug(f"[HYBRID PHASE 1] Research preview: {research_data[:500]}")
            
            # Validate research data
            if not research_data or len(research_data) < 50:
                logger.error(f"[HYBRID PHASE 1] Research data is too short or empty: {research_data}")
                return None
            
            # PHASE 2: Structure with Haiku 4.5
            logger.info("[HYBRID PHASE 2] Structuring presentation with Haiku 4.5...")
            
            # Create enriched prompt with research context
            enriched_prompt = f"""{options.prompt}

RESEARCH CONTEXT (use this data to create a digestible, presentation-ready outline):
{research_data}

CRITICAL INSTRUCTIONS FOR PRESENTATION STRUCTURING:
- Transform the research into DIGESTIBLE presentation format
- AVOID long paragraphs - use short, punchy bullet points (8-15 words each)
- Each slide should be easy to present (not read verbatim)
- Break complex information into multiple simple slides
- Use visual hierarchy: main bullets (•) + sub-bullets (  •)
- Emphasize key numbers and data points with **bold**
- Add charts for numerical data only when the deck is data-driven/analytical/scientific or explicitly asks for charts
- Include [IMAGE: description] tags for visual slides (70% of content slides)
- Maintain all citations from the research
- Total: 40-80 words per content slide (concise, presentation-ready content)"""
            
            # Create new options for Haiku with 'standard' detail level to avoid recursion
            # This prevents the hybrid mode check from triggering again
            haiku_options = OutlineOptions(
                prompt=enriched_prompt,
                detail_level='standard',  # Use 'standard' to avoid hybrid recursion
                enable_research=False,  # Already have research
                style_context=options.style_context,
                font_preference=options.font_preference,
                color_scheme=options.color_scheme,
                files=options.files,
                slide_count=options.slide_count,
                visual_density=options.visual_density,
                async_images=options.async_images,
                model=PRESENTATION_OUTLINE_MODEL  # Use presentation outline model
            )
            
            # Call the standard generation with Haiku (will use standard mode logic)
            result = await self._generate_with_perplexity(haiku_options)
            
            if result:
                logger.info("[HYBRID] Successfully generated hybrid outline (Perplexity research + Haiku structure)")
                logger.info(f"[HYBRID] Generated {len(result.slides)} slides")
                # Log first slide for debugging
                if result.slides:
                    first_slide = result.slides[0]
                    logger.debug(f"[HYBRID] First slide: title='{first_slide.title}', content_len={len(first_slide.content)}")
            else:
                logger.error("[HYBRID] Hybrid generation returned None!")
            
            return result
            
        except Exception as e:
            logger.error(f"[HYBRID] Hybrid research mode failed: {e}", exc_info=True)
            return None

    async def _generate_with_perplexity(self, options: OutlineOptions) -> Optional[OutlineResult]:
        """Single-pass outline generation using Perplexity or Claude.
        Returns OutlineResult on success, or None to fall back.
        
        NOTE: For detailed mode with hybrid enabled, uses Perplexity Pro for research + Haiku for structure.
        For detailed mode without hybrid, uses Perplexity Pro directly.
        For presentation mode (standard/quick), uses Haiku 4.5 for narrative structure.
        """
        try:
            # Check if we should use hybrid mode for detailed presentations
            detail_level = options.detail_level or 'standard'
            
            if detail_level == 'detailed' and USE_HYBRID_RESEARCH_MODE:
                # Use hybrid mode: Perplexity research + Haiku structuring
                logger.info("[OUTLINE] Detail level is 'detailed' with hybrid mode enabled")
                return await self._generate_with_hybrid_research(options)
            
            # Choose model based on detail level
            if detail_level == 'detailed':
                # Detailed mode without hybrid: Use Perplexity Pro directly
                model = getattr(options, 'planning_model', None) or getattr(options, 'model', None) or PERPLEXITY_OUTLINE_MODEL
                if not isinstance(model, str) or not model.startswith('perplexity-'):
                    model = PERPLEXITY_OUTLINE_MODEL
                logger.info(f"[OUTLINE] Using {model} for DETAILED mode (heavy research, direct)")
            else:
                # Presentation mode (standard/quick): Use Haiku 4.5 for narrative structure
                model = PRESENTATION_OUTLINE_MODEL
                logger.info(f"[OUTLINE] Using {model} for PRESENTATION mode (visual-focused, digestible content)")
                # Add search limits for presentation mode if using Perplexity
                if model.startswith('perplexity'):
                    logger.info("[OUTLINE] Presentation mode will use minimal search (limited research depth)")
            
            client, model_name = get_client(model)
            max_tokens = min(20000, get_max_tokens_for_model(model, 20000))

            # Prompt setup (minimal guidance; no keyword heuristics)
            detail_level = options.detail_level or 'standard'
            slide_hint = options.slide_count or {
                'quick': 5,
                'standard': 8,
                'detailed': 10,
            }.get(detail_level, 8)

            system = (
                "You are a presentation outline generator. Return strict JSON. "
                "Slides are presentation-ready: concise, visual-first, one idea per slide. "
                "Use citations inline as [n] when sources are available. "
                "Avoid YouTube sources. "
                "Only include chart data when the deck is data-driven/analytical/scientific or explicitly asks for charts."
            )

            user_lines = [
                f"Topic: {options.prompt}",
                f"Slides: {slide_hint}",
            ]
            if options.visual_density:
                user_lines.append(f"Visual density: {options.visual_density}")
            if options.style_context:
                user_lines.append(f"Context: {options.style_context}")
                user_lines.append("Follow any explicit structure or questions in the context.")
            user_lines.append(
                "DATA RICHNESS: If the deck is data-driven/analytical/scientific, include a chart object for "
                "quantitative claims with as many relevant points as the source provides. Use a few points when "
                "the domain is sparse; use full series for long histories. Include units in labels if needed."
            )
            user_lines.append(
                "Return JSON: {title:str, slides:[{title:str, type:'title'|'content'|'stat'|'quote'|'chart'|'team'|'agenda'|'divider'|'transition', content:str, chart?:{chartType:str,data:[{name:str,value:num}]}}]}"
            )
            user = "\n".join(user_lines)

            temperature = 0.2 if detail_level == 'detailed' else 0.4

            invoke_params = {
                "response_model": None,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }

            if model_name.startswith('perplexity'):
                invoke_params["extra_body"] = {
                    "return_citations": True,
                    "search_recency_filter": "month" if detail_level == 'detailed' else "week",
                    "search_domain_filter": ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"],
                    "num_search_results": 15 if detail_level == 'detailed' else 8,
                }
            text = invoke(
                client,
                model_name,
                [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user}
                ],
                **invoke_params
            )
            # Parse JSON
            try:
                import re, json as _json
                m = re.search(r"\{[\s\S]*\}", text)
                payload = _json.loads(m.group(0) if m else text)
            except Exception as e:
                logger.error(f"[OUTLINE] Failed to parse JSON from model response: {e}")
                logger.debug(f"[OUTLINE] Model response text: {text[:500]}")
                return None
            # Validate shape
            title = payload.get('title') or 'Untitled Presentation'
            slides_in = payload.get('slides') or []
            if not isinstance(slides_in, list) or not slides_in:
                logger.error(f"[OUTLINE] Invalid payload structure. Title: {title}, Slides: {type(slides_in)}")
                return None
            
            logger.info(f"[OUTLINE] Parsed {len(slides_in)} slides from model response")
            # Build SlideContent list preserving citations and optional chart -> extractedData
            slides: List[SlideContent] = []
            for s in slides_in:
                s_title = (s or {}).get('title') or 'Slide'
                slide_type = (s or {}).get('type') or 'content'
                # Accept bullets array or content string
                if isinstance((s or {}).get('bullets'), list) and (s or {}).get('bullets'):
                    try:
                        s_content = "\n".join([f"• {str(b).strip()}" for b in (s or {}).get('bullets') if str(b).strip()])
                    except Exception:
                        s_content = (s or {}).get('content') or ''
                else:
                    s_content = (s or {}).get('content') or ''
                
                # DEBUG: Log if content is empty
                if not s_content or not s_content.strip():
                    logger.warning(f"[OUTLINE] Slide '{s_title}' has empty content!")
                    logger.debug(f"[OUTLINE] Raw slide data: {s}")
                    # Provide minimal fallback content
                    s_content = f"• {s_title}\n• Key points\n• Supporting details"
                    logger.info(f"[OUTLINE] Using fallback content for slide '{s_title}'")
                
                # Normalize content into concise bullets if Perplexity returned paragraphs
                try:
                    from .slide_generator import SlideGenerator as _SG
                    # Instantiate a lightweight slide generator to reuse formatting logic
                    _tmp_sg = getattr(self, '_tmp_sg_for_format', None)
                    if _tmp_sg is None:
                        _tmp_sg = _SG(self.chart_generator)
                        setattr(self, '_tmp_sg_for_format', _tmp_sg)
                    s_content = _tmp_sg._ensure_proper_formatting(s_content)
                except Exception:
                    # Best effort; if anything fails, keep original
                    pass
                
                # NOTE: IMAGE tags are NO LONGER added automatically to content
                # The model has been instructed not to include them in the prompt
                # If image generation is needed, it should be handled separately
                # from the content output to keep content clean and structured
                
                citations = (s or {}).get('citations') or []
                # Optional callouts supplied by Perplexity (quotes/stats)
                supplied_callouts = (s or {}).get('callouts') or {}
                extracted = None
                footer = None
                citations_meta = None
                chart_data_obj = None
                # Optional chart parsing
                chart = (s or {}).get('chart')
                # Accept alternate keys and arrays
                if not chart and isinstance((s or {}).get('charts'), list) and (s or {}).get('charts'):
                    chart = (s or {}).get('charts')[0]
                if not chart:
                    # Try alternate shapes: chart_data, dataset, table, series, datasets
                    for alt_key in ['chart_data', 'chartData', 'dataset', 'table', 'series', 'datasets']:
                        if isinstance((s or {}).get(alt_key), (dict, list)):
                            chart = { 'title': s_title, 'type': (s or {}).get('chartType') or (s or {}).get('type'), 'data': (s or {}).get(alt_key) }
                            break
                if chart is not None:
                    try:
                        ctype = None
                        if isinstance(chart, dict):
                            ctype = chart.get('chartType') or chart.get('type') or chart.get('chart_type')
                            ctitle = chart.get('title') or s_title
                            cdata_in = chart.get('data')
                        else:
                            ctitle = s_title
                            cdata_in = chart
                        # Normalize input into a list of {name, value}
                        cdata = []
                        if isinstance(cdata_in, list):
                            for item in cdata_in:
                                if isinstance(item, dict):
                                    # Accept multiple label keys
                                    name = (
                                        item.get('name') or item.get('label') or item.get('category') or item.get('title') or ''
                                    )
                                    # Accept multiple numeric value keys
                                    val = item.get('value')
                                    if val is None and 'y' in item:
                                        val = item.get('y')
                                    if val is None and 'val' in item:
                                        val = item.get('val')
                                    if val is None and 'count' in item:
                                        val = item.get('count')
                                    # Allow {x, y} pairs
                                    if val is None and 'x' in item and 'y' in item:
                                        name = str(item.get('x'))
                                        val = item.get('y')
                                    if val is None and 'percentage' in item:
                                        val = item.get('percentage')
                                    try:
                                        if isinstance(val, str):
                                            val = float(val.replace(',', '').replace('%', ''))
                                    except Exception:
                                        val = None
                                    # If name missing but we have a numeric value, synthesize an index-based label
                                    if not name and isinstance(val, (int, float)):
                                        name = f"Item {len(cdata) + 1}"
                                    if name and isinstance(val, (int, float)):
                                        cdata.append({'name': str(name), 'value': float(val)})
                                elif isinstance(item, (list, tuple)) and len(item) >= 2:
                                    # Pair like [name, value]
                                    name = str(item[0])
                                    val = item[1]
                                    try:
                                        if isinstance(val, str):
                                            val = float(val.replace(',', '').replace('%', ''))
                                    except Exception:
                                        val = None
                                    if not name and isinstance(val, (int, float)):
                                        name = f"Item {len(cdata) + 1}"
                                    if name and isinstance(val, (int, float)):
                                        cdata.append({'name': name, 'value': float(val)})
                        elif isinstance(cdata_in, dict):
                            # Possibly {label: value, ...}
                            for k, v in cdata_in.items():
                                name = str(k)
                                val = v
                                try:
                                    if isinstance(val, str):
                                        val = float(val.replace(',', '').replace('%', ''))
                                except Exception:
                                    val = None
                                if name and isinstance(val, (int, float)):
                                    cdata.append({'name': name, 'value': float(val)})

                        if cdata:
                            # Default chart type if missing: infer from data shape or use 'column'
                            if not ctype:
                                ctype = 'column'
                            if ctype in ['column', 'bar', 'line', 'pie']:
                                chart_data_obj = ChartData(chart_type=ctype, data=cdata, title=ctitle, metadata=None)
                    except Exception:
                        chart_data_obj = None
                # Attach citations into extractedData metadata for frontend and a tiny footer
                if isinstance(citations, list) and citations:
                    try:
                        sources_list = []
                        meta_citations = []
                        for idx, c in enumerate(citations, start=1):
                            url = (c or {}).get('url')
                            title = (c or {}).get('title') or (c or {}).get('source') or ''
                            if url:
                                # Create source entry with title and URL for clickable links
                                sources_list.append({
                                    'index': idx,
                                    'title': title if title else f"Source {idx}",
                                    'url': url
                                })
                            meta_citations.append({
                                'title': (c or {}).get('title'),
                                'source': (c or {}).get('source'),
                                'url': url or ''
                            })
                        # Store citations for footer and possible chart metadata, but do NOT set extractedData unless we have real chart data
                        citations_meta = meta_citations
                        footer = {'showThinDivider': True, 'sources': sources_list} if sources_list else None
                    except Exception:
                        pass
                # Ensure citations are returned even when no chart is present by attaching a minimal annotations payload
                if citations_meta and not chart_data_obj and extracted is None:
                    try:
                        extracted = {
                            'source': 'perplexity_outline',
                            'chartType': 'annotations',
                            'data': [],
                            'title': s_title,
                            'metadata': { 'citations': citations_meta }
                        }
                    except Exception:
                        extracted = None
                slide_obj = SlideContent(
                    id=str(uuid.uuid4()),
                    title=s_title,
                    content=s_content,
                    slide_type='content',
                    extractedData=extracted,
                    citationsFooter=footer
                )
                if chart_data_obj:
                    # Attach citations into chart metadata so the conversion carries it through
                    if citations_meta:
                        try:
                            chart_data_obj.metadata = {'citations': citations_meta}
                        except Exception:
                            pass
                    # Convert chart_data to frontend extractedData format with normalization
                    try:
                        ed = self.chart_generator.convert_chart_data_to_extracted_data(chart_data_obj, s_title)
                        slide_obj.extractedData = ed
                    except Exception:
                        pass
                slides.append(slide_obj)
            # Do not adjust counts post-generation; rely on prompt to Perplexity
            result = OutlineResult(
                title=title,
                slides=slides,
                metadata={
                    'detail_level': options.detail_level,
                    'requested_slide_count': options.slide_count,
                    'actual_slide_count': len(slides),
                    'files_processed': len(options.files) if options.files else 0,
                    'generation_time': 0,
                    'model': model
                },
                generation_time=0
            )
            return result
        except Exception as e:
            logger.warning(f"Perplexity single-pass generation error: {e}")
            return None
