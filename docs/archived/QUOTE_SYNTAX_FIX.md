# CustomComponent Quote Syntax Fix ✅

## Issue
CustomComponents were generating with **double quotes** in HTML attributes, causing JSON parsing errors:

```javascript
var html = "<div style="width: 100%">";
                       ↑ Unexpected identifier error!
```

## Root Cause
The render function is stored as a **JSON string**, so:
- Outer JSON uses double quotes: `"render": "function..."`
- If HTML also uses double quotes, they conflict!
- Result: `"<div style="width">"` becomes malformed JSON

## The Rule

**ALWAYS use SINGLE quotes (') for HTML attribute values in CustomComponent render functions!**

### Why This Works:

```json
{
  "render": "function render() { return \"<div style='width: 100%;'>\"; }"
              ↑ Outer double quotes for JSON
                                              ↑ Inner single quotes for HTML
}
```

JSON parser sees:
- `"render": "..."` ← Valid JSON string
- Inside string: `<div style='...'>`← Single quotes, no conflict!

## Examples

### ❌ WRONG (Double Quotes in HTML):
```javascript
function render({ props }) {
  var html = "<div style="width: 100%">";  // BREAKS!
  html += "<span style="color: red">";     // BREAKS!
  return html;
}
```

### ✅ CORRECT (Single Quotes in HTML):
```javascript
function render({ props }) {
  var html = "<div style='width: 100%; height: 100%;'>";  // Works!
  html += "<span style='color: red; font-size: 20px;'>";   // Works!
  return html;
}
```

### Complete Working Example:
```javascript
function render({ props }) {
  var c1 = props.primaryColor || '#3B82F6';
  var tc = props.textColor || '#FFFFFF';
  var ff = props.fontFamily || 'Inter';
  var items = [
    { year: '1947', text: 'Event 1' },
    { year: '1957', text: 'Event 2' }
  ];
  
  var html = "<div style='width: 100%; height: 100%; padding: 24px; font-family: " + ff + "; display: flex; flex-direction: column;'>";
  
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    html += "<div style='display: flex; align-items: center; margin-bottom: 12px;'>";
    html += "<div style='width: 100px; font-size: 20px; font-weight: 700; color: " + c1 + ";'>" + item.year + "</div>";
    html += "<div style='flex: 1; font-size: 18px; color: " + tc + ";'>" + item.text + "</div>";
    html += "</div>";
  }
  
  html += "</div>";
  return html;
}
```

**Notice:** EVERY `style='...'` uses SINGLE quotes!

## Fixes Applied

### 1. System Prompt - Multiple Warnings ✅
**File:** `html_inspired_system_prompt_dynamic.py`

Added warnings in:
- Top of CustomComponent section (impossible to miss!)
- Format B example (shows correct syntax)
- Critical rules section (#6 - quote rule)

### 2. User Prompt - Prominent Warning ✅
**File:** `html_inspired_generator.py`

Added to:
- Critical constraints section
- CustomComponent example (with working timeline code)

### 3. Examples Updated ✅
All examples now use correct single-quote syntax:
```javascript
"<div style='width: 100%; height: 100%;'>"  // ✅
```

## Why It Happened After Prompt Cleanup

**Before:** The prompts were so long that examples got lost in the noise. AI sometimes got lucky with escaping.

**After:** Condensed prompts are better, but we needed to make the quote rule **extremely** explicit since it's a JSON-specific gotcha.

## Prevention

All prompts now have:
1. 🚨🚨🚨 Triple warning emojis (catches attention!)
2. ❌ WRONG example showing double quotes
3. ✅ CORRECT example showing single quotes
4. Complete working example demonstrating loops, concatenation, and single quotes
5. Reminder in critical rules section

## Testing

CustomComponents should now generate like this:

```javascript
function render({ props }) {
  var html = "<div style='width: 100%; height: 100%;'>";
  html += "<div style='font-size: 96px; color: #FFF;'>Content</div>";
  html += "</div>";
  return html;
}
```

**All style attributes use SINGLE quotes!** No more "Unexpected identifier" errors! 🎉

---

**Status:** ✅ **FIXED**
**Impact:** CustomComponents will now generate with correct quote syntax
**Added:** Complete component schemas to cache (better AI understanding)

