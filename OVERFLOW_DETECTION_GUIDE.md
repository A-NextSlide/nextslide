# Overflow Detection & Standard Font Sizing Guide

## Overview

This guide explains how to detect text overflow in Tiptap boxes and other text components, and how the system now uses standardized font sizes instead of decimal values.

## Key Features

### 1. ✅ **Tiptap Overflow Detection**

Yes! The codebase already has overflow detection using `scrollHeight` and `scrollWidth`:

```typescript
// Check if Tiptap content is overflowing
const contentElement = element.querySelector('.ProseMirror') || element;
const isOverflowing = contentElement.scrollHeight > element.clientHeight || 
                      contentElement.scrollWidth > element.clientWidth;
```

**Existing implementations:**
- `apps/frontend/src/utils/componentFittingUtils.ts` - Basic overflow detection
- `apps/frontend/src/components/TextBoundingBoxOverlay.tsx` - Overflow calculation for text components
- `apps/frontend/src/utils/fontOverflowDetection.ts` - **NEW** Enhanced overflow detection

### 2. ✅ **Standard Font Sizes**

Font sizes now snap to standard typographic values instead of using decimals like 21.4:

**Standard Sizes:**
```
8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 
40, 44, 48, 54, 60, 66, 72, 80, 88, 96
```

**Example:**
- Before: `21.4px`, `18.7px`, `47.3px`
- After: `20px`, `18px`, `48px`

This ensures **bullet points group at the same size** - all subpoints will use the same standardized size.

---

## What Was Added

### Backend (Python)

#### 1. **Font Size Standardizer Service**
`apps/backend/services/font_size_standardizer.py`

```python
from services.font_size_standardizer import standardize_font_size

# Basic usage
size = standardize_font_size(21.4)  # Returns: 20 or 22
size_down = standardize_font_size(21.4, prefer_round_down=True)  # Returns: 20

# With constraints
from services.font_size_standardizer import standardize_with_min_max
size = standardize_with_min_max(21.4, min_size=12, max_size=48)
```

**Features:**
- `standardize()` - Round to nearest standard size
- `standardize_with_constraints()` - Respect min/max bounds
- `get_next_smaller()` / `get_next_larger()` - Navigate size scale
- `equalize_group_sizes()` - Make bullet points the same size

#### 2. **Updated Font Calculation Services**

Both services now use standardized sizes:

- `apps/backend/services/smart_font_calculator.py`
- `apps/backend/services/font_metrics_service.py`

```python
# Now automatically standardizes all font size results
result = smart_calculator.calculate_optimal_size(...)
# result.font_size will be a standard value like 24, not 21.4
```

### Frontend (TypeScript/React)

#### 1. **Font Overflow Detection Utilities**
`apps/frontend/src/utils/fontOverflowDetection.ts`

```typescript
import {
  standardizeFontSize,
  isOverflowing,
  detectAndFixOverflow,
  monitorAndFixOverflow,
  equalizeFontSizes,
} from '@/utils/fontOverflowDetection';

// Standardize a size
const size = standardizeFontSize(21.4);  // Returns: 20 or 22

// Check for overflow
const overflow = isOverflowing(element);
console.log(overflow.vertical, overflow.horizontal);

// Detect and get suggested size to fix overflow
const result = detectAndFixOverflow(element, component, {
  minFontSize: 8,
  maxFontSize: 72,
});
if (result?.suggestedSize) {
  // Update component with new size
  updateComponent({ props: { fontSize: result.suggestedSize } });
}

// Monitor continuously (returns cleanup function)
const cleanup = monitorAndFixOverflow(
  element,
  component,
  (newFontSize) => {
    updateComponent({ props: { fontSize: newFontSize } });
  },
  { debounceMs: 500 }
);
```

#### 2. **React Hook for Overflow Detection**
`apps/frontend/src/hooks/useOverflowDetection.ts`

```typescript
import { useOverflowDetection } from '@/hooks/useOverflowDetection';

function MyTextComponent({ component, onUpdate }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const {
    isOverflowing,
    overflowDetails,
    suggestedFontSize,
    checkOverflow,
    adjustFontSize,
  } = useOverflowDetection(containerRef, component, {
    autoAdjust: true,
    enableMonitoring: true,
    minFontSize: 12,
    maxFontSize: 48,
    onOverflowDetected: (details) => {
      if (details.suggestedSize) {
        console.log('Adjusting font size from', details.originalSize, 'to', details.suggestedSize);
        onUpdate({ props: { fontSize: details.suggestedSize } });
      }
    },
  });
  
  return (
    <div ref={containerRef}>
      {isOverflowing && (
        <div>Text is overflowing! Suggested size: {suggestedFontSize}px</div>
      )}
      {/* ... your content ... */}
    </div>
  );
}
```

#### 3. **Updated Component Fitting Utils**
`apps/frontend/src/utils/componentFittingUtils.ts`

Now uses standard sizes in binary search:

