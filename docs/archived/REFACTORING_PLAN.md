# Outline Generation Refactoring Plan

## Current Problems

### 1. Duplicated Code Paths
- **Fast-path**: `_generate_with_perplexity()` (line 2419)
- **Streaming**: `_generate_slides_streaming_with_perplexity()` (line 1809)
- Both have similar mode-switching logic, prompt building, search params

### 2. Redundant State Variables
- `selectedSlidePreset` (ChatInputView.tsx line 172) - Used to be the main control
- `detailLevel` (OutlineEditor.tsx line 196) - Should be the single source of truth
- These conflict and cause bugs!

### 3. Scattered Mode Configuration
Mode-specific settings are hardcoded in multiple places:
- Line 1893: Search params for outline structure
- Line 2131: Max tokens per slide
- Line 2132: Search params per slide
- Prompts duplicated in multiple locations

### 4. Complex Prompt Logic
- Presentation mode prompt: Defined in 2 places (fast-path + streaming)
- Detailed mode prompt: Also duplicated
- Hard to maintain consistency

## Proposed Refactoring

### Phase 1: Centralize Mode Configuration

Create `apps/backend/services/outline/mode_config.py`:

```python
from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class ModeConfig:
    """Configuration for a specific detail mode"""
    model: str
    max_tokens_outline: int
    max_tokens_slide: int
    search_results: int
    search_recency: str  # "week" or "month"
    target_words_per_slide: tuple[int, int]  # (min, max)
    target_bullets_per_slide: tuple[int, int]
    prompt_template: str

# Define all modes in one place
MODE_CONFIGS = {
    'standard': ModeConfig(
        model='perplexity-sonar',
        max_tokens_outline=1000,
        max_tokens_slide=800,
        search_results=5,
        search_recency='week',
        target_words_per_slide=(30, 60),
        target_bullets_per_slide=(3, 4),
        prompt_template='presentation'
    ),
    'detailed': ModeConfig(
        model='perplexity-sonar-pro',
        max_tokens_outline=2000,
        max_tokens_slide=4000,
        search_results=10,
        search_recency='month',
        target_words_per_slide=(150, 500),
        target_bullets_per_slide=(5, 20),
        prompt_template='detailed'
    )
}

def get_mode_config(detail_level: str) -> ModeConfig:
    """Get configuration for a detail level"""
    return MODE_CONFIGS.get(detail_level, MODE_CONFIGS['standard'])

def get_search_params(detail_level: str) -> Dict[str, Any]:
    """Get Perplexity search params for mode"""
    config = get_mode_config(detail_level)
    return {
        "return_citations": True,
        "search_recency_filter": config.search_recency,
        "search_domain_filter": ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"],
        "num_search_results": config.search_results
    }
```

### Phase 2: Create Prompt Templates

Create `apps/backend/services/outline/prompt_templates.py`:

```python
def get_presentation_prompt(slide_title: str, presentation_title: str, context: str) -> str:
    """Ultra-concise presentation mode prompt"""
    return f"""Create ULTRA-CONCISE PRESENTATION content for this slide:

Presentation: {presentation_title}
Slide: {slide_title}
Context: {context}

🎨 PRESENTATION MODE - STRICT LIMITS:
- MAX 3-4 bullets
- MAX 10 words per bullet
- MAX 50 total words
- Include [IMAGE: description] tag

FORMAT (COPY THIS):
• AI reduces errors by 42%
• 85% patient satisfaction
• $187B market by 2030
[IMAGE: {slide_title.lower()}]

CITE ALL FACTS with [1], [2], [3] etc."""

def get_detailed_prompt(slide_title: str, presentation_title: str, context: str) -> str:
    """Comprehensive detailed mode prompt"""
    return f"""Create COMPREHENSIVE, INVESTMENT-GRADE content for this slide:

Presentation: {presentation_title}
Slide: {slide_title}
Context: {context}

CONTENT REQUIREMENTS:
- Write 250-500+ words (comprehensive)
- Use section headers (##)
- 5-20 bullets with sub-bullets
- Each bullet: 20-40 words with specific data
- Include metrics, percentages, names, dates

CITE ALL FACTS with [1], [2], [3] etc."""
```

### Phase 3: Unify Code Paths

Consolidate fast-path and streaming to use shared functions:

```python
class OutlineGenerator:
    async def _generate_slide_content(
        self, 
        slide_title: str, 
        slide_type: str,
        presentation_title: str,
        options: OutlineOptions,
        idx: int
    ) -> SlideContent:
        """Single method to generate one slide (used by both paths)"""
        config = get_mode_config(options.detail_level)
        
        # Build prompt based on type and mode
        if slide_type == 'title':
            prompt = get_title_prompt(...)
        elif slide_type in ['quote', 'stat']:
            prompt = get_callout_prompt(...)
        else:
            # Use mode-specific template
            if options.detail_level == 'detailed':
                prompt = get_detailed_prompt(...)
            else:
                prompt = get_presentation_prompt(...)
        
        # Make API call with mode-specific params
        response = await self._call_perplexity(
            prompt=prompt,
            max_tokens=config.max_tokens_slide,
            search_params=get_search_params(options.detail_level)
        )
        
        # Post-process based on mode
        content = response.content
        if options.detail_level != 'detailed':
            content = self._enforce_presentation_limits(content, slide_type)
        
        return SlideContent(...)
```

### Phase 4: Simplify Frontend

Remove `selectedSlidePreset` completely and use only `detailLevel`:

```tsx
// REMOVE this:
const [selectedSlidePreset, setSelectedSlidePreset] = useState<'auto' | 'quick' | 'medium' | 'detailed' | null>('auto');

// KEEP only this:
const [detailLevel, setDetailLevel] = useState<'quick' | 'standard' | 'detailed'>('standard');

// When generating:
await handleInitiateOutline(
  detailLevel,  // Single source of truth!
  selectedSlideCount
);
```

## Benefits of Refactoring

1. **Single Source of Truth**: One config file for all mode settings
2. **DRY**: No duplicated prompts or logic
3. **Easier to Maintain**: Change mode behavior in one place
4. **Fewer Bugs**: No conflicting state variables
5. **Clearer Code**: Mode logic is explicit and centralized

## Estimated Impact

**Before:**
- ~500 lines of duplicated mode logic
- 3+ places to update when changing mode behavior
- 2 state variables controlling same thing

**After:**
- ~150 lines in mode_config.py
- 1 place to update mode behavior
- 1 state variable

## Should We Do This Now?

This is a significant refactoring (1-2 hours) but would:
- ✅ Make future changes much easier
- ✅ Eliminate entire class of bugs (like the one we just found)
- ✅ Make codebase cleaner and more maintainable

**Want me to proceed with the refactoring?** Or should we:
1. Just fix the immediate bug (use `detailLevel` instead of `selectedSlidePreset`)
2. Leave refactoring for later

Let me know!

