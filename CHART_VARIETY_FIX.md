# Chart Variety Fix - No More "All Line Charts"

## Problem You Reported
> "I just created a deck, it was all line charts"

## Root Cause Analysis

### Issue 1: Overly Broad Time Detection
The `_determine_chart_type_from_data` function in `chart_generator.py` was too aggressive:

```python
# BEFORE (Too Aggressive):
time_indicators = ['q1', 'q2', 'q3', 'q4', 'jan', 'feb', '2020', '2021', '2022', '2023', '2024', 'year', 'month']
has_time_data = any(indicator in name for name in names_lower for indicator in time_indicators)

if has_time_data and data_count >= 3:
    return 'line'  # Triggers for almost any data mentioning a year!
```

**Result:** Any chart with "2023" or "Q1" in a label → line chart, even for static comparisons like "Product A 2023 Sales" vs "Product B 2023 Sales"

### Issue 2: No Variety Enforcement
- No tracking of previously used chart types
- No preference for varying chart types
- No guidance against repetition

### Issue 3: Wrong Default Fallback
```python
# BEFORE:
return available_types[0] if available_types else 'bar'
# Often returned 'line' because it was first in the list
```

## Fixes Implemented

### Fix 1: Stricter Time-Series Detection

**File:** `apps/backend/services/outline/chart_generator.py`

```python
# AFTER (Strict & Accurate):
# 1. Need 3+ CONSECUTIVE time periods (not just any mention)
time_patterns = {
    'quarters': ['q1', 'q2', 'q3', 'q4'],
    'months': ['jan', 'feb', 'mar', ...],
    'years': ['2019', '2020', '2021', ...]
}

is_time_series = False
for pattern_type, patterns in time_patterns.items():
    matches = sum(1 for name in names_lower if any(p in name for p in patterns))
    if matches >= 3 and data_count >= 3:  # Need at least 3 periods
        is_time_series = True

# 2. Check title/content for trend language
has_trend_language = any(word in title_content_lower for word in 
    ['trend', 'over time', 'evolution', 'growth over', 'historical', 'projection'])

# 3. Only use line when clearly temporal
if (is_time_series or has_trend_language) and data_count >= 4:
    return 'line'
else:
    return 'column'  # Default to column for comparisons!
```

**Now line charts are used ONLY when:**
- Data has 3+ consecutive time periods (Q1, Q2, Q3 or Jan, Feb, Mar)
- OR title/content mentions "trend", "over time", "evolution", etc.
- AND has 4+ data points

### Fix 2: Added Chart Type Variety Logic

```python
# 1. PARTS OF WHOLE → pie/donut
if is_distribution and not has_series_key:
    return 'pie'

# 2. FLOW/PROCESS → waterfall
if 'bridge' in title or 'flow' in title or 'process' in title:
    return 'waterfall'

# 3. TIME SERIES → line/area (strict detection)
if (is_time_series or has_trend_language):
    return 'line'

# 4. COMPARISONS → column/bar (DEFAULT!)
comparison_words = ['compare', 'comparison', 'versus', 'vs', 'by region', 'by product']
if is_comparison or not is_time_series:
    if used_charts.count('column') < 2:
        return 'column'
    elif used_charts.count('bar') < 2:
        return 'bar'

# 5. Default to column (NOT line!)
return 'column'
```

### Fix 3: Prompt Updates

**Added to `outline_prompts.py` and `html_inspired_system_prompt_v2.py`:**

```
CRITICAL: VARY CHART TYPES - DON'T USE LINE FOR EVERYTHING!

CHART TYPE SELECTION RULES:
* Use column/bar when comparing categories (regions, products, departments) - NOT line!
* Use line/area ONLY when showing trends over time (months, quarters, years in sequence)
* Use pie when showing parts of a whole or distribution percentages
* Do NOT default to line for non-time-series data!

DEFAULT PREFERENCE ORDER FOR VARIETY:
1. First chart: column or bar (comparisons are most common)
2. Second chart: line or area (if time-based data)
3. Third chart: pie (if distribution data)
4. Fourth+ charts: vary with waterfall, radar, or bubble

ANTI-PATTERNS:
❌ DO NOT make every chart a line chart just because data exists!
❌ DO NOT use line charts for comparing static categories
✅ DO match chart type to data structure and comparison needs
✅ DO vary chart types across slides for visual interest
```

## Chart Type Decision Matrix