```typescript
// This now returns standard sizes like 24, not 21.4
const optimalSize = calculateOptimalFontSize(element, 8, 72, currentSize);
```

---

## How to Use with Tiptap

### Example 1: Basic Overflow Detection

```typescript
import { isOverflowing } from '@/utils/fontOverflowDetection';

// In your Tiptap component
const tiptapWrapperRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (tiptapWrapperRef.current) {
    const overflow = isOverflowing(tiptapWrapperRef.current);
    
    if (overflow.isOverflowing) {
      console.log('Tiptap content is overflowing!');
      console.log('Scroll height:', overflow.scrollHeight);
      console.log('Client height:', overflow.clientHeight);
    }
  }
}, []);

return (
  <div ref={tiptapWrapperRef} className="tiptap-editor-wrapper">
    <EditorContent editor={editor} />
  </div>
);
```

### Example 2: Auto-Adjust on Overflow

```typescript
import { useOverflowDetection } from '@/hooks/useOverflowDetection';

function TiptapTextBlock({ component, updateComponent }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useOverflowDetection(containerRef, component, {
    autoAdjust: true,
    enableMonitoring: true,  // Continuously monitor for changes
    onOverflowDetected: ({ suggestedSize }) => {
      if (suggestedSize) {
        // Automatically update component when overflow detected
        updateComponent(component.id, {
          props: { fontSize: suggestedSize }
        });
      }
    },
  });
  
  return (
    <div ref={containerRef}>
      <EditorContent editor={editor} />
    </div>
  );
}
```

### Example 3: Manual Control

```typescript
import { detectAndFixOverflow } from '@/utils/fontOverflowDetection';

function TiptapWithManualCheck({ component }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleCheckOverflow = () => {
    if (!containerRef.current) return;
    
    const result = detectAndFixOverflow(containerRef.current, component);
    
    if (result?.hasOverflow) {
      console.log('⚠️ Overflow detected!');
      console.log('Current size:', result.originalSize);
      console.log('Suggested size:', result.suggestedSize);
      
      if (result.suggestedSize) {
        // Update manually
        updateComponent({ props: { fontSize: result.suggestedSize } });
      }
    } else {
      console.log('✅ No overflow');
    }
  };
  
  return (
    <div>
      <button onClick={handleCheckOverflow}>Check Overflow</button>
      <div ref={containerRef}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
```

---

## Integration with Font Sizing

### Backend Flow

1. **AI generates slide content** with calculated font sizes
2. **Font calculator** (`smart_font_calculator.py`) calculates optimal size
3. **Standardizer** rounds to nearest standard size (e.g., 21.4 → 20 or 22)
4. **Result** includes standardized `fontSize`, `fontSizeMin`, `fontSizeMax`

```python
# In component_validator.py or similar
from services.smart_font_calculator import SmartFontCalculator

calculator = SmartFontCalculator()
result = calculator.calculate_optimal_size(
    text=text_content,
    container=container,
    font_family=font_family,
    constraints=constraints,
    context=context
)

# result.font_size is now a standard value like 24, not 21.4
component['props']['fontSize'] = result.font_size
```

### Frontend Flow

1. **Component renders** with backend-provided font size
2. **Overflow detection** checks if content fits
3. **If overflow detected**:
   - Calculate optimal size using binary search
   - Standardize the result (already done in utils)
   - Update component props

### Grouping Bullet Points

To ensure all bullet points at the same level use the same size:

```typescript
import { equalizeFontSizes } from '@/utils/fontOverflowDetection';

// Collect all font sizes from bullet points at the same level
const bulletSizes = bulletComponents.map(c => c.props.fontSize);

// Get the standardized median size
const equalizedSize = equalizeFontSizes(bulletSizes);

// Apply to all bullets
bulletComponents.forEach(bullet => {
  updateComponent(bullet.id, { props: { fontSize: equalizedSize } });
});
```

---

## Configuration

### Adjusting Standard Sizes

If you need different standard sizes, edit:

**Backend:** `apps/backend/services/font_size_standardizer.py`
```python
STANDARD_SIZES = [
    8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 
    40, 44, 48, 54, 60, 66, 72, 80, 88, 96
]
```

**Frontend:** `apps/frontend/src/utils/fontOverflowDetection.ts`
```typescript
export const STANDARD_FONT_SIZES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36,
  40, 44, 48, 54, 60, 66, 72, 80, 88, 96
];
```

### Overflow Tolerance

Adjust tolerance for overflow detection in `fontOverflowDetection.ts`:

```typescript
// Current default: 5px base + 10% of padding
const verticalTolerance = 5 + Math.min(paddingTop + paddingBottom, 10) * 0.1;

// To be more strict (detect smaller overflows):
const verticalTolerance = 2;

// To be more lenient (allow some overflow):
const verticalTolerance = 10;
```

---

## Testing

### Manual Testing

