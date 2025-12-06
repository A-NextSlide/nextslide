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

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: ResizeDirection) => {
    if (!element.isResizable) return;

    e.preventDefault();
    e.stopPropagation();

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    // Initialize CSS variables for zero-lag feedback
    if (overlayRef.current) {
      overlayRef.current.style.setProperty('--resize-width', '0px');
      overlayRef.current.style.setProperty('--resize-height', '0px');
      overlayRef.current.style.setProperty('--resize-x', '0px');
      overlayRef.current.style.setProperty('--resize-y', '0px');
    }

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
  }, [element, overlayRef]);

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

  // Calculate delta for parent coordinate space (for CSS variables)
  const calculateParentDelta = useCallback((
    startBounds: Bounds,
    deltaX: number,
    deltaY: number,
    direction: ResizeDirection
  ): { width: number; height: number; x: number; y: number } => {
    // No coordinate conversion needed - delta in screen space is delta in parent space
    let dWidth = 0;
    let dHeight = 0;
    let dX = 0;
    let dY = 0;

    switch (direction) {
      case 'nw':
        dWidth = -deltaX;
        dHeight = -deltaY;
        dX = deltaX;
        dY = deltaY;
        break;
      case 'ne':
        dWidth = deltaX;
        dHeight = -deltaY;
        dY = deltaY;
        break;
      case 'se':
        dWidth = deltaX;
        dHeight = deltaY;
        break;
      case 'sw':
        dWidth = -deltaX;
        dHeight = deltaY;
        dX = deltaX;
        break;
      case 'n':
        dHeight = -deltaY;
        dY = deltaY;
        break;
      case 'e':
        dWidth = deltaX;
        break;
      case 's':
        dHeight = deltaY;
        break;
      case 'w':
        dWidth = -deltaX;
        dX = deltaX;
        break;
    }

    // Ensure minimum size
    const minWidth = 20;
    const minHeight = 20;
    const newWidth = startBounds.width + dWidth;
    const newHeight = startBounds.height + dHeight;

    if (newWidth < minWidth) {
      const diff = minWidth - newWidth;
      dWidth += diff;
      if (direction.includes('w')) dX -= diff;
    }
    if (newHeight < minHeight) {
      const diff = minHeight - newHeight;
      dHeight += diff;
      if (direction.includes('n')) dY -= diff;
    }

    return { width: dWidth, height: dHeight, x: dX, y: dY };
  }, []);

  // Mouse move handler
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;

      const deltaX = e.clientX - resizeStartRef.current.mouseX;
      const deltaY = e.clientY - resizeStartRef.current.mouseY;

      // Calculate parent delta for CSS variables (immediate visual feedback)
      const parentDelta = calculateParentDelta(
        resizeStartRef.current.parentBounds,
        deltaX,
        deltaY,
        resizeStartRef.current.direction
      );

      // Update CSS variables immediately for zero-lag visual feedback
      if (overlayRef.current) {
        overlayRef.current.style.setProperty('--resize-width', `${parentDelta.width}px`);
        overlayRef.current.style.setProperty('--resize-height', `${parentDelta.height}px`);
        overlayRef.current.style.setProperty('--resize-x', `${parentDelta.x}px`);
        overlayRef.current.style.setProperty('--resize-y', `${parentDelta.y}px`);
      }

      setResizeDelta(parentDelta);

      // Calculate iframe bounds for actual element update
      const newBounds = calculateNewBounds(
        resizeStartRef.current.iframeBounds,
        deltaX,
        deltaY,
        resizeStartRef.current.direction
      );

      // Throttle iframe updates
      const now = Date.now();
      if (now - lastUpdateRef.current > UPDATE_THROTTLE) {
        lastUpdateRef.current = now;

        // Generate style mutation
        const styles = generateStyleMutation(element, newBounds);

        // Send update to iframe
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

      // Clear CSS variables
      if (overlayRef.current) {
        overlayRef.current.style.removeProperty('--resize-width');
        overlayRef.current.style.removeProperty('--resize-height');
        overlayRef.current.style.removeProperty('--resize-x');
        overlayRef.current.style.removeProperty('--resize-y');
      }

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
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, calculateNewBounds, calculateParentDelta, element, overlayRef, onSizeChange, onResizeEnd]);

  return {
    isResizing,
    resizeDirection,
    resizeDelta,
    handleResizeStart,
  };
}

export default useElementResize;
