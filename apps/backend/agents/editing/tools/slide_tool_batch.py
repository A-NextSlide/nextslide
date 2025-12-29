"""Batch slide editing tools."""

from typing import Any, Dict, List
import concurrent.futures
import logging
import time

from models.deck import DeckDiff, DeckDiffBase
from models.registry import ComponentRegistry
from agents.editing.tools.slide_tool_custom_components import _targeted_custom_component_edit
from agents.editing.tools.struct_utils import get_attr as _get_attr

logger = logging.getLogger(__name__)


def edit_all_slides(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    event_cb: callable = None,
) -> DeckDiff:
    """
    Apply the same edit instruction to ALL slides in the deck IN PARALLEL.

    ONLY use when user explicitly mentions "all slides", "every slide", "across the deck", etc.

    This iterates through all slides and applies custom_component_str_replace to each.
    Useful for:
    - "Make all text larger across all slides"
    - "Change the font on every slide"
    - "Update the footer on all slides"
    - "Make all titles blue across the deck"

    Args:
        args: { "instruction": str } - The edit to apply to all slides

    Returns:
        DeckDiff with updates for all slides
    """
    instruction = args.get("instruction", "")
    if not instruction:
        raise ValueError("edit_all_slides requires an 'instruction' argument")

    slides = _get_attr(deck_data, "slides", []) or []
    if not slides:
        logger.warning("[edit_all_slides] No slides found in deck")
        return DeckDiff(DeckDiffBase())

    logger.info(f"[edit_all_slides] Applying '{instruction[:50]}...' to {len(slides)} slides IN PARALLEL")

    # Import SlideDiffBase for creating slide diffs
    from models.slide import SlideDiffBase

    # Prepare slides that have CustomComponents
    slides_to_process = []
    for i, slide in enumerate(slides):
        slide_id = _get_attr(slide, "id")
        if not slide_id:
            continue

        components = _get_attr(slide, "components", []) or []

        # Find CustomComponent on this slide
        custom_comp = next(
            (c for c in components if _get_attr(c, "type") == "CustomComponent"),
            None
        )

        if not custom_comp:
            logger.debug(f"[edit_all_slides] Slide {slide_id} has no CustomComponent, skipping")
            continue

        props = _get_attr(custom_comp, "props", {}) or {}
        if isinstance(props, dict):
            current_html = props.get("render", "")
        else:
            current_html = getattr(props, "render", "")

        if not current_html:
            logger.debug(f"[edit_all_slides] Slide {slide_id} CustomComponent has no HTML, skipping")
            continue

        slides_to_process.append((i, slide_id, custom_comp))

    logger.info(f"[edit_all_slides] Processing {len(slides_to_process)} slides with CustomComponents")

    def process_single_slide(args_tuple):
        """Process a single slide - called in parallel."""
        idx, slide_id, custom_comp = args_tuple
        start_time = time.time()
        logger.info(f"[edit_all_slides] 🚀 STARTING slide {idx+1}/{len(slides_to_process)}: {slide_id}")
        try:
            # Call the targeted edit function which handles AI replacement
            # Use slide_edit_batch task for Gemini 3 Pro (heavier operation)
            slide_diff = _targeted_custom_component_edit(
                slide_id=slide_id,
                custom_component=custom_comp,
                instruction=instruction,
                deck_data=deck_data,
                attachments=None,  # No per-slide attachments for batch edits
                task="slide_edit_batch",
            )

            elapsed = time.time() - start_time
            # Extract the component update from the returned DeckDiff
            if slide_diff and hasattr(slide_diff, 'deck_diff'):
                inner = slide_diff.deck_diff
                if hasattr(inner, 'slides_to_update') and inner.slides_to_update:
                    logger.info(
                        f"[edit_all_slides] ✅ FINISHED slide {idx+1}/{len(slides_to_process)}: "
                        f"{slide_id} ({elapsed:.1f}s)"
                    )
                    return inner.slides_to_update
            logger.info(f"[edit_all_slides] ⚠️ No updates for slide {slide_id} ({elapsed:.1f}s)")
            return []
        except Exception as e:
            elapsed = time.time() - start_time
            logger.warning(f"[edit_all_slides] ❌ FAILED slide {slide_id} ({elapsed:.1f}s): {e}")
            return []

    # Process all slides in parallel using ThreadPoolExecutor
    # All slides start at once - no cap on workers
    batch_start = time.time()
    all_slides_to_update = []
    max_workers = len(slides_to_process)  # All slides at once

    logger.info(
        f"[edit_all_slides] 🏁 Starting parallel processing with {max_workers} workers for {len(slides_to_process)} slides"
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_slide = {
            executor.submit(process_single_slide, args_tuple): args_tuple
            for args_tuple in slides_to_process
        }

        # Collect results as they complete
        for future in concurrent.futures.as_completed(future_to_slide):
            slide_updates = future.result()
            if slide_updates:
                all_slides_to_update.extend(slide_updates)

    batch_elapsed = time.time() - batch_start
    logger.info(
        f"[edit_all_slides] 🏆 BATCH COMPLETE: {len(all_slides_to_update)}/{len(slides)} slides updated in {batch_elapsed:.1f}s total"
    )

    return DeckDiff(DeckDiffBase(slides_to_update=all_slides_to_update))
