/**
 * Font Overflow Detection and Auto-Sizing Utilities
 * Detects when text overflows containers (including Tiptap) and adjusts font sizes
 */

import { ComponentInstance } from '../types/components';

// Standard font sizes to snap to (matches backend)
export const STANDARD_FONT_SIZES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36,
  40, 44, 48, 54, 60, 66, 72, 80, 88, 96
];

/**
 * Standardize a font size to the nearest standard value
 * @param size - The calculated font size (e.g., 21.4)
 * @param preferRoundDown - If true, rounds down to prevent overflow
 * @returns Standard font size (e.g., 20 or 22)
 */
export function standardizeFontSize(
  size: number,
  preferRoundDown: boolean = false
): number {
  if (size < STANDARD_FONT_SIZES[0]) {
    return STANDARD_FONT_SIZES[0];
  }

  if (size >= STANDARD_FONT_SIZES[STANDARD_FONT_SIZES.length - 1]) {
    return STANDARD_FONT_SIZES[STANDARD_FONT_SIZES.length - 1];
  }

  // Find the closest standard sizes
  for (let i = 0; i < STANDARD_FONT_SIZES.length - 1; i++) {
    const lower = STANDARD_FONT_SIZES[i];
    const upper = STANDARD_FONT_SIZES[i + 1];

    if (lower <= size && size <= upper) {
      if (preferRoundDown) {
        return lower;
      } else {
        // Round to nearest
        const diffLower = size - lower;
        const diffUpper = upper - size;
        return diffLower < diffUpper ? lower : upper;
      }
    }
  }

  return STANDARD_FONT_SIZES[STANDARD_FONT_SIZES.length - 1];
}

/**
 * Get the next smaller standard font size
 */
export function getNextSmallerSize(size: number): number {
  const standardized = standardizeFontSize(size);
  const idx = STANDARD_FONT_SIZES.indexOf(standardized);
  if (idx > 0) {
    return STANDARD_FONT_SIZES[idx - 1];
  }
  return STANDARD_FONT_SIZES[0];
}

/**
 * Get the next larger standard font size
 */
export function getNextLargerSize(size: number): number {
  const standardized = standardizeFontSize(size);
  const idx = STANDARD_FONT_SIZES.indexOf(standardized);
  if (idx < STANDARD_FONT_SIZES.length - 1) {
    return STANDARD_FONT_SIZES[idx + 1];
  }
  return STANDARD_FONT_SIZES[STANDARD_FONT_SIZES.length - 1];
}

/**
 * Check if an element's content is overflowing
 * Works for regular text and Tiptap elements
 */
export function isOverflowing(element: HTMLElement): {
  isOverflowing: boolean;
  vertical: boolean;
  horizontal: boolean;
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
} {
  if (!element) {
    return {
      isOverflowing: false,
      vertical: false,
      horizontal: false,
      scrollHeight: 0,
      clientHeight: 0,
      scrollWidth: 0,
      clientWidth: 0,
    };
  }

  // For Tiptap, check the ProseMirror element
  let contentElement = element;
  if (element.classList.contains('tiptap-editor-wrapper')) {
    const proseMirror = element.querySelector('.ProseMirror') as HTMLElement;
    if (proseMirror) {
      contentElement = proseMirror;
    }
  }

  const computedStyle = window.getComputedStyle(element);
  const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
  const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(computedStyle.paddingRight) || 0;

  // Tolerance for rounding errors
  const verticalTolerance = 5 + Math.min(paddingTop + paddingBottom, 10) * 0.1;
  const horizontalTolerance = 5 + Math.min(paddingLeft + paddingRight, 10) * 0.1;

  const vertical = contentElement.scrollHeight > (element.clientHeight + verticalTolerance);
  const horizontal = contentElement.scrollWidth > (element.clientWidth + horizontalTolerance);

  return {
    isOverflowing: vertical || horizontal,
    vertical,
    horizontal,
    scrollHeight: contentElement.scrollHeight,
    clientHeight: element.clientHeight,
    scrollWidth: contentElement.scrollWidth,
    clientWidth: element.clientWidth,
  };
}

/**
 * Calculate optimal font size to eliminate overflow
 * Uses binary search with standard font sizes
 */
