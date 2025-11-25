"""
Adapters to connect refactored components with the existing system.
"""

from typing import Dict, Any, List, Optional, AsyncIterator
import asyncio
import uuid
import os
from datetime import datetime

import sentry_sdk
from sentry_sdk import start_span

from agents.core import ISlideGenerator, IThemeManager, IPersistence, IRAGRepository, IDeckComposer
from agents.domain.models import ThemeSpec, SlideGenerationContext, SlideStatus, DeckState, GenerationEvent, SlideGeneratedEvent
from agents.application.event_bus import Events
from agents.generation.slide_generator import SlideGeneratorV2
from agents.generation.html_inspired_generator import HTMLInspiredSlideGenerator
from agents.generation.components.ai_generator import AISlideGenerator
from agents.generation.components.component_validator import ComponentValidator
from agents.generation.orchestration.parallel_slide_orchestrator import ParallelSlideOrchestrator
from agents.generation.tagged_media_processor import TaggedMediaProcessor
from agents.rag.slide_context_retriever import SlideContextRetriever
from agents.persistence.deck_persistence import DeckPersistence
from agents.generation.progress_manager import DeckGenerationProgress, GenerationPhase
from models.requests import SlideOutline, DeckOutline
from setup_logging_optimized import get_logger
from agents.generation.concurrency_manager import concurrency_manager

logger = get_logger(__name__)


class SlideGeneratorAdapter:
    """Adapts the old SlideGenerator interface to the new architecture."""
    
    def __init__(self, registry, theme_system, available_fonts, all_fonts_list):
        # Create the new components
        self.rag_repository = RAGRepositoryAdapter()
        self.ai_generator = AISlideGenerator()
        self.component_validator = ComponentValidator(registry)
        
        # Create the base slide generator
        base_generator = SlideGeneratorV2(
            rag_repository=self.rag_repository,
            ai_generator=self.ai_generator,
            component_validator=self.component_validator,
            registry=registry,
            theme_system=theme_system
        )
        
        # Wrap with HTML-inspired prompting (enabled by default, can disable with env var)
        use_html_inspired = os.getenv('USE_HTML_INSPIRED', 'true').lower() == 'true'
        
        if use_html_inspired:
            logger.info("🎨 HTML-inspired slide generation ENABLED (optimized prompts + caching)")
            self.generator = HTMLInspiredSlideGenerator(base_generator)
        else:
            logger.info("📝 Using legacy RAG slide generation")
            self.generator = base_generator
        
        # Store for compatibility
        self.registry = registry
        self.theme_system = theme_system
        self.available_fonts = available_fonts
        self.all_fonts_list = all_fonts_list
    
    async def generate_slide(self, *args, **kwargs) -> AsyncIterator[Dict[str, Any]]:
        """Generate a slide - handles both old and new interfaces."""
        
        # Check if called with new interface (single SlideGenerationContext argument)
        if len(args) == 1 and isinstance(args[0], SlideGenerationContext):
            context = args[0]
            # Generate using new system directly
            async for update in self.generator.generate_slide(context):
                yield update
        else:
            # Old interface with multiple parameters
            # Extract parameters
            if len(args) >= 6:
                slide_outline = args[0]
                slide_index = args[1]
                deck_outline = args[2]
                theme = args[3]
                palette = args[4]
                style_manifesto = args[5]
                available_images = args[6] if len(args) > 6 else kwargs.get('available_images', None)
                async_images = args[7] if len(args) > 7 else kwargs.get('async_images', False)
                deck_uuid = args[8] if len(args) > 8 else kwargs.get('deck_uuid', None)
            else:
                # Use kwargs
                slide_outline = kwargs['slide_outline']
                slide_index = kwargs['slide_index']
                deck_outline = kwargs['deck_outline']
                theme = kwargs['theme']
                palette = kwargs['palette']
                style_manifesto = kwargs['style_manifesto']
                available_images = kwargs.get('available_images', None)
                async_images = kwargs.get('async_images', False)
                deck_uuid = kwargs.get('deck_uuid', None)
            
            # Create context
            tagged_media_for_context = [
                # Convert to dict if it's a Pydantic model
                media.model_dump() if hasattr(media, 'model_dump') else media
                for media in (slide_outline.taggedMedia if hasattr(slide_outline, 'taggedMedia') and slide_outline.taggedMedia else [])
            ]

            logger.debug(f"[IMAGE FLOW 2/4] Creating context for slide {slide_index + 1}")
            logger.debug(f"  async_images: {async_images} (False=auto-apply ON)")
            logger.debug(f"  tagged_media count: {len(tagged_media_for_context)}")
            if tagged_media_for_context:
                logger.debug(f"  First tagged_media URL: {tagged_media_for_context[0].get('previewUrl', 'none')[:100]}")
            logger.info(f"[IMAGE FLOW 2/4] Creating context for slide {slide_index + 1}")
            logger.info(f"   - async_images: {async_images} (False=auto-apply ON)")
            logger.info(f"   - tagged_media count: {len(tagged_media_for_context)}")
            if tagged_media_for_context:
                logger.info(f"   - First tagged_media URL: {tagged_media_for_context[0].get('previewUrl', 'none')[:100]}")

            context = SlideGenerationContext(
                slide_outline=slide_outline,
                slide_index=slide_index,
                deck_outline=deck_outline,
                theme=ThemeSpec.from_dict(theme),
                palette=palette,
                style_manifesto=style_manifesto,
                deck_uuid=deck_uuid or "",
                available_images=available_images or [],
                async_images=async_images,
                tagged_media=tagged_media_for_context
            )
            
            # Generate using new system
            async for update in self.generator.generate_slide(context):
                yield update


class ThemeManagerAdapter(IThemeManager):
    """Adapts the old ThemeStyleManager to the new interface."""
    
    def __init__(self, theme_style_manager):
        self.manager = theme_style_manager
    
    async def generate_theme(self, deck_outline: DeckOutline, global_theme: Dict[str, Any]) -> Dict[str, Any]:
        """Generate theme using the existing manager."""
        logger.info(f"[THEME ADAPTER] Generating theme for deck: {deck_outline.title}")
        if hasattr(deck_outline, 'stylePreferences'):
            logger.info(f"[THEME ADAPTER] StylePreferences present: {deck_outline.stylePreferences is not None}")
            if deck_outline.stylePreferences:
                logger.info(f"[THEME ADAPTER] VibeContext: {getattr(deck_outline.stylePreferences, 'vibeContext', 'NOT SET')}")
        else:
            logger.info(f"[THEME ADAPTER] ⚠️ NO stylePreferences in deck_outline")
            
        result = await self.manager.analyze_theme_and_style(deck_outline)
        theme_dict = result.get('theme', {})
        search_terms = result.get('search_terms', [])
        
        logger.info(f"[THEME ADAPTER] Theme analysis returned {len(search_terms)} search terms: {search_terms}")
        
        # Return full result with theme and search_terms
        return {
            'theme': ThemeSpec.from_dict(theme_dict),
            'search_terms': search_terms,
            'style_spec': result.get('style_spec', {})
        }
    
    async def generate_palette(self, deck_outline: DeckOutline, theme: ThemeSpec) -> Dict[str, Any]:
        """Generate palette using the existing manager."""
        theme_dict = theme.to_dict() if isinstance(theme, ThemeSpec) else theme
        return await self.manager.generate_palette(deck_outline, theme_dict)
    
    def create_style_manifesto(self, style_spec: Dict[str, Any]) -> str:
        """Create style manifesto."""
        return self.manager.create_style_manifesto(style_spec)


class PersistenceAdapter(IPersistence):
    """Adapts the existing DeckPersistence to the new interface."""
    
    def __init__(self, deck_persistence: DeckPersistence):
        self.persistence = deck_persistence
        self.user_id: Optional[str] = None
    
    def set_user_id(self, user_id: Optional[str]) -> None:
        """Set the user_id for this persistence session."""
        self.user_id = user_id
    
    async def save_deck(self, deck_data: Dict[str, Any]) -> None:
        """Save deck using existing persistence."""
        deck_uuid = deck_data.get('uuid')
        await self.persistence.save_deck(deck_uuid, deck_data)
    
    async def update_slide(self, deck_uuid: str, slide_index: int, slide_data: Dict[str, Any], force_immediate: bool = False) -> None:
        """Update slide using existing persistence."""
        if self.user_id:
            await self.persistence.update_slide_with_user(deck_uuid, slide_index, slide_data, self.user_id, force_immediate=force_immediate)
        else:
            await self.persistence.update_slide(deck_uuid, slide_index, slide_data, force_immediate=force_immediate)
    
    async def get_deck(self, deck_uuid: str) -> Optional[Dict[str, Any]]:
        """Get deck using existing persistence."""
        return await self.persistence.get_deck_with_retry(deck_uuid)
    
    def start_composition(self, deck_uuid: str):
        """Mark deck as being composed."""
        self.persistence.start_composition(deck_uuid)
    
    def end_composition(self, deck_uuid: str):
        """Mark deck composition as ended."""
        self.persistence.end_composition(deck_uuid)
    
    async def save_deck_with_user(self, deck_uuid: str, deck_data: Dict[str, Any], user_id: Optional[str] = None) -> bool:
        """Save deck with user ID."""
        # Log if notes are present
        if 'notes' in deck_data and deck_data['notes']:
            logger.info(f"[PERSISTENCE] Saving deck {deck_uuid} WITH narrative flow notes")
        else:
            logger.warning(f"[PERSISTENCE] Saving deck {deck_uuid} WITHOUT narrative flow notes")
        return await self.persistence.save_deck_with_user(deck_uuid, deck_data, user_id)


