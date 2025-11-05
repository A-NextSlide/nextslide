# Theme Director V2 - Editorial Design System
## Creating Magazine-Quality Presentation Layouts

---

## 🎨 DESIGN PHILOSOPHY

Looking at that creative brief example, we see:
- **Bold typography** (massive titles, varied sizes)
- **Asymmetric layouts** (not boring centered grids)
- **Strategic image placement** (cutouts, overlays, scale contrast)
- **Creative text positioning** (rotated, overlapping, varied alignment)
- **Shape integration** (rectangles as frames, dividers, backgrounds)
- **Whitespace mastery** (generous breathing room)
- **Visual hierarchy** (hero elements vs supporting content)

**Theme Director V2 will design like a magazine art director, not a PowerPoint template.**

---

## 🏗️ ARCHITECTURE OVERVIEW

### Current Flow (Preserved):
```
DeckOutline → Theme Colors/Fonts (existing) → Slides
```

### New Enhanced Flow:
```
DeckOutline
    ↓
┌─────────────────────────────────────────────────┐
│  EXISTING THEME SYSTEM (PRESERVED)              │
│  - Color extraction from stylePreferences ✅    │
│  - Font selection from metadata ✅              │
│  - Brand color preservation ✅                  │
│  - Huemint palette generation ✅                │
│  - Design tokens (corner_radius, etc.) ✅      │
└──────────────┬──────────────────────────────────┘
               ↓
    ThemeSpec (colors, fonts, tokens)
               ↓
┌─────────────────────────────────────────────────┐
│  NEW: LAYOUT ARCHITECT (Theme Director V2)     │
│  - Analyzes deck content & theme                │
│  - Detects slide types (title, team, market)    │
│  - Designs editorial layouts per slide          │
│  - Plans exact component positions              │
│  - Creates visual variety within consistency    │
└──────────────┬──────────────────────────────────┘
               ↓
    ThemeDocument {
        deck_theme: {existing theme data},
        slide_blueprints: {new layout plans}
    }
               ↓
┌─────────────────────────────────────────────────┐
│  SLIDE GENERATOR (UPDATED)                     │
│  - Receives blueprint + content                 │
│  - Executes layout exactly                      │
│  - Fills in content from slide data             │
└─────────────────────────────────────────────────┘
```

**Key:** We're **adding** layout intelligence, **not replacing** your color/font system!

---

## 🎯 SLIDE TYPE DETECTION & LAYOUTS

### 1. **TITLE SLIDE**

**Detection:**
- `slide_index == 0`
- OR `slide.type == "title"`
- OR title contains: "presentation", "pitch", "proposal"

**Layout Patterns:**

**Pattern A: Hero Title + Accent Shape**
```
┌─────────────────────────────────────────────┐
│                                             │
│          [MASSIVE TITLE]                    │
│          Centered, 180-240pt                │
│                                             │
│    ━━━━━━━━━━                              │  ← Accent line (Shape)
│                                             │
│          Subtitle Text                      │
│          36pt, centered                     │
│                                             │
│                                             │
│   [Logo]              01                    │  ← Footer
└─────────────────────────────────────────────┘

Components:
- Background (gradient or solid from theme)
- TiptapTextBlock (title, 200pt, centered)
- Shape (line, accent_1, 4px, centered below title)
- TiptapTextBlock (subtitle, 36pt, muted color)
- Image (logo, bottom-left)
- TiptapTextBlock (slide number, bottom-left)
```

**Pattern B: Asymmetric Title + Image**
```
┌─────────────────────────────────────────────┐
│  BOLD                    [Large Image]      │
│  PRESENTATION            Covers right       │
│  TITLE                   60% of canvas      │
│  Left-aligned,                              │
│  120-180pt              [Image extends      │
│                          to edge]           │
│  Brief description                          │
│  below title                                │
│                                             │
│   [Logo]              01                    │
└─────────────────────────────────────────────┘

Components:
- Background (solid from theme)
- TiptapTextBlock (title, 140pt, left x=80)
- TiptapTextBlock (subtitle, 32pt, left x=80)
- Image (right side, x=1000, width=920, height=800, objectFit="cover")
- Image (logo), TiptapTextBlock (slide number)
```

