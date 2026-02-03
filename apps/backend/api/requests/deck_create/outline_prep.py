"""Outline preparation helpers for deck creation."""

from __future__ import annotations

import uuid
from datetime import datetime
import re
from typing import Any, Dict, Optional, List

from models.requests import DeckOutline
from services.outline.media_manager import MediaManager
from services.outline.models import SlideContent
from services.outline.chart_normalization import normalize_slide_chart_fields
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

TITLE_MAX_WORDS = 8  # Reduced from 12 for punchier titles
TITLE_MAX_CHARS = 50  # Reduced from 70 for shorter titles
TITLE_PREFIX_PATTERNS = (
    # Standard verbose prefixes
    re.compile(
        r"^(?:a|an|the)\s+(?:comprehensive|detailed|in[- ]depth|deep|full|complete|thorough|extensive)\s+"
        r"(?:analysis|overview|review|assessment|summary|report|study|brief)\s+(?:of|on)\s+",
        re.IGNORECASE,
    ),
    re.compile(
        r"^(?:an?\s+)?(?:analysis|overview|review|assessment|summary|report|study|brief)\s+(?:of|on)\s+",
        re.IGNORECASE,
    ),
    re.compile(r"^(?:a|an|the)\s+(?:deep|detailed|full)\s+dive\s+into\s+", re.IGNORECASE),
    re.compile(r"^(?:exploring|examining|understanding|mapping|investigating|evaluating)\s+", re.IGNORECASE),
    # New patterns for "slideshow/presentation" prefixes
    re.compile(
        r"^(?:a|an|the)\s+(?:lyric|visual|interactive|dynamic|custom|detailed|comprehensive)?\s*"
        r"(?:slideshow|presentation|deck|slides?)\s+(?:about|on|for|visualizing|showcasing|featuring|covering)\s+",
        re.IGNORECASE,
    ),
    # Pattern for "today's/current/latest X based on..."
    re.compile(
        r"^(?:today'?s?|current|latest|recent)\s+(?:most\s+)?(?:viewed|popular|trending|top)\s+",
        re.IGNORECASE,
    ),
    # Pattern for trailing "based on real-time/current data"
    re.compile(
        r"\s+based\s+on\s+(?:real[- ]?time|current|live|latest)\s+(?:data|analytics|metrics|statistics)\.?$",
        re.IGNORECASE,
    ),
    # Generic "A/An/The [adjective] [noun] about/of/on"
    re.compile(
        r"^(?:a|an|the)\s+\w+\s+(?:about|of|on|for|regarding|concerning)\s+",
        re.IGNORECASE,
    ),
)
TITLE_SPLIT_SEPARATORS = (":", " - ", " \u2014 ", " \u2013 ", " | ", ";")


def normalize_deck_title(value: Optional[str]) -> str:
    """Clean up whitespace/quotes only — let the AI title through as-is."""
    if not value or not str(value).strip():
        return value or ""
    return " ".join(str(value).split()).strip().strip('"').strip("'")


def _sync_first_slide_title(deck_outline: DeckOutline, original_title: str, normalized_title: str) -> None:
    if not deck_outline.slides or not normalized_title:
        return
    first_slide = deck_outline.slides[0]
    slide_title = (getattr(first_slide, "title", "") or "").strip()
    if slide_title and slide_title == original_title:
        first_slide.title = normalized_title


def merge_style_preferences_into_outline(
    outline_dict: Dict[str, Any],
    request_style: Optional[Dict[str, Any]],
) -> None:
    if not request_style:
        return
    if "stylePreferences" not in outline_dict:
        outline_dict["stylePreferences"] = request_style
        return

    outline_style = outline_dict.get("stylePreferences") or {}

    def is_missing_style_value(key: str, value: Any) -> bool:
        if value is None:
            return True
        if key in ("autoSelectImages",):
            return False
        if isinstance(value, (str, list, dict)) and len(value) == 0:
            return True
        return False

    def merge_if_missing(key: str) -> None:
        incoming = request_style.get(key)
        if incoming is None:
            return
        if key not in outline_style or is_missing_style_value(
            key, outline_style.get(key)
        ):
            outline_style[key] = incoming

    for style_key in (
        "initialIdea",
        "vibeContext",
        "font",
        "bodyFont",
        "colors",
        "brandName",
        "brandDomain",
        "brandDomainCandidates",
        "needsBrandDomainConfirmation",
        "autoSelectImages",
        "slideMode",
        "referenceImages",
        "referenceLinks",
        "enableResearch",
    ):
        merge_if_missing(style_key)

    if request_style.get("logoUrl") and not outline_style.get("logoUrl"):
        outline_style["logoUrl"] = request_style["logoUrl"]
        logger.info(
            "[DECK_CREATE] Merged logoUrl from request into outline: %s...",
            request_style["logoUrl"][:60],
        )
    if request_style.get("logoUrlDark") and not outline_style.get("logoUrlDark"):
        outline_style["logoUrlDark"] = request_style["logoUrlDark"]
    if request_style.get("deck_theme") and not outline_style.get("deck_theme"):
        outline_style["deck_theme"] = request_style["deck_theme"]
        logger.info("[DECK_CREATE] Merged deck_theme from request into outline")

    outline_dict["stylePreferences"] = outline_style


