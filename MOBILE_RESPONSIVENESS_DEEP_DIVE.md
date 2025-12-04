# NextSlide Mobile Responsiveness & Crash Deep Dive

## Executive Summary

This document provides an exhaustive analysis of mobile responsiveness issues, potential crash sources, and sizing problems across the NextSlide application. The issues span the entire user journey: Landing Page → Conversational Onboarding → Slide Generation → Editor Mode → Presentation Mode.

---

## Table of Contents

1. [Critical Issues (Fix Immediately)](#1-critical-issues-fix-immediately)
2. [Presentation Mode Crashes](#2-presentation-mode-crashes)
3. [Slide Viewport Sizing Issues](#3-slide-viewport-sizing-issues)
4. [Landing Page Mobile Issues](#4-landing-page-mobile-issues)
5. [Conversational Onboarding Mobile Issues](#5-conversational-onboarding-mobile-issues)
6. [Editor Mode Mobile Issues](#6-editor-mode-mobile-issues)
7. [DeckList Page Mobile Issues](#7-decklist-page-mobile-issues)
8. [Touch Target & Interaction Issues](#8-touch-target--interaction-issues)
9. [CSS/Tailwind Responsive Breakpoint Gaps](#9-csstailwind-responsive-breakpoint-gaps)
10. [Implementation Fixes](#10-implementation-fixes)

---

## 1. Critical Issues (Fix Immediately)

### 1.1 Presentation Mode Crashes on Mobile

**Priority: P0 - Crashes are occurring in production**

| Issue | File | Line | Risk | Crash Scenario |
|-------|------|------|------|----------------|
| `e.changedTouches[0]` unchecked | `PresentationMode.tsx` | 272-273 | HIGH | Fast tap/swipe can return undefined |
| `screen.orientation` API not available | `PresentationMode.tsx` | 89-117 | HIGH | iOS Safari < 14.5, some Android |
| No null check on `slideContainerRef.current` | `PresentationMode.tsx` | 161-164 | MEDIUM | Fast slide transitions |

### 1.2 Slides Appear Tiny on Large Screens

**Priority: P0 - Affects user experience on 4K/large monitors**

| Issue | File | Line |
|-------|------|------|
| Hardcoded `slideWidth = 950` with no responsive scaling | `SlideDisplay.tsx` | 266 |
| `maxWidth: 1200px` in SlideContainer is too restrictive | `SlideContainer.tsx` | 745 |
| No minimum viewport width enforcement | `SlideViewport.tsx` | 776-778 |

---

## 2. Presentation Mode Crashes

### File: `apps/frontend/src/components/deck/PresentationMode.tsx`

### 2.1 Touch Event Handler Crash (Lines 269-288)

**Current Code:**
```tsx
const handleTouchEnd = (e: TouchEvent) => {
  if (showThumbnails) return;

  const touchEndX = e.changedTouches[0].clientX;  // ❌ CRASH: [0] can be undefined
  const touchEndY = e.changedTouches[0].clientY;
  // ...
}
```

**Problem:**
- `e.changedTouches[0]` can be `undefined` on certain gesture combinations
- Quick taps with multiple fingers can cause this array to be empty
- iOS Safari handles multi-touch differently than Chrome

**Fix:**
```tsx
const handleTouchEnd = (e: TouchEvent) => {
  if (showThumbnails) return;

  // Guard against empty touches array
  if (!e.changedTouches || e.changedTouches.length === 0) return;

  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  // ...
}
```

### 2.2 Screen Orientation API Crash (Lines 76-120)

**Current Code:**
```tsx
try {
  const screen = window.screen as any;
  if (screen.orientation?.unlock) {
    screen.orientation.unlock();
  }
} catch {}
```

**Problem:**
- `window.screen.orientation` is NOT available on:
  - iOS Safari < 14.5
  - Older Android browsers
  - Firefox on certain devices
  - Samsung Internet older versions
- The catch block is empty, so errors are silently swallowed but may still cause state issues

**Fix:**
```tsx
const tryUnlockOrientation = () => {
  try {
    if (typeof window === 'undefined') return;
    const screenApi = window.screen as any;

    // Check if orientation API exists and is functional
    if (screenApi?.orientation && typeof screenApi.orientation.unlock === 'function') {
      screenApi.orientation.unlock();
    }
  } catch (error) {
    console.warn('[PresentationMode] Orientation unlock not supported:', error);
  }
};

const tryLockOrientation = async (orientation: OrientationLockType) => {
  try {
    if (typeof window === 'undefined') return false;
    const screenApi = window.screen as any;

    if (screenApi?.orientation && typeof screenApi.orientation.lock === 'function') {
      await screenApi.orientation.lock(orientation);
      return true;
    }
    return false;
  } catch (error) {
    // Orientation lock failed - expected on many devices
    console.warn('[PresentationMode] Orientation lock not supported');
    return false;
  }
};
```

### 2.3 Mobile Detection Unreliable (Lines 66-73)

**Current Code:**
```tsx
const checkMobile = () => {
  setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
};
```

**Problems:**
- 768px breakpoint misses iPad Pro (1024px+) which needs mobile-style UI
- `'ontouchstart' in window` returns true for laptops with touchscreens
- No landscape/portrait detection

**Fix:**
```tsx
const checkMobile = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isNarrow = width <= 1024; // Include tablets
  const isLandscapeMobile = isTouch && height < 500; // Phone in landscape

  setIsMobile(isTouch && (isNarrow || isLandscapeMobile));
};
```

### 2.4 Container Null Reference (Lines 158-175)

**Current Code:**
```tsx
const calculateScale = () => {
  if (!slideContainerRef.current || !isPresenting) return;

  const container = slideContainerRef.current;
  const containerWidth = container.clientWidth;  // ❌ Can crash during fast transitions
  const containerHeight = container.clientHeight;
  // ...
}
```

**Problem:** During rapid slide transitions or orientation changes, the ref can be null mid-calculation.

**Fix:**
```tsx
const calculateScale = () => {
  if (!isPresenting) return;

  const container = slideContainerRef.current;
  if (!container) return;

  // Use try-catch for safety
  try {
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    if (!containerWidth || !containerHeight) return;

    // Rest of calculation...
  } catch (error) {
    console.warn('[PresentationMode] Scale calculation failed:', error);
  }
};
```

---

## 3. Slide Viewport Sizing Issues

### 3.1 Slides Appear Tiny on Large Screens

**Files Affected:**
- `apps/frontend/src/components/deck/viewport/SlideDisplay.tsx`
- `apps/frontend/src/components/deck/viewport/SlideContainer.tsx`
- `apps/frontend/src/components/deck/SlideViewport.tsx`

### Problem: Hardcoded Width

**SlideDisplay.tsx (Line 266):**
```tsx
const slideWidth = 950;  // ❌ HARDCODED - never changes!
const slideHeight = slideWidth * (DEFAULT_SLIDE_HEIGHT / DEFAULT_SLIDE_WIDTH);
```

**SlideContainer.tsx (Line 745):**
```tsx
style={{
  maxWidth: '1200px',  // ❌ Limits slide size on 4K monitors
  // ...
}}
```

**Result:**
- On a 4K monitor (3840x2160), the slide is only 950px wide
- This leaves massive empty space on either side
- Slide appears "tiny" in the center of the screen

### Fix: Responsive Slide Sizing

```tsx
// SlideDisplay.tsx - Replace hardcoded width with responsive calculation
const [slideWidth, setSlideWidth] = useState(950);

useEffect(() => {
  const calculateSlideWidth = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Available width (accounting for sidebars, padding)
    const sidebarWidth = isEditing ? 280 : 0; // Properties panel
    const thumbnailWidth = 200; // Left thumbnail panel
    const padding = 48; // 24px on each side

    const availableWidth = viewportWidth - sidebarWidth - thumbnailWidth - padding;

    // Calculate max width based on height constraint (maintain aspect ratio)
    const aspectRatio = DEFAULT_SLIDE_WIDTH / DEFAULT_SLIDE_HEIGHT;
    const availableHeight = viewportHeight - 200; // Header, controls, padding
    const heightConstrainedWidth = availableHeight * aspectRatio;

    // Use the smaller of the two constraints
    const optimalWidth = Math.min(availableWidth, heightConstrainedWidth);

    // Clamp between reasonable min/max
    const minWidth = 600;  // Don't go smaller than this
    const maxWidth = 1400; // Don't go larger than this

    setSlideWidth(Math.max(minWidth, Math.min(maxWidth, optimalWidth)));
  };

  calculateSlideWidth();
  window.addEventListener('resize', calculateSlideWidth);
  return () => window.removeEventListener('resize', calculateSlideWidth);
}, [isEditing]);
```

### 3.2 SlideViewport Not Using Container Dimensions

**SlideViewport.tsx (Lines 176-191):**
```tsx
useEffect(() => {
  const updateDimensions = () => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      setContainerDimensions({ width, height });  // ✅ Updates state
    }
  };
  // ...
}, []);
```

But then `containerDimensions` is NEVER USED! The slide width is hardcoded.

**Fix:** Use `containerDimensions` in slide width calculation (see above).

---

## 4. Landing Page Mobile Issues

### File: `apps/frontend/src/pages/Landing.tsx`

### 4.1 Fixed Positioning Bug on Unmount (Lines 51-66)

**Current Code:**
```tsx
useEffect(() => {
  // On mount - clear fixed positioning
  document.documentElement.style.position = '';
  document.documentElement.style.overflow = '';
  // ...

  return () => {
    // On unmount - SET fixed positioning ❌ WRONG!
    document.documentElement.style.position = 'fixed';
    document.documentElement.style.overflow = 'hidden';
    // ...
  };
}, []);
```

**Problem:** The cleanup function sets fixed positioning, which breaks scrolling on the next page!

**Fix:**
```tsx
useEffect(() => {
  // Store original values
  const originalHtmlPosition = document.documentElement.style.position;
  const originalHtmlOverflow = document.documentElement.style.overflow;
  const originalBodyPosition = document.body.style.position;
  const originalBodyOverflow = document.body.style.overflow;

  // On mount - ensure scrolling works
  document.documentElement.style.position = '';
  document.documentElement.style.overflow = '';
  document.body.style.position = '';
  document.body.style.overflow = '';

  const handleScroll = () => setScrollY(window.scrollY);
  window.addEventListener('scroll', handleScroll);

  return () => {
    window.removeEventListener('scroll', handleScroll);
    // Restore original values (usually empty strings)
    document.documentElement.style.position = originalHtmlPosition;
    document.documentElement.style.overflow = originalHtmlOverflow;
    document.body.style.position = originalBodyPosition;
    document.body.style.overflow = originalBodyOverflow;
  };
}, []);
```

### 4.2 Comparison Table Not Mobile-Friendly (Line 592-594)

**Current Code:**
```tsx
<div className="grid grid-cols-7 min-w-[900px]">
```

**Problem:**
- Forces 900px minimum width on a 375px phone screen
- Creates horizontal scroll that's hard to use
- No responsive grid for mobile

**Fix:**
```tsx
// Mobile: Swipeable card carousel
// Tablet: 2 columns with horizontal scroll for features
// Desktop: Full 7-column grid

<div className="block md:hidden">
  {/* Mobile: Show cards vertically, one tool at a time */}
  <MobileComparisonCards tools={allTools} rows={comparisonRows} />
</div>

<div className="hidden md:block lg:hidden overflow-x-auto">
  {/* Tablet: Horizontal scrollable with sticky first column */}
  <div className="grid grid-cols-4 min-w-[700px]">
    {/* Show NextSlide + 3 competitors at a time */}
  </div>
</div>

<div className="hidden lg:block overflow-x-auto">
  {/* Desktop: Full grid */}
  <div className="grid grid-cols-7 min-w-[900px]">
    {/* Original content */}
  </div>
</div>
```

### 4.3 Mobile Menu Padding Missing (Lines 306-316)

**Current Code:**
```tsx
{isMenuOpen && (
  <div className="md:hidden bg-[#FCFBF8] dark:bg-[#0a0a0a] border-b">
    <div className="px-8 py-6 flex flex-col gap-4">
```

**Problem:** No max-height or overflow handling if menu items exceed screen height.

**Fix:**
```tsx
{isMenuOpen && (
  <div className="md:hidden bg-[#FCFBF8] dark:bg-[#0a0a0a] border-b max-h-[70vh] overflow-y-auto">
    <div className="px-6 py-4 flex flex-col gap-3 safe-area-inset-bottom">
```

### 4.4 Hero Section Button Stack on Mobile (Lines 342-351)

**Current Code:**
```tsx
<div className="flex flex-wrap gap-4 justify-center mb-8">
  <Button size="lg" ... className="px-10 py-6">Create Full Deck Free</Button>
  <Button size="lg" ... className="px-10 py-6">Watch Demo</Button>
</div>
```

**Problem:** `px-10` buttons are too wide on 375px screens, causing awkward wrapping.

**Fix:**
```tsx
<div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-8 w-full sm:w-auto">
  <Button size="lg" ... className="px-6 sm:px-10 py-5 sm:py-6 w-full sm:w-auto">
    Create Full Deck Free
  </Button>
  <Button size="lg" variant="outline" className="px-6 sm:px-10 py-5 sm:py-6 w-full sm:w-auto">
    Watch Demo
  </Button>
</div>
```

### 4.5 Pricing Cards Overflow on Mobile (Lines 859-905)

**Current Code:**
```tsx
<div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
  {/* Pro card has lg:scale-105 which overflows on tablet */}
</div>
```

**Fix:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
  {/* Pro card */}
  <div className="... transform-none sm:lg:scale-105 ...">
```

---

## 5. Conversational Onboarding Mobile Issues

### File: `apps/frontend/src/components/onboarding/ConversationalOnboarding.tsx`

### 5.1 Chat Container No Mobile Padding (Line 1119)

**Current Code:**
```tsx
<div className="flex flex-col h-full max-w-2xl mx-auto w-full">
```

**Problem:** No horizontal padding, text touches edges on mobile.

**Fix:**
```tsx
<div className="flex flex-col h-full max-w-2xl mx-auto w-full px-4 sm:px-0">
```

### 5.2 Slide Mode Selection Cards Too Small on Mobile (Lines 1449-1520)

**Current Code:**
```tsx
<div className="grid grid-cols-2 gap-4 w-full max-w-[560px]">
  <button className="... aspect-[16/10] ...">
    {/* NextGen card */}
  </button>
  <button className="... aspect-[16/10] ...">
    {/* Traditional card */}
  </button>
</div>
```

**Problem:**
- On 375px screen: (375 - 16 gap) / 2 = 179px per card
- With `aspect-[16/10]`: height = 179 * 10/16 = 112px
- Text inside becomes unreadable
- "Recommended" badge overlaps

**Fix:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-[560px]">
  <button className="... aspect-[16/10] sm:aspect-[16/10] min-h-[180px] sm:min-h-0 ...">
    {/* Cards stack vertically on mobile */}
  </button>
</div>
```

### 5.3 File Preview Remove Button Too Small (Lines 1803-1808)

**Current Code:**
```tsx
<button
  onClick={() => handleRemoveFile(index)}
  className="absolute -top-2 -right-2 p-1 bg-zinc-700 ..."
>
  <X className="w-3 h-3" />
</button>
```

**Problem:** Button is ~24x24px, minimum touch target is 44x44px.

**Fix:**
```tsx
<button
  onClick={() => handleRemoveFile(index)}
  className="absolute -top-2 -right-2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-zinc-700 ... touch-manipulation"
>
  <X className="w-4 h-4" />
</button>
```

### 5.4 Input Area Takes Too Much Space (Lines 1815-1890)

**Current Code:**
```tsx
<textarea
  className="... pt-4 pb-4 pl-4 pr-2 ... min-h-[60px] ..."
/>
```

**Problem:** On mobile, 60px+ textarea plus buttons takes too much screen real estate.

**Fix:**
```tsx
<textarea
  className="... pt-3 sm:pt-4 pb-3 sm:pb-4 pl-3 sm:pl-4 pr-2 ... min-h-[48px] sm:min-h-[60px] ..."
/>
```

---

## 6. Editor Mode Mobile Issues

### File: `apps/frontend/src/components/deck/SlideViewport.tsx`

### 6.1 Properties Panel Takes 75% of Mobile Screen (Lines 897-920)

**Current Code:**
```tsx
<motion.div
  className="fixed"
  style={{
    right: '0px',
    top: '0px',
    width: '280px',  // ❌ 280px on 375px screen = 74.6% of screen!
    height: '74vh',
    // ...
  }}
>
```

**Problem:** On mobile, the properties panel covers most of the slide.

**Fix:**
```tsx
<motion.div
  className="fixed bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:top-0 sm:right-0"
  style={{
    width: isMobile ? '100%' : '280px',
    height: isMobile ? '50vh' : '74vh',
    maxHeight: isMobile ? '50vh' : '635px',
    // ...
  }}
>
  {/* On mobile, show as bottom sheet */}
  {/* On desktop, show as right sidebar */}
</motion.div>
```

### 6.2 Slide Shifts Left When Editing (Lines 784-791)

**Current Code:**
```tsx
<motion.div
  animate={{
    scale: isEditing ? 0.92 : 1,
    x: isEditing ? -140 : 0  // ❌ Shifts slide 140px left
  }}
>
```

**Problem:** On mobile, this shift pushes the slide partially off-screen.

**Fix:**
```tsx
const isMobileView = window.innerWidth < 768;

<motion.div
  animate={{
    scale: isEditing ? (isMobileView ? 0.85 : 0.92) : 1,
    x: isEditing ? (isMobileView ? 0 : -140) : 0,  // Don't shift on mobile
    y: isEditing && isMobileView ? -50 : 0  // Move up slightly to make room for bottom sheet
  }}
>
```

### 6.3 Component Toolbar Not Mobile-Optimized

**File: `apps/frontend/src/components/deck/viewport/ComponentToolbar.tsx`**

The toolbar has small icons and doesn't adapt for touch.

**Fix:** Add touch-friendly sizing and spacing:
```tsx
<div className={cn(
  "flex items-center gap-1 sm:gap-2",
  "p-1 sm:p-2",
  "[&_button]:min-w-[44px] [&_button]:min-h-[44px] sm:[&_button]:min-w-0 sm:[&_button]:min-h-0"
)}>
```

---

## 7. DeckList Page Mobile Issues

### File: `apps/frontend/src/pages/DeckList.tsx`

### 7.1 Deck Grid Single Column on All Mobile (Line 278)

**Current Code:**
```tsx
<div ref={containerRef} className="grid grid-cols-1 gap-6 auto-rows-max">
```

**Problem:** Always single column, even on tablets where 2 columns would work.

**Fix:**
```tsx
<div ref={containerRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 auto-rows-max">
```

### 7.2 Hero Section Heading Too Large (Rotating Words)

The hero heading uses `clamp()` which is good, but the implementation has issues on very small screens.

**Fix in RotatingWords component:**
```tsx
// Add min-width to prevent layout shift
<span
  className="text-orange-500 inline-block overflow-hidden transition-[width] duration-300"
  style={{
    height: '1em',
    width: wordWidths[WORDS[currentIndex]],
    minWidth: '4ch',  // Prevent collapse on small screens
    verticalAlign: 'baseline',
    position: 'relative',
    top: '0.15em',
  }}
>
```

---

## 8. Touch Target & Interaction Issues

### Minimum Touch Target Size

Apple and Google recommend **44x44px minimum** for touch targets.

### Files With Undersized Touch Targets:

| File | Element | Current Size | Required |
|------|---------|-------------|----------|
| `PresentationMode.tsx:584-588` | Close thumbnail button | 28x28px | 44x44px |
| `ConversationalOnboarding.tsx:1803` | File remove button | 24x24px | 44x44px |
| `Landing.tsx:301-303` | Mobile menu toggle | 24x24px | 44x44px |
| `SlideControlBar` | Navigation arrows | 32x32px | 44x44px |
| `ThumbnailNavigator` | Thumbnail buttons | Variable | 44x44px |

### Fix Pattern:

```tsx
// Add this to all touch targets
className="min-w-[44px] min-h-[44px] touch-manipulation"
```

### Missing `touch-manipulation` CSS

The `touch-manipulation` class prevents 300ms click delay on mobile. Add to all interactive elements:

```css
/* In index.css or globals.css */
button,
[role="button"],
a,
input,
select,
textarea {
  touch-action: manipulation;
}
```

---

## 9. CSS/Tailwind Responsive Breakpoint Gaps

### Current Breakpoint Usage

Analysis of the codebase shows:

| Breakpoint | Usage Count | Description |
|------------|-------------|-------------|
| `sm:` (640px) | **Very Low** | Often skipped |
| `md:` (768px) | **High** | Most common |
| `lg:` (1024px) | Medium | Used for desktop |
| `xl:` (1280px) | Low | Large screens |
| `2xl:` (1536px) | Very Low | Ultra-wide |

### Problem: 375px to 768px Gap

There's no styling between 0-640px and 640-768px. This means:
- iPhone SE (375px) and iPad Mini (768px) get the same styles
- No tablet-specific optimizations

### Recommended Breakpoint Strategy

```css
/* Mobile first base styles: 0-639px */
.element { /* mobile styles */ }

/* Small tablets: 640-767px */
@screen sm { .element { /* small tablet styles */ } }

/* Tablets: 768-1023px */
@screen md { .element { /* tablet styles */ } }

/* Desktop: 1024-1279px */
@screen lg { .element { /* desktop styles */ } }

/* Large desktop: 1280px+ */
@screen xl { .element { /* large desktop styles */ } }
```

### Components Missing `sm:` Breakpoint

1. `Landing.tsx` - Pricing cards, comparison table
2. `ConversationalOnboarding.tsx` - Slide mode selection
3. `SlideViewport.tsx` - Properties panel
4. `PresentationMode.tsx` - Control padding

---

## 10. Implementation Fixes

### 10.1 Priority 1: Fix Presentation Mode Crashes

**File: `apps/frontend/src/components/deck/PresentationMode.tsx`**

```tsx
// 1. Fix touch handler (Line 269)
const handleTouchEnd = (e: TouchEvent) => {
  if (showThumbnails) return;
  if (!e.changedTouches || e.changedTouches.length === 0) return;

  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  // ... rest of handler
};

// 2. Fix orientation API (Lines 88-117)
const safeOrientationLock = async (orientation: string) => {
  if (typeof window === 'undefined') return;
  try {
    const screenApi = window.screen as any;
    if (screenApi?.orientation?.lock) {
      await screenApi.orientation.lock(orientation);
    }
  } catch {
    // Expected to fail on many devices
  }
};

const safeOrientationUnlock = () => {
  if (typeof window === 'undefined') return;
  try {
    const screenApi = window.screen as any;
    if (screenApi?.orientation?.unlock) {
      screenApi.orientation.unlock();
    }
  } catch {
    // Expected to fail on many devices
  }
};

// 3. Fix mobile detection (Line 67)
const checkMobile = () => {
  const width = window.innerWidth;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  setIsMobile(isTouch && width <= 1024);
};
```

### 10.2 Priority 2: Fix Slide Sizing

**File: `apps/frontend/src/components/deck/viewport/SlideDisplay.tsx`**

```tsx
// Replace hardcoded slideWidth (Line 266)
const calculateSlideWidth = useCallback(() => {
  if (!containerRef.current) return 950;

  const containerWidth = containerRef.current.clientWidth;
  const containerHeight = containerRef.current.clientHeight;

  // Calculate width to fit container while maintaining aspect ratio
  const aspectRatio = DEFAULT_SLIDE_WIDTH / DEFAULT_SLIDE_HEIGHT;
  const widthFromHeight = containerHeight * aspectRatio;

  // Use 95% of available width or height-constrained width, whichever is smaller
  const optimalWidth = Math.min(containerWidth * 0.95, widthFromHeight);

  // Clamp to reasonable range
  return Math.max(600, Math.min(1400, optimalWidth));
}, []);

const [slideWidth, setSlideWidth] = useState(calculateSlideWidth);

useEffect(() => {
  const handleResize = () => {
    setSlideWidth(calculateSlideWidth());
  };

  handleResize();
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, [calculateSlideWidth]);

const slideHeight = slideWidth * (DEFAULT_SLIDE_HEIGHT / DEFAULT_SLIDE_WIDTH);
```

### 10.3 Priority 3: Fix Landing Page

**File: `apps/frontend/src/pages/Landing.tsx`**

```tsx
// 1. Fix cleanup function (Line 59-65)
return () => {
  window.removeEventListener('scroll', handleScroll);
  // DON'T set fixed positioning on cleanup!
  // Remove these lines:
  // document.documentElement.style.position = 'fixed';
  // document.documentElement.style.overflow = 'hidden';
};

// 2. Fix hero buttons (Line 342)
<div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-8 px-4 sm:px-0">
  <Button size="lg" className="px-6 sm:px-10 py-5 sm:py-6 w-full sm:w-auto text-sm sm:text-base">
    Create Full Deck Free
    <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
  </Button>
  <Button size="lg" variant="outline" className="px-6 sm:px-10 py-5 sm:py-6 w-full sm:w-auto text-sm sm:text-base">
    <Play className="mr-2 w-4 h-4 sm:w-5 sm:h-5" />
    Watch Demo
  </Button>
</div>
```

### 10.4 Priority 4: Fix Editor Mode

**File: `apps/frontend/src/components/deck/SlideViewport.tsx`**

```tsx
// 1. Add mobile detection
const [isMobileView, setIsMobileView] = useState(false);

useEffect(() => {
  const checkMobile = () => {
    setIsMobileView(window.innerWidth < 768);
  };
  checkMobile();
  window.addEventListener('resize', checkMobile);
  return () => window.removeEventListener('resize', checkMobile);
}, []);

// 2. Fix properties panel (Line 897)
<motion.div
  className={cn(
    "fixed z-50",
    isMobileView
      ? "bottom-0 left-0 right-0 rounded-t-2xl"
      : "top-0 right-0"
  )}
  style={{
    width: isMobileView ? '100%' : '280px',
    height: isMobileView ? '50vh' : '74vh',
    maxHeight: isMobileView ? '50vh' : '635px',
    backgroundColor: 'var(--background)',
    borderLeft: isMobileView ? 'none' : '1px solid var(--border)',
    borderTop: isMobileView ? '1px solid var(--border)' : 'none',
  }}
>

// 3. Fix slide shift (Line 784)
<motion.div
  animate={{
    scale: isEditing ? (isMobileView ? 0.8 : 0.92) : 1,
    x: isEditing && !isMobileView ? -140 : 0,
    y: isEditing && isMobileView ? -30 : 0
  }}
>
```

### 10.5 Priority 5: Fix Conversational Onboarding

**File: `apps/frontend/src/components/onboarding/ConversationalOnboarding.tsx`**

```tsx
// 1. Add padding to container (Line 1119)
<div className="flex flex-col h-full max-w-2xl mx-auto w-full px-4 sm:px-6 lg:px-0">

// 2. Fix slide mode selection (Line 1449)
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-[560px] px-2 sm:px-0">
  <button className="... min-h-[200px] sm:min-h-0 aspect-auto sm:aspect-[16/10] ...">

// 3. Fix file preview buttons (Line 1803)
<button
  onClick={() => handleRemoveFile(index)}
  className="absolute -top-1.5 -right-1.5 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center bg-zinc-700 rounded-full touch-manipulation"
>
  <X className="w-3.5 h-3.5" />
</button>
```

---

## Testing Checklist

### Devices to Test

- [ ] iPhone SE (375x667) - Smallest common phone
- [ ] iPhone 14 Pro (393x852) - Current flagship
- [ ] iPhone 14 Pro Max (430x932) - Large phone
- [ ] iPad Mini (768x1024) - Small tablet
- [ ] iPad Pro 12.9" (1024x1366) - Large tablet
- [ ] MacBook Air 13" (1440x900) - Small laptop
- [ ] 4K Monitor (3840x2160) - Large screen
- [ ] Ultrawide (3440x1440) - Wide screen

### Test Scenarios

1. **Presentation Mode**
   - [ ] Quick tap/swipe gestures don't crash
   - [ ] Orientation lock/unlock doesn't crash
   - [ ] Controls are large enough to tap
   - [ ] Swipe navigation works smoothly

2. **Slide Sizing**
   - [ ] Slides scale appropriately on 4K
   - [ ] Slides don't overflow on mobile
   - [ ] Aspect ratio is maintained

3. **Landing Page**
   - [ ] All sections readable on mobile
   - [ ] Comparison table scrollable
   - [ ] Buttons tap-friendly
   - [ ] No horizontal overflow

4. **Editor Mode**
   - [ ] Properties panel usable on mobile
   - [ ] Slide visible while editing
   - [ ] Touch targets adequate

5. **Onboarding**
   - [ ] Cards selectable on mobile
   - [ ] Text readable
   - [ ] File upload works

---

## Appendix: All Files Requiring Changes

| File | Priority | Changes |
|------|----------|---------|
| `PresentationMode.tsx` | P0 | Touch handler, orientation API, mobile detection |
| `SlideDisplay.tsx` | P0 | Responsive slide width calculation |
| `SlideContainer.tsx` | P1 | Remove restrictive maxWidth |
| `SlideViewport.tsx` | P1 | Mobile properties panel, slide shift |
| `Landing.tsx` | P1 | Cleanup function, responsive buttons, comparison table |
| `ConversationalOnboarding.tsx` | P2 | Padding, card sizing, touch targets |
| `DeckList.tsx` | P2 | Responsive grid |
| `ComponentToolbar.tsx` | P2 | Touch-friendly sizing |
| `ThumbnailNavigator.tsx` | P2 | Touch targets |
| `index.css` | P2 | Global touch-manipulation |

---

*Document generated by deep codebase analysis. Last updated: December 2025*
