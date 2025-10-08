"""
HTML-Inspired Slide Generator

Wraps the existing SlideGeneratorV2 with HTML-inspired prompting.
Uses web design patterns thinking but outputs JSON components.
"""

import logging
from typing import Dict, Any, AsyncIterator
from agents.core import ISlideGenerator
from agents.domain.models import SlideGenerationContext
from agents.prompts.generation.html_inspired_system_prompt import (
    get_html_inspired_system_prompt,
    get_html_inspired_user_prompt_template
)
from agents.generation.customcomponent_library import (
    CUSTOMCOMPONENT_TEMPLATES,
    get_customcomponent_guidance
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
            
            # Replace with HTML-inspired prompts
            html_system = get_html_inspired_system_prompt()
            
            # Build enhanced user prompt with web thinking guidance
            html_user = self._build_html_inspired_user_prompt(
                ctx,
                rag_context,
                original_user  # Use original for context data
            )
            
            logger.info(f"📝 Using HTML-inspired prompts (system: {len(html_system)} chars, user: {len(html_user)} chars)")
            
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
    
    def _build_html_inspired_user_prompt(
        self,
        context: SlideGenerationContext,
        rag_context: Dict[str, Any],
        original_user_prompt: str
    ) -> str:
        """
        Build user prompt with HTML/web design thinking.
        
        Args:
            context: Generation context
            rag_context: RAG retrieved information
            original_user_prompt: Original prompt for reference
            
        Returns:
            Enhanced user prompt with web design patterns
        """
        
        # Extract theme info
        theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else {}
        theme_colors = {
            'primary': theme_dict.get('primary_color', '#3B82F6'),
            'secondary': theme_dict.get('secondary_color', '#8B5CF6'),
            'accent': theme_dict.get('accent_1', '#EC4899'),
            'background': theme_dict.get('background', '#FFFFFF'),
            'text': theme_dict.get('text_color', '#1F2937')
        }
        
        # Get pattern examples
        pattern_examples = get_pattern_examples_text(theme_colors)
        
        # Get CustomComponent guidance
        cc_guidance = get_customcomponent_guidance()
        
        # Extract component schemas from RAG context
        component_schemas = rag_context.get('component_schemas', 'See registry')
        
        # Build slide-specific guidance based on type
        slide_type_guidance = self._get_slide_type_guidance(
            context.slide_outline,
            context.slide_index,
            context.total_slides
        )
        
        prompt = f"""
═══════════════════════════════════════════════════════════════════════
🎯 SLIDE DESIGN CHALLENGE
═══════════════════════════════════════════════════════════════════════

SLIDE TO CREATE:
• Title: {context.slide_outline.title}
• Content: {context.slide_outline.content}
• Type: {getattr(context.slide_outline, 'slide_type', 'content')}
• Position: Slide {context.slide_index + 1} of {context.total_slides}

═══════════════════════════════════════════════════════════════════════
🎨 YOUR THEME SYSTEM
═══════════════════════════════════════════════════════════════════════

Colors:
• Primary: {theme_colors['primary']}
• Secondary: {theme_colors['secondary']}
• Accent: {theme_colors['accent']}
• Background: {theme_colors['background']}
• Text: {theme_colors['text']}

Fonts:
• Heading: {theme_dict.get('heading_font', 'Inter')}
• Body: {theme_dict.get('body_font', 'Inter')}

Use these EXACT colors and fonts.

═══════════════════════════════════════════════════════════════════════
💡 SLIDE TYPE GUIDANCE
═══════════════════════════════════════════════════════════════════════

{slide_type_guidance}

═══════════════════════════════════════════════════════════════════════
🔧 CUSTOMCOMPONENT TEMPLATES
═══════════════════════════════════════════════════════════════════════

{cc_guidance}

═══════════════════════════════════════════════════════════════════════
📐 DESIGN PATTERNS TO USE
═══════════════════════════════════════════════════════════════════════

{pattern_examples}

═══════════════════════════════════════════════════════════════════════
📋 COMPONENT SCHEMAS
═══════════════════════════════════════════════════════════════════════

{component_schemas}

═══════════════════════════════════════════════════════════════════════
🚀 YOUR DESIGN PROCESS
═══════════════════════════════════════════════════════════════════════

1. VISUALIZE: Imagine this as a beautiful webpage
   - What's the hero element? (biggest, most impactful)
   - What pattern fits? (hero stat, split screen, card grid, etc.)
   - Where do elements float and overlap?
   - What creates drama and visual interest?

2. CHOOSE PATTERN: Pick from patterns above or create variation
   - Title slide? → Modern Title pattern with massive typography
   - Big stat? → Hero Stat pattern with CustomComponent counter
   - Multiple metrics? → Glass Card Grid with animated reveals
   - Comparison? → Split Screen with divider
   - Process? → CustomComponent timeline or card sequence
   - Data? → Data Visualization pattern with CustomComponent

3. ADD INTERACTIVITY: Use CustomComponents for:
   - Animated counters for numbers
   - Interactive charts for data
   - Progress timelines for processes
   - Comparison sliders for before/after
   - Particle effects for visual interest

4. DESIGN WITH DRAMA:
   - Make primary element HUGE (200-300pt for numbers, 120-160pt for titles)
   - Use overlaps creatively (this is experimental branch - go wild!)
   - Layer with zIndex (background=0, mid=10, foreground=20)
   - Apply glassmorphism (white shapes with 10-20% opacity, blur 10-20)
   - Add shadows for depth (shadowBlur: 40-60)
   - Use theme colors strategically (70% primary, 20% secondary, 10% accent)

5. OUTPUT PERFECT JSON:
   - Follow all component schemas exactly
   - Include ALL required fields
   - Use exact property names
   - Respect constraints (min/max, enums)
   - Complete all CustomComponent functions

═══════════════════════════════════════════════════════════════════════
⚡ CRITICAL REMINDERS
═══════════════════════════════════════════════════════════════════════

• OVERLAPS ALLOWED: This is experimental - dramatic overlaps are encouraged!
• GO BIG: Make things 2-3x bigger than you think
• LESS IS MORE: 3-5 major elements max per slide
• THEME COMPLIANCE: Use EXACT colors and fonts from theme
• COMPLETE CODE: All CustomComponents must be finished, no partial code
• WEB THINKING: Think like designing a beautiful modern website

═══════════════════════════════════════════════════════════════════════

Now create this slide with MAXIMUM VISUAL IMPACT.
Think Stripe, Apple, Vercel - not PowerPoint 2010.

Output valid JSON following the schemas.

GO! 🚀
"""
        
        return prompt
    
    def _get_slide_type_guidance(
        self,
        slide_outline: Any,
        slide_index: int,
        total_slides: int
    ) -> str:
        """
        Get specific guidance based on slide type and position.
        """
        slide_type = getattr(slide_outline, 'slide_type', 'content').lower()
        
        if slide_type == 'title' or slide_index == 0:
            return """
TITLE SLIDE - Make it ICONIC:
• Pattern: Modern Title with gradient background
• Use full-bleed gradient (primary → secondary)
• Massive title (160-240pt, can vary weight per word)
• Subtle subtitle (48-64pt) if present
• Tiny metadata at bottom (24pt, 0.7 opacity)
• Optional logo in corner
• Think Apple keynote opening

Example structure:
1. Background (gradient)
2. TiptapTextBlock (huge title with mixed weights)
3. TiptapTextBlock (metadata at bottom)
4. Image (logo if available)
"""
        
        elif 'stat' in slide_type or any(char.isdigit() for char in slide_outline.title[:20]):
            return """
STAT SLIDE - Make numbers DOMINATE:
• Pattern: Hero Stat with animated counter
• Use CustomComponent animated_counter for main number
• Number should be 250-350pt (via CustomComponent)
• Small context label (32-42pt)
• Optional supporting mini-stats in glass cards
• Clean background (solid or subtle gradient)

Example structure:
1. Background (solid or gradient)
2. CustomComponent animated_counter (massive number, center stage)
3. Optional: Glass card shapes with supporting stats
"""
        
        elif slide_type == 'comparison':
            return """
COMPARISON SLIDE - Clear side-by-side:
• Pattern: Split Screen with divider
• 50/50 or 60/40 split
• Thin vertical divider line
• Mirror structure both sides
• Optional: CustomComponent comparison_slider for interactive comparison
• Glass cards or bullet points each side

Example structure:
1. Background (subtle)
2. Shape or Line (divider)
3. Left side: Glass cards or text
4. Right side: Glass cards or text (mirrored structure)
5. Optional: CustomComponent for interactive element
"""
        
        elif 'process' in slide_type or 'timeline' in slide_type.lower():
            return """
PROCESS SLIDE - Show progression:
• Pattern: Horizontal timeline
• Use CustomComponent progress_timeline for animation
• Or: Card sequence with numbers
• Connecting lines between steps
• Even spacing

Example structure:
1. Background
2. CustomComponent progress_timeline (full animation)
OR
1. Background
2. Multiple Shape components (circles/cards for steps)
3. Line components (connecting steps)
4. TiptapTextBlock components (labels)
"""
        
        elif 'data' in slide_type or 'chart' in slide_type:
            return """
DATA SLIDE - Visualization + insights:
• Pattern: Data Visualization with context
• Large CustomComponent for interactive chart (left side)
• Glass card with insights (right side, floating)
• Or: CustomComponent stat_card_grid for multiple metrics
• Chart takes 50-60% of space

Example structure:
1. Background
2. CustomComponent (interactive chart, prominent)
3. Shape (glass card for insights)
4. TiptapTextBlock (insights inside card)
"""
        
        else:
            return """
CONTENT SLIDE - Modern layout:
• Pattern: Choose based on content:
  - One main point? → Floating Elements with large text
  - Multiple points? → Glass Card Grid
  - Text + visual? → Split Screen
• Use glassmorphism for cards
• Generous spacing
• 2-3 major elements max

Example structure:
1. Background (subtle)
2. Shape components (glass cards if using cards)
3. TiptapTextBlock (content, sized generously)
4. Optional: Image or CustomComponent for visual interest
"""
    
    async def complete_generation(self, context: SlideGenerationContext) -> None:
        """Pass through to base generator"""
        if hasattr(self.base_generator, 'complete_generation'):
            await self.base_generator.complete_generation(context)

