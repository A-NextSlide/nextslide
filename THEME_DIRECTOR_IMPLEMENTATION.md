# Theme Director Implementation Plan
## The Design Architect System

---

## 🎯 VISION

**Theme Director = Master Architect who designs EVERY detail of EVERY slide**

Instead of:
- Theme: "Use blue and Arial"
- Slides: *improvises everything*

We want:
- Theme Director: "Slide 1: Title at x=960,y=400, 180pt centered. Gradient background. 3 stat cards at y=700..."
- Slide Generator: *executes the blueprint exactly*

---

## 📊 COMPLETE COMPONENT INVENTORY

### Available Components (What Theme Director Can Use):

```typescript
// === CORE LAYOUT ===
Background {
  backgroundType: "color" | "gradient" | "image"
  fill: { color: string }
  gradient: { angle: number, stops: [{color, position, opacity}] }
}

// === TEXT ===
TiptapTextBlock {
  position: {x, y}
  width, height
  texts: [{text: string, style: {textColor, bold, italic, underline}}]
  fontSize: number (pt)
  fontFamily: string
  alignment: "left" | "center" | "right"
  verticalAlignment: "top" | "middle" | "bottom"
  padding: 0
  letterSpacing, lineHeight, opacity, rotation, zIndex
}

// === VISUALS ===
Image {
  position: {x, y}
  width, height
  src: "placeholder" // System fills later
  objectFit: "cover" | "contain"
  borderRadius: string // "50%", "20px", "20px 80px 20px 80px"
  opacity, rotation, zIndex
}

Lines {
  startPoint: {x, y}
  endPoint: {x, y}
  stroke: {color, width, opacity}
}

Icon {
  position: {x, y}
  width: 24-40
  height: 24-40
  iconLibrary: "lucide"
  iconName: string // kebab-case: "dollar-sign", "trending-up"
  color: string
  opacity, rotation, zIndex
}

Shape {
  position: {x, y}
  width, height
  shapeType: "rectangle" | "roundedRectangle" | "circle"
  fill: {color, opacity}
  hasText: boolean
  texts: [{text, style}] // If hasText=true
  fontSize, textColor // If hasText=true
  borderRadius, opacity, rotation, zIndex
}

// === DATA VISUALIZATION ===
Chart {
  position: {x, y}
  width: ≤850
  height: ≤600
  chartType: "bar" | "line" | "pie" | "donut" | "area"
  data: [{label, value, color}]
  colors: string[]
  showLegend: false
  opacity, zIndex
}

Table {
  position: {x, y}
  width, height
  rows: [[{text, style}]]
  backgroundColor: null
  borderWidth: 0
  opacity, zIndex
}

// === CUSTOM (MOST POWERFUL) ===
CustomComponent {
  position: {x, y}
  width, height
  render: "function render({props, state, updateState, id, isThumbnail, containerWidth, containerHeight}){...}"
  [any custom props for the component]

  // Common patterns:
  // - Stat cards
  // - Multi-card grids
  // - Dashboards
  // - Timelines
  // - Progress indicators
  // - Interactive elements
  // - Any complex layout
}

// === SPECIAL (REACTBITS) ===
ReactBits {
  position: {x, y}
  width, height
  variant: "text-animation" | "background-animation" | "particle-system"
  props: {
    // For text-animation:
    text: string
    animation: "fade" | "slide" | "typewriter" | "wave"

    // For background-animation:
    pattern: "dots" | "grid" | "waves" | "particles"
    colors: string[]
    speed: number
  }
}
```

---

## 🏗️ THEME DIRECTOR ARCHITECTURE

### New System Structure:

