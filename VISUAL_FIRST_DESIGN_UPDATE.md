# Visual-First Design Update - Images Over Charts

## Problem
1. Too much text content (paragraphs, section headers)
2. Over-reliance on charts
3. Text overlapping issues
4. Not enough visual explanation via images

## Solution: Image-First Design Philosophy

### New Design Hierarchy

```
1. LARGE IMAGES (Primary - 60-70% of slides)
   Purpose: Visually EXPLAIN concepts
   Size: 800-1200px (50-60% of slide)
   
2. MINIMAL TEXT (Secondary - Support images)
   Purpose: Key points only
   Max: 3 bullets × 5 words each
   
3. CHARTS (Sparingly - 10-20% of slides)
   Purpose: Numerical comparisons ONLY
   Max: 1-2 charts per 10-slide deck
```

**Philosophy**: Visual explanation > Text explanation

---

## Updated Prompt: `html_inspired_system_prompt_dynamic.py`

### Key Changes:

#### 1. **Images First**
```
🖼️ IMAGES FIRST - Use LARGE images (800-1200px) on 60-70% of slides to EXPLAIN content visually!
```

**Old approach**: Charts and text-heavy slides  
**New approach**: Large images that show concepts, minimal supporting text

#### 2. **Chart Minimization**
```
📊 MINIMAL CHARTS - Charts ONLY for numerical comparisons. 
Prefer images/diagrams for concepts.
Max 1-2 charts per 10-slide deck.
```

**When to use charts**: Multiple numbers need comparison (revenue vs cost, market share by competitor)  
**When to use images**: Explaining concepts, showing processes, visual storytelling

#### 3. **Spacing Rules - Prevent Overlaps**
```
🚨 SPACING RULES - PREVENT OVERLAPS

EDGE MARGINS: 80px minimum from all edges

TEXT SPACING: 
  - Between bullets: 40px vertical gap
  - Text to image: 80px minimum gap
  - Title to content: 100px gap
  
SAFE ZONES:
  - Left column: x=120 to x=840 (720px wide)
  - Right column: x=1040 to x=1800 (760px wide)
  - Full width: x=120 to x=1680 (1680px wide)
  
NEVER OVERLAP:
  - Text on text
  - Image on text
  - Components too close (<60px)
```

#### 4. **Layout Patterns (No Overlaps)**

**SPLIT-SCREEN** (Primary Pattern - Use Most):
```
LEFT:  Image (x=80, y=200, width=880, height=680)
RIGHT: Text (x=1040, y=300, width=760, height=600)
Gap: 200px between left and right sections
```

**FULL-IMAGE BACKGROUND**:
```
Image: (x=0, y=0, width=1920, height=1080, opacity=0.4)
Text: (x=120, y=300, width=1680) with contrast
```

**TOP-IMAGE**:
```
Image: (x=80, y=0, width=1760, height=600)
Text: (x=120, y=650, width=1680, height=350)
```

#### 5. **Text Height Calculation**
```
📝 TEXT SIZING - Calculate height properly:
height = (number of lines) × (fontSize × lineHeight) + 20px
Example: 3 lines × (36pt × 1.5) + 20 = 182px
```

This prevents text from being too tall and overlapping other elements!

---

## Slide Design Examples

### Content Slide (PRIMARY PATTERN):

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Indie Game Renaissance        [LARGE IMAGE]   │
│                                 of indie game   │
│  • Unity 2005: free tools       development    │
│  • Steam: direct sales          showing Unity  │
│  • Kickstarter funding          and Steam      │
│                                 logos          │
│                                                │
└─────────────────────────────────────────────────┘
    LEFT TEXT (x=120)              RIGHT IMAGE (x=960)
    width=680                      width=880
