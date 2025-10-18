# Brand Color Enhancement with Huemint AI

## Problem

When generating themes for decks with branded content, some brands have **minimal color palettes** (e.g., only 2-3 colors like black and white). While we want to respect brand colors, using only 2-3 colors makes slides visually monotonous and limits design possibilities.

### Example: Caper.ai
- Brand colors: `#333333` (black), `#FFFFFF` (white)
- Result: Very limited palette for creating engaging slides

## Solution

**Enhance minimal brand colors with AI-generated complementary colors** that harmonize with the brand identity.

### How It Works

1. **Detect minimal brand palettes** (< 4 colors)
2. **Use Huemint AI** to generate complementary colors that work with the brand
3. **Lock brand colors** in Huemint so they remain prominent
4. **Generate 2-3 additional harmonious colors** to supplement the palette

### Implementation

#### New Tool: `brand_color_enhancer.py`

```python
from agents.tools.theme import enhance_minimal_brand_colors

# Enhance minimal brand colors
enhanced = await enhance_minimal_brand_colors(
    brand_colors=['#333333', '#FFFFFF'],
    brand_name='Caper.ai',
    min_colors=5
)

# Result:
# {
#   'colors': ['#333333', '#FFFFFF', '#4A90E2', '#F59E0B', '#10B981'],
#   'brand_colors': ['#333333', '#FFFFFF'],  # Original preserved
#   'generated_colors': ['#4A90E2', '#F59E0B', '#10B981'],  # AI-generated
#   'source': 'brand_enhanced_with_ai',
#   'enhanced': True
# }
```

#### Integration Flow

```
Brand Detection
    ↓
Found < 4 colors?
    ↓ YES
Call enhance_minimal_brand_colors()
    ↓
Huemint AI generates complementary colors
    ↓
Brand colors + AI colors = Full palette
    ↓
Theme generation proceeds with enhanced palette
```

### Benefits

1. **Preserves Brand Identity**: Original brand colors remain primary
2. **Adds Visual Interest**: Additional colors for backgrounds, accents, highlights
3. **Maintains Harmony**: AI-generated colors are designed to work with brand colors
4. **Better Contrast**: More color options = better text contrast and readability

### Example Results

#### Before (Minimal Palette)
- **Caper.ai**: `#333333`, `#FFFFFF`
- Result: Black text on white, very plain

#### After (Enhanced Palette)
- **Caper.ai**: `#333333`, `#FFFFFF` (brand) + `#4A90E2`, `#F59E0B`, `#10B981` (AI)
- Result: Brand colors prominent, with blue accents, warm highlights, green CTAs

### Configuration

The enhancement triggers when:
- Brand has **< 4 colors**
- Generates up to **5 total colors** (adjustable)
- Uses Huemint **temperature 1.0** for harmony (lower = more conservative)

### Logging

Look for these logs to verify enhancement:

```
Brand Caper.ai has only 2 colors, enhancing with AI
Enhanced Caper.ai colors: ['#333333', '#FFFFFF'] + AI colors
```

### Testing

```bash
cd apps/backend
python3 test_brand_color_enhancement.py
```

Expected output:
```
✅ Minimal brand enhanced: 2 → 5 colors
✅ Brand colors preserved at front
✅ AI colors harmonious with brand
```

### Files Modified

- ✅ `agents/tools/theme/brand_color_enhancer.py` (NEW)
- ✅ `agents/tools/theme/smart_color_selector.py`
- ✅ `agents/tools/theme/__init__.py`

### Related

- Uses the **Huemint AI integration** from `HUEMINT_THEME_INTEGRATION.md`
- Complements (doesn't replace) existing brand color detection
- Works alongside semantic search fallbacks

## Future Enhancements

1. Allow users to approve/reject AI-generated colors
2. Learn from user preferences over time
3. Generate colors based on brand industry/vibe
4. Allow specifying which colors to lock (not just all brand colors)

