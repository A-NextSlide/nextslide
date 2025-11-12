# Image Auto-Apply - Quick Reference Guide

## Key Files at a Glance

| What | Where | Key Method |
|------|-------|-----------|
| **Config** | `apps/backend/agents/config.py` | `AUTO_APPLY_PENDING_IMAGES` (line 93) |
| **Search Images** | `apps/backend/services/serpapi_service.py` | `search_images_for_slide()` (line 368) |
| **Orchestrate** | `apps/backend/services/combined_image_service.py` | `search_images_for_deck_streaming()` (line 446) |
| **Background Search** | `apps/backend/agents/generation/image_manager.py` | `search_images_background()` (line 26) |
| **REST Search Endpoint** | `apps/backend/api/image_options_endpoints.py` | `/search` (line 24) |
| **REST Apply Endpoint** | `apps/backend/api/image_options_endpoints.py` | `/apply` (line 61) |
| **Apply Logic** | `apps/backend/api/requests/api_image_options.py` | `apply_selected_images()` (line 131) |
| **Agent Auto-Apply** | `apps/backend/api/requests/api_agent_messages.py` | `ALWAYS_AUTO_APPLY` (line 25) |
| **Slide Generation** | `apps/backend/agents/generation/slide_generator.py` | `generate_slide()` (line 53) |
| **Parallel Orchestration** | `apps/backend/agents/generation/orchestration/parallel_slide_orchestrator.py` | `generate_slides_parallel()` (line 30) |

---

## Configuration Quick Lookup

### Disable Auto-Apply for Pending Images
```bash
# In agents/config.py (Line 93)
AUTO_APPLY_PENDING_IMAGES = False  # Currently disabled
AUTO_APPLY_PENDING_IMAGES = True   # To enable
```

### Change Image Search Provider
```bash
# In agents/config.py (Line 47)
IMAGE_SEARCH_PROVIDER = 'serpapi'     # Current: Google Images
IMAGE_SEARCH_PROVIDER = 'perplexity'  # Alternative
```

### Control Agent Edit Auto-Apply
```bash
# Environment variable
export AGENT_AUTO_APPLY=true   # Current: enabled
export AGENT_AUTO_APPLY=false  # To disable

# Or in api_agent_messages.py (Line 25)
ALWAYS_AUTO_APPLY = os.getenv("AGENT_AUTO_APPLY", "true").lower() == "true"
```

### Disable Auto-Apply During Tests
```bash
# Automatically disabled via PYTEST_CURRENT_TEST env var
# Set when running pytest (Python handles this)
```

---

## API Endpoints Quick Reference

### Search for Image Options
```
POST /api/image-options/search

Request:
{
  "deck_id": "deck-123",
  "deck_outline": { /* DeckOutline */ },
  "images_per_topic": 20,
  "max_topics_per_slide": 5
}

Response:
{
  "topics": {
    "AI": [{ id, url, alt, ... }, ...],
    "Machine Learning": [...]
  },
  "slides": {
    "slide-1": { /* metadata */ }
  },
  "metadata": {
    "total_images_found": 145,
    "total_topics_searched": 5
  }
}
```

### Apply Selected Images
```
POST /api/image-options/apply

Request:
{
  "deck_uuid": "deck-uuid-123",
  "image_selections": {
    "slide-1": [
      "https://supabase.../image1.jpg",
      "https://supabase.../image2.jpg"
    ]
  }
}

Response:
{
  "success": true,
  "slides_updated": 1,
  "message": "Successfully applied images to 1 slides"
}
```

### Search Additional Images (Single Topic)
```
POST /api/image-options/search-additional

Request:
{
  "topic": "Artificial Intelligence",
  "num_images": 20,
  "deck_id": "deck-123"  // optional
}

Response:
[
  {
    "id": "serpapi_0_hash",
    "url": "https://supabase.../image.jpg",
    "alt": "AI concept",
    ...
  }
]
```

