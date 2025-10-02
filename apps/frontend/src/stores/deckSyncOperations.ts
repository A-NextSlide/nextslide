import { supabase } from "../integrations/supabase/client";
import { deckSyncService } from "../lib/deckSyncService";
import { CompleteDeckData } from "../types/DeckTypes";
import { 
  createEmptyDeck, 
  createMinimalDeck, 
  generateDeckId, 
  DEFAULT_SLIDE_WIDTH, 
  DEFAULT_SLIDE_HEIGHT 
} from "../utils/deckUtils";
import { createBlankSlide } from "../utils/slideUtils";
import { createComponent } from "../utils/componentUtils";
import { v4 as uuidv4 } from 'uuid';
import { API_CONFIG } from "../config/environment";
import { SubscriptionManager } from "../utils/SubscriptionManager";
import { authService } from "../services/authService";

/**
 * This module contains functions for synchronization operations within the deck store.
 * These are extracted to reduce the complexity of the main deck store file.
 */

/**
 * Validates if a string is a proper UUID
 * @param uuid String to validate
 * @returns Boolean indicating if the string is a valid UUID
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Normalize deck data coming from backend to ensure TiptapTextBlock components use proper format
 */
function normalizeDeckData(deck: any): any {
  if (!deck || !deck.slides) return deck;
  
  return {
    ...deck,
    slides: deck.slides.map((slide: any) => ({
      ...slide,
      components: slide.components?.map((component: any) => {
        // Normalize Background component props from various backend shapes
        try {
          if (component?.type === 'Background') {
            const next = { ...component };
            next.props = { ...(component.props || {}) };
            const styles = component.styles || component.style || {};
            const nestedBg = (component.props && component.props.background) || {};
            const colorCandidate =
              styles?.background?.color ||
              styles?.backgroundColor ||
              styles?.color ||
              nestedBg?.color ||
              component.props?.backgroundColor ||
              component.props?.color;
            if (colorCandidate) {
              if (!next.props.backgroundType || next.props.backgroundType === 'solid') {
                next.props.backgroundType = 'color';
              }
              next.props.backgroundColor = colorCandidate;
              // Clean up deprecated/nested forms to avoid confusion
              if (next.props.background && next.props.background.color) {
                try { delete next.props.background; } catch {}
              }
              // Optional: don't rely on styles for background color
              // keep styles object intact but renderer uses props
              // Quiet: remove noisy background normalization logs
            }
            return next;
          }
        } catch {}
        
        // Only process TiptapTextBlock components for text normalization
        if (component.type !== 'TiptapTextBlock' || !component.props?.texts) {
          return component;
        }
        
        const texts = component.props.texts;
        
        // Already in correct format
        if (texts && texts.type === 'doc' && texts.content) {
          return component;
        }
        
        // Debug logging removed for performance
        
        // Convert legacy array format to proper Tiptap format
        let normalizedTexts;
        if (Array.isArray(texts)) {
          const content: any[] = [];
          
          texts.forEach((item: any) => {
            if (item.type === 'paragraph' && typeof item.content === 'string') {
              // Legacy: [{"type":"paragraph","content":"string"}]
              content.push({
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: item.content,
                    style: item.style || {}
                  }
                ]
              });
            } else if (item.type === 'heading' && typeof item.content === 'string') {
              // Legacy: [{"type":"heading","content":"string"}]
              content.push({
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: item.content,
                    style: item.style || {}
                  }
                ]
              });
            } else if (item.text && typeof item.text === 'string') {
              // Backend format: [{ "text": "some text", "style": {} }]
              // This is the most common format from the backend
              content.push({
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: item.text,
                    style: item.style || {}
                  }
                ]
              });
            } else if (typeof item === 'string') {
              // Pure string in array
              content.push({
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: item,
                    style: {}
                  }
                ]
              });
            }
          });
          
          normalizedTexts = {
            type: 'doc',
            content: content.length > 0 ? content : [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: '',
                    style: {}
                  }
                ]
              }
            ]
          };
        } else if (typeof texts === 'string') {
          // Single string
          normalizedTexts = {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: texts,
                    style: {}
                  }
                ]
              }
            ]
          };
        } else {
          // Fallback - try to extract any text content
          let fallbackText = '';
          
          // Try to extract text from unexpected format
          if (texts && typeof texts === 'object' && !Array.isArray(texts)) {
            // Check for common text properties
            if (texts.text) fallbackText = String(texts.text);
            else if (texts.content) fallbackText = String(texts.content);
            else if (texts.value) fallbackText = String(texts.value);
          }
          
          // Log unexpected format for debugging
          console.warn('[normalizeDeckData] Unexpected texts format, using fallback:', {
            componentId: component.id,
            texts,
            fallbackText
          });
          
          normalizedTexts = {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: fallbackText || 'Text content',
                    style: {}
                  }
                ]
              }
            ]
          };
        }
        
        return {
          ...component,
          props: {
            ...component.props,
            texts: normalizedTexts
          }
        };
      }) || []
    }))
  };
}

