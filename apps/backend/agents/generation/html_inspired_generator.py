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
        component_schemas = rag_context.get('component_schemas', 'Available: Background, Line (dividers!), Lines (diagrams), Shape (use hasText=true for text on shapes!), TiptapTextBlock, Image, CustomComponent, ReactBits (animations!), Icon, Group, Chart, Table')
        
        # Get concise slide-type guidance
        slide_type = getattr(context.slide_outline, 'slide_type', 'content')
        guidance = self._get_concise_slide_guidance(slide_type)
        
        prompt = f"""CREATE SLIDE:
Title: {context.slide_outline.title}
Content: {context.slide_outline.content}
Type: {slide_type} | Slide {context.slide_index + 1}/{context.total_slides}

🎨 THEME COLORS (USE THESE IN ALL COMPONENTS!):
Primary: {theme_colors['primary']} | Secondary: {theme_colors['secondary']} | Accent: {theme_colors['accent']}
Fonts: {theme_dict.get('heading_font', 'Inter')} (headings), {theme_dict.get('body_font', 'Inter')} (body)

USE THEME COLORS FOR:
- Shape fills: {theme_colors['primary']}, {theme_colors['secondary']}, or {theme_colors['accent']}
- Background gradients: Use theme colors as gradient stops
- CustomComponent render: props.primaryColor, props.secondaryColor (AUTO-INJECTED)
- Line stroke: {theme_colors['primary']} or {theme_colors['accent']}
- Text: Use theme fonts

{guidance}

COMPONENTS: {component_schemas}

ANALYZE THE CONTENT → CREATE PERFECT VISUALIZATION:
- Numbers/stats? Use ReactBits count-up OR CustomComponent dashboard (use theme colors!)
- Timeline/process? Use Lines + Shapes OR CustomComponent timeline
- Comparison? Use Line divider + split layout OR CustomComponent comparison
- Animated text? Use ReactBits (typewriter, gradient-text, etc.)
- Simple divider? Use Line component (NOT thin Shape!)
- Otherwise use Shape (hasText=true for cards) + TiptapTextBlock + Image (use images on most slides!)

🚨 CRITICAL REQUIREMENTS:
1. THEME COLORS IN RENDER FUNCTION: CustomComponent render MUST use theme color props!
   - In render: const c1 = props.primaryColor; const c2 = props.secondaryColor; const tc = props.textColor; const ff = props.fontFamily;
   - Use for ALL colors: background: c1, color: tc, font-family: ff
   - NEVER hardcode #3B82F6, #8B5CF6!
   - Theme colors AUTO-INJECTED (don't add to props, just USE in render)
2. NO TEXT-ON-TEXT OVERLAPS:
   - NEVER place TiptapTextBlock on top of Shape (hasText=true) - it already has text!
   - NEVER place TiptapTextBlock on top of CustomComponent (if it contains text)
   - Check positions (x, y, width, height) - text components must NOT overlap
3. REAL DATA ONLY: Extract ALL content from slide outline as props (NO {{icon}} syntax!)
4. SHAPE TEXT PADDING: For Shape with hasText=true, ALWAYS use textPadding=16 (default) or max 20. NEVER use 30 or higher! textPadding is INTERNAL spacing, not position offset!
5. USE REACTBITS FIRST: count-up for numbers, typewriter-text for titles
6. USE LINE: For dividers (NOT thin Shape!)

Example CustomComponent using AUTO-INJECTED theme colors:
{{
  "type": "CustomComponent",
  "props": {{
    "position": {{"x": 400, "y": 300}}, "width": 1120, "height": 400,
    "value1": "621", "label1": "Nobel Prizes", "value2": "124", "label2": "Years",
    "render": "function render({{ props }}) {{ const v1 = props.value1 || ''; const l1 = props.label1 || ''; const v2 = props.value2 || ''; const l2 = props.label2 || ''; const c1 = props.primaryColor; const c2 = props.secondaryColor; const tc = props.textColor; const ff = props.fontFamily; return '<div style=\"width: 100%; height: 100%; padding: 24px; box-sizing: border-box; font-family: ' + ff + '; display: flex; gap: 40px;\"><div style=\"flex: 1; background: linear-gradient(135deg, ' + c1 + ', ' + c2 + '); border-radius: 24px; padding: 24px; text-align: center;\"><div style=\"font-size: 96px; font-weight: 800; color: ' + tc + ';\">' + v1 + '</div><div style=\"font-size: 28px; color: ' + tc + ';\">' + l1 + '</div></div><div style=\"flex: 1; background: linear-gradient(135deg, ' + c2 + ', ' + c1 + '); border-radius: 24px; padding: 24px; text-align: center;\"><div style=\"font-size: 96px; font-weight: 800; color: ' + tc + ';\">' + v2 + '</div><div style=\"font-size: 28px; color: ' + tc + ';\">' + l2 + '</div></div></div>'; }}"
  }}
}}

Example Shape with text (CORRECT positioning):
{{
  "type": "Shape",
  "props": {{
    "position": {{"x": 100, "y": 200}},  // EXACT position - NO padding offset!
    "width": 400, "height": 200,  // FULL dimensions - NO reduction for padding!
    "shapeType": "rectangle",
    "borderRadius": 16,
    "fill": "#3B82F6",
    "hasText": true,
    "textPadding": 16,  // DEFAULT=16, max 20. NEVER use 30 or higher!
    "fontSize": 24,
    "alignment": "center",
    "verticalAlignment": "middle",
    "texts": [{{"text": "Key Insight", "style": {{}}}}]
  }}
}}

CRITICAL: Theme colors (primaryColor, secondaryColor, textColor, fontFamily) are AUTO-INJECTED!
You DON'T add them to props object. You MUST use them in render function!

SHAPE POSITIONING RULES:
- Shape position is EXACT bounds (x, y, width, height) - DO NOT add padding to these values!
- Use textPadding property (16-20px) for internal text spacing
- textPadding is INSIDE the shape, not added to position/dimensions!

Think web design → output JSON. ReactBits first, then Line, then CustomComponent. Go BIG (200-350pt).
"""
        
        return prompt
    
    def _get_concise_slide_guidance(self, slide_type: str) -> str:
        """Ultra-concise slide-type specific guidance"""
        slide_type = slide_type.lower()
        
        if slide_type == 'title' or slide_type == 'cover':
            return "TITLE: Gradient bg + ReactBits typewriter-text OR massive TiptapTextBlock (160-240pt). Add Image (logo) if available."
        
        elif 'stat' in slide_type:
            return "STAT: ReactBits count-up OR CustomComponent dashboard (theme colors!). Add Image (large, 40-50% width) for visual impact!"
        
        elif 'comparison' in slide_type:
            return "COMPARISON: CustomComponent (theme colors!) OR split + Line divider + Shape (hasText=true) cards. Add Image (800px+) for context!"
        
        elif 'process' in slide_type or 'timeline' in slide_type:
            return "PROCESS: CustomComponent timeline OR Lines + Shapes + TiptapTextBlock. Add Image (diagram/illustration)!"
        
        elif 'data' in slide_type or 'chart' in slide_type:
            return "DATA: CustomComponent (theme colors!) + Image (large, 40-50% width) for visual context!"
        
        else:
            return "CONTENT: TiptapTextBlock + Image (LARGE, 50-60% of slide) + Shape (hasText=true) cards. USE IMAGES! Dividers → Line! Numbers → ReactBits count-up!"
    
    async def complete_generation(self, context: SlideGenerationContext) -> None:
        """Pass through to base generator"""
        if hasattr(self.base_generator, 'complete_generation'):
            await self.base_generator.complete_generation(context)

