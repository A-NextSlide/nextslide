# Image Auto-Apply Functionality - Complete Flow Analysis

## Overview
The NextSlide application has a sophisticated image handling system that supports:
1. Automatic image searching via SerpAPI (Google Images)
2. Optional auto-application of images to slide placeholders during generation
3. User manual selection and application of images through the frontend
4. Hybrid approaches combining automatic and manual image selection

---

## 1. AUTO-APPLY TOGGLE/SETTING STORAGE & USAGE

### Configuration (Backend)
**File:** `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/config.py`

```python
# Line 91-93: Main auto-apply toggle
AUTO_APPLY_PENDING_IMAGES = False

# Line 46-47: Image search provider configuration
IMAGE_SEARCH_PROVIDER = 'serpapi'  # or 'perplexity'
```

**Key Points:**
- `AUTO_APPLY_PENDING_IMAGES = False` - Currently disabled for pending searched images
- This controls whether images found during background search are automatically applied to placeholders
- When disabled, images remain in `pending_images` for user review and manual selection

### Runtime Configuration (Agent Messages)
**File:** `/Users/ahmed/Documents/Dev/nextslide/apps/backend/api/requests/api_agent_messages.py`

```python
# Line 25: Global auto-apply control for agent editing
ALWAYS_AUTO_APPLY = (os.getenv("AGENT_AUTO_APPLY", "true").lower() == "true") and not bool(os.getenv("PYTEST_CURRENT_TEST"))

# Line 1187: Request-level auto-apply
auto_apply_request = bool(body.get("autoApply", False))

# Line 1189: Decision logic
should_auto_apply = (ALWAYS_AUTO_APPLY or auto_apply_request) and not is_pytest
```

**Key Points:**
- Agent editing auto-applies changes by default (env: `AGENT_AUTO_APPLY`, default: `true`)
- Disabled during pytest to match test expectations
- Frontend can override via `autoApply` request body parameter
- Applies to deck edits from the agent system, not initial image search

---

## 2. IMAGE FETCHING - SERPAPI SEARCH FLOW

### SerpAPI Service Layer
**File:** `/Users/ahmed/Documents/Dev/nextslide/apps/backend/services/serpapi_service.py`

#### Core Methods:

**`search_images_for_slide()` (Lines 368-458)**
```python
async def search_images_for_slide(
    self,
    slide_content: str,
    slide_title: str,
    slide_type: str,
    style_preferences: Optional[Dict[str, Any]] = None,
    num_images: int = 6,
    search_query: Optional[str] = None
) -> List[Dict[str, Any]]:
```

**Workflow:**
1. Builds optimized search query from slide title/content using `_build_query_from_slide()`
2. Calls SerpAPI with 4x requested images to account for filtering
3. If insufficient results, expands search without orientation filters
4. Validates all images for accessibility using `ImageValidator.filter_valid_images()`
5. Tries alternative search strategies if still insufficient
6. Returns list of valid image dictionaries with metadata

**Key Query Building Strategy (Lines 77-183):**
- Extracts proper nouns from titles (capitalized words)
- Filters aggressive stop words and vague terms
- Limits queries to ~60 characters
- Prioritizes specific entities over generic descriptors
- Examples of excluded terms: 'background', 'concept', 'teamwork', 'image', 'photo'

**`search_images()` (Lines 185-267)**
```python
async def search_images(
    self,
    query: str,
    per_page: int = 10,
    page: int = 1,
    orientation: Optional[str] = None,  # landscape, portrait, square
    size: Optional[str] = None,  # large, medium, small
    color: Optional[str] = None,
) -> Dict[str, Any]:
```

**SerpAPI Parameters:**
- `engine: "google"` - Google search engine
- `tbm: "isch"` - Image search mode
- `safe: "active"` - Safe search enabled
- `num: min(per_page, 100)` - Results per page
- Optional image filters: size, orientation, color

**Response Processing (Lines 460-505):**
```python
def _process_image_results(self, data: Dict[str, Any]) -> Dict[str, Any]:
    # Extracts from 'images_results' field
    # Returns standardized format with:
    # - id, photographer, url, alt, width, height
    # - src (with original, large, medium, small, thumbnail)
    # - source: 'google_images'
    # - serpapi_data: raw original data
```

---

## 3. IMAGE APPLICATION FLOW

### 3a. Automatic Image Application During Generation

#### Image Manager (Background Search)
**File:** `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/generation/image_manager.py`

