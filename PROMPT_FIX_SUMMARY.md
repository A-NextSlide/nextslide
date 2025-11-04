# Prompt Fix Summary - Chart + Text + Image Overlap Issue

## Problem Identified

The slide showing "The Console Wars Heat Up: Nintendo vs Sega" had severe overlapping issues:
- ❌ Bar chart overlapping with text descriptions
- ❌ Large NES image cramming into the same space
- ❌ Text for "Nintendo NES" and "Sega Genesis" conflicting with chart positioning

## Root Cause

The prompts had **NO guidance for handling Chart + Text + Image on the same slide**.

### What Was Missing:

1. **PATTERN 4** only showed "Chart + Insights" but didn't explicitly forbid adding images
2. **Multi-item detection** (lines 330-404) suggested adding individual images for each item WITHOUT checking if there's already a chart
3. **Chart positioning guidance** (line 319) said "left OR right" but didn't account for image conflicts
4. **No validation rule** preventing Chart + Image on the same slide

### The Conflict:

When the model received:
- Chart data (Nintendo vs Sega sales comparison)
- Multi-item content (Nintendo NES + Sega Genesis descriptions)
- No restriction on combining charts and images

It tried to fit ALL THREE:
- Chart (wants left half: x=80, width=800)
- Text descriptions (wants left half: x=120, width=800)  
- Image (wants right half: x=960, width=880)

Result: **Overlapping chart and text fighting for the same space**

## Fixes Implemented

### 1. Chart Positioning Guidance (`html_inspired_generator.py` lines 319-329)

**Before:**
```python
chart_info += f"\n🚨 CRITICAL: Use Chart component positioned left (x=80, width=880) OR right (x=960, width=880)!"
```

**After:**
```python
chart_info += f"\n🚨 CRITICAL CHART POSITIONING - PREVENT OVERLAPS:\n"
chart_info += f"\n**OPTION A - Chart Focus (PREFERRED):**"
chart_info += f"\n  • Chart left: x=80, y=240, width=800, height=600"
chart_info += f"\n  • Text insights right: x=960, y=240, width=760 (stack vertically with 50px gaps)"
chart_info += f"\n  • NO IMAGE (chart is the visual - don't overlap!)"
chart_info += f"\n\n**OPTION B - Vertical Stack (if text is extensive):**"
chart_info += f"\n  • Title + text top: y=180-500"
chart_info += f"\n  • Chart bottom: x=240, y=540, width=1440, height=450"
chart_info += f"\n  • NO IMAGE (chart takes priority)"
chart_info += f"\n\n**NEVER**: Chart + Image on same slide = overlaps! Choose chart OR image, not both!"
```

### 2. Multi-Item Detection Skip (`html_inspired_generator.py` lines 342-346)

**Added:**
```python
# SKIP multi-item image guidance if slide has chart data (chart takes priority!)
if context.has_chart_data:
    logger.info(f"⚠️ [MULTI-ITEM] Skipping multi-item image guidance for slide {context.slide_index + 1} - has chart data")
    multi_item_guidance = ""
```

This prevents the system from suggesting individual images for each item when there's already a chart.

### 3. Updated PATTERN 4 (`html_inspired_system_prompt_v2.py` lines 121-146)

**Before:**
```
**PATTERN 4: CHART + INSIGHTS**
Use when: Data visualization with text
```

**After:**
```
**PATTERN 4: CHART + INSIGHTS (NO IMAGES!)**
🚨 CRITICAL: Charts are the visual element - DO NOT add images on chart slides!

Chart Left, Text Right:
  [... positioning details ...]
  NO IMAGE - chart is sufficient visual

Chart Bottom (for extensive text):
  Text content: x=120, y=180-500 (vertical stack)
  Chart: x=240, y=540, width=1440, height=450 (wider, centered)
  NO IMAGE - chart provides visualization

❌ WRONG: Adding both Chart AND Image = overlaps and visual clutter
✅ RIGHT: Chart OR Image, never both
```

### 4. Slide-Specific Instructions (`html_inspired_generator.py` lines 516-520)

**Added at the top of dynamic prompt:**
```
🚨 CRITICAL LAYOUT RULE - CHART OR IMAGE, NEVER BOTH:
• If slide has Chart data → NO Image component (chart is the visual!)
• Use PATTERN 4 (Chart + Insights) from system prompt
• Chart left + text insights right OR chart bottom + text top
• Verify no overlaps: chart and text must have 80px gap minimum
```

### 5. Validation Rules Updated

**`html_inspired_system_prompt_v2.py` (lines 1177-1178):**
```
❌ **Chart + Image on same slide** (chart IS the visual - no images needed!)
❌ **Text overlapping with chart** (use PATTERN 4 layouts only)
```

**`html_inspired_system_prompt_dynamic.py` (line 138):**
```
❌ REJECT if: ... Chart+Image on same slide, ...
```

## Expected Behavior After Fix

When the model receives a slide with chart data like "Nintendo vs Sega":

1. ✅ **Recognizes chart data** and uses PATTERN 4
2. ✅ **Skips multi-item image guidance** (chart takes priority)
3. ✅ **Positions chart left** (x=80, y=240, width=800, height=600)
4. ✅ **Stacks text insights right** (x=960, y=240, width=760) with proper vertical gaps
5. ✅ **NO Image component added** - chart provides the visualization
6. ✅ **Proper spacing** - 80px gap between chart and text, no overlaps

## Testing Recommendations

1. **Re-generate the "Console Wars" slide** - should now show chart on left, text insights on right, NO image
2. **Test other chart slides** - verify no images are added alongside charts
3. **Test multi-item slides WITHOUT charts** - should still get individual images for each item
4. **Check positioning** - verify 80px gaps between chart and text elements

## Files Modified

1. `/apps/backend/agents/generation/html_inspired_generator.py`
   - Lines 319-329: Enhanced chart positioning guidance
   - Lines 342-346: Skip multi-item images when chart present
   - Lines 516-520: Added critical layout rule to dynamic prompt

2. `/apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`
   - Lines 121-146: Updated PATTERN 4 with NO IMAGES rule
   - Lines 1177-1178: Added validation rules for chart+image conflicts

3. `/apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py`
   - Line 138: Added chart+image conflict to rejection criteria

All changes maintain backward compatibility and only add constraints where needed to prevent overlaps.