def prepare_outline_dict(
    outline_dict: Dict[str, Any],
    request_style: Optional[Dict[str, Any]],
) -> tuple[str, Dict[str, Any]]:
    if "id" not in outline_dict or not outline_dict["id"]:
        logger.error(
            "[UUID_FIX] ERROR: Outline is missing 'id' field! This should never happen."
        )
        raise ValueError(
            "Outline must have an 'id' field. This ID should be generated when the outline is created."
        )

    deck_uuid = outline_dict["id"]
    logger.info("[UUID_FIX] Using outline.id as deck UUID: %s", deck_uuid)

    if "title" not in outline_dict:
        outline_dict["title"] = "Untitled Presentation"

    merge_style_preferences_into_outline(outline_dict, request_style)

    outline_dict["slides"] = [
        slide
        for slide in outline_dict.get("slides", [])
        if not slide.get("is_upgrade_slide") and slide.get("type") != "upgrade_paywall"
    ]

    for i, slide in enumerate(outline_dict.get("slides", [])):
        if "id" not in slide:
            slide["id"] = f"slide-{deck_uuid}-{i}"
        slide.setdefault("title", f"Slide {i + 1}")
        # Fix SLIDE-BACKEND-1M: LLM sometimes returns content as a list instead of string
        content_val = slide.get("content")
        if isinstance(content_val, list):
            # Join list items into a single string with newlines
            slide["content"] = "\n".join(str(item) for item in content_val if item)
        elif content_val is None:
            slide["content"] = ""
        slide.setdefault("content", "")
        slide.setdefault("uploadedMedia", None)
        slide.setdefault("extractedData", None)
        slide.setdefault("manualCharts", None)
        slide.setdefault("speaker_notes", "")
        slide.setdefault("media_items", [])
        normalize_slide_chart_fields(slide)

    return deck_uuid, outline_dict


def attach_uploaded_media_to_slides(outline_dict: Dict[str, Any]) -> None:
    uploaded_media = outline_dict.get("uploadedMedia", [])
    if not uploaded_media:
        return

    if not outline_dict.get("use_uploaded_images"):
        logger.info("[DECK_CREATE] uploadedMedia present but not marked for use; skipping auto-attach")
        return

    def build_tagged_item(media: Dict[str, Any]) -> Dict[str, Any]:
        mime_type = media.get("type", "image/png")
        content_b64 = media.get("content", "")

        preview_url = media.get("url") or media.get("previewUrl")
        if not preview_url and content_b64:
            preview_url = f"data:{mime_type};base64,{content_b64}"

        return {
            "id": media.get("id", str(uuid.uuid4())),
            "filename": media.get("name", media.get("filename", "uploaded_file")),
            "type": "image" if mime_type.startswith("image/") else "other",
            "content": content_b64,
            "previewUrl": preview_url,
            "interpretation": media.get("interpretation"),
            "status": "processed",
            "metadata": media.get("metadata") or {"source": "user_upload", "originalType": mime_type},
        }

    logger.info(
        "[DECK_CREATE] Found %s uploadedMedia items at outline level",
        len(uploaded_media),
    )
    for i, slide in enumerate(outline_dict.get("slides", [])):
        existing = slide.get("taggedMedia") or []
        if existing:
            continue
        slide["taggedMedia"] = []

        for media in uploaded_media:
            if not isinstance(media, dict):
                continue
            slide["taggedMedia"].append(build_tagged_item(media))

        logger.info(
            "[DECK_CREATE] Slide %s now has %s taggedMedia items",
            i + 1,
            len(slide["taggedMedia"]),
        )


async def assign_uploaded_media_to_slides_with_ai(deck_outline: DeckOutline) -> bool:
    if not deck_outline.use_uploaded_images or not deck_outline.uploadedMedia:
        return False

    target_slides = [slide for slide in deck_outline.slides if not slide.taggedMedia]
    if not target_slides:
        return False

    images: List[Dict[str, Any]] = []
    for media in deck_outline.uploadedMedia:
        media_dict = media.model_dump() if hasattr(media, "model_dump") else media
        if not isinstance(media_dict, dict):
            continue
        media_type = str(media_dict.get("type") or "")
        if media_type and not media_type.startswith("image"):
            continue

        preview_url = media_dict.get("previewUrl") or media_dict.get("url")
        if not preview_url and media_dict.get("content"):
            mime_type = media_type if media_type.startswith("image/") else "image/png"
            preview_url = f"data:{mime_type};base64,{media_dict.get('content')}"
        if not preview_url:
            continue

        filename = media_dict.get("filename") or media_dict.get("name") or "uploaded_image"
        interpretation = media_dict.get("interpretation") or filename
        images.append({
            "filename": filename,
            "category": "slide_image",
            "interpretation": interpretation,
            "url": preview_url,
        })

    if not images:
        return False

    slides = []
    for slide in target_slides:
        slides.append(SlideContent(
            id=slide.id,
            title=slide.title,
            content=slide.content or "",
            slide_type=getattr(slide, "slide_type", "content"),
        ))

    manager = MediaManager()
    await manager.assign_media_to_slides_with_ai(slides, {"images": images})

    assigned = False
    slide_map = {slide.id: slide for slide in target_slides}
    for slide in slides:
        if slide.taggedMedia:
            slide_map[slide.id].taggedMedia = slide.taggedMedia
            assigned = True

    return assigned


