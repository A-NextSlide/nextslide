"""Mechanical slide operations (no AI)."""

from typing import Any, Dict, List
import uuid

from models.deck import DeckDiff, DeckDiffBase
from models.registry import ComponentRegistry
from agents.editing.tools.struct_utils import get_attr as _get_attr


def delete_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Delete a slide from the deck.

    Args:
        args: { "slide_id": str }
    """
    slide_id = args.get('slide_id')

    if not slide_id:
        raise ValueError("slide_id is required")

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.remove_slide(slide_id)

    return deck_diff


def duplicate_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Duplicate an existing slide (mechanical, no AI).
    Args: {"slide_id": str, "insert_after": optional str}
    """
    import copy

    slide_id = args.get("slide_id") or _get_attr(current_slide, "id")
    insert_after = args.get("insert_after")
    slides = (deck_data or {}).get("slides") or []

    original = next((s for s in slides if isinstance(s, dict) and s.get("id") == slide_id), None)
    if not original:
        # Fall back to current_slide snapshot
        original = current_slide if isinstance(current_slide, dict) else None
    if not original:
        raise ValueError(f"Slide {slide_id} not found")

    new_slide = copy.deepcopy(original)
    new_slide["id"] = str(uuid.uuid4())
    # New component IDs
    for c in (new_slide.get("components") or []):
        if isinstance(c, dict):
            c["id"] = str(uuid.uuid4())

    # Add as slide_to_add; ordering handled by slide_order if desired later
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.deck_diff.slides_to_add.append(new_slide)

    # If insert_after provided, produce a new slide_order (optional)
    if insert_after:
        try:
            ids = [s.get("id") for s in slides if isinstance(s, dict) and s.get("id")]
            if insert_after in ids:
                idx = ids.index(insert_after) + 1
                ids.insert(idx, new_slide["id"])
                deck_diff.deck_diff.slide_order = ids
        except Exception:
            pass

    return deck_diff


def reorder_slides(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Reorder slides by producing deck_diff.slide_order, applied by agent_apply.apply_deckdiff.
    Args:
      - {"slide_id": str, "new_index": int}
      - OR {"slide_order": [slide_id,...]} (full order)
    """
    slides = (deck_data or {}).get("slides") or []
    ids = [s.get("id") for s in slides if isinstance(s, dict) and s.get("id")]

    order = args.get("slide_order")
    if isinstance(order, list) and order:
        # Trust provided order; append any missing to preserve
        mentioned = [sid for sid in order if sid in ids]
        tail = [sid for sid in ids if sid not in set(mentioned)]
        final = mentioned + tail
    else:
        sid = args.get("slide_id")
        new_index = args.get("new_index")
        if sid not in ids:
            raise ValueError("slide_id not found in deck")
        if not isinstance(new_index, int):
            raise ValueError("new_index must be an integer")
        ids.remove(sid)
        # clamp
        if new_index < 0:
            new_index = 0
        if new_index > len(ids):
            new_index = len(ids)
        ids.insert(new_index, sid)
        final = ids

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.deck_diff.slide_order = final
    return deck_diff
