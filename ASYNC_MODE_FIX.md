# Async Mode Compatibility Fix

## Issue

When running in PLACEHOLDER MODE (async_images=True), the background image search crashed with:

```
KeyError: slice(None, 10, None)
at deck_wide_topics = deck_wide_topics[:10]
```

## Root Cause

The `search_images_background` method in `combined_image_service.py` expected `deck_wide_topics` to be a **list**, but our per-component changes made it return a **dict** in some cases:

```python
# Old format (list):
deck_wide_topics = ['video', 'games', 'arcade']

# New format (dict - per slide):
deck_wide_topics = {
  '0': ['video', 'game'],
  '1': ['arcade', 'golden']
}
```

When the code tried to slice the dict (`deck_wide_topics[:10]`), it failed because dicts don't support slicing.

## Fix Applied

**File:** `apps/backend/services/combined_image_service.py` (Lines 1460-1472)

**Added type checking and conversion:**

```python
if deck_wide_topics:
    # Handle both list (old format) and dict (new per-slide format)
    if isinstance(deck_wide_topics, dict):
        # Convert dict values to flat list of all terms
        all_terms = []
        for slide_terms in deck_wide_topics.values():
            if isinstance(slide_terms, list):
                all_terms.extend(slide_terms)
        deck_wide_topics = all_terms[:10]  # Limit to 10 topics
        logger.info(f"Converted per-slide dict to flat list: {deck_wide_topics}")
    elif isinstance(deck_wide_topics, list):
        deck_wide_topics = deck_wide_topics[:10]  # Limit to 10 topics
        logger.info(f"Using flat list of topics: {deck_wide_topics}")
```

**What it does:**
1. Checks if `deck_wide_topics` is a dict (new format)
2. If dict: Extracts all term lists from values and flattens them
3. If list: Uses as-is (backward compatible)
4. Slices to max 10 topics
5. Logs which path was used

## Testing

Now both modes work:

### AUTO-APPLY MODE (async_images=False):
- Uses per-slide search with new dict format
- Searches 2-3 terms per slide
- Works correctly ✅

### PLACEHOLDER MODE (async_images=True):
- Receives dict format from theme
- Converts to flat list for background search
- No more KeyError ✅
- Works correctly ✅

## Backward Compatibility

The fix maintains compatibility with:
- Old decks that have list format
- New decks with dict format
- Mixed scenarios where some have old format

**Backend is now fully compatible with both the old and new search term formats!** 🎉