export function calculateOptimalFontSizeForOverflow(
  element: HTMLElement,
  currentFontSize: number,
  minFontSize: number = 8,
  maxFontSize: number = 72
): {
  fontSize: number;
  didAdjust: boolean;
  iterations: number;
} {
  if (!element) {
    return { fontSize: currentFontSize, didAdjust: false, iterations: 0 };
  }

  const overflow = isOverflowing(element);
  if (!overflow.isOverflowing) {
    // No overflow, standardize the current size
    return {
      fontSize: standardizeFontSize(currentFontSize),
      didAdjust: false,
      iterations: 0,
    };
  }

  // Store original font size
  const originalFontSize = element.style.fontSize;

  let low = standardizeFontSize(minFontSize);
  let high = standardizeFontSize(Math.min(maxFontSize, currentFontSize));
  let optimal = low;
  let iterations = 0;
  const maxIterations = 20;

  while (low <= high && iterations < maxIterations) {
    iterations++;
    const mid = standardizeFontSize((low + high) / 2, false);

    // Apply the test size
    element.style.fontSize = `${mid}px`;

    // Force reflow
    element.offsetHeight;

    // Check overflow
    const testOverflow = isOverflowing(element);

    if (testOverflow.isOverflowing) {
      // Still overflowing, try smaller
      high = getNextSmallerSize(mid);
    } else {
      // Fits! Try to go bigger
      optimal = mid;
      low = getNextLargerSize(mid);
    }
  }

  // Restore original font size
  element.style.fontSize = originalFontSize;

  return {
    fontSize: optimal,
    didAdjust: optimal !== currentFontSize,
    iterations,
  };
}

/**
 * Detect and fix overflow for a component
 * Returns the new font size if adjusted, null if no change
 */
export function detectAndFixOverflow(
  componentElement: HTMLElement,
  component: ComponentInstance,
  options: {
    minFontSize?: number;
    maxFontSize?: number;
    autoFix?: boolean;
  } = {}
): {
  hasOverflow: boolean;
  originalSize: number;
  suggestedSize: number | null;
  overflowDetails: ReturnType<typeof isOverflowing>;
} | null {
  const {
    minFontSize = 8,
    maxFontSize = 72,
    autoFix = false,
  } = options;

  if (!componentElement || !component.props) {
    return null;
  }

  const currentFontSize = component.props.fontSize || 16;
  const overflowDetails = isOverflowing(componentElement);

  if (!overflowDetails.isOverflowing) {
    return {
      hasOverflow: false,
      originalSize: currentFontSize,
      suggestedSize: null,
      overflowDetails,
    };
  }

  // Calculate optimal size
  const result = calculateOptimalFontSizeForOverflow(
    componentElement,
    currentFontSize,
    minFontSize,
    maxFontSize
  );

  console.log('[detectAndFixOverflow]', {
    componentId: component.id,
    componentType: component.type,
    originalSize: currentFontSize,
    suggestedSize: result.fontSize,
    didAdjust: result.didAdjust,
    iterations: result.iterations,
    overflow: overflowDetails,
  });

  return {
    hasOverflow: true,
    originalSize: currentFontSize,
    suggestedSize: result.didAdjust ? result.fontSize : null,
    overflowDetails,
  };
}

/**
 * Monitor an element for overflow and auto-adjust font size
 * Returns a cleanup function to stop monitoring
 */
export function monitorAndFixOverflow(
  element: HTMLElement,
  component: ComponentInstance,
  onAdjust: (newFontSize: number) => void,
  options: {
    minFontSize?: number;
    maxFontSize?: number;
    debounceMs?: number;
  } = {}
): () => void {
  const { debounceMs = 500 } = options;

  let timeoutId: number | null = null;

  const checkOverflow = () => {
    const result = detectAndFixOverflow(element, component, options);
    if (result?.hasOverflow && result.suggestedSize) {
      onAdjust(result.suggestedSize);
    }
  };

  const debouncedCheck = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(checkOverflow, debounceMs);
  };

  // Set up ResizeObserver
  const resizeObserver = new ResizeObserver(debouncedCheck);
  resizeObserver.observe(element);

  // Set up MutationObserver for content changes (important for Tiptap)
  const mutationObserver = new MutationObserver(debouncedCheck);
  mutationObserver.observe(element, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Initial check
  debouncedCheck();

  // Return cleanup function
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };
}

/**
 * Equalize font sizes for similar components (e.g., bullet points at the same level)
 * This ensures all bullet points in a group use the same standard size
 */
export function equalizeFontSizes(sizes: number[]): number {
  if (sizes.length === 0) return 16;

  // Standardize all sizes
  const standardized = sizes.map(s => standardizeFontSize(s));

  // Use the median standardized size
  const sorted = [...standardized].sort((a, b) => a - b);
  const medianIdx = Math.floor(sorted.length / 2);

  return sorted[medianIdx];
}

