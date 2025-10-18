# Font Sizing and Text Overwriting Fixes Summary

## Issues Fixed

### 1. Text Content Overwriting During Navigation
**Problem:** When navigating between slides in edit mode, text from the previous slide was overwriting the current slide's text.

**Solution:**
- Added `isUnmountingRef` to track component unmount state
- Added slide ID validation in onUpdate and onBlur handlers
- Added cleanup effect to blur editor on unmount without saving
- Improved timing in SlideViewport to allow pending saves to complete

### 2. Font Size Jump on Initial Load
**Problem:** Text was loading at one size then jumping to another size, causing a visible resize effect.

**Solution:**
- Improved initial container width detection using `getBoundingClientRect()`
- Added ResizeObserver for accurate dimension tracking
- Set better initial state values to match actual rendered dimensions
- Made slide dimensions consistent (950px)

### 3. Text Appearing Too Large
**Problem:** After the initial fix, text was appearing too large because of incorrect scaling assumptions.

**Root Cause:**
- Backend generates font sizes for 1920x1080 slides (e.g., 180pt for titles, 36pt for body)
- Frontend was treating these as if designed for 950px width
- This caused fonts to be scaled up instead of down

**Solution:**
- Reverted to using 1920px as the reference width for scaling
- Scale factor correctly converts from backend's design (1920px) to display (950px)
- Result: ~0.494 scale factor properly reduces the large point sizes

### 4. Font Size Changes Between Edit/Non-Edit Modes
**Problem:** Text was changing size when switching between edit and non-edit modes due to the 92% scale applied to the slide container in edit mode.

**Solution:**
- Added edit mode detection by checking for the 0.92 transform in parent elements
- In edit mode: Use DOM dimensions (offsetWidth) which ignore transforms
- In non-edit mode: Use visual dimensions (getBoundingClientRect)
- This ensures fonts are sized consistently regardless of container transforms

## Technical Details

### Coordinate Systems
1. **Logical System**: 1920x1080 - Used by backend for all measurements
2. **Display Size**: 950px wide - Actual browser rendering size

### Font Scaling Formula
```typescript
scaleFactor = actualDisplayWidth / 1920
finalFontSize = backendFontSize * scaleFactor
```

### Files Modified
- `/apps/frontend/src/renderers/components/TiptapTextBlockRenderer.tsx`
- `/apps/frontend/src/renderers/components/ShapeWithTextRenderer.tsx`
- `/apps/frontend/src/renderers/components/CustomComponentRenderer.tsx`
- `/apps/frontend/src/components/deck/SlideViewport.tsx`
- `/apps/frontend/src/components/deck/viewport/SlideDisplay.tsx`
- `/apps/frontend/src/utils/fontScalingUtils.ts`

## Results
✅ No more text overwriting when navigating slides
✅ Text loads at correct size immediately
✅ No visible size jumps or resizing
✅ Consistent behavior in edit and presentation modes
✅ Backend and frontend coordinate systems properly aligned
