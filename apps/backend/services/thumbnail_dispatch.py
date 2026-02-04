"""
Dispatch layer for thumbnail rendering via Modal serverless containers.

Follows the same pattern as modal_dispatch.py — tries Modal first,
falls back to local Playwright rendering on failure, and silently
skips if both fail (the frontend will use client-side rendering).
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def render_thumbnail_via_modal(
    deck_uuid: str,
    slide_data: dict,
    slide_size: Optional[dict] = None,
    theme_data: Optional[dict] = None,
    slide_index: int = 0,
) -> Optional[dict]:
    """
    Render a slide thumbnail via Modal, falling back to local Playwright.

    Returns {"url": "...", "path": "..."} on success, None on failure.
    """
    try:
        import modal

        render_fn = modal.Function.from_name("nextslide", "render_slide_thumbnail_remote")

        logger.info("[thumbnail_dispatch] Dispatching thumbnail for deck %s to Modal", deck_uuid)

        result = await render_fn.remote.aio(
            deck_uuid=deck_uuid,
            slide_data=slide_data,
            slide_size=slide_size or {},
            theme_data=theme_data,
            slide_index=slide_index,
        )

        logger.info("[thumbnail_dispatch] Modal thumbnail OK for deck %s", deck_uuid)
        return result

    except Exception as exc:
        if isinstance(exc, ModuleNotFoundError):
            logger.debug("[thumbnail_dispatch] modal not installed, falling back to local")
        else:
            logger.warning("[thumbnail_dispatch] Modal failed for deck %s, falling back to local: %s", deck_uuid, exc)

        # Local fallback
        try:
            from services.thumbnail_renderer import render_and_upload_thumbnail

            result = await render_and_upload_thumbnail(
                deck_uuid=deck_uuid,
                slide_data=slide_data,
                slide_size=slide_size,
                theme_data=theme_data,
                slide_index=slide_index,
            )
            logger.info("[thumbnail_dispatch] Local thumbnail OK for deck %s", deck_uuid)
            return result
        except Exception as local_exc:
            # Playwright may not be installed on the server — this is expected
            logger.warning("[thumbnail_dispatch] Local fallback also failed for deck %s: %s", deck_uuid, local_exc)
            return None


async def trigger_thumbnail_render(deck_uuid: str) -> None:
    """
    Fetch deck from Supabase and trigger thumbnail rendering for all slides.

    Designed to be called as a fire-and-forget background task.
    Silently swallows all errors so it never breaks the main request flow.
    """
    try:
        from services.supabase import get_supabase_client

        supabase = get_supabase_client()
        result = supabase.table("decks").select(
            "uuid, slides, size, data"
        ).eq("uuid", deck_uuid).execute()

        if not result.data:
            logger.warning("[thumbnail_dispatch] Deck %s not found for thumbnail render", deck_uuid)
            return

        deck = result.data[0]
        slides = deck.get("slides") or []
        if not slides:
            logger.debug("[thumbnail_dispatch] Deck %s has no slides, skipping thumbnail", deck_uuid)
            return

        slide_size = deck.get("size")
        # Theme data may be embedded in the deck's data field
        deck_data = deck.get("data") or {}
        theme_data = deck_data.get("theme")

        for slide_index, slide_data in enumerate(slides):
            try:
                await render_thumbnail_via_modal(
                    deck_uuid=deck_uuid,
                    slide_data=slide_data,
                    slide_size=slide_size,
                    theme_data=theme_data,
                    slide_index=slide_index,
                )
            except Exception as slide_exc:
                logger.warning(
                    "[thumbnail_dispatch] Failed to render slide %d for deck %s: %s",
                    slide_index, deck_uuid, slide_exc,
                )

    except Exception as exc:
        logger.error("[thumbnail_dispatch] trigger_thumbnail_render failed for %s: %s", deck_uuid, exc)
