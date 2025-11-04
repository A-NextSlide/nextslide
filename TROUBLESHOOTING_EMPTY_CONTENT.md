# Troubleshooting Empty Content Issue

## ⚠️ CRITICAL FIX: Comments API Database Schema Error (2025-11-02)

**Status:** FIXED ✅  

During slide generation, the comments API was failing with:
```
postgrest.exceptions.APIError: {'message': 'column users_1.raw_user_meta_data does not exist', 'code': '42703'}
```

This caused 500 errors when loading comments for each slide.

**Solution Applied:**
- Fixed `apps/backend/api/requests/api_comments.py` to use correct schema
- Created migration script: `apps/backend/scripts/apply_users_table_migration.py`

**To Apply Migration:**
```bash
cd apps/backend
python scripts/apply_users_table_migration.py
```

See [COMMENTS_API_FIX.md](./COMMENTS_API_FIX.md) for complete details.

---

## Issue Reported
Content is showing "Content for Slide 1" - suggesting placeholder or empty content.

## Fixes Applied

### 1. Fixed Hybrid Research Recursion Bug
**Problem**: In hybrid mode, the detail_level was being passed as 'detailed', causing infinite recursion.

**Fix**: Changed to use 'standard' detail level when calling Haiku in phase 2:
```python
haiku_options = OutlineOptions(
    prompt=enriched_prompt,
    detail_level='standard',  # Use 'standard' to avoid hybrid recursion
    ...
)
```

### 2. Added Comprehensive Logging
Added logging at key points to help debug:

#### Hybrid Mode Logging:
- `[HYBRID PHASE 1]` - Research data gathering
- `[HYBRID PHASE 2]` - Haiku structuring
- `[HYBRID]` - Success/failure of hybrid generation

#### Content Validation Logging:
- `[OUTLINE]` - Empty content detection
- `[OUTLINE]` - Fallback content generation
- `[OUTLINE]` - Slide parsing and validation

### 3. Added Fallback Content Generation
When slide content is empty, system now:
1. Logs a warning
2. Generates minimal fallback content:
```
• {slide_title}
• Key points
• Supporting details
```

### 4. Added Research Data Validation
In hybrid mode, validates that research data is substantial:
```python
if not research_data or len(research_data) < 50:
    logger.error(f"[HYBRID PHASE 1] Research data is too short or empty")
    return None
```

## How to Debug

### Check Logs for These Patterns:

#### 1. Empty Content Warning:
```
[OUTLINE] Slide 'Slide Title' has empty content!
[OUTLINE] Using fallback content for slide 'Slide Title'
```
**Meaning**: Model didn't return content for this slide

#### 2. Hybrid Mode Issues:
```
[HYBRID PHASE 1] Research complete: 2450 chars
[HYBRID PHASE 2] Structuring presentation with Haiku 4.5...
[HYBRID] Generated 6 slides
```
**Meaning**: Hybrid mode is working correctly

#### 3. JSON Parsing Errors:
```
[OUTLINE] Failed to parse JSON from model response: {error}
```
**Meaning**: Model response wasn't valid JSON

#### 4. Invalid Payload:
```
[OUTLINE] Invalid payload structure. Title: {title}, Slides: {type}
```
**Meaning**: Model response didn't have proper structure

## What Mode Are You Using?

The behavior differs based on detail level:

### Standard/Quick Mode (Presentation):
```
[OUTLINE] Using claude-haiku-4-5 for PRESENTATION mode (visual-focused, digestible content)
```
- Uses Haiku 4.5 directly
- Should generate short, punchy bullets (8-15 words)
- 40-80 words per slide

### Detailed Mode (Research):
```
[OUTLINE] Detail level is 'detailed' with hybrid mode enabled
[HYBRID PHASE 1] Gathering research data with Perplexity Pro...
[HYBRID PHASE 2] Structuring presentation with Haiku 4.5...
```
- Uses hybrid: Perplexity → Haiku
- Should have comprehensive research + digestible format

## Testing Steps

### 1. Test Standard Mode:
```bash
# Create a standard presentation
POST /api/outline/generate
{
  "prompt": "AI in Healthcare",
  "detail_level": "standard",
  "slide_count": 6
}
```

**Expected Logs**:
```
[OUTLINE] Using claude-haiku-4-5 for PRESENTATION mode
[OUTLINE] Parsed 6 slides from model response
```

**Expected Content**: Short bullets, 40-80 words/slide, no paragraphs

### 2. Test Detailed Mode:
```bash
# Create a detailed presentation
POST /api/outline/generate
{
  "prompt": "Comprehensive AI Market Analysis",
  "detail_level": "detailed",
  "slide_count": 10
}
```

**Expected Logs**:
```
[OUTLINE] Detail level is 'detailed' with hybrid mode enabled
[HYBRID PHASE 1] Research complete: 5000 chars
[HYBRID PHASE 2] Structuring presentation with Haiku 4.5...
[HYBRID] Successfully generated hybrid outline
[HYBRID] Generated 10 slides
```

**Expected Content**: Rich data + digestible format

### 3. Check for Empty Content:
If you see:
```
[OUTLINE] Slide 'Some Title' has empty content!
[OUTLINE] Using fallback content for slide 'Some Title'
```

**Possible Causes**:
1. Model didn't generate content for that slide
2. JSON parsing removed content
3. Content field was missing in model response

## Common Issues

### Issue: "Content for Slide 1" Appearing

**Possible Causes**:
1. **Model Response Empty**: Check logs for `empty content!`
2. **JSON Parse Failure**: Check logs for `Failed to parse JSON`
3. **Recursion Issue**: Should be fixed now with detail_level='standard' in phase 2
4. **Frontend Placeholder**: Could be coming from frontend (check GenerationStateManager.ts)

**Debug Steps**:
1. Check backend logs for `[OUTLINE]` and `[HYBRID]` messages
2. Look for empty content warnings
3. Check if JSON parsing succeeded
4. Verify model is being called correctly

### Issue: Too Much Text (Paragraphs)

**Expected Behavior Now**:
- **Standard Mode**: 8-15 words per bullet, 40-80 words/slide
- **Detailed Mode**: Still concise due to Phase 2 Haiku structuring

**If Still Happening**:
1. Check that `PRESENTATION_OUTLINE_MODEL = 'claude-haiku-4-5'` in config
2. Verify presentation-optimized prompts are being used
3. Check logs show "PRESENTATION mode" or "HYBRID" mode

## Configuration Check

Verify these settings in `apps/backend/agents/config.py`:

```python
# Should be Haiku for presentation mode
PRESENTATION_OUTLINE_MODEL = 'claude-haiku-4-5'

# Should be enabled for detailed mode
USE_HYBRID_RESEARCH_MODE = True

# Should be Perplexity Pro for research
PERPLEXITY_OUTLINE_MODEL = 'perplexity-sonar-pro'
```

## Next Steps

1. **Test a presentation** and check logs
2. **Look for warning messages** about empty content
3. **Verify model selection** in logs
4. **Check content quality** - should be digestible, not paragraphs

If issues persist, share the logs showing:
- `[OUTLINE]` messages
- `[HYBRID]` messages (if detailed mode)
- Any error or warning messages

