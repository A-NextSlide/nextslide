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
    r'(?:https?://[^\s<>"{}|\\^`\[\]]+|(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*\.(?:life|com|co|io|org|net|ai|app|xyz|dev)(?:/[^\s]*)?)',
    re.IGNORECASE,
)
DOMAIN_PATTERN = re.compile(
    r'\b([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:life|com|co|io|org|net|ai|app|xyz|dev))\b',
    re.IGNORECASE,
)
EXPLICIT_RESEARCH_PATTERN = re.compile(
    r'\b(search|research|crawl|scrape|lookup|look up|find|investigate|verify|diligence|due diligence)\b',
    re.IGNORECASE,
)
DEPTH_RESEARCH_PATTERN = re.compile(
    r'\b(pitch deck|series [a-d]|investor|funding|analytical|in-depth|deep dive|market|competitive|data-driven)\b',
    re.IGNORECASE,
)
DATA_URL_PATTERN = re.compile(r"data:[^\s]+", re.IGNORECASE)
MAX_FILE_CONTEXT_CHARS = 120000


def is_explicit_research_request(message: str) -> bool:
    if not message:
        return False
    return bool(EXPLICIT_RESEARCH_PATTERN.search(message))


def _sanitize_context_block(text: str, max_chars: int = MAX_FILE_CONTEXT_CHARS) -> str:
    if not text:
        return ""
    cleaned = DATA_URL_PATTERN.sub("[data omitted]", text)
    sanitized_lines: List[str] = []
    for line in cleaned.splitlines():
        if "data:" in line and "base64" in line:
            continue
        if len(line) > 6000:
            sanitized_lines.append(line[:6000] + " [TRUNCATED]")
        else:
            sanitized_lines.append(line)
    cleaned = "\n".join(sanitized_lines)
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars] + "\n[TRUNCATED]"
    return cleaned

def extract_domains_from_message(message: str) -> List[str]:
    """Extract explicit domains from the current user message."""
    if not message:
        return []

    detected_urls = URL_PATTERN.findall(message)
    detected_domains = DOMAIN_PATTERN.findall(message)
    candidates = []

    for raw in detected_urls:
        url = raw if raw.startswith("http") else f"https://{raw}"
        try:
            parsed = urlparse(url)
            host = parsed.hostname or ""
        except Exception:
            host = ""
        if host:
            candidates.append(host)

    candidates.extend(detected_domains)

    cleaned = []
    for host in candidates:
        normalized = host.strip().lower().lstrip("www.")
        if normalized and normalized not in cleaned:
            cleaned.append(normalized)

    return cleaned

