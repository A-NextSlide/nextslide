"""
ImageOrchestrator - Coordinates image handling for deck generation.

This class consolidates image-related operations from SimpleDeckComposer:
- Tagged media processing (uploaded images)
- Background image search initiation
- Image application to slides
- Image event coordination
"""

from typing import Dict, Any, List, Optional, AsyncIterator, Callable
import asyncio
from dataclasses import dataclass

from models.requests import DeckOutline, SlideOutline
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


@dataclass
class ImageSearchConfig:
    """Configuration for image search behavior."""
    async_images: bool = True  # Search images in background
    auto_select_images: bool = False  # Auto-apply found images
    search_timeout: float = 10.0  # Timeout for image search
    max_images_per_slide: int = 8  # Maximum images to find per slide
    head_start_seconds: float = 2.0  # Head start before slide generation


class ImageOrchestrator:
    """
    Orchestrates image handling for deck generation.

    Responsibilities:
    - Process tagged media (uploaded images)
    - Start background image searches
    - Coordinate image application to slides
    - Merge image events with generation events
    """

    def __init__(self, image_manager=None):
        """
        Initialize ImageOrchestrator.

        Args:
            image_manager: Optional ImageManager instance for searching
        """
        self.image_manager = image_manager
        self.pending_images: Dict[str, List[Dict]] = {}
        self.search_task: Optional[asyncio.Task] = None
        self.config = ImageSearchConfig()

    async def process_tagged_media(
        self,
        deck_outline: DeckOutline,
        deck_uuid: str
    ) -> bool:
        """
        Process any tagged media (uploaded images) in the outline.

        Args:
            deck_outline: Deck outline with potential tagged media
            deck_uuid: UUID of the deck

        Returns:
            True if tagged media was found and processed
        """
        try:
            slides = deck_outline.slides if hasattr(deck_outline, 'slides') else []
            has_tagged = any(
                hasattr(slide, 'taggedMedia') and slide.taggedMedia
                for slide in slides
            )

            if not has_tagged:
                return False

            logger.info("[IMAGE ORCHESTRATOR] Processing tagged media...")

            from agents.generation.tagged_media_processor import TaggedMediaProcessor
            processor = TaggedMediaProcessor()

            for slide in slides:
                if hasattr(slide, 'taggedMedia') and slide.taggedMedia:
                    await processor.process_slide_media(slide, deck_uuid)

            logger.info("[IMAGE ORCHESTRATOR] Tagged media processing complete")
            return True

        except Exception as e:
            logger.warning(f"[IMAGE ORCHESTRATOR] Tagged media processing failed: {e}")
            return False

    async def start_background_search(
        self,
        deck_outline: DeckOutline,
        deck_uuid: str,
        search_terms: Optional[Dict[str, Any]] = None,
        on_images_found: Optional[Callable] = None
    ) -> Optional[asyncio.Task]:
        """
        Start background image search for all slides.

        Args:
            deck_outline: Deck outline
            deck_uuid: UUID of the deck
            search_terms: Optional pre-generated search terms per slide
            on_images_found: Callback when images are found

        Returns:
            The background task, or None if search not started
        """
        if not self.image_manager:
            logger.warning("[IMAGE ORCHESTRATOR] No image manager - skipping background search")
            return None

        if not self.config.async_images:
            logger.info("[IMAGE ORCHESTRATOR] Async images disabled - skipping background search")
            return None

        slides = deck_outline.slides if hasattr(deck_outline, 'slides') else []
        if not slides:
            return None

        logger.info(f"[IMAGE ORCHESTRATOR] Starting background search for {len(slides)} slides")
        logger.info(f"[IMAGE ORCHESTRATOR] Search terms provided: {bool(search_terms)}")

        try:
            # Build search queries dict
            search_queries = {}
            if search_terms:
                search_queries['deck_wide'] = {'selected_searches': search_terms}

            # Start background search
            self.search_task = asyncio.create_task(
                self.image_manager.search_images_background(
                    slides=slides,
                    deck_outline=deck_outline,
                    deck_uuid=deck_uuid,
                    search_queries=search_queries,
                    callback=on_images_found
                )
            )

            logger.info(f"[IMAGE ORCHESTRATOR] Background search task created")
            return self.search_task

        except Exception as e:
            logger.warning(f"[IMAGE ORCHESTRATOR] Failed to start background search: {e}")
            return None

    async def wait_for_head_start(self) -> int:
        """
        Wait for image search to get a head start before slide generation.

        Returns:
            Number of pending images found
        """
        if not self.search_task:
            return 0

        logger.info(f"[IMAGE ORCHESTRATOR] Giving image search {self.config.head_start_seconds}s head start...")

        await asyncio.sleep(self.config.head_start_seconds)

        # Count pending images
        total_pending = sum(
            len(images) for images in self.pending_images.values()
        )

        logger.info(f"[IMAGE ORCHESTRATOR] After head start: {total_pending} pending images")
        return total_pending

    def get_pending_images(self, slide_id: str) -> List[Dict]:
        """
        Get pending images for a specific slide.

        Args:
            slide_id: The slide identifier

        Returns:
            List of pending image dicts
        """
        return self.pending_images.get(slide_id, [])

    def add_pending_images(self, slide_id: str, images: List[Dict]):
        """
        Add pending images for a slide.

        Args:
            slide_id: The slide identifier
            images: List of image dicts to add
        """
        if slide_id not in self.pending_images:
            self.pending_images[slide_id] = []
        self.pending_images[slide_id].extend(images)

    def clear_pending_images(self, slide_id: str):
        """Clear pending images for a slide."""
        self.pending_images.pop(slide_id, None)

    async def apply_images_to_slide(
        self,
        slide_data: Dict[str, Any],
        slide_id: str,
        theme_colors: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Apply pending images to a slide.

        Args:
            slide_data: The slide data dict
            slide_id: The slide identifier
            theme_colors: Optional theme colors for image effects

        Returns:
            Updated slide data
        """
        pending = self.get_pending_images(slide_id)
        if not pending:
            return slide_data

        logger.info(f"[IMAGE ORCHESTRATOR] Applying {len(pending)} images to slide {slide_id}")

        try:
            if self.image_manager:
                slide_data = await self.image_manager.apply_pending_images(
                    slide_data,
                    pending,
                    theme_colors
                )
                self.clear_pending_images(slide_id)
        except Exception as e:
            logger.warning(f"[IMAGE ORCHESTRATOR] Failed to apply images: {e}")

        return slide_data

    async def cancel_search(self):
        """Cancel any ongoing background search."""
        if self.search_task and not self.search_task.done():
            logger.info("[IMAGE ORCHESTRATOR] Cancelling background search")
            self.search_task.cancel()
            try:
                await self.search_task
            except asyncio.CancelledError:
                pass
            self.search_task = None

    def generate_search_terms_fallback(
        self,
        deck_outline: DeckOutline
    ) -> Dict[str, List[str]]:
        """
        Generate fallback search terms from slide content.

        Used when ThemeDirector doesn't provide search_terms.

        Args:
            deck_outline: The deck outline

        Returns:
            Dict mapping slide index to search terms
        """
        import re

        slides = deck_outline.slides if hasattr(deck_outline, 'slides') else []
        search_terms = {}

        stopwords = {
            'the', 'a', 'an', 'and', 'or', 'for', 'of', 'to', 'in', 'on', 'our', 'your',
            'how', 'what', 'why', 'when', 'where', 'from', 'with', 'about', 'into',
            'stat', 'quote', 'title', 'slide', 'introduction', 'conclusion', 'callout'
        }

        for idx, slide in enumerate(slides[:10]):
            slide_title = getattr(slide, 'title', '')
            slide_content = getattr(slide, 'content', '')[:200]

            # Combine and clean text
            text = f"{slide_title} {slide_content}"
            text = re.sub(r'[:\-\"\'\•\|]', ' ', text)
            words = text.split()

            # Extract key words
            key_words = []
            for word in words:
                word_clean = word.strip('.,!?;()')
                if (word_clean and
                    len(word_clean) > 3 and
                    word_clean.lower() not in stopwords and
                    not word_clean.lower().endswith('ing')):
                    if word_clean not in key_words:
                        key_words.append(word_clean)
                if len(key_words) >= 3:
                    break

            if key_words:
                search_terms[str(idx)] = key_words[:3]

        logger.info(f"[IMAGE ORCHESTRATOR] Generated fallback search terms for {len(search_terms)} slides")
        return search_terms


class ImageEventMerger:
    """Merges image search events with slide generation events."""

    def __init__(self):
        self.image_events: asyncio.Queue = asyncio.Queue()

    def add_image_event(self, event: Dict[str, Any]):
        """Add an image event to the queue."""
        self.image_events.put_nowait(event)

    async def merge_events(
        self,
        generation_events: AsyncIterator[Dict[str, Any]]
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Merge image events with generation events.

        Yields image events as they arrive, interleaved with generation events.
        """
        async for event in generation_events:
            # First yield any pending image events
            while not self.image_events.empty():
                try:
                    img_event = self.image_events.get_nowait()
                    yield img_event
                except asyncio.QueueEmpty:
                    break

            # Then yield the generation event
            yield event

        # Yield any remaining image events
        while not self.image_events.empty():
            try:
                img_event = self.image_events.get_nowait()
                yield img_event
            except asyncio.QueueEmpty:
                break
