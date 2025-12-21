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
import { cleanupDuplicateCustomComponents } from "../utils/deckDiffUtils";

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

  const coerceNumber = (value: any): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const cleaned = value.trim().toLowerCase().replace(/px$/, '');
      if (!cleaned) return null;
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  
  return {
    ...deck,
    slides: deck.slides.map((slide: any) => ({
      ...slide,
      components: slide.components?.map((component: any) => {
        const normalizedComponent = { ...component };
        normalizedComponent.props = { ...(component.props || {}) };
        const props = normalizedComponent.props as any;

        // Normalize geometry so renderers can rely on props.position/width/height.
        const posFromProps = props.position && typeof props.position === 'object' ? props.position : null;
        const posFromComponent = component?.position && typeof component.position === 'object' ? component.position : null;
        const x = coerceNumber(posFromProps?.x) ?? coerceNumber(props.x) ?? coerceNumber(posFromComponent?.x) ?? coerceNumber(component?.x);
        const y = coerceNumber(posFromProps?.y) ?? coerceNumber(props.y) ?? coerceNumber(posFromComponent?.y) ?? coerceNumber(component?.y);
        if (x !== null || y !== null) {
          props.position = { x: x ?? 0, y: y ?? 0 };
        }

        const sizeFromProps = props.size && typeof props.size === 'object' ? props.size : null;
        const sizeFromComponent = component?.size && typeof component.size === 'object' ? component.size : null;
        const width = coerceNumber(props.width)
          ?? (sizeFromProps ? coerceNumber(sizeFromProps.width) : null)
          ?? coerceNumber(component?.width)
          ?? (sizeFromComponent ? coerceNumber(sizeFromComponent.width) : null);
        if (width !== null) props.width = width;
        const height = coerceNumber(props.height)
          ?? (sizeFromProps ? coerceNumber(sizeFromProps.height) : null)
          ?? coerceNumber(component?.height)
          ?? (sizeFromComponent ? coerceNumber(sizeFromComponent.height) : null);
        if (height !== null) props.height = height;
        if (!props.size && width !== null && height !== null) {
          props.size = { width, height };
        }

        // Normalize Background component props from various backend shapes
        try {
          if (normalizedComponent?.type === 'Background') {
            const next = { ...normalizedComponent };
            next.props = { ...(normalizedComponent.props || {}) };
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
        if (normalizedComponent.type !== 'TiptapTextBlock' || !normalizedComponent.props?.texts) {
          return normalizedComponent;
        }
        
        const texts = normalizedComponent.props.texts;
        
        // Already in correct format
        if (texts && texts.type === 'doc' && texts.content) {
          return normalizedComponent;
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
          ...normalizedComponent,
          props: {
            ...normalizedComponent.props,
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
  let pendingRealtimeUpdate: {
    slides: any[];
    data?: any;
    lastModified?: string;
    version?: any;
    outline?: any;
    notes?: any;
  } | null = null;
  let pendingRealtimeTimer: NodeJS.Timeout | null = null;
  let pendingRealtimeSince: number | null = null;
  
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

  const isInteractionActive = () => {
    if (typeof window === 'undefined') return false;
    return (
      (window as any).__isDragging === true ||
      (window as any).__isDraggingCharts === true ||
      (window as any).__isResizingCharts === true ||
      (window as any).__isDraggingSlide === true ||
      (window as any).__isSlideOperationInProgress === true
    );
  };

  const applyIncomingSlides = async (
    incomingSlides: any[],
    incomingDataField: any,
    newLastModified: string,
    incomingVersion?: any,
    incomingOutline?: any,
    incomingNotes?: any
  ) => {
    const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;
    if (isEditing) {
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

          // Update/add components - ALWAYS accept CustomComponent updates
          incomingComponents.forEach((ic) => {
            const current = draftById.get(ic.id);
            if (!current) {
              editorStore.addDraftComponent(slideId, ic, true);
              return;
            }

            // For CustomComponents, always accept backend updates (AI edits)
            const isCustomComponent = ic.type === 'CustomComponent';
            const typeChanged = current.type !== ic.type;
            const propsChanged = JSON.stringify(current.props || {}) !== JSON.stringify(ic.props || {});

            if (isCustomComponent || typeChanged || propsChanged) {
              editorStore.updateDraftComponent(slideId, ic.id, { type: ic.type, props: ic.props || {} }, true);
            }
          });

          // Remove components that no longer exist
          draftComponents.forEach((dc: any) => {
            if (!incomingById.has(dc.id)) {
              editorStore.removeDraftComponent(slideId, dc.id, true);
            }
          });

          // Mark slide as unchanged after server-driven merge
          try { editorStore.markSlideAsUnchanged(slideId); } catch {}
        });

        // SIMPLIFIED: Always update deckData from database (source of truth)
        try {
          const state = get();
          const deckLevelUpdates: any = {
            ...state.deckData,
            slides: incomingSlides
          };
          if (incomingDataField) {
            deckLevelUpdates.data = incomingDataField;
          }
          if (incomingOutline) deckLevelUpdates.outline = incomingOutline;
          if (incomingNotes) deckLevelUpdates.notes = incomingNotes;
          if (newLastModified) deckLevelUpdates.lastModified = newLastModified;
          if (incomingVersion) deckLevelUpdates.version = incomingVersion;
          set({ deckData: deckLevelUpdates });
        } catch {}
      } catch {}
      return;
    }

    const current = get().deckData;
    const updates: any = { ...current, slides: incomingSlides };
    if ((incomingDataField)) updates.data = incomingDataField;
    if (incomingOutline) updates.outline = incomingOutline;
    if (incomingNotes) updates.notes = incomingNotes;
    if (incomingVersion) updates.version = incomingVersion;
    updates.lastModified = newLastModified || new Date().toISOString();
    try {
      get().updateDeckData(updates, { isRealtimeUpdate: true, skipBackend: true });
    } catch {
      set({ deckData: updates, lastModified: updates.lastModified, version: updates.version || get().version });
    }
  };

  const schedulePendingRealtimeApply = () => {
    if (pendingRealtimeTimer) return;
    pendingRealtimeTimer = setTimeout(async () => {
      pendingRealtimeTimer = null;
      if (!pendingRealtimeUpdate) {
        pendingRealtimeSince = null;
        return;
      }

      const stillInteracting = isInteractionActive();
      if (stillInteracting) {
        if (!pendingRealtimeSince) pendingRealtimeSince = Date.now();
        if (Date.now() - pendingRealtimeSince < 4000) {
          schedulePendingRealtimeApply();
          return;
        }
      }

      const update = pendingRealtimeUpdate;
      pendingRealtimeUpdate = null;
      pendingRealtimeSince = null;
      await applyIncomingSlides(
        update.slides,
        update.data,
        update.lastModified || '',
        update.version,
        update.outline,
        update.notes
      );
    }, 200);
  };
  
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
          console.log('🔴 [Realtime] RECEIVED EVENT:', {
            eventType: payload.eventType,
            deckId: (payload.new as any)?.uuid,
            hasNew: !!payload.new,
            hasOld: !!payload.old,
            timestamp: new Date().toISOString()
          });
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

          // Double-check that this update is for our current deck (do this check early)
          const updatedDeckId = (payload.new as any)?.uuid || '';
          // Accept updates that match either the currentDeckId or the store deck uuid
          if (updatedDeckId !== currentDeckId && updatedDeckId !== deckData.uuid) {
            console.warn('[setupRealtimeSubscription] Received update for different deck, ignoring');
            return; // Skip updates for other decks
          }

          // Check timestamps to see if this is a newer update from backend
          const rawLm = (payload.new as any)?.last_modified
            || (payload.new as any)?.lastModified
            || (payload.new as any)?.updated_at
            || '';
          const newLastModified = rawLm ? new Date(rawLm).toISOString() : '';
          const currentLastModified = deckData.lastModified || '';

          // Determine if this update is significantly newer (came from backend, not a feedback loop)
          let isSignificantlyNewer = false;
          if (newLastModified && currentLastModified) {
            const newMs = Date.parse(newLastModified);
            const curMs = Date.parse(currentLastModified);
            if (!Number.isNaN(newMs) && !Number.isNaN(curMs)) {
              // Consider it significantly newer if it's at least 100ms newer
              isSignificantlyNewer = newMs > curMs + 100;
            }
          }

          // Always process updates - database is source of truth
          // Removed complex timestamp validation - just accept the update

          // Debounce the fetch to prevent rapid repeated calls
          if (realtimeFetchTimeout) {
            clearTimeout(realtimeFetchTimeout);
          }

           // Apply payload slides immediately when present to reflect changes fast
          try {
            const incomingSlides = (payload.new as any)?.slides;
            const incomingDataField = (payload.new as any)?.data;
            const incomingVersion = (payload.new as any)?.version;
            const incomingOutline = (payload.new as any)?.outline;
            const incomingNotes = (payload.new as any)?.notes;
            if (Array.isArray(incomingSlides)) {
              if (isInteractionActive()) {
                pendingRealtimeUpdate = {
                  slides: incomingSlides,
                  data: incomingDataField,
                  lastModified: newLastModified,
                  version: incomingVersion,
                  outline: incomingOutline,
                  notes: incomingNotes
                };
                if (!pendingRealtimeSince) pendingRealtimeSince = Date.now();
                schedulePendingRealtimeApply();
                return;
              }

              await applyIncomingSlides(
                incomingSlides,
                incomingDataField,
                newLastModified,
                incomingVersion,
                incomingOutline,
                incomingNotes
              );
            }
          } catch {}

          // CRITICAL FIX: Skip refetch if we successfully applied incoming slides
          // The refetch was causing reverts by fetching stale data from backend
          const hasIncomingSlides = Array.isArray((payload.new as any)?.slides) && (payload.new as any).slides.length > 0;
          if (hasIncomingSlides) {
            return; // Don't refetch if we already have the data
          }

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

              // CRITICAL: Sort slides by their order field when loading from backend
              if (updatedDeck.slides && Array.isArray(updatedDeck.slides)) {
                updatedDeck.slides = updatedDeck.slides.sort((a, b) => (a.order || 0) - (b.order || 0));
              }

              // SIMPLIFIED: Always update from database (source of truth)
              // Same logic for both edit mode and view mode

              // Update editor drafts if in edit mode
              if (isEditing) {
                try {
                  const { useEditorStore } = await import('../stores/editorStore');
                  const editorStore = (useEditorStore as any).getState();
                  const incomingSlides: any[] = Array.isArray(updatedDeck?.slides) ? updatedDeck.slides : [];

                  incomingSlides.forEach((incomingSlide: any) => {
                    const slideId = incomingSlide?.id;
                    if (!slideId) return;
                    const incomingComponents: any[] = Array.isArray(incomingSlide.components) ? incomingSlide.components : [];

                    incomingComponents.forEach((ic) => {
                      editorStore.updateDraftComponent(slideId, ic.id, { type: ic.type, props: ic.props || {} }, true);
                    });
                    editorStore.markSlideAsUnchanged(slideId);
                  });
                } catch {}
              }

              // Always update deckData
              set({
                deckData: updatedDeck,
                lastModified: updatedDeck.lastModified || new Date().toISOString(),
                version: updatedDeck.version
              });

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

      // Debug: Log CustomComponent render lengths from API response
      if (Array.isArray(deck.slides)) {
        deck.slides.forEach((slide: any, i: number) => {
          slide.components?.forEach((comp: any) => {
            if (comp.type === 'CustomComponent') {
              const renderLen = comp.props?.render?.length || 0;
              console.log(`📖 [FRONTEND loadDeck] Slide ${i} CustomComponent ${comp.id}: ${renderLen} chars from API`);
            }
          });
        });
      }
      
      // The deck from the API should already be formatted correctly
      const transformedDeck = normalizeDeckData(deck);

      // CRITICAL: Sort slides by their order field when loading from backend
      if (transformedDeck.slides && Array.isArray(transformedDeck.slides)) {
        transformedDeck.slides = transformedDeck.slides.sort((a, b) => (a.order || 0) - (b.order || 0));
        console.log(`[loadDeck] Sorted ${transformedDeck.slides.length} slides by order field`);
      }

      // Fix CustomComponent HTML rendering issues (ensure blank line after <html> tag)
      // AND cleanup duplicate CustomComponents on each slide
      if (transformedDeck.slides && Array.isArray(transformedDeck.slides)) {
        for (let i = 0; i < transformedDeck.slides.length; i++) {
          const slide = transformedDeck.slides[i];
          if (slide.components && Array.isArray(slide.components)) {
            // Fix HTML rendering
            for (const component of slide.components) {
              if (component.type === 'CustomComponent' && component.props?.render) {
                const html = component.props.render as string;
                if (html.toLowerCase().includes('<html')) {
                  // Ensure blank line (two newlines) after <html> tag
                  component.props.render = html.replace(/(<html[^>]*>)\s*\n?\s*/gi, '$1\n\n');
                }
              }
            }

            // AUTO-CLEANUP: Remove duplicate CustomComponents
            const customComponents = slide.components.filter(c => c.type === 'CustomComponent');
            if (customComponents.length > 1) {
              console.log('[loadDeck] 🧹 AUTO-CLEANUP: Found', customComponents.length, 'CustomComponents on slide', slide.id);
              const { slide: cleanedSlide, removedIds } = cleanupDuplicateCustomComponents(slide);
              if (removedIds.length > 0) {
                console.log('[loadDeck] 🧹 AUTO-CLEANUP: Removed duplicate CustomComponents:', removedIds);
                transformedDeck.slides[i] = cleanedSlide;
              }
            }
          }
        }
      }

      // Debug: Log CustomComponent render lengths AFTER normalization and cleanup
      if (Array.isArray(transformedDeck.slides)) {
        transformedDeck.slides.forEach((slide: any, i: number) => {
          slide.components?.forEach((comp: any) => {
            if (comp.type === 'CustomComponent') {
              const renderLen = comp.props?.render?.length || 0;
              console.log(`🔄 [FRONTEND AFTER CLEANUP] Slide ${i} CustomComponent ${comp.id}: ${renderLen} chars going to store`);
            }
          });
        });
      }

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

        // CRITICAL: Sort slides by their order field when loading from backend
        if (deck.slides && Array.isArray(deck.slides)) {
          deck.slides = deck.slides.sort((a, b) => (a.order || 0) - (b.order || 0));
          console.log(`[initialize] Sorted ${deck.slides.length} slides by order field`);
        }

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
    console.log('[initialize] Subscription setup check:', {
      syncEnabled,
      useRealtimeSubscription,
      willSetup: syncEnabled && useRealtimeSubscription,
      deckId
    });

    if (syncEnabled && useRealtimeSubscription) {
      // Re-enabled with guards in the subscription handler
      console.log('[initialize] Calling setupRealtimeSubscription()');
      setupRealtimeSubscription();
    } else {
      console.log('[initialize] Skipping subscription setup');
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