1. **Create a slide** with Tiptap text blocks
2. **Add lots of content** to trigger overflow
3. **Check console** for overflow detection logs
4. **Verify font sizes** are standard values (24, not 21.4)
5. **Check bullet points** at the same level have the same size

### Automated Testing

```typescript
describe('Font Overflow Detection', () => {
  it('should standardize font sizes', () => {
    expect(standardizeFontSize(21.4)).toBe(20);  // or 22
    expect(standardizeFontSize(18.7)).toBe(18);  // or 20
    expect(standardizeFontSize(47.3)).toBe(48);
  });
  
  it('should detect overflow', () => {
    const element = createOverflowingElement();
    const overflow = isOverflowing(element);
    expect(overflow.isOverflowing).toBe(true);
    expect(overflow.vertical).toBe(true);
  });
  
  it('should suggest smaller size for overflow', () => {
    const element = createOverflowingElement();
    const component = { id: '1', props: { fontSize: 24 } };
    const result = detectAndFixOverflow(element, component);
    expect(result?.suggestedSize).toBeLessThan(24);
  });
});
```

---

## Troubleshooting

### Overflow not detected

**Problem:** Text is clearly overflowing but `isOverflowing()` returns false.

**Solutions:**
1. Check if padding is included in measurements
2. Verify the correct element is being measured (for Tiptap, check `.ProseMirror`)
3. Adjust tolerance values
4. Ensure CSS `overflow: hidden` is not preventing scroll height

### Font size keeps changing

**Problem:** Font size oscillates between values.

**Solutions:**
1. Increase `debounceMs` in monitoring
2. Check if multiple components are trying to update the same text
3. Verify the standardization is consistent (both backend and frontend)

### Bullet points different sizes

**Problem:** Bullet points at the same level have different sizes.

**Solutions:**
1. Use `equalizeFontSizes()` to normalize them
2. Check if backend is calculating them separately
3. Ensure standardization is applied consistently

---

## Best Practices

1. ✅ **Use standard sizes everywhere** - Both backend and frontend should use standardized values
2. ✅ **Monitor continuously** - Use `enableMonitoring: true` for dynamic content
3. ✅ **Debounce checks** - Use 300-500ms debounce to avoid performance issues
4. ✅ **Group similar elements** - Use `equalizeFontSizes()` for consistent sizing
5. ✅ **Prefer round down for overflow** - Use `prefer_round_down: true` when fixing overflow
6. ✅ **Log results** - Console log overflow detection for debugging
7. ✅ **Test with real content** - Test with actual presentation content, not Lorem Ipsum

---

## API Reference

### Backend

#### `standardize_font_size(size, prefer_round_down=False) -> int`
Standardizes a font size to nearest standard value.

#### `FontSizeStandardizer.standardize_with_constraints(size, min_size, max_size) -> int`
Standardizes with min/max bounds.

### Frontend

#### `standardizeFontSize(size, preferRoundDown) -> number`
TypeScript equivalent of backend standardizer.

#### `isOverflowing(element) -> OverflowDetails`
Check if element content is overflowing.

#### `detectAndFixOverflow(element, component, options) -> Result`
Detect overflow and calculate optimal size.

#### `useOverflowDetection(ref, component, options) -> UseOverflowDetectionReturn`
React hook for overflow detection and auto-adjustment.

---

## Migration Guide

### Updating Existing Components

1. **Backend Components:**
   - No changes needed - automatically uses standardization

2. **Frontend Components:**
   ```typescript
   // Before
   const fontSize = Math.round(calculatedSize * scaleFactor);
   
   // After
   import { standardizeFontSize } from '@/utils/fontOverflowDetection';
   const fontSize = standardizeFontSize(calculatedSize * scaleFactor);
   ```

3. **Add Overflow Detection:**
   ```typescript
   // Add to existing component
   import { useOverflowDetection } from '@/hooks/useOverflowDetection';
   
   const { isOverflowing } = useOverflowDetection(containerRef, component, {
     enableMonitoring: true
   });
   ```

---

## Performance Considerations

- **ResizeObserver** and **MutationObserver** can be expensive
- Use **debouncing** (300-500ms recommended)
- **Disable monitoring** when not editing
- For thumbnails, disable overflow detection
- Cache overflow calculations when possible

---

## Summary

✅ **Overflow Detection:** Built-in via `scrollHeight`/`scrollWidth` comparison  
✅ **Standard Sizes:** All fonts snap to standard values (8, 10, 12, 14, 16, 18, 20, 22, 24, etc.)  
✅ **Auto-Adjustment:** Can automatically reduce font size to fit content  
✅ **Bullet Point Grouping:** Same-level bullets use the same standard size  
✅ **Tiptap Support:** Full support for detecting overflow in Tiptap editors  
✅ **React Hooks:** Easy-to-use hooks for React components  
✅ **Backend Integration:** Automatic standardization in all font calculations  

**Result:** No more 21.4px font sizes - everything uses clean standard values like 24px, and bullet points at the same level will group together with the same size! 🎉

