import { ComponentInstance } from '../types/components';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from './deckUtils';

export interface ComponentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Overlap information between two components
 */
export interface OverlapInfo {
  component1Id: string;
  component2Id: string;
  overlapArea: number;
  overlapPercentage: number; // Percentage of smaller component that overlaps
}

/**
 * Component with its measured bounding box
 */
export interface MeasuredComponent {
  component: ComponentInstance;
  bounds: ComponentBounds;
  isDecorative: boolean;
}

/**
 * Check if a component is decorative (doesn't need overlap detection)
 */
export function isDecorativeComponent(component: ComponentInstance): boolean {
  // Background components are always decorative
  if (component.type === 'Background') return true;
  
  // Lines are decorative (they don't take part in overlap checks)
  if (component.type === 'Lines' || component.type === 'Line' || component.type === 'line') return true;
  
  // Shapes without text are decorative
  if (component.type === 'Shape' && !component.props.text) return true;
  
  return false;
}

/**
 * Get the bounding box of a component from the DOM
 */
export function getComponentBounds(componentId: string): ComponentBounds | null {
  const element = document.querySelector(`[data-component-id="${componentId}"]`) as HTMLElement;
  if (!element) return null;
  
  const slideContainer = element.closest('.slide-container') as HTMLElement;
  if (!slideContainer) return null;
  
  const slideRect = slideContainer.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  
  // Get slide dimensions from data attributes or use defaults
  const slideWidth = parseInt(slideContainer.getAttribute('data-slide-width') || '') || DEFAULT_SLIDE_WIDTH;
  const slideHeight = parseInt(slideContainer.getAttribute('data-slide-height') || '') || DEFAULT_SLIDE_HEIGHT;
  
  // Calculate scale factors
  const scaleX = slideWidth / slideRect.width;
  const scaleY = slideHeight / slideRect.height;
  
  // Convert to slide coordinates
  return {
    x: (elementRect.left - slideRect.left) * scaleX,
    y: (elementRect.top - slideRect.top) * scaleY,
    width: elementRect.width * scaleX,
    height: elementRect.height * scaleY
  };
}

/**
 * Returns the ids of components that overlap the target component on the current slide.
 * This uses DOM measurements so it reflects the actual rendered positions/sizes.
 */
export function getOverlappingComponentIds(
  targetComponentId: string,
  componentsOnSlide: ComponentInstance[]
): string[] {
  const targetBounds = getComponentBounds(targetComponentId);
  if (!targetBounds) return [];

  const overlappingIds: string[] = [];
  for (const component of componentsOnSlide) {
    if (component.id === targetComponentId) continue;
    if (isDecorativeComponent(component)) continue;

    const bounds = getComponentBounds(component.id);
    if (!bounds) continue;
    const overlap = calculateOverlap(targetBounds, bounds);
    if (overlap) {
      overlappingIds.push(component.id);
    }
  }
  return overlappingIds;
}

/**
 * Measure the actual bounds of text content within an element
 */
export function measureTextBounds(element: HTMLElement): { width: number; height: number } {
  // First try using scrollWidth/scrollHeight which includes overflow
  const scrollBounds = {
    width: element.scrollWidth,
    height: element.scrollHeight
  };
  
  // Also measure using Range API for more accurate text bounds
  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = range.getClientRects();
  
  if (rects.length === 0) {
    // Fallback to scroll dimensions
    return scrollBounds;
  }
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    if (rect.width === 0 || rect.height === 0) continue;
    
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.right);
    maxY = Math.max(maxY, rect.bottom);
  }
  
  const rangeBounds = {
    width: maxX - minX,
    height: maxY - minY
  };
  
  // Return the larger of the two measurements to ensure we catch all overflow
  return {
    width: Math.max(scrollBounds.width, rangeBounds.width),
    height: Math.max(scrollBounds.height, rangeBounds.height)
  };
}

/**
 * Calculate overlap between two bounding boxes
 */
export function calculateOverlap(box1: ComponentBounds, box2: ComponentBounds): ComponentBounds | null {
  const left = Math.max(box1.x, box2.x);
  const right = Math.min(box1.x + box1.width, box2.x + box2.width);
  const top = Math.max(box1.y, box2.y);
  const bottom = Math.min(box1.y + box1.height, box2.y + box2.height);
  
  if (left < right && top < bottom) {
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    };
  }
  
  return null;
}

/**
 * Detect overlaps between all non-decorative components on a slide
 */
export function detectComponentOverlaps(components: ComponentInstance[]): OverlapInfo[] {
  const overlaps: OverlapInfo[] = [];
  const measuredComponents: MeasuredComponent[] = [];
  
  // Measure all non-decorative components
  for (const component of components) {
    if (!isDecorativeComponent(component)) {
      const bounds = getComponentBounds(component.id);
      if (bounds) {
        measuredComponents.push({
          component,
          bounds,
          isDecorative: false
        });
      }
    }
  }
  
  // Check for overlaps between each pair
  for (let i = 0; i < measuredComponents.length; i++) {
    for (let j = i + 1; j < measuredComponents.length; j++) {
      const comp1 = measuredComponents[i];
      const comp2 = measuredComponents[j];
      
      const overlapRect = calculateOverlap(comp1.bounds, comp2.bounds);
      if (overlapRect) {
        const overlapArea = overlapRect.width * overlapRect.height;
        const comp1Area = comp1.bounds.width * comp1.bounds.height;
        const comp2Area = comp2.bounds.width * comp2.bounds.height;
        const smallerArea = Math.min(comp1Area, comp2Area);
        
        overlaps.push({
          component1Id: comp1.component.id,
          component2Id: comp2.component.id,
          overlapArea,
          overlapPercentage: (overlapArea / smallerArea) * 100
        });
      }
    }
  }
  
  return overlaps;
}

/**
 * Calculate text size to fit within bounds
 */
export function calculateTextSizeToFit(
  textElement: HTMLElement,
  maxWidth: number,
  maxHeight: number,
  minFontSize: number = 12,
  maxFontSize: number = 200
): number {
  const originalFontSize = parseFloat(window.getComputedStyle(textElement).fontSize);
  let fontSize = originalFontSize;
  let bestFitSize = minFontSize;
  
  // Binary search for the best font size
  let low = minFontSize;
  let high = maxFontSize;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    textElement.style.fontSize = `${mid}px`;
    
    const bounds = measureTextBounds(textElement);
    
    if (bounds.width <= maxWidth && bounds.height <= maxHeight) {
      bestFitSize = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  
  // Restore original font size
  textElement.style.fontSize = `${originalFontSize}px`;
  
  return bestFitSize;
} 