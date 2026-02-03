import { useEffect, useRef, useCallback, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useDeckStore } from '../stores/deckStore';
import { createLogger, LogCategory, LogLevel, configureLogging } from '../utils/logging';
import { FontLoadingService } from '../services/FontLoadingService';
import { extractFontFamiliesFromDeck } from '../utils/fontLoaderUtils';
import { useUpgradeSuccess } from '../hooks/useUpgradeSuccess';
import { supabase } from '../integrations/supabase/client';

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

  // Wait for Supabase auth to finish loading before initializing deck data.
  // Without this, initialize() fires before the session is available,
  // causing getAuthTokenAsync() to return null and deck loading to fail.
  // Uses direct supabase client instead of useAuth() to avoid circular imports.
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(() => setIsAuthLoading(false));
  }, []);

  // Get Yjs status if available (using optional chaining to handle potential undefined)
  const getYjsConnectionStatus = useDeckStore(state => (state as any).getYjsConnectionStatus);
  const yjsStatus = getYjsConnectionStatus && getYjsConnectionStatus();

  // Track the last initialized deckId to prevent duplicate runs in StrictMode
  // while still allowing re-initialization when navigating to a different deck
  const lastInitializedDeckIdRef = useRef<string | null>(null);

  // Refetch deck data after upgrade to unlock slides
  const refetchDeck = useCallback(() => {
    const currentDeckId = useDeckStore.getState().deckData?.uuid;
    if (currentDeckId) {
      logger.info('Refetching deck data after upgrade to unlock slides');
      const initializeStore = useDeckStore.getState().initialize;
      if (initializeStore) {
        initializeStore({
          deckId: currentDeckId,
          isNewDeck: false,
          syncEnabled: true,
          useRealtimeSubscription: true,
          forceRefresh: true // Force refetch from server
        });
      }
    }
  }, []);

  // Handle upgrade success - refetch deck to unlock slides
  useUpgradeSuccess({
    onUpgradeSuccess: refetchDeck
  });

  // Listen for upgrade:success event to refetch deck data
  useEffect(() => {
    const handleUpgradeSuccess = () => {
      refetchDeck();
    };

    window.addEventListener('upgrade:success', handleUpgradeSuccess);
    return () => {
      window.removeEventListener('upgrade:success', handleUpgradeSuccess);
    };
  }, [refetchDeck]);

    // Initialize the store when the component mounts
  useEffect(() => {
    // Don't initialize until auth has finished loading.
    // On mobile especially, Supabase needs time to restore the session from
    // localStorage; calling getAuthTokenAsync() before this completes returns
    // null and causes all deck loading to fail permanently.
    if (isAuthLoading) return;

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

    // Skip if we already initialized for this exact deckId (StrictMode protection)
    if (deckId && lastInitializedDeckIdRef.current === deckId) return;
    // Skip if we're on a non-deck page and already cleared
    if (!deckId && lastInitializedDeckIdRef.current === '__no_deck__') return;

    // Reset store when switching decks
    const currentDeckId = useDeckStore.getState().deckData?.uuid;
    if (currentDeckId && deckId && currentDeckId !== deckId) {
      console.log('[DeckStoreInitializer] Switching decks - resetting store');

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
      lastInitializedDeckIdRef.current = deckId;

      const initializeStore = useDeckStore.getState().initialize;
      if (initializeStore) {
        initializeStore({
          deckId,
          isNewDeck,
          syncEnabled: true,
          useRealtimeSubscription: true
        });
      }
    } else if (location.pathname === '/' || location.pathname === '' || location.pathname === '/app') {
      lastInitializedDeckIdRef.current = '__no_deck__';
      // On deck list / landing page - reset store

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
  }, [location, searchParams, isAuthLoading]);
  
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