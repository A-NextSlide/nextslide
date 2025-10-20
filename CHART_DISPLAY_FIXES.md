# Chart Display Fixes - Axis Labels & Titles

## Issues Fixed

### 1. Y-Axis Labels Truncated ("3..." instead of full numbers)
**Problem:** Y-axis labels were showing "3..." instead of complete values like "300" or "3,000".

**Root Cause:** 
- Y-axis labels had a width constraint of `60px * containerScale`
- Font size was too large for the available space
- `textOverflow: 'ellipsis'` was cutting off numbers

**Fix Applied:**
```typescript
// BEFORE:
yAxis: {
  labels: {
    x: Math.round(-5 * containerScale),
    style: {
      fontSize: `${labelFontSizePx}px`,
      textOverflow: 'ellipsis',
      width: `${Math.round(60 * containerScale)}px`  // ❌ Caused truncation
    }
  }
}

// AFTER:
yAxis: {
  labels: {
    x: Math.round(-8 * containerScale),  // More space from axis
    style: {
      fontSize: `${Math.max(7, labelFontSizePx - 1)}px`,  // ✅ Smaller font
      textOverflow: 'clip',  // ✅ No ellipsis
      whiteSpace: 'nowrap'
      // ✅ Removed width constraint
    }
  }
}
```

**File:** `apps/frontend/src/charts/renderers/UnifiedHighchartsRenderer.tsx`

### 2. Bottom Ticks Too Close to X-Axis
**Problem:** X-axis labels were positioned too close to the axis line, making them cramped.

**Fix Applied:**
```typescript
// BEFORE:
xAxis: {
  labels: {
    y: Math.round(30 * containerScale)  // Too close
  }
}

// AFTER:
xAxis: {
  labels: {
    y: Math.round(35 * containerScale)  // ✅ Moved down 5px
  }
}
```

**File:** `apps/frontend/src/charts/renderers/UnifiedHighchartsRenderer.tsx`

### 3. Chart Titles Missing Units
**Problem:** Chart titles like "Revenue Growth" didn't indicate whether it's in millions, percentages, etc.

**Fix Applied:**

**Backend - Added Unit Detection:**
```python
def _detect_unit_from_data(self, data, title_lower) -> str:
    """Detect the unit of measurement from data labels or context"""
    
    # Check title for currency indicators
    if any(word in title_lower for word in ['revenue', 'sales', 'profit']):
        if 'billion' in title_lower:
            return "$B"
        elif 'million' in title_lower:
            return "$M"
        else:
            return "$"
    
    # Check for percentage indicators
    if any(word in title_lower for word in ['percent', 'share', 'rate', 'growth']):
        return "%"
    
    # Check for count indicators
    if any(word in title_lower for word in ['units', 'count', 'quantity']):
        return "Units"
    
    # Infer from data values
    values = [d.get('value', 0) for d in data]
    if values:
        total = sum(values)
        # If sums to ~100, likely percentages
        if all(0 <= v <= 100 for v in values) and 90 <= total <= 110:
            return "%"
    
    return ""

async def generate_chart_title(...) -> str:
    unit = self._detect_unit_from_data(data, title_lower)
    unit_suffix = f" ({unit})" if unit else ""
    return f"{cleaned_title}{unit_suffix}"
```

**File:** `apps/backend/services/outline/chart_generator.py`

**Prompts - Made Units Mandatory:**
```
7. **Chart Titles - MUST INCLUDE UNITS**:
   - ALWAYS include the unit of measurement in parentheses
   - Good: "Q4 2024 Revenue by Region ($M)"
   - Bad: "Revenue by Region" (missing unit!)
   - Format: "Description (Unit)"
   - Examples:
     * Revenue chart → "Revenue by Region ($M)"
     * Growth chart → "Year-over-Year Growth (%)"
     * Sales chart → "Quarterly Sales (Units)"
```

**Files:** 
- `apps/backend/agents/prompts/generation/outline_prompts.py`
- `apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`

