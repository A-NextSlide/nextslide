import asyncio
import json
import logging
import time
import uuid
from typing import Optional, List, Dict, Any

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from services.outline_service import OutlineGenerator, OutlineOptions
from models.narrative_flow import NarrativeFlow
from services.narrative_flow_analyzer import NarrativeFlowAnalyzer

from .models import OutlineRequest, OutlineResponse
from .utils import _infer_requested_slide_count_from_prompt
from .converter import _convert_to_api_format

logger = logging.getLogger(__name__)


async def process_outline(request: OutlineRequest, registry=None) -> OutlineResponse:
    """Process outline generation request"""
    try:
        generator = OutlineGenerator(registry)
        
        # Infer slide/page count from prompt when not explicitly provided
        inferred_slide_count = request.slideCount
        if inferred_slide_count is None:
            inferred_slide_count = _infer_requested_slide_count_from_prompt(request.prompt)

        options = OutlineOptions(
            prompt=request.prompt,
            detail_level=request.detailLevel or "standard",
            # enable_research is now determined intelligently by analyzing the prompt
            # The generator_flow will call should_research() to decide
            style_context=request.styleContext,
            font_preference=request.fontPreference,
            color_scheme=request.colorPreference,  # Pass the full colorPreference object
            files=request.files,
            model=request.model,
            slide_count=inferred_slide_count,
            visual_density=(request.visualDensity or None),
            async_images=request.async_images if request.async_images is not None else True
        )
        
        result = await generator.generate(options)
        outline = _convert_to_api_format(result)
        
        # Generate narrative flow but don't wait for saving
        narrative_flow = None
        try:
            flow_analyzer = NarrativeFlowAnalyzer()
            outline_dict = outline.model_dump()
            narrative_flow = await flow_analyzer.analyze_narrative_flow(
                outline_dict,
                context=request.prompt
            )
            logger.info("Narrative flow analysis completed successfully")
            
            # Add narrative flow to outline for deck creation
            outline.notes = narrative_flow.model_dump()
            logger.info("Added narrative flow as 'notes' to outline for deck creation")
            
        except Exception as e:
            logger.warning(f"Failed to analyze narrative flow: {e}")
            # Continue without narrative flow
        
        return OutlineResponse(
            success=True,
            hasResult=True,
            outline=outline,
            narrative_flow=narrative_flow,  # Include it in response
            message=f"Generated {len(outline.slides)} slides"
        )
        
    except Exception as e:
        logger.error(f"Outline generation failed: {e}")
        return OutlineResponse(
            success=False,
            hasResult=False,
            error=str(e),
            message=f"Failed to generate outline: {str(e)}"
        )

