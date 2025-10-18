# Image Auto-Apply Complete Fix

## Problem Summary

User reported that **auto-apply toggle is not working for first batch of slides (1-8), but works for slides 9+**.

This is a timing/race condition combined with missing search terms from AI model.

## Root Causes Identified

### 1. **ThemeDirector Missing Search Terms Generation**

**Issue**: ThemeDirector (new agent-based theme system) was NOT generating image search terms, while the old ThemeStyleManager was.

**Impact**: No AI-generated search terms available → Poor/generic image searches → No images tagged

**Fixed**:
- ✅ Added `search_terms` field to `ThemeDocument` model
- ✅ Added `_generate_search_terms()` method to ThemeDirector with intelligent AI prompt
- ✅ Updated api_theme.py to extract and persist search_terms from ThemeDocument
- ✅ Search terms are now generated with examples and strict rules for quality

### 2. **Confusing async_images Logic**

**Issue**: The flag naming is INVERTED and confusing:
- `autoSelectImages: true` (frontend) should map to → `async_images: false` (backend)
- `autoSelectImages: false` (frontend) should map to → `async_images: true` (backend)

**Current Defaults** (all defaulting to async mode):
```python
# api_deck_create_stream.py line 47
async_images: bool = Field(True, ...)  # Wrong default!

# api_deck_compose_stream.py line 31  
async_images: bool = Field(default=True, ...)  # Wrong default!

# api_openai_outline.py line 564
async_images: Optional[bool] = Field(default=None, ...)
# Then becomes True at lines 749, 922
```

### 3. **Timing Head Start Only for Async Mode**

**Issue**: In adapters.py lines 1479-1488:
```python
# If image search is running, give it a brief head start
if image_search_task and options.get('async_images', True):  # ❌ Only waits if True!
    logger.info("Giving image search a 2-second head start...")
    await asyncio.sleep(2.0)
```

This 2-second delay is ONLY applied when `async_images=True` (manual selection mode).

When auto-apply is ON (`async_images=False`), NO extra delay → images might not be ready for first batch!

### 4. **Batch Size Matches Problem Symptoms**

- `MAX_PARALLEL_SLIDES = 10` (config.py line 153)
- User reports slides 1-8 missing images, 9+ have images
- This perfectly matches a 10-slide batch issue

## The Fix

### Files Modified

1. **`apps/backend/agents/domain/models.py`**
   - Added `search_terms: List[str]` field to ThemeDocument
   - Updated `to_dict()` and `empty()` methods

2. **`apps/backend/agents/generation/theme_director_new.py`**
   - Added `_generate_search_terms()` method (lines 623-810)
   - Generates 8-10 AI-powered search terms with examples
   - Includes brand/entity detection, fallback logic
   - Updated `generate_theme_document()` to call it (line 74)
   - Updated ThemeDocument creation to include search_terms (line 89)

3. **`apps/backend/api/requests/api_theme.py`**
   - Extract search_terms from ThemeDocument (line 291)
   - Persist search_terms to deck data (lines 323-325)
   - Log search terms for debugging (line 293)

### Search Terms Prompt Quality

The new prompt includes:

**✅ GOOD Examples**:
- Specific nouns: "Tesla Model 3", "data visualization", "mountain landscape"
- 1-3 words per term
- Brand/character names: "Pikachu", "Apple logo"
- Concrete objects: "solar panel", "business meeting"

**❌ BAD Examples (Avoided)**:
- Vague/abstract: introduction, agenda, overview, info, slide
- Generic single words: technology, data, business, power
- Single colors unless brand-specific
- Verbs and adjectives-only
- Presentation jargon

**Example Output** (for "Tesla Investor Presentation"):
```
Tesla Model 3
gigafactory aerial view
battery pack closeup
autonomous driving sensor
solar roof tiles
production line robotics
sustainable energy icon
metallic gradient texture
```

## Remaining Issues to Fix

### CRITICAL: Fix async_images Default Values

**File**: `apps/backend/api/requests/api_deck_create_stream.py` (line 47)
```python
# BEFORE
async_images: bool = Field(True, description="...")

# AFTER (should default to False for auto-apply)
async_images: bool = Field(False, description="If False, images are auto-applied synchronously; if True, user selects manually")
```

