/**
 * deckStoreYjsSlice - Zustand store slice for Yjs integration
 * 
 * This slice:
 * 1. Provides state for Yjs collaboration features
 * 2. Connects the deck store with the ShardedYjs adapter
 * 3. Synchronizes operations between local state and Yjs documents
 */

import { StateCreator } from 'zustand';
import { DeckStore } from './deckStore';
import { DeckYjsAdapter } from './DeckYjsAdapter';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';

export interface YjsSliceState {
  // Adapter for Yjs operations
  yjsAdapter: DeckYjsAdapter | null;
  
  // Whether synchronization is enabled
  yjsSyncEnabled: boolean;
  
  // Set the adapter instance
  setYjsAdapter: (adapter: DeckYjsAdapter | null) => void;
  
  // Enable/disable Yjs synchronization
  setYjsSyncEnabled: (enabled: boolean) => void;
  
  // Get current connection status
  getYjsConnectionStatus: () => {
    isEnabled: boolean;
    isConnected: boolean;
  };
  
  // Update a slide through Yjs
  updateSlideViaYjs: (slideId: string, data: Partial<SlideData>) => Promise<void>;
  
  // Update a component through Yjs
  updateComponentViaYjs: (
    slideId: string, 
    componentId: string, 
    updates: Partial<ComponentInstance['props']>
  ) => Promise<void>;
  
  // Add a component through Yjs
  addComponentViaYjs: (slideId: string, component: ComponentInstance) => Promise<void>;
  
  // Remove a component through Yjs
  removeComponentViaYjs: (slideId: string, componentId: string) => Promise<void>;
  
  // Get locks owned by the current user
  getOwnedLocks: () => any[];
}

const createYjsSlice: StateCreator<
  DeckStore,
  [],
  [],
  YjsSliceState
> = (set, get) => ({
  // Initial state
  yjsAdapter: null,
  yjsSyncEnabled: true,
  
  // Set the adapter instance
  setYjsAdapter: (adapter) => {
    set({ yjsAdapter: adapter });
  },
  
  // Enable/disable synchronization
  setYjsSyncEnabled: (enabled) => {
    set({ yjsSyncEnabled: enabled });
    
    // When re-enabling, we need to update the adapter with currently visible slides
    if (enabled && get().yjsAdapter) {
      // This would be implemented with visible slides tracking logic
    }
  },
  
  // Get current connection status
  getYjsConnectionStatus: () => {
    const adapter = get().yjsAdapter;
    const isEnabled = get().yjsSyncEnabled;
    
    return {
      isEnabled,
      isConnected: isEnabled && adapter !== null
    };
  },
  
  // Update a slide through Yjs
  updateSlideViaYjs: async (slideId, data) => {
    const adapter = get().yjsAdapter;
    const isEnabled = get().yjsSyncEnabled;
    
    if (!adapter || !isEnabled) {
      return;
    }
    
    try {
      await adapter.updateSlide(slideId, data);
    } catch (error) {
      console.error('Failed to update slide via Yjs:', error);
    }
  },
  
  // Update a component through Yjs
  updateComponentViaYjs: async (slideId, componentId, updates) => {
    const adapter = get().yjsAdapter;
    const isEnabled = get().yjsSyncEnabled;
    
    if (!adapter || !isEnabled) {
      return;
    }
    
    try {
      await adapter.updateComponent(slideId, componentId, updates);
    } catch (error) {
      console.error('Failed to update component via Yjs:', error);
    }
  },
  
  // Add a component through Yjs
  addComponentViaYjs: async (slideId, component) => {
    const adapter = get().yjsAdapter;
    const isEnabled = get().yjsSyncEnabled;
    
    if (!adapter || !isEnabled) {
      return;
    }
    
    try {
      await adapter.addComponent(slideId, component);
    } catch (error) {
      console.error('Failed to add component via Yjs:', error);
    }
  },
  
  // Remove a component through Yjs
  removeComponentViaYjs: async (slideId, componentId) => {
    const adapter = get().yjsAdapter;
    const isEnabled = get().yjsSyncEnabled;
    
    if (!adapter || !isEnabled) {
      return;
    }
    
    try {
      await adapter.removeComponent(slideId, componentId);
    } catch (error) {
      console.error('Failed to remove component via Yjs:', error);
    }
  },
  
  // Get locks owned by the current user
  getOwnedLocks: () => {
    // This would need to be implemented with actual lock data
    return [];
  }
});

export default createYjsSlice;