### Agent Edit with Auto-Apply
```
POST /v1/agent/sessions/{session_id}/messages

Request:
{
  "role": "user",
  "text": "Make the title larger",
  "selections": [],
  "autoApply": true  // Override ALWAYS_AUTO_APPLY
}

Response (if auto-applied):
{
  "type": "deck.edit.applied",
  "data": {
    "editId": "edit-123",
    "deckRevision": 15,
    "updatedSlideIds": ["slide-1"]
  }
}
```

---

## Code Flow Snippets

### Image Search with SerpAPI
```python
# From: services/serpapi_service.py

# Build optimized query from slide
query = service._build_query_from_slide(
    title="Artificial Intelligence",
    content="How AI is transforming...",
    slide_type="content",
    style_preferences=None
)
# Result: "Artificial Intelligence" (60 chars max)

# Search with fallback strategies
results = await service.search_images_for_slide(
    slide_content="...",
    slide_title="...",
    slide_type="content",
    num_images=6
)
# Returns: List[Dict] with validated images
```

### Apply Pending Images
```python
# From: agents/generation/image_manager.py

# Check if auto-apply should happen
if AUTO_APPLY_PENDING_IMAGES:  # Currently False
    applied = await image_manager.apply_pending_images(
        slide_id="slide-1",
        slide_data={...},
        theme={...}
    )
    if applied:
        del image_manager.pending_images[slide_id]
```

### Apply User Selections
```python
# From: api/requests/api_image_options.py

persistence = DeckPersistence()
deck_data = await persistence.get_deck_with_retry(deck_uuid)

for slide_id, image_urls in image_selections.items():
    slide_index = next(...)
    slide_data = deck_data['slides'][slide_index]
    
    # Find and update Image components
    for comp in slide_data.get('components', []):
        if comp.get('type') == 'Image':
            comp['props']['src'] = image_urls[idx]
    
    await persistence.update_slide(deck_uuid, slide_index, slide_data)
```

### SerpAPI Query Building
```python
# From: services/serpapi_service.py, _build_query_from_slide()

# Stop words that are filtered out
stop_words = {
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on',
    'is', 'are', 'was', 'were', ...
}

# Vague terms that are filtered out
vague_terms = {
    'image', 'picture', 'photo', 'illustration', 'graphic',
    'background', 'design', 'layout', 'template', ...
}

# Extract proper nouns (capitalized words)
proper_nouns = [w for w in words if w[0].isupper()]

# Build query: proper nouns first, then meaningful words
query = ' '.join(proper_nouns[:2] + title_keywords[:2])
```

---

## Debugging Commands

### Check Configuration
```python
# Python REPL
from agents.config import AUTO_APPLY_PENDING_IMAGES, IMAGE_SEARCH_PROVIDER
print(f"Auto-apply: {AUTO_APPLY_PENDING_IMAGES}")
print(f"Provider: {IMAGE_SEARCH_PROVIDER}")
```

### Test SerpAPI Search
```python
# Python REPL
from services.serpapi_service import SerpAPIService
import asyncio

service = SerpAPIService()
results = asyncio.run(service.search_images(
    query="Artificial Intelligence",
    per_page=10
))
print(f"Found {len(results['photos'])} images")
```

### Check Pending Images
```python
# Python REPL
from agents.generation.image_manager import ImageManager
manager = ImageManager()
pending = manager.pending_images
print(f"Pending images: {pending}")
```

### Monitor Image Application
```python
# Watch logs during image application
# Look for:
# - "Searching image options for deck..."
# - "Applied image {idx+1} to slide {slide_id}"
# - "Successfully updated {slides_updated} slides with selected images"
```

---

## Common Issues & Solutions

### Issue: Images not auto-applying during generation
**Solution:** Check `AUTO_APPLY_PENDING_IMAGES` in config.py
```python
# Currently: False (disabled)
# Change to: True (to enable)
AUTO_APPLY_PENDING_IMAGES = True
```

