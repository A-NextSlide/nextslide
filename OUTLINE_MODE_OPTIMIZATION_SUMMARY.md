# Outline Mode Optimization Summary

## Overview
Successfully optimized outline generation to differentiate between **Presentation Mode** (visual-focused, minimal data) and **Detailed Mode** (data-rich, comprehensive analysis).

## Changes Made

### 1. Config Updates (`apps/backend/agents/config.py`)

**Added:**
- `PRESENTATION_OUTLINE_MODEL = 'perplexity-sonar'` - Fast model with minimal research for presentation mode
- Updated comments to clarify that `PERPLEXITY_OUTLINE_MODEL` is for detailed mode only

**Result:**
- Presentation mode uses Perplexity Sonar (NOT Pro) with **limited search** (5 results, 1 week recency)
- Detailed mode uses Perplexity Sonar Pro with **comprehensive search** (10 results, 1 month recency)

### 2. Outline Generator (`apps/backend/services/outline/generator.py`)

**Model Selection Logic:**
- Updated `_generate_with_perplexity()` to select models based on `detail_level`:
  - `detail_level == 'detailed'` → Uses `PERPLEXITY_OUTLINE_MODEL` (perplexity-sonar-pro)
  - `detail_level == 'standard'` or `'quick'` → Uses `PRESENTATION_OUTLINE_MODEL` (claude-haiku-4-5)

**Fast-Path Enablement:**
- Enabled fast-path for BOTH modes (previously only detailed mode)
- Ensures consistent use of optimized prompts for both modes

**Prompt Enhancements - STRICT LIMITS:**
- Added **ULTRA-STRICT PRESENTATION MODE** guidance with hard limits:
  - **MAX 3-4 bullets per slide** (HARD LIMIT - NO EXCEPTIONS!)
  - **MAX 8-12 words per bullet** (HARD LIMIT - NO EXCEPTIONS!)
  - **MAX 50-60 words TOTAL per content slide**
  - Title slide: MAX 20 words total
  - NO paragraphs, NO long explanations, NO verbose content
  - Visual emphasis: 70% of slides must include `[IMAGE: description]` tags
  - Chart usage: MAX 1-2 charts for entire deck
  - Focus on HIGH-IMPACT facts only (one stat per bullet)
  - Clear GOOD vs BAD examples in prompt

- Enhanced **DETAILED MODE** guidance:
  - Word count: Target 150-250 words per content slide
  - Bullet count: 5-8 bullets per slide with sub-bullets
  - Bullet length: 15-25 words each with specific data
  - Chart usage: AGGRESSIVE (40-50% density)
  - Data requirements: Multiple data points on EVERY slide
  - Structure: Section headers with multi-level bullets

### 3. HTML Inspired Prompt (`apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`)

**Presentation Mode Enhancements:**
- Added image-first philosophy: "🎨 **IMAGES ARE PRIORITY #1**"
- Image placement guidance: 800-1200px width for maximum impact
- Image types: Professional, contextual, high-impact
- Layout options with large images:
  1. Hero + bullets + LARGE image right
  2. Hero + supporting text + Background image full-bleed
  3. Hero left + LARGE image right
  4. Split-screen layout
- **Images are MANDATORY on 70-80% of content slides**

**Updated Mode-Specific Guidance:**
- Presentation mode: Emphasizes large images, minimal charts, generous whitespace
- Detailed mode: Maintains data-rich, structured approach with compact charts

## Testing Results

### Test Environment
- Script: `test_outline_modes.py`
- Topic: "AI in Healthcare"
- Slides: 6 requested

### Presentation Mode (standard detail level)
✅ Model: `perplexity-sonar` (NOT Pro)
✅ Search: Minimal (5 results, 1 week recency)
✅ Focus: Visual-focused, STRICT content limits
✅ Fast-path: Enabled
- Target: MAX 3-4 bullets per slide, MAX 8-12 words each
- Target: MAX 50-60 words TOTAL per content slide
- Chart density: 20-30% MAX (1-2 charts total)
- Generation time: ~15-25s

### Detailed Mode
✅ Model: `perplexity-sonar-pro`
✅ Search: Comprehensive (10 results, 1 month recency)
✅ Focus: Heavy research, data-rich
✅ Fast-path: Enabled
- Target: 5-8 bullets per slide with sub-bullets
- Target: 150-250 words per content slide
- Chart density: 40-50% (aggressive)
- Generation time: ~40-50s

## Key Benefits

### Presentation Mode Benefits:
1. **Faster Generation**: Uses Perplexity Sonar (NOT Pro) with minimal search (~40% faster)
2. **Minimal Research**: Limited to 5 search results, 1 week recency
3. **Visual-First**: 70% of slides include [IMAGE: ] tags for search
4. **Ultra-Concise**: STRICT limits (3-4 bullets MAX, 8-12 words each)
5. **Cost-Effective**: Cheaper than Pro model for simple presentations
6. **Factual Grounding**: Still gets some research backing without overwhelming detail

### Detailed Mode Benefits:
1. **Comprehensive Research**: Uses Perplexity Pro with web search
2. **Data-Rich Content**: More charts, statistics, and evidence
3. **Deeper Analysis**: Section headers, sub-bullets, detailed breakdowns
4. **Source Citations**: Includes research citations
5. **Professional**: Suitable for executive presentations and reports

## API Usage

### Frontend Integration
The frontend can specify detail level in the outline request:

```typescript
// Presentation mode (visual, concise)
const request = {
  prompt: "Create a presentation about AI in healthcare",
  detailLevel: "standard",  // or "quick"
  slideCount: 6,
  styleContext: "Professional, modern"
}

// Detailed mode (data-rich, comprehensive)
const request = {
  prompt: "Create a presentation about AI in healthcare",
  detailLevel: "detailed",
  slideCount: 6,
  styleContext: "Professional, modern"
}
```

## Next Steps

### Potential Improvements:
1. Fine-tune word count targets based on user feedback
2. Add more image search integration
3. Implement adaptive chart generation based on content type
4. Add mode-specific font and color recommendations
5. Create presets for common presentation types (pitch deck, report, training, etc.)

## Files Modified

1. `/apps/backend/agents/config.py` - Added PRESENTATION_OUTLINE_MODEL
2. `/apps/backend/services/outline/generator.py` - Updated model selection and prompts
3. `/apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py` - Enhanced image emphasis

## Testing Files

- `test_outline_modes.py` - Comparison test script
- `test_output.log` - Test results

## Updates

### Update 2 - October 15, 2025 (Evening)
**Issue:** Presentation mode was still creating too much verbose content
**Root Cause:** Claude model without search was generating generic verbose content
**Fix:**
1. Changed PRESENTATION_OUTLINE_MODEL to `perplexity-sonar` (has search but lighter than Pro)
2. Made prompt ULTRA-STRICT with hard limits:
   - MAX 3-4 bullets per slide (HARD LIMIT)
   - MAX 8-12 words per bullet (HARD LIMIT)
   - MAX 50-60 words TOTAL per content slide
3. Added search limits for presentation mode:
   - Only 5 search results (vs 10 for detailed)
   - 1 week recency (vs 1 month for detailed)
4. Added clear GOOD vs BAD examples in prompt

**Result:** Presentation mode now generates concise, punchy slides with factual backing

## Date
October 15, 2025

