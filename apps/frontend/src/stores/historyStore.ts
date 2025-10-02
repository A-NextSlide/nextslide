import { create } from 'zustand';
import { ComponentInstance } from "../types/components";
import { CompleteDeckData } from "../types/DeckTypes";
import { useEditorStore } from './editorStore'; // Import main editor store to update draft components
import { useDeckStore } from './deckStore'; // Import useDeckStore

// Type for history entries
interface HistoryEntry {
  components: ComponentInstance[];
  timestamp: number;
}

interface DeckHistoryEntry {
  deckData: CompleteDeckData;
  timestamp: number;
}

// Define the history store state interface
interface HistoryState {
  // Component history (per slide)
  history: Record<string, HistoryEntry[]>; // slideId -> history array
  historyIndex: Record<string, number>; // slideId -> current position in history
  
  // Deck-level history
  deckHistory: DeckHistoryEntry[];
  deckHistoryIndex: number;
  
  // Configuration
  maxHistorySize: number;
  
  // Transient operation tracking
  activeTransientOperations: Set<string>; // Track which components are in transient operations
  transientStartStates: Record<string, { slideId: string; shouldRecord: boolean }>; // componentId -> metadata only
  
  // Track last operation
  lastOperation: string | null;
  
  // Actions
  addToHistory: (slideId: string, components: ComponentInstance[]) => void;
  undo: (slideId: string) => void;
  redo: (slideId: string) => void;
  canUndo: (slideId: string) => boolean;
  canRedo: (slideId: string) => boolean;
  clearHistory: (slideId?: string) => void;
  
  // Transient operation management
  startTransientOperation: (componentId: string, slideId: string) => void;
  endTransientOperation: (componentId: string, slideId: string) => void;
  isInTransientOperation: () => boolean;
  
  // Deck-level history actions
  addDeckHistory: (deckData: CompleteDeckData) => void;
  undoDeck: () => void;
  redoDeck: () => void;
  canUndoDeck: () => boolean;
  canRedoDeck: () => boolean;
  
  // Helper to flush any pending history entries
  flushPendingHistory: () => void;
}

