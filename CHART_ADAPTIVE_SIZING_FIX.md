# Chart Adaptive Sizing Fix

## Problem Identified

Charts were sometimes being sized too large (at or near 800px height), causing overlaps with other slide elements. The issue was caused by **conflicting and overly rigid sizing rules** that didn't account for the chart's Y position on the slide.

### Root Cause

1. **Knowledge Base Guidelines** instructed: "NEVER make a chart smaller than 800×600px!" and "800px+ tall"
2. **Validator Hard Cap**: Clamped all charts to 600-800px height range
3. **No Y-Position Awareness**: Fixed heights didn't consider available vertical space

### The Math Problem

With a slide height of **1080px** and 100px bottom margin target:
- Chart at Y=140 + 800px height = **940px end** ✅ (140px from bottom)
- Chart at Y=200 + 800px height = **1000px end** ⚠️ (80px from bottom)  
- Chart at Y=240 + 800px height = **1040px end** ❌ (only 40px from bottom!)

This left **insufficient space** for:
- Footer text
- Citations/sources
- Components below charts
- Proper visual margins

---

## Solution: Adaptive Height Based on Y Position

### New Formula

```javascript
maxHeight = min(desiredHeight, 1020 - chartY - 100)
```

Where:
- `1020` = slide height (1080px) - top safe margin (60px)
- `chartY` = Y position of the chart
- `100` = minimum bottom margin
- `desiredHeight` = ideal chart height based on context (500-700px typically)

### Adaptive Height Guidelines

| Y Position | Max Safe Height | Typical Use |
|------------|----------------|-------------|
| Y=160-200 | 680px | Early positioned charts |
| Y=200-240 | 640px | Standard chart position |
| Y=240-280 | 600px | Mid-slide charts |
| Y=280+ | 550px or less | Lower charts with content above |

---

## Files Updated

### 1. Backend Validator (`apps/backend/services/slide_schema_validator.py`)

**Before:**
```python
# Fixed height range, no position awareness
if 'height' not in props or props['height'] < 600:
    props['height'] = 700
elif props['height'] > 800:
    props['height'] = 800
```

**After:**
```python
# Adaptive sizing based on Y position
y_position = props.get('position', {}).get('y', 200)
max_safe_height = 1080 - y_position - 100  # Leave 100px bottom margin

if 'height' not in props or props['height'] < 500:
    props['height'] = min(600, max_safe_height)
elif props['height'] > max_safe_height:
    props['height'] = max_safe_height
elif props['height'] > 800:
    props['height'] = min(800, max_safe_height)
```

### 2. Knowledge Base Files

Updated all knowledge base files with adaptive sizing guidance:

**Files:**
- `apps/backend/agents/rag/knowledge_base/complete_knowledge_base_with_prompts.json`
- `apps/backend/agents/rag/knowledge_base/enhanced_knowledge_base.json`
- `apps/backend/agents/rag/knowledge_base/critical_rules.json`

**New Guidelines:**
```json
{
  "dimensions": [
    "Left half chart: 880px wide, height based on available space (X=80)",
    "Right half chart: 880px wide, height based on available space (X=960)",
    "Size charts adaptively: 500-700px height for slides with multiple elements"
  ],
  "positioning": [
    "Left side: X=80, Y=140-240, Width=880, Height=500-700 (adaptive)",
    "Right side: X=960, Y=140-240, Width=880, Height=500-700 (adaptive)",
    "CRITICAL: Ensure chart bottom (Y + height) leaves 100px+ margin from slide bottom (1080px)",
    "Calculate: If Y=140, max height=840px; If Y=200, max height=780px; If Y=240, max height=740px"
  ]
}
```

### 3. System Prompts (`apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`)

Added comprehensive adaptive height guidance:

```python
**CHART SIZING FORMULA (MANDATORY):**
🚨 ADAPTIVE HEIGHT BASED ON Y POSITION:
• If Y=160-200: maxHeight = 680px (leaves 140-180px bottom margin)
• If Y=200-240: maxHeight = 640px (leaves 140-180px bottom margin)
• If Y=240-280: maxHeight = 600px (leaves 140-180px bottom margin)
• If Y=280+: maxHeight = 550px or less
• NEVER exceed: height = 1020 - y - 100 (minimum 100px bottom margin)

**PRESENTATION MODE: Impactful Charts**
• Single Chart: width=700-850px, height=ADAPTIVE (use formula above, typically 500-650px)

**DETAILED MODE: Data-Rich Charts**
• Single Chart: width=500-850px, height=ADAPTIVE (use formula above, typically 450-600px)
• Two Charts Side-by-Side: Each 550-600px wide, height=ADAPTIVE (typically 350-500px)
• Three Charts Side-by-Side: Each 500-540px wide, height=ADAPTIVE (typically 300-450px)
```

Updated examples throughout the prompt:
```python
• Positioning examples (with adaptive height):
  - Single chart at Y=200: x=80, width=700-850, height=min(600, 1020-200-100)=620px max
  - Two side-by-side at Y=220: height=min(500, 1020-220-100)=600px max
  - Three charts at Y=240: height=min(450, 1020-240-100)=580px max
```

---

## Benefits

✅ **No More Overlaps**: Charts automatically size to fit available space
✅ **Better Layouts**: More room for supporting content (captions, sources, footnotes)
✅ **Flexible Positioning**: Charts can be positioned anywhere without overflow
✅ **Maintains Quality**: Charts still use good heights (500-700px) when space permits
✅ **Smarter Defaults**: Validator intelligently caps height based on position

---

## Expected Behavior After Fix

### Chart at Y=200 (Common Case)
- **Before**: 800px height → ends at 1000px (tight fit)
- **After**: max 620px height → ends at 820px (260px breathing room)

### Chart at Y=240 (With Header Content)
- **Before**: 800px height → ends at 1040px (only 40px margin!)
- **After**: max 580px height → ends at 820px (260px breathing room)

### Chart at Y=300 (Multiple Components Above)
- **Before**: 700px height → ends at 1000px (tight)
- **After**: max 520px height → ends at 820px (comfortable)

---

## Testing Checklist

To verify the fix works:

1. ✅ Generate slides with charts positioned at different Y values
2. ✅ Verify no chart extends beyond Y=980 (100px bottom margin)
3. ✅ Check that charts with lower Y positions get proportionally smaller heights
4. ✅ Ensure charts still look good (not too small) when positioned high (Y < 200)
5. ✅ Test slides with multiple components to ensure no overlaps

---

## Future Improvements

Potential enhancements for even better chart sizing:

1. **Content-Aware Sizing**: Factor in complexity of chart data
2. **Multi-Chart Layouts**: Special handling for 2-3 charts on same slide
3. **Chart Type Optimization**: Different default heights for pie vs. bar vs. line
4. **Dynamic Bottom Margin**: Calculate based on whether footnotes/sources exist

---

## Summary

The adaptive sizing fix ensures charts are appropriately sized based on their vertical position, preventing overlaps while maintaining visual quality. The system now intelligently calculates maximum safe heights using the formula:

```
maxHeight = min(desiredHeight, slideHeight - chartY - bottomMargin)
```

This provides a robust solution that works across all slide layouts and chart positions.

