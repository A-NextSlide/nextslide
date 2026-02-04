import React, { useState, useEffect, useCallback } from 'react';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'; // Restore import
import { useEditorStore } from '@/stores/editorStore';
import { getSelectionPathAtPoint } from '@/utils/selectionUtils';

interface UseComponentSelectionProps {
  componentId: string;
  componentType: string;
  isEditing: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  containerRef: React.RefObject<HTMLElement>; // Ref for focusing/manipulating contentEditable
  didJustDrag: React.MutableRefObject<boolean>; // Add prop for the ref
  slideId?: string | null;
}

interface UseComponentSelectionReturn {
  handleClick: (e: React.MouseEvent) => void;
  handleDoubleClick: (e: React.MouseEvent) => void;
}

/**
 * Hook to manage component selection (click/double-click) and 
 * entering text edit mode for TextBlock components.
 */
export function useComponentSelection({
  componentId,
  componentType,
  isEditing,
  isSelected,
  onSelect,
  containerRef, // Restore usage
  didJustDrag, // Receive the ref
  slideId: slideIdProp,
}: UseComponentSelectionProps): UseComponentSelectionReturn {
  const activeSlideId = slideIdProp || null;
  // Restore global text editing state access
  const isTextEditingGlobal = useEditorSettingsStore(state => state.isTextEditing);
  const setTextEditingGlobal = useEditorSettingsStore(state => state.setTextEditing);

  // Restore combined click handler - NOW ONLY HANDLES SELECTION
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Stop propagation to prevent slide deselection etc.

    if (!isEditing) return; // Only handle clicks in editing mode

    // Check the flag before potentially entering edit mode
    if (didJustDrag.current) {
      // If a drag just finished, do nothing on this click
      // The flag will be reset by the timeout in useComponentDrag
      return;
    }

    // If a different component was in text-edit mode, blur and exit to avoid sticky editor content
    try {
      const editorStoreInst = useEditorStore.getState();
      const activeEditor: any = editorStoreInst.activeTiptapEditor;
      if (isTextEditingGlobal) {
        const currentEditingId = activeEditor?.view?.dom
          ? (activeEditor.view.dom as HTMLElement).getAttribute('data-component-id')
          : null;
        const selectedIds = editorStoreInst.selectedComponentIds;
        const isOnlySelected = selectedIds.size === 1 && selectedIds.has(componentId);
        const isSameTarget = currentEditingId ? currentEditingId === componentId : isOnlySelected;

        if (!isSameTarget) {
          try { activeEditor?.commands?.blur?.(); } catch {}
          setTextEditingGlobal(false);
        }
      }
    } catch {}

    const editorStore = useEditorStore.getState();
    const components = activeSlideId ? editorStore.getDraftComponents(activeSlideId) : [];

    // Resolve click point to slide coordinates
    const slideElement = containerRef.current?.closest('.slide-container') as HTMLElement | null;
    const slideRect = slideElement?.getBoundingClientRect();
    const slideWidth = Number(slideElement?.getAttribute('data-slide-width')) || 1920;
    const slideHeight = Number(slideElement?.getAttribute('data-slide-height')) || 1080;
    if (!slideRect) {
      return;
    }
    const clickPoint = {
      x: ((e.clientX - slideRect.left) / slideRect.width) * slideWidth,
      y: ((e.clientY - slideRect.top) / slideRect.height) * slideHeight
    };

    const selectionPath = getSelectionPathAtPoint(components, clickPoint);
    if (selectionPath.length === 0) {
      editorStore.clearSelection();
      return;
    }

    const lastAnchor = editorStore.selectionAnchor;
    const currentPath = editorStore.selectionPath;
    const currentIndex = editorStore.selectionPathIndex;
    const isMultiSelectKey = e.shiftKey || e.metaKey || e.ctrlKey;
    const deepestIndex = selectionPath.length - 1;

    const isSameRoot = currentPath.length > 0 && selectionPath.length > 0 && currentPath[0] === selectionPath[0];
    const isSamePath = isSameRoot &&
      selectionPath.length === currentPath.length &&
      selectionPath.every((id, idx) => id === currentPath[idx]);
    const isSameAnchor = !!(lastAnchor &&
      lastAnchor.slideId === activeSlideId &&
      Math.hypot(lastAnchor.x - clickPoint.x, lastAnchor.y - clickPoint.y) <= 8);

    let nextIndex = 0;
    if (isMultiSelectKey) {
      nextIndex = isSameRoot && currentIndex > 0
        ? Math.min(currentIndex, deepestIndex)
        : 0;
    } else if (isSamePath && isSameAnchor) {
      nextIndex = Math.min(currentIndex + 1, deepestIndex);
    } else if (isSameRoot && currentIndex > 0) {
      nextIndex = Math.min(currentIndex, deepestIndex);
    } else if (isSameRoot && currentIndex === 0) {
      nextIndex = Math.min(1, deepestIndex);
    } else {
      nextIndex = 0;
    }

    editorStore.setSelectionPath(selectionPath, {
      x: clickPoint.x,
      y: clickPoint.y,
      slideId: activeSlideId || ''
    }, nextIndex);

    const targetId = selectionPath[nextIndex];
    const targetComponent = components.find(c => c.id === targetId);
    const parentGroupId = targetComponent?.props.parentId || null;

    // Update group edit context only when selecting an inner element
    if (targetComponent?.type !== 'Group' && parentGroupId) {
      editorStore.setEditingGroupId(parentGroupId);
    } else {
      editorStore.setEditingGroupId(null);
    }

    const isInMultiSelection = editorStore.selectedComponentIds.size > 1 &&
      editorStore.isComponentSelected(targetId);
    
    // CRITICAL FIX: If just dragged a multi-selected item, do NOT clear selection
    // This prevents the accidental deselection on drag end
    if (didJustDrag.current && isInMultiSelection) {
      return;
    }

    // If already part of multi-selection, don't change selection
    // This allows dragging to work properly with multi-selected items
    if (!isInMultiSelection) {
      if (isMultiSelectKey) {
        editorStore.selectComponent(targetId, true, activeSlideId || undefined);
      } else {
        editorStore.selectComponent(targetId, false, activeSlideId || undefined);
      }

      if (typeof onSelect === 'function') {
        onSelect(targetId);
      }
    }
    
  }, [
    componentId,
    isEditing,
    onSelect,
    didJustDrag, // Add ref to dependency array
    isTextEditingGlobal,
    setTextEditingGlobal,
    activeSlideId,
    containerRef
  ]);

  // Double click handler - triggers text editing mode for compatible components or group edit mode
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    // If not in editing mode, let the event bubble up to trigger edit mode
    if (!isEditing) {
      // Dispatch a custom event for double-click in view mode
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('slide:doubleclick', { 
          detail: { fromComponent: true }
        }));
      }
      return;
    }
    
    // In edit mode, handle component-specific double-click actions
    e.stopPropagation(); // Prevent other actions only when in edit mode
    
    // Check if editing is enabled and the component type is text-editable
    if (isEditing && ['TiptapTextBlock'].includes(componentType)) {
      // Don't re-enter text edit mode if already editing
      if (isTextEditingGlobal) {
        return;
      }
      
      // Ensure the component is selected before entering text edit mode
      if (!isSelected) {
        onSelect(componentId);
      }
      
      // Set the global text editing flag
      // The specific renderer (TiptapTextBlock) will handle focus/editable state
      setTextEditingGlobal(true); 
    }
  }, [
    isEditing, 
    componentType, 
    componentId, 
    isSelected, 
    onSelect, 
    setTextEditingGlobal,
    activeSlideId
  ]); // Updated dependencies

  return {
    handleClick,
    handleDoubleClick,
  };
} 