```
DeckComposer.compose_deck()
    ↓
┌─────────────────────────────────────────────┐
│  PHASE 1: THEME DIRECTOR (NEW!)             │
│  File: theme_director_v2.py                 │
├─────────────────────────────────────────────┤
│  Input:                                     │
│    - DeckOutline (all slides)               │
│    - Available components (inventory above) │
│    - Available fonts                        │
│                                             │
│  AI Task:                                   │
│    1. Analyze deck content & vibe           │
│    2. Choose design philosophy              │
│    3. Select colors, fonts, patterns        │
│    4. FOR EACH SLIDE:                       │
│       - Determine slide type                │
│       - Choose layout pattern               │
│       - Plan EXACT component positions      │
│       - Specify sizes, fonts, colors        │
│       - Design slide number, logo, headers  │
│                                             │
│  Output: ThemeDocument {                    │
│    deck_theme: {                            │
│      design_philosophy,                     │
│      color_palette,                         │
│      typography,                            │
│      design_rules                           │
│    },                                       │
│    slide_blueprints: {                      │
│      "slide-0": {                           │
│        type: "title",                       │
│        design_intent: "...",                │
│        components: [                        │
│          {id, type, position, size, style}  │
│        ]                                    │
│      },                                     │
│      "slide-1": {...},                      │
│      ...                                    │
│    }                                        │
│  }                                          │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│  PHASE 2: SLIDE GENERATOR (UPDATED)        │
│  File: prompt_builder.py                   │
├─────────────────────────────────────────────┤
│  Input:                                     │
│    - Slide content                          │
│    - Blueprint from theme_director          │
│                                             │
│  Prompt Builder Adds:                       │
│    "MASTER BLUEPRINT (EXECUTE EXACTLY):"    │
│    Component 1: TiptapTextBlock             │
│      Position: x=960, y=400                 │
│      Size: 1600 x 200                       │
│      Style: fontSize=180, center, ...       │
│      Content: "{{slide.title}}"             │
│                                             │
│    Component 2: Shape (gradient bg)         │
│      Position: x=0, y=0                     │
│      Size: 1920 x 1080                      │
│      Style: gradient 135deg, ...            │
│                                             │
│  AI Task: Fill in content only!            │
└─────────────────────────────────────────────┘
```

---

## 🎨 THEME DIRECTOR PROMPT DESIGN

### Phase 1: Design Philosophy Generation

```python
THEME_DIRECTOR_PHASE_1_PROMPT = """
You are an ELITE PRESENTATION DESIGNER analyzing a deck to create a comprehensive design system.

DECK INFORMATION:
Title: {{deck.title}}
Slides: {{deck.slide_count}}
Content Preview:
{{deck.slides_preview}}

Style Preferences:
{{deck.stylePreferences}}

TASK 1: DESIGN PHILOSOPHY

Analyze the deck and create a design philosophy that will guide ALL design decisions.

Consider:
1. **Presentation Type**:
   - FUN/CREATIVE (kids, games, characters, entertainment)
     → Large fonts (120-200pt hero), chaotic layouts, 12-20 components, vibrant colors
   - STRUCTURED/FORMAL (business, corporate, data)
     → Controlled fonts (80-100pt hero), grid layouts, 6-10 components, professional colors
   - HYBRID (creative business, startups)
     → Balanced approach

2. **Visual Identity**:
   - Minimalist? Bold? Playful? Corporate? Modern? Classic?
   - Color mood: Vibrant? Muted? Monochrome? Brand-specific?
   - Typography: Geometric? Serif? Playful? Technical?

3. **Layout Patterns**:
   - Grid-based or free-form?
   - Symmetric or asymmetric?
   - Generous whitespace or dense?

4. **Component Strategy**:
   - Heavy CustomComponent usage or simple primitives?
   - Icon usage philosophy (0-2 max recommended)
   - Image prominence (40-60% structured, 70-90% creative)

Return:
{
  "presentation_type": "FUN|STRUCTURED|HYBRID",
  "design_philosophy": "2-3 sentence description of the design approach",
  "design_rules": {
    "layout_pattern": "grid|free-form|asymmetric",
    "component_count_range": "6-10|12-20",
    "spacing": {
      "component_gap": 60,
      "section_gap": 100,
      "title_margin_bottom": 80,
      "edge_padding": 80
    },
    "typography_scale": {
      "hero": 180,      // Main titles
      "title": 96,      // Section titles
      "body": 36,       // Body text
      "caption": 24     // Small text
    },
    "visual_style": {
      "corner_radius": 16,
      "shadow_usage": "generous|minimal|none",
      "gradient_usage": "heavy|moderate|minimal",
      "image_prominence": 60,
      "icon_max_per_slide": 2
    },
    "consistency_rules": {
      "slide_number_position": {"x": 80, "y": 1020},
      "logo_position": {"x": 80, "y": 1028},
      "header_zone": {"y": 80, "height": 120},
      "footer_zone": {"y": 960, "height": 60}
    }
  },
  "color_palette": {
    "primary_background": "#FFFFFF",
    "secondary_background": "#F7F9FC",
    "primary_text": "#1A202C",
    "secondary_text": "#4A5568",
    "accent_1": "#3B82F6",
    "accent_2": "#10B981",
    "accent_3": "#F59E0B",
    "gradient_primary": "linear-gradient(135deg, #3B82F6 0%, #10B981 100%)"
  },
  "typography": {
    "hero_font": "{{selected_font_1}}",
    "body_font": "{{selected_font_2}}",
    "mono_font": "JetBrains Mono" // For code/data
  }
}
"""
```

