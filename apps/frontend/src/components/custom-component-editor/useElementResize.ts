/**
 * useElementResize - Resize handling for elements inside custom components
 *
 * Handles 8-direction resize (4 corners + 4 edges) with proper
 * coordinate transformation between parent viewport and iframe space.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { VirtualElement, Bounds, ResizeDirection } from './types';
import { CoordinateTranslator } from './coordinateTranslator';
import { generateStyleMutation } from './styleMutator';

interface UseElementResizeProps {
  element: VirtualElement;
  coordinator: CoordinateTranslator;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onSizeChange: (newBounds: Bounds, styles: Record<string, string>) => void;
  onResizeEnd: (newBounds: Bounds, styles: Record<string, string>) => void;
}

interface UseElementResizeReturn {
  isResizing: boolean;
  resizeDirection: ResizeDirection | null;
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
  onSizeChange,
  onResizeEnd,
}: UseElementResizeProps): UseElementResizeReturn {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<ResizeDirection | null>(null);

  // Refs for resize state
  const resizeStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    iframeBounds: Bounds;
    direction: ResizeDirection;
  } | null>(null);

  // Throttle for updates
  const lastUpdateRef = useRef(0);
  const UPDATE_THROTTLE = 33; // ~30fps

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: ResizeDirection) => {
    if (!element.isResizable) return;

    e.preventDefault();
    e.stopPropagation();

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      iframeBounds: { ...element.iframeBounds },
      direction,
    };

    setIsResizing(true);
    setResizeDirection(direction);
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

  // Mouse move handler
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;

      const deltaX = e.clientX - resizeStartRef.current.mouseX;
      const deltaY = e.clientY - resizeStartRef.current.mouseY;

      const newBounds = calculateNewBounds(
        resizeStartRef.current.iframeBounds,
        deltaX,
        deltaY,
        resizeStartRef.current.direction
      );

      // Throttle updates
      const now = Date.now();
      if (now - lastUpdateRef.current > UPDATE_THROTTLE) {
        lastUpdateRef.current = now;

        // Generate style mutation
        const styles = generateStyleMutation(element, newBounds);

        // Send update
        onSizeChange(newBounds, styles);
      }
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

      // Notify parent of final size
      onResizeEnd(finalBounds, styles);

      setIsResizing(false);
      setResizeDirection(null);
      resizeStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, calculateNewBounds, element, onSizeChange, onResizeEnd]);

  return {
    isResizing,
    resizeDirection,
    handleResizeStart,
  };
}

export default useElementResize;
