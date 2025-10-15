"""
HTML-Inspired Slide Generator

Wraps the existing SlideGeneratorV2 with HTML-inspired prompting.
Uses web design patterns thinking but outputs JSON components.

OPTIMIZED FOR CLAUDE CACHING:
- Static content (component schemas, rules) cached before <<<CACHE_BREAKPOINT>>>
- Dynamic content (slide details) after delimiter
- ~3000 token savings per slide after first slide!
"""

import logging
import json
import os
from typing import Dict, Any, AsyncIterator
from agents.core import ISlideGenerator
from agents.domain.models import SlideGenerationContext
from agents.prompts.generation.html_inspired_system_prompt_dynamic import (
    get_html_inspired_system_prompt_dynamic
)
from agents.prompts.generation.html_inspired_system_prompt_enhanced import (
    get_html_inspired_system_prompt_enhanced
)
from agents.prompts.generation.html_inspired_system_prompt_v2 import (
    get_html_inspired_system_prompt_v2,
    get_condensed_component_schemas,
    get_mode_specific_guidance
)
from agents.generation.design_pattern_examples import get_pattern_examples_text
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Cache delimiter for Claude prompt caching
CACHE_DELIM = "\n<<<CACHE_BREAKPOINT>>>\n"


class HTMLInspiredSlideGenerator(ISlideGenerator):
    """
    Slide generator that uses HTML/web design thinking.
    
    Teaches models to think in modern web patterns (cards, grids, hero sections)
    but output our JSON component format.
    
    OPTIMIZED WITH CLAUDE CACHING for maximum efficiency!
    """
    
    def __init__(self, base_generator: ISlideGenerator):
        """
        Wrap an existing generator with HTML-inspired prompting.

        Args:
            base_generator: The underlying generator (usually SlideGeneratorV2)
        """
        self.base_generator = base_generator
        self._component_schemas_cache = None  # Lazy load component schemas
        logger.info("✅ HTMLInspiredSlideGenerator initialized with Claude caching")

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
            
            # DON'T load original RAG prompts - we're replacing them entirely!
            # original_system, original_user = await original_build_prompts(ctx, rag_context)
            
            # Use DYNAMIC HTML-inspired prompts (teaches HOW to create CustomComponents)
            html_system = get_html_inspired_system_prompt_dynamic()
            
            # Build streamlined user prompt (no heavy RAG schemas)
            html_user = self._build_html_inspired_user_prompt_dynamic(ctx)
            
            logger.info(f"📝 HTML-inspired prompts (system: {len(html_system)} chars, user: {len(html_user)} chars)")
            
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
    
    def _load_component_schemas(self) -> str:
        """Load and format component schemas for caching (loads once, reused)"""
        if self._component_schemas_cache is not None:
            return self._component_schemas_cache
        
        try:
            # Load components.json
            components_path = os.path.join(
                os.path.dirname(__file__),
                '../rag/knowledge_base/components.json'
            )
            with open(components_path, 'r') as f:
                components = json.load(f)
            
            # Format COMPLETE schemas with ALL props for the prompt (cached!)
            formatted = "═══ COMPONENT SCHEMAS (COMPLETE - FOLLOW EXACTLY) ═══\n\n"
            
            for comp_name, comp_data in components.items():
                formatted += f"**{comp_name}**\n"
                formatted += f"Description: {comp_data.get('description', '')}\n"
                
                if 'required_props' in comp_data:
                    formatted += f"Required: {', '.join(comp_data['required_props'])}\n"
                
                if 'critical_rules' in comp_data:
                    formatted += "Critical Rules:\n"
                    for key, val in comp_data['critical_rules'].items():
                        formatted += f"  • {key}: {val}\n"
                
                if 'best_practices' in comp_data:
                    formatted += "Best Practices:\n"
                    for practice in comp_data['best_practices']:  # ALL practices now!
                        formatted += f"  • {practice}\n"
                
                if 'when_to_use' in comp_data:
                    formatted += "Use For:\n"
                    for use, desc in comp_data['when_to_use'].items():
                        formatted += f"  • {use}: {desc}\n"
                
                # Add examples if present
                if 'examples' in comp_data:
                    formatted += "Examples:\n"
                    for example_name, example_data in comp_data['examples'].items():
                        if isinstance(example_data, dict):
                            formatted += f"  • {example_name}: {example_data.get('description', '')}\n"
                            if 'props' in example_data or 'texts' in example_data:
                                formatted += f"    {json.dumps(example_data, indent=4)}\n"
                
                # Add all other relevant fields
                for key in ['positioning_rules', 'theme_detection', 'legend_rules', 'common_patterns', 
                           'fit_and_responsiveness', 'content_triggers', 'data_visualization_priority',
                           'recommended_components', 'avoid', 'minimum_sizes', 'object_fit_options',
                           'background_types', 'design_guidance']:
                    if key in comp_data:
                        formatted += f"{key.replace('_', ' ').title()}:\n"
                        data = comp_data[key]
                        if isinstance(data, dict):
                            formatted += f"  {json.dumps(data, indent=2)}\n"
                        elif isinstance(data, list):
                            for item in data:
                                formatted += f"  • {item}\n"
                        else:
                            formatted += f"  {data}\n"
                
                formatted += "\n"
            
            self._component_schemas_cache = formatted
            logger.info(f"📦 Component schemas loaded and cached ({len(formatted)} chars)")
            return formatted
            
        except Exception as e:
            logger.error(f"Failed to load component schemas: {e}")
            return "Components: Background, Shape, TiptapTextBlock, Image, Line, Lines, Chart, CustomComponent, ReactBits, Icon, Group, Table\n"
    
    def _build_html_inspired_user_prompt_dynamic(
        self,
        context: SlideGenerationContext
    ) -> str:
        """
        Build user prompt optimized for Claude caching.
        
        STRUCTURE:
        1. STATIC content (component schemas, rules) - CACHED
        2. <<<CACHE_BREAKPOINT>>>
        3. DYNAMIC content (slide-specific) - NOT CACHED
        """
        
        # Extract theme info
        theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else {}

        # CRITICAL: Extract colors from color_palette nested structure
        # ✨ USE EXACT SAME 3-COLOR LOGIC AS FRONTEND DROPDOWN! ✨
        color_palette = theme_dict.get('color_palette', {})

        # Get the 3 main colors array (like frontend: palette[0]=bg, palette[1]=text, palette[2]=accent)
        colors_array = color_palette.get('colors', ['#0A0E27', '#FFFFFF', '#2563EB'])

        # Map exactly like frontend ThemePanel dropdown does (lines 505-519)
        primary_bg = colors_array[0] if len(colors_array) > 0 else '#0A0E27'
        text_primary = colors_array[1] if len(colors_array) > 1 else '#FFFFFF'
        accent_1 = colors_array[2] if len(colors_array) > 2 else '#2563EB'

        logger.info(f"🎨 Using 3 colors from dropdown logic: bg={primary_bg}, text={text_primary}, accent={accent_1}")

        # ONLY 3 colors like dropdown (no secondary/accent2 to keep it simple and avoid black/white)
        theme_colors = {
            'background': primary_bg,      # palette[0] - For slide backgrounds
            'text': text_primary,          # palette[1] - For ALL text
            'accent': accent_1,            # palette[2] - For emphasis/highlights
        }
        
        slide_type = getattr(context.slide_outline, 'slide_type', 'content')
        
        # ═══════════════════════════════════════════════════════════
        # PART 1: STATIC CONTENT (CACHED BY CLAUDE - REUSED FOR ALL SLIDES!)
        # Uses the ENHANCED system prompt with theme colors, icons, spacing, etc.
        # ═══════════════════════════════════════════════════════════

        # Determine mode based on detail_level from deck_outline.notes
        # detail_level: "quick"|"standard"|"detailed"
        detail_level = None
        try:
            # First check if detail_level is stored in deck_outline.notes
            notes = getattr(context.deck_outline, 'notes', None)
            if isinstance(notes, dict):
                detail_level = notes.get('detail_level')
        except Exception:
            pass

        # If not in notes, check stylePreferences
        if not detail_level:
            try:
                style_prefs = getattr(context.deck_outline, 'stylePreferences', None)
                if style_prefs:
                    detail_level = getattr(style_prefs, 'detailLevel', None)
            except Exception:
                pass

        # If still not found, use visual_density as fallback
        if not detail_level:
            visual_density = getattr(context, 'visual_density', 'moderate')
            detail_level = 'detailed' if visual_density in ["data-heavy", "rich"] else 'standard'

        # Mode detection logic based on detail_level:
        # - "detailed" → DETAILED MODE (comprehensive, data-rich, 60-80% charts)
        # - "standard"|"quick" → PRESENTATION MODE (design-focused, <30% charts, high impact only)
        mode = "detailed" if detail_level == "detailed" else "presentation"

        logger.info(f"🎨 [MODE DETECTION] detail_level={detail_level} → mode={mode.upper()}")

        # Use V2 prompt (mode-specific design philosophy)
        v2_prompt = get_html_inspired_system_prompt_v2()
        schema_section = get_condensed_component_schemas()

        # Build cached part: V2 prompt + condensed schemas
        cached_part = f"""{v2_prompt}

{schema_section}"""

        # ═══════════════════════════════════════════════════════════
        # CACHE BREAKPOINT - Everything after this is slide-specific
        # ═══════════════════════════════════════════════════════════
        
        # ═══════════════════════════════════════════════════════════
        # PART 2: DYNAMIC CONTENT (SLIDE-SPECIFIC - NOT CACHED)
        # ═══════════════════════════════════════════════════════════
        
        guidance = self._get_concise_slide_guidance(slide_type)
        
        # Check for chart data
        chart_info = ""
        if context.has_chart_data:
            try:
                extracted = context.slide_outline.extractedData
                chart_type = extracted.chartType if hasattr(extracted, 'chartType') else extracted.get('chartType', 'bar')
                data = extracted.data if hasattr(extracted, 'data') else extracted.get('data', [])
                data_count = len(data) if data else 0
                
                logger.info(f"📊 [CHART] Slide {context.slide_index + 1} has chart data: {chart_type} with {data_count} points")
                
                chart_info = f"\n\n📊 CHART DATA AVAILABLE - MUST INCLUDE CHART COMPONENT:\nChart Type: {chart_type}\nData Points: {data_count}\n"
                
                # Add ALL the data (it's in dynamic part, so it's okay)
                if data and len(data) > 0:
                    import json
                    chart_info += f"\nCOMPLETE DATA:\n{json.dumps(data, indent=2)}\n"
                    chart_info += f"\n🚨 CRITICAL: Use Chart component positioned left (x=80, width=880) OR right (x=960, width=880)!"
                    chart_info += f"\nChart props: chartType='{chart_type}', data=[use exact data above], showLegend=false, theme='light'"
                
                logger.info(f"✅ [CHART] Added {data_count} data points to prompt for slide {context.slide_index + 1}")
            except Exception as e:
                logger.error(f"❌ [CHART] Error extracting chart info: {e}")
                chart_info = "\n\n📊 CHART DATA AVAILABLE - Include Chart component!"
        
        # Get mode-specific guidance from V2 prompt
        mode_guidance = get_mode_specific_guidance(mode)

        dynamic_part = f"""
═══════════════════════════════════════════════════════════
🎯 SLIDE {context.slide_index + 1} OF {context.total_slides} - CREATE NOW
═══════════════════════════════════════════════════════════

**SLIDE TITLE:** {context.slide_outline.title}

**CONTENT:**
{context.slide_outline.content}

**SLIDE TYPE:** {slide_type}{chart_info}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 THEME COLORS - CONCRETE JSON EXAMPLES (COPY THESE EXACTLY!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOUR 3 THEME COLORS:
  Background: {theme_colors['background']}
  Text:       {theme_colors['text']}
  Accent:     {theme_colors['accent']}

COMPONENT EXAMPLES - COPY THESE PROP VALUES EXACTLY:

Background component:
{{"type": "Background", "props": {{"backgroundColor": "{theme_colors['background']}", "backgroundType": "color", "gradient": null}}}}

TiptapTextBlock (ALL text):
{{"type": "TiptapTextBlock", "props": {{"textColor": "{theme_colors['text']}", "fontFamily": "Inter", ...}}}}

Shape (decorative elements):
{{"type": "Shape", "props": {{"fill": "{theme_colors['accent']}", "shapeType": "circle", ...}}}}

ShapeWithText (boxes with text):
{{"type": "ShapeWithText", "props": {{"fill": "{theme_colors['accent']}", "textColor": "{theme_colors['text']}", ...}}}}

Icon (if absolutely needed, 0-2 MAX):
{{"type": "Icon", "props": {{"color": "{theme_colors['accent']}", "iconName": "trending-up", ...}}}}

Line/Lines:
{{"type": "Line", "props": {{"stroke": "{theme_colors['accent']}", ...}}}}

🚨 ABSOLUTELY FORBIDDEN:
❌ Background with textColor={theme_colors['text']} - WRONG!
❌ TiptapTextBlock with textColor={theme_colors['background']} - WRONG!
❌ Shape with fill={theme_colors['text']} - WRONG!

✅ ONLY USE:
- {theme_colors['background']} for: Background.backgroundColor
- {theme_colors['text']} for: TiptapTextBlock.textColor, ShapeWithText.textColor
- {theme_colors['accent']} for: Shape.fill, Icon.color, Line.stroke

**Fonts:**
• Heading: {theme_dict.get('typography', {}).get('hero_title', {}).get('family', 'Inter')}
• Body: {theme_dict.get('typography', {}).get('body_text', {}).get('family', 'Inter')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎭 MODE-SPECIFIC GUIDANCE FOR THIS DECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{mode_guidance}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CRITICAL VALIDATION CHECKLIST - VERIFY BEFORE OUTPUTTING!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 COLOR VALIDATION (CHECK EVERY COMPONENT):
✅ Background: backgroundColor="{theme_colors['background']}" ← EXACTLY THIS VALUE
✅ TiptapTextBlock: textColor="{theme_colors['text']}" ← EXACTLY THIS VALUE
✅ Shape: fill="{theme_colors['accent']}" ← EXACTLY THIS VALUE
✅ Icon: color="{theme_colors['accent']}" ← EXACTLY THIS VALUE
✅ Line: stroke="{theme_colors['accent']}" ← EXACTLY THIS VALUE

❌ COMMON MISTAKES TO AVOID:
❌ Background with backgroundColor="{theme_colors['text']}" - FAILS VALIDATION!
❌ Background with backgroundColor="{theme_colors['accent']}" - FAILS VALIDATION!
❌ TiptapTextBlock with textColor="{theme_colors['background']}" - FAILS VALIDATION!
❌ TiptapTextBlock with textColor="{theme_colors['accent']}" - FAILS VALIDATION!
❌ Shape with fill="{theme_colors['text']}" - FAILS VALIDATION!
❌ Using ANY color other than these 3 theme colors - FAILS VALIDATION!

📊 CHART COLORS (if chart present):
Generate palette from ACCENT color {theme_colors['accent']} by varying brightness:
- Take accent color {theme_colors['accent']}
- Create variations: darker → original → lighter
- Apply to each data series/item
- Chart background should be transparent or very light

✅ Other Rules:
✅ Tables: backgroundColor=null, borderWidth=0
✅ Lines: Always use startPoint/endPoint coordinates
✅ Heights: Use fontSize × 1.15 formula

🎯 ICONS - USE SPARINGLY!
🚨 MOST SLIDES NEED 0 ICONS - Only use for critical metrics/dashboards!
❌ DO NOT use icons for: Regular bullets, section headers, decorative purposes, large background decoration
✅ USE icons for: Key dashboard metrics (1-2 MAX), hero numbers with semantic meaning
📚 When absolutely needed: 5000+ icons available (Lucide default) - Use kebab-case: "dollar-sign", "trending-up"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ EXAMPLE SLIDE WITH CORRECT COLORS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[
  {{"type": "Background", "props": {{"backgroundColor": "{theme_colors['background']}", "backgroundType": "color"}}}},
  {{"type": "TiptapTextBlock", "props": {{"textColor": "{theme_colors['text']}", "x": 100, "y": 100, "content": "Title"}}}},
  {{"type": "Shape", "props": {{"fill": "{theme_colors['accent']}", "x": 100, "y": 200, "width": 100, "height": 100}}}}
]
↑ THIS IS CORRECT - Background={theme_colors['background']}, Text={theme_colors['text']}, Shape={theme_colors['accent']}

Output valid JSON component array now (using the 3 colors above EXACTLY):"""
        
        # Combine with cache delimiter for Claude caching
        full_prompt = cached_part + CACHE_DELIM + dynamic_part
        
        # Log hash of cached part to verify it's identical across slides
        import hashlib
        cached_hash = hashlib.md5(cached_part.encode()).hexdigest()[:8]
        logger.info(f"📝 Prompt built: {len(cached_part)} chars CACHED (hash: {cached_hash}) + {len(dynamic_part)} chars dynamic")
        
        return full_prompt
    
    def _get_concise_slide_guidance(self, slide_type: str) -> str:
        """Ultra-concise slide-type specific guidance"""
        slide_type = slide_type.lower()
        
        if slide_type == 'title' or slide_type == 'cover':
            return "TITLE: ABSOLUTELY MASSIVE TiptapTextBlock (450-650pt, fontWeight=900, width=1700-1800) + clean gradient/solid Background (NO images!). BLOW UP THE TEXT - TAKE UP THE PAGE!"
        
        elif 'stat' in slide_type:
            return "STAT: ReactBits count-up OR CustomComponent dashboard (theme colors ONLY!). Clean layout, minimal boxes. Add Image for visual impact!"
        
        elif 'comparison' in slide_type:
            return "COMPARISON: CustomComponent (theme colors!) OR split + Lines divider + TiptapTextBlock (NO boxes). Add Image for context!"
        
        elif 'process' in slide_type or 'timeline' in slide_type:
            return "PROCESS: CustomComponent timeline (theme colors!) OR Lines + minimal Shapes + TiptapTextBlock. Add Image (diagram/illustration)!"
        
        elif 'data' in slide_type or 'chart' in slide_type:
            return "DATA: Include Chart component with provided data OR CustomComponent visualization. Position chart left/right (x=80 width=880 OR x=960 width=880). Add TiptapTextBlock insights."
        
        else:
            return "CONTENT: TiptapTextBlock directly on background (NO boxes!) + Image (LARGE, 50-60% of slide). Shape ONLY for key highlights. Use theme colors!"
    
    async def complete_generation(self, context: SlideGenerationContext) -> None:
        """Pass through to base generator"""
        if hasattr(self.base_generator, 'complete_generation'):
            await self.base_generator.complete_generation(context)

