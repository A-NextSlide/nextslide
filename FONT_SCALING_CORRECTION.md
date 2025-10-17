# Font Scaling Correction

## Summary
Fixed the font scaling issue where text was appearing too large after the initial fix. The root cause was a misunderstanding of how font sizes are designed in the system.

## Key Discovery
The backend generates font sizes in points (pt) designed for a **1920x1080 slide**, not for the 950px rendered width:

### Backend Font Size Guidelines:
- Title slides: 180-360pt
- Regular titles: 120-180pt  
- Subtitles: 72-90pt
- Body text: 36-48pt
- Minimum: 24pt

These large font sizes are intended for the logical coordinate system (1920x1080), not the actual display size (950px).

## The Fix
Reverted the scaling calculation to use the correct reference width:

### Changed From (Incorrect):
```typescript
const DESIGN_WIDTH = 950; // Wrong assumption
const scaleFactor = slideWidth / DESIGN_WIDTH;
```

### Changed To (Correct):
```typescript
const NATIVE_WIDTH = 1920; // Backend's design width
const scaleFactor = slideWidth / NATIVE_WIDTH;
```

## Updated Files:
1. **TiptapTextBlockRenderer.tsx** - Use NATIVE_WIDTH = 1920
2. **ShapeWithTextRenderer.tsx** - Use DEFAULT_SLIDE_WIDTH (1920)
3. **CustomComponentRenderer.tsx** - Use DEFAULT_SLIDE_WIDTH
4. **fontScalingUtils.ts** - Use DEFAULT_SLIDE_WIDTH

## Result
- Text now scales correctly from backend's 1920px design to 950px display
- Scale factor is ~0.494 (950/1920) which properly reduces the large pt sizes
- No more text appearing too large or too small
- Smooth transitions without size jumps

## Technical Understanding
The system uses two coordinate systems:
1. **Logical coordinates**: 1920x1080 - Used by backend for positioning and font sizes
2. **Display size**: 950px wide - Actual rendered size in the browser

Font scaling must convert from logical to display coordinates, not assume fonts are designed for display size.
