"""
Deck composer - factory and convenience functions for deck generation.
"""
from typing import AsyncIterator, Dict, Any, Optional
from models.requests import DeckOutline
from models.registry import ComponentRegistry
from agents.config import MAX_PARALLEL_SLIDES, DELAY_BETWEEN_SLIDES, USE_MODAL
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


async def compose_deck_stream(
    deck_outline: DeckOutline,
    registry: ComponentRegistry,
    deck_uuid: str,
    max_parallel: int = MAX_PARALLEL_SLIDES,
    delay_between_slides: float = DELAY_BETWEEN_SLIDES,
    async_images: bool = True,
    prefetch_images: bool = False,
    enable_visual_analysis: bool = None,
    user_id: Optional[str] = None,
    temperature: Optional[float] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """
    Route deck composition to Modal (serverless) or local execution.

    When USE_MODAL is true, the heavy generation work runs in a dedicated
    Modal container while this Render instance just proxies the SSE stream.
    """
    if USE_MODAL:
        from services.modal_dispatch import compose_deck_stream_via_modal
        logger.info(f"[compose_deck_stream] Routing deck {deck_uuid} to Modal")
        async for event in compose_deck_stream_via_modal(
            deck_outline=deck_outline,
            registry=registry,
            deck_uuid=deck_uuid,
            max_parallel=max_parallel,
            delay_between_slides=delay_between_slides,
            async_images=async_images,
            prefetch_images=prefetch_images,
            enable_visual_analysis=enable_visual_analysis,
            user_id=user_id,
            temperature=temperature,
        ):
            yield event
    else:
        async for event in _compose_deck_stream_local(
            deck_outline=deck_outline,
            registry=registry,
            deck_uuid=deck_uuid,
            max_parallel=max_parallel,
            delay_between_slides=delay_between_slides,
            async_images=async_images,
            prefetch_images=prefetch_images,
            enable_visual_analysis=enable_visual_analysis,
            user_id=user_id,
            temperature=temperature,
        ):
            yield event


async def _compose_deck_stream_local(
    deck_outline: DeckOutline,
    registry: ComponentRegistry,
    deck_uuid: str,
    max_parallel: int = MAX_PARALLEL_SLIDES,
    delay_between_slides: float = DELAY_BETWEEN_SLIDES,
    async_images: bool = True,
    prefetch_images: bool = False,
    enable_visual_analysis: bool = None,
    user_id: Optional[str] = None,
    temperature: Optional[float] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """
    Stream deck composition locally using DeckComposerV2.
    """
    logger.info(f"[compose_deck_stream] deck={deck_uuid} slides={len(deck_outline.slides)} parallel={max_parallel} async_images={async_images}")

    composer = create_deck_composer(registry)

    # Override temperature on the CustomComponent generator if provided
    if temperature is not None:
        try:
            sg = composer.slide_generator
            base = getattr(sg, 'base_generator', sg)
            if hasattr(base, 'custom_component_generator'):
                base.custom_component_generator.temperature = temperature
                logger.info(f"[compose_deck_stream] Temperature override: {temperature}")
            if hasattr(base, 'custom_component_enhancer') and hasattr(base.custom_component_enhancer, 'generator'):
                base.custom_component_enhancer.generator.temperature = temperature
        except Exception as e:
            logger.warning(f"[compose_deck_stream] Could not set temperature: {e}")

    # Start AI image orchestrator to listen for slide.generated and apply images async
    _ai_orch = None
    try:
        from agents.generation.ai_image_orchestrator import AIImageOrchestrator
        from agents.persistence.deck_persistence import DeckPersistence
        _ai_orch = AIImageOrchestrator(DeckPersistence())
        _ai_orch.start()
    except Exception:
        pass  # Non-fatal; keep generation flowing

    try:
        async for update in composer.compose_deck(
            deck_outline=deck_outline,
            deck_uuid=deck_uuid,
            max_parallel=max_parallel,
            delay_between_slides=delay_between_slides,
            async_images=async_images,
            enable_visual_analysis=enable_visual_analysis,
            user_id=user_id
        ):
            yield update
    finally:
        # Always drain pending image tasks so the process/container can exit
        if _ai_orch:
            await _ai_orch.wait_and_stop()


def create_deck_composer(registry: ComponentRegistry):
    """Create deck composer using the refactored architecture."""
    from agents.generation.adapters import create_refactored_deck_composer
    return create_refactored_deck_composer(registry)


# Export for compatibility
SCHEMA_VERSION = "v3.0"