// Create and export the history store
export const useHistoryStore = create<HistoryState>((set, get) => ({
  // Initial state
  history: {},
  historyIndex: {},
  deckHistory: [],
  deckHistoryIndex: -1,
  maxHistorySize: 50,
  activeTransientOperations: new Set(),
  transientStartStates: {},
  lastOperation: null,
  
  // Add to history
  addToHistory: (slideId: string, components: ComponentInstance[]) => {
    // Skip if we're in a transient operation
    if (get().activeTransientOperations.size > 0) {
      return;
    }
    
    const { history, historyIndex, maxHistorySize } = get();
    
    // Get current history for this slide
    const slideHistory = history[slideId] || [];
    const currentIndex = historyIndex[slideId] ?? -1;
    
    // Don't add if it's the same as the current state
    if (currentIndex >= 0 && currentIndex < slideHistory.length) {
      const currentEntry = slideHistory[currentIndex];
      if (JSON.stringify(currentEntry.components) === JSON.stringify(components)) {
        return; // No change, don't add to history
      }
    }
    
    // Create a deep copy of the components
    let componentsCopy: ComponentInstance[];
    try {
      componentsCopy = structuredClone(components);
    } catch (e) {
      componentsCopy = JSON.parse(JSON.stringify(components));
    }
    
    // Create new history entry
    const newEntry: HistoryEntry = {
      components: componentsCopy,
      timestamp: Date.now()
    };
    

    
    // Remove any entries after current index (when we're not at the end)
    const newHistory = slideHistory.slice(0, currentIndex + 1);
    
    // Add new entry
    newHistory.push(newEntry);
    
    // Trim history if it exceeds max size
    if (newHistory.length > maxHistorySize) {
      newHistory.shift(); // Remove oldest entry
    } else {
      // Update index to point to new entry
      set(state => ({
        historyIndex: {
          ...state.historyIndex,
          [slideId]: newHistory.length - 1
        }
      }));
    }
    
    // Update history
    set(state => ({
      history: {
        ...state.history,
        [slideId]: newHistory
      }
    }));
    
    // Mark slide as changed in editor store
    useEditorStore.getState().markSlideAsChanged(slideId);
  },
  
  // Start transient operation (e.g., dragging) - optimized to avoid cloning
  startTransientOperation: (componentId: string, slideId: string) => {
    const { activeTransientOperations, transientStartStates, history, historyIndex } = get();
    
    // Check if we should record history for this operation
    // We only need to record if there's no current history entry
    const slideHistory = history[slideId] || [];
    const currentIndex = historyIndex[slideId] ?? -1;
    const shouldRecord = currentIndex < 0 || slideHistory.length === 0;
    
    // Add this component to active operations
    const newActiveOps = new Set(activeTransientOperations);
    newActiveOps.add(componentId);
    
    set({
      activeTransientOperations: newActiveOps,
      transientStartStates: {
        ...transientStartStates,
        [componentId]: {
          slideId,
          shouldRecord // Just store metadata, not the actual state
        }
      }
    });
    

  },
  
  // End transient operation - only clone if something changed
  endTransientOperation: (componentId: string, slideId: string) => {
    const { transientStartStates, activeTransientOperations, history, historyIndex, maxHistorySize } = get();
    
    if (!activeTransientOperations.has(componentId) || !transientStartStates[componentId]) {
      return;
    }
    
    const metadata = transientStartStates[componentId];
    
    // Remove this component from active operations
    const newActiveOps = new Set(activeTransientOperations);
    newActiveOps.delete(componentId);
    
    // Remove the metadata for this component
    const newStartStates = { ...transientStartStates };
    delete newStartStates[componentId];
    
    // Update state
    set({
      activeTransientOperations: newActiveOps,
      transientStartStates: newStartStates
    });
    
    // Get current state only if we need to record history
    const currentComponents = useEditorStore.getState().getDraftComponents(slideId);
    
    // Get current history for this slide
    const slideHistory = history[slideId] || [];
    const currentIndex = historyIndex[slideId] ?? -1;
    
    // Check if we should add to history
    let shouldAddToHistory = metadata.shouldRecord;
    
    // Also check if the current state is different from the last history entry
    if (!shouldAddToHistory && currentIndex >= 0 && currentIndex < slideHistory.length) {
      const lastEntry = slideHistory[currentIndex];
      // Quick check: compare component count first
      if (lastEntry.components.length !== currentComponents.length) {
        shouldAddToHistory = true;
      } else {
        // Deep comparison only if counts match
        const currentJson = JSON.stringify(currentComponents);
        const lastJson = JSON.stringify(lastEntry.components);
        if (currentJson !== lastJson) {
          shouldAddToHistory = true;
        }
      }
    }
    
    if (shouldAddToHistory) {
      // Only clone when we actually need to save to history
      let componentsCopy: ComponentInstance[];
      try {
        componentsCopy = structuredClone(currentComponents);
      } catch (e) {
        componentsCopy = JSON.parse(JSON.stringify(currentComponents));
      }
      
      // Create new history entry
      const newEntry: HistoryEntry = {
        components: componentsCopy,
        timestamp: Date.now()
      };
      

      
      // Remove any entries after current index
      const newHistory = slideHistory.slice(0, currentIndex + 1);
      
      // Add new entry
      newHistory.push(newEntry);
      
      // Trim history if needed
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
      } else {
        set(state => ({
          historyIndex: {
            ...state.historyIndex,
            [slideId]: newHistory.length - 1
          }
        }));
      }
      
      // Update history
      set(state => ({
        history: {
          ...state.history,
          [slideId]: newHistory
        }
      }));
      
      // Mark slide as changed
      useEditorStore.getState().markSlideAsChanged(slideId);
    }
  },
  
  // Check if in transient operation
  isInTransientOperation: () => get().activeTransientOperations.size > 0,
  
  // Helper to flush any pending history entries
  flushPendingHistory: () => {
    // No longer needed since we removed debouncing
    // This is now a no-op for backward compatibility
  },
  
  // Undo
  undo: (slideId: string) => {
    // Flush any pending history first
    const historyStore = useHistoryStore.getState();
    historyStore.flushPendingHistory();
    
    const { history, historyIndex } = get();
    const slideHistory = history[slideId] || [];
    const currentIndex = historyIndex[slideId] ?? -1;
    

    
    if (currentIndex > 0) {
      const previousIndex = currentIndex - 1;
      const previousEntry = slideHistory[previousIndex];
      
      // Use structuredClone for the restored components
      let componentsToRestore: ComponentInstance[];
      try {
        componentsToRestore = structuredClone(previousEntry.components);
      } catch (e) {
        componentsToRestore = JSON.parse(JSON.stringify(previousEntry.components));
      }
      

      
      // Update editor store with previous state
      useEditorStore.getState().setDraftComponentsForSlide(slideId, componentsToRestore);
      
      // Update history index
      set(state => ({
        historyIndex: {
          ...state.historyIndex,
          [slideId]: previousIndex
        }
      }));
      
      // Set last operation for UI updates
      useEditorStore.getState().setLastOperation(`undo-${Date.now()}`);
    }
  },
  
  // Redo
  redo: (slideId: string) => {
    // Flush any pending history first
    const historyStore = useHistoryStore.getState();
    historyStore.flushPendingHistory();
    
    const { history, historyIndex } = get();
    const slideHistory = history[slideId] || [];
    const currentIndex = historyIndex[slideId] ?? -1;
    

    
    if (currentIndex < slideHistory.length - 1) {
      const nextIndex = currentIndex + 1;
      const nextEntry = slideHistory[nextIndex];
      
      // Use structuredClone for the restored components
      let componentsToRestore: ComponentInstance[];
      try {
        componentsToRestore = structuredClone(nextEntry.components);
      } catch (e) {
        componentsToRestore = JSON.parse(JSON.stringify(nextEntry.components));
      }
      

      
      // Update editor store with next state
      useEditorStore.getState().setDraftComponentsForSlide(slideId, componentsToRestore);
      
      // Update history index
      set(state => ({
        historyIndex: {
          ...state.historyIndex,
          [slideId]: nextIndex
        }
      }));
      
      // Set last operation for UI updates
      useEditorStore.getState().setLastOperation(`redo-${Date.now()}`);
    }
  },
  
  // Can undo
  canUndo: (slideId: string) => {
    const { history, historyIndex } = get();
    const currentIndex = historyIndex[slideId] ?? -1;
    const hasHistory = (history[slideId]?.length ?? 0) > 0;
    const result = currentIndex > 0 && hasHistory;
    

    
    return result;
  },
  
  // Can redo
  canRedo: (slideId: string) => {
    const { history, historyIndex } = get();
    const slideHistory = history[slideId] || [];
    const currentIndex = historyIndex[slideId] ?? -1;
    const result = currentIndex < slideHistory.length - 1;
    

    
    return result;
  },
  
  // Clear history
  clearHistory: (slideId?: string) => {
    if (slideId) {
      // Clear history for specific slide
      set(state => {
        const { [slideId]: _, ...restHistory } = state.history;
        const { [slideId]: __, ...restIndex } = state.historyIndex;
        return {
          history: restHistory,
          historyIndex: restIndex,
          lastOperation: null,
          activeTransientOperations: new Set(),
          transientStartStates: {}
        };
      });
    } else {
      // Clear all history
      set({
        history: {},
        historyIndex: {},
        deckHistory: [],
        deckHistoryIndex: -1,
        lastOperation: null,
        activeTransientOperations: new Set(),
        transientStartStates: {}
      });
    }
  },
  
  // Deck-level history
  addDeckHistory: (deckData: CompleteDeckData) => {
    const { deckHistory, deckHistoryIndex, maxHistorySize } = get();
    
    let deckDataCopy: CompleteDeckData;
    try {
      deckDataCopy = structuredClone(deckData);
    } catch (e) {
      deckDataCopy = JSON.parse(JSON.stringify(deckData));
    }
    
    const newEntry: DeckHistoryEntry = {
      deckData: deckDataCopy,
      timestamp: Date.now()
    };
    
    const newHistory = deckHistory.slice(0, deckHistoryIndex + 1);
    newHistory.push(newEntry);
    
    if (newHistory.length > maxHistorySize) {
      newHistory.shift();
    } else {
      set({ deckHistoryIndex: newHistory.length - 1 });
    }
    
    set({ deckHistory: newHistory });
  },
  
  undoDeck: () => {
    const { deckHistory, deckHistoryIndex } = get();
    
    if (deckHistoryIndex > 0) {
      const previousDeckData = deckHistory[deckHistoryIndex - 1].deckData;
      useDeckStore.getState().updateDeckData(structuredClone(previousDeckData));
      set({ deckHistoryIndex: deckHistoryIndex - 1 });
    }
  },
  
  redoDeck: () => {
    const { deckHistory, deckHistoryIndex } = get();
    
    if (deckHistoryIndex < deckHistory.length - 1) {
      const nextDeckData = deckHistory[deckHistoryIndex + 1].deckData;
      useDeckStore.getState().updateDeckData(structuredClone(nextDeckData));
      set({ deckHistoryIndex: deckHistoryIndex + 1 });
    }
  },
  
  canUndoDeck: () => {
    const { deckHistoryIndex } = get();
    return deckHistoryIndex > 0;
  },
  
  canRedoDeck: () => {
    const { deckHistory, deckHistoryIndex } = get();
    return deckHistoryIndex < deckHistory.length - 1;
  }
})); 