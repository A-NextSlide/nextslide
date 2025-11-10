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
        accent_color = colors.get('accents', ['#0066CC'])[0] if colors.get('accents') else '#0066CC'

        prompt = f"""You are a layout designer creating consistent positioning for presentation elements.

PRESENTATION: {topic}
SLIDES: {num_slides}

THEME COLORS (use these):
- Primary text: {primary_text}
- Accent: {accent_color}

YOUR JOB:
Define EXACT positions for elements that must appear in the SAME SPOT on every slide:
1. Slide number (which corner/position?)
2. Source/citation text (where should it go?)
3. Logo placement (if present)

CANVAS: 1920 x 1080 pixels

OUTPUT FORMAT (JSON):
{{
  "typography_scale": {{
    "hero_title": 96,
    "section_title": 72,
    "body_text": 36,
    "caption": 24,
    "slide_number": 18
  }},
  "spacing_system": {{
    "safe_area": {{"x": [100, 1820], "y": [100, 980]}}
  }},
  "consistent_elements": {{
    "slide_number": {{"x": 1780, "y": 1000, "size": 18, "color": "{primary_text}"}},
    "source_citation": {{"x": 100, "y": 1000, "size": 16, "color": "{primary_text}"}},
    "logo": {{"x": 100, "y": 50, "size": 60}}
  }}
}}

CRITICAL: These positions must be IDENTICAL on every slide. Pick good spots that won't overlap with content.

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
                0.8,   # Higher temp for creative layouts
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
        accent_color = colors.get('accents', ['#0066CC'])[0] if colors.get('accents') else '#0066CC'

        prompt = f"""Create a PROFESSIONAL layout blueprint with PROPER TEXT FORMATTING, NO OVERLAPS, and PROPER CHART SIZING.

SLIDE: {slide.title}
TYPE: {slide_type}
POSITION: {slide_index + 1}/{total_slides}
CONTENT: {slide.content[:300] if slide.content else 'No content'}...

THEME COLORS:
- Background: {primary_bg}
- Text: {primary_text}
- Accent: {accent_color}

CANVAS: 1920 x 1080 pixels
SAFE AREA: x=[100-1820], y=[100-920] (leave room for slide numbers/sources)

REQUIRED ELEMENTS (already positioned - AVOID overlapping):
{json.dumps(consistent, indent=2)}

🚨 CRITICAL TEXT FORMATTING RULES (MANDATORY):

1. **ALWAYS Use Rich HTML Formatting in ALL TiptapTextBlock content:**
   - Titles: <h1>Main Title</h1>, <h2>Section Title</h2>, <h3>Subsection</h3>
   - Bold keywords: <strong>important term</strong>
   - Emphasis: <em>subtle emphasis</em>
   - Underline: <u>highlighted text</u>
   - Bullet lists: <ul><li>First point</li><li>Second point</li></ul>
   - Numbered lists: <ol><li>Step 1</li><li>Step 2</li></ol>
   - Paragraphs: <p>Text content</p>
   - Line breaks: Use </p><p> NOT \\n

2. **Text Formatting Examples (FOLLOW THESE):**
   - Title: "<h1>Revolutionary Product Launch</h1>"
   - Bullets with bold: "<ul><li><strong>Fast:</strong> 10x performance</li><li><strong>Secure:</strong> End-to-end encryption</li></ul>"
   - Mixed formatting: "<p>We deliver <em>exceptional quality</em> with <strong>proven results</strong></p>"
   - Numbered steps: "<ol><li><strong>Discover:</strong> Identify needs</li><li><strong>Design:</strong> Create solutions</li></ol>"

3. **NEVER use plain text:**
   ❌ WRONG: "content": "Key Features\\nFast\\nSecure"
   ✅ RIGHT: "content": "<h2>Key Features</h2><ul><li><strong>Fast</strong></li><li><strong>Secure</strong></li></ul>"

🎨 DESIGN PHILOSOPHY:
Clean, professional layouts with generous spacing. Quality > quantity. NO OVERLAPS.

COLOR & GRADIENTS:
- VARY opacity (0.08 to 0.95) for depth
- Use GRADIENTS liberally for visual interest
- Mix theme colors creatively
- Full-screen gradients work great
- Color blocks that go to edges (x=0 or x+width=1920)

📐 LAYOUT PATTERNS (choose based on content):

1. **CENTERED CONTENT** (for: title slides, quotes, simple messages)
   - Title: x=160-360, width=1200-1600, textAlign="center"
   - Large fonts: 80-120pt for titles
   - Vertically centered: y=300-400
   - Minimal decoration