---

### 2. **TEAM / PEOPLE SLIDE**

**Detection:**
- Title contains: "team", "people", "leadership", "founders", "our team", "meet"
- Content has multiple names
- Has tagged headshot images

**Layout Pattern: Grid of Profile Cards**
```
┌─────────────────────────────────────────────┐
│  MEET THE TEAM                              │  ← Title (96pt, left)
│  ━━━━━━━━                                   │  ← Divider line
│                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │ [Photo] │  │ [Photo] │  │ [Photo] │    │  ← Image (circle mask)
│  │         │  │         │  │         │    │
│  │  Name   │  │  Name   │  │  Name   │    │  ← TiptapTextBlock
│  │  Title  │  │  Title  │  │  Title  │    │  ← TiptapTextBlock
│  └─────────┘  └─────────┘  └─────────┘    │
│                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │ [Photo] │  │ [Photo] │  │ [Photo] │    │
│  │         │  │         │  │         │    │
│  │  Name   │  │  Name   │  │  Name   │    │
│  │  Title  │  │  Title  │  │  Title  │    │
│  └─────────┘  └─────────┘  └─────────┘    │
│                                             │
│   [Logo]              02                    │
└─────────────────────────────────────────────┘

Components per person:
- Shape (roundedRectangle, background card, accent color with low opacity)
- Image (headshot, borderRadius="50%" for circle, objectFit="cover")
- TiptapTextBlock (name, 28pt, bold, center)
- TiptapTextBlock (title, 20pt, muted, center)

Grid: 3 columns × 2 rows, 40px gaps
Card size: 500×400px each
```

**Alternative: Magazine-Style Asymmetric**
```
┌─────────────────────────────────────────────┐
│  LEADERSHIP                                 │
│  TEAM                                       │
│  96pt, bold                [Large Photo]    │  ← Hero person
│                            Right side       │
│  ┌──────┐  ┌──────┐       600×700px        │
│  │Photo │  │Photo │                         │
│  │Small │  │Small │       Name              │
│  │200px │  │200px │       Title             │
│  └──────┘  └──────┘       Description       │
│  Name       Name                            │
│  Title      Title                           │
│                                             │
│   [Logo]              03                    │
└─────────────────────────────────────────────┘

Components:
- 1 large Image (hero person, right side)
- TiptapTextBlock (hero name, 48pt)
- TiptapTextBlock (hero title, 28pt)
- 2-3 smaller Images (team members, left side, stacked)
- TiptapTextBlocks for each name/title
```

---

### 3. **MARKET / TAM SAM SOM SLIDE**

**Detection:**
- Title contains: "market", "tam", "sam", "som", "opportunity", "addressable"
- Content has "$XXB", "$XXM" patterns
- Numbers with "billion", "million"

**Layout Pattern: Concentric Circles with Numbers**
```
┌─────────────────────────────────────────────┐
│  MARKET OPPORTUNITY                         │  ← Title (96pt, left)
│  ━━━━━━━━━                                  │
│                                             │
│      ╔═══════════════════╗                 │
│      ║  $50B             ║                  │  ← Largest circle (TAM)
│      ║  TAM              ║                  │    Shape (circle, stroke only)
│      ║   ┌─────────────┐ ║                 │
│      ║   │  $15B       │ ║                 │  ← Medium circle (SAM)
│      ║   │  SAM        │ ║                 │
│      ║   │  ┌────────┐ │ ║                 │
│      ║   │  │ $3B    │ │ ║                 │  ← Small circle (SOM)
│      ║   │  │ SOM    │ │ ║                 │    Filled with accent color
│      ║   │  └────────┘ │ ║                 │
│      ║   └─────────────┘ ║                 │
│      ╚═══════════════════╝                 │
│                                             │
│   [Logo]              04                    │
└─────────────────────────────────────────────┘

Components:
- Shape (circle, 700px, stroke only, accent_1, strokeWidth=3)
- TiptapTextBlock ("$50B", 72pt, positioned at top of circle)
- TiptapTextBlock ("TAM", 28pt, below number)

- Shape (circle, 480px, stroke only, accent_2, strokeWidth=3)
- TiptapTextBlock ("$15B", 60pt)
- TiptapTextBlock ("SAM", 24pt)

- Shape (circle, 300px, filled, accent_3, opacity=0.9)
- TiptapTextBlock ("$3B", 48pt, white text)
- TiptapTextBlock ("SOM", 20pt, white text)

Positioned concentrically: center at x=960, y=540
```

