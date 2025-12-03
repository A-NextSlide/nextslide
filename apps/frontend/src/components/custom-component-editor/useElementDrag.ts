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

          // Initialize CSS variables on overlay element
          if (overlayRef.current) {
            overlayRef.current.style.setProperty('--drag-x', '0px');
            overlayRef.current.style.setProperty('--drag-y', '0px');
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
      // If we never started dragging (didn't pass threshold), just cleanup
      if (!isDragging) {
        setIsPotentialDrag(false);
        dragStartRef.current = null;
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

      // Cleanup
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.classList.remove('dragging-component');

      if (overlayRef.current) {
        overlayRef.current.style.removeProperty('--drag-x');
        overlayRef.current.style.removeProperty('--drag-y');
      }

      // Notify parent of final position
      onDragEnd(finalIframeBounds, styles);

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
  }, [isPotentialDrag, isDragging, coordinator, element, overlayRef, onPositionChange, onDragEnd]);

  return {
    isDragging,
    dragOffset,
    handleDragStart,
  };
}

export default useElementDrag;
