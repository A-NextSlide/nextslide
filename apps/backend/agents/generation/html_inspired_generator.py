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
    get_mode_specific_guidance
)
from agents.generation.design_pattern_examples import get_pattern_examples_text
from agents.rag.schema_extractor import SchemaExtractor
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
        self._schema_extractor = SchemaExtractor()  # Initialize schema extractor
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
            return "Components: SmartLayout, StatCard, BigTitle, SmartImage, Background, Shape, TiptapTextBlock, Image, Line, Lines, Chart, CustomComponent, ReactBits, Icon, Group, Table\n"
    
    def _build_html_inspired_user_prompt_dynamic(
        self,
        context: SlideGenerationContext
    ) -> str:
        """
        Build user prompt optimized for Claude caching.
        STREAMLINED VERSION - focuses on essentials only.
        """

        # Extract theme info
        theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else {}
        color_palette = theme_dict.get('color_palette', {})

        # Extract colors
        primary_bg = color_palette.get('primary_background', '#0A0E27')
        text_primary = color_palette.get('primary_text', '#FFFFFF')
        accent_1 = color_palette.get('accent_1', '#2563EB')

        theme_colors = {
            'background': primary_bg,
            'text': text_primary,
            'accent': accent_1,
        }

        slide_type = getattr(context.slide_outline, 'slide_type', 'content')

        # Determine mode
        detail_level = None
        try:
            notes = getattr(context.deck_outline, 'notes', None)
            if isinstance(notes, dict):
                detail_level = notes.get('detail_level')
        except Exception:
            pass

        if not detail_level:
            detail_level = 'standard'

        mode = "structured" if detail_level == "detailed" else "creative"

        # Get system prompt and schemas
        v2_prompt = get_html_inspired_system_prompt_v2()
        schema_section = self._load_component_schemas()

        cached_part = f"""{v2_prompt}

{schema_section}"""

        # Check for chart data
        chart_info = ""
        should_include_chart = context.has_chart_data

        if should_include_chart:
            try:
                extracted = context.slide_outline.extractedData
                chart_type = extracted.chartType if hasattr(extracted, 'chartType') else extracted.get('chartType', 'bar')
                data = extracted.data if hasattr(extracted, 'data') else extracted.get('data', [])

                import json
                chart_info = f"""

📊 CHART DATA - USE PATTERN 4 (Chart + Insights):
Chart Type: {chart_type}
Data: {json.dumps(data, indent=2)}

Position: Chart at x=80, y=280, width=800, height=540
Insights: Text blocks at x=960, y=280 (stacked with 60px gaps)
NO images on this slide - chart IS the visual!"""
            except Exception as e:
                logger.error(f"Chart error: {e}")

        # Get mode guidance
        mode_guidance = get_mode_specific_guidance(mode)

        # Build dynamic part - MUCH SIMPLER
        dynamic_part = f"""
═══════════════════════════════════════════════════════════
🎯 SLIDE {context.slide_index + 1} OF {context.total_slides}
═══════════════════════════════════════════════════════════

**TITLE:** {context.slide_outline.title}
**TYPE:** {slide_type}

**CONTENT:**
{context.slide_outline.content}
{chart_info}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 THEME COLORS (USE EXACTLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Background: {theme_colors['background']}
Text:       {theme_colors['text']}
Accent:     {theme_colors['accent']}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎭 MODE: {mode.upper()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{mode_guidance}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ BEFORE OUTPUT - VERIFY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ Background is FIRST component with backgroundColor="{theme_colors['background']}"
□ All text uses textColor="{theme_colors['text']}"
□ Accents use fill/color="{theme_colors['accent']}"
□ nextY = currentY + height + 60 for EVERY component (no overlaps!)
□ All bounds within 80-1840 (x), 80-1000 (y)
□ TiptapTextBlock has: alignment, verticalAlignment, padding=0
□ Font sizes: titles ≥48pt, body ≥32pt
□ Chart OR Image, never both

Output valid JSON array:"""

        # Check for blueprint
        blueprint_section = self._get_blueprint_from_theme(context)
        if blueprint_section:
            dynamic_part = blueprint_section + "\n\n" + dynamic_part

        full_prompt = cached_part + CACHE_DELIM + dynamic_part

        import hashlib
        cached_hash = hashlib.md5(cached_part.encode()).hexdigest()[:8]
        logger.info(f"📝 Prompt: {len(cached_part)} cached (hash:{cached_hash}) + {len(dynamic_part)} dynamic")

        return full_prompt
    
    def _get_concise_slide_guidance(self, slide_type: str) -> str:
        """Ultra-concise slide-type specific guidance"""
        slide_type = slide_type.lower()
        
        if slide_type == 'title' or slide_type == 'cover':
            return "TITLE: ABSOLUTELY MASSIVE TiptapTextBlock (450-650pt, fontWeight=900, width=1700-1800, alignment='left', verticalAlignment='top') + clean solid Background (NO images, NO gradients!). 🚨 CRITICAL: ALWAYS use alignment='left' for title slides - NEVER center!"
        
        elif 'stat' in slide_type:
            return "STAT: ReactBits count-up OR CustomComponent dashboard (theme colors ONLY!). For TiptapTextBlock stats: alignment='center', verticalAlignment='middle'. Clean layout, minimal boxes. Add Image for visual impact!"
        
        elif 'comparison' in slide_type:
            return "COMPARISON: CustomComponent (theme colors!) OR split + Lines divider + TiptapTextBlock (alignment='center' for side-by-side items). Add Image for context!"
        
        elif 'process' in slide_type or 'timeline' in slide_type:
            return "PROCESS: CustomComponent timeline (theme colors!) OR Lines + minimal Shapes + TiptapTextBlock (alignment='left', verticalAlignment='top'). Add Image (diagram/illustration)!"
        
        elif 'data' in slide_type or 'chart' in slide_type:
            return "DATA: Use SmartLayout (SplitRight) with Chart in 'right' slot and BigTitle/StatCard in 'left' slot. Or use GridLayout for multiple stats."
        
        else:
            return "CONTENT: Use SmartLayout (SplitRight) with BigTitle in 'left' slot and SmartImage in 'right' slot. Avoid manual TiptapTextBlock placement."
    
    def _get_blueprint_from_theme(self, context: SlideGenerationContext) -> str:
        """Extract and format LayoutArchitect blueprint if available"""
        try:
            # Get theme
            theme = context.theme
            slide_themes = None

            print(f"🔍 [BLUEPRINT] Checking for blueprint for slide {context.slide_index + 1}")
            print(f"   Theme type: {type(theme)}")
            print(f"   Has slide_themes attr: {hasattr(theme, 'slide_themes')}")

            if hasattr(theme, 'slide_themes'):
                slide_themes = theme.slide_themes
                print(f"   slide_themes from attr: {type(slide_themes)}, len={len(slide_themes) if slide_themes else 0}")
            elif isinstance(theme, dict):
                slide_themes = theme.get('slide_themes', {})
                print(f"   slide_themes from dict: {type(slide_themes)}, len={len(slide_themes) if slide_themes else 0}")

            if not slide_themes:
                print(f"   ❌ No slide_themes found")
                return ""

            # Find blueprint for this slide
            slide_id = f"slide-{context.slide_index}"
            print(f"   Looking for slide_id: {slide_id}")
            print(f"   Available slide_ids: {list(slide_themes.keys())[:5]}")

            if slide_id not in slide_themes:
                print(f"   ❌ slide_id {slide_id} not in slide_themes")
                return ""

            blueprint = slide_themes[slide_id]

            # Check if this is a LayoutArchitect blueprint
            if not isinstance(blueprint, dict) or 'components' not in blueprint:
                return ""

            print(f"✅ Blueprint found for slide {context.slide_index + 1}!")

            # Format blueprint into prompt section
            reasoning = blueprint.get('layout_reasoning', 'Editorial layout')
            components = blueprint.get('components', [])

            if not components:
                return ""

            section = "\n" + "="*80 + "\n"
            section += "🎨 EDITORIAL LAYOUT BLUEPRINT - YOU MUST FOLLOW THIS EXACTLY!\n"
            section += "="*80 + "\n\n"
            section += "🚨 CRITICAL: This is a pre-designed editorial layout by a professional designer.\n"
            section += "DO NOT improvise, simplify, or skip components. Implement EXACTLY as specified.\n"
            section += "Use these EXACT positions, sizes, colors, and component types.\n\n"
            section += f"DESIGN CONCEPT: {reasoning}\n\n"
            section += f"REQUIRED COMPONENTS ({len(components)} total):\n"
            section += "Implement ALL components below with these EXACT specifications:\n\n"

            # Include ALL components, not just first 10!
            for i, comp in enumerate(components, 1):
                comp_type = comp.get('type', 'Unknown')
                props = comp.get('props', {})

                section += f"[{i}] {comp_type}\n"

                # Background
                if comp_type == 'Background':
                    if 'gradient' in props:
                        grad = props['gradient']
                        section += f"    gradient: {grad.get('type')} at {grad.get('angle')}°\n"
                        section += f"    colors: {grad.get('colors')}\n"
                    elif 'backgroundColor' in props:
                        section += f"    backgroundColor: {props['backgroundColor']}\n"
                    elif 'color' in props:
                        section += f"    color: {props['color']}\n"

                # TiptapTextBlock
                elif comp_type == 'TiptapTextBlock':
                    # Check if position is nested or direct
                    if 'position' in props and isinstance(props['position'], dict):
                        x = props['position'].get('x')
                        y = props['position'].get('y')
                    else:
                        x = props.get('x')
                        y = props.get('y')

                    section += f"    position: x={x}, y={y}\n"
                    section += f"    size: {props.get('width')}×{props.get('height')}\n"
                    section += f"    font: {props.get('fontSize')}pt {props.get('fontFamily', 'inherit')}\n"
                    if 'textAlign' in props:
                        section += f"    align: {props['textAlign']}\n"
                    if 'textColor' in props:
                        section += f"    color: {props['textColor']}\n"

                # Shape
                elif comp_type == 'Shape':
                    # Check if position is nested or direct
                    if 'position' in props and isinstance(props['position'], dict):
                        x = props['position'].get('x')
                        y = props['position'].get('y')
                    else:
                        x = props.get('x')
                        y = props.get('y')

                    section += f"    position: x={x}, y={y}\n"
                    section += f"    size: {props.get('width')}×{props.get('height')}\n"
                    if 'fill' in props:
                        section += f"    fill: {props['fill']}\n"
                    if 'borderRadius' in props:
                        section += f"    borderRadius: {props['borderRadius']}px\n"

                # Image
                elif comp_type == 'Image':
                    # Check if position is nested or direct
                    if 'position' in props and isinstance(props['position'], dict):
                        x = props['position'].get('x')
                        y = props['position'].get('y')
                    else:
                        x = props.get('x')
                        y = props.get('y')

                    section += f"    position: x={x}, y={y}\n"
                    section += f"    size: {props.get('width')}×{props.get('height')}\n"
                    if 'borderRadius' in props:
                        section += f"    borderRadius: {props['borderRadius']}px\n"

                # Chart
                elif comp_type == 'Chart':
                    # Check if position is nested or direct
                    if 'position' in props and isinstance(props['position'], dict):
                        x = props['position'].get('x')
                        y = props['position'].get('y')
                    else:
                        x = props.get('x')
                        y = props.get('y')

                    section += f"    position: x={x}, y={y}\n"
                    section += f"    size: {props.get('width')}×{props.get('height')}\n"
                    if 'chartType' in props:
                        section += f"    chartType: {props['chartType']}\n"

                # CustomComponent
                elif comp_type == 'CustomComponent':
                    # Check if position is nested or direct
                    if 'position' in props and isinstance(props['position'], dict):
                        x = props['position'].get('x')
                        y = props['position'].get('y')
                    else:
                        x = props.get('x')
                        y = props.get('y')

                    section += f"    position: x={x}, y={y}\n"
                    section += f"    size: {props.get('width')}×{props.get('height')}\n"
                    if 'variant' in props:
                        section += f"    variant: {props['variant']}\n"

                # Lines
                elif comp_type == 'Lines':
                    if 'lines' in props:
                        lines = props['lines']
                        if lines and len(lines) > 0:
                            line = lines[0]
                            section += f"    x1={line.get('x1')}, y1={line.get('y1')}, x2={line.get('x2')}, y2={line.get('y2')}\n"

            section += "\n" + "="*80 + "\n"
            section += "⚠️  CRITICAL REQUIREMENTS:\n"
            section += "="*80 + "\n"
            section += "1. USE THESE EXACT POSITIONS AND SIZES - Do not adjust or round!\n"
            section += "2. INCLUDE ALL COMPONENTS LISTED ABOVE - Do not skip or simplify!\n"
            section += "3. USE THE SPECIFIED COLORS, FONTS, AND STYLES - Do not substitute!\n"
            section += "4. MAINTAIN THE DESIGN CONCEPT - This is an editorial layout, not generic!\n"
            section += "5. OUTPUT EXACTLY WHAT IS SPECIFIED - No improvisation!\n"
            section += "="*80 + "\n"

            return section

        except Exception as e:
            print(f"⚠️  Error extracting blueprint: {e}")
            return ""

    async def complete_generation(self, context: SlideGenerationContext) -> None:
        """Pass through to base generator"""
        if hasattr(self.base_generator, 'complete_generation'):
            await self.base_generator.complete_generation(context)

