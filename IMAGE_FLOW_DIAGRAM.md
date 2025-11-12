# Image Auto-Apply - Visual Flow Diagrams

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NEXTSLIDE IMAGE SYSTEM                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND (React/TypeScript)                                          │
├─────────────────────────────────────────────────────────────────────┤
│ • ImagePicker.tsx - Component to select images                      │
│ • ImageCarousel.tsx - Display search results                        │
│ • ImageRenderer.tsx - Render images in slides                       │
│ • useImageOptions.ts - Search & selection hook                      │
└─────────────────────────────────────────────────────────────────────┘
           │                                          │
           │ POST /api/image-options/search         │ POST /api/image-options/apply
           ↓                                          ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND REST API (FastAPI)                                           │
├─────────────────────────────────────────────────────────────────────┤
│ • image_options_endpoints.py                                        │
│   - /search → search_image_options()                                │
│   - /apply → apply_selected_images()                                │
│   - /search-additional → search_additional_images()                 │
└─────────────────────────────────────────────────────────────────────┘
           │                                          │
           ↓                                          ↓
┌──────────────────────────────┐    ┌────────────────────────────────┐
│ SEARCH ORCHESTRATION         │    │ APPLICATION LOGIC              │
├──────────────────────────────┤    ├────────────────────────────────┤
│ search_image_options()       │    │ apply_selected_images()        │
│ CombinedImageService         │    │ 1. Get deck from Supabase      │
│ 1. Extract topics from slides│    │ 2. Find Image components       │
│ 2. Parallel topic searches   │    │ 3. Apply URLs to components   │
│ 3. Distribute to slides      │    │ 4. Save to Supabase           │
│ 4. Upload to Supabase        │    │ 5. Update deck status         │
└──────────────────────────────┘    └────────────────────────────────┘
           │
           ├─── Topic Search ───┐
           │                    ↓
           │         ┌──────────────────────┐
           │         │ SerpAPIService       │
           │         │ search_images()      │
           │         │ • Query builder      │
           │         │ • SerpAPI call       │
           │         │ • Result processing  │
           │         │ • Image validation   │
           │         └──────────────────────┘
           │                    │
           │                    ↓
           │         ┌──────────────────────┐
           │         │ ImageStorageService  │
           │         │ Upload to Supabase   │
           │         └──────────────────────┘
           ↓
        Returns: ImageOptionsResponse
        {
          topics: Dict[topic → [images]],
          slides: Dict[slide_id → metadata],
          metadata: {...}
        }
