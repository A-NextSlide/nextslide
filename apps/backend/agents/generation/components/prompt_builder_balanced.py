"""
Balanced prompt builder that creates efficient yet comprehensive prompts.
"""
from typing import Dict, Any, List
from agents.domain.models import SlideGenerationContext
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class BalancedSlidePromptBuilder:
    """Builds balanced prompts for good slide generation with reasonable performance."""
    
    # More comprehensive system prompt
    SYSTEM_PROMPT = """You are an expert slide designer. Generate professional presentation slides.

Available components:
- Background: Sets slide background (gradient or solid color)
- TiptapTextBlock: Rich text content (multiple blocks, each with props and texts[] styles)
- Image: Display images with positioning
- Icon: Functional icons next to text (bullets, headers, process labels). NEVER decorative
- Shape: Functional containers/dividers only. NEVER decorative
- Chart: Data visualization component (preferred for quantitative content)
- CustomComponent: Special visualizations and infographics when justified by data/content

IMPORTANT RULES:
1. Title slides: Background (image or gradient). Content/data slides: prefer NO Background unless necessary for readability
2. Every slide MUST have at least 3 TiptapTextBlock components with strong hierarchy (split intro/headline/emphasis). Each block must include: fontFamily, fontWeight ('bold'|'normal'), letterSpacing (numeric, e.g., -0.02), lineHeight, textShadow, alignment, verticalAlignment, opacity, rotation:0, zIndex, transparent backgroundColor '#00000000', root textColor plus texts[].style.textColor. Inline segments MUST use texts[].style for emphasis (bold/italic/underline/strike/superscript/subscript) and textColor overrides. REQUIRED: In each block, emphasize 1–3 key segments (numbers/keywords) using bold + accent color and ≥1.5× size.
3. Charts: If content contains numbers/percentages/comparisons, INCLUDE a Chart (large, prominent). Rotate x-axis labels 30–45° when long; increase bottom margin to prevent cropping (Highcharts: xAxis.labels.rotation/autoRotation + chart.marginBottom)
4. Icons: ONLY next to text (bullets, headers, process labels). Place to the LEFT of the text with a 16–20px gap and vertical centering. Do NOT include bullet characters in the text label itself. NO floating/background decoration
5. Shapes: ONLY as text containers or dividers. NO free-floating decorative shapes
6. Use theme colors consistently and position components to avoid overlap
7. NO emojis anywhere (titles, text, CustomComponents)
8. CustomComponent render must be a SINGLE escaped string with \n (no raw newlines, no backticks/template literals). The root element must have width/height 100%, maxWidth/maxHeight 100%, boxSizing 'border-box', overflow 'hidden', display 'flex', flexDirection 'column', flexWrap 'nowrap', position 'relative'. Compute internal layout to FIT within props.width/height.
9. NO UNDECLARED VARIABLES in CustomComponent code. Always declare variables you reference. Include, in order: const padding = props.padding || 32; const availableWidth = props.width - padding * 2; const availableHeight = props.height - padding * 2; If used, also declare: const rayCount = props.rayCount || 12; const iconSize = Math.min(availableWidth, availableHeight) * 0.4; const primaryColor = props.primaryColor || props.color || '#FFD100'; const secondaryColor = props.secondaryColor || '#4CAF50'; const textColor = props.textColor || '#FFFFFF'; const fontFamily = props.fontFamily || 'Poppins'.

LIBRARY-FREE, THEME-AWARE CUSTOMCOMPONENTS:
- Do NOT import/require or use any UI frameworks. No JSX. No CSS frameworks.
- Write bespoke JavaScript using React.createElement only.
- Pass and use theme props explicitly: primaryColor, secondaryColor, textColor, fontFamily.

Output valid JSON with this structure:
{
  "id": "slide-id",
  "title": "Slide Title",
  "components": [
    {
      "id": "bg-1",
      "type": "Background",
      "props": {
        "backgroundType": "gradient",
        "gradient": {
          "type": "linear",
          "angle": 135,
          "stops": [
            {"color": "#0A0E27", "position": 0},
            {"color": "#1A1F3A", "position": 100}
          ]
        }
      }
    },
    {
      "id": "text-1",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 120, "y": 180},
        "width": 1680,
        "height": 240,
        "texts": [
          {"text": "INTRO", "fontSize": 48, "fontWeight": "normal", "opacity": 0.75, "style": {"textColor": "#FFFFFF", "backgroundColor": "#00000000", "bold": false, "italic": false, "underline": false, "strike": false}},
          {"text": "MASSIVE HEADLINE", "fontSize": 200, "fontWeight": "bold", "style": {"textColor": "#FFFFFF", "backgroundColor": "#00000000", "bold": true, "italic": false, "underline": false, "strike": false}}
        ],
        "fontFamily": "<hero-font>",
        "letterSpacing": -0.02,
        "lineHeight": 1.1,
        "textShadow": "0 4px 24px rgba(0,0,0,0.25)",
        "textColor": "#FFFFFF",
        "backgroundColor": "#00000000",
        "alignment": "left",
        "verticalAlignment": "top",
        "opacity": 1,
        "rotation": 0,
        "zIndex": 2
      }
    }
  ]
}"""
    
    def build_system_prompt(self) -> str:
        """Return balanced system prompt."""
        return self.SYSTEM_PROMPT
    
    def build_user_prompt(
        self,
        context: SlideGenerationContext,
        rag_context: Dict[str, Any]
    ) -> str:
        """Build balanced user prompt with essential details."""
        
        # Extract essentials
        slide_title = context.slide_outline.title
        slide_content = context.slide_outline.content
        slide_num = context.slide_index + 1
        total_slides = context.total_slides
        layout = getattr(context.slide_outline, 'layout', 'title_and_content')
        
        # Get theme colors
        theme = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else context.theme
        colors = theme.get('color_palette', {})
        
        # Get typography
        typography = theme.get('typography', {})
        hero_font = typography.get('hero_title', {}).get('family', 'Poppins')
        body_font = typography.get('body_text', {}).get('family', 'Inter')
        
        # Build balanced prompt
        prompt_parts = [
            f"Create slide {slide_num} of {total_slides}:",
            f"Layout: {layout}",
            f"Title: {slide_title}",
            f"Content: {slide_content}",
            "",
            "Theme colors:",
            f"- Primary Background: {colors.get('primary_background', '#0A0E27')}",
            f"- Secondary Background: {colors.get('secondary_background', '#1A1F3A')}",
            f"- Primary Text: {colors.get('primary_text', '#FFFFFF')}",
            f"- Accent 1: {colors.get('accent_1', '#00F0FF')}",
            f"- Accent 2: {colors.get('accent_2', '#FF5722')}",
            "",
            "Typography:",
            f"- Hero font: {hero_font}",
            f"- Body font: {body_font}",
            ""
        ]
        
        # Add layout-specific instructions
        if 'title' in layout:
            prompt_parts.extend([
                "Create a title slide with:",
                "- MASSIVE title over a full-bleed background (image or gradient) with strong contrast; do NOT overlap other foreground components",
                "- Prefer full-bleed hero or left-aligned hero (avoid 50/50 split)",
                "- Optional subtitle and subtle metadata row (presenter • organization • date)",
                "- NO decorative shapes/icons",
                ""
            ])
        elif 'image' in layout:
            prompt_parts.extend([
                "Create a content slide with image:",
                "- Title at top",
                "- Text on one side",
                "- Image placeholder on the other",
                ""
            ])
        else:
            prompt_parts.extend([
                "Create a content slide with:",
                "- Clear heading",
                "- Well-formatted body text",
                "- Visual elements for interest",
                ""
            ])
            
        # Add component requirements
        components = rag_context.get('predicted_components', ['Background', 'TiptapTextBlock'])
        prompt_parts.append(f"Required components: {', '.join(components)}")
        
        prompt_parts.extend([
            "",
            "IMPORTANT:",
            "- Use gradient background with theme colors",
            "- ⚠️ CRITICAL: Background gradient MUST be nested in 'gradient' object:",
            "    ✅ CORRECT: gradient: {type: 'linear', angle: 135, stops: [...]}",
            "    ❌ WRONG: gradientType, gradientAngle, gradientStops as direct props",
            "- Include rich text formatting in TiptapTextBlock (multi-block, split metrics/keyword emphasis)",
            "- Text blocks MUST include: fontFamily (hero/body), fontWeight ('bold'|'normal' — NEVER numeric), letterSpacing (numeric, e.g., -0.02), lineHeight, textShadow, alignment, verticalAlignment, opacity, rotation: 0, zIndex",
            "- Set backgroundColor '#00000000' (transparent) for all text blocks",
            "- Use theme fonts (hero/body) for fontFamily; largest text uses hero font",
            "- Use palette colors: emphasized words → accent_1; context → primary_text; set both root textColor and texts[].style.textColor",
            "- Position elements with proper spacing",
            "- Height-aware text: If a text block height is small (<140px), keep text SINGLE-LINE (no manual newlines). For multi-line content, either increase height to fontSize × lines × 1.3 (+10–20% buffer), or split into additional blocks with 40–60px vertical gaps, or shorten the text.",
            "- STRICT BOUNDARIES (NO OVERLAP):",
            "  • Canvas: 1920×1080. Edges: text ≥80px; images/charts/custom ≥60px",
            "  • Compute rightEdge = x + width; bottomEdge = y + height",
            "  • REQUIRE: rightEdge ≤ 1920 AND bottomEdge ≤ 1080",
            "  • Maintain gaps: text-text ≥40px; if either is Image/Chart/CustomComponent ≥60px",
            "  • Absolutely NO overlap between foreground components (Background exempt)",
            "- Make it visually appealing and professional",
            "- If numbers/percentages are present, include a LARGE chart (dominant visual)",
            "- Icons (optional) should sit beside text when used; never decorative; do NOT add icons to every text block",
            "- Shapes only as containers/dividers (never decorative)",
            "",
            "Generate the complete slide JSON."
        ])
        
        prompt = '\n'.join(prompt_parts)
        
        logger.info(f"Balanced prompt size: {len(prompt)} chars (~{len(prompt)//4} tokens)")
        
        return prompt
