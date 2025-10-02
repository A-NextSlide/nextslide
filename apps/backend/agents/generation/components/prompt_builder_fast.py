"""
Fast prompt builder that creates minimal, efficient prompts.
"""
from typing import Dict, Any, List
from agents.domain.models import SlideGenerationContext
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class FastSlidePromptBuilder:
    """Builds minimal prompts for fast slide generation."""
    
    # Minimal system prompt
    SYSTEM_PROMPT = """You are a slide designer. Generate JSON slides with these components: 
Background, TiptapTextBlock, Image, Icon, Shape, CustomComponent.

Output format:
{
  "id": "slide-id",
  "title": "Slide Title",
  "components": [
    {"id": "comp-1", "type": "Background", "props": {...}},
    {"id": "comp-2", "type": "TiptapTextBlock", "props": {...}}
  ]
}

Be concise. Follow the theme colors provided.

CRITICAL RULES:
- NO emojis anywhere (titles, text, CustomComponents)
- For CustomComponent, props.render must be ONE escaped string with \n (no raw newlines, no backticks/template literals)
- NEVER split string literals across lines - keep ALL text on ONE LINE in JavaScript code
- Use React.createElement only (no JSX); return a single root with width/height 100%, maxWidth '100%', maxHeight '100%', boxSizing 'border-box', overflow 'hidden', display 'flex', flexDirection 'column', flexWrap 'nowrap', position 'relative'.
- CRITICAL: Define padding FIRST: const padding = props.padding || 32;
- NO UNDECLARED VARIABLES in CustomComponent: always also declare availableWidth/availableHeight after padding; and if you reference them, declare rayCount (props.rayCount||12), iconSize (Math.min(availableWidth, availableHeight)*0.4), primaryColor (props.primaryColor||props.color||'#FFD100'), secondaryColor ('#4CAF50'), textColor ('#FFFFFF'), fontFamily ('Poppins').
- Compute internal sizes to FIT: availableWidth = props.width - padding*2; ensure lists/grids wrap within availableWidth; avoid horizontal overflow.
- For multi-item layouts: Use CSS Grid with display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px'
- MANDATORY: flexDirection 'column' for main container - NEVER 'row' (prevents title-left content-right issue)
- Title MUST be at TOP: place in separate div with width: '100%', marginBottom: '24px'
- Content MUST be BELOW title: in grid or column layout
- Prefer vertical stacking for ALL sections; for card grids use gridTemplateColumns 'repeat(auto-fit, minmax(220px, 1fr))' with 16-24px gap.
- For literal text children in React.createElement, use double quotes: React.createElement('div', {...}, "Fewer units needed with Dyna.co's proprietary learning algorithms")
- NO try/catch or timers in render (no setInterval/setTimeout/requestAnimationFrame); do NOT call updateState in render; never redeclare a variable named 'state' inside render.

LIBRARY-FREE, THEME-AWARE CUSTOMCOMPONENTS:
- Do NOT import/require or use any UI frameworks. No JSX. No CSS frameworks.
- Write bespoke JavaScript using React.createElement only.
- Pass and use theme props explicitly: primaryColor, secondaryColor, textColor, fontFamily.

BOUNDARY RULES (STRICT — NO OVERLAP):
- Canvas: 1920×1080. Text edges ≥80px; images/charts/custom ≥60px
- Compute rightEdge = x + width; bottomEdge = y + height
- REQUIRE: rightEdge ≤ 1920 AND bottomEdge ≤ 1080
- Maintain gaps: text-text ≥40px; if either is Image/Chart/CustomComponent ≥60px
- Absolutely NO foreground overlaps (Background exempt)

ADDITIONAL STRING QUOTING RULE (CRITICAL, TEXT NODES ONLY):
- For literal text children in React.createElement (the third argument), use double quotes ("...") so apostrophes don't break strings. Escape internal double quotes as ". Other string literals (e.g., style values) may use single quotes.

TiptapTextBlock (rich text) rules:
- Use 3+ TiptapTextBlock components per slide (intro/headline/emphasis)
- Provide texts[] with split entries (e.g., number/unit/label or keyword emphasis)
- Use texts[].style for inline emphasis: bold/italic/underline/strike/superscript/subscript and textColor overrides
 - Use texts[].style for inline emphasis: bold/italic/underline/strike/superscript/subscript and textColor overrides. REQUIRED: Emphasize 1–3 key segments (numbers/keywords) per block with bold + accent color and ≥1.5× size
- Use theme fonts (hero for headline, body for context)
- Use palette colors: emphasized → accent_1; context → primary_text
- No backgroundColor on text blocks; rely on textShadow for contrast

Icon + text rules (optional, use sparingly):
- Do NOT add icons to every text block. Use only when they clarify bullets/labels
- Place Icon component to the LEFT of the text label with a 16–20px gap
- Vertically center the icon relative to the TiptapTextBlock; set text verticalAlignment='middle'
- DO NOT include bullet characters ('•', '-', '*') in the text when an icon is used"""
    
    def build_system_prompt(self) -> str:
        """Return minimal system prompt."""
        return self.SYSTEM_PROMPT
    
    def build_user_prompt(
        self,
        context: SlideGenerationContext,
        rag_context: Dict[str, Any]
    ) -> str:
        """Build minimal user prompt."""
        
        # Extract essentials
        slide_title = context.slide_outline.title
        slide_content = context.slide_outline.content[:200]  # Limit content
        slide_num = context.slide_index + 1
        total_slides = context.total_slides
        
        # Get theme colors
        theme = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else context.theme
        colors = theme.get('color_palette', {})
        
        # Get key components only
        components = rag_context.get('predicted_components', [])[:5]  # Limit to 5
        
        # Build minimal prompt
        prompt_parts = [
            f"Create slide {slide_num} of {total_slides}:",
            f"Title: {slide_title}",
            f"Content: {slide_content}",
            "",
            "Colors:",
            f"- Background: {colors.get('primary_background', '#0A0E27')}",
            f"- Text: {colors.get('primary_text', '#FFFFFF')}",  
            f"- Accent: {colors.get('accent_1', '#00F0FF')}",
            "",
            f"Use components: {', '.join(components)}",
            ""
        ]
        
        # Add chart data if present (minimal)
        if context.has_chart_data and context.chart_data:
            prompt_parts.append("Chart data provided - create appropriate chart.")
            
        # Add image if available (minimal)
        if context.available_images:
            prompt_parts.append(f"Image available: {context.available_images[0].get('url', '')[:100]}")
            
        prompt_parts.append("\nGenerate slide JSON.")
        
        prompt = '\n'.join(prompt_parts)
        
        logger.info(f"Fast prompt size: {len(prompt)} chars (~{len(prompt)//4} tokens)")
        
        return prompt
