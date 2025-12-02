"""
Layout Architect V2 - Editorial Design System
Creates magazine-quality layouts for each slide while preserving existing theme system.
"""

from typing import Dict, Any, List, Optional
import json
import asyncio
import functools
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
            # Use functools.partial to properly pass kwargs
            invoke_fn = functools.partial(
                invoke,
                client,
                model_name,
                messages,
                None,  # No response_model, we want raw JSON
                4000,  # max_tokens
                0.7    # temperature
            )
            response = await loop.run_in_executor(None, invoke_fn)
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
            # Use functools.partial to properly pass kwargs
            invoke_fn = functools.partial(
                invoke,
                client,
                model_name,
                messages,
                None,  # No response_model, we want raw JSON
                8000,  # max_tokens
                0.9    # High temperature for maximum creativity
            )
            response = await loop.run_in_executor(None, invoke_fn)
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
        accent_colors = colors.get('accents', ['#0066CC', '#FF6B35', '#4ECDC4'])

        # Get individual accent colors for use in examples
        accent_1 = accent_colors[0] if len(accent_colors) > 0 else '#0066CC'
        accent_2 = accent_colors[1] if len(accent_colors) > 1 else '#FF6B35'
        accent_3 = accent_colors[2] if len(accent_colors) > 2 else '#4ECDC4'

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

🎯 MANDATORY POSITIONING RULES - CONSISTENT LAYOUT:
**Title Position (STRICT):**
- Main titles MUST appear in y range: 160-220 (±20px tolerance)
- Title slide hero titles: y range: 350-450
- x position for titles: 100-200 (left-aligned) OR 160-360 (slightly indented)
- Width: 1600-1720px for full-width titles
- This ensures titles appear in the SAME position across all slides

**Element Consistency:**
- All slide titles should align vertically (same y-position ±20px)
- Slide numbers: Always bottom-right (x=1780, y=1000)
- Citations: Always bottom-left (x=100, y=1000)

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

🔥 AGGRESSIVE DESIGN MANDATE - BE BOLD!

DO NOT create boring split-screen layouts! Every slide should be visually striking and artistic.

**YOUR MISSION: Create magazine-quality, editorial designs that USE ALL AVAILABLE COMPONENTS**

═══════════════════════════════════════════════════════════════════════════════

🎨 COMPONENT ARSENAL (USE PURPOSEFULLY):

**Shapes** - USE ONLY FOR FUNCTIONAL PURPOSES:
- Divider lines: ONLY for clear section separation
- Background blocks: ONLY when text needs contrast for readability
- Containers: ONLY for grouping related content
- DO NOT use shapes for decoration, embellishment, or visual interest
- Prefer clean, minimal designs - let content breathe

**Images** - MAKE THEM DRAMATIC:
- Full-bleed to edges: x=0, width=960 OR x=960, width=960 (full half-screen)
- Sharp edges: borderRadius=0 (modern, editorial look)
- Outlined: Add stroke="#color", strokeWidth=6-12 for framed effect
- Overlays: Use overlayColor with low opacity for color grading
- Multiple images: Layer at different sizes/opacities for collage effect

**Lines & Dividers** - MINIMAL USE:
- Use ONLY to separate distinct sections when absolutely necessary
- Horizontal dividers: 1-2px height, subtle, below headers only
- Avoid vertical dividers unless comparing two distinct columns
- Color: Use subtle opacity (20-30%) to avoid visual clutter

**Icons** - USE LIBERALLY FOR VISUAL ENHANCEMENT:
- Icons ARE available via the Icon component
- Use Lucide icon library (iconLibrary: "lucide")
- Common icons: CheckCircle, ArrowRight, Star, Users, TrendingUp, Zap, Target, Shield
- Size: 24-48px for inline icons, 64-96px for hero icons
- Place icons next to headings, bullet points, or as visual markers
- Icons add professionalism and visual hierarchy
- Example: {{"type": "Icon", "props": {{"x": 100, "y": 200, "iconLibrary": "lucide", "iconName": "CheckCircle", "size": 32, "color": "{accent_1}"}}}}

