"""
HTML-Inspired Slide Generator

Wraps the existing SlideGeneratorV2 with HTML-inspired prompting.
Uses web design patterns thinking but outputs JSON components.
"""

import logging
from typing import Dict, Any, AsyncIterator
from agents.core import ISlideGenerator
from agents.domain.models import SlideGenerationContext
from agents.prompts.generation.html_inspired_system_prompt_dynamic import (
    get_html_inspired_system_prompt_dynamic
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
            
            # Use DYNAMIC HTML-inspired prompts (teaches HOW to create CustomComponents)
            html_system = get_html_inspired_system_prompt_dynamic()
            
            # Build streamlined user prompt
            html_user = self._build_html_inspired_user_prompt_dynamic(
                ctx,
                rag_context
            )
            
            logger.info(f"📝 HTML-inspired DYNAMIC prompts (system: {len(html_system)} chars, user: {len(html_user)} chars)")
            
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
    
    def _build_html_inspired_user_prompt_dynamic(
        self,
        context: SlideGenerationContext,
        rag_context: Dict[str, Any]
    ) -> str:
        """Dynamic user prompt - encourages custom CustomComponent creation"""
        
        # Extract theme info
        theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else {}
        theme_colors = {
            'primary': theme_dict.get('primary_color', '#3B82F6'),
            'secondary': theme_dict.get('secondary_color', '#8B5CF6'),
            'accent': theme_dict.get('accent_1', '#EC4899')
        }
        
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

COMPONENTS: {component_schemas}

ANALYZE THE CONTENT → CREATE PERFECT VISUALIZATION:
- Numbers/metrics? CREATE CustomComponent animated counter/dashboard
- Timeline/process? CREATE CustomComponent custom timeline
- Comparison? CREATE CustomComponent custom comparison viz
- Multiple data points? CREATE CustomComponent custom infographic
- Otherwise use ShapeWithText (cards) + TiptapTextBlock

CRITICAL: Analyze this content and CREATE the perfect visualization!
- Use ShapeWithText for text on shapes (auto-padding)
- CREATE CustomComponent for any data/numbers/timeline/comparison (follow HOW-TO in system prompt)
- NO "placeholder" text - create REAL, BEAUTIFUL, COMPLETE visualizations
- Include ALL schema fields, proper padding, animations, professional styling
- Think web design → output JSON. Overlap allowed. Go BIG (200-350pt).
"""
        
        return prompt
    
    def _get_concise_slide_guidance(self, slide_type: str) -> str:
        """Ultra-concise slide-type specific guidance"""
        slide_type = slide_type.lower()
        
        if slide_type == 'title' or slide_type == 'cover':
            return "TITLE: Gradient bg + massive title (160-240pt) + tiny metadata. Background (gradient) + TiptapTextBlock (huge) + TiptapTextBlock (metadata) + Image (logo optional)"
        
        elif 'stat' in slide_type:
            return "STAT: CREATE CustomComponent animated counter for the number! OR dashboard if multiple metrics. Make it BEAUTIFUL (gradients, animations, formatted numbers). 250-350pt."
        
        elif 'comparison' in slide_type:
            return "COMPARISON: CREATE CustomComponent side-by-side comparison (animated bars/metrics growing from 0). OR split 50/50 + Line divider + ShapeWithText cards."
        
        elif 'process' in slide_type or 'timeline' in slide_type:
            return "PROCESS: CREATE CustomComponent interactive timeline (milestones, connecting lines, animations). OR Lines + Shape (circles) + TiptapTextBlock."
        
        elif 'data' in slide_type or 'chart' in slide_type:
            return "DATA: CREATE CustomComponent custom visualization for this specific data (dashboard, funnel, radial, bars - whatever fits!). 60% width + ShapeWithText insight 40%."
        
        else:
            return "CONTENT: ShapeWithText cards OR TiptapTextBlock + Image. If numbers/data → CREATE CustomComponent for it!"
    
    async def complete_generation(self, context: SlideGenerationContext) -> None:
        """Pass through to base generator"""
        if hasattr(self.base_generator, 'complete_generation'):
            await self.base_generator.complete_generation(context)

