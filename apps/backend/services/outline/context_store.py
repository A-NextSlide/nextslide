"""Helpers for persisting and reading grounding context on outline.notes."""

from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional


CONTEXT_STORE_VERSION = "v1"

# Keep stored context bounded so notes remain useful without becoming unwieldy.
CONTEXT_TEXT_LIMITS = {
    "scraped_context": 12000,
    "research_context": 12000,
    "content_context": 18000,
    "file_context": 18000,
    "user_notes": 4000,
}

MAX_REFERENCE_SOURCES = 25
MAX_CITATIONS = 25
MAX_CITATION_CHARS = 600
MAX_INTENT_CHARS = 120

DATA_URL_PATTERN = re.compile(r"data:[^\s]+", re.IGNORECASE)


def _trim_text(value: Any, limit: int) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    text = DATA_URL_PATTERN.sub("[data omitted]", text)
    if len(text) <= limit:
        return text
    return text[:limit] + "\n[TRUNCATED]"


def _normalize_text_context(*values: Any, limit: int) -> str:
    parts: List[str] = []
    seen = set()
    for raw in values:
        text = str(raw or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        parts.append(text)
    if not parts:
        return ""
    return _trim_text("\n\n".join(parts), limit)


def _first_text(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _normalize_reference_sources(*candidates: Any) -> List[Dict[str, str]]:
    merged: List[Dict[str, str]] = []
    seen = set()
    for candidate in candidates:
        if not isinstance(candidate, list):
            continue
        for item in candidate:
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or item.get("source_url") or "").strip()
            title = str(item.get("title") or item.get("name") or "").strip()
            if not url and not title:
                continue
            key = (url.lower(), title.lower())
            if key in seen:
                continue
            seen.add(key)
            normalized: Dict[str, str] = {}
            if title:
                normalized["title"] = title[:300]
            if url:
                normalized["url"] = url[:1000]
            merged.append(normalized)
            if len(merged) >= MAX_REFERENCE_SOURCES:
                return merged
    return merged


def _normalize_citations(*candidates: Any) -> List[str]:
    merged: List[str] = []
    seen = set()
    for candidate in candidates:
        if not isinstance(candidate, list):
            continue
        for item in candidate:
            citation = str(item or "").strip()
            if not citation:
                continue
            key = citation.lower()
            if key in seen:
                continue
            seen.add(key)
            merged.append(citation[:MAX_CITATION_CHARS])
            if len(merged) >= MAX_CITATIONS:
                return merged
    return merged


def _get_notes_grounding(notes: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(notes, dict):
        return {}

    context_store = notes.get("context_store")
    grounding = {}
    if isinstance(context_store, dict):
        nested_grounding = context_store.get("grounding")
        if isinstance(nested_grounding, dict):
            grounding = nested_grounding

    return {
        "scraped_context": _first_text(
            notes.get("scraped_context"),
            notes.get("scrapedContext"),
            grounding.get("scraped_context"),
            grounding.get("scrapedContext"),
        ),
        "research_context": _first_text(
            notes.get("research_context"),
            notes.get("researchContext"),
            grounding.get("research_context"),
            grounding.get("researchContext"),
        ),
        "content_context": _first_text(
            notes.get("content_context"),
            notes.get("contentContext"),
            grounding.get("content_context"),
            grounding.get("contentContext"),
        ),
        "file_context": _first_text(
            notes.get("file_context"),
            notes.get("fileContext"),
            grounding.get("file_context"),
            grounding.get("fileContext"),
        ),
        "file_intent": _first_text(
            notes.get("file_intent"),
            notes.get("fileIntent"),
            grounding.get("file_intent"),
            grounding.get("fileIntent"),
        ),
        "reference_sources": _normalize_reference_sources(
            notes.get("reference_sources"),
            notes.get("referenceSources"),
            grounding.get("reference_sources"),
            grounding.get("referenceSources"),
        ),
        "research_citations": _normalize_citations(
            notes.get("research_citations"),
            notes.get("researchCitations"),
            grounding.get("research_citations"),
            grounding.get("researchCitations"),
        ),
        "user_notes": _first_text(
            notes.get("user_notes"),
            notes.get("userNotes"),
            grounding.get("user_notes"),
            grounding.get("userNotes"),
            context_store.get("user_notes") if isinstance(context_store, dict) else None,
            context_store.get("userNotes") if isinstance(context_store, dict) else None,
        ),
    }


def extract_grounding_context_from_notes(notes: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Read normalized grounding context from notes/context_store."""
    return _get_notes_grounding(notes)


def merge_outline_context_into_notes(
    outline_data: Dict[str, Any],
    *,
    scraped_context: Optional[str] = None,
    research_context: Optional[str] = None,
    reference_sources: Optional[List[Dict[str, Any]]] = None,
    research_citations: Optional[List[str]] = None,
    content_context: Optional[str] = None,
    file_context: Optional[str] = None,
    file_intent: Optional[str] = None,
    user_notes: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist grounding context in outline.notes + notes.context_store."""
    if not isinstance(outline_data, dict):
        return {}

    notes = outline_data.get("notes")
    if not isinstance(notes, dict):
        notes = {}

    existing = _get_notes_grounding(notes)

    merged_grounding = {
        "scraped_context": _normalize_text_context(
            scraped_context,
            outline_data.get("scraped_context"),
            outline_data.get("scrapedContext"),
            existing.get("scraped_context"),
            limit=CONTEXT_TEXT_LIMITS["scraped_context"],
        ),
        "research_context": _normalize_text_context(
            research_context,
            outline_data.get("research_context"),
            outline_data.get("researchContext"),
            existing.get("research_context"),
            limit=CONTEXT_TEXT_LIMITS["research_context"],
        ),
        "content_context": _normalize_text_context(
            content_context,
            outline_data.get("content_context"),
            outline_data.get("contentContext"),
            existing.get("content_context"),
            limit=CONTEXT_TEXT_LIMITS["content_context"],
        ),
        "file_context": _normalize_text_context(
            file_context,
            outline_data.get("file_context"),
            outline_data.get("fileContext"),
            existing.get("file_context"),
            limit=CONTEXT_TEXT_LIMITS["file_context"],
        ),
        "file_intent": _trim_text(
            _first_text(
                file_intent,
                outline_data.get("file_intent"),
                outline_data.get("fileIntent"),
                existing.get("file_intent"),
            ),
            MAX_INTENT_CHARS,
        ),
        "reference_sources": _normalize_reference_sources(
            reference_sources,
            outline_data.get("reference_sources"),
            outline_data.get("referenceSources"),
            existing.get("reference_sources"),
        ),
        "research_citations": _normalize_citations(
            research_citations,
            outline_data.get("research_citations"),
            outline_data.get("researchCitations"),
            existing.get("research_citations"),
        ),
        "user_notes": _normalize_text_context(
            user_notes,
            outline_data.get("user_notes"),
            outline_data.get("userNotes"),
            existing.get("user_notes"),
            limit=CONTEXT_TEXT_LIMITS["user_notes"],
        ),
    }

    for key in (
        "scraped_context",
        "research_context",
        "content_context",
        "file_context",
        "file_intent",
        "reference_sources",
        "research_citations",
        "user_notes",
    ):
        value = merged_grounding.get(key)
        if value:
            notes[key] = value

    context_store = notes.get("context_store")
    if not isinstance(context_store, dict):
        context_store = {}
    existing_nested = context_store.get("grounding")
    if not isinstance(existing_nested, dict):
        existing_nested = {}

    context_store["version"] = CONTEXT_STORE_VERSION
    context_store["updated_at"] = datetime.now(timezone.utc).isoformat()
    context_store["limits"] = CONTEXT_TEXT_LIMITS.copy()
    context_store["grounding"] = {**existing_nested, **{k: v for k, v in merged_grounding.items() if v}}
    notes["context_store"] = context_store

    outline_data["notes"] = notes
    return merged_grounding