2. **LEFT-ALIGNED VERTICAL STACK** (for: bullet lists, features, content-heavy)
   - Everything at x=100, left-aligned
   - Stack vertically with 60-80px gaps
   - Title at y=100
   - Use currentY tracking: y = previousY + previousHeight + gap
   - Width: 1000-1400px

3. **SPLIT SCREEN** (for: text + image, comparisons)
   - Left column: x=100, width=760
   - Right column: x=960, width=860
   - 100px gap between columns
   - Each column has independent Y tracking
   - Good for pairing visuals with text

4. **LARGE VISUAL** (for: charts, data, infographics)
   - Title at top: y=100-150
   - Large chart: y=220-260, height=550-700px (NEVER LESS THAN 500px!)
   - Caption/insights below if space allows
   - Give charts maximum space

5. **GRID** (for: team slides, 4-6 feature cards)
   - 2x2 or 3x2 grid
   - Equal sizing and spacing
   - 60-80px gaps between cards

LAYOUT SELECTION:
- Title slide → CENTERED
- Bullet lists → LEFT-ALIGNED STACK
- Bullets + image → SPLIT SCREEN
- Charts/data → LARGE VISUAL
- Team/features (4-6) → GRID

🚨 CRITICAL ANTI-OVERLAP POSITIONING SYSTEM:

**STEP 1: Calculate Component Heights**
- Title (72pt): height = 100px
- Title (48pt): height = 70px
- Body text (36pt): height = 60px per line
- Bullet list (3 items): height = 200px minimum
- Bullet list (5 items): height = 340px minimum
- Chart: height = 550-700px (NEVER LESS THAN 500px!)
- Image: calculate based on aspect ratio

**STEP 2: Use currentY Tracking (MANDATORY - NO FIXED POSITIONS)**
```
currentY = 100  // Start at safe area top

// Component 1: Title
title.y = currentY
title.height = 100
currentY = title.y + title.height + 80  // Add gap
// currentY is now 280

// Component 2: Content
content.y = currentY
content.height = 300
currentY = content.y + content.height + 80
// currentY is now 660

// Component 3: Chart (check if fits)
if (currentY + 550 <= 920):  // Verify fits in safe area
  chart.y = currentY
  chart.height = 550
else:
  // Use split-screen instead!
```

**STEP 3: Spacing Requirements (ENFORCE)**
- Vertical gap between text: 60-80px MINIMUM
- Vertical gap before/after charts: 80-100px MINIMUM
- Horizontal gap (split-screen): 100px MINIMUM
- Text inside shapes: 40px padding all sides
- Edge margins: 100px from all edges

**STEP 4: Layering (zIndex)**
- Background: zIndex=0
- Background images: zIndex=1
- Decorative shapes: zIndex=5
- Accent lines: zIndex=9
- Text/Charts: zIndex=10
- UI elements: zIndex=100

**STEP 5: Bounds Validation**
For EVERY component verify:
- x >= 100
- x + width <= 1820
- y >= 100
- y + height <= 920 (leaves room for slide numbers)
- If fails: RECALCULATE or use different layout

**STEP 6: Text Inside Shapes**
If using backdrop shape:
- Option A: Define text first, create shape with padding:
  * shape.x = text.x - 40
  * shape.y = text.y - 40
  * shape.width = text.width + 80
  * shape.height = text.height + 80
- Option B: Define shape first, position text inside:
  * text.x = shape.x + 40
  * text.y = shape.y + 40
  * text.width = shape.width - 80
  * text.height = shape.height - 80

8. IMAGES (USE THEM STYLISTICALLY):
   - ALWAYS include images when available - they add visual interest
   - Image placement options:
     * Half-screen (x=0, width=960 OR x=960, width=960)
     * Third-screen (width=640)
     * Full-bleed background (x=0, y=0, width=1920, height=1080, zIndex=1, opacity=0.3)
     * Card style with border (borderRadius=20, border: 4px solid)
     * Sharp edges (borderRadius=0) for modern look
     * Outlined (stroke="#color", strokeWidth=4-8, fill=transparent for outline effect)
   - Image styling variety:
     * NOT always rounded! Mix it up: borderRadius=0, 12, 20, 40, or 50%
     * Add borders: stroke with strokeWidth for framed look
     * Opacity variations: 1.0 for full, 0.3-0.5 for backgrounds
     * ObjectFit: "cover" (default), "contain", "fill"
   - COLOR OVERLAYS (use Image props, NOT separate shapes):
     * overlayColor: "{accent_color}40" (color + opacity hex, e.g., "#FF000040" for 25% red)
     * overlayBlendMode: "multiply", "overlay", "soft-light"
     * NEVER create a separate Shape on top of image for overlay - use Image props!
   - Position images purposefully:
     * Behind text as atmospheric background (low opacity, zIndex=1)
     * Side-by-side with content (split screen)
     * Top third or bottom third
     * Inset within content area with border frame

