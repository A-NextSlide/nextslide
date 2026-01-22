"""Deck creation helpers."""

from .outline_prep import (
    merge_style_preferences_into_outline,
    prepare_outline_dict,
    attach_uploaded_media_to_slides,
    assign_uploaded_media_to_slides_with_ai,
    broadcast_uploaded_media_to_slide_models,
    ensure_deck_title,
    log_tagged_media_summary,
)
from .payload import (
    build_initial_deck_payload,
    initialize_conversation_history,
    add_locked_slide_info_if_needed,
)
from .narrative_flow import start_narrative_flow_task

__all__ = [
    "merge_style_preferences_into_outline",
    "prepare_outline_dict",
    "attach_uploaded_media_to_slides",
    "assign_uploaded_media_to_slides_with_ai",
    "broadcast_uploaded_media_to_slide_models",
    "ensure_deck_title",
    "log_tagged_media_summary",
    "build_initial_deck_payload",
    "initialize_conversation_history",
    "start_narrative_flow_task",
    "add_locked_slide_info_if_needed",
]
