import asyncio
from typing import List, Dict, Any, Optional

from agents.ai.clients import get_client, invoke, get_max_tokens_for_model
from agents.prompts.generation.outline_prompts import build_structured_slide_output_prompt
from .models import SlideContent, OutlineOptions, ChartData, TypedSlideResponse, StructuredSlideOutput
from setup_logging_optimized import get_logger
from agents import config as agents_config
from .slide_generator_validation import TITLE_SLIDE_MAX_WORDS

logger = get_logger(__name__)

SLIDE_MAX_TOKENS_MULTIPLIER = float(getattr(agents_config, "SLIDE_MAX_TOKENS_MULTIPLIER", 1.0))
PRESENTATION_MODE_MAX_TOKENS_CAP = int(getattr(agents_config, "PRESENTATION_MODE_MAX_TOKENS_CAP", 2000))
SIMPLE_SLIDE_MAX_TOKENS = int(getattr(agents_config, "SIMPLE_SLIDE_MAX_TOKENS", 1200))


class SlideGeneratorFlowMixin:
    def _get_slide_token_limit(self, options: OutlineOptions, model: str) -> int:
        model_max_tokens = get_max_tokens_for_model(model)
        if options.detail_level == "detailed":
            slide_max_tokens = int(model_max_tokens * SLIDE_MAX_TOKENS_MULTIPLIER)
            logger.info("Using UNLIMITED tokens (%s) for detailed mode with %s", slide_max_tokens, model)
            return slide_max_tokens
        slide_max_tokens = min(
            int(model_max_tokens * SLIDE_MAX_TOKENS_MULTIPLIER),
            PRESENTATION_MODE_MAX_TOKENS_CAP,
        )
        logger.info("Using capped tokens (%s) for presentation mode with %s", slide_max_tokens, model)
        return slide_max_tokens

    def _should_use_structured_output(self, model_name: str) -> bool:
        return model_name.startswith("perplexity-") or "sonar" in model_name

    def _normalize_generated_content(
        self,
        content: str,
        slide_type: str,
        detail_level: Optional[str],
        *,
        allow_raw_types: bool,
    ) -> str:
        if slide_type == "title":
            logger.info("[TITLE VALIDATION] Validating title slide (mode: %s)", detail_level)
            return self._validate_title_slide_content(content, max_words=TITLE_SLIDE_MAX_WORDS)
        if allow_raw_types and slide_type in {"stat", "quote", "divider", "transition"}:
            return content.strip()
        return self._ensure_proper_formatting(content)

    def _retry_on_placeholders_text(
        self,
        content: str,
        slide_title: str,
        slide_type: str,
        prompt: str,
        context: Optional[Dict[str, Any]],
        client,
        model_name: str,
    ) -> str:
        if not self._contains_placeholders(content) or slide_type == "title":
            return content
        logger.warning("Placeholders detected in slide '%s', retrying with guidance...", slide_title)
        repair_instruction = self._build_placeholder_repair_instruction(context)
        retry_content = invoke(
            client=client,
            model=model_name,
            messages=[{"role": "user", "content": prompt + repair_instruction}],
            response_model=None,
            max_tokens=SIMPLE_SLIDE_MAX_TOKENS,
            temperature=0.5,
        )
        content = self._ensure_proper_formatting(retry_content)
        if self._contains_placeholders(content):
            logger.warning("Placeholders remain after retry for slide '%s'", slide_title)
        return content

    def _retry_on_placeholders_typed(
        self,
        content: str,
        slide_title: str,
        slide_type: str,
        prompt: str,
        context: Optional[Dict[str, Any]],
        client,
        model_name: str,
        max_tokens: int,
        response: TypedSlideResponse,
    ) -> tuple[str, TypedSlideResponse]:
        if not self._contains_placeholders(content) or slide_type == "title":
            return content, response
        logger.warning("Placeholders detected in slide '%s', retrying generation...", slide_title)
        repair_instruction = self._build_placeholder_repair_instruction(context)
        retry_response = invoke(
            client=client,
            model=model_name,
            messages=[{"role": "user", "content": prompt + repair_instruction}],
            response_model=TypedSlideResponse,
            max_tokens=max_tokens,
            temperature=0.5,
        )
        content = self._ensure_proper_formatting(retry_response.content)
        if self._contains_placeholders(content):
            logger.warning("Placeholders remain after retry for slide '%s'", slide_title)
        return content, retry_response

    def _parse_structured_output(
        self,
        result: Any,
    ) -> tuple[str, Optional[List[Dict[str, Any]]], Optional[str], List[Dict[str, Any]]]:
        model_obj = result
        citations: List[Dict[str, Any]] = []
        if isinstance(result, dict):
            model_obj = result.get("model", result)
            citations = result.get("citations", []) or []
        content = model_obj.content if hasattr(model_obj, "content") else str(model_obj)
        chart_data = model_obj.chartData if hasattr(model_obj, "chartData") else None
        chart_type = model_obj.chartType if hasattr(model_obj, "chartType") else None
        return content, chart_data, chart_type, citations

    def _build_structured_extracted_data(
        self,
        slide_title: str,
        chart_type: Optional[str],
        chart_data: Optional[List[Dict[str, Any]]],
    ) -> Optional[Dict[str, Any]]:
        if not chart_type or not chart_data:
            return None
        try:
            if not self.chart_generator._validate_unit_consistency(chart_data):
                logger.warning(
                    "[STRUCTURED CHART] REJECTED - Mixed units detected for '%s'",
                    slide_title,
                )
                return None
            chart_obj = ChartData(
                chart_type=chart_type,
                data=chart_data,
                title=slide_title,
                metadata=None,
            )
            extracted_data = self.chart_generator.convert_chart_data_to_extracted_data(
                chart_obj,
                slide_title,
            )
            if extracted_data:
                logger.info(
                    "[STRUCTURED CHART] ✓ Created %s chart with %s points",
                    chart_type,
                    len(chart_data),
                )
            return extracted_data
        except Exception as exc:
            logger.warning("[STRUCTURED CHART] Failed to create chart: %s", exc)
            return None
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

        slide_max_tokens = self._get_slide_token_limit(options, model)
        
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
            
            actual_title = self._resolve_slide_title(slide_title)
            context = self._build_parallel_context(
                slide_title,
                slide_type,
                index,
                total_slides,
                presentation_context,
                options,
                processed_files,
            )
            
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
        prompt = self._create_slide_prompt(
            slide_title,
            slide_type,
            options,
            presentation_title,
            context,
        )

        chart_descriptions = ""
        if hasattr(self.chart_generator, "get_chart_type_descriptions"):
            chart_descriptions = self.chart_generator.get_chart_type_descriptions()
        elif hasattr(self.chart_generator, "get_chart_descriptions"):
            chart_descriptions = self.chart_generator.get_chart_descriptions()

        model = self._get_model("content", options)
        client, model_name = get_client(model)
        
        # Use structured outputs for Perplexity to get clean chart data
        use_structured = self._should_use_structured_output(model_name)
        
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
                
                content, chart_data_from_api, chart_type_from_api, slide_citations = self._parse_structured_output(result)
                if slide_citations and context is not None:
                    context["web_citations"] = slide_citations
                
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
            content = self._normalize_generated_content(
                content,
                slide_type,
                options.detail_level,
                allow_raw_types=False,
            )
            
            # Check for placeholders and retry if found
            content = self._retry_on_placeholders_text(
                content,
                slide_title,
                slide_type,
                prompt,
                context,
                client,
                model_name,
            )

            # Use structured chart data if available (from Perplexity)
            extracted_data = self._build_structured_extracted_data(
                slide_title,
                chart_type_from_api,
                chart_data_from_api,
            )
            
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
                extracted_data = self._build_annotations_payload(
                    slide_title,
                    slide_citations,
                    footnotes,
                )

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
            
            prompt = self._create_slide_prompt(
                slide_title,
                slide_type,
                options,
                presentation_title,
                context,
            )
            
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
            
            content = self._normalize_generated_content(
                response.content,
                slide_type,
                options.detail_level,
                allow_raw_types=True,
            )
            
            # Check for placeholders and retry if found
            content, response = self._retry_on_placeholders_typed(
                content,
                slide_title,
                slide_type,
                prompt,
                context,
                client,
                model_name,
                max_tokens,
                response,
            )
            
            # Generate chart if the AI decided it needs one
            chart_data = None
            extracted_data = None
            if response.requires_chart and response.chart_type and response.chart_data:
                logger.info("[CHART DEBUG] AI decided chart needed: %s", response.chart_type)
                logger.info("[CHART DEBUG] AI generated %s data points", len(response.chart_data))
                
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
