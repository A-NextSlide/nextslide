# Flexible Presentation System - Final Implementation

## Overview

The system is now **context-aware and flexible** while maintaining a minimal, visual-first presentation style.

## Core Philosophy

**Visual-first, speakable content that adapts to the presentation context**

---

## Content Adaptation System

### NEW: Context-Aware Content Length

The system now **automatically adapts** based on presentation type:

#### Business/Investor Content
```
Bullets: 3-5 per slide
Length: 8-12 words per bullet
Total: ~60 words per slide
Style: Data-rich, speakable facts
```

**Example**:
```
Q3 Financial Performance

• Revenue **$2.5B**, up **42%** YoY (7 words)
• Operating margin improved to **18.5%** from **14.2%** (8 words)
• Enterprise customers grew **65%**, now **1,200+** accounts (8 words)
• Raised **$150M** Series C at **$2B** valuation (9 words)
• Expanding to **APAC markets** in Q4 2024 (8 words)
[IMAGE: revenue growth chart visualization]
```

**Total**: 5 bullets, 40 words - Speakable, data-rich, professional ✅

#### Simple/Casual Content
```
Bullets: 2-3 per slide
Length: 5-7 words per bullet
Total: ~30 words per slide
Style: Minimal, impactful
```

**Example**:
```
Indie Game Renaissance

• Unity 2005: **free** dev tools (5 words)
• Steam enabled **direct** distribution (4 words)
• Kickstarter: **$311M** indie funding (4 words)
[IMAGE: indie game development timeline]
```

**Total**: 3 bullets, 13 words - Minimal, visual ✅

---

## Image System - ALL Properties Available

### Complete Image Props (Now Used Intelligently):

```javascript
{
  "type": "Image",
  "props": {
    // REQUIRED
    "src": "placeholder",  // Always placeholder
    "position": {"x": 960, "y": 200},
    "width": 880,
    "height": 680,
    "objectFit": "cover",  // or "contain", "fill"
    
    // STYLING (use for modern look)
    "borderRadius": 20,     // Rounded corners: 16-24
    "borderWidth": 0,       // Optional border: 2-4
    "borderColor": "{{accent}}",  // If using border
    "opacity": 1.0,         // Or 0.3-0.5 for backgrounds
    "shadow": true,         // Adds depth
    "shadowBlur": 50,       // Shadow blur: 40-60
    "rotation": 0,          // Rotation in degrees
    "zIndex": 5,           // Layering
    
    // FILTERS (enhance images)
    "brightness": 100,      // 90-110 for subtle adjustment
    "contrast": 110,        // 100-120 for punch
    "saturation": 100,      // 90-110 for color tuning
    "blur": 0,             // 0 normally, 2-5 for backgrounds
    "grayscale": 0,        // 0-100 for noir effects
    "sepia": 0,            // 0-100 for vintage
    
    // OVERLAY (create mood/brand alignment)
    "overlayColor": "{{primary}}30",  // Color with 30% opacity
    "overlayOpacity": 0.3,              // Or direct opacity
    "overlayBlendMode": "multiply",     // "multiply", "overlay", "soft-light"
    "overlayPattern": "none",           // "dots", "lines", "grid", "noise"
    
    // EFFECTS (animation and masks)
    "kenBurns": {
      "enabled": true,
      "zoom": 1.1,          // 1.05-1.15 for subtle
      "duration": 8
    },
    "mask": "none",         // "circle", "hexagon", "rounded"
    
    // CROP (if needed)
    "cropRect": {
      "left": 0, "top": 0, "right": 0, "bottom": 0
    }
  }
}
```

### Image Usage Guidelines

**60-70% of slides should have large images**

**When to use images**:
- ✅ Explaining concepts (diagrams, workflows, examples)
- ✅ Product showcases (screenshots, mockups)
- ✅ Visual storytelling (photos, illustrations)
- ✅ Supporting data (infographics, visualizations)

**How to use image props**:
- **borderRadius**: 16-24 for modern, rounded look
- **shadow + shadowBlur**: 40-60 for depth and elevation
- **overlayColor**: Add brand tint ("{{primary}}20" for subtle)
- **overlayBlendMode**: "multiply" for darkening, "overlay" for contrast
- **kenBurns**: Subtle zoom animation for engagement
- **filters**: Adjust brightness/contrast to match slide mood

**Example - Styled Image**:
```javascript
{
  "position": {"x": 960, "y": 200},
  "width": 880,
  "height": 680,
  "src": "placeholder",
  "borderRadius": 20,
  "shadow": true,
  "shadowBlur": 50,
  "overlayColor": "{{primary}}20",  // Subtle brand tint
  "overlayBlendMode": "multiply",
  "kenBurns": {"enabled": true, "zoom": 1.1}
}
```

This creates a modern, branded, animated image!

---

## Layout System - Prevent Overlaps

### Split-Screen Layout (PRIMARY - Use Most)

```
┌──────────────────────────────────────────┐
│                                          │
│  Title (y=180)                           │
│                                          │
│  • Bullet 1 (y=320)     [LARGE IMAGE]    │
│  • Bullet 2 (y=380)      styled with    │
│  • Bullet 3 (y=440)      overlays &     │
│  • Bullet 4 (y=500)      effects        │
│                                          │
└──────────────────────────────────────────┘
  LEFT TEXT                 RIGHT IMAGE
  x: 120-840               x: 1040-1800
  width: 680               width: 880
           120px gap
```