```python
async def search_images_background(
    self,
    deck_outline,
    deck_uuid: str,
    callback=None,
    max_images_per_slide: int = 6,
    search_queries: Optional[Dict] = None
) -> asyncio.Task:
```

**Flow:**
1. Starts background search task
2. Emits `slide_images_found` events via callback
3. Stores found images in `self.pending_images` dict keyed by slide_id
4. Never auto-applies (auto-apply is disabled)

**Automatic Application During Slide Generation:**
```python
async def apply_pending_images(
    self, 
    slide_id: str, 
    slide_data: Dict[str, Any], 
    theme: Dict[str, Any]
) -> bool:
    # Only if AUTO_APPLY_PENDING_IMAGES is True
    # Finds Image components with src=['', 'placeholder']
    # Applies pending images with theme-appropriate effects
    # Removes from pending_images after applying
```

**Currently Disabled:**
- `AUTO_APPLY_PENDING_IMAGES = False` in config
- Images remain pending for user review
- Accessible via `get_pending_images_for_slide()` method

### 3b. Manual Image Selection & Application

#### Image Options Endpoints
**File:** `/Users/ahmed/Documents/Dev/nextslide/apps/backend/api/image_options_endpoints.py`

**POST `/api/image-options/search` - Search Available Images**
```python
@router.post("/search", response_model=ImageOptionsResponse)
async def search_image_options_endpoint(request: ImageOptionsRequest):
    # Searches for multiple image options per topic
    # Returns Dict[topic_string, List[image_options]]
    # Returns Dict[slide_id, Dict[metadata]]
    # Users review and choose which images to use
```

**POST `/api/image-options/apply` - Apply User Selections**
```python
@router.post("/apply", response_model=ApplyImagesResponse)
async def apply_selected_images_endpoint(request: ApplyImagesRequest):
    # Takes user selections: Dict[slide_id, List[image_urls]]
    # For each slide:
    #   1. Find Image components with empty/placeholder src
    #   2. Apply selected URLs to components
    #   3. Update Supabase with new slide data
    #   4. Update deck status to "completed"
```

**Application Process (Lines 131-233 in api_image_options.py):**
```python
async def apply_selected_images(request: ApplyImagesRequest, registry):
    deck_data = await persistence.get_deck_with_retry(request.deck_uuid)
    
    for slide_id, image_urls in request.image_selections.items():
        # Find slide by ID
        slide_data = deck_data['slides'][slide_index]
        
        # Find Image components
        image_components = [
            (i, comp) for i, comp in enumerate(slide_data.get('components', []))
            if comp.get('type') == 'Image'
        ]
        
        # Apply selected images in order
        for idx, (comp_idx, component) in enumerate(image_components):
            if idx < len(image_urls):
                component['props']['src'] = image_urls[idx]
                component['props']['alt'] = f"Selected image {idx + 1}"
        
        # Save updated slide
        await persistence.update_slide(request.deck_uuid, slide_index, slide_data)
        slides_updated += 1
    
    # Update deck status
    supabase.table("decks").update({
        "status": {
            "state": "completed",
            "progress": 100,
            "message": "Images applied successfully"
        }
    }).eq("uuid", request.deck_uuid).execute()
```

### 3c. Combined Image Service - Central Hub

**File:** `/Users/ahmed/Documents/Dev/nextslide/apps/backend/services/combined_image_service.py`

**Search with Streaming Updates:**
```python
async def search_images_for_deck_streaming(
    self,
    deck_outline,
    palette: Optional[Dict] = None,
    max_images_per_slide: int = 6,
    search_queries: Optional[Dict[str, str]] = None
):
    # Extracts topics from slides using pre-generated queries
    # Searches all topics in parallel
    # Distributes images to slides avoiding duplicates
    # Yields streaming progress events:
    # - "topic_images_found"
    # - "slide_images_found"
    # - "images_collection_complete"
```

**Image Distribution Logic (Lines 557-593):**
- Tracks images used per deck (never reuses)
- Distributes images to slides evenly
- Filters out vague search terms
- Handles both string and array search queries

**Image Upload to Supabase (Lines 258-313):**
- All searched/generated images uploaded to Supabase storage
- Avoids CORS issues with external image URLs
- Tracks original URLs and Supabase paths
- Handles both URL-based and base64 AI-generated images

---

## 4. COMPLETE FLOW - SLIDE GENERATION TO IMAGE APPLICATION

### 4.1 Initial Deck Generation Flow