**Alternative: Side-by-side Cards**
```
┌─────────────────────────────────────────────┐
│  MARKET OPPORTUNITY                         │
│                                             │
│  ┌──────────────┐  ┌──────────────┐       │
│  │              │  │              │       │
│  │   $50B       │  │   $15B       │       │  ← CustomComponent
│  │   TAM        │  │   SAM        │       │    or Shape cards
│  │              │  │              │       │
│  │ Total market │  │ Serviceable  │       │
│  │              │  │              │       │
│  └──────────────┘  └──────────────┘       │
│                                             │
│          ┌──────────────┐                  │
│          │              │                  │
│          │   $3B        │                  │
│          │   SOM        │                  │
│          │              │                  │
│          │ Target now   │                  │
│          │              │                  │
│          └──────────────┘                  │
│                                             │
│   [Logo]              05                    │
└─────────────────────────────────────────────┘
```

---

### 4. **DATA / METRICS SLIDE**

**Detection:**
- Has extractedData (charts)
- Title contains: "revenue", "growth", "metrics", "performance", "results"
- Content has multiple numbers

**Layout Pattern: Chart + Insight Cards**
```
┌─────────────────────────────────────────────┐
│  REVENUE GROWTH                             │  ← Title
│  ━━━━━━━━━                                  │
│                                             │
│  ┌─────────────────────────┐               │
│  │                         │               │  ← Chart (bar/line)
│  │     [Chart Visual]      │               │    Left side
│  │                         │               │
│  │                         │               │
│  └─────────────────────────┘               │
│                                             │
│                    ┌──────────┐            │
│                    │  +42%    │            │  ← Stat cards (right)
│                    │  Growth  │            │    CustomComponent
│                    └──────────┘            │
│                    ┌──────────┐            │
│                    │  $4.2M   │            │
│                    │  ARR     │            │
│                    └──────────┘            │
│                                             │
│   [Logo]              06                    │
└─────────────────────────────────────────────┘

Components:
- Chart (left side, x=80, y=280, width=1000, height=600)
- CustomComponent (2-3 stat cards, right side, stacked vertically)
  Each card: 350×180px, accent color background, large number (72pt)
```

---

### 5. **CONTENT / BULLET SLIDE**

**Detection:**
- Has bullet points in content
- Generic content slide (not special type)

**Layout Pattern: Split with Visual**
```
┌─────────────────────────────────────────────┐
│  KEY BENEFITS                               │  ← Title (96pt, left)
│  ━━━━━                                      │
│                                             │
│  • Benefit one          [Image or          │  ← Left: bullets
│    with description     Shape visual]      │    Right: image/shape
│                                             │
│  • Benefit two          Large visual       │
│    with description     fills right        │
│                         half               │
│  • Benefit three                           │
│    with description                        │
│                                             │
│                                             │
│   [Logo]              07                    │
└─────────────────────────────────────────────┘

Components:
- TiptapTextBlock (title)
- Shape (divider line)
- TiptapTextBlock (bullets, left side, x=80, width=800)
  Use texts array for multi-color formatting
- Image (right side, x=1000, width=840, height=700)
  OR Shape (decorative, accent color, geometric pattern)
```

**Alternative: Icon + Text Grid**
```
┌─────────────────────────────────────────────┐
│  OUR APPROACH                               │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ [Icon]   │  │ [Icon]   │  │ [Icon]   │ │  ← Icons (lucide)
│  │          │  │          │  │          │ │
│  │ Discover │  │ Design   │  │ Deliver  │ │  ← TiptapTextBlock
│  │ Brief    │  │ Create   │  │ Launch   │ │
│  │ text     │  │ text     │  │ text     │ │
│  └──────────┘  └──────────┘  └──────────┘ │
│                                             │
│   [Logo]              08                    │
└─────────────────────────────────────────────┘

Components per column:
- Icon (32×32, accent color)
- TiptapTextBlock (heading, 32pt, bold)
- TiptapTextBlock (description, 24pt, muted)
```

