import { DeckDiff } from "../utils/apiUtils";
import { createComponent } from "../utils/componentUtils";
import { CompleteDeckData } from "../types/DeckTypes";
import { deckSyncService } from "../lib/deckSyncService";
import { DeckState } from './deckStoreTypes';
import { mergeComponents } from "../utils/slideUtils";
import { v4 as uuidv4 } from 'uuid';
import { applyDeckDiffPure } from "../utils/deckDiffUtils";
import { createLogger, LogCategory } from "../utils/logging";

/**
 * This module contains core functions for deck operations within the deck store.
 * These are extracted to reduce the complexity of the main deck store file.
 */

// Create a logger for store operations
const logger = createLogger(LogCategory.STORE);

// Add a debounce mechanism for deck updates
let updateDebounceTimer: NodeJS.Timeout | null = null;
const DEBOUNCE_DELAY = 300; // 300ms debounce

// Type for update operation
export type UpdateOperation = () => Promise<void>;

/**
 * Creates core deck operations object for the given state setter and getter.
 * @param set Function to set state
 * @param get Function to get state
 */
export const createCoreDeckOperations = (set, get) => {
  
  // Helper function to apply deck updates
  const applyDeckUpdate = (data: Partial<CompleteDeckData>, options: { skipBackend?: boolean, batchUpdate?: boolean } = {}) => {
    const currentDeckData = get().deckData;
    const { skipBackend = false, batchUpdate = false } = options;
    
    // Create an updated deck object with the new data
    const updated = { 
      ...currentDeckData, 
      ...data,
      // Always update lastModified to ensure we detect this as a newer version
      lastModified: data.lastModified || new Date().toISOString(),
    };
    
    // Remove debug properties before saving to backend
    const cleanForBackend = { ...updated };
    delete (cleanForBackend as any).__batchUpdate;
    delete (cleanForBackend as any).__updateSource;
    
    // First update the local state immediately
    set({ 
      deckData: updated,
      versionHistory: {
        ...get().versionHistory,
        pendingChanges: true
      }
    });
    
    // If skip backend is true, don't save to backend
    if (skipBackend) {
      return;
    }
    
    // If this is a draft apply operation, pause subscriptions
    const subscriptionManager = get().subscriptionManager;
    if (batchUpdate && subscriptionManager) {
      subscriptionManager.pause();
    }
    
    // Don't save empty decks to backend to prevent "Untitled Deck" creation
    if (!cleanForBackend.uuid || cleanForBackend.uuid === '' || !cleanForBackend.name || cleanForBackend.name === '') {
      return;
    }

    // Save to backend with the cleaned object
    deckSyncService.saveDeck(cleanForBackend)
      .then(() => {
        // Update lastSyncTime after successful save
        set({ lastSyncTime: new Date() });
        
        // If this was a batch update, resume subscriptions after a delay
        if (batchUpdate && subscriptionManager) {
          // Delay resuming subscription to prevent race conditions
          // Increased delay to give backend more time to process the update
          setTimeout(() => {
            subscriptionManager.resume();
          }, 2000); // Increased from 500ms to 2000ms
        }
      })
      .catch(error => {
        // Degrade to silent error to avoid retry storms during navigation/back
        try { console.warn('[Store] saveDeck failed (non-fatal):', (error as Error)?.message); } catch {}
      });
  };

  return {
    // Process the update queue
    processUpdateQueue: async () => {
      // Lock acquisition - don't continue if we're already processing
      const { updateQueue, updateInProgress } = get();
      
      if (updateInProgress) {
        // Only log when queue is building up significantly
        if (updateQueue.length > 10) {
          logger.debug(`Queue already processing, skipping (queue length: ${updateQueue.length})`);
        }
        return;
      }

      if (updateQueue.length === 0) {
        return;
      }

      // Clear excessive queue if it gets too long (something is wrong)
      if (updateQueue.length > 20) {
        logger.warn(`Queue too long (${updateQueue.length}), clearing excess operations`);
        const critical = updateQueue.slice(0, 3); // Keep only the first 3 operations
        set({ 
          updateQueue: critical,
          updateInProgress: false
        });
        // Wait longer before trying again to prevent loops
        setTimeout(() => {
          const state = get();
          if (state.updateQueue.length > 0 && !state.updateInProgress) {
            get().processUpdateQueue();
          }
        }, 1000);
        return;
      }
      
      // Set the lock
      set({ updateInProgress: true });
      
      // Get the next operation
      const nextUpdate = updateQueue[0];
      
      // Disable subscriptions during operation to prevent feedback loops
      const subscriptionManager = get().subscriptionManager;
      if (subscriptionManager) {
        subscriptionManager.pause();
      }
      
      try {
        // Try 2 times instead of 3 to reduce delays
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await nextUpdate();
            break; // Success - exit retry loop
          } catch (error) {
            if (attempt < 2) {
              const delay = 300 * attempt; // Shorter delays
              logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              logger.error('All retry attempts failed:', error);
              throw error;
            }
          }
        }
        
        // Remove the completed operation
        set(state => ({
          updateQueue: state.updateQueue.slice(1)
        }));
      } catch (error) {
        logger.error('Fatal operation error:', error);
        // Remove the failed operation to prevent blocking the queue
        set(state => ({
          updateQueue: state.updateQueue.slice(1)
        }));
      } finally {
        // Release the lock 
        set({ updateInProgress: false });
        
        // Resume subscription if needed
        if (subscriptionManager) {
          subscriptionManager.resume();
        }
      }
      
      // Process remaining operations with proper throttling
      const remainingQueue = get().updateQueue;
      if (remainingQueue.length > 0) {
        // Use longer delay and check for excessive calls to prevent infinite loops
        setTimeout(() => {
          const state = get();
          if (state.updateQueue.length > 0 && !state.updateInProgress) {
            // Only process if we're not in an infinite loop scenario
            if (state.updateQueue.length < 10) {
              get().processUpdateQueue();
            } else {
              logger.warn('Queue growth detected, pausing processing to prevent infinite loop');
            }
          }
        }, 200); // Increased delay to allow UI to settle
      }
    },
    
    // Schedule an update operation on the queue with throttling
    scheduleUpdate: (updateFn: UpdateOperation) => {
      const currentQueue = get().updateQueue;
      
      // TEMPORARILY DISABLE UPDATE QUEUE TO PREVENT INFINITE LOOPS
      // Just execute the update immediately for now
      logger.debug('Executing update immediately (queue temporarily disabled)');
      
      try {
        updateFn().catch(error => {
          logger.error('Update function failed:', error);
        });
      } catch (error) {
        logger.error('Sync update function failed:', error);
      }
      
      return;
      
      // Original queue logic (disabled for now)
      /*
      // Increase queue size limit and add better management
      const MAX_QUEUE_SIZE = 50;
      const WARN_QUEUE_SIZE = 30;
      
      // If queue is getting large, just warn but don't drop operations
      if (currentQueue.length >= WARN_QUEUE_SIZE && currentQueue.length < MAX_QUEUE_SIZE) {
        logger.debug(`Update queue getting large (${currentQueue.length} operations)`);
      }
      
      // Only drop operations if we hit the absolute maximum
      if (currentQueue.length >= MAX_QUEUE_SIZE) {
        logger.warn(`Update queue at maximum capacity (${MAX_QUEUE_SIZE}), dropping oldest operation`);
        // Remove the oldest operation to make room
        set(state => ({
          updateQueue: [...state.updateQueue.slice(1), updateFn]
        }));
        return;
      }
      
      // Add operation to the queue
      set(state => ({
        updateQueue: [...state.updateQueue, updateFn]
      }));
      
      // Only initiate processing if not already in progress
      const state = get();
      if (!state.updateInProgress) {
        // Use a small delay to batch multiple rapid updates
        setTimeout(() => {
          const currentState = get();
          if (!currentState.updateInProgress) {
            get().processUpdateQueue();
          }
        }, 50);
      }
      */
    },

    // Generate a new version ID for the deck
    generateNewVersion: () => {
      return {
        version: uuidv4(),
        lastModified: new Date().toISOString()
      };
    },
    
    // Update deck data action with debouncing to minimize renders
    updateDeckData: (data: Partial<CompleteDeckData>, options: { skipBackend?: boolean, batchUpdate?: boolean, isRealtimeUpdate?: boolean } = {}) => {
      const currentDeckData = get().deckData;
      const { skipBackend = false, batchUpdate = false, isRealtimeUpdate = false } = options;
      
      // For realtime updates, check if it's a streaming update that needs immediate processing
      if (isRealtimeUpdate) {
        // Check if any slides are in streaming state - if so, apply immediately
        const hasStreamingSlides = data.slides && data.slides.some((slide: any) => 
          slide.status === 'streaming'
        );
        
        if (hasStreamingSlides) {
          // Apply streaming updates immediately for real-time feedback
          applyDeckUpdate(data, { skipBackend: true, batchUpdate: false });
          return;
        }
        
        // For non-streaming updates, use debouncing
        if (updateDebounceTimer) {
          clearTimeout(updateDebounceTimer);
        }
        
        updateDebounceTimer = setTimeout(() => {
          // Check if we're in an edit mode transition - if so, skip the update
          const editModeTransitionStore = (window as any).__editModeTransitionStore;
          if (editModeTransitionStore && editModeTransitionStore.getState().isInTransition) {
            logger.debug('Skipping realtime update - edit mode transition in progress');
            return;
          }
          
          // Check if we're applying draft changes - if so, skip the update
          if ((window as any).__applyingDraftChanges) {
            logger.debug('Skipping realtime update - draft changes being applied');
            return;
          }
          
          // Check if the data is actually different before updating
          const currentData = get().deckData;
          const newLastModified = data.lastModified;
          
          // Prefer content diffs over timestamp when realtime payload includes slides
          let slidesAreIdentical = false;
          if (data.slides && currentData.slides) {
            try {
              slidesAreIdentical = JSON.stringify(data.slides) === JSON.stringify(currentData.slides);
            } catch { slidesAreIdentical = false; }
          }

          // More aggressive checks to prevent unnecessary updates, but do NOT block if content differs
          if (slidesAreIdentical) {
            if (newLastModified && currentData.lastModified && newLastModified <= currentData.lastModified) {
              logger.debug('Skipping realtime update - local data is newer or same (and content identical)');
              return;
            }
            // If content identical regardless of timestamps, skip
            logger.debug('Skipping realtime update - slide content is identical');
            return;
          }
          
          // During generation, only update if we have more slides or newer content
          const currentSlideCount = currentData.slides?.length || 0;
          const newSlideCount = data.slides?.length || 0;
          
          // If we're losing slides, skip the update (likely stale data)
          if (newSlideCount < currentSlideCount && currentSlideCount > 0) {
            logger.debug(`Skipping realtime update - would lose slides (${currentSlideCount} -> ${newSlideCount})`);
            return;
          }
          
          // CRITICAL: Prevent overwriting slides with content with empty slides
          if (data.slides && currentData.slides) {
            for (let i = 0; i < currentData.slides.length; i++) {
              const currentSlide = currentData.slides[i];
              const newSlide = data.slides[i];
              
              if (!newSlide) continue;
              
              // If current slide has components but new slide is empty, this is likely stale data
              const currentHasContent = currentSlide.components && currentSlide.components.length > 0;
              const newIsEmpty = !newSlide.components || newSlide.components.length === 0;
              
              if (currentHasContent && newIsEmpty) {
                logger.warn(`⚠️ Realtime update would clear components from slide ${currentSlide.id}. Skipping update.`);
                return;
              }
              
              // Check if we recently saved (within last 3 seconds) - if so, skip realtime updates
              // to avoid overwriting fresh local changes with stale server data
              const lastSyncTime = get().lastSyncTime;
              if (lastSyncTime) {
                const timeSinceSync = Date.now() - lastSyncTime.getTime();
                if (timeSinceSync < 3000) {
                  logger.debug(`Skipping realtime update - recently synced ${timeSinceSync}ms ago`);
                  return;
                }
              }
            }
          }
          
          // Before applying, defensively merge slides to avoid clobbering completed slides
          if (data.slides && currentData.slides && Array.isArray(data.slides)) {
            try {
              const mergedSlides = data.slides.map((incoming: any, i: number) => {
                const current = currentData.slides[i];
                if (!current) return incoming;
                const currentCompleted = current.status === 'completed';
                const incomingCompleted = incoming.status === 'completed';
                const currentComps = Array.isArray(current.components) ? current.components : [];
                const incomingComps = Array.isArray(incoming.components) ? incoming.components : [];
                // Preserve stable IDs to prevent remounts
                const id = current.id || incoming.id;
                // Prevent status downgrade for realtime payloads
                const status = currentCompleted && !incomingCompleted ? 'completed' : (incoming.status || current.status);
                
                // Merge components preserving recent local position changes
                let components;
                if (currentComps.length > 0 && incomingComps.length > 0) {
                  // Create a map of incoming components by ID
                  const incomingMap = new Map(incomingComps.map((c: any) => [c.id, c]));
                  
                  // Merge components, preserving local positions if we recently saved
                  components = currentComps.map((currentComp: any) => {
                    const incomingComp = incomingMap.get(currentComp.id);
                    if (!incomingComp) return currentComp;
                    
                    // If we recently saved (within 3 seconds), preserve current positions
                    const lastSyncTime = get().lastSyncTime;
                    const shouldPreservePosition = lastSyncTime && 
                      (Date.now() - lastSyncTime.getTime()) < 3000;
                    
                    if (shouldPreservePosition && currentComp.props?.position) {
                      // Keep current position but take other updates from incoming
                      return {
                        ...incomingComp,
                        props: {
                          ...incomingComp.props,
                          position: currentComp.props.position
                        }
                      };
                    }
                    
                    return incomingComp;
                  });
                  
                  // Add any new components from incoming that aren't in current
                  const currentIds = new Set(currentComps.map((c: any) => c.id));
                  incomingComps.forEach((comp: any) => {
                    if (!currentIds.has(comp.id)) {
                      components.push(comp);
                    }
                  });
                } else {
                  // Prefer richer content: if current has more components, keep them
                  components = currentComps.length > incomingComps.length && currentComps.length > 0
                    ? currentComps
                    : incomingComps;
                }
                
                return { ...incoming, id, status, components };
              });
              data = { ...data, slides: mergedSlides };
            } catch {
              // If merge fails for any reason, fall back to incoming data
            }
          }
          // Apply the update
          applyDeckUpdate(data, { skipBackend: true, batchUpdate: false });
        }, DEBOUNCE_DELAY);
        
        return;
      }
      
      // For non-realtime updates, defensively merge slides to avoid status/content regressions
      if (data.slides && Array.isArray(data.slides)) {
        try {
          const currentData = get().deckData;
          const mergedSlides = data.slides.map((incoming: any, i: number) => {
            const current = currentData.slides?.[i];
            if (!current) return incoming;
            const currentCompleted = current.status === 'completed';
            const incomingCompleted = incoming.status === 'completed';
            const currentComps = Array.isArray(current.components) ? current.components : [];
            const incomingComps = Array.isArray(incoming.components) ? incoming.components : [];
            const id = current.id || incoming.id;
            const status = currentCompleted && !incomingCompleted ? 'completed' : (incoming.status || current.status);
            
            // For batch updates, always preserve current components to avoid position resets
            let components;
            if (batchUpdate && currentComps.length > 0) {
              // For batch updates, we're applying draft changes, so use incoming components
              // which should have the correct positions from the draft
              components = incomingComps;
            } else {
              // For other updates, prefer richer content
              components = currentComps.length > incomingComps.length && currentComps.length > 0
                ? currentComps
                : incomingComps;
            }
            
            return { ...incoming, id, status, components };
          });
          data = { ...data, slides: mergedSlides };
        } catch {}
      }
      applyDeckUpdate(data, { skipBackend, batchUpdate });
    },
    
    // Apply deck diff action using the pure function
    applyDeckDiff: (deckDiff: DeckDiff) => {
      const currentDeckData = get().deckData;
      
      // Use the pure function to apply the diff
      const updatedDeck = applyDeckDiffPure(currentDeckData, deckDiff);
      
      // Only update if something changed
      if (updatedDeck !== currentDeckData) {
        // Generate a new version to ensure consistency
        const versionInfo = get().generateNewVersion();
        
        // Update the deck with the new version info
        get().updateDeckData({
          ...updatedDeck,
          ...versionInfo
        });
      }
    }
  };
};