/**
 * ElementSelectionOverlay - Selection UI for elements inside custom components
 *
 * Provides the same visual feedback as slide-level selection:
 * - Pink (#FF007B) border
 * - 8 resize handles (4 corners + 4 edges)
 * - Cursor feedback
 *
 * Positioned over the iframe using parent viewport coordinates.
 */

import React, { useRef, useCallback } from 'react';
import { VirtualElement, ResizeDirection, Bounds } from './types';
import { CoordinateTranslator } from './coordinateTranslator';

interface ElementSelectionOverlayProps {
  element: VirtualElement;
  coordinator: CoordinateTranslator;
  isDragging: boolean;
  isResizing: boolean;
  dragOffset: { x: number; y: number };
  resizeDelta?: { width: number; height: number; x: number; y: number };
  onDragStart: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent, direction: ResizeDirection) => void;
  onDoubleClick?: () => void;
  overlayRef: React.RefObject<HTMLDivElement>;
}

// Pink selection color - same as slide level
const SELECTION_COLOR = '#FF007B';

export const ElementSelectionOverlay: React.FC<ElementSelectionOverlayProps> = ({
  element,
  coordinator,
  isDragging,
  isResizing,
  dragOffset,
  resizeDelta,
  onDragStart,
  onResizeStart,
  onDoubleClick,
  overlayRef,
}) => {
  const { bounds, isDraggable, isResizable } = element;

  // Allow resize for all resizable elements (absolute, relative, flex-item, etc.)
  // The styleMutator will generate appropriate CSS based on positioning strategy
  const canResize = isResizable;

  // Resize handle component
  const ResizeHandle: React.FC<{
    position: string;
    direction: ResizeDirection;
    cursor: string;
    style: React.CSSProperties;
  }> = ({ position, direction, cursor, style }) => (
    <div
      className="absolute w-3 h-3 border-2 rounded-none"
      style={{
        ...style,
        borderColor: SELECTION_COLOR,
        backgroundColor: 'white',
        cursor,
        pointerEvents: 'auto',
        zIndex: 50,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onResizeStart(e, direction);
      }}
      data-handle={direction}
    />
  );

  // Calculate dynamic size/position for resize
  const dynamicStyle: React.CSSProperties = {
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    pointerEvents: 'none',
    // Must be above ALL hit areas. Hit area z-index can be up to 35000 (10000 + 5000 typeBonus + 20000 areaFactor)
    zIndex: 40000,
  };

  // Apply transforms based on drag or resize state
  if (isDragging) {
    dynamicStyle.transform = 'translateX(var(--drag-x, 0px)) translateY(var(--drag-y, 0px))';
  } else if (isResizing && resizeDelta) {
    // For resize, we adjust position and size using CSS variables
    dynamicStyle.left = bounds.x + resizeDelta.x;
    dynamicStyle.top = bounds.y + resizeDelta.y;
    dynamicStyle.width = bounds.width + resizeDelta.width;
    dynamicStyle.height = bounds.height + resizeDelta.height;
  }

  return (
    <div
      ref={overlayRef}
      className="fixed"
      style={dynamicStyle}
      data-element-selection={element.id}
    >
      {/* Selection border - pink, same as slide level */}
      <div
        className="absolute inset-0 border rounded-[1px]"
        style={{
          borderColor: SELECTION_COLOR,
          boxShadow: `0 0 0 1px rgba(255, 0, 123, 0.3)`,
          pointerEvents: 'none',
        }}
      />

      {/* Drag area - covers the element for drag interaction */}
      {isDraggable && (
        <div
          className="absolute inset-0"
          style={{
            // All elements use move cursor since single-click selects for drag
            // Double-click on text enters edit mode
            cursor: isDragging ? 'grabbing' : 'move',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => {
            console.log('[ElementSelectionOverlay] Drag area mouseDown');
            e.stopPropagation();
            e.preventDefault();
            onDragStart(e);
          }}
          onDoubleClick={(e) => {
            console.log('[ElementSelectionOverlay] Drag area doubleClick');
            e.stopPropagation();
            e.preventDefault();
            onDoubleClick?.();
          }}
        />
      )}

      {/* Resize handles - only for resizable elements */}
      {canResize && !isDragging && (
        <>
          {/* Corner handles */}
          <ResizeHandle
            position="nw"
            direction="nw"
            cursor="nw-resize"
            style={{ top: 0, left: 0, transform: 'translate(-50%, -50%)' }}
          />
          <ResizeHandle
            position="ne"
            direction="ne"
            cursor="ne-resize"
            style={{ top: 0, right: 0, transform: 'translate(50%, -50%)' }}
          />
          <ResizeHandle
            position="se"
            direction="se"
            cursor="se-resize"
            style={{ bottom: 0, right: 0, transform: 'translate(50%, 50%)' }}
          />
          <ResizeHandle
            position="sw"
            direction="sw"
            cursor="sw-resize"
            style={{ bottom: 0, left: 0, transform: 'translate(-50%, 50%)' }}
          />

          {/* Edge handles */}
          <ResizeHandle
            position="n"
            direction="n"
            cursor="n-resize"
            style={{ top: 0, left: '50%', transform: 'translate(-50%, -50%)' }}
          />
          <ResizeHandle
            position="e"
            direction="e"
            cursor="e-resize"
            style={{ top: '50%', right: 0, transform: 'translate(50%, -50%)' }}
          />
          <ResizeHandle
            position="s"
            direction="s"
            cursor="s-resize"
            style={{ bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' }}
          />
          <ResizeHandle
            position="w"
            direction="w"
            cursor="w-resize"
            style={{ top: '50%', left: 0, transform: 'translate(-50%, -50%)' }}
          />
        </>
      )}

      {/* Element type indicator removed - was showing "div" which was confusing
          The floating chat panel already shows the element type in a better way */}
    </div>
  );
};

export default ElementSelectionOverlay;
