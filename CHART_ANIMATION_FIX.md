# Chart Animation Fix for Presentation Mode

## Issue
Chart animations were not working in presentation full screen mode, while they worked correctly during normal slide navigation.

## Root Cause
When slides are rendered in presentation mode, they are wrapped in isolated `NavigationProvider` instances (in the `renderSlide` function) with empty `onSlideChange` callbacks. This prevented the `slidechange` event from being dispatched when navigating in presentation mode.

Chart animations depend on the `slidechange` event (listened to in `useChartAnimation.ts`) to trigger their animations when slides change.

## Solution

### 1. PresentationMode.tsx
Added a `useEffect` hook that dispatches the `slidechange` event whenever the `currentSlideIndex` changes in presentation mode:

```typescript
// Dispatch slidechange event when slide changes in presentation mode
// This ensures chart animations are triggered properly
useEffect(() => {
  if (!isPresenting) return;
  
  const currentSlide = slides[currentSlideIndex];
  if (!currentSlide?.id) return;
  
  // Use requestAnimationFrame to ensure the slide is rendered before dispatching the event
  let raf1: number | null = null;
  let raf2: number | null = null;
  
  raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => {
      // Dispatch the slidechange event
      const event = new CustomEvent('slidechange', {
        detail: { slideId: currentSlide.id, index: currentSlideIndex }
      });
      document.dispatchEvent(event);
      
      // Also update the global window state for chart animations
      if (typeof window !== 'undefined') {
        (window as any).__lastSlideChangeDispatch = { 
          slideId: currentSlide.id, 
          ts: Date.now() 
        };
      }
    });
  });
  
  return () => {
    if (raf1 !== null) cancelAnimationFrame(raf1);
    if (raf2 !== null) cancelAnimationFrame(raf2);
  };
}, [currentSlideIndex, slides, isPresenting]);
```

### 2. SharedDeckView.tsx
Updated to properly track the current slide index:

- Added `currentSlideIndex` state
- Wrapped `PresentationMode` in a `NavigationProvider` with proper `onSlideChange` callback
- Changed the `currentSlideIndex` prop from hardcoded `0` to the state value

```typescript
const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

// In render:
<NavigationProvider 
  initialSlideIndex={0}
  onSlideChange={(index) => setCurrentSlideIndex(index)}
>
  <PresentationMode
    slides={deck.slides.filter(s => s && s.id && !s.id.startsWith('placeholder-'))}
    currentSlideIndex={currentSlideIndex}
    renderSlide={renderSlide}
    isViewOnly={!canEdit}
  />
</NavigationProvider>
```

## Result
Chart animations now work correctly in presentation full screen mode, matching the behavior of normal slide navigation. When users navigate between slides using:
- Arrow keys (ArrowLeft/ArrowRight)
- Navigation buttons
- Thumbnail grid selection
- Spacebar

Charts will animate properly, just like they do in the regular slide editor view.

## Files Modified
- `apps/frontend/src/components/deck/PresentationMode.tsx`
- `apps/frontend/src/pages/SharedDeckView.tsx`

