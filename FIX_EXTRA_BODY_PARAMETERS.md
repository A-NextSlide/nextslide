# Fix: 'return_citations: Extra inputs are not permitted'

## Problem
After fixing the Anthropic client interface issue, a new error appeared:
```
Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'return_citations: Extra inputs are not permitted'}}
```

## Root Cause
The code was passing Perplexity-specific parameters (`return_citations`, `search_recency_filter`, etc.) via `extra_body` to **all models**, including Claude/Anthropic. Anthropic doesn't accept these parameters and rejects them with a 400 error.

## Solution
Added conditional logic to only pass `extra_body` parameters for Perplexity models.

## Files Modified

### `/apps/backend/services/outline/generator.py`

#### Fixed 3 locations:

### 1. Outline Structure Generation (line ~1968)

**BEFORE** (broken - passes extra_body to all models):
```python
outline_text = await loop.run_in_executor(
    None,
    lambda: invoke(
        client=client,
        model=model_name,
        messages=[{"role": "user", "content": outline_prompt}],
        response_model=None,
        temperature=0.2,
        max_tokens=1000,
        extra_body=search_params  # ❌ Passed to Claude too!
    )
)
```

**AFTER** (fixed - only passes extra_body to Perplexity):
```python
invoke_kwargs = {
    "client": client,
    "model": model_name,
    "messages": [{"role": "user", "content": outline_prompt}],
    "response_model": None,
    "temperature": 0.2,
    "max_tokens": 1000
}
# ✅ Only add extra_body for Perplexity models
if model_name.startswith("perplexity-") or "sonar" in model_name:
    invoke_kwargs["extra_body"] = search_params

outline_text = await loop.run_in_executor(
    None,
    lambda: invoke(**invoke_kwargs)
)
```

### 2. Slide Content Generation (line ~2213)

**BEFORE** (broken):
```python
slide_content = await loop.run_in_executor(
    None,
    lambda: invoke(
        client=client,
        model=model_name,
        messages=[{"role": "user", "content": slide_prompt}],
        response_model=None,
        temperature=0.3,
        max_tokens=max_tokens_for_slide,
        extra_body=slide_search_params  # ❌ Passed to Claude too!
    )
)
```

**AFTER** (fixed):
```python
invoke_kwargs = {
    "client": client,
    "model": model_name,
    "messages": [{"role": "user", "content": slide_prompt}],
    "response_model": None,
    "temperature": 0.3,
    "max_tokens": max_tokens_for_slide
}
# ✅ Only add extra_body for Perplexity models
if model_name.startswith("perplexity-") or "sonar" in model_name:
    invoke_kwargs["extra_body"] = slide_search_params

slide_content = await loop.run_in_executor(
    None,
    lambda: invoke(**invoke_kwargs)
)
```

### 3. Chart Data Generation (line ~2468)

**BEFORE** (broken):
```python
response_text = await loop.run_in_executor(
    None,
    lambda: invoke(
        client=client,
        model=model_name,
        messages=[{"role": "user", "content": data_prompt}],
        response_model=None,
        temperature=0.1,
        max_tokens=400,
        extra_body={  # ❌ Passed to Claude too!
            "return_citations": True,
            "search_recency_filter": "month",
            ...
        }
    )
)
```

**AFTER** (fixed):
```python
invoke_kwargs = {
    "client": client,
    "model": model_name,
    "messages": [{"role": "user", "content": data_prompt}],
    "response_model": None,
    "temperature": 0.1,
    "max_tokens": 400
}
# ✅ Only add extra_body for Perplexity models
if model_name.startswith("perplexity-") or "sonar" in model_name:
    invoke_kwargs["extra_body"] = {
        "return_citations": True,
        "search_recency_filter": "month",
        "search_domain_filter": ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"],
        "num_search_results": 10
    }

response_text = await loop.run_in_executor(
    None,
    lambda: invoke(**invoke_kwargs)
)
```

## How It Works Now

### For Claude/Haiku (Presentation Mode):
```python
invoke_kwargs = {
    "client": anthropic_client,
    "model": "claude-haiku-4-5-20251001",
    "messages": [...],
    "temperature": 0.3,
    "max_tokens": 800
}
# No extra_body added - condition fails ✅
if "claude-haiku-4-5-20251001".startswith("perplexity-"):  # False
    # This block is skipped
    
invoke(**invoke_kwargs)  # Clean call without extra_body
```

### For Perplexity:
```python
invoke_kwargs = {
    "client": perplexity_client,
    "model": "perplexity-sonar",
    "messages": [...],
    "temperature": 0.3,
    "max_tokens": 1200
}
# extra_body IS added - condition passes ✅
if "perplexity-sonar".startswith("perplexity-"):  # True
    invoke_kwargs["extra_body"] = {
        "return_citations": True,
        "search_recency_filter": "week",
        "num_search_results": 5
    }
    
invoke(**invoke_kwargs)  # Includes extra_body for Perplexity
```

## Detection Logic

The code detects Perplexity models using:
```python
if model_name.startswith("perplexity-") or "sonar" in model_name:
```

This catches:
- `perplexity-sonar`
- `perplexity-sonar-pro`
- `sonar`
- `sonar-pro`
- `sonar-reasoning`
- Any future Perplexity model names

## Testing

After this fix, both model types work correctly:

### ✅ Claude/Haiku (Presentation Mode):
```
[OUTLINE] Using claude-haiku-4-5 for PRESENTATION mode
[PARALLEL] API call completed for slide 1
[PARALLEL] API call completed for slide 2
```
No more `return_citations: Extra inputs are not permitted` errors!

### ✅ Perplexity (Research Mode):
```
[OUTLINE] Using perplexity-sonar-pro for DETAILED mode
[PARALLEL] API call completed for slide 1 (with search results)
```
Still gets search capabilities via `extra_body`!

## Related Fixes

This completes the series of fixes for Haiku 4.5 presentation mode:

1. ✅ Fixed recursion bug in hybrid mode
2. ✅ Fixed `'Anthropic' object has no attribute 'chat'` error  
3. ✅ Fixed `return_citations: Extra inputs are not permitted` error

Now presentation mode with Haiku 4.5 works perfectly! 🎉

