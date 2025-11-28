import React, { useState, useRef } from 'react';
import { ComponentInstance } from '@/types/components';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

// Helper function to check if a component is a background component
// Removing this as the logic is now passed via props
// const isBackgroundComponent = (component: ComponentInstance): boolean => {
//   return component.type === 'Background' || 
//          component.id.toLowerCase().includes('background');
// };

interface SelectionBoundingBoxProps {
  component: ComponentInstance;
  isSelected: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onDragEnd: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  onResize?: (width: number, height: number, position?: { x: number, y: number }) => void;
  isTextEditing?: boolean;
  isDraggable?: boolean; // Added prop
  isResizable?: boolean; // Added prop
  isRotatable?: boolean; // Added prop
  isMultiSelected?: boolean; // Added for multi-selection state
}

/**
 * A selection box that provides handles for moving and rotating components
 */
const SelectionBoundingBox: React.FC<SelectionBoundingBoxProps> = ({
  component,
  isSelected,
  onDragStart,
  onDragEnd,
  onResize,
  children,
  isTextEditing = false,
  isDraggable = true, // Default to true
  isResizable = true, // Default to true
  isRotatable = true,  // Default to true
  isMultiSelected = false // Default to false
}) => {
  // Reference to the container element for rotation and resize calculations
  const containerRef = useRef<HTMLDivElement>(null);
  const lastDxRef = useRef(0);
  const lastDyRef = useRef(0);
  
  // Track resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string | null>(null);

  // Removed early return during text editing to keep hook order consistent
  
  // Handler for starting resize operation
  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    if (!onResize) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    // Get the bounding box of the component for calculations
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    
    // Extract current component dimensions
    const currentWidth = typeof component.props.width === 'number' 
      ? component.props.width 
      : 10; // Default if not numeric
    
    const currentHeight = typeof component.props.height === 'number' 
      ? component.props.height 
      : 10; // Default if not numeric
    
    // Store starting mouse position
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    
    // Store original dimensions and position
    const startWidth = currentWidth;
    const startHeight = currentHeight;
    const startPosition = { ...component.props.position };
    
    // Get the parent slide element
    const slideElement = containerRef.current?.closest('.slide-container');
    if (!slideElement) return;
    
    // Get slide dimensions for pixel calculation
    const slideRect = slideElement.getBoundingClientRect();
    
    // Try to extract the actual slide size from data attributes
    let slideWidth = DEFAULT_SLIDE_WIDTH;
    let slideHeight = DEFAULT_SLIDE_HEIGHT;
    try {
      const slideWidthAttr = slideElement.getAttribute('data-slide-width');
      const slideHeightAttr = slideElement.getAttribute('data-slide-height');
      if (slideWidthAttr) slideWidth = parseInt(slideWidthAttr);
      if (slideHeightAttr) slideHeight = parseInt(slideHeightAttr);
    } catch (err) {
      // Fall back to defaults if attributes aren't available
    }
    
    // Mark as resizing and store the direction
    setIsResizing(true);
    setResizeDirection(direction);
    
    // Calculate the display to actual ratio once
    const displayToActualRatioX = slideRect.width / slideWidth;
    const displayToActualRatioY = slideRect.height / slideHeight;
    
    // Function to handle mouse movement during resize
    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Calculate how far the mouse has moved in pixels
      const deltaX = moveEvent.clientX - startMouseX;
      const deltaY = moveEvent.clientY - startMouseY;
      
      // Convert screen pixels to actual slide pixels
      const actualDeltaX = deltaX / displayToActualRatioX;
      const actualDeltaY = deltaY / displayToActualRatioY;
      
      // Calculate new width, height, and position based on resize direction
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newPosition = { ...startPosition };
      
      // Handle different resize directions
      switch (direction) {
        // Corner cases - these affect position
        case 'nw':
          newWidth = Math.max(50, startWidth - actualDeltaX);
          newHeight = Math.max(50, startHeight - actualDeltaY);
          newPosition.x = startPosition.x + (startWidth - newWidth);
          newPosition.y = startPosition.y + (startHeight - newHeight);
          break;
        case 'ne':
          newWidth = Math.max(50, startWidth + actualDeltaX);
          newHeight = Math.max(50, startHeight - actualDeltaY);
          newPosition.y = startPosition.y + (startHeight - newHeight);
          break;
        case 'se':
          newWidth = Math.max(50, startWidth + actualDeltaX);
          newHeight = Math.max(50, startHeight + actualDeltaY);
          break;
        case 'sw':
          newWidth = Math.max(50, startWidth - actualDeltaX);
          newHeight = Math.max(50, startHeight + actualDeltaY);
          newPosition.x = startPosition.x + (startWidth - newWidth);
          break;
          
        // Edge cases - these only affect position on specific edges
        case 'n':
          newHeight = Math.max(50, startHeight - actualDeltaY);
          newPosition.y = startPosition.y + (startHeight - newHeight);
          break;
        case 'e':
          newWidth = Math.max(50, startWidth + actualDeltaX);
          break;
        case 's':
          newHeight = Math.max(50, startHeight + actualDeltaY);
          break;
        case 'w':
          newWidth = Math.max(50, startWidth - actualDeltaX);
          newPosition.x = startPosition.x + (startWidth - newWidth);
          break;
      }
      
      // Call the onResize callback with new dimensions and position
      onResize(newWidth, newHeight, newPosition);
    };
    
    // Define up handler to end resize
    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDirection(null);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Signal resize end by calling onResize with -1 values
      if (onResize) {
        onResize(-1, -1);
      }
    };
    
    // Add event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Listen to drag move events - REMOVED as selection box now inherits CSS transforms from parent
  // React.useEffect(() => { ... }, []);
  
  // Handle rotation of the component
  const handleRotationStart = (e: React.MouseEvent) => {
 
    e.stopPropagation(); // Ensure this is definitely called
    e.preventDefault();
    
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    
    const centerX = containerRect.left + containerRect.width / 2;
    const centerY = containerRect.top + containerRect.height / 2;
    const startRotation = component.props.rotation || 0;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    const originalPosition = { ...component.props.position };

    // --- Store initial state for history (existing logic) --- 
    let rotationSlideId: string | null = null;
    const rotationSlideContainer = containerRef.current?.closest('.slide-container[data-slide-id]') as HTMLElement;
    if (rotationSlideContainer) {
      rotationSlideId = rotationSlideContainer.getAttribute('data-slide-id');
      try {
        Promise.all([
          import('../stores/historyStore'),
          import('../stores/editorStore')
        ]).then(([historyModule, editorModule]) => {
          const historyStore = historyModule.useHistoryStore;
          const editorStore = editorModule.useEditorStore;
          const currentComponents = editorStore.getState().draftComponents[rotationSlideId!] || [];
          historyStore.getState().addToHistory(rotationSlideId!, currentComponents);
        });
      } catch (error) {/* ... */}
    } 
    // --- End of history logic ---

    let lastCalculatedRotation = startRotation; // Ref to store the latest rotation value

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * (180 / Math.PI);
      let angleDelta = currentAngle - startAngle;
      if (angleDelta > 180) angleDelta -= 360;
      if (angleDelta < -180) angleDelta += 360;
      let newRotation = startRotation + angleDelta;
      newRotation = ((newRotation % 360) + 360) % 360;
      newRotation = Math.round(newRotation);

      const snapAngles = [0, 90, 180, 270, 360];
      for (const snapAngle of snapAngles) {
        if (Math.abs(newRotation - snapAngle) <= 5) newRotation = snapAngle;
      }
      if (newRotation === 360) newRotation = 0;

      lastCalculatedRotation = newRotation; // Update the latest calculated rotation

      const rotationEvent = new CustomEvent('component:rotate', {
        bubbles: true,
        detail: { componentId: component.id, rotation: newRotation, position: originalPosition }
      });
      document.dispatchEvent(rotationEvent);
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      const rotationEndEvent = new CustomEvent('component:rotate-end', {
        bubbles: true,
        detail: {
          componentId: component.id,
          rotation: lastCalculatedRotation, // Use the last rotation calculated during mouse move
          position: originalPosition 
        }
      });
      document.dispatchEvent(rotationEndEvent);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  return (
    <div ref={containerRef} className={`relative w-full h-full`} style={{ overflow: 'visible' }}>
      {/* Original children content always rendered first */}
      {children}
      
      {/* Selection UI */}
      {/* Default selection border (hidden during text editing) */}
      {isSelected && !isTextEditing && (
        <div 
          className={`absolute inset-0 border rounded-[1px] ${isMultiSelected ? 'border-[#FF007B] border-dashed' : 'border-[#FF007B]'}`}
          style={{ 
            boxShadow: isMultiSelected ? 'none' : '0 0 0 1px rgba(255, 0, 123, 0.3)',
            zIndex: 10,
            pointerEvents: 'none',
            background: 'transparent'
          }}
        />
      )}

      {/* Text-editing border overlay */}
      {isSelected && isTextEditing && (
        <div 
          className="absolute inset-0 border rounded-sm border-blue-400 border-dashed"
          style={{ 
            boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.3)',
            zIndex: 10,
            pointerEvents: 'none',
            background: 'transparent'
          }}
        />
      )}
      
      {/* Draggable edge strips for CustomComponents (since iframe has pointerEvents: auto when selected) */}
      {isSelected && isDraggable && component.type === 'CustomComponent' && !isTextEditing && (
        <>
          {/* Top edge */}
          <div
            style={{
              position: 'absolute',
              top: -8,
              left: 0,
              right: 0,
              height: 16,
              cursor: 'move',
              zIndex: 15,
              background: 'transparent',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              onDragStart(e);
            }}
          />
          {/* Bottom edge */}
          <div
            style={{
              position: 'absolute',
              bottom: -8,
              left: 0,
              right: 0,
              height: 16,
              cursor: 'move',
              zIndex: 15,
              background: 'transparent',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              onDragStart(e);
            }}
          />
          {/* Left edge */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: -8,
              bottom: 0,
              width: 16,
              cursor: 'move',
              zIndex: 15,
              background: 'transparent',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              onDragStart(e);
            }}
          />
          {/* Right edge */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: -8,
              bottom: 0,
              width: 16,
              cursor: 'move',
              zIndex: 15,
              background: 'transparent',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              onDragStart(e);
            }}
          />
        </>
      )}

      {/* Drag overlay - REMOVED */}
      {/* {isSelected && isDraggable && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: 'transparent',
            zIndex: 20, // Higher than the border but lower than handles
            cursor: 'move',
            pointerEvents: component.type === 'TextBlock' ? 'none' : 'auto'
          }}
          onMouseDown={(e) => {
            // This handler might not fire for TextBlocks now due to pointerEvents: none,
            // but keep the logic for other component types.
            if (component.type !== 'TextBlock') {
              e.stopPropagation();
            }
            // Still call onDragStart
            onDragStart(e); 
          }}
        />
      )} */}
      
      {/* Rotation handle - only shown if rotatable and not multi-selected */}
      {isSelected && isRotatable && !isMultiSelected && !isTextEditing && (
        <>
          {/* First render the line extending up from the border */}
          <div 
            className="absolute top-0 left-1/2 w-px h-4 bg-[#FF007B] pointer-events-none"
            style={{ 
              transform: 'translate(-50%, -100%)',
              zIndex: 40
            }}
          />
          
          {/* Render knob higher above the line (-8px as specified) */}
          <div 
            data-rotation-handle="true" // ADDED DATA ATTRIBUTE
            className="absolute w-3 h-3 border-2 border-[#FF007B] rounded-full cursor-grab"
            style={{ 
              top: '-8px',
              left: '50%',
              transform: 'translate(-50%, -100%)',
              zIndex: 40,
              backgroundColor: 'white'
            }}
            onMouseDown={(e) => {

              handleRotationStart(e);
            }}
          />
        </>
      )}
      
      {/* Resize handles - only shown if resizable and not multi-selected */}
      {isSelected && onResize && isResizable && !isMultiSelected && !isTextEditing && (
        <>
          {/* Corner handles (NW, NE, SE, SW) */}
          <div 
            className="absolute top-0 left-0 w-3 h-3 border-2 border-[#FF007B] rounded-none cursor-nw-resize" 
            style={{ transform: 'translate(-50%, -50%)', zIndex: 40, backgroundColor: 'white' }}
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
          />
          <div 
            className="absolute top-0 right-0 w-3 h-3 border-2 border-[#FF007B] rounded-none cursor-ne-resize" 
            style={{ transform: 'translate(50%, -50%)', zIndex: 40, backgroundColor: 'white' }}
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
          />
          <div 
            className="absolute bottom-0 right-0 w-3 h-3 border-2 border-[#FF007B] rounded-none cursor-se-resize" 
            style={{ transform: 'translate(50%, 50%)', zIndex: 40, backgroundColor: 'white' }}
            onMouseDown={(e) => handleResizeStart(e, 'se')}
          />
          <div 
            className="absolute bottom-0 left-0 w-3 h-3 border-2 border-[#FF007B] rounded-none cursor-sw-resize" 
            style={{ transform: 'translate(-50%, 50%)', zIndex: 40, backgroundColor: 'white' }}
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
          />
          
          {/* Middle handles (N, E, S, W) */}
          <div 
            className="absolute top-0 left-1/2 w-3 h-3 border-2 border-[#FF007B] rounded-none cursor-n-resize" 
            style={{ transform: 'translate(-50%, -50%)', zIndex: 40, backgroundColor: 'white' }}
            onMouseDown={(e) => handleResizeStart(e, 'n')}
          />
          <div 
            className="absolute top-1/2 right-0 w-3 h-3 border-2 border-[#FF007B] rounded-none cursor-e-resize" 
            style={{ transform: 'translate(50%, -50%)', zIndex: 40, backgroundColor: 'white' }}
            onMouseDown={(e) => handleResizeStart(e, 'e')}
          />
          <div 
            className="absolute bottom-0 left-1/2 w-3 h-3 border-2 border-[#FF007B] rounded-none cursor-s-resize" 
            style={{ transform: 'translate(-50%, 50%)', zIndex: 40, backgroundColor: 'white' }}
            onMouseDown={(e) => handleResizeStart(e, 's')}
          />
          <div 
            className="absolute top-1/2 left-0 w-3 h-3 border-2 border-[#FF007B] rounded-none cursor-w-resize" 
            style={{ transform: 'translate(-50%, -50%)', zIndex: 40, backgroundColor: 'white' }}
            onMouseDown={(e) => handleResizeStart(e, 'w')}
          />
        </>
      )}
    </div>
  );
};

export default SelectionBoundingBox;