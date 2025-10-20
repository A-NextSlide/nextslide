# Debug Image Picker - Recommendations Not Showing

## Quick Check

Open your browser console and run these commands:

### 1. Check if images are cached
```javascript
// See all cached slide IDs
Object.keys(window.__slideImageCache || {})

// See detailed cache info
window.__debugImageCache && window.__debugImageCache()

// Manual check
Object.entries(window.__slideImageCache || {}).forEach(([key, val]) => {
  console.log(`Slide ${key}:`, {
    images: val.images?.length || 0,
    topics: val.topics || [],
    slideIndex: val.slideIndex,
    slideTitle: val.slideTitle
  })
})
```

### 2. When you click "Select Image", check the console
You should see logs like:
```
[getCurrentSlideImages] Looking for images for slide: abc-123-xyz
[getCurrentSlideImages] Cache keys: ['slide-1-xyz', 'slide-2-abc', ...]
[getCurrentSlideImages] Direct cache lookup: 6 images
```

### 3. If no cache keys are shown
The images weren't cached during generation. Check if these events were received:

```javascript
// Listen for future events
window.addEventListener('slide_images_available', (e) => {
  console.log('✅ Image event received:', e.detail);
});

// Check if they were received during generation (check console history)
// Look for: "[ImageCache] Cached X images for slide..."
```

## Common Issues & Fixes

### Issue 1: Cache is empty
**Symptoms:**
- Console shows: `Cache keys: []`
- No images in picker

**Cause:** Events weren't emitted during generation  
**Fix:** Backend needs to emit `slide_images_found` events

**Test:**
Create a new deck and watch backend console for:
```
📤 Emitted slide_images_found event for slide 1 with 6 images
```

### Issue 2: Slide ID mismatch
**Symptoms:**
- Cache has keys like: `slide-1-abc`
- getCurrentSlideImages looking for: `different-id-format`

**Debug:**
```javascript
// Check current slide ID
const slides = window.deckStore?.getState?.()?.deckData?.slides || [];
console.log('Current slide IDs:', slides.map(s => s.id));

// Check cache keys
console.log('Cache keys:', Object.keys(window.__slideImageCache || {}));
```

**If they don't match:**
The cache is using a different ID format than the slides. This happens when:
- Slides are saved to database (gets new UUID)
- Cache still has generation-time IDs

**Fix:** We need to update cache keys when slides are saved. For now, test with a fresh deck.

### Issue 3: Recommendations tab hidden
**Symptoms:**
- Picker opens but only shows "AI Generate", "Search", etc.
- No "Recommended" tab

**Cause:** `hasImages` is false in ImagePicker  
**Check:**
```javascript
// When picker is open, check the images prop
// Look in React DevTools or check console logs
```

The ImagePicker only shows "Recommended" tab when `images.length > 0`

## Step-by-Step Debug Process

### Test 1: Generate a fresh deck
1. Create new deck with prompt: "Tesla presentation"
2. Wait for generation to complete
3. Open browser console
4. Run: `Object.keys(window.__slideImageCache || {})`
5. You should see: `['slide-id-1', 'slide-id-2', ...]`

**Expected:** Multiple cache keys (one per slide)  
**If empty:** Events weren't emitted or cached

### Test 2: Check cache contents
```javascript
// Pick a slide ID from step 1
const slideId = Object.keys(window.__slideImageCache)[0];
const data = window.__slideImageCache[slideId];

console.log('Images:', data.images?.length);
console.log('Topics:', data.topics);
console.log('Sample image:', data.images[0]);
```

**Expected:** 6+ images, topics array, valid image data  
**If 0 images:** Cache structure is wrong

### Test 3: Open Image Picker
1. Click on a slide with a placeholder image
2. Click "Select Image" button
3. Watch console logs

**Expected logs:**
```
[getCurrentSlideImages] Looking for images for slide: xyz-123
[getCurrentSlideImages] Cache keys: ['xyz-123', 'abc-456', ...]
[getCurrentSlideImages] Direct cache lookup: 6 images
```

**Expected UI:**
- Picker opens
- "Recommended" tab is visible
- Tab shows 6+ images

### Test 4: Check ImagePicker props
In React DevTools:
1. Find `ImagePicker` component
2. Check props
3. Look at `images` array

**Expected:** `images: [{id: ..., url: ..., ...}, ...]` with 6+ items  
**If empty:** getCurrentSlideImages returned []

## Manual Fix (Temporary)

If you need to test the UI with mock data:

```javascript
// Add test images to cache
window.__slideImageCache = window.__slideImageCache || {};
const testSlideId = 'test-slide-123';

window.__slideImageCache[testSlideId] = {
  slideId: testSlideId,
  slideIndex: 0,
  slideTitle: 'Test Slide',
  topics: ['test'],
  images: [
    {
      id: 'img-1',
      url: 'https://via.placeholder.com/400x300',
      thumbnail: 'https://via.placeholder.com/400x300',
      alt: 'Test Image 1',
      topic: 'test'
    },
    {
      id: 'img-2',
      url: 'https://via.placeholder.com/400x301',
      thumbnail: 'https://via.placeholder.com/400x301',
      alt: 'Test Image 2',
      topic: 'test'
    }
  ],
  images_by_topic: {
    'test': [
      {
        id: 'img-1',
        url: 'https://via.placeholder.com/400x300',
        thumbnail: 'https://via.placeholder.com/400x300',
        alt: 'Test Image 1',
        topic: 'test'
      }
    ]
  }
};

console.log('✅ Test cache created. Click Select Image on a component now.');
```

## Next Steps

Based on console output, determine:

1. **If cache is empty:**
   - Check backend logs for event emission
   - Verify frontend event listeners are attached
   - Look for errors in console during generation

2. **If cache has data but picker doesn't show it:**
   - Check slide ID matching (cache keys vs current slide ID)
   - Verify `getCurrentSlideImages` is finding the data
   - Check if `images` prop is passed to ImagePicker

3. **If "Recommended" tab doesn't appear:**
   - Verify `images` array length > 0 in ImagePicker props
   - Check React DevTools for ImagePicker component state
   - Look at `hasImages` variable (should be true)

## Success Criteria

✅ `window.__slideImageCache` has keys for each slide  
✅ Each cache entry has `images` array with 6+ items  
✅ Console shows successful lookup when picker opens  
✅ "Recommended" tab appears in ImagePicker  
✅ Images are displayed in the grid  
✅ Can select images from recommendations  

## Report Back

If still not working, provide:
1. Output of `Object.keys(window.__slideImageCache || {})`
2. Console logs when clicking "Select Image"
3. Screenshot of ImagePicker (showing which tabs are visible)
4. Backend logs showing event emission (or lack thereof)

