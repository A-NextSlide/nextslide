import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ComponentInstance } from '@/types/components';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useEditorStore } from '@/stores/editorStore';
import { calculateSnap, SnapGuideInfo } from '@/utils/snapUtils';
import { sendComponentLayoutUpdate } from '@/utils/componentSyncUtils';
import { updateConnectedLines } from '@/utils/lineSnapUtils';

interface UseComponentDragProps {
  component: ComponentInstance;
  componentPosition: { x: number; y: number; };
  isDraggable: boolean;
  isSelected: boolean;
  isTextEditing: boolean;
  containerRef: React.RefObject<HTMLElement>;
  slideSize: { width: number; height: number };
  allComponents: ComponentInstance[];
  onSelect: (id: string) => void;
  updateComponent: (id: string, updates: Partial<ComponentInstance>, skipHistory: boolean) => void;
  slideId?: string | null;
}

interface UseComponentDragReturn {
  isDragging: boolean;
  visualDragOffset: { x: number; y: number } | null;
  snapGuides: SnapGuideInfo[];
  handleDragStart: (e: React.MouseEvent) => void;
  didJustDrag: React.MutableRefObject<boolean>;
}

/**
 * Optimized hook to manage component dragging with improved performance
 */
export function useComponentDrag({
  component,
  componentPosition,
  isDraggable,
  isSelected,
  isTextEditing,
  containerRef,
  slideSize,
  allComponents,
  onSelect,
  updateComponent,
  slideId: slideIdProp,
}: UseComponentDragProps): UseComponentDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [visualDragOffset, setVisualDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuideInfo[]>([]);
  
  const didJustDragRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const slideRectRef = useRef<DOMRect | null>(null);
  const displayToActualRatioRef = useRef<{ x: number; y: number }>({ x: 1, y: 1 });
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const slideElementRef = useRef<HTMLElement | null>(null);
  const slideOffsetSizeRef = useRef<{ width: number; height: number }>({ width: 1, height: 1 });
  
  // Performance optimization: Throttle only websocket updates
  const WEBSOCKET_THROTTLE = 50; // 20 updates per second max
  const lastWsUpdateRef = useRef(0);
  const lastSnapUpdateRef = useRef(0);
  const lastLinesUpdateRef = useRef(0);
  const lastMultiUpdateRef = useRef(0);

  // Helper to avoid unnecessary snap guide updates
  const prevSnapGuidesRef = useRef<SnapGuideInfo[]>([]);
  const areGuidesEqual = (a: SnapGuideInfo[], b: SnapGuideInfo[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const ga = a[i];
      const gb = b[i];
      if (ga.type !== gb.type) return false;
      if (Math.abs(ga.position - gb.position) > 0.5) return false;
    }
    return true;
  };
  
  const isSnapEnabled = useEditorSettingsStore(state => state.isSnapEnabled);
  const slideId = slideIdProp || null;
  const historyStore = useHistoryStore.getState();
  const editorStore = useEditorStore.getState();
  
  // PERF: Use derived booleans instead of subscribing to the raw Set.
  // Subscribing to the Set causes re-renders on every selection change
  // because selectComponent() creates a new Set reference via new Set(...).
  // Use getState() for iteration inside event handlers where current value is needed.
  const hasMultipleSelected = useEditorStore(state => state.selectedComponentIds.size > 1);
  const isThisComponentSelected = useEditorStore(state => state.selectedComponentIds.has(component.id));
  const isInMultiSelection = hasMultipleSelected && isThisComponentSelected;
  const isDraggingGroup = component.type === 'Group';
  
  // Track initial positions for multi-drag
  const multiDragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    const globalTextEditing = useEditorSettingsStore.getState().isTextEditing;
    if (!isDraggable || isTextEditing || globalTextEditing || !containerRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    
    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    
    // Add drag class to body for global performance optimizations
    document.body.classList.add('dragging-component');
    // Notify others (like multi-selection bounding box) that a drag started
    if (typeof document !== 'undefined') {
      const evt = new CustomEvent('selection:drag-start', {
        bubbles: true,
        detail: { componentId: component.id, slideId }
      });
      document.dispatchEvent(evt);
    }

    const slideElement = containerRef.current.closest('.slide-container');
    if (!slideElement) return;

    slideRectRef.current = slideElement.getBoundingClientRect();
    slideElementRef.current = slideElement as HTMLElement;
    // offsetWidth/offsetHeight are not affected by CSS transforms (scale), use them to derive parent scale
    slideOffsetSizeRef.current = {
      width: (slideElement as HTMLElement).offsetWidth || 1,
      height: (slideElement as HTMLElement).offsetHeight || 1,
    };
    displayToActualRatioRef.current = {
      x: slideRectRef.current.width / slideSize.width,
      y: slideRectRef.current.height / slideSize.height,
    };

    dragStartMouseRef.current = { x: e.clientX, y: e.clientY };
    dragStartPosRef.current = component.props.position || { x: 0, y: 0 };
    dragOffsetRef.current = { x: 0, y: 0 };

    // Initialize CSS variables for zero-lag transform
    if (containerRef.current) {
      const el = containerRef.current as HTMLElement;
      el.style.setProperty('--drag-x', `0px`);
      el.style.setProperty('--drag-y', `0px`);
      // Ensure transform uses CSS vars immediately on drag start
      const rotation = (component.props.rotation || 0);
      el.style.transform = `translateX(var(--drag-x, 0px)) translateY(var(--drag-y, 0px)) rotate(${rotation}deg)`;
    }

    // Only select if not already selected and not part of multi-selection
    if (onSelect && !isSelected && !isInMultiSelection) {
      onSelect(component.id);
    }

    // DEFERRED: Move history tracking to next microtask for instant first drag
    // Using Promise.resolve() is faster than requestAnimationFrame
    if (slideId) {
      Promise.resolve().then(() => {
        historyStore.startTransientOperation(component.id, slideId);
      });
    }
    
    // Store positions for multi-drag if needed
    if (isInMultiSelection || component.type === 'Group') {
      multiDragStartPositions.current.clear();
      const slideComponents = editorStore.getDraftComponents(slideId || '');
      
      if (isInMultiSelection) {
        // Store positions of all selected components
        // Use getState() for iteration - no need to subscribe to the Set
        const currentSelectedIds = useEditorStore.getState().selectedComponentIds;
        currentSelectedIds.forEach(id => {
          const comp = slideComponents.find(c => c.id === id);
          if (comp?.props.position) {
            multiDragStartPositions.current.set(id, { ...comp.props.position });
          }
        });
      } else if (component.type === 'Group') {
        // Store positions of all children
        const childIds = component.props.children || [];
        childIds.forEach((childId: string) => {
          const child = slideComponents.find(c => c.id === childId);
          if (child?.props.position) {
            multiDragStartPositions.current.set(child.id, { ...child.props.position });
          }
        });
        multiDragStartPositions.current.set(component.id, { ...dragStartPosRef.current });
      }
    }
    
    setIsDragging(true);

    // Dispatch simplified drag start event
    if (typeof document !== 'undefined') {
      // For charts, disable animations globally
      if (component.type === 'Chart') {
        document.body.classList.add('charts-dragging');
        if (typeof window !== 'undefined') {
          (window as any).__isDraggingCharts = true;
          (window as any).__chartAnimationsEnabled = false;
        }
      }
      
      // Emit standardized selection drag event for overlays to sync
      const dragStartEvent = new CustomEvent('selection:drag-start', {
        bubbles: true,
        detail: {
          componentId: component.id,
          componentType: component.type,
          position: dragStartPosRef.current
        }
      });
      document.dispatchEvent(dragStartEvent);
    }

  }, [
    component.id,
    component.type,
    component.props.position,
    component.props.parentId,
    component.props.children,
    containerRef,
    isDraggable,
    isSelected,
    isTextEditing,
    slideSize,
    slideId,
    onSelect,
    isInMultiSelection
  ]);

  const handleMouseMove = useCallback((moveEvent: MouseEvent) => {
    if (!isDragging || !slideRectRef.current) return;
      const now = Date.now();
      
      // Calculate movement
      const deltaX = moveEvent.clientX - dragStartMouseRef.current.x;
      const deltaY = moveEvent.clientY - dragStartMouseRef.current.y;
      const actualDeltaX = deltaX / displayToActualRatioRef.current.x;
      const actualDeltaY = deltaY / displayToActualRatioRef.current.y;

      const newPosX = dragStartPosRef.current.x + actualDeltaX;
      const newPosY = dragStartPosRef.current.y + actualDeltaY;

      let finalX = newPosX;
      let finalY = newPosY;
      let guides: SnapGuideInfo[] = [];

      // Apply snapping only for single components (not groups)
      if (isSnapEnabled && !isInMultiSelection && component.type !== 'Group') {
        const snapResult = calculateSnap(
          component,
          allComponents,
          { x: newPosX, y: newPosY },
          slideSize
        );
        if (snapResult.guides.length > 0 && snapResult.snappedPosition) {
          finalX = snapResult.snappedPosition.x;
          finalY = snapResult.snappedPosition.y;
          guides = snapResult.guides;
        }
      }

      // Update snap guides at most 60fps and only if changed
      if (Date.now() - lastSnapUpdateRef.current > 16) {
        if (!areGuidesEqual(prevSnapGuidesRef.current, guides)) {
          setSnapGuides(guides);
          prevSnapGuidesRef.current = guides;
        }
        lastSnapUpdateRef.current = Date.now();
      }
      
      // Keep full precision during drag - NO ROUNDING
      dragOffsetRef.current = {
        x: finalX - dragStartPosRef.current.x,
        y: finalY - dragStartPosRef.current.y,
      };

      // Update visual offset using CSS variables for zero-lag DOM updates (always apply to dragged element)
      if (containerRef.current && slideRectRef.current) {
        // Compensate for parent scaling so on-screen movement matches cursor, and include snap offset
        const parentScaleX = slideRectRef.current.width / (slideOffsetSizeRef.current.width || 1);
        const parentScaleY = slideRectRef.current.height / (slideOffsetSizeRef.current.height || 1);
        const displayDx = (dragOffsetRef.current.x * displayToActualRatioRef.current.x) / (parentScaleX || 1);
        const displayDy = (dragOffsetRef.current.y * displayToActualRatioRef.current.y) / (parentScaleY || 1);
        
        // Apply to the dragged component
        const el = containerRef.current as HTMLElement;
        el.style.setProperty('--drag-x', `${displayDx}px`);
        el.style.setProperty('--drag-y', `${displayDy}px`);
        // Keep transform string consistent in case other code overwrites it
        const rotation = (component.props.rotation || 0);
        const tf = el.style.transform || '';
        if (!tf.includes('var(--drag-x')) {
          el.style.transform = `translateX(var(--drag-x, 0px)) translateY(var(--drag-y, 0px)) rotate(${rotation}deg)`;
        }

        // ALSO apply to ALL other selected components if in multi-selection mode
        // This ensures visual sync for the whole group
        if (isInMultiSelection || isDraggingGroup) {
          // Use getState() for iteration - no subscription needed
          const currentSelectedIds = useEditorStore.getState().selectedComponentIds;
          currentSelectedIds.forEach(id => {
            if (id !== component.id) {
              const peerEl = document.querySelector(`[data-component-id="${id}"]`) as HTMLElement | null;
              if (peerEl) {
                peerEl.style.setProperty('--drag-x', `${displayDx}px`);
                peerEl.style.setProperty('--drag-y', `${displayDy}px`);
                // Ensure transform uses variables
                const peerRotation = peerEl.style.transform.match(/rotate\(([^)]+)\)/)?.[1] || '0deg';
                // Only update if not already set to use vars
                if (!peerEl.style.transform.includes('var(--drag-x')) {
                   peerEl.style.transform = `translateX(var(--drag-x, 0px)) translateY(var(--drag-y, 0px)) rotate(${peerRotation})`;
                }
              }
            }
          });
        }

        if (isDraggingGroup) {
          const childIds = (component.props.children as string[]) || [];
          childIds.forEach((childId) => {
            const childEl = document.querySelector(`[data-component-id="${childId}"]`) as HTMLElement | null;
            if (!childEl) return;
            childEl.style.setProperty('--drag-x', `${displayDx}px`);
            childEl.style.setProperty('--drag-y', `${displayDy}px`);
            const childRotation = childEl.style.transform.match(/rotate\(([^)]+)\)/)?.[1] || '0deg';
            if (!childEl.style.transform.includes('var(--drag-x')) {
              childEl.style.transform = `translateX(var(--drag-x, 0px)) translateY(var(--drag-y, 0px)) rotate(${childRotation})`;
            }
          });
        }
      }

      // Send WebSocket updates at a lower frequency
      if (slideId && now - lastWsUpdateRef.current > WEBSOCKET_THROTTLE) {
        const roundedFinalX = Math.round(finalX);
        const roundedFinalY = Math.round(finalY);
        
        sendComponentLayoutUpdate(
          component.id,
          slideId,
          {
            position: { x: roundedFinalX, y: roundedFinalY },
            size: component.props.size,
            rotation: component.props.rotation
          },
          true
        );
        
        lastWsUpdateRef.current = now;
      }

      // Broadcast visual drag offset for selection overlays with parent scale compensation (include snap)
      if (typeof document !== 'undefined' && slideRectRef.current) {
        const parentScaleX = slideRectRef.current.width / (slideOffsetSizeRef.current.width || 1);
        const parentScaleY = slideRectRef.current.height / (slideOffsetSizeRef.current.height || 1);
        const displayDx = (dragOffsetRef.current.x * displayToActualRatioRef.current.x) / (parentScaleX || 1);
        const displayDy = (dragOffsetRef.current.y * displayToActualRatioRef.current.y) / (parentScaleY || 1);
        const dragMoveEvent = new CustomEvent('selection:drag-move', {
          bubbles: true,
          detail: { dx: displayDx, dy: displayDy, componentId: component.id, slideId }
        });
        document.dispatchEvent(dragMoveEvent);
      }

      // Update connected lines for single component drag (throttle heavy work)
      if (!isInMultiSelection && component.type !== 'Group') {
        const nowLines = Date.now();
        if (nowLines - lastLinesUpdateRef.current > 50) {
          const tempComponents = allComponents.map(c =>
            c.id === component.id
              ? { ...c, props: { ...c.props, position: { x: Math.round(finalX), y: Math.round(finalY) } } }
              : c
          );
          updateConnectedLines(component.id, tempComponents, updateComponent);
          lastLinesUpdateRef.current = nowLines;
        }
      }
      
      // Handle multi-selection drag with batched updates (throttled)
      if (isInMultiSelection && slideId) {
        const nowMulti = Date.now();
        if (nowMulti - lastMultiUpdateRef.current > 50) {
          const updates: Array<{ id: string; position: { x: number; y: number } }> = [];
          multiDragStartPositions.current.forEach((startPos, compId) => {
            if (compId !== component.id) {
              updates.push({
                id: compId,
                position: {
                  x: Math.round(startPos.x + actualDeltaX),
                  y: Math.round(startPos.y + actualDeltaY)
                }
              });
            }
          });
          // Use getState() to avoid subscribing to updateDraftComponent
          const storeUpdateFn = useEditorStore.getState().updateDraftComponent;
          updates.forEach(({ id, position }) => {
            storeUpdateFn(slideId, id, {
              props: { position }
            }, true);
          });
          lastMultiUpdateRef.current = nowMulti;
        }
      }
      
      // Handle group drag similarly (throttled)
      // Group drag updates are handled when the Group component itself is dragged
  }, [
    isDragging,
    component,
    allComponents,
    slideSize,
    isSnapEnabled,
    slideId,
    updateComponent,
    isInMultiSelection
  ]);

  const handleDragEnd = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    e.preventDefault();
    e.stopPropagation();

    // Calculate final position
    const finalPosX = dragStartPosRef.current.x + dragOffsetRef.current.x;
    const finalPosY = dragStartPosRef.current.y + dragOffsetRef.current.y;
    const finalPosition = { x: Math.round(finalPosX), y: Math.round(finalPosY) };

    // Check if position actually changed
    const initialPos = component.props.position || { x: 0, y: 0 };
    const positionChanged = Math.round(initialPos.x) !== finalPosition.x || Math.round(initialPos.y) !== finalPosition.y;

    // ===================================================================
    // Step 1 (SYNCHRONOUS): Direct DOM position updates ONLY.
    // NO store updates here. The store update triggers a React re-render
    // via the context chain (store → ActiveSlideProvider → Slide → ComponentRenderer).
    // If that render happens before the rAF cleanup, React overwrites our direct
    // DOM styles with the old isDragging=true state, causing a visual flash.
    // By deferring ALL store/state changes to the rAF, we guarantee the browser
    // paints the correct final position first, then React catches up in the
    // next frame with all changes applied atomically.
    // ===================================================================
    if (containerRef.current) {
      const el = containerRef.current as HTMLElement;
      if (positionChanged) {
        const slideW = slideSize.width || 1;
        const slideH = slideSize.height || 1;
        el.style.left = `${(finalPosition.x / slideW) * 100}%`;
        el.style.top = `${(finalPosition.y / slideH) * 100}%`;
      }
      el.style.removeProperty('--drag-x');
      el.style.removeProperty('--drag-y');
      const rotation = (component.props.rotation || 0);
      el.style.transform = `rotate(${rotation}deg)`;
    }

    // Clear CSS variables for all other selected components (direct DOM only)
    if (isInMultiSelection || isDraggingGroup) {
      const currentSelectedIds = useEditorStore.getState().selectedComponentIds;
      currentSelectedIds.forEach(id => {
        if (id !== component.id) {
          const peerEl = document.querySelector(`[data-component-id="${id}"]`) as HTMLElement | null;
          if (peerEl) {
            if (positionChanged) {
              const startPos = multiDragStartPositions.current.get(id);
              if (startPos) {
                const peerFinalPos = {
                  x: Math.round(startPos.x + dragOffsetRef.current.x),
                  y: Math.round(startPos.y + dragOffsetRef.current.y)
                };
                const slideW = slideSize.width || 1;
                const slideH = slideSize.height || 1;
                peerEl.style.left = `${(peerFinalPos.x / slideW) * 100}%`;
                peerEl.style.top = `${(peerFinalPos.y / slideH) * 100}%`;
              }
            }
            peerEl.style.removeProperty('--drag-x');
            peerEl.style.removeProperty('--drag-y');
            const peerRotation = peerEl.style.transform.match(/rotate\(([^)]+)\)/)?.[1] || '0deg';
            peerEl.style.transform = `rotate(${peerRotation})`;
          }
        }
      });
    }

    if (isDraggingGroup) {
      const childIds = (component.props.children as string[]) || [];
      childIds.forEach((childId) => {
        const childEl = document.querySelector(`[data-component-id="${childId}"]`) as HTMLElement | null;
        if (!childEl) return;
        if (positionChanged) {
          const startPos = multiDragStartPositions.current.get(childId);
          if (startPos) {
            const childFinalPos = {
              x: Math.round(startPos.x + dragOffsetRef.current.x),
              y: Math.round(startPos.y + dragOffsetRef.current.y)
            };
            const slideW = slideSize.width || 1;
            const slideH = slideSize.height || 1;
            childEl.style.left = `${(childFinalPos.x / slideW) * 100}%`;
            childEl.style.top = `${(childFinalPos.y / slideH) * 100}%`;
          }
        }
        childEl.style.removeProperty('--drag-x');
        childEl.style.removeProperty('--drag-y');
        const childRotation = childEl.style.transform.match(/rotate\(([^)]+)\)/)?.[1] || '0deg';
        childEl.style.transform = `rotate(${childRotation})`;
      });
    }

    // Only set flag to prevent click events after an ACTUAL drag (mouse moved),
    // not after a simple click (mousedown+mouseup with no movement).
    // Without this check, the click handler in useComponentSelection is
    // blocked by didJustDrag even for simple clicks, preventing component selection.
    const dragDistance = Math.hypot(
      e.clientX - dragStartMouseRef.current.x,
      e.clientY - dragStartMouseRef.current.y
    );
    if (dragDistance > 3) {
      didJustDragRef.current = true;
      setTimeout(() => {
        didJustDragRef.current = false;
      }, 100);
    }

    // Capture drag offset before clearing state (needed for peer updates in rAF)
    const capturedDragOffset = { ...dragOffsetRef.current };
    // Capture multi-drag positions (the Map will be cleared on next drag start)
    const capturedMultiPositions = new Map(multiDragStartPositions.current);

    // ===================================================================
    // Step 2 (NEXT FRAME): ALL store updates, React state, CSS cleanup.
    // Everything happens in a single rAF so React processes all changes
    // together in one render pass. No intermediate renders can occur
    // between the DOM update above and these state changes.
    // ===================================================================
    requestAnimationFrame(() => {
      // --- Store updates ---
      if (positionChanged && slideId) {
        updateComponent(component.id, {
          props: {
            ...component.props,
            position: finalPosition
          }
        }, false);

        sendComponentLayoutUpdate(
          component.id,
          slideId,
          {
            position: finalPosition,
            size: component.props.size,
            rotation: component.props.rotation
          },
          false
        );

        // Handle multi-selection final store updates
        if (isInMultiSelection) {
          const storeUpdateFn = useEditorStore.getState().updateDraftComponent;
          capturedMultiPositions.forEach((startPos, compId) => {
            if (compId !== component.id) {
              const finalCompPosition = {
                x: Math.round(startPos.x + capturedDragOffset.x),
                y: Math.round(startPos.y + capturedDragOffset.y)
              };

              storeUpdateFn(slideId, compId, {
                props: { position: finalCompPosition }
              }, false);

              sendComponentLayoutUpdate(
                compId,
                slideId,
                { position: finalCompPosition },
                false
              );
            }
          });
        }

        // Handle group drag final store updates
        if (component.type === 'Group' && capturedMultiPositions.size > 0) {
          const storeUpdateFn = useEditorStore.getState().updateDraftComponent;
          capturedMultiPositions.forEach((startPos, compId) => {
            const finalCompPosition = {
              x: Math.round(startPos.x + capturedDragOffset.x),
              y: Math.round(startPos.y + capturedDragOffset.y)
            };

            storeUpdateFn(slideId, compId, {
              props: { position: finalCompPosition }
            }, compId === component.id);

            sendComponentLayoutUpdate(
              compId,
              slideId,
              { position: finalCompPosition },
              false
            );
          });
        }
      }

      // --- End transient operation (may update history store) ---
      if (slideId) {
        historyStore.endTransientOperation(component.id, slideId);
      }

      // --- CSS cleanup ---
      document.body.classList.remove('dragging-component');
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';

      if (component.type === 'Chart') {
        document.body.classList.remove('charts-dragging');
        if (typeof window !== 'undefined') {
          (window as any).__isDraggingCharts = false;
          (window as any).__chartAnimationsEnabled = true;
        }
      }

      // --- React state changes ---
      setIsDragging(false);
      setSnapGuides([]);
      setVisualDragOffset(null);

      // --- Event dispatch ---
      const evt = new CustomEvent('selection:drag-end', {
        bubbles: true,
        detail: { componentId: component.id, slideId }
      });
      document.dispatchEvent(evt);

      const dragEndEvent = new CustomEvent('component:dragend', {
        bubbles: true,
        detail: {
          componentId: component.id,
          componentType: component.type,
          finalPosition: positionChanged ? finalPosition : initialPos
        }
      });
      document.dispatchEvent(dragEndEvent);
    });
  }, [
    isDragging,
    component.id,
    component.type,
    component.props,
    slideId,
    slideSize,
    updateComponent,
    isInMultiSelection
  ]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleDragEnd]);

  // No cleanup needed since we removed animation frames

  return {
    isDragging,
    visualDragOffset,
    snapGuides,
    handleDragStart,
    didJustDrag: didJustDragRef,
  };
} 
