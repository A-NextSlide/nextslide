# Image Auto-Apply Documentation Index

This documentation provides a complete analysis of the image auto-apply functionality in NextSlide, including where settings are stored, how images are fetched, when they're applied, and the complete flow from slide generation to final presentation.

## Documentation Files

### 1. IMAGE_AUTO_APPLY_ANALYSIS.md (17 KB, 510 lines)
**Comprehensive technical reference documenting all aspects of the image system.**

Contains:
- Auto-apply toggle/setting storage and usage
- SerpAPI search service implementation
- Image application flow (automatic and manual)
- Complete slide generation to image application flow
- Key data structures and formats
- Related files summary
- Environment variables
- Summary table

Best for: Understanding the architecture and implementation details

### 2. IMAGE_FLOW_DIAGRAM.md (27 KB, 480 lines)
**Visual diagrams and flowcharts showing system architecture and data flow.**

Contains:
- Architecture overview diagram
- Slide generation to image application visual flow
- Query building logic flowchart
- Auto-apply configuration layers
- Image upload to Supabase process
- Timeline of image handling
- Error handling and fallbacks

Best for: Visual learners, presentations, understanding high-level flow

### 3. IMAGE_QUICK_REFERENCE.md (11 KB, 434 lines)
**Quick lookup guide with code snippets, API examples, and troubleshooting.**

Contains:
- Key files at a glance table
- Configuration quick lookup
- API endpoints with request/response examples
- Code flow snippets
- Debugging commands
- Common issues & solutions
- Key classes & interfaces
- Testing instructions

Best for: Quick lookups, debugging, implementing changes, API testing

## Quick Navigation

### If you want to...

**Understand the architecture:**
- Read: IMAGE_AUTO_APPLY_ANALYSIS.md sections 1-5
- Then: IMAGE_FLOW_DIAGRAM.md section "Architecture Overview"

**Enable/disable auto-apply:**
- Check: IMAGE_QUICK_REFERENCE.md "Configuration Quick Lookup"
- Or: IMAGE_AUTO_APPLY_ANALYSIS.md section 1

**Trace a complete flow:**
- Start: IMAGE_FLOW_DIAGRAM.md "Slide Generation to Image Application Flow"
- Detail: IMAGE_AUTO_APPLY_ANALYSIS.md section 4

**Find specific code:**
- Use: IMAGE_QUICK_REFERENCE.md "Key Files at a Glance"
- Then: Use "Related Files Summary" in IMAGE_AUTO_APPLY_ANALYSIS.md

**Debug an issue:**
- Start: IMAGE_QUICK_REFERENCE.md "Common Issues & Solutions"
- Debug: IMAGE_QUICK_REFERENCE.md "Debugging Commands"

**Make API calls:**
- Reference: IMAGE_QUICK_REFERENCE.md "API Endpoints Quick Reference"
- Test: IMAGE_QUICK_REFERENCE.md "Testing the Flow"

## Key Findings Summary

### 1. Auto-Apply Setting Location
**Backend:** `apps/backend/agents/config.py` line 93
```python
AUTO_APPLY_PENDING_IMAGES = False  # Currently disabled
```

**Agent Edits:** `apps/backend/api/requests/api_agent_messages.py` line 25
```python
ALWAYS_AUTO_APPLY = os.getenv("AGENT_AUTO_APPLY", "true")  # Enabled
```

### 2. Image Fetching (SerpAPI)
**Service:** `apps/backend/services/serpapi_service.py`

Key method: `search_images_for_slide()` (line 368)
- Builds optimized search query from slide content
- Searches Google Images via SerpAPI
- Validates image accessibility
- Returns up to 20+ results with fallback strategies

### 3. Image Application
**Manual Path:** `POST /api/image-options/apply`
- User selects images from gallery
- Backend applies to slide Image components
- Saves to Supabase
- Updates deck status

**Automatic Path:** `ImageManager.apply_pending_images()`
- Currently DISABLED (AUTO_APPLY_PENDING_IMAGES = False)
- Would automatically apply searched images to placeholders

