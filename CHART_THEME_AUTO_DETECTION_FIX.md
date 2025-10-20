# Chart Theme Auto-Detection Fix

## Problem
Charts were not automatically adapting their theme (light/dark) based on the slide background color. This caused visibility issues where:
- Dark background slides showed dark-colored chart ticks/labels (invisible)
- Light background slides showed light-colored chart ticks/labels (invisible)

The charts were always defaulting to `light` theme regardless of the slide background.

## Root Cause
1. **`HighchartsChartFrame.tsx`** was using `props.theme || 'light'` without detecting the background color
2. Charts with transparent backgrounds weren't receiving the slide background color for theme detection
3. No automatic theme inference based on background color luminance

## Solution

### 1. Auto-detect Theme in `HighchartsChartFrame.tsx`
**File:** `/apps/frontend/src/charts/renderers/HighchartsChartFrame.tsx`

**Changes:**
- Added import for `isLightColor` utility from `@/utils/colorUtils`
- Added automatic theme detection based on background color:
  - If background is light → use `'light'` theme (dark text/ticks)
  - If background is dark → use `'dark'` theme (light text/ticks)
  - If no background or transparent → default to `'light'`
- Explicit `theme` prop still overrides auto-detection if provided

```typescript
// Auto-detect theme based on background color
let autoTheme: 'light' | 'dark' = 'light';
if (backgroundColor && 
    backgroundColor !== 'transparent' && 
    backgroundColor !== '#00000000' &&
    backgroundColor !== 'rgba(0,0,0,0)' &&
    backgroundColor !== 'rgba(0, 0, 0, 0)') {
  // Determine theme based on background color luminance
  autoTheme = isLightColor(backgroundColor) ? 'light' : 'dark';
}

// Use explicit theme if provided, otherwise use auto-detected theme
const theme = props.theme || autoTheme;
```

### 2. Pass Slide Background to Charts in `ChartRenderer.tsx`
**File:** `/apps/frontend/src/renderers/components/ChartRenderer.tsx`

**Changes:**
- Extract slide background color from theme context (`themeBg`)
- Calculate `effectiveChartBg`:
  - If chart has its own opaque background → use chart's background
  - If chart background is transparent/not set → use slide background
- Pass `effectiveChartBg` to the chart component as `backgroundColor`

```typescript
// Determine effective background for the chart (for theme detection)
// If chart background is transparent, use slide background
const chartBg = component.props?.backgroundColor;
const effectiveChartBg = (chartBg && 
                    chartBg !== 'transparent' && 
                    chartBg !== '#00000000' &&
                    chartBg !== 'rgba(0,0,0,0)' &&
                    chartBg !== 'rgba(0, 0, 0, 0)') 
  ? chartBg 
  : themeBg;

// Later, in stableComponent:
const compiledProps: any = {
  ...safeProps,
  // Pass the effective background color for theme detection
  backgroundColor: effectiveChartBg,
  // ... rest of props
};
```

## How It Works

### Flow:
1. **Chart Render Request**
   - Chart component receives props from generator/editor
   
2. **ChartRenderer** (wrapper)
   - Gets slide background from theme context
   - Calculates `effectiveChartBg`:
     - Chart's own background if opaque
     - Slide background if chart is transparent
   - Passes `effectiveChartBg` to chart as `backgroundColor`

3. **HighchartsChartFrame** (theme setup)
   - Receives `backgroundColor` prop
   - Auto-detects theme using `isLightColor()`:
     - Light background → dark theme (dark text)
     - Dark background → light theme (light text)
   - Passes theme to `convertToHighchartsTheme()`

4. **Highcharts Rendering**
   - Applies theme-appropriate colors to:
     - Axis labels (x-axis, y-axis)
     - Axis titles
     - Grid lines
     - Tick marks
     - Data labels
     - Legend text
     - Tooltips

### Theme Detection Logic:
```typescript
// Uses YIQ formula for perceived brightness
const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
return brightness >= 128; // true if light, false if dark
```

## Impact

### ✅ Fixes
- Charts on dark backgrounds now show light-colored text/ticks
- Charts on light backgrounds now show dark-colored text/ticks
- Charts with transparent backgrounds inherit slide background for theming
- Theme updates when:
  - Slide background color changes
  - Theme is applied
  - New slides are generated

### ✅ Maintains Backward Compatibility
- Explicit `theme` prop still works and overrides auto-detection
- Charts with explicit backgrounds continue to work as before
- No changes needed to existing chart components or data

### ✅ Performance
- Theme detection happens during memoization
- No extra renders
- Minimal computational overhead (simple RGB brightness calculation)

## Testing Checklist

### Main Slides
- [ ] Chart with transparent background on light slide → shows dark ticks
- [ ] Chart with transparent background on dark slide → shows light ticks  
- [ ] Chart with explicit light background → shows dark ticks
- [ ] Chart with explicit dark background → shows light ticks
- [ ] Theme change updates chart theme
- [ ] Background color change updates chart theme
- [ ] Chart generation on new slides uses correct theme
- [ ] Presentation mode maintains correct theme
- [ ] Edit mode maintains correct theme

### Outline Panel (Chart Previews)
- [ ] Chart previews in light mode show dark ticks
- [ ] Chart previews in dark mode show light ticks
- [ ] Switching between light/dark mode updates preview themes

## Files Modified
1. `/apps/frontend/src/charts/renderers/HighchartsChartFrame.tsx`
   - Added `isLightColor` import
   - Added auto-theme detection logic

2. `/apps/frontend/src/renderers/components/ChartRenderer.tsx`
   - Added `effectiveChartBg` calculation
   - Pass slide background to charts with transparent backgrounds

3. `/apps/frontend/src/components/outline/SlideChartViewer.tsx`
   - Added dark mode detection for chart previews
   - Set `backgroundColor` to match container (`#1f2937` in dark, `#ffffff` in light)
   - Removed hardcoded `theme: 'light'` to allow auto-detection

## Related Utilities
- **`isLightColor()`** - `/apps/frontend/src/utils/colorUtils.ts`
  - Determines if a color is light or dark using YIQ brightness formula
  - Used throughout app for text contrast calculations
  
- **`convertToHighchartsTheme()`** - `/apps/frontend/src/charts/utils/highchartsUtils.ts`
  - Converts light/dark theme to Highcharts options
  - Sets colors for all chart text elements

## Future Enhancements
- [ ] Consider gradient backgrounds (detect average color)
- [ ] Support for custom theme color overrides
- [ ] Per-chart theme preferences in UI