class RAGRepositoryAdapter(IRAGRepository):
    """Adapts the existing SlideContextRetriever to the new interface."""
    
    def __init__(self):
        self.retriever = SlideContextRetriever()
    
    def get_slide_context(
        self,
        slide_outline: SlideOutline,
        slide_index: int,
        deck_outline: DeckOutline,
        theme: Dict[str, Any],
        palette: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get context using existing retriever."""
        return self.retriever.get_slide_context(
            slide_outline=slide_outline,
            slide_index=slide_index,
            deck_outline=deck_outline,
            theme=theme,
            palette=palette
        )


def create_refactored_slide_generator(registry, theme_system, available_fonts, all_fonts_list):
    """Factory function to create the refactored slide generator."""
    return SlideGeneratorAdapter(registry, theme_system, available_fonts, all_fonts_list)


class SimpleDeckComposer(IDeckComposer):
    """Simple implementation of deck composer using refactored components."""

    def __init__(self, slide_generator, theme_manager, persistence, event_bus, image_manager=None):
        self.slide_generator = slide_generator
        self.theme_manager = theme_manager
        self.persistence = persistence
        self.event_bus = event_bus
        self.orchestrator = ParallelSlideOrchestrator(slide_generator, persistence, image_manager)
        self.image_manager = image_manager
        self.media_processor = TaggedMediaProcessor()

    def _generate_smart_search_query(self, slide: SlideOutline, deck_outline: DeckOutline) -> str:
        """
        Generate a smart, specific search query for a slide based on its content.

        Analyzes:
        - Slide title and content
        - Deck context and theme
        - Key concepts from bullet points
        - Content type (people, data, concepts, products)

        Returns a targeted search query optimized for finding relevant images with style hints.
        """
        import re

        # Extract key information
        slide_title = slide.title or ""
        slide_content = slide.content or ""
        deck_title = deck_outline.title or ""

        # Get vibe context from stylePreferences if available
        vibe_context = ""
        if hasattr(deck_outline, 'stylePreferences') and deck_outline.stylePreferences:
            vibe_context = getattr(deck_outline.stylePreferences, 'vibeContext', '') or ""

        # Extract key concepts from content (first few sentences or bullet points)
        content_preview = slide_content[:300]  # First 300 chars for better context

        # Remove markdown formatting and extra whitespace
        content_preview = re.sub(r'[#*_\-\[\]`]', '', content_preview)
        content_preview = ' '.join(content_preview.split())

        # Extract key terms from title - be aggressive about filtering
        title_words = slide_title.split()

        # ULTRA-AGGRESSIVE stopword list - remove ALL filler, generic, and business jargon words
        stopwords = {
            # Articles & conjunctions
            'the', 'a', 'an', 'of', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'with', 'by', 'from', 'is', 'are', 'was', 'were', 'been', 'be', 'have',
            'has', 'had', 'this', 'that', 'these', 'those', 'it', 'its', 'our', 'your',
            'his', 'her', 'their', 'into', 'through', 'during', 'before', 'after',
            # Generic descriptive words
            'legendary', 'journey', 'story', 'tale', 'hero', 'icon', 'complete', 'guide',
            'history', 'evolution', 'future', 'modern', 'new', 'old', 'latest', 'best',
            # Business/presentation jargon
            'industry', 'market', 'business', 'company', 'enterprise', 'solution', 'service',
            'overview', 'introduction', 'conclusion', 'summary', 'callout', 'about', 'how',
            'what', 'why', 'when', 'where', 'who', 'which',
            # Action words that don't help search
            'goes', 'comes', 'makes', 'gets', 'shaped', 'changed', 'improved', 'enhanced',
            # Common slide words
            'slide', 'presentation', 'deck', 'content', 'section', 'chapter', 'part'
        }

        # Keep only truly meaningful nouns/names (be VERY selective)
        key_terms = [
            word.strip('.,!?:;-')
            for word in title_words
            if word.lower() not in stopwords and len(word.strip('.,!?:;-')) > 2 and not word.lower().endswith('ing')
        ][:2]  # Take max 2 key terms (reduced from 3)

        # Extract proper nouns from content (capitalized words are usually important names)
        words = content_preview.split()
        content_terms = [
            w.strip('.,!?:;-')
            for w in words[:15]  # Only check first 15 words
            if w and w[0].isupper() and w.lower() not in stopwords and len(w) > 3 and not w.lower().endswith('ing')
        ][:1]  # Take max 1 proper noun

        # Build simple, concise query
        query_parts = []

        # Prioritize key terms from title
        query_parts.extend(key_terms)

        # Add 1 content term if we have space
        if len(query_parts) < 3 and content_terms:
            query_parts.extend(content_terms[:1])

        # If title was too generic, add ONE deck term
        generic_titles = ['introduction', 'conclusion', 'summary', 'overview', 'agenda', 'thank you', 'questions']
        if slide_title.lower() in generic_titles and deck_title and len(query_parts) < 2:
            deck_words = deck_title.split()
            deck_terms = [w.strip('.,!?:;-') for w in deck_words if w.lower() not in stopwords and not w.lower().endswith('ing')][:1]
            query_parts.extend(deck_terms)

        # Combine into ultra-concise query (max 3 words)
        search_query = ' '.join(query_parts[:3])

        # Remove any remaining common words that slipped through
        search_query = search_query.replace('  ', ' ').strip()

        logger.debug(f"[QUERY GEN] Slide: '{slide_title}' → Query: '{search_query}'")

        # Fallback if extraction failed
        if not search_query or len(search_query) < 3:
            search_query = f"{deck_title} {slide_title}"[:50]  # Limit to 50 chars

        return search_query.strip()

    def _generate_simple_search_query(self, slide: SlideOutline) -> str:
        """Generate a very simple 1-3 word search query from slide title (fallback)."""
        title = getattr(slide, 'title', '')
        if not title:
            return "business presentation"
        
        # Remove common stopwords and take first 2-3 meaningful words
        stopwords = {'the', 'a', 'an', 'and', 'or', 'for', 'of', 'to', 'in', 'on', 'our', 'your'}
        words = [w for w in title.split() if w.lower() not in stopwords and len(w) > 2]
        
        # Take first 2-3 words
        search_words = words[:3] if len(words) >= 3 else words[:2]
        return ' '.join(search_words) if search_words else title[:30]
    
    def _should_prefer_diagram(self, slide: SlideOutline) -> bool:
        """Heuristic: decide if this slide benefits from a 'diagram' search hint."""
        try:
            title = (slide.title or '').lower()
            content = (slide.content or '').lower()
            keywords = [
                'process','workflow','pipeline','architecture','lifecycle','framework',
                'overview','system design','timeline','steps',' vs ', ' versus ',
                'comparison','anatomy','diagram','model','layers','stack','roadmap'
            ]
            haystack = f"{title} {content}"
            return any(k in haystack for k in keywords)
        except Exception:
            return False
        
    async def compose_deck(
        self,
        deck_outline: DeckOutline,
        deck_uuid: str,
        **options
    ) -> AsyncIterator[Dict[str, Any]]:
        """Compose a deck using the refactored architecture."""
        logger.info(f"Starting deck composition: {deck_outline.title} ({len(deck_outline.slides)} slides)")
        
        # Initialize progress manager
        progress = DeckGenerationProgress()

        def _palette_from_theme_obj(theme_obj: Optional[ThemeSpec]) -> Dict[str, Any]:
            """Extract a raw color palette from a ThemeSpec without triggering extra theme calls."""
            if not theme_obj:
                return {}
            try:
                theme_dict = theme_obj.to_dict() if hasattr(theme_obj, 'to_dict') else dict(theme_obj)
                palette_dict = theme_dict.get('color_palette') or {}
                return dict(palette_dict) if isinstance(palette_dict, dict) else {}
            except Exception:
                return {}

        # Extract user_id from options and set on persistence
        user_id = options.get('user_id')
        if user_id and hasattr(self.persistence, 'set_user_id'):
            self.persistence.set_user_id(user_id)
            logger.info(f"Set user_id {user_id} on persistence adapter")
        
        # Generate a unique generation ID for this deck
        generation_id = str(uuid.uuid4())
        
        # Note: Deck lock is now acquired in api_deck_create_stream.py BEFORE deck creation
        # This prevents the race condition where multiple requests create the deck in DB
        deck_lock_acquired = False  # Track that we didn't acquire it here
        
        # For concurrency management, use a default ID for anonymous users
        # This ensures anonymous users are also subject to rate limiting
        concurrency_user_id = user_id if user_id else "anonymous"
        
        # Check if user can start a new deck generation
        active_decks = concurrency_manager.get_user_active_decks(concurrency_user_id)
        from agents.config import MAX_DECKS_PER_USER
        
        if active_decks >= MAX_DECKS_PER_USER:
            logger.warning(f"User {concurrency_user_id} has {active_decks} active deck generations (max: {MAX_DECKS_PER_USER})")
            yield {
                "type": "error",
                "message": f"Too many active deck generations ({active_decks}). Maximum allowed: {MAX_DECKS_PER_USER}. Please wait for current decks to complete.",
                "error": "CONCURRENT_DECK_LIMIT",
                "retry_after": 30
            }
            return
        
        # Acquire deck generation slot - use deck_uuid to prevent duplicate generations
        deck_task_id = f"deck_{deck_uuid}"  # Key by deck UUID, not generation ID!
        acquired = await concurrency_manager.acquire_for_user(concurrency_user_id, deck_task_id)
        if not acquired:
            logger.warning(f"Failed to acquire deck generation slot for user {concurrency_user_id}, deck {deck_uuid}")
            yield {
                "type": "error", 
                "message": "Unable to start generation. Too many active requests. Please try again in a moment.",
                "error": "RESOURCE_UNAVAILABLE",
                "retry_after": 10
            }
            # Release global deck lock since we can't proceed
            concurrency_manager.release_deck_lock(deck_uuid)
            return
            
        logger.info(f"✅ Acquired deck generation slot for user {concurrency_user_id}, deck {deck_uuid}")
        
        # Ensure deck_state is defined for error handling paths
        deck_state: Optional[DeckState] = None
        try:
            # Mark deck as being composed for proper caching
            self.persistence.start_composition(deck_uuid)
            
            # Phase 1: Initialization
            yield progress.start_phase(GenerationPhase.INITIALIZATION)

            # CRITICAL: Create empty deck skeleton immediately to prevent 404s during generation
            # This allows frontend to poll for the deck while we're generating slides
            logger.info(f"💾 [DECK COMPOSER] Creating initial deck skeleton for {deck_uuid}")
            initial_deck = {
                'uuid': deck_uuid,
                'name': deck_outline.title,
                'slides': [],
                'status': {
                    'state': 'generating',
                    'progress': 0,
                    'phase': GenerationPhase.INITIALIZATION.value,
                    'message': 'Starting deck generation...'
                },
                'version': '1.0',
                'lastModified': datetime.now().isoformat()
            }

            # Save initial skeleton to database
            try:
                await self.persistence.save_deck_with_user(deck_uuid, initial_deck, user_id)
                logger.info(f"✅ [DECK COMPOSER] Initial deck skeleton created in database")
            except Exception as e:
                logger.warning(f"⚠️ [DECK COMPOSER] Failed to create initial deck skeleton: {e}")

            # Phase 2: Theme Generation - This MUST complete before slides
            yield progress.start_phase(GenerationPhase.THEME_GENERATION)
            
            # Companion phase_update so the frontend switches label immediately
            yield {
                "type": "phase_update",
                "timestamp": datetime.now().isoformat(),
                "phase": GenerationPhase.THEME_GENERATION.value,
                "message": "Creating design theme",
                "progress": progress.progress
            }
            
            # Initialize theme variables
            theme = None
            palette = None
            search_terms = []
            theme_doc = None

            # CRITICAL: Check for existing theme from outline.notes FIRST (preserve from outline generation)
            try:
                outline_notes = getattr(deck_outline, 'notes', None)
                logger.info(f"[DECK COMPOSER] DEBUG: outline_notes type: {type(outline_notes)}")
                if isinstance(outline_notes, dict):
                    logger.info(f"[DECK COMPOSER] DEBUG: outline_notes keys: {list(outline_notes.keys())}")

                    if outline_notes.get('theme'):
                        outline_theme = outline_notes.get('theme')
                        logger.info(f"[DECK COMPOSER] DEBUG: Found theme in outline.notes: {type(outline_theme)}")
                        if isinstance(outline_theme, dict):
                            # CRITICAL: Check if fun topic with boring fonts!
                            title_lower = deck_outline.title.lower()
                            is_fun_topic = any(kw in title_lower for kw in [
                            'pikachu', 'pokemon', 'mario', 'luigi', 'gaming', 'arcade', 'retro', 
                            'game', 'nintendo', 'kids', 'children', 'party', 'cartoon'
                        ])
                        
                        current_hero = outline_theme.get('typography', {}).get('hero_title', {}).get('family', '')
                        current_body = outline_theme.get('typography', {}).get('body_text', {}).get('family', '')
                        boring_fonts = ['roboto', 'inter', 'lato', 'raleway', 'montserrat', 'open sans', 'poppins']
                        has_boring_fonts = current_hero.lower() in boring_fonts or current_body.lower() in boring_fonts
                        
                        if is_fun_topic and has_boring_fonts:
                            logger.debug(f"FUN TOPIC WITH BORING FONTS IN OUTLINE.NOTES! 🎮🎮🎮")
                            logger.debug(f"  Title: '{deck_outline.title}'")
                            logger.debug(f"  Cached fonts: {current_hero} + {current_body} (BORING!)")
                            logger.debug(f"  CLEARING outline.notes.theme to force regeneration!\n")
                            logger.info(f"[DECK COMPOSER] 🎮 Fun topic has boring outline.notes fonts - clearing")
                            outline_theme = None  # Clear it!
                        
                        if outline_theme:  # Only use if not cleared
                            logger.info(f"[DECK COMPOSER] ✅ REUSING THEME FROM OUTLINE (avoiding regeneration)")
                            logger.info(f"[DECK COMPOSER] Theme colors from outline: {outline_theme.get('color_palette', {}).get('colors', 'no colors')}")

                            try:
                                theme = ThemeSpec.from_dict(outline_theme)
                                # Also get palette from outline theme
                                palette = outline_theme.get('color_palette') or outline_theme.get('palette')
                                if not palette:
                                    # Derive palette directly from provided theme without new theme generation
                                    palette = _palette_from_theme_obj(theme)
                                logger.info(f"[DECK COMPOSER] Theme from outline: {outline_theme.get('theme_name', 'unnamed')}")
                                logger.info(f"[DECK COMPOSER] Palette from outline: {list(palette.keys()) if isinstance(palette, dict) else palette}")
                                
                                # CRITICAL: Also extract search_terms from outline.notes if present
                                if isinstance(outline_notes, dict) and 'search_terms' in outline_notes:
                                    search_terms = outline_notes.get('search_terms', [])
                                    logger.info(f"[DECK COMPOSER] ✅ EXTRACTED {len(search_terms)} search terms from outline: {search_terms}")
                            except Exception as e:
                                logger.error(f"Error creating theme from outline: {e}")
                                theme = None
                        else:
                            logger.info(f"[DECK COMPOSER] DEBUG: No theme found in outline.notes")
                    else:
                        logger.info(f"[DECK COMPOSER] DEBUG: No theme key in outline.notes")
            except Exception as e:
                logger.error(f"[DECK COMPOSER] Error checking outline theme: {e}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
            
            # Default theme as fallback only
            default_theme = ThemeSpec.from_dict({
                "theme_name": "Modern Professional",
                "visual_style": {
                    "background_style": "gradient",
                    "image_effects": ["ken-burns"],
                    "transition_style": "smooth"
                },
                "color_palette": {
                    "primary": "#2563eb",
                    "secondary": "#7c3aed",
                    "accent": "#f59e0b",
                    "background": "#ffffff",
                    "text": "#1f2937"
                }
            })
            
            # Default palette as fallback only - use diverse colors
            # Rotate through different color schemes to avoid always using blue
            import random
            fallback_palettes = [
                {
                    "primary": "#10b981",  # Emerald green
                    "secondary": "#059669", 
                    "accent": "#f59e0b",
                    "background": "#ffffff",
                    "text": "#1f2937"
                },
                {
                    "primary": "#dc2626",  # Red
                    "secondary": "#b91c1c", 
                    "accent": "#facc15",
                    "background": "#ffffff",
                    "text": "#1f2937"
                },
                {
                    "primary": "#7c3aed",  # Purple
                    "secondary": "#6d28d9", 
                    "accent": "#f97316",
                    "background": "#ffffff",
                    "text": "#1f2937"
                },
                {
                    "primary": "#0891b2",  # Cyan
                    "secondary": "#0e7490", 
                    "accent": "#a855f7",
                    "background": "#ffffff",
                    "text": "#1f2937"
                }
            ]
            default_palette = random.choice(fallback_palettes)
            
            # CRITICAL: Theme generation happens FIRST, before anything else
            logger.info("[DECK COMPOSER] Starting theme generation phase...")
            
            # New: If a theme is already provided in the outline (notes.theme), prefer it
            # First: Prefer existing theme already persisted on deck (single source of truth)
            try:
                from utils.supabase import get_deck_theme, get_deck
                existing_theme_data = get_deck_theme(deck_uuid)
                if existing_theme_data:
                    # CRITICAL: Check if this is a fun topic that needs playful fonts
                    # If so, SKIP cached theme and regenerate!
                    title_lower = deck_outline.title.lower()
                    is_fun_topic = any(kw in title_lower for kw in [
                        'pikachu', 'pokemon', 'mario', 'luigi', 'gaming', 'video game',
                        'arcade', 'retro', 'game', 'nintendo', 'sega', 'playstation'
                    ])
                    
                    current_hero = existing_theme_data.get('typography', {}).get('hero_title', {}).get('family', 'unknown')
                    current_body = existing_theme_data.get('typography', {}).get('body_text', {}).get('family', 'unknown')
                    
                    # Check if cached theme has boring fonts
                    boring_fonts = ['roboto', 'inter', 'lato', 'raleway', 'montserrat', 'open sans']
                    has_boring_fonts = current_hero.lower() in boring_fonts or current_body.lower() in boring_fonts
                    
                    if is_fun_topic:
                        logger.debug(f"FUN TOPIC DETECTED!")
                        logger.debug(f"  Title: {deck_outline.title}")
                        logger.debug(f"  FORCING theme regeneration to get playful colors and fonts!")
                        logger.debug(f"  Ignoring cached theme...\n")
                        logger.info(f"[DECK COMPOSER] Fun topic '{deck_outline.title}' - forcing regeneration")
                        existing_theme_data = None  # Skip cached theme!
                    else:
                        logger.debug(f"FOUND EXISTING THEME IN DATABASE")
                        logger.debug(f"  Deck: {deck_outline.title}")
                        logger.debug(f"  Theme has cached fonts - NOT regenerating!")
                        logger.debug(f"  Hero font: {current_hero}")
                        logger.debug(f"  Body font: {current_body}")
                        if is_fun_topic and not has_boring_fonts:
                            logger.debug(f"  Fun topic already has good fonts - keeping them!\n")
                        else:
                            logger.debug(f"  Using cached theme...\n")
                        
                        logger.info(f"[DECK COMPOSER] Found existing theme from database (outline stage)")
                        theme = ThemeSpec.from_dict(existing_theme_data)
                        
                        # Attempt to get persisted palette if available
                        try:
                            existing_deck = get_deck(deck_uuid)
                            if existing_deck and existing_deck.get('data', {}).get('style_spec', {}).get('palette'):
                                palette = existing_deck['data']['style_spec']['palette']
                        except Exception:
                            pass
            except Exception as e:
                logger.error(f"Error checking existing theme from database: {e}")

            # REMOVED: Duplicate theme preservation logic - already handled above at lines 337-371
            if False:  # theme is None:
                try:
                    provided_theme_dict = None
                    outline_notes = getattr(deck_outline, 'notes', None)
                    if isinstance(outline_notes, dict):
                        provided_theme_dict = outline_notes.get('theme') or outline_notes.get('Theme')
                    # Optionally check stylePreferences.theme if present
                    if not provided_theme_dict and hasattr(deck_outline, 'stylePreferences'):
                        sp = getattr(deck_outline, 'stylePreferences')
                        if isinstance(sp, dict):
                            provided_theme_dict = sp.get('theme')
                        else:
                            provided_theme_dict = getattr(sp, 'theme', None)
                    if isinstance(provided_theme_dict, dict) and provided_theme_dict:
                        logger.info("[DECK COMPOSER] Theme provided via outline.notes; using supplied theme and skipping ThemeDirector")
                        theme_colors = provided_theme_dict.get('color_palette', {}).get('colors', [])
                        logger.info(f"[DECK COMPOSER] PRESERVING {len(theme_colors) if isinstance(theme_colors, list) else 0} ORIGINAL COLORS: {theme_colors}")
                        try:
                            theme = ThemeSpec.from_dict(provided_theme_dict)
                        except Exception:
                            theme = ThemeSpec.from_dict(provided_theme_dict)
                        # Derive palette from provided theme when available
                        palette = provided_theme_dict.get('color_palette') if isinstance(provided_theme_dict, dict) else None
                        if not palette:
                            try:
                                palette = _palette_from_theme_obj(theme)
                            except Exception:
                                palette = {}
                        # Persist provided theme to Supabase so subsequent runs can reuse it
                        try:
                            from utils.supabase import get_deck, upload_deck
                            existing = get_deck(deck_uuid) or {}
                            data_field = existing.get('data', {}) if isinstance(existing.get('data'), dict) else {}
                            data_field['theme'] = provided_theme_dict
                            if isinstance(palette, dict):
                                data_field.setdefault('style_spec', {})
                                if isinstance(data_field['style_spec'], dict):
                                    data_field['style_spec']['palette'] = palette
                            payload = {
                                'uuid': deck_uuid,
                                'name': deck_outline.title,
                                'data': data_field,
                            }
                            upload_deck(payload, deck_uuid)
                            logger.info("[DECK COMPOSER] ✅ Persisted provided theme to deck data without touching slides")
                        except Exception as e:
                            logger.warning(f"[DECK COMPOSER] Failed to persist provided theme: {e}")
                except Exception as e:
                    logger.warning(f"[DECK COMPOSER] Error while checking outline-provided theme: {e}")
            
            # Check for existing theme first - CRITICAL: Must check outline.notes.theme first
            if theme is None:
                try:
                    # PRIORITY 1: Check if theme is in outline.notes.theme (from outline generation)
                    outline_notes = getattr(deck_outline, 'notes', None)
                    logger.info(f"[DECK COMPOSER] DEBUG: outline_notes type: {type(outline_notes)}")
                    logger.info(f"[DECK COMPOSER] DEBUG: outline_notes keys: {list(outline_notes.keys()) if isinstance(outline_notes, dict) else 'not dict'}")
                    
                    if isinstance(outline_notes, dict) and outline_notes.get('theme'):
                        outline_theme = outline_notes.get('theme')
                        logger.info(f"[DECK COMPOSER] DEBUG: Found theme in outline.notes: {type(outline_theme)}")
                        if isinstance(outline_theme, dict):
                            # CRITICAL: Check if fun topic with boring fonts!
                            title_lower = deck_outline.title.lower()
                            is_fun_topic = any(kw in title_lower for kw in [
                                'pikachu', 'pokemon', 'mario', 'luigi', 'gaming', 'arcade', 'retro', 
                                'game', 'nintendo', 'kids', 'children', 'party', 'cartoon'
                            ])
                            
                            current_hero = outline_theme.get('typography', {}).get('hero_title', {}).get('family', '')
                            current_body = outline_theme.get('typography', {}).get('body_text', {}).get('family', '')
                            boring_fonts = ['roboto', 'inter', 'lato', 'raleway', 'montserrat', 'open sans', 'poppins']
                            has_boring_fonts = current_hero.lower() in boring_fonts or current_body.lower() in boring_fonts
                            
                            if is_fun_topic:
                                logger.debug(f"FUN TOPIC IN OUTLINE.NOTES (2nd check)! 🎮🎮🎮")
                                logger.debug(f"  Title: '{deck_outline.title}'")
                                logger.debug(f"  CLEARING outline theme to force regeneration!\n")
                                logger.info(f"[DECK COMPOSER] 🎮 Fun topic - clearing outline theme (2nd path)")
                                outline_theme = None  # Clear it!
                            
                            if outline_theme:  # Only use if not cleared
                                logger.info(f"[DECK COMPOSER] ✅ REUSING THEME FROM OUTLINE (avoiding regeneration)")
                                logger.info(f"[DECK COMPOSER] Theme colors from outline: {outline_theme.get('color_palette', {}).get('colors', 'no colors')}")
                                theme = ThemeSpec.from_dict(outline_theme)
                                # Also get palette from outline theme
                                palette = outline_theme.get('color_palette') or outline_theme.get('palette')
                                if not palette:
                                    # Derive palette directly from theme without regenerating
                                    palette = _palette_from_theme_obj(theme)
                                logger.info(f"[DECK COMPOSER] Theme from outline: {outline_theme.get('theme_name', 'unnamed')}")
                                logger.info(f"[DECK COMPOSER] Palette from outline: {list(palette.keys()) if isinstance(palette, dict) else palette}")
                    else:
                        logger.info(f"[DECK COMPOSER] DEBUG: No theme found in outline.notes")
                        
                except Exception as e:
                    logger.error(f"Error checking outline theme: {e}")
                    import traceback
                    logger.error(f"Traceback: {traceback.format_exc()}")
            
            # PRIORITY 2: Check database theme only if no outline theme
            if theme is None:
                try:
                    from utils.supabase import get_deck_theme, get_deck
                    existing_theme_data = get_deck_theme(deck_uuid)

                    if existing_theme_data:
                        # CRITICAL: Check if fun topic again to avoid picking up stale theme
                        title_lower = deck_outline.title.lower()
                        is_fun_topic = any(kw in title_lower for kw in [
                            'pikachu', 'pokemon', 'mario', 'luigi', 'gaming', 'arcade', 'retro', 
                            'game', 'nintendo', 'kids', 'children', 'party', 'cartoon'
                        ])
                        
                        if is_fun_topic:
                            logger.info(f"[DECK COMPOSER] 🎮 Fun topic '{deck_outline.title}' - ignoring database theme (2nd check)")
                            theme = None
                        else:
                            logger.info(f"[DECK COMPOSER] Found existing theme from database (outline stage)")
                            theme = ThemeSpec.from_dict(existing_theme_data)

                        # Also check for palette and search_terms
                        existing_deck = get_deck(deck_uuid)
                        if existing_deck and isinstance(existing_deck.get('data'), dict):
                            deck_data = existing_deck['data']

                            # Extract palette
                            if deck_data.get('style_spec', {}).get('palette'):
                                palette = deck_data['style_spec']['palette']
                                logger.info(f"[DECK COMPOSER] Found existing palette: {list(palette.keys()) if isinstance(palette, dict) else palette}")
                            else:
                                # Derive palette from existing theme without regenerating
                                palette = _palette_from_theme_obj(theme)

                            # CRITICAL: Extract search_terms from database if present
                            if 'search_terms' in deck_data and deck_data['search_terms']:
                                search_terms = deck_data['search_terms']
                                logger.info(f"[DECK COMPOSER] ✅ EXTRACTED {len(search_terms)} search terms from database: {search_terms}")
                        else:
                            # Derive palette from existing theme without regenerating
                            palette = _palette_from_theme_obj(theme)
                    else:
                        logger.info("[DECK COMPOSER] No existing theme found in database")
                except Exception as e:
                    logger.error(f"Error checking existing theme: {e}")
                    # DON'T set theme = None here - preserve any theme we found from outline
            
            # ONLY check stylePreferences if no theme was preserved from outline
            # Don't overwrite preserved themes from outline.notes!
            logger.info(f"[DECK COMPOSER] DEBUG: About to check stylePreferences reconstruction - theme is None: {theme is None}, theme type: {type(theme)}")

            # Check stylePreferences ONLY if no theme was already found/preserved
            if theme is None:
                logger.info(f"[DECK COMPOSER] No theme preserved - checking stylePreferences for brand reconstruction")
                try:
                    style_prefs = getattr(deck_outline, 'stylePreferences', None)
                    logger.info(f"[DECK COMPOSER] DEBUG: Checking stylePreferences for brand data - type: {type(style_prefs)}")

                    if style_prefs:
                        # Access brand data from stylePreferences (ColorConfigItem structure)
                        brand_colors = []
                        brand_fonts = None
                        logo_url = None
                        vibe_context = None
                    
                        # Get vibe context
                        vibe_context = getattr(style_prefs, 'vibeContext', None)
                        logger.info(f"[DECK COMPOSER] DEBUG: vibe_context: {vibe_context}")
                    
                        # Get font
                        brand_fonts = getattr(style_prefs, 'font', None)
                        logger.info(f"[DECK COMPOSER] DEBUG: brand_fonts: {brand_fonts}")
                    
                        # Get logo
                        logo_url = getattr(style_prefs, 'logoUrl', None)
                        logger.info(f"[DECK COMPOSER] DEBUG: logo_url: {logo_url[:100] if logo_url else None}...")
                    
                        # Get colors from ColorConfigItem
                        colors_config = getattr(style_prefs, 'colors', None)
                        logger.info(f"[DECK COMPOSER] DEBUG: colors_config type: {type(colors_config)}")
                    
                        if colors_config:
                            logger.info(f"[DECK COMPOSER] DEBUG: Processing colors_config...")
                            # Extract colors from ColorConfigItem (background, accent1, accent2, accent3, text)
                            background = getattr(colors_config, 'background', None)
                            accent1 = getattr(colors_config, 'accent1', None)
                            accent2 = getattr(colors_config, 'accent2', None)
                            accent3 = getattr(colors_config, 'accent3', None)
                            text = getattr(colors_config, 'text', None)

                            logger.info(f"[DECK COMPOSER] DEBUG: Raw colors - background: {background}, accent1: {accent1}, accent2: {accent2}, accent3: {accent3}, text: {text}")

                            # Build brand_colors array using the EXACT SAME logic as the working theme API
                            if accent1:
                                brand_colors.append(accent1)
                            if accent2:  # Include the missing red color!
                                brand_colors.append(accent2)
                            if accent3:
                                brand_colors.append(accent3)
                            if background and background.upper() != '#FFFFFF':  # Don't include white initially
                                brand_colors.append(background)
                            if text and text.upper() != '#000000':  # Don't include black
                                brand_colors.append(text)

                            # For brand palettes like McDonald's, we need the white background too
                            if background and background.upper() == '#FFFFFF' and len(brand_colors) > 0:
                                brand_colors.append(background)  # Include white as part of brand palette - THE FIX!
                            
                    logger.info(f"[DECK COMPOSER] DEBUG: Extracted brand data - colors: {brand_colors}, fonts: {brand_fonts}, logo: {logo_url[:60] if logo_url else None}...")
                
                    if brand_colors:
                        logger.info(f"[DECK COMPOSER] ✅ CREATING THEME FROM BRAND DATA (preventing duplication)")
                        
                        # Enhance minimal brand colors if needed (< 4 colors)
                        final_brand_colors = brand_colors
                        if len(brand_colors) < 4:
                            logger.info(f"[DECK COMPOSER] Brand has only {len(brand_colors)} colors, enhancing with Huemint AI")
                            try:
                                from agents.tools.theme import enhance_minimal_brand_colors
                                
                                # We're in an async function, so we can await directly
                                enhanced = await enhance_minimal_brand_colors(
                                    brand_colors=brand_colors,
                                    brand_name=vibe_context or "Brand",
                                    min_colors=5
                                )
                                
                                if enhanced['enhanced']:
                                    final_brand_colors = enhanced['colors']
                                    logger.info(f"[DECK COMPOSER] ✅ Enhanced brand colors: {len(brand_colors)} → {len(final_brand_colors)}")
                                    logger.info(f"[DECK COMPOSER] Original: {enhanced['brand_colors']}, AI-generated: {enhanced['generated_colors']}")
                                else:
                                    logger.info(f"[DECK COMPOSER] Brand has sufficient colors, no enhancement needed")
                            except Exception as e:
                                logger.warning(f"[DECK COMPOSER] Brand color enhancement failed: {e}, using original colors")
                        
                        # Create theme from brand data using EXACT format as working theme API
                        theme_dict = {
                            "theme_name": f"{vibe_context.replace('.com', '').replace('www.', '').title()} Brand Theme" if vibe_context else "Brand Theme",
                            "color_palette": {
                                "primary_background": "#FFFFFF",
                                "primary_text": "#1F2937",
                                "accent_1": final_brand_colors[0] if len(final_brand_colors) > 0 else "#FF4301",
                                "accent_2": final_brand_colors[1] if len(final_brand_colors) > 1 else (final_brand_colors[0] if len(final_brand_colors) > 0 else "#F59E0B"),
                                "colors": final_brand_colors[:6],  # Use enhanced colors
                                "metadata": {
                                    "logo_url": logo_url
                                } if logo_url else {}
                            },
                            "typography": {
                                "hero_title": {"family": brand_fonts if brand_fonts else "Inter"},
                                "body_text": {"family": brand_fonts if brand_fonts else "Inter"}
                            },
                            "brandInfo": {
                                "logoUrl": logo_url
                            } if logo_url else {},
                            "visual_style": {}
                        }
                        
                        theme = ThemeSpec.from_dict(theme_dict)
                        
                        # Create palette matching working theme API format (use enhanced colors)
                        palette = {
                            "colors": final_brand_colors,  # Use enhanced colors
                            "fonts": [brand_fonts] if brand_fonts else [],
                            "logo_url": logo_url
                        }
                        
                        logger.info(f"[DECK COMPOSER] ✅ Successfully reconstructed theme from stylePreferences!")
                        logger.info(f"[DECK COMPOSER] Theme: {theme.theme_name}")
                        logger.info(f"[DECK COMPOSER] Colors: {final_brand_colors}")
                        if len(final_brand_colors) > len(brand_colors):
                            logger.info(f"[DECK COMPOSER] 🎨 Enhanced from {len(brand_colors)} to {len(final_brand_colors)} colors")
                    else:
                        logger.info(f"[DECK COMPOSER] DEBUG: No usable brand data in stylePreferences - style_prefs: {style_prefs is not None}, brand_colors: {brand_colors}")
                        
                except Exception as e:
                    logger.error(f"[DECK COMPOSER] Error reconstructing theme from stylePreferences: {e}")
                    import traceback
                    logger.error(f"Traceback: {traceback.format_exc()}")
            else:
                logger.info(f"[DECK COMPOSER] ✅ SKIPPING stylePreferences reconstruction - theme already preserved from outline!")
            
            
            # ONLY generate new theme if absolutely no theme found anywhere
            logger.info(f"[DECK COMPOSER] DEBUG: Final theme check before generation - theme is None: {theme is None}, theme type: {type(theme)}, theme truthy: {bool(theme)}")
            if not theme:
                logger.info("[DECK COMPOSER] No theme found - using default theme without regeneration")
                theme = default_theme
                palette = _palette_from_theme_obj(theme)
                if not palette:
                    palette = dict(default_palette)
            else:
                logger.info("[DECK COMPOSER] ✅ Using existing theme from outline - skipping theme generation")
                logger.info(f"[DECK COMPOSER] Preserving theme: {getattr(theme, 'theme_name', 'unnamed') if hasattr(theme, 'theme_name') else 'theme from outline'}")
            
            # CRITICAL: Generate per-slide search terms if we don't have any yet
            if not search_terms or (isinstance(search_terms, dict) and len(search_terms) == 0):
                logger.info("[DECK COMPOSER] No search terms found - generating per-slide fallback terms...")
                try:
                    import re
                    slides = deck_outline.slides if hasattr(deck_outline, 'slides') else []
                    
                    stopwords = {
                        'the', 'a', 'an', 'and', 'or', 'for', 'of', 'to', 'in', 'on', 'our', 'your', 
                        'how', 'what', 'why', 'when', 'where', 'from', 'with', 'about', 'into',
                        'stat', 'quote', 'title', 'slide', 'introduction', 'conclusion', 'callout'
                    }
                    
                    # Generate per-slide terms
                    search_terms = {}
                    for slide_idx, slide in enumerate(slides[:10]):
                        slide_title = getattr(slide, 'title', '')
                        slide_content = getattr(slide, 'content', '')[:200]  # First 200 chars
                        
                        # Combine title and content
                        text = f"{slide_title} {slide_content}"
                        # Remove punctuation
                        text = re.sub(r'[:\-\"\'\•\|]', ' ', text)
                        words = text.split()
                        
                        # Extract key nouns
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
                            search_terms[str(slide_idx)] = key_words[:2]  # 2 terms per slide
                    
                    logger.info(f"[DECK COMPOSER] ✅ Generated {len(search_terms)} slides with fallback terms")
                    for slide_idx, terms in list(search_terms.items())[:3]:
                        logger.info(f"  Slide {slide_idx}: {terms}")
                except Exception as e:
                    logger.error(f"[DECK COMPOSER] Error generating fallback search terms: {e}")
                    search_terms = {}
            
            # Normalize theme & palette to ensure all required fields exist and are consistent across slides
            def _normalize_theme_and_palette(theme_obj: ThemeSpec, palette_dict: Dict[str, Any]) -> tuple[ThemeSpec, Dict[str, Any]]:
                try:
                    # Convert to dict for manipulation
                    td = theme_obj.to_dict() if hasattr(theme_obj, 'to_dict') else dict(theme_obj)
                    colors = td.get('color_palette', {}) or {}
                    # Map alternate keys to canonical
                    def first(*keys, default=None):
                        for k in keys:
                            v = colors.get(k)
                            if isinstance(v, str) and v:
                                return v
                        return default
                    # Canonical color fields - preserve existing colors when available
                    primary_bg = first('primary_background', 'primary_bg', 'background', default='#FFFFFF')  # Use white instead of dark blue default
                    secondary_bg = first('secondary_background', 'secondary_bg', default=primary_bg)  # Use primary_bg instead of dark blue
                    primary_text = first('primary_text', 'text', default='#1F2937')  # Use dark text for white background
                    accent_1 = first('accent_1', 'accent', 'primary', default='#10b981')
                    accent_2 = first('accent_2', 'secondary', default='#f97316')
                    colors.update({
                        'primary_background': primary_bg,
                        'secondary_background': secondary_bg,
                        'primary_text': primary_text,
                        'accent_1': accent_1,
                        'accent_2': accent_2,
                    })
                    # Ensure color list preserves and enriches rather than shrinking to two accents
                    try:
                        # Merge any palette-provided colors (often richer) into theme color list
                        pd_source = palette_dict or {}
                        existing_list = [c for c in (colors.get('colors') or []) if isinstance(c, str)]
                        palette_list = [c for c in (pd_source.get('colors') or []) if isinstance(c, str)]
                        # Only consider explicit backgrounds from the palette (avoid default fallback colors)
                        bg_candidates = [c for c in (pd_source.get('backgrounds') or []) if isinstance(c, str)]
                        candidates = [accent_1, accent_2] + bg_candidates
                        logger.info(f"[COLOR TRACE EARLY] existing_list: {existing_list}")
                        logger.info(f"[COLOR TRACE EARLY] palette_list: {palette_list}")
                        logger.info(f"[COLOR TRACE EARLY] candidates: {candidates}")
                        # Keep order, drop duplicates - PRESERVE ALL BRAND COLORS including white
                        enriched = list(dict.fromkeys(
                            [c for c in (palette_list + existing_list + candidates) if isinstance(c, str) and c]
                        ))
                        logger.info(f"[COLOR TRACE EARLY] enriched result: {enriched}")
                        if enriched:
                            logger.info(f"[COLOR TRACE EARLY] Setting colors['colors'] = {enriched}")
                            colors['colors'] = enriched
                    except Exception:
                        pass
                    td['color_palette'] = colors
                    # Typography defaults
                    typo = td.get('typography', {}) or {}
                    hero = typo.get('hero_title') or {}
                    body = typo.get('body_text') or {}
                    if not isinstance(hero, dict) or not hero.get('family'):
                        hero = {'family': hero.get('family', 'Montserrat'), 'size': hero.get('size', 180), 'weight': hero.get('weight', '700')}
                    if not isinstance(body, dict) or not body.get('family'):
                        body = {'family': body.get('family', 'Poppins'), 'size': body.get('size', 36), 'weight': body.get('weight', '400')}
                    typo['hero_title'] = hero
                    typo['body_text'] = body
                    td['typography'] = typo
                    # Design tokens (used by prompt builder)
                    ve = td.get('visual_effects', {}) or {}
                    design_tokens = ve.get('design_tokens', {}) or {}
                    design_tokens.setdefault('corner_radius', 16)
                    design_tokens.setdefault('grid_gap', 24)
                    design_tokens.setdefault('shadow', '0 8px 24px rgba(0,0,0,0.18)')
                    design_tokens.setdefault('card_bg', colors['primary_background'] + 'cc' if colors['primary_background'].startswith('#') else 'rgba(10,14,39,0.8)')
                    design_tokens.setdefault('stroke_width', 2)
                    design_tokens.setdefault('animation_speed', 1.0)
                    ve['design_tokens'] = design_tokens
                    td['visual_effects'] = ve
                    # Normalize palette too (keep deterministic; no randomness later)
                    pd = palette_dict or {}
                    pd.setdefault('backgrounds', [primary_bg, secondary_bg])
                    # Preserve original colors if they exist, otherwise use accents as fallback
                    existing_colors = colors.get('colors', []) if isinstance(colors.get('colors'), list) else []
                    logger.info(f"[COLOR TRACE] existing_colors from theme: {existing_colors}")
                    if not existing_colors:
                        pd.setdefault('colors', [accent_1, accent_2])
                        logger.info(f"[COLOR TRACE] Using fallback accents: [{accent_1}, {accent_2}]")
                    else:
                        pd.setdefault('colors', existing_colors)
                        logger.info(f"[COLOR TRACE] Preserving original colors: {existing_colors}")
                    # Check if brand text colors exist in theme, otherwise use defaults
                    brand_text_colors = colors.get('text_colors')
                    if brand_text_colors and isinstance(brand_text_colors, dict):
                        # Use brand text colors from theme (already set by theme_director)
                        pd.setdefault('text_colors', brand_text_colors)
                        logger.debug(f"[PALETTE NORM] Using brand text colors: {brand_text_colors}")
                    else:
                        # Use computed text colors
                        pd.setdefault('text_colors', {
                            'primary': primary_text,
                            'on_accent_1': '#FFFFFF',
                            'on_accent_2': '#FFFFFF'
                        })
                        logger.debug(f"[PALETTE NORM] Using computed text colors: {primary_text}")
                    # Enrich emitted palette colors with non-neutral backgrounds while preserving any existing list
                    try:
                        col_list = [c for c in (pd.get('colors') or []) if isinstance(c, str)]
                        bg_list = [c for c in (pd.get('backgrounds') or []) if isinstance(c, str)]
                        logger.info(f"[COLOR TRACE] Before enrichment - col_list: {col_list}, bg_list: {bg_list}")
                        for extra in bg_list:
                            # PRESERVE ALL BRAND COLORS including white backgrounds
                            if isinstance(extra, str) and extra and extra not in col_list:
                                col_list.append(extra)
                                logger.info(f"[COLOR TRACE] Added background color {extra} to colors")
                        if col_list:
                            logger.info(f"[COLOR TRACE] Final enriched colors: {col_list}")
                            pd['colors'] = col_list
                    except Exception:
                        pass
                    # Rebuild ThemeSpec
                    normalized_theme = ThemeSpec.from_dict(td)
                    return normalized_theme, pd
                except Exception as e:
                    logger.warning(f"[DECK COMPOSER] Theme normalization failed: {e}")
                    return theme_obj, palette_dict

            theme, palette = _normalize_theme_and_palette(theme, palette)

            # Final safety: if theme has accents but palette provides backgrounds, ensure we use those backgrounds
            try:
                td_dict = theme.to_dict() if hasattr(theme, 'to_dict') else theme
                cp = (td_dict or {}).get('color_palette', {}) or {}
                pal_bgs = palette.get('backgrounds') if isinstance(palette, dict) else None
                if isinstance(pal_bgs, list) and pal_bgs:
                    # Use backgrounds in the order they appear in brandfetch data (no sorting)
                    backgrounds = [c for c in pal_bgs if isinstance(c, str)]
                    if backgrounds:
                        cp['primary_background'] = backgrounds[0]  # First color from brandfetch
                        if len(backgrounds) > 1:
                            cp['secondary_background'] = backgrounds[1]
                        # Map accents from DB palette colors as well for consistency
                        pal_colors = palette.get('colors') if isinstance(palette, dict) else None
                        if isinstance(pal_colors, list) and pal_colors:
                            def _rgb_tuple(hex_str: str):
                                s = str(hex_str).lstrip('#')
                                return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
                            def _colorfulness(hex_str: str) -> float:
                                r, g, b = _rgb_tuple(hex_str)
                                return max(abs(r-g), abs(g-b), abs(b-r)) / 255.0
                            def _is_extreme_brightness(hex_str: str) -> bool:
                                try:
                                    val = _est_b(hex_str)
                                    return val < 0.12 or val > 0.92
                                except Exception:
                                    return False
                            scored = [
                                (
                                    _colorfulness(c),
                                    -abs(_est_b(c) - 0.5),
                                    c
                                ) for c in pal_colors if isinstance(c, str) and not _is_extreme_brightness(c)
                            ]
                            if not scored:
                                scored = [(
                                    _colorfulness(c),
                                    -abs(_est_b(c) - 0.5),
                                    c
                                ) for c in pal_colors if isinstance(c, str)]
                            scored.sort(reverse=True)
                            if scored:
                                cp['accent_1'] = scored[0][2]
                                cp['accent_2'] = scored[1][2] if len(scored) > 1 else scored[0][2]
                        # Prefer palette-provided text color for readability on chosen background
                        if isinstance(palette, dict):
                            tc = palette.get('text_colors') or {}
                            if isinstance(tc, dict) and isinstance(tc.get('primary'), str):
                                cp['primary_text'] = tc['primary']
                        td_dict['color_palette'] = cp
                        theme = ThemeSpec.from_dict(td_dict)
            except Exception:
                pass

            # Persist agent-based theme document if available (deck.data.slide_themes)
            try:
                from utils.supabase import upload_deck, get_deck
                # Load current deck record and attach theme/slide_themes in data field
                existing = get_deck(deck_uuid) or {}
                data_field = existing.get('data', {}) if isinstance(existing.get('data'), dict) else {}
                if isinstance(theme, ThemeSpec):
                    theme_dict_to_save = theme.to_dict()
                elif hasattr(theme, 'to_dict'):
                    theme_dict_to_save = theme.to_dict()
                else:
                    theme_dict_to_save = theme
                # IMPORTANT: Do not include 'slides' here to avoid racing with slide saves
                deck_payload = {
                    'name': deck_outline.title,
                    'theme': theme_dict_to_save,
                    'style_spec': {'palette': palette} if isinstance(palette, dict) else {},
                }
                # Preserve existing slide_themes and merge with any new ones from ThemeDirector
                if isinstance(existing.get('data'), dict) and 'slide_themes' in existing['data']:
                    data_field['slide_themes'] = existing['data']['slide_themes']
                try:
                    if 'theme_doc' in locals() and theme_doc is not None:
                        slide_themes_doc = getattr(theme_doc, 'slide_themes', None)
                        if isinstance(slide_themes_doc, dict) and slide_themes_doc:
                            # Merge: new overlays override existing keys
                            base = data_field.get('slide_themes', {}) if isinstance(data_field.get('slide_themes'), dict) else {}
                            merged = dict(base)
                            merged.update(slide_themes_doc)
                            data_field['slide_themes'] = merged
                except Exception:
                    pass
                if data_field:
                    deck_payload['data'] = data_field
                upload_deck(deck_payload, deck_uuid, options.get('user_id'))
            except Exception:
                pass

            # Emit theme completion progress
            yield {
                "type": "progress",
                "data": {
                    "phase": "theme_generation",
                    "progress": 30,
                    "message": "Theme ready",
                    "substep": "theme_complete"
                }
            }
            
            # Emit theme_generated event for frontend
            # Handle case where theme might be a ThemeSpec or dict
            if isinstance(theme, ThemeSpec):
                theme_dict = theme.to_dict()
            elif hasattr(theme, 'to_dict'):
                theme_dict = theme.to_dict()
            else:
                theme_dict = theme
                
            # Normalize palette to avoid streaming backgrounds twice
            # If theme already exposes primary/secondary background, drop palette.backgrounds
            safe_palette = palette
            try:
                if isinstance(safe_palette, dict):
                    safe_palette = dict(safe_palette)
                    cp = theme_dict.get('color_palette', {}) if isinstance(theme_dict, dict) else {}
                    if cp.get('primary_background') or cp.get('secondary_background'):
                        if 'backgrounds' in safe_palette:
                            del safe_palette['backgrounds']
            except Exception:
                pass

            try:
                colors_len = 0
                if isinstance(safe_palette, dict):
                    cl = safe_palette.get('colors')
                    if isinstance(cl, list):
                        colors_len = len(cl)
                logger.info(f"[DECK COMPOSER] Emitting theme_generated with palette.colors={colors_len}")
            except Exception:
                pass

            yield {
                "type": "theme_generated",
                "timestamp": datetime.now().isoformat(),
                "theme": theme_dict,
                "palette": safe_palette
            }
            
            # Create style manifesto with the theme
            # Build a manifesto palette that exposes both legacy keys (primary_bg) and
            # normalized keys (primary_background) so downstream styling stays in sync
            manifesto_palette: Dict[str, Any] = {}
            theme_palette = theme_dict.get('color_palette') if isinstance(theme_dict, dict) else {}
            if isinstance(theme_palette, dict):
                manifesto_palette.update(theme_palette)
            if isinstance(palette, dict):
                for key, value in palette.items():
                    # Do not clobber brand colors that already exist on the theme palette
                    manifesto_palette.setdefault(key, value)

            # Provide explicit aliases expected by the manifesto prompt builder
            def _alias(src: str, dest: str):
                if src in manifesto_palette and dest not in manifesto_palette:
                    manifesto_palette[dest] = manifesto_palette[src]

            _alias('primary_background', 'primary_bg')
            _alias('primary_bg', 'primary_background')
            _alias('secondary_background', 'secondary_bg')
            _alias('secondary_bg', 'secondary_background')
            _alias('primary_text', 'text')
            _alias('text', 'primary_text')
            _alias('secondary_text', 'secondaryText')
            _alias('secondaryText', 'secondary_text')
            _alias('accent_1', 'accent1')
            _alias('accent1', 'accent_1')
            _alias('accent_2', 'accent2')
            _alias('accent2', 'accent_2')

            style_spec = {
                "theme": theme_dict,
                "palette": palette,
                "color_palette": manifesto_palette,
                "design_tokens": getattr(theme, 'visual_effects', {}).get('design_tokens', {}) if hasattr(theme, 'visual_effects') else {}
            }
            style_manifesto = self.theme_manager.create_style_manifesto(style_spec)
            
            logger.info(f"[DECK COMPOSER] Theme ready - proceeding with deck generation")
            logger.info(f"  - Theme name: {theme_dict.get('theme_name', 'Unknown')}")
            if 'color_palette' in theme_dict:
                logger.info(f"  - Primary color: {theme_dict['color_palette'].get('primary', 'Not set')}")

            # Generate editorial layouts using LayoutArchitect
            print("\n" + "="*80)
            print("🎨 LAYOUT ARCHITECT V2 - Starting...")
            print("="*80 + "\n")
            logger.info("[DECK COMPOSER] Generating editorial layouts with LayoutArchitect...")
            try:
                from agents.generation.layout_architect import LayoutArchitect
                from agents.prompts.generation.optimized_component_schemas import get_optimized_component_schemas

                print("✅ LayoutArchitect imported successfully")

                # Start layout_design phase
                yield progress.start_phase(GenerationPhase.LAYOUT_DESIGN)

                # Initialize LayoutArchitect
                component_schemas = get_optimized_component_schemas()
                layout_architect = LayoutArchitect(component_schemas=component_schemas)
                print(f"✅ LayoutArchitect initialized with {len(component_schemas)} component schemas")

                # Generate per-slide layouts
                print(f"🎨 Designing layouts for {len(deck_outline.slides)} slides...")
                slide_blueprints = await layout_architect.design_layouts(
                    deck_outline=deck_outline,
                    existing_theme=theme_dict,
                    progress_callback=lambda phase, msg: print(f"[LAYOUT ARCHITECT] {phase}: {msg}")
                )

                print(f"✅ Generated {len(slide_blueprints)} layout blueprints")

                # Store blueprints in theme for access by SlidePromptBuilder
                if isinstance(theme, ThemeSpec):
                    if not hasattr(theme, 'slide_themes'):
                        theme.slide_themes = {}
                    theme.slide_themes = slide_blueprints
                    logger.info(f"[DECK COMPOSER] ✅ Added {len(slide_blueprints)} layout blueprints to ThemeSpec")
                    print(f"✅ Stored blueprints in ThemeSpec.slide_themes")

                # Also add to theme_dict for serialization
                theme_dict['slide_themes'] = slide_blueprints
                print(f"✅ Stored blueprints in theme_dict")

                print("\n" + "="*80)
                print(f"🎉 LAYOUT ARCHITECT COMPLETE - {len(slide_blueprints)} slides designed!")
                print("="*80 + "\n")

                # Complete layout_design phase
                yield progress.update_phase_progress(
                    GenerationPhase.LAYOUT_DESIGN,
                    1.0,
                    message=f"Designed layouts for {len(slide_blueprints)} slides"
                )
            except Exception as e:
                print(f"\n❌ ERROR in LayoutArchitect: {e}")
                logger.error(f"[DECK COMPOSER] Error generating layouts: {e}")
                import traceback
                error_trace = traceback.format_exc()
                print(error_trace)
                logger.error(f"Traceback: {error_trace}")
                print("⚠️  Continuing without layouts - will use default system\n")
                # Continue without layouts - generation will use defaults

            # Process tagged media to upload base64 images to Supabase
            # Check if any media needs processing
            needs_media_processing = False
            for slide in deck_outline.slides:
                if hasattr(slide, 'taggedMedia') and slide.taggedMedia:
                    for media in slide.taggedMedia:
                        # Handle both dict and Pydantic object cases
                        if hasattr(media, 'previewUrl'):
                            # Pydantic object
                            preview_url = media.previewUrl or ''
                        else:
                            # Dictionary
                            preview_url = media.get('previewUrl', '')
                        
                        if preview_url.startswith('data:'):
                            needs_media_processing = True
                            break
                    if needs_media_processing:
                        break
            
            if needs_media_processing:
                yield progress.start_phase(GenerationPhase.IMAGE_COLLECTION)
                yield progress.update_phase_progress(GenerationPhase.IMAGE_COLLECTION, 0.5, "Processing uploaded media")
                await self.media_processor.process_deck_outline_media(deck_outline)
                yield progress.update_phase_progress(GenerationPhase.IMAGE_COLLECTION, 1.0, "Media processing complete")
            else:
                logger.info("Tagged media already processed, skipping media processing phase")
            
            # Image search: different behavior based on async_images setting
            image_search_task = None

            # When async_images=False (auto-apply ON), we need to search for images synchronously BEFORE slides
            # When async_images=True (auto-apply OFF/placeholders), we search in background during slide generation
            # CRITICAL: Default must match compose_deck_stream signature (True = async/placeholders)
            async_images_mode = options.get('async_images', True)

            # Check if auto-select images is enabled in stylePreferences
            auto_select_images = False
            if hasattr(deck_outline, 'stylePreferences') and deck_outline.stylePreferences:
                auto_select_images = getattr(deck_outline.stylePreferences, 'autoSelectImages', False)

            # If auto-select is enabled, SKIP backend image search entirely
            # The frontend will handle image search and application using metadata.searchQuery
            skip_image_search = auto_select_images
            if skip_image_search:
                logger.info(f"🔍 AUTO-SELECT IMAGES ENABLED: Skipping backend SerpAPI search (24 images/slide)")
                logger.info(f"🔍 Frontend will search and apply images using metadata.searchQuery from components")

            logger.debug(f"[SEARCH MODE CHECK] async_images={async_images_mode}, image_manager={self.image_manager is not None}, auto_select={auto_select_images}, skip_search={skip_image_search}")
            logger.debug(f"  AUTO-APPLY MODE (sync search): {not async_images_mode and self.image_manager and not skip_image_search}")
            logger.debug(f"  PLACEHOLDER MODE (async search): {async_images_mode and self.image_manager and not skip_image_search}")

            if not async_images_mode and self.image_manager and not skip_image_search:
                # AUTO-APPLY MODE: Search for images synchronously BEFORE slide generation
                logger.debug(f"AUTO-APPLY MODE: Searching for images synchronously BEFORE slide generation...")
                logger.info("🎯 AUTO-APPLY MODE: Searching for images synchronously before slide generation...")
                logger.info(f"🔍 IMAGE SEARCH CONFIG: async_images={async_images_mode}, image_manager={self.image_manager is not None}")
                logger.info(f"🔍 Deck has {len(deck_outline.slides)} slides to search images for")
                logger.info(f"🎨 AI-GENERATED SEARCH TERMS: {search_terms if search_terms else 'None (will use fallback)'}")

                # Start image collection phase if not already started
                if not needs_media_processing:
                    yield progress.start_phase(GenerationPhase.IMAGE_COLLECTION)

                yield {
                    "type": "image_search_started",
                    "message": "Searching for images to auto-apply",
                    "progress": 15
                }

                # Image recommendations removed: do not collect or prefetch images during generation
                try:
                    pass

                    # EMIT slide_images_found events with images grouped by search term
                    logger.debug(f"EMITTING slide_images_found events for {len(all_images)} slides")
                    for slide_idx, slide in enumerate(deck_outline.slides):
                        if slide.id in all_images:
                            images_by_term = all_images[slide.id]  # Dict: {term: [images]}
                            slide_terms = slide_search_queries.get(slide.id, [])
                            
                            logger.debug(f"  Preparing event for slide {slide_idx + 1}: {slide.title}")
                            logger.debug(f"    slide.id: {slide.id}")
                            logger.debug(f"    terms: {slide_terms}")
                            logger.debug(f"    images by term: {list(images_by_term.keys())}")
                            
                            # Format images grouped by search term
                            formatted_images_by_term = {}
                            total_images = 0
                            
                            for term, term_images in images_by_term.items():
                                formatted_term_images = []
                                for img in term_images:
                                    formatted_term_images.append({
                                        'id': img.get('id', f"img-{slide.id}-{total_images}"),
                                        'url': img.get('url', ''),
                                        'thumbnail': img.get('thumbnail', img.get('url', '')),
                                        'alt': img.get('alt', ''),
                                        'photographer': img.get('photographer'),
                                        'photographer_url': img.get('photographer_url'),
                                        'width': img.get('width'),
                                        'height': img.get('height'),
                                        'source': img.get('source', 'serpapi'),
                                        'topic': term,
                                        'searchQuery': term
                                    })
                                    total_images += 1
                                formatted_images_by_term[term] = formatted_term_images
                            
                            # Emit slide_images_found event with component-specific structure
                            yield {
                                "type": "slide_images_found",
                                "data": {
                                    "slide_id": slide.id,
                                    "slide_index": slide_idx,
                                    "slide_title": slide.title,
                                    "images_by_search_term": formatted_images_by_term,
                                    "search_terms": slide_terms,
                                    "total_count": total_images
                                }
                            }
                            logger.info(f"📤 Emitted slide_images_found for slide {slide_idx + 1}: {total_images} images across {len(slide_terms)} terms")
                            logger.debug(f"Emitted slide_images_found event for slide {slide_idx + 1}: {total_images} images, {len(slide_terms)} terms")

                    yield {
                        "type": "image_search_complete",
                        "message": "Images ready for auto-application",
                        "progress": 25
                    }

                    # CRITICAL: Small delay to ensure all taggedMedia is properly set
                    await asyncio.sleep(0.75)
                    
                    # Extra safety: verify all slides have tagged media; if not, wait a bit more
                    slides_with_media = sum(1 for s in deck_outline.slides if hasattr(s, 'taggedMedia') and s.taggedMedia)
                    if slides_with_media < len(deck_outline.slides):
                        logger.warning(f"⚠️ Only {slides_with_media}/{len(deck_outline.slides)} slides have images after sync search; waiting a bit more...")
                        await asyncio.sleep(0.75)
                    logger.debug(f"Proceeding to slide generation with tagged images...")

                except Exception as e:
                    logger.error(f"Error in synchronous image search: {e}")
                    import traceback
                    logger.error(traceback.format_exc())

            elif async_images_mode and self.image_manager and not skip_image_search:
                # PLACEHOLDER MODE: Start image collection phase if not already started
                if not needs_media_processing:
                    yield progress.start_phase(GenerationPhase.IMAGE_COLLECTION)

                logger.debug(f"PLACEHOLDER MODE: Starting ASYNC background image search...")
                logger.info("Starting background image search...")
                logger.info(f"🔍 IMAGE SEARCH CONFIG: async_images={async_images_mode}, image_manager={self.image_manager is not None}")
                logger.info(f"🔍 Deck has {len(deck_outline.slides)} slides to search images for")
                
                # Create a callback to yield image updates
                async def image_update_callback(update):
                    # Forward the image update through the composition stream
                    logger.debug(f"📸 IMAGE UPDATE RECEIVED: type={update.get('type')}, slide_id={update.get('slide_id', 'N/A')}")
                    if update.get('type') == 'slide_images_found':
                        data = update.get('data', {})
                        logger.debug(f"📸 SLIDE IMAGES: slide_index={data.get('slide_index')}, images_count={data.get('images_count')}, slide_title={data.get('slide_title')}")
                    elif update.get('type') == 'topic_images_found':
                        data = update.get('data', {})
                        logger.debug(f"📸 TOPIC IMAGES: topic={data.get('topic')}, images_count={data.get('images_count')}")
                    
                    # Queue the update
                    self._image_update_queue.append(update)
                
                # Initialize queue for image updates
                self._image_update_queue = []
                self._image_updates_ready = asyncio.Event()
                
                # Start background image search
                # Format search terms for deck-wide search
                search_queries = None
                if search_terms:
                    # Use special "deck_wide" format that the image service expects
                    search_queries = {
                        "deck_wide": {
                            "selected_searches": search_terms
                        }
                    }
                    logger.info(f"🔍 Passing deck-wide search queries: {search_queries}")
                
                # search_images_background returns a coroutine, need to create task
                image_search_task = asyncio.create_task(
                    self.image_manager.search_images_background(
                    deck_outline=deck_outline,
                    deck_uuid=deck_uuid,
                    callback=image_update_callback,
                    max_images_per_slide=6,
                    search_queries=search_queries  # Pass search terms in correct format
                    )
                )
                
                logger.info(f"🔍 Background image search task created: {image_search_task}")
                logger.debug(f"Background image search task created!")
                
                yield {
                    "type": "image_search_started",
                    "message": "Background image search started",
                    "progress": 15
                }
            else:
                logger.warning(f"⚠️ IMAGE SEARCH SKIPPED: async_images={async_images_mode}, image_manager={self.image_manager is not None}")
                logger.debug(f"IMAGE SEARCH SKIPPED:")
                logger.debug(f"  async_images: {async_images_mode}")
                logger.debug(f"  image_manager: {self.image_manager is not None}")
            
            # Theme is already generated above, no need to check or generate again
            logger.info("[DECK COMPOSER] Theme is ready, proceeding to slide generation phase")

            # Phase 2: Slide generation
            logger.debug(f"[ADAPTERS] STARTING SLIDE GENERATION PHASE")
            logger.debug(f"TIMING CHECK: About to generate {len(deck_outline.slides)} slides")

            # Debug: Check how many slides have taggedMedia NOW (before generation starts)
            slides_with_tagged_media = 0
            for slide in deck_outline.slides:
                if hasattr(slide, 'taggedMedia') and slide.taggedMedia:
                    slides_with_tagged_media += 1

            logger.debug(f"PRE-GENERATION CHECK: {slides_with_tagged_media}/{len(deck_outline.slides)} slides have tagged media")
            yield progress.start_phase(GenerationPhase.SLIDE_GENERATION)
            logger.info(f"[DECK COMPOSER] Is default theme: {theme == default_theme}")
            
            deck_state = DeckState(
                deck_uuid=deck_uuid,
                deck_outline=deck_outline,
                theme=theme,
                palette=palette,
                style_manifesto=style_manifesto,
                notes=deck_outline.notes if hasattr(deck_outline, 'notes') else None,  # Include notes from outline
                slides=[
                    {
                        "id": slide.id,
                        "title": slide.title,
                        "components": [],
                        "status": SlideStatus.PENDING.value,
                        "taggedMedia": [
                            # Convert to dict if it's a Pydantic model
                            media.model_dump() if hasattr(media, 'model_dump') else media
                            for media in (slide.taggedMedia if hasattr(slide, 'taggedMedia') and slide.taggedMedia else [])
                        ]
                    }
                    for slide in deck_outline.slides
                ]
            )
            
            # Verify theme was set on deck_state
            logger.info(f"[DECK COMPOSER] deck_state.theme is set: {deck_state.theme is not None}")
            if deck_state.theme:
                logger.info(f"[DECK COMPOSER] deck_state.theme type: {type(deck_state.theme)}")
                if hasattr(deck_state.theme, 'theme_name'):
                    logger.info(f"[DECK COMPOSER] deck_state.theme name: {deck_state.theme.theme_name}")
            # Update status for slide generation phase
            deck_state.update_progress(55, "Starting slide generation")
            
            # If image search is running, give it a brief head start
            if image_search_task and async_images_mode:
                logger.info("Giving image search a 2-second head start before slide generation...")
                await asyncio.sleep(2.0)  # Allow image search to populate some results
                
                # Check if we have any pending images yet
                if self.image_manager:
                    pending_count = sum(len(imgs) for imgs in self.image_manager.pending_images.values())
                    logger.info(f"After 2s wait: {pending_count} total pending images across all slides")
            
            # Generate slides
            from agents.domain.models import CompositionOptions
            comp_options = CompositionOptions(
                max_parallel_slides=options.get('max_parallel', 4),
                delay_between_slides=options.get('delay_between_slides', 0.5),
                async_images=async_images_mode,  # Use the extracted value
                prefetch_images=options.get('prefetch_images', False)
            )
            
            # Process slides and image updates together
            logger.debug(f"[ADAPTERS] About to call orchestrator.generate_slides_parallel")
            logger.debug(f"[ADAPTERS] orchestrator type: {type(self.orchestrator)}")
            logger.debug(f"[ADAPTERS] deck_state slides: {len(deck_state.slides)}")
            
            slide_generator = self.orchestrator.generate_slides_parallel(
                deck_state=deck_state,
                options=comp_options
            )
            
            # Track slide progress
            total_slides = len(deck_outline.slides)
            current_slide = 0
            
            # Yield updates from both slide generation and image search
            async for update in slide_generator:
                # Convert slide events to standardized progress events
                if update.get('type') == 'slide_started':
                    current_slide = update.get('slide_index', 0) + 1
                    yield progress.update_slide_progress(current_slide, substep='preparing_context')
                    # Also yield the original slide_started event for tracking parallelism
                    yield update
                    
                elif update.get('type') == 'slide_substep':
                    substep = update.get('substep')
                    # Map substeps to user-friendly messages
                    substep_messages = {
                        'preparing_context': 'Preparing slide context...',
                        'retrieving_context': 'Finding relevant content...',
                        'generating_content': 'Writing slide content...',
                        'applying_theme': 'Applying design theme...',
                        'finalizing': 'Finalizing slide...'
                    }
                    message = substep_messages.get(substep, f'Processing {substep}...')
                    yield progress.update_slide_progress(current_slide, substep=substep, message=message)
                    
                elif update.get('type') == 'slide_generated':
                    yield progress.update_slide_progress(current_slide, is_complete=True)
                    # Send slide_completed event for frontend
                    slide_idx = update.get('slide_index', 0)
                    yield {
                        'type': 'slide_completed',
                        'slide_index': slide_idx,
                        'slide_id': update.get('slide_id'),
                        'slide': update.get('slide_data'),
                        'timestamp': datetime.now().isoformat()
                    }
                    # Also yield the original slide_generated event for backward compatibility
                    yield update
                    
                elif update.get('type') == 'slide_error':
                    # Yield error but continue progress
                    yield progress.error(
                        f"Error generating slide {current_slide}",
                        slide_index=current_slide - 1,
                        error=update.get('error')
                    )
                elif update.get('type') == 'slides_generation_complete':
                    # All slides are done - pass through and continue to finalization
                    logger.info(f"✅ All slides generated: {update.get('completed_slides', 0)}/{update.get('total_slides', 0)}")
                    yield update
                    # Note: Loop will exit after this, continuing to deck finalization
                else:
                    # Pass through other events
                    yield update
                
                # Check for pending image updates and yield them
                if hasattr(self, '_image_update_queue'):
                    while self._image_update_queue:
                        image_update = self._image_update_queue.pop(0)
                        logger.debug(f"📤 YIELDING IMAGE UPDATE: {image_update.get('type')} - {image_update.get('message', '')}")
                        
                        # Log detailed info for slide_images_found
                        if image_update.get('type') == 'slide_images_found':
                            data = image_update.get('data', {})
                            images = data.get('images', [])
                            logger.debug(f"📤 YIELDING slide_images_found: slide_index={data.get('slide_index')}, images_count={len(images)}")
                        
                        yield image_update
            
            # Yield any remaining image updates
            if hasattr(self, '_image_update_queue'):
                logger.debug(f"📤 CHECKING REMAINING IMAGE UPDATES: {len(self._image_update_queue)} updates in queue")
                while self._image_update_queue:
                    image_update = self._image_update_queue.pop(0)
                    logger.debug(f"📤 YIELDING REMAINING IMAGE UPDATE: {image_update.get('type')} - {image_update.get('message', '')}")
                    yield image_update
            
            # Don't wait for image search - let it complete in background
            # This allows slides to be displayed immediately while images load
            if image_search_task and not image_search_task.done():
                logger.info("Image search continuing in background...")
                # Just check for any pending updates without blocking
                if hasattr(self, '_image_update_queue'):
                    while self._image_update_queue:
                        image_update = self._image_update_queue.pop(0)
                        yield image_update
            
            # === FINALIZATION PHASE ===
            logger.info("🏁 [DECK COMPOSER] Starting finalization phase...")
            
            # Theme is already ready at this point, no need to check again

            # Reconcile slides with latest persistence before final save
            logger.info(f"🔄 [DECK COMPOSER] Reconciling slides from database...")
            try:
                latest = await self.persistence.get_deck(deck_uuid)
                if latest and isinstance(latest.get('slides'), list) and latest['slides']:
                    deck_state.slides = latest['slides']
                    logger.info(f"✅ [DECK COMPOSER] Reconciled {len(deck_state.slides)} slides from persistence")
            except Exception as _reconcile_err:
                logger.warning(f"⚠️ [DECK COMPOSER] Slide reconciliation skipped: {_reconcile_err}")
            
            # Save final state
            logger.info(f"💾 [DECK COMPOSER] Saving final deck state...")
            await self.persistence.save_deck(deck_state.to_dict())
            
            # Update final deck status
            logger.info(f"✅ [DECK COMPOSER] Marking deck as completed...")
            deck_state.status = {
                'state': 'completed',
                'currentSlide': len(deck_state.slides),
                'totalSlides': len(deck_state.slides),
                'message': 'Deck generation completed successfully',
                'progress': 100,
                'phase': 'complete'
            }
            
            # Save final deck state
            await self.persistence.save_deck(deck_state.to_dict())
            logger.info(f"✅ [DECK COMPOSER] Deck {deck_uuid} marked as completed in database")
            
            # Complete - send single completion event
            logger.info(f"📤 [DECK COMPOSER] Sending deck_complete event...")
            completion_event = progress.complete(deck_uuid)
            logger.info(f"📤 [DECK COMPOSER] Completion event: {completion_event}")
            yield completion_event
            logger.info(f"🎉 [DECK COMPOSER] Deck {deck_uuid} composition fully complete!")
            
        except Exception as e:
            logger.error(f"Error in deck composition: {e}")
            # Update deck status to error (guard when deck_state not yet created)
            error_status = {
                'state': 'error',
                'message': f'Error during generation: {str(e)}',
                'error': str(e),
                'progress': 0,
                'phase': 'theme_generation'
            }
            try:
                if deck_state is not None:
                    # Preserve existing progress/phase if present
                    error_status['progress'] = deck_state.status.get('progress', 0) if isinstance(getattr(deck_state, 'status', {}), dict) else 0
                    error_status['phase'] = deck_state.status.get('phase', 'unknown') if isinstance(getattr(deck_state, 'status', {}), dict) else 'unknown'
                    deck_state.status = error_status
                    await self.persistence.save_deck(deck_state.to_dict())
                else:
                    # Save a minimal record to reflect the error state
                    minimal = {
                        'uuid': deck_uuid,
                        'name': deck_outline.title,
                        'slides': [],
                        'status': error_status
                    }
                    await self.persistence.save_deck(minimal)
            except Exception:
                pass
            yield progress.error(str(e), deck_id=deck_uuid)
        finally:
            # No theme task to cancel - theme generation is synchronous now
            
            # Cancel image search task if still running
            if 'image_search_task' in locals() and image_search_task and not image_search_task.done():
                logger.info(f"Cancelling image search task for deck {deck_uuid}")
                image_search_task.cancel()
                try:
                    await image_search_task
                except asyncio.CancelledError:
                    pass
            
            # Mark composition as ended
            if 'deck_uuid' in locals():
                self.persistence.end_composition(deck_uuid)
                # Force one final save to ensure everything is persisted
                if 'deck_state' in locals() and deck_state is not None:
                    await self.persistence.save_deck_with_user(deck_uuid, deck_state.to_dict(), user_id)
            
            # Note: Global deck lock is now released in api_deck_create_stream.py
            
            # Then release the user-specific deck generation slot
            if 'deck_uuid' in locals():
                # Use the same concurrency_user_id we used for acquisition
                concurrency_user_id = user_id if user_id else "anonymous"
                deck_task_id = f"deck_{deck_uuid}"  # Use same key format as acquisition
                await concurrency_manager.release_for_user(concurrency_user_id, deck_task_id)
                logger.info(f"✅ Released deck generation slot for user {concurrency_user_id}, deck {deck_uuid}")


class DeckComposerAdapter:
    """Adapts the old DeckComposerV2 interface to the refactored one."""
    
    def __init__(self, composer: SimpleDeckComposer):
        self.composer = composer
    
    async def compose_deck(
        self,
        deck_outline: DeckOutline,
        deck_uuid: str,
        max_parallel: int = 4,
        delay_between_slides: float = 0.5,
        async_images: bool = True,
        **kwargs
    ) -> AsyncIterator[Dict[str, Any]]:
        """Compose deck using the refactored system with old interface."""
        # Use the new interface - pass options as kwargs
        async for update in self.composer.compose_deck(
            deck_outline=deck_outline,
            deck_uuid=deck_uuid,
            max_parallel=max_parallel,
            delay_between_slides=delay_between_slides,
            async_images=async_images,
            prefetch_images=kwargs.get('prefetch_images', False)
        ):
            yield update
    
    # Proxy other methods if needed
    def __getattr__(self, name):
        """Proxy any other attribute access to the underlying composer."""
        return getattr(self.composer, name)


def create_refactored_deck_composer(registry):
    """Factory function to create the refactored deck composer."""
    logger.info("🏗️ Creating refactored deck composer...")
    
    from agents.generation.theme_style_manager import ThemeStyleManager
    from agents.generation.image_manager import ImageManager
    from services.registry_fonts import RegistryFonts
    
    # Get fonts
    available_fonts = RegistryFonts.get_available_fonts(registry)
    all_fonts_list = RegistryFonts.get_all_fonts_list(registry)
    
    # Create adapters
    theme_manager = ThemeManagerAdapter(ThemeStyleManager(available_fonts))
    slide_generator = create_refactored_slide_generator(
        registry, None, available_fonts, all_fonts_list
    )
    persistence = PersistenceAdapter(DeckPersistence())
    image_manager = ImageManager()
    
    logger.info(f"🏗️ Components created: theme_manager={theme_manager is not None}, slide_generator={slide_generator is not None}, persistence={persistence is not None}, image_manager={image_manager is not None}")
    
    # Create event bus
    from agents.application.event_bus import get_event_bus
    event_bus = get_event_bus()
    
    # Create the new deck composer
    composer = SimpleDeckComposer(
        slide_generator=slide_generator,
        theme_manager=theme_manager,
        persistence=persistence,
        event_bus=event_bus,
        image_manager=image_manager
    )
    
    # Wrap in adapter for compatibility
    return DeckComposerAdapter(composer) 
