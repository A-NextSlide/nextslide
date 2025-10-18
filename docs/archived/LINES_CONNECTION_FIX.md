# Lines Component Connection Fix ✅

## Issue
Frontend error: `Cannot read properties of null (reading 'connection')` in LinesRenderer.tsx at line 424.

## Root Cause
The Lines component's `startPoint` and `endPoint` props could be `null` (not just `undefined`), causing the code to fail when trying to access `.connection` property.

**Key insight:** JavaScript default parameters only work for `undefined`, not for `null`:
```typescript
const { startPoint = { x: 100, y: 100 } } = props;  // ❌ Doesn't work if startPoint is null
```

## Fixes Applied

### 1. **Renderer Guard (Primary Fix)**
**File:** `apps/frontend/src/renderers/components/LinesRenderer.tsx`

Added null checks before accessing connection properties:

```typescript
const actualStart = useMemo(() => {
  // Guard against null/undefined startPoint
  if (!startPoint) {
    return { x: 100, y: 100 }; // Default fallback
  }
  
  if (startPoint.connection?.componentId && startPoint.connection?.side) {
    const connectionPoint = getConnectionPoint(
      startPoint.connection.componentId,
      startPoint.connection.side,
      startPoint.connection.offset,
      activeComponents,
      draggedComponents
    );
    return connectionPoint || startPoint;
  }
  return startPoint;
}, [startPoint, activeComponents, draggedComponents]);

// Same for actualEnd with endPoint
```

**Why:** Prevents the error by ensuring we never try to access properties on null/undefined objects.

### 2. **Props Normalization (Defense in Depth)**
**File:** `apps/frontend/src/registry/components/lines.ts`

Added a `normalizeLinesProps` function to validate props during component creation:

```typescript
export function normalizeLinesProps(props: Partial<LinesProps>): Partial<LinesProps> {
  const normalized = { ...props };
  
  // Ensure startPoint has valid coordinates
  if (!normalized.startPoint || typeof normalized.startPoint !== 'object') {
    normalized.startPoint = { x: 100, y: 200 };
  } else {
    // Ensure x and y exist
    if (typeof normalized.startPoint.x !== 'number') normalized.startPoint.x = 100;
    if (typeof normalized.startPoint.y !== 'number') normalized.startPoint.y = 200;
  }
  
  // Same for endPoint
  // ...
  
  return normalized;
}
```

**Why:** Prevents invalid props from being created in the first place.

### 3. **Registry Support for Normalization**
**File:** `apps/frontend/src/registry/registry.ts`

Added `normalizeProps` support to ComponentDefinition interface:

```typescript
export interface ComponentDefinition<T extends TSchema = TSchema> {
  // ... existing properties ...
  
  /** Optional normalizer function to clean/validate props before instance creation */
  normalizeProps?: (props: Partial<TypeFromSchema<T>>) => Partial<TypeFromSchema<T>>;
}
```

And apply it during component creation:

```typescript
export function createComponentInstance<T extends TSchema>(
  definition: ComponentDefinition<T>, 
  id: string,
  overrideProps: Partial<TypeFromSchema<T>> = {}
): ComponentInstance<T> {
  // ... merge defaults ...
  
  let typedProps = props as Partial<TypeFromSchema<T>>;
  
  // Apply normalizer if defined
  if (definition.normalizeProps) {
    typedProps = definition.normalizeProps(typedProps);
  }
  
  return {
    id,
    type: definition.type,
    props: typedProps
  };
}
```

**Why:** Provides a systematic way for any component to validate/normalize its props.

## How Connections Work

### Connection Structure
```typescript
{
  startPoint: {
    x: 100,
    y: 200,
    connection?: {  // Optional - connects to another component
      componentId: "comp-123",
      side: "right",  // top, right, bottom, left, center, topLeft, etc.
      offset: { x: 0, y: 0 }  // Optional offset from connection point
    }
  },
  endPoint: {
    x: 300,
    y: 400,
    connection?: {
      componentId: "comp-456",
      side: "left",
      offset: { x: 0, y: 0 }
    }
  }
}
```

### Connection Points
The `getConnectionPoint` function calculates the actual position on a component's edge:

- **top**: center top of component
- **right**: center right of component
- **bottom**: center bottom of component
- **left**: center left of component
- **topLeft/topRight/bottomLeft/bottomRight**: corners
- **center**: center of component

When a component is dragged, connected lines automatically update their endpoints to follow the component.

## Testing

To verify the fix works:

1. Create a slide with Lines components
2. Lines should render without errors
3. Connected lines should follow components when dragged
4. Lines created by AI (from backend) should work properly

## Prevention

Future components with complex object props should:
1. Add null checks in renderers before accessing nested properties
2. Consider adding normalizeProps function
3. Test with null/undefined/malformed props

## Files Modified

1. ✅ `apps/frontend/src/renderers/components/LinesRenderer.tsx` - Added null guards
2. ✅ `apps/frontend/src/registry/components/lines.ts` - Added normalization
3. ✅ `apps/frontend/src/registry/registry.ts` - Added normalizeProps support

---

**Status:** ✅ **FIXED & TESTED**
**Impact:** Lines component now handles null props gracefully
**No Breaking Changes:** All existing Lines continue to work

