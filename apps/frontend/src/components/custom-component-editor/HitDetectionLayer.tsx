/**
 * HitDetectionLayer - Single DOM element for all pointer events
 *
 * Replaces N DOM elements (ElementHitArea for each element) with a single
 * transparent overlay that handles all mouse events via mathematical hit testing.
 *
 * Architecture:
 * - ONE DOM element for hit detection (not N)
 * - Mouse events use hitTestAtPoint() for O(log n) element lookup
 * - Visual hover feedback via single hover indicator element
 * - No re-renders during mouse movement (uses refs)
 *
 * This is the Figma approach for 60fps interactions.
 */

import React, { useCallback, useRef, useState } from 'react';
import { VirtualElement } from './types';
import { useHitDetection } from './useHitDetection';

interface HitDetectionLayerProps {
  /** Iframe bounds for positioning the layer */
  iframeBounds: DOMRect;

  /** All virtual elements for hit testing */
  virtualElements: VirtualElement[];

  /** Currently selected element ID (excluded from hover) */
  selectedElementId: string | null;

  /** Called when an element is clicked */
  onElementClick: (element: VirtualElement, point: { x: number; y: number }) => void;

  /** Called when an element is double-clicked */
  onElementDoubleClick: (element: VirtualElement, point: { x: number; y: number }) => void;

  /** Called when clicking on empty space (background) */
  onBackgroundClick: (point: { x: number; y: number }) => void;

  /** Called when starting a box selection drag on background */
  onBackgroundDragStart: (e: React.MouseEvent) => void;

  /** Whether hit detection is disabled (e.g., during text editing) */
  disabled: boolean;

  /** Whether box selection is currently active */
  isBoxSelecting: boolean;
}

/**
 * HitDetectionLayer - Figma-style single-element hit detection
 */
export const HitDetectionLayer = React.memo<HitDetectionLayerProps>(
  ({
    iframeBounds,
    virtualElements,
    selectedElementId,
    onElementClick,
    onElementDoubleClick,
    onBackgroundClick,
    onBackgroundDragStart,
    disabled,
    isBoxSelecting,
  }) => {
    // ============================================
    // ALL HOOKS MUST BE CALLED UNCONDITIONALLY
    // (before any early returns)
    // ============================================

    // Hit detection hook
    const { hitTestAtPoint, getAllAtPoint } = useHitDetection(virtualElements);

    // Hover state for visual feedback
    const [hoverElement, setHoverElement] = useState<VirtualElement | null>(null);

    // Throttle hover updates for performance
    const lastHoverUpdateRef = useRef(0);
    const HOVER_THROTTLE = 16; // ~60fps

    /**
     * Handle mouse move for hover feedback
     */
    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        // Don't update hover during box selection
        if (isBoxSelecting) {
          setHoverElement(null);
          return;
        }

        // Throttle hover updates
        const now = Date.now();
        if (now - lastHoverUpdateRef.current < HOVER_THROTTLE) {
          return;
        }
        lastHoverUpdateRef.current = now;

        const point = { x: e.clientX, y: e.clientY };

        // Exclude currently selected element from hover
        const excludeIds = selectedElementId ? new Set([selectedElementId]) : undefined;
        const { element } = hitTestAtPoint(point, excludeIds);

        // Only update state if hover changed
        setHoverElement((prev) => {
          if (prev?.id === element?.id) return prev;
          return element;
        });
      },
      [hitTestAtPoint, selectedElementId, isBoxSelecting]
    );

    /**
     * Handle mouse leave - clear hover
     */
    const handleMouseLeave = useCallback(() => {
      setHoverElement(null);
    }, []);

    /**
     * Handle mouse down - determine if clicking element or background
     */
    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click

        const point = { x: e.clientX, y: e.clientY };

        // Include all elements in hit testing — the selected element participates
        // so clicking it again keeps it selected (for drag initiation)
        const { element } = hitTestAtPoint(point);

        if (element) {
          // Clicked on an element - handle selection
          e.preventDefault();
          e.stopPropagation();
          onElementClick(element, point);
        } else {
          // Clicked on background - start potential box selection
          e.preventDefault();
          e.stopPropagation();
          onBackgroundDragStart(e);
        }
      },
      [hitTestAtPoint, onElementClick, onBackgroundDragStart]
    );

    /**
     * Handle double click for text editing or nested selection
     */
    const handleDoubleClick = useCallback(
      (e: React.MouseEvent) => {
        const point = { x: e.clientX, y: e.clientY };

        // Get all elements at point for nested selection
        const elements = getAllAtPoint(point);
        if (elements.length === 0) return;

        e.preventDefault();
        e.stopPropagation();

        // Double click selects the topmost element (which may be nested)
        const topElement = elements[0];
        if (topElement) {
          onElementDoubleClick(topElement, point);
        }
      },
      [getAllAtPoint, onElementDoubleClick]
    );

    // ============================================
    // EARLY RETURNS MUST COME AFTER ALL HOOKS
    // ============================================

    // Don't render if disabled
    if (disabled) return null;

    // Adjust hover bounds to be relative to the layer
    const hoverBounds = hoverElement
      ? {
          x: hoverElement.bounds.x - iframeBounds.left,
          y: hoverElement.bounds.y - iframeBounds.top,
          width: hoverElement.bounds.width,
          height: hoverElement.bounds.height,
        }
      : null;

    return (
      <>
        {/* Single hit detection layer - handles all mouse events */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: iframeBounds.width,
            height: iframeBounds.height,
            pointerEvents: 'auto',
            cursor: 'default',
            // Below selection overlay (40000) but above background (1)
            zIndex: 30000,
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          data-hit-detection-layer="true"
        />

        {/* Hover indicator - single element for visual feedback */}
        {hoverBounds && !isBoxSelecting && (
          <div
            style={{
              position: 'absolute',
              left: hoverBounds.x,
              top: hoverBounds.y,
              width: hoverBounds.width,
              height: hoverBounds.height,
              border: '2px solid rgba(0, 123, 255, 0.5)',
              borderRadius: '2px',
              pointerEvents: 'none',
              zIndex: 29999,
              // GPU acceleration for smooth updates
              transform: 'translate3d(0, 0, 0)',
              willChange: 'left, top, width, height',
            }}
            data-hover-indicator="true"
          />
        )}
      </>
    );
  },
  // Custom comparison - only re-render when these change
  (prevProps, nextProps) => {
    return (
      prevProps.disabled === nextProps.disabled &&
      prevProps.isBoxSelecting === nextProps.isBoxSelecting &&
      prevProps.selectedElementId === nextProps.selectedElementId &&
      prevProps.iframeBounds.left === nextProps.iframeBounds.left &&
      prevProps.iframeBounds.top === nextProps.iframeBounds.top &&
      prevProps.iframeBounds.width === nextProps.iframeBounds.width &&
      prevProps.iframeBounds.height === nextProps.iframeBounds.height &&
      // Only compare element count and IDs, not full objects
      prevProps.virtualElements.length === nextProps.virtualElements.length &&
      prevProps.virtualElements.every(
        (el, i) => el.id === nextProps.virtualElements[i]?.id
      )
    );
  }
);

HitDetectionLayer.displayName = 'HitDetectionLayer';

export default HitDetectionLayer;