🚨 CHARTS - NO SHORT CHARTS ALLOWED (CRITICAL):

**ABSOLUTE MINIMUM CHART HEIGHTS (NEVER GO BELOW):**
- Bar/Column charts: height >= 550px (NEVER less than 500px!)
- Line charts: height >= 550px (NEVER less than 500px!)
- Pie/Donut charts: width=height (square), minimum 500x500px
- Area charts: height >= 550px

**PREFERRED CHART SIZING:**
- Optimal height: 600-700px (use whenever possible)
- Optimal width: 1200-1720px (as wide as layout allows)
- Give charts MAXIMUM space - they are the focal point!

**CHART POSITIONING:**
- Use LARGE VISUAL layout pattern for chart slides
- Position prominently, NOT squeezed in corners
- Leave 40-60px margin around charts for labels/legends
- If chart + text won't fit vertically → use SPLIT SCREEN layout

**ANTI-OVERLAP FOR CHARTS:**
- Charts MUST NOT overlap ANY text
- Calculate chart bounds: [x, y, x+width, y+height]
- Verify NO text components fall within these bounds
- Use currentY tracking to ensure proper spacing
- Minimum 80-100px gap before and after charts

**IF CHART WON'T FIT:**
- DON'T make it shorter (NO 300px or 400px charts!)
- Instead: Use split-screen (chart left, text right OR vice versa)
- Or: Reduce text content above chart
- Or: Remove non-essential elements
- NEVER compromise on chart height!

✅ COMPLETE EXAMPLES WITH PROPER HTML & POSITIONING:

**Example 1: Bullet List (Left-Aligned Stack with HTML)**
```
currentY = 100
// Title
{{"type": "TiptapTextBlock", "zIndex": 10, "props": {{
  "x": 100, "y": 100, "width": 1200, "height": 100,
  "fontSize": 72, "content": "<h1>Key Benefits</h1>", "color": "{primary_text}"
}}}}
currentY = 100 + 100 + 80 = 280

// Bullet list with HTML formatting
{{"type": "TiptapTextBlock", "zIndex": 10, "props": {{
  "x": 100, "y": 280, "width": 1200, "height": 340,
  "fontSize": 36,
  "content": "<ul><li><strong>Fast Performance:</strong> 10x faster than competitors</li><li><strong>Secure by Design:</strong> End-to-end encryption</li><li><strong>Scalable:</strong> Handles millions of users</li><li><strong>Easy to Use:</strong> Intuitive interface</li><li><strong>24/7 Support:</strong> Always here to help</li></ul>",
  "color": "{primary_text}"
}}}}
```

**Example 2: Chart Slide (Large Visual Pattern)**
```
// Title at top
{{"type": "TiptapTextBlock", "zIndex": 10, "props": {{
  "x": 100, "y": 100, "width": 1720, "height": 80,
  "fontSize": 64, "content": "<h1>Revenue Growth</h1>", "color": "{primary_text}"
}}}}

// Large chart (PROPER HEIGHT - 600px)
{{"type": "Chart", "zIndex": 10, "props": {{
  "x": 100, "y": 260, "width": 1720, "height": 600,
  "chartType": "line", "data": [...], "colors": ["{accent_color}"]
}}}}

// Optional: Insights below (if space allows)
{{"type": "TiptapTextBlock", "zIndex": 10, "props": {{
  "x": 100, "y": 880, "width": 1720, "height": 40,
  "fontSize": 24,
  "content": "<p><strong>Key Insight:</strong> Revenue increased by <u>340%</u> in Q4</p>",
  "color": "{primary_text}"
}}}}
```

**Example 3: Split-Screen (Image + Formatted Text)**
```
// Left: Image
{{"type": "Image", "zIndex": 2, "props": {{
  "x": 100, "y": 100, "width": 760, "height": 800,
  "src": "image_url", "borderRadius": 12, "objectFit": "cover"
}}}}

// Right: Content with HTML
rightY = 100
{{"type": "TiptapTextBlock", "zIndex": 10, "props": {{
  "x": 960, "y": 100, "width": 860, "height": 100,
  "fontSize": 64, "content": "<h1>Product Launch</h1>", "color": "{primary_text}"
}}}}
rightY = 260
{{"type": "TiptapTextBlock", "zIndex": 10, "props": {{
  "x": 960, "y": 260, "width": 860, "height": 400,
  "fontSize": 32,
  "content": "<p>Introducing our <strong>revolutionary</strong> product.</p><h3>Features:</h3><ul><li>AI-powered</li><li>Real-time analytics</li><li>24/7 support</li></ul>",
  "color": "{primary_text}"
}}}}
```

