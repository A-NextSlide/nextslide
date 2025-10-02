/**
 * Yjs-Zustand Middleware
 * 
 * This middleware provides bidirectional synchronization between Yjs and Zustand.
 * It observes Zustand state changes and applies them to Yjs, and vice versa.
 */
import { StateCreator, StoreApi } from 'zustand';
import { YjsDocumentManager } from '../yjs/YjsDocumentManager';
import { SlideData } from '@/types/SlideTypes';
import { CompleteDeckData } from '@/types/DeckTypes';
import { ComponentInstance } from '@/types/components';
import { DeckState } from './deckStoreTypes';

// Type definitions for middleware
type YjsMiddlewareConfig = {
  /** Flag to prevent synchronization loops */
  synchronizing?: boolean;
  /** The Yjs document manager instance */
  docManager: YjsDocumentManager | null;
  /** Whether to enable sync (can be toggled) */
  enabled: boolean;
};

/**
 * Creates the Yjs-Zustand middleware
 */
export const createYjsMiddleware = <T extends DeckState>(config: YjsMiddlewareConfig) => 
  (f: StateCreator<T>) => 
  (set: StoreApi<T>['setState'], get: StoreApi<T>['getState'], store: StoreApi<T>): T => {
    // Initialize middleware with provided config
    const middleware = {
      synchronizing: config.synchronizing || false,
      docManager: config.docManager,
      enabled: config.enabled,
    };

    // Create a wrapper for the setState function to intercept changes
    const wrappedSet: typeof set = (update, replace) => {
      // First apply the update to the Zustand store
      const result = set(update, replace);
      
      // If synchronization is disabled or already in progress, just return
      if (!middleware.enabled || middleware.synchronizing || !middleware.docManager) {
        return result;
      }

      // Process state changes and sync to Yjs
      try {
        middleware.synchronizing = true;
        
        // Get the updated state
        const state = get();
        const newState = typeof update === 'function' ? update(state as any) : update;
        
        // Detect what kind of update occurred
        if (newState.deckData !== undefined) {
          syncDeckToYjs(middleware.docManager, newState.deckData);
        }
        
        // Reset synchronizing flag
        middleware.synchronizing = false;
      } catch (error) {
        middleware.synchronizing = false;
        console.error('[YjsMiddleware] Error syncing state to Yjs:', error);
      }
      
      return result;
    };
    
    // Initialize the store with the wrapped setState
    const initialState = f(wrappedSet, get, store);
    
    // Extend the initial state with Yjs integration functions
    return {
      ...initialState,
      
      // Initialize Yjs integration
      initializeYjsSync: (docManager: YjsDocumentManager, initialDeckData?: CompleteDeckData) => {
        if (!docManager) {
          console.error('[YjsMiddleware] No document manager provided');
          return;
        }
        
        // Store the document manager
        middleware.docManager = docManager;
        
        // Set up Yjs event listeners
        setupYjsListeners(docManager, set, get);
        
        // If initial deck data is provided, initialize Yjs with it
        if (initialDeckData) {
          docManager.initializeFromDeckData(initialDeckData);
        } else {
          // Otherwise sync current state to Yjs
          const state = get();
          if (state.deckData) {
            docManager.initializeFromDeckData(state.deckData);
          }
        }
      },
      
      // Disconnect Yjs integration
      disconnectYjsSync: () => {
        if (middleware.docManager) {
          middleware.docManager.destroy();
          middleware.docManager = null;
        }
      },
      
      // Set whether Yjs sync is enabled
      setYjsSyncEnabled: (enabled: boolean) => {
        middleware.enabled = enabled;
      },
      
      // Expose direct component operations for Yjs
      yjsAddComponent: (slideId: string, component: ComponentInstance) => {
        if (!middleware.enabled || !middleware.docManager) return;
        
        middleware.synchronizing = true;
        try {
          middleware.docManager.addComponent(slideId, component);
        } finally {
          middleware.synchronizing = false;
        }
      },
      
      yjsUpdateComponent: (slideId: string, componentId: string, props: Partial<ComponentInstance['props']>) => {
        if (!middleware.enabled || !middleware.docManager) return;
        
        middleware.synchronizing = true;
        try {
          middleware.docManager.updateComponent(slideId, componentId, props);
        } finally {
          middleware.synchronizing = false;
        }
      },
      
      yjsRemoveComponent: (slideId: string, componentId: string) => {
        if (!middleware.enabled || !middleware.docManager) return;
        
        middleware.synchronizing = true;
        try {
          middleware.docManager.removeComponent(slideId, componentId);
        } finally {
          middleware.synchronizing = false;
        }
      },
      
      // Expose direct slide operations for Yjs
      yjsAddSlide: (slide: SlideData) => {
        if (!middleware.enabled || !middleware.docManager) return;
        
        middleware.synchronizing = true;
        try {
          middleware.docManager.addSlide(slide);
        } finally {
          middleware.synchronizing = false;
        }
      },
      
      yjsUpdateSlide: (slideId: string, slideData: Partial<SlideData>) => {
        if (!middleware.enabled || !middleware.docManager) return;
        
        middleware.synchronizing = true;
        try {
          middleware.docManager.updateSlide(slideId, slideData);
        } finally {
          middleware.synchronizing = false;
        }
      },
      
      yjsRemoveSlide: (slideId: string) => {
        if (!middleware.enabled || !middleware.docManager) return;
        
        middleware.synchronizing = true;
        try {
          middleware.docManager.removeSlide(slideId);
        } finally {
          middleware.synchronizing = false;
        }
      },
      
      // Get Yjs connection status
      getYjsConnectionStatus: () => {
        const users = middleware.docManager?.getConnectedUsers?.() || [];
        console.log('[YjsMiddleware] Connection status:', {
          isConnected: middleware.docManager?.wsProvider !== null,
          enabled: middleware.enabled,
          clientId: middleware.docManager?.getClientId() || null,
          userCount: users.length
        });
        
        return {
          isConnected: middleware.docManager?.wsProvider !== null && middleware.docManager?.wsProvider?.ws?.readyState === WebSocket.OPEN,
          isEnabled: middleware.enabled,
          clientId: middleware.docManager?.getClientId() || null,
          connectedUsers: users
        };
      },
    };
  };