def build_prefetch_research_query(
    message: str,
    urls: List[str],
    context: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    if context:
        query = context.get("prefetch_research_query") or context.get("prefetchResearchQuery")
        if isinstance(query, str) and query.strip():
            return query.strip()[:300]

        queries = context.get("prefetch_research_queries") or context.get("prefetchResearchQueries")
        if isinstance(queries, list):
            for item in queries:
                if isinstance(item, str) and item.strip():
                    return item.strip()[:300]

    message = (message or "").strip()
    domain_hint = None
    if urls:
        candidate = urls[0]
        try:
            parsed = urlparse(candidate)
            host = parsed.hostname or candidate
        except Exception:
            host = candidate
        domain_hint = host.lstrip("www.").lower()
    if not domain_hint and message:
        domains = extract_domains_from_message(message)
        if domains:
            domain_hint = domains[0]

    explicit_request = is_explicit_research_request(message)
    depth_request = bool(DEPTH_RESEARCH_PATTERN.search(message))
    if not (explicit_request or domain_hint):
        return None

    if domain_hint:
        query_parts = [
            domain_hint,
            "company overview",
            "product",
            "business model",
            "traction",
            "funding",
        ]
        if depth_request:
            query_parts.append("Series A pitch deck")
        query = " ".join(query_parts)
        return query.strip()[:300]

    if explicit_request and message:
        return message[:300]

    return None


@dataclass
class FileAnalysisPayload:
    file_context: str = ""
    content_context: str = ""
    detected_intent: Optional[str] = None
    detected_slide_style: Optional[str] = None
    extracted_design_context: Optional[Dict[str, Any]] = None
    extracted_file_images: List[Any] = field(default_factory=list)
    extracted_slide_screenshots: List[Any] = field(default_factory=list)
    analysis_by_id: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    analysis_by_name: Dict[str, Dict[str, Any]] = field(default_factory=dict)
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

    analyses = file_analysis.get("analyses") or []
    if isinstance(analyses, list):
        for analysis in analyses:
            if not isinstance(analysis, dict):
                continue
            file_id = analysis.get("file_id")
            filename = analysis.get("filename")
            if file_id:
                payload.analysis_by_id[file_id] = analysis
            if filename:
                payload.analysis_by_name[filename] = analysis

    if enhanced_result.get("success"):
        payload.detected_intent = enhanced_result.get("intent")
        payload.detected_slide_style = enhanced_result.get("slide_style")
        payload.extracted_design_context = enhanced_result.get("design_context")
        payload.extracted_file_images = enhanced_result.get("extracted_images", [])
        payload.extracted_slide_screenshots = enhanced_result.get("slide_screenshots", [])
        payload.content_context = enhanced_result.get("content_context") or ""

    file_context_parts = []
    if file_analysis.get("success") and file_analysis.get("combined_context"):
        intent_info = _format_intent_info(payload.detected_intent)
        style_info = _format_style_info(payload.detected_slide_style)
        design_info = _format_design_info(payload.extracted_design_context)

        analysis_block = (
            f"\n\n[UPLOADED FILES ANALYSIS]{intent_info}{style_info}{design_info}\n"
            f"{file_analysis['combined_context']}\n[END FILES ANALYSIS]\n"
        )
        file_context_parts.append(analysis_block)

    if payload.content_context:
        payload.content_context = _sanitize_context_block(payload.content_context, max_chars=60000)
        file_context_parts.append(
            "\n\n[EXTRACTED FILE CONTENT]\n"
            f"{payload.content_context}\n[END EXTRACTED FILE CONTENT]\n"
        )

    if file_context_parts:
        payload.file_context = _sanitize_context_block("\n".join(file_context_parts))
        file_count = file_analysis.get('file_count', len(request.files))
        events.append({
            'type': 'status',
            'status': 'files_analyzed',
            'message': f'Analyzed {file_count} file(s)',
            'analyses': file_analysis.get('analyses', []),
            'file_context': payload.file_context,
            'content_context': payload.content_context,
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

    def _add_candidate(candidate: str) -> None:
        if not isinstance(candidate, str):
            return
        candidate = candidate.strip()
        if not candidate:
            return
        matches = URL_PATTERN.findall(candidate)
        if matches:
            for match in matches:
                url = match if match.startswith('http') else f'https://{match}'
                if url not in urls_to_scrape:
                    urls_to_scrape.append(url)
            return
        if DOMAIN_PATTERN.search(candidate):
            url = f'https://{candidate}'
            if url not in urls_to_scrape:
                urls_to_scrape.append(url)

    if context:
        reference_links = context.get('reference_links') or context.get('referenceLinks') or []
        if isinstance(reference_links, str):
            reference_links = [reference_links]
        for link in reference_links or []:
            _add_candidate(link)

        style_prefs = context.get('stylePreferences') or context.get('style_preferences')
        if isinstance(style_prefs, str):
            try:
                style_prefs = json.loads(style_prefs)
            except Exception:
                _add_candidate(style_prefs)
                style_prefs = None
        if isinstance(style_prefs, dict):
            _add_candidate(style_prefs.get('brandDomain') or style_prefs.get('brand_domain') or '')
            brand_candidates = style_prefs.get('brandDomainCandidates') or style_prefs.get('brand_domain_candidates') or []
            if isinstance(brand_candidates, str):
                brand_candidates = [brand_candidates]
            for candidate in brand_candidates:
                _add_candidate(candidate)
            style_reference_links = style_prefs.get('referenceLinks') or style_prefs.get('reference_links') or []
            if isinstance(style_reference_links, str):
                style_reference_links = [style_reference_links]
            for link in style_reference_links or []:
                _add_candidate(link)

        _add_candidate(context.get('brandDomain') or context.get('brand_domain') or '')

    deduped = list(dict.fromkeys(urls_to_scrape))
    return deduped[:3]


async def scrape_reference_content(urls: List[str], include_videos: bool = True) -> ScrapePayload:
    if not urls:
        return ScrapePayload()

    events: List[Dict[str, Any]] = [
        {
            'type': 'status',
            'status': 'scraping',
            'message': f'Reading content from {urls[0]}...',
        }
    ]

    scrape_result = await scrape_reference_links(urls, include_videos=include_videos)
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

    safe_file_context = _sanitize_context_block(file_context)
    user_content = request.message + scraped_context + safe_file_context
    if request.context and request.context.get("force_outline"):
        user_content = (
            f"{user_content}\n\n[CLARIFICATION_ANSWERED]\n"
            "Use the provided answers to finalize the outline now. "
            "If a CURRENT OUTLINE is provided, update it instead of regenerating."
        )

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

    for match in re.finditer(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', full_response):
        try:
            data = json.loads(match.group(1))
            blocks.append({'data': data, 'end_index': match.end()})
        except Exception:
            continue

    if not blocks:
        tokens = [
            '"action"',
            '"generate_outline"',
            '"update_outline"',
            '"update_slides"',
            '"update_theme"',
            '"scrape_media"',
            '"clarify"',
        ]
        token_indices: List[int] = []
        for token in tokens:
            token_indices.extend([m.start() for m in re.finditer(re.escape(token), full_response)])
        for action_idx in sorted(set(token_indices)):
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
        for key in ('generate_outline', 'update_outline', 'update_slides', 'update_theme', 'scrape_media', 'clarify'):
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
            if action in ('update_theme', 'update_slides', 'update_outline', 'scrape_media', 'clarify'):
                return block
        return blocks[0]

    for block in blocks:
        action = _get_block_action(block)
        if action in ('generate_outline', 'clarify'):
            return block

    return blocks[0]


def normalize_action_payload(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    if 'action' in data and isinstance(data.get('action_input'), dict):
        normalized = dict(data['action_input'])
        normalized['action'] = data.get('action')
        return normalized
    if 'action' in data:
        return data
    for key in ('generate_outline', 'update_outline', 'update_slides', 'update_theme', 'scrape_media', 'clarify'):
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
