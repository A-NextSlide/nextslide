# Shape Text Formatting Fixes Complete

## Issues Fixed

### 1. Font Size Stability in Edit Mode
**Problem**: When clicking on text to edit, the font size would change (resize) due to measurement logic stopping during edit mode.

**Solution**:
- ✅ Added `nonEditingFontSizeRef` to cache the font size when not editing
- ✅ When entering edit mode, uses the cached non-editing font size instead of recalculating
- ✅ Prevents visual "jump" or resize when transitioning to edit mode
- ✅ Applied to both `TiptapTextBlockRenderer` and `ShapeWithTextRenderer`

### 2. Shape Padding vs Text Padding Clarification
**Problem**: Backend was generating shapes with padding added to position (x+30, y+30) and dimensions reduced, instead of using the `textPadding` property.

**Solution**:
- ✅ Updated prompts to clarify: Shape position is EXACT bounds (no padding offset)
- ✅ Use `textPadding` property for internal text spacing only
- ✅ Added clear examples showing WRONG vs CORRECT positioning
- ✅ Reduced default minimum padding from 8px to 6px for tighter shapes

### 3. Improved Text Formatting Defaults
**Default Settings Updated:**
- Font size: 24px (was 36px) - Better fit in shapes
- Line height: 1.4 (was 1.5) - Tighter line spacing
- Text padding: 16px (was 10px, tried 20px) - Balanced internal spacing
- Minimum padding: 6px (was 8px) - Allows tighter shapes when needed

### 4. Enhanced Word Wrapping & Text Flow
**CSS Improvements:**
- ✅ Added `word-wrap: break-word` everywhere
- ✅ Added `overflow-wrap: break-word` for long words
- ✅ Added `white-space: normal` to ensure wrapping
- ✅ Added `hyphens: auto` for automatic hyphenation
- ✅ Shape-specific CSS rules for proper text flow

### 5. Better Font Optimization Logic
**Optimization Enhancements:**
- ✅ Minimum font size for shapes: 12px (vs 8px for other components)
- ✅ Padding-aware safety margins:
  - 2% reduction when padding >30px
  - 3% reduction when padding >20px
  - 5% reduction otherwise
- ✅ Automatic line height adjustment (minimum 1.2, default 1.3 for shapes)
- ✅ Respects `fontOptimized` flag to prevent re-running

## Backend Prompt Updates

### html_inspired_generator.py
```
SHAPE TEXT PADDING: For Shape with hasText=true, use textPadding=16-20 ONLY (NOT position padding!)

Example Shape with text (CORRECT positioning):
{
  "type": "Shape",
  "props": {
    "position": {"x": 100, "y": 200},  // EXACT position - NO padding offset!
    "width": 400, "height": 200,  // FULL dimensions - NO reduction for padding!
    "hasText": true,
    "textPadding": 16,  // INTERNAL padding for text (16-20px typical)
    "fontSize": 24,
    "texts": [{"text": "Key Insight", "style": {}}]
  }
}

SHAPE POSITIONING RULES:
- Shape position is EXACT bounds (x, y, width, height) - DO NOT add padding to these values!
- Use textPadding property (16-20px) for internal text spacing
- textPadding is INSIDE the shape, not added to position/dimensions!
```

### html_inspired_system_prompt_dynamic.py
```
TEXT ON SHAPES: Use Shape with hasText=true and textPadding=16-20 (padding is INSIDE shape, not on position!)
GLASS CARD: Shape (white 10-20% opacity, blur 10-20, rounded 16-32px, hasText=true, textPadding=16-20)

SHAPE WITH TEXT RULES:
- Shape position is EXACT bounds (x, y, width, height)
- Use textPadding property for internal spacing (16-20px typical)
- DO NOT add padding to position - textPadding handles internal spacing automatically
```

## Files Modified

### Frontend
- `apps/frontend/src/renderers/components/TiptapTextBlockRenderer.tsx` - Added non-editing font size cache
- `apps/frontend/src/renderers/components/ShapeWithTextRenderer.tsx` - Added non-editing font size cache, reduced minimum padding to 6px
- `apps/frontend/src/registry/components/shape.ts` - Updated defaults (fontSize: 24, lineHeight: 1.4, textPadding: 16)
- `apps/frontend/src/services/ComponentOptimizationService.ts` - Shape-specific optimization (min 12px, line height management)
- `apps/frontend/src/utils/componentFittingUtils.ts` - Padding-aware overflow detection and conservative shrinking
- `apps/frontend/src/styles/TiptapStyles.css` - Added Shape-specific text wrapping rules

### Backend
- `apps/backend/agents/generation/html_inspired_generator.py` - Added Shape example, clarified textPadding usage
- `apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py` - Updated padding rules, added Shape positioning rules

## Key Improvements

✅ **Font size stays constant when entering edit mode** - No more resize on click
✅ **Shape position is exact** - No padding added to x/y coordinates
✅ **textPadding is internal** - Padding lives INSIDE the shape, not affecting position/dimensions
✅ **Better defaults** - 24px font, 16px textPadding, 1.4 line height
✅ **Proper text wrapping** - Long words break correctly, hyphens added automatically
✅ **Smart optimization** - Respects padding, maintains minimum 12px for shapes

## Testing

1. ✅ Create new shapes with text - should have exact positioning
2. ✅ Click to edit text - font size should NOT change
3. ✅ Text should have 16px internal padding by default
4. ✅ Long text should wrap properly without overflow
5. ✅ AI-generated shapes should use exact positioning with textPadding property

