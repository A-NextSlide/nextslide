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
from agents.generation.custom_component_generator import CustomComponentGenerator
from agents.rag.slide_context_retriever import SlideContextRetriever
from agents.config import ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN
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
        # Dedicated CustomComponent generator using Gemini 3 Pro
        self.custom_component_generator = CustomComponentGenerator()
        
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

            # Step 5: Enhance CustomComponents with Gemini 3 Pro if enabled
            if ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN and 'CustomComponent' in predicted_components:
                try:
                    slide_data = await self._enhance_custom_components(
                        slide_data, context, theme_dict
                    )
                except Exception as cc_err:
                    logger.warning(f"CustomComponent enhancement failed: {cc_err}")

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

        # Check if this is a title/cover slide
        is_title_slide = context.slide_index == 0 or 'title' in layout.lower() or 'cover' in layout.lower()

        # USE CUSTOMCOMPONENT FOR ALL CONTENT SLIDES!
        if is_title_slide:
            # Title slides: CustomComponent for hero effect
            components = ['Background', 'CustomComponent']
        elif 'image' in layout.lower():
            components = ['Background', 'Image', 'CustomComponent']
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
            'design_guidelines': ['interactive', 'dynamic', 'engaging']
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

        # Check for scraped media from Firecrawl (e.g., GIFs from a website)
        external_media = None
        if hasattr(context.slide_outline, 'scrapedMedia') and context.slide_outline.scrapedMedia:
            scraped = context.slide_outline.scrapedMedia
            external_media = {
                'gifs': scraped.get('gifs', []),
                'images': scraped.get('images', []),
                'all_media': scraped.get('all_media', []),
                'source_url': scraped.get('source_url', ''),
                'markdown': scraped.get('markdown', ''),
            }
            logger.info(f"[CUSTOM_COMPONENT] 🌐 Found scraped media: {len(external_media.get('gifs', []))} GIFs, {len(external_media.get('images', []))} images")

        # Get user-uploaded media (taggedMedia) from the slide outline
        uploaded_media = None
        if hasattr(context.slide_outline, 'taggedMedia') and context.slide_outline.taggedMedia:
            uploaded_media = [
                media.model_dump() if hasattr(media, 'model_dump') else media
                for media in context.slide_outline.taggedMedia
            ]
            logger.info(f"[CUSTOM_COMPONENT] 📎 Found {len(uploaded_media)} user-uploaded media items")

        # Generate the CustomComponent
        enhanced = await self.custom_component_generator.generate(
            content=content,
            theme=theme_dict,
            slide_context=slide_context,
            component_purpose=purpose,
            width=width,
            height=height,
            position=position,
            external_media=external_media,
            uploaded_media=uploaded_media
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
        else:
            logger.warning(f"[CUSTOM_COMPONENT] ⚠️ Generation failed, keeping original content")

        return slide_data

    def _detect_component_purpose(self, content: str, title: str) -> str:
        """Detect the purpose of a CustomComponent based on content."""
        content_lower = (content + ' ' + title).lower()

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

        return 'visualize'
