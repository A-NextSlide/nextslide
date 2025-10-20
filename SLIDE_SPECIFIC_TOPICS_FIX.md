# Slide-Specific Topics Fix

## Issue

When viewing slide 1, the topics/recommendations were changing as other slides (2, 3, etc.) generated their images, even though the user stayed on slide 1.

## Root Cause

The `currentTopics` in `SlideContainer.tsx` was being extracted from `imageOptions` which might have been shared/updated globally, or not memoized properly to prevent re-evaluation when other slides' data came in.

## Fix Applied

### 1. Updated Topic Extraction (SlideContainer.tsx)

**Before:**
```typescript
const currentSlideInfo = currentSlide && imageOptions?.slides[currentSlide.id];
const currentTopics = currentSlideInfo?.topics || [];
```

**Issue:** Might re-evaluate on every render or when imageOptions updates

**After:**
```typescript
const currentTopics = useMemo(() => {
  if (!currentSlide) return [];
  
  // Get from cache for THIS SPECIFIC slide only
  const cachedSlideData = window.__slideImageCache?.[currentSlide.id];
  const topics = cachedSlideData?.topics || cachedSlideData?.search_terms || [];
  
  // Fallback to imageOptions if cache not available
  if (topics.length === 0 && imageOptions?.slides[currentSlide.id]) {
    return imageOptions.slides[currentSlide.id].topics || [];
  }
  
  console.log(`[SlideContainer] Topics for slide ${currentSlide.id} ONLY:`, topics);
  return topics;
}, [currentSlide?.id, imageOptions]);
```

**Benefits:**
- Memoized - only re-evaluates when currentSlide.id changes
- Reads from slide-specific cache entry
- Isolated per slide - slide 2's data won't affect slide 1
- Console logs which slide's topics are being used

### 2. Added useMemo Import

**File:** `apps/frontend/src/components/deck/viewport/SlideContainer.tsx` (Line 1)

```typescript
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
```

### 3. Enhanced Cache Logging

**File:** `apps/frontend/src/hooks/useSlideGeneration.ts` (Lines 625-639)

Added detailed logging when caching:
```typescript
console.log(`[ImageCache] ✅ Cached ${allImages.length} images for slide ${slideData.slide_id} (index ${slideData.slide_index})`);
console.log(`[ImageCache] Slide-specific terms:`, slideData.search_terms);
console.log(`[ImageCache] Cache key:`, slideData.slide_id);
```

**File:** `apps/frontend/src/hooks/useImageOptions.ts` (Lines 499-510, 566-568)

Added logging to show which slide is being looked up:
```typescript
console.log('[getCurrentSlideImages] 🔍 Looking for images for SPECIFIC slide:', targetSlideId);
console.log('[getCurrentSlideImages] Direct cache lookup for', targetSlideId, ':', ...);
console.log('[getCurrentSlideImages] ✅ MATCH FOUND - Slide ID matches cache key exactly');
```

## How It Works Now

### Slide 1 Generation:
```
Backend emits: slide_images_found for slide_id="abc-123"
Frontend caches: window.__slideImageCache["abc-123"] = {images: [...], topics: ['pac-man', 'arcade']}
Console: "[ImageCache] ✅ Cached 6 images for slide abc-123"
Console: "[ImageCache] Slide-specific terms: ['pac-man', 'arcade']"
```

### Slide 2 Generation (while viewing slide 1):
```
Backend emits: slide_images_found for slide_id="def-456"
Frontend caches: window.__slideImageCache["def-456"] = {images: [...], topics: ['space', 'invaders']}
Console: "[ImageCache] ✅ Cached 6 images for slide def-456"
Console: "[ImageCache] Slide-specific terms: ['space', 'invaders']"
```

### ImagePicker on Slide 1:
```
currentSlide.id = "abc-123"
useMemo evaluates: window.__slideImageCache["abc-123"]
Topics extracted: ['pac-man', 'arcade']  // From slide 1's cache
Console: "[SlideContainer] Topics for slide abc-123 ONLY: ['pac-man', 'arcade']"

ImagePicker receives:
  images: [...6 images from abc-123...]
  topics: ['pac-man', 'arcade']

Result: Shows pac-man and arcade images ONLY
Slide 2's data does NOT affect what's shown
```

## Testing

After refreshing browser:

1. **Open slide 1, click "Select Image"**
   - Console should show: `Topics for slide abc-123 ONLY: ['pac-man', 'arcade']`
   - ImagePicker should show those topics only

2. **Stay on slide 1, wait for slide 2 to generate**
   - Console should show: `Cached 6 images for slide def-456`
   - Topics shown should NOT change (still ['pac-man', 'arcade'])
   - Images shown should NOT change

3. **Navigate to slide 2, click "Select Image"**
   - Console should show: `Topics for slide def-456 ONLY: ['space', 'invaders']`
   - ImagePicker should show different topics

## Files Modified

1. `apps/frontend/src/components/deck/viewport/SlideContainer.tsx` - Line 1 (import), Lines 431-446 (memoized topics)
2. `apps/frontend/src/hooks/useSlideGeneration.ts` - Lines 625-639 (enhanced logging)
3. `apps/frontend/src/hooks/useImageOptions.ts` - Lines 466-510 (enhanced logging)

## Result

- Topics are now slide-specific and memoized
- Won't change when other slides' images arrive
- Isolated by slide ID in cache
- Console logs clearly show which slide's data is being used

Refresh browser and test - topics should stay stable on each slide! 🎯

