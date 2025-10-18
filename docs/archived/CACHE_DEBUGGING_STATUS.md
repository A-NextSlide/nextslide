# Claude Cache Debugging Status 🔍

## Current Situation

**Cache is NOT working** - Evidence from your logs shows ~3,000-4,000 input tokens on EVERY request, but should be ~300-500 after the first slide.

## Expected vs Actual

### Expected (if caching works):
```
Slide 1:  System (900) + Cached User (3000) + Dynamic (300) = 4,200 tokens
          Cache created: 3,900 tokens

Slides 2-10: System (0 - cached) + Cached User (0 - cached) + Dynamic (300) = 300 tokens
             Cache read: 3,900 tokens
```

### Actual (from your logs):
```
All slides: ~4,000 tokens
No cache_read_input_tokens visible
```

## Code Analysis

I reviewed the entire caching implementation:

### ✅ What's CORRECT:
1. **Cache delimiter is in place**: `<<<CACHE_BREAKPOINT>>>`  in user prompts
2. **System message formatted for caching**: Content blocks with `cache_control`
3. **User message formatted for caching**: Split at delimiter with `cache_control` on first part
4. **deck_uuid passed correctly**: All slides use same deck_uuid as cache_static_id
5. **API headers set**: `anthropic-beta: prompt-caching-2024-07-31` header included
6. **Cache metrics extraction**: Multiple places logging `cache_read_input_tokens` and `cache_creation_input_tokens`

### 🔍 What I Added:
**Better logging** to see exactly what's being cached:

```python
# Now logs:
[CLAUDE CACHE] using cache id deck:{uuid}
[CLAUDE CACHE] Formatted system message with cache_control: X chars
[CLAUDE CACHE] Formatted user message with cache_control: pre=X chars, post=Y chars
[CLAUDE CACHE] read={tokens}, created={tokens}
[CLAUDE CACHE PROBE] read={tokens}, created={tokens}
```

## What to Check Next

**Generate a new deck and check logs for these messages:**

### 1. Verify Cache Setup
Look for in logs:
```
[CLAUDE CACHE] using cache id deck:abc-123-def
[CLAUDE CACHE] Formatted system message with cache_control: ~900 chars
[CLAUDE CACHE] Formatted user message with cache_control: pre=~3000 chars, post=~300 chars
```

If you DON'T see these messages, the cache formatting isn't happening.

### 2. Check Cache Metrics
Look for in logs:
```
[CLAUDE CACHE] read={number}, created={number}
```

**Slide 1 should show:**
```
[CLAUDE CACHE] read=None, created=3900
```

**Slides 2-10 should show:**
```
[CLAUDE CACHE] read=3900, created=None
```

If you see `read=None, created=None` on all slides, the cache isn't working!

### 3. Check Anthropic Dashboard
Go to https://console.anthropic.com/settings/logs

Look at the API requests and check if they show:
- `cache_creation_input_tokens` on first request
- `cache_read_input_tokens` on subsequent requests

## Possible Causes if Still Not Working

1. **Instructor Library Issue**
   - The Instructor wrapper might not be passing cache_control blocks correctly
   - Solution: Check Instructor version, may need upgrade or workaround

2. **Content Variation**
   - If the "static" part changes slightly between slides, cache won't hit
   - Solution: Verify cached part is EXACTLY identical across slides

3. **Time Gap**
   - Cache expires after 5 minutes
   - Solution: Ensure slides generate within 5 minutes of each other

4. **Model Version**
   - Caching only works with specific Claude models
   - Solution: Verify using `claude-sonnet-4-5-20250929` (supports caching)

## Files Modified

1. ✅ `apps/backend/agents/ai/clients.py` - Added comprehensive cache logging
2. ✅ `apps/backend/agents/generation/html_inspired_generator.py` - Already set up for caching
3. ✅ `apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py` - Condensed to 178 lines

## Next Steps

1. **Generate a test deck** (5-10 slides)
2. **Check the backend logs** for the cache messages above
3. **Share the logs** showing:
   - `[CLAUDE CACHE]` messages
   - The input token counts for each slide
4. **Check Anthropic dashboard** for cache metrics

## Quick Test

If you want to quickly test if caching is set up correctly:

```bash
# In backend directory
cd apps/backend

# Generate a deck and watch for cache messages
# The logs should show cache_created on first slide, cache_read on others
```

## Expected Savings

If caching works properly for a 10-slide deck:
- **Before**: 10 × 4,000 = 40,000 tokens
- **After**: 4,000 + (9 × 300) = 6,700 tokens
- **Savings**: 33,300 tokens (83% reduction!)

---

**Status**: 🔧 **DEBUGGING** - Code looks correct, need logs from next generation to diagnose
**Files Ready**: ✅ All caching code in place with enhanced logging
**Action Required**: Generate a deck and check logs for cache messages

