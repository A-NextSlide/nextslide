import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ComponentInstance } from '@/types/components';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { useHistoryStore } from '@/stores/historyStore';
import { calculateSnap, SnapGuideInfo } from '@/utils/snapUtils';
import { sendComponentLayoutUpdate } from '@/utils/componentSyncUtils';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { updateConnectedLines } from '@/utils/lineSnapUtils';

interface UseComponentResizeProps {
  component: ComponentInstance;
  slideSize: { width: number; height: number };
  allComponents: ComponentInstance[];
  updateComponent: (id: string, updates: Partial<ComponentInstance>, skipHistory: boolean) => void;
  // Callback to update snap guides in the parent renderer
  setSnapGuides: (guides: SnapGuideInfo[]) => void; 
}

/**
 * Hook to manage the resizing interaction for a component,
 * including snapping.
 */
export const useComponentResize = ({ 
  component, 
  slideSize, 
  allComponents, 
  updateComponent, 
  setSnapGuides 
}: UseComponentResizeProps) => {
  const [isResizing, setIsResizing] = useState(false);
  const [localSnapGuides, setLocalSnapGuides] = useState<SnapGuideInfo[]>([]);
  const [visualResizeState, setVisualResizeState] = useState<{ width: number; height: number; position: { x: number; y: number } } | null>(null);
  
  // Store component ref to avoid stale closures
  const componentRef = useRef(component);
  componentRef.current = component;
  
  // Store all components ref
  const allComponentsRef = useRef(allComponents);
  allComponentsRef.current = allComponents;
  
  // Performance optimization refs
  const resizeStartedRef = useRef<boolean>(false);
  const lastUpdateTimeRef = useRef<number>(0);
  const pendingUpdateRef = useRef<any>(null);
  const latestValuesRef = useRef<{ width: number; height: number; position: { x: number; y: number } } | null>(null);
  
  // Get settings from store
  const isSnapEnabled = useEditorSettingsStore(state => state.isSnapEnabled);
  const startTransientOperation = useHistoryStore(state => state.startTransientOperation);
  const endTransientOperation = useHistoryStore(state => state.endTransientOperation);
  
  // Get slide ID
  const { slideId } = useActiveSlide();
  
  // Apply pending update if any
  useEffect(() => {
    if (pendingUpdateRef.current && latestValuesRef.current && !resizeStartedRef.current) {
      cancelAnimationFrame(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
      latestValuesRef.current = null;
    }
  }, [isResizing]);

  const handleResize = useCallback((width: number, height: number, position?: { x: number; y: number }) => {
    // Special signal to end resize (-1, -1)
    if (width === -1 && height === -1) {
      if (resizeStartedRef.current && slideId) {
        const currentComponent = componentRef.current;
        
        // Cancel any pending update
        if (pendingUpdateRef.current) {
          cancelAnimationFrame(pendingUpdateRef.current);
          pendingUpdateRef.current = null;
        }
        
        // Clear snap guides
        setLocalSnapGuides([]);
        setSnapGuides([]);
        
        // Clear visual state
        setVisualResizeState(null);
        
        // Get the current state of the component for final update
        const finalValues = latestValuesRef.current || {
          width: currentComponent.props.width || 100,
          height: currentComponent.props.height || 100,
          position: currentComponent.props.position || { x: 0, y: 0 }
        };
        
        // Apply final update with history
        updateComponent(currentComponent.id, {
          props: {
            ...currentComponent.props,
            position: finalValues.position,
            width: finalValues.width,
            height: finalValues.height
          }
        }, false); // Don't skip history for final update
        
        // End transient operation
        endTransientOperation(slideId, currentComponent.id);
        
        // Update connected lines
        updateConnectedLines(currentComponent.id, allComponentsRef.current, updateComponent);
        
        // Send layout update
        sendComponentLayoutUpdate(
          currentComponent.id,
          slideId,
          {
            position: finalValues.position,
            size: { width: finalValues.width, height: finalValues.height },
            rotation: currentComponent.props.rotation
          },
          false
        );
        
        setIsResizing(false);
        resizeStartedRef.current = false;
        latestValuesRef.current = null;
        
        // For charts, clear global resize flag
        if (currentComponent.type === 'Chart' && typeof window !== 'undefined') {
          (window as any).__isResizingCharts = false;
          (window as any).__currentResizedChart = null;
          document.body.classList.remove('charts-resizing');
        }
        
        // Dispatch resize end event
        if (typeof document !== 'undefined') {
          const resizeEndEvent = new CustomEvent('component:resizeend', {
            bubbles: true,
            detail: {
              componentId: currentComponent.id,
              componentType: currentComponent.type,
              finalPosition: finalValues.position,
              finalSize: { width: finalValues.width, height: finalValues.height }
            }
          });
          document.dispatchEvent(resizeEndEvent);
        }
      }
      return;
    }
    
    const currentComponent = componentRef.current;
    
    // Handle resize start
    if (!resizeStartedRef.current && slideId) {
      resizeStartedRef.current = true;
      setIsResizing(true);
      
      // Start transient operation
      startTransientOperation(slideId, currentComponent.id);
      
      // For charts, set global resize flag to disable animations
      if (currentComponent.type === 'Chart' && typeof window !== 'undefined') {
        (window as any).__isResizingCharts = true;
        (window as any).__currentResizedChart = currentComponent.id;
        document.body.classList.add('charts-resizing');
      }
      
      // Dispatch resize start event
      if (typeof document !== 'undefined') {
        const resizeStartEvent = new CustomEvent('component:resizestart', {
          bubbles: true,
          detail: {
            componentId: currentComponent.id,
            componentType: currentComponent.type,
            position: currentComponent.props.position
          }
        });
        document.dispatchEvent(resizeStartEvent);
      }
    }
    
    // Ensure minimum size
    let newWidth = Math.max(20, Math.round(width));
    let newHeight = Math.max(20, Math.round(height));
    let newPosition = position ? { 
      x: Math.round(position.x), 
      y: Math.round(position.y) 
    } : currentComponent.props.position || { x: 0, y: 0 };
    
    // Apply snapping if enabled and position is provided
    if (isSnapEnabled && position) {
      const tempComponent = {
        ...currentComponent,
        props: {
          ...currentComponent.props,
          width: newWidth,
          height: newHeight,
          position: newPosition
        }
      };
      
      const snapResult = calculateSnap(tempComponent, allComponentsRef.current, newPosition, slideSize);
      
      if (snapResult.guides.length > 0) {
        setLocalSnapGuides(snapResult.guides);
        setSnapGuides(snapResult.guides);
        newPosition = {
          x: Math.round(snapResult.snappedPosition.x),
          y: Math.round(snapResult.snappedPosition.y)
        };
      } else {
        setLocalSnapGuides([]);
        setSnapGuides([]);
      }
    } else {
      setLocalSnapGuides([]);
      setSnapGuides([]);
    }
    
    // Store latest values
    latestValuesRef.current = { width: newWidth, height: newHeight, position: newPosition };
    
    // Update visual state immediately for smooth feedback
    setVisualResizeState({ width: newWidth, height: newHeight, position: newPosition });
    
    // Throttle actual component updates to 30fps (reduced from 60fps)
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
    
    if (timeSinceLastUpdate >= 33) { // 33ms = ~30fps
      lastUpdateTimeRef.current = now;
      
      // Apply the update
      updateComponent(currentComponent.id, {
        props: {
          ...currentComponent.props,
          position: newPosition,
          width: newWidth,
          height: newHeight
        }
      }, true); // Skip history during continuous resize
    } else if (!pendingUpdateRef.current) {
      // Schedule an update for the next frame
      pendingUpdateRef.current = requestAnimationFrame(() => {
        pendingUpdateRef.current = null;
        if (latestValuesRef.current && resizeStartedRef.current) {
          const { width: latestWidth, height: latestHeight, position: latestPosition } = latestValuesRef.current;
          lastUpdateTimeRef.current = Date.now();
          
          updateComponent(currentComponent.id, {
            props: {
              ...currentComponent.props,
              position: latestPosition,
              width: latestWidth,
              height: latestHeight
            }
          }, true);
        }
      });
    }
    
  }, [slideSize, updateComponent, isSnapEnabled, setSnapGuides, slideId, startTransientOperation, endTransientOperation]);

  return {
    isResizing,
    handleResize,
    localSnapGuides,
    visualResizeState // Add visual state to return value
  };
}; 