### Phase 2: Per-Slide Blueprint Generation

```python
THEME_DIRECTOR_PHASE_2_PROMPT = """
You are designing the EXACT layout for each slide in the presentation.

DESIGN SYSTEM (from Phase 1):
{{design_philosophy}}
{{design_rules}}
{{color_palette}}
{{typography}}

AVAILABLE COMPONENTS:
{{component_inventory}}

SLIDE TO DESIGN:
Slide {{slide_index}} of {{total_slides}}
Type: {{slide_type}} (title|content|data|conclusion)
Title: "{{slide.title}}"
Content: "{{slide.content}}"
Has Data: {{slide.has_data}}
Has Images: {{slide.needs_images}}

CANVAS: 1920×1080px

YOUR TASK: Design the EXACT component layout for this slide.

REQUIREMENTS:
1. **Consistent Elements (Every Slide)**:
   - Slide number: Bottom-left (x=80, y=1020), 20pt, opacity 0.6
   - Logo (if brand): Bottom-left (x=80, y=1028), 80×24px, objectFit="contain"
   - Background: Full canvas (1920×1080), matches design system

2. **Layout Planning**:
   - Choose pattern: title-centered|split-screen|grid|single-column|data-focus
   - Calculate positions precisely (no overlaps!)
   - Respect safe zones: x: 80-1840, y: 80-1000
   - Use design_rules.spacing for gaps

3. **Component Selection**:
   - Title slide? → Large centered title (hero_font, 180-240pt)
   - Content slide? → Split-screen or single-column
   - Data slide? → Chart + insights OR CustomComponent dashboard
   - Stats? → ALWAYS use CustomComponent (not standalone numbers)

4. **Typography Application**:
   - Hero titles: {{typography.hero_font}}, {{design_rules.typography_scale.hero}}pt
   - Section titles: {{typography.hero_font}}, {{design_rules.typography_scale.title}}pt
   - Body text: {{typography.body_font}}, {{design_rules.typography_scale.body}}pt
   - Captions: {{typography.body_font}}, {{design_rules.typography_scale.caption}}pt

5. **Color Usage**:
   - Background: {{color_palette.primary_background}}
   - Primary text: {{color_palette.primary_text}}
   - Accents: Use accent_1, accent_2, accent_3 for emphasis
   - Gradients: Use {{color_palette.gradient_primary}} for backgrounds

6. **Decorative Elements**:
   - Headers: Subtle lines or shapes to frame sections
   - Section dividers: Thin lines (2px, opacity 0.3) between content blocks
   - Backgrounds: Gradient overlays, mesh patterns (if design_style allows)

RETURN FORMAT:
{
  "slide_id": "{{slide.id}}",
  "slide_type": "title|content|data|conclusion",
  "design_intent": "Brief description of the layout strategy",
  "layout_pattern": "title-centered|split-screen|etc",

  "components": [
    {
      "id": "background",
      "type": "Background",
      "props": {
        "backgroundType": "gradient",
        "gradient": {
          "angle": 135,
          "stops": [
            {"color": "#3B82F6", "position": 0, "opacity": 0.05},
            {"color": "#10B981", "position": 100, "opacity": 0.05}
          ]
        }
      },
      "z_index": -1,
      "priority": "required",
      "reasoning": "Subtle gradient background for visual interest"
    },
    {
      "id": "slide_title",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 960, "y": 400},
        "width": 1600,
        "height": 200,
        "texts": [{"text": "{{slide.title}}", "style": {"textColor": "#1A202C"}}],
        "fontSize": 180,
        "fontFamily": "{{typography.hero_font}}",
        "alignment": "center",
        "verticalAlignment": "middle"
      },
      "priority": "required",
      "content_source": "slide.title",
      "reasoning": "Main title, centered and prominent"
    },
    {
      "id": "header_line",
      "type": "Lines",
      "props": {
        "startPoint": {"x": 80, "y": 700},
        "endPoint": {"x": 400, "y": 700},
        "stroke": {"color": "#3B82F6", "width": 4, "opacity": 0.6}
      },
      "priority": "decorative",
      "reasoning": "Accent line under title for visual hierarchy"
    },
    {
      "id": "subtitle",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 960, "y": 640},
        "width": 1200,
        "height": 60,
        "texts": [{"text": "{{slide.content}}", "style": {"textColor": "#4A5568"}}],
        "fontSize": 36,
        "fontFamily": "{{typography.body_font}}",
        "alignment": "center",
        "verticalAlignment": "top"
      },
      "priority": "optional",
      "content_source": "slide.content",
      "content_transform": "first_sentence",
      "reasoning": "Subtitle extracted from content"
    },
    {
      "id": "slide_number",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 80, "y": 1020},
        "width": 60,
        "height": 24,
        "texts": [{"text": "{{slide_index + 1:02d}}", "style": {"textColor": "#1A202C"}}],
        "fontSize": 20,
        "fontFamily": "{{typography.body_font}}",
        "alignment": "left",
        "verticalAlignment": "middle",
        "opacity": 0.6
      },
      "priority": "required",
      "content_source": "slide_index",
      "reasoning": "Consistent slide numbering"
    },
    {
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
      "priority": "optional",
      "reasoning": "Brand logo placement"
    }
  ],

  "layout_rules": {
    "alignment": "center",
    "spacing": 60,
    "allow_overlap": false,
    "z_index_order": ["background", "decorative_shapes", "content", "foreground"]
  }
}

EXAMPLES:

TITLE SLIDE:
- Large centered title (180-240pt)
- Optional subtitle
- Gradient or solid background
- Minimal decoration
- Components: 3-6

CONTENT SLIDE (Split-screen):
- Title at top (96pt, left-aligned)
- Text on left half (x: 80-880)
- Image on right half (x: 960-1840)
- Section divider line
- Components: 6-10

DATA SLIDE:
- Title at top
- CustomComponent dashboard (3 stat cards in grid)
- OR Chart + insight text
- Components: 5-8

Generate blueprint now for Slide {{slide_index}}.
"""
```