```
1. USER CREATES DECK
   ↓
2. DeckComposer/Orchestrator starts generation
   ├─ Creates SlideGenerationContext for each slide
   ├─ Includes: available_images=[], async_images=False
   ├─ Includes: tagged_media=[] (user-uploaded media)
   └─ Includes: slide.taggedMedia (pre-associated media)

3. PARALLEL SLIDE GENERATION (ParallelSlideOrchestrator)
   ├─ Generates N slides in parallel
   ├─ Each calls SlideGeneratorV2.generate_slide()
   └─ AISlideGenerator creates components with placeholders

4. IMAGE PLACEHOLDERS CREATED
   ├─ AI creates Image components with:
   │  ├─ src: 'placeholder' or ''
   │  ├─ alt: description
   │  └─ props with position/size
   └─ Components sent to Supabase via streaming

5. OPTIONAL: BACKGROUND IMAGE SEARCH (ImageManager)
   ├─ If images not already provided
   ├─ Searches via SerpAPI for each slide needing images
   ├─ Creates pending_images Dict[slide_id -> List[images]]
   ├─ Emits slide_images_found events
   └─ ImageManager.apply_pending_images() - CURRENTLY DISABLED
       └─ Would apply if AUTO_APPLY_PENDING_IMAGES = True
```

### 4.2 User Image Selection Flow

```
AFTER GENERATION COMPLETE:

1. FRONTEND DETECTS IMAGE PLACEHOLDERS
   ├─ Renders empty Image components
   └─ Shows "Select images" button

2. USER CLICKS IMAGE SEARCH (Frontend)
   ├─ Calls POST /api/image-options/search
   └─ Sends: ImageOptionsRequest {
       deck_id, deck_outline, 
       images_per_topic: 20,
       max_topics_per_slide: 5
    }

3. BACKEND SEARCHES (search_image_options)
   ├─ Creates CombinedImageService instance
   ├─ Calls search_image_options_for_deck()
   ├─ For each slide, extracts topics:
   │  ├─ Uses pre-generated search_queries if available
   │  ├─ Falls back to _extract_topics_from_slide()
   │  └─ Filters vague terms
   ├─ Searches SerpAPI for each unique topic
   ├─ Uploads all results to Supabase storage
   └─ Returns ImageOptionsResponse {
       topics: Dict[topic -> [images]],
       slides: Dict[slide_id -> metadata],
       metadata: {total_images_found, total_topics_searched}
    }

4. FRONTEND DISPLAYS IMAGE GALLERY
   ├─ Shows 20 options per topic
   ├─ User selects which images to use
   └─ Sends selection via POST /api/image-options/apply

5. BACKEND APPLIES (apply_selected_images)
   ├─ Gets deck from Supabase
   ├─ For each slide_id in selections:
   │  ├─ Finds Image components with empty src
   │  ├─ Sets component['props']['src'] = selected_url
   │  └─ Updates slide in Supabase
   ├─ Updates deck status to "completed"
   └─ Returns ApplyImagesResponse {success: true, slides_updated: N}

6. FRONTEND UPDATES
   ├─ Receives applied status
   ├─ Re-renders slides with applied images
   └─ Shows "Images applied" confirmation
```

### 4.3 Agent Editing Auto-Apply Flow

```
AGENT CHAT / FAST PATH EDITS:

1. USER SENDS MESSAGE via /v1/agent/sessions/{id}/messages
   └─ Includes: autoApply=True|False

2. DECISION LOGIC (api_agent_messages.py, Lines 1184-1282)
   ├─ should_auto_apply = (ALWAYS_AUTO_APPLY or auto_apply_request) and not is_pytest
   ├─ Default ALWAYS_AUTO_APPLY = true (env: AGENT_AUTO_APPLY)
   └─ Can be disabled in tests (PYTEST_CURRENT_TEST)

3. IF AUTO-APPLY ENABLED:
   ├─ Apply deck_diff immediately via apply_deckdiff()
   ├─ Emit "deck.edit.applied" event
   ├─ Send updated slides to frontend
   ├─ Mark edit record as "applied"
   └─ No approval step needed

4. IF AUTO-APPLY DISABLED:
   ├─ Create edit record as "proposed"
   ├─ Emit "deck.edit.proposed" event
   ├─ Frontend shows approval UI
   ├─ User clicks "Apply" to accept
   └─ Then apply via /v1/agent/edits/{id}/apply endpoint
```

---

## 5. KEY DATA STRUCTURES

