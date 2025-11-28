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
from agents.generation.custom_component_generator import CustomComponentGenerator
from agents.rag.slide_context_retriever import SlideContextRetriever
from agents.config import ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN
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
        # Dedicated CustomComponent generator using Gemini 3 Pro
        self.custom_component_generator = CustomComponentGenerator()
        
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

            # Step 5: Enhance CustomComponents with Gemini 2.5 Pro if enabled
            if ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN and 'CustomComponent' in predicted_components:
                print(f"[SLIDE_GEN] 🎨 CustomComponent enhancement ENABLED for slide {slide_idx + 1}")
                print(f"[SLIDE_GEN] 📦 Predicted components: {predicted_components}")
                try:
                    slide_data = await self._enhance_custom_components(
                        slide_data, context, theme_dict
                    )
                    print(f"[SLIDE_GEN] ✅ CustomComponent enhancement completed for slide {slide_idx + 1}")
                except Exception as cc_err:
                    logger.warning(f"CustomComponent enhancement failed: {cc_err}")
                    print(f"[SLIDE_GEN] ❌ CustomComponent enhancement FAILED: {cc_err}")
                    import traceback
                    traceback.print_exc()
            else:
                reasons = []
                if not ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN:
                    reasons.append("ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN=False")
                if 'CustomComponent' not in predicted_components:
                    reasons.append(f"CustomComponent not in predicted_components: {predicted_components}")
                print(f"[SLIDE_GEN] ⏭️ Skipping CustomComponent enhancement: {', '.join(reasons)}")
            
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

        # Check if this is a title/cover slide (first slide or explicitly title type)
        is_title_slide = context.slide_index == 0 or 'title' in layout.lower() or 'cover' in layout.lower()

        # Quick component prediction based on layout
        # USE CUSTOMCOMPONENT FOR ALL CONTENT SLIDES!
        if is_title_slide:
            # Title slides: still use CustomComponent for hero effect
            components = ['Background', 'CustomComponent']
        elif 'image' in layout.lower():
            components = ['Background', 'TiptapTextBlock', 'Image', 'CustomComponent']
        elif 'chart' in layout.lower() or context.has_chart_data:
            if getattr(context, 'has_tabular_data', False):
                components = ['Background', 'TiptapTextBlock', 'Table']
            else:
                components = ['Background', 'CustomComponent']
        else:
            # ALL OTHER CONTENT SLIDES: Use CustomComponent!
            components = ['Background', 'CustomComponent']

        return {
            'predicted_components': components,
            'layout_type': layout,
            'design_guidelines': []  # Skip for speed
        }

    async def _enhance_custom_components(
        self,
        slide_data: Dict[str, Any],
        context: SlideGenerationContext,
        theme_dict: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Replace slide content with an interactive CustomComponent using Gemini 3 Pro.

        This method generates a rich, interactive CustomComponent that REPLACES
        all the boring TiptapTextBlock cards with a single stunning visualization.

        Args:
            slide_data: The generated slide data
            context: Slide generation context
            theme_dict: Theme dictionary

        Returns:
            Updated slide_data with CustomComponent replacing content
        """
        components = slide_data.get('components', [])

        # Determine the purpose of the CustomComponent based on content
        content = context.slide_outline.content or ''
        purpose = self._detect_component_purpose(content, context.slide_outline.title)

        # Build slide context for the generator
        slide_context = {
            'title': context.slide_outline.title,
            'slide_index': context.slide_index,
            'total_slides': context.total_slides,
            'slide_type': getattr(context.slide_outline, 'layout', 'content')
        }

        # Check if this is a title slide (needs full-screen positioning)
        layout = getattr(context.slide_outline, 'layout', 'content')
        is_title_slide = context.slide_index == 0 or 'title' in layout.lower() or 'cover' in layout.lower()

        if is_title_slide:
            # Title slides get FULL SCREEN - no margins, the CustomComponent IS the slide
            width = 1920
            height = 1080
            position = {'x': 0, 'y': 0}
            logger.info(f"[CUSTOM_COMPONENT] 🎬 TITLE SLIDE - using full-screen mode ({width}x{height})")
        else:
            # Content slides get positioned below title area
            width = 1760
            height = 800
            position = {'x': 80, 'y': 160}

        logger.info(f"[CUSTOM_COMPONENT] Generating interactive component for slide {context.slide_index + 1}")
        logger.info(f"[CUSTOM_COMPONENT] Purpose: {purpose}, Content preview: {content[:100]}...")

        # Generate the CustomComponent
        enhanced = await self.custom_component_generator.generate(
            content=content,
            theme=theme_dict,
            slide_context=slide_context,
            component_purpose=purpose,
            width=width,
            height=height,
            position=position
        )

        if enhanced:
            # REPLACE all content components with the CustomComponent
            # Keep only Background, remove all TiptapTextBlocks/Shapes/etc
            background = next(
                (c for c in components if c.get('type') == 'Background'),
                None
            )

            # Build new components list: Background + CustomComponent only
            new_components = []
            if background:
                new_components.append(background)
            else:
                # Create a default background if none exists
                colors = theme_dict.get('color_palette', {})
                new_components.append({
                    'id': 'bg-custom',
                    'type': 'Background',
                    'props': {
                        'backgroundType': 'color',
                        'backgroundColor': colors.get('primary_background', '#0a0e27')
                    }
                })

            new_components.append(enhanced)
            slide_data['components'] = new_components
            logger.info(f"[CUSTOM_COMPONENT] ✅ Replaced content with interactive CustomComponent")
            print(f"[CUSTOM_COMPONENT] ✅ REPLACED content with interactive CustomComponent!")
            print(f"[CUSTOM_COMPONENT] 📦 New components: {[c.get('type') for c in new_components]}")
        else:
            logger.warning(f"[CUSTOM_COMPONENT] ⚠️ Generation failed, keeping original content")
            print(f"[CUSTOM_COMPONENT] ⚠️ Generation returned None, keeping original boring content")

        return slide_data

    def _detect_component_purpose(self, content: str, title: str) -> str:
        """Detect the purpose of a CustomComponent based on content."""
        content_lower = (content + ' ' + title).lower()

        # Check for specific patterns
        if any(word in content_lower for word in ['stat', 'number', 'percent', '%', 'growth', 'revenue', 'metric', 'kpi']):
            return 'stats'
        if any(word in content_lower for word in ['compare', 'vs', 'versus', 'before', 'after', 'difference']):
            return 'compare'
        if any(word in content_lower for word in ['timeline', 'roadmap', 'journey', 'phase', 'step', 'process']):
            return 'timeline'
        if any(word in content_lower for word in ['quote', 'said', 'says', '"', "'"]):
            return 'quote'
        if any(word in content_lower for word in ['explain', 'how', 'why', 'what is', 'understand']):
            return 'explain'
        if any(word in content_lower for word in ['feature', 'benefit', 'advantage', 'highlight']):
            return 'emphasize'

        # Default to visualize
        return 'visualize'
