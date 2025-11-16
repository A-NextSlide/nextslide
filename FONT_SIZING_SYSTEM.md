# Intelligent Font Sizing System

## Overview

This document describes the reimplemented font sizing system that automatically resizes text content to fit within component boundaries. The system works at both backend (generation) and frontend (rendering) levels.

---

## Architecture

### Three-Layer System

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Backend Content-Aware Initial Sizing              │
│ - SimpleFontFitter measures text based on content          │
│ - Calculates optimal font size for container dimensions    │
│ - Uses font metrics database (60+ fonts) + auto-detection  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Frontend Dynamic Fit-to-Box                       │
│ - TiptapTextBlockRenderer measures rendered text           │
│ - Detects overflow and scales down if needed               │
│ - Re-measures on resize/content changes                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Responsive Viewport Scaling                       │
│ - Scales from 1920px design to actual display width        │
│ - Applies fit-to-box scaling on top of viewport scaling    │
│ - Handles presentation mode (no scaling) vs edit mode      │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Implementation

### Files Modified
- `apps/backend/services/simple_font_fitter.py`
- `apps/backend/agents/generation/components/component_validator.py`
- `apps/backend/agents/generation/layout_architect.py`

### How It Works

#### 1. **SimpleFontFitter** (`simple_font_fitter.py`)

**Purpose**: Measures text and calculates optimal font size

**Key Method**: `fit_text_to_container()`

```python
def fit_text_to_container(
    text: str,
    container_width: float,
    container_height: float,
    font_family: str = 'Inter',
    padding_x: float = 10,
    padding_y: float = 5,
    line_height: float = 1.5,
    letter_spacing: float = 0.0,
    initial_font_size: int = 96,
    char_width_ratio: Optional[float] = None
) -> Dict[str, Any]
```

**Algorithm**:
1. Start with `initial_font_size` (96px)
2. Iterate through `STANDARD_FONT_SIZES` from largest to smallest: `[8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96]`
3. For each size:
   - Measure text dimensions using character width ratio
   - Check if text fits container (width AND height)
   - Calculate utilization (aim for 80%+ to fill container well)
4. Return first size that fits with good utilization

**Font Metrics**:
- **Database**: 60+ fonts with empirical character width ratios
- **Auto-detection**: Falls back to intelligent detection based on font name keywords:
  - Monospace: 0.60
  - Condensed: 0.47
  - Wide: 0.62
  - Serif: 0.51
  - Script: 0.49
  - Display: 0.53
  - Default (sans-serif): 0.55

#### 2. **ComponentValidator** (`component_validator.py`)

**Purpose**: Applies intelligent font sizing to all text components

**Key Method**: `apply_slide_font_sizing()`

```python
def apply_slide_font_sizing(
    self,
    components: List[Dict[str, Any]],
    theme: Dict[str, Any]
) -> List[Dict[str, Any]]
```

**Process**:
1. **Detect text components**:
   - Components with `text` or `texts` props
   - Components with `fontSize`, `fontFamily`, or `textColor` props
   - Components with text-related types: `text`, `title`, `heading`, `tiptap`, `label`, `caption`

2. **Apply sizing**:
   - Extract text content from component
   - Get container dimensions (width, height)
   - Get padding from props
   - Look up font family's character width ratio from theme (if available)
   - If not in theme, measure automatically using `SimpleFontFitter`
   - Call `fit_text_to_container()` to calculate optimal size
   - Update component's `fontSize` prop

3. **Normalize**:
   - Group components by x-position
   - Use median font size for visual consistency

**When It Runs**:
- **Automatically** after layout generation in `slide_generator.py`
- Called on line 37: `components = self.apply_slide_font_sizing(components, theme)`

---

## Frontend Implementation

### Files Modified
- `apps/frontend/src/renderers/components/TiptapTextBlockRenderer.tsx`

### How It Works

#### **TiptapTextBlockRenderer** - Fit-to-Box Scaling

**New Features**:
1. **Content wrapper ref** (`contentWrapperRef`) to measure rendered text
2. **Fit scale state** (`fitScale`) to store calculated scale
3. **Fit ready state** (`isFitReady`) to prevent flash before measurement

**Key Function**: `computeFit()`

```typescript
const computeFit = React.useCallback(() => {
  const containerEl = containerRef?.current;
  const contentEl = contentWrapperRef.current;
  if (!containerEl || !contentEl || isCurrentlyTextEditing) {
    setFitScale(1);
    setIsFitReady(true);
    return;
  }

  // Container size (outer bounds)
  const containerW = Math.max(0, containerEl.clientWidth || 0);
  const containerH = Math.max(0, containerEl.clientHeight || 0);

  // Content natural size (what it wants to be)
  const naturalW = Math.max(0, contentEl.scrollWidth || contentEl.offsetWidth || 0);
  const naturalH = Math.max(0, contentEl.scrollHeight || contentEl.offsetHeight || 0);

  if (naturalW === 0 || naturalH === 0 || containerW === 0 || containerH === 0) {
    setFitScale(1);
    setIsFitReady(true);
    return;
  }

  // Calculate scale needed to fit content in container
  // IMPORTANT: Only scale DOWN (never up) to prevent content loss
  const scale = Math.min(containerW / naturalW, containerH / naturalH, 1);

  setFitScale(scale);
  setIsFitReady(true);
}, [containerRef, isCurrentlyTextEditing]);
```

