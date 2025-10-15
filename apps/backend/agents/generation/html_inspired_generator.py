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
        color_palette = theme_dict.get('color_palette', {})

        # Get background colors (for backgrounds)
        primary_bg = color_palette.get('primary_background') or color_palette.get('backgrounds', ['#0A0E27'])[0] or '#0A0E27'
        secondary_bg = color_palette.get('secondary_background') or color_palette.get('backgrounds', [None, '#1A1F3A'])[1] or '#1A1F3A'

        # Get accent colors (for emphasis/highlights)
        accent_1 = color_palette.get('accent_1') or color_palette.get('accents', ['#2563EB'])[0] or '#2563EB'
        accent_2 = color_palette.get('accent_2') or color_palette.get('accents', [None, '#EC4899'])[1] or '#EC4899'

        # Get text colors (for readability on backgrounds)
        text_colors = color_palette.get('text_colors', {})
        text_primary = text_colors.get('primary', '#FFFFFF')  # Default to white for dark backgrounds

        # ENSURE we have at least 3 DISTINCT colors: background, text, accent
        theme_colors = {
            'background': primary_bg,      # For backgrounds (70% usage)
            'text': text_primary,          # For text content (must contrast with background)
            'accent': accent_1,            # For emphasis/highlights (10-20% usage)
            'secondary': secondary_bg,     # Secondary background option
            'accent2': accent_2            # Secondary accent option
        }
        
        slide_type = getattr(context.slide_outline, 'slide_type', 'content')
        
        # ═══════════════════════════════════════════════════════════
        # PART 1: STATIC CONTENT (CACHED BY CLAUDE - REUSED FOR ALL SLIDES!)
        # Uses the ENHANCED system prompt with theme colors, icons, spacing, etc.
        # ═══════════════════════════════════════════════════════════

        # Determine mode based on visual_density or stylePreferences
        # visual_density: "minimal"|"moderate"|"rich"|"data-heavy"
        visual_density = getattr(context, 'visual_density', 'moderate')
        style_prefs = getattr(context.deck_outline, 'stylePreferences', None)

        # Mode detection logic:
        # - "data-heavy" or "rich" → DETAILED MODE (structured, data-dense)
        # - "minimal" or "moderate" → PRESENTATION MODE (wild, creative)
        mode = "detailed" if visual_density in ["data-heavy", "rich"] else "presentation"

        logger.info(f"🎨 [MODE DETECTION] visual_density={visual_density} → mode={mode.upper()}")

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
🎨 THEME COLORS (MANDATORY - USE THESE EXACT COLORS!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Background:  {theme_colors['background']}  ← For slide backgrounds, shapes (70% usage)
Text:        {theme_colors['text']}        ← For ALL text content (must be readable!)
Accent:      {theme_colors['accent']}      ← For emphasis, highlights, key numbers (20% usage)
Secondary:   {theme_colors['secondary']}   ← For alternating backgrounds, sections
Accent 2:    {theme_colors['accent2']}     ← For secondary highlights, variety

🚨 USE ALL 3+ COLORS! Don't use just 2! Mix background, text, and accent throughout slide.

**Fonts:**
• Heading: {theme_dict.get('typography', {}).get('hero_title', {}).get('family', 'Inter')}
• Body: {theme_dict.get('typography', {}).get('body_text', {}).get('family', 'Inter')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎭 MODE-SPECIFIC GUIDANCE FOR THIS DECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{mode_guidance}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CRITICAL REMINDERS FOR THIS SLIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Tables: backgroundColor=null, borderWidth=0 (unless design-focused)
✅ Theme colors: Use {theme_colors['background']}, {theme_colors['text']}, {theme_colors['accent']}, {theme_colors['secondary']}
✅ Lines: Always use startPoint/endPoint coordinates
✅ Heights: Use fontSize × 1.15 formula
✅ TiptapTextBlock: Split into segments for multi-color formatting

🎯 ICONS - USE SPARINGLY!
🚨 MOST SLIDES NEED 0 ICONS - Only use for critical metrics/dashboards!
❌ DO NOT use icons for: Regular bullets, section headers, decorative purposes, large background decoration
✅ USE icons for: Key dashboard metrics (1-2 MAX), hero numbers with semantic meaning
📚 When absolutely needed: 5000+ icons available (Lucide default) - Use kebab-case: "dollar-sign", "trending-up"

Output valid JSON component array now:"""
        
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
            return "TITLE: Clean gradient bg + massive TiptapTextBlock (160-240pt, NO box). Add Image (logo) if available."
        
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