OUTPUT (JSON):
{{
  "layout_reasoning": "Brief explanation of layout structure and why",
  "components": [
    {{"id": "bg", "type": "Background", "zIndex": 0, "props": {{"gradient": {{"type": "linear", "angle": 135, "colors": ["{primary_bg}", "#FFFFFF"]}}}}}},
    {{"id": "hero_image", "type": "Image", "zIndex": 2, "props": {{"x": 0, "y": 0, "width": 960, "height": 1080, "src": "image_url_here", "borderRadius": 0, "objectFit": "cover"}}}},
    {{"id": "content_backdrop", "type": "Shape", "zIndex": 5, "props": {{"x": 1020, "y": 180, "width": 780, "height": 720, "fill": "#FFFFFF", "borderRadius": 20, "opacity": 0.95}}}},
    {{"id": "accent_line", "type": "Shape", "zIndex": 9, "props": {{"x": 1020, "y": 160, "width": 160, "height": 4, "fill": "{accent_color}", "borderRadius": 0, "opacity": 1}}}},
    {{"id": "title", "type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 1060, "y": 220, "width": 700, "height": 120, "fontSize": 72, "content": "<h1>{slide.title}</h1>", "color": "{primary_text}"}}}},
    {{"id": "content", "type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 1060, "y": 380, "width": 700, "height": 480, "fontSize": 36, "content": "<p>Content here</p>", "color": "{primary_text}"}}}},
    {{"id": "slide_number", "type": "TiptapTextBlock", "zIndex": 100, "props": {consistent.get('slide_number', {})}}},
    {{"id": "source", "type": "TiptapTextBlock", "zIndex": 100, "props": {consistent.get('source_citation', {})}}}
  ]
}}

🔍 MANDATORY VALIDATION CHECKLIST - VERIFY ALL BEFORE RETURNING:

**TEXT FORMATTING (CRITICAL - CHECK EVERY TiptapTextBlock):**
✓ ALL content uses proper HTML tags (NO plain text!)
✓ Titles use <h1>, <h2>, or <h3>
✓ Bullet lists use <ul><li>...</li></ul>
✓ Numbered lists use <ol><li>...</li></ol>
✓ Important keywords wrapped in <strong>...</strong>
✓ Emphasis added with <em>...</em> or <u>...</u>
✓ Paragraphs separated with </p><p>, NOT \\n
✓ NO plain newlines (\\n) anywhere in content

**POSITIONING & OVERLAPS (CRITICAL):**
✓ Used currentY tracking (NOT fixed Y positions like y=200, y=300)
✓ Calculated each component height before positioning
✓ Minimum 60-80px vertical gaps between text elements
✓ Minimum 80-100px vertical gaps around charts
✓ Split-screen: left x <= 860, right x >= 960 (100px gap)
✓ Final currentY <= 920 (everything fits in safe area)
✓ NO overlapping bounding boxes for any text pair
✓ Charts do NOT overlap ANY text - verified bounding boxes

**CHART SIZING (CRITICAL - NO SHORT CHARTS):**
✓ ALL charts have height >= 550px (NEVER less than 500px!)
✓ Bar/column charts: height >= 550px
✓ Line/area charts: height >= 550px
✓ Pie/donut charts: width=height, both >= 500px
✓ Charts are properly sized and readable (NOT squished)
✓ Used LARGE VISUAL or SPLIT SCREEN layout for chart slides

**BOUNDS CHECKING:**
✓ Every component: x >= 100
✓ Every component: x + width <= 1820
✓ Every component: y >= 100
✓ Every component: y + height <= 920
✓ Avoided slide number area (y > 920)
✓ Avoided source citation area (y > 920)

**LAYERING:**
✓ Background: zIndex=0
✓ Background images: zIndex=1
✓ Decorative shapes: zIndex=5
✓ Accent lines: zIndex=9
✓ All text: zIndex=10
✓ All charts: zIndex=10
✓ UI elements: zIndex=100

**DESIGN QUALITY:**
✓ Layout pattern matches slide type (centered for titles, stacked for bullets, etc.)
✓ Coordinates use multiples of 20
✓ Colors use theme variables ({primary_bg}, {primary_text}, {accent_color})
✓ Text inside shapes has 40px padding verified
✓ Images included when available
✓ Clean, professional appearance
✓ Generous spacing (60-100px gaps)

**CONTENT ACCURACY:**
✓ Content matches slide outline
✓ Slide title used appropriately
✓ Key points formatted with HTML
✓ Added structure but preserved meaning

🚨 IF ANY CHECK FAILS → FIX IT IMMEDIATELY!

Return ONLY valid JSON (no markdown code blocks).
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
