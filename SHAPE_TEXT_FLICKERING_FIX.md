# Shape Text Flickering Fix - Complete (v2)

## Problem Statement
When clicking on a shape with text, the text would flash huge then return to normal size. Additionally, the first time clicking a shape, the text size would visibly adjust. Thumbnails were also not showing shape text properly.

## Root Causes
1. **Delayed Initial Measurement**: The `componentRenderedWidth` was initialized with `actualWidth` (the specified width in pixels), but the actual rendered width could be different due to percentage-based scaling in ComponentRenderer. This mismatch caused the initial font size to be wrong, then adjust on first measurement.

2. **Measurement Triggered on Selection**: The ResizeObserver was updating `componentRenderedWidth` even on minor size changes (like selection border adding a few pixels), triggering unnecessary font size recalculations.

3. **No Distinction Between Thumbnails and Slides**: Font scaling logic didn't properly account for the difference between thumbnail rendering (which uses CSS transform scaling) and normal slide rendering (which needs proportional font scaling).

## Solutions Implemented

### 1. Smart Initial Width Calculation
**File**: `apps/frontend/src/renderers/components/ShapeWithTextRenderer.tsx`

**Changes**:
- Calculate initial rendered width based on slide container dimensions
- Perform ONE synchronous measurement immediately on mount
- Prevents the initial flash by starting with the correct size

**Before**:
```typescript
const [componentRenderedWidth, setComponentRenderedWidth] = useState<number>(actualWidth);
const hasInitialMeasurement = useRef(false);

useEffect(() => {
  // Would measure AFTER first render, causing visible adjustment
  if (rect.width > 0 && !hasInitialMeasurement.current) {
    hasInitialMeasurement.current = true;
    componentRenderedWidthRef.current = rect.width;
    setComponentRenderedWidth(rect.width);
  }
  // ...
}, [isThumbnail, isCurrentlyTextEditing]);
```

**After**:
```typescript
const getInitialRenderedWidth = () => {
  if (!containerRef.current) {
    // Calculate expected rendered width based on slide container
    const slideContainer = document.querySelector('#slide-display-container');
    if (slideContainer) {
      const slideRect = slideContainer.getBoundingClientRect();
      const slideWidth = slideRect.width || DEFAULT_SLIDE_WIDTH;
      // Component width as percentage of slide width
      return (actualWidth / DEFAULT_SLIDE_WIDTH) * slideWidth;
    }
    return actualWidth;
  }
  return containerRef.current.getBoundingClientRect().width || actualWidth;
};

const [componentRenderedWidth, setComponentRenderedWidth] = useState<number>(getInitialRenderedWidth);

useEffect(() => {
  if (isThumbnail || isCurrentlyTextEditing) return;
  if (!containerRef.current) return;
  
  // Do ONE immediate measurement synchronously
  const initialRect = containerRef.current.getBoundingClientRect();
  if (initialRect.width > 0) {
    componentRenderedWidthRef.current = initialRect.width;
    setComponentRenderedWidth(initialRect.width);
  }
  
  // Then set up observer for future changes
  // ...
}, [isThumbnail, isCurrentlyTextEditing]);
```

### 2. Stabilized Font Size Calculation with Smart Caching
**Changes**:
- Keep font scaling for normal slide view (needed for proper sizing)
- Disable font scaling for thumbnails (CSS transform handles it)
- Use 0.5px tolerance threshold to prevent micro-adjustments
- Clear separation between thumbnail and slide rendering logic

**Code**:
```typescript
const fontScaleFactor = useMemo(() => {
  // Thumbnails are already scaled by outer slide transform
  if (isThumbnail) {
    return 1;
  }
  
  // For regular slides, calculate scale based on rendered vs specified width
  const specifiedWidth = actualWidth || 600;
  const scaleFactor = componentRenderedWidth / specifiedWidth;
  
  return scaleFactor;
}, [isThumbnail, actualWidth, componentRenderedWidth]);

const getFontSize = useMemo(() => {
  const nativeSize = props.fontSize || effectiveFontSize || 16;
  const finalSize = nativeSize * fontScaleFactor;

  // Use cached value if very close (within 0.5px) to prevent micro-adjustments
  if (stableFontSizeRef.current) {
    const currentSize = parseFloat(stableFontSizeRef.current);
    if (Math.abs(currentSize - finalSize) < 0.5) {
      return stableFontSizeRef.current;
    }
  }

  const result = `${finalSize}px`;
  stableFontSizeRef.current = result;
  return result;
}, [props.fontSize, effectiveFontSize, fontScaleFactor]);
```

### 3. Increased ResizeObserver Threshold
**Changes**:
- Increased threshold from 5px to 10px
- Prevents recalculation on minor size changes (like selection borders)
- Only triggers for actual meaningful resizes

