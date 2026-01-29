/**
 * useElementDrag - Zero-lag dragging for elements inside custom components
 *
 * Uses the same CSS variable technique as useComponentDrag for instant visual feedback.
 * Coordinates are translated between parent viewport and iframe space.
 *
 * IMPORTANT: Drag only starts after mouse moves beyond DRAG_THRESHOLD pixels.
 * This prevents accidental drags when user just wants to click/select.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { VirtualElement, Bounds } from './types';
import { CoordinateTranslator } from './coordinateTranslator';
import { generateStyleMutation } from './styleMutator';

// Minimum pixels mouse must move before drag starts
const DRAG_THRESHOLD = 5;

interface UseElementDragProps {
  element: VirtualElement;
  coordinator: CoordinateTranslator;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  overlayRef: React.RefObject<HTMLDivElement>;
  onPositionChange: (newBounds: Bounds, styles: Record<string, string>) => void;
  onDragEnd: (newBounds: Bounds, styles: Record<string, string>) => void;
  /** Called when mouseUp without dragging (click without move) */
  onClickWithoutDrag?: (x: number, y: number) => void;
}

interface UseElementDragReturn {
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  handleDragStart: (e: React.MouseEvent) => void;
}

/**
 * Hook for dragging elements with zero-lag visual feedback
 */
export function useElementDrag({
  element,
  coordinator,
  iframeRef,
  overlayRef,
  onPositionChange,
  onDragEnd,
  onClickWithoutDrag,
}: UseElementDragProps): UseElementDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Track if we're in "potential drag" state (mousedown but not yet moved enough)
  const [isPotentialDrag, setIsPotentialDrag] = useState(false);

  // Refs for drag state (avoid stale closures)
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    elementBounds: Bounds;
    iframeBounds: Bounds;
  } | null>(null);

  // Throttle for iframe updates - use requestAnimationFrame timing (~16ms = 60fps)
  const lastUpdateRef = useRef(0);
  const UPDATE_THROTTLE = 16; // 60 updates/sec for smooth iframe updates

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!element.isDraggable) return;

    e.preventDefault();
    e.stopPropagation();

    // Store starting state but DON'T start dragging yet
    // Wait for mouse to move beyond threshold
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elementBounds: { ...element.bounds },
      iframeBounds: { ...element.iframeBounds },
    };

    // Enter "potential drag" state - drag will start if mouse moves enough
    setIsPotentialDrag(true);
    setDragOffset({ x: 0, y: 0 });
  }, [element]);

  // Mouse move handler for potential drag (checking threshold)
  useEffect(() => {
    if (!isPotentialDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // If we haven't started dragging yet, check threshold
      if (!isDragging) {
        if (distance >= DRAG_THRESHOLD) {
          // Start actual drag
          document.body.style.userSelect = 'none';
          document.body.style.webkitUserSelect = 'none';
          document.body.classList.add('dragging-component');

          // Initialize CSS variables on overlay element with GPU hints
          if (overlayRef.current) {
            overlayRef.current.style.setProperty('--drag-x', '0px');
            overlayRef.current.style.setProperty('--drag-y', '0px');
            // GPU compositing hint for smooth 60fps
            overlayRef.current.style.willChange = 'transform';
          }

          setIsDragging(true);
        }
        return; // Don't process drag until threshold is met
      }

      // Update CSS variables immediately for zero-lag visual feedback
      if (overlayRef.current) {
        overlayRef.current.style.setProperty('--drag-x', `${deltaX}px`);
        overlayRef.current.style.setProperty('--drag-y', `${deltaY}px`);
      }

      setDragOffset({ x: deltaX, y: deltaY });

      // Throttle iframe updates
      const now = Date.now();
      if (now - lastUpdateRef.current > UPDATE_THROTTLE) {
        lastUpdateRef.current = now;

        // Convert delta to iframe coordinates
        const iframeDelta = coordinator.deltaToIframe(deltaX, deltaY);

        // Calculate new iframe bounds
        const newIframeBounds: Bounds = {
          x: dragStartRef.current.iframeBounds.x + iframeDelta.dx,
          y: dragStartRef.current.iframeBounds.y + iframeDelta.dy,
          width: dragStartRef.current.iframeBounds.width,
          height: dragStartRef.current.iframeBounds.height,
        };

        // Generate style mutation
        const styles = generateStyleMutation(element, newIframeBounds);

        // Send update to iframe
        onPositionChange(newIframeBounds, styles);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // If we never started dragging (didn't pass threshold), this was a click
      if (!isDragging) {
        setIsPotentialDrag(false);
        dragStartRef.current = null;
        // Notify parent this was a click, not a drag
        onClickWithoutDrag?.(e.clientX, e.clientY);
        return;
      }

      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      // Convert delta to iframe coordinates
      const iframeDelta = coordinator.deltaToIframe(deltaX, deltaY);

      // Calculate final iframe bounds
      const finalIframeBounds: Bounds = {
        x: Math.round(dragStartRef.current.iframeBounds.x + iframeDelta.dx),
        y: Math.round(dragStartRef.current.iframeBounds.y + iframeDelta.dy),
        width: dragStartRef.current.iframeBounds.width,
        height: dragStartRef.current.iframeBounds.height,
      };

      // Generate final style mutation
      const styles = generateStyleMutation(element, finalIframeBounds);

      // Cleanup body styles
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.classList.remove('dragging-component');

      // IMPORTANT: Notify parent FIRST so bounds are updated before CSS variables are removed
      // This prevents the "snap back" visual glitch where overlay briefly shows old position
      onDragEnd(finalIframeBounds, styles);

      // Now remove CSS variables AFTER bounds update is applied
      // Use requestAnimationFrame to ensure React has rendered the new bounds
      requestAnimationFrame(() => {
        if (overlayRef.current) {
          overlayRef.current.style.removeProperty('--drag-x');
          overlayRef.current.style.removeProperty('--drag-y');
          // Remove GPU hint after drag ends
          overlayRef.current.style.willChange = '';
        }
      });

      setIsDragging(false);
      setIsPotentialDrag(false);
      setDragOffset({ x: 0, y: 0 });
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPotentialDrag, isDragging, coordinator, element, overlayRef, onPositionChange, onDragEnd, onClickWithoutDrag]);

  return {
    isDragging,
    dragOffset,
    handleDragStart,
  };
}

export default useElementDrag;
