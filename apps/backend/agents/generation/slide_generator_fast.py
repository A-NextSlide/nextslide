"""
Fast slide generator optimized for speed.
"""
from typing import Dict, Any, AsyncIterator
from datetime import datetime
from agents.core import ISlideGenerator
from agents.domain.models import SlideGenerationContext
from agents.generation.components.ai_generator import AISlideGenerator
from agents.generation.components.component_validator import ComponentValidator
from agents.generation.components.prompt_builder_fast import FastSlidePromptBuilder
from agents.rag.slide_context_retriever import SlideContextRetriever
from models.slide_minimal import MinimalSlide
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class FastSlideGenerator(ISlideGenerator):
    """Fast slide generator with minimal overhead."""
    
    def __init__(self, registry, theme_system=None):
        self.registry = registry
        self.theme_system = theme_system
        self.prompt_builder = FastSlidePromptBuilder()
        self.ai_generator = AISlideGenerator()
        self.component_validator = ComponentValidator(registry)
        # Simple RAG - could be optimized further
        self.rag = SlideContextRetriever()  # Use default kb_path
        
    async def generate_slide(
        self,
        context: SlideGenerationContext
    ) -> AsyncIterator[Dict[str, Any]]:
        """Generate slide with minimal overhead."""
        
        start_time = datetime.now()
        slide_idx = context.slide_index
        
        try:
            # Yield start event
            yield {
                'type': 'slide_generation_started',
                'slide_index': slide_idx,
                'slide_title': context.slide_outline.title
            }
            
            # Step 1: Get minimal RAG context (skip if possible)
            rag_context = self._get_minimal_rag_context(context)
            
            # Step 2: Build minimal prompts
            system_prompt = self.prompt_builder.build_system_prompt()
            user_prompt = self.prompt_builder.build_user_prompt(context, rag_context)
            
            # Step 3: Generate with AI (use smaller model if available)
            predicted_components = rag_context.get('predicted_components', ['Background', 'TiptapTextBlock'])
            
            slide_data = await self.ai_generator.generate(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_model=MinimalSlide,  # Use MinimalSlide model
                context=context,
                predicted_components=predicted_components
            )
            
            # Step 4: Quick validation
            # Convert MinimalSlide to dict if needed
            if hasattr(slide_data, 'model_dump'):
                slide_data = slide_data.model_dump()
            elif not isinstance(slide_data, dict):
                slide_data = {'title': context.slide_outline.title, 'components': []}
                
            # Validate components with theme for font sizing
            components = slide_data.get('components', [])
            theme_dict = None
            if context.theme:
                theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else context.theme
                logger.info(f"[FONT SIZING] Applying adaptive font sizing to slide {context.slide_index + 1}")

            validated_components = self.component_validator.validate_components(
                components,
                self.registry,
                theme=theme_dict  # Pass theme for font sizing
            )
            slide_data['components'] = validated_components
            
            # Add slide metadata
            slide_data['id'] = context.slide_outline.id
            slide_data['title'] = slide_data.get('title', context.slide_outline.title)
            
            # Yield completed slide
            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"✅ Slide {slide_idx + 1} generated in {elapsed:.1f}s")
            
            yield {
                'type': 'slide_generation_completed',
                'slide_index': slide_idx,
                'slide_data': slide_data,
                'generation_time': elapsed
            }
            
        except Exception as e:
            logger.error(f"Error generating slide {slide_idx + 1}: {str(e)}")
            yield {
                'type': 'slide_generation_error',
                'slide_index': slide_idx,
                'error': str(e)
            }
            
    def _get_minimal_rag_context(self, context: SlideGenerationContext) -> Dict[str, Any]:
        """Get minimal RAG context for speed."""
        # For maximum speed, just predict basic components based on layout
        layout = getattr(context.slide_outline, 'layout', 'title_and_content')
        
        # Quick component prediction based on layout
        if 'title' in layout:
            components = ['Background', 'TiptapTextBlock', 'Shape']
        elif 'image' in layout:
            components = ['Background', 'TiptapTextBlock', 'Image']
        elif 'chart' in layout or context.has_chart_data:
            if getattr(context, 'has_tabular_data', False):
                components = ['Background', 'TiptapTextBlock', 'Table']
            else:
                components = ['Background', 'TiptapTextBlock', 'CustomComponent']
        else:
            components = ['Background', 'TiptapTextBlock']
            
        return {
            'predicted_components': components,
            'layout_type': layout,
            'design_guidelines': []  # Skip for speed
        }