---

### 6. **TIMELINE SLIDE**

**Detection:**
- Title contains: "timeline", "roadmap", "milestones", "journey", "history"
- Content has dates or sequential items

**Layout Pattern: Horizontal Timeline**
```
┌─────────────────────────────────────────────┐
│  OUR JOURNEY                                │
│                                             │
│  Q1        Q2        Q3        Q4           │  ← Timeline
│  ●━━━━━━━━━●━━━━━━━━━●━━━━━━━━━●          │    CustomComponent
│  │         │         │         │           │
│  Launch    Growth    Expand    Scale       │
│  $2M       $5M       $10M      $20M        │
│                                             │
│   [Logo]              09                    │
└─────────────────────────────────────────────┘

Components:
- CustomComponent (horizontal timeline with dots and connecting lines)
  Or individual components:
  - Lines (connecting line, y=400)
  - Shapes (circles for milestones, filled with accent colors)
  - TiptapTextBlocks (labels above and below each milestone)
```

---

### 7. **COMPARISON SLIDE**

**Detection:**
- Title contains: "vs", "versus", "comparison", "before after"
- Content structured as comparison

**Layout Pattern: Side-by-Side**
```
┌─────────────────────────────────────────────┐
│  BEFORE vs AFTER                            │
│                                             │
│  ┌────────────────────┐ ┌────────────────┐ │
│  │                    │ │                │ │
│  │   BEFORE           │ │   AFTER        │ │  ← Shape cards
│  │                    │ │                │ │    or Images
│  │   • Old way        │ │   • New way    │ │
│  │   • Problems       │ │   • Solutions  │ │
│  │   • Limitations    │ │   • Benefits   │ │
│  │                    │ │                │ │
│  └────────────────────┘ └────────────────┘ │
│                                             │
│   [Logo]              10                    │
└─────────────────────────────────────────────┘

Components:
- 2 large Shapes (roundedRectangle, different accent colors)
- TiptapTextBlocks inside each (heading + bullets)
- OR CustomComponent (comparison cards)
```

---

### 8. **QUOTE / TESTIMONIAL SLIDE**

**Detection:**
- Content starts with quotes: `"`, `'`
- Title contains: "testimonial", "review", "feedback"

**Layout Pattern: Large Quote with Attribution**
```
┌─────────────────────────────────────────────┐
│                                             │
│           "This product                     │  ← Large quote
│            transformed                      │    140pt italic
│            our business"                    │
│                                             │
│                                             │
│                            — John Smith     │  ← Attribution
│                              CEO, Acme Inc  │    36pt, right
│                                             │
│   [Logo]              11                    │
└─────────────────────────────────────────────┘

Components:
- TiptapTextBlock (quote, 140pt, italic, centered, accent color)
- Shape (decorative quote marks, large, light accent)
- TiptapTextBlock (attribution, 36pt, right-aligned)
- Optional: Image (person photo, small circle, bottom-right)
```

---

## 🎨 LAYOUT ARCHITECT PROMPT

### Design Philosophy Generator (Phase 1)

