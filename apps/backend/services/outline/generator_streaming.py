import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, AsyncGenerator, List, Optional

from agents.ai.clients import get_client, get_max_tokens_for_model, invoke
from agents.config import PERPLEXITY_OUTLINE_MODEL, PRESENTATION_OUTLINE_MODEL
from agents import config as agents_config
from setup_logging_optimized import get_logger

from .models import OutlineOptions, ProgressUpdate, SlideContent
from .research_decision import get_current_date_context

logger = get_logger(__name__)


class OutlineGeneratorStreamingMixin:

    async def _generate_slides_streaming(
        self, outline_plan: dict, options: OutlineOptions, processed_files: dict
    ) -> AsyncGenerator[ProgressUpdate, None]:
        """Generate slides with streaming updates using parallel tasks."""
        model = self.slide_generator._get_model("content", options)
        client, model_name = get_client(model)
        
        # Get model's max token capability - NO LIMITS for comprehensive analysis
        model_max_tokens = get_max_tokens_for_model(model)
        # Allow MUCH larger responses for comprehensive, research-backed content
        slide_max_tokens = min(int(model_max_tokens * 0.5), 16000)  # ✅ DOUBLED from 8000 to 16000
        
        logger.info(f"Streaming slide generation (parallel) with {model}")
        
        total_slides = len(outline_plan["slides"])
        slide_types = outline_plan.get("slide_types", ["content"] * total_slides)
        presentation_context = outline_plan.get("context", "business")
        
        # Concurrency controls
        max_parallel = max(1, int(getattr(agents_config, "MAX_PARALLEL_SLIDES", 4)))
        delay_between = float(getattr(agents_config, "DELAY_BETWEEN_SLIDES", 0.0))
        semaphore = asyncio.Semaphore(max_parallel)
        
        # Shared structures
        results: List[Optional[SlideContent]] = [None] * total_slides
        completed = 0
        event_queue: asyncio.Queue[ProgressUpdate] = asyncio.Queue()
        
        async def generate_one(index: int) -> None:
            nonlocal completed
            try:
                slide_title = outline_plan["slides"][index]
                slide_type = slide_types[index]
                
                # Early progress notice for this slide
                await event_queue.put(ProgressUpdate(
                    stage="slide_progress",
                    message=f"Generating slide {index+1} of {total_slides}",
                    progress=20 + (index * 50 / max(total_slides, 1)),
                    metadata={"slide_index": index, "total_slides": total_slides}
                ))
                
                # Extract title string if slide_title is a dict
                if isinstance(slide_title, dict):
                    actual_title = slide_title.get('title', str(slide_title))
                    logger.debug(f"[SLIDE GEN] Slide {index+1} - extracted title from dict: {actual_title}")
                else:
                    actual_title = slide_title
                    logger.debug(f"[SLIDE GEN] Slide {index+1} - using string title: {actual_title}")
                
                # Minimal context for parallel generation
                context: Dict[str, Any] = {
                    'is_continuation': False,
                    'previous_slides': [],
                    'used_charts': [],
                    'part_number': None,
                    'presentation_context': presentation_context
                }
                if processed_files:
                    context['processed_files'] = processed_files
                    try:
                        self.slide_generator._add_file_suggestions_to_context(
                            context, processed_files, slide_type, actual_title
                        )
                    except Exception as e:
                        logger.warning(f"[SLIDE GEN] File suggestions failed for slide {index+1}: {e}")
                    
                    if processed_files.get('extracted_data') and 'extracted_data' not in context['processed_files']:
                        context['processed_files']['extracted_data'] = processed_files['extracted_data']

                    # Attach web citations from research findings - ONLY when content is HIGHLY relevant
                    try:
                        findings = (processed_files or {}).get("web_research_findings") or []
                        if findings:
                            context['web_citations'] = [
                                {'title': f.get('title'), 'url': f.get('url'), 'source': f.get('source')}
                                for f in findings[:3] if isinstance(f, dict)
                            ]
                    except Exception:
                        pass
                
                async with semaphore:
                    slide = await self.slide_generator._generate_single_slide(
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
                
                # Assign media for this slide (if any)
                if processed_files and processed_files.get('images'):
                    slide_list = [slide]
                    model_for_media = self._get_model("content", options)
                    try:
                        await self.media_manager.assign_media_to_slides_with_ai(
                            slide_list, processed_files, model_for_media
                        )
                        slide = slide_list[0]
                    except Exception as e:
                        logger.warning(f"[STREAMING] Media assignment failed for slide {index+1}: {e}")
                
                results[index] = slide
                completed += 1
                slide_data = self._slide_to_dict(slide)
                await event_queue.put(ProgressUpdate(
                    stage="slide_ready",
                    message=f"{slide.slide_type.title()} slide {index+1} complete",
                    progress=20 + (completed * 50 / max(total_slides, 1)),
                    metadata={
                        "slide_index": index,
                        "slide": slide_data,
                        "slide_object": slide
                    }
                ))
            except Exception as e:
                logger.error(f"[STREAMING] Error generating slide {index+1}: {e}")
                # Fallback slide
                fallback_title = str(outline_plan["slides"][index])
                slide_type = slide_types[index]
                fallback_content = self.slide_generator._create_fallback_content(
                    fallback_title if isinstance(fallback_title, str) else fallback_title.get('title', 'Slide'),
                    slide_type,
                    outline_plan.get("title", "Presentation")
                )
                cleaned_fallback_content, fallback_image_prompt = (
                    self.slide_generator._clean_content_and_image_prompt(fallback_content)
                )
                fallback_slide = self.slide_generator._build_slide_content(
                    fallback_title if isinstance(fallback_title, str) else fallback_title.get('title', 'Slide'),
                    slide_type,
                    cleaned_fallback_content,
                    suggested_image_prompt=fallback_image_prompt,
                )
                results[index] = fallback_slide
                completed += 1
                await event_queue.put(ProgressUpdate(
                    stage="slide_ready",
                    message=f"Fallback slide {index+1} complete",
                    progress=20 + (completed * 50 / max(total_slides, 1)),
                    metadata={
                        "slide_index": index,
                        "slide": self._slide_to_dict(fallback_slide),
                        "slide_object": fallback_slide
                    }
                ))
        
        # Create and schedule tasks
        tasks = []
        for i in range(total_slides):
            tasks.append(asyncio.create_task(generate_one(i)))
            if delay_between:
                await asyncio.sleep(delay_between)
        
        # Drain events as they arrive until tasks complete
        pending = set(tasks)
        while pending:
            # Yield any queued events immediately
            try:
                update = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                yield update
            except asyncio.TimeoutError:
                pass
            # Update pending set
            done, pending = await asyncio.wait(pending, timeout=0.0, return_when=asyncio.FIRST_COMPLETED)
            # Re-add incomplete tasks to pending
            pending = set(t for t in tasks if not t.done())
        
        # Yield remaining events in queue
        while not event_queue.empty():
            yield await event_queue.get()

    async def _generate_slides_streaming_with_perplexity(self, options: OutlineOptions):
        """Generate slides one-by-one with Perplexity for true streaming"""
        logger.debug(f"[STREAMING] ⚠️⚠️⚠️ STARTING STREAMING GENERATION ⚠️⚠️⚠️")
        logger.debug(f"[STREAMING] detail_level = {options.detail_level}")
        logger.debug(f"[STREAMING] Expected: 'detailed' for detailed mode, 'standard' for presentation")
        
        if options.detail_level == 'detailed':
            logger.debug(f"[STREAMING] ✅ DETAILED MODE ACTIVE - will generate 250-500+ words per slide")
        else:
            logger.debug(f"[STREAMING] ✅ PRESENTATION MODE ACTIVE - will generate MAX 50 words per slide")
        
        # First, generate a simple outline structure (titles + types) quickly
        slide_count = options.slide_count
        if slide_count is None:
            # Align default slide count with detail level
            # PRESENTATION MODE: More slides with less content each = better flow
            default_map = {
                'quick': 5,      # Was 3 - spread content more
                'standard': 10,  # Was 6 - spread content across more slides for presentation
                'detailed': 10   # Detailed keeps same - dense content per slide
            }
            slide_count = default_map.get((options.detail_level or 'standard'), 10)
            # Hard clamp to supported bounds
            slide_count = max(1, min(20, slide_count))

        # NOTE: Removed forced callout injection - let AI decide based on content
        # User's request should drive structure, not arbitrary rules

        context_instruction = ""
        if options.style_context:
            context_instruction = (
                f"\nContext:\n{options.style_context}\n"
                "Follow any explicit structure or questions in the context.\n"
            )

        outline_prompt = f"""Create a presentation outline for:
{options.prompt}
{context_instruction}

Return JSON:
{{
  "title": "<Deck Title>",
  "slides": ["<Slide Title 1>", "<Slide Title 2>", "..."],
  "slide_types": ["content", "..."]
}}

- Create exactly {slide_count} slides.
- Keep titles specific and engaging.
- Use slide_types when useful (title, agenda, content, conclusion)."""

        try:
            # Get quick outline structure - use mode-appropriate model
            from agents.ai.clients import get_client
            outline_model = PRESENTATION_OUTLINE_MODEL if options.detail_level != 'detailed' else PERPLEXITY_OUTLINE_MODEL
            logger.debug(f"[STREAMING] Using {outline_model} for outline structure (detail_level={options.detail_level})")
            client, model_name = get_client(outline_model, wrap_with_instructor=False)
            
            # Use asyncio to run the synchronous API call in a thread executor
            # Mode-specific search parameters
            if options.detail_level != 'detailed':
                # Presentation mode: minimal search
                search_params = {
                    "return_citations": True,
                    "search_recency_filter": "week",
                    "search_domain_filter": ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"],
                    "num_search_results": 6,
                }
                logger.info("[STREAMING] Using minimal search for presentation mode (6 results, 1 week)")
            else:
                # Detailed mode: comprehensive search
                search_params = {
                    "return_citations": True,
                    "search_recency_filter": "month",
                    "search_domain_filter": ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"],
                    "num_search_results": 15,
                }
            
            loop = asyncio.get_event_loop()
            # Use invoke to support both OpenAI and Anthropic clients
            # Only pass extra_body for Perplexity models (not Claude/Anthropic)
            invoke_kwargs = {
                "client": client,
                "model": model_name,
                "messages": [{"role": "user", "content": outline_prompt}],
                "response_model": None,  # Free-form text response
                "temperature": 0.2,
                "max_tokens": 1000
            }
            # Only add extra_body for Perplexity models
            if model_name.startswith("perplexity-") or "sonar" in model_name:
                invoke_kwargs["extra_body"] = search_params
            
            outline_text = await loop.run_in_executor(
                None,  # Use default thread pool
                lambda: invoke(**invoke_kwargs)
            )
            
            # Parse the outline
            import json
            import re
            match = re.search(r'{[\s\S]*}', outline_text)
            if match:
                outline_data = json.loads(match.group(0))
                presentation_title = outline_data["title"]
                slide_titles = outline_data["slides"]
                slide_types = outline_data.get("slide_types") or ["content"] * len(slide_titles)
            else:
                # Fallback if parsing fails
                presentation_title = "Presentation"
                slide_titles = [f"Slide {i+1}" for i in range(slide_count)]
                slide_types = ["content"] * slide_count
                
        except Exception as e:
            logger.error(f"Failed to get outline structure: {e}")
            # Fallback structure with proper count
            presentation_title = "Presentation"
            slide_titles = [f"Slide {i+1}" for i in range(slide_count)]
            slide_types = ["content"] * slide_count
        
        logger.debug(f"[STREAMING] Got outline: {len(slide_titles)} slides")
        
        # Emit the outline structure
        yield ProgressUpdate(
            stage="outline_ready",
            message="Structure ready",
            progress=20,
            metadata={
                "title": presentation_title,
                "slide_count": len(slide_titles),
                "slide_titles": slide_titles,
                "slide_types": slide_types
            }
        )
        
        # Only announce theme generation started; actual call happens via /api/theme/from-outline
        yield ProgressUpdate(
            stage="theme_generation_started",
            message="Generating theme...",
            progress=25,
            metadata={
                "title": presentation_title,
                "slide_count": len(slide_titles)
            }
        )
        
        # Generate slides in parallel for much faster streaming
        slides = [None] * len(slide_titles)  # Pre-allocate slots
        generation_start_time = time.time()
        
        async def generate_single_slide(idx, slide_title, slide_type):
            """Generate a single slide with hybrid approach: Perplexity research → Haiku narrative"""
            try:
                # Import dependencies at function start
                import asyncio
                from agents.ai.clients import get_client, invoke
                import re
                
                # Get event loop for async operations
                loop = asyncio.get_event_loop()
                
                # Define detail_mode at the start for use throughout this function
                detail_mode = options.detail_level or 'standard'
                
                # Add staggered delay to create more natural streaming appearance
                stagger_delay = idx * 0.5  # 500ms delay between starts
                if stagger_delay > 0:
                    await asyncio.sleep(stagger_delay)
                
                logger.debug(f"[PARALLEL] Starting slide {idx+1}: {slide_title} (type={slide_type}, mode={detail_mode}) at {time.time()}")
                
                # PHASE 1: Research with Perplexity (get facts + citations)
                perplexity_research = None
                research_citations = []

                skip_research = not options.enable_research

                if skip_research:
                    logger.info(f"[SKIP RESEARCH] Slide {idx+1} ({slide_title}): research disabled")

                if slide_type not in ["title", "quote", "stat", "divider", "transition"] and not skip_research:
                    # Research content slides with Perplexity
                    perplexity_client, perplexity_model = get_client('perplexity-sonar', wrap_with_instructor=False)

                    # Build comprehensive context including conversation details
                    context_parts = [options.prompt]
                    if options.style_context and options.style_context.strip():
                        # Extract custom requirements from style context (e.g., financial details, specific asks)
                        context_parts.append(options.style_context.strip())

                    full_context = "\n\n".join(context_parts)

                    today_line = get_current_date_context()

                    research_prompt = f"""Research this slide topic and provide rich, data-heavy facts with sources.
{today_line}

Presentation: {presentation_title}
Slide: {slide_title}
Context: {full_context}

RESEARCH DEPTH REQUIREMENTS:
- Provide key facts with quantitative data and sources
- Include a compact data appendix sized to the topic
- Use a few points for sparse topics; include full series for long histories
- Prefer time series, benchmarks, and category breakdowns
- Always include units and time ranges
"""
                    
                    logger.info(f"[PERPLEXITY RESEARCH] Slide {idx+1} ({slide_title}): Including style_context in research prompt")
                    logger.debug(f"[PERPLEXITY RESEARCH] Full context length: {len(full_context)} chars")

                    research_max_tokens = 2500 if detail_mode == 'detailed' else 1400
                    research_num_results = 12 if detail_mode == 'detailed' else 8
                    research_recency = "month" if detail_mode == 'detailed' else "week"

                    research_result = await loop.run_in_executor(
                        None,
                        lambda: invoke(
                            perplexity_client,
                            perplexity_model,
                            [{"role": "user", "content": research_prompt}],
                            response_model=None,
                            temperature=0.2,
                            max_tokens=research_max_tokens,
                            extra_body={
                                "return_citations": True,
                                "search_recency_filter": research_recency,
                                "num_search_results": research_num_results
                            }
                        )
                    )
                    
                    # Extract research and citations
                    if isinstance(research_result, dict):
                        perplexity_research = research_result.get("content", "")
                        research_citations = research_result.get("citations", [])
                        logger.debug(
                            "[STREAMING] Slide %s: %s citations from research phase",
                            idx + 1,
                            len(research_citations),
                        )
                    else:
                        perplexity_research = research_result

                # PHASE 2: Generate slide content with a minimal prompt
                from agents.prompts.generation.outline_prompts import get_slide_content_prompt
                slide_context = {
                    'detail_level': options.detail_level,
                    'context': options.style_context,
                }
                slide_prompt = get_slide_content_prompt(
                    slide_title,
                    slide_type,
                    options.prompt,
                    presentation_title,
                    slide_title,
                    slide_context,
                    ''
                )
                if perplexity_research:
                    slide_prompt = slide_prompt + "\n\nResearch notes:\n" + str(perplexity_research)

                max_tokens_for_slide = 1600 if detail_mode == 'detailed' else 400
                slide_temperature = 0.3 if detail_mode == 'detailed' else 0.4
                slide_search_params = {
                    'return_citations': bool(options.enable_research),
                    'search_recency_filter': 'month' if detail_mode == 'detailed' else 'week',
                    'search_domain_filter': ['-youtube.com', '-youtu.be', '-www.youtube.com', '-m.youtube.com'],
                    'num_search_results': 15 if detail_mode == 'detailed' else 6,
                }
                if not options.enable_research:
                    slide_search_params = {'return_citations': False, 'num_search_results': 0}
                # Use asyncio to run the synchronous API call in a thread executor
                loop = asyncio.get_event_loop()
                # Use invoke to support both OpenAI and Anthropic clients
                # Only pass extra_body for Perplexity models (not Claude/Anthropic)
                invoke_kwargs = {
                    "client": client,
                    "model": model_name,
                    "messages": [{"role": "user", "content": slide_prompt}],
                    "response_model": None,  # Free-form text response
                    "temperature": slide_temperature,
                    "max_tokens": max_tokens_for_slide
                }
                # Only add extra_body for Perplexity models
                if model_name.startswith("perplexity-") or "sonar" in model_name:
                    invoke_kwargs["extra_body"] = slide_search_params
                
                result = await loop.run_in_executor(
                    None,  # Use default thread pool
                    lambda: invoke(**invoke_kwargs)
                )
                logger.debug(f"[PARALLEL] API call completed for slide {idx+1}")

                # Extract content and citations from invoke response
                # invoke() returns dict {"content": ..., "citations": [...]} when citations found
                citations = []
                slide_content = result
                
                # Haiku returns string - use Perplexity citations from research phase
                if isinstance(result, dict):
                    slide_content = result.get("content", "")
                    citations = result.get("citations", [])
                elif isinstance(result, str):
                    slide_content = result
                    citations = research_citations  # Use citations from Perplexity research phase
                else:
                    slide_content = str(result)
                    citations = research_citations
                
                logger.debug(
                    "[STREAMING] Slide %s: %s citations applied",
                    idx + 1,
                    len(citations),
                )
                
                cleaned_content, image_prompt = self.slide_generator._clean_content_and_image_prompt(slide_content)

                footnotes = []
                if citations:
                    footnotes = self.slide_generator._build_footnotes(
                        citations,
                        slide_title,
                        log_prefix="STREAMING",
                    )

                extracted_data = self.slide_generator._build_annotations_payload(
                    slide_title,
                    citations,
                    footnotes,
                )

                slide = self.slide_generator._build_slide_content(
                    slide_title,
                    slide_type or "content",
                    cleaned_content,
                    extracted_data=extracted_data,
                    citations=citations,
                    footnotes=footnotes,
                    suggested_image_prompt=image_prompt,
                )
                
                logger.debug(f"[PARALLEL] Completed slide {idx+1}: {slide_title}")
                return idx, slide
                
            except Exception as e:
                logger.error(f"[PARALLEL] Failed to generate slide {idx+1}: {e}")
                # Create fallback slide
                fallback_content = f"Content for {slide_title}"
                cleaned_fallback_content, fallback_image_prompt = (
                    self.slide_generator._clean_content_and_image_prompt(fallback_content)
                )
                fallback_slide = self.slide_generator._build_slide_content(
                    slide_title,
                    "content",
                    cleaned_fallback_content,
                    suggested_image_prompt=fallback_image_prompt,
                )
                return idx, fallback_slide
        
        # Create tasks for parallel generation (generate all slides simultaneously!)
        max_concurrent = min(len(slide_titles), 12)  # Up to 12 concurrent, or all slides if fewer
        semaphore = asyncio.Semaphore(max_concurrent)  # Generate all slides at once!
        
        async def generate_with_semaphore(idx, slide_title):
            async with semaphore:
                s_type = slide_types[idx] if idx < len(slide_types) else "content"
                return await generate_single_slide(idx, slide_title, s_type)
        
        # Start all tasks (create actual Task objects)
        tasks = [asyncio.create_task(generate_with_semaphore(idx, title)) for idx, title in enumerate(slide_titles)]
        
        # Process completed slides in real-time as they finish
        completed = 0
        pending_tasks = set(tasks)
        
        logger.info(f"[STREAMING DEBUG] Starting to process {len(tasks)} parallel tasks")
        
        # FIXED: Use asyncio.as_completed for true streaming
        logger.info(f"[STREAMING DEBUG] Using as_completed for real-time yielding...")
        
        for task in asyncio.as_completed(tasks):
            try:
                idx, slide = await task
                slides[idx] = slide
                completed += 1
                
                # Stream the slide immediately
                slide_dict = self._slide_to_dict(slide)
                logger.debug(f"[REAL-TIME] Yielding slide {idx+1}: {slide.title} (completed at {time.time()})")
                logger.debug(f"[TIMING] Slide {idx+1} generation took {time.time() - generation_start_time:.2f}s from slide generation start")
                
                yield ProgressUpdate(
                    stage="slide_ready",
                    message=f"Slide {idx+1} ready",
                    progress=25 + (completed * 65 / len(slide_titles)),
                    metadata={
                        "slide_index": idx,
                        "slide": slide_dict,
                        "slide_object": slide
                    }
                )
                
                logger.debug(f"[REAL-TIME] Successfully yielded slide {idx+1} to frontend at {time.time()}!")
                
                # Force immediate flush to ensure real-time streaming
                await asyncio.sleep(0.1)  # Small delay to make streaming more visible
                
            except Exception as e:
                logger.error(f"[REAL-TIME] Error processing completed task: {e}")
                completed += 1
        
        logger.info(f"[STREAMING DEBUG] All {completed} slides yielded in real-time")
        
        logger.info(f"[STREAMING DEBUG] Completed processing all {len(tasks)} tasks")
        
        # EARLY COMPLETE: emit minimal completion event immediately to unblock caller
        try:
            yield ProgressUpdate(
                stage="complete",
                message="Generation complete!",
                progress=100,
                metadata={
                    "result": {
                        "id": str(uuid.uuid4()),
                        "title": presentation_title,
                        "slides": [],  # Omit heavy serialization; caller has slide updates already
                        "metadata": {"generated_with": "perplexity-streaming"}
                    }
                }
            )
        finally:
            logger.debug(f"[STREAMING] True streaming generation complete: {len(slides)} slides at {time.time()}")
            logger.debug(f"[STREAMING] Perplexity method finishing - should trigger early return")
            return
