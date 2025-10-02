import { useEffect } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';

export function useGroupKeyboardShortcuts() {
  const { 
    selectedComponentIds,
    groupSelectedComponents,
    ungroupComponents,
    clearSelection,
    getSelectedComponents
  } = useEditorStore();
  
  const { slideId, activeComponents } = useActiveSlide();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when not typing in input fields
      if (e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement ||
          (e.target as any).contentEditable === 'true') {
        return;
      }

      // Group shortcut (Cmd/Ctrl + G)
      if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey) {
        e.preventDefault();
        if (selectedComponentIds.size > 1 && slideId) {
          groupSelectedComponents(slideId);
        }
      }

      // Ungroup shortcut (Cmd/Ctrl + Shift + G)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'g') {
        e.preventDefault();
        if (slideId) {
          const selectedComponents = getSelectedComponents(slideId);
          selectedComponents.forEach(comp => {
            if (comp.type === 'Group') {
              ungroupComponents(slideId, comp.id);
            }
          });
        }
      }

      // Delete selected components (Delete or Backspace)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedComponentIds.size > 0 && slideId) {
          e.preventDefault();
          const editorStore = useEditorStore.getState();
          const components = editorStore.getDraftComponents(slideId);
          selectedComponentIds.forEach(id => {
            const c = components.find(comp => comp.id === id);
            const isBackground = c && (c.type === 'Background' || (c.id && c.id.toLowerCase().includes('background')));
            if (!isBackground) {
              editorStore.removeDraftComponent(slideId, id);
            }
          });
          clearSelection();
        }
      }

      // Deselect all (Escape)
      if (e.key === 'Escape') {
        // If in group edit mode, exit it first
        const editorStore = useEditorStore.getState();
        if (editorStore.editingGroupId) {
          editorStore.setEditingGroupId(null);
        } else {
          clearSelection();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedComponentIds, slideId, groupSelectedComponents, ungroupComponents, clearSelection, getSelectedComponents]);
} 