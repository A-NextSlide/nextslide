import json
import asyncio
import os
from typing import Dict, Any, List, Optional, AsyncGenerator
from datetime import datetime

from agents.ai.clients import get_client, invoke
from setup_logging_optimized import get_logger
from services.outline.chart_normalization import normalize_slide_chart_fields

from .models import OutlineAgentRequest
from .media import scrape_media_from_url, assign_videos_to_slides, scrape_reference_videos
from .tool_loop import call_model_with_tools
from .research import research_with_perplexity
from .streaming_helpers import (
    analyze_request_files,
    build_messages,
    build_prefetch_research_query,
    collect_urls_to_scrape,
    extract_domains_from_message,
    extract_json_blocks,
    is_explicit_research_request,
    normalize_action_payload,
    scrape_reference_content,
    select_action_block,
    sse_event,
)

logger = get_logger(__name__)

OUTLINE_AGENT_SYSTEM_PROMPT = (
    "You are a presentation outline agent. Return a single JSON object only. "
    "Always include a top-level action: generate_outline, update_outline, update_theme, update_slides, scrape_media, clarify. "
    "If key details are missing (topic, audience, slide_count, tone/style, slideMode) or the request is high-stakes/educational, "
    "respond with action=clarify and include message plus draft_response with editable fields wrapped in [[double brackets]]. "
    "Ask for all missing essentials in a single clarify response (avoid multi-step questioning). "
    "When a CURRENT OUTLINE is provided, do not use generate_outline unless the user explicitly asks to regenerate or start over. "
    "Use update_outline for structure/content changes, update_slides for specific slide tweaks, and update_theme for style/brand changes. "
    "When a CLARIFICATION_ANSWERED hint is provided, proceed to generate/update the outline unless a critical detail is still missing. "
    "If a brand or company is mentioned and no domain is confirmed, ask to confirm the brand domain. "
    "For generate_outline include title, topic, slide_count, detail_level, tone, slides[{title, content, key_points}], "
    "and stylePreferences.slideMode when known. "
    "If files are uploaded, decide if their images should be used in slides. "
    "Set use_uploaded_images to true only when the user explicitly wants the uploads applied; "
    "set it false when uploads are for reference or analysis only. "
    "Prefer user-provided facts; avoid inventing."
)

