import { useEffect } from 'react';
import { useEditorState } from '@/context/EditorStateContext';
import { useHistoryStore } from '@/stores/historyStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';

export function useKeyboardShortcuts() {
  const { isEditing } = useEditorState();
  const { activeSlide } = useActiveSlide();
  const { undo, redo, canUndo, canRedo } = useHistoryStore();
  const isTextEditing = useEditorSettingsStore(state => state.isTextEditing);

  useEffect(() => {
    // Remove the edit mode restriction - allow undo/redo anytime
    if (!activeSlide) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if we're in text editing mode
      if (isTextEditing) return;
      
      // Skip if we're in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Cmd/Ctrl + Z for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        console.log('[useKeyboardShortcuts] Undo triggered', {
          canUndo: canUndo(activeSlide.id),
          slideId: activeSlide.id,
          isEditing
        });
        if (canUndo(activeSlide.id)) {
          undo(activeSlide.id);
        }
      }
      
      // Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y for redo
      if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') || 
          ((e.metaKey || e.ctrlKey) && e.key === 'y')) {
        e.preventDefault();
        console.log('[useKeyboardShortcuts] Redo triggered', {
          canRedo: canRedo(activeSlide.id),
          slideId: activeSlide.id,
          isEditing
        });
        if (canRedo(activeSlide.id)) {
          redo(activeSlide.id);
        }
      }
      
      // Delete key for removing selected component - only in edit mode
      if (isEditing && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        // This would trigger component deletion
        // You'll need to implement this based on your selection system
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeSlide, undo, redo, canUndo, canRedo, isTextEditing, isEditing]);
} 