### Image Object Format
```python
{
    'id': str,  # 'serpapi_idx_hash' or 'ai-gen-{id}'
    'url': str,  # Supabase URL (uploaded)
    'original_url': str,  # Original external URL (if different)
    'alt': str,  # Description
    'photographer': str,  # Source attribution
    'photographer_url': str,  # Source link
    'source': str,  # 'google_images', 'openai', 'gemini'
    'width': int,
    'height': int,
    'src': {
        'original': str,
        'large': str,
        'medium': str,
        'small': str,
        'thumbnail': str
    },
    'ai_generated': bool,  # If AI-generated
    'supabase_path': str  # Supabase storage path
}
```

### Slide Component with Image
```python
{
    'id': str,
    'type': 'Image',
    'props': {
        'src': 'placeholder' | '',  # Before: empty
        'src': 'https://...',  # After: applied
        'alt': str,
        'position': {'x': float, 'y': float},
        'width': float,
        'height': float,
        'animation': {  # Optional
            'type': 'ken-burns',
            'duration': int,
            'scale': float
        }
    }
}
```

### ImageOptionsRequest
```python
{
    'deck_id': str,
    'deck_outline': DeckOutline,
    'images_per_topic': int = 20,
    'max_topics_per_slide': int = 5
}
```

### ApplyImagesRequest
```python
{
    'deck_uuid': str,
    'image_selections': {
        'slide_id_1': ['https://image1.jpg', 'https://image2.jpg'],
        'slide_id_2': ['https://image3.jpg']
    }
}
```

---

## 6. RELATED FILES SUMMARY

### Backend Core
- `/apps/backend/agents/config.py` - Global config flags
- `/apps/backend/services/serpapi_service.py` - SerpAPI integration
- `/apps/backend/services/combined_image_service.py` - Orchestration
- `/apps/backend/agents/generation/image_manager.py` - Background search
- `/apps/backend/api/image_options_endpoints.py` - REST endpoints
- `/apps/backend/api/requests/api_image_options.py` - Request/response models
- `/apps/backend/api/requests/api_agent_messages.py` - Agent auto-apply logic

### Generation Pipeline
- `/apps/backend/agents/generation/adapters.py` - Flow integration
- `/apps/backend/agents/generation/slide_generator.py` - Slide creation
- `/apps/backend/agents/generation/orchestration/parallel_slide_orchestrator.py` - Parallel orchestration
- `/apps/backend/agents/generation/components/prompt_builder.py` - Prompt creation

### Frontend Components
- `/apps/frontend/src/components/ImageCarousel.tsx` - Image display
- `/apps/frontend/src/components/deck/viewport/ImagePicker.tsx` - Selection UI
- `/apps/frontend/src/hooks/useImageOptions.ts` - Image search hook
- `/apps/frontend/src/utils/imageUtils.ts` - Image utilities
- `/apps/frontend/src/renderers/components/ImageRenderer.tsx` - Rendering logic

### Persistence
- `/apps/backend/agents/persistence/deck_persistence.py` - Deck storage
- `/apps/backend/services/image_storage_service.py` - Image storage

---

## 7. ENVIRONMENT VARIABLES

```bash
# Image Search Provider
IMAGE_SEARCH_PROVIDER='serpapi'  # or 'perplexity'
SERPAPI_API_KEY=<key>  # Required for Google Images search

# Auto-apply for Pending Images (Currently Disabled)
AUTO_APPLY_PENDING_IMAGES=false

# Auto-apply for Agent Edits (Currently Enabled)
AGENT_AUTO_APPLY=true

# Perplexity Alternative
USE_PERPLEXITY_FOR_RESEARCH=true
PERPLEXITY_IMAGE_MODEL='perplexity-sonar'
```

---

## 8. SUMMARY TABLE

| Component | Location | Purpose | Current Status |
|-----------|----------|---------|-----------------|
| Config | agents/config.py | Define behavior flags | Active |
| SerpAPI Service | services/serpapi_service.py | Google Images search | Active - Primary |
| Combined Service | services/combined_image_service.py | Orchestrate all image sources | Active |
| Image Manager | agents/generation/image_manager.py | Background search | Active (no auto-apply) |
| REST Endpoints | api/image_options_endpoints.py | User image selection | Active |
| Request Models | api/requests/api_image_options.py | Validation | Active |
| Agent Auto-apply | api/requests/api_agent_messages.py | Edit auto-apply | Active |
| Adapters | agents/generation/adapters.py | System integration | Active |
| Orchestrator | orchestration/parallel_slide_orchestrator.py | Parallel generation | Active |

