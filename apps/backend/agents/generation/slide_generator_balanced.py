"""
Balanced slide generator optimized for quality and speed.
"""
from typing import Dict, Any, AsyncIterator
from datetime import datetime
from agents.core import ISlideGenerator
from agents.domain.models import SlideGenerationContext
from agents.generation.components.ai_generator import AISlideGenerator
from agents.generation.components.component_validator import ComponentValidator
from agents.generation.components.prompt_builder_balanced import BalancedSlidePromptBuilder
from agents.rag.slide_context_retriever import SlideContextRetriever
from models.slide_minimal import MinimalSlide
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class BalancedSlideGenerator(ISlideGenerator):
    """Balanced slide generator with good content and performance."""
    
    def __init__(self, registry, theme_system=None):
        self.registry = registry
        self.theme_system = theme_system
        self.prompt_builder = BalancedSlidePromptBuilder()
        self.ai_generator = AISlideGenerator()
        self.component_validator = ComponentValidator(registry)
        # Simple RAG for component prediction
        self.rag = SlideContextRetriever()
        
    async def generate_slide(
        self,
        context: SlideGenerationContext
    ) -> AsyncIterator[Dict[str, Any]]:
        """Generate slide with balanced approach."""
        
        start_time = datetime.now()
        slide_idx = context.slide_index
        
        try:
            # Yield start event
            yield {
                'type': 'slide_generation_started',
                'slide_index': slide_idx,
                'slide_title': context.slide_outline.title
            }
            
            # Step 1: Get smart RAG context
            rag_context = self._get_smart_rag_context(context)
            
            # Step 2: Build balanced prompts
            system_prompt = self.prompt_builder.build_system_prompt()
            user_prompt = self.prompt_builder.build_user_prompt(context, rag_context)
            
            # Step 3: Generate with AI
            predicted_components = rag_context.get('predicted_components', ['Background', 'TiptapTextBlock'])
            
            slide_data = await self.ai_generator.generate(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_model=MinimalSlide,
                context=context,
                predicted_components=predicted_components
            )
            
            # Step 4: Validate and enhance
            # Convert MinimalSlide to dict if needed
            if hasattr(slide_data, 'model_dump'):
                slide_data = slide_data.model_dump()
            elif not isinstance(slide_data, dict):
                slide_data = {'title': context.slide_outline.title, 'components': []}
                
            # Ensure minimum viable slide
            slide_data = self._ensure_minimum_viable_slide(slide_data, context)
            
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
            logger.info(f"✅ Slide {slide_idx + 1} generated in {elapsed:.1f}s with {len(validated_components)} components")
            
            yield {
                'type': 'slide_generation_completed',
                'slide_index': slide_idx,
                'slide_data': slide_data,
                'generation_time': elapsed
            }
            
        except Exception as e:
            logger.error(f"Error generating slide {slide_idx + 1}: {str(e)}")
            # Generate fallback slide
            fallback_slide = self._create_fallback_slide(context)
            yield {
                'type': 'slide_generation_completed',
                'slide_index': slide_idx,
                'slide_data': fallback_slide,
                'generation_time': 0,
                'error': str(e)
            }
            
    def _get_smart_rag_context(self, context: SlideGenerationContext) -> Dict[str, Any]:
        """Get smart RAG context based on slide type."""
        layout = getattr(context.slide_outline, 'layout', 'title_and_content')
        
        # Smart component prediction based on layout and content
        components = ['Background', 'TiptapTextBlock']  # Always include these
        
        # Title slide: keep it minimal and clean
        if 'title' in layout.lower() or context.slide_index == 0:
            # Prefer a hero treatment; include Image only if images are available or requested
            if context.available_images or getattr(context, 'async_images', False):
                components.append('Image')
        elif 'image' in layout.lower():
            components.append('Image')
        
        # Charts/Tables: choose based on data shape
        if 'chart' in layout.lower() or context.has_chart_data:
            if getattr(context, 'has_tabular_data', False):
                components.append('Table')
            else:
                components.append('Chart')
                # Allow a CustomComponent for rich data viz if the model chooses
                components.append('CustomComponent')
            
        # Remove duplicates while preserving order
        seen = set()
        components = [x for x in components if not (x in seen or seen.add(x))]
        
        return {
            'predicted_components': components,
            'layout_type': layout,
            'design_guidelines': ['professional', 'modern', 'clean']
        }
        
    def _ensure_minimum_viable_slide(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> Dict[str, Any]:
        """Ensure slide has minimum viable content."""
        components = slide_data.get('components', [])
        
        # Check if we have a background
        has_background = any(comp.get('type') == 'Background' for comp in components)
        has_text = any(comp.get('type') == 'TiptapTextBlock' for comp in components)
        
        # Get theme colors
        theme = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else context.theme
        colors = theme.get('color_palette', {})
        
        # Add background if missing
        if not has_background:
            components.insert(0, {
                'id': 'bg-fallback',
                'type': 'Background',
                'props': {
                    'backgroundType': 'gradient',
                    'gradient': {
                        'type': 'linear',
                        'angle': 135,
                        'stops': [
                            {'color': colors.get('primary_background', '#0A0E27'), 'position': 0},
                            {'color': colors.get('secondary_background', '#1A1F3A'), 'position': 100}
                        ]
                    }
                }
            })
            
        # Add text content if missing
        if not has_text:
            components.append({
                'id': 'text-fallback',
                'type': 'TiptapTextBlock',
                'props': {
                    'content': f'<h1>{context.slide_outline.title}</h1><p>{context.slide_outline.content}</p>',
                    'x': 10,
                    'y': 20,
                    'width': 80,
                    'height': 'auto',
                    'fontSize': 16,
                    'color': colors.get('primary_text', '#FFFFFF')
                }
            })
            
        slide_data['components'] = components
        return slide_data
        
    def _create_fallback_slide(self, context: SlideGenerationContext) -> Dict[str, Any]:
        """Create a fallback slide when generation fails."""
        theme = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else context.theme
        colors = theme.get('color_palette', {})
        
        return {
            'id': context.slide_outline.id,
            'title': context.slide_outline.title,
            'components': [
                {
                    'id': 'bg-fallback',
                    'type': 'Background',
                    'props': {
                        'backgroundType': 'gradient',
                        'gradient': {
                            'type': 'linear',
                            'angle': 135,
                            'stops': [
                                {'color': colors.get('primary_background', '#0A0E27'), 'position': 0},
                                {'color': colors.get('secondary_background', '#1A1F3A'), 'position': 100}
                            ]
                        }
                    }
                },
                {
                    'id': 'text-fallback',
                    'type': 'TiptapTextBlock',
                    'props': {
                        'content': f'<h1>{context.slide_outline.title}</h1><p>{context.slide_outline.content}</p>',
                        'x': 10,
                        'y': 30,
                        'width': 80,
                        'height': 'auto',
                        'fontSize': 16,
                        'color': colors.get('primary_text', '#FFFFFF')
                    }
                }
            ]
        }
