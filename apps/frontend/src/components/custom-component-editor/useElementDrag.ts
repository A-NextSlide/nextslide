/**
 * useElementDrag - Zero-lag dragging for elements inside custom components
 *
 * Uses the same CSS variable technique as useComponentDrag for instant visual feedback.
 * Coordinates are translated between parent viewport and iframe space.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { VirtualElement, Bounds } from './types';
import { CoordinateTranslator } from './coordinateTranslator';
import { generateStyleMutation } from './styleMutator';

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

  // Refs for drag state (avoid stale closures)
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    elementBounds: Bounds;
    iframeBounds: Bounds;
  } | null>(null);

  // Throttle for iframe updates
  const lastUpdateRef = useRef(0);
  const UPDATE_THROTTLE = 50; // 20 updates/sec for iframe, but CSS vars update every frame

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!element.isDraggable) return;

    e.preventDefault();
    e.stopPropagation();

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.classList.add('dragging-component');

    // Store starting state
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elementBounds: { ...element.bounds },
      iframeBounds: { ...element.iframeBounds },
    };

    // Initialize CSS variables on overlay element
    if (overlayRef.current) {
      overlayRef.current.style.setProperty('--drag-x', '0px');
      overlayRef.current.style.setProperty('--drag-y', '0px');
    }

    setIsDragging(true);
    setDragOffset({ x: 0, y: 0 });
  }, [element, overlayRef]);

  // Mouse move handler
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !overlayRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      // Update CSS variables immediately for zero-lag visual feedback
      overlayRef.current.style.setProperty('--drag-x', `${deltaX}px`);
      overlayRef.current.style.setProperty('--drag-y', `${deltaY}px`);

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
      setDragOffset({ x: 0, y: 0 });
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, coordinator, element, overlayRef, onPositionChange, onDragEnd]);

  return {
    isDragging,
    dragOffset,
    handleDragStart,
  };
}

export default useElementDrag;
