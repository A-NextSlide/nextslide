"""Narrative flow background task for deck creation."""

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
    async def generate_and_save_narrative_flow_background():
        logger.info("[NARRATIVE FLOW DEBUG] Function called for deck %s", deck_uuid)
        await asyncio.sleep(0.1)

        try:
            from services.narrative_flow_analyzer import NarrativeFlowAnalyzer

            flow_analyzer = NarrativeFlowAnalyzer()
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
                "[NARRATIVE FLOW] Generating narrative flow for %s slides...",
                len(analysis_outline["slides"]),
            )
            narrative_flow = await flow_analyzer.analyze_narrative_flow(
                analysis_outline, context=deck_outline.title
            )

            if narrative_flow:
                from utils.supabase import update_deck_notes

                for attempt in range(3):
                    success = update_deck_notes(
                        deck_uuid, narrative_flow.model_dump()
                    )
                    if success:
                        logger.info(
                            "[NARRATIVE FLOW] Successfully saved narrative flow for deck %s on attempt %s",
                            deck_uuid,
                            attempt + 1,
                        )
                        return narrative_flow
                    logger.warning(
                        "[NARRATIVE FLOW] Failed to save on attempt %s, retrying in 2 seconds...",
                        attempt + 1,
                    )
                    await asyncio.sleep(2)

                logger.error(
                    "[NARRATIVE FLOW] Failed to save after 3 attempts for deck %s",
                    deck_uuid,
                )
            else:
                logger.warning(
                    "[NARRATIVE FLOW] Generation returned None for deck %s",
                    deck_uuid,
                )
            return None
        except Exception as exc:
            logger.error(
                "[NARRATIVE FLOW] Failed to generate narrative flow for deck %s: %s",
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
                    "[NARRATIVE FLOW] Background task completed successfully for deck %s",
                    deck_uuid,
                )
            else:
                logger.warning(
                    "[NARRATIVE FLOW] Background task completed but returned None for deck %s",
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
        "[NARRATIVE FLOW] Background generation task started and tracked for deck %s",
        deck_uuid,
    )
