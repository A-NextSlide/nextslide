"""
Adapters to connect refactored components with the existing system.
"""

from __future__ import annotations

from typing import Dict, Any, List, Optional, AsyncIterator
import os

from agents.core import ISlideGenerator, IThemeManager, IPersistence
from agents.domain.models import ThemeSpec, SlideGenerationContext
from agents.generation.context_builder import build_slide_context
from agents.generation.slide_generator import SlideGeneratorV2
from agents.generation.html_inspired_generator import HTMLInspiredSlideGenerator
from agents.generation.components.ai_generator import AISlideGenerator
from agents.generation.components.component_validator import ComponentValidator
from agents.persistence.deck_persistence import DeckPersistence
from models.requests import DeckOutline
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class SlideGeneratorAdapter:
    """Adapts the old SlideGenerator interface to the new architecture."""
    
    def __init__(self, registry, theme_system, available_fonts, all_fonts_list):
        # Create the new components
        self.ai_generator = AISlideGenerator()
        self.component_validator = ComponentValidator(registry)
        
        # Create the base slide generator
        base_generator = SlideGeneratorV2(
            ai_generator=self.ai_generator,
            component_validator=self.component_validator,
            registry=registry,
        )
        self.base_generator = base_generator
        self.prompt_builder = base_generator.prompt_builder
        
        # Wrap with HTML-inspired prompting (enabled by default, can disable with env var)
        use_html_inspired = os.getenv('USE_HTML_INSPIRED', 'true').lower() == 'true'
        
        if use_html_inspired:
            logger.info("🎨 HTML-inspired slide generation ENABLED (optimized prompts + caching)")
            self.generator = HTMLInspiredSlideGenerator(base_generator)
        else:
            logger.info("📝 Using base slide generation")
            self.generator = base_generator
        
        # Store for compatibility
        self.registry = registry
        self.theme_system = theme_system
        self.available_fonts = available_fonts
        self.all_fonts_list = all_fonts_list
    
    async def generate_slide(self, *args, **kwargs) -> AsyncIterator[Dict[str, Any]]:
        """Generate a slide - handles both old and new interfaces."""
        context: Optional[SlideGenerationContext]

        # Check if called with new interface (single SlideGenerationContext argument)
        if len(args) == 1 and isinstance(args[0], SlideGenerationContext):
            context = args[0]
        else:
            # Old interface with multiple parameters
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
                user_id = args[9] if len(args) > 9 else kwargs.get('user_id', None)
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
                user_id = kwargs.get('user_id', None)

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

            context = build_slide_context(
                deck_outline=deck_outline,
                slide_outline=slide_outline,
                slide_index=slide_index,
                theme=theme,
                palette=palette,
                style_manifesto=style_manifesto,
                deck_uuid=deck_uuid or "",
                async_images=async_images,
                available_images=available_images,
                user_id=user_id,
            )

        # Generate using new system
        async for update in self.generator.generate_slide(context):
            yield update

    async def _build_prompts(self, context: SlideGenerationContext) -> tuple[str, str]:
        """Expose prompt building for prewarm cache paths."""
        if hasattr(self.generator, "_build_prompts"):
            return await self.generator._build_prompts(context)
        if hasattr(self.base_generator, "_build_prompts"):
            return await self.base_generator._build_prompts(context)
        if getattr(self, "prompt_builder", None):
            system_prompt = self.prompt_builder.build_system_prompt()
            try:
                static_block, slide_block = self.prompt_builder.build_user_prompt_blocks(context)
                user_prompt = f"{static_block}\n<<<CACHE_BREAKPOINT>>>\n{slide_block}"
            except Exception:
                user_prompt = self.prompt_builder.build_user_prompt(context)
            return system_prompt, user_prompt
        raise AttributeError("Prompt builder is not available on slide generator")


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


def create_refactored_slide_generator(registry, theme_system, available_fonts, all_fonts_list):
    """Factory function to create the refactored slide generator."""
    return SlideGeneratorAdapter(registry, theme_system, available_fonts, all_fonts_list)


def create_refactored_deck_composer(registry):
    """Factory function to create the refactored deck composer."""
    logger.info("🏗️ Creating deck composer (v2=true)...")

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

    from agents.generation.deck_composer_v2 import DeckComposerV2
    logger.info("🚀 Using DeckComposerV2 (refactored)")
    composer = DeckComposerV2(
        slide_generator=slide_generator,
        theme_manager=theme_manager,
        persistence=persistence,
        event_bus=event_bus,
        image_manager=image_manager
    )
    return composer