```python
LAYOUT_ARCHITECT_PHASE_1 = """
You are an EDITORIAL DESIGNER creating a presentation with magazine-quality layouts.

EXISTING THEME (FROM COLOR/FONT SYSTEM):
Colors: {{theme.color_palette}}
Fonts: {{theme.typography}}
Design Tokens: {{theme.visual_effects.design_tokens}}

DECK CONTENT:
Title: {{deck.title}}
Slides: {{deck.slide_count}}
Content Preview: {{deck.slides[:3]}}

TASK: Extend the existing theme with LAYOUT DESIGN RULES.

Analyze the deck type and create layout strategy:

1. **Presentation Type** (determines layout freedom):
   - CREATIVE (startups, agencies, creative): Asymmetric, bold, 12-20 components
   - CORPORATE (business, formal): Grid-based, structured, 6-10 components
   - EDITORIAL (portfolios, case studies): Magazine-style, varied layouts

2. **Layout Patterns to Use**:
   Based on slide types detected in deck:
   - Title slides: Hero or asymmetric
   - Team slides: Grid or magazine-style
   - Data slides: Chart + insights or dashboard
   - Content slides: Split-screen or icon grid
   - Market slides: Concentric circles or cards

3. **Component Strategy**:
   - Use Shapes for: Cards, dividers, decorative elements
   - Use Images for: Photos, headshots (circle mask), visuals
   - Use CustomComponents for: Stat cards, timelines, dashboards
   - Use Icons: Sparingly (0-2 per slide, semantic only)

4. **Visual Consistency Rules**:
   - Slide numbers: Always x=80, y=1020, 20pt, opacity=0.6
   - Logos: Always x=80, y=1028, 80×24, objectFit="contain"
   - Title zone: y=80-200 (reserve for slide titles)
   - Footer zone: y=960-1080 (reserve for metadata)
   - Content zone: y=240-900 (main content area)

5. **Spacing System**:
   - Tight: 20px (within groups)
   - Normal: 40px (between related elements)
   - Generous: 60px (between sections)
   - Extra: 100px (major separations)

6. **Typography Scale** (use existing theme fonts):
   - Mega: 200-240pt (title slides, hero statements)
   - Hero: 120-180pt (main titles)
   - Title: 96pt (section titles)
   - Subtitle: 48pt (subtitles, large body)
   - Body: 32-36pt (main content)
   - Caption: 24pt (small text, metadata)
   - Tiny: 20pt (slide numbers)

Return JSON:
{
  "layout_strategy": {
    "presentation_type": "CREATIVE|CORPORATE|EDITORIAL",
    "primary_layouts": ["hero_title", "split_screen", "grid", "dashboard"],
    "component_density": "minimal|balanced|rich",
    "visual_rhythm": "consistent|varied|dynamic"
  },

  "spacing_rules": {
    "component_gap": 40,
    "section_gap": 80,
    "edge_padding": 80,
    "title_margin_bottom": 60
  },

  "consistency_anchors": {
    "slide_number": {"x": 80, "y": 1020, "fontSize": 20, "opacity": 0.6},
    "logo": {"x": 80, "y": 1028, "width": 80, "height": 24},
    "title_zone": {"y_start": 80, "y_end": 200},
    "content_zone": {"y_start": 240, "y_end": 900}
  },

  "decoration_strategy": {
    "use_divider_lines": true,
    "use_accent_shapes": "moderate",
    "use_background_gradients": true,
    "text_over_images": "when_appropriate"
  }
}
"""
```

### Per-Slide Blueprint Generator (Phase 2)

