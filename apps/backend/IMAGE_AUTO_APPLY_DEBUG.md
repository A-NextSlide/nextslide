# Image Auto-Apply Debugging - Complete Flow Trace

## Problem
User reported that the auto-apply images toggle isn't working correctly:
- **Toggle ON (auto-apply)**: Images should be applied automatically but showing as placeholders
- **Toggle OFF (manual selection)**: Images were being auto-applied instead of showing "Select Image" button

## Changes Made

### 1. Fixed Image Replacement Logic
**File**: `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/generation/slide_generator.py`
**Lines**: 675-693

**BEFORE** (HEAD~1):
```python
# Handle images - either apply tagged media or attach available images for frontend selection
# Model-only: skip image replacements/attachments; keep placeholders
```
The comment said to skip, and NO actual code was calling the replacement methods.

**AFTER** (Current):
```python
if context.tagged_media and not context.async_images:
    logger.info(f"[IMAGE FLOW 4/4] ✅ APPLYING TAGGED MEDIA - replacing placeholders with {len(context.tagged_media)} tagged media items")
    self._apply_tagged_media_to_images(slide_data, context.tagged_media)
elif context.available_images and context.async_images:
    logger.info(f"[IMAGE FLOW 4/4] Placeholder mode - attaching {len(context.available_images)} available images for selection")
    self._apply_available_images_to_placeholders(slide_data, context.available_images)
```

### 2. Improved Search Query Generation
**File**: `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/generation/adapters.py`
**Lines**: 249-331

- Added aggressive stopword filtering (including 'legendary', 'journey', 'story', 'hero', 'icon')
- Reduced query to max 4 key words
- Example: "the legendary journey of goku: saiyan hero and dragon ball icon" → "Goku Saiyan Dragon Ball"

### 3. Best Image Selection (1 instead of 3)
**File**: `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/generation/adapters.py`
**Lines**: 1166-1192

Changed from tagging 3 images to tagging ONLY the BEST image (first search result).

### 4. Reduced Image Frequency in Prompts
**File**: `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py`
**Lines**: 37-46

Changed from "USE 70%+ slides!" to "USE STRATEGICALLY - 30-40% of slides".

**File**: `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`
**Lines**: 422-445, 1870-1875

Same changes for cached prompts.

### 5. Added Comprehensive Debug Logging

#### **[IMAGE FLOW 1/4]** - Image Tagging
**File**: `adapters.py`, **Lines**: 1189-1192
```python
logger.info(f"✅ [IMAGE FLOW 1/4] Tagged BEST image to slide {slide_idx + 1}")
logger.info(f"   - URL: {best_image.get('url', '')[:100]}")
logger.info(f"   - taggedMedia count on slide: {len(slide.taggedMedia)}")
logger.info(f"   - slide.id: {slide.id}")
```

#### **[IMAGE FLOW 2/4]** - Context Creation
**File**: `adapters.py`, **Lines**: 108-112
```python
logger.info(f"[IMAGE FLOW 2/4] Creating context for slide {slide_index + 1}")
logger.info(f"   - async_images: {async_images} (False=auto-apply ON)")
logger.info(f"   - tagged_media count: {len(tagged_media_for_context)}")
if tagged_media_for_context:
    logger.info(f"   - First tagged_media URL: {tagged_media_for_context[0].get('previewUrl', 'none')[:100]}")
```

#### **[AI OUTPUT]** - What AI Generated
**File**: `slide_generator.py`, **Lines**: 123-126
```python
logger.info(f"[AI OUTPUT] Slide {context.slide_index + 1} - AI generated {len(slide_data.get('components', []))} components")
image_components_count = sum(1 for c in slide_data.get('components', []) if c.get('type') == 'Image')
placeholder_count = sum(1 for c in slide_data.get('components', []) if c.get('type') == 'Image' and c.get('props', {}).get('src') in ['placeholder', ''])
logger.info(f"[AI OUTPUT]   - Image components: {image_components_count}, with placeholder src: {placeholder_count}")
```

#### **[IMAGE FLOW 3/4]** - Post-Processing Check
**File**: `slide_generator.py`, **Lines**: 676-679
```python
logger.info(f"[IMAGE FLOW 3/4] Post-processing image replacement check for slide {context.slide_index + 1}")
logger.info(f"   - async_images: {context.async_images} (False=auto-apply ON)")
logger.info(f"   - tagged_media count: {len(context.tagged_media) if context.tagged_media else 0}")
logger.info(f"   - available_images count: {len(context.available_images) if context.available_images else 0}")
```

#### **[IMAGE FLOW 4/4]** - Replacement Execution
**File**: `slide_generator.py`, **Lines**: 682-693

Shows whether replacement is happening or why it's skipped.

#### **[IMAGE REPLACEMENT]** - Detailed Component Analysis
**File**: `slide_generator.py`, **Lines**: 3181-3241