### Issue: SerpAPI search returns no results
**Solutions:**
1. Check SERPAPI_API_KEY is set
2. Verify API key has quota remaining
3. Query is being built correctly (check logs)
4. Fall back to Perplexity: set `IMAGE_SEARCH_PROVIDER='perplexity'`

### Issue: Images not showing in frontend
**Solutions:**
1. Check if src is empty ('placeholder', '')
2. Verify Image component exists
3. Ensure Supabase URLs are valid (check in browser dev tools)
4. Check Content Security Policy (CSP) headers

### Issue: Agent auto-apply not working
**Solutions:**
1. Check `ALWAYS_AUTO_APPLY` value (should be true)
2. Check if `PYTEST_CURRENT_TEST` env var is set
3. Check `autoApply` in request body
4. Verify diff is not empty

### Issue: Slow image search
**Solutions:**
1. Reduce `max_topics_per_slide` (default: 5)
2. Reduce `images_per_topic` (default: 20)
3. Images search in parallel (should be fast)
4. Check network connectivity
5. Check SerpAPI rate limits

---

## Key Classes & Interfaces

### SerpAPIService
```python
class SerpAPIService:
    def __init__(self)
    async def search_images(query, per_page, page, ...)
    async def search_images_for_slide(slide_content, slide_title, ...)
    async def search_gifs(query, ...)
    async def search_videos(query, ...)
    def _build_query_from_slide(title, content, ...)
    def _process_image_results(data)
```

### CombinedImageService
```python
class CombinedImageService:
    def __init__(self)
    async def search_images_for_deck(deck_outline, ...)
    async def search_images_for_deck_streaming(...)
    async def search_image_options_for_deck(...)
    async def _upload_images_to_supabase(images)
    def _extract_topics_from_slide(slide, ...)
```

### ImageManager
```python
class ImageManager:
    def __init__(self)
    async def search_images_background(...)
    def get_pending_images_for_slide(slide_id)
    async def apply_pending_images(slide_id, slide_data, theme)
    async def apply_selected_images(deck, slide_index, selected_urls)
```

### Image Data Structure
```python
{
    'id': str,              # Unique ID
    'url': str,             # Supabase URL (for frontend)
    'original_url': str,    # Original source URL
    'alt': str,             # Description
    'photographer': str,    # Source attribution
    'source': str,          # 'google_images', 'openai', 'gemini'
    'width': int,
    'height': int,
    'src': {                # Multiple size options
        'original': str,
        'large': str,
        'medium': str,
        'small': str,
        'thumbnail': str
    }
}
```

---

## Testing the Flow

### Manual Test: Complete Image Application
```bash
# 1. Generate a deck with image placeholders
curl -X POST http://localhost:8000/api/decks/generate \
  -H "Content-Type: application/json" \
  -d '{...}'

# 2. Wait for generation to complete
# Watch Supabase for status changes

# 3. Search for image options
curl -X POST http://localhost:8000/api/image-options/search \
  -H "Content-Type: application/json" \
  -d '{
    "deck_id": "deck-123",
    "deck_outline": {...},
    "images_per_topic": 20
  }'

# 4. Select and apply images
curl -X POST http://localhost:8000/api/image-options/apply \
  -H "Content-Type: application/json" \
  -d '{
    "deck_uuid": "deck-uuid-123",
    "image_selections": {
      "slide-1": ["https://supabase.../image1.jpg"]
    }
  }'

# 5. Verify images are applied in Supabase
```

### Python Test: SerpAPI Direct
```python
import asyncio
from services.serpapi_service import SerpAPIService

async def test_search():
    service = SerpAPIService()
    results = await service.search_images_for_slide(
        slide_content="How AI is transforming business",
        slide_title="Artificial Intelligence in 2024",
        slide_type="content",
        num_images=6
    )
    print(f"Found {len(results)} images")
    for img in results[:3]:
        print(f"  - {img['alt']}: {img['url'][:50]}...")

asyncio.run(test_search())
```

