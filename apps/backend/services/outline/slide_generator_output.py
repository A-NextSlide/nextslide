"""Helpers for normalizing slide outputs."""

from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from setup_logging_optimized import get_logger

from .generator_utils import extract_image_prompt_from_content
from .models import SlideContent
from .slide_generator_utils import extract_citations_from_content

logger = get_logger(__name__)

SLIDE_HEADER_RE = re.compile(r'^Slide\s+\d+:\s*[^\n]+\n*', re.IGNORECASE)
SPEAKER_NOTES_RE = re.compile(
    r'[\s\n]*---[\s\n]*(?:SPEAKABLE CONTENT|SPEAKER NOTES?|SPEAKING NOTES?):[\s\S]*?(?=\n---|$)',
    re.IGNORECASE,
)
CITATIONS_SECTION_RE = re.compile(r'[\s\n]*---[\s\n]*CITATIONS?:[\s\S]*$', re.IGNORECASE)


class SlideGeneratorOutputMixin:
    """Shared post-processing for slide content."""

    def _resolve_citations(
        self,
        content: str,
        context: Optional[Dict[str, Any]],
        slide_title: str,
        log_prefix: str = "SLIDE",
    ) -> List[Dict[str, Any]]:
        citations = context.get('web_citations') if isinstance(context, dict) else None
        if not citations:
            extracted, _ = extract_citations_from_content(content)
            if extracted:
                citations = extracted
                logger.info(
                    "[%s] Extracted %s citations from content for '%s'",
                    log_prefix,
                    len(extracted),
                    slide_title,
                )
        return citations or []

    def _build_footnotes(
        self,
        citations: List[Any],
        slide_title: str,
        log_prefix: str = "SLIDE",
    ) -> List[Dict[str, Any]]:
        footnotes: List[Dict[str, Any]] = []
        if not citations:
            return footnotes

        for i, citation in enumerate(citations):
            if isinstance(citation, dict):
                footnotes.append({
                    "index": i + 1,
                    "label": citation.get("title", citation.get("source", "Unknown Source")),
                    "url": citation.get("url", ""),
                })
            elif isinstance(citation, str):
                footnotes.append({
                    "index": i + 1,
                    "label": citation,
                    "url": "",
                })

        if footnotes:
            logger.info(
                "[%s] Created %s footnotes for '%s'",
                log_prefix,
                len(footnotes),
                slide_title,
            )
        return footnotes

    def _strip_metadata_sections(self, content: str) -> str:
        cleaned = SLIDE_HEADER_RE.sub('', content)
        cleaned = SPEAKER_NOTES_RE.sub('', cleaned)
        cleaned = CITATIONS_SECTION_RE.sub('', cleaned)
        return cleaned.strip()

    def _clean_content_and_image_prompt(self, content: str) -> Tuple[str, Optional[str]]:
        cleaned_content, image_prompt = extract_image_prompt_from_content(content)
        cleaned_content = self._strip_metadata_sections(cleaned_content)
        return cleaned_content, image_prompt

    def _build_slide_content(
        self,
        slide_title: str,
        slide_type: str,
        content: str,
        *,
        extracted_data: Optional[Dict[str, Any]] = None,
        citations: Optional[List[Dict[str, Any]]] = None,
        footnotes: Optional[List[Dict[str, Any]]] = None,
        comparison: Optional[Dict[str, Any]] = None,
        suggested_image_prompt: Optional[str] = None,
    ) -> SlideContent:
        return SlideContent(
            id=str(uuid.uuid4()),
            title=slide_title,
            content=content,
            slide_type=slide_type,
            extractedData=extracted_data,
            citations=citations or [],
            footnotes=footnotes or [],
            research_notes="Citations available" if citations else None,
            comparison=comparison,
            suggestedImagePrompt=suggested_image_prompt,
        )

    def _build_annotations_payload(
        self,
        slide_title: str,
        citations: List[Dict[str, Any]],
        footnotes: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if not citations:
            return None
        return {
            "chartType": "annotations",
            "title": slide_title,
            "data": [],
            "metadata": {"citations": citations, "footnotes": footnotes},
            "source": "Research citations",
        }
