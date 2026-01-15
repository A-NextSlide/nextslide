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
  slideSizeOverride?: { width: number; height: number };
}

export const EditorStateProvider = ({
  children,
  syncConfig = { enabled: false, useSupabase: true },
  onSyncUpdate,
  initialEditingState = false,
  onEditingChange,
  slideSizeOverride
}: EditorStateProviderProps) => {
  const [isEditing, setIsEditingState] = useState<boolean>(initialEditingState);
  const [slideSize, setSlideSize] = useState<{ width: number; height: number }>(() => {
    // Initialize with override if provided, otherwise use defaults
    if (slideSizeOverride?.width && slideSizeOverride?.height) {
      return { width: slideSizeOverride.width, height: slideSizeOverride.height };
    }
    return { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };
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
  const overrideWidth = slideSizeOverride?.width;
  const overrideHeight = slideSizeOverride?.height;
  
  // Update slide size when deck data changes
  useEffect(() => {
    if (overrideWidth && overrideHeight) {
      setSlideSize({ width: overrideWidth, height: overrideHeight });
      return;
    }
    if (deckData.size) {
      setSlideSize(deckData.size);
    } else {
      setSlideSize({
        width: DEFAULT_SLIDE_WIDTH,
        height: DEFAULT_SLIDE_HEIGHT
      });
    }
  }, [deckData.size, overrideWidth, overrideHeight]);
  
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
        // CRITICAL FIX: Also skip reload if there was a recent AI agent edit - the backend may
        // not have the latest data yet, and reloading would overwrite the AI changes.
        // CRITICAL FIX 2: Also skip reload if an AI edit is currently IN PROGRESS - the user
        // entered edit mode during an active AI edit operation.
        try {
          const currentId = deckStore.deckData?.uuid;
          const hasPendingLocalChanges = !!deckStore.versionHistory?.pendingChanges;

          // Check for recent AI agent edits (within last 5 seconds)
          const lastAgentEditTs = typeof window !== 'undefined' ? (window as any).__lastAgentEditTs || 0 : 0;
          const timeSinceAgentEdit = Date.now() - lastAgentEditTs;
          const hasRecentAgentEdit = lastAgentEditTs > 0 && timeSinceAgentEdit < 5000;

          // Check for AI edit currently in progress (started but not yet completed)
          const agentEditInProgress = typeof window !== 'undefined' && (window as any).__agentEditInProgress === true;

          if (hasRecentAgentEdit) {
            console.log('[EditorStateContext] Skipping loadDeck - recent AI agent edit detected', {
              timeSinceAgentEdit,
              threshold: 5000
            });
          }

          if (agentEditInProgress) {
            console.log('[EditorStateContext] Skipping loadDeck - AI agent edit in progress');
            // Mark that we entered edit mode during an AI edit - forces draft resync when edit completes
            (window as any).__enteredEditModeDuringAgentEdit = true;
          }

          if (currentId && typeof deckStore.loadDeck === 'function' && !hasPendingLocalChanges && !hasRecentAgentEdit && !agentEditInProgress) {
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

        // Clear the flag after initialization
        if (typeof window !== 'undefined' && (window as any).__enteredEditModeDuringAgentEdit) {
          // Keep flag for a short time to allow AI edit to see it
          setTimeout(() => {
            delete (window as any).__enteredEditModeDuringAgentEdit;
          }, 5000);
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

// Safe version that returns default values if no provider is present
export const useEditorStateSafe = () => {
  const context = useContext(EditorStateContext);
  if (context === undefined) {
    return {
      isEditing: false,
      setIsEditing: () => {},
      isSyncing: false,
      lastSyncTime: null,
      slideSize: { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT },
      syncConfig: { enabled: false, useSupabase: true }
    };
  }
  return context;
}

/**
 * Lightweight static provider for thumbnails - NO store subscriptions
 * This prevents iOS Safari crashes from too many Zustand subscriptions
 * when rendering multiple thumbnails in the deck list
 */
interface StaticEditorStateProviderProps {
  children: ReactNode;
  slideSize: { width: number; height: number };
}

export const StaticEditorStateProvider = ({
  children,
  slideSize
}: StaticEditorStateProviderProps) => {
  // Static value - no hooks, no subscriptions, no re-renders
  const value: EditorStateContextType = {
    isEditing: false,
    setIsEditing: () => {},
    isSyncing: false,
    lastSyncTime: null,
    slideSize: slideSize || { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT },
    syncConfig: { enabled: false, useSupabase: false }
  };

  return (
    <EditorStateContext.Provider value={value}>
      {children}
    </EditorStateContext.Provider>
  );
} 
