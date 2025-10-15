# Chart Thumbnails Fix

## Problem
Charts were not appearing in thumbnails (e.g., in DeckThumbnail, MiniSlide components). Instead, they showed placeholders or were completely missing.

## Root Cause
The issue was a combination of two problems:

1. **Missing prop propagation**: The `isThumbnail` prop was not being passed from `ComponentRenderer` to chart renderers
2. **Overly aggressive suppression**: The `BaseChartRenderer` was suppressing chart rendering entirely when `isThumbnail` was true, showing only a placeholder

## Changes Made

### 1. ComponentRenderer.tsx
**File**: `/apps/frontend/src/renderers/ComponentRenderer.tsx`

Added `isThumbnail` to the base `rendererProps` object so all renderers receive it:

```typescript
const rendererProps: RendererProps = {
  component,
  isSelected,
  isEditing,
  isResizing,
  isDragging,
  isThumbnail,  // ← Added this line
  containerRef,
  styles: componentContentStyle,
  slideId: activeSlideId,
};
```

**Before**: Only `TiptapTextBlock`, `CustomComponent`, and `Table` renderers received the `isThumbnail` prop
**After**: All renderers, including Chart renderers, now receive the `isThumbnail` prop

### 2. BaseChartRenderer.tsx
**File**: `/apps/frontend/src/charts/renderers/BaseChartRenderer.tsx`

#### Change 1: Allow rendering in thumbnail mode
Removed the check that prevented rendering when `isThumbnail` was true. Now only the explicit `_suppressAllRenders` flag will show a placeholder.

**Before**:
```typescript
const isThumb = chartProps.isThumbnail === true;
const suppressAll = (props as any)._suppressAllRenders === true;
if (isThumb || suppressAll) {
  // Show placeholder or cached image
}
```

**After**:
```typescript
const suppressAll = (props as any)._suppressAllRenders === true;
if (suppressAll) {
  // Show placeholder or cached image
}
```

#### Change 2: Disable animations for thumbnails
Added a check to disable animations when rendering thumbnails for better performance:

```typescript
const currentShouldAnimate = (() => {
  // Disable animations for thumbnails
  if (chartProps.isThumbnail === true) return false;
  
  // ... rest of animation logic
})();
```

## Flow After Fix

1. `MiniSlide` component renders with `isThumbnail={true}`
2. `Slide` component receives and passes through `isThumbnail={true}`
3. `ComponentRenderer` includes `isThumbnail` in base `rendererProps` ✅
4. `ChartRenderer` receives `isThumbnail` and passes it to `BaseChartRenderer`
5. `BaseChartRenderer` renders the chart normally (without animations) ✅

## Benefits

- ✅ Charts now appear correctly in all thumbnails
- ✅ Better performance (animations disabled for thumbnails)
- ✅ Consistent rendering across all component types
- ✅ More maintainable code (prop passed through standard mechanism)

## Testing

To verify the fix:
1. Create a slide with one or more charts
2. Navigate to deck list view or any view that shows thumbnails
3. Verify that charts appear in thumbnails (not just placeholders)
4. Verify that charts in thumbnails are static (no animations)

## Files Modified

- `/apps/frontend/src/renderers/ComponentRenderer.tsx`
- `/apps/frontend/src/charts/renderers/BaseChartRenderer.tsx`

