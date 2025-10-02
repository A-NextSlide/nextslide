import React, { useState, useEffect, useCallback } from 'react';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'; // Restore import
import { useEditorStore } from '@/stores/editorStore';

interface UseComponentSelectionProps {
  componentId: string;
  componentType: string;
  isEditing: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  containerRef: React.RefObject<HTMLElement>; // Ref for focusing/manipulating contentEditable
  didJustDrag: React.MutableRefObject<boolean>; // Add prop for the ref
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
}: UseComponentSelectionProps): UseComponentSelectionReturn {
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

    // Check if component is already selected in multi-selection
    const editorStore = useEditorStore.getState();
    const components = editorStore.getDraftComponents(Object.keys(editorStore.draftComponents)[0] || '');
    const component = components.find(c => c.id === componentId);
    
    // Check if this component is part of a group
    const isInGroup = component?.props.parentId && component.type !== 'Group';
    const effectiveId = isInGroup && editorStore.editingGroupId !== component.props.parentId
      ? component.props.parentId // Select the parent group instead
      : componentId;
    
    const isInMultiSelection = editorStore.selectedComponentIds.size > 1 && 
                              editorStore.isComponentSelected(effectiveId);
    
    // If already part of multi-selection, don't change selection
    // This allows dragging to work properly with multi-selected items
    if (!isInMultiSelection) {
      // Check for modifier keys for multi-selection
      const isMultiSelectKey = e.shiftKey || e.metaKey || e.ctrlKey;
      
      if (isMultiSelectKey) {
        // Add to selection
        editorStore.selectComponent(effectiveId, true);
      } else {
        // Replace selection - this will also handle group selection logic
        editorStore.selectComponent(effectiveId, false);
      }

      // Also inform parent that this component was selected so UI reflects selection immediately
      // This ensures single-source of truth selection flows up as requested
      if (typeof onSelect === 'function') {
        onSelect(effectiveId);
      }
    }
    
  }, [
    componentId,
    isEditing,
    onSelect,
    didJustDrag, // Add ref to dependency array
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
    
    const editorStore = useEditorStore.getState();
    const components = editorStore.getDraftComponents(Object.keys(editorStore.draftComponents)[0] || '');
    const component = components.find(c => c.id === componentId);
    
    // Check if this component is part of a group
    if (component?.props.parentId && editorStore.editingGroupId !== component.props.parentId) {
      // Enter group edit mode
      editorStore.setEditingGroupId(component.props.parentId);
      // Select the component within the group
      editorStore.selectComponent(componentId, false);
      return;
    }
    
    // Check if editing is enabled and the component type is text-editable
    if (isEditing && ['TiptapTextBlock'].includes(componentType)) {
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
    setTextEditingGlobal
  ]); // Updated dependencies

  return {
    handleClick,
    handleDoubleClick,
  };
} 