/**
 * Set up Yjs event listeners to sync changes to Zustand
 */
function setupYjsListeners<T extends DeckState>(
  docManager: YjsDocumentManager,
  set: StoreApi<T>['setState'],
  get: StoreApi<T>['getState']
) {
  // Listen for document changes
  docManager.on('document-changed', ({ isLocal, deckData }: { isLocal: boolean, deckData: CompleteDeckData }) => {
    // Skip if the change came from this client (to avoid loops)
    if (isLocal) return;
    
    // Get current state for comparison
    const currentState = get();
    
    // Apply changes to the Zustand store
    set(
      (state) => ({
        ...state,
        deckData: {
          ...state.deckData,
          ...deckData,
          // Preserve properties that might not be in the Yjs document
          uuid: deckData.uuid || state.deckData.uuid,
          slides: mergeSlides(state.deckData.slides, deckData.slides),
        },
      }),
      false
    );
  });
}

/**
 * Merge slides from Yjs with local slides, preserving non-conflicting changes
 */
function mergeSlides(localSlides: SlideData[], yjsSlides: SlideData[]): SlideData[] {
  const mergedSlides: SlideData[] = [];
  
  // Create maps for quick lookups
  const localSlidesMap = new Map(localSlides.map(slide => [slide.id, slide]));
  const yjsSlidesMap = new Map(yjsSlides.map(slide => [slide.id, slide]));
  
  // Process all slide IDs from both sources
  const allSlideIds = new Set([
    ...localSlides.map(slide => slide.id),
    ...yjsSlides.map(slide => slide.id)
  ]);
  
  // For each slide ID, merge or select the appropriate version
  allSlideIds.forEach(slideId => {
    const localSlide = localSlidesMap.get(slideId);
    const yjsSlide = yjsSlidesMap.get(slideId);
    
    if (localSlide && yjsSlide) {
      // Both exist, merge them with Yjs taking precedence for components
      mergedSlides.push({
        ...localSlide,
        ...yjsSlide,
        // Special handling for components and background
        components: yjsSlide.components || localSlide.components,
        background: yjsSlide.background || localSlide.background,
      });
    } else if (yjsSlide) {
      // Only exists in Yjs, use that version
      mergedSlides.push(yjsSlide);
    } else if (localSlide) {
      // Only exists locally, use local version
      mergedSlides.push(localSlide);
    }
  });
  
  // Sort slides to maintain original order from local state as much as possible
  return sortSlides(mergedSlides, localSlides);
}

/**
 * Sort slides to maintain order from reference array
 */
function sortSlides(slidesToSort: SlideData[], referenceSlides: SlideData[]): SlideData[] {
  // Create a map of slide IDs to their position in the reference array
  const referenceOrder = new Map<string, number>();
  referenceSlides.forEach((slide, index) => {
    referenceOrder.set(slide.id, index);
  });
  
  // Sort the slides based on their position in the reference array
  return [...slidesToSort].sort((a, b) => {
    const aPos = referenceOrder.has(a.id) ? referenceOrder.get(a.id)! : Infinity;
    const bPos = referenceOrder.has(b.id) ? referenceOrder.get(b.id)! : Infinity;
    return aPos - bPos;
  });
}

/**
 * Sync Zustand deck data to Yjs
 */
function syncDeckToYjs(docManager: YjsDocumentManager, deckData: CompleteDeckData) {
  // Update deck metadata
  docManager.updateDeckMetadata({
    name: deckData.name,
    version: deckData.version,
    lastModified: deckData.lastModified,
    size: deckData.size,
  });
  
  // Get current Yjs deck data for comparison
  const yjsDeckData = docManager.toDeckData();
  
  // Create maps for quick lookups
  const yjsSlidesMap = new Map(yjsDeckData.slides.map(slide => [slide.id, slide]));
  const zustandSlidesMap = new Map(deckData.slides.map(slide => [slide.id, slide]));
  
  // Find slides to add, update, or remove
  deckData.slides.forEach(slide => {
    if (!yjsSlidesMap.has(slide.id)) {
      // New slide
      docManager.addSlide(slide);
    } else {
      // Existing slide - compare components to avoid unnecessary updates
      const yjsSlide = yjsSlidesMap.get(slide.id)!;
      
      // Check if components are different (simplified comparison)
      const componentsChanged = JSON.stringify(slide.components) !== JSON.stringify(yjsSlide.components);
      const backgroundChanged = JSON.stringify(slide.background) !== JSON.stringify(yjsSlide.background);
      const titleChanged = slide.title !== yjsSlide.title;
      
      if (componentsChanged || backgroundChanged || titleChanged) {
        docManager.updateSlide(slide.id, slide);
      }
    }
  });
  
  // Find slides to remove
  yjsDeckData.slides.forEach(slide => {
    if (!zustandSlidesMap.has(slide.id)) {
      docManager.removeSlide(slide.id);
    }
  });
}