**Color Blocks** - USE SPARINGLY:
- Only use when text needs background for readability
- Subtle, low-opacity backgrounds: 5-10% opacity maximum
- Avoid full-bleed color blocks unless it's a title slide
- Prefer clean white/background color - let content stand out

**Typography** - GO BIG:
- Hero text: 120-280pt font sizes
- Contrast: Mix huge titles with tiny captions (18-24pt)
- Text over images: Use shapes behind text for readability (zIndex layering)
- Multi-size hierarchy: h1 (140pt), h2 (72pt), body (36pt), captions (24pt)

**CustomComponent** - USE LIBERALLY FOR VISUAL EXPLANATIONS:
- DON'T just use text blocks to explain concepts - make them VISUAL!
- Process flows: Arrow diagrams, step indicators, visual timelines
- Statistics: Animated counters, progress rings, metric displays
- Comparisons: Side-by-side cards, before/after visuals
- Features: Icon grids, benefit showcases, feature matrices
- Team: Avatar grids, profile cards with stats
- Data highlights: Stat cards, KPI displays, metric visualizations
- Think: "How can I show this visually instead of just text?"

═══════════════════════════════════════════════════════════════════════════════

⚡ AGGRESSIVE LAYOUT PATTERNS:

**Pattern 1: FULL-BLEED IMAGE + GRAPHIC OVERLAYS**
```
- Image: x=0, y=0, width=960, height=1080, borderRadius=0 (SHARP EDGES)
- Accent line: x=940, y=0, width=8, height=1080, fill=accent, opacity=1
- Color block: x=960, y=0, width=960, height=1080, fill=bg with opacity=0.95
- Shapes: Add 2-3 accent rectangles/circles for visual interest
- Text: Large, layered over the color block with decorative elements
```

**Pattern 2: DIAGONAL SPLIT WITH SHAPES**
```
- Large rotated rectangle creating diagonal division
- Image fills one side completely (borderRadius=0)
- Text on opposite side with accent line dividers
- Circles or squares as decorative elements
- Bold color blocks framing content
```

**Pattern 3: LAYERED COLLAGE**
```
- Base image: x=0, y=0, width=1920, height=1080, opacity=0.3, zIndex=1
- Foreground image: x=100, y=200, width=700, height=500, sharp edges, stroke outline
- Color blocks: Multiple translucent rectangles at different positions
- Text: Layered on top with shape backgrounds
- Accent lines: Creating grid structure
```

**Pattern 4: CHART AS HERO + DECORATIVE FRAME**
```
- NOT just "chart on left, text on right"
- Add: Accent lines above/below chart
- Add: Color block background with rounded corners behind chart
- Add: Decorative circles or shapes near data points
- Add: Thick border around chart (stroke outline)
- Text: Side panel with accent line dividers between sections
```

**Pattern 5: TYPOGRAPHIC POSTER**
```
- MASSIVE title: 200-280pt, overlapping multiple elements
- Background shapes: Large geometric forms in accent colors
- Small image: Inset with thick outline border
- Accent lines: Creating visual rhythm and structure
- Text blocks: Framed with subtle color blocks
```

**Pattern 6: EDITORIAL MAGAZINE SPREAD**
```
- Vertical sidebar: x=0, width=280-400, full height, accent color
- Main image: borderRadius=0, with 8-12px stroke outline
- Multiple text blocks: Different sizes, with accent line separators
- Pull quote: Large text in circle or outlined box
- Decorative elements: Lines, dots, small shapes for visual interest
```

**Pattern 7: GEOMETRIC COMPOSITION**
```
- Base: Large geometric shapes in accent colors (circles, squares)
- Images: Clipped to shapes or outlined with thick borders
- Text: Positioned over solid color blocks for readability
- Lines: Connecting elements, creating flow
- Asymmetric balance: Off-center but visually weighted
```

**Pattern 8: FULL-BLEED EVERYTHING**
```
- Image spans entire slide: x=0, y=0, width=1920, height=1080
- Dark overlay: Shape with opacity=0.7 over part of image
- Text: Large, white/contrasting color over overlay
- Accent elements: Bright color lines/circles for pop
- Sharp edges throughout: borderRadius=0
```

