"""
Two-Pass Slide Generator

Philosophy: Structure first, style second.

Pass 1 (Structure Analysis):
- Analyzes slide content to determine optimal layout structure
- Outputs: semantic layout type, component list, content zones
- Uses fast model for speed

Pass 2 (Design Implementation):
- Takes structure and generates precise positioned components
- Applies theme colors, typography, and spacing rules
- Uses capable model for quality

This approach ensures:
1. Content is properly analyzed before design decisions
2. Layout is semantic and content-appropriate
3. No overlapping - positions are calculated based on structure
4. Consistent, beautiful results
"""

import asyncio
import json
import re
from typing import Dict, Any, List, Optional, AsyncIterator, Tuple
from dataclasses import dataclass
from enum import Enum

from agents.ai.clients import get_client, invoke
from agents.config import COMPOSER_MODEL
from agents.domain.models import SlideGenerationContext, ThemeSpec
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Model configuration
STRUCTURE_MODEL = "claude-haiku-4-5"  # Fast model for structure analysis
DESIGN_MODEL = "claude-haiku-4-5"     # Using same model but different prompts


class LayoutType(Enum):
    """Semantic layout types that determine component arrangement."""
    TITLE_HERO = "title_hero"           # Big title, minimal content
    SPLIT_LEFT = "split_left"           # Content left, visual right
    SPLIT_RIGHT = "split_right"         # Visual left, content right
    CONTENT_FOCUSED = "content_focused" # Text-heavy, structured content
    STAT_HIGHLIGHT = "stat_highlight"   # Key metrics/numbers
    COMPARISON = "comparison"           # Side-by-side comparison
    GRID = "grid"                       # Multiple items in grid
    TIMELINE = "timeline"               # Sequential/process flow
    QUOTE = "quote"                     # Quote/testimonial style
    FULL_VISUAL = "full_visual"         # Image/chart dominant


@dataclass
class SlideStructure:
    """Output of Pass 1: Semantic structure of a slide."""
    layout_type: LayoutType
    primary_zone: str              # "left", "right", "center", "full"
    secondary_zone: Optional[str]  # Optional secondary zone
    components: List[Dict[str, Any]]  # Component specs with semantic roles
    content_density: str           # "minimal", "moderate", "dense"
    visual_weight: str             # "text_heavy", "balanced", "visual_heavy"
    reasoning: str                 # Why this structure was chosen


