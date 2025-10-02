/**
 * Yjs Operations for Zustand Store
 */
import { StateCreator, StoreApi } from 'zustand';
import { YjsDocumentManager } from '../yjs/YjsDocumentManager';
import { DeckState } from './deckStoreTypes';
import { createYjsMiddleware } from './yjsZustandMiddleware';
import { CompleteDeckData } from '../types/DeckTypes';
import { SlideData } from '../types/SlideTypes';
import { ComponentInstance } from '../types/components';
import { v4 as uuidv4 } from 'uuid';
import { yjsPersistenceService } from '../lib/yjsPersistenceService';
import { API_CONFIG } from '../config/environment';

export interface YjsSlice {
  // State
  yjsDocManager: YjsDocumentManager | null;
  yjsConnected: boolean;
  yjsLoading: boolean;
  yjsSyncEnabled: boolean;
  
  // Actions
  initializeYjs: (options: {
    docId: string;
    wsUrl?: string;
    userId?: string;
    userName?: string;
  }) => void;
  
  disconnectYjsSync: () => void;
  
  syncToYjs: (
    deckData: CompleteDeckData, 
    options?: { skipLocalUpdate?: boolean }
  ) => void;
  
  updateYjsSlide: (
    slideId: string, 
    slideData: Partial<SlideData>
  ) => void;
  
  updateYjsComponent: (
    slideId: string, 
    componentId: string, 
    props: Partial<ComponentInstance['props']>
  ) => void;
  
  addYjsComponent: (
    slideId: string, 
    component: ComponentInstance
  ) => void;
  
  removeYjsComponent: (
    slideId: string, 
    componentId: string
  ) => void;
  
  addYjsSlide: (slide: SlideData) => void;
  
  removeYjsSlide: (slideId: string) => void;

  // New methods for enhanced Yjs integration
  setupYjsCollaboration: (options: {
    deckId: string;
    userName?: string;
    wsUrl?: string;
    autoConnect?: boolean;
  }) => () => void;
  
  createYjsSnapshot: (name?: string) => Promise<any>;
  
  restoreYjsSnapshot: (snapshotId: string) => Promise<boolean>;
  
  setYjsSyncEnabled: (enabled: boolean) => void;
  
  getYjsConnectionStatus: () => {
    isConnected: boolean;
    isEnabled: boolean;
    clientId: number | null;
    connectedUsers: any[];
  };
  
  /**
   * Get all connected Yjs users
   * Returns an array of user presence objects including ID, name, color, and cursor information
   */
  getYjsUsers: () => any[];
  
  reconnectYjs: () => void;
  
  forceSyncWithServer: () => void;
}

/**
 * Create Yjs operations for the Zustand store
 */