```python
LAYOUT_ARCHITECT_PHASE_2 = """
You are designing the EXACT layout for ONE slide in a magazine-quality presentation.

DESIGN SYSTEM:
{{layout_strategy}}
{{spacing_rules}}
{{consistency_anchors}}

EXISTING THEME (colors/fonts):
{{theme.color_palette}}
{{theme.typography}}

AVAILABLE COMPONENTS:
{{component_inventory_condensed}}

SLIDE TO DESIGN:
Position: Slide {{slide_index + 1}} of {{total_slides}}
Title: "{{slide.title}}"
Content: "{{slide.content}}"
Type: {{detected_slide_type}}  // title, team, market, data, content, timeline, comparison, quote
Has Images: {{slide.has_tagged_media}}
Has Data: {{slide.has_extracted_data}}

CANVAS: 1920×1080px
Safe Area: x=80-1840, y=80-1000

YOUR TASK: Design this slide using the appropriate LAYOUT PATTERN for its type.

LAYOUT PATTERNS BY TYPE:

**TITLE SLIDE:**
- Pattern A: Centered hero (title 200pt centered, subtitle below, accent line)
- Pattern B: Asymmetric (title left 140pt, large image right 60%)

**TEAM SLIDE:**
- Pattern A: Grid (3×2 cards, 500×400 each, circle headshots, name/title)
- Pattern B: Magazine (1 large hero person right, 2-3 smaller left)

**MARKET SLIDE (TAM/SAM/SOM):**
- Pattern A: Concentric circles (3 nested circles with values)
- Pattern B: Stacked cards (3 cards descending in size)

**DATA SLIDE:**
- Pattern A: Chart + stat cards (chart left 60%, cards right stacked)
- Pattern B: Dashboard (4 stat cards in 2×2 grid)

**CONTENT SLIDE:**
- Pattern A: Split-screen (text left, image right)
- Pattern B: Icon grid (3 columns, icon + heading + text)

**TIMELINE SLIDE:**
- Pattern A: Horizontal line (dots connected, labels above/below)
- Pattern B: Vertical steps (stacked milestone cards)

**COMPARISON SLIDE:**
- Pattern A: Side-by-side cards (2 large shapes with content)
- Pattern B: Split screen (image left, text right; or vice versa)

**QUOTE SLIDE:**
- Pattern A: Centered large quote (140pt italic) + attribution
- Pattern B: Quote left, person photo right

REQUIREMENTS:
1. Choose appropriate pattern for {{detected_slide_type}}
2. Use EXACT component positions (no overlaps!)
3. Apply existing theme colors/fonts
4. Include consistent elements:
   - Slide number (x=80, y=1020)
   - Logo if brand exists (x=80, y=1028)
   - Background (gradient or solid from theme)

4. Calculate positions precisely:
   - Title at y=120 (if top-aligned) or centered
   - Content starts at y=240 minimum
   - Respect footer zone (y>960 reserved)
   - Use spacing_rules for gaps

5. Component selection:
   - For people: Use Image with borderRadius="50%"
   - For stats: Use CustomComponent (stat cards)
   - For lists: Use TiptapTextBlock with bullets
   - For dividers: Use Lines (2-4px, opacity 0.3)
   - For cards: Use Shape (roundedRectangle) + TiptapTextBlock

6. Content mapping:
   - Extract names/titles for team slides
   - Extract numbers for market/data slides
   - Extract quotes for testimonial slides
   - Use {{slide.title}} for main heading
   - Transform {{slide.content}} appropriately

RETURN JSON BLUEPRINT:
{
  "slide_id": "{{slide.id}}",
  "slide_type": "{{detected_slide_type}}",
  "layout_pattern": "hero_centered|asymmetric_title|grid_3x2|split_screen|etc",
  "design_intent": "Brief description of visual strategy",

  "components": [
    {
      "id": "background",
      "type": "Background",
      "props": {
        "backgroundType": "gradient",
        "gradient": {
          "angle": 135,
          "stops": [
            {"color": "{{theme.accent_1}}", "position": 0, "opacity": 0.05},
            {"color": "{{theme.accent_2}}", "position": 100, "opacity": 0.05}
          ]
        }
      },
      "z_index": -1,
      "priority": "required"
    },
    // ... more components with EXACT positions
  ],

  "layout_metadata": {
    "total_components": 8,
    "has_headshots": true,
    "uses_custom_components": true,
    "creative_elements": ["circle_masks", "accent_line", "gradient_bg"]
  }
}

DESIGN PRINCIPLES:
- **Be bold**: Don't be afraid of large type (200pt+ for titles)
- **Use whitespace**: Generous padding, breathing room
- **Create hierarchy**: Size contrast (hero vs body = 5:1 ratio)
- **Asymmetry wins**: Off-center often looks more editorial than centered
- **Layer smartly**: Use z-index for depth (bg=-1, content=0-10, foreground=20+)
- **Shapes as frames**: Rounded rectangles make great card backgrounds
- **Images as heroes**: Large images (800×700+) create impact
- **Circles for people**: borderRadius="50%" for headshots
- **Lines for division**: Thin accent lines (2-4px) separate sections

Generate the blueprint now.
"""
```

---

## 💻 IMPLEMENTATION CODE

### Updated ThemeDirectorV2

