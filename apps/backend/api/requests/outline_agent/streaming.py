import json
import asyncio
import os
from urllib.parse import urlparse
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
    is_explicit_refresh_request,
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
    "If key details are missing (topic, audience, slide_count, tone/style, delivery format) or the request is high-stakes/educational, "
    "respond with action=clarify. ALWAYS include both: (1) a short 'message' intro, and (2) 'clarification.fields' array - NEVER omit fields. "
    "Each field: {key,label,type,options?,value?,placeholder?}. "
    "Use label for the question (markdown ok). Use value for a suggested default/prefill that is ready to submit. "
    "ALWAYS include a placeholder string with a short example answer (e.g. 'e.g., Marketing team at Acme Corp'). "
    "When asking about slide_count, default to 15 slides unless the user requests fewer. "
    "Ask for all missing essentials in a single clarify response (avoid multi-step questioning). "
    "When style or theme is unclear, include an open-text clarification question about the visual vibe and how it will be presented (e.g., live talk with minimal text, detailed analysis doc, or interactive web experience). Avoid jargon like slideMode. "
    "When a CURRENT OUTLINE is provided, do not use generate_outline unless the user explicitly asks to regenerate or start over. "
    "Use update_outline for structure/content changes, update_slides for specific slide tweaks, and update_theme for style/brand changes. "
    "\n\n"
    "CRITICAL - update_theme FORMAT: When user asks to change fonts, colors, logo, or brand styling, use action=update_theme with a theme_changes object. "
    "DO NOT include slides array in update_theme responses - this avoids unnecessary reloading. "
    "Format: {\"action\": \"update_theme\", \"message\": \"I'll update the theme...\", \"theme_changes\": {...}} "
    "theme_changes options: "
    "- fonts: {\"family\": \"Font Name\"} - for font changes like 'change font to Roboto' or 'use a more playful font' "
    "- colors: {\"search_query\": \"blue professional\"} - for color changes like 'make it blue' or 'use warmer colors' "
    "- brand: {\"name\": \"CompanyName\", \"url\": \"company.com\"} - for brand styling like 'use Tesla branding' "
    "- logo: {\"action\": \"remove\"} or {\"action\": \"add\", \"brand_names\": [\"CompanyName\"]} "
    "Examples: "
    "'Change the font' → {\"action\": \"update_theme\", \"message\": \"I'll update the fonts.\", \"theme_changes\": {\"fonts\": {\"family\": null}}} "
    "'Make it look more professional' → {\"action\": \"update_theme\", \"message\": \"Making it more professional.\", \"theme_changes\": {\"colors\": {\"search_query\": \"professional corporate\"}}} "
    "'Use Nike branding' → {\"action\": \"update_theme\", \"message\": \"Applying Nike brand styling.\", \"theme_changes\": {\"brand\": {\"name\": \"Nike\", \"url\": \"nike.com\"}}} "
    "'Remove the logo' → {\"action\": \"update_theme\", \"message\": \"Removing the logo.\", \"theme_changes\": {\"logo\": {\"action\": \"remove\"}}} "
    "\n\n"
    "When a CLARIFICATION_ANSWERED hint is provided, proceed to generate/update the outline unless a critical detail is still missing. "
    "If a brand or company is mentioned and no domain is confirmed, ask to confirm the brand domain. "
    "For generate_outline include title, topic, slide_count, detail_level, tone, slides[{title, content, key_points}], "
    "and stylePreferences.slideMode when known. "
    "CRITICAL - TITLE RULES: The 'title' field must be a SHORT, PUNCHY headline (2-6 words). "
    "DISTILL the topic into a catchy title - DO NOT copy the user's description verbatim. "
    "Good titles: 'Cartoon Network Nostalgia', 'The CN Golden Era', '90s Cartoon Classics', 'Benjamin Franklin', 'Q3 Sales Report'. "
    "Bad titles: 'A nostalgic deep dive into Cartoon Network's 90s', 'A comprehensive overview of Benjamin Franklin'. "
    "NEVER start with 'A', 'An', 'The' followed by adjectives. NEVER use phrases like 'deep dive', 'overview of', 'exploration of'. "
    "Transform user descriptions into punchy headlines: 'a nostalgic look at 90s cartoons' → 'Cartoon Network Classics'. "
    "If files are uploaded, decide if their images should be used in slides. "
    "Set use_uploaded_images to true only when the user explicitly wants the uploads applied; "
    "set it false when uploads are for reference or analysis only. "
    "Prefer user-provided facts; avoid inventing."
)