**Code**:
```typescript
const updateRenderedWidth = () => {
  const rect = containerRef.current.getBoundingClientRect();
  const newWidth = rect.width;
  
  // Only update if difference is significant (>10px)
  if (newWidth > 0 && Math.abs(newWidth - componentRenderedWidthRef.current) > 10) {
    componentRenderedWidthRef.current = newWidth;
    setComponentRenderedWidth(newWidth);
  }
};
```

### 4. Conditional Scaling for Letter Spacing and Padding
**Changes**:
- Keep scaling for normal slide view
- Disable scaling for thumbnails
- Ensures proper proportions in both contexts

**Code**:
```typescript
const getLetterSpacing = useMemo(() => {
  if (isThumbnail) {
    return letterSpacing ? `${letterSpacing}px` : '0px';
  }
  return letterSpacing ? `${letterSpacing * fontScaleFactor}px` : '0px';
}, [letterSpacing, isThumbnail, fontScaleFactor]);

const getTextPadding = useMemo(() => {
  const basePadding = textPadding || 16;
  if (isThumbnail) {
    return `${basePadding}px`;
  }
  const scaledPadding = basePadding * fontScaleFactor;
  return `${scaledPadding}px`;
}, [textPadding, isThumbnail, fontScaleFactor]);
```

## Why This Works

### Accurate Initial Sizing
By calculating the expected rendered width based on the slide container dimensions BEFORE the first render, we ensure that:
1. The font size is correct from the very first render
2. No visible adjustment occurs after mounting
3. The initial state matches the final state

### ComponentRenderer Uses Percentage-Based Sizing
The `ComponentRenderer` component uses percentage-based sizing:
```typescript
width: `${(width / slideWidth * 100)}%`
height: `${(height / slideHeight * 100)}%`
```

This means:
1. A 300px wide component specified in the data becomes ~15.6% of a 1920px slide
2. When the slide container is scaled down (e.g., to 800px width), the component becomes ~125px
3. Font sizes need to scale proportionally: if the component is now 125px instead of 300px, fonts should scale by 125/300 = 0.417x
4. Our `fontScaleFactor = componentRenderedWidth / specifiedWidth` captures this exact ratio

### Thumbnails Use CSS Transform
The `MiniSlide` component scales thumbnails using CSS transform:
```typescript
transform: `scale(${scale})`
```

This means:
1. The entire slide (including all text) is scaled uniformly by CSS
2. Text renders at native size (fontScaleFactor = 1) and is scaled by the transform
3. No dynamic font measurement or adjustment is needed for thumbnails
4. Fonts appear correctly proportioned without JavaScript intervention

### Smart Caching Prevents Flickering
The 0.5px tolerance threshold means:
1. Tiny size changes (like selection borders adding 1-2px) don't trigger recalculation
2. Real size changes (from actual resizing) still work correctly
3. The font size remains stable during normal interactions
4. No visible "jumping" or flickering occurs when selecting shapes

## Results

### ✅ Fixed Issues
1. **No more text flashing**: Text renders at the correct size immediately
2. **No adjustment on first click**: Font size is stable from initial render
3. **Thumbnails show text properly**: Text renders correctly in miniature views
4. **Stable selection behavior**: Clicking/selecting shapes doesn't trigger size changes
5. **Better performance**: Fewer measurements and recalculations

### 🎯 Maintained Functionality
1. Text editing still works correctly
2. Component resizing properly updates layout (ResizeObserver still active)
3. All text formatting properties (bold, italic, alignment, etc.) work as before
4. TipTap editor integration unchanged

## Testing Checklist

- [x] Click on a shape with text - no flickering
- [x] First click on a shape - text size is correct immediately  
- [x] Thumbnails display shape text correctly
- [x] Text editing mode works properly
- [x] Resize a shape - text adapts (if needed for very large size changes)
- [x] Multiple selections work without text jumping
- [x] Presentation mode thumbnails show text
- [x] Font size changes via settings panel work correctly

## Technical Details

### Key Files Modified
- `apps/frontend/src/renderers/components/ShapeWithTextRenderer.tsx`

### Related Components (Unchanged)
- `apps/frontend/src/renderers/ComponentRenderer.tsx` - Provides percentage-based scaling
- `apps/frontend/src/components/deck/MiniSlide.tsx` - Handles thumbnail rendering
- `apps/frontend/src/registry/components/shape.ts` - Shape component definition

### No Breaking Changes
All changes are internal to the ShapeWithTextRenderer component. The external API (props interface) remains unchanged, ensuring compatibility with existing code and data.

## Performance Impact
**Positive**: Reduced unnecessary measurements and recalculations should improve rendering performance, especially when selecting/interacting with shapes frequently.

---

**Date**: October 10, 2025  
**Status**: ✅ Complete and Tested

