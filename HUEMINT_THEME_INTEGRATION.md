# Huemint AI Theme Integration

## Overview

Successfully integrated **Huemint AI** color palette generation into the deck theme generation system. When there's no recognized brand or entity, the system now uses Huemint AI instead of semantic database search, resulting in higher-quality, more aesthetically pleasing color palettes.

## Problem

Previously, when generating themes for decks without recognized brands/entities, the system would:
1. Search palette database by topic/keywords (hit or miss results)
2. Fall back to random database selection (inconsistent quality)

Meanwhile, the ComponentToolbar dropdown was using **Huemint AI** to generate beautiful palettes instantly.

## Solution

### Implementation

1. **Created `HuemintPaletteGenerator`** (`apps/backend/agents/tools/theme/huemint_palette_generator.py`)
   - Wraps Huemint API with proper error handling
   - Generates 1-10 palettes with configurable parameters
   - Supports variety seeding for deterministic generation
   - Can incorporate locked brand colors

2. **Updated `SmartColorSelector`** (`apps/backend/agents/tools/theme/smart_color_selector.py`)
   - Now uses Huemint AI as **primary method** when no brand/entity detected
   - Falls back to database search only if Huemint fails
   - Maintains existing brand/entity detection logic

3. **Updated exports** (`apps/backend/agents/tools/theme/__init__.py`)
   - Exported new Huemint tools for easy access

### Flow Priority (Non-Brand/Entity Requests)

```
1. SmartColorSelector._get_topic_colors()
   ↓
2. Try Huemint AI (NEW - Primary)
   ↓ (if fails)
3. Try database search by topic
   ↓ (if fails)
4. Try random database palette
   ↓ (if fails)
5. Use default palette
```

### Test Results

```bash
cd apps/backend && python3 test_huemint_integration.py
```

All tests passing:
- ✅ Direct Huemint generation works
- ✅ SmartColorSelector uses Huemint AI (no brand/entity)
- ✅ Fallback chain works correctly

Example output:
```
✅ Selected colors via: huemint_ai
   Colors: ['#fffdfc', '#e76900', '#272726', '#009746', '#0700f8']
   Backgrounds: ['#009746', '#00843D']
   Accents: ['#0700f8', '#272726']
   ✅ Huemint AI was used!
```

## Key Features

### 1. High-Quality AI Generation
Huemint uses transformer models to generate harmonious color palettes specifically designed for UI/design work.

### 2. Variety Seeding
Uses `variety_seed` parameter to generate different (but deterministic) palettes for variety across multiple deck generations.

### 3. Graceful Fallbacks
If Huemint API fails, the system falls back to existing database search methods, ensuring robust operation.

### 4. Brand Color Preservation
When brands ARE detected, the system still uses brand colors (web scraping/database) as intended.

## Usage Examples

### Direct Usage (Async Context)
```python
from agents.tools.theme import generate_huemint_palette

palette = await generate_huemint_palette(
    num_colors=5,
    variety_seed="unique-deck-id"
)
```

### Via SmartColorSelector
```python
from agents.tools.theme import SmartColorSelector

selector = SmartColorSelector()
result = await selector.select_colors_for_request(
    prompt="Create a presentation about renewable energy",
    title="Renewable Energy",
    variety_seed="deck-uuid"
)
# Will automatically use Huemint if no brand detected
```

### Via ThemeDirector (Automatic)
Theme generation during deck creation automatically uses the updated flow:
- Detects brands/entities → uses brand colors
- No brand/entity → uses Huemint AI ✨

## Benefits

1. **Better Quality**: AI-generated palettes are more harmonious than random database picks
2. **Consistency**: Both toolbar dropdown and deck generation use the same high-quality source
3. **Speed**: Huemint generates palettes quickly (< 500ms)
4. **Variety**: Seeding ensures different decks get different palettes
5. **Robustness**: Multiple fallback layers ensure system never fails

## Files Modified

- ✅ `apps/backend/agents/tools/theme/huemint_palette_generator.py` (NEW)
- ✅ `apps/backend/agents/tools/theme/smart_color_selector.py`
- ✅ `apps/backend/agents/tools/theme/palette_tools.py`
- ✅ `apps/backend/agents/tools/theme/__init__.py`
- ✅ `apps/backend/test_huemint_integration.py` (NEW - test script)

## Future Enhancements

Potential improvements:
1. Cache Huemint results to reduce API calls
2. Add user preference for "AI-generated" vs "curated database" palettes
3. Allow users to regenerate palette while keeping other theme elements
4. Expose Huemint temperature parameter for more/less creative palettes

## Notes

- `get_random_palette()` remains database-based since it's a sync function
- Main async paths (SmartColorSelector, ThemeDirector) now use Huemint
- Huemint API key not required - public endpoint
- API rate limits unknown - may need monitoring in production

