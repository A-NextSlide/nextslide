import { useState, useRef, useCallback, useEffect } from 'react';
import { ComponentInstance } from '@/types/components';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useEditorStore } from '@/stores/editorStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { sendComponentLayoutUpdate } from '@/utils/componentSyncUtils';
import { findNearestSnapPoint, isStillConnected } from '@/utils/lineSnapUtils';

interface UseLinesDragProps {
  component: ComponentInstance;
  isDraggable: boolean;
  isSelected: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  slideSize: { width: number; height: number };
  updateComponent: (id: string, updates: Partial<ComponentInstance>, skipHistory: boolean) => void;
}

interface UseLinesDragReturn {
  isDragging: boolean;
  draggedEndpoint: 'start' | 'end' | 'line' | null;
  hoveredComponentId: string | null;
  cursorPosition: { x: number; y: number } | null;
  handleLineMouseDown: (e: React.MouseEvent) => void;
  handleStartMouseDown: (e: React.MouseEvent) => void;
  handleEndMouseDown: (e: React.MouseEvent) => void;
}

export function useLinesDrag({
  component,
  isDraggable,
  isSelected,
  containerRef,
  slideSize,
  updateComponent,
}: UseLinesDragProps): UseLinesDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedEndpoint, setDraggedEndpoint] = useState<'start' | 'end' | 'line' | null>(null);
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const originalStartPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const originalEndPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mouseStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  const { slideId, activeComponents } = useActiveSlide();
  const historyStore = useHistoryStore.getState();
  const editorStore = useEditorStore.getState();
  const isSnapEnabled = useEditorSettingsStore(state => state.isSnapEnabled);
  
  const startDrag = useCallback((e: React.MouseEvent, endpoint: 'start' | 'end' | 'line') => {
    if (!isDraggable || !containerRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const slideElement = containerRef.current.closest('.slide-container');
    if (!slideElement) return;
    
    const rect = slideElement.getBoundingClientRect();
    mouseStartRef.current = { 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top 
    };
    
    // Store original positions
    originalStartPointRef.current = component.props.startPoint || { x: 100, y: 100 };
    originalEndPointRef.current = component.props.endPoint || { x: 300, y: 300 };
    
    // Save to history
    if (slideId) {
      try {
        const currentComponents = editorStore.getDraftComponents(slideId);
        historyStore.addToHistory(slideId, currentComponents);
      } catch (error) {
        // Silently handle error
      }
    }
    
    setDraggedEndpoint(endpoint);
    setIsDragging(true);
  }, [component, isDraggable, containerRef, slideId, historyStore, editorStore]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggedEndpoint || !containerRef.current) return;
    
    const slideElement = containerRef.current.closest('.slide-container');
    if (!slideElement) return;
    
    const rect = slideElement.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    // Convert to slide coordinates - direct position where cursor is
    const slideX = (currentX / rect.width) * slideSize.width;
    const slideY = (currentY / rect.height) * slideSize.height;
    
    // Update cursor position for visual feedback
    setCursorPosition({ x: slideX, y: slideY });
    
    let updates: any = {};
    let currentHoveredId: string | null = null;
    
    if (draggedEndpoint === 'start' || draggedEndpoint === 'end') {
      // Check for nearby components
      const snapResult = findNearestSnapPoint(
        { x: slideX, y: slideY },
        activeComponents.filter(c => c.id !== component.id && c.type !== 'Lines' && c.type !== 'Line' && c.type !== 'line')
      );
      
      if (snapResult.snapped && snapResult.connection) {
        currentHoveredId = snapResult.connection.componentId;
      }
      
      if (draggedEndpoint === 'start') {
        if (isSnapEnabled && snapResult.snapped) {
          updates.startPoint = {
            x: snapResult.point.x,
            y: snapResult.point.y,
            connection: snapResult.connection
          };
        } else {
          // Check if we should disconnect from a previously connected component
          const currentConnection = component.props.startPoint?.connection;
          if (currentConnection && !isStillConnected(
            { x: slideX, y: slideY },
            currentConnection.componentId,
            currentConnection.side,
            activeComponents
          )) {
            // Disconnect
            updates.startPoint = {
              x: slideX,
              y: slideY,
              connection: undefined
            };
          } else {
            // Normal drag without snapping
            updates.startPoint = {
              x: slideX,
              y: slideY,
              connection: currentConnection
            };
          }
        }
      } else if (draggedEndpoint === 'end') {
        if (isSnapEnabled && snapResult.snapped) {
          updates.endPoint = {
            x: snapResult.point.x,
            y: snapResult.point.y,
            connection: snapResult.connection
          };
        } else {
          // Check if we should disconnect from a previously connected component
          const currentConnection = component.props.endPoint?.connection;
          if (currentConnection && !isStillConnected(
            { x: slideX, y: slideY },
            currentConnection.componentId,
            currentConnection.side,
            activeComponents
          )) {
            // Disconnect
            updates.endPoint = {
              x: slideX,
              y: slideY,
              connection: undefined
            };
          } else {
            // Normal drag without snapping
            updates.endPoint = {
              x: slideX,
              y: slideY,
              connection: currentConnection
            };
          }
        }
      }
    } else if (draggedEndpoint === 'line') {
      // Move both endpoints by the delta
      const startSlideX = (mouseStartRef.current.x / rect.width) * slideSize.width;
      const startSlideY = (mouseStartRef.current.y / rect.height) * slideSize.height;
      const deltaX = slideX - startSlideX;
      const deltaY = slideY - startSlideY;
      
      updates.startPoint = {
        x: originalStartPointRef.current.x + deltaX,
        y: originalStartPointRef.current.y + deltaY,
        connection: component.props.startPoint?.connection
      };
      updates.endPoint = {
        x: originalEndPointRef.current.x + deltaX,
        y: originalEndPointRef.current.y + deltaY,
        connection: component.props.endPoint?.connection
      };
    }
    
    // Update hovered component
    setHoveredComponentId(currentHoveredId);
    
    // Update component
    updateComponent(component.id, {
      props: {
        ...component.props,
        ...updates
      }
    }, true);
    
    // Send WebSocket update
    if (slideId) {
      sendComponentLayoutUpdate(
        component.id,
        slideId,
        {
          position: component.props.position || { x: 0, y: 0 },
          size: component.props.size,
          rotation: component.props.rotation
        },
        true
      );
    }
  }, [isDragging, draggedEndpoint, containerRef, slideSize, component, updateComponent, slideId, isSnapEnabled, activeComponents]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    setDraggedEndpoint(null);
    setHoveredComponentId(null);
    setCursorPosition(null);
    
    // Send final WebSocket update
    if (slideId) {
      sendComponentLayoutUpdate(
        component.id,
        slideId,
        {
          position: component.props.position || { x: 0, y: 0 },
          size: component.props.size,
          rotation: component.props.rotation
        },
        false
      );
    }
  }, [isDragging, component, slideId]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleStartMouseDown = useCallback((e: React.MouseEvent) => {
    startDrag(e, 'start');
  }, [startDrag]);

  const handleEndMouseDown = useCallback((e: React.MouseEvent) => {
    startDrag(e, 'end');
  }, [startDrag]);

  const handleLineMouseDown = useCallback((e: React.MouseEvent) => {
    startDrag(e, 'line');
  }, [startDrag]);

  return {
    isDragging,
    draggedEndpoint,
    hoveredComponentId,
    cursorPosition,
    handleLineMouseDown,
    handleStartMouseDown,
    handleEndMouseDown
  };
} 