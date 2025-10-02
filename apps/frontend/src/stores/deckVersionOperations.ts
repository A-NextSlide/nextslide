import { versionHistoryService } from "../lib/versionHistoryService";
import { deckSyncService } from "../lib/deckSyncService";
import { StoreApi } from 'zustand';
import { DeckState } from './deckStoreTypes';

/**
 * This module contains functions for version history operations within the deck store.
 * These are extracted to reduce the complexity of the main deck store file.
 */

/**
 * Creates a version history operations object for the given state setter and getter.
 * @param set Function to set state
 * @param get Function to get state
 */
export const createVersionOperations = (set: StoreApi<DeckState>['setState'], get: StoreApi<DeckState>['getState']) => ({
  // Create a new version of the deck
  createVersion: async (name: string, description?: string, bookmarked: boolean = false, notes?: string) => {
    const { deckData } = get();
    
    try {
      // Set syncing state
      set({ isSyncing: true });
      
      // Create version in backend
      const versionId = await versionHistoryService.createVersion(
        deckData.uuid || '',
        name,
        {
          description,
          deckData,
          isAutoSave: false,
          bookmarked,
          notes
        }
      );
      
      // Update version history
      const versions = await versionHistoryService.getVersionHistory(deckData.uuid || '');
      
      set(state => ({
        versionHistory: {
          ...state.versionHistory,
          versions,
          currentVersionId: versionId,
          pendingChanges: false
        },
        lastSyncTime: new Date(),
        isSyncing: false
      }));
      
      return versionId;
    } catch (error) {
      set({ isSyncing: false });
      return null;
    }
  },
  
  // Restore a deck to a previous version
  restoreVersion: async (versionId: string) => {
    try {
      // Set syncing state
      set({ isSyncing: true });
      
      // Get the version from backend
      const version = await versionHistoryService.getVersion(versionId);
      
      if (!version) {
        set({ isSyncing: false });
        return false;
      }
      
      // We need to preserve the UUID of the deck but use the historical data
      const restoredDeck = {
        ...version.data,
        uuid: get().deckData.uuid,
        lastModified: new Date().toISOString()
      };
      
      // Clear slide cache to force re-render
      get().clearSlideCache();
      
      // Update local state - this will trigger re-renders
      set(state => ({
        deckData: restoredDeck,
        versionHistory: {
          ...state.versionHistory,
          currentVersionId: versionId,
          isViewingHistory: false,
          pendingChanges: false
        },
        lastSyncTime: new Date(),
        isSyncing: false,
        updateInProgress: false // Ensure no pending updates
      }));
      
      // Save the restored version as the current deck
      await deckSyncService.saveDeck(restoredDeck);
      
      // Process any pending updates after restore
      await get().processUpdateQueue();
      
      return true;
    } catch (error) {
      console.error('[restoreVersion] Error restoring version:', error);
      set({ isSyncing: false });
      return false;
    }
  },
  
  // Get version history for the current deck
  getVersionHistory: async () => {
    const { deckData } = get();
    
    try {
      const versions = await versionHistoryService.getVersionHistory(deckData.uuid || '');
      
      set(state => ({
        versionHistory: {
          ...state.versionHistory,
          versions
        }
      }));
      
      return versions;
    } catch (error) {
      return [];
    }
  },
  
  // Update metadata for a specific version
  updateVersionMetadata: async (versionId: string, updates: {
    name?: string;
    description?: string;
    bookmarked?: boolean;
  }) => {
    try {
      const success = await versionHistoryService.updateVersionMetadata(versionId, updates);
      
      if (success) {
        // Refresh the version history
        const versions = await versionHistoryService.getVersionHistory(get().deckData.uuid || '');
        
        set(state => ({
          versionHistory: {
            ...state.versionHistory,
            versions
          }
        }));
      }
      
      return success;
    } catch (error) {
      return false;
    }
  },
  
  // Compare two versions of the deck
  compareVersions: async (versionId1: string, versionId2: string) => {
    try {
      const diff = await versionHistoryService.compareVersions(versionId1, versionId2);
      return diff;
    } catch (error) {
      return {
        addedSlides: [],
        removedSlides: [],
        modifiedSlides: [],
        deckPropertyChanges: []
      };
    }
  },
  
  // Set up auto-save interval for version history
  setAutoSaveInterval: (intervalMs: number | null) => {
    // Clear existing interval if any
    if (get().autoSaveIntervalId) {
      clearInterval(get().autoSaveIntervalId);
    }
    
    if (!intervalMs) {
      set({ autoSaveIntervalId: null });
      return;
    }
    
    // Set up new auto-save interval
    const intervalId = window.setInterval(async () => {
      const { versionHistory, deckData } = get();
      
      // Only auto-save if there are pending changes
      if (versionHistory.pendingChanges) {
        const date = new Date();
        const formattedDate = date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }) + ' ' + date.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit'
        });
        await get().createVersion(`Auto-save ${formattedDate}`, 'Automatically saved version');
      }
    }, intervalMs);
    
    set({ autoSaveIntervalId: intervalId });
  },
});