**Pattern 9: VISUAL EXPLANATION with CustomComponent (HIGHLY ENCOURAGED)**
```
- Title at top: Clear heading explaining what's shown
- CustomComponent: Visual diagram/infographic taking 50-70% of space
  * Process flow with arrows
  * Metric display with numbers
  * Comparison cards
  * Feature grid with icons
  * Timeline visualization
  * Step-by-step diagram
- Supporting text: Small captions or bullet points if needed
- NOT ALLOWED: Wall of text - always visualize concepts!
```

**Pattern 10: FEATURE SHOWCASE with CustomComponents**
```
- Split into sections using shapes/dividers
- Multiple CustomComponents showing different aspects:
  * Stat card: Key metric with visual indicator
  * Icon grid: Features with symbols
  * Progress display: Goals or achievements
  * Comparison: Before/after or us vs competitor
- Minimal text, maximum visual communication
- Think infographic, not document
```

═══════════════════════════════════════════════════════════════════════════════

🚨 DESIGN REQUIREMENTS (MANDATORY):

**1. CLARITY AND READABILITY FIRST:**
   - Design must serve the content, not overwhelm it
   - Each element must have a clear purpose
   - Generous whitespace between all elements (minimum 60px gaps)
   - Clean, professional aesthetic - avoid clutter

**2. USE ALL COMPONENT TYPES APPROPRIATELY:**
   - **TiptapTextBlock**: For all text content (titles, body, captions)
   - **Images**: When they illustrate or explain content
   - **Icons**: Use next to headings, bullet points, feature lists (highly encouraged!)
   - **Shapes**: For backgrounds when text needs contrast, dividers, or containers
   - **Lines**: For section separation when necessary
   - **Charts**: For data visualization
   - **CustomComponent**: For complex visualizations, processes, or interactive content
   - Each component must serve the content, not just decorate

**3. SMART COMPONENT DISTRIBUTION:**
   - Aim for 4-8 functional components per slide
   - Title + content + visuals (images/charts/icons) + optional shapes
   - Don't overcrowd, but don't be too minimal either
   - Use icons generously to add visual markers and hierarchy

**4. STRATEGIC COLOR USAGE:**
   - Use theme colors consistently throughout
   - Accent colors for emphasis (icons, highlights, key data)
   - Use accent colors for icons to create visual interest
   - Vary opacity for depth and hierarchy

**5. CLEAN, MODERN AESTHETICS:**
   - Subtle borderRadius (8-12px) for softer, approachable feel
   - Avoid harsh edges and heavy strokes
   - Professional, balanced typography
   - Consistent sizing and spacing

**6. ANTI-OVERLAP VALIDATION (CRITICAL - NO EXCEPTIONS):**
   - **ABSOLUTELY NO OVERLAPPING COMPONENTS ALLOWED**
   - Calculate all positions sequentially: nextY = currentY + height + gap
   - VERIFY MATH: For every component, check component.y + component.height + gap ≤ next.y
   - Minimum gaps (NON-NEGOTIABLE):
     * 60px between text elements
     * 80px around charts/images
     * 40px around icons
   - Track vertical space as you add components:
     ```
     currentY = 160 (title position)
     title.y = currentY
     currentY = title.y + title.height + 80 (gap)
     content.y = currentY
     currentY = content.y + content.height + 80 (gap)
     chart.y = currentY
     ... and so on
     ```
   - Ensure final element ends before y=920 (safe area bottom)
   - If you can't fit all components, reduce component count or use two-column layout

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

Track vertical position as you add components:
- Start: currentY = 100 (safe area top)
- For each component:
  * component.y = currentY
  * component.height = calculated_height (based on content)
  * currentY = component.y + component.height + gap (60-100px gap)
- Before adding, verify it fits:
  * If currentY + component.height > 920, use different layout

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

✨ DESIGN EXAMPLES (showing proper positioning, no overlaps, and component usage):