class TwoPassGenerator:
    """
    Two-pass slide generator that separates structure analysis from design.

    This ensures content-appropriate layouts with precise positioning.
    """

    def __init__(self):
        self.structure_model = STRUCTURE_MODEL
        self.design_model = DESIGN_MODEL
        self.generation_timeout = 120.0

    async def generate_slide(
        self,
        context: SlideGenerationContext
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Generate slide using two-pass approach.

        Yields progress events and final slide data.
        """
        slide_index = context.slide_index
        logger.info(f"🎨 Two-Pass Generation starting for slide {slide_index + 1}")

        # Yield progress event
        yield {"type": "progress", "message": f"Analyzing content structure..."}

        try:
            # Pass 1: Analyze structure
            structure = await self._pass1_analyze_structure(context)
            logger.info(f"✅ Pass 1 complete: {structure.layout_type.value} layout")

            yield {"type": "progress", "message": f"Designing slide layout..."}

            # Pass 2: Generate design
            slide_data = await self._pass2_generate_design(context, structure)
            logger.info(f"✅ Pass 2 complete: {len(slide_data.get('components', []))} components")

            # Validate and fix any issues
            slide_data = self._validate_and_fix(slide_data, context)

            yield {"type": "slide_generated", "slide_data": slide_data}

        except Exception as e:
            logger.error(f"❌ Two-pass generation failed: {e}")
            # Fallback to simple slide
            fallback = self._create_fallback_slide(context)
            yield {"type": "slide_generated", "slide_data": fallback}

    async def _pass1_analyze_structure(
        self,
        context: SlideGenerationContext
    ) -> SlideStructure:
        """
        Pass 1: Analyze content and determine optimal structure.

        This is a fast analysis that determines:
        - What type of layout best fits the content
        - What components are needed
        - How to zone the slide
        """
        slide_outline = context.slide_outline
        title = getattr(slide_outline, 'title', '')
        content = getattr(slide_outline, 'content', '')
        slide_type = getattr(slide_outline, 'slide_type', 'content')
        has_chart = context.has_chart_data

        # Build analysis prompt
        system_prompt = self._build_structure_system_prompt()
        user_prompt = self._build_structure_user_prompt(
            title, content, slide_type, has_chart, context
        )

        # Get client and invoke
        client, model_name = get_client(self.structure_model)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        try:
            loop = asyncio.get_event_loop()
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    invoke,
                    client,
                    model_name,
                    messages,
                    None,  # No response model, we parse JSON
                    4000,  # Small token limit for structure
                    0.3,   # Low temperature for consistency
                    context.deck_uuid,
                    True,
                    context.slide_index
                ),
                timeout=30.0  # Fast timeout for structure pass
            )

            # Parse response
            structure = self._parse_structure_response(response, context)
            return structure

        except Exception as e:
            logger.warning(f"Structure analysis failed: {e}, using heuristics")
            return self._heuristic_structure(title, content, slide_type, has_chart)

    async def _pass2_generate_design(
        self,
        context: SlideGenerationContext,
        structure: SlideStructure
    ) -> Dict[str, Any]:
        """
        Pass 2: Generate the actual slide design with precise positioning.

        Takes the structure from Pass 1 and creates:
        - Exact component positions
        - Proper sizes and spacing
        - Theme-consistent styling
        """
        # Build design prompt
        system_prompt = self._build_design_system_prompt(context)
        user_prompt = self._build_design_user_prompt(context, structure)

        # Get client and invoke
        client, model_name = get_client(self.design_model)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        try:
            loop = asyncio.get_event_loop()
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    invoke,
                    client,
                    model_name,
                    messages,
                    None,  # Parse JSON ourselves
                    16000,  # Larger limit for design
                    0.5,   # Moderate temperature
                    context.deck_uuid,
                    True,
                    context.slide_index
                ),
                timeout=self.generation_timeout
            )

            # Parse and validate response
            slide_data = self._parse_design_response(response, context)
            return slide_data

        except Exception as e:
            logger.error(f"Design generation failed: {e}")
            # Create slide from structure with deterministic positioning
            return self._structure_to_slide(structure, context)

    def _build_structure_system_prompt(self) -> str:
        """System prompt for structure analysis."""
        return """You are a presentation structure analyzer. Your job is to analyze slide content and determine the optimal layout structure.

ANALYZE the content and output a JSON structure with:
1. layout_type: One of [title_hero, split_left, split_right, content_focused, stat_highlight, comparison, grid, timeline, quote, full_visual]
2. primary_zone: Where main content goes [left, right, center, full]
3. secondary_zone: Where secondary content goes (or null)
4. components: List of components needed with their semantic role
5. content_density: [minimal, moderate, dense]
6. visual_weight: [text_heavy, balanced, visual_heavy]
7. reasoning: Brief explanation of why this structure fits

LAYOUT SELECTION RULES:
- title_hero: First/last slides, very short content (<20 words)
- split_left/split_right: Content + image/chart combinations
- content_focused: Text-heavy slides with multiple points
- stat_highlight: Slides with key numbers/metrics
- comparison: Side-by-side comparisons, pros/cons
- grid: Multiple similar items (features, team, products)
- timeline: Sequential processes, roadmaps
- quote: Testimonials, quotes
- full_visual: Chart-dominant or image-dominant slides

OUTPUT ONLY VALID JSON, no markdown, no explanation outside JSON."""

    def _build_structure_user_prompt(
        self,
        title: str,
        content: str,
        slide_type: str,
        has_chart: bool,
        context: SlideGenerationContext
    ) -> str:
        """Build user prompt for structure analysis."""
        # Count content characteristics
        word_count = len(content.split())
        bullet_count = content.count('\n-') + content.count('\n•') + content.count('\n*')
        has_numbers = bool(re.search(r'\d+%|\$\d+|\d+x|\d+\s*(million|billion|k|m|b)', content.lower()))

        return f"""Analyze this slide and determine optimal structure:

SLIDE TYPE: {slide_type}
TITLE: {title}
CONTENT:
{content}

CHARACTERISTICS:
- Word count: {word_count}
- Bullet points: {bullet_count}
- Has numbers/stats: {has_numbers}
- Has chart data: {has_chart}
- Slide index: {context.slide_index + 1} of {context.total_slides}

Output JSON structure analysis:"""

    def _build_design_system_prompt(self, context: SlideGenerationContext) -> str:
        """System prompt for design generation."""
        # Extract theme colors
        theme = context.theme
        theme_dict = theme.to_dict() if hasattr(theme, 'to_dict') else {}
        color_palette = theme_dict.get('color_palette', {})

        bg_color = color_palette.get('primary_background', '#0A0E27')
        text_color = color_palette.get('primary_text', '#FFFFFF')
        accent_color = color_palette.get('accent_1', '#2563EB')

        typography = theme_dict.get('typography', {})
        hero_font = typography.get('hero_title', {}).get('family', 'Inter')
        body_font = typography.get('body_text', {}).get('family', 'Inter')

        return f"""You are a professional slide designer. Generate precise JSON components for a slide.

CANVAS: 1920x1080 pixels
SAFE AREA: x=[80-1840], y=[80-1000]

THEME COLORS (USE EXACTLY):
- Background: {bg_color}
- Text: {text_color}
- Accent: {accent_color}

TYPOGRAPHY:
- Hero font: {hero_font}
- Body font: {body_font}

COMPONENT TYPES AVAILABLE:
1. Background - Always first, backgroundColor="{bg_color}"
2. TiptapTextBlock - For all text content
3. Image - For visuals, use src="placeholder"
4. Shape - For decorative elements
5. Chart - Only if chart data provided
6. Lines - For dividers/connectors

CRITICAL RULES:
1. NO OVERLAPPING - Calculate positions sequentially
2. MINIMUM GAPS: 40px between components
3. TEXT SIZES: Title 56-80pt, Body 28-36pt, Caption 20-24pt
4. ALWAYS include position {{x, y}}, width, height for every component
5. Use alignment="left" for most text
6. Keep content CONCISE - this is a presentation, not a document

POSITIONING FORMULAS:
- Title: y = 80-120
- Content start: y = titleY + titleHeight + 40
- Next component: y = prevY + prevHeight + 40
- Left column: x = 80, width = 880
- Right column: x = 1000, width = 840
- Full width: x = 80, width = 1760

OUTPUT FORMAT:
{{
  "id": "slide-{context.slide_index + 1}",
  "title": "...",
  "components": [
    {{"type": "Background", "props": {{"backgroundColor": "{bg_color}"}}}},
    {{"type": "TiptapTextBlock", "props": {{...}}}},
    ...
  ]
}}

Output ONLY valid JSON, no markdown fences."""

    def _build_design_user_prompt(
        self,
        context: SlideGenerationContext,
        structure: SlideStructure
    ) -> str:
        """Build user prompt for design generation based on structure."""
        slide_outline = context.slide_outline
        title = getattr(slide_outline, 'title', '')
        content = getattr(slide_outline, 'content', '')

        # Get theme colors for examples
        theme = context.theme
        theme_dict = theme.to_dict() if hasattr(theme, 'to_dict') else {}
        color_palette = theme_dict.get('color_palette', {})
        bg_color = color_palette.get('primary_background', '#0A0E27')
        text_color = color_palette.get('primary_text', '#FFFFFF')
        accent_color = color_palette.get('accent_1', '#2563EB')

        # Build layout-specific instructions
        layout_instructions = self._get_layout_instructions(structure, context)

        # Chart data if present
        chart_section = ""
        if context.has_chart_data:
            try:
                extracted = context.slide_outline.extractedData
                chart_type = extracted.chartType if hasattr(extracted, 'chartType') else extracted.get('chartType', 'bar')
                data = extracted.data if hasattr(extracted, 'data') else extracted.get('data', [])
                chart_section = f"""

CHART DATA (MUST INCLUDE):
- Chart Type: {chart_type}
- Data: {json.dumps(data, indent=2)}
- Position chart in the visual zone
- Include title above chart"""
            except Exception:
                pass

        return f"""Design this slide using the analyzed structure:

STRUCTURE ANALYSIS:
- Layout: {structure.layout_type.value}
- Primary Zone: {structure.primary_zone}
- Secondary Zone: {structure.secondary_zone or 'none'}
- Content Density: {structure.content_density}
- Visual Weight: {structure.visual_weight}
- Reasoning: {structure.reasoning}

SLIDE CONTENT:
Title: {title}
Content:
{content}
{chart_section}

{layout_instructions}

REQUIRED COMPONENTS:
{self._format_required_components(structure, bg_color, text_color, accent_color)}

Generate the complete slide JSON now:"""

    def _get_layout_instructions(
        self,
        structure: SlideStructure,
        context: SlideGenerationContext
    ) -> str:
        """Get specific layout instructions based on structure type."""
        layout = structure.layout_type

        instructions = {
            LayoutType.TITLE_HERO: """
TITLE HERO LAYOUT:
- Title: x=80, y=350, width=1760, fontSize=72-96pt, alignment="left"
- Subtitle (if any): x=80, y=500, fontSize=32pt
- Keep minimal - max 2-3 text blocks
- No images on title slides
- Consider accent shape for visual interest""",

            LayoutType.SPLIT_LEFT: """
SPLIT LEFT LAYOUT (Content Left, Visual Right):
- LEFT COLUMN (Content): x=80, width=880
  - Title: y=100, fontSize=56pt
  - Body text: y=200+, fontSize=32pt, line-height 1.5
  - Stack content vertically with 40px gaps
- RIGHT COLUMN (Visual): x=1000, width=840
  - Image/Chart: y=100, height=800 max
  - objectFit="cover" for images""",

            LayoutType.SPLIT_RIGHT: """
SPLIT RIGHT LAYOUT (Visual Left, Content Right):
- LEFT COLUMN (Visual): x=80, width=880
  - Image/Chart: y=100, height=800 max
- RIGHT COLUMN (Content): x=1000, width=840
  - Title: y=100, fontSize=56pt
  - Body text: y=200+, fontSize=32pt
  - Stack content vertically with 40px gaps""",

            LayoutType.CONTENT_FOCUSED: """
CONTENT FOCUSED LAYOUT:
- Title: x=80, y=80, width=1760, fontSize=56pt
- Content sections start: y=180
- Use full width (1760) for text
- Break into multiple TiptapTextBlock for different sections
- Each block: fontSize=32pt, proper height based on content
- 40px gap between sections
- Consider left-aligned bullets or numbered lists""",

            LayoutType.STAT_HIGHLIGHT: """
STAT HIGHLIGHT LAYOUT:
- Title: x=80, y=80, fontSize=48pt
- Main stat: centered or left, y=300, fontSize=120-180pt, accent color
- Supporting text: below stat, fontSize=28pt
- Use Shape backgrounds for stat cards if multiple stats
- Grid layout for 2-4 stats: 2 columns, ~400px wide each""",

            LayoutType.COMPARISON: """
COMPARISON LAYOUT:
- Title: x=80, y=80, width=1760, fontSize=48pt
- Left item: x=80, width=880
- Right item: x=1000, width=840
- Vertical divider line at x=960 (optional)
- Mirror structure on both sides
- Each side: header + 3-5 points""",

            LayoutType.GRID: """
GRID LAYOUT:
- Title: x=80, y=80, fontSize=48pt
- Grid starts: y=180
- 2 columns: x=80 and x=980, width=860 each
- 3 columns: x=80, x=700, x=1320, width=540 each
- Row height: 300-400px depending on content
- 40px gaps between items
- Use Shape with accent background for cards""",

            LayoutType.TIMELINE: """
TIMELINE LAYOUT:
- Title: x=80, y=80, fontSize=48pt
- Timeline line: horizontal at y=300 or vertical at x=200
- Timeline items spread evenly
- Each item: number/icon + title + description
- Use Lines component for connecting line
- Accent color for timeline markers""",

            LayoutType.QUOTE: """
QUOTE LAYOUT:
- Large quotation marks or accent shape: x=80, y=200
- Quote text: x=160, y=300, width=1600, fontSize=48pt, italic
- Attribution: x=160, y=700, fontSize=24pt
- Minimal design, lots of whitespace
- Consider subtle background shape""",

            LayoutType.FULL_VISUAL: """
FULL VISUAL LAYOUT:
- Image/Chart dominates: x=80, y=180, width=1760, height=700
- Title: x=80, y=80, fontSize=48pt
- Caption below visual: y=900, fontSize=20pt
- Minimal text overlay"""
        }

        return instructions.get(layout, instructions[LayoutType.CONTENT_FOCUSED])

    def _format_required_components(
        self,
        structure: SlideStructure,
        bg_color: str,
        text_color: str,
        accent_color: str
    ) -> str:
        """Format the required components list."""
        components = [
            f'1. Background: {{"backgroundColor": "{bg_color}"}}'
        ]

        for i, comp in enumerate(structure.components, 2):
            role = comp.get('role', 'content')
            comp_type = comp.get('type', 'TiptapTextBlock')
            components.append(f'{i}. {comp_type} ({role}): textColor="{text_color}"')

        return '\n'.join(components)

    def _parse_structure_response(
        self,
        response: str,
        context: SlideGenerationContext
    ) -> SlideStructure:
        """Parse the structure analysis response."""
        try:
            # Clean response
            text = response.strip()
            if text.startswith('```'):
                text = re.sub(r'^```(?:json)?\s*', '', text)
                text = re.sub(r'\s*```$', '', text)

            data = json.loads(text)

            # Map layout type
            layout_str = data.get('layout_type', 'content_focused')
            try:
                layout_type = LayoutType(layout_str)
            except ValueError:
                layout_type = LayoutType.CONTENT_FOCUSED

            return SlideStructure(
                layout_type=layout_type,
                primary_zone=data.get('primary_zone', 'left'),
                secondary_zone=data.get('secondary_zone'),
                components=data.get('components', []),
                content_density=data.get('content_density', 'moderate'),
                visual_weight=data.get('visual_weight', 'balanced'),
                reasoning=data.get('reasoning', 'Default structure')
            )

        except Exception as e:
            logger.warning(f"Failed to parse structure response: {e}")
            # Fall back to heuristics
            slide_outline = context.slide_outline
            return self._heuristic_structure(
                getattr(slide_outline, 'title', ''),
                getattr(slide_outline, 'content', ''),
                getattr(slide_outline, 'slide_type', 'content'),
                context.has_chart_data
            )

    def _heuristic_structure(
        self,
        title: str,
        content: str,
        slide_type: str,
        has_chart: bool
    ) -> SlideStructure:
        """Determine structure using heuristics when AI analysis fails."""
        word_count = len(content.split())
        slide_type_lower = slide_type.lower()

        # Title slides
        if slide_type_lower in ['title', 'cover'] or word_count < 15:
            return SlideStructure(
                layout_type=LayoutType.TITLE_HERO,
                primary_zone="center",
                secondary_zone=None,
                components=[
                    {"type": "TiptapTextBlock", "role": "title"},
                    {"type": "TiptapTextBlock", "role": "subtitle"}
                ],
                content_density="minimal",
                visual_weight="text_heavy",
                reasoning="Title slide with minimal content"
            )

        # Stat slides
        if slide_type_lower in ['stat', 'metric', 'kpi'] or re.search(r'\d+%|\$\d+[MBK]?', content):
            return SlideStructure(
                layout_type=LayoutType.STAT_HIGHLIGHT,
                primary_zone="center",
                secondary_zone=None,
                components=[
                    {"type": "TiptapTextBlock", "role": "title"},
                    {"type": "TiptapTextBlock", "role": "stat"},
                    {"type": "TiptapTextBlock", "role": "description"}
                ],
                content_density="minimal",
                visual_weight="balanced",
                reasoning="Stat/metric highlight slide"
            )

        # Chart slides
        if has_chart:
            return SlideStructure(
                layout_type=LayoutType.SPLIT_LEFT,
                primary_zone="left",
                secondary_zone="right",
                components=[
                    {"type": "TiptapTextBlock", "role": "title"},
                    {"type": "TiptapTextBlock", "role": "insights"},
                    {"type": "Chart", "role": "visual"}
                ],
                content_density="moderate",
                visual_weight="visual_heavy",
                reasoning="Chart slide with insights"
            )

        # Content slides with moderate text
        if word_count < 80:
            return SlideStructure(
                layout_type=LayoutType.SPLIT_RIGHT,
                primary_zone="right",
                secondary_zone="left",
                components=[
                    {"type": "TiptapTextBlock", "role": "title"},
                    {"type": "TiptapTextBlock", "role": "body"},
                    {"type": "Image", "role": "visual"}
                ],
                content_density="moderate",
                visual_weight="balanced",
                reasoning="Balanced content with visual"
            )

        # Dense content
        return SlideStructure(
            layout_type=LayoutType.CONTENT_FOCUSED,
            primary_zone="full",
            secondary_zone=None,
            components=[
                {"type": "TiptapTextBlock", "role": "title"},
                {"type": "TiptapTextBlock", "role": "body"},
                {"type": "TiptapTextBlock", "role": "supporting"}
            ],
            content_density="dense",
            visual_weight="text_heavy",
            reasoning="Content-focused slide with multiple sections"
        )

    def _parse_design_response(
        self,
        response: str,
        context: SlideGenerationContext
    ) -> Dict[str, Any]:
        """Parse the design generation response."""
        try:
            text = response.strip()

            # Remove markdown fences
            if text.startswith('```'):
                text = re.sub(r'^```(?:json)?\s*', '', text)
                text = re.sub(r'\s*```$', '', text)

            # Find JSON object
            start = text.find('{')
            if start >= 0:
                depth = 0
                for i in range(start, len(text)):
                    if text[i] == '{':
                        depth += 1
                    elif text[i] == '}':
                        depth -= 1
                        if depth == 0:
                            text = text[start:i+1]
                            break

            data = json.loads(text)

            # Ensure required fields - preserve original slide ID from outline
            if not data.get('id'):
                data['id'] = getattr(context.slide_outline, 'id', f"slide-{context.slide_index + 1}")
            if not data.get('title'):
                data['title'] = getattr(context.slide_outline, 'title', f"Slide {context.slide_index + 1}")
            if not isinstance(data.get('components'), list):
                data['components'] = []

            return data

        except Exception as e:
            logger.error(f"Failed to parse design response: {e}")
            raise

    def _structure_to_slide(
        self,
        structure: SlideStructure,
        context: SlideGenerationContext
    ) -> Dict[str, Any]:
        """Convert structure to slide using deterministic positioning."""
        theme = context.theme
        theme_dict = theme.to_dict() if hasattr(theme, 'to_dict') else {}
        color_palette = theme_dict.get('color_palette', {})

        bg_color = color_palette.get('primary_background', '#0A0E27')
        text_color = color_palette.get('primary_text', '#FFFFFF')
        accent_color = color_palette.get('accent_1', '#2563EB')

        slide_outline = context.slide_outline
        title = getattr(slide_outline, 'title', '')
        content = getattr(slide_outline, 'content', '')

        components = [
            {
                "type": "Background",
                "props": {
                    "backgroundColor": bg_color,
                    "backgroundType": "color"
                }
            }
        ]

        # Title
        components.append({
            "type": "TiptapTextBlock",
            "props": {
                "position": {"x": 80, "y": 80},
                "width": 1760,
                "height": 80,
                "texts": [{"text": title}],
                "fontSize": 56,
                "fontWeight": "700",
                "textColor": text_color,
                "alignment": "left",
                "verticalAlignment": "top",
                "padding": 0
            }
        })

        # Content based on layout
        if structure.layout_type == LayoutType.TITLE_HERO:
            # Just the title, maybe bigger
            components[-1]["props"]["position"]["y"] = 400
            components[-1]["props"]["fontSize"] = 80

        elif structure.layout_type in [LayoutType.SPLIT_LEFT, LayoutType.SPLIT_RIGHT]:
            # Content on one side
            content_x = 80 if structure.layout_type == LayoutType.SPLIT_LEFT else 1000
            visual_x = 1000 if structure.layout_type == LayoutType.SPLIT_LEFT else 80

            # Body text
            components.append({
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": content_x, "y": 200},
                    "width": 840,
                    "height": 600,
                    "texts": [{"text": content[:500]}],  # Truncate for safety
                    "fontSize": 32,
                    "textColor": text_color,
                    "alignment": "left",
                    "verticalAlignment": "top",
                    "padding": 0
                }
            })

            # Visual placeholder
            components.append({
                "type": "Image",
                "props": {
                    "position": {"x": visual_x, "y": 180},
                    "width": 840,
                    "height": 720,
                    "src": "placeholder",
                    "objectFit": "cover"
                }
            })

        else:
            # Default: content focused
            components.append({
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 80, "y": 200},
                    "width": 1760,
                    "height": 700,
                    "texts": [{"text": content[:800]}],
                    "fontSize": 32,
                    "textColor": text_color,
                    "alignment": "left",
                    "verticalAlignment": "top",
                    "padding": 0
                }
            })

        return {
            "id": getattr(context.slide_outline, 'id', f"slide-{context.slide_index + 1}"),
            "title": title,
            "components": components
        }

    def _validate_and_fix(
        self,
        slide_data: Dict[str, Any],
        context: SlideGenerationContext
    ) -> Dict[str, Any]:
        """Validate slide and fix common issues."""
        components = slide_data.get('components', [])

        # Track positions for overlap detection
        positioned = []

        for comp in components:
            if not isinstance(comp, dict):
                continue

            props = comp.get('props', {})
            comp_type = comp.get('type', '')

            # Fix missing positions
            if comp_type != 'Background':
                pos = props.get('position', {})
                if not pos.get('x') and not pos.get('y'):
                    # Assign default position
                    props['position'] = {"x": 80, "y": 100 + len(positioned) * 200}

                # Ensure width/height
                if not props.get('width'):
                    props['width'] = 800
                if not props.get('height'):
                    props['height'] = 100

                # Track for overlap detection
                positioned.append({
                    'x': props['position'].get('x', 0),
                    'y': props['position'].get('y', 0),
                    'width': props.get('width', 0),
                    'height': props.get('height', 0)
                })

            # Fix text overflow - ensure reasonable font sizes
            if comp_type == 'TiptapTextBlock':
                font_size = props.get('fontSize', 32)
                if font_size < 20:
                    props['fontSize'] = 28
                elif font_size > 120:
                    props['fontSize'] = 80

                # Ensure text color is set
                if not props.get('textColor'):
                    theme = context.theme
                    theme_dict = theme.to_dict() if hasattr(theme, 'to_dict') else {}
                    color_palette = theme_dict.get('color_palette', {})
                    props['textColor'] = color_palette.get('primary_text', '#FFFFFF')

        # Check for overlaps and fix
        self._fix_overlaps(components)

        return slide_data

    def _fix_overlaps(self, components: List[Dict[str, Any]]) -> None:
        """Detect and fix overlapping components."""
        # Get positioned components (skip Background)
        positioned = []
        for comp in components:
            if comp.get('type') == 'Background':
                continue
            props = comp.get('props', {})
            pos = props.get('position', {})
            positioned.append({
                'comp': comp,
                'x': pos.get('x', 0),
                'y': pos.get('y', 0),
                'width': props.get('width', 0),
                'height': props.get('height', 0)
            })

        # Sort by Y position
        positioned.sort(key=lambda p: p['y'])

        # Check each pair for overlaps
        for i in range(len(positioned)):
            for j in range(i + 1, len(positioned)):
                p1, p2 = positioned[i], positioned[j]

                # Check if overlapping
                if self._boxes_overlap(p1, p2):
                    # Move p2 below p1
                    new_y = p1['y'] + p1['height'] + 40  # 40px gap
                    p2['comp']['props']['position']['y'] = new_y
                    p2['y'] = new_y

    def _boxes_overlap(self, b1: Dict, b2: Dict) -> bool:
        """Check if two bounding boxes overlap."""
        # Check horizontal overlap
        h_overlap = not (b1['x'] + b1['width'] < b2['x'] or b2['x'] + b2['width'] < b1['x'])
        # Check vertical overlap
        v_overlap = not (b1['y'] + b1['height'] < b2['y'] or b2['y'] + b2['height'] < b1['y'])
        return h_overlap and v_overlap

    def _create_fallback_slide(self, context: SlideGenerationContext) -> Dict[str, Any]:
        """Create a simple fallback slide when generation fails."""
        theme = context.theme
        theme_dict = theme.to_dict() if hasattr(theme, 'to_dict') else {}
        color_palette = theme_dict.get('color_palette', {})

        bg_color = color_palette.get('primary_background', '#0A0E27')
        text_color = color_palette.get('primary_text', '#FFFFFF')

        slide_outline = context.slide_outline
        title = getattr(slide_outline, 'title', f'Slide {context.slide_index + 1}')
        content = getattr(slide_outline, 'content', '')

        return {
            "id": getattr(slide_outline, 'id', f"slide-{context.slide_index + 1}"),
            "title": title,
            "components": [
                {
                    "type": "Background",
                    "props": {
                        "backgroundColor": bg_color,
                        "backgroundType": "color"
                    }
                },
                {
                    "type": "TiptapTextBlock",
                    "props": {
                        "position": {"x": 80, "y": 80},
                        "width": 1760,
                        "height": 80,
                        "texts": [{"text": title}],
                        "fontSize": 56,
                        "fontWeight": "700",
                        "textColor": text_color,
                        "alignment": "left",
                        "verticalAlignment": "top",
                        "padding": 0
                    }
                },
                {
                    "type": "TiptapTextBlock",
                    "props": {
                        "position": {"x": 80, "y": 200},
                        "width": 1760,
                        "height": 700,
                        "texts": [{"text": content[:600] if content else "Content"}],
                        "fontSize": 32,
                        "textColor": text_color,
                        "alignment": "left",
                        "verticalAlignment": "top",
                        "padding": 0
                    }
                }
            ]
        }
