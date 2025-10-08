"""
HTML-Inspired Slide Generator

Wraps the existing SlideGeneratorV2 with HTML-inspired prompting.
Uses web design patterns thinking but outputs JSON components.
"""

import logging
from typing import Dict, Any, AsyncIterator
from agents.core import ISlideGenerator
from agents.domain.models import SlideGenerationContext
from agents.prompts.generation.html_inspired_system_prompt_optimized import (
    get_html_inspired_system_prompt_optimized
)
from agents.generation.customcomponent_library_beautiful import (
    BEAUTIFUL_CUSTOMCOMPONENT_TEMPLATES
)
from agents.generation.design_pattern_examples import get_pattern_examples_text
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class HTMLInspiredSlideGenerator(ISlideGenerator):
    """
    Slide generator that uses HTML/web design thinking.
    
    Teaches models to think in modern web patterns (cards, grids, hero sections)
    but output our JSON component format.
    """
    
    def __init__(self, base_generator: ISlideGenerator):
        """
        Wrap an existing generator with HTML-inspired prompting.
        
        Args:
            base_generator: The underlying generator (usually SlideGeneratorV2)
        """
        self.base_generator = base_generator
        logger.info("✅ HTMLInspiredSlideGenerator initialized")
    
    async def generate_slide(
        self,
        context: SlideGenerationContext
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Generate slide using HTML-inspired prompts.
        
        Overrides the prompt building step to inject web design thinking.
        """
        logger.info(f"🎨 HTML-inspired generation for slide {context.slide_index + 1}")
        
        # Inject HTML-inspired prompting into the context
        # The base generator will use these enhanced prompts
        original_build_prompts = self.base_generator._build_prompts
        
        async def html_inspired_build_prompts(ctx, rag_context):
            """Override prompt building with HTML-inspired version"""
            
            # Get original prompts for reference
            original_system, original_user = await original_build_prompts(ctx, rag_context)
            
            # Replace with OPTIMIZED HTML-inspired prompts
            html_system = get_html_inspired_system_prompt_optimized()
            
            # Build streamlined user prompt
            html_user = self._build_html_inspired_user_prompt_optimized(
                ctx,
                rag_context
            )
            
            logger.info(f"📝 HTML-inspired OPTIMIZED prompts (system: {len(html_system)} chars, user: {len(html_user)} chars)")
            
            return html_system, html_user
        
        # Temporarily replace the prompt builder
        self.base_generator._build_prompts = html_inspired_build_prompts
        
        try:
            # Generate using base generator with our prompts
            async for event in self.base_generator.generate_slide(context):
                yield event
        finally:
            # Restore original prompt builder
            self.base_generator._build_prompts = original_build_prompts
    
    def _build_html_inspired_user_prompt_optimized(
        self,
        context: SlideGenerationContext,
        rag_context: Dict[str, Any]
    ) -> str:
        """Optimized user prompt - 60% smaller, same quality"""
        
        # Extract theme info
        theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else {}
        theme_colors = {
            'primary': theme_dict.get('primary_color', '#3B82F6'),
            'secondary': theme_dict.get('secondary_color', '#8B5CF6'),
            'accent': theme_dict.get('accent_1', '#EC4899')
        }
        
        # Get Beautiful CustomComponent templates guidance
        cc_templates = '\n'.join([
            f"• {name.upper()}: {info['description']}"
            for name, info in BEAUTIFUL_CUSTOMCOMPONENT_TEMPLATES.items()
        ])
        
        # Extract component schemas from RAG context (keep this - it's essential)
        component_schemas = rag_context.get('component_schemas', 'Available: Background, Shape, ShapeWithText, TiptapTextBlock, Image, CustomComponent, Lines, Line, Icon, Group, Chart, Table, ReactBits')
        
        # Get concise slide-type guidance
        slide_type = getattr(context.slide_outline, 'slide_type', 'content')
        guidance = self._get_concise_slide_guidance(slide_type)
        
        prompt = f"""CREATE SLIDE:
Title: {context.slide_outline.title}
Content: {context.slide_outline.content}
Type: {slide_type} | Slide {context.slide_index + 1}/{context.total_slides}

THEME:
Primary: {theme_colors['primary']} | Secondary: {theme_colors['secondary']} | Accent: {theme_colors['accent']}
Fonts: {theme_dict.get('heading_font', 'Inter')}, {theme_dict.get('body_font', 'Inter')}

{guidance}

BEAUTIFUL CUSTOMCOMPONENT TEMPLATES:
{cc_templates}

COMPONENTS: {component_schemas}

DESIGN: Think web → output JSON. Use ShapeWithText for text on shapes (auto-padding!). CustomComponent for interactive viz. Overlap allowed. Go BIG (200-350pt). Include ALL schema fields.
"""
        
        return prompt
    
    def _get_concise_slide_guidance(self, slide_type: str) -> str:
        """Ultra-concise slide-type specific guidance"""
        slide_type = slide_type.lower()
        
        if slide_type == 'title' or slide_type == 'cover':
            return "TITLE: Gradient bg + massive title (160-240pt) + tiny metadata bottom. Components: Background (gradient) + TiptapTextBlock (huge) + TiptapTextBlock (metadata) + Image (logo optional)"
        
        elif 'stat' in slide_type:
            return "STAT: CustomComponent (radial_progress, metric_dashboard or animated counter) 250-350pt center + small label. Background + CustomComponent + optional glass cards"
        
        elif 'comparison' in slide_type:
            return "COMPARISON: CustomComponent (comparison_bars) OR split 50/50 + Line divider + mirrored ShapeWithText cards"
        
        elif 'process' in slide_type or 'timeline' in slide_type:
            return "PROCESS: CustomComponent (timeline_roadmap) for animated timeline OR Lines + Shape (circles) + TiptapTextBlock labels"
        
        elif 'data' in slide_type or 'chart' in slide_type:
            return "DATA: CustomComponent (funnel_viz, radial_progress, or metric_dashboard) 60% width + ShapeWithText insight card 40%"
        
        else:
            return "CONTENT: Glass cards (ShapeWithText) OR floating TiptapTextBlock + Image OR split screen. 2-3 elements max. Use CustomComponent for any interactive element."
    
    async def complete_generation(self, context: SlideGenerationContext) -> None:
        """Pass through to base generator"""
        if hasattr(self.base_generator, 'complete_generation'):
            await self.base_generator.complete_generation(context)