**When It Runs**:
1. **On mount** - Initial measurement
2. **On resize** - Container or content size changes (via ResizeObserver)
3. **On content change** - When `texts` prop updates
4. **On window resize** - Viewport size changes

**Applied Scaling**:
```typescript
const contentWrapperStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  transform: fitScale !== 1 ? `scale(${fitScale})` : undefined,
  transformOrigin: 'top left',
  visibility: isFitReady ? 'visible' : 'hidden',
};
```

---

## How The System Works End-to-End

### 1. **Slide Generation** (Backend)

```
User creates slide with content
         ↓
Layout Architect generates components with initial sizes
         ↓
Component Validator applies intelligent font sizing
         ↓
SimpleFontFitter measures text and calculates optimal size
         ↓
Component updated with fitted fontSize
         ↓
Slide saved to database with optimized font sizes
```

### 2. **Slide Rendering** (Frontend)

```
Frontend loads slide from database
         ↓
TiptapTextBlockRenderer receives component with fontSize
         ↓
Apply viewport scaling (1920px → actual width)
         ↓
Render text with scaled fontSize
         ↓
Measure rendered text dimensions
         ↓
If overflow detected: apply fit-to-box scale down
         ↓
Text fits perfectly in container
```

---

## Key Improvements Over Old System

### ❌ **Old System Problems**

1. **Hardcoded sizes**: Layout architect used fixed sizes (72px, 36px, 32px)
2. **No content awareness**: Same size for "Hi" and "This is a very long title that should be smaller"
3. **Database dependency**: Required `charWidthRatio` in theme (often missing)
4. **No frontend measurement**: Text could overflow after scaling
5. **Inconsistent**: Different components had different sizing logic

### ✅ **New System Benefits**

1. **Content-aware**: Font size calculated based on actual text length
2. **Automatic measurement**: Auto-detects font metrics if not in theme
3. **Double-check**: Backend sizes + frontend overflow detection
4. **Consistent**: Same logic for all text components
5. **Responsive**: Re-measures on resize and content changes
6. **Robust**: Works with 60+ fonts + intelligent fallbacks

---

## Testing The System

### Test Cases

#### 1. **Short Text in Large Container**
```
Input: "Hello" in 1600x400 container
Expected: Large font size (near 96px) with good utilization
```

#### 2. **Long Text in Small Container**
```
Input: "This is a very long sentence..." in 400x100 container
Expected: Small font size (12-18px) to fit without overflow
```

#### 3. **Unknown Font**
```
Input: Custom font not in database
Expected: Auto-detect based on name or use 0.55 default ratio
```

#### 4. **Window Resize**
```
Input: Resize browser window
Expected: Text re-measures and adjusts scale if needed
```

#### 5. **Text Editing**
```
Input: User edits text to add more content
Expected: On blur, system re-measures and resizes
```

---

## Configuration

### Backend Font Metrics Database

Located in `apps/backend/services/simple_font_fitter.py:195-234`

To add a new font:
```python
FONT_METRICS = {
    # ... existing fonts ...
    'Your Font Name': 0.57,  # Measured character width ratio
}
```

To measure a font's ratio:
1. Use `measure_char_width_ratio()` method
2. Or empirically test with sample text
3. Ratio should be between 0.3 (narrow) and 0.8 (wide)

### Standard Font Sizes

Located in `apps/backend/services/simple_font_fitter.py:22-25`

```python
STANDARD_FONT_SIZES = [
    8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36,
    40, 44, 48, 54, 60, 66, 72, 80, 88, 96
]
```

These match common typography scales. Can be customized if needed.

### Frontend Settings

- **Native Width**: `1920px` (backend design width)
- **Default Display Width**: `950px` (editor display width)
- **Fit Scale Range**: `0.01` to `1.0` (never scales up)

---

## Debugging

### Backend Logs

Enable debug logging to see font sizing in action:
```python
import logging
logging.getLogger('component_validator').setLevel(logging.DEBUG)
```

Look for:
- `🔤 FONT SIZING: Processing N components...`
- `📏 Measured ratio X.XXX for FontName`
- `✅ FONT FIT: XXpx | "text preview" | WWWxHHH | utilization: XX%w XX%h`

### Frontend Console

Check browser console for:
- Fit scale calculations
- Container vs content dimensions
- Overflow detection

Add debug logging:
```typescript
console.log('[TiptapTextBlock] Fit:', {
  containerW,
  containerH,
  naturalW,
  naturalH,
  scale: fitScale
});
```

---

## Future Enhancements

### Potential Improvements

1. **Persistent optimization**: Save calculated scale to database
2. **Animation**: Smooth transitions when resizing
3. **Manual override**: Allow user to lock font size
4. **Accessibility**: Ensure minimum readable font sizes
5. **Multi-language**: Adjust ratios for different character sets

---

## Summary

The new intelligent font sizing system:

✅ **Measures** actual text content and container dimensions
✅ **Calculates** optimal font size using character width ratios
✅ **Validates** with frontend overflow detection and scaling
✅ **Responds** to content changes, resizes, and viewport changes
✅ **Works** with 60+ fonts plus automatic detection
✅ **Ensures** text always fits in its container without overflow

**No more database dependencies. No more hardcoded sizes. Just intelligent, content-aware typography.**
