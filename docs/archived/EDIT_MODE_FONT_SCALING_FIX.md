# Edit Mode Font Scaling Fix

## Problem
Text was changing size when switching between edit and non-edit modes:
- In non-edit mode: text appeared at one size
- In edit mode: text would shrink when the mode was activated
- This created a jarring visual experience

## Root Cause
In edit mode, the slide container is scaled to 92% (0.92) for UI layout purposes:
```javascript
animate={{
  scale: isEditing ? 0.92 : 1,
  x: isEditing ? -140 : 0
}}
```

However, font scaling calculations were using `getBoundingClientRect()` which returns the visual size (affected by the transform), not the actual DOM size. This caused:
1. Non-edit mode: font scale based on 950px width
2. Edit mode: font scale based on 950px × 0.92 = 874px width
3. Result: fonts appeared ~8% larger in edit mode relative to the container

## Solution
Modified all text components to detect when they're in edit mode and use the appropriate measurement:
- **Edit mode**: Use DOM dimensions (offsetWidth/clientWidth) which ignore transforms
- **Non-edit mode**: Use visual dimensions (getBoundingClientRect) for accurate sizing

### Detection Method
```typescript
// Check if we're in edit mode by looking for the 0.92 transform
let parent = container.parentElement;
let isInEditMode = false;
while (parent && maxLevels > 0) {
  const transform = window.getComputedStyle(parent).transform;
  if (transform && transform !== 'none' && transform.includes('0.92')) {
    isInEditMode = true;
    break;
  }
  parent = parent.parentElement;
  maxLevels--;
}
```

### Updated Files
1. **TiptapTextBlockRenderer.tsx** - Added edit mode detection in initial state and resize handler
2. **ShapeWithTextRenderer.tsx** - Same edit mode detection logic
3. **CustomComponentRenderer.tsx** - Updated scale factor calculation
4. **fontScalingUtils.ts** - Added edit mode awareness to utility function

## Result
- Text maintains consistent size when switching between modes
- No visual jump or resize when entering/exiting edit mode
- Font scaling properly accounts for the 92% container scale in edit mode
- Consistent behavior across all text rendering components
