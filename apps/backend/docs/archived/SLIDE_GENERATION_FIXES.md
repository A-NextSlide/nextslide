# Slide Generation Crash Fixes

## Issue Summary
Outline generation was creating 6 slides correctly, but only 1 slide was appearing in the deck due to crashes during slide generation for 5 out of 6 slides.

## Error Details
```
ERROR - Error generating slide X: 'str' object has no attribute 'get'
```

This occurred during font enforcement when processing TiptapTextBlock components.

---

## Root Cause Analysis

### 1. Font Enforcement Crash
**Location**: `apps/backend/agents/generation/slide_generator.py` line 2319

**Problem**: 
When AI generated TiptapTextBlock with incorrect tiptap document format:
```json
{
  "texts": {
    "type": "doc",
    "content": [...]
  }
}
```

Instead of the correct array format:
```json
{
  "texts": [
    {"text": "Hello", "style": {}},
    {"text": "World", "style": {}}
  ]
}
```

The code would iterate over the dict keys (`'type'`, `'content'`) as strings, then try to call `.get()` on these strings, causing the crash.

**Code Location**:
```python
texts = props.get('texts', []) or []
for t in texts:  # If texts is dict, t becomes 'type' or 'content' (strings)
    max_size = max((t.get('fontSize', 0) ...))  # CRASH: str has no .get()
```

### 2. Shape Text Validation Errors
**Problem**: 
AI was generating incomplete style objects for Shape texts, missing required fields:
- `highlight` (boolean, not null)
- `subscript` (boolean)
- `superscript` (boolean)
- `color` (string)
- `link` (boolean)
- `href` (string, not null, use empty string)

---

## Fixes Applied

### Fix 1: Safe Texts Iteration (Line 2319)
```python
# Before (CRASH when texts is dict)
max_size = max((t.get('fontSize', 0) or 0 for t in texts), default=...)

# After (SAFE)
if isinstance(texts, list):
    max_size = max((t.get('fontSize', 0) or 0 for t in texts if isinstance(t, dict)), default=...)
else:
    max_size = (props.get('fontSize') or 0) or 0
```

### Fix 2: Safe Texts Iteration (Line 1088)
```python
# Before (CRASH when texts is dict)
for t in texts:
    val = str((t or {}).get('text') or '').strip()

# After (SAFE)
if isinstance(texts, list):
    for t in texts:
        if isinstance(t, dict):
            val = str((t or {}).get('text') or '').strip()
```

### Fix 3: Safe Texts Iteration (Line 2364)
```python
# Before (CRASH when texts is dict)
for t in texts:
    color = t.get('color')

# After (SAFE)
if texts and isinstance(texts, list):
    for t in texts:
        if not isinstance(t, dict):
            continue
        color = t.get('color')
```

### Fix 4: Complete Shape Text Style Example
Updated prompts to include ALL required fields:
```json
{
  "texts": [{
    "text": "Key Insight",
    "style": {
      "textColor": "#FFFFFF",
      "backgroundColor": "transparent",
      "bold": true,
      "italic": false,
      "underline": false,
      "strike": false,
      "highlight": false,     // boolean, not null
      "subscript": false,     // boolean
      "superscript": false,   // boolean
      "color": "#FFFFFF",     // string (duplicate of textColor for compatibility)
      "link": false,          // boolean
      "href": ""              // string (empty, not null)
    }
  }]
}
```

### Fix 5: Added Explicit TiptapTextBlock Format Warning
Added to system prompt:
```
TiptapTextBlock - PRIMARY way to add text!
  CRITICAL: props.texts MUST be an ARRAY of text segments, NOT a tiptap document!
  WRONG ❌: {"texts": {"type": "doc", "content": [...]}}
  CORRECT ✅: {"texts": [{"text": "Hello", "style": {}}, {"text": "World", "style": {}}]}
```

---

## Files Modified

1. `apps/backend/agents/generation/slide_generator.py`
   - Fixed 3 locations where texts iteration could crash
   - Added `isinstance()` checks before iterating
   - Added dict type checks inside loops

2. `apps/backend/agents/generation/html_inspired_generator.py`
   - Updated Shape text style example with all required fields
   - Changed `null` to `false` for boolean fields
   - Changed `null` to `""` for string fields

3. `apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py`
   - Updated Shape text style example with all required fields
   - Added explicit warning about TiptapTextBlock format
   - Showed WRONG vs CORRECT examples

---

## Expected Behavior After Fixes

### Before
- Outline generates 6 slides
- 5 slides crash during generation
- Only 1 slide appears in the deck
- Error: `'str' object has no attribute 'get'`

### After  
- Outline generates 6 slides
- All 6 slides generate successfully
- All 6 slides appear in the deck
- No crashes during font enforcement or text processing

---

## Prevention

The code now has defensive checks in 3 critical locations:
1. **Line 1088**: Quiz text extraction
2. **Line 2319**: Letter spacing calculation
3. **Line 2364**: Color enforcement on text segments

All locations now:
- Check if `texts` is a list before iterating
- Check if each item is a dict before calling `.get()`
- Handle gracefully when format is unexpected

---

## Testing

To verify the fix:
1. Generate a presentation with detailed mode (should create 6+ slides)
2. All slides should generate successfully
3. Check logs - should see no `'str' object has no attribute 'get'` errors
4. All slides should appear in the deck

---

## Additional Notes

The validation warnings for TiptapTextBlock are still present but won't cause crashes. The component validator handles these gracefully and the slides will still render, though the AI should be generating the correct format based on the updated prompts.


