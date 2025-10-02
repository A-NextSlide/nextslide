"""Outline generation service with streaming support"""

import asyncio
import json
import time
import uuid
import os
from typing import Dict, Any, Optional, List, AsyncGenerator
from dotenv import load_dotenv

from .models import (
    OutlineOptions, OutlineResult, SlideContent, 
    ProgressUpdate, ChartData
)
from .planner import OutlinePlanner
from .slide_generator import SlideGenerator
from .chart_generator import ChartGenerator
from .media_manager import MediaManager
from agents.ai.clients import get_client, invoke
from agents.config import (
    OUTLINE_PLANNING_MODEL, OUTLINE_CONTENT_MODEL, 
    OUTLINE_RESEARCH_MODEL,
    USE_PERPLEXITY_FOR_OUTLINE, PERPLEXITY_OUTLINE_MODEL
)
from agents.research import OutlineResearchAgent
from agents import config as agents_config
from agents.ai.clients import get_max_tokens_for_model
from services.openai_service import OpenAIService
from agents.generation.file_processor import create_file_processor
from setup_logging_optimized import get_logger
from services.pptx_text_extractor import extract_pptx_text_from_bytes

logger = get_logger(__name__)

# Load environment variables from .env file, overriding existing ones
load_dotenv(override=True)

# Initialize the assistant ID once
_assistant_id = os.getenv('OPENAI_ASSISTANT_ID')
if _assistant_id:
    logger.debug(f"[STARTUP] Assistant configured: {_assistant_id[:8]}...")  # Only show first 8 chars
else:
    logger.warning("[STARTUP] No OpenAI Assistant ID configured")

