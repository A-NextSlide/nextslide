"""
Clean slide generator implementation.

Focuses on:
- Single responsibility
- Clean error handling
- Proper retry logic
- Testability
"""

import asyncio
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from agents.core.interfaces import ISlideGenerator, SlideContext, IRAGService, IAIClient
from agents.generation.config import get_config, get_ai_config, get_rag_config
from agents.generation.exceptions import (
    AIGenerationError, AITimeoutError, AIInvalidResponseError,
    ValidationError, ComponentValidationError,
    is_retryable, get_retry_delay
)
from models.slide_minimal import MinimalSlide
from agents.generation.components.ai_generator import AISlideGenerator

logger = logging.getLogger(__name__)


class SlideGenerator(ISlideGenerator):
    """
    Clean implementation of slide generator.
    
    Responsibilities:
    - Generate slides using AI
    - Validate generated content
    - Handle retries and errors gracefully
    """
    
    def __init__(
        self,
        rag_service: IRAGService,
        ai_client: IAIClient,
        registry: Any,
        config: Optional[Any] = None
    ):
        self.rag_service = rag_service
        self.ai_client = ai_client
        self.registry = registry
        self.config = config or get_config()
        self.ai_config = get_ai_config()
        self.rag_config = get_rag_config()
        
    async def generate(self, context: SlideContext) -> Dict[str, Any]:
        """Generate a single slide with retry logic"""
        logger.info(f"Generating slide {context.index + 1}: {context.outline.title}")
        
        start_time = datetime.now()
        last_error = None
        
        for attempt in range(self.ai_config.max_retries):
            try:
                # Generate slide
                slide_data = await self._generate_slide(context)
                
                # Validate
                self._validate_slide(slide_data, context)
                
                # Log success
                elapsed = (datetime.now() - start_time).total_seconds()
                logger.info(
                    f"Successfully generated slide {context.index + 1} "
                    f"in {elapsed:.1f}s (attempt {attempt + 1})"
                )
                
                return slide_data
                
            except Exception as e:
                last_error = e
                
                if not is_retryable(e) or attempt == self.ai_config.max_retries - 1:
                    logger.error(f"Failed to generate slide {context.index + 1}: {str(e)}")
                    raise
                
                # Calculate retry delay
                delay = get_retry_delay(e, attempt)
                logger.warning(
                    f"Attempt {attempt + 1} failed for slide {context.index + 1}: {str(e)}. "
                    f"Retrying in {delay}s..."
                )
                await asyncio.sleep(delay)
        
        # Should not reach here, but just in case
        raise AIGenerationError(
            f"Failed to generate slide after {self.ai_config.max_retries} attempts",
            cause=last_error,
            context={'slide_index': context.index, 'slide_title': context.outline.title}
        )
    
    async def _generate_slide(self, context: SlideContext) -> Dict[str, Any]:
        """Internal method to generate a single slide"""
        # Step 1: Get RAG context
        rag_context = await self._get_rag_context(context)
        
        # Step 2: Build prompts
        system_prompt, user_prompt = self._build_prompts(context, rag_context)
        
        # Step 3: Generate with AI
        slide_data = await self._invoke_ai(system_prompt, user_prompt, context)
        
        # Step 4: Post-process
        slide_data = self._post_process(slide_data, context)
        
        return slide_data
    
    async def _get_rag_context(self, context: SlideContext) -> Dict[str, Any]:
        """Get RAG context for slide"""
        try:
            logger.debug(f"Retrieving RAG context for slide {context.index + 1}")
            return await self.rag_service.get_context(context)
        except Exception as e:
            logger.error(f"Failed to get RAG context: {str(e)}")
            # Return minimal context on failure
            return {
                'predicted_components': ['Text', 'Background'],
                'design_guidelines': {},
                'similar_slides': []
            }
    
    def _build_prompts(self, context: SlideContext, rag_context: Dict[str, Any]) -> tuple[str, str]:
        """Build system and user prompts"""
        # System prompt - minimal instructions
        system_prompt = """You are an expert presentation designer creating slides.
Generate a slide with the appropriate components based on the content and context provided.
Follow the design guidelines and use only the predicted components."""
        
        # User prompt - context-specific
        user_prompt = f"""Create slide {context.index + 1} of {len(context.deck_title)}:

**Slide Title**: {context.outline.title}
**Slide Content**: {context.outline.content}

**Theme**: {context.theme.theme_name if context.theme else 'Modern'}
**Color Palette**: {self._format_palette(context.palette)}

**Predicted Components**: {', '.join(rag_context.get('predicted_components', []))}

**Design Context**:
{self._format_rag_context(rag_context)}

**Tagged Media**:
{self._format_tagged_media(context.tagged_media)}

Generate a JSON slide with title, subtitle (if needed), and components array.
Each component must have: id, type, and props."""
        
        return system_prompt, user_prompt
    
    async def _invoke_ai(
        self,
        system_prompt: str,
        user_prompt: str,
        context: SlideContext
    ) -> Dict[str, Any]:
        """Invoke AI model to generate slide"""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        try:
            # Set timeout
            timeout = self.ai_config.timeout_seconds
            
            # Invoke with timeout
            response = await asyncio.wait_for(
                self.ai_client.generate(
                    messages=messages,
                    response_model=MinimalSlide,
                    max_tokens=self.ai_config.max_tokens,
                    temperature=self.ai_config.temperature
                ),
                timeout=timeout
            )
            
            # Convert to dict
            if hasattr(response, 'model_dump'):
                return response.model_dump()
            else:
                return response
                
        except asyncio.TimeoutError:
            raise AITimeoutError(
                f"AI generation timed out after {timeout}s",
                context={'slide_index': context.index}
            )
        except Exception as e:
            raise AIGenerationError(
                f"AI generation failed: {str(e)}",
                cause=e,
                context={'slide_index': context.index}
            )
    
    async def _post_process(
        self,
        slide_data: Dict[str, Any],
        context: SlideContext
    ) -> Dict[str, Any]:
        """
        Post-process generated slide.
        
        Args:
            slide_data: Raw slide data from AI
            context: Generation context
            
        Returns:
            Post-processed slide data
        """
        try:
            # Add metadata
            slide_data['id'] = context.outline.id
            slide_data['slideIndex'] = context.index
            
            # Add theme data to slide
            if context.theme:
                theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else context.theme
                slide_data['theme'] = theme_dict
                logger.info(f"[SLIDE GENERATOR CLEAN] Added theme data to slide {context.index + 1}")
            
            # Add palette data to slide
            if context.palette:
                slide_data['palette'] = context.palette
                logger.info(f"[SLIDE GENERATOR CLEAN] Added palette data to slide {context.index + 1}")
            
            # Process components
            components = slide_data.get('components', [])
            
            # Ensure each component has required fields
            for i, component in enumerate(components):
                if 'id' not in component:
                    component['id'] = f"component-{i}"
                if 'type' not in component:
                    component['type'] = 'Text'
                if 'props' not in component:
                    component['props'] = {}
            
            # Add tagged media references
            if context.tagged_media:
                print(f"[SLIDE GEN] Processing slide with {len(context.tagged_media)} tagged media items")
                for media in context.tagged_media:
                    print(f"[SLIDE GEN] - {media.get('filename')} with URL: {media.get('previewUrl', '')[:100] if media.get('previewUrl') else 'NO URL'}")
                self._add_tagged_media_to_components(components, context.tagged_media)
            else:
                print(f"[SLIDE GEN] No tagged media for this slide")
            
            return slide_data
        except Exception as e:
            logger.error(f"Failed to post-process slide {context.slide_number}: {str(e)}")
            raise AIGenerationError(
                f"Failed to post-process slide: {str(e)}",
                cause=e,
                context={'slide_index': context.index}
            )
    
    def _validate_slide(self, slide_data: Dict[str, Any], context: SlideContext) -> None:
        """Validate generated slide"""
        # Check required fields
        if not slide_data.get('title'):
            raise ValidationError(
                "Slide missing title",
                context={'slide_index': context.index}
            )
        
        # Validate components
        components = slide_data.get('components', [])
        if not components:
            raise ValidationError(
                "Slide has no components",
                context={'slide_index': context.index}
            )
        
        # Validate each component
        for component in components:
            self._validate_component(component)
    
    def _validate_component(self, component: Dict[str, Any]) -> None:
        """Validate a single component"""
        comp_type = component.get('type')
        
        if not comp_type:
            raise ComponentValidationError(
                component_type='Unknown',
                message="Component missing type"
            )
        
        # Validate against registry if available
        if self.registry and comp_type not in self.registry._component_models:
            raise ComponentValidationError(
                component_type=comp_type,
                message=f"Unknown component type: {comp_type}"
            )
        
        # Try to create component instance for validation
        try:
            if self.registry:
                ComponentModel = self.registry._component_models[comp_type]
                ComponentModel(**component)
        except Exception as e:
            raise ComponentValidationError(
                component_type=comp_type,
                message=f"Component validation failed: {str(e)}",
                cause=e
            )
    
    # === Helper methods ===
    
    def _format_palette(self, palette: Dict[str, Any]) -> str:
        """Format palette for prompt"""
        if not palette:
            return "Default colors"
        
        colors = []
        for key, value in palette.items():
            if key != 'name':
                colors.append(f"{key}: {value}")
        
        return ", ".join(colors[:5])  # Limit to 5 colors
    
    def _format_rag_context(self, rag_context: Dict[str, Any]) -> str:
        """Format RAG context for prompt"""
        parts = []
        
        # Add design guidelines
        guidelines = rag_context.get('design_guidelines', {})
        if guidelines:
            parts.append("Design Guidelines:")
            for key, value in list(guidelines.items())[:3]:
                parts.append(f"- {key}: {value}")
        
        return "\n".join(parts) if parts else "Standard design guidelines apply"
    
    def _format_tagged_media(self, tagged_media: List[Dict[str, Any]]) -> str:
        """Format tagged media for prompt"""
        if not tagged_media:
            return "No tagged media"
        
        media_items = []
        for media in tagged_media[:5]:  # Limit to 5 items
            media_items.append(
                f"- {media.get('filename', 'Unknown')}: "
                f"{media.get('interpretation', 'No description')}"
            )
        
        return "\n".join(media_items)
    
    def _add_tagged_media_to_components(
        self,
        components: List[Dict[str, Any]],
        tagged_media: List[Dict[str, Any]]
    ) -> None:
        """Add tagged media references to appropriate components"""
        print(f"[TAGGED MEDIA] Starting replacement - {len(tagged_media)} media items available")
        
        # Make a copy of tagged_media to track usage
        available_media = tagged_media.copy()
        
        # Find image components
        for i, component in enumerate(components):
            if component.get('type') == 'Image' and component.get('props', {}).get('src') == 'placeholder':
                print(f"[TAGGED MEDIA] Found placeholder image component {i}")
                
                # Replace with tagged media if available
                if available_media:
                    media = available_media.pop(0)  # Use and remove first available
                    preview_url = media.get('previewUrl', '')
                    
                    print(f"[TAGGED MEDIA] Replacing with {media.get('filename')} - URL: {preview_url[:100]}...")
                    
                    component['props']['src'] = preview_url
                    component['props']['alt'] = media.get('interpretation', '')
                    
                    print(f"[TAGGED MEDIA] ✓ Replaced placeholder with {media.get('filename')}")
                else:
                    print(f"[TAGGED MEDIA] ✗ No more tagged media available for component {i}") 