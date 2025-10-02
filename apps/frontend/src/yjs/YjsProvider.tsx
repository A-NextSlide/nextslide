/**
 * YjsProvider - Core provider for Yjs collaboration
 */
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { YjsDocumentManager } from './YjsDocumentManager';
import { YjsDocOptions, UserPresence, ComponentLock, LockResponse } from './YjsTypes';
import { CompleteDeckData } from '../types/DeckTypes';
import { SlideData } from '../types/SlideTypes';
import { ComponentInstance } from '../types/components';
import { API_CONFIG } from '../config/environment';

// Context type definition
interface YjsContextType {
  // Connection status
  isConnected: boolean;
  isLoading: boolean;
  
  // Document manager
  docManager: YjsDocumentManager | null;
  
  // User presence
  users: UserPresence[];
  clientId: number | null;
  
  // Operations
  initializeFromDeckData: (deckData: CompleteDeckData) => void;
  updateDeckData: (data: Partial<CompleteDeckData>) => void;
  
  // Slide operations
  addSlide: (slide: SlideData) => void;
  updateSlide: (slideId: string, slideData: Partial<SlideData>) => void;
  removeSlide: (slideId: string) => void;
  
  // Component operations
  addComponent: (slideId: string, component: ComponentInstance) => void;
  updateComponent: (slideId: string, componentId: string, props: Partial<ComponentInstance['props']>) => void;
  removeComponent: (slideId: string, componentId: string) => void;
  
  // Cursor tracking
  updateCursor: (slideId: string, x: number, y: number) => void;
  updateSelection: (slideId: string, componentIds: string[]) => void;
  
  // Component locking
  requestLock: (slideId: string, componentId: string) => Promise<LockResponse>;
  releaseLock: (slideId: string, componentId: string, force?: boolean) => boolean;
  isComponentLocked: (slideId: string, componentId: string) => boolean;
  getComponentLock: (slideId: string, componentId: string) => ComponentLock | null;
  getAllLocks: () => ComponentLock[];
  getOwnedLocks: () => ComponentLock[];
  approveLockRequest: (slideId: string, componentId: string, userId: string) => boolean;
  denyLockRequest: (slideId: string, componentId: string, userId: string) => boolean;
}

// Create context with default values
const YjsContext = createContext<YjsContextType>({
  isConnected: false,
  isLoading: true,
  docManager: null,
  users: [],
  clientId: null,
  initializeFromDeckData: () => {},
  updateDeckData: () => {},
  addSlide: () => {},
  updateSlide: () => {},
  removeSlide: () => {},
  addComponent: () => {},
  updateComponent: () => {},
  removeComponent: () => {},
  updateCursor: () => {},
  updateSelection: () => {},
  // Component locking
  requestLock: async () => ({ componentId: '', slideId: '', granted: false }),
  releaseLock: () => false,
  isComponentLocked: () => false,
  getComponentLock: () => null,
  getAllLocks: () => [],
  getOwnedLocks: () => [],
  approveLockRequest: () => false,
  denyLockRequest: () => false,
});

export interface YjsProviderProps {
  children: React.ReactNode;
  docId: string;
  wsUrl?: string;
  userId?: string;
  userName?: string;
  userColor?: string;
  autoConnect?: boolean;
  enablePersistence?: boolean;
}

/**
 * Provider component for Yjs integration
 */
