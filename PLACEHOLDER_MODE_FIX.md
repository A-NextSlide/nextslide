# Placeholder Mode Fix - Images Auto-Applying Even When Toggle OFF

## The Bug

Images were being auto-applied even when the toggle was set to OFF (placeholder mode).

## Root Cause

**File:** `apps/backend/agents/generation/slide_generator.py` (Line 701-704)

The code was calling `_apply_available_images_to_placeholders()` when `async_images=True`:

```python
# OLD CODE - WRONG!
elif context.available_images and context.async_images:
    # This says "placeholder mode" but then APPLIES images!
    self._apply_available_images_to_placeholders(slide_data, context.available_images)
```

**The Problem:**
- `async_images=True` means "use PLACEHOLDERS" (toggle OFF)
- But it was calling a function that REPLACES placeholders with actual images
- Result: Images auto-applied regardless of toggle setting

## The Fix

**Lines 701-712:**

```python
# NEW CODE - CORRECT!
elif context.async_images:
    # PLACEHOLDER MODE: DO NOT apply images
    print(f"\n📌 [IMAGE FLOW 4/4] PLACEHOLDER MODE - keeping images as placeholders (NOT auto-applying)")
    print(f"   - async_images=True → Images stay as placeholders")
    
    # Store available images in slide_data but DON'T apply to components
    if context.available_images:
        slide_data['availableImages'] = context.available_images
        logger.info(f"[IMAGE FLOW 4/4] ✅ Stored {len(context.available_images)} available images (not applied)")
```

**What Changed:**
1. ❌ Removed call to `_apply_available_images_to_placeholders()`
2. ✅ Just store images in `slide_data['availableImages']`
3. ✅ Images remain as placeholders in components
4. ✅ Frontend cache still gets populated for recommendations

## How It Works Now

### Toggle ON (async_images=False):
```
Backend logs:
✅ [IMAGE FLOW 4/4] AUTO-APPLY MODE - replacing placeholders with 1 tagged media items
   - Tagged media 1: image.jpg - URL: https://example.com/image.jpg
```

**Result:**
- Images are APPLIED to components
- Slides have real image URLs
- User sees images automatically

### Toggle OFF (async_images=True):
```
Backend logs:
📌 [IMAGE FLOW 4/4] PLACEHOLDER MODE - keeping images as placeholders (NOT auto-applying)
   - async_images=True → Images stay as placeholders
   - Available images: 100 (stored for manual selection)
✅ Stored 100 available images (not applied to components)
```

**Result:**
- Images remain as `src="placeholder"`
- Slides show placeholder UI
- User can click "Select Image" to choose from 100 recommendations

## Testing

### Test 1: Toggle OFF (Placeholder Mode)

1. Set auto-apply toggle to OFF
2. Create a deck
3. **Expected Backend Logs:**
   ```
   📌 PLACEHOLDER MODE - keeping images as placeholders (NOT auto-applying)
   ```

4. **Expected in Slides:**
   - Images show placeholder icon
   - "Select Image" button appears
   - NOT auto-applied

5. **Expected in ImagePicker:**
   - Click "Select Image"
   - "Recommended" tab appears
   - Shows 100 images
   - Can manually select

### Test 2: Toggle ON (Auto-Apply Mode)

1. Set auto-apply toggle to ON
2. Create a deck
3. **Expected Backend Logs:**
   ```
   ✅ AUTO-APPLY MODE - replacing placeholders with tagged media
   ```

4. **Expected in Slides:**
   - Images auto-applied
   - Real images visible
   - No "Select Image" button

## Frontend Console Output

You should see:
```
✅ Successfully cached 100 images for slide 48063bea-fa0c-458c-9b19-4b969fa51aaa
   - Total cache entries: 24
```

**When clicking "Select Image":**
```
[getCurrentSlideImages] Looking for images for slide: 48063bea-fa0c-...
[getCurrentSlideImages] Cache keys: ['48063bea-...', 'fea5941b-...', ...]
[getCurrentSlideImages] Direct cache lookup: 100 images
```

**In ImagePicker:**
- ✅ "Recommended" tab appears
- ✅ Shows 100 images in grid
- ✅ Can select manually

## Summary

**The Issue:** Function was applying images in placeholder mode  
**The Fix:** Don't call that function, just store `availableImages`  
**The Result:** Toggle now works correctly

| Mode | async_images | Backend Logs | Result |
|------|-------------|--------------|---------|
| Auto-Apply ON | `False` | "AUTO-APPLY MODE" | Images applied |
| Auto-Apply OFF | `True` | "PLACEHOLDER MODE" | Images stay as placeholders |

## File Modified

**`apps/backend/agents/generation/slide_generator.py`** (Lines 701-712)

Changed from calling `_apply_available_images_to_placeholders()` to just storing images in `slide_data['availableImages']` without applying them.

## Next Generation

On your next deck generation with toggle OFF:
- ✅ Images will be placeholders
- ✅ Recommendations will be cached (100 per slide)
- ✅ "Recommended" tab will show in ImagePicker
- ✅ You can manually select from recommendations
- ✅ No auto-application!

Test it now! 🎯

