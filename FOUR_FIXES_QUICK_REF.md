# Four Critical Fixes - Quick Reference

## What Was Fixed

1. **Left-aligned titles in detailed mode** ✅
2. **Contextual icon selection** ✅
3. **Tighter text heights (1.15 instead of 1.2)** ✅
4. **Shape with text now works** ✅

---

## Fix 1: Left-Aligned Titles in Detailed Mode

### Detailed Mode Titles
```json
{
  "position": { "x": 120, "y": 380 },  // ← LEFT-ALIGNED (x=120)
  "textAlign": "left"  // ← LEFT, not center!
}
```

### Presentation Mode Titles
```json
{
  "position": { "x": 960, "y": 420 },  // Can be anywhere
  "textAlign": "center"  // Or "left" or "right"
}
```

---

## Fix 2: Contextual Icon Selection

### Icon Categories (13 total, 40+ icons)

| Context | Icons |
|---------|-------|
| **Growth** | trending-up, arrow-up, arrow-up-right |
| **Decline** | trending-down, arrow-down, alert-triangle |
| **Success** | check, check-circle, check-square |
| **Data** | chart-bar, pie-chart, bar-chart, activity |
| **Money** | dollar-sign, credit-card, briefcase |
| **Time** | clock, calendar |
| **People** | user, users, user-check |
| **Location** | map-pin, globe, map |
| **Communication** | message-circle, mail, phone |
| **Tools** | settings, tool, cpu |
| **Warning** | alert-triangle, alert-circle, info |
| **Navigation** | arrow-right, chevron-right, corner-down-right |
| **Features** | star (ratings only!), heart, bookmark |

### Examples

**Revenue Section:**
```json
{ "icon": "trending-up" }  // or "dollar-sign"
```

**User Metrics:**
```json
{ "icon": "users" }  // or "user-check"
```

**Completion:**
```json
{ "icon": "check-circle" }  // or "check"
```

**Bullet Points:**
```json
{ "icon": "arrow-right" }  // or "chevron-right"
```

❌ **WRONG:** Using "star" for everything
✅ **CORRECT:** Using contextual icons

---

## Fix 3: Tighter Heights (1.15 Multiplier)

### Formula
```
height = fontSize × 1.15
```

### Height Table

| Font Size | Height | Calculation |
|-----------|--------|-------------|
| 24pt | 28px | 24 × 1.15 |
| 28pt | 32px | 28 × 1.15 |
| 32pt | 37px | 32 × 1.15 |
| 36pt | 41px | 36 × 1.15 |
| 40pt | 46px | 40 × 1.15 |
| 48pt | 55px | 48 × 1.15 |
| 56pt | 64px | 56 × 1.15 |
| 64pt | 74px | 64 × 1.15 |
| 72pt | 83px | 72 × 1.15 |
| 120pt | 138px | 120 × 1.15 |

### Extra Tight for Bullets
- fontSize 24: height = 27-28
- fontSize 28: height = 31-32
- fontSize 32: height = 36-37
- fontSize 36: height = 40-41

---

## Fix 4: Shape With Text

### Complete Structure
```json
{
  "type": "Shape",
  "props": {
    "position": { "x": 400, "y": 300 },
    "width": 520,
    "height": 160,
    "shapeType": "roundedRectangle",
    "fill": { "color": "{{accent}}20" },
    "stroke": { "color": "{{accent}}", "width": 2 },
    "hasText": true,              // ← If true...
    "textContent": "Key Takeaway",  // ← MANDATORY
    "textSize": 32,               // ← MANDATORY
    "textColor": "{{accent}}",    // ← MANDATORY
    "textPadding": 24
  }
}
```

### Rules
- **If `hasText: true`** → MUST include `textContent`, `textSize`, `textColor`
- **If `hasText: false`** → Do NOT include text props

---

## Quick Checklist

Before generating any slide:

✅ **Detailed mode?** → Use LEFT-ALIGNED titles (x=120, textAlign=left)
✅ **Icons?** → Use contextual icons (trending-up, users, check-circle, NOT "star")
✅ **Heights?** → Use fontSize × 1.15 (TIGHT!)
✅ **Shape with text?** → Include textContent, textSize, textColor

---

## Testing

```bash
python3 -m pytest tests/test_html_inspired_prompt_v2.py -v
```

**Result:** 23/23 tests passing ✅

---

## Files Modified

1. **`html_inspired_system_prompt_v2.py`**
   - Added 4 major fixes
   - Updated design checklist
   - Updated mode guidance
   - Size: 29,173 characters (cacheable!)

---

## Impact

- ✅ Professional left-aligned titles in detailed mode
- ✅ Meaningful icons that convey context
- ✅ ~3-6px tighter heights per component
- ✅ Shapes with text render correctly

**All fixes done in prompting - no post-processing!** 🚀