// Interface for initialize options
interface InitializeOptions {
  syncEnabled?: boolean;
  useRealtimeSubscription?: boolean;
  autoSyncInterval?: number;
  deckId?: string | null;
  collaborationEnabled?: boolean;
  collaborationUrl?: string;
  isNewDeck?: boolean;
}

/**
 * Creates a sync operations object for the given state setter and getter.
 */
export const createSyncOperations = (set: Function, get: Function) => {
  // Add state for tracking deck creation
  let isCreatingDeck = false;
  let realtimeFetchTimeout: NodeJS.Timeout | null = null;
  
  // Create singleton subscription manager
  const subscriptionManager = new SubscriptionManager(
    // Setup callback
    () => {
      const setupRealtimeSub = get().setupRealtimeSubscription;
      if (setupRealtimeSub) {
        setupRealtimeSub();
      }
    },
    // Cleanup callback
    () => {
      const cleanupSub = get().cleanupRealtimeSubscription;
      if (cleanupSub) {
        cleanupSub();
      }
    }
  );
  
  // Set up real-time subscription to deck changes
  const setupRealtimeSubscription = () => {
    // Clean up any existing subscription first
    get().cleanupRealtimeSubscription();
    
    // Get the current deck ID
    const currentDeckId = get().deckData?.uuid;
    if (!currentDeckId) {
      console.log('[setupRealtimeSubscription] No current deck ID, skipping subscription');
      return;
    }
    
    try {
      // Create a channel specific to this deck
      const channelName = `deck-changes-${currentDeckId}`;
      const decksChannel = supabase
        .channel(channelName)
        .on('postgres_changes', {
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'decks',
          filter: `uuid=eq.${currentDeckId}` // Only listen to changes for this specific deck
        }, async (payload) => {
          // Handle DELETE events differently
          if (payload.eventType === 'DELETE') {
            // For DELETE events, we check if the deleted deck is the current one
            const { deckData } = get();
            const deletedDeckId = (payload.old as any)?.uuid;
            
            if (deletedDeckId && deletedDeckId === deckData.uuid) {
            // Don't create empty decks when current deck is deleted remotely
            // Just clear the current deck data but don't create a persistent empty deck
            console.log('[setupRealtimeSubscription] Current deck deleted remotely, clearing local state');
            // Navigate back to deck list instead of creating empty deck
            if (typeof window !== 'undefined' && window.location.pathname.includes('/editor/')) {
              window.location.href = '/';
            }
            }
            
            return; // Skip the rest of the processing for DELETE events
          }
          
          // Get current deck data for comparisons
          const { deckData, updateInProgress } = get();
          
          // Skip if we're in the middle of an update operation
          if (updateInProgress) {
            return;
          }
          
          // Skip if the subscription manager has paused subscriptions
          if (get().subscriptionManager.paused) {
            return;
          }
          
          // Double-check that this update is for our current deck
          const updatedDeckId = (payload.new as any)?.uuid || '';
          // Accept updates that match either the currentDeckId or the store deck uuid
          if (updatedDeckId !== currentDeckId && updatedDeckId !== deckData.uuid) {
            console.warn('[setupRealtimeSubscription] Received update for different deck, ignoring');
            return; // Skip updates for other decks
          }
          
          // Only process if it's newer than what we already have (normalize timestamps)
          const rawLm = (payload.new as any)?.last_modified
            || (payload.new as any)?.lastModified
            || (payload.new as any)?.updated_at
            || '';
          const newLastModified = rawLm ? new Date(rawLm).toISOString() : '';
          const currentLastModified = deckData.lastModified || '';

          if (currentLastModified && newLastModified) {
            const newMs = Date.parse(newLastModified);
            const curMs = Date.parse(currentLastModified);
            if (!Number.isNaN(newMs) && !Number.isNaN(curMs) && newMs <= curMs) {
              console.log('[Realtime][UPDATE] Ignored older/same update', { newLastModified, currentLastModified });
              return; // Skip if local data is newer/same
            }
          }
          const pendingTs = (window as any).__pendingPreviewTs || 0;
          if (pendingTs && newLastModified) {
            const newMs = Date.parse(newLastModified);
            if (!Number.isNaN(newMs) && newMs < pendingTs) {
              console.log('[Realtime][UPDATE] Ignored due to newer pending preview', { newLastModified, pendingTs });
              return;
            }
          }
          
          // Debounce the fetch to prevent rapid repeated calls
          if (realtimeFetchTimeout) {
            clearTimeout(realtimeFetchTimeout);
          }

           // Apply payload slides immediately when present to reflect changes fast
          try {
            const incomingSlides = (payload.new as any)?.slides;
            const incomingDataField = (payload.new as any)?.data;
            if (Array.isArray(incomingSlides)) {
              const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;
              if (isEditing) {
                // If user is actively interacting (dragging/resizing), skip incoming merges to avoid snapping back
                try {
                  const interacting = (typeof window !== 'undefined') && (
                    (window as any).__isDragging === true ||
                    (window as any).__isDraggingCharts === true ||
                    (window as any).__isResizingCharts === true
                  );
                  if (interacting) {
                    console.log('[Realtime][UPDATE] Skipped due to active interaction (drag/resize)');
                    return;
                  }
                } catch {}
                // Update editor drafts only to avoid slide remounts/flashing in edit mode
                try {
                  const { useEditorStore } = await import('../stores/editorStore');
                  const editorStore = (useEditorStore as any).getState();
                  incomingSlides.forEach((incomingSlide: any) => {
                    const slideId = incomingSlide?.id;
                    if (!slideId) return;
                    const incomingComponents: any[] = Array.isArray(incomingSlide.components) ? incomingSlide.components : [];
                    const draftComponents: any[] = editorStore.getDraftComponents(slideId) || [];
                    const draftById = new Map(draftComponents.map((c: any) => [c.id, c]));
                    const incomingById = new Map(incomingComponents.map((c: any) => [c.id, c]));
                    // If local slide has unsaved changes, do not overwrite its draft
                    try {
                      const hasLocalChanges = typeof editorStore.hasSlideChanged === 'function' && editorStore.hasSlideChanged(slideId);
                      if (hasLocalChanges) {
                        return; // skip this slide; keep user's local edits
                      }
                    } catch {}
                    // Update/add
                    incomingComponents.forEach((ic) => {
                      const current = draftById.get(ic.id);
                      if (!current) {
                        editorStore.addDraftComponent(slideId, ic, true);
                        return;
                      }
                      const typeChanged = current.type !== ic.type;
                      const propsChanged = JSON.stringify(current.props || {}) !== JSON.stringify(ic.props || {});
                      if (typeChanged || propsChanged) {
                        editorStore.updateDraftComponent(slideId, ic.id, { type: ic.type, props: ic.props || {} }, true);
                      }
                    });
                    // Remove
                    draftComponents.forEach((dc: any) => {
                      if (!incomingById.has(dc.id)) {
                        editorStore.removeDraftComponent(slideId, dc.id, true);
                      }
                    });
                    // Mark slide as unchanged after server-driven merge to allow further realtime
                    try { editorStore.markSlideAsUnchanged(slideId); } catch {}
                  });

                  // Also reflect updates into deckData for non-active slides so thumbnails update in edit mode
                  try {
                    const state = get();
                    const currentSlides: any[] = Array.isArray(state.deckData?.slides) ? [...state.deckData.slides] : [];
                    const incomingByIdAll = new Map(incomingSlides.map((s: any) => [s?.id, s]));
                    const activeIndex = typeof state.currentSlideIndex === 'number' ? state.currentSlideIndex : -1;
                    let changed = false;
                    for (let i = 0; i < currentSlides.length; i++) {
                      if (i === activeIndex) continue; // leave active slide to drafts
                      const cur = currentSlides[i];
                      if (!cur || !cur.id) continue;
                      const inc = incomingByIdAll.get(cur.id);
                      if (!inc) continue;
                      let hasLocal = false;
                      try { hasLocal = typeof editorStore.hasSlideChanged === 'function' && editorStore.hasSlideChanged(cur.id); } catch {}
                      if (hasLocal) continue;
                      const curComps = Array.isArray(cur.components) ? cur.components : [];
                      const incComps = Array.isArray(inc.components) ? inc.components : [];
                      if (JSON.stringify(curComps) !== JSON.stringify(incComps)) {
                        currentSlides[i] = inc;
                        changed = true;
                      }
                    }
                    const deckLevelUpdates: any = { ...state.deckData };
                    let hasDeckLevelChange = false;
                    if (changed) {
                      deckLevelUpdates.slides = currentSlides;
                      hasDeckLevelChange = true;
                    }
                    // Merge deck-level data (e.g., theme) without touching drafts
                    if (incomingDataField && JSON.stringify(state.deckData?.data || {}) !== JSON.stringify(incomingDataField)) {
                      deckLevelUpdates.data = incomingDataField;
                      hasDeckLevelChange = true;
                    }
                    if (hasDeckLevelChange) {
                      if (newLastModified) deckLevelUpdates.lastModified = newLastModified;
                      if ((payload.new as any)?.version) deckLevelUpdates.version = (payload.new as any).version;
                      set({ deckData: deckLevelUpdates });
                    }
                  } catch {}
                } catch {}
              } else {
                const current = get().deckData;
                const updates: any = { ...current, slides: incomingSlides };
                if ((payload.new as any)?.outline) updates.outline = (payload.new as any).outline;
                if ((payload.new as any)?.notes) updates.notes = (payload.new as any).notes;
                // Include deck-level data updates (e.g., theme) for non-edit mode
                if (incomingDataField) updates.data = incomingDataField;
                // Carry forward server-provided version/last modified for proper ordering
                if ((payload.new as any)?.version) updates.version = (payload.new as any).version;
                updates.lastModified = newLastModified || new Date().toISOString();
                console.log('[Realtime][UPDATE] Merging slides from payload via guarded update', {
                  slideCount: incomingSlides.length,
                  hasOutline: !!(payload.new as any)?.outline,
                  hasNotes: !!(payload.new as any)?.notes,
                  hasData: !!incomingDataField,
                  newLastModified: updates.lastModified
                });
                // Use guarded update to prevent clobbering completed slides with empty/stale data
                try {
                  get().updateDeckData(updates, { isRealtimeUpdate: true, skipBackend: true });
                } catch {
                  // As a last resort, fall back to direct set (should be rare)
                  set({ deckData: updates, lastModified: updates.lastModified, version: updates.version || get().version });
                }
              }
            }
          } catch {}

          realtimeFetchTimeout = setTimeout(async () => {
            try {
              const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;
              // Get the updated deck directly by ID using the full endpoint
              let updatedDeck = await deckSyncService.getFullDeck(updatedDeckId);

              if (!updatedDeck) {
                return;
              }

              // Normalize deck data from backend
              updatedDeck = normalizeDeckData(updatedDeck);

              if (isEditing) {
                // In edit mode: merge fetched slides into editor drafts to avoid flicker
                try {
                  const { useEditorStore } = await import('../stores/editorStore');
                  const editorStore = (useEditorStore as any).getState();
                  const incomingSlides: any[] = Array.isArray((updatedDeck as any)?.slides) ? (updatedDeck as any).slides : [];
                  incomingSlides.forEach((incomingSlide: any) => {
                    const slideId = incomingSlide?.id;
                    if (!slideId) return;
                    const incomingComponents: any[] = Array.isArray(incomingSlide.components) ? incomingSlide.components : [];
                    const draftComponents: any[] = editorStore.getDraftComponents(slideId) || [];
                    const draftById = new Map(draftComponents.map((c: any) => [c.id, c]));
                    const incomingById = new Map(incomingComponents.map((c: any) => [c.id, c]));
                    // Respect local unsaved changes
                    try {
                      const hasLocalChanges = typeof editorStore.hasSlideChanged === 'function' && editorStore.hasSlideChanged(slideId);
                      if (hasLocalChanges) {
                        return; // keep user's local edits
                      }
                    } catch {}
                    // Update/add components
                    incomingComponents.forEach((ic) => {
                      const current = draftById.get(ic.id);
                      if (!current) {
                        editorStore.addDraftComponent(slideId, ic, true);
                        return;
                      }
                      const typeChanged = current.type !== ic.type;
                      const propsChanged = JSON.stringify(current.props || {}) !== JSON.stringify(ic.props || {});
                      if (typeChanged || propsChanged) {
                        editorStore.updateDraftComponent(slideId, ic.id, { type: ic.type, props: ic.props || {} }, true);
                      }
                    });
                    // Remove components that no longer exist
                    draftComponents.forEach((dc: any) => {
                      if (!incomingById.has(dc.id)) {
                        editorStore.removeDraftComponent(slideId, dc.id, true);
                      }
                    });
                  });
                } catch {}

                // Also apply deck-level fields (e.g., theme in data) and bump lastModified locally
                try {
                  const state = get();
                  const deckLevelUpdates: any = { ...state.deckData };
                  const incomingDataField = (updatedDeck as any)?.data;
                  if (incomingDataField && JSON.stringify(state.deckData?.data || {}) !== JSON.stringify(incomingDataField)) {
                    deckLevelUpdates.data = incomingDataField;
                  }
                  deckLevelUpdates.lastModified = (updatedDeck as any).lastModified || new Date().toISOString();
                  if ((updatedDeck as any)?.version) deckLevelUpdates.version = (updatedDeck as any).version;
                  set({ deckData: deckLevelUpdates });
                } catch {}
              } else {
                // Non-edit mode: merge deck directly into store with guards
                try {
                  console.log('[Realtime][REFETCH] Merging fetched deck for confirmation');
                  get().updateDeckData(updatedDeck, { isRealtimeUpdate: true, skipBackend: true });
                } catch {}
              }

              // Preload fonts from the updated deck
              import('../utils/fontUtils').then(({ extractDeckFonts }) => {
                const usedFonts = extractDeckFonts(updatedDeck);
                if (usedFonts.length > 0) {
                  import('../services/FontLoadingService').then(({ FontLoadingService }) => {
                    FontLoadingService.loadFonts(usedFonts, {
                      maxConcurrent: 3,
                      delayBetweenBatches: 100,
                      useIdleCallback: true
                    });
                  });
                }
              });
            } catch (error) {
              // Silent error handling to avoid fetch storms
            }
          }, 500); // 500ms debounce
        })
        .subscribe();
      
      // Store the channel reference for cleanup
      set({ supabaseSubscription: decksChannel });
      console.log(`[setupRealtimeSubscription] Subscribed to changes for deck ${currentDeckId}`);
    } catch (error) {
      // Silent error handling
    }
  };
  
  // Clean up real-time subscription
  const cleanupRealtimeSubscription = () => {
    const { supabaseSubscription } = get();
    
    if (supabaseSubscription) {
      try {
        supabase.removeChannel(supabaseSubscription);
        set({ supabaseSubscription: null });
      } catch (error) {
        // Silent error handling
      }
    }
  };
  
  // Create a default deck with a custom first slide
  const createDefaultDeck = async () => {
    // Prevent multiple simultaneous deck creation - use both state flag and isSyncing
    const { isSyncing } = get();
    if (isSyncing || isCreatingDeck) {
      console.log('[createDefaultDeck] Already creating deck or syncing, skipping duplicate creation');
      return get().deckData;
    }
    
    // Set the flag immediately
    isCreatingDeck = true;
    set({ isSyncing: true });
    
    const deckId = generateDeckId();
    
    try {
      // Start with an empty deck structure
      const emptyDeck = createEmptyDeck(deckId, 'New Presentation');

      // --- Define Background for First Slide --- 
      const firstSlideBackground = createComponent('Background', {
          backgroundType: 'gradient',
          color: '#E8F4FD', // Soft blue fallback
          gradient: {
            type: 'linear',
            angle: 135,
            stops: [
              { color: '#E8F4FD', position: 0 },    // Soft blue
              { color: '#F3E8FF', position: 100 }   // Soft purple
            ]
          },
          backgroundImageUrl: null,
          patternType: null,
          position: { x: 0, y: 0 },
          width: DEFAULT_SLIDE_WIDTH,
          height: DEFAULT_SLIDE_HEIGHT,
          zIndex: 0
      });

      // --- Create the first slide with custom theme --- 
      const customTheme = {
          name: 'Blue Theme',
          page: { backgroundColor: '#E8F4FD' },
          typography: {
              heading: { 
                  fontFamily: 'Inter',
                  color: '#0481ff', 
                  fontWeight: 700 
              },
              paragraph: { 
                  fontFamily: 'Inter',
                  color: '#0481ff', 
                  fontWeight: 400 
              }
          },
          accent1: '#0481ff'
      };
      
      const firstSlide = createBlankSlide(
          { 
              id: uuidv4(), 
              title: 'Presentation Title'
          }, 
          firstSlideBackground.props,
          customTheme
      );

      // Create the final deck data with the custom first slide
      const defaultDeck = {
        ...emptyDeck,
        slides: [firstSlide],
        lastModified: new Date().toISOString()
      };
      
      // Update local state immediately
      set({ 
        deckData: defaultDeck,
        isSyncing: false 
      });
      
      // Reset the creation flag
      isCreatingDeck = false;
      
      // Generate a new version
      const versionInfo = get().generateNewVersion();
      
      // Save to backend and wait for it
      try {
        const updatedDeck = {
          ...defaultDeck,
          ...versionInfo
        };
        
        console.log('[createDefaultDeck] Attempting to save deck to backend:', {
          uuid: updatedDeck.uuid,
          name: updatedDeck.name,
          slideCount: updatedDeck.slides?.length
        });
        
        const savedDeck = await deckSyncService.createDeck(updatedDeck);
        
        if (savedDeck) {
          console.log('[createDefaultDeck] Deck created successfully:', savedDeck.uuid);
          // Update the store with the saved deck data
          set({ 
            deckData: savedDeck,
            lastSyncTime: new Date(),
            hasUnsavedChanges: false // Mark as saved
          });
          
          // Deck association is now handled automatically by the backend during creation
          if (authService.isAuthenticated()) {
            console.log('[createDefaultDeck] Deck created and associated with user');
          }
          
          // Return the saved deck from backend
          return savedDeck;
        } else {
          console.error('[createDefaultDeck] createDeck returned null');
          // Return the local deck as fallback
          return defaultDeck;
        }
      } catch (saveError) {
        console.error('[createDefaultDeck] Failed to save to backend:', saveError);
        // Return the local deck as fallback
        return defaultDeck;
      }
    } catch (error) {
      console.error('[createDefaultDeck] Error creating deck:', error);
      
      // Reset the creation flag
      isCreatingDeck = false;
      
      // Fallback to minimal deck
      const minimalDeck = createMinimalDeck(deckId);
      set({ 
        deckData: minimalDeck,
        isSyncing: false 
      });
      return minimalDeck;
    }
  };
  
  // Delete a deck from the backend
  const deleteDeck = async (deckId: string) => {
    try {
      // First check if this deck is the current one
      const { deckData } = get();
      const isDeletingCurrentDeck = deckData.uuid === deckId;
      
      // If deleting current deck, update local state immediately
      if (isDeletingCurrentDeck) {
        const emptyDeck = createEmptyDeck('', '');
        set({ deckData: emptyDeck });
        // Don't auto-save empty decks - they should only exist locally
      }
      
      // Delete from backend
      const success = await deckSyncService.deleteDeck(deckId);
      
      if (success) {
        set({ lastSyncTime: new Date() });
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error("[deleteDeck] Error deleting deck:", error);
      return false;
    }
  };
  
  // Load the latest deck from backend (fallback)
  const loadDeck = async (deckId: string) => {
    
    
    // If no deckId provided, don't try to load or create anything
    if (!deckId) {
      console.log('📋 No deck ID provided, skipping load');
      return;
    }
    
    try {
      // Use deckSyncService instead of direct Supabase query
      const deck = await deckSyncService.getFullDeck(deckId);
      
      if (!deck) {
        console.warn('⚠️ No deck found with ID:', deckId);
        return null;
      }
      
      console.log('✅ Deck loaded successfully:', {
        id: deck.uuid,
        name: deck.name,
        slideCount: Array.isArray(deck.slides) ? deck.slides.length : 0,
        hasStatus: !!deck.status,
        status: deck.status
      });
      
      // The deck from the API should already be formatted correctly
      const transformedDeck = normalizeDeckData(deck);
      
      // Set current deck ID globally for position sync filtering
      if (typeof window !== 'undefined') {
        (window as any).__currentDeckId = deckId;
        
        // Clear any lingering WebSocket position sync state
        if ((window as any).__remoteComponentLayouts) {
          (window as any).__remoteComponentLayouts.clear();
        }
      }
      
      set({ 
        deckData: transformedDeck,
        isSyncing: false,
        error: null,
        version: transformedDeck.version || uuidv4(),
        lastModified: transformedDeck.lastModified || new Date().toISOString(),
        lastSyncTime: new Date() // Add this line to set sync time when deck is loaded
      });
      
      // Preload all fonts used in the deck
      import('../utils/fontUtils').then(({ extractDeckFonts }) => {
        const usedFonts = extractDeckFonts(transformedDeck);
        if (usedFonts.length > 0) {
          import('../services/FontLoadingService').then(({ FontLoadingService }) => {
            FontLoadingService.loadFonts(usedFonts, { 
              maxConcurrent: 5, 
              delayBetweenBatches: 50,
              useIdleCallback: false // Load immediately for better UX
            });
          });
        }
      });
      
      return transformedDeck;
    } catch (error) {
      console.error("[loadDeck] Error loading decks:", error);
      set({ 
        isSyncing: false,
        error: error as Error 
      });
      
      // Only create default deck on error if we're truly starting fresh AND no specific deck was requested
      const { deckData } = get();
      if ((!deckData || !deckData.uuid) && !deckId) {
        console.log('[loadDeck] Creating fallback deck due to error (no specific deck requested)');
        await createDefaultDeck();
      }
    }
  };

  // Initialize deck loading and sync operations
  const initialize = (options: InitializeOptions = {}) => {
    const { 
      syncEnabled = true, 
      useRealtimeSubscription = true, 
      autoSyncInterval,
      deckId = null,
      collaborationEnabled = false,
      collaborationUrl = API_CONFIG.WEBSOCKET_URL || 'wss://slide-websocket.onrender.com',
      isNewDeck = false
    } = options;
    

    
    // Load specific deck if ID is available
    if (deckId) {
      (async () => {
        try {
          set({ isSyncing: true, error: null });
          
          // Retry logic for newly generated decks (they might not be immediately available)
          let deck = null;
          let retryCount = 0;
          const maxRetries = 30; // Increased from 20 to 30
          const baseRetryDelay = 3000; // Increased from 2000ms to 3000ms
          
          while (!deck && retryCount < maxRetries) {
            try {
              // Use the full deck endpoint for initialization
              deck = await deckSyncService.getFullDeck(deckId);
              if (!deck && retryCount < maxRetries - 1) {
                // Exponential backoff with max delay of 15 seconds (increased from 10)
                const delay = Math.min(baseRetryDelay * Math.pow(1.5, retryCount), 15000);
                console.log(`[initialize] Deck ${deckId} not found, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retryCount++;
              } else if (!deck) {
                throw new Error(`Deck with ID ${deckId} not found after ${maxRetries} attempts`);
              }
            } catch (error) {
              if (retryCount === maxRetries - 1) {
                throw error;
              }
              retryCount++;
              // Exponential backoff
              const delay = Math.min(baseRetryDelay * Math.pow(1.5, retryCount), 15000);
              console.log(`[initialize] Error loading deck, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries}):`, error);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
          
                if (deck) {
        // Normalize deck data from backend
        deck = normalizeDeckData(deck);
        
        // Set current deck ID globally for position sync filtering
        if (typeof window !== 'undefined') {
          (window as any).__currentDeckId = deckId;
        }
        
        set({ 
          deckData: deck,
          isSyncing: false,
          error: null,
          version: deck.version || uuidv4(),
          lastModified: deck.lastModified || new Date().toISOString(),
          lastSyncTime: new Date() // Add this line to set sync time when deck is loaded
        });
        
        console.log(`[initialize] Successfully loaded deck ${deckId} after ${retryCount + 1} attempts`);
            
            // Immediately preload all fonts used in the deck
            import('../utils/fontUtils').then(({ extractDeckFonts }) => {
              const usedFonts = extractDeckFonts(deck);
              if (usedFonts.length > 0) {
                import('../services/FontLoadingService').then(({ FontLoadingService }) => {
                  // Load fonts with highest priority since deck just opened
                  FontLoadingService.loadFonts(usedFonts, { 
                    maxConcurrent: 8, // More concurrent loads
                    delayBetweenBatches: 0, // No delay between batches
                    useIdleCallback: false // Load immediately
                  });
                });
              }
            });
          }
        } catch (error) {
          console.error('Failed to load deck:', error);
          set({ 
            error: error as Error, 
            isSyncing: false 
          });
          // DON'T create fallback decks when a specific deck ID was requested
          return;
        }
      })();
    } else {
      // Only load latest deck if no specific deck ID was provided
      loadDeck(deckId);
    }
    
    // Set up subscription if enabled
    if (syncEnabled && useRealtimeSubscription) {
      // Re-enabled with guards in the subscription handler
      setupRealtimeSubscription();
    }
    
    // Set up interval sync if needed and return cleanup function
    let intervalId: NodeJS.Timeout | null = null;
    
    if (syncEnabled && autoSyncInterval && !useRealtimeSubscription) {
      intervalId = setInterval(() => {
        const currentDeckId = get().deckData.uuid;
        const targetDeckId = deckId || currentDeckId;
        
        if (targetDeckId) {
          deckSyncService.getDeck(targetDeckId)
            .then(deck => {
              if (deck && get().deckData.uuid === targetDeckId) {
                set({ 
                  deckData: deck, 
                  lastSyncTime: new Date() 
                });
              }
            })
            .catch((err) => console.error(`[initialize] Error during interval sync:`, err));
        }
      }, autoSyncInterval);
    }
    
    // Initialize Yjs collaboration if enabled
    let yjsCleanup = () => {};
    if (collaborationEnabled) {
      try {
        const { setupYjsCollaboration, setYjsSyncEnabled } = get();
        
        if (setupYjsCollaboration) {
          // Get or generate a user name
          let userName = localStorage.getItem('yjs-user-name');
          if (!userName) {
            userName = `User-${Math.floor(Math.random() * 10000)}`;
            localStorage.setItem('yjs-user-name', userName);
          }
          
          yjsCleanup = setupYjsCollaboration({
            deckId: deckId || `default-deck-${Date.now()}`,
            userName: userName,
            wsUrl: collaborationUrl,
            autoConnect: true
          });
          
          // Enable Yjs sync
          if (setYjsSyncEnabled) {
            setYjsSyncEnabled(true);
          }
        } else {
          // Silently handle missing setupYjsCollaboration
        }
      } catch (error) {
        // Silent error handling
      }
    }
    
    // Return cleanup function
    return () => {
      if (intervalId) clearInterval(intervalId);
      cleanupRealtimeSubscription();
      yjsCleanup(); // Clean up Yjs if initialized
    };
  };

  // createNewDeck is not part of the new createSyncOperations structure,
  // as it was not in the edit_specification.
  // If it needs to be re-added, it should be re-evaluated based on the new structure.
  // For now, it's removed as per the edit hint.

  return {
    subscriptionManager,
    setupRealtimeSubscription,
    cleanupRealtimeSubscription,
    createDefaultDeck,
    deleteDeck,
    loadDeck,
    initialize,
    // createNewDeck // This function is removed as per the edit hint.
  };
};