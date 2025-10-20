# Testing Image Recommendations - Quick Guide

## What to Look For

When you create a new deck, you should now see image recommendations working properly.

## Expected Behavior

### 1. During Deck Generation

**Backend Console:**
```
🎨 AI-GENERATED SEARCH TERMS: ['Tesla car', 'solar panel', 'battery pack', 'charging station', 'electric vehicle']

🔍 Searching images for slide 1/6: Introduction
🎨 Using theme-generated term: 'Tesla car'
   Search query: 'Tesla car'
   ✅ Found 6 images

🔍 Searching images for slide 2/6: Our Technology  
🎨 Using theme-generated term: 'solar panel'
   Search query: 'solar panel'
   ✅ Found 6 images

📤 Emitted slide_images_found event for slide 1 with 6 images
📤 Emitted slide_images_found event for slide 2 with 6 images
```

**Frontend Console:**
```
[useSlideGeneration] RAW EVENT: slide_images_found
[ImageCache] Cached 6 images for slide xyz-123 with topics: Tesla car
[SlideContainer] Images available for slide: xyz-123 6
```

**User Interface:**
- Toast notification appears: **"Images Ready - Found 6 recommended images for your slides"**
- Notification appears during or right after slide generation
- Non-intrusive, disappears after 3 seconds

### 2. After Deck Generation

**Opening ImagePicker:**
1. Double-click any slide to enter edit mode
2. Click on an image component
3. ImagePicker should open automatically
4. You should see 6+ recommended images
5. Images should be relevant to the slide content

**What You Should See:**
- Grid of images (4 columns)
- Each image has a thumbnail
- Hover shows photographer credit
- One image may already be selected (auto-applied)
- You can select different images

### 3. Checking the Cache

**Browser Console:**
```javascript
// Run this in browser console to inspect cache
window.__debugImageCache()

// Should show:
{
  cacheKeys: ['slide-1-xyz', 'slide-2-abc', ...],
  cacheEntries: [
    {
      key: 'slide-1-xyz',
      slideId: 'slide-1-xyz',
      imageCount: 6,
      topics: ['Tesla car']
    },
    ...
  ]
}
```

## Quick Test Steps

### Test 1: Simple Deck
```
Prompt: "Create a presentation about Tesla"
Expected Terms: "Tesla car", "electric vehicle", "charging station", etc.
Expected: 6 images per slide, toast notification, images in picker
```

### Test 2: Business Deck
```
Prompt: "Quarterly business review presentation"
Expected Terms: "business meeting", "data chart", "office team", etc.
Expected: Professional images, charts, office scenes
```

### Test 3: Education Deck
```
Prompt: "Introduction to Photosynthesis"
Expected Terms: "plant leaf", "chloroplast", "sunlight", etc.
Expected: Educational diagrams, nature photos
```

## Troubleshooting

### Issue: No Toast Notification
**Check:**
- Browser console for errors
- Network tab for `slide_images_found` events
- `window.__slideImageCache` is populated

**Fix:**
- Refresh page
- Check if SERPAPI_API_KEY is set in backend

### Issue: ImagePicker Shows "Loading images..."
**Check:**
- Run `window.__debugImageCache()` in console
- Look for cache keys matching current slide ID

**Fix:**
- The slide ID might not match cache key
- Check backend logs for emitted events

### Issue: Wrong/Irrelevant Images
**Check:**
- Backend logs for search terms used
- Terms should be simple (1-3 words)
- No abstract concepts

**Fix:**
- If terms are bad, the AI generation might need adjustment
- Check `theme_director_new.py` prompt

## Success Criteria

✅ Toast notification appears during generation  
✅ Backend logs show simple search terms (1-3 words)  
✅ Backend emits `slide_images_found` events  
✅ Frontend caches images in `window.__slideImageCache`  
✅ ImagePicker shows 6+ images per slide  
✅ Images are relevant to slide content  
✅ Can change from auto-applied image to different one  

## Debug Commands

```javascript
// Check if cache exists
console.log('Cache keys:', Object.keys(window.__slideImageCache || {}));

// Check images for current slide (replace with actual slide ID)
console.log('Images for slide:', window.__slideImageCache['slide-1-xyz']?.images);

// Check all cached slides
Object.entries(window.__slideImageCache || {}).forEach(([key, val]) => {
  console.log(`${key}: ${val.images?.length} images`);
});

// Listen for events
window.addEventListener('slide_images_available', (e) => {
  console.log('Image event:', e.detail);
});
```

## Common Issues

**1. "No images in ImagePicker"**
- Cache not populated
- Check backend emitted events
- Check frontend event listeners

**2. "Toast doesn't appear"**
- Event not received
- Toast component not imported
- Check browser console for errors

**3. "Search terms too complex"**
- AI generation issue
- Check backend logs
- Fallback should still work

**4. "Images not relevant"**
- SerpAPI query issue
- Check actual search terms used
- May need to adjust term generation

## Next Steps

After confirming this works:
1. Test with different deck topics
2. Verify image quality/relevance
3. Check performance with large decks (10+ slides)
4. Test ASYNC mode (placeholders) as well
5. Verify auto-apply vs manual selection flow

