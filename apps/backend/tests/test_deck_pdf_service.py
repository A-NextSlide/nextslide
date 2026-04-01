"""Tests for Developer API screenshot-backed exports."""

import asyncio
import os
import sys
from io import BytesIO

from pypdf import PdfReader

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.deck_pdf_service import generate_deck_pdf, generate_slide_png
from services.webhook_service import WebhookPayload


_TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfeA\x0c\x1b\x0b\x00\x00\x00\x00IEND\xaeB`\x82"
)


async def _fake_renderer(
    deck_uuid: str,
    slide_data: dict,
    slide_size: dict,
    theme_data: dict | None,
    slide_index: int,
) -> bytes:
    return _TINY_PNG


async def _failing_renderer(
    deck_uuid: str,
    slide_data: dict,
    slide_size: dict,
    theme_data: dict | None,
    slide_index: int,
) -> bytes:
    raise RuntimeError("renderer unavailable")


def test_generate_deck_pdf_uses_screenshot_renderer():
    deck = {
        "uuid": "deck-123",
        "name": "Quarterly Business Review",
        "size": {"width": 1920, "height": 1080},
        "slides": [
            {"title": "Executive Summary", "components": []},
            {"title": "Operating Metrics", "components": []},
        ],
    }

    pdf_bytes = asyncio.run(generate_deck_pdf(deck, slide_renderer=_fake_renderer))

    assert pdf_bytes.startswith(b"%PDF")

    reader = PdfReader(BytesIO(pdf_bytes))
    assert len(reader.pages) == 2


def test_generate_deck_pdf_falls_back_to_legacy_layout():
    deck = {
        "name": "Quarterly Business Review",
        "size": {"width": 1920, "height": 1080},
        "slides": [
            {
                "title": "Executive Summary",
                "subtitle": "Q4 2026",
                "content": [
                    {"type": "bullet", "text": "Revenue grew 42% year over year"},
                    {"type": "bullet", "text": "Expanded into 3 new markets"},
                ],
                "components": [
                    {"type": "Background", "props": {"color": "#102030"}},
                ],
            },
        ],
    }

    pdf_bytes = asyncio.run(generate_deck_pdf(deck, slide_renderer=_failing_renderer))

    reader = PdfReader(BytesIO(pdf_bytes))
    extracted = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "Executive Summary" in extracted
    assert "Revenue grew 42% year over year" in extracted


def test_generate_slide_png_uses_renderer():
    deck = {
        "uuid": "deck-123",
        "name": "Quarterly Business Review",
        "size": {"width": 1920, "height": 1080},
        "slides": [
            {"title": "Executive Summary", "components": []},
        ],
    }

    png_bytes = asyncio.run(generate_slide_png(deck, slide_renderer=_fake_renderer))

    assert png_bytes == _TINY_PNG


def test_webhook_payload_serializes_outputs():
    payload = WebhookPayload(
        event="deck.completed",
        deck_id="deck-123",
        status="completed",
        view_url="https://nextslide.ai/p/demo",
        pdf_url="https://api.nextslide.ai/v1/decks/deck-123/pdf",
        outputs={
            "pdf": {"ready": True, "url": "https://api.nextslide.ai/v1/decks/deck-123/pdf"},
            "iframe": {"ready": True, "url": "https://nextslide.ai/embed/demo"},
        },
        slides_count=8,
    )

    data = payload.to_dict()

    assert data["pdf_url"] == "https://api.nextslide.ai/v1/decks/deck-123/pdf"
    assert data["outputs"]["iframe"]["url"] == "https://nextslide.ai/embed/demo"
    assert data["slides_count"] == 8
