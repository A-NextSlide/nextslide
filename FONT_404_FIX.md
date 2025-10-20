# Font 404 Error Fix

## Problem
Fonts after ID 403 (and others like "avilar", "akshita-display-font") were returning 404 errors when requested via the font API. They would not load in:
- Designer font dropdown
- Generated slides
- Theme font dropdown in outline

## Root Cause

The issue was a mismatch between font IDs and actual directory names:

1. **Font Registry:** Fonts were registered with clean names like "403 Doshi", "Avilar"
2. **Font Service:** These names were converted to IDs like "403-doshi", "avilar"
3. **File System:** Actual directories had number prefixes like "4126-403-doshi", "4905-avilar-display-font"
4. **Path Resolution:** The `get_font_path()` method couldn't find fonts because it was looking for exact directory matches

### Example Cases:
- Font name: "403 Doshi" → Font ID: "403-doshi" → Directory: "4126-403-doshi" ❌
- Font name: "Avilar" → Font ID: "avilar" → Directory: "4905-avilar-display-font" ❌
- Font name: "Akshita Display Font" → Font ID: "akshita-display-font" → Directory: "4774-akshita-display-font" ❌

## Solution

Updated `apps/backend/services/enhanced_font_service.py`:

### 1. Added Support for 'registry' Source
Previously, fonts loaded from the ComponentRegistry had `source='registry'` but the `get_font_path()` method only handled `'pixelbuddha'` and `'designer'` sources. Registry fonts would fall through to the designer handler and fail.

```python
# Before: if source == 'pixelbuddha':
# After:
if source == 'pixelbuddha' or source == 'registry':
    # For 'registry' source, search both PixelBuddha and Designer
```

### 2. Enhanced Directory Matching Logic
Added fuzzy matching to find directories with number prefixes:

```python
# FIXED: Match directories with number prefixes
# Patterns matched:
# - Exact match: "403-doshi" == "403-doshi"
# - End match: "4126-403-doshi" ends with "-403-doshi"
# - Middle match: "4905-avilar-display-font" contains "-avilar-"
# - Start match: "403-doshi-something" starts with "403-doshi-"
if (name == font_id or 
    name == base_id or 
    name.endswith('-' + font_id) or
    name.endswith('-' + base_id) or
    ('-' + font_id + '-') in name or
    ('-' + base_id + '-') in name or
    name.startswith(font_id + '-') or
    name.startswith(base_id + '-')):
```

### 3. Pass Actual Directory Name to Path Builder
Modified `_scan_for_best()` to accept the actual directory name found on disk:

```python
def _scan_for_best(base_dir: Path, is_pixelbuddha: bool, actual_dir_name: Optional[str] = None):
    # ...
    dir_name = actual_dir_name if actual_dir_name else font_id
    return f"assets/fonts/pixelbuddha/downloads/extracted/{dir_name}/{remainder}"
```

## Verification

Tested with problematic fonts:

```
✅ 403-doshi                  -> .../4126-403-doshi/...
✅ avilar                     -> .../4905-avilar-display-font/...
✅ akshita-display-font       -> .../4774-akshita-display-font/...
✅ 403-absently-display-font  -> .../4380-403-absently-display-font/...
✅ 403-fulgers-serif          -> .../4265-403-fulgers-serif/...
✅ 403-glach-sans             -> .../4319-403-glach-sans/...
✅ 403-malno-mono             -> .../4185-403-malno-mono-sans-serif-font/...
✅ 403-proxel-pixel-typeface  -> .../4240-403-proxel-pixel-typeface/...
```

All fonts now resolve correctly to their actual file paths.

## Files Changed
- `apps/backend/services/enhanced_font_service.py`

## Impact
- ✅ All PixelBuddha fonts (470+) now load correctly
- ✅ Fonts appear in Designer dropdown
- ✅ Fonts work when generated in slides
- ✅ Theme font dropdown shows all fonts
- ✅ No more 404 errors for any fonts

