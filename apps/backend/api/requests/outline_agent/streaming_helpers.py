"""Helper utilities for OutlineAgent streaming."""

from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import urlparse
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from setup_logging_optimized import get_logger

from .models import OutlineAgentRequest
from .files import analyze_files_for_presentation, enhanced_file_analysis
from .media import scrape_reference_links

logger = get_logger(__name__)

URL_PATTERN = re.compile(
    r'https?://[^\s<>"{}|\\^`\[\]]+|(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:life|com|co|io|org|net|ai|app|xyz|dev)(?:/[^\s]*)?)',
    re.IGNORECASE,
)
DOMAIN_PATTERN = re.compile(
    r'\b([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:life|com|co|io|org|net|ai|app|xyz|dev))\b',
    re.IGNORECASE,
)

PREFETCH_KEYWORDS = (
    "pitch deck",
    "investor",
    "funding",
    "series",
    "market",
    "tam",
    "sam",
    "som",
    "competitor",
    "competitive",
    "analysis",
    "go in depth",
    "extremely detailed",
    "due diligence",
    "valuation",
    "unit economics",
)


def build_prefetch_research_query(message: str, urls: List[str]) -> Optional[str]:
    text = (message or "").strip()
    if not text and not urls:
        return None

    lower = text.lower()
    has_signal = any(keyword in lower for keyword in PREFETCH_KEYWORDS) or bool(urls)
    if not has_signal:
        return None

    base = ""
    if urls:
        url = urls[0]
        if not url.startswith("http"):
            url = f"https://{url}"
        try:
            parsed = urlparse(url)
            host = parsed.hostname or ""
            base = host.replace("www.", "") or url
        except Exception:
            base = url

    if not base:
        base = text

    topics = []
    if "market" in lower or "tam" in lower:
        topics.append("market size")
    if "competitor" in lower or "competitive" in lower:
        topics.append("competitors")
    if "investor" in lower or "funding" in lower or "series" in lower:
        topics.append("funding")
    if not topics:
        topics = ["company overview", "business model", "market size", "competitors", "recent news"]

    query = f"{base} " + ", ".join(topics)
    return query[:300]


@dataclass
class FileAnalysisPayload:
    file_context: str = ""
    detected_intent: Optional[str] = None
    detected_slide_style: Optional[str] = None
    extracted_design_context: Optional[Dict[str, Any]] = None
    extracted_file_images: List[Any] = field(default_factory=list)
    extracted_slide_screenshots: List[Any] = field(default_factory=list)
    events: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class ScrapePayload:
    scraped_context: str = ""
    scrape_result: Optional[Dict[str, Any]] = None
    events: List[Dict[str, Any]] = field(default_factory=list)


