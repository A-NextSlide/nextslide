# Log Cleanup Plan

## Issues Found

### 1. Excessive Emoji Usage
Files with repeated emoji spam (🔴🔴🔴, ✅✅✅, etc.):
- `api/requests/api_openai_outline.py` - 🔴 spam for async_images debugging
- `agents/generation/adapters.py` - 🟢, 🟡, 🎯 spam
- `agents/generation/slide_generator.py` - 🤖, 📌, 🔍 spam
- `services/combined_image_service.py` - 🖼️ spam
- `agents/generation/theme_director.py` - 🎨 spam
- `api/requests/api_deck_create_stream.py` - Multiple emoji types

### 2. Print Statements (115 files!)
Most critical production files to clean:
- `api/chat_server.py`
- `agents/generation/slide_generator.py`
- `agents/generation/adapters.py`
- `agents/generation/deck_composer.py`
- `agents/persistence/deck_persistence.py`
- `services/combined_image_service.py`
- `services/outline/generator.py`
- `services/enhanced_font_service.py`
- `api/requests/api_openai_outline.py`
- `api/requests/api_deck_create_stream.py`

### 3. Excessive Debug Logging

#### httpx Library
- Currently logs every HTTP request at INFO level
- Should be WARNING or ERROR only
- Appears in: All files using httpx

#### Repeated "Starting/Completed" Messages
- Too many lifecycle logs for minor operations
- Examples:
  - "[SLIDE GENERATION] Processing slide X"
  - "[PARALLEL_ORCH] Slide X waiting for semaphore..."
  - "[PERSISTENCE] _do_update_slide called"
  - "✅ Retrieved deck", "📥 Retrieved deck" (same operation, multiple logs)

#### Duplicate Information
- Same data logged multiple times:
  - Deck UUID logged 5+ times per request
  - Slide component count logged multiple times
  - Theme colors logged repeatedly

### 4. Over-Verbose Operational Logs

#### Image Search
```
Currently logs:
- "🖼️ COMBINED IMAGE SERVICE: Starting background search"
- "🖼️ Deck UUID: e339ef27..."
- "🖼️ Deck title: The Evolution..."
- "🖼️ Number of slides: 3"
- "🖼️ Max images per slide: 6"
- "🖼️ Has callback: True"
- "🖼️ Has search queries: True"
- Created search coroutine for topic: X" (9 times)
- "🔍 SERPAPI API RESPONSE for 'X'"
- "Found 100 images for topic"
- "Selected 8 diverse images"

Should log:
- INFO: "Starting image search for deck {uuid}: {slide_count} slides"
- INFO: "Completed image search: {total_images} images for {slide_count} slides"
- ERROR: (only on failures)
```

#### Slide Generation
```
Currently logs:
- Too many step-by-step logs
- Validation logs for every component
- Font enforcement logs
- Color trace logs
- Cache logs

Should reduce to:
- INFO: "Generating slide {n}/{total}: {title}"
- INFO: "✓ Slide {n} complete: {component_count} components ({duration}s)"
- WARNING: (validation failures)
- ERROR: (generation failures)
```

## Cleanup Actions

### Priority 1: Remove Emoji Spam
Replace repeated emojis with single emoji or none:
- ❌ `🔴🔴🔴` → ✅ `🔴` or just text
- ❌ `✅✅✅` → ✅ `✅` or just "SUCCESS:"
- ❌ `[OUTLINE DEBUG] 🔴 request.async_images = True` → ✅ Remove entirely (too verbose)

### Priority 2: Configure httpx Logging
Add to logging configuration:
```python
logging.getLogger("httpx").setLevel(logging.WARNING)
```

### Priority 3: Remove Print Statements
Convert all print() to logger statements or remove:
- Test files: Can keep print() for debugging
- Scripts: Can keep print() for CLI output
- Production code: Must use logger

### Priority 4: Reduce Log Verbosity

#### Keep (INFO level):
- API entry points (which endpoint was called)
- Major phase transitions (outline complete, deck started, deck complete)
- Key business events (deck created, slide generated)
- Errors and warnings

#### Remove or downgrade to DEBUG:
- Internal state transitions
- "Starting X" / "Completed X" pairs for minor operations
- Validation success messages
- Cache hit/miss logs
- Component counts and sizes
- Timing logs for sub-operations
- Duplicate information already logged elsewhere

### Priority 5: Consolidate Duplicate Logs

Example - Deck retrieval currently logs:
```python
logger.info("Getting deck X for user Y")
logger.info("📥 Retrieved deck X: 3 slides")
logger.info("User Y owns deck X")
```

Should be:
```python
logger.info(f"Retrieved deck {uuid}: {slide_count} slides (user: {user_id})")
```

## Implementation Order

1. **Configure httpx logging** (quick win, biggest impact)
2. **Remove emoji spam** from critical production files
3. **Clean up print statements** in production code
4. **Reduce verbosity** in high-traffic endpoints:
   - `/api/openai/generate-outline-stream`
   - `/api/deck/create-from-outline`
   - `/auth/decks/*`
5. **Consolidate duplicate logs**

## Files to Clean (Priority Order)

### Critical (High Traffic)
1. `api/requests/api_openai_outline.py` - Outline generation
2. `api/requests/api_deck_create_stream.py` - Deck creation
3. `agents/generation/adapters.py` - Slide composition
4. `agents/generation/slide_generator.py` - Slide generation
5. `services/combined_image_service.py` - Image search
6. `services/outline/generator.py` - Outline logic

### Important (Medium Traffic)
7. `agents/generation/components/component_validator.py` - Validation
8. `agents/persistence/deck_persistence.py` - Database ops
9. `agents/ai/clients.py` - AI client logs
10. `utils/supabase.py` - Database operations

### Lower Priority
- Theme and font services
- Less frequently used API endpoints
- Test files (can keep verbose logging)

## Success Metrics

After cleanup, production logs should:
- ✅ Show clear API entry/exit points
- ✅ Show only key business events at INFO level
- ✅ Have minimal repeated information
- ✅ Use emojis sparingly (max 1 per log line)
- ✅ Have no print() statements in production code
- ✅ Not log httpx requests at INFO level
- ✅ Be readable and actionable

## Example: Before & After

### Before (from actual logs)
```
[PYDANTIC VALIDATOR] 🔴🔴🔴 async_images RECEIVED VALUE: True
[PYDANTIC VALIDATOR] 🔴 Type: <class 'bool'>
[PYDANTIC VALIDATOR] 🔴 Is None: False
[PYDANTIC VALIDATOR] 🔴 Is True: True
[PYDANTIC VALIDATOR] 🔴 Is False: False
[PYDANTIC VALIDATOR] ✅ Returning value as-is: True
[ENDPOINT] ⚠️⚠️⚠️ STREAMING ENDPOINT CALLED
[ENDPOINT] request.detailLevel = standard
[ENDPOINT] 🔴🔴🔴 request.async_images = True
[ENDPOINT] 🔴 Type: <class 'bool'>
...
```

### After
```
INFO: Outline generation started (detail=standard, async_images=true)
INFO: ✓ Outline complete: 3 slides (4.2s)
```
