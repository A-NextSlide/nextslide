import { create } from 'zustand';
import { createEmptyDeck } from '../utils/deckUtils';
import { createCoreDeckOperations } from './deckCoreOperations';
import { createSlideOperations } from './deckSlideOperations';
import { createSyncOperations } from './deckSyncOperations';
import { createVersionOperations } from './deckVersionOperations';
import { createYjsSlice } from './yjsOperations';
import { DeckState } from './deckStoreTypes';
import { CompleteDeckData } from '../types/DeckTypes';
import { supabase } from '../integrations/supabase/client';
import { mergeComponents } from '../utils/slideUtils';
import { autosaveService } from '../services/autosaveService';
import { warnIfNotGenerating } from '../utils/errorHandler';
import { deckSyncService } from '../lib/deckSyncService';

// Create the store
export const useDeckStore = create<DeckState>((set, get, store) => {
  // Combine operations from all modules
  const coreOperations = createCoreDeckOperations(set, get);
  const slideOperations = createSlideOperations(set, get);
  const syncOperations = createSyncOperations(set, get);
  const versionOperations = createVersionOperations(set, get);
  const yjsOperations = createYjsSlice(set, get, store);
  
  return {
    // Initial state - start with empty deck, no "New Deck" name
    deckData: createEmptyDeck('', ''),
    isSyncing: false,
    lastSyncTime: null,
    supabaseSubscription: null,
    updateInProgress: false,
    updateQueue: [],
    currentSlideIndex: 0,
    
    // Slide cache for optimized loading
    slidesCache: {},
    
    // Version history state
    versionHistory: {
      versions: [],
      currentVersionId: null,
      isViewingHistory: false,
      pendingChanges: false
    },
    autoSaveIntervalId: null,
    
    // Add subscription manager
    subscriptionManager: syncOperations.subscriptionManager,
    
    // Include all operations from separate modules
    ...coreOperations,
    ...slideOperations,
    ...syncOperations,
    ...versionOperations,
    ...yjsOperations,
    
    // Override loadDeck to match interface signature
    loadDeck: async () => {
      // Get deckId from current deckData or initialization context
      const currentDeckId = get().deckData?.uuid;
      if (currentDeckId) {
        await syncOperations.loadDeck(currentDeckId);
      } else {
        console.warn('[loadDeck] No deck ID available');
      }
    },
    
    // Map yjs operations to match interface names
    initializeYjsSync: (docManager: any, initialDeckData?: any) => {
      // Delegate to initializeYjs with appropriate mapping
      if (docManager && docManager.docId) {
        yjsOperations.initializeYjs({
          docId: docManager.docId,
          wsUrl: docManager.wsUrl,
          userId: docManager.user?.id,
          userName: docManager.user?.name
        });
      }
    },
    yjsAddComponent: yjsOperations.addYjsComponent,
    yjsUpdateComponent: yjsOperations.updateYjsComponent,
    yjsRemoveComponent: yjsOperations.removeYjsComponent,
    yjsAddSlide: yjsOperations.addYjsSlide,
    yjsUpdateSlide: yjsOperations.updateYjsSlide,
    yjsRemoveSlide: yjsOperations.removeYjsSlide,
    
    // Batch update slide components
    batchUpdateSlideComponents: (updates: { slideId: string; components: any[] }[]) => {
      if (!updates.length) {
        return;
      }
      
      // Check if deck is generating
      const deckStatus = (window as any).__deckStatus;
      const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
      
      // Create a copy of the current deck data
      const currentDeckData = get().deckData;
      const updatedSlides = [...currentDeckData.slides];
      let changesMade = false;
      
      // Process each update
      updates.forEach(({ slideId, components }) => {
        // Find the slide
        const slideIndex = updatedSlides.findIndex(s => s.id === slideId);
        
        if (slideIndex !== -1) {
          const currentSlide = updatedSlides[slideIndex];
          
          // CRITICAL: Don't update slides with empty components if deck is generating
          if (isGenerating && components.length === 0 && currentSlide.components && currentSlide.components.length > 0) {
            console.warn(`[batchUpdateSlideComponents] Preventing slide ${slideId} from being cleared during generation`);
            return;
          }
          
          // Use mergeComponents for proper component merging
          // Only update if the components are actually different
          if (JSON.stringify(currentSlide.components) !== JSON.stringify(components)) {
            updatedSlides[slideIndex] = {
              ...currentSlide,
              components: components
            };
            
            changesMade = true;
            
            // Invalidate cache for this slide
            set(state => {
              const { [slideId]: _, ...restCache } = state.slidesCache;
              return { slidesCache: restCache };
            });
          }
        } else {
          warnIfNotGenerating(`[batchUpdateSlideComponents] Slide ${slideId} not found during batch update.`);
        }
      });
      
      // Only update if changes were made
      if (changesMade) {
        // Generate a new version
        const versionInfo = get().generateNewVersion();
        
        // Create the updated deck data
        const updatedDeck = {
          ...currentDeckData,
          slides: updatedSlides,
          ...versionInfo
        };
        
        // Use the core updateDeckData function to save to backend
        get().updateDeckData(updatedDeck, { batchUpdate: true });
      }
    },
    
    // Get a slide for editing, ensuring it belongs to the current deck
    getSlideForEditing: (slideId: string) => {
      const { deckData } = get();
      
      // Validate that we have a valid deckData
      if (!deckData || !deckData.uuid) {
        // Don't log during generation
        const deckStatus = (window as any).__deckStatus;
        const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
        if (!isGenerating) {
          console.warn('[getSlideForEditing] No valid deck data');
        }
        return null;
      }
      
      // Find the slide in the current deck data
      const slide = deckData.slides.find(s => s.id === slideId);
      
      if (slide) {
        return slide;
      }
      
      // Check if deck is generating before warning
      const deckStatus = (window as any).__deckStatus;
      const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
      if (!isGenerating) {
        console.warn(`[getSlideForEditing] Slide ${slideId} not found in current deck ${deckData.uuid}`);
      }
      return null;
    },
    
    // Clear the slide cache
    clearSlideCache: () => {
      set({ slidesCache: {} });
    },
    
    // Create a new deck
    createNewDeck: async (newDeckData: CompleteDeckData): Promise<string | null> => {
      // Ensure the deck has a UUID
      if (!newDeckData.uuid) {
        console.error('[createNewDeck] New deck data must have a UUID');
        return null;
      }
      
      try {
        // Generate a new version if needed
        if (!newDeckData.version) {
          const versionInfo = get().generateNewVersion();
          newDeckData = {
            ...newDeckData,
            ...versionInfo
          };
        }
        
        // Use deckSyncService to save the deck via API
        const savedDeck = await deckSyncService.saveDeck(newDeckData);
        
        if (!savedDeck) {
          console.error('[createNewDeck] Failed to save deck via API');
          throw new Error('Failed to save deck');
        }

        console.log('[createNewDeck] Successfully saved new deck:', savedDeck.uuid);
        return savedDeck.uuid;
      } catch (error: any) {
        console.error('[createNewDeck] Failed to create new deck:', error);
        if (error?.message) {
          console.error('Error message:', error.message);
        }
        return null;
      }
    },
    
    // Initialize the store with options
    initialize: (options = {}) => {
      const result = syncOperations.initialize(options);
      
      // Start autosave if not a new deck
      if (!options.isNewDeck && get().deckData?.uuid) {
        autosaveService.startAutosave(() => get());
      }
      
      return result;
    },
    
    // Reset store state to clean values
    resetStore: () => {
      // Stop autosave
      autosaveService.stopAutosave();
      
      // Clean up any existing subscription
      const subscription = get().supabaseSubscription;
      if (subscription && typeof subscription === 'object' && 'unsubscribe' in subscription) {
        try {
          supabase.removeChannel(subscription as any);
  
        } catch (error) {
          console.error('[resetStore] Error unsubscribing from Supabase channel:', error);
        }
      }
      
      // Reset the subscription manager
      const subscriptionManager = get().subscriptionManager;
      if (subscriptionManager) {
        subscriptionManager.reset();
      }
      
      // Clean up Y.js state
      const { disconnectYjsSync } = get();
      if (disconnectYjsSync) {
        disconnectYjsSync();
      }
      
      // Clear WebSocket position sync state
      if (typeof window !== 'undefined') {
        // Clear remote component layouts
        if ((window as any).__remoteComponentLayouts) {
          (window as any).__remoteComponentLayouts.clear();
        }
        
        // Clear any WebSocket providers
        if ((window as any)._yProviders) {
          (window as any)._yProviders = [];
        }
      }
      
      // Clear editor store draft components
      try {
        const editorStore = (window as any).__editorStore || 
          (typeof require !== 'undefined' ? require('./editorStore').useEditorStore : null);
        if (editorStore && editorStore.getState) {
          const clearDrafts = editorStore.getState().clearDraftComponents;
          if (clearDrafts) {
            clearDrafts();
          }
        }
      } catch (e) {
        // Silently fail if editor store not available
      }
      
      // Reset to clean state
      set({
        deckData: createEmptyDeck('', ''),
        isSyncing: false,
        lastSyncTime: null,
        supabaseSubscription: null,
        updateInProgress: false,
        updateQueue: [], // Clear any pending operations
        currentSlideIndex: 0,
        slidesCache: {},
        versionHistory: {
          versions: [],
          currentVersionId: null,
          isViewingHistory: false,
          pendingChanges: false
        },
        autoSaveIntervalId: null
      });
    }
  };
});

// Selector hooks for common operations
export const useCurrentSlide = (slideIndex: number) => {
  return useDeckStore(state => {
    if (slideIndex < 0 || !state.deckData.slides || slideIndex >= state.deckData.slides.length) {
      return null;
    }
    return state.deckData.slides[slideIndex];
  });
};

export const useDeckSlides = () => {
  return useDeckStore(state => state.deckData.slides);
};

export const useDeckSyncState = () => {
  return useDeckStore(state => ({
    isSyncing: state.isSyncing,
    lastSyncTime: state.lastSyncTime
  }));
};

// Expose store globally for debugging in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).__deckStore = useDeckStore;
}