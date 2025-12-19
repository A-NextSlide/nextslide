import asyncio
from typing import List, Dict, Any, Optional

from agents.ai.clients import get_client, invoke, get_max_tokens_for_model
from agents.prompts.generation.outline_prompts import (
    build_structured_slide_output_prompt,
    get_slide_content_prompt,
)
from .models import SlideContent, OutlineOptions, ChartData, TypedSlideResponse, StructuredSlideOutput
from setup_logging_optimized import get_logger
from agents import config as agents_config
from .slide_generator_validation import TITLE_SLIDE_MAX_WORDS

logger = get_logger(__name__)

SLIDE_MAX_TOKENS_MULTIPLIER = float(getattr(agents_config, "SLIDE_MAX_TOKENS_MULTIPLIER", 1.0))
PRESENTATION_MODE_MAX_TOKENS_CAP = int(getattr(agents_config, "PRESENTATION_MODE_MAX_TOKENS_CAP", 2000))
SIMPLE_SLIDE_MAX_TOKENS = int(getattr(agents_config, "SIMPLE_SLIDE_MAX_TOKENS", 1200))


class SlideGeneratorFlowMixin:
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
                    cleaned_fallback_content, fallback_image_prompt = self._clean_content_and_image_prompt(
                        fallback_content
                    )
                    slide = self._build_slide_content(
                        actual_title,
                        slide_type,
                        cleaned_fallback_content,
                        suggested_image_prompt=fallback_image_prompt,
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
        
        # Get chart type descriptions for the prompt
        chart_descriptions = ""
        if hasattr(self.chart_generator, "get_chart_type_descriptions"):
            chart_descriptions = self.chart_generator.get_chart_type_descriptions()
        elif hasattr(self.chart_generator, "get_chart_descriptions"):
            chart_descriptions = self.chart_generator.get_chart_descriptions()
        
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
                structured_prompt = build_structured_slide_output_prompt(prompt, chart_descriptions)

                result = invoke(
                    client=client,
                    model=model_name,
                    messages=[{"role": "user", "content": structured_prompt}],
                    response_model=StructuredSlideOutput,
                    max_tokens=SIMPLE_SLIDE_MAX_TOKENS,
                    temperature=0.7,
                    extra_body={
                        "return_citations": True,
                        "search_recency_filter": "month" if options.detail_level == "detailed" else "week",
                        "num_search_results": 15 if options.detail_level == "detailed" else 6,
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
            
            # Check for placeholders and retry if found
            if self._contains_placeholders(content) and slide_type != 'title':
                logger.warning(f"Placeholders detected in slide '{slide_title}', retrying with guidance...")
                repair_instruction = self._build_placeholder_repair_instruction(context)
                retry_content = invoke(
                    client=client,
                    model=model_name,
                    messages=[{"role": "user", "content": prompt + repair_instruction}],
                    response_model=None,
                    max_tokens=SIMPLE_SLIDE_MAX_TOKENS,
                    temperature=0.5
                )
                content = self._ensure_proper_formatting(retry_content)
                if self._contains_placeholders(content):
                    logger.warning(f"Placeholders remain after retry for slide '{slide_title}'")

            # Use structured chart data if available (from Perplexity)
            chart_data = None
            extracted_data = None
            
            if chart_data_from_api and chart_type_from_api:
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
                logger.info("[CHART] No structured chart data from API (missing chart data or chart type)")
            
            slide_citations = self._resolve_citations(
                content,
                context,
                slide_title,
                log_prefix="SIMPLE SLIDE",
            )
            footnotes = self._build_footnotes(
                slide_citations,
                slide_title,
                log_prefix="SIMPLE SLIDE",
            )

            # Add citations to extractedData if no chart
            if slide_citations and not extracted_data:
                extracted_data = {
                    "chartType": "annotations",
                    "data": [],
                    "title": slide_title,
                    "metadata": {"citations": slide_citations, "footnotes": footnotes},
                }

            cleaned_content, image_prompt = self._clean_content_and_image_prompt(content)

            return self._build_slide_content(
                slide_title,
                slide_type,
                cleaned_content,
                extracted_data=extracted_data,
                citations=slide_citations,
                footnotes=footnotes,
                comparison=self._maybe_build_comparison(slide_title, content),
                suggested_image_prompt=image_prompt,
            )
            
        except Exception as e:
            logger.error(f"Failed to generate slide '{slide_title}': {e}")
            fallback_content = self._create_fallback_content(slide_title, slide_type, presentation_title)
            cleaned_fallback_content, fallback_image_prompt = self._clean_content_and_image_prompt(
                fallback_content
            )
            return self._build_slide_content(
                slide_title,
                slide_type,
                cleaned_fallback_content,
                suggested_image_prompt=fallback_image_prompt,
            )

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
                logger.warning(f"Placeholders detected in slide '{slide_title}', retrying generation...")
                repair_instruction = self._build_placeholder_repair_instruction(context)
                retry_response = invoke(
                    client=client,
                    model=model_name,
                    messages=[{"role": "user", "content": prompt + repair_instruction}],
                    response_model=TypedSlideResponse,
                    max_tokens=max_tokens,
                    temperature=0.5  # Lower temperature for more deterministic output
                )
                content = self._ensure_proper_formatting(retry_response.content)
                response = retry_response
                if self._contains_placeholders(content):
                    logger.warning(f"Placeholders remain after retry for slide '{slide_title}'")
            
            # Generate chart if the AI decided it needs one
            chart_data = None
            extracted_data = None
            if response.requires_chart and response.chart_type and response.chart_data:
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
                # AI indicated chart needed but didn't provide data - this means it couldn't find appropriate data
                # Don't force a chart with scraped content - respect the AI's inability to provide structured data
                logger.warning(f"[CHART] Chart requested but no valid chartData provided by AI for '{slide_title}' - skipping chart")
                logger.info(f"[CHART] If chart is needed, the AI would have provided structured chartData. No fallback extraction.")
                
            final_citations = self._resolve_citations(
                content,
                context,
                slide_title,
                log_prefix="SINGLE SLIDE",
            )
            footnotes = self._build_footnotes(
                final_citations,
                slide_title,
                log_prefix="SINGLE SLIDE",
            )
            cleaned_content, image_prompt = self._clean_content_and_image_prompt(content)

            return self._build_slide_content(
                slide_title,
                slide_type,
                cleaned_content,
                extracted_data=extracted_data,
                citations=final_citations,
                footnotes=footnotes,
                comparison=self._maybe_build_comparison(slide_title, content),
                suggested_image_prompt=image_prompt,
            )
            
        except Exception as e:
            logger.error(f"Failed to generate slide '{slide_title}': {e}")
            fallback_content = self._create_fallback_content(slide_title, slide_type, presentation_title)
            cleaned_fallback_content, fallback_image_prompt = self._clean_content_and_image_prompt(
                fallback_content
            )
            return self._build_slide_content(
                slide_title,
                slide_type,
                cleaned_fallback_content,
                suggested_image_prompt=fallback_image_prompt,
            )
