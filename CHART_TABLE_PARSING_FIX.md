# Chart Table Parsing Fix

## Problem
When adding chart data to outline slides using tabular format, the data was being parsed incorrectly. For example:

**Input:**
```
Year    Market Revenue ($M)
1977    100
1982    3000
1983    3200
1985    100
```

**Expected:**
- X Values: 1977, 1982, 1983, 1985
- Y Values: 100, 3000, 3200, 100

**Actual (Before Fix):**
- All values were appearing as individual labels, creating a messy chart with:
  - "Year" as a data point
  - "1977" as a data point
  - "Market Revenue ($M)" as a data point
  - etc.

## Root Cause
The `_extract_chart_extractedData_from_content()` function in `/apps/backend/api/requests/api_outline_chat.py` only supported label:value pair formats like:
- "North America: 4.5M"
- "Online - 62%"
- "Q1 2024: $1,200,000"

It did NOT support tabular data with tabs or multiple spaces as column separators.

## Solution
Enhanced the `_extract_chart_extractedData_from_content()` function to:

1. **Detect tabular structure**: Checks if content contains tabs or multiple consecutive spaces
2. **Parse table rows**: Splits lines by tabs or 2+ spaces to extract cells
3. **Identify columns**: 
   - Analyzes which columns are numeric vs text
   - Finds first non-numeric column as labels
   - Finds first numeric column as values
4. **Filter headers**: Skips rows that look like header repetitions (containing keywords like "Year", "Revenue", "Market", etc. with no numeric value)
5. **Smart chart type detection**:
   - Detects time series data (Year, Month, Date, Quarter columns) → creates line charts
   - Detects percentages that sum to ~100 → creates pie charts
   - Otherwise → creates column charts

## Changes Made

### File: `/apps/backend/api/requests/api_outline_chat.py`

**Function:** `_extract_chart_extractedData_from_content(content: str, slide_title: str)`

**Key Improvements:**

1. **Table Detection** (lines 740-760)
   - Detects tab-separated data (`\t`)
   - Detects space-separated data (2+ consecutive spaces)
   - Preserves delimiters during initial parsing

2. **Smart Column Classification** (lines 766-815)
   - Analyzes header text for indicators:
     - **Numeric indicators**: $, %, revenue, sales, price, cost, value, amount, million, billion, etc.
     - **Label indicators**: name, label, category, region, year, month, quarter, date, time, period, type, group
   - Counts numeric vs text values in data rows
   - Prevents misclassification of year columns (e.g., "Year" column with "1977", "1982" data)
   - Falls back to using first column as labels if no clear label column is found

3. **Header Filtering** (lines 817-829)
   - Skips rows that repeat column names
   - Filters out keywords like "x value", "y value", "revenue", "sales", "year", etc. when they appear without valid numeric values

4. **Smart Chart Type Detection** (lines 831-842)
   - Detects **time series** data (year, month, date, quarter) → creates **line charts**
   - Detects **percentages** that sum to ~100 → creates **pie charts**
   - Defaults to **column charts** for other data

5. **Backward Compatibility** (lines 847-907)
   - Maintained support for existing label:value pair formats
   - Reduced minimum data points from 3 to 2 for better flexibility

## Testing

✅ **All Tests Passed!**

Tested the following scenarios:

### Test 1: Tab-Separated Table Data
**Input:**
```
Year	Market Revenue ($M)
1977	100
1982	3000
1983	3200
1985	100
```

**Result:** ✅ PASS
- Chart Type: **line** (correctly detected as time series)
- Data Points: 4
- Labels: 1977, 1982, 1983, 1985 ✅
- Values: 100.0, 3000.0, 3200.0, 100.0 ✅
- Title: "Video Game Market Growth Over Time"

### Test 2: Space-Separated Table Data  
**Input:**
```
Region    Revenue ($M)
North America    2500
Europe    1800
Asia    3200
```

**Result:** ✅ PASS
- Chart Type: **column**
- Data Points: 3
- Correctly extracted regions as labels and revenues as values

### Test 3: Label:Value Pairs (Backward Compatibility)
**Input:**
```
North America: 2500
Europe: 1800
Asia: 3200
```

**Result:** ✅ PASS
- Chart Type: **column**
- Data Points: 3
- Backward compatibility maintained

### Test 4: Percentage Data (Pie Chart Detection)
**Input:**
```
Category    Percentage
Mobile    35%
Desktop    45%
Tablet    20%
```

**Result:** ✅ PASS  
- Chart Type: **pie** (correctly detected percentages summing to 100)
- Data Points: 3
- Values normalized to 35%, 45%, 20%

## Impact

- ✅ Fixes chart data extraction from tabular outline content
- ✅ Supports both tab-separated and space-separated tables
- ✅ Automatically detects time series data for better chart type selection
- ✅ Filters out header rows that might be duplicated in content
- ✅ Backward compatible with existing label:value pair format
- ✅ Reduces minimum required data points from 3 to 2 for better flexibility

## Files Modified
- `/apps/backend/api/requests/api_outline_chat.py` - Enhanced `_extract_chart_extractedData_from_content()` function

## Additional Fix: Duplicate Label Detection

### Problem Extension
After the initial fix, another issue was discovered where data like this would fail:

```
X Value    Y Value
Market Size ($B)    15
Market Size ($B)    292.4
Market Size ($B)    252.6
```

All X values were "Market Size ($B)" (the column header repeated), creating a broken chart.

### Additional Fixes Applied

1. **Generic Axis Label Detection** (lines 773-784)
   - Filters out generic column headers like "X Value", "Y Value", "X", "Y"
   - Prevents these from being classified as numeric columns
   - Ensures proper label vs value column identification

2. **Duplicate Label Detection** (lines 867-877)
   - Detects when all labels are identical (column header repeated)
   - Detects when >50% of labels are duplicates that look like metrics
   - Auto-generates sequential labels ("Point 1", "Point 2", etc.)

3. **Header-Like Label Filtering** (lines 830-844)
   - Enhanced filtering for labels that look like column headers
   - Checks for metric keywords with currency symbols (e.g., "Market Size ($B)")
   - Falls back to auto-generated labels if all labels are filtered

4. **Auto-Label Generation Fallback** (lines 851-860)
   - Creates data points with sequential labels when all labels are filtered as headers
   - Preserves numeric values while replacing invalid labels

### Test Results for Duplicate Labels

✅ **Test: Market Size Data with Repeated Headers**
```
X Value	Y Value
Market Size ($B)	15
Market Size ($B)	292.4
Market Size ($B)	252.6
Market Size ($B)	11.49
Market Size ($B)	451.5
Market Size ($B)	22.48
Market Size ($B)	977.4
Market Size ($B)	4441.5
```

**Result:** ✅ PASS
- Chart Type: **column**
- Data Points: 8
- Labels: Point 1, Point 2, Point 3, Point 4, Point 5, Point 6, Point 7, Point 8 ✅
- Values: 15.0, 292.4, 252.6, 11.49, 451.5, 22.48, 977.4, 4441.5 ✅
- All labels unique ✅
- Chart renders as comparative column chart (not a broken vertical line) ✅

## Status
✅ **COMPLETE** - All tests passing, including duplicate label handling

## Date
October 20, 2025

