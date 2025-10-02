import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useDeckStore } from '../stores/deckStore';
import { ComponentInstance } from "../types/components";
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '../utils/deckUtils';
import { useEditModeTransitionStore } from '@/stores/editModeTransitionStore';

// Configuration for backend sync
interface SyncConfig {
  enabled: boolean;
  autoSyncInterval?: number; // in milliseconds
  useSupabase?: boolean;
  useRealtimeSubscription?: boolean;
}

// Context type for editor UI state
export interface EditorStateContextType {
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  slideSize: { width: number; height: number };
  syncConfig: SyncConfig;
}

// Context for editor UI state
export const EditorStateContext = createContext<EditorStateContextType>({
  isEditing: false,
  setIsEditing: () => {},
  isSyncing: false,
  lastSyncTime: null,
  slideSize: { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT },
  syncConfig: { enabled: false, useSupabase: true }
});

interface EditorStateProviderProps {
  children: ReactNode;
  syncConfig?: SyncConfig;
  onSyncUpdate?: (isSyncing: boolean, lastSyncTime: Date | null) => void;
  initialEditingState?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
}

export const EditorStateProvider = ({
  children,
  syncConfig = { enabled: false, useSupabase: true },
  onSyncUpdate,
  initialEditingState = false,
  onEditingChange
}: EditorStateProviderProps) => {
  const [isEditing, setIsEditingState] = useState<boolean>(initialEditingState);
  const [slideSize, setSlideSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_SLIDE_WIDTH,
    height: DEFAULT_SLIDE_HEIGHT
  });
  
  // Get sync state from the editor store
  const isSyncing = useEditorStore(state => state.isSyncing);
  const lastSyncTime = useEditorStore(state => state.lastSyncTime);
  
  // Get editor store actions - MOVED BEFORE EFFECTS
  const initializeDraftComponents = useEditorStore(state => state.initializeDraftComponents);
  const applyDraftChanges = useEditorStore(state => state.applyDraftChanges);
  const clearDraftComponents = useEditorStore(state => state.clearDraftComponents);
  
  // Get deck data to determine slide size
  const deckData = useDeckStore(state => state.deckData);
  
  // Update slide size when deck data changes
  useEffect(() => {
    if (deckData.size) {
      setSlideSize(deckData.size);
    } else {
      setSlideSize({
        width: DEFAULT_SLIDE_WIDTH,
        height: DEFAULT_SLIDE_HEIGHT
      });
    }
  }, [deckData.size]);
  
  // Get deck data to detect transitions
  const slides = useDeckStore(state => state.deckData.slides);
  
  // Wrapper for setIsEditing that can notify parent components and manage draft components
  const setIsEditing = async (editing: boolean) => {
    try {
      const deckStore = useDeckStore.getState();
      const transitionStore = useEditModeTransitionStore.getState();
      
      // Set global edit mode flag
      if (typeof window !== 'undefined') {
        (window as any).__isEditMode = editing;
      }
      
      if (editing && !isEditing) {
        // Enter edit mode immediately
        transitionStore.startTransition();
        setIsEditingState(true);
        if (onEditingChange) onEditingChange(true);
        
        // Ensure we have the freshest deck data before pausing subscriptions and creating drafts
        // IMPORTANT: If there are pending local changes (e.g. applied by AI chat with skipBackend),
        // do NOT reload from backend or we'll overwrite those local updates.
        try {
          const currentId = deckStore.deckData?.uuid;
          const hasPendingLocalChanges = !!deckStore.versionHistory?.pendingChanges;
          if (currentId && typeof deckStore.loadDeck === 'function' && !hasPendingLocalChanges) {
            await deckStore.loadDeck();
          }
        } catch {}

        // Do not pause realtime subscriptions in edit mode.
        // Realtime updates will merge into editor drafts with guards to avoid clobbering local edits.
        
        // Clear any lingering WebSocket position sync state before entering edit mode
        if (typeof window !== 'undefined' && (window as any).__remoteComponentLayouts) {
          (window as any).__remoteComponentLayouts.clear();
        }
        
        // Initialize draft components synchronously
        const navigationContext = (window as any).__navigationContext;
        const currentSlideIndex = navigationContext?.currentSlideIndex || 0;
        const currentSlideId = deckData.slides[currentSlideIndex]?.id;
        
        if (currentSlideId) {
          await initializeDraftComponents(currentSlideId);
        }
        
        // Clear transition immediately
        transitionStore.endTransition();
      }
      else if (!editing && isEditing) {
        // Exit edit mode
        transitionStore.startTransition();
        
        // console.log('[EditorStateContext] Exiting edit mode - applying draft changes');
        
        // Auto-save changes
        const editorStore = useEditorStore.getState();
        editorStore.applyDraftChanges();
        
        // console.log('[EditorStateContext] Draft changes applied');
        
        // Subscriptions were not paused; no resume needed
        
        // Update state
        setIsEditingState(false);
        if (onEditingChange) onEditingChange(false);
        
        transitionStore.endTransition();
        
        // Don't automatically trigger font optimization after exiting edit mode
        // Font optimization should only be suggested when there's actual text overflow
      }
    } catch (error) {
      console.error("Error in setIsEditing:", error);
      useEditModeTransitionStore.getState().endTransition();
    }
  };
  
  // Update sync state if provided
  useEffect(() => {
    if (onSyncUpdate && typeof onSyncUpdate === 'function') {
      onSyncUpdate(isSyncing, lastSyncTime);
    }
  }, [isSyncing, lastSyncTime, onSyncUpdate]);

  // Provide all the values
  const value: EditorStateContextType = {
    isEditing,
    setIsEditing,
    isSyncing,
    lastSyncTime,
    slideSize,
    syncConfig
  };

  return (
    <EditorStateContext.Provider value={value}>
      {children}
    </EditorStateContext.Provider>
  );
}

// Hook for accessing editor UI state
export const useEditorState = () => {
  const context = useContext(EditorStateContext);
  if (context === undefined) {
    throw new Error('useEditorState must be used within an EditorStateProvider');
  }
  return context;
} 