**Example 1: Split-Screen with Icons - Consistent Title Position**
```json
{{
  "layout_reasoning": "Split-screen with image left, content with icons right - consistent title at y=180",
  "components": [
    {{"type": "Background", "zIndex": 0, "props": {{"color": "{primary_bg}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 160, "y": 180, "width": 1600, "height": 100, "fontSize": 72, "content": "<h1>{slide.title}</h1>", "color": "{primary_text}"}}}},
    {{"type": "Image", "zIndex": 1, "props": {{"x": 100, "y": 340, "width": 760, "height": 540, "src": "placeholder", "borderRadius": 12, "objectFit": "cover"}}}},
    {{"type": "Icon", "zIndex": 10, "props": {{"x": 960, "y": 340, "iconLibrary": "lucide", "iconName": "CheckCircle", "size": 40, "color": "{accent_1}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 1020, "y": 340, "width": 700, "height": 100, "fontSize": 36, "content": "<p>First key point with icon</p>", "color": "{primary_text}"}}}},
    {{"type": "Icon", "zIndex": 10, "props": {{"x": 960, "y": 480, "iconLibrary": "lucide", "iconName": "TrendingUp", "size": 40, "color": "{accent_1}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 1020, "y": 480, "width": 700, "height": 100, "fontSize": 36, "content": "<p>Second key point with icon</p>", "color": "{primary_text}"}}}}
  ]
}}
```

**Example 2: Chart with Icons and Insights - Consistent Positioning**
```json
{{
  "layout_reasoning": "Chart with icon-enhanced insights - title at y=180, no overlaps",
  "components": [
    {{"type": "Background", "zIndex": 0, "props": {{"color": "{primary_bg}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 160, "y": 180, "width": 1600, "height": 100, "fontSize": 72, "content": "<h1>Revenue Growth</h1>", "color": "{primary_text}"}}}},
    {{"type": "Chart", "zIndex": 10, "props": {{"x": 100, "y": 340, "width": 800, "height": 540, "chartType": "bar", "data": [...], "colors": ["{accent_1}"], "margin": {{"top": 20, "right": 20, "bottom": 60, "left": 80}}}}}},
    {{"type": "Icon", "zIndex": 10, "props": {{"x": 1000, "y": 360, "iconLibrary": "lucide", "iconName": "TrendingUp", "size": 48, "color": "{accent_1}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 1070, "y": 360, "width": 700, "height": 140, "fontSize": 48, "content": "<h2>340% Growth</h2>", "color": "{primary_text}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 1000, "y": 540, "width": 770, "height": 340, "fontSize": 32, "content": "<ul><li>Record quarter performance</li><li>All targets exceeded</li></ul>", "color": "{primary_text}"}}}}
  ]
}}
```

**Example 3: Feature List with Icons - Vertical Layout**
```json
{{
  "layout_reasoning": "Feature list with icons for each point - title at y=180, sequential positioning",
  "components": [
    {{"type": "Background", "zIndex": 0, "props": {{"color": "{primary_bg}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 160, "y": 180, "width": 1600, "height": 100, "fontSize": 72, "content": "<h1>Key Features</h1>", "color": "{primary_text}"}}}},
    {{"type": "Icon", "zIndex": 10, "props": {{"x": 200, "y": 340, "iconLibrary": "lucide", "iconName": "Zap", "size": 48, "color": "{accent_1}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 280, "y": 340, "width": 1400, "height": 100, "fontSize": 40, "content": "<h3>Lightning Fast Performance</h3>", "color": "{primary_text}"}}}},
    {{"type": "Icon", "zIndex": 10, "props": {{"x": 200, "y": 480, "iconLibrary": "lucide", "iconName": "Shield", "size": 48, "color": "{accent_2}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 280, "y": 480, "width": 1400, "height": 100, "fontSize": 40, "content": "<h3>Enterprise Security</h3>", "color": "{primary_text}"}}}},
    {{"type": "Icon", "zIndex": 10, "props": {{"x": 200, "y": 620, "iconLibrary": "lucide", "iconName": "Users", "size": 48, "color": "{accent_3}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 280, "y": 620, "width": 1400, "height": 100, "fontSize": 40, "content": "<h3>Team Collaboration</h3>", "color": "{primary_text}"}}}}
  ]
}}
```

