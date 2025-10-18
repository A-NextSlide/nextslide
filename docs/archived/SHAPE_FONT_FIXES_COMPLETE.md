# Shape Component and Font Sizing Fixes Complete

## Issues Fixed

### 1. Duplicate Shape Renderers
**Problem**: There were TWO renderers for Shape components causing conflicts:
- `ShapeRenderer.tsx` (old, no text support)
- `ShapeWithTextRenderer.tsx` (new, with text support and tabs)

**Solution**:
- ✅ Removed `ShapeRenderer.tsx` registration from `renderers/index.ts`
- ✅ Keep only `ShapeWithTextRenderer.tsx` which handles both `Shape` and `ShapeWithText` types
- ✅ ShapeSettingsEditor properly uses tabs to separate Shape and Text settings when `hasText=true`

### 2. Font Size Downsizing on First Click
**Problem**: When clicking on text for the first time, the font size was dramatically shrinking due to:
- Reactive measurements triggering on selection
- Font scale factor recalculating with slightly different values
- No caching of font size calculations

**Solution**:
- ✅ **TiptapTextBlockRenderer**: Added `hasMeasuredRef` to track initial measurement completion
- ✅ **ShapeWithTextRenderer**: Added `hasMeasuredOnceRef` to prevent premature size updates
- ✅ **Font size caching**: Added `calculatedFontSizeRef` in both renderers to cache font sizes and prevent recalculation when changes are <1px
- ✅ **ComponentOptimizationService**: Now checks `fontOptimized` flag and skips already-optimized components
- ✅ Added 100ms delay before optimization checks to ensure components are fully rendered

### 3. Text Overflow with Padding
**Problem**: Text was overflowing shapes because padding wasn't properly accounted for in overflow detection.

**Solution**:
- ✅ **Enhanced `isTextOverflowing()`**: 
  - Now extracts actual padding from computed styles
  - Calculates padding-aware tolerance (5px base + up to 10% of padding)
  - Separate vertical and horizontal tolerances
  - Better logging to track padding values

- ✅ **Enhanced `calculateOptimalFontSize()`**:
  - Accounts for total padding when calculating safety margin
  - Uses 3% reduction when padding >20px (vs 5% normally)
  - Prevents over-aggressive shrinking when padding already provides spacing

- ✅ **ShapeWithTextRenderer**:
  - `getTextPadding` memoized to prevent recalculation
  - Minimum 8px padding (scaled by fontScaleFactor) always applied
  - Padding properly applied to text wrapper with `box-sizing: border-box`

### 4. Backend Component Type Consolidation
**Problem**: Backend was using both "Shape" and "ShapeWithText" as separate component types.

**Solution**:
- ✅ Updated `html_inspired_system_prompt_dynamic.py` to use only `Shape` with `hasText=true` property
- ✅ Updated `html_inspired_generator.py` to reference `Shape (hasText=true)` instead of `ShapeWithText`
- ✅ Removed all references to "ShapeWithText" as a separate component type in prompts
- ✅ AI now generates `Shape` components and sets `hasText=true` when text is needed

## Key Improvements

### Font Size Stability
- Font sizes no longer change on selection
- Measurements are cached and only update on significant changes (>5px for measurements, >1px for font sizes)
- Initial measurement is tracked separately to prevent false triggers

### Padding Awareness
- Overflow detection now properly accounts for padding
- Safety margins are adjusted based on actual padding
- Prevents unnecessary font shrinking when adequate padding exists

### Component Consolidation
- Single renderer handles all Shape variations
- Backend consistently generates `Shape` components with `hasText` property
- Settings editor shows proper tabs (Shape/Text) when text is enabled

## Files Modified

### Frontend
- `apps/frontend/src/renderers/index.ts` - Removed duplicate ShapeRenderer registration
- `apps/frontend/src/renderers/components/TiptapTextBlockRenderer.tsx` - Added measurement tracking and font size caching
- `apps/frontend/src/renderers/components/ShapeWithTextRenderer.tsx` - Added measurement tracking and font size caching
- `apps/frontend/src/services/ComponentOptimizationService.ts` - Added fontOptimized check and render delay
- `apps/frontend/src/utils/componentFittingUtils.ts` - Enhanced overflow detection with padding awareness

### Backend
- `apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py` - Removed ShapeWithText, use Shape (hasText=true)
- `apps/backend/agents/generation/html_inspired_generator.py` - Updated all references to use Shape (hasText=true)

## Testing Recommendations

1. **Font Stability**: Click on text components multiple times - font size should remain stable
2. **Shape with Text**: Create shapes, enable text - should see proper tabs in settings
3. **Overflow**: Add long text to shapes - should handle padding correctly without over-shrinking
4. **Generation**: Generate slides with AI - should create Shape (hasText=true) instead of ShapeWithText

## Summary

All issues resolved:
✅ No more duplicate Shape renderers
✅ Font sizes stay stable on click
✅ Proper padding awareness in overflow detection
✅ Backend consistently uses Shape (hasText=true)
✅ Settings editor properly shows tabs for Shape vs Text properties