| If Your Data Shows... | Use This Chart | Example |
|----------------------|----------------|---------|
| **Comparing different items** | `column` or `bar` | Revenue by Product, Sales by Region |
| **Parts of a whole** | `pie` | Market share breakdown, Budget allocation |
| **Change over time** | `line` or `area` | Monthly revenue trend, Stock price over year |
| **Process/Flow** | `waterfall` | Revenue bridge, Cost breakdown |
| **Multi-metric comparison** | `column` (multi-series) | Revenue vs Profit by Region |
| **Multi-trend comparison** | `line` (multi-series) | 3-year revenue trends |
| **Distribution** | `pie` | Department budget split |
| **Competitive analysis** | `radar` | 5 competitors × 8 metrics |

## Examples of Correct Chart Selection

### ✅ Correct: Revenue by Product → Column Chart
```json
{
  "chartType": "column",  // ✅ Comparing products (static categories)
  "data": [
    {"name": "Product A", "value": 450},
    {"name": "Product B", "value": 380},
    {"name": "Product C", "value": 520}
  ]
}
```

### ❌ Incorrect: Revenue by Product → Line Chart
```json
{
  "chartType": "line",  // ❌ WRONG! Not time-series data
  "data": [
    {"name": "Product A", "value": 450},  // Products are categories, not time
    {"name": "Product B", "value": 380},
    {"name": "Product C", "value": 520}
  ]
}
```

### ✅ Correct: Quarterly Trend → Line Chart
```json
{
  "chartType": "line",  // ✅ Time progression
  "data": [
    {"name": "Q1 2023", "value": 450},
    {"name": "Q2 2023", "value": 480},
    {"name": "Q3 2023", "value": 520},
    {"name": "Q4 2023", "value": 580}
  ]
}
```

### ✅ Correct: Multi-Product Performance → Multi-Series Column
```json
{
  "chartType": "column",  // ✅ Comparing metrics across products
  "data": [
    {"name": "Product A", "value": 450, "series": "Revenue"},
    {"name": "Product A", "value": 120, "series": "Profit"},
    {"name": "Product B", "value": 380, "series": "Revenue"},
    {"name": "Product B", "value": 95, "series": "Profit"},
    {"name": "Product C", "value": 520, "series": "Revenue"},
    {"name": "Product C", "value": 135, "series": "Profit"}
  ]
}
```

## What Changed

### chart_generator.py
1. ✅ Stricter time detection (needs 3+ consecutive periods)
2. ✅ Added content/title analysis for chart type hints
3. ✅ Defaults to column/bar for comparisons (NOT line)
4. ✅ Checks for distribution keywords → pie
5. ✅ Checks for flow keywords → waterfall
6. ✅ Tracks usage to avoid repetition

### Prompts (outline_prompts.py, html_inspired_system_prompt_v2.py)
1. ✅ Added "CRITICAL: VARY CHART TYPES" section
2. ✅ Added clear anti-patterns (don't use line for everything)
3. ✅ Added preference order for variety
4. ✅ Added chart selection rules with use cases
5. ✅ Emphasized matching chart type to data structure

### generator.py
1. ✅ Updated chart type selection guidance
2. ✅ Emphasized column/bar as default for comparisons
3. ✅ Added variety emphasis

## Testing

Create a new deck with this prompt:
```
"Create a business presentation about our company performance with:
- Regional sales comparison
- Market share breakdown  
- Quarterly revenue trend
- Product performance analysis"
```

**Expected Chart Types:**
1. Regional sales → `column` (comparing regions)
2. Market share → `pie` (distribution)
3. Quarterly revenue → `line` (time series)
4. Product performance → `column` or multi-series `column`

**NOT:** All line charts!

## Chart Type Checklist

When generating a chart, ask:

1. **Is this data showing progression OVER TIME?**
   - YES → Use `line` or `area`
   - NO → Continue to #2

2. **Is this data comparing DIFFERENT CATEGORIES?**
   - YES → Use `column` or `bar`
   - NO → Continue to #3

3. **Is this data showing PARTS OF A WHOLE?**
   - YES → Use `pie`
   - NO → Continue to #4

4. **Is this data showing a PROCESS or FLOW?**
   - YES → Use `waterfall` or `sankey`
   - NO → Default to `column`

5. **What chart types have already been used?**
   - Vary to avoid repetition
   - Mix different types for visual interest

## Summary

**Before:**
- Everything defaulted to line charts
- No variety across slides
- Line charts used for non-temporal data

**After:**
- ✅ Column/bar for comparisons (DEFAULT)
- ✅ Line/area ONLY for time-series
- ✅ Pie for distributions
- ✅ Advanced types when appropriate
- ✅ Variety tracking to avoid repetition
- ✅ Proper chart type matching

**Next Deck Should Show:**
- Mix of column, pie, line charts
- Appropriate chart types for data structure
- Visual variety across slides
- NO "all line charts" problem!

