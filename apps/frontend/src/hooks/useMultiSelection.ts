import { useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { ComponentInstance } from '@/types/components';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';

interface UseMultiSelectionProps {
  slideId: string;
  components: ComponentInstance[];
  containerRef: React.RefObject<HTMLElement>;
  isEditing: boolean;
  slideSize: { width: number; height: number };
}

export function useMultiSelection({
  slideId,
  components,
  containerRef,
  isEditing,
  slideSize
}: UseMultiSelectionProps) {
  const { 
    setSelectionRectangle, 
    selectComponents, 
    clearSelection,
    setSelectionMode,
    isComponentSelected,
    selectedComponentIds,
    selectionRectangle
  } = useEditorStore();
  const isTextEditing = useEditorSettingsStore(state => state.isTextEditing);
  
  const isDraggingRef = useRef(false);
  const startPointRef = useRef({ x: 0, y: 0 });
  const isOverComponentRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  // Check if a point is inside a rectangle
  const isPointInRect = useCallback((
    point: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    return point.x >= rect.x && 
           point.x <= rect.x + rect.width &&
           point.y >= rect.y && 
           point.y <= rect.y + rect.height;
  }, []);

  // Check if two rectangles intersect
  const doRectsIntersect = useCallback((
    rect1: { x: number; y: number; width: number; height: number },
    rect2: { x: number; y: number; width: number; height: number }
  ) => {
    return !(rect1.x + rect1.width < rect2.x || 
             rect2.x + rect2.width < rect1.x || 
             rect1.y + rect1.height < rect2.y || 
             rect2.y + rect2.height < rect1.y);
  }, []);

  // Get components within selection rectangle
  const getComponentsInSelection = useCallback((selectionRect: { x: number; y: number; width: number; height: number }) => {
    const container = containerRef.current;
    if (!container) return [];

    // Use the container directly - it's already the slide-display-container
    const containerRect = container.getBoundingClientRect();
    const scaleX = slideSize.width / containerRect.width;
    const scaleY = slideSize.height / containerRect.height;

    // Adjust selection rectangle to slide coordinates
    const adjustedSelection = {
      x: selectionRect.x * scaleX,
      y: selectionRect.y * scaleY,
      width: selectionRect.width * scaleX,
      height: selectionRect.height * scaleY
    };

    return components.filter(component => {
      // Skip background components
              if (component.type === 'Background' || (component.id && component.id.toLowerCase().includes('background'))) {
        return false;
      }

      const compX = component.props.position?.x || 0;
      const compY = component.props.position?.y || 0;
      const compWidth = component.props.size?.width || component.props.width || 100;
      const compHeight = component.props.size?.height || component.props.height || 100;

      const componentRect = {
        x: compX,
        y: compY,
        width: compWidth,
        height: compHeight
      };

      return doRectsIntersect(adjustedSelection, componentRect);
    });
  }, [components, containerRef, slideSize, doRectsIntersect]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!isEditing || !containerRef.current) return;

    // Check if we're clicking on a component or multi-selection box
    const target = e.target as HTMLElement;
    const multiSelectionBox = target.closest('[data-multi-selection-box]');
    
    // If clicking on multi-selection box, don't start a new selection
    if (multiSelectionBox) {
      return;
    }
    
    // Check if we're clicking on a background component FIRST
    const componentElement = target.closest('[data-component-id]');
    if (componentElement) {
      const componentType = componentElement.getAttribute('data-component-type');
      const componentId = componentElement.getAttribute('data-component-id');
      
      // If it's a background component, treat it as empty space for multiselection
      if (componentType === 'Background' || (componentId && componentId.toLowerCase().includes('background'))) {
        // console.log('[useMultiSelection] Click on background component detected, starting selection rectangle');
        // Don't return - continue to start selection rectangle
      } else {
        // We're clicking on a non-background component
        if (componentId) {
          isOverComponentRef.current = true;
          
          // Check if this component is already selected in multi-selection
          const editorStore = useEditorStore.getState();
          const isAlreadySelected = editorStore.isComponentSelected(componentId);
          const hasMultipleSelected = editorStore.selectedComponentIds.size > 1;
          
          // Get the component to check if it's part of a group
          const clickedComponent = components.find(c => c.id === componentId);
          const isPartOfGroup = clickedComponent?.props.parentId;
          
          // If component is part of a group (not in group edit mode), allow drag
          if (isPartOfGroup && editorStore.editingGroupId !== clickedComponent.props.parentId) {
            return;
          }
          
          // If component is already part of multi-selection, don't start selection box
          if (isAlreadySelected && hasMultipleSelected) {
            return;
          }
          
          // Handle shift-click for adding to selection
          if (e.shiftKey || e.metaKey) {
            if (isAlreadySelected) {
              editorStore.deselectComponent(componentId);
            } else {
              editorStore.selectComponent(componentId, true);
            }
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
      }
    }

    // We're clicking on empty space (or background) - start selection rectangle
    isOverComponentRef.current = false;
    
    // Use the containerRef directly - it's already the slide-display-container
    const containerRect = containerRef.current.getBoundingClientRect();
    // Get computed style to account for border
    const computedStyle = window.getComputedStyle(containerRef.current);
    const borderLeftWidth = parseFloat(computedStyle.borderLeftWidth) || 0;
    const borderTopWidth = parseFloat(computedStyle.borderTopWidth) || 0;
    
    // Find the transformed parent (motion.div with scale and translate)
    let transformedParent = containerRef.current.parentElement;
    while (transformedParent && !transformedParent.style.transform && !window.getComputedStyle(transformedParent).transform.includes('matrix')) {
      transformedParent = transformedParent.parentElement;
    }
    
    // In edit mode, the parent has scale(0.92) and translateX(-140px)
    // We need to account for this transform
    let x = e.clientX - containerRect.left - borderLeftWidth;
    let y = e.clientY - containerRect.top - borderTopWidth;
    
    // If we're in edit mode (parent is transformed), we need to invert the scale
    if (transformedParent && isEditing) {
      // The parent is scaled to 0.92, so we need to divide by 0.92 to get original coordinates
      const scale = 0.92;
      x = x / scale;
      y = y / scale;
    }

    isDraggingRef.current = true;
    startPointRef.current = { x, y };
    
    // Clear selection unless shift/meta key is held
    if (!e.shiftKey && !e.metaKey) {
      clearSelection();
      
      // Also exit group edit mode if clicking outside
      const editorStore = useEditorStore.getState();
      if (editorStore.editingGroupId) {
        editorStore.setEditingGroupId(null);
      }
    }
    
    setSelectionMode(true);
    setSelectionRectangle({ x, y, width: 0, height: 0 });

    e.preventDefault();
    e.stopPropagation();
    
    // Prevent text selection
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
  }, [isEditing, containerRef, clearSelection, setSelectionMode, setSelectionRectangle, components]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;

    // Use the containerRef directly - it's already the slide-display-container
    const containerRect = containerRef.current.getBoundingClientRect();
    // Get computed style to account for border
    const computedStyle = window.getComputedStyle(containerRef.current);
    const borderLeftWidth = parseFloat(computedStyle.borderLeftWidth) || 0;
    const borderTopWidth = parseFloat(computedStyle.borderTopWidth) || 0;
    
    // Find the transformed parent (motion.div with scale and translate)
    let transformedParent = containerRef.current.parentElement;
    while (transformedParent && !transformedParent.style.transform && !window.getComputedStyle(transformedParent).transform.includes('matrix')) {
      transformedParent = transformedParent.parentElement;
    }
    
    let currentX = e.clientX - containerRect.left - borderLeftWidth;
    let currentY = e.clientY - containerRect.top - borderTopWidth;
    
    // If we're in edit mode (parent is transformed), we need to invert the scale
    if (transformedParent && isEditing) {
      // The parent is scaled to 0.92, so we need to divide by 0.92 to get original coordinates
      const scale = 0.92;
      currentX = currentX / scale;
      currentY = currentY / scale;
    }

    const x = Math.min(startPointRef.current.x, currentX);
    const y = Math.min(startPointRef.current.y, currentY);
    const width = Math.abs(currentX - startPointRef.current.x);
    const height = Math.abs(currentY - startPointRef.current.y);

    setSelectionRectangle({ x, y, width, height });

    // Update selection in real-time
    const rect = { x, y, width, height };
    const componentsInSelection = getComponentsInSelection(rect);
    const selectedIds = componentsInSelection.map(c => c.id);
    
    // If shift/meta key is held, add to existing selection
    if (e.shiftKey || e.metaKey) {
      const currentSelected = Array.from(selectedComponentIds);
      const combined = new Set([...currentSelected, ...selectedIds]);
      selectComponents(Array.from(combined));
    } else {
      selectComponents(selectedIds);
    }
  }, [containerRef, setSelectionRectangle, getComponentsInSelection, selectedComponentIds, selectComponents, isEditing]);

  // Handle mouse up
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;

    isDraggingRef.current = false;
    setSelectionMode(false);
    setSelectionRectangle(null);
    // Suppress the immediate click that fires after a drag-selection
    suppressNextClickRef.current = true;
    setTimeout(() => { suppressNextClickRef.current = false; }, 75);
    
    // Restore text selection
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
  }, [setSelectionMode, setSelectionRectangle]);

  // Handle key events for multi-selection
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isEditing) return;

    // Do not handle when typing in inputs, contenteditable areas, or code editors
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName || '';
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const isContentEditable = !!(target && (target.isContentEditable || target.hasAttribute('contenteditable')));
    const isInMonaco = !!(target && (target.closest('.monaco-editor')));
    if (isTextEditing || isInput || isContentEditable || isInMonaco) {
      return;
    }

    // Select all (Cmd/Ctrl + A)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const selectableComponents = components.filter(c => 
                  c.type !== 'Background' && !(c.id && c.id.toLowerCase().includes('background'))
      );
      selectComponents(selectableComponents.map(c => c.id));
    }

    // Deselect all (Escape)
    if (e.key === 'Escape') {
      clearSelection();
    }
  }, [isEditing, isTextEditing, components, selectComponents, clearSelection]);

  // Set up event listeners
  useEffect(() => {
    if (!isEditing) return;

    const container = containerRef.current;
    if (!container) return;

    // Add event listeners
    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing, handleMouseDown, handleMouseMove, handleMouseUp, handleKeyDown]);

  return {
    selectionRectangle,
    selectedComponentIds: Array.from(selectedComponentIds),
    isSelecting: isDraggingRef.current,
    suppressNextClickRef
  };
} 