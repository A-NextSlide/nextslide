"""Narrative flow background task for deck creation.

Dispatches to Modal for serverless execution, falls back to local.
"""

from __future__ import annotations

import asyncio
from typing import Any

from models.requests import DeckOutline
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


def start_narrative_flow_task(
    deck_outline: DeckOutline,
    deck_uuid: str,
    background_tasks: Any,
) -> None:
    """Kick off narrative flow generation as a background asyncio task.

    Tries Modal first; falls back to local generation automatically.
    """

    async def generate_and_save_narrative_flow_background():
        logger.info("[NARRATIVE FLOW] Starting for deck %s", deck_uuid)
        # Small yield to let the caller continue
        await asyncio.sleep(0.1)

        analysis_outline = {
            "id": deck_outline.id,
            "title": deck_outline.title,
            "slides": [
                {
                    "id": slide.id,
                    "title": slide.title,
                    "content": slide.content,
                    "speaker_notes": getattr(slide, "speaker_notes", ""),
                }
                for slide in deck_outline.slides
            ],
        }

        logger.info(
            "[NARRATIVE FLOW] Generating for %s slides via Modal...",
            len(analysis_outline["slides"]),
        )

        try:
            from services.modal_dispatch import generate_narrative_flow_via_modal

            result = await generate_narrative_flow_via_modal(
                outline_dict=analysis_outline,
                deck_uuid=deck_uuid,
                context=deck_outline.title,
            )

            if result and result.get("success"):
                logger.info(
                    "[NARRATIVE FLOW] Successfully generated and saved for deck %s",
                    deck_uuid,
                )
                return result.get("narrative_flow")

            error_msg = result.get("error", "Unknown") if result else "None returned"
            logger.warning(
                "[NARRATIVE FLOW] Modal dispatch returned error for deck %s: %s",
                deck_uuid,
                error_msg,
            )
            return None

        except Exception as exc:
            logger.error(
                "[NARRATIVE FLOW] Failed for deck %s: %s",
                deck_uuid,
                exc,
                exc_info=True,
            )
            return None

    task = asyncio.create_task(generate_and_save_narrative_flow_background())
    background_tasks.add(task)

    def task_done_callback(done_task):
        try:
            result = done_task.result()
            if result:
                logger.info(
                    "[NARRATIVE FLOW] Background task completed for deck %s",
                    deck_uuid,
                )
            else:
                logger.warning(
                    "[NARRATIVE FLOW] Background task returned None for deck %s",
                    deck_uuid,
                )
        except Exception as exc:
            logger.error(
                "[NARRATIVE FLOW] Background task failed for deck %s: %s",
                deck_uuid,
                exc,
            )

    task.add_done_callback(task_done_callback)
    logger.info(
        "[NARRATIVE FLOW] Background task dispatched for deck %s",
        deck_uuid,
    )