---

## 📝 IMPLEMENTATION STEPS

### Step 1: Create ThemeDirectorV2 (New File)

**File:** `apps/backend/agents/generation/theme_director_v2.py`

```python
"""
Theme Director V2 - Complete Design Architect
Designs every aspect of every slide before generation.
"""

from typing import Dict, Any, List, Optional
from agents.domain.models import DeckOutline, ThemeDocument
from agents.ai.clients import get_client, invoke
from agents.config import THEME_STYLE_MODEL
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class ThemeDirectorV2:
    """
    Master architect that designs complete layouts for all slides.
    """

    def __init__(self, available_fonts: List[str], component_schemas: str):
        self.available_fonts = available_fonts
        self.component_schemas = component_schemas

    async def design_deck(
        self,
        deck_outline: DeckOutline
    ) -> ThemeDocument:
        """
        Complete deck design in 2 phases:
        1. Design philosophy + design system
        2. Per-slide component blueprints
        """

        logger.info(f"🎨 Theme Director V2: Designing deck '{deck_outline.title}'")

        # Phase 1: Design Philosophy
        design_system = await self._generate_design_philosophy(deck_outline)

        # Phase 2: Slide Blueprints
        slide_blueprints = {}
        for i, slide in enumerate(deck_outline.slides):
            blueprint = await self._generate_slide_blueprint(
                slide=slide,
                slide_index=i,
                total_slides=len(deck_outline.slides),
                design_system=design_system
            )
            slide_blueprints[slide.id or str(i)] = blueprint

        # Assemble ThemeDocument
        theme_doc = ThemeDocument(
            deck_theme=design_system,
            slide_themes=slide_blueprints,
            search_terms=design_system.get('image_search_terms', []),
            agent_trace=[]
        )

        logger.info(f"✅ Theme Director V2: Designed {len(slide_blueprints)} slides")

        return theme_doc

    async def _generate_design_philosophy(
        self,
        deck_outline: DeckOutline
    ) -> Dict[str, Any]:
        """Phase 1: Generate overarching design system"""

        # Build phase 1 prompt
        prompt = self._build_phase1_prompt(deck_outline)

        # Get AI response
        client, model = get_client(THEME_STYLE_MODEL)
        response = await invoke(
            client=client,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4000,
            response_model=None,
            temperature=0.7
        )

        # Parse JSON
        import json
        design_system = json.loads(response)

        return design_system

    async def _generate_slide_blueprint(
        self,
        slide: Any,
        slide_index: int,
        total_slides: int,
        design_system: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Phase 2: Generate exact layout for one slide"""

        # Build phase 2 prompt
        prompt = self._build_phase2_prompt(
            slide, slide_index, total_slides, design_system
        )

        # Get AI response
        client, model = get_client(THEME_STYLE_MODEL)
        response = await invoke(
            client=client,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=3000,
            response_model=None,
            temperature=0.6
        )

        # Parse JSON
        import json
        blueprint = json.loads(response)

        return blueprint

    def _build_phase1_prompt(self, deck_outline: DeckOutline) -> str:
        """Build design philosophy prompt"""
        # Use THEME_DIRECTOR_PHASE_1_PROMPT template above
        pass

    def _build_phase2_prompt(self, slide, index, total, system) -> str:
        """Build slide blueprint prompt"""
        # Use THEME_DIRECTOR_PHASE_2_PROMPT template above
        pass
```

