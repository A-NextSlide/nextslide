# Invalid "fonts" Font Name Fix

## Problem
Theme generator was selecting an invalid font name "fonts" (literal string):
```
Theme fonts extracted: {'hero': 'fonts', 'body': 'Open Sans'}
```

This caused:
- Invalid font rendering
- Fallback to default fonts
- Poor typography quality
- Validator warnings

## Root Cause
Font selection process was returning invalid font names without validation.

Possible sources:
1. Brand scraping returning malformed data
2. AI font generation producing invalid output
3. Metadata containing corrupted font names
4. Missing validation before theme composition

## Solution Implemented

### 1. Added Font Name Validation Method

**File**: `apps/backend/agents/generation/theme_director_new.py`

**New Method** (lines 902-916):
```python
def _validate_font_name(self, font_name: str) -> str:
    """Validate font name and return safe fallback if invalid."""
    if not font_name or not isinstance(font_name, str):
        logger.warning(f"⚠️  Invalid font (empty or wrong type): {font_name} → Using Montserrat")
        return 'Montserrat'
    
    # List of obviously invalid font names
    invalid_fonts = ['fonts', 'font', 'font family', 'fontfamily', 'default', 'none', 'null']
    
    if font_name.lower().strip() in invalid_fonts:
        logger.warning(f"⚠️  Invalid font name detected: '{font_name}' → Using Montserrat")
        print(f"⚠️  INVALID FONT NAME: '{font_name}' → Replaced with Montserrat")
        return 'Montserrat'
    
    return font_name
```

### 2. Applied Validation in Theme Composition

Updated both theme composition paths (Huemint and Brand) to validate fonts:

**Before**:
```python
'hero_title': {
    'family': font_result.get('hero', 'Montserrat'),  # No validation!
}
```

**After**:
```python
'hero_title': {
    'family': self._validate_font_name(font_result.get('hero', 'Montserrat')),
}
```

### 3. Fixed Playful Font Registry Validation

Updated playful font combos to:
1. Check against available fonts registry
2. Only use fonts that actually exist
3. Fall back to next combo if fonts missing
4. Ultimate fallback to Bebas Neue + Poppins

**Added** (lines 412-470):
```python
# Get available fonts to validate our choices
available_fonts = RegistryFonts.get_available_fonts(registry)
available_fonts_lower = {f.lower(): f for f in available_fonts}

# Validate combo exists, otherwise try next one
for attempt in range(len(playful_combos)):
    combo_idx = (seed_hash + attempt) % len(playful_combos)
    selected_combo = playful_combos[combo_idx]
    
    hero_exists = selected_combo['hero'].lower() in available_fonts_lower
    body_exists = selected_combo['body'].lower() in available_fonts_lower
    
    if hero_exists and body_exists:
        # Use properly cased names from registry
        font_result = {
            'hero': available_fonts_lower[selected_combo['hero'].lower()],
            'body': available_fonts_lower[selected_combo['body'].lower()],
            ...
        }
        break
```

## Invalid Font Names Blocked

The validator now blocks these invalid strings:
- `fonts` ❌
- `font` ❌
- `font family` ❌
- `fontfamily` ❌
- `default` ❌
- `none` ❌
- `null` ❌

## Validation Points

Font validation now happens at 3 levels:

### Level 1: Font Selection (theme_director_new.py)
- Validates playful fonts exist in registry
- Checks available_fonts before assigning
- Falls back to next combo if missing

### Level 2: Theme Composition (theme_director_new.py)
- Validates font names using `_validate_font_name()`
- Replaces invalid names with 'Montserrat'
- Logs warnings for debugging

### Level 3: Component Validation (component_validator.py)
- Final safety check at component level
- Already had validation (line 153)
- Replaces invalid fonts in components

## Expected Results

### Before:
```
Font Selection: hero='fonts', body='Open Sans'  ❌
Theme: hero_title.family = 'fonts'  ❌
Components: fontFamily = 'fonts' → Validator fixes to 'Inter'
```

### After:
```
Font Selection: hero='Fredoka', body='Quicksand'  ✅
Validation: 'Fredoka' is valid  ✅
Theme: hero_title.family = 'Fredoka'  ✅
Components: fontFamily = 'Fredoka' → No fix needed  ✅
```

### If Invalid Detected:
```
Font Selection: hero='fonts', body='Open Sans'  ❌
Validation: 'fonts' is INVALID  ⚠️
⚠️  INVALID FONT NAME: 'fonts' → Replaced with Montserrat
Theme: hero_title.family = 'Montserrat'  ✅
Components: fontFamily = 'Montserrat' → Valid  ✅
```

## Logging

When invalid font detected:
```
⚠️  Invalid font name detected: 'fonts' → Using Montserrat
⚠️  INVALID FONT NAME: 'fonts' → Replaced with Montserrat
```

When playful combo missing:
```
⚠️  Combo 0 has missing fonts: hero_exists=False, body_exists=True
⚠️  Combo 1 has missing fonts: hero_exists=True, body_exists=False
✅ Selected playful fonts: Hero=Bebas Neue, Body=Nunito
```

## Files Modified

1. **`apps/backend/agents/generation/theme_director_new.py`**
   - Line 902-916: Added `_validate_font_name()` method
   - Line 412-470: Enhanced playful font validation
   - Line 563, 568, 630, 635: Applied validation to theme composition

## Testing

Generate a Pikachu deck and verify:
- ✅ Font should be valid (Fredoka, Bebas Neue, Bungee, etc.)
- ❌ Should NEVER see "fonts" as font name
- ✅ Logs show validation and selection process
- ✅ Theme has valid typography.hero_title.family

## Related Fixes

This fix works together with:
- Playful font detection (also in theme_director_new.py)
- Component validator (already had invalid font list)
- EnhancedFontService (fallback mechanism)

All 3 levels now work together to prevent invalid font names!

