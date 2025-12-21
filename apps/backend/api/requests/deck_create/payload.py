"""Deck payload assembly helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from agents.domain.models import SlideStatus
from models.deck import DeckBase
from models.requests import DeckOutline
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


def build_initial_deck_payload(
    deck_outline: DeckOutline,
    deck_uuid: str,
) -> Dict[str, Any]:
    initial_slides = [
        {
            "id": so.id,
            "title": so.title,
            "components": [],
            "status": SlideStatus.PENDING,
            "extractedData": so.extractedData.model_dump()
            if so.extractedData
            else None,
            "manualCharts": [c.model_dump() for c in so.manualCharts]
            if so.manualCharts
            else None,
        }
        for so in deck_outline.slides
    ]

    initial_deck_status = {
        "state": "creating",
        "currentSlide": 0,
        "totalSlides": len(deck_outline.slides),
        "message": "Deck structure created, preparing for composition.",
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "progress": 5,
        "phase": "initialization",
    }
    initial_deck = DeckBase(
        uuid=deck_uuid,
        name=deck_outline.title,
        slides=initial_slides,
        size={"width": 1920, "height": 1080},
        status=initial_deck_status,
    )

    deck_data_with_outline = initial_deck.model_dump()
    deck_data_with_outline["outline"] = deck_outline.model_dump()

    outline_dict = deck_outline.model_dump()
    if isinstance(outline_dict.get("notes"), dict) and outline_dict.get("notes"):
        deck_data_with_outline["notes"] = outline_dict["notes"]
        logger.info("Including narrative flow notes in deck creation")
        logger.info("Notes data: %s...", str(outline_dict["notes"])[:200])
    else:
        logger.warning("No notes found in outline.")

    try:
        provided_theme = None
        if isinstance(outline_dict.get("notes"), dict):
            provided_theme = outline_dict["notes"].get("theme") or outline_dict[
                "notes"
            ].get("Theme")
        if not provided_theme:
            style_prefs = getattr(deck_outline, "stylePreferences", None)
            if isinstance(style_prefs, dict):
                provided_theme = style_prefs.get("theme")
            elif style_prefs is not None:
                provided_theme = getattr(style_prefs, "theme", None)
        if isinstance(provided_theme, dict) and provided_theme:
            deck_data_with_outline["theme"] = provided_theme
            logger.info(
                "[DECK_CREATE] Embedded theme found in outline and will be persisted to deck data"
            )
            deck_data_with_outline.setdefault("data", {})
            if isinstance(deck_data_with_outline["data"], dict):
                deck_data_with_outline["data"]["theme"] = provided_theme
        else:
            logger.info("[DECK_CREATE] No embedded theme found in outline to persist")
    except Exception as exc:
        logger.warning(
            "[DECK_CREATE] Skipped embedded theme persistence due to error: %s",
            exc,
        )

    return deck_data_with_outline


def initialize_conversation_history(
    deck_data_with_outline: Dict[str, Any],
    deck_outline: DeckOutline,
) -> None:
    try:
        existing_history = getattr(deck_outline, "conversation_history", None)
        if isinstance(existing_history, dict) and existing_history:
            deck_data_with_outline["conversation_history"] = existing_history
            logger.info("[DECK_CREATE] Using provided conversation_history from outline")
            return

        initial_request = None
        style_prefs = getattr(deck_outline, "stylePreferences", None)
        if style_prefs is not None:
            if hasattr(style_prefs, "vibeContext") and style_prefs.vibeContext:
                initial_request = style_prefs.vibeContext
            elif isinstance(style_prefs, dict) and style_prefs.get("vibeContext"):
                initial_request = style_prefs.get("vibeContext")

        if not initial_request and deck_outline.title:
            initial_request = f"Create a presentation about: {deck_outline.title}"

        deck_data_with_outline["conversation_history"] = {
            "initial_request": initial_request,
            "messages": [],
        }
        logger.info(
            "[DECK_CREATE] Initialized conversation_history with initial_request: %s...",
            (initial_request or "None")[:100],
        )
    except Exception as exc:
        logger.warning(
            "[DECK_CREATE] Failed to initialize conversation_history: %s", exc
        )
        deck_data_with_outline["conversation_history"] = {
            "initial_request": None,
            "messages": [],
        }
