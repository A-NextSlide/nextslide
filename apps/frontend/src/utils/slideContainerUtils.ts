/**
 * Utility functions for detecting and measuring the slide container
 */

const EDIT_MODE_TRANSFORM_SCALE = '0.92';

/**
 * Checks if we're currently in edit mode by looking for the transform on parent elements
 */
export function isInEditMode(element: HTMLElement | null): boolean {
  if (!element) return false;
  
  let parent = element.parentElement;
  let maxLevels = 5;
  
  while (parent && maxLevels > 0) {
    const transform = window.getComputedStyle(parent).transform;
    if (transform && transform !== 'none' && transform.includes(EDIT_MODE_TRANSFORM_SCALE)) {
      return true;
    }
    parent = parent.parentElement;
    maxLevels--;
  }
  
  return false;
}

/**
 * Gets the width of the slide container, accounting for edit mode vs view mode
 */
export function getSlideContainerWidth(defaultWidth: number = 950): number {
  const container = document.getElementById('slide-display-container');
  if (!container) return defaultWidth;
  
  const inEditMode = isInEditMode(container);
  
  if (inEditMode) {
    // In edit mode, use DOM width (actual pixels)
    const domWidth = container.offsetWidth || container.clientWidth;
    if (domWidth > 0) return domWidth;
  } else {
    // In view mode, use visual width (accounts for transforms)
    const rect = container.getBoundingClientRect();
    if (rect.width > 0) return rect.width;
  }
  
  return defaultWidth;
}