export const createYjsOperations = (
  set: StoreApi<DeckState>['setState'],
  get: StoreApi<DeckState>['getState']
) => {
  // Create the middleware for bidirectional sync with extended API
  const middleware = {
    ...createYjsMiddleware<DeckState>({
      docManager: null,
      enabled: false,
    }),
    initializeYjsSync: (docManager, initialDeckData) => {
      // Initialize silently without logging
    },
    setYjsSyncEnabled: (enabled) => {
      // Silently set sync state
    }
  };

  // Base operations from previous version
  const baseOperations = {
    // Initial state
    yjsDocManager: null,
    yjsConnected: false,
    yjsLoading: true,
    yjsSyncEnabled: false,
    
    // Initialize Yjs document manager
    initializeYjs: (options) => {
      // Clean up existing document manager if any
      if (get().yjsDocManager) {
        get().disconnectYjsSync();
      }
      
      // Determine WebSocket URL with proper fallbacks
      const websocketUrl = options.wsUrl || API_CONFIG.WEBSOCKET_URL || 'wss://slide-websocket.onrender.com';
      
      // Create a new document manager
      const docManager = new YjsDocumentManager({
        docId: options.docId,
        wsUrl: websocketUrl,
        user: {
          id: options.userId || `user-${Math.floor(Math.random() * 10000)}`,
          name: options.userName || 'Anonymous',
        },
        autoConnect: true,
      });
      
      // Set up event listeners
      docManager.on('connected', () => {
        set({ yjsConnected: true, yjsLoading: false });
        
        // Initialize with current deck data
        const deckData = get().deckData;
        if (deckData) {
          docManager.initializeFromDeckData(deckData);
        }
      });
      
      docManager.on('disconnected', () => {
        set({ yjsConnected: false });
      });
      
      docManager.on('document-changed', ({ isLocal, deckData }) => {
        if (!isLocal && get().yjsSyncEnabled) {
          // Only update store if change came from remote and sync is enabled
          set({ deckData });
        }
      });
      
      // Store the document manager
      set({ yjsDocManager: docManager, yjsLoading: true });
    },
    
    // Disconnect and clean up
    disconnectYjsSync: () => {
      const { yjsDocManager } = get();
      if (yjsDocManager) {
        yjsDocManager.disconnect();
        yjsDocManager.destroy();
        set({ yjsDocManager: null, yjsConnected: false });
      }
      
      // Also clean up the persistence service
      yjsPersistenceService.destroy();
    },
    
    // Sync deck data to Yjs
    syncToYjs: (deckData, options = {}) => {
      const { yjsDocManager, yjsSyncEnabled } = get();
      if (yjsDocManager && yjsDocManager.getClientId() && yjsSyncEnabled) {
        yjsDocManager.initializeFromDeckData(deckData);
      }
    },
    
    // Update a slide in Yjs
    updateYjsSlide: (slideId, slideData) => {
      const { yjsDocManager, yjsSyncEnabled } = get();
      if (yjsDocManager && yjsDocManager.getClientId() && yjsSyncEnabled) {
        yjsDocManager.updateSlide(slideId, slideData);
      }
    },
    
    // Update a component in Yjs
    updateYjsComponent: (slideId, componentId, props) => {
      const { yjsDocManager, yjsSyncEnabled } = get();
      if (yjsDocManager && yjsDocManager.getClientId() && yjsSyncEnabled) {
        yjsDocManager.updateComponent(slideId, componentId, props);
      }
    },
    
    // Add a component to Yjs
    addYjsComponent: (slideId, component) => {
      const { yjsDocManager, yjsSyncEnabled } = get();
      if (yjsDocManager && yjsDocManager.getClientId() && yjsSyncEnabled) {
        yjsDocManager.addComponent(slideId, component);
      }
    },
    
    // Remove a component from Yjs
    removeYjsComponent: (slideId, componentId) => {
      const { yjsDocManager, yjsSyncEnabled } = get();
      if (yjsDocManager && yjsDocManager.getClientId() && yjsSyncEnabled) {
        yjsDocManager.removeComponent(slideId, componentId);
      }
    },
    
    // Add a slide to Yjs
    addYjsSlide: (slide) => {
      const { yjsDocManager, yjsSyncEnabled } = get();
      if (yjsDocManager && yjsDocManager.getClientId() && yjsSyncEnabled) {
        yjsDocManager.addSlide(slide);
      }
    },
    
    // Remove a slide from Yjs
    removeYjsSlide: (slideId) => {
      const { yjsDocManager, yjsSyncEnabled } = get();
      if (yjsDocManager && yjsDocManager.getClientId() && yjsSyncEnabled) {
        yjsDocManager.removeSlide(slideId);
      }
    },
  };

  // Enhanced operations with middleware integration
  const enhancedOperations = {
    // Set up Yjs collaboration for a deck
    setupYjsCollaboration: (options: {
      deckId: string;
      userName?: string;
      wsUrl?: string;
      autoConnect?: boolean;
    }) => {
      const { deckId, userName, wsUrl, autoConnect = true } = options;
      
      // Disconnect any existing connection
      get().disconnectYjsSync();

      // Generate a unique user ID if not already in localStorage
      let userId = localStorage.getItem('yjs-user-id');
      if (!userId) {
        userId = `user-${uuidv4().substring(0, 8)}`;
        localStorage.setItem('yjs-user-id', userId);
      }

      // Determine WebSocket URL with proper fallbacks
      const websocketUrl = wsUrl || API_CONFIG.WEBSOCKET_URL || 'wss://slide-websocket.onrender.com';
      
      // Create a new document manager
      const docManager = new YjsDocumentManager({
        docId: deckId,
        wsUrl: websocketUrl,
        autoConnect,
        persistenceEnabled: true,
        user: {
          id: userId,
          name: userName || 'Anonymous',
        },
      });

      // Set up event listeners for the enhanced middleware
      docManager.on('connected', ({ clientId }) => {
        set({ 
          yjsConnected: true, 
          yjsLoading: false,
        } as Partial<DeckState>);
        
        // Initialize persistence service
        yjsPersistenceService.initialize(docManager, deckId);
        
        // Connected silently
      });
      
      docManager.on('disconnected', () => {
        set({ yjsConnected: false } as Partial<DeckState>);
      });

      // Store the document manager immediately to prevent race conditions
      set({ 
        yjsDocManager: docManager, 
        yjsLoading: true,
        yjsSyncEnabled: true 
      } as Partial<DeckState>);
      
      // Initialize the middleware with the document manager
      middleware.initializeYjsSync(docManager, get().deckData);
      
      // Defer initialization until after connection to prevent blocking
      docManager.on('connected', () => {
        // Use deferred initialization to prevent UI blocking
        import('../utils/deferredYjsOperations').then(({ DeferredYjsOperations }) => {
          const deferredOps = new DeferredYjsOperations(docManager, {
            operationDelay: 5, // Use a shorter delay for better responsiveness
            batchSize: 2       // Smaller batches to keep UI more responsive
          });
          
          // Initialize asynchronously with current data
          deferredOps.initializeFromDeckData(get().deckData)
            .then(() => {
              // Initialization complete, emit event
              if (docManager.hasOwnProperty('emitEvent')) {
                // Use dynamic access to avoid TypeScript errors with private method
                (docManager as any).emitEvent?.('initialized', { deckData: get().deckData });
              }
            })
            .catch(err => {
              // Silent error handling for initialization errors
            });
        });
      });

      // Successfully set up collaboration

      // Return a cleanup function
      return () => {
        get().disconnectYjsSync();
      };
    },

    // Create a snapshot of the current document state
    createYjsSnapshot: async (name?: string) => {
      return yjsPersistenceService.createSnapshot();
    },

    // Restore a snapshot
    restoreYjsSnapshot: async (snapshotId: string) => {
      return yjsPersistenceService.applySnapshot(snapshotId);
    },

    // Enable/disable Yjs synchronization
    setYjsSyncEnabled: (enabled: boolean) => {
      set({ yjsSyncEnabled: enabled } as Partial<DeckState>);
      middleware.setYjsSyncEnabled(enabled);
    },

    // Get connection status
    getYjsConnectionStatus: () => {
      const docManager = get().yjsDocManager;
      return {
        isConnected: get().yjsConnected,
        isEnabled: get().yjsSyncEnabled,
        clientId: docManager?.getClientId() || null,
        // Add connected users information
        connectedUsers: docManager ? docManager.getConnectedUsers() || [] : []
      };
    },
    
    /**
     * Get all connected Yjs users
     * Direct access to the user presence information from YjsDocumentManager
     */
    getYjsUsers: () => {
      const docManager = get().yjsDocManager;
      if (!docManager) {
        console.warn('[YjsOperations] Cannot get users - no document manager exists');
        return [];
      }
      return docManager.getConnectedUsers();
    },
    
    // Reconnect to Yjs server
    reconnectYjs: () => {
      const docManager = get().yjsDocManager;
      
      if (!docManager) {
        console.warn('[YjsOperations] Cannot reconnect - no document manager exists');
        return;
      }
      
      // First disconnect to ensure clean state
      docManager.disconnect();
      
      // Set loading state
      set({ yjsLoading: true });
      
      console.log('[YjsOperations] Attempting to reconnect to Yjs server...');
      
      // Attempt to reconnect
      setTimeout(() => {
        docManager.connect();
        
        // If not connected after 5 seconds, log an error
        setTimeout(() => {
          if (!get().yjsConnected) {
            console.error('[YjsOperations] Failed to reconnect to Yjs server');
            set({ yjsLoading: false });
          }
        }, 5000);
      }, 500);
    },

    // Force synchronization with the server
    forceSyncWithServer: () => {
      const docManager = get().yjsDocManager;
      if (!docManager || !docManager.wsProvider) return;

      try {
        const syncRequest = new Uint8Array([0, 0, 1, 0]);
        (docManager.wsProvider as any).ws?.send(syncRequest);
        console.log("[YjsOperations] Sent sync request to server");
      } catch (err) {
        console.error("[YjsOperations] Error requesting sync:", err);
      }
    },
  };

  // Combine base and enhanced operations
  return {
    ...baseOperations,
    ...enhancedOperations,
  };
};

// Export as a StateCreator for Zustand
export const createYjsSlice: StateCreator<
  DeckState, 
  [], 
  [], 
  YjsSlice
> = (set, get) => createYjsOperations(set, get);