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

        prompt = f"""Create a BOLD, full-canvas layout blueprint with PROPER SPACING and ALIGNMENT.

SLIDE: {slide.title}
TYPE: {slide_type}
POSITION: {slide_index + 1}/{total_slides}

THEME COLORS (use these creatively):
- Background: {primary_bg}
- Text: {primary_text}
- Accent: {accent_color}

CANVAS: 1920 x 1080 pixels (USE THE FULL CANVAS - be bold!)
SAFE AREA: x=[100-1820], y=[100-980] (but shapes can go to edges: 0-1920, 0-1080)

REQUIRED ELEMENTS (EXACT positions - these are already positioned, DO NOT overlap them):
{json.dumps(consistent, indent=2)}

DESIGN PHILOSOPHY - BE BOLD AND DYNAMIC:
Don't play it safe with centered rounded boxes. Use the FULL canvas. Create dynamic, edge-to-edge designs.

COLOR & GRADIENTS:
- VARY opacity (0.08 to 0.95) for depth
- Use GRADIENTS liberally for visual interest
- Mix theme colors creatively
- Full-screen gradients work great
- Color blocks that go to edges (x=0 or x+width=1920)

LAYOUT PATTERNS (be bold and varied):

1. SPLIT SCREEN (50/50):
   - Left half: colored shape (x=0, width=960) for image area
   - Right half: content with contrasting color
   - Perfect for image + text slides
   - Shapes go edge-to-edge (no margins)

2. ASYMMETRIC SPLIT (60/40 or 70/30):
   - Larger colored block on one side
   - Content on the other
   - Dynamic and modern

3. FULL-WIDTH BANDS:
   - Edge-to-edge colored sections (x=0, width=1920)
   - NO rounded corners on full-width elements
   - Stack multiple bands with different colors
   - Use gradients

4. DIAGONAL SPLIT:
   - Use gradient angles (45deg, 135deg) for diagonal feels
   - Creates dynamic energy

5. L-SHAPE or SIDE BAR:
   - Thick colored bar along left/right edge (x=0, width=200-400)
   - Content in remaining space
   - Bold accent strip

CRITICAL SPACING & ALIGNMENT RULES:
1. LAYERING (zIndex):
   - Background: zIndex=0
   - Images: zIndex=1-3
   - Decorative shapes/backdrops: zIndex=4-8
   - Lines/dividers: zIndex=9
   - Text content: zIndex=10-20
   - UI elements (slide numbers, sources): zIndex=100+
   - ALWAYS put shapes/backgrounds BEHIND text!

2. TEXT INSIDE SHAPES (CRITICAL):
   - If you create a backdrop shape for text, the text MUST be positioned INSIDE it
   - Shape bounds: [shape.x, shape.y, shape.x + shape.width, shape.y + shape.height]
   - Text must fit: [text.x >= shape.x + 40, text.y >= shape.y + 40, text.x + text.width <= shape.x + shape.width - 40, text.y + text.height <= shape.y + shape.height - 40]
   - CALCULATE FIRST: Determine text size, THEN create shape around it with 40px padding
   - Example: Text at (1060, 220, 700, 100) needs shape at (1020, 180, 780, 180) minimum

3. SPACING (prevent overlaps):
   - Minimum 30px gap between adjacent text blocks
   - Minimum 20px gap between shape and text it contains
   - Text inside shapes: add 40px padding on all sides
   - Stack vertically: y gaps of 40-60px between elements
   - Stack horizontally: x gaps of 40-80px between columns
   - NO OVERLAPPING TEXT - verify every text block has clear space

4. ALIGNMENT (clean organization):
   - Align tops: multiple elements should share same y coordinate
   - Align bottoms: y + height should match for row elements
   - Align left edges: multiple elements share same x coordinate
   - Align right edges: x + width should match
   - Center alignment: use x = (1920 - width) / 2
   - Text inside containers: center within the container bounds

5. HEIGHT CALCULATION (adequate space):
   - Title (72px font): height >= 100px
   - Subtitle (48px font): height >= 80px
   - Body text (36px font): height >= 60px per line
   - Multi-line text: calculate height = lineHeight * numberOfLines + 20px padding
   - Content blocks: ensure height fits all contained elements + padding

6. POSITIONING BEST PRACTICES:
   - Use multiples of 20 for x/y coordinates (grid alignment)
   - Title area: y=120-200 (top zone)
   - Main content: y=250-850 (middle zone)
   - Footer area: y=900-980 (bottom zone, but avoid required elements)
   - Check that x + width <= 1920 and y + height <= 1080

7. NO OVERLAPS:
   - Calculate bounding boxes: [x, y, x+width, y+height]
   - Ensure no text overlaps with other text
   - Shapes can overlap (backgrounds behind foregrounds)
   - Text must be fully visible above all shapes
   - Images must not overlap text unless intentional background image

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

9. CHARTS (GIVE THEM PROPER HEIGHT AND PROPER PLACEMENT):
   - Charts need MINIMUM height to be readable
   - Bar/Column charts: height >= 400px (better: 500-600px)
   - Line charts: height >= 400px
   - Pie/Donut charts: width=height (square), minimum 400x400px
   - NO SHORT/SQUISHED CHARTS - they're unreadable
   - Chart position: give them prominent space (not squeezed in corners)
   - Leave 40px margin around charts for labels/legends
   - CRITICAL: Charts MUST NOT overlap text blocks - check bounding boxes!
   - Calculate chart bounds [x, y, x+width, y+height] and ensure no text is inside those bounds

COMPONENT EXAMPLES WITH PROPER SPACING AND POSITIONING:

Example 1 - Text properly inside backdrop shape:
- Backdrop shape: {{"type": "Shape", "zIndex": 5, "props": {{"x": 1020, "y": 180, "width": 780, "height": 720, "fill": "#FFFFFF", "borderRadius": 20, "opacity": 0.95}}}}
- Title INSIDE (40px padding): {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 1060, "y": 220, "width": 700, "height": 100, "fontSize": 72, "content": "<h1>Title</h1>", "color": "{primary_text}"}}}}
- Body INSIDE (60px below title): {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 1060, "y": 360, "width": 700, "height": 500, "fontSize": 36, "content": "<p>Content</p>", "color": "{primary_text}"}}}}

Example 2 - Image with border frame (NOT rounded):
- Image with sharp border: {{"type": "Image", "zIndex": 2, "props": {{"x": 100, "y": 200, "width": 800, "height": 600, "src": "placeholder", "borderRadius": 0, "stroke": "{accent_color}", "strokeWidth": 6, "objectFit": "cover"}}}}

Example 3 - Image as half-screen with color overlay (CORRECT WAY):
- Left half image with overlay using Image props: {{"type": "Image", "zIndex": 2, "props": {{"x": 0, "y": 0, "width": 960, "height": 1080, "src": "placeholder", "borderRadius": 0, "objectFit": "cover", "overlayColor": "{accent_color}30", "overlayBlendMode": "multiply"}}}}

Example 4 - Image as background with overlay (CORRECT WAY):
- Background image with built-in overlay: {{"type": "Image", "zIndex": 1, "props": {{"x": 0, "y": 0, "width": 1920, "height": 1080, "src": "placeholder", "opacity": 0.5, "objectFit": "cover", "borderRadius": 0, "overlayColor": "{primary_bg}60", "overlayBlendMode": "soft-light"}}}}

Example 5 - Chart with proper height:
- Bar chart (NOT short): {{"type": "Chart", "zIndex": 10, "props": {{"x": 200, "y": 300, "width": 1520, "height": 550, "chartType": "bar", "data": [], "colors": ["{accent_color}"]}}}}

Example 6 - Accent line properly positioned:
- Accent line above content: {{"type": "Shape", "zIndex": 9, "props": {{"x": 1020, "y": 160, "width": 200, "height": 4, "fill": "{accent_color}", "borderRadius": 0, "opacity": 1}}}}

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

VALIDATION CHECKLIST (before finalizing - CHECK EVERYTHING):
✓ Background at zIndex=0
✓ Images at zIndex=1-3
✓ All decorative shapes/backdrops have zIndex=4-9
✓ All text has zIndex >= 10
✓ UI elements at zIndex >= 100
✓ If shape is backdrop for text: text coordinates are INSIDE shape with 40px padding
✓ No text blocks overlap each other (check x/y/width/height bounds)
✓ All elements within canvas (x+width <= 1920, y+height <= 1080)
✓ Minimum 30px gaps between adjacent text elements
✓ Heights are adequate for font sizes (title>=100px, body>=60px per line)
✓ Coordinates use multiples of 20 for alignment
✓ Images use overlayColor and overlayBlendMode props (NOT separate shapes for overlays)
✓ Images are included and styled (borderRadius variation, borders, opacity)
✓ Images positioned purposefully (not overlapping text unless background)
✓ Charts have proper height (minimum 400px, better 500-600px)
✓ Charts are not squished or too short to read
✓ **CRITICAL: Charts do NOT overlap any text blocks - verify bounding boxes!**
✓ **Text must be fully readable and NOT covered by charts or other elements**

Return ONLY JSON.
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
