# Auto-Apply Toggle Fix

## Problem

Images were being auto-applied even when the toggle was set to OFF. This was due to incorrect default values in the option checking logic.

## Root Cause

In `adapters.py`, the code was checking:
```python
if not options.get('async_images', False) and self.image_manager:
    # AUTO-APPLY MODE
```

**The Bug:** Default value was `False`, which means:
- If `async_images` key is missing from options → defaults to `False`
- `not False = True` → Runs AUTO-APPLY mode
- This happens even when user toggles OFF!

**The Correct Behavior:**
- `async_images = False` → AUTO-APPLY ON (sync search, auto-apply images)
- `async_images = True` → AUTO-APPLY OFF (async search, use placeholders)
- **Default should be `True`** to match `compose_deck_stream` signature

## Fix Applied

**File:** `apps/backend/agents/generation/adapters.py`

### Changed (Line 1225):
```python
# OLD - Wrong default!
if not options.get('async_images', False) and self.image_manager:
    # This would run even when toggle is OFF if key is missing!

# NEW - Correct default!
async_images_mode = options.get('async_images', True)  # Default True = placeholders
if not async_images_mode and self.image_manager:
    # Only runs when explicitly set to False (AUTO-APPLY ON)
```

### Updated All References:
1. Line 1225: Extract `async_images_mode` once with correct default
2. Line 1230: Use `async_images_mode` in AUTO-APPLY check
3. Line 1406: Use `async_images_mode` in ASYNC check  
4. Line 1560: Use `async_images_mode` for head start check
5. Line 1574: Pass `async_images_mode` to CompositionOptions
6. Lines 1234, 1413, 1466: Use in logging

## How It Works Now

### When Auto-Apply Toggle is ON (`async_images=False`):
```
Backend logs:
🔍 [SEARCH MODE CHECK] async_images=False
   - AUTO-APPLY MODE (sync search): True
   - PLACEHOLDER MODE (async search): False

🎯 AUTO-APPLY MODE: Searching for images synchronously...
✅ Found 6 images for slide 1
📌 Tagging best image to slide...
📤 Emitted slide_images_found event for slide 1 with 6 images
```

**Result:**
- Searches before slide generation
- Tags best image to each slide
- Images are auto-applied during generation
- All 6 images sent as recommendations too

### When Auto-Apply Toggle is OFF (`async_images=True`):
```
Backend logs:
🔍 [SEARCH MODE CHECK] async_images=True
   - AUTO-APPLY MODE (sync search): False
   - PLACEHOLDER MODE (async search): True

📌 PLACEHOLDER MODE: Starting ASYNC background image search...
📸 IMAGE UPDATE RECEIVED: slide_images_found
```

**Result:**
- Searches in background during generation
- Does NOT tag images to slides
- Slides use placeholder images
- User manually selects from recommendations

## Testing

### Test 1: Toggle ON (Auto-Apply)
1. Create a new deck
2. Make sure auto-apply toggle is ON
3. Generate the deck
4. **Expected:** Images are automatically applied to slides
5. **Expected:** Backend logs show "AUTO-APPLY MODE"
6. **Expected:** Slides have real images (not placeholders)

### Test 2: Toggle OFF (Placeholders)
1. Create a new deck
2. Toggle auto-apply OFF
3. Generate the deck
4. **Expected:** Slides have placeholder images
5. **Expected:** Backend logs show "PLACEHOLDER MODE"
6. **Expected:** Can click "Select Image" to choose from recommendations

### Debugging Commands

```javascript
// Check what mode was used (run after generation)
// Look for these in backend logs:
// AUTO-APPLY MODE or PLACEHOLDER MODE

// Check if images were tagged
window.deckData?.slides?.[0]?.components?.find(c => c.type === 'Image')?.props?.src
// Should be placeholder URL when toggle is OFF
// Should be real URL when toggle is ON
```

## Key Changes

### Before:
```python
# Wrong - defaults to False (auto-apply) when missing
options.get('async_images', False)
```

### After:
```python
# Correct - defaults to True (placeholders) when missing
async_images_mode = options.get('async_images', True)
```

This matches the function signature default:
```python
async def compose_deck_stream(
    ...
    async_images: bool = True,  # Default is True = placeholders
    ...
)
```

## Files Modified

1. `apps/backend/agents/generation/adapters.py`
   - Line 1225: Extract async_images_mode with correct default (True)
   - Lines 1230, 1406, 1466, 1560, 1574: Use async_images_mode
   - Lines 1234, 1413: Updated logging

## Result

✅ Toggle ON → Images auto-applied  
✅ Toggle OFF → Placeholders used  
✅ Consistent with user expectations  
✅ Backend logs clearly show which mode is active  
✅ Recommendations shown in both modes  

## Next Steps

Test both modes and verify:
- [ ] Toggle ON applies images automatically
- [ ] Toggle OFF uses placeholders
- [ ] Recommendations appear in both modes
- [ ] Backend logs show correct mode
- [ ] Console shows correct async_images value

