/**
 * ShardedYjsProvider - React provider for the Sharded Yjs implementation
 * 
 * This provider extends the standard YjsProvider with efficient document sharding:
 * - Lazy loading of document shards based on visible slides
 * - Connection pooling for efficient network usage
 * - Delta compression for reduced bandwidth
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DocumentShardManager } from './DocumentShardManager';
import { DocumentConnectionPool } from './DocumentConnectionPool';
import { DeltaCompression } from './DeltaCompression';
import { ComponentInstance } from '../types/components';
import { SlideData } from '../types/SlideTypes';
import { API_CONFIG } from '../config/environment';
import { CompleteDeckData } from '../types/DeckTypes';
import { ComponentLock, LockResponse, UserPresence } from './YjsTypes';

/**
 * Configuration options for the ShardedYjsProvider
 */
export interface ShardedYjsProviderProps {
  /**
   * ID of the deck to synchronize
   */
  deckId: string;
  
  /**
   * Name of the current user
   */
  userName: string;
  
  /**
   * Color for the current user's cursor
   */
  userColor?: string;
  
  /**
   * WebSocket URL for the Yjs server
   */
  wsUrl: string;
  
  /**
   * Maximum number of documents to keep loaded at once
   * Default: 5
   */
  maxLoadedDocuments?: number;
  
  /**
   * Whether to enable persistence with IndexedDB
   * Default: true
   */
  persistenceEnabled?: boolean;
  
  /**
   * Whether to automatically connect on mount
   * Default: true
   */
  autoConnect?: boolean;
  
  /**
   * Whether to enable delta compression
   * Default: true
   */
  enableDeltaCompression?: boolean;
  
  /**
   * Whether to enable debug logging
   * Default: false
   */
  debug?: boolean;
  
  /**
   * Children components
   */
  children: React.ReactNode;
}

/**
 * Context data for ShardedYjsContext
 */
export interface ShardedYjsContextType {
  /**
   * Whether the client is connected to the server
   */
  isConnected: boolean;
  
  /**
   * The client's ID (assigned by the server)
   */
  clientId: number | null;
  
  /**
   * Connected users
   */
  users: UserPresence[];
  
  /**
   * Set the currently visible slides
   * This triggers lazy loading/unloading of document shards
   * @param slideIds Array of currently visible slide IDs
   * @param loadMode Optional loading mode: 'sync' (default), 'async', or 'prioritize-current'
   */
  setVisibleSlides: (
    slideIds: string[], 
    loadMode?: 'sync' | 'async' | 'prioritize-current'
  ) => Promise<void>;
  
  /**
   * Get a slide's data from the appropriate document
   */
  getSlideData: (slideId: string) => Promise<SlideData | null>;
  
  /**
   * Update a slide's properties
   */
  updateSlide: (slideId: string, data: Partial<SlideData>) => Promise<void>;
  
  /**
   * Update a component's properties
   */
  updateComponent: (
    slideId: string, 
    componentId: string, 
    props: Partial<ComponentInstance['props']>
  ) => Promise<void>;
  
  /**
   * Add a component to a slide
   */
  addComponent: (slideId: string, component: ComponentInstance) => Promise<void>;
  
  /**
   * Remove a component from a slide
   */
  removeComponent: (slideId: string, componentId: string) => Promise<void>;
  
  /**
   * Update the current user's cursor position
   */
  updateCursor: (slideId: string, x: number, y: number) => Promise<void>;
  
  /**
   * Update the current user's selection
   */
  updateSelection: (slideId: string, componentIds: string[]) => Promise<void>;
  
  /**
   * Request a lock on a component
   */
  requestLock: (slideId: string, componentId: string) => Promise<LockResponse>;
  
  /**
   * Release a lock on a component
   */
  releaseLock: (slideId: string, componentId: string, force?: boolean) => Promise<boolean>;
  
  /**
   * Check if a component is locked
   */
  isComponentLocked: (slideId: string, componentId: string) => Promise<boolean>;
  
  /**
   * Get information about a component lock
   */
  getComponentLock: (slideId: string, componentId: string) => Promise<ComponentLock | null>;
  
  /**
   * Get all locks for a specific slide
   */
  getLocksForSlide: (slideId: string) => Promise<ComponentLock[]>;
  
  /**
   * Get all locks owned by the current user
   */
  getOwnedLocks: () => Promise<ComponentLock[]>;
  
  /**
   * Approve a lock request from another user
   */
  approveLockRequest: (slideId: string, componentId: string, userId: string) => Promise<boolean>;
  
  /**
   * Deny a lock request from another user
   */
  denyLockRequest: (slideId: string, componentId: string, userId: string) => Promise<boolean>;
  
  /**
   * Connection statistics
   */
  connectionStats: {
    activeConnections: number;
    totalConnections: number;
    queuedConnections: number;
  };
}

