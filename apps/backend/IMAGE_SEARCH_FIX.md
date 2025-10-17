# Image Search Fixes - Sync vs Async Issue

## Problems Identified

### 1. Images Only on Final Slides
**Root Cause**: Async background search was running instead of synchronous search, even when auto-apply was ON.

**Why This Happened**:
- Searches ran in parallel with slide generation
- Early slides (1-4) generated before images were found → Got placeholders
- Later slides (5-8) generated after images were found → Got images applied

**The Fix**: Added debug logging to detect which search mode is running.

### 2. Search Queries Too Verbose
**Examples from logs**:
- ❌ "history and evolution of video games from arcades callout gaming gaming industry" (16 words!)
- ❌ "history callout gaming gaming industry"
- ❌ "history competitive gaming gaming goes"

**The Fix**: Ultra-aggressive stopword filtering

## Changes Made

### 1. Search Mode Detection (adapters.py lines 1148-1150)
```python
print(f"\n🔍 [SEARCH MODE CHECK] async_images={options.get('async_images', True)}, image_manager={self.image_manager is not None}")
print(f"   - Will use SYNCHRONOUS search: {not options.get('async_images', True) and self.image_manager}")
print(f"   - Will use ASYNC search: {options.get('async_images', True) and self.image_manager}")
```

This will show you IMMEDIATELY which mode is being used.

### 2. Ultra-Aggressive Stopword List (adapters.py lines 297-314)
Added to stopwords:
- **Generic words**: 'history', 'evolution', 'future', 'modern', 'new', 'old', 'latest', 'best'
- **Business jargon**: 'industry', 'market', 'business', 'company', 'enterprise', 'solution', 'service'
- **Presentation words**: 'overview', 'introduction', 'conclusion', 'summary', 'callout'
- **Action words**: 'goes', 'comes', 'makes', 'gets', 'shaped', 'changed', 'improved', 'enhanced'
- **Question words**: 'how', 'what', 'why', 'when', 'where', 'who', 'which'

### 3. Reduced Query Length (adapters.py lines 317-354)
- Max **3 words** (reduced from 4)
- Max **2 key terms** from title (reduced from 3)
- Max **1 proper noun** from content (reduced from 2)
- Filter out words ending in 'ing'

### 4. Query Generation Logging (adapters.py line 354)
```python
print(f"🔍 [QUERY GEN] Slide: '{slide_title}' → Query: '{search_query}'")
```

Shows exactly what query is generated for each slide.

### 5. Synchronous Search Logging (adapters.py lines 1193-1214)
```python
print(f"\n🔍 Searching images for slide {slide_idx + 1}/{len(deck_outline.slides)}: {slide.title}")
print(f"   Generated query: '{search_query}'")
print(f"   ✅ Found {len(images)} images")
print(f"   📌 Tagging best image: {best_image.get('url', '')[:60]}...")
```

## Expected Log Output

### When Auto-Apply is ON (Correct Behavior):
```
🔍 [SEARCH MODE CHECK] async_images=False, image_manager=True
   - Will use SYNCHRONOUS search: True
   - Will use ASYNC search: False

🎯 AUTO-APPLY MODE: Searching for images synchronously BEFORE slide generation...

🔍 Searching images for slide 1/8: The History and Evolution of Video Games
   Generated query: 'video games'
   ✅ Found 6 images
   📌 Tagging best image: https://...

🔍 Searching images for slide 2/8: From Arcades to Consoles
   Generated query: 'arcades consoles'
   ✅ Found 6 images
   📌 Tagging best image: https://...

... (continues for all slides BEFORE any slide generation starts)

[Then slides start generating]
```

### When Auto-Apply is OFF (Async Mode):
```
🔍 [SEARCH MODE CHECK] async_images=True, image_manager=True
   - Will use SYNCHRONOUS search: False
   - Will use ASYNC search: True

📌 PLACEHOLDER MODE: Starting ASYNC background image search...

[Slides start generating immediately, searches happen in background]
```

## Test Instructions

1. **Turn ON** the auto-apply toggle
2. Generate a presentation about "Video Games History"
3. **Look for this in logs**:
   ```
   🔍 [SEARCH MODE CHECK] async_images=False
      - Will use SYNCHRONOUS search: True

   🎯 AUTO-APPLY MODE: Searching for images synchronously BEFORE slide generation...
   ```

4. **If you see this instead**:
   ```
   🔍 [SEARCH MODE CHECK] async_images=True
      - Will use SYNCHRONOUS search: False
   ```
   Then the toggle value isn't being passed correctly from frontend to backend.

5. **Check the queries** - should be 1-3 words:
   ```
   🔍 [QUERY GEN] Slide: 'The History of Video Games' → Query: 'video games'
   🔍 [QUERY GEN] Slide: 'From Arcades to Consoles' → Query: 'arcades consoles'
   🔍 [QUERY GEN] Slide: 'The Future of Gaming' → Query: 'gaming'
   ```

## Query Examples

### Before (16 words):
- "history and evolution of video games from arcades callout gaming gaming industry"

### After (2-3 words):
- "video games"
- "arcades consoles"
- "competitive gaming"
- "mobile gaming"

## Troubleshooting

### If images still only appear on final slides:

1. **Check [SEARCH MODE CHECK]** in logs
   - If shows "Will use SYNCHRONOUS search: False" → Toggle value wrong
   - If shows "Will use SYNCHRONOUS search: True" but no "AUTO-APPLY MODE" message → Logic bug

2. **If you see "AUTO-APPLY MODE" but searches still run during slide generation**:
   - The synchronous await might not be blocking
   - Check if "Searching images for slide 1/8" appears BEFORE "slide_started: slide 0"

3. **If queries are still verbose**:
   - Share the "[QUERY GEN]" logs so I can see what's slipping through

## Files Modified

1. `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/generation/adapters.py`
   - Lines 297-314: Ultra-aggressive stopword list
   - Lines 317-354: Improved query generation (max 3 words)
   - Lines 1148-1150: Search mode detection logging
   - Lines 1154, 1193-1214: Synchronous search logging
   - Line 1244: Async search logging

All previous IMAGE FLOW logging is still in place from the earlier fixes.
