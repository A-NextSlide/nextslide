import { useEditorState } from '../context/EditorStateContext';
import { useEditorStore } from '../stores/editorStore';
import { useDeckStore } from '../stores/deckStore';
import { useHistoryStore } from '../stores/historyStore';
import { ComponentInstance } from '../types/components';
import { useNavigation } from '../context/NavigationContext';
import { toast } from '../hooks/use-toast';

/**
 * Custom hook that combines EditorUI context with EditorStore
 * for a unified interface to all editor functionality
 */
export function useEditor() {
  // Get UI state from context
  const { 
    isEditing, 
    setIsEditing 
  } = useEditorState();
  
  // Get store state and actions
  const getDraftComponents = useEditorStore(state => state.getDraftComponents);
  const forceSyncWithBackend = useEditorStore(state => state.forceSyncWithBackend);
  const getEditHistory = useEditorStore(state => state.getEditHistory);
  const isSyncing = useEditorStore(state => state.isSyncing);
  const lastSyncTime = useEditorStore(state => state.lastSyncTime);
  const applyDraftChanges = useEditorStore(state => state.applyDraftChanges);
  const clearDraftComponents = useEditorStore(state => state.clearDraftComponents);
  
  // Get undo/redo functions and state from HistoryStore individually for stability
  const historyUndo = useHistoryStore(state => state.undo);
  const historyRedo = useHistoryStore(state => state.redo);
  const historyCanUndo = useHistoryStore(state => state.canUndo);
  const historyCanRedo = useHistoryStore(state => state.canRedo);
  
  // Import toast from the correct location to avoid dynamic imports in hooks

  // Get navigation context to identify current slide
  const { currentSlideIndex } = useNavigation();
  const deckSlides = useDeckStore(state => state.deckData.slides);
  const currentSlideId = deckSlides[currentSlideIndex]?.id;
  
  // Get slide updating function from deck store
  const deckData = useDeckStore(state => state.deckData);
  const updateSlide = useDeckStore(state => state.updateSlide);
  
  // Get all slides for non-editing mode access
  const allSlides = useDeckStore(state => state.deckData.slides);
  
  // Get draft components while respecting edit mode
  const getComponents = (slideId: string): ComponentInstance[] => {
    if (isEditing) {
      return getDraftComponents(slideId);
    }
    
    // When not in edit mode, use the slides from the hook
    const slide = allSlides.find(s => s.id === slideId);
    return slide?.components || [];
  };
  
  // Save changes to the permanent store
  const saveChanges = () => {
    // Apply draft changes directly
    applyDraftChanges();
    
    console.log(`useEditor: Saved changes`);
  };
  
  // Discard changes and revert to the permanent store
  const discardChanges = () => {
    // Clear draft components without applying
    clearDraftComponents();
    
    console.log(`useEditor: Discarded changes`);
  };
  
  // Create wrapped functions with toast notifications
  const undo = () => {
    if (!currentSlideId) return;
    if (typeof historyUndo === 'function') {
      historyUndo(currentSlideId);
      
      // Show a toast notification for better user feedback
      toast({
        title: "↩️ Undo",
        description: "Previous state restored",
        duration: 1500,
        variant: "default"
      });
    }
  };
  
  const redo = () => {
    if (!currentSlideId) return;
    if (typeof historyRedo === 'function') {
      historyRedo(currentSlideId);
      
      // Show a toast notification for better user feedback
      toast({
        title: "↪️ Redo",
        description: "Change reapplied",
        duration: 1500,
        variant: "default"
      });
    }
  };
  
  // Check if undo/redo is possible for the current slide
  const canUndo = (): boolean => {
    if (!currentSlideId) return false;
    return historyCanUndo(currentSlideId);
  }
  const canRedo = (): boolean => {
    if (!currentSlideId) return false;
    return historyCanRedo(currentSlideId);
  }
  
  return {
    // Editing state
    isEditing,
    setIsEditing,
    
    // Editing transitions
    saveChanges,
    discardChanges,
    
    // Component reading (but not manipulation)
    getComponents,
    
    // Sync state
    isSyncing,
    lastSyncTime,
    forceSyncWithBackend,
    
    // History and undo/redo
    getEditHistory,
    undo,
    redo,
    canUndo,
    canRedo
  };
} 