**Example 4: Title Slide - Consistent Hero Position**
```json
{{
  "layout_reasoning": "Title slide with hero title at y=400 (within 350-450 range)",
  "components": [
    {{"type": "Background", "zIndex": 0, "props": {{"color": "{primary_bg}"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 160, "y": 400, "width": 1600, "height": 280, "fontSize": 180, "content": "<h1>{slide.title}</h1>", "color": "{primary_text}", "textAlign": "left"}}}},
    {{"type": "TiptapTextBlock", "zIndex": 10, "props": {{"x": 160, "y": 740, "width": 1200, "height": 80, "fontSize": 48, "content": "<p>Optional subtitle</p>", "color": "{primary_text}", "textAlign": "left", "opacity": 0.7}}}}
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

✅ DESIGN VALIDATION CHECKLIST (before returning):

**Consistent Positioning (MANDATORY):**
✓ Title position in correct y range: 160-220 for content slides, 350-450 for title slides
✓ Title x position: 100-200 (left-aligned) or 160-360 (indented)
✓ Slide number at x=1780, y=1000
✓ All titles at same y-position (±20px tolerance)

**Text Formatting:**
✓ All TiptapTextBlock content uses HTML tags
✓ No plain text or \\n characters

**Anti-Overlap (CRITICAL - NO EXCEPTIONS):**
✓ Used sequential positioning: nextY = currentY + height + gap
✓ VERIFIED MATH: For each component, checked component.y + component.height + gap ≤ next.y
✓ Minimum 60px gaps between text elements
✓ Minimum 80px gaps around charts/images
✓ Minimum 40px gaps around icons
✓ No overlapping bounding boxes at any zIndex
✓ All positions calculated sequentially, not guessed or fixed

**Bounds:**
✓ All components within safe area: x=[100-1820], y=[100-920]
✓ Charts minimum 500×400px
✓ Final component ends before y=920

**Component Usage:**
✓ 4-8 functional components per slide
✓ Icons used where appropriate (bullet points, features, headings)
✓ All component types considered (Text, Images, Icons, Shapes, Charts, CustomComponents)
✓ Each component serves the content

**Layering:**
✓ Proper zIndex: Background(0) < Images(1-5) < Shapes(5-9) < Content(10) < Icons(10) < UI(100)

**DO NOT RETURN if:**
❌ Title not in required y range (160-220 or 350-450)
❌ Components overlap (ABSOLUTE DEALBREAKER)
❌ Y positions not calculated sequentially
❌ Gaps less than minimum required (60px text, 80px visuals, 40px icons)
❌ Content extends beyond y=920
❌ Fixed Y positions used instead of calculated
❌ Missing icons when they would enhance clarity
❌ Math not verified for overlap prevention

═══════════════════════════════════════════════════════════════════════════════

{{
  "layout_reasoning": "Brief explanation of your creative concept and why it fits this slide",
  "components": [
    {{"id": "unique_id", "type": "ComponentType", "zIndex": number, "props": {{...component properties...}}}}
  ]
}}

Available component types:
- Background: Full-slide background with solid color or gradient
- Shape: Rectangles for functional purposes only (containers, dividers)
- Image: Images with styling (borderRadius, opacity, overlays, etc.)
- TiptapTextBlock: All text content (MUST use HTML formatting)
- Chart: Data visualizations (ensure proper sizing)
- CustomComponent: For interactive visualizations and complex content

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

        # Use consistent title positioning based on slide type
        if slide_type == "title":
            title_y = 400  # Hero title position (350-450 range)
        else:
            title_y = 180  # Standard title position (160-220 range)

        return {
            "layout_reasoning": f"Default {slide_type} layout with consistent title positioning and no overlaps.",
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
                        "y": title_y,
                        "width": 1600,
                        "height": 120,
                        "content": f"<h1>{slide.title}</h1>",
                        "fontSize": typo_scale.get('section_title', 72),
                        "textAlign": "left"
                    }
                },
                {
                    "id": "slide_number",
                    "type": "TiptapTextBlock",
                    "zIndex": 100,
                    "props": {
                        "x": 1780,
                        "y": 1000,
                        "width": 100,
                        "height": 40,
                        "fontSize": 18,
                        "textAlign": "right"
                    }
                }
            ]
        }