// Create the context with default values
const ShardedYjsContext = createContext<ShardedYjsContextType>({
  isConnected: false,
  clientId: null,
  users: [],
  setVisibleSlides: async () => {},
  getSlideData: async () => null,
  updateSlide: async () => {},
  updateComponent: async () => {},
  addComponent: async () => {},
  removeComponent: async () => {},
  updateCursor: async () => {},
  updateSelection: async () => {},
  requestLock: async () => ({ slideId: '', componentId: '', granted: false }),
  releaseLock: async () => false,
  isComponentLocked: async () => false,
  getComponentLock: async () => null,
  getLocksForSlide: async () => [],
  getOwnedLocks: async () => [],
  approveLockRequest: async () => false,
  denyLockRequest: async () => false,
  connectionStats: {
    activeConnections: 0,
    totalConnections: 0,
    queuedConnections: 0
  }
});

/**
 * Hook to use the ShardedYjs context
 */
export const useShardedYjs = () => useContext(ShardedYjsContext);

/**
 * Provider component for ShardedYjs functionality
 */
export const ShardedYjsProvider: React.FC<ShardedYjsProviderProps> = ({
  deckId,
  userName,
  userColor = getRandomColor(),
  wsUrl = API_CONFIG.WEBSOCKET_URL || 'wss://slide-websocket.onrender.com',
  maxLoadedDocuments = 5,
  persistenceEnabled = true,
  autoConnect = true,
  enableDeltaCompression = true,
  debug = false,
  children
}) => {
  // Log the WebSocket URL being used
  console.log(`ShardedYjsProvider: Using WebSocket URL ${wsUrl}`);
  console.log(`ShardedYjsProvider: Environment API_CONFIG.WEBSOCKET_URL is: ${API_CONFIG.WEBSOCKET_URL}`);
  // Reference to the document shard manager
  const shardManagerRef = useRef<DocumentShardManager | null>(null);
  
  // Reference to the delta compression module
  const deltaCompressionRef = useRef<DeltaCompression | null>(null);
  
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  
  // Client ID (assigned by server)
  const [clientId, setClientId] = useState<number | null>(null);
  
  // Connected users
  const [users, setUsers] = useState<UserPresence[]>([]);
  
  // Connection statistics
  const [connectionStats, setConnectionStats] = useState({
    activeConnections: 0,
    totalConnections: 0,
    queuedConnections: 0
  });
  
  // Currently visible slide IDs
  const currentVisibleSlidesRef = useRef<string[]>([]);
  
  // Create the shard manager on mount
  useEffect(() => {
    const initializeShardManager = async () => {
      // Create delta compression if enabled
      if (enableDeltaCompression) {
        deltaCompressionRef.current = new DeltaCompression({
          debug,
          maxBatchDelayMs: 100, // More responsive for UI updates
        });
      }
      
      // Create the shard manager
      const shardManager = new DocumentShardManager(
        deckId,
        userName,
        userColor,
        {
          wsUrl,
          maxLoadedDocuments,
          persistenceEnabled,
          debug
        }
      );
      
      // Store in ref
      shardManagerRef.current = shardManager;
      
      // Store the websocket providers in window for debug access
      if (!window._yProviders) {
        window._yProviders = [];
      }
      
      // Add each provider to the global list
      shardManager.providers.forEach(provider => {
        if (provider && provider.wsProvider && !window._yProviders.includes(provider.wsProvider)) {
          window._yProviders.push(provider.wsProvider);
          
          // Store the awareness object in the global variable if not already set
          // This ensures direct access to awareness for cross-browser cursor tracking
          if (!window._awareness && provider.wsProvider.awareness) {
            window._awareness = provider.wsProvider.awareness;
          }
        }
      });
      
      // Initialize global cursor utilities
      import('./utils/cursorUtils').then(({ initializeGlobalCursorUtils }) => {
        initializeGlobalCursorUtils();
      }).catch(err => {
        // Silently handle import errors
      });
      
      // Set up event listeners
      shardManager.on('connected', () => {
        setIsConnected(true);
      });
      
      shardManager.on('disconnected', () => {
        setIsConnected(false);
      });
      
      shardManager.on('users-changed', (data: { users: UserPresence[] }) => {
        setUsers(data.users);
      });
      
      shardManager.on('client-id-changed', (data: { clientId: number }) => {
        setClientId(data.clientId);
      });
      
      // Update connection stats periodically
      const statsInterval = setInterval(() => {
        if (shardManager) {
          const pool = shardManager['connectionPool'] as DocumentConnectionPool;
          if (pool) {
            const stats = pool.getStatus();
            setConnectionStats({
              activeConnections: stats.activeConnections,
              totalConnections: stats.totalConnections,
              queuedConnections: stats.queuedClients
            });
          }
        }
      }, 5000);
      
      // Auto-connect if enabled
      if (autoConnect) {
        try {
          // For initial setup, we'll load an empty deck
          // The actual slides will be provided by the setVisibleSlides call
          await shardManager.initialize([]);
        } catch (error) {
          // Silent error handling - connection errors are expected during development
        }
      }
      
      // Clean up on unmount
      return () => {
        clearInterval(statsInterval);
        shardManager.destroy();
      };
    };
    
    initializeShardManager();
    
    return () => {
      // Clean up
      if (shardManagerRef.current) {
        shardManagerRef.current.destroy();
        shardManagerRef.current = null;
      }
      
      if (deltaCompressionRef.current) {
        deltaCompressionRef.current = null;
      }
    };
  }, [
    deckId,
    userName,
    userColor,
    wsUrl,
    maxLoadedDocuments,
    persistenceEnabled,
    autoConnect,
    enableDeltaCompression,
    debug
  ]);
  
  // Context value with all the functions for interacting with the sharded documents
  const contextValue = useMemo(() => {
    return {
      isConnected,
      clientId,
      users,
      connectionStats,
      
      // Set currently visible slides
      setVisibleSlides: async (
        slideIds: string[],
        loadMode: 'sync' | 'async' | 'prioritize-current' = 'sync'
      ) => {
        if (!shardManagerRef.current) return;
        
        currentVisibleSlidesRef.current = slideIds;
        await shardManagerRef.current.setVisibleSlides(slideIds, loadMode);
      },
      
      // Get slide data
      getSlideData: async (slideId: string) => {
        if (!shardManagerRef.current) return null;
        
        return shardManagerRef.current.getSlideData(slideId);
      },
      
      // Update slide
      updateSlide: async (slideId: string, data: Partial<SlideData>) => {
        if (!shardManagerRef.current) return;
        
        await shardManagerRef.current.updateSlide(slideId, data);
      },
      
      // Update component
      updateComponent: async (
        slideId: string, 
        componentId: string, 
        props: Partial<ComponentInstance['props']>
      ) => {
        if (!shardManagerRef.current) return;
        
        await shardManagerRef.current.updateComponent(slideId, componentId, props);
      },
      
      // Add component
      addComponent: async (slideId: string, component: ComponentInstance) => {
        if (!shardManagerRef.current) return;
        
        await shardManagerRef.current.addComponent(slideId, component);
      },
      
      // Remove component
      removeComponent: async (slideId: string, componentId: string) => {
        if (!shardManagerRef.current) return;
        
        await shardManagerRef.current.removeComponent(slideId, componentId);
      },
      
      // Update cursor position
      updateCursor: async (slideId: string, x: number, y: number) => {
        if (!shardManagerRef.current) return;
        
        await shardManagerRef.current.updateCursor(slideId, x, y);
      },
      
      // Update selection
      updateSelection: async (slideId: string, componentIds: string[]) => {
        if (!shardManagerRef.current) return;
        
        await shardManagerRef.current.updateSelection(slideId, componentIds);
      },
      
      // Request lock
      requestLock: async (slideId: string, componentId: string) => {
        if (!shardManagerRef.current) {
          return { slideId, componentId, granted: false, error: 'Shard manager not initialized' };
        }
        
        return shardManagerRef.current.requestLock(slideId, componentId);
      },
      
      // Release lock
      releaseLock: async (slideId: string, componentId: string, force = false) => {
        if (!shardManagerRef.current) return false;
        
        return shardManagerRef.current.releaseLock(slideId, componentId, force);
      },
      
      // Check if component is locked
      isComponentLocked: async (slideId: string, componentId: string) => {
        if (!shardManagerRef.current) return false;
        
        const locks = await shardManagerRef.current.getLocksForSlide(slideId);
        return locks.some(lock => lock.componentId === componentId);
      },
      
      // Get component lock
      getComponentLock: async (slideId: string, componentId: string) => {
        if (!shardManagerRef.current) return null;
        
        const locks = await shardManagerRef.current.getLocksForSlide(slideId);
        return locks.find(lock => lock.componentId === componentId) || null;
      },
      
      // Get locks for slide
      getLocksForSlide: async (slideId: string) => {
        if (!shardManagerRef.current) return [];
        
        return shardManagerRef.current.getLocksForSlide(slideId);
      },
      
      // Get owned locks
      getOwnedLocks: async () => {
        // This would need to be implemented in DocumentShardManager
        // For now, we'll return an empty array
        return [];
      },
      
      // Approve lock request
      approveLockRequest: async (slideId: string, componentId: string, userId: string) => {
        // This would need to be implemented in DocumentShardManager
        // For now, we'll return false
        return false;
      },
      
      // Deny lock request
      denyLockRequest: async (slideId: string, componentId: string, userId: string) => {
        // This would need to be implemented in DocumentShardManager
        // For now, we'll return false
        return false;
      }
    } as ShardedYjsContextType;
  }, [isConnected, clientId, users, connectionStats]);
  
  return (
    <ShardedYjsContext.Provider value={contextValue}>
      {children}
    </ShardedYjsContext.Provider>
  );
};

/**
 * Generate a random color for the user
 */
function getRandomColor(): string {
  const colors = [
    '#f44336', '#e91e63', '#9c27b0', '#673ab7', 
    '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
    '#009688', '#4caf50', '#8bc34a', '#cddc39', 
    '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}