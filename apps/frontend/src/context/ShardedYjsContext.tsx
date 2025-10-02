/**
 * ShardedYjsContext - Context provider for integrating ShardedYjs with the application
 * 
 * This context:
 * 1. Provides a connection between DeckStore and ShardedYjsProvider
 * 2. Sets up the adapter and manages collaboration state
 * 3. Automatically tracks visible slides and manages document loading
 */

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { ShardedYjsProvider, useShardedYjs } from '@/yjs/ShardedYjsProvider';
import { useDeckStore } from '@/stores/deckStore';
import { DeckYjsAdapter } from '@/stores/DeckYjsAdapter';
import { useNavigationContext } from '@/context/NavigationContext';
import { ComponentInstance } from '@/types/components';
import { SlideData } from '@/types/SlideTypes';

interface ShardedYjsContextValue {
  // Central adapter for Yjs operations
  adapter: DeckYjsAdapter | null;
  
  // Connection status
  isConnected: boolean;
  
  // Currently visible slides
  visibleSlideIds: string[];
  
  // Connected users
  connectedUsers: any[];
  
  // Whether Yjs synchronization is enabled
  isSyncEnabled: boolean;
  
  // Toggle synchronization
  toggleSync: (enabled: boolean) => void;
  
  // Connection metrics
  connectionStats: {
    activeConnections: number;
    totalConnections: number;
    queuedConnections: number;
  };
}

const ShardedYjsContext = createContext<ShardedYjsContextValue>({
  adapter: null,
  isConnected: false,
  visibleSlideIds: [],
  connectedUsers: [],
  isSyncEnabled: false,
  toggleSync: () => {},
  connectionStats: {
    activeConnections: 0,
    totalConnections: 0,
    queuedConnections: 0
  }
});

export const useShardedYjsContext = () => useContext(ShardedYjsContext);

interface ShardedYjsProviderWrapperProps {
  children: React.ReactNode;
  deckId: string;
  userName: string;
  userColor?: string;
  wsUrl: string;
  maxLoadedDocuments?: number;
  persistenceEnabled?: boolean;
  enableDeltaCompression?: boolean;
}

export const ShardedYjsContextProvider: React.FC<ShardedYjsProviderWrapperProps> = ({
  children,
  deckId,
  userName,
  userColor,
  wsUrl,
  maxLoadedDocuments = 5,
  persistenceEnabled = true,
  enableDeltaCompression = true
}) => {
  // Track if synchronization is enabled
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  
  // Provider for actual ShardedYjs
  return (
    <ShardedYjsProvider
      deckId={deckId}
      userName={userName}
      userColor={userColor}
      wsUrl={wsUrl}
      maxLoadedDocuments={maxLoadedDocuments}
      persistenceEnabled={persistenceEnabled}
      autoConnect={isSyncEnabled}
      enableDeltaCompression={enableDeltaCompression}
    >
      <ShardedYjsContextConsumer
        isSyncEnabled={isSyncEnabled}
        setIsSyncEnabled={setIsSyncEnabled}
      >
        {children}
      </ShardedYjsContextConsumer>
    </ShardedYjsProvider>
  );
};

interface ShardedYjsContextConsumerProps {
  children: React.ReactNode;
  isSyncEnabled: boolean;
  setIsSyncEnabled: (enabled: boolean) => void;
}

const ShardedYjsContextConsumer: React.FC<ShardedYjsContextConsumerProps> = ({
  children,
  isSyncEnabled,
  setIsSyncEnabled
}) => {
  // Get the raw Yjs context for low-level operations
  const yjsContext = useShardedYjs();
  
  // Get navigation context for tracking current slide
  const navigation = useNavigationContext();
  
  // Track visible slides
  const [visibleSlideIds, setVisibleSlideIds] = useState<string[]>([]);
  
  // Create the adapter for DeckStore integration
  const adapter = useMemo(() => {
    if (!yjsContext) return null;
    return new DeckYjsAdapter(yjsContext);
  }, [yjsContext]);
  
  // Track previous slide IDs to avoid unnecessary updates
  const prevVisibleSlidesRef = useRef<string[]>([]);

  // Update visible slides when current slide changes
  useEffect(() => {
    if (!adapter || !navigation) return;
    
    // Get the current slide and its adjacent slides
    const allSlides = useDeckStore.getState().slides;
    if (!allSlides.length) return;
    
    const currentIndex = navigation.currentSlideIndex;
    const currentId = allSlides[currentIndex]?.id;
    
    if (!currentId) return;
    
    // Include adjacent slides
    const visibleIds = [currentId];
    
    // Add previous slide if it exists
    if (currentIndex > 0) {
      visibleIds.unshift(allSlides[currentIndex - 1].id);
    }
    
    // Add next slide if it exists
    if (currentIndex < allSlides.length - 1) {
      visibleIds.push(allSlides[currentIndex + 1].id);
    }
    
    // Skip updates if the visible slide set hasn't changed
    // This prevents repeated subscription setup/teardown
    const prevVisibleSlides = prevVisibleSlidesRef.current;
    const sameSlides = 
      prevVisibleSlides.length === visibleIds.length && 
      prevVisibleSlides.every(id => visibleIds.includes(id));
    
    if (sameSlides) {
      return; // Exit early if the slide set hasn't changed
    }
    
    // Update visible slides
    setVisibleSlideIds(visibleIds);
    prevVisibleSlidesRef.current = [...visibleIds];
    
    // Update adapter with visible slides if sync is enabled
    // Use prioritize-current loading mode to improve UI responsiveness:
    // - Current slide loads synchronously so it displays immediately
    // - Adjacent slides load asynchronously in the background
    if (isSyncEnabled && adapter) {
      setTimeout(() => {
        adapter.setVisibleSlides(visibleIds, 'prioritize-current');
      }, 0);
    }
  }, [adapter, navigation?.currentSlideIndex, isSyncEnabled]);
  
  // Context value with the adapter and connection state
  const contextValue = useMemo(() => ({
    adapter,
    isConnected: yjsContext?.isConnected ?? false,
    visibleSlideIds,
    connectedUsers: yjsContext?.users ?? [],
    isSyncEnabled,
    toggleSync: setIsSyncEnabled,
    connectionStats: yjsContext?.connectionStats ?? {
      activeConnections: 0,
      totalConnections: 0, 
      queuedConnections: 0
    }
  }), [
    adapter,
    yjsContext?.isConnected,
    visibleSlideIds,
    yjsContext?.users,
    isSyncEnabled,
    yjsContext?.connectionStats
  ]);
  
  return (
    <ShardedYjsContext.Provider value={contextValue}>
      {children}
    </ShardedYjsContext.Provider>
  );
};

export default ShardedYjsContextProvider;