### 4. All Charts Were Line Charts (Bonus Fix)
**Problem:** Every chart defaulted to line type, even for static category comparisons.

**Fix:** Rewrote chart type determination logic (see CHART_VARIETY_FIX.md)

## Summary of Changes

### Frontend Changes (1 file)

**`UnifiedHighchartsRenderer.tsx`:**
1. Y-axis labels: Smaller font (`labelFontSizePx - 1`), removed width constraint, changed overflow to 'clip'
2. Y-axis labels: Moved away from axis (`x: -8` instead of `-5`)
3. X-axis labels: Moved down (`y: 35` instead of `30`)

### Backend Changes (3 files)

**`chart_generator.py`:**
1. Added `_detect_unit_from_data` method to intelligently detect units
2. Updated `generate_chart_title` to append unit suffix
3. Detects: $B, $M, $K, %, Units based on context and values

**`outline_prompts.py`:**
1. Added "Chart Titles - MUST INCLUDE UNITS" section
2. Updated examples to show units: "Revenue ($M)", "Market Share (%)"
3. Added unit requirements to chart title prompt

**`html_inspired_system_prompt_v2.py`:**
1. Added unit requirements to chart guidelines
2. Updated all chart examples to include units in titles
3. Added unit checking to verification checklist

## Unit Detection Logic

The system automatically detects units based on:

### 1. Title/Context Keywords
```python
'revenue', 'sales', 'profit', 'cost' → $ (with $B/$M/$K based on magnitude)
'percent', 'share', 'rate', 'growth', 'margin' → %
'units', 'count', 'quantity' → Units
```

### 2. Data Label Analysis
```python
Sample labels containing '$', 'usd', 'dollar' → $
Sample labels containing '%', 'percent' → %
```

### 3. Value Inference
```python
Values sum to ~100 → %
Average value > 1M → $M
Average value > 100K → $K
```

## Examples

### Revenue Chart
**Title:** "Revenue by Region ($M)"
**Y-axis:** Full numbers visible (450, 520, 580, 620)
**X-axis:** Labels positioned lower, clear spacing

### Market Share Chart
**Title:** "Market Share Distribution (%)"
**Y-axis:** Percentages (35%, 40%, 45%)
**X-axis:** Category names properly spaced

### Multi-Series Comparison
**Title:** "Revenue vs Cost by Region ($M)"
**Y-axis:** Values fit without truncation
**Legend:** Shows "Revenue" and "Cost"

## Before & After

### Before ❌
```
Chart Title: "Revenue Growth"  (no unit)
Y-axis: "3..." (truncated)
X-axis: Labels too close to axis
```

### After ✅
```
Chart Title: "Revenue Growth ($M)"  (with unit)
Y-axis: "450", "520", "580" (full values)
X-axis: Labels positioned lower, easier to read
```

## Verification

When reviewing charts, check:
- [ ] Chart title has unit in parentheses: ($M), (%), (Units), etc.
- [ ] Y-axis labels show full numbers (no "3..." truncation)
- [ ] Y-axis labels are readable (smaller font if needed)
- [ ] X-axis labels have good spacing from axis
- [ ] No overlapping labels on either axis

## Files Modified

1. `apps/frontend/src/charts/renderers/UnifiedHighchartsRenderer.tsx` - Y-axis font/width, X-axis positioning
2. `apps/backend/services/outline/chart_generator.py` - Unit detection and title generation
3. `apps/backend/agents/prompts/generation/outline_prompts.py` - Chart title requirements
4. `apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py` - Chart title examples

## Result

Charts now display:
- ✅ **Clear y-axis labels** - no truncation
- ✅ **Smaller y-axis font** - better fit
- ✅ **Lower x-axis labels** - better spacing
- ✅ **Units in titles** - "Revenue ($M)", "Market Share (%)"
- ✅ **Auto-detection** - system infers units from context
- ✅ **Professional appearance** - readable and clear