### Step 2: Update DeckComposer to Use ThemeDirectorV2

**File:** `apps/backend/agents/generation/adapters.py`

**Changes in `SimpleDeckComposer.compose_deck()`:**

```python
# OLD (line ~600):
if theme is None:
    theme_result = await theme_manager.generate_theme(deck_outline)
    theme = theme_result['theme']
    search_terms = theme_result['search_terms']

# NEW:
if theme is None:
    # Use Theme Director V2 for complete design
    from agents.generation.theme_director_v2 import ThemeDirectorV2
    from agents.prompts.generation.optimized_component_schemas import get_optimized_component_schemas

    theme_director = ThemeDirectorV2(
        available_fonts=self.available_fonts,
        component_schemas=get_optimized_component_schemas()
    )

    theme_document = await theme_director.design_deck(deck_outline)

    # Extract theme and blueprints
    theme = ThemeSpec.from_dict(theme_document.deck_theme)
    slide_blueprints = theme_document.slide_themes
    search_terms = theme_document.search_terms
```

### Step 3: Update SlidePromptBuilder to Inject Blueprints

**File:** `apps/backend/agents/generation/components/prompt_builder.py`

**Update `_add_theme_structural_guidance()` method:**

```python
def _add_theme_structural_guidance(self, sections, context):
    """Add EXACT blueprint from Theme Director"""

    # Get blueprint for this specific slide
    blueprint = self._get_slide_blueprint_from_theme(context)

    if not blueprint:
        logger.warning(f"No blueprint found for slide {context.slide_index}")
        return

    sections.append("\n🎯 MASTER BLUEPRINT FROM THEME DIRECTOR:")
    sections.append(f"Design Intent: {blueprint.get('design_intent', 'N/A')}")
    sections.append(f"Layout Pattern: {blueprint.get('layout_pattern', 'N/A')}")
    sections.append("\n📐 EXACT COMPONENTS TO GENERATE:")

    for i, component in enumerate(blueprint.get('components', [])):
        comp_id = component.get('id', f'component_{i}')
        comp_type = component.get('type')
        props = component.get('props', {})
        priority = component.get('priority', 'required')
        content_source = component.get('content_source', None)
        reasoning = component.get('reasoning', '')

        sections.append(f"\n{i+1}. Component ID: {comp_id}")
        sections.append(f"   Type: {comp_type}")
        sections.append(f"   Priority: {priority}")

        if content_source:
            sections.append(f"   Content Source: {content_source}")
            if '{{' in str(props):
                sections.append(f"   ⚠️ Use actual content from {content_source}")

        # Format props for AI
        import json
        sections.append(f"   Props: {json.dumps(props, indent=4)}")

        if reasoning:
            sections.append(f"   Reasoning: {reasoning}")

    sections.append("\n⚡ EXECUTION INSTRUCTIONS:")
    sections.append("1. Generate ALL components listed above")
    sections.append("2. Use EXACT positions and sizes specified")
    sections.append("3. Replace {{placeholders}} with actual slide content")
    sections.append("4. Maintain the z-index order for proper layering")
    sections.append("5. Do NOT add extra components unless absolutely necessary")
    sections.append("6. Do NOT modify positions - they are pre-calculated")

def _get_slide_blueprint_from_theme(self, context) -> Optional[Dict]:
    """Extract blueprint for current slide from theme"""
    try:
        theme = context.theme

        # Get slide_themes dict
        if hasattr(theme, 'slide_themes'):
            slide_themes = theme.slide_themes
        elif isinstance(theme, dict):
            slide_themes = theme.get('slide_themes', {})
        else:
            return None

        # Find blueprint for this slide
        slide_id = getattr(context.slide_outline, 'id', str(context.slide_index))

        if slide_id in slide_themes:
            return slide_themes[slide_id]

        # Fallback to index-based lookup
        if str(context.slide_index) in slide_themes:
            return slide_themes[str(context.slide_index)]

        return None

    except Exception as e:
        logger.error(f"Error getting blueprint: {e}")
        return None
```

