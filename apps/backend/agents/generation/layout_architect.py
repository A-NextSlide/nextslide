"""
Layout Architect V2 - Editorial Design System
Creates magazine-quality layouts for each slide while preserving existing theme system.
"""

from typing import Dict, Any, List, Optional
import json
import asyncio
from models.requests import DeckOutline, SlideOutline
from agents.ai.clients import get_client, invoke
from agents.config import COMPOSER_MODEL


class LayoutArchitect:
    """
    Extends existing theme with detailed per-slide layout blueprints.
    Acts as a master architect designing every component position.
    """

    def __init__(self, component_schemas: Dict[str, Any], model: str = None):
        """
        Initialize with component schema information.

        Args:
            component_schemas: Complete component inventory with all props
            model: Optional model name (defaults to COMPOSER_MODEL)
        """
        self.component_schemas = component_schemas
        # Use a faster model for layout design (can use haiku or upgrade to sonnet if needed)
        self.model = model or COMPOSER_MODEL

    async def design_layouts(
        self,
        deck_outline: DeckOutline,
        existing_theme: Dict[str, Any],
        progress_callback=None
    ) -> Dict[str, Dict[str, Any]]:
        """
        Main entry point: Design per-slide layouts using existing theme.

        Args:
            deck_outline: Complete deck outline with all slides
            existing_theme: Existing theme with colors, fonts (from ThemeStyleManager)
            progress_callback: Optional callback for progress updates

        Returns:
            Dict mapping slide_id -> blueprint with exact component positions
        """
        if progress_callback:
            progress_callback("designing_layouts", "Designing editorial layouts...")

        # Phase 1: Generate overall layout strategy
        layout_strategy = await self._generate_layout_strategy(
            deck_outline,
            existing_theme
        )

        # Phase 2: Design each slide with exact component positions IN PARALLEL
        total_slides = len(deck_outline.slides)

        print(f"🚀 Generating {total_slides} slide blueprints in parallel...")

        # Create all tasks to run in parallel
        tasks = []
        for i, slide in enumerate(deck_outline.slides):
            # Detect slide type
            slide_type = self._detect_slide_type(slide, i, total_slides)

            # Create task for this slide
            task = self._generate_slide_blueprint(
                slide=slide,
                slide_index=i,
                total_slides=total_slides,
                slide_type=slide_type,
                layout_strategy=layout_strategy,
                existing_theme=existing_theme
            )
            tasks.append((i, slide.title, task))

        # Run all blueprints in parallel
        results = await asyncio.gather(*[task for _, _, task in tasks], return_exceptions=True)

        # Collect results
        slide_blueprints = {}
        for (i, title, _), result in zip(tasks, results):
            if isinstance(result, Exception):
                print(f"⚠️  Error generating blueprint for slide {i+1} ({title}): {result}")
                # Use default blueprint on error
                slide_type = self._detect_slide_type(deck_outline.slides[i], i, total_slides)
                result = self._create_default_blueprint(deck_outline.slides[i], slide_type, layout_strategy)

            slide_id = f"slide-{i}"
            slide_blueprints[slide_id] = result

            if progress_callback:
                progress_callback(
                    "designing_slide_layout",
                    f"Designed layout for slide {i+1}/{total_slides}: {title}"
                )

        print(f"✅ All {total_slides} blueprints generated in parallel!")
        return slide_blueprints

    def _detect_slide_type(self, slide: SlideOutline, index: int, total_slides: int) -> str:
        """
        Detect slide type from content to apply appropriate layout pattern.

        Returns one of: title, team, market, data, content, timeline, comparison, quote
        """
        title_lower = slide.title.lower()
        content_lower = (slide.content or "").lower()
        combined = title_lower + " " + content_lower

        # First/last slide detection
        if index == 0:
            return "title"
        if index == total_slides - 1 and any(word in title_lower for word in ["thank", "contact", "questions"]):
            return "title"

        # Team slide detection
        team_keywords = ["team", "about us", "leadership", "founders", "our people", "meet the"]
        if any(keyword in combined for keyword in team_keywords):
            return "team"

        # Market slide detection
        market_keywords = ["market", "tam", "sam", "som", "addressable", "opportunity", "market size"]
        if any(keyword in combined for keyword in market_keywords):
            return "market"

        # Data slide detection
        data_keywords = ["revenue", "growth", "metrics", "performance", "results", "statistics", "analytics", "kpi"]
        if any(keyword in combined for keyword in data_keywords):
            return "data"

        # Timeline slide detection
        timeline_keywords = ["timeline", "roadmap", "milestones", "phases", "schedule", "quarters", "q1", "q2", "q3", "q4"]
        if any(keyword in combined for keyword in timeline_keywords):
            return "timeline"

        # Comparison slide detection
        comparison_keywords = ["vs", "versus", "comparison", "compare", "before", "after", "competitive"]
        if any(keyword in combined for keyword in comparison_keywords):
            return "comparison"

        # Quote/testimonial slide detection
        quote_keywords = ["testimonial", "feedback", "customer", "quote", "said", "review"]
        if any(keyword in combined for keyword in quote_keywords) or ('"' in combined or "'" in combined):
            return "quote"

        # Default to content slide
        return "content"

    async def _generate_layout_strategy(
        self,
        deck_outline: DeckOutline,
        existing_theme: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Phase 1: Generate overall design strategy for the deck.

        Returns:
            Layout strategy with design patterns, spacing rules, typography scale
        """
        # Extract existing theme details
        colors = existing_theme.get("color_palette", {})
        typography = existing_theme.get("typography", {})

        # Build prompt for Phase 1
        prompt = self._build_layout_strategy_prompt(deck_outline, colors, typography)

        # Get AI client using your existing system
        client, model_name = get_client(self.model, wrap_with_instructor=False)

        print(f"🤖 Using model: {model_name} for layout strategy")

        # Call AI using your invoke pattern (synchronous, wrapped in executor)
        messages = [{"role": "user", "content": prompt}]

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                invoke,
                client,
                model_name,
                messages,
                None,  # No response_model, we want raw JSON
                4000,  # max_tokens
                0.7,   # temperature
                None,  # deck_uuid
                False, # slide_generation
                None,  # slide_index
                False, # visual_analysis
                False  # theme_generation
            )
            # Response is raw text when response_model is None
            strategy_text = response
        except Exception as e:
            print(f"⚠️  AI call failed: {e}, using default strategy")
            return self._create_default_strategy(deck_outline, existing_theme)

        # Parse response (expecting JSON)
        try:
            # Strip markdown code blocks if present
            if strategy_text.strip().startswith("```"):
                # Remove ```json and ``` markers
                strategy_text = strategy_text.strip()
                if strategy_text.startswith("```json"):
                    strategy_text = strategy_text[7:]  # Remove ```json
                elif strategy_text.startswith("```"):
                    strategy_text = strategy_text[3:]  # Remove ```
                if strategy_text.endswith("```"):
                    strategy_text = strategy_text[:-3]  # Remove trailing ```
                strategy_text = strategy_text.strip()

            strategy = json.loads(strategy_text)
            print("✅ Layout strategy parsed successfully")
        except Exception as e:
            # If JSON parsing fails, create default strategy
            print(f"⚠️  JSON parsing failed: {e}, using default strategy")
            strategy = self._create_default_strategy(deck_outline, existing_theme)

        return strategy

    def _build_layout_strategy_prompt(
        self,
        deck_outline: DeckOutline,
        colors: Dict[str, Any],
        typography: Dict[str, Any]
    ) -> str:
        """Build Phase 1 prompt for layout strategy generation"""

        # Get presentation context
        topic = deck_outline.title or "Business Presentation"
        num_slides = len(deck_outline.slides)

        # Extract theme colors dynamically
        primary_text = colors.get('text_colors', {}).get('primary', '#000000')
        accent_colors = colors.get('accents', ['#0066CC'])

        prompt = f"""You are a creative director defining a design system for a presentation.

PRESENTATION: "{topic}"
SLIDES: {num_slides}
THEME COLORS: {json.dumps(colors, indent=2)}

YOUR TASK: Define consistent elements and a flexible typographic scale.

These elements should appear in the SAME position on every slide:
- Slide number (choose a subtle corner position)
- Source/citation (if needed, bottom edge)
- Logo (if present, typically a corner)

CANVAS: 1920 × 1080 pixels

OUTPUT (JSON):
{{
  "typography_scale": {{
    "hero_title": 96,      // Large titles (can be adjusted per slide)
    "section_title": 72,   // Section headings
    "body_text": 36,       // Body copy
    "caption": 24,         // Small text
    "slide_number": 18     // Slide numbers
  }},
  "spacing_system": {{
    "safe_area": {{"x": [100, 1820], "y": [100, 980]}}
  }},
  "consistent_elements": {{
    "slide_number": {{"x": 1780, "y": 1000, "size": 18, "color": "{primary_text}"}},
    "source_citation": {{"x": 100, "y": 1000, "size": 16, "color": "{primary_text}"}}
  }},
  "design_guidance": "Brief note about the presentation's visual mood/style"
}}

Note: Typography scale provides suggested sizes - individual slides can adjust for creative needs.

Return ONLY valid JSON.
"""
        return prompt

    async def _generate_slide_blueprint(
        self,
        slide: SlideOutline,
        slide_index: int,
        total_slides: int,
        slide_type: str,
        layout_strategy: Dict[str, Any],
        existing_theme: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Phase 2: Generate exact component blueprint for a single slide.

        Returns:
            Blueprint with positioned components ready for generator to execute
        """
        # Build prompt for Phase 2
        prompt = self._build_slide_blueprint_prompt(
            slide, slide_index, total_slides, slide_type,
            layout_strategy, existing_theme
        )

        # Get AI client using your existing system
        client, model_name = get_client(self.model, wrap_with_instructor=False)

        # Call AI using your invoke pattern
        messages = [{"role": "user", "content": prompt}]

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                invoke,
                client,
                model_name,
                messages,
                None,  # No response_model, we want raw JSON
                8000,  # max_tokens
                0.9,   # High temperature for maximum creativity
                None,  # deck_uuid
                False, # slide_generation
                slide_index,  # slide_index for logging
                False, # visual_analysis
                False  # theme_generation
            )
            # Response is raw text when response_model is None
            blueprint_text = response
        except Exception as e:
            print(f"⚠️  AI call failed for slide {slide_index+1}: {e}, using default blueprint")
            return self._create_default_blueprint(slide, slide_type, layout_strategy)

        # Parse response
        try:
            # Strip markdown code blocks if present
            if blueprint_text.strip().startswith("```"):
                blueprint_text = blueprint_text.strip()
                if blueprint_text.startswith("```json"):
                    blueprint_text = blueprint_text[7:]
                elif blueprint_text.startswith("```"):
                    blueprint_text = blueprint_text[3:]
                if blueprint_text.endswith("```"):
                    blueprint_text = blueprint_text[:-3]
                blueprint_text = blueprint_text.strip()

            blueprint = json.loads(blueprint_text)
        except Exception as e:
            # If JSON parsing fails, create default blueprint based on slide type
            print(f"⚠️  JSON parsing failed for slide {slide_index+1}: {e}, using default blueprint")
            blueprint = self._create_default_blueprint(slide, slide_type, layout_strategy)

        return blueprint

    def _build_slide_blueprint_prompt(
        self,
        slide: SlideOutline,
        slide_index: int,
        total_slides: int,
        slide_type: str,
        layout_strategy: Dict[str, Any],
        existing_theme: Dict[str, Any]
    ) -> str:
        """Build Phase 2 prompt for individual slide blueprint"""

        colors = existing_theme.get("color_palette", {})
        typography = existing_theme.get("typography", {})
        typo_scale = layout_strategy.get("typography_scale", {})
        spacing = layout_strategy.get("spacing_system", {})
        patterns = layout_strategy.get("design_patterns", {})
        consistent = layout_strategy.get("consistent_elements", {})

        # Extract theme colors dynamically
        primary_bg = colors.get('primary_background', '#FFFFFF')
        primary_text = colors.get('text_colors', {}).get('primary', '#000000')
        accent_colors = colors.get('accents', ['#0066CC'])

        # Get full theme context for creative decisions
        theme_name = existing_theme.get('name', 'Custom')
        theme_mood = existing_theme.get('mood', 'professional')

        prompt = f"""You are a CREATIVE LAYOUT DESIGNER with complete freedom to design unique, magazine-quality layouts.

🎨 YOUR ROLE: Design a visually stunning, one-of-a-kind layout that perfectly matches the theme and content.

═══════════════════════════════════════════════════════════════════════════════

📋 SLIDE CONTEXT:
Title: {slide.title}
Content Type: {slide_type}
Position: {slide_index + 1}/{total_slides}
Content Preview: {slide.content[:300] if slide.content else 'No content'}...

🎨 THEME PALETTE - "{theme_name}" ({theme_mood}):
Background: {primary_bg}
Text: {primary_text}
Accents: {', '.join(accent_colors[:3])}
All Theme Colors Available: {json.dumps(colors, indent=2)}

📐 CANVAS:
Dimensions: 1920 × 1080 pixels
Safe Area: x=[100-1820], y=[100-920]

⚠️ FIXED ELEMENTS (avoid overlapping):
{json.dumps(consistent, indent=2)}

═══════════════════════════════════════════════════════════════════════════════

✨ CREATIVE FREEDOM - DESIGN PHILOSOPHY:

You have COMPLETE creative control to design layouts that are:
• Unique and memorable
• Perfectly suited to the content
• Aligned with the theme's mood and aesthetic
• Visually balanced and professional
• Free from traditional layout constraints

Think like a magazine art director, not a template user. Every slide should feel intentional and designed.

═══════════════════════════════════════════════════════════════════════════════

🎨 CREATIVE LAYOUT APPROACHES (Examples - NOT rules):

**Approach 1: Asymmetric Drama**
- Bold off-center compositions
- Overlapping elements at different depths (zIndex layering)
- Diagonal lines and unexpected angles
- Large negative space for impact

**Approach 2: Editorial Magazine**
- Multi-column text layouts (newspaper style)
- Dropped caps and pull quotes
- Text wrapping around images
- Sidebar annotations

**Approach 3: Minimalist Focus**
- Single dominant element (huge chart, massive image, or bold typography)
- Extreme whitespace
- Tiny supporting text
- Monochromatic with single accent

**Approach 4: Layered Collage**
- Multiple overlapping images with varying opacity
- Text over shapes over images
- Color blocks intersecting at angles
- Depth through shadows and transparency

**Approach 5: Grid System Mastery**
- Break the grid intentionally
- Items spanning multiple columns
- Uneven column widths
- Content bleeding across boundaries

**Approach 6: Typographic Hero**
- Typography IS the design
- Massive headings (150-300pt)
- Text as texture/background
- Mixed font sizes for hierarchy
- Creative text positioning (vertical, curved paths)

**Approach 7: Data Visualization Art**
- Charts as centerpieces
- Custom data presentation styles
- Infographic-style layouts
- Visual metaphors for data

**Approach 8: Cinematic Composition**
- Rule of thirds with dramatic placement
- Film-like aspect ratios within canvas
- Vignettes and gradients
- Mood-driven color grading

═══════════════════════════════════════════════════════════════════════════════

🎯 CONTENT-DRIVEN DESIGN DECISIONS:

Based on the content and theme, ask yourself:
• What emotion should this slide evoke?
• What's the most important element that deserves focus?
• How can the layout support the narrative?
• What would make this slide memorable?
• How does this fit in the presentation flow?

Let the THEME and CONTENT guide your creative decisions, not predefined patterns.

═══════════════════════════════════════════════════════════════════════════════

🔧 TECHNICAL REQUIREMENTS (Critical for functionality):

**1. TEXT FORMATTING (MANDATORY - Use HTML):**

ALL TiptapTextBlock content MUST use rich HTML formatting:
- Titles: <h1>Title</h1>, <h2>Subtitle</h2>, <h3>Section</h3>
- Bold: <strong>keyword</strong>
- Emphasis: <em>emphasis</em>
- Lists: <ul><li>item</li></ul> or <ol><li>step</li></ol>
- Paragraphs: <p>text</p>
- NO plain text or \\n line breaks

Examples:
- ✅ "<h1>Revolutionary Launch</h1>"
- ✅ "<ul><li><strong>Fast:</strong> 10x performance</li></ul>"
- ❌ "Key Features\\nFast\\nSecure"

**2. ANTI-OVERLAP SYSTEM (CRITICAL):**

Use this simple system to prevent overlaps:

```javascript
// Track vertical position as you add components
let currentY = 100;  // Start at safe area top

// For each component:
component.y = currentY;
component.height = calculated_height;  // Based on content
currentY = component.y + component.height + gap;  // 60-100px gap

// Before adding, verify it fits:
if (currentY + component.height > 920) {
  // Won't fit! Use different layout or reduce content
}
```

Key rules:
- Minimum gaps: 60px between text, 80px around charts/images
- Edge margins: 100px from canvas edges
- Verify bounds: x + width ≤ 1820, y + height ≤ 920
- zIndex layering: Background (0) < Images (1-5) < Shapes (5-9) < Text/Charts (10) < UI (100)

**3. CHART REQUIREMENTS:**

Charts must be LARGE and readable:
- Minimum dimensions: 500×500px (prefer 600×700px)
- Give charts prominent space - they're data heroes
- If chart won't fit vertically, use side-by-side layout
- Never squish charts to fit more content

**5. VISUAL STYLING TOOLS:**

Colors & Gradients:
- Use theme colors creatively - vary opacity (0.1-1.0) for depth
- Gradients add visual interest: linear, radial, or multi-stop
- Full-bleed color blocks work well (x=0, width=1920)
- Experiment with color overlays and blend modes

Images:
- Include images when available - they add visual richness
- Styling options: borderRadius (0-50%), opacity, borders, overlays
- Use Image.overlayColor and overlayBlendMode (not separate shapes)
- Position creatively: full-bleed, side-by-side, inset, layered

Shapes:
- Use for structure, emphasis, or decoration
- Can be rectangles, circles, or custom paths
- Add depth with shadows, borders, gradients
- Layer behind text for emphasis boxes

═══════════════════════════════════════════════════════════════════════════════

✨ CREATIVE EXAMPLES (inspiration, not templates):

**Example 1: Bold Asymmetric Title Slide**
```json
{{
  "layout_reasoning": "Dramatic off-center title with full-bleed gradient background",
  "components": [
    {{"type": "Background", "zIndex": 0, "props": {{"gradient": {{"type": "linear", "angle": 135, "colors": ["{primary_bg}", "{accent_colors[0]}40"]}}}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 200, "y": 300, "width": 1200, "height": 400, "fontSize": 180, "content": "<h1>{slide.title}</h1>", "color": "{primary_text}"}}}}
  ]
}}
```

**Example 2: Magazine Editorial with Sidebar**
```json
{{
  "layout_reasoning": "Multi-column layout with accent sidebar",
  "components": [
    {{"type": "Shape", "zIndex": 5, "props": {{"x": 0, "y": 0, "width": 300, "height": 1080, "fill": "{accent_colors[0]}", "opacity": 0.95}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 380, "y": 120, "width": 1400, "height": 800, "fontSize": 42, "content": "<h2>Title</h2><p>Content...</p>", "color": "{primary_text}"}}}}
  ]
}}
```

**Example 3: Data-Driven Chart Hero**
```json
{{
  "layout_reasoning": "Chart as centerpiece with minimal supporting text",
  "components": [
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 100, "y": 80, "width": 1000, "height": 80, "fontSize": 56, "content": "<h1>Growth Metrics</h1>", "color": "{primary_text}"}}}},
    {{"type": "Chart", "zIndex": 10, "props": {{"x": 100, "y": 220, "width": 1720, "height": 650, "chartType": "line", "data": [...], "colors": {accent_colors}}}}}
  ]
}}
```

═══════════════════════════════════════════════════════════════════════════════

🎯 YOUR DESIGN PROCESS:

1. **Analyze**: What's the key message? What emotion fits the theme?
2. **Conceptualize**: Sketch a mental layout - what approach feels right?
3. **Position**: Use currentY tracking to place components without overlaps
4. **Style**: Apply colors, shapes, images to enhance the concept
5. **Validate**: Check bounds, gaps, and HTML formatting
6. **Refine**: Adjust spacing and hierarchy for visual balance

═══════════════════════════════════════════════════════════════════════════════

✅ VALIDATION CHECKLIST (before returning):

Text Formatting:
✓ All TiptapTextBlock content uses HTML tags
✓ No plain text or \\n characters

Anti-Overlap:
✓ Used currentY tracking for positioning
✓ Minimum 60px gaps between text elements
✓ Minimum 80px gaps around charts/images
✓ No overlapping bounding boxes

Bounds:
✓ All components within safe area: x=[100-1820], y=[100-920]
✓ Charts minimum 500px (preferably 600-700px)

Layering:
✓ Proper zIndex: Background(0) < Images(1-5) < Shapes(5-9) < Content(10) < UI(100)

Creative Quality:
✓ Layout matches theme mood and content type
✓ Visually balanced and professional
✓ Unique and intentional design decisions

═══════════════════════════════════════════════════════════════════════════════

{{
  "layout_reasoning": "Brief explanation of your creative concept and why it fits this slide",
  "components": [
    {{"id": "unique_id", "type": "ComponentType", "zIndex": number, "props": {{...component properties...}}}}
  ]
}}

Available component types:
- Background: Full-slide background with solid color or gradient
- Shape: Rectangles, circles for structure/decoration
- Image: Images with styling (borderRadius, opacity, overlays, etc.)
- TiptapTextBlock: All text content (MUST use HTML formatting)
- Chart: Data visualizations (ensure proper sizing)

Remember: Return ONLY valid JSON (no markdown code blocks, no comments).
"""
        return prompt

    def _get_slide_type_guidance(self, slide_type: str) -> str:
        """Get specific layout guidance for each slide type"""
        # Removed - not needed, let the slide generator handle content layout
        return ""

    def _create_default_strategy(self, deck_outline: DeckOutline, existing_theme: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback strategy if AI generation fails"""
        # Extract theme colors dynamically
        colors = existing_theme.get("color_palette", {})
        primary_text = colors.get('text_colors', {}).get('primary', '#000000')

        return {
            "typography_scale": {
                "hero_title": 96,
                "section_title": 72,
                "body_text": 36,
                "caption": 24,
                "slide_number": 18
            },
            "spacing_system": {
                "safe_area": {"x": [100, 1820], "y": [100, 980]}
            },
            "consistent_elements": {
                "slide_number": {"x": 1780, "y": 1000, "size": 18, "color": primary_text},
                "source_citation": {"x": 100, "y": 1000, "size": 16, "color": primary_text},
                "logo": {"x": 100, "y": 50, "size": 60}
            }
        }

    def _create_default_blueprint(self, slide: SlideOutline, slide_type: str, layout_strategy: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback blueprint if AI generation fails"""
        typo_scale = layout_strategy.get("typography_scale", {})
        spacing = layout_strategy.get("spacing_system", {})

        return {
            "layout_reasoning": f"Default {slide_type} layout with centered title and content.",
            "components": [
                {
                    "id": "bg",
                    "type": "Background",
                    "zIndex": 0,
                    "props": {"color": "#FFFFFF"}
                },
                {
                    "id": "title",
                    "type": "TiptapTextBlock",
                    "zIndex": 10,
                    "props": {
                        "x": 160,
                        "y": 200,
                        "width": 1600,
                        "height": 120,
                        "content": f"<h1>{slide.title}</h1>",
                        "fontSize": typo_scale.get('section_title', 72),
                        "textAlign": "center"
                    }
                },
                {
                    "id": "slide_number",
                    "type": "TiptapTextBlock",
                    "zIndex": 100,
                    "props": {
                        "x": 80,
                        "y": 1020,
                        "width": 100,
                        "height": 40,
                        "fontSize": 18
                    }
                }
            ]
        }