```

---

## Slide Generation to Image Application Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. DECK GENERATION PHASE                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  generate_slides_parallel()                                 │
│  (ParallelSlideOrchestrator)                                │
│         │                                                   │
│         ├─→ SlideGeneratorV2.generate_slide()              │
│         │   │                                               │
│         │   ├─→ AISlideGenerator                           │
│         │   │   • Creates slide components                  │
│         │   │   • Image components with:                    │
│         │   │     src: 'placeholder'                        │
│         │   │     alt: description                          │
│         │   │                                               │
│         │   └─→ Stream to Supabase                         │
│         │                                                   │
│         └─→ Returns: Slide with Image components           │
│             (src = placeholder)                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            │
            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. PLACEHOLDER IMAGES IN DECK                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Deck Structure:                                            │
│  {                                                          │
│    slides: [                                               │
│      {                                                      │
│        id: "slide-1",                                       │
│        components: [                                        │
│          {                                                  │
│            id: "image-1",                                   │
│            type: "Image",                                   │
│            props: {                                         │
│              src: "placeholder",  ← EMPTY                   │
│              alt: "Description",                            │
│              position: {...},                               │
│              width: 800,                                    │
│              height: 600                                    │
│            }                                                │
│          }                                                  │
│        ]                                                    │
│      }                                                      │
│    ]                                                        │
│  }                                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            │
            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. FRONTEND DETECTS & OFFERS IMAGE SEARCH                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ImagePicker component:                                     │
│  • Detects Image components with src="placeholder"         │
│  • Renders "Select images" button                          │
│  • User clicks to search                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            │
            │ User clicks "Search for images"
            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. IMAGE SEARCH & SELECTION                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  POST /api/image-options/search                            │
│  {                                                          │
│    deck_id: "xyz",                                         │
│    deck_outline: {...},                                    │
│    images_per_topic: 20,                                   │
│    max_topics_per_slide: 5                                 │
│  }                                                          │
│         │                                                   │
│         ↓                                                   │
│  Backend:                                                   │
│  1. Extract topics from each slide                         │
│     "Artificial Intelligence" → topic: "AI"                │
│  2. Search SerpAPI for all topics in parallel             │
│  3. Get 20 images per topic                               │
│  4. Upload to Supabase storage                            │
│  5. Return organized by slide                              │
│         │                                                   │
│         ↓                                                   │
│  Frontend:                                                  │
│  • Display ImageCarousel with 20 options per topic        │
│  • User selects which images to apply                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            │
            │ User selects images
            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. IMAGE APPLICATION                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  POST /api/image-options/apply                             │
│  {                                                          │
│    deck_uuid: "xyz-123",                                   │
│    image_selections: {                                      │
│      "slide-1": [                                           │
│        "https://supabase/.../image1.jpg",                  │
│        "https://supabase/.../image2.jpg"                   │
│      ]                                                      │
│    }                                                        │
│  }                                                          │
│         │                                                   │
│         ↓                                                   │
│  Backend:                                                   │
│  for each slide in selections:                             │
│    get slide from Supabase                                 │
│    find Image components with src="placeholder"            │
│    for each image URL:                                     │
│      component.props.src = selected_url                    │
│    save slide to Supabase                                  │
│    slides_updated++                                        │
│  update deck status to "completed"                         │
│         │                                                   │
│         ↓                                                   │
│  Returns:                                                   │
│  {                                                          │
│    success: true,                                          │
│    slides_updated: 1,                                      │
│    message: "Images applied to 1 slides"                   │
│  }                                                          │
│         │                                                   │
│         ↓                                                   │
│  Frontend:                                                  │
│  • Re-render slides with applied images                    │
│  • Show "Images applied" confirmation                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            │
            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. FINAL DECK WITH IMAGES                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Deck Structure (AFTER):                                    │
│  {                                                          │
│    slides: [                                               │
│      {                                                      │
│        id: "slide-1",                                       │
│        components: [                                        │
│          {                                                  │
│            id: "image-1",                                   │
│            type: "Image",                                   │
│            props: {                                         │
│              src: "https://supabase/.../image1.jpg",      │
│              alt: "Selected image 1",                       │
│              position: {...},                               │
│              width: 800,                                    │
│              height: 600                                    │
│            }                                                │
│          }                                                  │
│        ]                                                    │
│      }                                                      │
│    ]                                                        │
│  }                                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Query Building Logic (SerpAPI)

```
Input Slide:
{
  title: "Artificial Intelligence and Machine Learning",
  content: "AI is transforming how we work..."
}

Process:
1. Extract all words from title and content
   ↓
2. Filter stop words (the, a, and, etc.)
   ↓
3. Filter vague terms (image, photo, background, etc.)
   ↓
4. Identify proper nouns (capitalized words)
   → "Artificial", "Intelligence", "Machine", "Learning"
   ↓
5. Build query from proper nouns + meaningful common nouns
   → "Artificial Intelligence Machine Learning"
   ↓
6. Clamp to 60 characters
   → "Artificial Intelligence Machine Learning"
   ↓
7. Execute SerpAPI search
   ↓
Output:
- 20+ Google Images results
- Validated for accessibility
- Ranked by relevance

If insufficient results (< 6 images):
  Try variations:
  - "AI photo"
  - "AI illustration"
  - "AI concept"
  - Last word fallback
