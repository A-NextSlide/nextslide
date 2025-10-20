# Image Recommendations Fix - Debug Guide

## Problem
Image recommendations were not visible in the frontend because the cache was empty. The console showed:
```
[getCurrentSlideImages] Cache keys: Array(0)
[getCurrentSlideImages] No images found anywhere
```

## Root Cause
The `async_images` parameter had **inconsistent defaults** across the codebase:
- Most places defaulted to `async_images=true` (placeholder mode)
- This prevented SerpAPI from running synchronously during deck generation
- Without synchronous search, `slide_images_found` events were NOT emitted
- Frontend cache remained empty → no image recommendations visible

## Solution Applied

### 1. Backend Defaults Fixed
**File: `apps/backend/api/chat_server.py`**
- **Line 840**: Changed default from `True` to `False`
```python
async_images=request.get('async_images', False)  # Default to auto-apply mode
```

### 2. Frontend Defaults Fixed
**Files:**
- `apps/frontend/src/services/outlineApi.ts` (lines 778, 940)
- `apps/frontend/src/services/generation/GenerationCoordinator.ts` (line 316)

Changed all defaults from `true` to `false` to enable auto-apply mode.

### 3. Debug Logging Added

#### Backend
**File: `apps/backend/services/combined_image_service.py`**
- Added logs when SerpAPI is called
- Shows number of images returned
- Displays provider availability status

**File: `apps/backend/services/serpapi_service.py`**
- Shows search query being used
- Displays API key availability

**File: `apps/backend/agents/generation/adapters.py`**
- Shows search progress for each slide
- Displays when images are stored
- Logs when `slide_images_found` events are emitted

#### Frontend
**File: `apps/frontend/src/hooks/useSlideGeneration.ts`**
- Enhanced logging when `slide_images_found` events are received
- Shows cache status after storing images
- Displays total cache entries

## How It Works Now

### Auto-Apply Mode (async_images=false) - DEFAULT
1. **Image Search Phase** (BEFORE slide generation):
   - Theme Director generates 5-8 simple search terms (e.g., "Tesla car", "solar panel")
   - For each slide, cycle through search terms
   - Call SerpAPI/Perplexity to fetch 6+ images per slide
   - Tag BEST image to `slide.taggedMedia` for auto-application
   - Store ALL images in `all_images` dict

2. **Event Emission**:
   - After all searches complete, emit `slide_images_found` events
   - Each event contains: `slide_id`, `slide_index`, `slide_title`, `images[]`, `search_query`

3. **Frontend Caching**:
   - `useSlideGeneration` hook listens for `slide_images_found` events
   - Processes images and stores in `window.__slideImageCache[slide_id]`
   - Cache structure:
     ```typescript
     {
       slideId: string,
       slideIndex: number,
       slideTitle: string,
       images: ProcessedImage[],
       topics: string[],
       images_by_topic: Record<string, ProcessedImage[]>
     }
     ```

4. **Image Picker Access**:
   - `useImageOptions` hook reads from `window.__slideImageCache`
   - User can see and select from all recommended images
   - Selected images replace the auto-applied one

### Placeholder Mode (async_images=true)
- Images searched in background DURING slide generation
- Less reliable for showing recommendations
- Used when user wants manual control from start

## Verification Steps

### Backend Logs to Watch For:
```
🔍 [CombinedImageService] search_images called with query: 'Tesla car', per_page: 6
🔍 [IMAGE SEARCH] Using Google Images (SerpAPI) for topic: Tesla car
   - SerpAPI is_available: True
   - Requesting 18 images
   - SerpAPI returned 24 images
   ✅ Found 6 images from search
   📦 Stored 6 images for slide.id: slide-xxx-1

📤 EMITTING slide_images_found events for 10 slides
   📤 Preparing event for slide 1: Introduction to Tesla
      - slide.id: slide-xxx-1
      - images count: 6
      - search_query: Tesla car
📤 Emitted slide_images_found event for slide 1 with 6 images
```

### Frontend Logs to Watch For:
```
[SlideImages] ✅✅✅ RECEIVED slide_images_found event for slide "Introduction to Tesla"
[SlideImages]    - slide_id: slide-xxx-1
[SlideImages]    - slide_index: 0
[SlideImages]    - images_count: 6
[SlideImages]    - images.length: 6
[SlideImages] ✅ Successfully cached 6 images for slide slide-xxx-1
[SlideImages]    - Cache key: slide-xxx-1
[SlideImages]    - Total cache entries: 1
```

## SerpAPI Configuration

**Environment Variable Required:**
```bash
SERPAPI_API_KEY=your_api_key_here
```

**Current Status:**
✅ API key is set in `.env`
✅ SerpAPI service initializes correctly
✅ Service is available for image search

## Testing

To test image recommendations:
1. Start backend: `cd apps/backend && make run` (or your preferred method)
2. Start frontend: `cd apps/frontend && npm run dev`
3. Create a new presentation
4. Watch backend console for image search logs
5. Watch frontend console for caching logs
6. Click on an image component → should see image picker with recommendations

## Fallback Behavior

If SerpAPI fails or returns no results:
- System continues with placeholders
- User can still manually search images in picker
- No generation errors occur

## Related Files

### Backend
- `/apps/backend/api/chat_server.py` - Main endpoint defaults
- `/apps/backend/agents/generation/adapters.py` - Image search orchestration
- `/apps/backend/services/combined_image_service.py` - Image search routing
- `/apps/backend/services/serpapi_service.py` - SerpAPI integration

### Frontend
- `/apps/frontend/src/hooks/useSlideGeneration.ts` - Event listener & caching
- `/apps/frontend/src/hooks/useImageOptions.ts` - Cache reader for image picker
- `/apps/frontend/src/services/outlineApi.ts` - API request builder
- `/apps/frontend/src/services/generation/GenerationCoordinator.ts` - Generation coordinator

## Next Steps

If images still don't show:
1. Check backend logs for SerpAPI errors
2. Verify API key is valid and has credits
3. Check frontend console for event reception
4. Verify `window.__slideImageCache` in browser console
5. Check network tab for SSE events containing `slide_images_found`

