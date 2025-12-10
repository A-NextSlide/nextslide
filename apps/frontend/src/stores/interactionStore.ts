/**
 * Interaction Store - Centralized state for UI interactions
 *
 * Replaces scattered global window state (`window.__isDragging`, etc.)
 * with a proper Zustand store for better testability and debugging.
 */

import { create } from 'zustand';

interface DeckStatus {
  state: 'idle' | 'creating' | 'generating' | 'complete' | 'error';
  progress?: number;
  message?: string;
}

interface InteractionState {
  // Edit mode
  isEditMode: boolean;
  setEditMode: (editing: boolean) => void;

  // Drag/resize interactions (prevents realtime updates during interaction)
  isDragging: boolean;
  isDraggingCharts: boolean;
  isResizingCharts: boolean;
  isDraggingSlide: boolean;
  setDragging: (dragging: boolean) => void;
  setDraggingCharts: (dragging: boolean) => void;
  setResizingCharts: (resizing: boolean) => void;
  setDraggingSlide: (dragging: boolean) => void;

  // Check if any interaction is active
  isInteracting: () => boolean;

  // Deck status (generation state)
  deckStatus: DeckStatus;
  setDeckStatus: (status: Partial<DeckStatus>) => void;
  isGenerating: () => boolean;

  // Current deck context
  currentDeckId: string | null;
  setCurrentDeckId: (deckId: string | null) => void;

  // Agent edit tracking (simplified - just a flag, not timestamps)
  hasRecentAgentEdit: boolean;
  markAgentEdit: () => void;
  clearAgentEdit: () => void;
}

export const useInteractionStore = create<InteractionState>((set, get) => ({
  // Edit mode
  isEditMode: false,
  setEditMode: (editing) => set({ isEditMode: editing }),

  // Drag/resize interactions
  isDragging: false,
  isDraggingCharts: false,
  isResizingCharts: false,
  isDraggingSlide: false,
  setDragging: (dragging) => set({ isDragging: dragging }),
  setDraggingCharts: (dragging) => set({ isDraggingCharts: dragging }),
  setResizingCharts: (resizing) => set({ isResizingCharts: resizing }),
  setDraggingSlide: (dragging) => set({ isDraggingSlide: dragging }),

  // Check if any interaction is active
  isInteracting: () => {
    const state = get();
    return state.isDragging || state.isDraggingCharts || state.isResizingCharts || state.isDraggingSlide;
  },

  // Deck status
  deckStatus: { state: 'idle' },
  setDeckStatus: (status) => set((state) => ({
    deckStatus: { ...state.deckStatus, ...status }
  })),
  isGenerating: () => {
    const { deckStatus } = get();
    return deckStatus.state === 'generating' || deckStatus.state === 'creating';
  },

  // Current deck context
  currentDeckId: null,
  setCurrentDeckId: (deckId) => set({ currentDeckId: deckId }),

  // Agent edit tracking - simple flag with auto-clear
  hasRecentAgentEdit: false,
  markAgentEdit: () => {
    set({ hasRecentAgentEdit: true });
    // Auto-clear after 1 second (much shorter than the old 3 second window)
    setTimeout(() => set({ hasRecentAgentEdit: false }), 1000);
  },
  clearAgentEdit: () => set({ hasRecentAgentEdit: false }),
}));

// ============================================================================
// BACKWARDS COMPATIBILITY LAYER
// ============================================================================
// These functions sync the store with window globals for gradual migration.
// Remove once all components are updated to use the store directly.

export function syncGlobalsToStore() {
  if (typeof window === 'undefined') return;

  const store = useInteractionStore.getState();

  // Sync FROM globals TO store (for components still using globals)
  const syncInterval = setInterval(() => {
    const win = window as any;
    const state = useInteractionStore.getState();

    // Only sync if values differ (avoid unnecessary updates)
    if (win.__isEditMode !== undefined && win.__isEditMode !== state.isEditMode) {
      useInteractionStore.setState({ isEditMode: win.__isEditMode });
    }
    if (win.__isDragging !== undefined && win.__isDragging !== state.isDragging) {
      useInteractionStore.setState({ isDragging: win.__isDragging });
    }
    if (win.__isDraggingCharts !== undefined && win.__isDraggingCharts !== state.isDraggingCharts) {
      useInteractionStore.setState({ isDraggingCharts: win.__isDraggingCharts });
    }
    if (win.__isResizingCharts !== undefined && win.__isResizingCharts !== state.isResizingCharts) {
      useInteractionStore.setState({ isResizingCharts: win.__isResizingCharts });
    }
    if (win.__deckStatus !== undefined) {
      const deckStatus = win.__deckStatus;
      if (deckStatus.state !== state.deckStatus.state) {
        useInteractionStore.setState({ deckStatus });
      }
    }
    if (win.__currentDeckId !== undefined && win.__currentDeckId !== state.currentDeckId) {
      useInteractionStore.setState({ currentDeckId: win.__currentDeckId });
    }
  }, 100);

  // Subscribe to store changes and sync TO globals (for components reading globals)
  const unsubscribe = useInteractionStore.subscribe((state) => {
    const win = window as any;
    win.__isEditMode = state.isEditMode;
    win.__isDragging = state.isDragging;
    win.__isDraggingCharts = state.isDraggingCharts;
    win.__isResizingCharts = state.isResizingCharts;
    win.__deckStatus = state.deckStatus;
    win.__currentDeckId = state.currentDeckId;
  });

  return () => {
    clearInterval(syncInterval);
    unsubscribe();
  };
}

// Auto-start sync on module load (for backwards compatibility)
if (typeof window !== 'undefined') {
  // Delay to ensure store is initialized
  setTimeout(syncGlobalsToStore, 0);
}