```

---

## Auto-Apply Configuration Layers

```
┌─────────────────────────────────────────────────────┐
│ LAYER 1: Global Configuration                       │
├─────────────────────────────────────────────────────┤
│ agents/config.py                                    │
│                                                     │
│ AUTO_APPLY_PENDING_IMAGES = False                   │
│ │                                                   │
│ └─→ Controls: Background image search auto-apply   │
│     Affects: ImageManager.apply_pending_images()   │
│     Status: DISABLED (manual selection only)        │
│                                                     │
│ IMAGE_SEARCH_PROVIDER = 'serpapi'                   │
│ └─→ Chooses: Which search service to use           │
│     Options: 'serpapi', 'perplexity'               │
│                                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ LAYER 2: Runtime Configuration                      │
├─────────────────────────────────────────────────────┤
│ api/requests/api_agent_messages.py                  │
│                                                     │
│ ALWAYS_AUTO_APPLY = getenv('AGENT_AUTO_APPLY')    │
│ Default: true (enabled)                            │
│ │                                                   │
│ └─→ Controls: Agent editing changes auto-apply     │
│     Affects: Deck edit operations                  │
│     Status: ENABLED (applies immediately)          │
│     Can disable: Set AGENT_AUTO_APPLY=false        │
│                                                     │
│ DISABLE in pytest: PYTEST_CURRENT_TEST env var     │
│ └─→ For test compatibility                         │
│                                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ LAYER 3: Request-Level Override                     │
├─────────────────────────────────────────────────────┤
│ POST /v1/agent/sessions/{id}/messages              │
│                                                     │
│ {                                                   │
│   text: "...",                                      │
│   autoApply: true|false  ← Frontend can override   │
│ }                                                   │
│ │                                                   │
│ └─→ Controls: Individual request behavior           │
│     Decision: (ALWAYS_AUTO_APPLY OR autoApply)     │
│               AND NOT is_pytest                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Image Upload to Supabase

```
ImageStorageService:

1. External Image URL (SerpAPI result)
   https://example.com/image.jpg
        │
        ├─→ Download image from URL
        │
        ├─→ Upload to Supabase bucket
        │   • Bucket: "slide-images" or similar
        │   • Path: /serpapi/{hash}.jpg
        │
        └─→ Return:
            {
              url: "https://supabase.../slide-images/serpapi/{hash}.jpg",
              path: "slide-images/serpapi/{hash}.jpg"
            }

2. AI-Generated Image (base64)
   {
     ai_generated: true,
     b64_json: "iVBORw0KGgoAAAANS..."
   }
        │
        ├─→ Upload base64 to Supabase
        │   • Bucket: "slide-images"
        │   • Path: /ai-generated/{id}.png
        │
        └─→ Return: Supabase URL

3. Benefits
   ✓ Avoids CORS issues
   ✓ Ensures image persistence
   ✓ Tracks original sources
   ✓ Enables attribution

Image Metadata Preserved:
{
  photographer: "Source/Photographer",
  alt: "Image description",
  source: "google_images|openai|gemini",
  original_url: "Original URL if re-uploaded"
}
```

---

## Timeline of Image Handling

```
T0: Generation Starts
    ├─ User inputs content
    └─ Requests deck generation

T1: Slides Generated (2-10s)
    ├─ AI creates components
    ├─ Image components created with src="placeholder"
    └─ Slides streamed to Supabase

T2: User Views Draft
    ├─ Frontend displays slides
    ├─ Empty image placeholders visible
    └─ "Select images" button shown

T3: User Initiates Image Search (Optional)
    ├─ Clicks "Select images"
    ├─ Frontend sends search request
    └─ Backend starts topic extraction

T4: Backend Searches (3-15s)
    ├─ SerpAPI searches N topics in parallel
    ├─ Downloads 20 images per topic
    ├─ Validates accessibility
    └─ Uploads to Supabase

T5: Frontend Shows Gallery
    ├─ User reviews 20 options per topic
    ├─ Selects desired images
    └─ Sends selection

T6: Backend Applies (1-3s)
    ├─ Finds Image components
    ├─ Sets src URLs
    ├─ Saves to Supabase
    └─ Updates status

T7: Deck Complete
    ├─ Frontend re-renders with images
    └─ User has complete presentation

TOTAL TIME: ~5-30 seconds (depending on search/selection)
```

---

## Error Handling & Fallbacks

```
Image Search Failures:
┌─────────────────────────────────┐
│ 1. Initial search returns < 6   │
├─────────────────────────────────┤
│ → Retry without orientation     │
│ → Try alternative search terms  │
│ → Return fewer images OK        │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ 2. Image validation fails       │
├─────────────────────────────────┤
│ → Filter out inaccessible URLs  │
│ → Try more search results       │
│ → Log warnings, continue        │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ 3. Supabase upload fails        │
├─────────────────────────────────┤
│ → Skip image                    │
│ → Continue with others          │
│ → Log error                     │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ 4. SerpAPI unavailable          │
├─────────────────────────────────┤
│ → Fall back to Perplexity       │
│ → Or show cached results        │
│ → Or present manual upload      │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ 5. Apply fails                  │
├─────────────────────────────────┤
│ → Return error status           │
│ → Show error message to user    │
│ → Suggest retry                 │
└─────────────────────────────────┘
```

