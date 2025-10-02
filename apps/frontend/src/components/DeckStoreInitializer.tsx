import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useDeckStore } from '../stores/deckStore';
import { createLogger, LogCategory, LogLevel, configureLogging } from '../utils/logging';
import { FontLoadingService } from '../services/FontLoadingService';
import { extractFontFamiliesFromDeck } from '../utils/fontLoaderUtils';

interface DeckStoreInitializerProps {
  syncEnabled?: boolean;
  useRealtimeSubscription?: boolean;
  autoSyncInterval?: number;
  onSyncUpdate?: (isSyncing: boolean, lastSyncTime: Date | null) => void;
  collaborationEnabled?: boolean;
  collaborationUrl?: string;
}

// Create a logger for this component
const logger = createLogger(LogCategory.STORE);

// Configure logging levels to minimize noise
configureLogging({
  globalLevel: LogLevel.INFO,  // Show only INFO and above by default
  categoryLevels: {
    [LogCategory.STORE]: LogLevel.INFO,
    [LogCategory.REGISTRY]: LogLevel.INFO,
    [LogCategory.YJS]: LogLevel.WARN,  // Only show warnings and errors for YJS
    [LogCategory.COLLABORATION]: LogLevel.WARN
  }
});

/**
 * Component that initializes the deck store and handles cleanup
 * Place this high in your component tree to ensure the store is initialized early
 */
export function DeckStoreInitializer({
  syncEnabled = true,
  useRealtimeSubscription = true,
  autoSyncInterval = 30000, // Default to 30 seconds
  onSyncUpdate,
  collaborationEnabled = false,
  collaborationUrl = undefined // Will use the environment config
}: DeckStoreInitializerProps) {
  const initialize = useDeckStore(state => state.initialize);
  const isSyncing = useDeckStore(state => state.isSyncing);
  const lastSyncTime = useDeckStore(state => state.lastSyncTime);
  const deckData = useDeckStore(state => state.deckData);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Get Yjs status if available (using optional chaining to handle potential undefined)
  const getYjsConnectionStatus = useDeckStore(state => (state as any).getYjsConnectionStatus);
  const yjsStatus = getYjsConnectionStatus && getYjsConnectionStatus();

  // Track if we've already initialized to prevent duplicate runs in StrictMode
  const hasInitializedRef = useRef(false);
  
    // Initialize the store when the component mounts
  useEffect(() => {
    // Skip if already initialized (StrictMode protection)
    if (hasInitializedRef.current) return;
    
    // Extract deckId from URL if present
    const extractDeckIdFromUrl = () => {
      const pathParts = location.pathname.split('/');
      const deckIndex = pathParts.findIndex(part => part === 'deck');
      
      if (deckIndex !== -1 && deckIndex + 1 < pathParts.length) {
        return pathParts[deckIndex + 1];
      }
      
      // Fallback to editor for backwards compatibility
      const editorIndex = pathParts.findIndex(part => part === 'editor');
      if (editorIndex !== -1 && editorIndex + 1 < pathParts.length) {
        return pathParts[editorIndex + 1];
      }
      
      return null; // Return null instead of undefined
    };

    const deckId = extractDeckIdFromUrl();
    
    // Check if this is a new deck from search params
    const isNewDeck = searchParams.get('new') === 'true';
    
    // Reset store when switching decks
    const currentDeckId = useDeckStore.getState().deckData?.uuid;
    if (currentDeckId && deckId && currentDeckId !== deckId) {
      console.log('🔄 Switching decks - resetting store');
      
      // Clear editor store first
      try {
        const editorStore = (window as any).__editorStore;
        if (editorStore && editorStore.getState) {
          const clearDrafts = editorStore.getState().clearDraftComponents;
          if (clearDrafts) {
            clearDrafts();
          }
        }
      } catch (e) {
        console.warn('Failed to clear editor store:', e);
      }
      
      // Clear WebSocket position sync state
      if (typeof window !== 'undefined') {
        // Clear remote component layouts
        if ((window as any).__remoteComponentLayouts) {
          (window as any).__remoteComponentLayouts.clear();
        }
      }
      
      const resetStore = useDeckStore.getState().resetStore;
      if (resetStore) {
        resetStore();
      }
    }
    
    // Initialize sync if we have a deckId
          if (deckId) {
        hasInitializedRef.current = true;
      
      const initializeStore = useDeckStore.getState().initialize;
    if (initializeStore) {
        initializeStore({ 
          deckId, 
          isNewDeck,
          syncEnabled: true 
        });
      }
    } else if (location.pathname === '/' || location.pathname === '') {
      hasInitializedRef.current = true;
      // On deck list page - reset store

      const resetStore = useDeckStore.getState().resetStore;
      if (resetStore) {
        resetStore();
      }
      
      // Initialize with no deck
      const initializeStore = useDeckStore.getState().initialize;
      if (initializeStore) {
        initializeStore({ 
          deckId: null,
          isNewDeck: false,
          syncEnabled: false 
        });
      }
    }
    // Clear unmounting flag after initialization completes
    try { (window as any).__isUnmounting = false; } catch {}
  }, [location, searchParams]);
  
  // Preload all fonts used in the deck when deck data changes
  useEffect(() => {
    if (deckData && deckData.slides && deckData.slides.length > 0) {
      // Extract all font families from the deck
      const fontFamilies = extractFontFamiliesFromDeck(deckData);
      
      if (fontFamilies.length > 0) {
        logger.info(`Preloading ${fontFamilies.length} fonts used in the deck`);
        // Normalize and de-dupe names before loading
        const unique = Array.from(new Set(fontFamilies.map(n => (n || '').trim())));
        FontLoadingService.loadFonts(unique).catch(err => {
          logger.warn(`Error preloading fonts: ${err.message}`);
        });
      }
    }
  }, [deckData]);
  
  // Call onSyncUpdate when sync state changes
  useEffect(() => {
    if (onSyncUpdate) {
      onSyncUpdate(isSyncing, lastSyncTime);
    }
  }, [isSyncing, lastSyncTime, onSyncUpdate]);
  
  // Log collaboration status when it changes, but only at INFO level
  useEffect(() => {
    if (yjsStatus && typeof yjsStatus === 'object') {
      const statusText = yjsStatus.isConnected ? 'connected' : 'disconnected';
      logger.info(`Collaboration status: ${statusText} (enabled: ${yjsStatus.isEnabled})`);
    }
  }, [yjsStatus]);
  
  // This component doesn't render anything
  return null;
} 