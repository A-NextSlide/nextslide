"""
DeckComposerV2 - Clean, modular deck composition orchestrator.

This is a refactored version of SimpleDeckComposer that uses extracted classes
for better separation of concerns:
- ThemeResolver: Theme resolution from multiple sources
- ColorPaletteManager: Color extraction, normalization, enhancement
- ImageOrchestrator: Image search and application
- StyleManifestoBuilder: Style manifesto creation

The compose_deck method is now ~300 lines instead of ~1700 lines.
"""

from typing import Dict, Any, Optional, AsyncIterator
import asyncio
from datetime import datetime

import sentry_sdk

from agents.core import IDeckComposer
from agents.domain.models import ThemeSpec, DeckState, GenerationEvent, CompositionOptions
from agents.generation.theme_resolver import ThemeResolver, ThemeResolutionResult
from agents.generation.color_palette_manager import ColorPaletteManager
from agents.generation.image_orchestrator import ImageOrchestrator, ImageEventMerger
from agents.generation.style_manifesto_builder import StyleManifestoBuilder
from agents.generation.orchestration.parallel_slide_orchestrator import ParallelSlideOrchestrator
from agents.generation.concurrency_manager import concurrency_manager
from models.requests import DeckOutline
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class DeckComposerV2(IDeckComposer):
    """
    Clean deck composition orchestrator.

    Orchestrates the deck generation pipeline:
    1. Initialize - acquire locks, create skeleton
    2. Resolve theme - from cache or generate new
    3. Prepare images - start background search
    4. Generate slides - parallel generation
    5. Finalize - save and cleanup
    """

    def __init__(
        self,
        slide_generator,
        theme_manager,
        persistence,
        event_bus,
        image_manager=None
    ):
        """
        Initialize DeckComposerV2.

        Args:
            slide_generator: Slide generation adapter
            theme_manager: Theme generation adapter
            persistence: Persistence adapter
            event_bus: Event bus for notifications
            image_manager: Optional image manager
        """
        self.slide_generator = slide_generator
        self.theme_manager = theme_manager
        self.persistence = persistence
        self.event_bus = event_bus

        # Initialize helper classes
        self.theme_resolver = ThemeResolver(theme_manager)
        self.color_manager = ColorPaletteManager()
        self.image_orchestrator = ImageOrchestrator(image_manager)
        self.manifesto_builder = StyleManifestoBuilder()

        # Orchestrator for parallel slide generation
        self.slide_orchestrator = ParallelSlideOrchestrator(
            slide_generator=slide_generator,
            persistence=persistence,
            image_manager=image_manager
        )

    async def compose_deck(
        self,
        deck_outline: DeckOutline,
        deck_uuid: str,
        user_id: Optional[str] = None,
        async_images: bool = True,
        **kwargs
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Compose a complete deck from an outline.

        This is the main orchestration method that coordinates:
        - Theme resolution/generation
        - Image preparation
        - Parallel slide generation
        - Progress events

        Args:
            deck_outline: The deck outline to generate from
            deck_uuid: UUID for the deck
            user_id: Optional user ID for concurrency management
            async_images: Whether to search images asynchronously

        Yields:
            Progress events and final deck data
        """
        concurrency_slot = None
        title = deck_outline.title or 'Untitled'

        try:
            # ============================================================
            # PHASE 1: INITIALIZATION
            # ============================================================
            yield self._progress_event('initializing', 'Starting deck composition')

            # Acquire concurrency slot
            if user_id:
                concurrency_slot = await concurrency_manager.acquire_slot(user_id)
                if not concurrency_slot:
                    yield self._error_event("Too many concurrent generations")
                    return

            # Create empty deck skeleton
            await self._create_deck_skeleton(deck_uuid, deck_outline)
            yield self._progress_event('initialized', 'Deck skeleton created')

            # ============================================================
            # PHASE 2: THEME RESOLUTION
            # ============================================================
            yield self._progress_event('theme_generation', 'Resolving theme')

            theme, palette, search_terms = await self._resolve_theme(
                deck_outline, deck_uuid
            )

            if not theme:
                yield self._error_event("Failed to resolve theme")
                return

            # Build style manifesto
            style_manifesto = self.manifesto_builder.build(theme, palette)
            palette_dict = self.manifesto_builder.build_palette_dict(theme, palette)

            yield {
                "type": "theme_generated",
                "timestamp": datetime.now().isoformat(),
                "theme": theme.to_dict() if hasattr(theme, 'to_dict') else theme,
                "palette": palette_dict
            }

            # ============================================================
            # PHASE 3: IMAGE PREPARATION
            # ============================================================
            yield self._progress_event('image_preparation', 'Preparing images')

            # Process tagged media first
            await self.image_orchestrator.process_tagged_media(deck_outline, deck_uuid)

            # Configure and start background search
            self.image_orchestrator.config.async_images = async_images

            if async_images:
                # Generate fallback search terms if not provided
                if not search_terms:
                    search_terms = self.image_orchestrator.generate_search_terms_fallback(
                        deck_outline
                    )

                await self.image_orchestrator.start_background_search(
                    deck_outline=deck_outline,
                    deck_uuid=deck_uuid,
                    search_terms=search_terms
                )

                # Give image search a head start
                await self.image_orchestrator.wait_for_head_start()

            yield self._progress_event('images_ready', 'Image search started')

            # ============================================================
            # PHASE 4: SLIDE GENERATION
            # ============================================================
            yield self._progress_event('slide_generation', 'Generating slides')

            # Create deck state (includes deck_outline)
            deck_state = DeckState(
                deck_uuid=deck_uuid,
                deck_outline=deck_outline,
                theme=theme,
                palette=palette_dict,
                style_manifesto=style_manifesto,
                slides=[],
                status={'state': 'generating', 'progress': 0, 'message': 'Generating slides...'}
            )

            # Create composition options - use config for parallelism (Gemini Tier 3 = no limits)
            from agents import config
            options = CompositionOptions(
                max_parallel_slides=config.MAX_PARALLEL_SLIDES,
                delay_between_slides=config.DELAY_BETWEEN_SLIDES,
                async_images=async_images
            )

            # Generate slides in parallel
            slides = []
            async for event in self.slide_orchestrator.generate_slides_parallel(
                deck_state=deck_state,
                options=options
            ):
                # Forward progress events
                if event.get('type') in ['slide_started', 'slide_progress', 'slide_generated']:
                    yield event

                # Collect completed slides
                if event.get('type') == 'slide_generated' and event.get('slide'):
                    slides.append(event['slide'])

            yield self._progress_event('slides_complete', f'Generated {len(slides)} slides')

            # ============================================================
            # PHASE 5: FINALIZATION
            # ============================================================
            yield self._progress_event('finalizing', 'Saving deck')

            # Build final deck data
            final_deck = await self._build_final_deck(
                deck_uuid=deck_uuid,
                deck_outline=deck_outline,
                theme=theme,
                palette=palette_dict,
                slides=slides
            )

            # Save to database
            await self.persistence.save_deck(final_deck)

            yield self._progress_event('completed', 'Deck generation complete')

            # Yield final deck
            yield {
                "type": "deck_complete",
                "timestamp": datetime.now().isoformat(),
                "deck": final_deck
            }

        except Exception as e:
            logger.error(f"[COMPOSER V2] Error composing deck: {e}")
            sentry_sdk.capture_exception(e)
            yield self._error_event(str(e))

        finally:
            # Cleanup
            await self.image_orchestrator.cancel_search()

            if concurrency_slot and user_id:
                await concurrency_manager.release_slot(user_id)

            self.persistence.end_composition(deck_uuid)

    async def _resolve_theme(
        self,
        deck_outline: DeckOutline,
        deck_uuid: str
    ) -> tuple[Optional[ThemeSpec], Dict[str, Any], Optional[Dict]]:
        """
        Resolve theme from cache or generate new.

        Returns:
            Tuple of (theme, palette, search_terms)
        """
        # Try to resolve from cache
        result = await self.theme_resolver.resolve(deck_outline, deck_uuid)

        if result.theme and not result.should_regenerate:
            logger.info(f"[COMPOSER V2] Using cached theme from {result.source}")

            # Extract and normalize palette
            raw_palette = self.color_manager.extract_from_theme(result.theme)
            normalized = self.color_manager.normalize(raw_palette)

            return result.theme, normalized.to_dict(), result.search_terms

        # Need to generate new theme
        logger.info(f"[COMPOSER V2] Generating new theme (reason: {result.regenerate_reason})")

        try:
            theme_result = await self.theme_manager.generate_theme(deck_outline, {})
            theme = theme_result.get('theme')
            search_terms = theme_result.get('search_terms')

            if theme:
                raw_palette = self.color_manager.extract_from_theme(theme)
                normalized = self.color_manager.normalize(raw_palette)

                # Enhance if minimal colors
                if len(normalized.colors) < 4:
                    enhanced = await self.color_manager.enhance_minimal_palette(
                        normalized.colors,
                        deck_outline.title or ''
                    )
                    normalized.colors = enhanced

                return theme, normalized.to_dict(), search_terms

        except Exception as e:
            logger.error(f"[COMPOSER V2] Theme generation failed: {e}")

        # Fallback to default theme
        return self._create_default_theme(), {}, None

    async def _create_deck_skeleton(
        self,
        deck_uuid: str,
        deck_outline: DeckOutline
    ):
        """Create initial deck skeleton in database."""
        skeleton = {
            'uuid': deck_uuid,
            'name': deck_outline.title or 'Untitled',
            'status': 'generating',
            'slides': [],
            'data': {
                'outline_id': getattr(deck_outline, 'id', None)
            }
        }

        try:
            await self.persistence.save_deck(skeleton)
            self.persistence.start_composition(deck_uuid)
        except Exception as e:
            logger.warning(f"[COMPOSER V2] Failed to create skeleton: {e}")

    async def _build_final_deck(
        self,
        deck_uuid: str,
        deck_outline: DeckOutline,
        theme: ThemeSpec,
        palette: Dict[str, Any],
        slides: list
    ) -> Dict[str, Any]:
        """Build final deck data structure."""
        # Get latest slides from database (may have been updated during generation)
        try:
            existing = await self.persistence.get_deck(deck_uuid)
            if existing and existing.get('slides'):
                slides = existing['slides']
        except Exception:
            pass

        return {
            'uuid': deck_uuid,
            'name': deck_outline.title or 'Untitled',
            'status': 'completed',
            'slides': slides,
            'theme': theme.to_dict() if hasattr(theme, 'to_dict') else theme,
            'data': {
                'outline_id': getattr(deck_outline, 'id', None),
                'style_spec': {
                    'palette': palette
                }
            }
        }

    def _create_default_theme(self) -> ThemeSpec:
        """Create default fallback theme."""
        return ThemeSpec.from_dict({
            "theme_name": "Default",
            "color_palette": {
                "primary_background": "#FFFFFF",
                "primary_text": "#1A1A1A",
                "accent_1": "#2563EB",
                "accent_2": "#F59E0B",
                "colors": ["#2563EB", "#F59E0B"],
                "backgrounds": ["#FFFFFF"],
                "accents": ["#2563EB", "#F59E0B"]
            },
            "typography": {
                "hero_title": {"family": "Inter", "weight": "700"},
                "body_text": {"family": "Inter", "weight": "400"}
            }
        })

    def _progress_event(self, phase: str, message: str) -> Dict[str, Any]:
        """Create a progress event."""
        return {
            "type": "progress",
            "timestamp": datetime.now().isoformat(),
            "phase": phase,
            "message": message
        }

    def _error_event(self, message: str) -> Dict[str, Any]:
        """Create an error event."""
        return {
            "type": "error",
            "timestamp": datetime.now().isoformat(),
            "message": message
        }