```python
"""
Theme Director V2 - Layout Architect
Extends existing theme with editorial-quality layouts.
"""

from typing import Dict, Any, List, Optional
from agents.domain.models import DeckOutline, ThemeDocument, ThemeSpec
from agents.ai.clients import get_client, invoke
from agents.config import THEME_STYLE_MODEL
from setup_logging_optimized import get_logger
import json
import re

logger = get_logger(__name__)


class LayoutArchitect:
    """
    Designs magazine-quality layouts for each slide.
    Works WITH existing theme system (colors/fonts).
    """

    def __init__(self, component_schemas: str):
        self.component_schemas = component_schemas

    async def design_layouts(
        self,
        deck_outline: DeckOutline,
        existing_theme: ThemeSpec  # ← Receives existing theme!
    ) -> Dict[str, Dict[str, Any]]:
        """
        Design per-slide layouts using existing theme colors/fonts.

        Args:
            deck_outline: The deck content
            existing_theme: Already-generated theme (colors, fonts, tokens)

        Returns:
            slide_blueprints: Dict of slide_id → layout blueprint
        """

        logger.info(f"🎨 Layout Architect: Designing layouts for '{deck_outline.title}'")
        logger.info(f"   Using existing theme: {existing_theme.theme_name}")

        # Phase 1: Extend theme with layout strategy
        layout_strategy = await self._generate_layout_strategy(
            deck_outline,
            existing_theme
        )

        # Phase 2: Design each slide
        slide_blueprints = {}

        for i, slide in enumerate(deck_outline.slides):
            # Detect slide type
            slide_type = self._detect_slide_type(slide, i, len(deck_outline.slides))

            # Generate blueprint
            blueprint = await self._generate_slide_blueprint(
                slide=slide,
                slide_index=i,
                total_slides=len(deck_outline.slides),
                slide_type=slide_type,
                layout_strategy=layout_strategy,
                theme=existing_theme
            )

            slide_id = getattr(slide, 'id', None) or str(i)
            slide_blueprints[slide_id] = blueprint

        logger.info(f"✅ Layout Architect: Designed {len(slide_blueprints)} slide layouts")

        return slide_blueprints

    def _detect_slide_type(self, slide: Any, index: int, total: int) -> str:
        """Detect slide type from content"""
        title = getattr(slide, 'title', '').lower()
        content = getattr(slide, 'content', '').lower()

        # Title slide
        if index == 0:
            return "title"

        # Team slide
        if any(kw in title for kw in ['team', 'people', 'leadership', 'founders', 'meet']):
            return "team"

        # Market slide
        if any(kw in title for kw in ['market', 'tam', 'sam', 'som', 'opportunity']):
            return "market"

        # Data slide
        if hasattr(slide, 'extractedData') and slide.extractedData:
            return "data"

        # Timeline slide
        if any(kw in title for kw in ['timeline', 'roadmap', 'milestone', 'journey']):
            return "timeline"

        # Comparison slide
        if any(kw in title for kw in ['vs', 'versus', 'comparison', 'before', 'after']):
            return "comparison"

        # Quote slide
        if content.startswith('"') or content.startswith("'"):
            return "quote"

        # Default: content slide
        return "content"

    async def _generate_layout_strategy(
        self,
        deck_outline: DeckOutline,
        theme: ThemeSpec
    ) -> Dict[str, Any]:
        """Phase 1: Generate layout strategy"""

        prompt = self._build_layout_strategy_prompt(deck_outline, theme)

        client, model = get_client(THEME_STYLE_MODEL)
        response = await invoke(
            client=client,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.7
        )

        return json.loads(response)

    async def _generate_slide_blueprint(
        self,
        slide: Any,
        slide_index: int,
        total_slides: int,
        slide_type: str,
        layout_strategy: Dict[str, Any],
        theme: ThemeSpec
    ) -> Dict[str, Any]:
        """Phase 2: Generate exact layout for one slide"""

        prompt = self._build_slide_blueprint_prompt(
            slide, slide_index, total_slides, slide_type,
            layout_strategy, theme
        )

        client, model = get_client(THEME_STYLE_MODEL)
        response = await invoke(
            client=client,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=3000,
            temperature=0.6
        )

        blueprint = json.loads(response)

        # Ensure consistent elements are present
        self._ensure_consistent_elements(blueprint, slide_index, theme)

        return blueprint

    def _ensure_consistent_elements(
        self,
        blueprint: Dict[str, Any],
        slide_index: int,
        theme: ThemeSpec
    ):
        """Ensure slide number and logo are always included"""

        components = blueprint.get('components', [])
        component_ids = [c.get('id') for c in components]

        # Add slide number if missing
        if 'slide_number' not in component_ids:
            components.append({
                "id": "slide_number",
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 80, "y": 1020},
                    "width": 60,
                    "height": 24,
                    "texts": [{"text": f"{slide_index + 1:02d}", "style": {"textColor": theme.color_palette.get('primary_text', '#1F2937')}}],
                    "fontSize": 20,
                    "fontFamily": theme.typography.get('body_text', {}).get('family', 'Inter'),
                    "alignment": "left",
                    "verticalAlignment": "middle",
                    "opacity": 0.6
                },
                "z_index": 100,
                "priority": "required"
            })

        # Add logo placeholder if missing
        if 'logo' not in component_ids:
            components.append({
                "id": "logo",
                "type": "Image",
                "props": {
                    "position": {"x": 80, "y": 1028},
                    "width": 80,
                    "height": 24,
                    "src": "placeholder",
                    "objectFit": "contain",
                    "metadata": {"kind": "logo"}
                },
                "z_index": 100,
                "priority": "optional"
            })

    def _build_layout_strategy_prompt(self, deck: DeckOutline, theme: ThemeSpec) -> str:
        """Build Phase 1 prompt"""
        # Use LAYOUT_ARCHITECT_PHASE_1 template from above
        # ... implementation
        pass

    def _build_slide_blueprint_prompt(
        self, slide, index, total, type, strategy, theme
    ) -> str:
        """Build Phase 2 prompt"""
        # Use LAYOUT_ARCHITECT_PHASE_2 template from above
        # ... implementation
        pass
```