**File**: `apps/backend/api/requests/api_deck_compose_stream.py` (line 31)
```python
# BEFORE
async_images: bool = Field(default=True, description="...")

# AFTER
async_images: bool = Field(default=False, description="If False, images are auto-applied synchronously; if True, user selects manually")
```

**File**: `apps/backend/api/requests/api_openai_outline.py` (lines 749, 922)
```python
# BEFORE
async_images=request.async_images if request.async_images is not None else True

# AFTER
async_images=request.async_images if request.async_images is not None else False  # Default to auto-apply
```

### Optional: Add Timing Safety

**File**: `apps/backend/agents/generation/adapters.py` (after line 1318)

Add additional delay after synchronous search completes:
```python
# CRITICAL: Small delay to ensure all taggedMedia is properly set
await asyncio.sleep(0.5)
print(f"✅ Proceeding to slide generation with tagged images...")

# ADD THIS:
# Extra safety: verify all slides have media
slides_with_media = sum(1 for s in deck_outline.slides if hasattr(s, 'taggedMedia') and s.taggedMedia)
if slides_with_media < len(deck_outline.slides):
    logger.warning(f"⚠️ Only {slides_with_media}/{len(deck_outline.slides)} slides have images after sync search!")
    # Give it more time
    await asyncio.sleep(1.0)
```

## Testing Instructions

### Test 1: Verify Search Terms Generation

1. Start backend server
2. Generate a deck about "Pokemon: Pikachu Analysis"
3. Check logs for:
```
[THEME DIRECTOR] Generated X search terms: ['Pikachu', 'lightning bolt yellow', ...]
[THEME API] Persisting X search terms to deck data
```

### Test 2: Verify Auto-Apply Works on First Batch

1. Enable auto-apply toggle in frontend (autoSelectImages: true)
2. Generate deck with 12 slides
3. Check logs for these IN ORDER:

```
🎯 CRITICAL: async_images value = False  ← Must be False!

🔍 [SEARCH MODE CHECK] async_images=False
   - Will use SYNCHRONOUS search: True  ← Must be True!

🎯 AUTO-APPLY MODE: Searching for images synchronously BEFORE slide generation...

[... searches for all slides ...]

✅ AUTO-APPLY: Image search COMPLETE for 12 slides
   Total slides with images: 12/12  ← All slides!

📊 PRE-GENERATION CHECK: 12/12 slides have tagged media
   ✅ Good! Images were tagged BEFORE slide generation  ← CRITICAL!

[IMAGE FLOW 4/4] ✅ APPLYING TAGGED MEDIA  ← For EVERY slide!
```

4. Verify slides 1-8 AND 9+ ALL have images applied

### Test 3: Verify Search Term Quality

1. Generate deck about "Tesla Quarterly Report"
2. Check database or logs for search_terms
3. Verify terms are:
   - Concise (1-3 words)
   - Specific nouns/objects
   - No generic words (technology, data, business)
   - Related to Tesla (e.g., "Tesla Model 3", "gigafactory")

## Success Criteria

✅ ThemeDirector generates 8-10 search terms
✅ Search terms are persisted to deck data
✅ Search terms are used in synchronous image search
✅ All slides (1-N) have images when auto-apply is ON
✅ First batch (slides 1-8) gets images same as second batch
✅ Logs show correct timing: search BEFORE generation
✅ No placeholders when auto-apply is ON

## Files Changed

1. `apps/backend/agents/domain/models.py` - Added search_terms field
2. `apps/backend/agents/generation/theme_director_new.py` - Added search term generation
3. `apps/backend/api/requests/api_theme.py` - Extract and persist search_terms

## Files to Change (Recommended)

1. `apps/backend/api/requests/api_deck_create_stream.py` - Fix async_images default
2. `apps/backend/api/requests/api_deck_compose_stream.py` - Fix async_images default
3. `apps/backend/api/requests/api_openai_outline.py` - Fix async_images default
4. `apps/backend/agents/generation/adapters.py` - Add timing safety check (optional)

## Notes

- The term "async_images" is confusing and should be renamed to "manual_image_selection" or similar
- Consider adding a validation that auto-apply mode always runs synchronous search
- The 0.5s delay might need to be increased to 1.0s for very large decks (20+ slides)
- Search terms are deck-wide (not per-slide) for better coherence

