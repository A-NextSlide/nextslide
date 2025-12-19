"""Refactored slide generator with clear separation of concerns."""

from typing import Dict, Any, List, Optional, AsyncIterator
from datetime import datetime
import logging

from agents.core import ISlideGenerator
from agents.domain.models import SlideGenerationContext, SlideGeneratedEvent
from agents.generation.components.prompt_builder import SlidePromptBuilder
from agents.generation.components.ai_generator import AISlideGenerator
from agents.generation.components.component_validator import ComponentValidator
from agents.application.event_bus import get_event_bus, Events
from models.slide_minimal import MinimalSlide
from setup_logging_optimized import get_logger
from agents.generation.component_hints import infer_component_hints
from agents.generation.custom_component_generator import CustomComponentGenerator
from agents.generation.custom_component_enhancer import CustomComponentEnhancer
from agents.generation.slide_post_processor import SlidePostProcessor
from agents.config import ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN

logger = get_logger(__name__)


class SlideGeneratorV2(ISlideGenerator):
    """Refactored slide generator."""
    
    def __init__(
        self,
        ai_generator: AISlideGenerator,
        component_validator: ComponentValidator,
        registry: Any,
    ):
        self.ai_generator = ai_generator
        self.component_validator = component_validator
        self.registry = registry
        self.prompt_builder = SlidePromptBuilder()
        self.event_bus = get_event_bus()
        # Dedicated CustomComponent generator using Gemini 3 Pro
        self.custom_component_generator = CustomComponentGenerator()
        self.custom_component_enhancer = CustomComponentEnhancer(
            self.custom_component_generator,
            full_slide=True,
        )
        self.post_processor = SlidePostProcessor(component_validator, registry)

        logger.debug("SlideGeneratorV2 initialized - improved architecture")
    
    async def generate_slide(
        self,
        context: SlideGenerationContext
    ) -> AsyncIterator[Dict[str, Any]]:
        """Generate a single slide."""
        
        logger.info(f"🚀 Generating slide {context.slide_index + 1}: {context.slide_outline.title}")
        if logger.isEnabledFor(logging.DEBUG) and context.tagged_media:
            logger.debug(f"[DEBUG] Slide generation context - tagged_media count: {len(context.tagged_media)}")
            for i, media in enumerate(context.tagged_media[:2]):  # First 2
                logger.debug(f"[DEBUG]   Media {i+1}: {media.get('filename', 'unknown')} - URL: {media.get('previewUrl', '')[:100] if media.get('previewUrl') else 'NO URL'}")
        generation_start = datetime.now()
        
        # Emit slide started event
        await self.event_bus.emit(Events.SLIDE_STARTED, {
            'slide_index': context.slide_index,
            'slide_title': context.slide_outline.title,
            'deck_uuid': context.deck_uuid
        })
        
        try:
            component_hints = infer_component_hints(context)

            # Step 1: Build prompts
            substep_event = {
                'type': 'slide_substep',
                'slide_index': context.slide_index,
                'substep': 'preparing_context',
                'message': f'Preparing content for slide {context.slide_index + 1}'
            }
            await self.event_bus.emit(Events.SLIDE_SUBSTEP, substep_event)
            yield substep_event
            
            system_prompt, user_prompt = await self._build_prompts(context, component_hints)
            
            # Step 2: Generate with AI
            substep_event = {
                'type': 'slide_substep',
                'slide_index': context.slide_index,
                'substep': 'ai_generation',
                'message': f'Generating slide {context.slide_index + 1} content'
            }
            await self.event_bus.emit(Events.SLIDE_SUBSTEP, substep_event)
            yield substep_event
            
            slide_data = await self._generate_with_ai(
                system_prompt, user_prompt, context, component_hints
            )

            # Step 3.5: Enhance CustomComponents with Gemini 3 Pro if enabled
            if ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN:
                try:
                    slide_data = await self._enhance_custom_components_with_gemini(
                        slide_data, context
                    )
                except Exception as cc_err:
                    logger.warning(f"CustomComponent enhancement failed: {cc_err}")

            # Step 4: Post-process and validate
            substep_event = {
                'type': 'slide_substep',
                'slide_index': context.slide_index,
                'substep': 'saving',
                'message': f'Saving slide {context.slide_index + 1}'
            }
            await self.event_bus.emit(Events.SLIDE_SUBSTEP, substep_event)
            yield substep_event

            # Debug: Log what AI generated BEFORE post-processing
            image_components_count = sum(1 for c in slide_data.get('components', []) if c.get('type') == 'Image')
            placeholder_count = sum(1 for c in slide_data.get('components', []) if c.get('type') == 'Image' and c.get('props', {}).get('src') in ['placeholder', ''])
            logger.debug(f"Slide {context.slide_index + 1} - AI generated {len(slide_data.get('components', []))} components")
            logger.debug(f"  Image components: {image_components_count}, with placeholder src: {placeholder_count}")

            slide_data = await self._post_process_slide(slide_data, context)
            
            # Calculate timing
            total_elapsed = (datetime.now() - generation_start).total_seconds()
            logger.info(f"✅ Slide {context.slide_index + 1} complete in {total_elapsed:.1f}s")
            
            # Create event
            event = SlideGeneratedEvent(
                slide_index=context.slide_index,
                slide_data=slide_data,
                deck_uuid=context.deck_uuid
            )
            
            # Debug: Check if availableImages is in slide_data
            if logger.isEnabledFor(logging.DEBUG):
                if 'availableImages' in slide_data:
                    logger.debug(f"[SLIDE EVENT] Slide {context.slide_index} has {len(slide_data['availableImages'])} availableImages in event")
                else:
                    logger.debug(f"[SLIDE EVENT] Slide {context.slide_index} has NO availableImages in event")
            
            # Emit event
            await self.event_bus.emit(Events.SLIDE_GENERATED, event.to_dict())
            
            # Yield for compatibility
            yield event.to_dict()
            
        except Exception as e:
            logger.error(f"Error generating slide {context.slide_index + 1}: {str(e)}")
            
            # Emit error event
            await self.event_bus.emit(Events.SLIDE_ERROR, {
                'slide_index': context.slide_index,
                'error': str(e),
                'deck_uuid': context.deck_uuid
            })
            
            # Re-raise for proper error handling
            raise
    
    async def _build_prompts(
        self,
        context: SlideGenerationContext,
        component_hints: Optional[List[str]],
    ) -> tuple[str, str]:
        """Build system and user prompts."""
        logger.debug(f"  Building prompts for slide {context.slide_index + 1}...")
        prompt_start = datetime.now()
        
        # Extract brand logo URL from context
        brand_logo_url = self._get_brand_logo_url(context)
        if brand_logo_url:
            logger.debug("  Brand logo found: %s", brand_logo_url)
        
        system_prompt = self.prompt_builder.build_system_prompt()
        # Build split user prompt blocks (deck-static vs per-slide)
        try:
            static_block, slide_block = self.prompt_builder.build_user_prompt_blocks(
                context,
                component_hints,
                brand_logo_url=brand_logo_url
            )
            # Insert an Anthropic cache breakpoint delimiter so the client can convert to content blocks
            user_prompt = f"{static_block}\n<<<CACHE_BREAKPOINT>>>\n{slide_block}"
        except Exception:
            # Fallback to original single-block prompt
            user_prompt = self.prompt_builder.build_user_prompt(
                context,
                component_hints,
                brand_logo_url=brand_logo_url
            )

        prompt_elapsed = (datetime.now() - prompt_start).total_seconds()
        logger.info("  Prompts built in %.1fs - %s chars", prompt_elapsed, len(user_prompt))
        
        return system_prompt, user_prompt
    
    def _get_brand_logo_url(self, context: SlideGenerationContext) -> Optional[str]:
        """Extract brand logo URL from context."""
        try:
            # Check stylePreferences.logoUrl first (set by ThemeDirector)
            if (hasattr(context, 'deck_outline') and 
                context.deck_outline and 
                hasattr(context.deck_outline, 'stylePreferences') and
                context.deck_outline.stylePreferences and
                hasattr(context.deck_outline.stylePreferences, 'logoUrl')):
                logo_url = context.deck_outline.stylePreferences.logoUrl
                if logo_url and logo_url.strip():
                    return logo_url.strip()
            
            # Fallback: check theme data if available
            if hasattr(context, 'theme') and context.theme:
                theme_data = context.theme
                if isinstance(theme_data, dict):
                    # Check various possible locations in theme
                    logo_url = (theme_data.get('brand_logo_url') or 
                               theme_data.get('logo_url') or
                               theme_data.get('brand', {}).get('logo_url'))
                    if logo_url and logo_url.strip():
                        return logo_url.strip()
            
            return None
            
        except Exception as e:
            logger.warning(f"Error extracting brand logo URL: {e}")
            return None
    
    async def _generate_with_ai(
        self,
        system_prompt: str,
        user_prompt: str,
        context: SlideGenerationContext,
        component_hints: Optional[List[str]],
    ) -> Dict[str, Any]:
        """Generate slide with AI."""
        logger.debug(f"  Calling AI for slide {context.slide_index + 1}...")
        ai_start = datetime.now()
        
        predicted_components = component_hints or []
        
        slide_data = await self.ai_generator.generate(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_model=MinimalSlide,
            context=context,
            predicted_components=predicted_components
        )
        
        ai_elapsed = (datetime.now() - ai_start).total_seconds()
        logger.debug(f"  AI generation completed in {ai_elapsed:.1f}s")
        
        return slide_data
    
    async def _post_process_slide(
        self,
        slide_data: Dict[str, Any],
        context: SlideGenerationContext
    ) -> Dict[str, Any]:
        """Post-process slide with validation, theme enforcement, and media handling."""
        return await self.post_processor.process(slide_data, context)

    async def _enhance_custom_components_with_gemini(
        self,
        slide_data: Dict[str, Any],
        context: SlideGenerationContext
    ) -> Dict[str, Any]:
        """Generate a full-slide CustomComponent using the shared enhancer."""
        theme_dict = context.theme.to_dict() if context.theme and hasattr(context.theme, "to_dict") else (context.theme or {})
        content = context.slide_outline.content or context.slide_outline.title or ""
        logger.info(f"[CUSTOM_COMPONENT] Generating full-slide component for slide {context.slide_index + 1}")

        return await self.custom_component_enhancer.enhance(
            slide_data,
            context,
            theme_dict,
            predicted_components=["CustomComponent"],
            include_charts=True,
            content_override=content,
        )
    # NOTE: Dead code removed - CustomComponent handles all layout:
    # - _inject_intelligent_logo, _find_or_create_slide_number_component, _find_or_create_sources_component
    # - _normalize_dividers_and_lines, _clamp_text_blocks_to_content_area
    # - _enforce_icon_text_adjacency, _should_treat_as_title
