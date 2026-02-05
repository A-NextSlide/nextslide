/**
 * useHitDetection - Mathematical hit detection for Figma-like performance
 *
 * Replaces N DOM elements with O(1) DOM elements + O(log n) hit calculation.
 * This is the architecture Figma uses for smooth 60fps interactions.
 *
 * Key features:
 * - Spatial indexing for fast point queries
 * - Semantic priority sorting (text > image > container)
 * - Click-cycling through nested elements
 * - No DOM re-renders during mouse movement
 */

import { useMemo, useCallback } from 'react';
import { VirtualElement, Bounds } from './types';

/**
 * Result of a hit test at a point
 */
export interface HitResult {
  element: VirtualElement | null;
  depth: number; // Number of elements at this point (for click-cycling)
}

/**
 * Semantic type priority tiers (higher = more interactive)
 */
const TYPE_PRIORITY: Record<string, number> = {
  text: 3,
  image: 2,
  icon: 2,
  shape: 1,
  container: 1,
};

/**
 * Interactive tag names that should be prioritized
 */
const INTERACTIVE_TAGS = new Set([
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'label',
]);

/**
 * Check if an element is semantically interactive (buttons, links, inputs)
 * as detected by the iframe extraction script. These elements get the
 * highest hit detection priority so they can be selected even when
 * overlapping with plain text elements due to CSS transforms.
 */
function isSemanticInteractive(el: VirtualElement): boolean {
  if (INTERACTIVE_TAGS.has(el.tagName?.toLowerCase())) return true;
  if (el.isInteractive === true) return true;
  return false;
}

/**
 * Check if an element is interactive (text, buttons, links, etc.)
 */
function isInteractiveElement(el: VirtualElement): boolean {
  // Text is always interactive
  if (el.type === 'text') return true;

  // Check tagName for buttons, links, inputs
  if (INTERACTIVE_TAGS.has(el.tagName?.toLowerCase())) return true;

  // Check for isInteractive flag from iframe extraction
  if (el.isInteractive === true) return true;

  return false;
}

/**
 * Check if a point is inside bounds
 */