---

## 🎨 EXAMPLE: Complete Slide Design

### Input (Deck Outline):
```json
{
  "title": "Q4 Revenue Report",
  "slides": [
    {"id": "slide-0", "title": "Q4 Revenue Report", "content": "Financial Performance Overview", "type": "title"},
    {"id": "slide-1", "title": "Revenue Growth", "content": "Q1: $2.5M, Q2: $3.1M, Q3: $3.8M, Q4: $4.2M", "type": "data"},
    {"id": "slide-2", "title": "Key Achievements", "content": "- 40% YoY growth\n- Expanded to 3 new markets\n- Customer satisfaction: 92%", "type": "content"}
  ],
  "stylePreferences": {
    "vibeContext": "professional",
    "colors": {
      "background": "#FFFFFF",
      "accent1": "#2563EB",
      "accent2": "#10B981",
      "text": "#1F2937"
    }
  }
}
```

### Output (Theme Director Phase 1):
```json
{
  "presentation_type": "STRUCTURED",
  "design_philosophy": "Clean, professional corporate design with emphasis on data visualization. Uses generous whitespace and grid-based layouts for clarity. Minimal decoration with strategic accent color usage.",

  "design_rules": {
    "layout_pattern": "grid",
    "component_count_range": "6-10",
    "spacing": {
      "component_gap": 60,
      "section_gap": 100,
      "title_margin_bottom": 80,
      "edge_padding": 80
    },
    "typography_scale": {
      "hero": 120,
      "title": 96,
      "body": 36,
      "caption": 24
    },
    "visual_style": {
      "corner_radius": 12,
      "shadow_usage": "minimal",
      "gradient_usage": "minimal",
      "image_prominence": 50,
      "icon_max_per_slide": 2
    },
    "consistency_rules": {
      "slide_number_position": {"x": 80, "y": 1020},
      "logo_position": {"x": 80, "y": 1028},
      "header_zone": {"y": 80, "height": 120},
      "footer_zone": {"y": 960, "height": 60}
    }
  },

  "color_palette": {
    "primary_background": "#FFFFFF",
    "secondary_background": "#F8FAFC",
    "primary_text": "#1F2937",
    "secondary_text": "#6B7280",
    "accent_1": "#2563EB",
    "accent_2": "#10B981",
    "accent_3": "#F59E0B",
    "gradient_primary": "linear-gradient(135deg, #2563EB 0%, #10B981 100%)"
  },

  "typography": {
    "hero_font": "Montserrat",
    "body_font": "Inter",
    "mono_font": "JetBrains Mono"
  }
}
```