async def process_outline_stream(request: OutlineRequest, registry=None):
    """Process outline generation request and return streaming response"""
    logger.info(f"Outline generation started for model: {request.model}")
    logger.info(f"Returning streaming response (model: {request.model})")
    
    # Create a task holder that persists beyond the stream
    narrative_flow_task_holder = {"task": None, "outline_id": None}
    
    async def complete_narrative_flow_if_needed():
        """Helper to complete narrative flow generation and save it"""
        try:
            logger.info(f"[NARRATIVE FLOW COMPLETE] Task holder state: task={narrative_flow_task_holder['task'] is not None}, outline_id={narrative_flow_task_holder['outline_id']}")
            
            if narrative_flow_task_holder["task"]:
                logger.info(f"[NARRATIVE FLOW COMPLETE] Waiting for narrative flow generation to complete for outline {narrative_flow_task_holder['outline_id']}")
                try:
                    result = await narrative_flow_task_holder["task"]
                    if result:
                        logger.info(f"[NARRATIVE FLOW COMPLETE] Narrative flow generation completed for outline {narrative_flow_task_holder['outline_id']}")
                        # Don't save to deck here - outline ID is not deck UUID!
                        # The deck creation process will handle saving the narrative flow
                        logger.info(f"[NARRATIVE FLOW COMPLETE] Narrative flow will be saved when deck is created")
                    else:
                        logger.warning(f"[NARRATIVE FLOW COMPLETE] Narrative flow generation returned None for outline {narrative_flow_task_holder['outline_id']}")
                except Exception as e:
                    logger.error(f"[NARRATIVE FLOW COMPLETE] Error waiting for narrative flow: {e}")
            else:
                logger.info(f"[NARRATIVE FLOW COMPLETE] No narrative flow task to wait for")
        except Exception as e:
            logger.error(f"[NARRATIVE FLOW COMPLETE] Error in complete_narrative_flow_if_needed: {e}")
    
    def _sse(event: Dict[str, Any]) -> bytes:
        try:
            return f"data: {json.dumps(event)}\n\n".encode("utf-8")
        except Exception:
            return b"data: {\"type\": \"error\", \"error\": \"serialization_failed\"}\n\n"
    
    async def event_stream():
        # Initialize variables
        outline = None
        outline_dict = None
        detected_style_context = None  # ensure defined for downstream conditionals
        
        # Initialize narrative flow variables
        narrative_flow_task = None
        narrative_flow_result = None
        narrative_flow_started = False
        
        # Track if we sent outline_ready
        outline_ready_sent = False
        accumulated_slides = []
        
        try:
            # Emit an immediate connection event to open the stream in clients and proxies
            yield _sse({'type': 'connection_established', 'message': 'SSE stream open'})
            await asyncio.sleep(0)
            # Extract user_id if available
            user_id = getattr(request, '_user_id', None)
            if user_id:
                logger.info(f"Processing outline for authenticated user: {user_id}")

            # Log basic request info
            logger.info(f"Outline generation started (detail={request.detailLevel}, slides={request.slideCount}, async_images={request.async_images})")

            # Start ThemeAgent in parallel with outline generation
            # This detects brand/colors/fonts while outline is being generated
            from agents.theme import run_theme_agent_parallel
            theme_task = asyncio.create_task(
                run_theme_agent_parallel(
                    title=request.prompt[:100],  # Use prompt as initial title
                    prompt=request.prompt,
                    context=request.styleContext,
                    include_videos=False,
                    include_brand_design=False,
                )
            )
            logger.info(f"[PARALLEL THEME] Started ThemeAgent in background")

            # Emit theme_loading event so frontend shows spinner in theme tab
            yield _sse({'type': 'theme_loading', 'message': 'Detecting brand and colors...'})
            await asyncio.sleep(0)

            generator = OutlineGenerator(registry)
            
            # Normalize colorPreference: allow dict input and map into color_scheme string or structured dict
            normalized_color = request.colorPreference
            try:
                if isinstance(request.colorPreference, dict):
                    # Prefer a concise string for OutlineOptions if model requires, otherwise pass dict through
                    name = request.colorPreference.get('name') or request.colorPreference.get('type') or 'custom'
                    bg = request.colorPreference.get('background')
                    text = request.colorPreference.get('text')
                    a1 = request.colorPreference.get('accent1')
                    # Keep dict form for downstream generator which expects colorPreference=dict
                    normalized_color = {
                        'type': request.colorPreference.get('type', 'custom'),
                        'name': name,
                        'background': bg,
                        'text': text,
                        'accent1': a1,
                        'specificColors': request.colorPreference.get('specificColors')
                    }
            except Exception:
                normalized_color = request.colorPreference

            # Infer slide/page count from prompt when not explicitly provided
            inferred_slide_count = request.slideCount
            if inferred_slide_count is None:
                inferred_slide_count = _infer_requested_slide_count_from_prompt(request.prompt)

            options = OutlineOptions(
                prompt=request.prompt,
                detail_level=request.detailLevel or "standard",
                # enable_research is now determined intelligently by analyzing the prompt
                # The generator_flow will call should_research() to decide
                style_context=request.styleContext,
                font_preference=request.fontPreference,
                color_scheme=normalized_color,
                files=request.files,
                model=request.model,
                slide_count=inferred_slide_count,
                visual_density=(request.visualDensity or None),
                async_images=request.async_images if request.async_images is not None else True
            )

            
            outline = None  # Store the outline for deck creation
            
            # Check if streaming is available
            if hasattr(generator, 'stream_generation'):
                async for update in generator.stream_generation(options):
                    # Forward agent-based research events explicitly for frontend streaming UI
                    # BUT DO NOT send research findings to frontend - they're only used internally for slide content
                    if update.stage in {
                        "research_started",
                        "research_plan",
                        "research_search_results",
                        "research_page_fetched",
                        "research_synthesis",
                        "research_complete",
                        "research_error",
                    }:
                        research_payload = {
                            'type': update.stage,
                            'message': update.message,
                            'progress': update.progress,
                        }
                        # CRITICAL: DO NOT send 'findings' to frontend
                        # Research findings are only for internal use in slide generation
                        # Sources will appear on slides only when content actually cites them
                        if update.metadata:
                            metadata_copy = update.metadata.copy()
                            # Remove findings from metadata before sending to frontend
                            if 'findings' in metadata_copy:
                                del metadata_copy['findings']
                            research_payload.update(metadata_copy)
                        yield _sse(research_payload)
                        await asyncio.sleep(0)  # ensure flush
                        continue
                    if update.stage == "outline_ready":
                        outline_data = {
                            'type': 'outline_structure',
                            'title': update.metadata['title'],
                            'slideCount': update.metadata['slide_count'],
                            'slideTitles': update.metadata['slide_titles'],
                            'progress': update.progress
                        }
                        
                        # Include slide types if available
                        if 'slide_types' in update.metadata:
                            outline_data['slideTypes'] = update.metadata['slide_types']
                        
                        yield _sse(outline_data)
                        await asyncio.sleep(0)  # Ensure event is flushed
                    
                    elif update.stage == "slide_ready":
                        slide_data = update.metadata['slide']
                        
                        # Debug log tagged media
                        tm_count = len(slide_data.get('taggedMedia', []))
                        logger.debug(f"[API] Slide {update.metadata['slide_index'] + 1} has {tm_count} taggedMedia items in slide_data")
                        if tm_count > 0:
                            logger.debug(f"[API] First tagged media: {slide_data['taggedMedia'][0].get('filename', 'unknown')}")
                        
                        # Build response data separately to avoid multi-line f-string issues
                        # Prepare taggedMedia with debug logging
                        tagged_media = slide_data.get('taggedMedia', [])
                        logger.debug(f"[API] Building slide_complete for slide {update.metadata['slide_index'] + 1} with {len(tagged_media)} taggedMedia items")
                        
                        # Sanitize extractedData before sending
                        sanitized_ed = _sanitize_extracted_data(slide_data.get('extractedData'))
                        response_data = {
                            'type': 'slide_complete',
                            'slideIndex': update.metadata['slide_index'],
                            'slide': {
                                'id': slide_data['id'],
                                'title': slide_data['title'],
                                'content': slide_data['content'],
                                'extractedData': sanitized_ed,  # Include sanitized extractedData
                                'taggedMedia': tagged_media,  # Include taggedMedia
                                'deepResearch': slide_data.get('deepResearch', False),  # Include deepResearch flag
                                'citations': slide_data.get('citations', []),  # Include citations for frontend
                                'footnotes': slide_data.get('footnotes', [])  # Include footnotes for Sources panel
                            },
                            'progress': update.progress,
                            'message': f"Generated slide {update.metadata['slide_index'] + 1}: {slide_data['title']}"
                        }
                        
                        # Final debug log before sending
                        logger.debug(f"[API] Sending slide_complete with taggedMedia count: {len(response_data['slide']['taggedMedia'])}")
                        logger.info(f"[API STREAM] Slide {update.metadata['slide_index'] + 1}: citations={len(response_data['slide'].get('citations', []))}, footnotes={len(response_data['slide'].get('footnotes', []))}")
                        
                        yield _sse(response_data)
                        # No artificial delay - we want real streaming timing
                        await asyncio.sleep(0.01)  # Minimal flush delay
                    
                    elif update.stage == "complete":
                        # Fast-path: avoid heavy reconstruction; build outline from accumulated slides
                        result_data = update.metadata['result']
                        simple_slides = []
                        try:
                            for s in accumulated_slides:
                                simple_slides.append(SlideOutline(
                                    id=s.get('id'),
                                    title=s.get('title'),
                                    content=s.get('content', ''),
                                    deepResearch=False,
                                    citations=s.get('citations', []),
                                    footnotes=s.get('footnotes', []),
                                    extractedData=s.get('extractedData'),
                                    taggedMedia=s.get('taggedMedia', [])
                                ))
                        except Exception:
                            simple_slides = []

                        # CRITICAL: Generate UUID for outline - this becomes the deck UUID
                        outline_id = result_data.get('id') or str(uuid.uuid4())
                        logger.info(f"[UUID_FIX] Creating outline with ID: {outline_id}")

                        # Convert uploadedMedia dicts to TaggedMediaItem objects if provided
                        uploaded_media_items = None
                        logger.info(f"[OUTLINE] 📎 request.uploadedMedia = {request.uploadedMedia}")
                        logger.info(f"[OUTLINE] 📎 request.uploadedMedia is None: {request.uploadedMedia is None}")
                        logger.info(f"[OUTLINE] 📎 request.uploadedMedia length: {len(request.uploadedMedia) if request.uploadedMedia else 0}")
                        if request.uploadedMedia:
                            from models.requests import TaggedMediaItem
                            uploaded_media_items = []
                            for media in request.uploadedMedia:
                                try:
                                    uploaded_media_items.append(TaggedMediaItem(
                                        id=media.get('id', str(uuid.uuid4())),
                                        filename=media.get('filename') or media.get('name', 'uploaded_file'),
                                        type=media.get('type', 'image'),
                                        content=media.get('content'),
                                        previewUrl=media.get('previewUrl') or media.get('url'),
                                        interpretation=media.get('interpretation'),
                                        status=media.get('status', 'processed'),
                                        metadata=media.get('metadata', {})
                                    ))
                                except Exception as media_err:
                                    logger.warning(f"[OUTLINE] Failed to convert media item: {media_err}")
                            logger.info(f"[OUTLINE] 📎 Including {len(uploaded_media_items)} uploadedMedia items in outline")

                        outline = DeckOutline(
                            id=outline_id,
                            title=result_data.get('title', 'Untitled Presentation'),
                            slides=simple_slides,
                            uploadedMedia=uploaded_media_items,
                            stylePreferences=None,
                            notes=None
                        )
                        
                        # ========================================================================
                        # USE PARALLEL THEME AGENT RESULTS
                        # The ThemeAgent has been running in parallel - now collect its results
                        # ========================================================================

                        # DON'T store raw conversation history as vibeContext - only store actual style preferences
                        # vibeContext should be short style descriptions like "fun", "professional", not chat logs
                        raw_style_context = request.styleContext or detected_style_context
                        filtered_vibe_context = None
                        if raw_style_context:
                            # Only use as vibeContext if it's a short style description (not conversation history)
                            # Conversation history contains "Context from conversation:" or multiple "User:"/"Assistant:" lines
                            is_conversation_history = (
                                "Context from conversation:" in raw_style_context or
                                raw_style_context.count("User:") > 1 or
                                raw_style_context.count("Assistant:") > 1 or
                                len(raw_style_context) > 500  # Too long to be a simple vibe description
                            )
                            if not is_conversation_history:
                                filtered_vibe_context = raw_style_context
                            else:
                                logger.info("[PARALLEL THEME] Filtered out conversation history from vibeContext")

                        # Wait for ThemeAgent to complete (it's been running in parallel)
                        theme_result = None
                        try:
                            theme_result = await asyncio.wait_for(theme_task, timeout=10.0)
                            logger.info(f"[PARALLEL THEME] ✅ ThemeAgent completed: source={theme_result.get('source')}, colors={len(theme_result.get('colors', []))}")
                        except asyncio.TimeoutError:
                            logger.warning("[PARALLEL THEME] ⚠️ ThemeAgent timed out, using defaults")
                        except Exception as theme_err:
                            logger.warning(f"[PARALLEL THEME] ⚠️ ThemeAgent failed: {theme_err}")

                        # Build style preferences from ThemeAgent result
                        # Use the outline title as initialIdea (cleaner than the raw prompt)
                        from models.requests import ColorConfigItem
                        style_prefs = StylePreferencesItem(
                            vibeContext=filtered_vibe_context,
                            initialIdea=outline.title or request.prompt,  # Prefer clean title over raw prompt
                            font=request.fontPreference
                        )

                        # Apply theme result if available
                        if theme_result:
                            # Set fonts from theme agent
                            fonts = theme_result.get('fonts', {})
                            if fonts.get('hero') and not request.fontPreference:
                                style_prefs.font = fonts['hero']
                            if fonts.get('body'):
                                style_prefs.bodyFont = fonts['body']
                            logger.info(f"[PARALLEL THEME] 🔤 Fonts: hero={style_prefs.font}, body={style_prefs.bodyFont}")

                            # Set colors from theme agent
                            theme_colors = theme_result.get('colors', [])
                            if theme_colors and len(theme_colors) >= 2:  # Accept 2+ colors
                                color_source = theme_result.get('source', 'unknown')
                                # Use explicit accent/accent2 fields from ThemeAgent if available
                                accent1 = theme_result.get('accent', theme_colors[0] if theme_colors else None)
                                accent2 = theme_result.get('accent2', theme_colors[1] if len(theme_colors) > 1 else None)
                                accent3 = theme_colors[2] if len(theme_colors) > 2 else None
                                # Don't use white as accent3
                                if accent3 and accent3.upper() in ['#FFFFFF', '#FFF', 'WHITE']:
                                    accent3 = None
                                style_prefs.colors = ColorConfigItem(
                                    type="custom",
                                    name=f"Theme Colors ({color_source})",
                                    background=theme_result.get('background', '#FFFFFF'),
                                    text=theme_result.get('text', '#1A1A1A'),
                                    accent1=accent1,
                                    accent2=accent2,
                                    accent3=accent3,
                                )
                                logger.info(f"[PARALLEL THEME] 🎨 Colors ({color_source}): bg={theme_result.get('background')}, accent1={accent1}, accent2={accent2}")

                            # Set logo from theme agent
                            if theme_result.get('logo_url'):
                                style_prefs.logoUrl = theme_result['logo_url']
                                logger.info(f"[PARALLEL THEME] 🖼️ Logo URL set")

                            # Capture brand/domain metadata for confirmation flow
                            if theme_result.get('brand_name'):
                                style_prefs.brandName = theme_result.get('brand_name')
                            if theme_result.get('domain'):
                                style_prefs.brandDomain = theme_result.get('domain')
                            if theme_result.get('brand_domain_candidates'):
                                style_prefs.brandDomainCandidates = theme_result.get('brand_domain_candidates')
                            if theme_result.get('needs_domain_confirmation'):
                                style_prefs.needsBrandDomainConfirmation = True

                            # Add brand design screenshot as reference image for custom component generator
                            brand_design = theme_result.get('brand_design')
                            if brand_design and brand_design.get('screenshot'):
                                screenshot = brand_design['screenshot']
                                ref_img = None
                                if isinstance(screenshot, str) and screenshot.startswith('http'):
                                    ref_img = screenshot
                                elif isinstance(screenshot, str):
                                    try:
                                        from services.image_storage_service import ImageStorageService

                                        payload = screenshot
                                        if screenshot.startswith('data:'):
                                            payload = screenshot.split(',', 1)[-1]

                                        async with ImageStorageService() as storage:
                                            result = await storage.upload_image_from_base64(
                                                payload,
                                                filename=f"{outline_id}_brand_ref.png",
                                                content_type="image/png",
                                                folder="brand-screenshots"
                                            )
                                        if result and result.get('url'):
                                            ref_img = result['url'].split('?')[0]
                                    except Exception as img_err:
                                        logger.warning("[PARALLEL THEME] ⚠️ Failed to upload brand screenshot: %s", img_err)

                                # Add to reference images (create list if doesn't exist)
                                if ref_img:
                                    if not style_prefs.referenceImages:
                                        style_prefs.referenceImages = []
                                    if ref_img not in style_prefs.referenceImages:
                                        style_prefs.referenceImages.append(ref_img)
                                    logger.info("[PARALLEL THEME] 📸 Brand screenshot added as reference image (stored URL)")

                                # Also store the brand design colors in notes for the generator
                                if brand_design.get('colors'):
                                    if outline.notes is None:
                                        outline.notes = {}
                                    outline.notes['brand_design_colors'] = brand_design['colors']
                                    logger.info(f"[PARALLEL THEME] 🎨 Brand design colors stored: {list(brand_design['colors'].keys())}")

                        # User-provided colors override theme agent
                        if isinstance(request.colorPreference, dict) and request.colorPreference.get('accent1'):
                            style_prefs.colors = ColorConfigItem(
                                type=str(request.colorPreference.get('type') or 'custom'),
                                name=request.colorPreference.get('name'),
                                background=request.colorPreference.get('background'),
                                text=request.colorPreference.get('text'),
                                accent1=request.colorPreference.get('accent1'),
                                accent2=request.colorPreference.get('accent2'),
                                accent3=request.colorPreference.get('accent3'),
                            )
                            logger.info(f"[PARALLEL THEME] 📦 User colors override: {request.colorPreference.get('accent1')}")

                        outline.stylePreferences = style_prefs

                        # Log final theme result
                        final_colors = getattr(style_prefs.colors, 'accent1', None) if style_prefs.colors else None
                        logger.info(f"[PARALLEL THEME] ✅ Final: font={style_prefs.font}, accent={final_colors}, logo={bool(getattr(style_prefs, 'logoUrl', None))}")

                        # Emit theme_ready event so frontend can update theme tab
                        theme_ready_data = {
                            'type': 'theme_ready',
                            'theme': {
                                'font': style_prefs.font,
                                'bodyFont': getattr(style_prefs, 'bodyFont', None),
                                'logoUrl': getattr(style_prefs, 'logoUrl', None),
                                'colors': None,
                                'brandName': getattr(style_prefs, 'brandName', None),
                                'brandDomain': getattr(style_prefs, 'brandDomain', None),
                                'brandDomainCandidates': getattr(style_prefs, 'brandDomainCandidates', None),
                                'needsBrandDomainConfirmation': getattr(style_prefs, 'needsBrandDomainConfirmation', None)
                            }
                        }
                        if style_prefs.colors:
                            theme_ready_data['theme']['colors'] = {
                                'background': getattr(style_prefs.colors, 'background', None),
                                'text': getattr(style_prefs.colors, 'text', None),
                                'accent1': getattr(style_prefs.colors, 'accent1', None),
                                'accent2': getattr(style_prefs.colors, 'accent2', None),
                                'accent3': getattr(style_prefs.colors, 'accent3', None),
                            }
                        yield _sse(theme_ready_data)
                        await asyncio.sleep(0)

                        # Skip the old ThemeDirector logic - ThemeAgent already handled everything
                        # Only run ThemeDirector as fallback if ThemeAgent completely failed
                        if not theme_result or not theme_result.get('colors'):
                            logger.info("[PARALLEL THEME] No theme result, falling back to ThemeDirector...")
                            try:
                                from agents.generation.theme_director import ThemeDirector
                                director = ThemeDirector()
                                suggestion = await director.generate_quick_palette(
                                    title=outline.title,
                                    context=request.styleContext or request.prompt
                                )
                                colors = (suggestion or {}).get('color_palette') or {}
                                bg_color = colors.get('primary_background', '#FFFFFF')
                                text_color = colors.get('primary_text', '#1A1A1A')
                                accent_color = colors.get('accent_1', '#3B82F6')

                                style_prefs.colors = ColorConfigItem(
                                    type="custom",
                                    name="AI Theme Colors",
                                    background=bg_color,
                                    text=text_color,
                                    accent1=accent_color,
                                    accent2=colors.get('accent_2'),
                                    accent3=colors.get('accent_3'),
                                )
                                logger.info(f"[PARALLEL THEME] 🎨 ThemeDirector fallback: bg={bg_color}, accent={accent_color}")
                            except Exception as td_err:
                                logger.warning(f"[PARALLEL THEME] ThemeDirector fallback failed: {td_err}")

                        # Old theme logic removed - ThemeAgent handles everything now

                        # Additional debug to verify it was actually set
                        logger.info(f"[API OUTLINE] After setting - stylePreferences is None: {outline.stylePreferences is None}")
                        if outline.stylePreferences:
                            logger.info(f"[API OUTLINE] StylePreferences vibe after setting: {outline.stylePreferences.vibeContext}")
                            logger.info(f"[API OUTLINE] 🎨 StylePreferences FONTS after setting: hero={outline.stylePreferences.font}, body={outline.stylePreferences.bodyFont}")
                        
                        # Start narrative flow generation in parallel as soon as outline is ready
                        if not narrative_flow_started and outline:
                            narrative_flow_started = True
                            logger.info("[NARRATIVE FLOW] Starting parallel narrative flow generation")
                            
                            async def generate_narrative_flow_async():
                                try:
                                    flow_analyzer = NarrativeFlowAnalyzer()
                                    outline_dict_for_analysis = outline.dict()
                                    result = await flow_analyzer.analyze_narrative_flow(
                                        outline_dict_for_analysis,
                                        context=request.prompt
                                    )
                                    logger.info("[NARRATIVE FLOW] Parallel generation completed")
                                    return result
                                except Exception as e:
                                    logger.warning(f"[NARRATIVE FLOW] Failed in parallel generation: {e}")
                                    return None
                            
                            # Start the task but don't await it yet
                            narrative_flow_task = asyncio.create_task(generate_narrative_flow_async())
                            # Store in the holder so it persists
                            narrative_flow_task_holder["task"] = narrative_flow_task
                            narrative_flow_task_holder["outline_id"] = outline.id
                        
                        # Don't wait for narrative flow - let it complete in background
                        narrative_flow_result = None
                        if narrative_flow_task and narrative_flow_task.done():
                            logger.info("[NARRATIVE FLOW] Taking completed narrative flow result")
                            try:
                                narrative_flow_result = await narrative_flow_task
                            except Exception as e:
                                logger.warning(f"[NARRATIVE FLOW] Error getting completed result: {e}")
                                narrative_flow_result = None
                        elif narrative_flow_task and not narrative_flow_task.done():
                            logger.info("[NARRATIVE FLOW] Narrative flow still running - will complete in background")
                        
                        # Add narrative flow to outline for persistence
                        if narrative_flow_result:
                            outline.notes = narrative_flow_result.model_dump()
                            logger.info("Added narrative flow as 'notes' to outline for persistence")

                        # Add videos from ThemeAgent to notes (for brand presentations)
                        if theme_result and theme_result.get('videos'):
                            if outline.notes is None:
                                outline.notes = {}
                            outline.notes['videos'] = theme_result['videos']
                            logger.info(f"[VIDEO] Added {len(theme_result['videos'])} brand videos to outline.notes")

                        # Also add scraped videos from OutlineAgent if provided
                        if request.scraped_videos:
                            if outline.notes is None:
                                outline.notes = {}
                            # Merge with theme videos if both exist
                            existing_videos = outline.notes.get('videos', [])
                            # Add scraped videos that aren't already in the list (by URL)
                            existing_urls = {v.get('url') for v in existing_videos}
                            for video in request.scraped_videos:
                                if video.get('url') not in existing_urls:
                                    existing_videos.append(video)
                            outline.notes['videos'] = existing_videos
                            logger.info(f"[VIDEO] Added scraped videos to outline.notes, total: {len(existing_videos)}")
                        
                        # Build response data with narrative flow
                        outline_dict = outline.dict()
                        try:
                            if outline.stylePreferences:
                                outline_dict['stylePreferences'] = outline.stylePreferences.model_dump(exclude_none=True)
                        except Exception:
                            pass
                        
                        # Debug log to check if notes is in the serialized outline
                        logger.info(f"[OUTLINE RESPONSE] Outline dict keys: {list(outline_dict.keys())}")
                        if 'notes' in outline_dict:
                            logger.info(f"[OUTLINE RESPONSE] Notes field present in outline dict")
                        if 'stylePreferences' in outline_dict:
                            logger.info(f"[OUTLINE RESPONSE] StylePreferences included: {outline_dict['stylePreferences']}")
                        else:
                            logger.info(f"[OUTLINE RESPONSE] NO stylePreferences in outline dict")
                        
                        response_data = {
                            'type': 'outline_complete',
                            'success': True,
                            'hasResult': True,
                            'outline': outline_dict,  # Use the updated dict with notes
                            'outline_structure': outline_dict,  # Frontend expects this field
                            'message': f"Generated {len(outline.slides)} slides",
                            'progress': 100
                        }
                        
                        # Add narrative flow to response if generated
                        if narrative_flow_result:
                            response_data['narrative_flow'] = narrative_flow_result.model_dump()
                        
                        # IMPORTANT: actually emit the outline_complete event before narrative flow updates
                        yield _sse(response_data)
                        await asyncio.sleep(0)  # Flush

                        # Never await narrative flow inline; let it complete fully in background
                        # (No 'narrative_flow_started' or 'pending' inline events)

                        # Create deck after outline is complete
                        if outline and registry:
                            # Remove automatic deck creation - decks should only be created when user clicks generate
                            # The deck will be created when user initiates deck generation from the outline
                            logger.info(f"Outline complete, deck will be created when user initiates generation")
                            
                            # However, if this outline is being used for a deck that's already created,
                            # we should save the narrative flow to it
                            if narrative_flow_result and outline.id:
                                # Don't save to deck here - outline ID is not deck UUID!
                                # The deck creation process will handle saving the narrative flow
                                logger.info(f"[NARRATIVE FLOW] Narrative flow included in outline, will be saved when deck is created")
                            
                            # Just send the outline ready event
                            outline_ready_data = {
                                'type': 'outline_ready',
                                'success': True,
                                'outline_id': outline.id,
                                'message': f"Outline '{outline.title}' created successfully!"
                            }
                            yield _sse(outline_ready_data)
                            await asyncio.sleep(0)  # Ensure event is flushed
                            # Immediately end the outline stream to allow navigation
                            return
                    
                    elif update.stage == "slide_complete":
                        slide_data = update.metadata['slide']
                        
                        # Debug log to check taggedMedia persistence
                        tagged_media_count = len(slide_data.get('taggedMedia', []))
                        logger.info(f"[API OUTLINE] slide_complete stage - Slide {update.metadata['slide_index'] + 1} has {tagged_media_count} taggedMedia items")
                        
                        # Accumulate slides for early narrative flow generation AND final outline
                        accumulated_slides.append({
                            'id': slide_data['id'],
                            'title': slide_data['title'],
                            'content': slide_data['content'],
                            'speaker_notes': slide_data.get('speaker_notes', ''),
                            'citations': slide_data.get('citations', []),
                            'footnotes': slide_data.get('footnotes', []),
                            'extractedData': slide_data.get('extractedData'),
                            'taggedMedia': slide_data.get('taggedMedia', [])
                        })
                        
                        # Build response data separately to avoid multi-line f-string issues
                        # Prepare taggedMedia with debug logging
                        tagged_media = slide_data.get('taggedMedia', [])
                        logger.debug(f"[API] Building slide_complete for slide {update.metadata['slide_index'] + 1} with {len(tagged_media)} taggedMedia items")
                        
                        response_data = {
                            'type': 'slide_complete',
                            'slideIndex': update.metadata['slide_index'],
                            'slide': {
                                'id': slide_data['id'],
                                'title': slide_data['title'],
                                'content': slide_data['content'],
                                'extractedData': slide_data.get('extractedData'),  # Include extractedData
                                'taggedMedia': tagged_media,  # Include taggedMedia
                                'deepResearch': slide_data.get('deepResearch', False)  # Include deepResearch flag
                            },
                            'progress': update.progress,
                            'message': f"Generated slide {update.metadata['slide_index'] + 1}: {slide_data['title']}"
                        }
                        
                        # Final debug log before sending
                        logger.debug(f"[API] Sending slide_complete with taggedMedia count: {len(response_data['slide']['taggedMedia'])}")
                        
                        yield _sse(response_data)
                        # No artificial delay - we want real streaming timing
                        await asyncio.sleep(0.01)  # Minimal flush delay
                    
                    elif update.stage == "files_processed":
                        # Forward the file processing summary
                        response_data = {
                            'type': 'files_processed',
                            'message': update.message,
                            'progress': update.progress,
                            'file_summary': update.metadata.get('file_summary', ''),
                            'file_count': update.metadata.get('file_count', 0),
                            'processed_count': update.metadata.get('processed_count', 0)
                        }
                        yield _sse(response_data)
                        await asyncio.sleep(0)  # Ensure event is flushed
                    
                    elif update.stage == "error":
                        error_message = update.metadata.get('error', 'Unknown error during outline generation')
                        logger.error(f"Outline generation stream error: {error_message}")
                        yield _sse({'type': 'error', 'success': False, 'error': error_message, 'progress': update.progress})
                        await asyncio.sleep(0)  # Ensure event is flushed
                        return # Stop stream on error
                    
                    else:
                        # Build response data separately to avoid multi-line f-string issues
                        response_data = {
                            'type': 'progress',
                            'message': update.message,
                            'stage': update.stage,
                            'progress': update.progress
                        }
                        yield _sse(response_data)
                        await asyncio.sleep(0)  # Ensure event is flushed
            
            else:
                # Fallback to non-streaming
                result = await generator.generate(options)
                outline = _convert_to_api_format(result)
                
                # Add style preferences for non-streaming path
                if request.styleContext or request.fontPreference or request.colorPreference:
                    # Filter out conversation history from vibeContext
                    raw_style_context = request.styleContext
                    filtered_vibe = None
                    if raw_style_context:
                        is_conversation_history = (
                            "Context from conversation:" in raw_style_context or
                            raw_style_context.count("User:") > 1 or
                            raw_style_context.count("Assistant:") > 1 or
                            len(raw_style_context) > 500
                        )
                        if not is_conversation_history:
                            filtered_vibe = raw_style_context

                    style_prefs = StylePreferencesItem(
                        vibeContext=filtered_vibe,
                        initialIdea=outline.title if hasattr(outline, 'title') else request.prompt,
                        font=request.fontPreference
                    )
                    
                    # Handle color preferences
                    if request.colorPreference:
                        if isinstance(request.colorPreference, dict):
                            # For now, we'll skip setting colors as it expects ColorConfigItem
                            # This needs to be properly mapped to ColorConfigItem structure
                            pass
                        else:
                            # String color preference - also skip for now
                            pass
                    
                    outline.stylePreferences = style_prefs
                    logger.info(f"[NON-STREAMING] Added stylePreferences to outline")
                
                # Try to create deck even in fallback mode
                if outline and registry:
                    # Remove automatic deck creation in fallback mode too
                    logger.info(f"Fallback outline complete, deck will be created when user initiates generation")
                    
                    # Just send the outline ready event
                    outline_ready_data = {
                        'type': 'outline_ready',
                        'success': True,
                        'outline_id': outline.id,
                        'message': f"Outline '{outline.title}' created successfully!"
                    }
                    yield _sse(outline_ready_data)
                else:
                    # Build response data separately to avoid multi-line f-string issues
                    response_data = {
                        'type': 'outline_only',
                        'success': True,
                        'outline': outline.dict(),
                        'message': f"Generated {len(outline.slides)} slides"
                    }
                    yield _sse(response_data)
            
        except asyncio.CancelledError:
            logger.info("Client disconnected during outline stream; cancelling gracefully")
            return
        except Exception as e:
            logger.error(f"Error in outline stream: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            yield _sse({'type': 'error', 'error': str(e)})
        finally:
            # Ensure explicit end marker so ASGI considers the response complete
            try:
                yield _sse({'type': 'end', 'message': 'Stream complete'})
            except Exception:
                pass
    
    # Start the stream
    response = StreamingResponse(
        event_stream(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff"
        }
    )
    
    # Schedule the narrative flow completion to run after response is sent
    asyncio.create_task(complete_narrative_flow_if_needed())

    # Optionally close the outline stream early to unblock UI immediately
    try:
        from agents.config import OUTLINE_STREAM_EARLY_CLOSE
        if OUTLINE_STREAM_EARLY_CLOSE:
            # Fast path: rely on the 'end' event inside event_stream to close promptly.
            # Nothing extra needed here, just return the response.
            pass
    except Exception:
        pass
    
    return response
