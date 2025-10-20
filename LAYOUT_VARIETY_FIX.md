# Layout Variety & Image Positioning Fix

## Problem
All slides were using the same boring vertical stacking layout:
```
Text Line 1  (y=200)
Text Line 2  (y=300)
Text Line 3  (y=400)
━━━━━━━━━━━━━━━━━━
[Wide Image] (y=700)
━━━━━━━━━━━━━━━━━━
```

Result: Monotonous, dated presentation that looks like PowerPoint 2003.

## Solution Implemented

### 1. Added Layout Variety Instructions
**Files Modified:**
- `apps/backend/agents/rag/knowledge_base/design_patterns.json`
- `apps/backend/agents/rag/knowledge_base/critical_rules.json`

### 2. Defined 4 Primary Content Layouts

#### **Layout 1: Split-Screen Image Right (40% of slides)**
```
┌─────────────────┬────────────┐
│  Title          │            │
│                 │            │
│  • Bullet 1     │   IMAGE    │
│  • Bullet 2     │   840px    │
│  • Bullet 3     │            │
│                 │            │
└─────────────────┴────────────┘
  Text (900px)      Image (840px)
```
**When**: Default for most content slides
**Layout**: Text x=120-900, Image x=1000-1840

#### **Layout 2: Split-Screen Image Left (30% of slides)**
```
┌────────────┬─────────────────┐
│            │  Title          │
│            │                 │
│   IMAGE    │  • Bullet 1     │
│   880px    │  • Bullet 2     │
│            │  • Bullet 3     │
│            │                 │
└────────────┴─────────────────┘
  Image (880px)   Text (880px)
```
**When**: Image is primary focus (products, demos)
**Layout**: Image x=80-880, Text x=960-1840

#### **Layout 3: Text-Heavy 60/40 (20% of slides)**
```
┌──────────────────────┬───────┐
│  Title               │       │
│                      │ Image │
│  • Detailed Point 1  │ 690px │
│  • Detailed Point 2  │       │
│  • Detailed Point 3  │       │
│                      │       │
└──────────────────────┴───────┘
     Text (1000px)    Image (690px)
```
**When**: More text needed, image as support
**Layout**: Text x=120-1000, Image x=1150-1840

#### **Layout 4: Panoramic Bottom (10% RARE)**
```
┌──────────────────────────────┐
│  Title                       │
│                              │
│  • Point 1                   │
│  • Point 2                   │
│                              │
├──────────────────────────────┤
│ [Wide Panoramic Image 1760px]│
└──────────────────────────────┘
```
**When**: ONLY panoramic landscapes (aspect >2:1)
**Layout**: Text y=160-500, Image y=680, width=1760, height=340

### 3. Added Anti-Pattern Warnings

**FORBIDDEN: Vertical Stacking**
```json
{
  "ANTI_PATTERN_vertical_stacking": {
    "description": "DO NOT USE - This is OLD POWERPOINT!",
    "bad_layout": {
      "text_line_1": { "y": 200 },
      "text_line_2": { "y": 300 },
      "text_line_3": { "y": 400 },
      "wide_image_bottom": { "y": 700, "width": 1760 }
    },
    "why_forbidden": "Boring, dated, wastes horizontal space",
    "correct_replacement": "Use split-screen with image LEFT or RIGHT!"
  }
}
```

### 4. Layout Rotation Example

**Example: 12-Slide Deck**
- Slide 1: Title (no image)
- Slide 2: **Image RIGHT**  
- Slide 3: **Image LEFT**
- Slide 4: Data (chart, no image)
- Slide 5: **Image RIGHT**
- Slide 6: Stat (no image)
- Slide 7: **Text 60/40** (text heavy)
- Slide 8: **Image LEFT**
- Slide 9: **Panoramic bottom** (rare)
- Slide 10: Quote (no image)
- Slide 11: **Image RIGHT**
- Slide 12: Conclusion (no/small image)

**Result**: Varied, dynamic, modern presentation!

## Files Modified

1. **`design_patterns.json`**
   - Added 4 content slide layout patterns
   - Added critical layout variety instruction
   - Added anti-pattern for vertical stacking
   - Increased title font sizes to 260-300pt

2. **`critical_rules.json`**
   - Enhanced layout_patterns section
   - Added MODERN_SIDE_BY_SIDE priority
   - Added FORBIDDEN_VERTICAL_STACKING warning
   - Added concrete 12-slide variety example

3. **`html_inspired_system_prompt_v2.py`**
   - Lines 514-544: Comprehensive image layout priority
   - Lines 579-594: Updated layout patterns

4. **`layout_guidelines.py`**
   - Lines 40-48: Split-screen as PRIMARY layout

5. **`rag_system_prompt.py`**
   - Lines 70-90: Added explicit image layout patterns

## Key Instructions Added

### ✅ DO:
- **Rotate layouts** across slides (don't use same pattern)
- Use **side-by-side** (50/50, 60/40, 40/60) for 80% of slides
- Place images **LEFT or RIGHT**, not bottom
- Use **panoramic bottom** ONLY for wide landscapes
- Create **visual variety** across the deck

### ❌ DON'T:
- Stack text vertically with image at bottom
- Use the same layout for every slide
- Put square/portrait images at bottom
- Make monotonous, repetitive presentations

## Expected Results

When generating decks now:
- ✅ **Varied layouts** across slides
- ✅ **Side-by-side** as default (80%)
- ✅ **Bottom panoramic** as rare exception (10%)
- ✅ **Modern, magazine-style** appearance
- ❌ **No more vertical stacking** with bottom images
- ✅ **Professional variety** throughout deck

## Backward Compatibility

- Existing presentations not affected
- Only new generations use updated layouts
- RAG system will retrieve these patterns automatically
- AI will see anti-patterns and avoid them

## Testing

Generate a 12-slide presentation and verify:
1. Slides use different layouts (not all the same)
2. Images appear on LEFT or RIGHT (not bottom)
3. Bottom placement only for wide landscapes
4. Modern, varied, professional appearance
5. No monotonous repetition of same layout