### Output (Theme Director Phase 2 - Slide 0):
```json
{
  "slide_id": "slide-0",
  "slide_type": "title",
  "design_intent": "Clean title slide with centered hero text and subtle gradient background accent",
  "layout_pattern": "title-centered",

  "components": [
    {
      "id": "background",
      "type": "Background",
      "props": {
        "backgroundType": "gradient",
        "gradient": {
          "angle": 135,
          "stops": [
            {"color": "#2563EB", "position": 0, "opacity": 0.03},
            {"color": "#10B981", "position": 100, "opacity": 0.03}
          ]
        }
      },
      "z_index": -1,
      "priority": "required",
      "reasoning": "Subtle gradient for visual interest without overwhelming"
    },
    {
      "id": "main_title",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 960, "y": 400},
        "width": 1400,
        "height": 140,
        "texts": [{"text": "{{slide.title}}", "style": {"textColor": "#1F2937", "bold": true}}],
        "fontSize": 120,
        "fontFamily": "Montserrat",
        "fontWeight": 700,
        "alignment": "center",
        "verticalAlignment": "middle"
      },
      "priority": "required",
      "content_source": "slide.title",
      "reasoning": "Main title, large and prominent"
    },
    {
      "id": "accent_line",
      "type": "Lines",
      "props": {
        "startPoint": {"x": 760, "y": 570},
        "endPoint": {"x": 1160, "y": 570},
        "stroke": {"color": "#2563EB", "width": 4, "opacity": 0.8}
      },
      "priority": "decorative",
      "reasoning": "Visual separator below title"
    },
    {
      "id": "subtitle",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 960, "y": 610},
        "width": 1000,
        "height": 50,
        "texts": [{"text": "{{slide.content}}", "style": {"textColor": "#6B7280"}}],
        "fontSize": 36,
        "fontFamily": "Inter",
        "alignment": "center",
        "verticalAlignment": "top"
      },
      "priority": "optional",
      "content_source": "slide.content",
      "reasoning": "Subtitle from slide content"
    },
    {
      "id": "slide_number",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 80, "y": 1020},
        "width": 60,
        "height": 24,
        "texts": [{"text": "01", "style": {"textColor": "#1F2937"}}],
        "fontSize": 20,
        "fontFamily": "Inter",
        "alignment": "left",
        "verticalAlignment": "middle",
        "opacity": 0.6
      },
      "priority": "required",
      "content_source": "slide_index",
      "reasoning": "Consistent slide numbering"
    }
  ],

  "layout_rules": {
    "alignment": "center",
    "spacing": 60,
    "allow_overlap": false
  }
}
```

### Output (Theme Director Phase 2 - Slide 1):
```json
{
  "slide_id": "slide-1",
  "slide_type": "data",
  "design_intent": "Data dashboard with 4 revenue stat cards in horizontal grid",
  "layout_pattern": "grid",

  "components": [
    {
      "id": "background",
      "type": "Background",
      "props": {
        "backgroundType": "color",
        "fill": {"color": "#FFFFFF"}
      },
      "z_index": -1,
      "priority": "required"
    },
    {
      "id": "section_title",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 80, "y": 120},
        "width": 800,
        "height": 112,
        "texts": [{"text": "{{slide.title}}", "style": {"textColor": "#1F2937", "bold": true}}],
        "fontSize": 96,
        "fontFamily": "Montserrat",
        "alignment": "left",
        "verticalAlignment": "middle"
      },
      "priority": "required",
      "content_source": "slide.title"
    },
    {
      "id": "title_divider",
      "type": "Lines",
      "props": {
        "startPoint": {"x": 80, "y": 252},
        "endPoint": {"x": 480, "y": 252},
        "stroke": {"color": "#2563EB", "width": 3, "opacity": 0.5}
      },
      "priority": "decorative"
    },
    {
      "id": "revenue_dashboard",
      "type": "CustomComponent",
      "props": {
        "position": {"x": 80, "y": 320},
        "width": 1760,
        "height": 600,
        "items": [
          {"label": "Q1", "value": "$2.5M"},
          {"label": "Q2", "value": "$3.1M"},
          {"label": "Q3", "value": "$3.8M"},
          {"label": "Q4", "value": "$4.2M"}
        ],
        "primaryColor": "#2563EB",
        "secondaryColor": "#10B981",
        "render": "function render({props}){var items=props.items||[];var pc=props.primaryColor||'#2563EB';var sc=props.secondaryColor||'#10B981';var tc=getContrastTextColor(pc);return React.createElement('div',{style:{display:'flex',gap:'40px',width:'100%',height:'100%'}},items.map(function(item,i){var bgColor=i===items.length-1?sc:pc;var textColor=getContrastTextColor(bgColor);return React.createElement('div',{key:i,style:{flex:1,background:bgColor,padding:'60px',borderRadius:'12px',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}},[React.createElement('div',{style:{fontSize:'24px',fontWeight:'500',color:textColor,opacity:0.8,marginBottom:'16px'}},item.label),React.createElement('div',{style:{fontSize:'72px',fontWeight:'900',color:textColor}},item.value)]);}));}"
      },
      "priority": "required",
      "content_source": "slide.content",
      "content_transform": "extract_quarterly_revenue",
      "reasoning": "Main data visualization as stat cards"
    },
    {
      "id": "slide_number",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 80, "y": 1020},
        "width": 60,
        "height": 24,
        "texts": [{"text": "02", "style": {"textColor": "#1F2937"}}],
        "fontSize": 20,
        "fontFamily": "Inter",
        "alignment": "left",
        "verticalAlignment": "middle",
        "opacity": 0.6
      },
      "priority": "required",
      "content_source": "slide_index"
    }
  ],

  "layout_rules": {
    "alignment": "left",
    "spacing": 60,
    "allow_overlap": false
  }
}
```

