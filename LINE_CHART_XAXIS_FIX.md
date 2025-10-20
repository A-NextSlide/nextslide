# Line Chart X-Axis Label Fix

## Problem
Line charts were showing numeric indices (1, 2, 3, 4) instead of categorical labels (Q1, Q2, Q3, Q4, etc.), while bar/column charts worked fine.

## Root Cause

According to [Highcharts API](https://api.highcharts.com/highcharts/):
- When using categorical x-axis data, charts need the `categories` array set in xAxis configuration
- Bar/column charts were getting categories extracted, but line/area/spline charts were not
- Without categories, Highcharts falls back to numeric indices (0, 1, 2, 3...)

## Fix Applied

### 1. Extract Categories for Line Charts

**File:** `apps/frontend/src/charts/renderers/UnifiedHighchartsRenderer.tsx`

```typescript
// BEFORE: Only extracted categories for bar/column
const categories = useMemo(() => {
  if ((chartType === 'bar' || chartType === 'column') && Array.isArray(transformedData)) {
    // Extract categories...
  }
  return undefined;  // ❌ Line charts got undefined
}, [transformedData, chartType]);

// AFTER: Extract categories for line/area/spline too
const categories = useMemo(() => {
  // For bar/column charts
  if ((chartType === 'bar' || chartType === 'column') && Array.isArray(transformedData)) {
    // ... existing logic ...
  }
  
  // ✅ NEW: For LINE, AREA, SPLINE charts - ALSO NEED CATEGORIES!
  if (['line', 'spline', 'area', 'areaspline'].includes(chartType) && Array.isArray(transformedData)) {
    if (transformedData.length > 0 && transformedData[0]?.data) {
      const firstSeries = transformedData[0];
      const cats = firstSeries.data.map((point: any) => {
        // For categorical data, the 'name' property contains the label
        if (point.name && typeof point.name === 'string') {
          return point.name;  // ✅ "Q1", "Q2", etc.
        }
        if (typeof point.x === 'string') {
          return point.x;
        }
        return '';
      }).filter((cat: string) => cat !== '');
      
      // Only return categories if we found string labels
      if (cats.length > 0 && cats.length === firstSeries.data.length) {
        return cats;  // ✅ Returns ["Q1", "Q2", "Q3", "Q4"]
      }
    }
  }
  
  return undefined;
}, [transformedData, chartType]);
```

### 2. Explicitly Set Category Type

```typescript
xAxis: {
  ...(categories ? { 
    categories,
    type: 'category'  // ✅ Explicitly set as categorical
  } : {})
}
```

### 3. Additional X-Axis Improvements

**Moved labels further down:**
```typescript
xAxis: {
  labels: {
    y: Math.round(40 * containerScale)  // ✅ Was 35, now 40 - more space from tick line
  }
}
```

## Before & After

### Before ❌
```
Line Chart X-Axis:
1   2   3   4
(numeric indices instead of categories)
```

### After ✅
```
Line Chart X-Axis:
Q1  Q2  Q3  Q4
(actual category labels)
```

## How It Works

### Data Flow for Line Charts

**1. Backend sends:**
```json
{
  "chartType": "line",
  "data": [
    {"x": "Q1 2023", "y": 450, "series": "Actual"},
    {"x": "Q2 2023", "y": 480, "series": "Actual"},
    {"x": "Q3 2023", "y": 520, "series": "Actual"}
  ]
}
```

**2. DataTransformers groups by series:**
```javascript
[
  {
    id: "Actual",
    data: [
      {x: "Q1 2023", y: 450},
      {x: "Q2 2023", y: 480},
      {x: "Q3 2023", y: 520}
    ]
  }
]
```

**3. UnifiedHighchartsRenderer extracts categories:**
```javascript
// NEW: Extract string labels from first series
const categories = firstSeries.data.map(point => 
  point.name || point.x  // Gets "Q1 2023", "Q2 2023", etc.
);
// categories = ["Q1 2023", "Q2 2023", "Q3 2023"]
```

**4. Highcharts converts to proper format:**
```javascript
{
  xAxis: {
    categories: ["Q1 2023", "Q2 2023", "Q3 2023"],
    type: 'category'
  },
  series: [{
    name: "Actual",
    data: [
      {name: "Q1 2023", y: 450},  // 'name' for categorical!
      {name: "Q2 2023", y: 480},
      {name: "Q3 2023", y: 520}
    ]
  }]
}
```

**5. Result:**
- X-axis shows: "Q1 2023", "Q2 2023", "Q3 2023" ✅
- NOT: 0, 1, 2 or 1, 2, 3 ❌

## Chart Types Affected

This fix applies to:
- ✅ `line` charts
- ✅ `spline` charts
- ✅ `area` charts
- ✅ `areaspline` charts

Already working (unchanged):
- ✅ `bar` charts
- ✅ `column` charts
- ✅ `radar` charts

## Additional Fixes in This Update

### 1. Y-Axis Labels Fixed
- Removed width constraint (no more "3..." truncation)
- Smaller font size for better fit
- Moved labels away from axis

### 2. X-Axis Labels Positioned Lower
- Changed from `y: 35` to `y: 40`
- Better clearance from tick line
- No overlap with axis

### 3. Chart Titles Include Units
- Auto-detects units: $M, $B, %, Units
- Titles now: "Revenue Growth ($M)", "Market Share (%)"

## Testing

Test with this prompt:
```
"Create a presentation showing quarterly revenue trend for 2023"
```

**Expected:**
- Line chart with 4 points
- X-axis labels: "Q1", "Q2", "Q3", "Q4" (NOT 1, 2, 3, 4)
- Y-axis labels: Full numbers (450, 520, etc.)
- Chart title: "Quarterly Revenue Trend ($M)"

## Files Modified

1. `apps/frontend/src/charts/renderers/UnifiedHighchartsRenderer.tsx`
   - Added category extraction for line/area/spline charts
   - Set `type: 'category'` explicitly when categories present
   - Moved x-axis labels down (y: 40)
   - Fixed y-axis label truncation

2. `apps/backend/services/outline/chart_generator.py`
   - Added unit detection method
   - Updated chart title generation to include units

3. `apps/backend/agents/prompts/generation/outline_prompts.py`
   - Made units mandatory in chart titles

4. `apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`
   - Added unit requirements
   - Updated all examples with units

## Summary

✅ **Line charts now show proper x-axis labels** (Q1, Q2, Q3 not 1, 2, 3)
✅ **Y-axis labels show full numbers** (no truncation)
✅ **X-axis labels positioned lower** (no overlap with tick line)
✅ **Chart titles include units** ($M, %, etc.)

All chart types now work correctly with proper categorical labels!