```

**Components**:
1. Background (gradient)
2. Image (x=960, y=200, width=880, height=680, src="placeholder")
3. TiptapTextBlock title (x=120, y=180, width=680)
4. TiptapTextBlock bullet 1 (x=120, y=320)
5. TiptapTextBlock bullet 2 (x=120, y=370)
6. TiptapTextBlock bullet 3 (x=120, y=420)

**Result**: Image dominates, text supports. NO overlaps!

---

### Stat Slide (NO IMAGE):

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                                                 │
│               $12.5B                           │  ← Giant number
│           VR Market 2023                       │  ← Small context
│                                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Components**:
1. Background
2. TiptapTextBlock (huge number, 250pt, centered)
3. TiptapTextBlock (context, 40pt, centered below)

---

### Data Slide (RARE - Only when needed):

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  [CHART showing       Key Insights:            │
│   revenue trends]     • Growth accelerated     │
│                       • Q4 strongest           │
│                       • 2024 projected +40%    │
│                                                 │
└─────────────────────────────────────────────────┘
    LEFT CHART (x=80)              RIGHT TEXT (x=1040)
```

**Only use when**: Multiple numbers need visual comparison

---

## Component Priority Order

The model now uses components in this priority:

1. **IMAGE** (60-70% of slides)
   - Large, impactful
   - Explains concepts visually
   - Split-screen or background

2. **TIPTAPTEXTBLOCK** (Every slide - minimal)
   - Max 3 bullets, 5 words each
   - Supporting the image
   - Proper spacing

3. **CHART** (10-20% of slides only)
   - ONLY for numerical comparisons
   - Not for explaining concepts
   - Use images instead when possible

4. **CUSTOMCOMPONENT** (Occasional)
   - Animated counters for stats
   - Interactive visualizations
   - Special cases only

5. **SHAPE** (Minimal)
   - Only for stat callouts
   - Avoid decorative use

---

## Anti-Overlap System

### Text Height Calculation:
```
If you have 3 bullets at fontSize=36, lineHeight=1.5:
Height per bullet = 36 × 1.5 = 54px
Total for 3 bullets = 54 × 3 = 162px
Add buffer: 162 + 20 = 182px total height needed
```

### Position Calculation:
```
Title: y=180, height=80
Bullet 1: y=320 (180 + 80 + 60px gap)
Bullet 2: y=370 (320 + 50px gap)
Bullet 3: y=420 (370 + 50px gap)
```

### Split-Screen Safe Zones:
```
LEFT column:  x=120, width=680  (ends at 800)
GAP:          80px
RIGHT column: x=1040, width=760 (ends at 1800)
EDGE margin:  80px to slide edge
```

**Result**: NO overlaps guaranteed!

---

## Summary of All Changes

### File: `/apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py`

✅ **Images prioritized**: 60-70% of slides should have large images  
✅ **Charts minimized**: Only for numerical comparisons, max 1-2 per deck  
✅ **Spacing rules**: Clear safe zones, 80px margins, calculated text heights  
✅ **Split-screen layouts**: Precise positioning (LEFT: x=120-840, RIGHT: x=1040-1800)  
✅ **No overlap guarantee**: Minimum 60px between all components  
✅ **Text calculation**: Formula for proper text height based on fontSize × lineHeight  

### Combined with Previous Fixes:

From outline generation:
- ✅ Haiku 4.5 for presentation structure
- ✅ Max 3 bullets, 5 words each
- ✅ No paragraphs, no section headers
- ✅ Temperature 0.0 for strict following

From HTML generation (NEW):
- ✅ Large images explain concepts
- ✅ Minimal charts (prefer images)
- ✅ Proper spacing prevents overlaps
- ✅ Split-screen layouts with safe zones

---

## Expected Result

Your slides should now:
1. Have **LARGE images** showing concepts (800-1200px)
2. Have **3 minimal bullets** supporting the image (5 words each)
3. Have **NO overlapping** (proper spacing calculations)
4. Have **FEW charts** (only when comparing data)
5. Be **visually-driven** (images explain, text supports)

**Test again** - slides should be visual-first with no overlaps! 🎨

