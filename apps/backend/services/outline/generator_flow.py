import asyncio
import re
import time
from typing import Any, AsyncGenerator, Dict, Optional

from agents.config import USE_PERPLEXITY_FOR_OUTLINE
from agents.research import OutlineResearchAgent
from setup_logging_optimized import get_logger

from .models import OutlineOptions, OutlineResult, ProgressUpdate
from .research_decision import should_research, get_current_date_context

logger = get_logger(__name__)


class OutlineGeneratorFlowMixin:

    async def generate(self, options: OutlineOptions, progress_callback=None) -> OutlineResult:
        """Generate complete outline"""
        start_time = time.time()

        logger.info(f"Starting outline generation: slides={options.slide_count}, detail={options.detail_level}")

        # INTELLIGENT RESEARCH DECISION: Analyze prompt to determine if research is needed
        try:
            needs_research, research_queries, reason = await should_research(
                options.prompt,
                options.style_context
            )
            options.enable_research = needs_research
            options.research_queries = research_queries
            logger.info(f"[RESEARCH DECISION] Research {'ENABLED' if needs_research else 'DISABLED'}: {reason}")
            if progress_callback and needs_research:
                await self._call_progress(progress_callback, ProgressUpdate(
                    stage="research_decision",
                    message=f"Research needed: {reason}",
                    progress=3
                ))
        except Exception as e:
            logger.warning(f"[RESEARCH DECISION] Failed to analyze prompt, defaulting to research: {e}")
            options.enable_research = True

        # Fast-path: Perplexity/Claude single-pass outline generation (mode-optimized)
        # Use different models based on detail level for optimized performance
        try:
            use_pplx = (
                USE_PERPLEXITY_FOR_OUTLINE or
                (options.model and isinstance(options.model, str) and (options.model.startswith("perplexity-") or options.model.startswith("claude-")))
            )
            logger.debug(f"[DEBUG] USE_PERPLEXITY_FOR_OUTLINE={USE_PERPLEXITY_FOR_OUTLINE}, detail_level={options.detail_level}, use_fast_path={use_pplx}")
        except Exception as e:
            logger.warning(f"[DEBUG] Exception in fast-path check: {e}")
            use_pplx = USE_PERPLEXITY_FOR_OUTLINE
        if use_pplx:
            try:
                if progress_callback:
                    await self._call_progress(progress_callback, ProgressUpdate(
                        stage="planning", message="Asking Perplexity for a complete outline...", progress=15
                    ))
                logger.info("[OUTLINE] Using Perplexity fast-path for outline generation")
                pplx_result = await self._generate_with_perplexity(options)
                if pplx_result:
                    if progress_callback:
                        await self._call_progress(progress_callback, ProgressUpdate(
                            stage="complete", message="Outline generated via Perplexity", progress=100
                        ))
                    logger.info(f"Outline generation completed via Perplexity in {time.time() - start_time:.2f}s")
                    logger.info(f"[OUTLINE] Fast-path SUCCESS - returning {len(pplx_result.slides)} slides directly")
                    return pplx_result
                else:
                    logger.warning("[OUTLINE] Fast-path returned None - falling back to standard flow")
            except Exception as e:
                logger.warning(f"Perplexity fast-path failed, falling back to standard flow: {e}")
                import traceback
                logger.warning(f"Traceback: {traceback.format_exc()}")
        
        # Process uploaded files
        processed_files = await self._process_files(options, progress_callback)
        
        # Extract brand guidelines if present
        brand_guidelines = None
        if processed_files and processed_files.get('brand_guidelines'):
            brand_guidelines = processed_files['brand_guidelines']
            logger.info(f"[GENERATE] Found brand guidelines with {len(brand_guidelines.get('colors', []))} colors")
        
        # Log extracted data
        if processed_files and processed_files.get('extracted_data'):
            logger.info(f"[GENERATE] Extracted data available: {len(processed_files['extracted_data'])} items")
            for idx, data in enumerate(processed_files['extracted_data']):
                if isinstance(data, dict) and 'summary' in data:
                    logger.info(f"[GENERATE] Data item {idx}: {data['summary'].get('symbol', 'Unknown')} - ${data['summary'].get('currentPrice', 'N/A')}")
        else:
            logger.info("[GENERATE] No extracted data found in processed files")
        
        # Optional: Agent-based research prior to planning (non-stream path)
        research_findings = []
        if getattr(options, "enable_research", False):
            try:
                # Extract any URLs from the user prompt to prioritize
                seed_urls = re.findall(r"https?://[^\s)]+", options.prompt or "")
                # If the prompt contains explicit domains, pass them along as allowed domains
                allowed_domains = []
                try:
                    from urllib.parse import urlparse
                    for u in seed_urls:
                        try:
                            host = urlparse(u).netloc
                            if host:
                                h = host.lower()
                                if h.startswith('www.'):
                                    h = h[4:]
                                if h not in allowed_domains:
                                    allowed_domains.append(h)
                        except Exception:
                            continue
                except Exception:
                    allowed_domains = []

                agent = OutlineResearchAgent(per_query_results=8)  # ✅ DOUBLED research depth for comprehensive insights
                async for ev in agent.run(options.prompt, options.style_context, seed_urls=seed_urls, allowed_domains=allowed_domains or None):
                    if ev.get("type") == "research_complete":
                        research_findings = ev.get("findings", []) or []
                # Append concise insights to prompt for planning/content phases
                if research_findings:
                    try:
                        bullets = []
                        for f in research_findings[:8]:
                            title = f.get('title') or ''
                            summary = f.get('summary') or ''
                            bullets.append(f"• {title}: {summary}")
                        options.prompt += "\n\nResearch Insights (agent):\n" + "\n".join(bullets)
                    except Exception:
                        pass
            except Exception as _:
                # Non-blocking
                pass

        # Phase 1: Planning
        if progress_callback:
            await self._call_progress(progress_callback, ProgressUpdate(
                stage="planning", message="Creating structure...", progress=20
            ))
        
        outline_plan = await self.planner.create_plan(options, processed_files)
        logger.info(f"Plan created with {len(outline_plan.get('slides', []))} slides")

        # If PPTX slides exist and the user's prompt implies style-only edits, prefer PPTX slide titles
        preserve_pptx_content = False
        try:
            pptx_outlines = (processed_files or {}).get('pptx_outlines') or []
            if pptx_outlines:
                preserve_pptx_content = self._should_preserve_pptx_content(options.prompt)
                if preserve_pptx_content:
                    logger.info("[PPTX] Style-only intent detected; aligning plan titles to PPTX slide titles")
                    ppt = pptx_outlines[0]
                    ppt_titles = [s.get('title', f"Slide {i+1}") for i, s in enumerate(ppt.get('slides', []))]
                    if ppt_titles:
                        # Replace planned slides with the PPTX titles, keeping the length consistent
                        count = min(len(outline_plan.get('slides', [])), len(ppt_titles))
                        outline_plan['slides'] = ppt_titles[:count]
                        # Ensure slide_types length matches
                        st = outline_plan.get('slide_types', [])
                        if len(st) != count:
                            outline_plan['slide_types'] = (st[:count] + ["content"] * (count - len(st)))
                        # Mark this in processed_files so slide generator knows to preserve content
                        processed_files['preserve_pptx_content'] = True
        except Exception:
            pass
        
        # Rely on prompt-level enforcement only; do not mutate counts in code
        # Phase 2: Generate slides
        if progress_callback:
            await self._call_progress(progress_callback, ProgressUpdate(
                stage="generating", message="Generating slides with charts...", progress=50
            ))
        
        # Pass research findings through processed_files so slide generation can ground content
        if processed_files is None:
            processed_files = {}
        if research_findings:
            processed_files["web_research_findings"] = research_findings

        # If we should preserve PPTX content, create slides directly from it
        if preserve_pptx_content and pptx_outlines:
            logger.info("[PPTX] Creating slides directly from PPTX content")
            slides = self._create_slides_from_pptx(pptx_outlines[0], outline_plan)
        else:
            slides = await self.slide_generator.generate_slides_with_charts(
                outline_plan, options, progress_callback, processed_files
            )
        
        # Phase 3: Process media and charts
        slides = await self._process_media_and_charts(slides, processed_files, options)
        
        # Phase 4: Research enhancement (if enabled)
        if options.enable_research:
            if progress_callback:
                await self._call_progress(progress_callback, ProgressUpdate(
                    stage="researching", message="Enhancing with research...", progress=90
                ))
            slides = await self._enhance_research(slides, options)
        
        # Final validation
        slides = self._final_validation(slides, options)
        
        if progress_callback:
            await self._call_progress(progress_callback, ProgressUpdate(
                stage="complete", message="Outline generated!", progress=100
            ))
        
        # Create final result
        result = OutlineResult(
            title=outline_plan["title"],
            slides=slides,
            metadata={
                "detail_level": options.detail_level,
                "requested_slide_count": options.slide_count,
                "actual_slide_count": len(slides),
                "files_processed": len(options.files) if options.files else 0,
                'generation_time': time.time() - start_time,
                'model': self._get_model("planning", options),
                'slide_count': len(slides),
                'brand_guidelines': brand_guidelines
            },
            generation_time=time.time() - start_time
        )
        
        logger.info(f"Outline generation completed in {result.metadata['generation_time']:.2f}s")
        
        return result

    async def stream_generation(self, options: OutlineOptions) -> AsyncGenerator[ProgressUpdate, None]:
        """Stream outline generation progress"""

        async def streaming_generate():
            start_time = time.time()

            # INTELLIGENT RESEARCH DECISION: Analyze prompt to determine if research is needed
            try:
                needs_research, research_queries, reason = await should_research(
                    options.prompt,
                    options.style_context
                )
                options.enable_research = needs_research
                options.research_queries = research_queries
                logger.info(f"[RESEARCH DECISION] Research {'ENABLED' if needs_research else 'DISABLED'}: {reason}")
                if needs_research:
                    yield ProgressUpdate(
                        stage="research_decision",
                        message=f"Research needed: {reason}",
                        progress=2
                    )
            except Exception as e:
                logger.warning(f"[RESEARCH DECISION] Failed to analyze prompt, defaulting to research: {e}")
                options.enable_research = True

            # Decide on Perplexity fast-path early (respects explicit model)
            try:
                use_pplx_stream = USE_PERPLEXITY_FOR_OUTLINE or (options.model and options.model.startswith("perplexity-"))
                logger.debug(f"[DEBUG] USE_PERPLEXITY_FOR_OUTLINE={USE_PERPLEXITY_FOR_OUTLINE}, options.model={options.model}, use_pplx_stream={use_pplx_stream}")
            except Exception as e:
                logger.warning(f"[DEBUG] Exception in Perplexity check: {e}")
                use_pplx_stream = USE_PERPLEXITY_FOR_OUTLINE

            # Process files first if any
            processed_files = None
            brand_guidelines = None
            if options.files:
                yield ProgressUpdate(stage="processing_files", message="Analyzing files...", progress=5)
                await asyncio.sleep(0.1)
                
                # Process files using streaming method
                processed_files = await self._process_files_streaming(options)
                
                # Extract brand guidelines if present
                if processed_files and processed_files.get('brand_guidelines'):
                    brand_guidelines = processed_files['brand_guidelines']
                    logger.info(f"[STREAM GEN] Found brand guidelines with {len(brand_guidelines.get('colors', []))} colors")
                
                # Generate summary
                file_summary = self.media_manager.generate_file_summary(processed_files)
                
                yield ProgressUpdate(
                    stage="files_processed",
                    message="Files processed successfully",
                    progress=8,
                    metadata={
                        "file_summary": file_summary,
                        "file_count": len(options.files),
                        "processed_count": self.media_manager.count_processed_files(processed_files)
                    }
                )
                await asyncio.sleep(0.1)
            
            # Check if we should preserve PPTX content (before Perplexity)
            preserve_pptx_content = False
            pptx_outlines = None
            if processed_files:
                try:
                    pptx_outlines = processed_files.get('pptx_outlines') or []
                    if pptx_outlines:
                        preserve_pptx_content = self._should_preserve_pptx_content(options.prompt)
                        if preserve_pptx_content:
                            logger.info("[PPTX] Will preserve PPTX content instead of using Perplexity")
                            use_pplx_stream = False  # Disable Perplexity for PPTX preservation
                except Exception as e:
                    logger.error(f"Error checking PPTX preservation: {e}")
            
            # If Perplexity is enabled, generate the full outline in one pass and stream synthesized updates
            logger.debug(f"[DEBUG] About to check use_pplx_stream={use_pplx_stream}")
            if use_pplx_stream:
                try:
                    logger.debug(f"[DEBUG] Using Perplexity for TRUE streaming generation")
                    yield ProgressUpdate(stage="planning", message="Creating structure (Perplexity)...", progress=15)
                    
                    # Generate slides one-by-one with Perplexity instead of generating complete outline
                    async for slide_update in self._generate_slides_streaming_with_perplexity(options):
                        logger.debug(f"[DEBUG] Yielding slide update immediately: {slide_update.stage}")
                        yield slide_update
                    
                    logger.debug(f"[DEBUG] Perplexity streaming completed successfully - RETURNING EARLY")
                    return  # Exit after streaming generation is complete
                except Exception as e:
                    logger.error(f"[DEBUG] Perplexity streaming failed with exception: {e}", exc_info=True)
                    logger.warning(f"Perplexity streaming failed, falling back to standard flow: {e}")
            
            # If we get here, either Perplexity streaming failed or was disabled
            # Fall back to the old batch method for compatibility
            if use_pplx_stream:
                try:
                    logger.debug(f"[DEBUG] Falling back to Perplexity batch generation")
                    yield ProgressUpdate(stage="planning", message="Creating structure (Perplexity batch)...", progress=15)
                    pplx_result = await self._generate_with_perplexity(options)
                    if pplx_result:
                        # Emit outline structure
                        try:
                            slide_titles = [s.title for s in pplx_result.slides]
                            yield ProgressUpdate(
                                stage="outline_ready",
                                message="Structure ready",
                                progress=20,
                                metadata={
                                    "title": pplx_result.title,
                                    "slide_count": len(pplx_result.slides),
                                    "slide_titles": slide_titles,
                                    "slide_types": [getattr(s, 'slide_type', 'content') for s in pplx_result.slides]
                                }
                            )
                            await asyncio.sleep(0)
                        except Exception:
                            pass
                        # Emit slide_ready events with streaming delays for progressive rendering
                        for idx, slide in enumerate(pplx_result.slides):
                            slide_dict = self._slide_to_dict(slide)
                            yield ProgressUpdate(
                                stage="slide_ready",
                                message=f"Slide {idx+1} ready",
                                progress=20 + ((idx + 1) * 50 / max(1, len(pplx_result.slides))),
                                metadata={
                                    "slide_index": idx,
                                    "slide": slide_dict,
                                    "slide_object": slide
                                }
                            )
                            # Add streaming delay between slides for progressive rendering
                            if idx < len(pplx_result.slides) - 1:  # Don't delay after the last slide
                                await asyncio.sleep(0.5)  # 500ms delay between slides
                        # Complete
                        slides_dict = [self._slide_to_dict(s) for s in pplx_result.slides]
                        yield ProgressUpdate(
                            stage="complete",
                            message="Generation complete!",
                            progress=100,
                            metadata={
                                "result": {
                                    "id": pplx_result.id,
                                    "title": pplx_result.title,
                                    "slides": slides_dict,
                                    "metadata": pplx_result.metadata
                                }
                            }
                        )
                        return
                except Exception as e:
                    yield ProgressUpdate(stage="error", message="Perplexity generation failed", progress=15, metadata={"error": str(e)})
                    # Fall back to standard flow below

            # Agent-based research (pre-planning) when enabled
            research_findings = []
            if options.enable_research:
                try:
                    agent = OutlineResearchAgent(per_query_results=4)
                    # Map simple progress milestones within 5-18 range before planning (20)
                    progress_map = {
                        'research_started': 6,
                        'research_plan': 8,
                        'research_search_results': 12,
                        'research_page_fetched': 14,
                        'research_synthesis': 16,
                        'research_complete': 18,
                    }
                    async for ev in agent.run(options.prompt, options.style_context):
                        ev_type = ev.get('type', 'research_event')
                        # Record findings on completion
                        if ev_type == 'research_complete':
                            research_findings = ev.get('findings', []) or []
                            # Append concise insights to prompt for planning/content phases
                            if research_findings:
                                try:
                                    bullets = []
                                    for f in research_findings[:8]:
                                        title = f.get('title') or ''
                                        summary = f.get('summary') or ''
                                        bullets.append(f"• {title}: {summary}")
                                    options.prompt += "\n\nResearch Insights (agent):\n" + "\n".join(bullets)
                                except Exception:
                                    pass
                        # Yield as progress updates so API can forward research_* events
                        yield ProgressUpdate(
                            stage=ev_type,
                            message=ev.get('message') or ev_type.replace('_', ' ').title(),
                            progress=progress_map.get(ev_type, 12),
                            metadata={k: v for k, v in ev.items() if k not in {'type'}}
                        )
                        await asyncio.sleep(0)
                except Exception as e:
                    yield ProgressUpdate(
                        stage="research_error",
                        message=f"Research error: {e}",
                        progress=12,
                        metadata={"error": str(e)}
                    )
                    await asyncio.sleep(0)

            # Make research findings available to slide generation in streaming path
            if research_findings:
                if not processed_files:
                    processed_files = {}
                processed_files["web_research_findings"] = research_findings

            # Planning phase
            yield ProgressUpdate(stage="planning", message="Creating structure...", progress=10)
            await asyncio.sleep(0.1)
            
            outline_plan = await self.planner.create_plan(options, processed_files)
            
            # If we detected PPTX preservation intent, update the outline plan
            if preserve_pptx_content and pptx_outlines:
                try:
                    ppt = pptx_outlines[0]
                    ppt_titles = [s.get('title', f"Slide {i+1}") for i, s in enumerate(ppt.get('slides', []))]
                    if ppt_titles:
                        # Replace planned slides with the PPTX titles
                        count = len(ppt_titles)
                        outline_plan['slides'] = ppt_titles[:count]
                        # Ensure slide_types length matches
                        outline_plan['slide_types'] = ["content"] * count
                        # Mark this in processed_files
                        processed_files['preserve_pptx_content'] = True
                        logger.info(f"[PPTX] Updated outline plan with {count} PPTX slides")
                except Exception as e:
                    logger.error(f"Error updating outline plan for PPTX: {e}")

            # Prefer content on slide 1 if outline slide 1 is content-heavy; otherwise allow title
            try:
                total_slides_count = len(outline_plan.get("slides", []))
                if total_slides_count > 3:
                    slide_types = outline_plan.get("slide_types", [])
                    if not slide_types or len(slide_types) != total_slides_count:
                        slide_types = ["content"] * total_slides_count
                    # If first slide title string is long/descriptive, keep as content
                    first = outline_plan["slides"][0]
                    first_title = first.get('title') if isinstance(first, dict) else str(first)
                    is_content_heavy = isinstance(first_title, str) and (len(first_title.split()) >= 6)
                    slide_types[0] = "content" if is_content_heavy else slide_types[0] or "title"
                    outline_plan["slide_types"] = slide_types
            except Exception:
                pass
            
            # Extract slide titles as strings (handle both string and dict formats)
            slide_titles = []
            for slide in outline_plan["slides"]:
                if isinstance(slide, dict):
                    slide_titles.append(slide.get('title', str(slide)))
                else:
                    slide_titles.append(slide)
            
            yield ProgressUpdate(
                stage="outline_ready",
                message="Structure ready",
                progress=20,
                metadata={
                    "title": outline_plan["title"],
                    "slide_count": len(outline_plan["slides"]),
                    "slide_titles": slide_titles,
                    "slide_types": outline_plan.get("slide_types", ["content"] * len(outline_plan["slides"]))
                }
            )
            await asyncio.sleep(0.2)
            
            # Generate slides with streaming
            slides = []
            total_slides = len(outline_plan["slides"])
            
            # If we should preserve PPTX content, create slides directly and emit them
            if preserve_pptx_content and pptx_outlines:
                logger.info("[PPTX] Creating slides directly from PPTX content in streaming")
                slides = self._create_slides_from_pptx(pptx_outlines[0], outline_plan)
                
                # Emit slide_ready events for each slide
                for idx, slide in enumerate(slides):
                    slide_dict = self._slide_to_dict(slide)
                    yield ProgressUpdate(
                        stage="slide_ready",
                        message=f"Slide {idx+1} ready",
                        progress=20 + ((idx + 1) * 50 / max(1, total_slides)),
                        metadata={
                            "slide_index": idx,
                            "slide": slide_dict,
                            "slide_object": slide
                        }
                    )
                    await asyncio.sleep(0.1)
            else:
                async for slide_update in self._generate_slides_streaming(outline_plan, options, processed_files):
                    if slide_update.stage == "slide_ready":
                        slides.append(slide_update.metadata["slide_object"])
                    yield slide_update
            
            # Process media and charts after all slides are generated
            slides = await self._process_media_and_charts(slides, processed_files, options)
            
            # Research enhancement
            if options.enable_research:
                yield ProgressUpdate(stage="researching", message="Enhancing with research...", progress=80)
                await asyncio.sleep(0.2)
                slides = await self._enhance_research(slides, options)
            
            # Complete
            result = OutlineResult(
                title=outline_plan["title"],
                slides=slides,
                metadata={
                    "detail_level": options.detail_level,
                    "brand_guidelines": brand_guidelines if 'brand_guidelines' in locals() else None,
                    "research_findings_count": len(research_findings) if options.enable_research else 0
                },
                generation_time=time.time() - start_time
            )
            
            # Convert slides and debug the result
            slides_dict = [self._slide_to_dict(slide) for slide in result.slides]
            
            yield ProgressUpdate(
                stage="complete",
                message="Generation complete!",
                progress=100,
                metadata={
                    "result": {
                        "id": result.id,
                        "title": result.title,
                        "slides": slides_dict,
                        "metadata": result.metadata
                    }
                }
            )
        
        async for update in streaming_generate():
            yield update