### 4. Complete Flow
1. User creates deck
2. AI generates slides with Image placeholders (src='placeholder')
3. Frontend detects placeholders and offers image search
4. User clicks "Search images"
5. Backend extracts topics and searches SerpAPI
6. Backend uploads results to Supabase
7. Frontend displays gallery of 20 options per topic
8. User selects images
9. Frontend sends selection to backend
10. Backend applies URLs to Image components
11. Backend updates Supabase
12. Frontend re-renders with images

## Technology Stack

- **Frontend:** React/TypeScript
  - ImagePicker.tsx, ImageCarousel.tsx, ImageRenderer.tsx
  - useImageOptions.ts hook

- **Backend:** Python/FastAPI
  - SerpAPIService for Google Images
  - CombinedImageService for orchestration
  - ImageManager for background search

- **Storage:** Supabase
  - Deck data
  - Image storage (original from SerpAPI, plus Supabase copies)

- **External APIs:** SerpAPI (Google Images), optional Perplexity

## Current Status

- Image search: **ACTIVE** (via SerpAPI)
- Manual image selection: **ACTIVE** (via REST API)
- Auto-apply during generation: **DISABLED** (AUTO_APPLY_PENDING_IMAGES = False)
- Auto-apply for agent edits: **ENABLED** (ALWAYS_AUTO_APPLY = true)
- Image upload to Supabase: **ACTIVE**
- Frontend image picker: **ACTIVE**

## Configuration Options

| Option | Location | Value | Status |
|--------|----------|-------|--------|
| AUTO_APPLY_PENDING_IMAGES | config.py:93 | False | Disabled |
| IMAGE_SEARCH_PROVIDER | config.py:47 | 'serpapi' | Active |
| AGENT_AUTO_APPLY | Environment | 'true' | Enabled |
| SERPAPI_API_KEY | Environment | <key> | Required |

## File Structure

```
NextSlide/
├── apps/
│   ├── backend/
│   │   ├── agents/
│   │   │   ├── config.py                    # AUTO_APPLY_PENDING_IMAGES
│   │   │   ├── generation/
│   │   │   │   ├── image_manager.py         # Background search
│   │   │   │   ├── slide_generator.py       # Slide creation
│   │   │   │   └── orchestration/
│   │   │   │       └── parallel_slide_orchestrator.py
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── serpapi_service.py           # Google Images
│   │   │   ├── combined_image_service.py    # Orchestration
│   │   │   └── image_storage_service.py     # Supabase storage
│   │   ├── api/
│   │   │   ├── image_options_endpoints.py   # REST endpoints
│   │   │   └── requests/
│   │   │       ├── api_image_options.py     # Apply logic
│   │   │       └── api_agent_messages.py    # Auto-apply logic
│   │   └── ...
│   │
│   └── frontend/
│       └── src/
│           ├── components/
│           │   ├── ImagePicker.tsx          # Selection UI
│           │   ├── ImageCarousel.tsx        # Gallery
│           │   └── ...
│           ├── hooks/
│           │   └── useImageOptions.ts       # Search hook
│           ├── utils/
│           │   ├── imageUtils.ts
│           │   └── ...
│           └── ...
```

## Related Documentation

- **Frontend Components:** See `/apps/frontend/src/components/`
- **Backend Services:** See `/apps/backend/services/`
- **API Routes:** See `/apps/backend/api/`
- **Configuration:** See `/apps/backend/agents/config.py`

## Additional Resources

For detailed code examples, see:
- IMAGE_QUICK_REFERENCE.md - "Code Flow Snippets"
- IMAGE_QUICK_REFERENCE.md - "Testing the Flow"
- IMAGE_AUTO_APPLY_ANALYSIS.md - Section 2-3

## How to Use These Documents

1. **First time?** Start with IMAGE_FLOW_DIAGRAM.md for visual understanding
2. **Need details?** Read IMAGE_AUTO_APPLY_ANALYSIS.md sections 1-4
3. **Making changes?** Use IMAGE_QUICK_REFERENCE.md for code locations
4. **Debugging?** Go straight to IMAGE_QUICK_REFERENCE.md "Common Issues"
5. **Testing API?** Use IMAGE_QUICK_REFERENCE.md "Testing the Flow"

---

**Last Updated:** November 12, 2025
**Status:** Complete Analysis
**Total Documentation:** 1,424 lines across 3 files