---

## ✅ BENEFITS

### For Consistency:
- ✅ Slide numbers always in same position
- ✅ Logos always in same position
- ✅ Headers always same height
- ✅ Spacing always consistent
- ✅ Typography always follows scale

### For Quality:
- ✅ No overlapping components (pre-calculated)
- ✅ Professional layouts every time
- ✅ Proper visual hierarchy
- ✅ Balanced compositions
- ✅ Strategic component usage

### For Uniqueness:
- ✅ Each deck gets custom design philosophy
- ✅ Layout patterns match content type
- ✅ Creative freedom within constraints
- ✅ AI designs, doesn't template

### For Efficiency:
- ✅ Slide generator only fills content
- ✅ No layout decisions during generation
- ✅ Faster generation (simpler task)
- ✅ More predictable output

---

## 🚀 ROLLOUT PLAN

### Phase 1: Core Implementation (Week 1)
- [x] Create `theme_director_v2.py`
- [ ] Implement Phase 1 prompt (design philosophy)
- [ ] Implement Phase 2 prompt (slide blueprints)
- [ ] Update `DeckComposer` to use ThemeDirectorV2
- [ ] Update `SlidePromptBuilder` to inject blueprints

### Phase 2: Testing & Refinement (Week 2)
- [ ] Generate 10 test decks across different types
- [ ] Validate component positions (no overlaps)
- [ ] Refine prompt templates based on results
- [ ] Add error handling for malformed blueprints

### Phase 3: Advanced Features (Week 3)
- [ ] Add slide-type detection logic
- [ ] Implement content transformers (extract_stats, etc.)
- [ ] Add blueprint validation before generation
- [ ] Create blueprint visualization tool

### Phase 4: Production (Week 4)
- [ ] A/B test against current system
- [ ] Monitor generation quality
- [ ] Collect user feedback
- [ ] Full rollout

---

## 🎯 SUCCESS METRICS

- **Consistency**: 100% of slides have slide numbers/logos in same position
- **Quality**: 95%+ of slides have no overlapping components
- **Speed**: <10s per slide blueprint generation
- **User Satisfaction**: Higher rating than current system
- **Uniqueness**: Each deck visually distinct but internally consistent

---

## 🔧 CONFIGURATION

Enable/disable via environment variable:
```bash
USE_THEME_DIRECTOR_V2=true  # New system
USE_THEME_DIRECTOR_V2=false # Old system (fallback)
```

Progressive rollout:
```python
# Roll out to 10% of users first
if random.random() < 0.1 or USE_THEME_DIRECTOR_V2:
    use_theme_director_v2()
else:
    use_old_theme_system()
```

---

**THIS IS THE FUTURE OF NEXTSLIDE THEMING** 🚀