export const YjsProvider: React.FC<YjsProviderProps> = ({
  children,
  docId,
  wsUrl = API_CONFIG.WEBSOCKET_URL || 'wss://slide-websocket.onrender.com',
  userId = `user-${Math.floor(Math.random() * 10000)}`,
  userName = 'Anonymous',
  userColor,
  autoConnect = true,
  enablePersistence = true,
}) => {
  // Log the WebSocket URL being used
  console.log(`YjsProvider: Using WebSocket URL ${wsUrl}`);
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  
  // Refs
  const docManagerRef = useRef<YjsDocumentManager | null>(null);
  
  // Initialize document manager
  useEffect(() => {
    if (docManagerRef.current) {
      docManagerRef.current.destroy();
    }
    
    const options: YjsDocOptions = {
      docId,
      wsUrl,
      autoConnect,
      persistenceEnabled: enablePersistence,
      user: {
        id: userId,
        name: userName,
        color: userColor || `#${Math.floor(Math.random()*16777215).toString(16)}`,
      },
    };
    
    console.log(`[YjsProvider] Initializing YjsDocumentManager with options:`, {
      docId, wsUrl, autoConnect, enablePersistence, userId, userName
    });
    
    const docManager = new YjsDocumentManager(options);
    docManagerRef.current = docManager;
    
    // Store the websocket provider in window for debug access
    if (!window._yProviders) {
      window._yProviders = [];
    }
    
    // Add this provider to the global list if it's not already there
    if (docManager.wsProvider && !window._yProviders.includes(docManager.wsProvider)) {
      window._yProviders.push(docManager.wsProvider);
      
      // Also keep a direct reference to the awareness object for faster access
      if (!window._awareness && docManager.wsProvider.awareness) {
        window._awareness = docManager.wsProvider.awareness;
      }
      
      // Initialize global cursor utilities
      import('./utils/cursorUtils').then(({ initializeGlobalCursorUtils }) => {
        initializeGlobalCursorUtils();
      }).catch(err => {
        // Silently handle import errors
      });
    }
    
    // Set up event listeners
    docManager.on('connected', ({ clientId }) => {
      console.log(`[YjsProvider] Connected with client ID: ${clientId}`);
      setIsConnected(true);
      setClientId(clientId);
      setIsLoading(false);
    });
    
    docManager.on('disconnected', () => {
      console.log(`[YjsProvider] Disconnected from WebSocket server`);
      setIsConnected(false);
    });
    
    docManager.on('awareness-change', ({ users, timestamp }) => {
      // Update state with the new users list
      // This ensures we always have the most up-to-date information
      setUsers(prevUsers => {
        // If the timestamp is older than our current state, don't update
        // This prevents out-of-order updates from causing UI flickering
        const lastUpdate = prevUsers[0]?.lastUpdate || 0;
        if (lastUpdate > timestamp && prevUsers.length > 0) {
          return prevUsers;
        }
        
        // Make sure we preserve self-user if it somehow got filtered out
        if (users.length > 0 && !users.some(u => u.self) && prevUsers.some(u => u.self)) {
          const selfUser = prevUsers.find(u => u.self);
          if (selfUser) {
            return [...users, {...selfUser, lastUpdate: timestamp}];
          }
        }
        
        // Add timestamp to each user for future comparison
        return users.map(user => ({...user, lastUpdate: timestamp}));
      });
    });
    
    // Handle document changes
    docManager.on('document-changed', (data) => {
      // Dispatch a custom event for components to listen to
      const event = new CustomEvent('yjs-document-changed', { detail: data });
      document.dispatchEvent(event);
    });
    
    // Initial connection check - if the WebSocket state is already OPEN, manually set connected
    setTimeout(() => {
      if (docManager.wsProvider?.ws?.readyState === WebSocket.OPEN && !isConnected) {
        console.log('[YjsProvider] Detected open WebSocket connection that hasn\'t fired connected event');
        setIsConnected(true);
        setClientId(docManager.getClientId());
        setIsLoading(false);
      }
    }, 1000);
    
    return () => {
      if (docManagerRef.current) {
        docManagerRef.current.destroy();
        docManagerRef.current = null;
      }
    };
  }, [docId, wsUrl, userId, userName, userColor, autoConnect, enablePersistence]);
  
  // Operation implementations
  const initializeFromDeckData = (deckData: CompleteDeckData) => {
    if (docManagerRef.current) {
      docManagerRef.current.initializeFromDeckData(deckData);
    }
  };
  
  const updateDeckData = (data: Partial<CompleteDeckData>) => {
    if (docManagerRef.current) {
      const metadata: any = {};
      
      if (data.name) metadata.name = data.name;
      if (data.version) metadata.version = data.version;
      if (data.lastModified) metadata.lastModified = data.lastModified;
      if (data.size) metadata.size = data.size;
      
      docManagerRef.current.updateDeckMetadata(metadata);
    }
  };
  
  const addSlide = (slide: SlideData) => {
    if (docManagerRef.current) {
      docManagerRef.current.addSlide(slide);
    }
  };
  
  const updateSlide = (slideId: string, slideData: Partial<SlideData>) => {
    if (docManagerRef.current) {
      docManagerRef.current.updateSlide(slideId, slideData);
    }
  };
  
  const removeSlide = (slideId: string) => {
    if (docManagerRef.current) {
      docManagerRef.current.removeSlide(slideId);
    }
  };
  
  const addComponent = (slideId: string, component: ComponentInstance) => {
    if (docManagerRef.current) {
      docManagerRef.current.addComponent(slideId, component);
    }
  };
  
  const updateComponent = (slideId: string, componentId: string, props: Partial<ComponentInstance['props']>) => {
    if (docManagerRef.current) {
      docManagerRef.current.updateComponent(slideId, componentId, props);
    }
  };
  
  const removeComponent = (slideId: string, componentId: string) => {
    if (docManagerRef.current) {
      docManagerRef.current.removeComponent(slideId, componentId);
    }
  };
  
  // Performance critical path - minimal function for cursor updates
  // This function has been optimized for immediate broadcasting
  const updateCursor = (slideId: string, x: number, y: number) => {
    if (!docManagerRef.current?.wsProvider?.awareness) return;
    
    // Get current awareness state
    const awareness = docManagerRef.current.wsProvider.awareness;
    const currentClientID = awareness.clientID;
    
    // Ensure user info is set before updating cursor
    const existingState = awareness.getLocalState();
    if (!existingState?.user) {
      // If user state doesn't exist, set it first
      awareness.setLocalStateField('user', {
        id: userId,
        name: userName,
        color: userColor || `#${Math.floor(Math.random()*16777215).toString(16)}`,
      });
    }
    
    // Force immediate broadcasting with minimal object creation
    // Using integer values for better performance
    awareness.setLocalStateField('cursor', {
      slideId: slideId || '',
      x: Math.round(x || 0),
      y: Math.round(y || 0),
      t: Date.now() // Timestamp to ensure changes are detected
    });

    // Force immediate update broadcast - this ensures lastUpdate is set
    awareness.setLocalStateField('lastUpdate', Date.now());
    
    // Ensure we flush the awareness update to the network immediately
    try {
      if (docManagerRef.current.wsProvider.shouldConnect) {
        // Explicitly trigger an update event with the current client ID
        awareness.emit('update', [{
          added: [],
          updated: [currentClientID],
          removed: []
        }]);
        
        // Also trigger a change event for better cross-browser compatibility
        awareness.emit('change', {
          added: [],
          updated: [currentClientID],
          removed: []
        });
      }
    } catch (err) {
      console.error('Error emitting awareness update:', err);
    }
  };
  
  const updateSelection = (slideId: string, componentIds: string[]) => {
    if (!docManagerRef.current?.wsProvider?.awareness) return;
    
    // Get current awareness state
    const awareness = docManagerRef.current.wsProvider.awareness;
    const currentClientID = awareness.clientID;
    
    // Ensure user info is set before updating selection
    const existingState = awareness.getLocalState();
    if (!existingState?.user) {
      // If user state doesn't exist, set it first
      awareness.setLocalStateField('user', {
        id: userId,
        name: userName,
        color: userColor || `#${Math.floor(Math.random()*16777215).toString(16)}`,
      });
    }
    
    // Update selection state
    awareness.setLocalStateField('selection', {
      slideId,
      componentIds,
      t: Date.now() // Timestamp to ensure changes are detected
    });
    
    // Force immediate update broadcast
    awareness.setLocalStateField('lastUpdate', Date.now());
    
    // Ensure we flush the awareness update to the network immediately
    try {
      if (docManagerRef.current.wsProvider.shouldConnect) {
        // Explicitly trigger an update event with the current client ID
        awareness.emit('update', [{
          added: [],
          updated: [currentClientID],
          removed: []
        }]);
        
        // Also trigger a change event for better cross-browser compatibility
        awareness.emit('change', {
          added: [],
          updated: [currentClientID],
          removed: []
        });
        
        // Also update the users state to ensure UI reflects the change
        if (docManagerRef.current) {
          const users = docManagerRef.current.getConnectedUsers();
          setUsers(users);
        }
      }
    } catch (err) {
      console.error('Error emitting selection awareness update:', err);
    }
  };
  
  // Component locking methods
  const requestLock = async (slideId: string, componentId: string): Promise<LockResponse> => {
    if (!docManagerRef.current) {
      return { componentId, slideId, granted: false, error: 'Document manager not available' };
    }
    return docManagerRef.current.requestLock(slideId, componentId);
  };
  
  const releaseLock = (slideId: string, componentId: string, force = false): boolean => {
    if (!docManagerRef.current) return false;
    return docManagerRef.current.releaseLock(slideId, componentId, force);
  };
  
  const isComponentLocked = (slideId: string, componentId: string): boolean => {
    if (!docManagerRef.current) return false;
    return docManagerRef.current.isComponentLocked(slideId, componentId);
  };
  
  const getComponentLock = (slideId: string, componentId: string): ComponentLock | null => {
    if (!docManagerRef.current) return null;
    return docManagerRef.current.getComponentLock(slideId, componentId);
  };
  
  const getAllLocks = (): ComponentLock[] => {
    if (!docManagerRef.current) return [];
    return docManagerRef.current.getAllLocks();
  };
  
  const getOwnedLocks = (): ComponentLock[] => {
    if (!docManagerRef.current) return [];
    return docManagerRef.current.getOwnedLocks();
  };
  
  const approveLockRequest = (slideId: string, componentId: string, userId: string): boolean => {
    if (!docManagerRef.current) return false;
    return docManagerRef.current.approveLockRequest(slideId, componentId, userId);
  };
  
  const denyLockRequest = (slideId: string, componentId: string, userId: string): boolean => {
    if (!docManagerRef.current) return false;
    return docManagerRef.current.denyLockRequest(slideId, componentId, userId);
  };

  return (
    <YjsContext.Provider
      value={{
        isConnected,
        isLoading,
        docManager: docManagerRef.current,
        users,
        clientId,
        initializeFromDeckData,
        updateDeckData,
        addSlide,
        updateSlide,
        removeSlide,
        addComponent,
        updateComponent,
        removeComponent,
        updateCursor,
        updateSelection,
        // Component locking
        requestLock,
        releaseLock,
        isComponentLocked,
        getComponentLock,
        getAllLocks,
        getOwnedLocks,
        approveLockRequest,
        denyLockRequest,
      }}
    >
      {children}
    </YjsContext.Provider>
  );
};

/**
 * Hook to use Yjs context
 */
export const useYjs = () => useContext(YjsContext);