def _merge_videos(existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    seen = set()
    for video in (existing or []) + (incoming or []):
        if not isinstance(video, dict):
            continue
        key = (video.get("embed_url") or video.get("url") or video.get("video_id") or "").strip()
        if not key:
            key = f"video:{len(seen)}"
        if key in seen:
            continue
        seen.add(key)
        merged.append(video)
    return merged


async def _repair_outline_response(
    client: Any,
    model: str,
    user_message: str,
    assistant_response: str,
) -> Optional[Dict[str, Any]]:
    """Attempt to coerce a text-only response into a structured action JSON."""
    repair_system = (
        "Return a single JSON object only. "
        "If details are missing or the response is a question, use action=clarify "
        "with message and draft_response (use [[...]] for editable fields). "
        "Otherwise use action=generate_outline with title, topic, slide_count, detail_level, tone, slides."
    )
    repair_user = (
        "Convert this into a valid outline action JSON.\n\n"
        f"User request:\n{user_message}\n\n"
        f"Assistant response:\n{assistant_response}\n\n"
        "JSON:"
    )
    messages = [
        {"role": "system", "content": repair_system},
        {"role": "user", "content": repair_user},
    ]
    try:
        repair_text = await asyncio.to_thread(
            invoke,
            client,
            model,
            messages,
            None,
            1200,
            0.2,
        )
    except Exception as exc:
        logger.warning("[OutlineAgent] JSON repair failed: %s", exc)
        return None

    if not isinstance(repair_text, str) or not repair_text.strip():
        return None

    repair_blocks = extract_json_blocks(repair_text)
    if not repair_blocks:
        return None
    return repair_blocks[0].get("data")


async def _enrich_outline_data(
    outline_data: Dict[str, Any],
    *,
    request: OutlineAgentRequest,
    scrape_result: Optional[Dict[str, Any]],
    scraped_context: str,
    research_context: str,
    research_citations: List[str],
    reference_sources: List[Dict[str, Any]],
    explicit_brand_domain: Optional[str],
    extracted_design_context: Optional[Dict[str, Any]],
    extracted_file_images: List[Any],
    extracted_slide_screenshots: List[Any],
    detected_slide_style: Optional[str],
    detected_intent: Optional[str],
    analysis_by_id: Dict[str, Dict[str, Any]],
    analysis_by_name: Dict[str, Dict[str, Any]],
    text_after_json: str,
) -> tuple[Dict[str, Any], List[Dict[str, Any]], str, bool]:
    """Attach context, media, and chart normalization to outline payload."""
    events: List[Dict[str, Any]] = []
    videos_applied = False

    action = outline_data.get("action")

    if action == "scrape_media":
        url = outline_data.get("url")
        media_filter = outline_data.get("media_filter", "all")
        content_context = outline_data.get("content_context", "")
        if url:
            events.append({
                "type": "status",
                "status": "scraping_media",
                "message": f"Pulling media from {url}...",
            })
            media_result = await scrape_media_from_url(url, media_filter)
            if media_result.get("success"):
                outline_data["scraped_media"] = {
                    "gifs": media_result.get("gifs", []),
                    "images": media_result.get("images", []),
                    "videos": media_result.get("videos", []),
                    "all_media": media_result.get("all_media", []),
                    "filtered_media": media_result.get("filtered_media", []),
                    "source_url": url,
                    "markdown": media_result.get("markdown", ""),
                    "content_context": content_context,
                }
                gif_count = len(media_result.get("gifs", []))
                img_count = len(media_result.get("images", []))
                video_count = len(media_result.get("videos", []))
                events.append({
                    "type": "status",
                    "status": "media_scraped",
                    "message": f"Found {video_count} videos, {gif_count} GIFs, {img_count} images",
                })
            else:
                error_msg = media_result.get("error", "Unknown error")
                events.append({
                    "type": "status",
                    "status": "media_scrape_failed",
                    "message": f"Could not fetch media: {error_msg}",
                })
        if text_after_json and ('"action"' in text_after_json or "```" in text_after_json):
            text_after_json = ""

    if action == "generate_outline" and scrape_result and scrape_result.get("videos"):
        outline_data["scraped_videos"] = scrape_result["videos"]
        slides = outline_data.get("slides", [])
        if slides:
            events.append({
                "type": "status",
                "status": "assigning_media",
                "message": "Evaluating videos...",
            })
            presentation_topic = outline_data.get("topic", outline_data.get("title", ""))
            slides = await assign_videos_to_slides(slides, scrape_result["videos"], presentation_topic)
            outline_data["slides"] = slides
        videos_applied = True

    if action == "generate_outline":
        if scraped_context:
            outline_data["scraped_context"] = scraped_context
        if reference_sources:
            outline_data["reference_sources"] = reference_sources
        if research_context:
            outline_data["research_context"] = research_context
        if research_citations:
            outline_data["research_citations"] = research_citations

        if explicit_brand_domain:
            outline_data.setdefault("stylePreferences", {})
            outline_data["stylePreferences"]["brandDomain"] = explicit_brand_domain
            outline_data["stylePreferences"]["needsBrandDomainConfirmation"] = False

        if extracted_design_context:
            outline_data["extracted_design"] = extracted_design_context

            color_palette = extracted_design_context.get("color_palette", {})
            if color_palette:
                style_colors = {
                    "type": "custom",
                    "background": color_palette.get("background") or color_palette.get("primary_background") or "#ffffff",
                    "text": color_palette.get("text") or color_palette.get("primary_text") or "#000000",
                    "accent1": color_palette.get("primary") or color_palette.get("accent") or color_palette.get("accent_1") or "#007bff",
                    "accent2": color_palette.get("secondary") or color_palette.get("accent_2"),
                    "accent3": color_palette.get("accent_3"),
                }
                style_colors = {k: v for k, v in style_colors.items() if v is not None}

                outline_data.setdefault("stylePreferences", {})
                outline_data["stylePreferences"]["colors"] = style_colors

                typography = extracted_design_context.get("typography", {})
                if typography.get("hero_font"):
                    outline_data["stylePreferences"]["font"] = typography["hero_font"]
                if typography.get("body_font"):
                    outline_data["stylePreferences"]["bodyFont"] = typography["body_font"]

        if extracted_file_images:
            outline_data["extracted_images"] = extracted_file_images

        if extracted_slide_screenshots:
            outline_data["slide_screenshots"] = extracted_slide_screenshots

            outline_data.setdefault("stylePreferences", {})
            reference_data_urls = []
            for screenshot in extracted_slide_screenshots[:3]:
                if not isinstance(screenshot, str):
                    continue
                candidate = screenshot.strip()
                if not candidate:
                    continue
                # Only keep URL references; skip base64/data URLs to avoid prompt bloat
                if candidate.startswith("http://") or candidate.startswith("https://"):
                    reference_data_urls.append(candidate)
            if reference_data_urls:
                outline_data["stylePreferences"]["referenceImages"] = reference_data_urls

        if detected_slide_style and detected_slide_style != "auto":
            if not outline_data.get("slide_style"):
                outline_data["slide_style"] = detected_slide_style
        if detected_intent:
            outline_data["file_intent"] = detected_intent

        brand_context = outline_data.get("brandContext")
        style_context = outline_data.get("style")
        if brand_context or style_context:
            outline_data.setdefault("stylePreferences", {})
            if brand_context and style_context:
                outline_data["stylePreferences"]["vibeContext"] = brand_context
                outline_data["stylePreferences"]["style"] = style_context
            elif brand_context:
                outline_data["stylePreferences"]["vibeContext"] = brand_context
            else:
                outline_data["stylePreferences"]["vibeContext"] = style_context
                outline_data["stylePreferences"]["style"] = style_context

    if action == "generate_outline" and request.files:
        use_uploaded_images = bool(outline_data.get("use_uploaded_images"))
        uploaded_media = []
        for f in request.files:
            if f.type and f.type.startswith("image/"):
                analysis = analysis_by_id.get(f.id) or analysis_by_name.get(f.name) or {}
                interpretation = analysis.get("summary")
                if not interpretation:
                    key_insights = analysis.get("key_insights") or []
                    if isinstance(key_insights, list) and key_insights:
                        interpretation = "; ".join(str(item) for item in key_insights[:3])
                metadata = {
                    "source": "user_upload",
                    "originalType": f.type,
                    "usePolicy": "explicit" if use_uploaded_images else "reference",
                }
                uploaded_media.append({
                    "id": f.id,
                    "name": f.name,
                    "filename": f.name,
                    "type": f.type,
                    "content": f.content,
                    "url": f.url,
                    "size": f.size,
                    "interpretation": interpretation,
                    "status": "processed",
                    "metadata": metadata,
                })
        if uploaded_media:
            outline_data["uploadedMedia"] = uploaded_media

    try:
        slides = outline_data.get("slides")
        if isinstance(slides, list):
            for slide in slides:
                if isinstance(slide, dict):
                    normalize_slide_chart_fields(slide)
    except Exception as norm_err:
        logger.warning(f"[OutlineAgent] Chart normalization skipped: {norm_err}")

    return outline_data, events, text_after_json, videos_applied

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
        video_task = None
        scraped_videos: List[Dict[str, Any]] = []
        videos_collected = False
        research_task = None
        file_context = ""
        research_context = ""
        research_citations: List[str] = []
        reference_sources: List[Dict[str, Any]] = []
        reference_context_emitted = False
        research_results_emitted = False

        def _merge_scraped_videos() -> None:
            nonlocal scrape_result, scraped_videos
            if not scraped_videos:
                return
            scrape_result = scrape_result or {}
            scrape_result["videos"] = _merge_videos(scrape_result.get("videos", []), scraped_videos)

        def _merge_video_payload(video_payload: Dict[str, Any]) -> bool:
            nonlocal scrape_result, scraped_videos
            if not video_payload.get("success") or not video_payload.get("videos"):
                return False
            scraped_videos = _merge_videos(scraped_videos, video_payload["videos"])
            scrape_result = scrape_result or {}
            scrape_result["videos"] = _merge_videos(scrape_result.get("videos", []), scraped_videos)
            return True

        file_payload = await analyze_request_files(request)
        for event in file_payload.events:
            yield sse_event(event)

        file_context = file_payload.file_context
        detected_intent = file_payload.detected_intent
        detected_slide_style = file_payload.detected_slide_style
        extracted_design_context = file_payload.extracted_design_context
        extracted_file_images = file_payload.extracted_file_images
        extracted_slide_screenshots = file_payload.extracted_slide_screenshots
        analysis_by_id = file_payload.analysis_by_id
        analysis_by_name = file_payload.analysis_by_name

        if file_context and not request.files:
            logger.info("[OutlineAgent] Using previous file analysis context: %s chars", len(file_context))
        # Detect URLs in the CURRENT message only and auto-scrape them.
        # Exception: if the user explicitly asks to search, fall back to recent history.
        urls_to_scrape = collect_urls_to_scrape(request.message, request.context or {})
        explicit_domains = extract_domains_from_message(request.message)
        if not urls_to_scrape and not explicit_domains and is_explicit_research_request(request.message):
            recent_user_messages: List[str] = []
            for msg in reversed(request.chat_history or []):
                if msg.role != "user":
                    continue
                content = (msg.content or "").strip()
                if not content:
                    continue
                recent_user_messages.append(content)
                if len(recent_user_messages) >= 4:
                    break
            history_text = "\n".join(reversed(recent_user_messages))
            if history_text:
                urls_to_scrape = collect_urls_to_scrape(history_text, request.context or {})
                explicit_domains = extract_domains_from_message(history_text)
        explicit_brand_domain = None
        if request.context:
            explicit_brand_domain = (
                request.context.get("brandDomain")
                or request.context.get("brand_domain")
            )
        if not explicit_brand_domain and explicit_domains:
            explicit_brand_domain = explicit_domains[0]

        prefetch_query = build_prefetch_research_query(request.message, urls_to_scrape, request.context)
        if prefetch_query:
            has_perplexity = bool(os.getenv("PPLX_API_KEY") or os.getenv("PERPLEXITY_API_KEY"))
            if has_perplexity:
                logger.info("[OutlineAgent] Prefetch research: %s", prefetch_query)
                yield sse_event({
                    'type': 'research_plan',
                    'queries': [prefetch_query],
                })
                yield sse_event({
                    'type': 'research_started',
                    'message': f"Researching: {prefetch_query}",
                    'query': prefetch_query,
                    'progress': 1,
                })
                research_task = asyncio.create_task(research_with_perplexity(prefetch_query))
            else:
                logger.info("[OutlineAgent] Prefetch research skipped (Perplexity not configured)")

        if urls_to_scrape:
            logger.info(f"[OutlineAgent] Auto-detected URLs to scrape: {urls_to_scrape}")
            yield sse_event({
                'type': 'status',
                'status': 'scraping',
                'message': f'Reading content from {urls_to_scrape[0]}...'
            })
            scrape_task = asyncio.create_task(scrape_reference_content(urls_to_scrape, include_videos=False))
            video_task = asyncio.create_task(scrape_reference_videos(urls_to_scrape))

            try:
                scrape_payload = await asyncio.wait_for(asyncio.shield(scrape_task), timeout=1.5)
                for event in scrape_payload.events:
                    if event.get('status') == 'scraping':
                        continue
                    yield sse_event(event)
                scraped_context = scrape_payload.scraped_context
                scrape_result = scrape_payload.scrape_result
                _merge_scraped_videos()
                if scrape_result and scrape_result.get("scraped_content"):
                    reference_sources = [
                        {"url": item.get("url"), "title": item.get("title")}
                        for item in scrape_result.get("scraped_content", [])
                        if isinstance(item, dict)
                    ]
                if scraped_context and not reference_context_emitted:
                    yield sse_event({
                        "type": "reference_content",
                        "content": scraped_context,
                        "sources": reference_sources,
                    })
                    reference_context_emitted = True
                scrape_task = None
            except asyncio.TimeoutError:
                logger.warning("[OutlineAgent] Reference scraping not ready yet; continuing without URL context")
            except Exception as exc:
                logger.warning("[OutlineAgent] Reference scraping failed before model call: %s", exc)

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

        extra_tasks = [t for t in (research_task,) if t is not None]
        if scrape_task and not scrape_task.done():
            extra_tasks.append(scrape_task)

        async for result in call_model_with_tools(
            client,
            model,
            messages,
            OUTLINE_AGENT_SYSTEM_PROMPT,
            extra_context_tasks=extra_tasks,
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
                    research_context = research_result.get("content", "")
                    research_citations = research_result.get("citations", [])[:5]
                    yield sse_event({
                        'type': 'research_results',
                        'content': research_context,
                        'citations': research_citations,
                        'query': research_result.get("query") or prefetch_query,
                    })
                    research_results_emitted = True
                elif research_result.get("error"):
                    yield sse_event({
                        'type': 'research_error',
                        'message': research_result.get("error"),
                        'query': research_result.get("query") or prefetch_query,
                    })
                    research_results_emitted = True
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
                _merge_scraped_videos()
                if scrape_result and scrape_result.get("scraped_content"):
                    reference_sources = [
                        {"url": item.get("url"), "title": item.get("title")}
                        for item in scrape_result.get("scraped_content", [])
                        if isinstance(item, dict)
                    ]
                if scraped_context and not reference_context_emitted:
                    yield sse_event({
                        "type": "reference_content",
                        "content": scraped_context,
                        "sources": reference_sources,
                    })
                    reference_context_emitted = True
            except Exception as exc:
                logger.warning("[OutlineAgent] Reference scraping failed in background: %s", exc)

        if video_task and video_task.done():
            try:
                video_payload = video_task.result()
                if _merge_video_payload(video_payload):
                    videos_collected = True
                    yield sse_event({
                        'type': 'status',
                        'status': 'videos_found',
                        'message': f"Found {len(video_payload['videos'])} video(s) from website",
                    })
            except Exception as exc:
                logger.warning("[OutlineAgent] Video scraping failed in background: %s", exc)

        # After streaming, extract JSON and any text after it
        found_json_blocks = extract_json_blocks(full_response)
        has_existing_outline = request.context and "current_outline" in request.context
        chosen_block = select_action_block(found_json_blocks, bool(has_existing_outline))

        if chosen_block and has_existing_outline:
            action = chosen_block['data'].get('action')
            if action in ('update_theme', 'update_slides', 'update_outline', 'scrape_media', 'clarify'):
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

        if not outline_data and full_response.strip():
            repaired = await _repair_outline_response(
                client,
                model,
                request.message,
                full_response,
            )
            if repaired:
                outline_data = normalize_action_payload(repaired)
                text_after_json = ""

        if outline_data:
            outline_data, enrichment_events, text_after_json, videos_applied = await _enrich_outline_data(
                outline_data,
                request=request,
                scrape_result=scrape_result,
                scraped_context=scraped_context,
                research_context=research_context,
                research_citations=research_citations,
                reference_sources=reference_sources,
                explicit_brand_domain=explicit_brand_domain,
                extracted_design_context=extracted_design_context,
                extracted_file_images=extracted_file_images,
                extracted_slide_screenshots=extracted_slide_screenshots,
                detected_slide_style=detected_slide_style,
                detected_intent=detected_intent,
                analysis_by_id=analysis_by_id,
                analysis_by_name=analysis_by_name,
                text_after_json=text_after_json,
            )
            for event in enrichment_events:
                yield sse_event(event)

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
                _merge_scraped_videos()
                if scrape_result and scrape_result.get("scraped_content"):
                    reference_sources = [
                        {"url": item.get("url"), "title": item.get("title")}
                        for item in scrape_result.get("scraped_content", [])
                        if isinstance(item, dict)
                    ]
                if scraped_context and not reference_context_emitted:
                    yield sse_event({
                        "type": "reference_content",
                        "content": scraped_context,
                        "sources": reference_sources,
                    })
                    reference_context_emitted = True
            except Exception as exc:
                logger.warning("[OutlineAgent] Reference scraping failed in background: %s", exc)
            else:
                if outline_data.get('action') == 'generate_outline':
                    updated = False
                    if scraped_context and outline_data.get("scraped_context") != scraped_context:
                        outline_data["scraped_context"] = scraped_context
                        updated = True
                    if reference_sources and outline_data.get("reference_sources") != reference_sources:
                        outline_data["reference_sources"] = reference_sources
                        updated = True
                    if updated:
                        yield f"data: {json.dumps({'type': 'outline', 'data': outline_data})}\n\n"

        if outline_data and research_task and not research_task.done():
            try:
                research_result = await research_task
                if research_result.get("success") and research_result.get("content"):
                    research_context = research_result.get("content", "")
                    research_citations = research_result.get("citations", [])[:5]
                    if not research_results_emitted:
                        yield sse_event({
                            'type': 'research_results',
                            'content': research_context,
                            'citations': research_citations,
                            'query': research_result.get("query") or prefetch_query,
                        })
                        research_results_emitted = True
                elif research_result.get("error") and not research_results_emitted:
                    yield sse_event({
                        'type': 'research_error',
                        'message': research_result.get("error"),
                        'query': research_result.get("query") or prefetch_query,
                    })
                    research_results_emitted = True
            except Exception as exc:
                logger.warning("[OutlineAgent] Prefetch research failed in background: %s", exc)
            else:
                if outline_data.get('action') == 'generate_outline':
                    updated = False
                    if research_context and outline_data.get("research_context") != research_context:
                        outline_data["research_context"] = research_context
                        updated = True
                    if research_citations and outline_data.get("research_citations") != research_citations:
                        outline_data["research_citations"] = research_citations
                        updated = True
                    if updated:
                        yield f"data: {json.dumps({'type': 'outline', 'data': outline_data})}\n\n"

        if outline_data and video_task and not videos_collected:
            try:
                video_payload = await video_task
                if _merge_video_payload(video_payload):
                    videos_collected = True
                    yield sse_event({
                        'type': 'status',
                        'status': 'videos_found',
                        'message': f"Found {len(video_payload['videos'])} video(s) from website",
                    })
            except Exception as exc:
                logger.warning("[OutlineAgent] Video scraping failed in background: %s", exc)

            available_videos = scraped_videos or (scrape_result.get('videos') if scrape_result else [])
            if (not videos_applied
                and outline_data.get('action') == 'generate_outline'
                and available_videos):
                outline_data['scraped_videos'] = available_videos
                logger.info(f"[OutlineAgent] 🎬 Attached {len(available_videos)} scraped videos to outline (post)")

                slides = outline_data.get('slides', [])
                if slides:
                    yield f"data: {json.dumps({'type': 'status', 'status': 'assigning_media', 'message': 'Evaluating videos...'})}\n\n"
                    presentation_topic = outline_data.get('topic', outline_data.get('title', ''))
                    slides = await assign_videos_to_slides(slides, available_videos, presentation_topic)
                    outline_data['slides'] = slides
                    assigned_count = sum(1 for s in slides if s.get('assignedVideo'))
                    if assigned_count > 0:
                        logger.info(f"[OutlineAgent] 🎬 Video assignment complete: {assigned_count} slides have assigned videos (post)")
                    else:
                        logger.info(f"[OutlineAgent] 🎬 No videos assigned (not relevant or low quality)")
                yield f"data: {json.dumps({'type': 'outline', 'data': outline_data})}\n\n"

        if not outline_data:
            if full_response.strip():
                logger.info("[OutlineAgent] No structured JSON block found; returning clarify fallback")
                fallback_message = full_response.strip()
                if len(fallback_message) > 400:
                    fallback_message = fallback_message[:400].rsplit(" ", 1)[0] + "..."
                fallback = {
                    "action": "clarify",
                    "message": fallback_message or "Quick check before I draft the outline.",
                    "draft_response": "Make it [[10]] slides for [[audience]]. Tone: [[professional]]. Motion: [[interactive/static]].",
                }
                yield f"data: {json.dumps({'type': 'outline', 'data': fallback})}\n\n"
            else:
                logger.warning("[OutlineAgent] Empty response from model")
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
