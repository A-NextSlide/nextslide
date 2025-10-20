# Per-Component Image Search - Implementation Complete

## What Changed

Implemented per-component image search with persistence, so each image placeholder gets unique, specific recommendations that persist when navigating between slides.

## Key Improvements

### Before:
- All slides got same 3 generic images
- One search term per slide (cycled from 6 deck-wide terms)
- 100 images fetched per slide (mostly irrelevant)
- Recommendations lost when navigating away

### After:
- Each image gets 3 specific, relevant recommendations
- 2-3 unique search terms per slide based on content
- 3 images per term (9 total per slide max)
- Recommendations stored in database and auto-fetched on navigation

## Backend Changes

### 1. Theme Generation - Per-Slide Terms
**File:** `apps/backend/agents/generation/theme_style_manager.py` (Lines 1149-1235)

**New AI prompt:**
```
For each slide below, generate 2-3 specific search terms based on its title and content.

OUTPUT FORMAT:
Slide 1: term1, term2, term3
Slide 2: term1, term2, term3
```

**Parsing logic:**
- Extracts per-slide terms using regex: `Slide N: term1, term2`
- Returns dict: `{'0': ['pac-man arcade', 'space invaders'], '1': [...], ...}`
- Falls back to extracting keywords from slide titles if parsing fails

### 2. Fallback Term Generation
**File:** `apps/backend/agents/generation/adapters.py` (Lines 885-931)

**Changed from:**
```python
search_terms = ['History', 'Evolution', 'Video', ...]  # Flat list
```

**Changed to:**
```python
search_terms = {
  '0': ['video', 'game'],
  '1': ['arcade', 'golden'],
  ...
}  # Dict per slide
```

Extracts key nouns from slide title + first 200 chars of content.

### 3. Multi-Term Image Search
**File:** `apps/backend/agents/generation/adapters.py` (Lines 1301-1384)

**New logic:**
1. Get 2-3 terms for each slide
2. Search EACH term separately (3 images per term)
3. Store results grouped by term: `{term1: [3 images], term2: [3 images]}`
4. Tag first image from first term for auto-apply
5. Total: 6-9 curated images per slide (down from 100)

**Example:**
```python
Slide "Arcade Golden Age":
  Term 1: "pac-man arcade" → 3 images
  Term 2: "space invaders cabinet" → 3 images
  Total: 6 specific images (not 100 generic ones)
```

### 4. Store Search Terms in Slide Data
**File:** `apps/backend/agents/generation/slide_generator.py` (Lines 858-870)

**Extracts `searchQuery` from Image components:**
```python
image_search_terms = {}
for idx, comp in enumerate(components):
    if comp.get('type') == 'Image':
        search_query = comp.get('props', {}).get('searchQuery', '')
        if search_query:
            image_search_terms[f'image_{idx}'] = search_query

slide_data['imageSearchTerms'] = image_search_terms
```

**Stored in database automatically** via `DeckPersistence.update_slide()`.

**Database structure:**
```json
{
  "slide": {
    "id": "slide-123",
    "title": "Arcade Golden Age",
    "components": [...],
    "imageSearchTerms": {
      "image_5": "pac-man arcade game",
      "image_8": "space invaders cabinet"
    }
  }
}
```

### 5. Updated Event Structure
**File:** `apps/backend/agents/generation/adapters.py` (Lines 1399-1447)

**New event format:**
```json
{
  "type": "slide_images_found",
  "data": {
    "slide_id": "slide-123",
    "images_by_search_term": {
      "pac-man arcade": [3 images],
      "space invaders cabinet": [3 images]
    },
    "search_terms": ["pac-man arcade", "space invaders cabinet"],
    "total_count": 6
  }
}
```

## Frontend Changes

### 6. Handle New Event Structure
**File:** `apps/frontend/src/hooks/useSlideGeneration.ts` (Lines 588-636)

**Added handler for `images_by_search_term`:**
- Flattens images from all search terms
- Stores in cache with search term metadata
- Backward compatible with old `images_by_topic` structure

### 7. On-Demand Image Fetching
**File:** `apps/frontend/src/hooks/useImageOptions.ts` (Lines 335-410)

**New method `fetchImagesForSlide()`:**
```typescript
// Check if slide has imageSearchTerms in database
if (slide.imageSearchTerms) {
  // Fetch images for each stored term
  for (const [componentKey, searchTerm] of Object.entries(slide.imageSearchTerms)) {
    const images = await fetch('/api/media/search', { query: searchTerm, limit: 3 });
    imagesByTerm[searchTerm] = images;
  }
  // Cache results
  window.__slideImageCache[slideId] = { images_by_search_term: imagesByTerm };
}
```

### 8. Auto-Fetch on Navigation
**File:** `apps/frontend/src/components/deck/viewport/SlideContainer.tsx` (Lines 593-602)

**Added useEffect:**
```typescript
useEffect(() => {
  if (currentSlide && currentSlide.imageSearchTerms && !isGenerating) {
    if (!window.__slideImageCache?.[currentSlide.id]) {
      fetchImagesForSlide(currentSlide.id);
    }
  }
}, [currentSlideIndex, currentSlide]);
```

**When it triggers:**
- User navigates to a slide
- Slide has `imageSearchTerms` in database
- Images not already cached
- Not during generation

## User Experience

### During Generation:
1. Theme generates per-slide terms
2. Searches 2-3 terms per slide (3 images each)
3. Events emitted with component-specific images
4. Images cached automatically
5. Toast: "Images Ready - Found 6 recommended images"

