# Chart Dark Mode Enforcement Fix

## Problem
Charts were not consistently using dark mode when generated on dark backgrounds. The issue was that:
1. The AI model would sometimes generate charts with `theme: 'light'` hardcoded
2. The backend was using `setdefault()` which wouldn't override AI-generated theme values
3. Prompts were hardcoding `theme='light'` in chart examples

This resulted in charts with dark text/labels on dark backgrounds, making them unreadable.

## Root Cause
**File:** `/apps/backend/agents/generation/theme_adapter.py` (line 444)

The code was using `props.setdefault('theme', ...)` which means:
- If the AI already set a theme property, it wouldn't be overridden
- The background-based theme detection only applied when no theme was set
- Charts defaulted to light theme even on dark backgrounds

```python
# OLD CODE (incorrect):
props.setdefault('theme', 'dark' if contrast_mgr.is_dark_color(_normalize_hex(page_bg)) else 'light')
```

## Solution

### 1. Enforce Theme Based on Background Color
**File:** `/apps/backend/agents/generation/theme_adapter.py` (line 444-449)

Changed from `setdefault()` to direct assignment to **always** enforce the correct theme:

```python
# NEW CODE (correct):
# ALWAYS enforce light/dark theme based on background color
# This ensures charts are readable regardless of AI-generated theme setting
try:
    # Dark background -> 'dark' theme (light text/ticks for contrast)
    # Light background -> 'light' theme (dark text/ticks for contrast)
    props['theme'] = 'dark' if contrast_mgr.is_dark_color(_normalize_hex(page_bg)) else 'light'
except Exception:
    props['theme'] = 'light'
```

**Key Change:** Using direct assignment (`props['theme'] = ...`) instead of `setdefault()` ensures the theme is ALWAYS set based on background color, regardless of what the AI model generated.

### 2. Remove Hardcoded Theme from Prompts
**File:** `/apps/backend/agents/generation/html_inspired_generator.py` (line 287)

Removed hardcoded `theme='light'` from chart generation prompts:

```python
# OLD CODE:
chart_info += f"\nChart props: chartType='{chart_type}', data=[use exact data above], showLegend=false, theme='light'"

# NEW CODE:
chart_info += f"\nChart props: chartType='{chart_type}', data=[use exact data above], showLegend=false"
```

This prevents the AI from being instructed to always use light theme.

## How It Works Now

### Theme Detection Flow:
1. **Chart Generation (AI Model)**
   - AI generates chart component with data and properties
   - May or may not include a `theme` property

2. **Component Validation**
   - Components are validated and normalized
   - Chart-specific normalizations applied

3. **Theme Enforcement (ThemeAdapter)**
   - `apply_theme_to_components()` is called after validation
   - For each Chart component:
     - Gets page background color from theme
     - Detects if background is dark using `is_dark_color()`
     - **ALWAYS sets** `theme` property:
       - Dark background → `theme: 'dark'` (light text for contrast)
       - Light background → `theme: 'light'` (dark text for contrast)

4. **Frontend Rendering**
   - Chart receives correct theme property
   - HighchartsChartFrame applies theme-appropriate colors
   - Text, ticks, labels, and gridlines are visible

### Theme Logic:
```python
is_dark = contrast_mgr.is_dark_color(page_background)

if is_dark:
    chart_theme = 'dark'   # Uses light colors for text/ticks
else:
    chart_theme = 'light'  # Uses dark colors for text/ticks
```

## Testing

To verify the fix works:

1. **Generate presentation with dark theme**
   - Background should be dark (e.g., #1A1A1A, #000000)
   - Charts should have `theme: 'dark'` in props
   - Chart text/labels should be light-colored and visible

2. **Generate presentation with light theme**
   - Background should be light (e.g., #FFFFFF, #F8F9FA)
   - Charts should have `theme: 'light'` in props
   - Chart text/labels should be dark-colored and visible

3. **Change theme after generation**
   - Frontend auto-detection should still work
   - Charts should adapt to new background color

## Files Modified

1. `/apps/backend/agents/generation/theme_adapter.py`
   - Line 442-449: Changed theme setting from `setdefault()` to direct assignment
   - Added clarifying comments about theme enforcement

2. `/apps/backend/agents/generation/html_inspired_generator.py`
   - Line 287: Removed hardcoded `theme='light'` from prompt

## Impact

- ✅ Charts are now always readable on any background color
- ✅ Theme is automatically enforced based on slide background
- ✅ Works for both AI-generated and manually edited charts
- ✅ Compatible with existing frontend auto-detection
- ✅ No breaking changes to API or component schema

## Related Systems

This fix works in conjunction with existing frontend auto-detection:
- **Frontend:** `apps/frontend/src/charts/renderers/HighchartsChartFrame.tsx`
  - Already has auto-detection based on backgroundColor prop
  - Backend enforcement ensures correct initial theme
  - Frontend can adapt if background changes in editor

## Notes

- The frontend also has theme auto-detection, but backend enforcement is critical for **generation**
- This ensures charts are correct from the moment they're generated
- Frontend detection handles runtime theme changes (user editing background color)
- Both systems work together for comprehensive theme support

