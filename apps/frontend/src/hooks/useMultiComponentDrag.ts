import { useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { ComponentInstance } from '@/types/components';

interface UseMultiComponentDragProps {
  slideId: string;
  isEditing: boolean;
  selectedComponentIds: string[];
  components: ComponentInstance[];
}

export function useMultiComponentDrag({
  slideId,
  isEditing,
  selectedComponentIds,
  components
}: UseMultiComponentDragProps) {
  const { updateDraftComponent } = useEditorStore();
  
  const isDraggingRef = useRef(false);
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const startMousePosRef = useRef({ x: 0, y: 0 });

  const handleMultiDragStart = useCallback((e: MouseEvent, componentId: string) => {
    if (!isEditing || selectedComponentIds.length === 0) return;
    
    // Check if the clicked component is in the selection
    if (!selectedComponentIds.includes(componentId)) return;
    
    isDraggingRef.current = true;
    startMousePosRef.current = { x: e.clientX, y: e.clientY };
    
    // Store initial positions of all selected components
    dragStartPositionsRef.current.clear();
    selectedComponentIds.forEach(id => {
      const component = components.find(c => c.id === id);
      if (component) {
        dragStartPositionsRef.current.set(id, {
          x: component.props.position?.x || 0,
          y: component.props.position?.y || 0
        });
      }
    });
    
    // Prevent text selection
    e.preventDefault();
    
    // Add global mouse event listeners
    document.addEventListener('mousemove', handleMultiDragMove);
    document.addEventListener('mouseup', handleMultiDragEnd);
    
    // Dispatch drag start event
    document.dispatchEvent(new CustomEvent('multicomponent:dragstart', {
      detail: { componentIds: selectedComponentIds }
    }));
  }, [isEditing, selectedComponentIds, components]);

  const handleMultiDragMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    
    const deltaX = e.clientX - startMousePosRef.current.x;
    const deltaY = e.clientY - startMousePosRef.current.y;
    
    // Update positions of all selected components
    dragStartPositionsRef.current.forEach((startPos, componentId) => {
      updateDraftComponent(slideId, componentId, {
        props: {
          position: {
            x: startPos.x + deltaX,
            y: startPos.y + deltaY
          }
        }
      }, true); // Skip history for intermediate updates
    });
  }, [slideId, updateDraftComponent]);

  const handleMultiDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    
    isDraggingRef.current = false;
    
    // Remove global event listeners
    document.removeEventListener('mousemove', handleMultiDragMove);
    document.removeEventListener('mouseup', handleMultiDragEnd);
    
    // Dispatch drag end event
    document.dispatchEvent(new CustomEvent('multicomponent:dragend', {
      detail: { componentIds: selectedComponentIds }
    }));
    
    // Clear stored positions
    dragStartPositionsRef.current.clear();
  }, [handleMultiDragMove, selectedComponentIds]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isDraggingRef.current) {
        handleMultiDragEnd();
      }
    };
  }, [handleMultiDragEnd]);

  return {
    handleMultiDragStart,
    isMultiDragging: isDraggingRef.current
  };
} 