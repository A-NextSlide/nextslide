"""
Deck composer - factory and convenience functions for deck generation.
"""
from typing import AsyncIterator, Dict, Any, Optional
from models.requests import DeckOutline
from models.registry import ComponentRegistry
from agents.config import MAX_PARALLEL_SLIDES, DELAY_BETWEEN_SLIDES
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
    user_id: Optional[str] = None
) -> AsyncIterator[Dict[str, Any]]:
    """
    Stream deck composition using the refactored DeckComposerV2.
    
    This function uses the refactored architecture with:
    - Clean separation of concerns
    - Event-driven architecture
    - RAG-based slide generation
    - Optional visual analysis
    
    Args:
        user_id: Optional user ID to associate with the deck
    """
    print(f"\n🟢🟢🟢 [compose_deck_stream] CALLED!")
    print(f"[compose_deck_stream] deck_uuid: {deck_uuid}")
    print(f"[compose_deck_stream] slides: {len(deck_outline.slides)}")
    
    logger.info(f"📞 compose_deck_stream called with:")
    logger.info(f"  - deck_uuid: {deck_uuid}")
    logger.info(f"  - async_images: {async_images}")
    logger.info(f"  - max_parallel: {max_parallel}")
    logger.info(f"  - enable_visual_analysis: {enable_visual_analysis}")
    logger.info(f"  - user_id: {user_id}")
    
    try:
        composer = create_deck_composer(registry)
    except Exception as e:
        print(f"❌❌❌ [compose_deck_stream] ERROR creating composer: {e}")
        raise
    try:
        print(f"[compose_deck_stream] About to call composer.compose_deck")

        # Start AI image orchestrator to listen for slide.generated and apply images async
        try:
            from agents.generation.ai_image_orchestrator import AIImageOrchestrator
            from agents.persistence.deck_persistence import DeckPersistence
            _ai_image_orchestrator = AIImageOrchestrator(DeckPersistence())
            _ai_image_orchestrator.start()
        except Exception:
            # Non-fatal; keep generation flowing
            pass
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
    except Exception as e:
        print(f"❌❌❌ [compose_deck_stream] ERROR in compose_deck: {e}")
        import traceback
        traceback.print_exc()
        raise


def create_deck_composer(registry: ComponentRegistry):
    """Create deck composer using the refactored architecture."""
    logger.info("🚀 Using refactored deck composer")
    logger.info(f"🚀 Registry provided: {registry is not None}")
    from agents.generation.adapters import create_refactored_deck_composer
    composer = create_refactored_deck_composer(registry)
    logger.info(f"🚀 Composer created: {composer is not None}")
    return composer


# Export for compatibility
SCHEMA_VERSION = "v3.0"