def broadcast_uploaded_media_to_slide_models(deck_outline: DeckOutline) -> None:
    if not deck_outline.use_uploaded_images or not deck_outline.uploadedMedia:
        return

    for slide in deck_outline.slides:
        if slide.taggedMedia:
            continue
        slide.taggedMedia = []
        for media in deck_outline.uploadedMedia:
            media_dict = media.model_dump() if hasattr(media, "model_dump") else media
            if not isinstance(media_dict, dict):
                continue
            mime_type = media_dict.get("type", "image/png")
            content_b64 = media_dict.get("content", "")
            preview_url = media_dict.get("previewUrl") or media_dict.get("url")
            if not preview_url and content_b64:
                preview_url = f"data:{mime_type};base64,{content_b64}"

            slide.taggedMedia.append({
                "id": media_dict.get("id", str(uuid.uuid4())),
                "filename": media_dict.get("filename") or media_dict.get("name") or "uploaded_file",
                "type": "image" if str(mime_type).startswith("image/") else "other",
                "content": content_b64,
                "previewUrl": preview_url,
                "interpretation": media_dict.get("interpretation"),
                "status": "processed",
                "metadata": media_dict.get("metadata") or {"source": "user_upload", "originalType": mime_type},
            })


def ensure_deck_title(deck_outline: DeckOutline) -> None:
    logger.info("[DECK_TITLE_DEBUG] Title from outline: '%s'", deck_outline.title)

    # Always prefer the first slide's title as the deck name — it reflects
    # the actual outline heading the user approved, not the AI-generated
    # meta-description (e.g. "A comprehensive sales deck for …").
    if deck_outline.slides:
        first_slide_title = (deck_outline.slides[0].title or "").strip()
        if first_slide_title and first_slide_title != "Untitled Slide":
            normalized = normalize_deck_title(first_slide_title)
            logger.info(
                "[DECK_TITLE_DEBUG] Using first slide title as deck name: '%s'",
                normalized,
            )
            deck_outline.title = normalized
            return

    # Fallback: use the outline-level title if no usable first slide title
    original_title = (deck_outline.title or "").strip()
    if original_title and original_title != "Untitled Deck":
        normalized = normalize_deck_title(original_title)
        if normalized and normalized != original_title:
            deck_outline.title = normalized
            _sync_first_slide_title(deck_outline, original_title, normalized)
        return

    logger.warning(
        "[DECK_TITLE_DEBUG] Deck is using default/empty title: '%s'",
        deck_outline.title,
    )

    new_title = None
    if getattr(deck_outline, "stylePreferences", None):
        vibe = getattr(deck_outline.stylePreferences, "vibeContext", None)
        if vibe:
            new_title = (
                f"{vibe[:50].rsplit(' ', 1)[0]}..." if len(vibe) > 50 else vibe
            )
            logger.info("[DECK_TITLE_DEBUG] Using vibe context as title: '%s'", new_title)

    if not new_title:
        new_title = f"Presentation {datetime.now().strftime('%B %d, %Y')}"
        logger.info("[DECK_TITLE_DEBUG] Using date-based title: '%s'", new_title)

    normalized = normalize_deck_title(new_title) or new_title
    deck_outline.title = normalized
    _sync_first_slide_title(deck_outline, new_title, normalized)


def log_tagged_media_summary(deck_outline: DeckOutline) -> None:
    logger.info("[DECK_CREATE] Parsed deck outline: %s", deck_outline.title)
    for i, slide in enumerate(deck_outline.slides):
        tm_count = len(slide.taggedMedia) if slide.taggedMedia else 0
        logger.info(
            "[DECK_CREATE] Slide %s '%s' has %s taggedMedia items",
            i + 1,
            slide.title,
            tm_count,
        )
        if tm_count > 0 and slide.taggedMedia:
            for j, media in enumerate(slide.taggedMedia[:2]):
                media_dict = (
                    media.model_dump() if hasattr(media, "model_dump") else media
                )
                logger.info(
                    "[DECK_CREATE]   Media %s: %s - URL: %s",
                    j + 1,
                    media_dict.get("filename", "unknown"),
                    (media_dict.get("previewUrl", "none") or "")[:100],
                )