function pointInBounds(point: { x: number; y: number }, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/**
 * Sort elements by interaction priority
 * Order: Semantic interactive (buttons/links) first, then other interactive (text),
 * then by type (text > image > container), then by size (smaller on top)
 *
 * This ensures that buttons/links are selectable even when they visually overlap
 * with plain text elements due to CSS transforms moving them out of normal flow.
 */
function sortByInteractionPriority(elements: VirtualElement[]): VirtualElement[] {
  return [...elements].sort((a, b) => {
    // Priority 1: Semantically interactive elements (buttons, links, inputs)
    // get highest priority so they can be selected through overlapping text
    const aSemantic = isSemanticInteractive(a);
    const bSemantic = isSemanticInteractive(b);
    if (aSemantic && !bSemantic) return -1;
    if (!aSemantic && bSemantic) return 1;

    // Priority 2: Interactive elements (text) over non-interactive (containers)
    const aInteractive = isInteractiveElement(a);
    const bInteractive = isInteractiveElement(b);
    if (aInteractive && !bInteractive) return -1;
    if (!aInteractive && bInteractive) return 1;

    // Priority 3: Semantic type (text > image > container)
    const aTypePriority = TYPE_PRIORITY[a.type] || 0;
    const bTypePriority = TYPE_PRIORITY[b.type] || 0;
    if (aTypePriority !== bTypePriority) return bTypePriority - aTypePriority;

    // Priority 4: Smaller elements on top (for nested selection)
    const aArea = a.bounds.width * a.bounds.height;
    const bArea = b.bounds.width * b.bounds.height;
    return aArea - bArea;
  });
}

/**
 * Calculate z-index for an element using semantic priority
 * This replaces the flawed area-based z-index calculation
 */
export function calculateSemanticZIndex(element: VirtualElement): number {
  // Semantic priority tiers (highest = most interactive)
  const TIER_INTERACTIVE = 50000; // text, buttons, links
  const TIER_MEDIA = 40000; // images, icons
  const TIER_CONTAINER = 20000; // divs, sections
  const TIER_BACKGROUND = 10000; // full-bleed backgrounds

  const elementArea = element.bounds.width * element.bounds.height;

  // Determine semantic tier
  let baseTier: number;
  if (element.type === 'text') {
    baseTier = TIER_INTERACTIVE;
  } else if (element.type === 'image' || element.type === 'icon') {
    baseTier = TIER_MEDIA;
  } else {
    // Check if container is a "background" (large, low z-index in DOM)
    const isBackground =
      elementArea > 100000 ||
      (element.computedStyle?.zIndex === 'auto' && elementArea > 50000);
    baseTier = isBackground ? TIER_BACKGROUND : TIER_CONTAINER;
  }

  // Within each tier, smaller elements on top (for nested selection)
  // Use log scale to prevent huge z-index differences
  const sizeBonus = Math.max(0, 9999 - Math.floor(Math.log(elementArea + 1) * 500));

  return baseTier + sizeBonus;
}

/**
 * Simple spatial index for fast point queries
 * For small element counts (< 1000), a simple array filter is fast enough.
 * For larger counts, we could add a quadtree or R-tree.
 */
class SpatialIndex {
  private elements: VirtualElement[];

  constructor(elements: VirtualElement[]) {
    this.elements = elements;
  }

  /**
   * Query all elements containing a point
   */
  queryPoint(point: { x: number; y: number }): VirtualElement[] {
    return this.elements.filter((el) => pointInBounds(point, el.bounds));
  }

  /**
   * Query all elements intersecting a rectangle
   */
  queryRect(rect: Bounds): VirtualElement[] {
    return this.elements.filter((el) => {
      const bounds = el.bounds;
      return (
        rect.x <= bounds.x + bounds.width &&
        rect.x + rect.width >= bounds.x &&
        rect.y <= bounds.y + bounds.height &&
        rect.y + rect.height >= bounds.y
      );
    });
  }
}

/**
 * Hook for efficient hit detection on virtual elements
 */
export function useHitDetection(virtualElements: VirtualElement[]) {
  // Build spatial index on element change (memoized)
  const spatialIndex = useMemo(() => {
    return new SpatialIndex(virtualElements);
  }, [virtualElements]);

  /**
   * Fast hit test - returns top element at point
   */
  const hitTestAtPoint = useCallback(
    (
      point: { x: number; y: number },
      excludeIds?: Set<string>
    ): HitResult => {
      let candidates = spatialIndex.queryPoint(point);

      // Exclude specified IDs if provided
      if (excludeIds && excludeIds.size > 0) {
        candidates = candidates.filter((el) => !excludeIds.has(el.id));
      }

      if (candidates.length === 0) {
        return { element: null, depth: 0 };
      }

      // Sort by semantic priority
      const sorted = sortByInteractionPriority(candidates);

      return {
        element: sorted[0] || null,
        depth: sorted.length,
      };
    },
    [spatialIndex]
  );

  /**
   * Get all elements at point (for click-cycling)
   * Returns elements sorted by interaction priority
   */
  const getAllAtPoint = useCallback(
    (point: { x: number; y: number }): VirtualElement[] => {
      const candidates = spatialIndex.queryPoint(point);
      return sortByInteractionPriority(candidates);
    },
    [spatialIndex]
  );

  /**
   * Get all elements intersecting a rectangle
   */
  const getAllInRect = useCallback(
    (rect: Bounds): VirtualElement[] => {
      const candidates = spatialIndex.queryRect(rect);
      return sortByInteractionPriority(candidates);
    },
    [spatialIndex]
  );

  /**
   * Find the topmost element at a point, excluding a specific element
   * Useful for finding what's "underneath" the currently selected element
   */
  const hitTestExcluding = useCallback(
    (point: { x: number; y: number }, excludeId: string): HitResult => {
      return hitTestAtPoint(point, new Set([excludeId]));
    },
    [hitTestAtPoint]
  );

  return {
    hitTestAtPoint,
    getAllAtPoint,
    getAllInRect,
    hitTestExcluding,
    calculateZIndex: calculateSemanticZIndex,
  };
}

export default useHitDetection;