# ── agents.md compressed prompt (tool-calling architecture) ────────────────
OUTLINE_AGENTS_MD_PROMPT = (
    "You are a presentation outline agent. "
    "For NEW presentations, output a JSON object with action=generate_outline. "
    "For CLARIFICATION, output a JSON object with action=clarify. "
    "For ALL other updates, CALL the appropriate tool — ONE tool only, no text output.\n\n"

    "## Action Matrix\n"
    "create presentation → output generate_outline JSON (title, topic, slides, stylePreferences)\n"
    "missing details → output clarify JSON (message + clarification.fields)\n"
    "change theme/fonts/colors/brand → CALL update_theme tool ONLY\n"
    "edit specific slides → CALL update_slides tool ONLY\n"
    "add slide → CALL add_slide tool ONLY\n"
    "remove slide → CALL remove_slide tool ONLY\n"
    "reorder slides → CALL reorder_slide tool ONLY\n"
    "need facts/data → CALL web_search tool\n"
    "extract from site → CALL deep_extract tool\n"
    "pull media/gifs → CALL scrape_media tool\n\n"

    "## CRITICAL: Tool-calling discipline\n"
    "When calling tools, call EXACTLY ONE tool. Do NOT output any text alongside tool calls. "
    "Do NOT call multiple tools unless the user explicitly requests multiple distinct actions.\n"
    "'make it red' → call update_theme(colors={background: '#f8d7da', text: '#721c24', accent1: '#dc3545', accent2: '#85182a'}) ONLY. Nothing else.\n"
    "'make it blue' → call update_theme(colors={background: '#dbeafe', text: '#1e3a5f', accent1: '#3b82f6', accent2: '#1d4ed8'}) ONLY. Nothing else.\n"
    "'change slide 3 title' → call update_slides ONLY. Nothing else.\n"
    "NEVER call update_slides, web_search, or any other tool alongside update_theme for a style request.\n"
    "NEVER call web_search or update_slides alongside update_theme.\n\n"

    "## generate_outline JSON format\n"
    "{action: \"generate_outline\", title (2-6 words, punchy), topic, slide_count, "
    "detail_level, tone, slides: [{title, content, key_points}], "
    "stylePreferences: {slideMode?, brandDomain?}}\n\n"

    "## clarify JSON format\n"
    "{action: \"clarify\", message (intro), clarification: {fields: [{key, label, type, options?, value?, placeholder?}]}}\n"
    "ALWAYS include placeholder with a short example answer for every field (e.g. 'e.g., College students').\n\n"

    "## Title rules\n"
    "SHORT PUNCHY (2-6 words). No 'A/An/The + adjectives'. No 'deep dive/overview/exploration'. "
    "Transform: 'a nostalgic look at 90s cartoons' → 'Cartoon Network Classics'.\n\n"

    "## Clarify rules\n"
    "- Ask ALL missing essentials in ONE clarify (no multi-step)\n"
    "- Default slide_count: 15\n"
    "- Always include style/vibe question about how it will be presented (live talk, detailed doc, interactive web)\n"
    "- After CLARIFICATION_ANSWERED hint → proceed to generate\n\n"

    "## When CURRENT OUTLINE exists\n"
    "- DO NOT generate_outline unless user says 'start over' / 'regenerate'\n"
    "- Use update_slides tool ONLY for content/text changes (titles, body, key_points, speaker_notes)\n"
    "- Use update_theme tool ONLY for visual/style changes (colors, fonts, brand, logo)\n"
    "- Use add_slide/remove_slide/reorder_slide for structure changes\n"
    "- Style requests like 'make it green/blue/red/dark/professional' → update_theme ONLY. "
    "Do NOT also call update_slides, web_search, or any other tool.\n\n"

    "## update_theme examples\n"
    "'change font' → call update_theme(fonts={family: null}) [null = auto-select]\n"
    "'make it green' → call update_theme(colors={background: '#d4edda', text: '#155724', accent1: '#28a745', accent2: '#1b4332'})\n"
    "'make it red' → call update_theme(colors={background: '#f8d7da', text: '#721c24', accent1: '#dc3545', accent2: '#85182a'})\n"
    "'dark blue theme' → call update_theme(colors={background: '#1a1d3b', text: '#ffffff', accent1: '#4a69bd', accent2: '#6c5ce7'})\n"
    "'warm sunset' → call update_theme(colors={search_query: 'warm sunset'})\n"
    "'use Nike branding' → call update_theme(brand={name: 'Nike', url: 'nike.com'})\n"
    "'remove the logo' → call update_theme(logo={action: 'remove'})\n\n"
    "## Color selection rules\n"
    "When the user asks for a specific color, YOU choose the exact hex values. Pick a cohesive palette:\n"
    "- Background: light tint of the color (for light themes) or dark shade (for dark themes)\n"
    "- Text: high contrast against background (#1A1A1A for light bg, #FFFFFF for dark bg)\n"
    "- Accent1: vivid version of the requested color\n"
    "- Accent2: complementary or analogous color\n"
    "Only use search_query for abstract/complex requests where you can't pick colors directly.\n"
    "When you use search_query, you'll see the selected colors in the result. "
    "If they look wrong, call update_theme again with direct hex values to fix them.\n\n"

    "## Rules\n"
    "1. generate_outline/clarify → JSON output. All updates → tool calls only (no text).\n"
    "2. ONE tool per request. NEVER combine tools unless the user explicitly asks for multiple things.\n"
    "3. Prefer user-provided facts; avoid inventing.\n"
    "4. Research before factual claims (call web_search) — but ONLY when generating new outlines, NOT for style changes.\n"
    "5. Files uploaded → decide use_uploaded_images (explicit use vs reference).\n"
    "6. Brand mentioned without domain → confirm via clarify.\n"
    "7. Use current year in searches.\n"
    "8. When asking about slide_count, default to 15 slides.\n"
    "9. If a brand or company is mentioned and no domain is confirmed, ask to confirm the brand domain."
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
        "with both 'message' (intro) AND 'clarification.fields' array - NEVER omit fields. "
        "If style is unclear, include an open-text question about visual vibe and how it will be presented (live talk vs detailed doc vs interactive web), avoiding jargon. "
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
        # Simple status to confirm streaming started - no fake details
        yield sse_event({'type': 'status', 'status': 'thinking'})
        logger.info("[OutlineAgent] Started streaming")

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

        def _normalize_url(candidate: str) -> str:
            if not isinstance(candidate, str):
                return ""
            value = candidate.strip()
            if not value:
                return ""
            try:
                parsed = urlparse(value if value.startswith("http") else f"https://{value}")
                host = (parsed.hostname or "").lower().lstrip("www.")
                path = (parsed.path or "").rstrip("/")
                return f"{host}{path}"
            except Exception:
                return value.lower().rstrip("/")

        def _extract_reference_urls(sources: List[Dict[str, Any]]) -> set:
            urls = set()
            for source in sources or []:
                if not isinstance(source, dict):
                    continue
                candidate = source.get("url") or source.get("source_url") or ""
                normalized = _normalize_url(candidate)
                if normalized:
                    urls.add(normalized)
            return urls

        def _merge_reference_sources(
            existing: List[Dict[str, Any]],
            incoming: List[Dict[str, Any]],
        ) -> List[Dict[str, Any]]:
            merged: List[Dict[str, Any]] = []
            seen = set()
            for item in (existing or []) + (incoming or []):
                if not isinstance(item, dict):
                    continue
                key = (_normalize_url(item.get("url") or "") or "").strip() or item.get("title") or ""
                if key in seen:
                    continue
                seen.add(key)
                merged.append(item)
            return merged

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

        if request.context:
            context_scraped = request.context.get("scraped_context") or request.context.get("scrapedContext")
            if isinstance(context_scraped, str) and context_scraped.strip():
                scraped_context = context_scraped

            context_sources = request.context.get("reference_sources") or request.context.get("referenceSources") or []
            if isinstance(context_sources, list):
                reference_sources = [s for s in context_sources if isinstance(s, dict)]

            context_research = request.context.get("research_context") or request.context.get("researchContext")
            if isinstance(context_research, str) and context_research.strip():
                research_context = context_research

            context_citations = request.context.get("research_citations") or request.context.get("researchCitations") or []
            if isinstance(context_citations, list):
                research_citations = [str(c) for c in context_citations if c]

        if file_context and not request.files:
            logger.info("[OutlineAgent] Using previous file analysis context: %s chars", len(file_context))

        has_reference_context = bool(scraped_context or reference_sources)
        has_research_context = bool(research_context or research_citations)
        explicit_request = is_explicit_research_request(request.message)
        refresh_request = is_explicit_refresh_request(request.message)

        # Detect URLs in the CURRENT message only and auto-scrape them.
        # Exception: if the user explicitly asks to search, fall back to recent history.
        urls_to_scrape = collect_urls_to_scrape(request.message)
        explicit_domains = extract_domains_from_message(request.message)
        if not urls_to_scrape and not explicit_domains and explicit_request:
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
        if not urls_to_scrape and not explicit_domains and not has_reference_context:
            urls_to_scrape = collect_urls_to_scrape(request.message, request.context or {})
            explicit_domains = extract_domains_from_message(request.message)
        if not explicit_domains:
            recent_user_messages: List[str] = []
            for msg in reversed(request.chat_history or []):
                if msg.role != "user":
                    continue
                content = (msg.content or "").strip()
                if not content:
                    continue
                recent_user_messages.append(content)
                if len(recent_user_messages) >= 6:
                    break
            history_text = "\n".join(reversed(recent_user_messages))
            if history_text:
                history_domains = extract_domains_from_message(history_text)
                if history_domains:
                    explicit_domains = history_domains
                    logger.info("[OutlineAgent] Using explicit domains from chat history: %s", explicit_domains)

        if urls_to_scrape and has_reference_context and not refresh_request:
            existing_urls = _extract_reference_urls(reference_sources)
            urls_to_scrape = [
                url for url in urls_to_scrape
                if _normalize_url(url) not in existing_urls
            ]
            if not urls_to_scrape:
                logger.info("[OutlineAgent] Skipping auto-scrape; reference context already present")
        explicit_brand_domain = None
        if request.context:
            explicit_brand_domain = (
                request.context.get("brandDomain")
                or request.context.get("brand_domain")
            )
            if not explicit_brand_domain:
                current_outline = request.context.get("current_outline")
                if isinstance(current_outline, dict):
                    style_prefs = current_outline.get("stylePreferences") or current_outline.get("style_preferences")
                    if isinstance(style_prefs, dict):
                        explicit_brand_domain = (
                            style_prefs.get("brandDomain")
                            or style_prefs.get("brand_domain")
                        )
        if not explicit_brand_domain and explicit_domains:
            explicit_brand_domain = explicit_domains[0]

        allow_prefetch = bool(urls_to_scrape) or not has_research_context or refresh_request
        prefetch_query = build_prefetch_research_query(
            request.message,
            urls_to_scrape,
            request.context if allow_prefetch else None,
        )
        if explicit_request and not allow_prefetch:
            logger.info("[OutlineAgent] Prefetch research skipped; cached context present and no refresh requested")
        if prefetch_query and allow_prefetch:
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
                new_scraped_context = scrape_payload.scraped_context
                scrape_result = scrape_payload.scrape_result
                _merge_scraped_videos()
                if scrape_result and scrape_result.get("scraped_content"):
                    incoming_sources = [
                        {"url": item.get("url"), "title": item.get("title")}
                        for item in scrape_result.get("scraped_content", [])
                        if isinstance(item, dict)
                    ]
                    reference_sources = _merge_reference_sources(reference_sources, incoming_sources)
                if new_scraped_context:
                    if scraped_context and new_scraped_context not in scraped_context:
                        scraped_context = f"{scraped_context}\n\n{new_scraped_context}"
                    else:
                        scraped_context = new_scraped_context
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

        messages = build_messages(
            request,
            scraped_context,
            file_context,
            research_context,
            research_citations,
        )

        logger.info(f"[OutlineAgent] Processing message with {len(messages)} messages in history")

        # Call Anthropic API with tool support - model decides when to search
        full_response = ""
        in_json_block = False
        last_status_text = ""
        tool_results_emitted = False

        def contains_json_start(text: str) -> bool:
            """Check if text contains the start of JSON (fenced or raw)."""
            if '```json' in text or '```' in text:
                return True
            if '"action"' in text and '{' in text:
                return True
            return False

        extra_tasks = [t for t in (research_task,) if t is not None]
        if scrape_task and not scrape_task.done():
            extra_tasks.append(scrape_task)

        # Feature-flag: agents.md prompt with tool-calling architecture
        from agents.config import USE_OUTLINE_AGENTS_MD
        if USE_OUTLINE_AGENTS_MD:
            system_prompt = OUTLINE_AGENTS_MD_PROMPT
            use_outline_tools = True
            current_outline_data = request.context.get("current_outline") if request.context else None
            logger.info("[OutlineAgent] Using agents.md tool-calling architecture")
        else:
            system_prompt = OUTLINE_AGENT_SYSTEM_PROMPT
            use_outline_tools = False
            current_outline_data = None

        async for result in call_model_with_tools(
            client,
            model,
            messages,
            system_prompt,
            extra_context_tasks=extra_tasks,
            outline_tools=use_outline_tools,
            current_outline=current_outline_data,
        ):
            if isinstance(result, str) and result.startswith("data:"):
                # This is a status event from tool calls - yield it directly
                logger.info(f"[OutlineAgent] Yielding tool status: {result[:100]}...")
                yield result
            elif isinstance(result, tuple) and result[0] == "tool_result":
                # Tool execution result from outline tools (theme, slides, media)
                tool_name = result[1]
                tool_data = result[2]
                tool_results_emitted = True
                logger.info(f"[OutlineAgent] Tool result: {tool_name} -> {tool_data.get('message', '')}")

                if tool_name == "update_theme":
                    # Emit theme_changes (original tool args) so the frontend's
                    # existing code picks it up and calls /api/outline-theme/apply.
                    # Also include pre-processed style_preferences/theme_updates
                    # so the frontend can optionally skip the API call in the future.
                    theme_event_data = {
                        'action': 'update_theme',
                        'message': tool_data.get('message', ''),
                        'theme_changes': tool_data.get('_original_args', {}),
                    }
                    if tool_data.get('style_preferences'):
                        theme_event_data['style_preferences'] = tool_data['style_preferences']
                    if tool_data.get('theme_updates'):
                        theme_event_data['theme_updates'] = tool_data['theme_updates']
                    yield f"data: {json.dumps({'type': 'outline', 'data': theme_event_data})}\n\n"

                elif tool_name in ("update_slides", "add_slide", "remove_slide", "reorder_slide"):
                    yield f"data: {json.dumps({'type': 'outline', 'data': {'action': 'update_outline', 'message': tool_data.get('message', ''), 'slides': tool_data.get('slides')}})}\n\n"

                elif tool_name == "scrape_media":
                    yield f"data: {json.dumps({'type': 'outline', 'data': {'action': 'scrape_media', 'message': tool_data.get('message', ''), 'scraped_media': tool_data.get('scraped_media')}})}\n\n"
            elif isinstance(result, tuple) and result[0] == "text":
                text = result[1]
                full_response += text
                logger.info(f"[OutlineAgent] Received text: {len(text)} chars (total: {len(full_response)} chars)")

                # Suppress text streaming when tool results were already emitted.
                # Tool-only responses (theme/slide updates) don't need text output —
                # the SSE tool_result events are the complete response.
                if tool_results_emitted:
                    logger.info("[OutlineAgent] Suppressing text (tool results already emitted)")
                    continue

                # Detect JSON blocks
                if contains_json_start(full_response) and not in_json_block:
                    in_json_block = True
                    logger.info(f"[OutlineAgent] JSON block detected")
                    yield sse_event({'type': 'status', 'status': 'compiling'})
                elif not in_json_block and text and not contains_json_start(text):
                    # Stream actual model text as both text event and status
                    clean_text = text.strip()
                    if clean_text and clean_text != last_status_text:
                        last_status_text = clean_text
                        # Send as status so it shows in the status bubble
                        yield sse_event({'type': 'status', 'status': 'thinking', 'message': clean_text[:200]})
                    # Also send as text for chat display
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
            # Send status phase - no hardcoded messages
            action = outline_data.get('action', 'generate_outline')
            if action == 'generate_outline':
                yield sse_event({'type': 'status', 'status': 'enriching'})
            elif action == 'update_theme':
                yield sse_event({'type': 'status', 'status': 'updating_theme'})
            elif action == 'update_slides':
                yield sse_event({'type': 'status', 'status': 'updating_slides'})

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

            # Send completion status
            if action == 'generate_outline':
                yield sse_event({'type': 'status', 'status': 'outline_complete'})

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
            if tool_results_emitted:
                # Tool results (theme/slide updates) were already emitted as SSE events.
                # No JSON outline needed — the frontend already received the updates.
                logger.info("[OutlineAgent] Tool results already emitted; skipping JSON extraction")
            elif full_response.strip():
                logger.info("[OutlineAgent] No structured JSON block found; returning clarify fallback")
                fallback_message = full_response.strip()
                if len(fallback_message) > 400:
                    fallback_message = fallback_message[:400].rsplit(" ", 1)[0] + "..."
                fallback = {
                    "action": "clarify",
                    "message": fallback_message or "Quick check before I draft the outline.",
                    "clarification": {
                        "fields": [
                            {
                                "key": "slide_count",
                                "label": "How many slides should it be?",
                                "type": "number",
                                "value": 15,
                            },
                            {
                                "key": "audience",
                                "label": "Who is the audience?",
                                "type": "text",
                            },
                            {
                                "key": "tone",
                                "label": "Preferred tone?",
                                "type": "text",
                                "value": "professional",
                            },
                            {
                                "key": "style",
                                "label": "What visual style or vibe should it have?",
                                "type": "text",
                                "value": "modern",
                            },
                            {
                                "key": "slide_mode",
                                "label": "How will this be presented (live talk with minimal text vs detailed document or interactive web)",
                                "type": "text",
                            },
                        ]
                    },
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