### After Generation - Navigation:
1. User clicks on slide 3
2. Frontend checks: Does slide have `imageSearchTerms`?
3. If yes and not cached → Fetch images for those terms
4. Cache results in `window.__slideImageCache`
5. User clicks "Select Image" → See 6 specific recommendations
6. User navigates away and back → Images still available (cached)

### Example Flow:

**Slide 2:** "Arcade Golden Age: Pac-Man and Space Invaders"

**Stored in database:**
```json
{
  "imageSearchTerms": {
    "image_5": "pac-man arcade",
    "image_7": "space invaders cabinet"
  }
}
```

**On first visit:**
- Fetches 3 images for "pac-man arcade"
- Fetches 3 images for "space invaders cabinet"
- Caches 6 total images
- Shows toast notification

**On return visit:**
- Checks cache → Images already there
- Shows same 6 images immediately
- No network requests needed

## Technical Details

### Search Term Generation:
**Input:** Slide title + content
```
Title: "Arcade Golden Age: Pac-Man and Space Invaders"
Content: "Pac-Man became a phenomenon..."
```

**Output:** 2-3 specific terms
```python
['pac-man arcade', 'space invaders cabinet', 'retro gaming']
```

### Image Fetching:
- **Per term:** 3 images (curated, relevant)
- **Per slide:** 6-9 images total (2-3 terms × 3 images)
- **Reduced from:** 100 generic images

### Storage:
- **Location:** Supabase `decks` table → `slides` array → `imageSearchTerms` field
- **Format:** `{"image_5": "pac-man arcade", "image_7": "space invaders"}`
- **Persistence:** Saved automatically with slide components
- **Retrieval:** Fetched when slide is loaded

### Caching:
- **Key:** Slide ID
- **Structure:**
```typescript
window.__slideImageCache[slideId] = {
  slideId: string,
  images: Array,  // Flattened for backward compatibility
  images_by_search_term: Record<string, Array>,
  search_terms: Array
}
```

## Files Modified

| File | Lines | Purpose |
|------|-------|---------|
| `theme_style_manager.py` | 1149-1235 | Per-slide term generation |
| `adapters.py` | 885-931, 1301-1447 | Fallback + multi-term search + events |
| `slide_generator.py` | 858-870 | Extract and store searchQuery |
| `useSlideGeneration.ts` | 588-636 | Handle new event structure |
| `useImageOptions.ts` | 335-410, 704 | On-demand fetching |
| `SlideContainer.tsx` | 89, 593-602 | Auto-fetch on navigation |

## Testing

### Test 1: Generate New Deck
1. Create deck about video games
2. **Expected backend logs:**
   ```
   [THEME IMAGE] Parsed 10 slides with terms: ['0', '1', '2', ...]
     Slide 0: ['video', 'game']
     Slide 1: ['pac-man', 'arcade']
   
   Term 1/2: 'pac-man'
      ✅ Found 3 images for 'pac-man'
   Term 2/2: 'arcade'
      ✅ Found 3 images for 'arcade'
   
   [SLIDE GEN] ✅ Stored 2 image search terms in slide data
     image_5: 'pac-man arcade'
     image_7: 'space invaders'
   ```

3. **Expected frontend:**
   - Toast: "Images Ready - Found 6 recommended images"
   - Cache has 6-9 images per slide
   - Each with unique searchQuery

### Test 2: Navigation Persistence
1. Navigate to slide 3
2. **Expected logs:**
   ```
   [SlideContainer] Auto-fetching images for slide: slide-123
   [useImageOptions] Found search terms: {image_5: "pac-man", ...}
   [useImageOptions] Fetched 3 images for term: pac-man
   [useImageOptions] ✅ Cached 6 images for slide slide-123
   ```

3. Click "Select Image"
4. See 6 specific recommendations (not 100 generic)

5. Navigate away and back to slide 3
6. **Expected:**
   ```
   [useImageOptions] Using cached images
   ```
   No network requests, instant display

### Test 3: Verify Database Storage
```javascript
// In browser console after generation
const slide = window.deckStore?.getState()?.deckData?.slides?.[1];
console.log('Stored terms:', slide.imageSearchTerms);
// Should show: {image_5: "pac-man arcade", image_7: "space invaders"}
```

## Benefits

1. **Specific Recommendations:** Each image gets relevant suggestions
2. **Fewer Results:** 3-9 curated images instead of 100 generic
3. **Persistence:** Survives navigation and page refreshes
4. **Performance:** Cached after first fetch
5. **Unique Per Component:** Different terms for each image placeholder
6. **Content-Aware:** Terms based on slide title + content

## Example Output

**Deck:** "History of Video Games"

**Slide 1:** "The Evolution of Video Games"
- Terms: `['video game history', 'retro controller']`
- Images: 3 for each term = 6 total

**Slide 2:** "Arcade Golden Age"  
- Terms: `['pac-man arcade', 'space invaders cabinet']`
- Images: 3 for each term = 6 total

**Slide 3:** "Console Wars"
- Terms: `['nintendo console', 'sega genesis']`
- Images: 3 for each term = 6 total

**Result:**
- 18 unique, specific images across 3 slides
- No repetition between slides
- Each component gets hand-picked relevant options

## Next Steps

After backend restart and browser refresh:
1. Create a new deck
2. Watch backend logs for per-slide terms
3. Check that different slides get different recommendations
4. Navigate away from a slide and back
5. Verify images are fetched from stored terms
6. Click "Select Image" → See 3-9 specific recommendations

Everything is implemented and ready to test! 🎉