def sse_event(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def analyze_request_files(request: OutlineAgentRequest) -> FileAnalysisPayload:
    if not request.files:
        return _restore_previous_analysis(request)

    events: List[Dict[str, Any]] = []
    file_names = [f.name for f in request.files]
    logger.info("[OutlineAgent] Analyzing %s files: %s", len(request.files), file_names)

    for i, file in enumerate(request.files):
        events.append({
            'type': 'status',
            'status': 'analyzing_file',
            'message': f'Analyzing {file.name}...',
            'file_index': i,
            'file_name': file.name,
            'total_files': len(request.files)
        })

    file_analysis, enhanced_result = await asyncio.gather(
        analyze_files_for_presentation(request.files),
        enhanced_file_analysis(request.files, request.message),
    )

    payload = FileAnalysisPayload(events=events)

    if enhanced_result.get("success"):
        payload.detected_intent = enhanced_result.get("intent")
        payload.detected_slide_style = enhanced_result.get("slide_style")
        payload.extracted_design_context = enhanced_result.get("design_context")
        payload.extracted_file_images = enhanced_result.get("extracted_images", [])
        payload.extracted_slide_screenshots = enhanced_result.get("slide_screenshots", [])

    if file_analysis.get("success") and file_analysis.get("combined_context"):
        intent_info = _format_intent_info(payload.detected_intent)
        style_info = _format_style_info(payload.detected_slide_style)
        design_info = _format_design_info(payload.extracted_design_context)

        payload.file_context = (
            f"\n\n[UPLOADED FILES ANALYSIS]{intent_info}{style_info}{design_info}\n"
            f"{file_analysis['combined_context']}\n[END FILES ANALYSIS]\n"
        )
        file_count = file_analysis.get('file_count', len(request.files))

        events.append({
            'type': 'status',
            'status': 'files_analyzed',
            'message': f'Analyzed {file_count} file(s)',
            'analyses': file_analysis.get('analyses', []),
            'detected_intent': payload.detected_intent,
            'detected_slide_style': payload.detected_slide_style,
            'has_design': payload.extracted_design_context is not None,
            'extracted_design': payload.extracted_design_context,
            'slide_screenshots_count': len(payload.extracted_slide_screenshots or []),
        })
    else:
        error_msg = file_analysis.get('error', 'Could not analyze files')
        logger.warning("[OutlineAgent] File analysis failed or empty: %s", error_msg)
        events.append({
            'type': 'status',
            'status': 'file_analysis_error',
            'message': error_msg,
        })

    return payload


def collect_urls_to_scrape(message: str, context: Optional[Dict[str, Any]] = None) -> List[str]:
    detected_urls = URL_PATTERN.findall(message)
    detected_domains = DOMAIN_PATTERN.findall(message)

    urls_to_scrape: List[str] = []
    for url in detected_urls:
        if url and not url.startswith('http'):
            url = f'https://{url}'
        if url:
            urls_to_scrape.append(url)

    for domain in detected_domains:
        url = f'https://{domain}'
        if url not in urls_to_scrape:
            urls_to_scrape.append(url)

    reference_links = []
    if context:
        reference_links = context.get('reference_links') or context.get('referenceLinks') or []
    urls_to_scrape.extend(reference_links)

    deduped = list(dict.fromkeys(urls_to_scrape))
    return deduped[:3]


async def scrape_reference_content(urls: List[str]) -> ScrapePayload:
    if not urls:
        return ScrapePayload()

    events: List[Dict[str, Any]] = [
        {
            'type': 'status',
            'status': 'scraping',
            'message': f'Reading content from {urls[0]}...',
        }
    ]

    scrape_result = await scrape_reference_links(urls)
    scraped_context = ""

    if scrape_result.get('success') and scrape_result.get('scraped_content'):
        scraped_parts = []
        for item in scrape_result['scraped_content']:
            title = item.get('title') or item.get('url', 'Reference')
            scraped_parts.append(f"--- {title} ---\n{item['content']}\n---")
        scraped_context = "\n\n[REFERENCE CONTENT]\n" + "\n".join(scraped_parts) + "\n[END REFERENCE CONTENT]\n\n"

        videos = scrape_result.get('videos', [])
        if videos:
            video_parts = ["\n\n[AVAILABLE VIDEOS FROM WEBSITE]"]
            video_parts.append(f"Found {len(videos)} video(s) that can be embedded in slides:\n")
            for i, video in enumerate(videos[:5]):
                video_url = video.get('url', video.get('embed_url', ''))
                video_type = video.get('source_type', 'direct')
                video_title = video.get('title', 'Untitled')
                thumbnail = video.get('thumbnail', '')
                video_parts.append(f"{i+1}. [{video_type}] {video_title}")
                video_parts.append(f"   URL: {video_url}")
                if thumbnail:
                    video_parts.append(f"   Thumbnail: {thumbnail}")
            video_parts.append("\nYou can reference these videos in slide content suggestions.")
            video_parts.append("[END AVAILABLE VIDEOS]\n")
            scraped_context += "\n".join(video_parts)
            events.append({
                'type': 'status',
                'status': 'videos_found',
                'message': f"Found {len(videos)} video(s) from website",
            })

        count = len(scrape_result['scraped_content'])
        events.append({
            'type': 'status',
            'status': 'scraped',
            'message': f'Extracted content from {count} link(s)',
        })

    return ScrapePayload(scraped_context=scraped_context, scrape_result=scrape_result, events=events)


def build_messages(
    request: OutlineAgentRequest,
    scraped_context: str,
    file_context: str,
) -> List[Dict[str, Any]]:
    messages: List[Dict[str, Any]] = []
    for msg in request.chat_history:
        if msg.content and msg.content.strip():
            messages.append({"role": msg.role, "content": msg.content})

    user_content = request.message + scraped_context + file_context

    if request.context and "current_outline" in request.context:
        outline = request.context["current_outline"]
        outline_json = json.dumps({
            "title": outline.get("title", ""),
            "slides": [
                {
                    "index": slide["index"],
                    "title": slide["title"],
                    "subtitle": slide.get("subtitle", ""),
                    "content": slide.get("content", ""),
                    "key_points": slide.get("key_points", []),
                }
                for slide in outline.get("slides", [])
            ],
        }, indent=2)
        user_content = f"{user_content}\n\n[CURRENT OUTLINE]\n```json\n{outline_json}\n```"

        if "target_slide_index" in request.context:
            target_idx = request.context["target_slide_index"]
            user_content = (
                f"{user_content}\n\n[TARGET_SLIDE_INDEX]\n{target_idx}\n"
                f"(User wants to edit slide {target_idx + 1} specifically)"
            )

    messages.append({"role": "user", "content": user_content})
    return messages


def extract_json_blocks(full_response: str) -> List[Dict[str, Any]]:
    blocks: List[Dict[str, Any]] = []

    for match in re.finditer(r'```json\s*(\{[\s\S]*?\})\s*```', full_response):
        try:
            data = json.loads(match.group(1))
            blocks.append({'data': data, 'end_index': match.end()})
        except Exception:
            continue

    if not blocks:
        action_indices = [m.start() for m in re.finditer(r'"action"', full_response)]
        for action_idx in action_indices:
            start = full_response.rfind('{', 0, action_idx)
            if start == -1:
                continue
            in_string = False
            escape_next = False
            depth = 0
            end = None
            for i in range(start, len(full_response)):
                ch = full_response[i]
                if escape_next:
                    escape_next = False
                    continue
                if ch == '\\' and in_string:
                    escape_next = True
                    continue
                if ch == '"':
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end is None:
                continue
            try:
                candidate = full_response[start:end]
                data = json.loads(candidate)
                blocks.append({'data': data, 'end_index': end})
            except Exception:
                continue

    return blocks


def _get_block_action(block: Dict[str, Any]) -> Optional[str]:
    data = block.get('data') or {}
    if isinstance(data, dict):
        action = data.get('action')
        if action:
            return action
        for key in ('generate_outline', 'update_outline', 'update_slides', 'update_theme', 'scrape_media'):
            if key in data:
                return key
    return None


def select_action_block(
    blocks: List[Dict[str, Any]],
    has_existing_outline: bool,
) -> Optional[Dict[str, Any]]:
    if not blocks:
        return None

    if has_existing_outline:
        for block in blocks:
            action = _get_block_action(block)
            if action in ('update_theme', 'update_slides', 'update_outline', 'scrape_media'):
                return block
        return blocks[0]

    for block in blocks:
        if _get_block_action(block) == 'generate_outline':
            return block

    return blocks[0]


def normalize_action_payload(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    if 'action' in data:
        return data
    for key in ('generate_outline', 'update_outline', 'update_slides', 'update_theme', 'scrape_media'):
        nested = data.get(key)
        if isinstance(nested, dict):
            normalized = dict(nested)
            normalized['action'] = key
            return normalized
    return data


def _format_intent_info(intent: Optional[str]) -> str:
    if not intent:
        return ""
    lines = [f"\n[FILE INTENT]: {intent}"]
    if intent == "use_design_only":
        lines.append(" (User wants to USE THE DESIGN/STYLE from these files, NOT the content)")
    elif intent == "use_content_only":
        lines.append(" (User wants to USE THE CONTENT from these files, NOT the design)")
    elif intent == "recreate_exact":
        lines.append(" (User wants to RECREATE these files exactly)")
    elif intent == "use_both":
        lines.append(" (User wants to use BOTH design AND content from these files)")
    return "".join(lines)


def _format_style_info(style: Optional[str]) -> str:
    if not style:
        return ""
    lines = [f"\n[PREFERRED SLIDE STYLE]: {style}"]
    if style == "interactive":
        lines.append(" (User wants INTERACTIVE slides with animations)")
    elif style == "traditional":
        lines.append(" (User wants TRADITIONAL simple slides)")
    return "".join(lines)


def _format_design_info(design: Optional[Dict[str, Any]]) -> str:
    if not design:
        return ""
    design_info = f"\n[EXTRACTED DESIGN]:\n{json.dumps(design, indent=2)}"
    design_info += "\n(Use these colors/fonts when generating theme)"
    return design_info


def _restore_previous_analysis(request: OutlineAgentRequest) -> FileAnalysisPayload:
    payload = FileAnalysisPayload()
    if not request.context or not request.context.get('previousFileAnalysis'):
        return payload

    previous_analysis = request.context['previousFileAnalysis']
    payload.file_context = (
        "\n\n[PREVIOUSLY ANALYZED FILES]\n"
        f"{previous_analysis}\n"
        "(Files were analyzed earlier in this conversation - use the chat history for full context)\n"
    )

    payload.extracted_design_context = request.context.get('previousExtractedDesign')
    payload.detected_intent = request.context.get('previousFileIntent')
    payload.extracted_slide_screenshots = request.context.get('previousSlideScreenshots') or []
    return payload
