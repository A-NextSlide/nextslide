import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.outline.context_store import (
    extract_grounding_context_from_notes,
    merge_outline_context_into_notes,
)


def test_merge_outline_context_into_notes_persists_grounding_and_keeps_existing_notes():
    outline = {
        "id": "deck-1",
        "title": "Demo",
        "slides": [{"id": "s1", "title": "Slide 1", "content": "Hello"}],
        "scraped_context": "Website facts",
        "research_context": "Research facts",
        "reference_sources": [{"url": "https://example.com", "title": "Example"}],
        "research_citations": ["Example citation"],
        "notes": {"theme": {"name": "Corporate"}},
    }

    merge_outline_context_into_notes(
        outline,
        content_context="Extracted file content",
        file_context="File analysis summary",
        file_intent="use_content_only",
        user_notes="Please keep the tone technical and concise.",
    )

    notes = outline.get("notes") or {}
    assert notes.get("theme", {}).get("name") == "Corporate"
    assert notes.get("research_context") == "Research facts"
    assert notes.get("scraped_context") == "Website facts"
    assert notes.get("content_context") == "Extracted file content"
    assert notes.get("file_intent") == "use_content_only"
    assert notes.get("user_notes") == "Please keep the tone technical and concise."

    context_store = notes.get("context_store") or {}
    grounding = context_store.get("grounding") or {}
    assert context_store.get("version") == "v1"
    assert grounding.get("reference_sources")[0]["url"] == "https://example.com"
    assert grounding.get("research_citations")[0] == "Example citation"
    assert grounding.get("user_notes") == "Please keep the tone technical and concise."


def test_extract_grounding_context_from_nested_notes_store():
    notes = {
        "context_store": {
            "grounding": {
                "research_context": "Nested research",
                "content_context": "Nested source",
                "file_intent": "reference_only",
                "user_notes": "Use clear language for beginners.",
            }
        }
    }
    grounding = extract_grounding_context_from_notes(notes)
    assert grounding.get("research_context") == "Nested research"
    assert grounding.get("content_context") == "Nested source"
    assert grounding.get("file_intent") == "reference_only"
    assert grounding.get("user_notes") == "Use clear language for beginners."


def test_merge_outline_context_truncates_large_fields():
    very_long = "A" * 20000
    outline = {
        "id": "deck-2",
        "title": "Large",
        "slides": [{"id": "s1", "title": "Slide 1", "content": "Body"}],
        "research_context": very_long,
    }
    merge_outline_context_into_notes(outline)
    research = ((outline.get("notes") or {}).get("research_context") or "")
    assert len(research) < len(very_long)
    assert research.endswith("[TRUNCATED]")
