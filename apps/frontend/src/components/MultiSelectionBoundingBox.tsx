import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import { ComponentInstance } from '@/types/components';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { useEditorStore } from '@/stores/editorStore';
import { useHistoryStore } from '@/stores/historyStore';

interface MultiSelectionBoundingBoxProps {
  selectedComponents: ComponentInstance[];
  slideSize?: { width: number; height: number };
  slideId?: string;
  isEditing?: boolean;
}

const MultiSelectionBoundingBox: React.FC<MultiSelectionBoundingBoxProps> = ({
  selectedComponents,
  slideSize = { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT },
  slideId = '',
  isEditing = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const startMousePosRef = useRef({ x: 0, y: 0 });
  
  const { updateDraftComponent } = useEditorStore();
  const { startTransientOperation } = useHistoryStore();
  
  // Track component position updates for real-time bounding box updates
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  
  useEffect(() => {
    const handlePositionUpdate = (event: CustomEvent) => {
      const { componentId } = event.detail;
      // Force re-render if one of our selected components moved
      if (selectedComponents.some(c => c.id === componentId)) {
        forceUpdate();
      }
    };
    
    document.addEventListener('component-position-updated', handlePositionUpdate as EventListener);
    return () => {
      document.removeEventListener('component-position-updated', handlePositionUpdate as EventListener);
    };
  }, [selectedComponents]);
  
  // Calculate bounding box for all selected components
  const boundingBox = useMemo(() => {
    if (selectedComponents.length === 0) return null;
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    selectedComponents.forEach(component => {
      const x = component.props.position?.x || 0;
      const y = component.props.position?.y || 0;
      const width = component.props.size?.width || component.props.width || 100;
      const height = component.props.size?.height || component.props.height || 100;
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    });
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }, [selectedComponents, forceUpdate]); // Add forceUpdate to trigger recalculation
  
  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!isEditing || !slideId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const slideElement = containerRef.current?.closest('.slide-container');
    if (!slideElement) return;
    
    const slideRect = slideElement.getBoundingClientRect();
    const displayToActualRatioX = slideRect.width / slideSize.width;
    const displayToActualRatioY = slideRect.height / slideSize.height;
    
    isDraggingRef.current = true;
    startMousePosRef.current = { x: e.clientX, y: e.clientY };
    
    // Store initial positions of all selected components
    dragStartPositionsRef.current.clear();
    selectedComponents.forEach(comp => {
      dragStartPositionsRef.current.set(comp.id, {
        x: comp.props.position?.x || 0,
        y: comp.props.position?.y || 0
      });
    });
    
    // Start history transaction
    startTransientOperation(selectedComponents[0].id, slideId);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      const displayDeltaX = (moveEvent.clientX - startMousePosRef.current.x);
      const displayDeltaY = (moveEvent.clientY - startMousePosRef.current.y);
      const deltaX = displayDeltaX / displayToActualRatioX;
      const deltaY = displayDeltaY / displayToActualRatioY;

      // Zero-lag visual move of the bounding box itself in display pixels
      if (containerRef.current) {
        // Compensate for parent scale (zoom + edit scale) so on-screen motion matches cursor
        const parentRect = slideElement.getBoundingClientRect();
        const parentScaleX = parentRect.width / ((slideElement as HTMLElement).offsetWidth || 1);
        const parentScaleY = parentRect.height / ((slideElement as HTMLElement).offsetHeight || 1);
        const normalizedDx = displayDeltaX / (parentScaleX || 1);
        const normalizedDy = displayDeltaY / (parentScaleY || 1);
        containerRef.current.style.setProperty('--drag-x', `${normalizedDx}px`);
        containerRef.current.style.setProperty('--drag-y', `${normalizedDy}px`);
        containerRef.current.style.transform = `translateX(var(--drag-x, 0px)) translateY(var(--drag-y, 0px))`;
      }
      
      // Update all selected components
      dragStartPositionsRef.current.forEach((startPos, componentId) => {
        const newX = Math.round(startPos.x + deltaX);
        const newY = Math.round(startPos.y + deltaY);
        
        updateDraftComponent(slideId, componentId, {
          props: {
            position: { x: newX, y: newY }
          }
        }, true); // Skip history for intermediate updates
        
        // Dispatch position update event for real-time updates
        const event = new CustomEvent('component-position-updated', {
          detail: {
            componentId,
            position: { x: newX, y: newY },
            slideId
          }
        });
        document.dispatchEvent(event);
      });
    };
    
    const handleMouseUp = (mouseEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      isDraggingRef.current = false;
      
      // Get the display ratio from the container
      const slideElement = containerRef.current?.closest('.slide-container');
      if (!slideElement) return;
      
      const slideRect = slideElement.getBoundingClientRect();
      const displayToActualRatioX = slideRect.width / slideSize.width;
      const displayToActualRatioY = slideRect.height / slideSize.height;
      
      // Finalize positions
      const finalDeltaX = (mouseEvent.clientX - startMousePosRef.current.x) / displayToActualRatioX;
      const finalDeltaY = (mouseEvent.clientY - startMousePosRef.current.y) / displayToActualRatioY;
      
      dragStartPositionsRef.current.forEach((startPos, componentId) => {
        const finalX = Math.round(startPos.x + finalDeltaX);
        const finalY = Math.round(startPos.y + finalDeltaY);
        
        updateDraftComponent(slideId, componentId, {
          props: {
            position: { x: finalX, y: finalY }
          }
        }, false); // Don't skip history for final update
      });
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Reset visual transform on the bounding box
      if (containerRef.current) {
        containerRef.current.style.removeProperty('--drag-x');
        containerRef.current.style.removeProperty('--drag-y');
        containerRef.current.style.transform = '';
      }
      
      // Dispatch drag end event
      document.dispatchEvent(new CustomEvent('component:dragend'));
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Dispatch drag start event
    document.dispatchEvent(new CustomEvent('component:dragstart'));
  }, [isEditing, slideId, selectedComponents, slideSize, updateDraftComponent, startTransientOperation]);
  
  if (!boundingBox || selectedComponents.length < 2) return null;
  
  // Convert to percentages for responsive positioning
  const xPercent = (boundingBox.x / slideSize.width) * 100;
  const yPercent = (boundingBox.y / slideSize.height) * 100;
  const widthPercent = (boundingBox.width / slideSize.width) * 100;
  const heightPercent = (boundingBox.height / slideSize.height) * 100;

  return (
    <div
      ref={containerRef}
      className="absolute"
      data-multi-selection-box="true"
      style={{
        left: `${xPercent}%`,
        top: `${yPercent}%`,
        width: `${widthPercent}%`,
        height: `${heightPercent}%`,
        border: '2px solid #FF007B',
        borderRadius: '4px',
        zIndex: 1000,
        cursor: isEditing ? 'move' : 'default',
        pointerEvents: isEditing ? 'auto' : 'none',
        backgroundColor: 'rgba(255, 0, 123, 0.05)', // Very subtle fill to ensure clicks are captured
        transformOrigin: 'top left' // Ensure consistent transform origin
      }}
      onMouseDown={handleDragStart}
    >
      {/* Corner handles for visual feedback - positioned with transform to ensure they stay at corners */}
      <div 
        className="absolute w-2 h-2 bg-[#FF007B] rounded-full pointer-events-none" 
        style={{ 
          top: '-4px', 
          left: '-4px',
          transform: 'translate(0, 0)' 
        }} 
      />
      <div 
        className="absolute w-2 h-2 bg-[#FF007B] rounded-full pointer-events-none" 
        style={{ 
          top: '-4px', 
          right: '-4px',
          transform: 'translate(0, 0)' 
        }} 
      />
      <div 
        className="absolute w-2 h-2 bg-[#FF007B] rounded-full pointer-events-none" 
        style={{ 
          bottom: '-4px', 
          left: '-4px',
          transform: 'translate(0, 0)' 
        }} 
      />
      <div 
        className="absolute w-2 h-2 bg-[#FF007B] rounded-full pointer-events-none" 
        style={{ 
          bottom: '-4px', 
          right: '-4px',
          transform: 'translate(0, 0)' 
        }} 
      />
      
      {/* Selection count badge */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#FF007B] text-white text-xs px-2 py-0.5 rounded pointer-events-none">
        {selectedComponents.length} selected
      </div>
    </div>
  );
};

export default MultiSelectionBoundingBox; 