Shows:
- All components in the slide
- Which are Image type
- Which have `src="placeholder"`
- Actual URL replacement

## Testing Instructions

### Test 1: Auto-Apply ON (Toggle ON)
1. Turn ON the "Auto Select Images" toggle in frontend
2. Generate a presentation about "Dragon Ball Z Goku"
3. Check backend logs for this sequence:

```
[IMAGE FLOW 1/4] Tagged BEST image to slide X
   - URL: https://...
[IMAGE FLOW 2/4] Creating context for slide X
   - async_images: False (False=auto-apply ON)
   - tagged_media count: 1
[AI OUTPUT] Slide X - AI generated N components
   - Image components: 1, with placeholder src: 1
[IMAGE FLOW 3/4] Post-processing image replacement check
   - async_images: False
   - tagged_media count: 1
[IMAGE FLOW 4/4] ✅ APPLYING TAGGED MEDIA
[IMAGE REPLACEMENT] Found X placeholder image components
[IMAGE REPLACEMENT] ✓ Successfully replaced placeholder
```

**Expected Result**: Images should appear automatically on slides

### Test 2: Auto-Apply OFF (Toggle OFF)
1. Turn OFF the "Auto Select Images" toggle in frontend
2. Generate the same presentation
3. Check backend logs for:

```
[IMAGE FLOW 2/4] Creating context for slide X
   - async_images: True (True=placeholders)
   - tagged_media count: 0
[AI OUTPUT] Slide X - AI generated N components
   - Image components: 1, with placeholder src: 1
[IMAGE FLOW 3/4] Post-processing image replacement check
   - async_images: True
[IMAGE FLOW 4/4] Placeholder mode - attaching available images
```

**Expected Result**: Images should show as placeholders with "Select Image" button

## Troubleshooting

### If images still show as placeholders when toggle is ON:

1. **Check [IMAGE FLOW 1/4]**: Are images being tagged?
   - If NO → Image search is failing or not running
   - If YES → Continue to next check

2. **Check [IMAGE FLOW 2/4]**: Is tagged_media in context?
   - If `tagged_media count: 0` → Tagged media not being passed to context
   - If `tagged_media count: 1+` → Continue to next check

3. **Check [AI OUTPUT]**: Is AI creating Image components?
   - If `Image components: 0` → AI not following prompt to create images
   - If `Image components: 1+` but `placeholder src: 0` → AI putting actual URLs instead of "placeholder"
   - If `placeholder src: 1+` → Continue to next check

4. **Check [IMAGE FLOW 4/4]**: Is replacement executing?
   - If "NO IMAGE REPLACEMENT" → Logic bug in conditional
   - If "APPLYING TAGGED MEDIA" → Check [IMAGE REPLACEMENT] logs

5. **Check [IMAGE REPLACEMENT]**: What's happening in replacement?
   - If "No placeholder images found" → Component type mismatch or src value wrong
   - If "Successfully replaced placeholder" → Images should be appearing!

## Key Technical Details

### Toggle Logic (INVERTED!)
- Frontend `autoSelectImages=true` → Backend `async_images=false` → Auto-apply ON
- Frontend `autoSelectImages=false` → Backend `async_images=true` → Placeholders

### Flow Sequence (Auto-Apply ON)
1. Frontend sends `async_images=false`
2. Adapters search images BEFORE slide generation (lines 1135-1203)
3. Images tagged to `slide.taggedMedia` (lines 1176-1192)
4. Context created with `tagged_media` from `slide.taggedMedia` (lines 102-125)
5. AI generates slide with `src="placeholder"` (lines 122-126)
6. Post-processing replaces placeholders with actual URLs (lines 675-693)

### Architecture
- **SlideGeneratorV2** is used (confirmed via adapters.py line 43)
- **HTMLInspiredSlideGenerator** wraps it (adapters.py line 56)
- **Prompt file**: `html_inspired_system_prompt_dynamic.py` (NOT v2)

## Files Modified

1. `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/generation/slide_generator.py`
   - Lines 122-126: AI output logging
   - Lines 675-693: Image replacement logic (CRITICAL FIX)
   - Lines 3179-3211: Enhanced replacement logging

2. `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/generation/adapters.py`
   - Lines 102-125: Context creation logging
   - Lines 249-331: Smart search query generator
   - Lines 1166-1192: Best image selection

3. `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py`
   - Lines 37-46: Strategic image usage rules

4. `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`
   - Lines 422-445, 1870-1875: Strategic image usage rules (cached)

## Next Steps

1. **Run the backend** with these changes
2. **Test both toggle states** (ON and OFF)
3. **Share the logs** showing the complete [IMAGE FLOW 1/4] → [IMAGE FLOW 4/4] sequence
4. **Identify where the flow breaks** using the troubleshooting guide above
