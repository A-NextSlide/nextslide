import json
import asyncio
from typing import Dict, Any, List, Optional, AsyncGenerator
from datetime import datetime

from agents.ai.clients import get_client
from setup_logging_optimized import get_logger
from services.outline.chart_normalization import normalize_slide_chart_fields

from .models import OutlineAgentRequest
from .media import scrape_media_from_url, assign_videos_to_slides
from .tool_loop import call_model_with_tools
from .research import research_with_perplexity
from .streaming_helpers import (
    analyze_request_files,
    build_messages,
    build_prefetch_research_query,
    collect_urls_to_scrape,
    extract_json_blocks,
    normalize_action_payload,
    scrape_reference_content,
    select_action_block,
    sse_event,
)

logger = get_logger(__name__)

OUTLINE_AGENT_SYSTEM_PROMPT = (
    "You are a presentation outline agent. If the request is clear, return JSON actions "
    "generate_outline/update_theme/update_slides. If unclear, ask concise questions. "
    "Prefer uploaded content and provided context; avoid inventing facts."
)

async def stream_agent_response(request: OutlineAgentRequest) -> AsyncGenerator[str, None]:
    """
    Stream the agent's response - agent outputs JSON directly in its response.
    Enhanced with Perplexity web search for researching URLs, companies, and topics.
    Also scrapes reference links provided by user for content extraction.
    Now also analyzes uploaded files (images, PDFs, Excel, PPTX, etc.)
    """
    try:
        # Send immediate thinking status to confirm streaming works
        yield sse_event({'type': 'status', 'status': 'thinking', 'message': 'Processing your request...'})
        logger.info("[OutlineAgent] Sent initial thinking status")

        # Get the outline agent client from config
        from agents.config import OUTLINE_AGENT_MODEL
        client, model = get_client(OUTLINE_AGENT_MODEL, wrap_with_instructor=False)

        scraped_context = ""
        scrape_result = None
        scrape_task = None
        research_task = None
        file_context = ""

        file_payload = await analyze_request_files(request)
        for event in file_payload.events:
            yield sse_event(event)

        file_context = file_payload.file_context
        detected_intent = file_payload.detected_intent
        detected_slide_style = file_payload.detected_slide_style
        extracted_design_context = file_payload.extracted_design_context
        extracted_file_images = file_payload.extracted_file_images
        extracted_slide_screenshots = file_payload.extracted_slide_screenshots

        if file_context and not request.files:
            logger.info("[OutlineAgent] Using previous file analysis context: %s chars", len(file_context))
        # Detect URLs in the CURRENT message only and auto-scrape them
        # NOTE: We intentionally do NOT check chat history for URLs to scrape.
        # If a URL was mentioned in a previous turn and an outline was generated,
        # the content was already scraped and included in that response.
        # Re-scraping on follow-up messages wastes time and API calls.
        urls_to_scrape = collect_urls_to_scrape(request.message, request.context or {})

        prefetch_query = build_prefetch_research_query(request.message, urls_to_scrape)
        if prefetch_query:
            logger.info("[OutlineAgent] Prefetch research: %s", prefetch_query)
            yield sse_event({
                'type': 'research_started',
                'message': f"Researching: {prefetch_query}",
                'query': prefetch_query,
                'progress': 1,
            })
            research_task = asyncio.create_task(research_with_perplexity(prefetch_query))

        if urls_to_scrape:
            logger.info(f"[OutlineAgent] Auto-detected URLs to scrape: {urls_to_scrape}")
            yield sse_event({
                'type': 'status',
                'status': 'scraping',
                'message': f'Reading content from {urls_to_scrape[0]}...'
            })
            scrape_task = asyncio.create_task(scrape_reference_content(urls_to_scrape))

        messages = build_messages(request, scraped_context, file_context)

        logger.info(f"[OutlineAgent] Processing message with {len(messages)} messages in history")

        # Call Anthropic API with tool support - model decides when to search
        # Run the model and collect response
        full_response = ""
        in_json_block = False

        def contains_json_start(text: str) -> bool:
            """Check if text contains the start of JSON (fenced or raw)."""
            # Check for fenced code block
            if '```json' in text or '```' in text:
                return True
            # Check for JSON object with action key (handles whitespace/newlines)
            if '"action"' in text and '{' in text:
                return True
            return False

        async for result in call_model_with_tools(
            client,
            model,
            messages,
            OUTLINE_AGENT_SYSTEM_PROMPT,
            extra_context_tasks=[t for t in (scrape_task, research_task) if t is not None],
        ):
            if isinstance(result, str) and result.startswith("data:"):
                # This is a status event, yield it directly
                logger.info(f"[OutlineAgent] Yielding status event: {result[:100]}...")
                yield result
            elif isinstance(result, tuple) and result[0] == "text":
                text = result[1]
                full_response += text
                logger.info(f"[OutlineAgent] 📝 Received text chunk: {len(text)} chars (total: {len(full_response)} chars)")

                # Detect JSON blocks (fenced or raw)
                if contains_json_start(full_response) and not in_json_block:
                    in_json_block = True
                    # Don't stream text before JSON - it's usually "thinking" text
                    logger.info(f"[OutlineAgent] Detected JSON block, suppressing pre-JSON text")
                elif not in_json_block and text and not contains_json_start(text):
                    yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"

        logger.info(f"[OutlineAgent] 🏁 Model loop complete. Total response: {len(full_response)} chars")

        if research_task and research_task.done():
            try:
                research_result = research_task.result()
                if research_result.get("success") and research_result.get("content"):
                    yield sse_event({
                        'type': 'research_results',
                        'content': research_result.get("content", ""),
                        'citations': research_result.get("citations", [])[:5],
                        'query': research_result.get("query") or prefetch_query,
                    })
                elif research_result.get("error"):
                    yield sse_event({
                        'type': 'research_error',
                        'message': research_result.get("error"),
                        'query': research_result.get("query") or prefetch_query,
                    })
            except Exception as exc:
                logger.warning("[OutlineAgent] Prefetch research failed: %s", exc)

        if scrape_task and scrape_task.done():
            try:
                scrape_payload = scrape_task.result()
                for event in scrape_payload.events:
                    if event.get('status') == 'scraping':
                        continue
                    yield sse_event(event)
                scraped_context = scrape_payload.scraped_context
                scrape_result = scrape_payload.scrape_result
            except Exception as exc:
                logger.warning("[OutlineAgent] Reference scraping failed in background: %s", exc)

        # After streaming, extract JSON and any text after it
        found_json_blocks = extract_json_blocks(full_response)
        has_existing_outline = request.context and "current_outline" in request.context
        chosen_block = select_action_block(found_json_blocks, bool(has_existing_outline))

        if chosen_block and has_existing_outline:
            action = chosen_block['data'].get('action')
            if action in ('update_theme', 'update_slides', 'update_outline', 'scrape_media'):
                logger.info("[OutlineAgent] Existing outline present - chose update action: %s", action)
            elif action == 'generate_outline':
                logger.warning("[OutlineAgent] Existing outline present but generate_outline chosen - may cause regeneration")

        outline_data = None
        text_after_json = ""
        videos_applied = False

        if chosen_block:
            outline_data = normalize_action_payload(chosen_block['data'])
            text_after_json = full_response[chosen_block['end_index']:].strip()

            logger.info(f"[OutlineAgent] Extracted outline data: {outline_data.get('action')}")

            # Handle scrape_media action - scrape media from URL before sending response
            if outline_data.get('action') == 'scrape_media':
                url = outline_data.get('url')
                media_filter = outline_data.get('media_filter', 'all')
                slide_index = outline_data.get('slide_index')
                content_context = outline_data.get('content_context', '')

                if url:
                    # Send status event
                    yield f"data: {json.dumps({'type': 'status', 'status': 'scraping_media', 'message': f'Pulling media from {url}...'})}\n\n"

                    # Scrape the media
                    media_result = await scrape_media_from_url(url, media_filter)

                    if media_result.get('success'):
                        # Include scraped media in the action data
                        outline_data['scraped_media'] = {
                            'gifs': media_result.get('gifs', []),
                            'images': media_result.get('images', []),
                            'videos': media_result.get('videos', []),
                            'all_media': media_result.get('all_media', []),
                            'filtered_media': media_result.get('filtered_media', []),
                            'source_url': url,
                            'markdown': media_result.get('markdown', ''),
                            'content_context': content_context,
                        }
                        gif_count = len(media_result.get('gifs', []))
                        img_count = len(media_result.get('images', []))
                        video_count = len(media_result.get('videos', []))
                        status_msg = f'Found {video_count} videos, {gif_count} GIFs, {img_count} images'
                        yield f"data: {json.dumps({'type': 'status', 'status': 'media_scraped', 'message': status_msg})}\n\n"
                        logger.info(f"[OutlineAgent] Scraped media attached: {video_count} videos, {gif_count} GIFs, {img_count} images")
                    else:
                        error_msg = media_result.get('error', 'Unknown error')
                        yield f"data: {json.dumps({'type': 'status', 'status': 'media_scrape_failed', 'message': f'Could not fetch media: {error_msg}'})}\n\n"
                        logger.warning(f"[OutlineAgent] Media scrape failed: {error_msg}")

                # For scrape_media, provide a clean response message instead of raw JSON
                # Clear text_after_json if it contains raw JSON artifacts
                if text_after_json and ('"action"' in text_after_json or '```' in text_after_json):
                    text_after_json = ""

            # Attach scraped videos to generate_outline action
            if outline_data.get('action') == 'generate_outline' and scrape_result and scrape_result.get('videos'):
                outline_data['scraped_videos'] = scrape_result['videos']
                logger.info(f"[OutlineAgent] 🎬 Attached {len(scrape_result['videos'])} scraped videos to outline")

                # Assign videos to specific slides using AI
                slides = outline_data.get('slides', [])
                if slides:
                    yield f"data: {json.dumps({'type': 'status', 'status': 'assigning_media', 'message': 'Evaluating videos...'})}\n\n"
                    presentation_topic = outline_data.get('topic', outline_data.get('title', ''))
                    slides = await assign_videos_to_slides(slides, scrape_result['videos'], presentation_topic)
                    outline_data['slides'] = slides
                    assigned_count = sum(1 for s in slides if s.get('assignedVideo'))
                    if assigned_count > 0:
                        logger.info(f"[OutlineAgent] 🎬 Video assignment complete: {assigned_count} slides have assigned videos")
                    else:
                        logger.info(f"[OutlineAgent] 🎬 No videos assigned (not relevant or low quality)")
                videos_applied = True

            # Attach extracted design and slide style to generate_outline action
            if outline_data.get('action') == 'generate_outline':
                if extracted_design_context:
                    outline_data['extracted_design'] = extracted_design_context
                    logger.info(f"[OutlineAgent] 🎨 Attached extracted design context to outline")

                    # CRITICAL: Convert extracted_design to stylePreferences.colors for frontend theme tab
                    # Frontend expects stylePreferences.colors with background, text, accent1, accent2
                    color_palette = extracted_design_context.get('color_palette', {})
                    if color_palette:
                        style_colors = {
                            'type': 'custom',
                            'background': color_palette.get('background') or color_palette.get('primary_background') or '#ffffff',
                            'text': color_palette.get('text') or color_palette.get('primary_text') or '#000000',
                            'accent1': color_palette.get('primary') or color_palette.get('accent') or color_palette.get('accent_1') or '#007bff',
                            'accent2': color_palette.get('secondary') or color_palette.get('accent_2') or None,
                            'accent3': color_palette.get('accent_3') or None
                        }
                        # Remove None values
                        style_colors = {k: v for k, v in style_colors.items() if v is not None}

                        # Set stylePreferences with colors so frontend theme tab works
                        if 'stylePreferences' not in outline_data:
                            outline_data['stylePreferences'] = {}
                        outline_data['stylePreferences']['colors'] = style_colors

                        # Also add font if available from typography
                        typography = extracted_design_context.get('typography', {})
                        if typography.get('hero_font'):
                            outline_data['stylePreferences']['font'] = typography['hero_font']
                        if typography.get('body_font'):
                            outline_data['stylePreferences']['bodyFont'] = typography['body_font']

                        logger.info(f"[OutlineAgent] 🎨 Set stylePreferences.colors from extracted design: {style_colors}")
                if extracted_file_images:
                    outline_data['extracted_images'] = extracted_file_images
                    logger.info(f"[OutlineAgent] 🖼️ Attached {len(extracted_file_images)} extracted images from uploaded files")
                # Attach slide screenshots for visual design replication
                # These are base64 PNGs that the CustomComponentGenerator will use to SEE and replicate the design
                if extracted_slide_screenshots:
                    outline_data['slide_screenshots'] = extracted_slide_screenshots
                    logger.info(f"[OutlineAgent] 📸 Attached {len(extracted_slide_screenshots)} slide screenshots for visual design reference")

                    # CRITICAL: Also set stylePreferences.referenceImages so slide generator can use them!
                    # The CustomComponent generator expects reference images in stylePreferences.referenceImages
                    if 'stylePreferences' not in outline_data:
                        outline_data['stylePreferences'] = {}
                    # Convert base64 screenshots to data URLs for the vision model
                    reference_data_urls = []
                    for screenshot in extracted_slide_screenshots[:3]:  # Limit to 3 for performance
                        if screenshot.startswith('data:'):
                            reference_data_urls.append(screenshot)
                        else:
                            # Assume PNG if no prefix
                            reference_data_urls.append(f"data:image/png;base64,{screenshot}")
                    outline_data['stylePreferences']['referenceImages'] = reference_data_urls
                    logger.info(f"[OutlineAgent] 📸 Set stylePreferences.referenceImages with {len(reference_data_urls)} screenshots for CustomComponent")
                if detected_slide_style and detected_slide_style != 'auto':
                    # Only override if AI didn't already set it
                    if not outline_data.get('slide_style'):
                        outline_data['slide_style'] = detected_slide_style
                        logger.info(f"[OutlineAgent] 🎨 Set slide_style to: {detected_slide_style}")
                if detected_intent:
                    outline_data['file_intent'] = detected_intent
                    logger.info(f"[OutlineAgent] 📋 Set file_intent to: {detected_intent}")

                # Pass brandContext and/or style to theme generator via stylePreferences.vibeContext
                # Priority: brandContext (specific brand) > style (general vibe)
                brand_context = outline_data.get('brandContext')
                style_context = outline_data.get('style')

                if brand_context or style_context:
                    if 'stylePreferences' not in outline_data:
                        outline_data['stylePreferences'] = {}
                    # Combine brand and style if both present, otherwise use whichever exists
                    if brand_context and style_context:
                        outline_data['stylePreferences']['vibeContext'] = brand_context
                        outline_data['stylePreferences']['style'] = style_context
                        logger.info(f"[OutlineAgent] 🏷️ Set vibeContext={brand_context}, style={style_context}")
                    elif brand_context:
                        outline_data['stylePreferences']['vibeContext'] = brand_context
                        logger.info(f"[OutlineAgent] 🏷️ Set vibeContext for theme generator: {brand_context}")
                    else:
                        outline_data['stylePreferences']['vibeContext'] = style_context
                        outline_data['stylePreferences']['style'] = style_context
                        logger.info(f"[OutlineAgent] 🎨 Set style for theme generator: {style_context}")

            # Attach uploaded files to generate_outline action so they're used in slide generation
            logger.info(f"[OutlineAgent] 📎 Checking file attachment: action={outline_data.get('action')}, has_files={bool(request.files)}, file_count={len(request.files) if request.files else 0}")
            if outline_data.get('action') == 'generate_outline' and request.files:
                uploaded_media = []
                for f in request.files:
                    logger.info(f"[OutlineAgent] 📄 Processing file: {f.name}, type={f.type}, is_image={f.type and f.type.startswith('image/')}")
                    # Only include images for now (they're the ones that should appear on slides)
                    if f.type and f.type.startswith('image/'):
                        uploaded_media.append({
                            'id': f.id,
                            'name': f.name,
                            'type': f.type,
                            'content': f.content,  # Base64 content for rendering
                            'size': f.size
                        })

                if uploaded_media:
                    outline_data['uploadedMedia'] = uploaded_media
                    logger.info(f"[OutlineAgent] 📎 Attached {len(uploaded_media)} uploaded images to outline")
                else:
                    logger.warning(f"[OutlineAgent] ⚠️ No image files to attach (files had non-image types)")

            # Normalize any chart payloads to extractedData for downstream consumers
            try:
                slides = outline_data.get('slides')
                if isinstance(slides, list):
                    for slide in slides:
                        if isinstance(slide, dict):
                            normalize_slide_chart_fields(slide)
            except Exception as norm_err:
                logger.warning(f"[OutlineAgent] Chart normalization skipped: {norm_err}")

            yield f"data: {json.dumps({'type': 'outline', 'data': outline_data})}\n\n"

            if text_after_json:
                 yield f"data: {json.dumps({'type': 'text', 'content': text_after_json})}\n\n"

        if outline_data and scrape_task and not scrape_task.done():
            try:
                scrape_payload = await scrape_task
                for event in scrape_payload.events:
                    if event.get('status') == 'scraping':
                        continue
                    yield sse_event(event)
                scraped_context = scrape_payload.scraped_context
                scrape_result = scrape_payload.scrape_result
            except Exception as exc:
                logger.warning("[OutlineAgent] Reference scraping failed in background: %s", exc)

            if (not videos_applied
                and outline_data.get('action') == 'generate_outline'
                and scrape_result
                and scrape_result.get('videos')):
                outline_data['scraped_videos'] = scrape_result['videos']
                logger.info(f"[OutlineAgent] 🎬 Attached {len(scrape_result['videos'])} scraped videos to outline (post)")

                slides = outline_data.get('slides', [])
                if slides:
                    yield f"data: {json.dumps({'type': 'status', 'status': 'assigning_media', 'message': 'Evaluating videos...'})}\n\n"
                    presentation_topic = outline_data.get('topic', outline_data.get('title', ''))
                    slides = await assign_videos_to_slides(slides, scrape_result['videos'], presentation_topic)
                    outline_data['slides'] = slides
                    assigned_count = sum(1 for s in slides if s.get('assignedVideo'))
                    if assigned_count > 0:
                        logger.info(f"[OutlineAgent] 🎬 Video assignment complete: {assigned_count} slides have assigned videos (post)")
                    else:
                        logger.info(f"[OutlineAgent] 🎬 No videos assigned (not relevant or low quality)")
                yield f"data: {json.dumps({'type': 'outline', 'data': outline_data})}\n\n"

        if not outline_data:
            logger.warning("[OutlineAgent] No structured JSON block found in response")
            yield sse_event({
                'type': 'error',
                'message': 'No structured outline was returned. Please try again or simplify the request.'
            })

        # Send done event
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.error(f"[OutlineAgent] Error in stream: {str(e)}", exc_info=True)
        error_msg = f"I encountered an error: {str(e)}. Could you try rephrasing your request?"
        yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
