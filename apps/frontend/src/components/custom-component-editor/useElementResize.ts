/**
 * useElementResize - Resize handling for elements inside custom components
 *
 * Handles 8-direction resize (4 corners + 4 edges) with proper
 * coordinate transformation between parent viewport and iframe space.
 * Uses CSS variables for zero-lag visual feedback (same as drag).
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { VirtualElement, Bounds, ResizeDirection } from './types';
import { CoordinateTranslator } from './coordinateTranslator';
import { generateStyleMutation } from './styleMutator';

interface UseElementResizeProps {
  element: VirtualElement;
  coordinator: CoordinateTranslator;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  overlayRef: React.RefObject<HTMLDivElement>;
  onSizeChange: (newBounds: Bounds, styles: Record<string, string>) => void;
  onResizeEnd: (newBounds: Bounds, styles: Record<string, string>) => void;
}

interface UseElementResizeReturn {
  isResizing: boolean;
  resizeDirection: ResizeDirection | null;
  resizeDelta: { width: number; height: number; x: number; y: number };
  handleResizeStart: (e: React.MouseEvent, direction: ResizeDirection) => void;
}

// Minimum element size in iframe pixels
const MIN_SIZE = 20;

/**
 * Hook for resizing elements in custom components
 */
export function useElementResize({
  element,
  coordinator,
  iframeRef,
  overlayRef,
  onSizeChange,
  onResizeEnd,
}: UseElementResizeProps): UseElementResizeReturn {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<ResizeDirection | null>(null);
  const [resizeDelta, setResizeDelta] = useState({ width: 0, height: 0, x: 0, y: 0 });

  // Refs for resize state
  const resizeStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    iframeBounds: Bounds;
    parentBounds: Bounds;
    direction: ResizeDirection;
  } | null>(null);

  // Throttle for updates
  const lastUpdateRef = useRef(0);
  const UPDATE_THROTTLE = 16; // ~60fps for smooth resize

  // Get cursor for resize direction
  const getCursorForDirection = (direction: ResizeDirection): string => {
    const cursorMap: Record<ResizeDirection, string> = {
      'n': 'ns-resize',
      's': 'ns-resize',
      'e': 'ew-resize',
      'w': 'ew-resize',
      'nw': 'nwse-resize',
      'se': 'nwse-resize',
      'ne': 'nesw-resize',
      'sw': 'nesw-resize',
    };
    return cursorMap[direction] || 'default';
  };

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: ResizeDirection) => {
    if (!element.isResizable) return;

    e.preventDefault();
    e.stopPropagation();

    // Prevent text selection and set cursor on body for smooth feedback
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.cursor = getCursorForDirection(direction);

    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      iframeBounds: { ...element.iframeBounds },
      parentBounds: { ...element.bounds },
      direction,
    };

    setIsResizing(true);
    setResizeDirection(direction);
    setResizeDelta({ width: 0, height: 0, x: 0, y: 0 });
  }, [element]);

  // Calculate new bounds based on resize direction
  const calculateNewBounds = useCallback((
    startBounds: Bounds,
    deltaX: number,
    deltaY: number,
    direction: ResizeDirection
  ): Bounds => {
    // Convert screen delta to iframe delta
    const iframeDelta = coordinator.deltaToIframe(deltaX, deltaY);
    const dx = iframeDelta.dx;
    const dy = iframeDelta.dy;

    let newX = startBounds.x;
    let newY = startBounds.y;
    let newWidth = startBounds.width;
    let newHeight = startBounds.height;

    switch (direction) {
      // Corners
      case 'nw':
        newWidth = Math.max(MIN_SIZE, startBounds.width - dx);
        newHeight = Math.max(MIN_SIZE, startBounds.height - dy);
        newX = startBounds.x + (startBounds.width - newWidth);
        newY = startBounds.y + (startBounds.height - newHeight);
        break;
      case 'ne':
        newWidth = Math.max(MIN_SIZE, startBounds.width + dx);
        newHeight = Math.max(MIN_SIZE, startBounds.height - dy);
        newY = startBounds.y + (startBounds.height - newHeight);
        break;
      case 'se':
        newWidth = Math.max(MIN_SIZE, startBounds.width + dx);
        newHeight = Math.max(MIN_SIZE, startBounds.height + dy);
        break;
      case 'sw':
        newWidth = Math.max(MIN_SIZE, startBounds.width - dx);
        newHeight = Math.max(MIN_SIZE, startBounds.height + dy);
        newX = startBounds.x + (startBounds.width - newWidth);
        break;

      // Edges
      case 'n':
        newHeight = Math.max(MIN_SIZE, startBounds.height - dy);
        newY = startBounds.y + (startBounds.height - newHeight);
        break;
      case 'e':
        newWidth = Math.max(MIN_SIZE, startBounds.width + dx);
        break;
      case 's':
        newHeight = Math.max(MIN_SIZE, startBounds.height + dy);
        break;
      case 'w':
        newWidth = Math.max(MIN_SIZE, startBounds.width - dx);
        newX = startBounds.x + (startBounds.width - newWidth);
        break;
    }

    return {
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(newWidth),
      height: Math.round(newHeight),
    };
  }, [coordinator]);

  // Calculate delta for parent coordinate space (for overlay visual)
  // IMPORTANT: This must produce visual deltas that match the scaled iframe element
  const calculateParentDelta = useCallback((
    startBounds: Bounds,
    deltaX: number,
    deltaY: number,
    direction: ResizeDirection,
    iframeNewBounds: Bounds,
    iframeStartBounds: Bounds
  ): { width: number; height: number; x: number; y: number } => {
    // Calculate the visual change based on the iframe bounds change, scaled to parent space
    // This ensures overlay matches the actual component visual exactly
    const scale = coordinator.getScale();

    // Calculate the delta in iframe space, then convert to parent space
    const iframeDeltaWidth = iframeNewBounds.width - iframeStartBounds.width;
    const iframeDeltaHeight = iframeNewBounds.height - iframeStartBounds.height;
    const iframeDeltaX = iframeNewBounds.x - iframeStartBounds.x;
    const iframeDeltaY = iframeNewBounds.y - iframeStartBounds.y;

    // Convert to parent space (multiply by scale since iframe is rendered scaled)
    const dWidth = iframeDeltaWidth * scale;
    const dHeight = iframeDeltaHeight * scale;
    const dX = iframeDeltaX * scale;
    const dY = iframeDeltaY * scale;

    return { width: dWidth, height: dHeight, x: dX, y: dY };
  }, [coordinator]);

  // Mouse move handler
  useEffect(() => {
    if (!isResizing) return;

    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;

      // Cancel any pending RAF to avoid queueing
      if (rafId) cancelAnimationFrame(rafId);

      rafId = requestAnimationFrame(() => {
        if (!resizeStartRef.current) return;

        const deltaX = e.clientX - resizeStartRef.current.mouseX;
        const deltaY = e.clientY - resizeStartRef.current.mouseY;

        // Calculate iframe bounds for actual element update
        const newBounds = calculateNewBounds(
          resizeStartRef.current.iframeBounds,
          deltaX,
          deltaY,
          resizeStartRef.current.direction
        );

        // Calculate parent delta for overlay visual feedback
        // Use the iframe bounds delta scaled to parent space for exact visual match
        const parentDelta = calculateParentDelta(
          resizeStartRef.current.parentBounds,
          deltaX,
          deltaY,
          resizeStartRef.current.direction,
          newBounds,
          resizeStartRef.current.iframeBounds
        );

        setResizeDelta(parentDelta);

        // Generate style mutation and send to iframe
        const styles = generateStyleMutation(element, newBounds);
        onSizeChange(newBounds, styles);
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;

      const deltaX = e.clientX - resizeStartRef.current.mouseX;
      const deltaY = e.clientY - resizeStartRef.current.mouseY;

      const finalBounds = calculateNewBounds(
        resizeStartRef.current.iframeBounds,
        deltaX,
        deltaY,
        resizeStartRef.current.direction
      );

      // Generate final style mutation
      const styles = generateStyleMutation(element, finalBounds);

      // Cleanup
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.cursor = '';

      // Notify parent of final size
      onResizeEnd(finalBounds, styles);

      setIsResizing(false);
      setResizeDirection(null);
      setResizeDelta({ width: 0, height: 0, x: 0, y: 0 });
      resizeStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, calculateNewBounds, calculateParentDelta, element, onSizeChange, onResizeEnd]);

  return {
    isResizing,
    resizeDirection,
    resizeDelta,
    handleResizeStart,
  };
}

export default useElementResize;