### Integration into DeckComposer

```python
# File: apps/backend/agents/generation/adapters.py
# In SimpleDeckComposer.compose_deck() method

# EXISTING: Theme generation (line ~600)
if theme is None:
    # Generate theme using EXISTING system (colors, fonts)
    theme_result = await theme_manager.generate_theme(deck_outline)
    theme = theme_result['theme']  # ThemeSpec with colors/fonts
    search_terms = theme_result['search_terms']

# NEW: Add layout blueprints
from agents.generation.layout_architect import LayoutArchitect
from agents.prompts.generation.optimized_component_schemas import get_optimized_component_schemas

layout_architect = LayoutArchitect(
    component_schemas=get_optimized_component_schemas()
)

# Design layouts using existing theme
slide_blueprints = await layout_architect.design_layouts(
    deck_outline=deck_outline,
    existing_theme=theme  # ← Pass existing theme!
)

# Store blueprints in theme (for slide generation)
if hasattr(theme, 'slide_themes'):
    theme.slide_themes = slide_blueprints
elif isinstance(theme, dict):
    theme['slide_themes'] = slide_blueprints
```

---

## ✅ TESTING CHECKLIST

### Visual Quality Tests:
- [ ] Title slides look editorial (not PowerPoint)
- [ ] Team slides show headshots in circles
- [ ] Market slides use concentric circles or cards
- [ ] Data slides have proper chart + insight layout
- [ ] Spacing feels generous (not cramped)
- [ ] Typography scale is dramatic (hero vs body contrast)

### Consistency Tests:
- [ ] Slide numbers always at x=80, y=1020
- [ ] Logos always at x=80, y=1028
- [ ] Title zone consistent (y=80-200)
- [ ] No component overlaps
- [ ] Fonts match existing theme
- [ ] Colors match existing theme

### Variety Tests:
- [ ] Each slide type has distinct layout
- [ ] Not all slides look the same
- [ ] Creative freedom within consistency
- [ ] Asymmetric layouts where appropriate
- [ ] Grid layouts where appropriate

---

## 🎯 SUCCESS CRITERIA

**Existing theme system preserved:**
- ✅ Colors still from stylePreferences
- ✅ Fonts still from enhanced metadata
- ✅ Brand colors still preserved
- ✅ Huemint still used when needed

**New layout quality achieved:**
- ✅ Magazine-style editorial layouts
- ✅ Slide-type-specific patterns (team, market, data)
- ✅ Bold typography (200pt+ titles)
- ✅ Strategic shape usage (cards, dividers)
- ✅ Smart image placement (circles for headshots)
- ✅ Generous whitespace
- ✅ Visual variety between slides
- ✅ Consistency in anchors (slide numbers, logos)

**Result: Best of both worlds!**
