# Final Testing Instructions - Image Recommendations

## What to Test

Create a **fresh deck** and check:
1. Search terms are generated
2. Images are found and shown as recommendations  
3. Auto-apply toggle works correctly

## Test Procedure

### Test 1: Generate a Deck

**Create a deck with this prompt:**
```
Create a presentation about video games
```

**Watch Backend Console for:**
```
[DECK COMPOSER] ✅ Generated 6 fallback search terms: ['video', 'games', 'Pixels', 'Playgrounds', 'History', 'Evolution']

🔍 Using theme-generated term: 'video'
📤 Emitted slide_images_found event for slide 1 with 6 images

🔍 Using theme-generated term: 'games'
📤 Emitted slide_images_found event for slide 2 with 6 images
```

**Key Indicators:**
- ✅ Search terms should NOT be "None"
- ✅ Should see 6+ search terms logged
- ✅ Each slide should use a different term
- ✅ Events should be emitted for each slide

### Test 2: Check Frontend Cache

**After generation completes, run in browser console:**
```javascript
// Check cache exists
Object.keys(window.__slideImageCache || {})
// Should show: ['7d13f4fc-498f...', '0ff4ce42-3e0e...', ...]

// Check total images
let total = 0;
Object.values(window.__slideImageCache || {}).forEach(c => total += c.images?.length || 0);
console.log('Total images cached:', total);
// Should show: Total images cached: 60+ (6 per slide × 10 slides)

// Check one slide
const firstKey = Object.keys(window.__slideImageCache)[0];
const firstSlide = window.__slideImageCache[firstKey];
console.log('First slide:', {
  id: firstSlide.slideId,
  title: firstSlide.slideTitle,
  images: firstSlide.images?.length,
  topics: firstSlide.topics
});
```

**Expected Output:**
```
Cache keys: (13) ['7d13f4fc-...', '0ff4ce42-...', ...]
Total images cached: 78
First slide: {
  id: '7d13f4fc-498f-4e43-a446-4d224a10e572',
  title: 'From Pixels to Playgrounds...',
  images: 6,
  topics: ['video']
}
```

### Test 3: Open ImagePicker

**Steps:**
1. Open browser console
2. Click on any slide with a placeholder image
3. Click "Select Image" button
4. Watch console logs

**Expected Console Output:**
```
[getCurrentSlideImages] Looking for images for slide: 7d13f4fc-498f-4e43-a446-4d224a10e572
[getCurrentSlideImages] Cache keys: ['7d13f4fc-...', '0ff4ce42-...', ...]
[getCurrentSlideImages] Direct cache lookup: 6 images
```

**Expected UI:**
- ImagePicker opens
- **"Recommended" tab is visible** (first tab)
- Tab shows 6+ images in grid
- Images have thumbnails
- Can click to select

### Test 4: Verify Auto-Apply Toggle

**With Toggle ON:**
1. Create deck
2. Images should be automatically applied (not placeholders)
3. Backend shows: `🎯 AUTO-APPLY MODE`

**With Toggle OFF:**
1. Create deck
2. Images should be placeholders
3. Backend shows: `📌 PLACEHOLDER MODE`
4. Can click "Select Image" to choose from recommendations

## If Recommended Tab is Missing

**This means `getCurrentSlideImages()` returned empty array.**

**Run this debug command:**
```javascript
// Manually call the function to see what happens
const slideId = /* paste your current slide ID */;
console.log('Slide ID:', slideId);
console.log('Cache keys:', Object.keys(window.__slideImageCache || {}));
console.log('Match?:', slideId in (window.__slideImageCache || {}));

// Try manual lookup
Object.entries(window.__slideImageCache || {}).forEach(([key, val]) => {
  if (key.includes(slideId.substring(0, 8)) || slideId.includes(key.substring(0, 8))) {
    console.log('FOUND MATCH:', key, val.images?.length, 'images');
  }
});
```

## If No Images in Cache

**This means events weren't cached by frontend.**

**Check:**
1. Look for this in browser console during generation:
   ```
   [ImageCache] Cached 6 images for slide xyz-123
   ```

2. If not present, events weren't received by `useSlideGeneration`

3. Check for errors in console during generation

## Quick Health Check

Run this mega-command after generation:
```javascript
console.log('=== IMAGE SYSTEM HEALTH CHECK ===');
console.log('1. Cache exists?', !!window.__slideImageCache);
console.log('2. Cache size:', Object.keys(window.__slideImageCache || {}).length, 'slides');
console.log('3. Total images:', Object.values(window.__slideImageCache || {}).reduce((sum, c) => sum + (c.images?.length || 0), 0));
console.log('4. Sample cache entry:', window.__slideImageCache[Object.keys(window.__slideImageCache || {})[0]]);
console.log('5. Current deck slide count:', window.deckStore?.getState?.()?.deckData?.slides?.length);
console.log('6. Current deck ID:', window.deckStore?.getState?.()?.deckData?.id);
console.log('================================');
```

**Expected Output:**
```
=== IMAGE SYSTEM HEALTH CHECK ===
1. Cache exists? true
2. Cache size: 13 slides
3. Total images: 78
4. Sample cache entry: {slideId: '7d13f4fc-...', images: Array(6), ...}
5. Current deck slide count: 13
6. Current deck ID: 69ee1ca0-f538-41e6-81a9-bbe984533602
================================
```

## What Should Work Now

### Backend:
- ✅ Simple search terms generated (1-3 words)
- ✅ No colons, no gerunds (-ing words)
- ✅ Better fallback when theme reused
- ✅ Events emitted for all slides
- ✅ Auto-apply toggle works correctly

### Frontend:
- ✅ Events cached in `window.__slideImageCache`
- ✅ Better ID matching (UUID prefix, title match)
- ✅ Detailed console logging
- ✅ Toast notifications when images ready
- ✅ "Recommended" tab shows when images exist

## Report Back

After testing, please share:

1. **Backend logs:**
   - What search terms were generated?
   - Did events get emitted?

2. **Browser console output:**
   - Run the health check command above
   - Share the output

3. **ImagePicker screenshot:**
   - Does "Recommended" tab appear?
   - How many images does it show?

4. **Any errors** in console

This will help me identify any remaining issues! 🐛🔍