**Spacing Calculations**:
```
Title: y=180, height=80
First bullet: y=320 (180 + 80 + 60px gap)
Second bullet: y=380 (320 + 60px gap)
Third bullet: y=440 (380 + 60px gap)
Fourth bullet: y=500 (440 + 60px gap)

Text ends at: y=560 (500 + 60px)
Image: y=200 to y=880 (680px height)
No overlap! ✅
```

---

## Flexible Content Guidelines

### The "Speakability Test"

**Question**: Can you SPEAK this while presenting without reading verbatim?

**✅ Passes Test** (Speakable):
```
• Q3 revenue **$2.5B**, up **42%** YoY
• Enterprise customers: **1,200** accounts, **65%** growth
• Expanding to APAC markets in Q4 2024
```

**❌ Fails Test** (Reading material):
```
• Our company has experienced significant revenue growth over the past quarter, with total revenue reaching $2.5 billion which represents a 42% increase year-over-year...
```

### Context Detection

The system adapts automatically:

**Detected as Business/Investor** (allows more content):
- Keywords: "revenue", "investor", "market", "growth", "analysis"
- Bullets: 3-5 bullets
- Words: 8-12 per bullet
- Total: ~60 words/slide

**Detected as Simple/Casual** (enforces minimal):
- Keywords: "fun", "intro", "overview", "basics"
- Bullets: 2-3 bullets  
- Words: 5-7 per bullet
- Total: ~30 words/slide

**Always Enforced**:
- ❌ NO paragraphs
- ❌ NO section headers (##)
- ❌ NO long explanations
- ✅ ONLY speakable bullets
- ✅ **Bold** on numbers and key data

---

## Chart Usage - Minimal and Strategic

### OLD (Over-reliant on charts):
- Charts forced on many slides
- Data that could be shown with images/diagrams used charts

### NEW (Strategic charts):
```
CHARTS: OPTIONAL. Only if data clearly benefits from visualization.
ONE number → STAT slide (not chart)
5+ numbers → maybe chart
Types: column,bar,line,area,pie,waterfall,radar,scatter,treemap,sankey,gauge
Don't force charts.
```

**When to use charts**:
- ✅ Comparing multiple numbers (revenue across quarters)
- ✅ Showing trends (user growth over time)
- ✅ Parts-of-whole (market share distribution)

**When to use images instead**:
- ✅ Explaining concepts (use diagram image)
- ✅ Showing processes (use flowchart image)
- ✅ Illustrating ideas (use illustration)

**Max charts per deck**: 1-2 in a 10-slide deck

---

## Design Quality - No Overlaps

### Spacing Enforcement

**Edge Margins**: 80px from all slide edges
**Component Gap**: 60-80px between elements
**Text-Image Gap**: 120px horizontal gap in split-screens

### Text Height Calculation

```
Formula: height = (bullets × fontSize × lineHeight) + buffer

Example:
- 4 bullets
- fontSize: 36pt
- lineHeight: 1.5
- Buffer: 40px

height = 4 × (36 × 1.5) + 40
height = 4 × 54 + 40
height = 216 + 40 = 256px
```

This ensures text fits properly without overflowing!

---

## Summary of Changes

### Outline Generation (Flexible Content):
1. ✅ **Adaptive word limits**: Business (8-12 words) vs Simple (5-7 words)
2. ✅ **Flexible bullet count**: Business (3-5) vs Simple (2-3)
3. ✅ **Speakability test**: "Can you speak this?" determines if content is good
4. ✅ **No rigid limits**: System adapts to presentation type
5. ✅ **Post-processing**: Caps at 5 bullets, 12 words/bullet, 80 words/slide max

### HTML Generation (Visual-First):
1. ✅ **Images prioritized**: 60-70% of slides with large images (800-1200px)
2. ✅ **All Image props**: borderRadius, shadow, overlay, filters, kenBurns, masks
3. ✅ **Overlap prevention**: Precise positioning with safe zones
4. ✅ **Chart minimization**: Only for numerical comparisons, prefer images
5. ✅ **Proper spacing**: 80px margins, calculated text heights

---

## Files Modified

1. `/apps/backend/services/outline/generator.py`
   - Flexible content limits (business vs simple)
   - Speakability-focused prompts
   - Updated streaming prompts
   - max_tokens: 600 (allows business content)

2. `/apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py`
   - Image-first design hierarchy
   - All Image props documented
   - Overlap prevention rules
   - Chart minimization

---

## Expected Output

### For Business/Investor Deck:
```
Market Opportunity

• TAM: **$150B** by 2025, **42% CAGR** (8 words)
• Served market: **$45B**, growing **25%** annually (7 words)
• Current penetration: **2.3%**, significant upside (5 words)
• **3 major competitors**, fragmented market (5 words)
• Our differentiation: **AI-powered**, **60% faster** (6 words)
[Large image with market visualization, brand overlay]
```

**5 bullets, 31 words** - Speakable, data-rich, professional ✅

### For Casual/Simple Topic:
```
Video Game Evolution

• Arcade era: **1980s** golden age (5 words)
• Console wars: **Nintendo** vs **Sega** (5 words)
• Modern: **esports** and **mobile** boom (5 words)
[Large image showing gaming timeline]
```

**3 bullets, 15 words** - Minimal, visual ✅

---

## The Result

✅ **Flexible** - Adapts to business vs casual  
✅ **Speakable** - Test: "Can you speak this?"  
✅ **Visual-first** - Large images with all styling  
✅ **No overlaps** - Precise positioning  
✅ **Minimal charts** - Only when data demands it  
✅ **Professional** - Investor decks can have substance  
✅ **Readable** - No paragraphs, just clean bullets  

**The system now understands**: An investor deck needs more substance than a birthday slideshow, but BOTH should be speakable, not walls of text! 🎯