class OutlineGenerator:
    """Main orchestrator for outline generation"""
    
    def __init__(self, registry=None):
        """Initialize the generator with all components"""
        self.registry = registry
        self.chart_generator = ChartGenerator(registry)
        self.slide_generator = SlideGenerator(self.chart_generator)
        self.planner = OutlinePlanner()
        self.media_manager = MediaManager()
        
        logger.info(f"OutlineGenerator initialized with {len(self.chart_generator.chart_types)} chart types")
    
    async def generate(self, options: OutlineOptions, progress_callback=None) -> OutlineResult:
        """Generate complete outline"""
        start_time = time.time()
        
        logger.info(f"Starting outline generation: slides={options.slide_count}, detail={options.detail_level}")
        
        # Fast-path: Perplexity single-pass outline generation (optional)
        try:
            use_pplx = (USE_PERPLEXITY_FOR_OUTLINE or 
                        (options.model and isinstance(options.model, str) and options.model.startswith("perplexity-")))
            logger.info(f"[DEBUG] USE_PERPLEXITY_FOR_OUTLINE={USE_PERPLEXITY_FOR_OUTLINE}, options.model={options.model}, use_pplx={use_pplx}")
        except Exception as e:
            logger.warning(f"[DEBUG] Exception in Perplexity check: {e}")
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
                    return pplx_result
            except Exception as e:
                logger.warning(f"Perplexity fast-path failed, falling back to standard flow: {e}")
        
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
                import re
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

                agent = OutlineResearchAgent(per_query_results=4)
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
        outline_plan = outline_plan
        
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
            
            # Decide on Perplexity fast-path early (respects explicit model)
            try:
                use_pplx_stream = USE_PERPLEXITY_FOR_OUTLINE or (options.model and options.model.startswith("perplexity-"))
                logger.info(f"[DEBUG] USE_PERPLEXITY_FOR_OUTLINE={USE_PERPLEXITY_FOR_OUTLINE}, options.model={options.model}, use_pplx_stream={use_pplx_stream}")
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
            logger.info(f"[DEBUG] About to check use_pplx_stream={use_pplx_stream}")
            if use_pplx_stream:
                try:
                    logger.info(f"[DEBUG] Using Perplexity for TRUE streaming generation")
                    yield ProgressUpdate(stage="planning", message="Creating structure (Perplexity)...", progress=15)
                    
                    # Generate slides one-by-one with Perplexity instead of generating complete outline
                    async for slide_update in self._generate_slides_streaming_with_perplexity(options):
                        logger.info(f"[DEBUG] Yielding slide update immediately: {slide_update.stage}")
                        yield slide_update
                    
                    logger.info(f"[DEBUG] Perplexity streaming completed successfully - RETURNING EARLY")
                    return  # Exit after streaming generation is complete
                except Exception as e:
                    logger.error(f"[DEBUG] Perplexity streaming failed with exception: {e}", exc_info=True)
                    logger.warning(f"Perplexity streaming failed, falling back to standard flow: {e}")
            
            # If we get here, either Perplexity streaming failed or was disabled
            # Fall back to the old batch method for compatibility
            if use_pplx_stream:
                try:
                    logger.info(f"[DEBUG] Falling back to Perplexity batch generation")
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
            logger.info(f"[DEBUG] Before process_media_and_charts:")
            for i, slide in enumerate(slides):
                has_extracted = slide.extractedData is not None
                logger.info(f"[DEBUG] Slide {i+1} '{slide.title}' - extractedData: {has_extracted}")
                if has_extracted:
                    logger.info(f"[DEBUG]   Chart type: {slide.extractedData.get('chart_type', 'unknown')}")
            
            slides = await self._process_media_and_charts(slides, processed_files, options)
            
            logger.info(f"[DEBUG] After process_media_and_charts:")
            for i, slide in enumerate(slides):
                has_extracted = slide.extractedData is not None
                logger.info(f"[DEBUG] Slide {i+1} '{slide.title}' - extractedData: {has_extracted}")
                if has_extracted:
                    logger.info(f"[DEBUG]   Chart type: {slide.extractedData.get('chart_type', 'unknown')}")
            
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
            
            # Debug: Print taggedMedia in final output
            print(f"[FINAL OUTLINE] Sending {len(slides_dict)} slides to frontend")
            for i, slide_dict in enumerate(slides_dict):
                tm_count = len(slide_dict.get('taggedMedia', []))
                print(f"[FINAL OUTLINE] Slide {i+1} has {tm_count} taggedMedia items")
                if tm_count > 0:
                    for j, media in enumerate(slide_dict['taggedMedia'][:2]):
                        print(f"[FINAL OUTLINE]   Media {j+1}: {media.get('filename', 'unknown')} - URL: {media.get('url', media.get('previewUrl', 'NO URL'))}")
            
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
    
    async def _process_files(self, options: OutlineOptions, progress_callback=None) -> Optional[dict]:
        """Process files and return extracted information"""
        logger.info(f"=== _process_files CALLED (non-streaming) ===")
        logger.info(f"Number of files: {len(options.files) if options.files else 0}")
        
        if not options.files:
            return None
        
        # Define these outside the try block for broader scope
        has_complex_files = any(
            file_info.get('type', '').startswith(('application/', 'text/csv')) or
            file_info.get('name', '').lower().endswith(('.xlsx', '.xls', '.csv', '.pdf', '.pptx', '.ppt'))
            for file_info in options.files
        )
        has_images = any(
            file_info.get('type', '').startswith('image/') 
            for file_info in options.files
        )
        # Treat PPTX as handled by our internal parser, not the Assistant
        try:
            pptx_files_list = [f for f in options.files if (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in f.get('type',''))]
        except Exception:
            pptx_files_list = []
        has_pptx_files = bool(pptx_files_list)
        # Only spreadsheets and PDFs are Assistant-eligible
        def _is_spreadsheet_or_csv(ftype: str, fname: str) -> bool:
            fname_l = (fname or '').lower()
            return (
                ftype in (
                    'text/csv',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                or fname_l.endswith(('.csv', '.xlsx', '.xls'))
            )
        def _is_pdf(ftype: str, fname: str) -> bool:
            return ftype == 'application/pdf' or (fname or '').lower().endswith('.pdf')
        assistant_eligible = any(
            _is_spreadsheet_or_csv(f.get('type',''), f.get('name','')) or _is_pdf(f.get('type',''), f.get('name',''))
            for f in options.files
        )
        
        if progress_callback:
            await self._call_progress(progress_callback, ProgressUpdate(
                stage="processing_files", message="Processing uploaded files...", progress=10
            ))
        
        # Check if we should use OpenAI Assistant for file processing
        use_openai_assistant = False
        try:
            import os
            assistant_id = os.getenv('OPENAI_ASSISTANT_ID')
            api_key = os.getenv('OPENAI_API_KEY')
            
            print(f"[ENV CHECK] assistant_id={assistant_id[:10] + '...' if assistant_id else None}, api_key={'set' if api_key else 'not set'}")
            
            logger.info(f"Checking OpenAI Assistant: assistant_id={assistant_id[:10] + '...' if assistant_id else None}, "
                        f"api_key={'set' if api_key else 'not set'}")
            
            # Use OpenAI Assistant if configured and we have complex files
            if assistant_id and api_key and assistant_id.startswith('asst_'):
                print(f"[ASSISTANT CHECK] Passed initial check (has ID and key)")
                
                print(f"[FILE CHECK] has_complex_files={has_complex_files}, has_images={has_images}")
                
                logger.info(f"Files check: {len(options.files)} files, "
                           f"has_complex_files={has_complex_files}, has_images={has_images}")
                logger.info(f"File types: {[f.get('type', 'unknown') for f in options.files]}")
                
                # Only use OpenAI Assistant for complex files (Excel, CSV, PDF)
                # Images need to be handled differently due to Assistant API limitations
                if has_complex_files:
                    use_openai_assistant = True
                    print(f"[DECISION] Using OpenAI Assistant!")
                    logger.info("Using OpenAI Assistant for file processing (complex files detected)")
                else:
                    print(f"[DECISION] NOT using OpenAI Assistant (images will use vision API)")
            else:
                print(f"[ASSISTANT CHECK] Failed initial check - assistant_id={bool(assistant_id)}, api_key={bool(api_key)}, starts_with_asst={assistant_id.startswith('asst_') if assistant_id else False}")
        except Exception as e:
            print(f"[ERROR] Exception in OpenAI Assistant check: {e}")
            logger.warning(f"Error checking OpenAI Assistant availability: {e}")
        
        print(f"[FINAL DECISION] use_openai_assistant = {use_openai_assistant}")
        
        # If we should use OpenAI Assistant, delegate to OpenAI service
        if use_openai_assistant:
            try:
                from services.openai_service import OpenAIService, GenerateOutlineOptions
                
                openai_service = OpenAIService()
                
                # Create options for OpenAI service
                # Map 'standard' to 'detailed' since OpenAI only accepts 'quick' or 'detailed'
                openai_detail_level = 'detailed' if options.detail_level == 'standard' else options.detail_level
                
                # Filter out image files if we have mixed content
                files_for_assistant = options.files
                if has_complex_files and has_images:
                    # Only send non-image files to Assistant
                    files_for_assistant = [
                        f for f in options.files 
                        if not f.get('type', '').startswith('image/')
                    ]
                    print(f"[FILTER] Sending {len(files_for_assistant)} non-image files to Assistant (filtered from {len(options.files)} total)")
                # Always exclude PPTX from Assistant processing; we'll parse those locally
                files_for_assistant = [
                    f for f in files_for_assistant
                    if not (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in (f.get('type','') or '').lower())
                ]
                
                # Exclude PPTX from assistant processing; we'll parse those locally
                if assistant_eligible:
                    files_for_assistant = [
                        f for f in files_for_assistant
                        if not (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in f.get('type',''))
                    ]
                
                openai_options = GenerateOutlineOptions(
                    prompt=options.prompt,
                    files=files_for_assistant,
                    detailLevel=openai_detail_level,
                    styleContext={'context': options.style_context} if options.style_context else None,
                    fontPreference=options.font_preference,
                    colorPreference=options.color_scheme if options.color_scheme else None
                )
                
                # Use a simpler progress callback if provided
                simple_progress = lambda msg: logger.info(f"OpenAI Processing: {msg}") if progress_callback else None
                
                # Process files using OpenAI Assistant
                logger.info("Processing files with OpenAI Assistant API...")
                result = await openai_service._process_files_with_assistant(
                    files_for_assistant, 
                    options.prompt,
                    on_progress=simple_progress
                )
                
                logger.info(f"OpenAI Assistant processed: {len(result.get('images', []))} images, "
                          f"{len(result.get('data_files', []))} data files, "
                          f"{len(result.get('extracted_data', []))} extracted data items")
                
                # Augment prompt with insights from OpenAI processing
                if result.get('file_context'):
                    options.prompt += result['file_context']
                
                # If we have mixed files, we also need to process images separately
                if has_complex_files and has_images:
                    logger.info("Processing images separately with Vision API...")
                    try:
                        # Filter image files
                        image_files = [f for f in options.files if f.get('type', '').startswith('image/')]
                        
                        # Process images with vision
                        vision_result = await openai_service._process_images_with_vision(
                            image_files,
                            options.prompt,
                            on_progress=lambda msg: logger.info(f"Vision Processing: {msg}") if progress_callback else None
                        )
                        
                        # Merge results
                        if vision_result.get('images'):
                            result['images'] = result.get('images', []) + vision_result['images']
                        if vision_result.get('file_context'):
                            options.prompt += f"\n\n{vision_result['file_context']}"
                            result['file_context'] = result.get('file_context', '') + f"\n\n{vision_result['file_context']}"
                            
                    except Exception as e:
                        logger.error(f"Failed to process images with Vision API: {e}")
                
                # Attach PPTX outlines (from original input files) before returning
                try:
                    pptx_outlines = []
                    pptx_files = [f for f in options.files if (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in f.get('type',''))]
                    if pptx_files:
                        logger.info(f"[PPTX] Extracting text (streaming) from {len(pptx_files)} PPTX file(s)")
                        import base64
                        for f in pptx_files:
                            content = f.get('content')
                            if isinstance(content, str):
                                b64 = content.split(';base64,', 1)[1] if content.startswith('data:') and ';base64,' in content else content
                                file_bytes = base64.b64decode(b64)
                            else:
                                file_bytes = content or b""
                            if file_bytes:
                                extracted = extract_pptx_text_from_bytes(file_bytes)
                                pptx_outlines.append({
                                    'filename': f.get('name','presentation.pptx'),
                                    'slides': extracted.get('slides', []),
                                    'slide_count': extracted.get('slide_count', 0)
                                })
                    if pptx_outlines:
                        result['pptx_outlines'] = pptx_outlines
                        # Lightly add titles to prompt
                        titles = [s.get('title','') for s in pptx_outlines[0].get('slides', []) if s.get('title')]
                        if titles:
                            options.prompt += "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:12])
                except Exception:
                    pass

                return result
                
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                print(f"[OPENAI ERROR - non-streaming] Failed to use OpenAI Assistant: {type(e).__name__}: {e}")
                print(f"[OPENAI ERROR - non-streaming] Full traceback:\n{error_details}")
                logger.error(f"Failed to use OpenAI Assistant, falling back to simple processor: {e}")
                logger.error(f"Traceback: {error_details}")
                # Fall through to simple processor
        
        # Check if we have images that need Vision API processing
        if has_images and not use_openai_assistant:
            try:
                from services.openai_service import OpenAIService
                
                print(f"[VISION] Processing {len(options.files)} images with Vision API")
                logger.info("Processing images with Vision API...")
                
                openai_service = OpenAIService()
                
                # Filter image files
                image_files = [f for f in options.files if f.get('type', '').startswith('image/')]
                
                # Process images with vision
                result = await openai_service._process_images_with_vision(
                    image_files,
                    options.prompt,
                    on_progress=None
                )
                
                logger.info(f"Vision API analyzed {len(image_files)} images")
                
                # Augment prompt with image analysis
                if result.get('file_context'):
                    print(f"[VISION] Adding image analysis to prompt")
                    options.prompt += f"\n\n{result['file_context']}"
                
                # Attach PPTX outlines before returning
                try:
                    pptx_outlines = []
                    pptx_files = [f for f in options.files if (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in f.get('type',''))]
                    if pptx_files:
                        logger.info(f"[PPTX] Extracting text (streaming-vision) from {len(pptx_files)} PPTX file(s)")
                        import base64
                        for f in pptx_files:
                            content = f.get('content')
                            if isinstance(content, str):
                                b64 = content.split(';base64,', 1)[1] if content.startswith('data:') and ';base64,' in content else content
                                file_bytes = base64.b64decode(b64)
                            else:
                                file_bytes = content or b""
                            if file_bytes:
                                extracted = extract_pptx_text_from_bytes(file_bytes)
                                pptx_outlines.append({
                                    'filename': f.get('name','presentation.pptx'),
                                    'slides': extracted.get('slides', []),
                                    'slide_count': extracted.get('slide_count', 0)
                                })
                    if pptx_outlines:
                        result['pptx_outlines'] = pptx_outlines
                        titles = [s.get('title','') for s in pptx_outlines[0].get('slides', []) if s.get('title')]
                        if titles:
                            options.prompt += "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:12])
                except Exception:
                    pass

                return result
                
            except Exception as e:
                logger.error(f"Failed to process images with Vision API: {e}")
                # Fall through to simple processor
        
        # Check for PPTX uploads and extract slide text upfront
        try:
            pptx_files = [f for f in options.files if (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in f.get('type',''))]
        except Exception:
            pptx_files = []

        pptx_outlines = []
        if pptx_files:
            logger.info(f"[PPTX] Extracting text from {len(pptx_files)} PPTX file(s) for outline grounding")
            for f in pptx_files:
                try:
                    content = f.get('content')
                    if isinstance(content, str):
                        # Assume base64 data URL or base64
                        import base64
                        if content.startswith('data:') and ';base64,' in content:
                            b64 = content.split(';base64,', 1)[1]
                        else:
                            b64 = content
                        file_bytes = base64.b64decode(b64)
                    else:
                        file_bytes = content or b""
                    if file_bytes:
                        extracted = extract_pptx_text_from_bytes(file_bytes)
                        pptx_outlines.append({
                            'filename': f.get('name','presentation.pptx'),
                            'slides': extracted.get('slides', []),
                            'slide_count': extracted.get('slide_count', 0)
                        })
                except Exception as e:
                    logger.warning(f"[PPTX] Failed extracting text: {e}")

        # Default: Process files with simple processor (only if not handled above)
        print(f"[FALLBACK] Using simple file processor for {options.model or 'unknown'} model")
        model_type = "openai" if "gpt" in self._get_model("planning", options).lower() else "gemini"
        file_processor = create_file_processor(model_type)
        processed_files = await file_processor.process_files(options.files, options.prompt)

        # Attach pptx outlines for downstream consumers (planner/slide generator)
        if pptx_outlines:
            try:
                processed_files['pptx_outlines'] = pptx_outlines
                # Also augment prompt lightly so planning sees context
                for deck in pptx_outlines[:1]:
                    titles = [s.get('title','') for s in deck.get('slides', []) if s.get('title')]
                    if titles:
                        options.prompt += "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:12])
            except Exception:
                pass
        
        # Log processing results
        logger.info(f"Processed {len(options.files)} files: "
                   f"{len(processed_files['images'])} images, "
                   f"{len(processed_files['data_files'])} data files")
        
        # Augment prompt with file context
        if processed_files['file_context']:
            options.prompt += processed_files['file_context']
        
        return processed_files
    
    async def _process_files_streaming(self, options: OutlineOptions):
        """Process files with streaming updates - generator"""
        logger.debug(f"[GENERATOR] _process_files_streaming called with {len(options.files) if options.files else 0} files")
        logger.info(f"=== _process_files_streaming CALLED ===")
        logger.info(f"Number of files: {len(options.files) if options.files else 0}")
        
        if not options.files:
            return None
        
        # Define these outside the try block for broader scope
        has_complex_files = any(
            file_info.get('type', '').startswith(('application/', 'text/csv')) or
            file_info.get('name', '').lower().endswith(('.xlsx', '.xls', '.csv', '.pdf', '.pptx', '.ppt'))
            for file_info in options.files
        )
        has_images = any(
            file_info.get('type', '').startswith('image/') 
            for file_info in options.files
        )
        
        # Determine PPTX files and Assistant eligibility BEFORE the try block
        try:
            pptx_files_list = [
                f for f in options.files
                if (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in (f.get('type','') or '').lower())
            ]
        except Exception:
            pptx_files_list = []
        has_pptx_files = bool(pptx_files_list)
        
        def _is_spreadsheet_or_csv(ftype: str, fname: str) -> bool:
            fname_l = (fname or '').lower()
            return (
                ftype in (
                    'text/csv',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                or fname_l.endswith(('.csv', '.xlsx', '.xls'))
            )
        def _is_pdf(ftype: str, fname: str) -> bool:
            return ftype == 'application/pdf' or (fname or '').lower().endswith('.pdf')
        assistant_eligible = any(
            _is_spreadsheet_or_csv(f.get('type',''), f.get('name','')) or _is_pdf(f.get('type',''), f.get('name',''))
            for f in options.files
        )
        
        # Check if we should use OpenAI Assistant for file processing
        use_openai_assistant = False
        try:
            import os
            assistant_id = os.getenv('OPENAI_ASSISTANT_ID')
            api_key = os.getenv('OPENAI_API_KEY')
            
            logger.debug(f"[ENV CHECK] assistant_id={assistant_id[:10] + '...' if assistant_id else None}, api_key={'set' if api_key else 'not set'}")
            
            logger.info(f"Checking OpenAI Assistant: assistant_id={assistant_id[:10] + '...' if assistant_id else None}, "
                        f"api_key={'set' if api_key else 'not set'}")
            
            # Use OpenAI Assistant if configured and we have assistant-eligible files (NOT PPTX)
            if assistant_id and api_key and assistant_id.startswith('asst_'):
                logger.debug("[ASSISTANT CHECK] Passed initial check (has ID and key)")
                
                logger.debug(f"[FILE CHECK] has_complex_files={has_complex_files}, has_images={has_images}")
                
                logger.info(f"Files check: {len(options.files)} files, "
                           f"has_complex_files={has_complex_files}, has_images={has_images}")
                logger.info(f"File types: {[f.get('type', 'unknown') for f in options.files]}")
                
                # Only use OpenAI Assistant for spreadsheets/CSVs/PDFs, never for PPTX
                # Images need to be handled differently due to Assistant API limitations
                if assistant_eligible:
                    use_openai_assistant = True
                    logger.info("[DECISION] Using OpenAI Assistant!")
                    logger.info("Using OpenAI Assistant for file processing (complex files detected)")
                else:
                    logger.debug("[DECISION] NOT using OpenAI Assistant (images will use vision API)")
            else:
                logger.debug(f"[ASSISTANT CHECK] Failed initial check - assistant_id={bool(assistant_id)}, api_key={bool(api_key)}, starts_with_asst={assistant_id.startswith('asst_') if assistant_id else False}")
        except Exception as e:
            logger.warning(f"Error checking OpenAI Assistant availability: {e}")
        
        # If we should use OpenAI Assistant, delegate to OpenAI service
        if use_openai_assistant:
            logger.debug("[OPENAI PATH] Entering OpenAI Assistant processing block")
            try:
                from services.openai_service import OpenAIService, GenerateOutlineOptions
                
                openai_service = OpenAIService()
                logger.debug("[OPENAI PATH] OpenAIService instance created")
                
                # Create options for OpenAI service
                # Map 'standard' to 'detailed' since OpenAI only accepts 'quick' or 'detailed'
                openai_detail_level = 'detailed' if options.detail_level == 'standard' else options.detail_level
                
                # Filter out image files if we have mixed content
                files_for_assistant = options.files
                if has_complex_files and has_images:
                    # Only send non-image files to Assistant
                    files_for_assistant = [
                        f for f in options.files 
                        if not f.get('type', '').startswith('image/')
                    ]
                    print(f"[FILTER] Sending {len(files_for_assistant)} non-image files to Assistant (filtered from {len(options.files)} total)")
                
                openai_options = GenerateOutlineOptions(
                    prompt=options.prompt,
                    files=files_for_assistant,
                    detailLevel=openai_detail_level,
                    styleContext={'context': options.style_context} if options.style_context else None,
                    fontPreference=options.font_preference,
                    colorPreference=options.color_scheme if options.color_scheme else None
                )
                logger.debug("[OPENAI PATH] GenerateOutlineOptions created")
                
                # Process files using OpenAI Assistant
                logger.info("Processing files with OpenAI Assistant API (streaming)...")
                logger.debug(f"[OPENAI PATH] About to call _process_files_with_assistant")
                result = await openai_service._process_files_with_assistant(
                    files_for_assistant, 
                    options.prompt,
                    on_progress=None  # Streaming already provides progress
                )
                logger.debug(f"[OPENAI PATH] _process_files_with_assistant returned: {list(result.keys()) if result else None}")
                
                logger.info(f"OpenAI Assistant processed: {len(result.get('images', []))} images, "
                          f"{len(result.get('data_files', []))} data files, "
                          f"{len(result.get('extracted_data', []))} extracted data items")
                
                # Augment prompt with insights from OpenAI processing
                if result.get('file_context'):
                    logger.debug(f"[OPENAI PATH] Adding file context to prompt: {len(result['file_context'])} chars")
                    logger.debug("[OPENAI PATH] File context preview:")
                    logger.debug(result['file_context'][:500] + "..." if len(result['file_context']) > 500 else result['file_context'])
                    options.prompt += result['file_context']
                    logger.debug(f"[OPENAI PATH] Updated prompt length: {len(options.prompt)} chars")

                # Always attach PPTX outlines using our internal parser when PPTX files are present
                try:
                    if has_pptx_files:
                        logger.info(f"[PPTX] Extracting text (streaming-assistant) from {len(pptx_files_list)} PPTX file(s)")
                        import base64
                        pptx_outlines = []
                        for f in pptx_files_list:
                            content = f.get('content')
                            if isinstance(content, str):
                                b64 = content.split(';base64,', 1)[1] if content.startswith('data:') and ';base64,' in content else content
                                file_bytes = base64.b64decode(b64)
                            else:
                                file_bytes = content or b""
                            if file_bytes:
                                extracted = extract_pptx_text_from_bytes(file_bytes)
                                pptx_outlines.append({
                                    'filename': f.get('name','presentation.pptx'),
                                    'slides': extracted.get('slides', []),
                                    'slide_count': extracted.get('slide_count', 0)
                                })
                        if pptx_outlines:
                            result['pptx_outlines'] = pptx_outlines
                            titles = [s.get('title','') for s in pptx_outlines[0].get('slides', []) if s.get('title')]
                            if titles:
                                options.prompt += "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:12])
                except Exception:
                    pass
                
                # If we have mixed files, we also need to process images separately
                if assistant_eligible and has_images:
                    logger.info("[MIXED FILES] Now processing images with Vision API")
                    try:
                        # Filter image files
                        image_files = [f for f in options.files if f.get('type', '').startswith('image/')]
                        logger.info(f"[VISION] Processing {len(image_files)} images with Vision API")
                        
                        # Process images with vision
                        vision_result = await openai_service._process_images_with_vision(
                            image_files,
                            options.prompt,
                            on_progress=None
                        )
                        
                        # Merge results
                        if vision_result.get('images'):
                            result['images'] = result.get('images', []) + vision_result['images']
                        if vision_result.get('file_context'):
                            logger.info("[VISION] Adding image analysis to prompt")
                            options.prompt += f"\n\n{vision_result['file_context']}"
                            result['file_context'] = result.get('file_context', '') + f"\n\n{vision_result['file_context']}"
                            
                    except Exception as e:
                        logger.error(f"Failed to process images with Vision API: {e}")
                        print(f"[VISION ERROR] Failed to process images: {e}")
                
                return result
                
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                print(f"[OPENAI ERROR - non-streaming] Failed to use OpenAI Assistant: {type(e).__name__}: {e}")
                print(f"[OPENAI ERROR - non-streaming] Full traceback:\n{error_details}")
                logger.error(f"Failed to use OpenAI Assistant, falling back to simple processor: {e}")
                logger.error(f"Traceback: {error_details}")
                # Fall through to simple processor
        
        # Check if we have images that need Vision API processing
        if has_images and not use_openai_assistant:
            try:
                from services.openai_service import OpenAIService
                
                print(f"[VISION] Processing {len(options.files)} images with Vision API")
                logger.info("Processing images with Vision API...")
                
                openai_service = OpenAIService()
                
                # Filter image files
                image_files = [f for f in options.files if f.get('type', '').startswith('image/')]
                
                # Process images with vision
                result = await openai_service._process_images_with_vision(
                    image_files,
                    options.prompt,
                    on_progress=None
                )
                
                logger.info(f"Vision API analyzed {len(image_files)} images")
                
                # Augment prompt with image analysis
                if result.get('file_context'):
                    print(f"[VISION] Adding image analysis to prompt")
                    options.prompt += f"\n\n{result['file_context']}"
                
                return result
                
            except Exception as e:
                logger.error(f"Failed to process images with Vision API: {e}")
                # Fall through to simple processor
        
        # Default: Process files with simple processor (only if not handled above)
        # Also proactively extract PPTX text with our parser and attach outlines
        model_type = "openai" if "gpt" in self._get_model("planning", options).lower() else "gemini"
        file_processor = create_file_processor(model_type)
        processed_files = await file_processor.process_files(options.files, options.prompt)
        
        # Augment prompt
        if processed_files['file_context']:
            options.prompt += processed_files['file_context']
        
        # Add PPTX outlines in streaming fallback path (always run if PPTX present)
        try:
            pptx_outlines = []
            if has_pptx_files:
                logger.info(f"[PPTX] Extracting text (streaming-fallback) from {len(pptx_files_list)} PPTX file(s)")
                import base64
                for f in pptx_files_list:
                    content = f.get('content')
                    if isinstance(content, str):
                        b64 = content.split(';base64,', 1)[1] if content.startswith('data:') and ';base64,' in content else content
                        file_bytes = base64.b64decode(b64)
                    else:
                        file_bytes = content or b""
                    if file_bytes:
                        extracted = extract_pptx_text_from_bytes(file_bytes)
                        pptx_outlines.append({
                            'filename': f.get('name','presentation.pptx'),
                            'slides': extracted.get('slides', []),
                            'slide_count': extracted.get('slide_count', 0)
                        })
            if pptx_outlines:
                processed_files['pptx_outlines'] = pptx_outlines
                titles = [s.get('title','') for s in pptx_outlines[0].get('slides', []) if s.get('title')]
                if titles:
                    options.prompt += "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:12])
        except Exception:
            pass

        return processed_files
    
    async def _generate_slides_streaming(
        self, outline_plan: dict, options: OutlineOptions, processed_files: dict
    ) -> AsyncGenerator[ProgressUpdate, None]:
        """Generate slides with streaming updates using parallel tasks."""
        model = self.slide_generator._get_model("content", options)
        from agents.ai.clients import get_client, get_max_tokens_for_model
        client, model_name = get_client(model)
        
        # Get model's max token capability
        model_max_tokens = get_max_tokens_for_model(model)
        slide_max_tokens = min(int(model_max_tokens * 0.25), 8000)
        
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

                    # Attach web citations from research findings (up to 5 best matches; fallback to top 3)
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
                
                # Chart generation from extracted data if needed
                if processed_files and processed_files.get('extracted_data') and not getattr(slide, 'chart_data', None):
                    if not getattr(slide, 'extractedData', None):
                        try:
                            chart_data = await self._generate_chart_from_extracted_data(slide, processed_files['extracted_data'])
                            if chart_data:
                                slide.chart_data = ChartData(**chart_data)
                                slide.extractedData = self.chart_generator.convert_chart_data_to_extracted_data(
                                    slide.chart_data, slide.title
                                )
                        except Exception as e:
                            logger.warning(f"[STREAMING] Chart generation failed for slide {index+1}: {e}")
                
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
                fallback_slide = SlideContent(
                    id=str(uuid.uuid4()),
                    title=fallback_title if isinstance(fallback_title, str) else fallback_title.get('title', 'Slide'),
                    content=self.slide_generator._create_fallback_content(
                        fallback_title if isinstance(fallback_title, str) else fallback_title.get('title', 'Slide'),
                        slide_type,
                        outline_plan.get("title", "Presentation")
                    ),
                    slide_type=slide_type
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
    
    async def _process_media_and_charts(self, slides: list[SlideContent], processed_files: dict, options: OutlineOptions) -> list[SlideContent]:
        """Process media assignments and chart data conversion"""
        logger.info(f"[PROCESS MEDIA] Starting with {len(slides)} slides")
        
        # Check if any slides already have tagged media (from streaming)
        has_existing_media = any(slide.taggedMedia for slide in slides)
        if has_existing_media:
            logger.info(f"[PROCESS MEDIA] Some slides already have tagged media, skipping re-assignment")
        
        if processed_files and not has_existing_media:
            # Use AI-based media assignment only if no media assigned yet
            model = self._get_model("content", options)
            await self.media_manager.assign_media_to_slides_with_ai(slides, processed_files, model)
        
        # Always debug log media status
        if processed_files and processed_files.get('images'):
            logger.info(f"[PROCESS MEDIA] Media assignment status:")
            print(f"[PROCESS MEDIA] Media assignment status:")
            for i, slide in enumerate(slides):
                tm_count = len(slide.taggedMedia) if slide.taggedMedia else 0
                logger.info(f"[PROCESS MEDIA] Slide {i+1} '{slide.title}' has {tm_count} taggedMedia items")
                print(f"[PROCESS MEDIA] Slide {i+1} '{slide.title}' has {tm_count} taggedMedia items")
                if tm_count > 0:
                    for j, media in enumerate(slide.taggedMedia[:2]):  # First 2
                        preview_url = media.get('previewUrl', '')
                        logger.info(f"[PROCESS MEDIA]   Media {j+1}: {media.get('filename', 'unknown')} - URL: {preview_url}")
                        print(f"[PROCESS MEDIA]   Media {j+1}: {media.get('filename', 'unknown')} - FULL URL: {preview_url}")
            
            # Generate charts from extracted data (NEW: prioritize extracted_data)
            if processed_files.get('extracted_data'):
                logger.info(f"[PROCESS MEDIA] Processing {len(processed_files['extracted_data'])} extracted data items for charts")
                for slide in slides:
                    logger.info(f"[PROCESS MEDIA] Checking slide '{slide.title}' - type: {slide.slide_type}, has_chart: {slide.chart_data is not None}")

                    # Restrict chart auto-addition to truly data-centric slides
                    title_lower = (slide.title or '').lower()
                    type_allows_chart = slide.slide_type in ['data']
                    quantitative_title = any(k in title_lower for k in ['kpi', 'metric', 'metrics', 'revenue', 'budget', 'forecast', 'trend', 'growth', 'market share', 'analysis', 'statistics'])

                    # Check if slide already has chart data from AI generation
                    if (not slide.chart_data and not slide.extractedData and (type_allows_chart or quantitative_title)):
                        # Only generate chart if slide content would benefit from it
                        chart_data = await self._generate_chart_from_extracted_data(slide, processed_files['extracted_data'])
                        if chart_data:
                            slide.chart_data = ChartData(**chart_data)
                            # Convert to frontend format
                            slide.extractedData = self.chart_generator.convert_chart_data_to_extracted_data(
                                slide.chart_data, slide.title
                            )
                            logger.info(f"[PROCESS MEDIA] Added chart from extracted data to slide: {slide.title}")
            
            # Then handle regular media files
            elif processed_files.get('data_files'):
                for slide in slides:
                    # Check if slide should have chart from data file
                    title_lower = (slide.title or '').lower()
                    # Narrow to clearly data-centric cases; avoid adding charts to generic content slides
                    if (not slide.chart_data and 
                        slide.slide_type in ['data'] and  # Only allow 'data' type for auto charting
                        any(word in title_lower for word in ['kpi', 'metric', 'metrics', 'revenue', 'budget', 'forecast', 'trend', 'growth', 'market share', 'analysis', 'statistics'])):
                        
                        # Try to find matching data file (handle both CSV and Excel)
                        for data_file in processed_files['data_files']:
                            # Check for Excel files too, not just CSV
                            if data_file.get('format') in ['csv', 'excel'] or data_file.get('extracted_data'):
                                # If we have extracted_data in the file, use that
                                if data_file.get('extracted_data'):
                                    chart_data = await self._generate_chart_from_extracted_data(slide, data_file['extracted_data'])
                                else:
                                    chart_data = self.media_manager.generate_chart_from_data_file(data_file, slide.title)
                                
                                if chart_data:
                                    slide.chart_data = ChartData(**chart_data)
                                    logger.info(f"Added chart from data file to slide: {slide.title}")
                                    break
        
        # Convert chart data to frontend format AND add extracted data to all slides
        for slide in slides:
            if slide.chart_data:
                slide.extractedData = self.chart_generator.convert_chart_data_to_extracted_data(
                    slide.chart_data, slide.title
                )
            elif processed_files and processed_files.get('extracted_data'):
                # Add extracted data even if no chart
                for data_item in processed_files['extracted_data']:
                    if isinstance(data_item, dict) and 'summary' in data_item:
                        slide.extractedData = {
                            'source': 'Extracted from uploaded file',
                            'summary': data_item['summary'],
                            'keyMetrics': data_item.get('keyMetrics', {}),
                            'metadata': {'source': 'Extracted from uploaded file'}
                        }
                        logger.info(f"Added extracted data to slide without chart: {slide.title}")
                        break
        
        return slides
    
    async def _generate_chart_from_extracted_data(self, slide: SlideContent, extracted_data: List[Dict]) -> Optional[Dict[str, Any]]:
        """Generate chart data from extracted data based on slide content"""
        if not extracted_data:
            logger.info(f"[CHART GEN] No extracted data available for slide: {slide.title}")
            return None
        
        logger.info(f"[CHART GEN] Processing {len(extracted_data)} data items for slide: {slide.title}")
        
        # Find relevant data for this slide
        for data_item in extracted_data:
            if isinstance(data_item, dict):
                # Check if it's stock data
                if 'summary' in data_item and 'priceData' in data_item:
                    symbol = data_item['summary'].get('symbol', 'Unknown')
                    logger.info(f"[CHART GEN] Found stock data for {symbol}")
                    
                    # Determine chart type based on slide title
                    slide_title_lower = slide.title.lower()
                    
                    if any(word in slide_title_lower for word in ['volatility', 'trading', 'volume', 'activity']):
                        # Volume chart
                        chart_type = "line"
                        data = self.chart_generator._generate_volume_chart_from_stock_data(
                            data_item['priceData'], slide.title
                        )
                        title = "Trading Volume Over Time"
                        logger.info(f"[CHART GEN] Creating volume chart with {len(data)} data points")
                        
                    elif any(word in slide_title_lower for word in ['price', 'trend', 'performance']):
                        # Price chart
                        chart_type = "line"
                        data = self.chart_generator._generate_price_chart_from_stock_data(
                            data_item['priceData'], slide.title
                        )
                        title = f"{data_item['summary'].get('symbol', 'Stock')} Price Trend"
                        logger.info(f"[CHART GEN] Creating price chart with {len(data)} data points")
                        
                    elif any(word in slide_title_lower for word in ['financial', 'metrics', 'valuation']):
                        # Metrics comparison
                        chart_type = "bar"
                        metrics = data_item.get('keyMetrics', {})
                        summary = data_item.get('summary', {})
                        
                        # Create data points only if we have values
                        data = []
                        
                        # Add current price if available
                        if summary.get('currentPrice'):
                            data.append({"name": "Current Price", "value": summary.get('currentPrice', 0)})
                        
                        # Add 52-week high/low if available
                        if summary.get('52WeekHigh'):
                            data.append({"name": "52-Week High", "value": summary.get('52WeekHigh', 0)})
                        if summary.get('52WeekLow'):
                            data.append({"name": "52-Week Low", "value": summary.get('52WeekLow', 0)})
                        
                        # Add P/E ratio if available (scaled for visibility)
                        if metrics.get('peRatio'):
                            data.append({"name": "P/E Ratio", "value": metrics.get('peRatio', 0) * 10})
                        
                        # If we still don't have enough data, use price history
                        if len(data) < 2 and 'priceData' in data_item and data_item['priceData']:
                            prices = [p.get('close', 0) for p in data_item['priceData'] if p.get('close')]
                            if prices:
                                data = [
                                    {"name": "Min Price", "value": min(prices)},
                                    {"name": "Avg Price", "value": sum(prices) / len(prices)},
                                    {"name": "Max Price", "value": max(prices)},
                                    {"name": "Current", "value": prices[-1] if prices else 0}
                                ]
                        
                        title = "Key Financial Metrics"
                        logger.info(f"[CHART GEN] Creating metrics chart with {len(data)} data points")
                        
                    else:
                        # Default to price trend
                        chart_type = "line"
                        data = self.chart_generator._generate_price_chart_from_stock_data(
                            data_item['priceData'], slide.title
                        )
                        title = "Stock Performance"
                        logger.info(f"[CHART GEN] Creating default price chart with {len(data)} data points")
                    
                    if data:
                        chart_result = {
                            'chart_type': chart_type,
                            'data': data,
                            'title': title,
                            'metadata': {'source': 'Extracted from uploaded file'}
                        }
                        logger.info(f"[CHART GEN] Successfully generated {chart_type} chart for slide: {slide.title}")
                        return chart_result
        
        logger.info(f"[CHART GEN] No suitable data found for chart generation in slide: {slide.title}")
        return None
    
    def _validate_slide_count(self, outline_plan: dict, options: OutlineOptions) -> dict:
        """Deprecated: do not adjust counts in code. Kept for compatibility."""
        return outline_plan
    
    def _final_validation(self, slides: list[SlideContent], options: OutlineOptions) -> list[SlideContent]:
        """No code-based enforcement of slide counts; return slides as generated."""
        return slides
    
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
    
    def _create_slides_from_pptx(self, pptx_outline: dict, outline_plan: dict) -> List[SlideContent]:
        """Create slides directly from PPTX content without regenerating."""
        slides = []
        pptx_slides = pptx_outline.get('slides', [])
        
        for i, pptx_slide in enumerate(pptx_slides):
            if i >= len(outline_plan['slides']):
                break
                
            # Extract slide content from PPTX
            title = pptx_slide.get('title', f'Slide {i+1}')
            text_items = pptx_slide.get('text_items', [])
            
            # Format content with bullet points
            content_lines = []
            for item in text_items:
                if item.strip():
                    # Add bullet point if not already present
                    if not item.strip().startswith('•'):
                        content_lines.append(f"• {item.strip()}")
                    else:
                        content_lines.append(item.strip())
            
            content = '\n'.join(content_lines) if content_lines else pptx_slide.get('text', '')
            
            # Create SlideContent object
            slide = SlideContent(
                id=str(uuid.uuid4()),
                title=title,
                content=content,
                slide_type='content',
                deepResearch=False,
                extractedData=None,
                taggedMedia=[]
            )
            
            slides.append(slide)
            
        logger.info(f"[PPTX] Created {len(slides)} slides directly from PPTX content")
        return slides
    
    def _should_preserve_pptx_content(self, prompt: str) -> bool:
        """
        Determine if PPTX content should be preserved based on user intent.
        Returns True only if user wants pure formatting/styling without content changes.
        """
        prompt_lower = (prompt or "").lower()
        
        # Content modification keywords that indicate user wants to change content
        content_modifiers = [
            "add", "update", "enhance", "expand", "include", "incorporate",
            "modify", "change", "improve", "revise", "edit", "extend",
            "append", "insert", "remove", "delete", "replace", "reduce",
            "shorten", "lengthen", "elaborate", "simplify", "augment",
            "supplement", "enrich", "refine", "transform", "rewrite",
            "refresh", "modernize", "upgrade"
        ]
        
        # Check if any content modification keyword is present
        has_content_modifier = any(modifier in prompt_lower for modifier in content_modifiers)
        
        # Style-only markers that indicate formatting intent
        style_only_markers = [
            "format this", "style this", "apply my brand", "keep content", 
            "do not change content", "same content", "preserve content", 
            "restyle", "format", "design", "theme", "template", "layout",
            "make it look", "visual", "appearance"
        ]
        
        # Check if any style marker is present
        has_style_marker = any(marker in prompt_lower for marker in style_only_markers)
        
        # Explicit preservation keywords override everything
        explicit_preserve = any(phrase in prompt_lower for phrase in [
            "keep content", "do not change content", "preserve content", 
            "same content", "only style", "only format", "just style",
            "just format", "formatting only", "styling only"
        ])
        
        if explicit_preserve:
            logger.info("[PPTX] Explicit content preservation requested")
            return True
        
        # If content modifiers are present, don't preserve
        if has_content_modifier:
            logger.info(f"[PPTX] Content modification detected in prompt, will regenerate content")
            return False
        
        # If only style markers are present, preserve
        if has_style_marker:
            logger.info("[PPTX] Style-only intent detected, will preserve content")
            return True
        
        # Default: don't preserve (regenerate content)
        return False
    
    def _slide_to_dict(self, slide: SlideContent) -> dict:
        """Convert slide to dictionary format"""
        # Debug log taggedMedia
        tm_count = len(slide.taggedMedia) if hasattr(slide, 'taggedMedia') and slide.taggedMedia else 0
        logger.info(f"[SLIDE_TO_DICT] Converting slide '{slide.title}' - has {tm_count} taggedMedia items")
        print(f"[SLIDE_TO_DICT] Converting slide '{slide.title}' - has {tm_count} taggedMedia items")
        
        # Convert taggedMedia to ensure it's properly serialized
        tagged_media_list = []
        if slide.taggedMedia:
            for media in slide.taggedMedia:
                if isinstance(media, dict):
                    tagged_media_list.append(media)
                elif hasattr(media, 'model_dump'):
                    tagged_media_list.append(media.model_dump())
                else:
                    tagged_media_list.append(media)
        
        slide_dict = {
            "id": slide.id,
            "title": slide.title,
            "content": slide.content,
            "slide_type": slide.slide_type,
            "deepResearch": slide.deepResearch,
            "extractedData": slide.extractedData,
            "citationsFooter": getattr(slide, 'citationsFooter', None),
            "citations": getattr(slide, 'citations', []),
            "footnotes": getattr(slide, 'footnotes', []),  # Add footnotes for numbered citations
            "taggedMedia": tagged_media_list
        }
        
        # Debug extractedData
        if slide.extractedData:
            logger.info(f"[SLIDE_TO_DICT] Slide '{slide.title}' has extractedData: {slide.extractedData.get('chart_type', 'unknown')} chart")
        
        # Include chart_data for API processing
        if slide.chart_data:
            slide_dict["chart_data"] = slide.chart_data.dict()

        # Include structured comparison when present
        try:
            comparison = getattr(slide, 'comparison', None)
            if comparison and isinstance(comparison, dict):
                # Basic validation to ensure arrays exist
                left_bullets = comparison.get('leftBullets') or []
                right_bullets = comparison.get('rightBullets') or []
                slide_dict["comparison"] = {
                    "layout": comparison.get('layout'),
                    "leftLabel": comparison.get('leftLabel'),
                    "rightLabel": comparison.get('rightLabel'),
                    "leftBullets": left_bullets,
                    "rightBullets": right_bullets
                }
        except Exception:
            pass
        
        # Include research_notes if available
        if hasattr(slide, 'research_notes') and slide.research_notes:
            slide_dict["research_notes"] = slide.research_notes
            
        return slide_dict
    
    async def _call_progress(self, callback, update):
        """Call progress callback safely"""
        if asyncio.iscoroutinefunction(callback):
            await callback(update)
        else:
            callback(update)
    
    def _get_model(self, task: str, options: Optional[OutlineOptions] = None) -> str:
        """Select model for task with per-phase overrides."""
        # Per-phase explicit overrides take precedence
        if options:
            if task == "planning" and getattr(options, "planning_model", None):
                return options.planning_model
            if task == "content" and getattr(options, "content_model", None):
                return options.content_model
            if task == "research" and getattr(options, "research_model", None):
                return options.research_model
            # Legacy global override applies to all tasks if set
            if getattr(options, "model", None):
                return options.model
        
        models = {
            "planning": OUTLINE_PLANNING_MODEL,
            "content": OUTLINE_CONTENT_MODEL,
            "research": OUTLINE_RESEARCH_MODEL
        }
        return models.get(task, OUTLINE_CONTENT_MODEL)

    async def _generate_slides_streaming_with_perplexity(self, options: OutlineOptions):
        """Generate slides one-by-one with Perplexity for true streaming"""
        logger.info("[STREAMING] Starting true Perplexity streaming generation")
        
        # First, generate a simple outline structure (titles + types) quickly
        slide_count = options.slide_count
        prompt_lower = (options.prompt or '').lower()
        pitch_indicators = [
            'pitch deck', 'investor pitch', 'sales pitch', 'product pitch', 'demo day',
            'fundraising', 'fund-raising', 'seed round', 'series a', 'series b', 'series c',
            'vc', 'venture', 'angel', 'roadshow', 'investor deck', 'go-to-market pitch', 'gtm pitch'
        ]
        is_pitch = any(ind in prompt_lower for ind in pitch_indicators) or (
            ' pitch' in prompt_lower and 'baseball' not in prompt_lower
        )
        if slide_count is None:
            # Align default slide count with detail level (consistency with non-streaming path)
            default_map = {
                'quick': 3,
                'standard': 6,
                'detailed': 10
            }
            if is_pitch:
                # For pitch, allow more slides with simpler content if not specified
                default_map = {
                    'quick': 6,
                    'standard': 10,
                    'detailed': 14
                }
            slide_count = default_map.get((options.detail_level or 'standard'), 6)
            # Hard clamp to supported bounds
            slide_count = max(1, min(20, slide_count))

        # Dynamic callout (quote/stat) plan based on slide count
        if slide_count <= 5:
            min_callouts, max_callouts = 0, 1
            callout_distribution_note = "Prefer 0; at most 1 if truly exceptional."
        elif slide_count <= 10:
            min_callouts, max_callouts = 1, 2
            callout_distribution_note = "Space them 3–5 slides apart; avoid back-to-back."
        elif slide_count <= 15:
            min_callouts, max_callouts = 2, 3
            callout_distribution_note = "Space them 3–6 slides apart; avoid back-to-back."
        else:
            min_callouts, max_callouts = 3, 5
            callout_distribution_note = "Sprinkle every 3–6 slides; never back-to-back."

        # Pitch-aware visual simplicity rules
        pitch_outline_rules = (
            "- PITCH MODE — Visual Simplicity: Favor fewer, high‑impact bullets.\n"
            "- Prefer dedicated STAT/QUOTE slides and a single simple chart per concept.\n"
            "- It is better to ADD slides than to crowd one slide.\n"
            "- Consider a 'Logo Wall' slide for traction/partners/customers when relevant.\n"
        ) if is_pitch else ""

        outline_prompt = f"""Create a clean presentation outline for:
{options.prompt}

Return STRICT JSON only:
{{
  "title": "<Deck Title>",
  "slides": ["<Slide Title 1>", "<Slide Title 2>", "..."],
  "slide_types": ["title|agenda|content|quote|stat|divider|transition|team|conclusion", "..."]
}}

Requirements:
- Create exactly {slide_count} slides.
- Slide 1 MUST be "title". For decks with ≥ 6 slides, use "conclusion" as the last slide.
- Inject {min_callouts}–{max_callouts} dedicated CALLOUT slides of type "quote" and/or "stat".
- Distribution: {callout_distribution_note}
- Never place two callout slides back-to-back.
- Make titles specific and engaging (avoid generic like "Introduction").
- Ensure slide_types aligns 1:1 with slides and uses only the allowed values.
{pitch_outline_rules}"""

        try:
            # Get quick outline structure
            from agents.ai.clients import get_client
            client, model_name = get_client("perplexity-sonar", wrap_with_instructor=False)
            
            # Use asyncio to run the synchronous API call in a thread executor
            loop = asyncio.get_event_loop()
            outline_response = await loop.run_in_executor(
                None,  # Use default thread pool
                lambda: client.chat.completions.create(
                    model=model_name,
                    messages=[{"role": "user", "content": outline_prompt}],
                    temperature=0.2,
                    max_tokens=1000,
                    extra_body={"return_citations": True, "search_recency_filter": "month", "search_domain_filter": ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"], "num_search_results": 10}
                )
            )
            
            outline_text = outline_response.choices[0].message.content
            
            # Parse the outline
            import json
            import re
            match = re.search(r'{[\s\S]*}', outline_text)
            if match:
                outline_data = json.loads(match.group(0))
                presentation_title = outline_data["title"]
                slide_titles = outline_data["slides"]
                slide_types = outline_data.get("slide_types") or [
                    ("title" if i == 0 else ("conclusion" if i == len(slide_titles) - 1 and len(slide_titles) >= 6 else "content"))
                    for i in range(len(slide_titles))
                ]
            else:
                # Fallback if parsing fails
                presentation_title = "Presentation"
                slide_titles = [f"Slide {i+1}" for i in range(slide_count)]
                slide_types = ["title"] + ["content"] * max(0, slide_count - 2) + (["conclusion"] if slide_count >= 2 else [])
                
        except Exception as e:
            logger.error(f"Failed to get outline structure: {e}")
            # Fallback structure with proper count
            presentation_title = "Presentation"
            slide_titles = [f"Slide {i+1}" for i in range(slide_count)]
            slide_types = ["title"] + ["content"] * max(0, slide_count - 2) + (["conclusion"] if slide_count >= 2 else [])
        
        logger.info(f"[STREAMING] Got outline: {len(slide_titles)} slides")
        
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
            """Generate a single slide - can run in parallel"""
            try:
                # Add staggered delay to create more natural streaming appearance
                stagger_delay = idx * 0.5  # 500ms delay between starts
                if stagger_delay > 0:
                    await asyncio.sleep(stagger_delay)
                
                logger.info(f"[PARALLEL] Starting slide {idx+1}: {slide_title} at {time.time()}")
                
                # Generate individual slide content with Perplexity (with citations)
                if slide_type == "quote":
                    slide_prompt = f"""Create a QUOTE slide for a presentation.

Presentation: {presentation_title}
Slide {idx+1} Title: {slide_title}
Context: {options.prompt}

Output exactly two lines:
1) A short, powerful quote (1–2 sentences, ≤ 24 words total)
2) Attribution line with name and role/company (e.g., "— Name, Title, Company")

No extra lines, no bullets, no commentary."""
                elif slide_type == "stat":
                    slide_prompt = f"""Create a STATISTIC slide for a presentation.

Presentation: {presentation_title}
Slide {idx+1} Title: {slide_title}
Context: {options.prompt}

Output 2–3 lines only:
1) ONE big number or percentage (e.g., "87%" or "$2.5M")
2) One ultra-short context line (2–5 words)
3) Optional: very short source attribution on a third line

No bullets, no paragraphs, no extra commentary."""
                else:
                    # Pitch-aware bullet limits
                    bullet_guidance = "3–5"  # default
                    if is_pitch:
                        bullet_guidance = "2–4"
                        if (options.visual_density or '').lower() == 'minimal':
                            bullet_guidance = "1–3"
                    slide_prompt = f"""Create detailed content for this slide in a presentation:

Presentation: {presentation_title}
Slide {idx+1}: {slide_title}
Context: {options.prompt}

Provide {bullet_guidance} bullet points of engaging, detailed content for this slide. Make it informative and appropriate for the audience.

STRICT OUTPUT FORMAT (MANDATORY):
- Return ONLY slide-ready bullet points.
- Each bullet MUST start with '• ' (bullet + space).
- One sentence per bullet (≤ 12–14 words). No multi-sentence bullets.
- No paragraphs, no introductions, no headings, no extra commentary.

IMPORTANT: Include relevant facts with citations. Use current information and cite your sources with [1], [2], etc., at the end of the relevant bullet."""

                logger.info(f"[PARALLEL] Making Perplexity API call for slide {idx+1}")
                
                # Use asyncio to run the synchronous API call in a thread executor
                loop = asyncio.get_event_loop()
                slide_response = await loop.run_in_executor(
                    None,  # Use default thread pool
                    lambda: client.chat.completions.create(
                        model=model_name,
                        messages=[{"role": "user", "content": slide_prompt}],
                        temperature=0.3,
                        max_tokens=500,
                        extra_body={"return_citations": True, "search_recency_filter": "month", "search_domain_filter": ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"], "num_search_results": 10}
                    )
                )
                logger.info(f"[PARALLEL] Perplexity API call completed for slide {idx+1}")
                
                slide_content = slide_response.choices[0].message.content
                
                # Extract citations from Perplexity response
                citations = []
                try:
                    # Check if response has citations attribute
                    if hasattr(slide_response, 'citations') and slide_response.citations:
                        for citation in slide_response.citations:
                            if isinstance(citation, dict):
                                citations.append({
                                    "title": citation.get('title', ''),
                                    "url": citation.get('url', ''),
                                    "source": citation.get('source', citation.get('url', ''))
                                })
                            elif isinstance(citation, str):
                                # Handle string citations (likely URLs)
                                citations.append({
                                    "title": citation,
                                    "url": citation,
                                    "source": citation
                                })
                            else:
                                # Handle other types (objects with attributes)
                                citations.append({
                                    "title": getattr(citation, 'title', str(citation)),
                                    "url": getattr(citation, 'url', str(citation)),
                                    "source": getattr(citation, 'source', getattr(citation, 'url', str(citation)))
                                })
                        logger.info(f"[CITATIONS] Found {len(citations)} citations for slide {idx+1}")
                    elif hasattr(slide_response.choices[0], 'citations') and slide_response.choices[0].citations:
                        for citation in slide_response.choices[0].citations:
                            if isinstance(citation, dict):
                                citations.append({
                                    "title": citation.get('title', ''),
                                    "url": citation.get('url', ''),
                                    "source": citation.get('source', citation.get('url', ''))
                                })
                            elif isinstance(citation, str):
                                citations.append({
                                    "title": citation,
                                    "url": citation,
                                    "source": citation
                                })
                            else:
                                citations.append({
                                    "title": getattr(citation, 'title', str(citation)),
                                    "url": getattr(citation, 'url', str(citation)),
                                    "source": getattr(citation, 'source', getattr(citation, 'url', str(citation)))
                                })
                        logger.info(f"[CITATIONS] Found {len(citations)} citations from choice for slide {idx+1}")
                except Exception as e:
                    logger.warning(f"[CITATIONS] Failed to extract citations for slide {idx+1}: {e}")
                    # Debug: log the actual response structure
                    logger.info(f"[CITATIONS DEBUG] Response type: {type(slide_response)}")
                    if hasattr(slide_response, 'citations'):
                        logger.info(f"[CITATIONS DEBUG] Citations type: {type(slide_response.citations)}")
                        if slide_response.citations:
                            logger.info(f"[CITATIONS DEBUG] First citation type: {type(slide_response.citations[0])}")
                            logger.info(f"[CITATIONS DEBUG] First citation value: {slide_response.citations[0]}")
                
                # Create slide object
                from .models import SlideContent
                import uuid
                
                slide = SlideContent(
                    id=str(uuid.uuid4()),
                    title=slide_title,
                    content=slide_content,
                    slide_type=slide_type or "content"
                )
                
                # Add citations to slide if found
                if citations:
                    slide.citations = citations
                    
                    # Create numbered footnotes for the citation panel
                    footnotes = []
                    for i, citation in enumerate(citations):
                        footnotes.append({
                            "index": i + 1,  # 1-based numbering for [1], [2], etc.
                            "label": citation.get("title", citation.get("source", "Unknown Source")),
                            "url": citation.get("url", "")
                        })
                    slide.footnotes = footnotes
                    
                    logger.info(f"[CITATIONS] Added {len(citations)} citations and {len(footnotes)} footnotes to slide {idx+1}")
                
                # Check if slide needs data/charts based on title and content  
                if (slide_type or "content") in ("quote", "stat", "divider", "transition"):
                    needs_data = False
                else:
                    needs_data = self._slide_needs_data(slide_title, slide_content)
                if needs_data:
                    try:
                        logger.info(f"[DATA] Generating chart data for slide {idx+1}: {slide_title}")
                        chart_data = await self._generate_chart_data_for_slide(slide_title, slide_content, presentation_title)
                        if chart_data:
                            # Add citations to chart metadata for citation panel
                            if citations:
                                chart_data.setdefault('metadata', {})
                                chart_data['metadata']['citations'] = citations
                                
                                # Also add footnotes for numbered citations in chart metadata
                                footnotes = []
                                for i, citation in enumerate(citations):
                                    footnotes.append({
                                        "index": i + 1,  # 1-based numbering for [1], [2], etc.
                                        "label": citation.get("title", citation.get("source", "Unknown Source")),
                                        "url": citation.get("url", "")
                                    })
                                chart_data['metadata']['footnotes'] = footnotes
                                
                                logger.info(f"[DATA] Added {len(citations)} citations and {len(footnotes)} footnotes to chart metadata for slide {idx+1}")
                            
                            slide.extractedData = chart_data
                            logger.info(f"[DATA] Added {chart_data['chartType']} chart with {len(chart_data.get('data', []))} data points to slide {idx+1}")
                    except Exception as e:
                        logger.warning(f"[DATA] Failed to generate chart data for slide {idx+1}: {e}")
                elif citations:
                    # If no chart but has citations, create annotations payload for citation panel
                    try:
                        # Create footnotes for the annotations payload too
                        footnotes = []
                        for i, citation in enumerate(citations):
                            footnotes.append({
                                "index": i + 1,  # 1-based numbering for [1], [2], etc.
                                "label": citation.get("title", citation.get("source", "Unknown Source")),
                                "url": citation.get("url", "")
                            })
                        
                        slide.extractedData = {
                            "chartType": "annotations",
                            "title": slide_title,
                            "data": [],
                            "metadata": {
                                "citations": citations,
                                "footnotes": footnotes
                            },
                            "source": "Research citations"
                        }
                        logger.info(f"[CITATIONS] Added citations-only payload with {len(footnotes)} footnotes to slide {idx+1} for citation panel")
                    except Exception as e:
                        logger.warning(f"[CITATIONS] Failed to add citations payload for slide {idx+1}: {e}")
                
                logger.info(f"[PARALLEL] Completed slide {idx+1}: {slide_title}")
                return idx, slide
                
            except Exception as e:
                logger.error(f"[PARALLEL] Failed to generate slide {idx+1}: {e}")
                # Create fallback slide
                from .models import SlideContent
                import uuid
                
                fallback_slide = SlideContent(
                    id=str(uuid.uuid4()),
                    title=slide_title,
                    content=f"Content for {slide_title}",
                    slide_type="content"
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
                logger.info(f"[REAL-TIME] Yielding slide {idx+1}: {slide.title} (completed at {time.time()})")
                logger.info(f"[TIMING] Slide {idx+1} generation took {time.time() - generation_start_time:.2f}s from slide generation start")
                
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
                
                logger.info(f"[REAL-TIME] Successfully yielded slide {idx+1} to frontend at {time.time()}!")
                
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
            logger.info(f"[STREAMING] True streaming generation complete: {len(slides)} slides at {time.time()}")
            logger.info(f"[STREAMING] Perplexity method finishing - should trigger early return")
            return

    def _slide_needs_data(self, title: str, content: str) -> bool:
        """Check if slide needs chart data based on title and content."""
        text = (title + " " + content).lower()
        data_keywords = [
            'statistics', 'data', 'chart', 'graph', 'trends', 'growth', 'capacity', 
            'numbers', 'figures', 'percentage', 'comparison', 'analysis', 'metrics',
            'by country', 'by region', 'over time', 'year', '2024', '2023', 'recent'
        ]
        return any(keyword in text for keyword in data_keywords)

    async def _generate_chart_data_for_slide(self, title: str, content: str, presentation_title: str) -> Optional[Dict[str, Any]]:
        """Generate realistic chart data for a slide."""
        try:
            from agents.ai.clients import get_client
            
            # Use a fast model for data generation
            client, model_name = get_client("perplexity-sonar", wrap_with_instructor=False)
            
            data_prompt = f"""Generate realistic chart data for this slide:

Title: {title}
Content: {content}
Presentation: {presentation_title}

Return ONLY a JSON object with:
{{
    "chartType": "bar|line|pie|area",
    "title": "Chart title",
    "data": [
        {{"label": "Item 1", "value": 123}},
        {{"label": "Item 2", "value": 456}}
    ],
    "source": "Generated based on typical industry data"
}}

Make the data realistic and relevant to the topic. Use 4-8 data points."""

            # Use asyncio to run the synchronous API call in a thread executor
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,  # Use default thread pool
                lambda: client.chat.completions.create(
                    model=model_name,
                    messages=[{"role": "user", "content": data_prompt}],
                    temperature=0.1,
                    max_tokens=400,
                    extra_body={"return_citations": True, "search_recency_filter": "month", "search_domain_filter": ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"], "num_search_results": 10}
                )
            )
            
            response_text = response.choices[0].message.content.strip()
            
            # Extract JSON from response
            import re
            json_match = re.search(r'{[\s\S]*}', response_text)
            if json_match:
                import json
                chart_data = json.loads(json_match.group(0))
                
                # Validate required fields
                if 'chartType' in chart_data and 'data' in chart_data:
                    return chart_data
                    
        except Exception as e:
            logger.warning(f"[DATA] Error generating chart data: {e}")
            
        # Fallback - create simple sample data
        return {
            "chartType": "bar",
            "title": f"Data for {title}",
            "data": [
                {"label": "Category 1", "value": 45},
                {"label": "Category 2", "value": 30},
                {"label": "Category 3", "value": 25}
            ],
            "source": "Sample data"
        }

    async def _generate_with_perplexity(self, options: OutlineOptions) -> Optional[OutlineResult]:
        """Single-pass outline generation using Perplexity Sonar that also embeds citations.
        Returns OutlineResult on success, or None to fall back.
        """
        try:
            # Use explicit Perplexity model if provided, else config default
            model = getattr(options, 'planning_model', None) or getattr(options, 'model', None) or PERPLEXITY_OUTLINE_MODEL
            if not isinstance(model, str) or not model.startswith('perplexity-'):
                model = PERPLEXITY_OUTLINE_MODEL
            client, model_name = get_client(model)
            max_tokens = min(20000, get_max_tokens_for_model(model, 20000))
            # Slide count guardrails (default to fewer slides in auto mode)
            slide_hint = options.slide_count or {
                'quick': 3,
                'standard': 6,
                'detailed': 10
            }.get(options.detail_level or 'standard', 6)
            # Smart content scaling: detect request type and adjust fact density
            prompt_lower = options.prompt.lower()
            # Detect pitch-style decks where visual simplicity is preferred
            pitch_indicators = [
                'pitch deck', 'investor pitch', 'sales pitch', 'product pitch', 'demo day',
                'fundraising', 'fund-raising', 'seed round', 'series a', 'series b', 'series c',
                'vc', 'venture', 'angel', 'roadshow', 'investor deck', 'go-to-market pitch', 'gtm pitch'
            ]
            is_pitch = any(ind in prompt_lower for ind in pitch_indicators) or (
                ' pitch' in prompt_lower and 'baseball' not in prompt_lower
            )
            # For pitch decks without an explicit slide count, allow slightly more slides with simpler content
            if options.slide_count is None and is_pitch:
                slide_hint = {
                    'quick': 6,
                    'standard': 10,
                    'detailed': 14
                }.get(options.detail_level or 'standard', 10)
            
            # Detect formal/comprehensive requests that need more facts
            formal_indicators = [
                'comprehensive', 'detailed', 'annual', 'quarterly', 'business review',
                'strategic', 'analysis', 'metrics', 'performance', 'extensive',
                'in-depth', 'thorough', 'complete', 'full', 'formal'
            ]
            
            # Detect simple/brief requests that need fewer but punchy facts
            simple_indicators = [
                'quick', 'brief', 'simple', 'pitch', 'overview', 'summary',
                'update', 'short', 'concise', 'rapid', 'fast', 'light'
            ]
            
            is_formal = any(indicator in prompt_lower for indicator in formal_indicators)
            is_simple = any(indicator in prompt_lower for indicator in simple_indicators)
            # Treat pitch context as simple-by-design (high-impact, visually minimal)
            if is_pitch:
                is_simple = True
            
            # Build fact-rich content rules based on visual density and request type
            density = (options.visual_density or '').lower()
            
            if is_formal and not is_simple:
                # Formal presentations: Still concise; prioritize the strongest facts
                if density == 'minimal':
                    density_rules = "- 2–5 punchy, fact-first bullets per slide; each anchored by a number, percentage, date, or named source."
                elif density == 'dense':
                    density_rules = "- 5–7 concise fact bullets per slide; no fluff; each bullet ≤ 12 words when possible."
                elif density == 'rich':
                    density_rules = "- 5–6 compact, research-backed bullets per slide; each with a specific metric or named evidence."
                else:
                    density_rules = "- 4–6 fact-heavy bullets per slide; each bullet one sentence (max two)."
            elif is_simple and not is_formal:
                # Simple presentations: Fewer, stronger bullets
                if is_pitch and density == 'minimal':
                    density_rules = "- 1–3 essential bullets per slide; prefer one clear metric per bullet."
                elif is_pitch:
                    density_rules = "- 2–4 impactful bullets per slide; prefer one clear metric or chart."
                elif density == 'minimal':
                    density_rules = "- 2–4 essential bullets per slide; prefer one clear metric per bullet."
                elif density == 'dense':
                    density_rules = "- 4–5 key bullets per slide; each concise and measurable."
                elif density == 'rich':
                    density_rules = "- 4–5 impactful bullets per slide; each with one concrete fact."
                else:
                    density_rules = "- 3–5 concise bullets per slide; numbers over adjectives; no filler."
            else:
                # Standard fact-rich content (neutral or mixed indicators)
                if density == 'minimal':
                    density_rules = "- 2–5 fact-based bullets per slide; each bullet ≤ 12–14 words."
                elif density == 'dense':
                    density_rules = "- 5–6 concise, research-backed bullets per slide; avoid multi-clause sentences."
                elif density == 'rich':
                    density_rules = "- 4–6 compact bullets per slide; each with specific data or sources."
                else:
                    density_rules = "- 4–5 substantive yet brief bullets per slide; one sentence each."

            # Additional visual simplicity guidance for pitch context
            pitch_visual_rules = (
                "- PITCH MODE — Visual Simplicity: Favor fewer, high‑impact bullets.\n"
                "- Prefer dedicated STAT/QUOTE slides and a single simple chart per concept.\n"
                "- It is better to ADD slides than to crowd one slide.\n"
                "- If logos are relevant (traction/partners/customers/investors), include a 'Logo wall' slide. List recognizable names when images aren't available.\n"
            ) if is_pitch else ""

            maturity_rules = (
                "- FACT-FIRST APPROACH: Every bullet must contain specific researched facts, statistics, or data points.\n"
                "- RESEARCH DEPTH: Include exact numbers, percentages, dollar amounts, dates, study names, company data.\n"
                "- CONCRETE EVIDENCE: Reference real companies, specific markets, named studies, measurable outcomes.\n"
                "- SOURCE-BACKED: Use current data from your web research - no generic statements or assumptions.\n"
                "- QUANTIFIED INSIGHTS: Transform vague statements into specific, measurable facts with numbers.\n"
                "- Align to the user's intent; reflect their topic language.\n"
                "- No disclaimers or meta talk. Slide-ready tone."
            )

            chart_rules = (
                "- When a slide lends itself to visualization (categories, timelines, rankings, shares, trends), include a chart with REAL, NUMERIC data.\n"
                "- STRICT SCHEMA (use one):\n"
                "  chart: { chartType: 'column'|'bar'|'line'|'pie', title: string, data: Array<{ name: string, value: number }> }\n"
                "  // Alternative accepted keys if needed (we will normalize):\n"
                "  chart_data | dataset | table | series | datasets (same structure; we will convert to data: [{name,value}]).\n"
                "- Use real category names (e.g., 'North America', 'Q1 2024', 'Chrome'). NEVER use generic labels like 'Category A' or 'Item 1'.\n"
                "- Values MUST be numbers (no '%' sign, no strings).\n"
                "- CRITICAL MIXED UNITS RULE: All values in a single chart MUST share ONE measurement unit across the entire dataset (all % OR all USD OR all counts). DO NOT mix units under any circumstances.\n"
                "- FORBIDDEN MIXED UNIT EXAMPLES:\n"
                "  ❌ NEVER DO: [{name: 'Lifetime Sales (Millions)', value: 150}, {name: 'RAM (KB)', value: 64}, {name: 'On-Screen Colors', value: 256}] // Mixing sales $ + memory + count\n"
                "  ❌ NEVER DO: [{name: 'Revenue', value: 2500000}, {name: 'Employees', value: 45}, {name: 'Market Share %', value: 12}] // Mixing currency + headcount + percentage\n"
                "  ❌ NEVER DO: [{name: 'Game Sales', value: 50}, {name: 'Console RAM', value: 512}, {name: 'Color Palette', value: 16}] // Mixing units + memory + technical specs\n"
                "- CORRECT SINGLE-UNIT EXAMPLES:\n"
                "  ✅ GOOD: [{name: 'Q1 Sales', value: 150}, {name: 'Q2 Sales', value: 180}, {name: 'Q3 Sales', value: 200}] // All millions USD\n"
                "  ✅ GOOD: [{name: 'Chrome', value: 65}, {name: 'Firefox', value: 18}, {name: 'Safari', value: 17}] // All percentages\n"
                "  ✅ GOOD: [{name: 'North America', value: 450}, {name: 'Europe', value: 320}, {name: 'Asia', value: 280}] // All employee counts\n"
                "- WHEN UNITS CANNOT BE UNIFIED: Present the information as bullet points with clear units in text. DO NOT attempt to chart incompatible data.\n"
                "- MIXED UNIT DETECTION: If your data includes sales figures, technical specifications, percentages, counts, memory sizes, or other incompatible units - DO NOT create a chart.\n"
                "- DATA DENSITY: Prefer 10–20+ points when appropriate. For time series, include at least 12–24 periods (e.g., months) or 8–12 quarters.\n"
                "- Prefer 'line' for time series, 'column' for categories, 'pie' only for shares that sum to ~100%.\n"
                "- Axis labels: Rotate bottom axis labels 30–45° when long to avoid cropping; increase bottom margin accordingly (Highcharts: xAxis.labels.rotation/autoRotation + chart.marginBottom).\n"
                "- Omit chart if not clearly beneficial or if data has mixed units."
            )

            # Dynamic callout (quote/stat) plan based on slide count
            try:
                if slide_hint <= 5:
                    min_callouts, max_callouts = 0, 1
                    callout_distribution_note = "Prefer 0; at most 1 if truly exceptional."
                elif slide_hint <= 10:
                    min_callouts, max_callouts = 1, 2
                    callout_distribution_note = "Space them 3–5 slides apart; avoid back-to-back."
                elif slide_hint <= 15:
                    min_callouts, max_callouts = 2, 3
                    callout_distribution_note = "Space them 3–6 slides apart; avoid back-to-back."
                else:
                    min_callouts, max_callouts = 3, 5
                    callout_distribution_note = "Sprinkle every 3–6 slides; never back-to-back."
                freq_min = int(min_callouts * 100 / max(1, slide_hint))
                freq_max = int(max_callouts * 100 / max(1, slide_hint))
                callout_frequency_range = f"{freq_min}–{freq_max}%"
            except Exception:
                # Safe defaults
                min_callouts, max_callouts = 1, 2
                callout_frequency_range = "5–15%"
                callout_distribution_note = "Space them 3–6 slides apart; avoid back-to-back."

            callout_rules = (
                f"- Deck size detected: {slide_hint} slides.\n"
                f"- Target dedicated callout slides (type 'quote' or 'stat'): {min_callouts}–{max_callouts} total ({callout_frequency_range} of slides).\n"
                "- Only include when a fact or quote is truly standout and visual.\n"
                f"- Distribution: {callout_distribution_note}\n"
                "- Keep callouts minimal: 1–2 short lines; include citation/source when possible.\n"
            )

            system = (
                "You are a research-driven presentation outliner with comprehensive web knowledge. "
                "MISSION: Generate fact-dense slides packed with specific researched data, statistics, and evidence. "
                "Every bullet point must contain concrete facts from your research - numbers, percentages, company data, study results. "
                "Avoid generic statements. Use your web research to provide current, specific, measurable information. "
                "Return STRICT JSON only. Titles must be concise and concrete. "
                "Include citations array per slide with url/title/source when available. "
                "Conform to the JSON schema exactly. "
                "SLIDE MODE: You are producing a slide deck. Write slide headlines and bullet microcopy; no paragraphs, no meta commentary, no prefaces. "
                "CITATION POLICY: Do NOT use YouTube (youtube.com, youtu.be) as a source; prefer reputable articles, reports, company sites, documentation."
            )
            # Dynamic bullet limits for 'content' slides
            if is_pitch:
                content_bullet_limits = "2–4 bullets (≤ 12–14 words each); prefer one chart/stat when possible."
                if density == 'minimal':
                    content_bullet_limits = "1–3 bullets (≤ 12–14 words); prefer a single stat or chart."
            else:
                content_bullet_limits = "3–5 bullets (concise, fact‑first)."

            user = (
                f"Topic: {options.prompt}\n\n"
                f"Style: {options.style_context or 'Professional'}\n"
                f"Detail: {options.detail_level}\n"
                f"Slides: EXACTLY {slide_hint}\n"
                f"Visual Density:\n{density_rules}\n\n"
                f"{pitch_visual_rules}"
                f"Maturity:\n{maturity_rules}\n\n"
                f"Charts:\n{chart_rules}\n\n"
                f"CALLOUT STRATEGY:\n{callout_rules}\n"
                "PRESENTATION MODE (CRITICAL):\n"
                "- This is for SLIDES. Output must be slide-ready headlines and bullets.\n"
                "- No narrative paragraphs anywhere (including outside the JSON).\n"
                "- No disclaimers, no meta talk, no prefaces.\n\n"
                "- CITATIONS: Exclude YouTube sources. Do not cite youtube.com or youtu.be. Prefer reputable written sources.\n"
                "- SOURCES FORMAT: Use numeric [n] markers in bullets and DO NOT include full source lines inside content. A single consolidated 'Sources' footer will list [1][2][3] once. Do not create multiple sources blocks per slide.\n\n"
                "STRICT COMPLIANCE — FOLLOW USER INSTRUCTIONS EXACTLY:\n"
                "- If the user specifies an exact slide count (e.g., '2 slides'), generate EXACTLY that many slides.\n"
                "- If the user provides per-slide directives (e.g., 'Slide 1: …', 'Slides 2–5: …'), follow those directives PRECISELY for the specified slides (ordering, titles, types, and focus).\n"
                "- Do NOT add, remove, or reorder slides unless the user explicitly instructs you to.\n"
                "- When a range like 'Slides 2–5' is given, apply the described structure consistently to each slide in that range.\n"
                "- If general best‑practice rules conflict with explicit user instructions, PRIORITIZE the user's instructions.\n"
                "- Output slide content as concise bullets (no paragraphs), each starting with the bullet marker '•'.\n"
                "- Each bullet is ONE sentence (MAX two) and ≤ 12–14 words when possible.\n"
                "- FACT-FIRST: Prefer numbers, dates, names, and concrete outcomes over adjectives.\n\n"
                "SLIDE TYPES & STRUCTURE RULES:\n"
                "- Slide 1 MUST be a Title slide with hero title and brief metadata (subtitle/kicker, presenter, organization, date).\n"
                "- Agenda: Include only for business/professional decks; for educational topics, prefer a 'Learning Objectives' slide instead.\n"
                "- Team: Allowed when the user's topic or instructions imply presenters or a group; otherwise omit.\n"
                "- Callouts: Use dedicated Quote/Stat slides for the most impactful lines; keep them minimal (1–2 short lines).\n"
                "- Dividers/Transitions: Use to mark section changes and show progress; keep text minimal.\n"
                "- Keep some slides intentionally minimal (quote/stat/divider/transition) and avoid verbosity on those.\n"
                "- Educational topics (e.g., Solar System): prefer Learning Objectives, Core Concepts, Fun Facts, Activities, and Conclusion; avoid business‑specific slides like Team.\n\n"
                "TITLE SLIDE CONTENT (STRICT):\n"
                "- The title slide's content must include ONLY metadata placeholders (no body content): [Subtitle], [Presenter], [Organization], [Date], [Optional Tagline/Logo].\n"
                "- Do NOT include regular bullets or narrative text on the title slide.\n\n"
                "BULLET LIMITS BY SLIDE TYPE (guidance):\n"
                "- title: 0–3 metadata placeholders (subtitle/presenter/organization/date). No body bullets.\n"
                "- quote/stat: 1 short line only.\n"
                "- divider/transition: 1 short line.\n"
                "- agenda/learning objectives: 3–4 bullets.\n"
                f"- content/team: {content_bullet_limits}\n\n"
                "QUALITY CHECKLIST & SELF‑REFINEMENT (perform before finalizing):\n"
                "1) SLIDE COUNT: Matches the exact requested count or user's explicit per‑slide plan.\n"
                "2) STRUCTURE: Slide 1 is Title (hero + brief metadata). Title slide has ONLY metadata placeholders; no body bullets. For educational topics: include 'Learning Objectives' early; include 'Core Concepts/Overview', 'Fun Facts' or 'Key Facts', 'Activities', and 'Conclusion/Questions'. Team slide only if explicitly warranted.\n"
                "3) CHART UNITS: Each chart uses ONE measurement unit; no mixed units. If mixed, omit the chart and summarize as text bullets.\n"
                "4) CALLOUTS: Include at least one dedicated Quote slide and one dedicated Stat slide when strong facts/quotes exist; keep them short (≤ 24 words).\n"
                "5) CONCISION: Content slides use 3–5 bullets; each bullet one sentence (≤ 12–14 words). Minimal slides (quote/stat/divider/transition) use 1 line.\n"
                "6) VALIDATION: If any checklist item fails, internally revise and regenerate the outline; repeat up to 2 times before responding. Return only the final JSON.\n\n"
                "Return JSON object (STRICT JSON, no prose):\n"
                "{\n"
                "  title: string,\n"
                "  slides: Array<{\n"
                "    title: string,\n"
                "    type?: 'title'|'agenda'|'content'|'team'|'transition'|'divider'|'quote'|'stat'|'conclusion',\n"
                "    content: string,   // slide-ready bullets, each on a new line with a bullet marker\n"
                "    // OPTIONAL: if a short QUOTE or STAT is especially impactful, declare it here\n"
                "    callouts?: { quotes?: string[], stats?: string[] },\n"
                "    citations?: Array<{ title?: string, source?: string, url: string }>,\n"
                "    chart?: { chartType: 'column'|'bar'|'line'|'pie', title: string, data: Array<{ name: string, value: number }> }\n"
                "  }>\n"
                "}\n"
                "IMPACTFUL FACT CALLOUTS (use strategically):\n"
                "- Identify the most shocking, surprising, or compelling facts from your research\n"
                "- Extract standout statistics that would grab audience attention\n"
                "- Quotes: Powerful statements from executives, experts, studies (< 24 words)\n"
                "- Stats: Jaw-dropping numbers that tell a story ('500% growth', '$50B market disruption', '9 out of 10 companies')\n"
                f"- Target count: {min_callouts}–{max_callouts} total callout slides (~{callout_frequency_range} of slides)\n"
                "- Small decks (≤ 5): Prefer 0; max 1 only if truly exceptional\n"
                "- Distribution: Sprinkle across the deck, never back-to-back; prefer one early hook and one mid‑deck driver\n"
                "- Each callout must be backed by your web research with specific sources\n\n"
            )
            # Call raw text generation
            text = invoke(
                client,
                model_name,
                [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user}
                ],
                response_model=None,
                max_tokens=max_tokens,
                temperature=0.2
            )
            # Parse JSON
            try:
                import re, json as _json
                m = re.search(r"\{[\s\S]*\}", text)
                payload = _json.loads(m.group(0) if m else text)
            except Exception:
                return None
            # Validate shape
            title = payload.get('title') or 'Untitled Presentation'
            slides_in = payload.get('slides') or []
            if not isinstance(slides_in, list) or not slides_in:
                return None
            # Build SlideContent list preserving citations and optional chart -> extractedData
            slides: List[SlideContent] = []
            for s in slides_in:
                s_title = (s or {}).get('title') or 'Slide'
                # Accept bullets array or content string
                if isinstance((s or {}).get('bullets'), list) and (s or {}).get('bullets'):
                    try:
                        s_content = "\n".join([f"• {str(b).strip()}" for b in (s or {}).get('bullets') if str(b).strip()])
                    except Exception:
                        s_content = (s or {}).get('content') or ''
                else:
                    s_content = (s or {}).get('content') or ''
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
                                ctype = 'line' if any(w in ctitle.lower() for w in ['timeline', 'trend', 'over time', 'history']) else 'column'
                            if ctype in ['column', 'bar', 'line', 'pie']:
                                chart_data_obj = ChartData(chart_type=ctype, data=cdata, title=ctitle, metadata=None)
                    except Exception:
                        chart_data_obj = None
                # Attach citations into extractedData metadata for frontend and a tiny footer
                if isinstance(citations, list) and citations:
                    try:
                        urls = []
                        meta_citations = []
                        for c in citations:
                            url = (c or {}).get('url')
                            if url:
                                urls.append(url)
                            meta_citations.append({
                                'title': (c or {}).get('title'),
                                'source': (c or {}).get('source'),
                                'url': url or ''
                            })
                        # Store citations for footer and possible chart metadata, but do NOT set extractedData unless we have real chart data
                        citations_meta = meta_citations
                        footer = {'showThinDivider': True, 'urls': [u for u in urls if u]}
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
                
                # Detect impactful quotes/stats to split into dedicated slides
                def _normalize_line(text: str) -> str:
                    try:
                        import re as _re
                        t = text.strip()
                        # Remove leading bullets/markers and surrounding quotes
                        t = _re.sub(r'^(?:[•\-*\d\.\)\s]+)', '', t)
                        t = t.strip('"“"').strip()
                        # Collapse whitespace and lowercase
                        t = ' '.join(t.split()).lower().rstrip('.')
                        return t
                    except Exception:
                        return text.strip().lower()
                
                def _find_callouts_from_content(content_text: str) -> list[dict]:
                    import re as _re
                    results: list[dict] = []
                    lines = [ln for ln in (content_text or '').split('\n') if ln.strip()]
                    # 1) Prefer supplied callouts if present
                    supplied_quotes = supplied_callouts.get('quotes') if isinstance(supplied_callouts, dict) else None
                    supplied_stats = supplied_callouts.get('stats') if isinstance(supplied_callouts, dict) else None
                    if supplied_quotes and isinstance(supplied_quotes, list):
                        for q in supplied_quotes:
                            q_text = str(q).strip()
                            if q_text:
                                results.append({'type': 'quote', 'text': q_text})
                    if supplied_stats and isinstance(supplied_stats, list):
                        for st in supplied_stats:
                            st_text = str(st).strip()
                            if st_text:
                                results.append({'type': 'stat', 'text': st_text})
                    # 2) Heuristic detection if nothing supplied (or to complement, capped later)
                    if len(results) < 2:
                        # Detect quotes: lines wrapped in quotes or containing curly quotes, short-ish
                        for ln in lines:
                            raw = ln.strip()
                            text = raw.lstrip('•-* ').strip()
                            word_count = len(text.split())
                            if word_count >= 3 and word_count <= 24 and ((text.startswith('"') and text.endswith('"')) or ('"' in text and '"' in text)):
                                results.append({'type': 'quote', 'text': text.strip('"')})
                                if len(results) >= 2:
                                    break
                    if len(results) < 2:
                        # Detect stats: percent/currency/compact magnitudes, short
                        stat_pattern = _re.compile(r'(?:^|\s)(?:\$\s?\d[\d,]*(?:\.\d+)?(?:[kKmMbB])?|\d+(?:\.\d+)?\s?%)')
                        for ln in lines:
                            raw = ln.strip()
                            text = raw.lstrip('•-* ').strip()
                            if len(text.split()) <= 12 and stat_pattern.search(text):
                                results.append({'type': 'stat', 'text': text})
                                if len(results) >= 2:
                                    break
                    # Dynamic cap: 2 normally, up to 4 on long slides
                    try:
                        # Long slide if content has many lines or words
                        line_count = len(lines)
                        word_count = sum(len((ln or '').split()) for ln in lines)
                        dynamic_cap = 4 if (line_count >= 8 or word_count >= 120) else 2
                    except Exception:
                        dynamic_cap = 2
                    return results[:dynamic_cap]
                
                detected_callouts = _find_callouts_from_content(s_content)
                # Remove detected callout lines from main content to avoid duplication
                if detected_callouts:
                    targets = {_normalize_line(c['text']) for c in detected_callouts}
                    kept_lines = []
                    for ln in s_content.split('\n'):
                        norm_ln = _normalize_line(ln)
                        if norm_ln and norm_ln in targets:
                            # Skip this line; it will be moved to a dedicated slide
                            continue
                        kept_lines.append(ln)
                    s_content = '\n'.join(kept_lines).strip()
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
                    slide_obj.chart_data = chart_data_obj
                    # Convert chart_data to frontend extractedData format with normalization
                    try:
                        ed = self.chart_generator.convert_chart_data_to_extracted_data(chart_data_obj, s_title)
                        slide_obj.extractedData = ed
                    except Exception:
                        pass
                slides.append(slide_obj)
                # Append callout slides right after the source slide
                if detected_callouts:
                    for call in detected_callouts:
                        try:
                            ctype = 'quote' if call.get('type') == 'quote' else 'stat'
                            # Don't show "Quote" or "Key Stat" as the slide title
                            ctitle = ''  # Empty title so these labels don't appear on the slide
                            cfooter = footer  # reuse same citations footer if any
                            call_slide = SlideContent(
                                id=str(uuid.uuid4()),
                                title=ctitle,
                                content=str(call.get('text', '')).strip(),
                                slide_type=ctype,
                                extractedData=None,
                                citationsFooter=cfooter
                            )
                            slides.append(call_slide)
                        except Exception:
                            # Non-fatal; continue without callout
                            pass
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