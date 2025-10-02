import { create } from 'zustand';
import { ComponentInstance } from "../types/components";
import { useDeckStore } from './deckStore';
import { useHistoryStore } from './historyStore'; // Import the new history store
import {
  prepareChartForDraft,
  cleanupChartOnRemove,
  cleanupStaleChartTracking,
  initializeGlobalChartUtils
} from '../charts/utils/chartEditorUtils'; // Import chart utilities
import { slideSyncService } from '../lib/slideSyncService';
import { toast } from '@/hooks/use-toast';
import { useEditModeTransitionStore } from './editModeTransitionStore';

// No longer need HistoryEntry here

// Define the store state interface (simplified)
interface EditorState {
  // Draft component state
  draftComponents: Record<string, ComponentInstance[]>; // slideId -> components array

  // Selection state
  selectedComponentIds: Set<string>; // Multiple selected components
  isSelectionMode: boolean; // Whether we're in selection mode
  selectionRectangle: { x: number; y: number; width: number; height: number } | null; // Selection rectangle
  editingGroupId: string | null; // ID of the group being edited (for double-click into group)

  // Sync state (remains)
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingSyncs: Record<string, boolean>; // slideId -> isSyncPending

  // Unsaved changes tracking (remains)
  hasUnsavedChanges: Record<string, boolean>; // slideId -> has unsaved changes flag

  // Edit History state (for backend sync, remains)
  editHistory: Record<string, any[]>; // slideId -> backend history format

  // Last operation tracking (remains, used for UI updates/effects)
  lastOperation: string;

  // TipTap editor reference for active component
  activeTiptapEditor: any | null;

  // --- REMOVED: Editor settings state (moved to editorSettingsStore.ts) ---
  // isSnapEnabled, isDebugMode, isTextEditing, zoomLevel

  // --- REMOVED: Undo/Redo history state (moved to historyStore.ts) ---
  // history, historyIndex, maxHistorySize

  // --- REMOVED: Editor settings functions (moved) ---
  // toggleSnap, toggleDebugMode, setEditing, setZoomLevel

  // Component functions (updated)
  getDraftComponents: (slideId: string) => ComponentInstance[];
  updateDraftComponent: (slideId: string, componentId: string, updates: Partial<ComponentInstance>, skipHistory?: boolean) => void;
  addDraftComponent: (slideId: string, component: ComponentInstance, skipHistory?: boolean) => void;
  removeDraftComponent: (slideId: string, componentId: string, skipHistory?: boolean) => void;
  
  // Selection functions
  selectComponent: (componentId: string, addToSelection?: boolean) => void;
  deselectComponent: (componentId: string) => void;
  clearSelection: () => void;
  selectComponents: (componentIds: string[]) => void;
  isComponentSelected: (componentId: string) => boolean;
  getSelectedComponents: (slideId: string) => ComponentInstance[];
  setSelectionMode: (enabled: boolean) => void;
  setSelectionRectangle: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  setEditingGroupId: (groupId: string | null) => void;
  getParentGroup: (slideId: string, componentId: string) => ComponentInstance | null;
  
  // Group operations
  groupSelectedComponents: (slideId: string) => void;
  ungroupComponents: (slideId: string, groupId: string) => void;
  alignSelectedComponents: (slideId: string, alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  distributeSelectedComponents: (slideId: string, direction: 'horizontal' | 'vertical') => void;
  
  // --- REMOVED: History functions (moved) ---
  // addToHistory, undo, redo, canUndo, canRedo

  // Sync and draft management (updated)
  initializeDraftComponents: (currentSlideId: string) => void; // Removed preserveChartRefs (handled internally)
  applyDraftChanges: () => void;
  clearDraftComponents: (slideId?: string) => void; // Allow clearing specific slide draft
  
  // Unsaved changes tracking (remains)
  markSlideAsChanged: (slideId: string) => void;
  markSlideAsUnchanged: (slideId: string) => void;
  hasSlideChanged: (slideId: string) => boolean;
  
  // Sync operations (remains)
  forceSyncWithBackend: (syncEnabled?: boolean) => Promise<void>;
  getEditHistory: (slideId?: string, limit?: number) => Promise<any[]>;
  
  // Internal setters (updated)
  setIsSyncing: (syncing: boolean) => void;
  setLastSyncTime: (time: Date | null) => void;
  // Internal setter for draft components - directly sets the state
  setDraftComponents: (
    draftComponentsOrUpdater: 
      | Record<string, ComponentInstance[]> 
      | ((prev: Record<string, ComponentInstance[]>) => Record<string, ComponentInstance[]>)
  ) => void;
  // NEW: Internal setter for just one slide's components (used by historyStore)
  setDraftComponentsForSlide: (slideId: string, components: ComponentInstance[]) => void;
  // NEW: Internal setter for last operation
  setLastOperation: (operation: string) => void;
  // NEW: Setter for active TipTap editor
  setActiveTiptapEditor: (editor: any | null) => void;
}

// Create and export the refactored store
export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state (simplified)
  draftComponents: {},
  selectedComponentIds: new Set<string>(),
  isSelectionMode: false,
  selectionRectangle: null,
  editingGroupId: null,
  isSyncing: false,
  lastSyncTime: null,
  pendingSyncs: {},
  hasUnsavedChanges: {},
  lastOperation: '',
  editHistory: {},
  activeTiptapEditor: null,

  // --- REMOVED: Initial state for settings and history ---
  
  // Internal setters
  setIsSyncing: (syncing: boolean) => set({ isSyncing: syncing }),
  setLastSyncTime: (time: Date | null) => set({ lastSyncTime: time }),
  setDraftComponents: (draftComponentsOrUpdater) => set(state => ({
    draftComponents: typeof draftComponentsOrUpdater === 'function' 
      ? draftComponentsOrUpdater(state.draftComponents) 
      : draftComponentsOrUpdater
  })),
  // NEW: Set draft components for a single slide
  setDraftComponentsForSlide: (slideId: string, components: ComponentInstance[]) => {
     // PERFORMANCE: Only clone when absolutely necessary (e.g., from history store)
     // Most internal operations already handle cloning appropriately
     let componentsToSet = components;
     
     // Check if this is coming from an external source that needs cloning
     const caller = new Error().stack;
     const needsClone = caller?.includes('historyStore') || caller?.includes('undo') || caller?.includes('redo');
     
     if (needsClone) {
       try {
          componentsToSet = structuredClone(components);
       } catch (e) {
          // Silent fallback to JSON method if structuredClone fails
          componentsToSet = JSON.parse(JSON.stringify(components));
       }
     }
     
     set(state => ({
        draftComponents: {
            ...state.draftComponents,
            [slideId]: componentsToSet
        }
     }));
  },
  // NEW: Set last operation
  setLastOperation: (operation: string) => set({ lastOperation: operation }),
  // NEW: Set active TipTap editor
  setActiveTiptapEditor: (editor: any | null) => set({ activeTiptapEditor: editor }),


  // --- REMOVED: Settings toggle functions ---

  // Component functions (Refactored)
  getDraftComponents: (slideId: string): ComponentInstance[] => {
    // Check if draft already exists
    const draft = get().draftComponents[slideId];
    if (draft) return draft;
    
    // Check if deck is generating
    const deckStatus = (window as any).__deckStatus;
    const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
    
    // Suppress warnings during deck generation
    const slide = isGenerating 
      ? useDeckStore.getState().deckData.slides.find(s => s.id === slideId)
      : useDeckStore.getState().getSlideForEditing(slideId);
    
    if (!slide?.components || slide.components.length === 0) {
      // Only initialize draft if we're in edit mode
      const isEditMode = typeof window !== 'undefined' && (window as any).__isEditMode === true;
      
      // If deck is generating, don't initialize with empty array - just return empty
      // This prevents overwriting slides that are still being generated
      if (isGenerating) {
        // Don't log during generation to reduce console noise
        return [];
      }
      
      if (isEditMode) {
        setTimeout(() => {
          // Double-check the slide hasn't been populated in the meantime
          const currentSlide = useDeckStore.getState().deckData.slides.find(s => s.id === slideId);
          if (!currentSlide?.components || currentSlide.components.length === 0) {
          get().setDraftComponents(prev => ({ ...prev, [slideId]: [] }));
          // Add initial (empty) state to history
          useHistoryStore.getState().addToHistory(slideId, []);
          } else {
            // Slide has been populated, initialize with actual components
            const preparedComponents = currentSlide.components.map(comp => {
              if (comp.type === 'Chart') {
                return prepareChartForDraft(comp);
              } else {
                // IMPORTANT: Use structuredClone to ensure we preserve all props including optimized fontSize
                return structuredClone(comp);
              }
            });
            get().setDraftComponents(prev => ({ ...prev, [slideId]: preparedComponents }));
            useHistoryStore.getState().addToHistory(slideId, preparedComponents);
          }
        }, 0);
      }
      return [];
    }
      
    // If not in edit mode, just return the slide components directly without draft initialization
    const isEditMode = typeof window !== 'undefined' && (window as any).__isEditMode === true;
    if (!isEditMode) {
      return slide.components;
    }
    
    // Only prepare components for draft if we're in edit mode
    const preparedComponents = slide.components.map(comp => {
      // Use chart util for chart prep, otherwise just clone entire component
      if (comp.type === 'Chart') {
        return prepareChartForDraft(comp);
      } else {
        // IMPORTANT: Use structuredClone to ensure we preserve all props including optimized fontSize
        return structuredClone(comp);
      }
    });

    // Set draft and initialize history in timeout to avoid state update during render
    setTimeout(() => {
      get().setDraftComponents(prev => ({ ...prev, [slideId]: preparedComponents }));
      // Add initial state to history store
      useHistoryStore.getState().addToHistory(slideId, preparedComponents);
    }, 0);
      
    return preparedComponents; // Return immediately
  },
  
  updateDraftComponent: (slideId: string, componentId: string, updates: Partial<ComponentInstance>, skipHistory: boolean = false) => {
    const currentComponents = get().draftComponents[slideId] || [];

    // Add current state to history before updating (if needed)
    if (!skipHistory) {
      // Check if it's just an animation flag update (heuristic)
      const isJustAnimationUpdate = Object.keys(updates).length === 1 && updates.props && Object.keys(updates.props).length === 1 && updates.props._animateChanges;
      if (!isJustAnimationUpdate) {
        useHistoryStore.getState().addToHistory(slideId, currentComponents);
      }
    }

    // Find the component to update
    const componentIndex = currentComponents.findIndex(comp => comp.id === componentId);
    if (componentIndex === -1) {
      return; // Component not found
    }

    // Get the original component
    const originalComponent = currentComponents[componentIndex];
    
    // PERFORMANCE: Handle copy-on-write for components that were shallow-copied
    let componentProps = originalComponent.props;
    if ((originalComponent as any)._needsDeepClone && updates.props) {
      // Only deep clone when we're actually modifying props
      try {
        componentProps = structuredClone(originalComponent.props);
      } catch (e) {
        // Fallback to JSON method
        componentProps = JSON.parse(JSON.stringify(originalComponent.props));
      }
    }

    // Create the updated component, ensuring deep merge of props
    const updatedComponent = {
      ...originalComponent,
      ...updates, // Apply top-level updates (like type, if ever needed)
      props: { 
        ...componentProps,
        ...(updates.props || {})
        // Removed automatic animation flag - let components control their own animations
      },
      // Remove the deep clone flag as we've now done it
      _needsDeepClone: undefined
    };

    // Create the new components array
    const updatedComponents = [
        ...currentComponents.slice(0, componentIndex),
        updatedComponent,
        ...currentComponents.slice(componentIndex + 1)
    ];

    // PERFORMANCE: Update directly without additional cloning
    set(state => ({
      draftComponents: {
        ...state.draftComponents,
        [slideId]: updatedComponents
      }
    }));

    // Mark slide as changed (handled by historyStore.addToHistory or manually if skipped)
    if (skipHistory) {
        get().markSlideAsChanged(slideId);
    }
    
    // Set last operation to trigger UI updates
    get().setLastOperation(`update-${componentId}-${Date.now()}`);
  },
  
  addDraftComponent: (slideId: string, component: ComponentInstance, skipHistory: boolean = false) => {
    const currentComponents = get().draftComponents[slideId] || [];

    // Add current state to history before adding (if needed)
    if (!skipHistory) {
      useHistoryStore.getState().addToHistory(slideId, currentComponents);
    }

    // Simple default props without theme
    let defaultProps: Record<string, any> = {};

    switch (component.type) {
      case 'Shape':
        defaultProps = {
          fill: '#cccccc', 
          stroke: '#aaaaaa',
        };
        break;
      case 'TextBox':
        defaultProps = {
          backgroundColor: 'transparent',
          textColor: '#000000',
          fontFamily: 'Inter',
          fontSize: '1rem',
        };
        
        // Specific handling for heading elements if type differentiation exists
        if (component.props?.elementType === 'h1' || component.props?.elementType === 'h2' || component.props?.elementType === 'h3') {
          defaultProps.fontFamily = 'Inter';
          defaultProps.fontSize = '1.5rem';
          defaultProps.fontWeight = 'bold';
        } else {
          defaultProps.fontWeight = 'normal';
          defaultProps.lineHeight = 1.6;
        }
        break;
    }

    // Deep clone the incoming component and merge defaults with existing props
    // Existing props take precedence over theme defaults
    const clonedComponent = {
      ...component,
      props: {
        ...defaultProps, // Apply theme defaults first
        ...structuredClone(component.props), // Then apply existing props (overriding defaults)
      },
    };

    // Prepare chart if necessary
    const finalComponent = clonedComponent.type === 'Chart' ? prepareChartForDraft(clonedComponent) : clonedComponent;

    const updatedComponents = [...currentComponents, finalComponent];

    // Update the draft state for the specific slide
    get().setDraftComponentsForSlide(slideId, updatedComponents);

    // Mark slide as changed (handled by historyStore.addToHistory or manually if skipped)
    if (skipHistory) {
      get().markSlideAsChanged(slideId);
    }
    
    // Set last operation to trigger UI updates
    get().setLastOperation(`add-${finalComponent.id}-${Date.now()}`);
  },
  
  removeDraftComponent: (slideId: string, componentId: string, skipHistory: boolean = false) => {
    const currentComponents = get().draftComponents[slideId] || [];
    const componentToRemove = currentComponents.find(comp => comp.id === componentId);

    if (!componentToRemove) {
        return; // Component not found
    }

    // Prevent deletion of background components
    const isBackgroundComponent =
      componentToRemove.type === 'Background' ||
      (componentToRemove.id && componentToRemove.id.toLowerCase().includes('background'));
    if (isBackgroundComponent) {
      toast({
        title: 'Cannot Delete Background',
        description: 'Background components cannot be removed',
        duration: 2000,
        // @ts-expect-error allow variant on toast props used elsewhere in app
        variant: 'destructive'
      });
      return;
    }

    // Add current state to history before removing (if needed)
    if (!skipHistory) {
      useHistoryStore.getState().addToHistory(slideId, currentComponents);
    }

    // Perform chart-specific cleanup using the utility function
    if (componentToRemove.type === 'Chart') {
      cleanupChartOnRemove(componentId);
    }

    // Filter out the removed component
    const updatedComponents = currentComponents.filter(comp => comp.id !== componentId);

    // Update the draft state for the specific slide
    get().setDraftComponentsForSlide(slideId, updatedComponents);

    // Mark slide as changed (handled by historyStore.addToHistory or manually if skipped)
     if (skipHistory) {
      get().markSlideAsChanged(slideId);
    }
    
    // Set last operation to trigger UI updates
    get().setLastOperation(`remove-${componentId}-${Date.now()}`);
  },

  // --- REMOVED: History functions (moved to historyStore) ---
  // addToHistory, undo, redo, canUndo, canRedo

  // Initialize draft components for a specific slide
  initializeDraftComponents: async (currentSlideId: string) => {
    try {
      // 1. Clear history for the target slide
      useHistoryStore.getState().clearHistory(currentSlideId);
      // 2. Mark slide as initially unchanged
      get().markSlideAsUnchanged(currentSlideId);

      // 3. Get the slide data from deckStore
      const slide = useDeckStore.getState().getSlideForEditing(currentSlideId);
      
      // CRITICAL FIX: Check if deck is generating
      const deckStatus = (window as any).__deckStatus;
      const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
      
      if (!slide) {
        // If deck is generating and slide is not yet available, don't set empty draft
        if (isGenerating) {
          console.log(`[initializeDraftComponents] Slide ${currentSlideId} not found but deck is generating, skipping initialization`);
          return;
        }
        
        get().setDraftComponentsForSlide(currentSlideId, []); // Ensure draft is empty
        useHistoryStore.getState().addToHistory(currentSlideId, []); // Add empty initial history
        return;
      }
      
      // If slide has no components but deck is generating, wait for components
      if ((!slide.components || slide.components.length === 0) && isGenerating) {
        console.log(`[initializeDraftComponents] Slide ${currentSlideId} has no components but deck is generating, skipping initialization`);
        return;
      }
      
      // 4. PERFORMANCE OPTIMIZATION: Use shallow copy with lazy deep cloning
      const seenChartIds = new Set<string>();
      const preparedComponents = (slide.components || []).map(comp => {
        if (comp.type === 'Chart') {
          seenChartIds.add(comp.id);
          return prepareChartForDraft(comp); // Use util
        } else {
          // OPTIMIZATION: Use shallow copy instead of structuredClone
          // Deep cloning will happen on-demand when props are actually modified
          return {
            ...comp,
            props: { ...comp.props }, // Shallow copy - much faster
            _needsDeepClone: true // Flag for copy-on-write
          };
        }
      });

      // 5. Clean up tracking for charts no longer present
      cleanupStaleChartTracking(seenChartIds);

      // 6. PERFORMANCE: Set components directly without additional cloning
      set(state => ({
        draftComponents: {
          ...state.draftComponents,
          [currentSlideId]: preparedComponents
        }
      }));

      // 7. Add the initial state to the history store
      useHistoryStore.getState().addToHistory(currentSlideId, preparedComponents);

      // 8. Initialize global chart utilities (like clearing transition flags)
      initializeGlobalChartUtils();
    } catch (error) {
      // Silent error handling to reduce console noise
    }
  },

  // Apply draft changes back to the deck store
  applyDraftChanges: () => {
    const { draftComponents } = get();
    const deckStore = useDeckStore.getState();
    
    // Set a flag to prevent realtime updates during draft application
    if (typeof window !== 'undefined') {
      (window as any).__applyingDraftChanges = true;
    }
    
    // Simply save all draft components - don't check for changes
    const slideUpdates: { slideId: string; components: ComponentInstance[] }[] = [];

    Object.entries(draftComponents).forEach(([slideId, componentsToSave]) => {
      // Clean up editor-specific props before saving
      const cleanedComponents = componentsToSave.map(comp => {
          if (comp.type === 'Chart') {
          const {
            _preserveRef,
            _skipRender,
            _editModeTransition,
            _suppressEditModeRender,
            _timestamp,
            _animateChanges, // Also remove animation flag
            _animationTrigger, // Remove animation trigger
            ...restProps
          } = comp.props;
          return { ...comp, props: restProps };
        }
         // Remove animation flag from non-chart components too
         const { _animateChanges, _animationTrigger, _needsDeepClone, ...restProps } = comp.props as any;
         return { ...comp, props: restProps };
      });

      slideUpdates.push({ slideId: slideId, components: cleanedComponents });
    });

    // Perform batch update via deckStore
    if (slideUpdates.length > 0) {
        deckStore.batchUpdateSlideComponents(slideUpdates);
    }

    // Clear unsaved changes flags
    set({ hasUnsavedChanges: {} });
    
    // Clear the flag after a short delay to ensure the save completes
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        (window as any).__applyingDraftChanges = false;
      }
    }, 1000);
  },
  
  // Clear draft components (and optionally history) for a specific slide or all
  clearDraftComponents: (slideId?: string) => {
    if (slideId) {
      set(state => {
        const { [slideId]: _, ...rest } = state.draftComponents;
        return { draftComponents: rest };
      });
      get().markSlideAsUnchanged(slideId); // Mark as unchanged
      useHistoryStore.getState().clearHistory(slideId); // Clear history for this slide
    } else {
      set({ 
        draftComponents: {}, 
        hasUnsavedChanges: {},
        // Also clear selection and editor state
        selectedComponentIds: new Set<string>(),
        isSelectionMode: false,
        selectionRectangle: null,
        editingGroupId: null,
        lastOperation: ''
      }); // Clear all drafts and flags
      useHistoryStore.getState().clearHistory(); // Clear all history
    }
  },

  // Unsaved changes tracking (no changes needed)
  markSlideAsChanged: (slideId: string) => {
    // For auto-save, we should mark as changed whenever there are draft components
    const hasDraftComponents = Object.keys(get().draftComponents[slideId] || {}).length > 0;
    
    if (hasDraftComponents && !get().hasUnsavedChanges[slideId]) {
        set(state => ({
            hasUnsavedChanges: { ...state.hasUnsavedChanges, [slideId]: true }
        }));
    }
  },
  markSlideAsUnchanged: (slideId: string) => {
    if (get().hasUnsavedChanges[slideId]) {
    set(state => ({
            hasUnsavedChanges: { ...state.hasUnsavedChanges, [slideId]: false }
        }));
    }
  },
  hasSlideChanged: (slideId: string): boolean => {
    return get().hasUnsavedChanges[slideId] || false;
  },

  // Sync operations (no changes needed, assuming they interact with deckStore)
  forceSyncWithBackend: async (syncEnabled?: boolean) => {
    // This likely interacts primarily with deckStore or a sync service
    // Example interaction:
    // get().setIsSyncing(true);
    // await useDeckStore.getState().forceSync(); // Assuming deckStore handles the actual sync
    // get().setLastSyncTime(new Date());
    // get().setIsSyncing(false);
  },
  getEditHistory: async (slideId?: string, limit?: number): Promise<any[]> => {
    // This likely interacts with a backend service
    // Example:
    // const history = await slideSyncService.getHistory(slideId, limit);
    // set(state => ({ editHistory: { ...state.editHistory, [slideId || 'global']: history }}));
    // return history;
    return []; // Placeholder
  },

  // Selection functions
  selectComponent: (componentId: string, addToSelection?: boolean) => {
    set(state => {
      const newSelection = new Set(state.selectedComponentIds);
      
      // Check if this component is part of a group and we're not editing within the group
      const components = state.draftComponents[Object.keys(state.draftComponents)[0]] || [];
      const component = components.find(c => c.id === componentId);
      
      if (component?.props.parentId && state.editingGroupId !== component.props.parentId) {
        // Select the parent group instead
        if (addToSelection) {
          newSelection.add(component.props.parentId);
        } else {
          newSelection.clear();
          newSelection.add(component.props.parentId);
        }
      } else {
        // Normal selection
        if (addToSelection) {
          newSelection.add(componentId);
        } else {
          newSelection.clear();
          newSelection.add(componentId);
        }
      }
      
      return { 
        selectedComponentIds: newSelection,
        lastOperation: `select-${componentId}-${Date.now()}`
      };
    });
  },
  
  deselectComponent: (componentId: string) => {
    set(state => {
      const newSelection = new Set(state.selectedComponentIds);
      newSelection.delete(componentId);
      return { 
        selectedComponentIds: newSelection,
        lastOperation: `deselect-${componentId}-${Date.now()}`
      };
    });
  },
  
  clearSelection: () => {
    set({ 
      selectedComponentIds: new Set<string>(),
      lastOperation: `clear-selection-${Date.now()}`
    });
  },
  
  selectComponents: (componentIds: string[]) => {
    set({ 
      selectedComponentIds: new Set(componentIds),
      lastOperation: `select-multiple-${Date.now()}`
    });
  },
  
  isComponentSelected: (componentId: string) => {
    return get().selectedComponentIds.has(componentId);
  },
  
  getSelectedComponents: (slideId: string) => {
    const components = get().getDraftComponents(slideId);
    const selectedIds = get().selectedComponentIds;
    return components.filter(comp => selectedIds.has(comp.id));
  },
  
  setSelectionMode: (enabled: boolean) => {
    set({ isSelectionMode: enabled });
  },
  
  setSelectionRectangle: (rect: { x: number; y: number; width: number; height: number } | null) => {
    set({ selectionRectangle: rect });
  },
  
  setEditingGroupId: (groupId: string | null) => {
    set({ editingGroupId: groupId });
  },
  
  getParentGroup: (slideId: string, componentId: string) => {
    const components = get().getDraftComponents(slideId);
    const component = components.find(c => c.id === componentId);
    
    if (component?.props.parentId) {
      return components.find(c => c.id === component.props.parentId && c.type === 'Group') || null;
    }
    
    return null;
  },
  
  // Group operations
  groupSelectedComponents: (slideId: string) => {
    const selectedComponents = get().getSelectedComponents(slideId);
    if (selectedComponents.length < 2) return;
    
    const allComponents = get().getDraftComponents(slideId);
    
    // Collect all component IDs, expanding groups to include their children
    const allComponentIds = new Set<string>();
    
    const expandGroup = (compId: string) => {
      const comp = allComponents.find(c => c.id === compId);
      if (!comp) return;
      
      if (comp.type === 'Group' && comp.props.children) {
        // If it's a group, expand to include all children
        comp.props.children.forEach((childId: string) => {
          allComponentIds.add(childId);
          expandGroup(childId); // Recursively expand nested groups
        });
      } else {
        // Regular component
        allComponentIds.add(compId);
      }
    };
    
    // Expand all selected components
    selectedComponents.forEach(comp => {
      if (comp.type === 'Group') {
        expandGroup(comp.id);
      } else {
        allComponentIds.add(comp.id);
      }
    });
    
    // Get all components that will be in the new group
    const componentsToGroup = allComponents.filter(c => allComponentIds.has(c.id));
    
    // Calculate bounding box for the group
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    componentsToGroup.forEach(comp => {
      const x = comp.props.position?.x || 0;
      const y = comp.props.position?.y || 0;
      const width = comp.props.size?.width || comp.props.width || 100;
      const height = comp.props.size?.height || comp.props.height || 100;
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    });
    
    // Remove any existing groups that are being merged
    const groupsToRemove = selectedComponents.filter(c => c.type === 'Group');
    groupsToRemove.forEach(group => {
      get().removeDraftComponent(slideId, group.id);
    });
    
    // Create the new group component
    const groupId = `group-${Date.now()}`;
    const groupComponent: ComponentInstance = {
      id: groupId,
      type: 'Group',
      props: {
        position: { x: minX, y: minY },
        size: { width: maxX - minX, height: maxY - minY },
        width: maxX - minX,
        height: maxY - minY,
        children: Array.from(allComponentIds),
        locked: false,
        visible: true
      }
    };
    
    // Add group to components
    get().addDraftComponent(slideId, groupComponent);
    
    // Update all child components to reference the new group
    componentsToGroup.forEach(comp => {
      get().updateDraftComponent(slideId, comp.id, {
        props: {
          ...comp.props,
          parentId: groupId,
          // Keep the same absolute position
          position: {
            x: comp.props.position?.x || 0,
            y: comp.props.position?.y || 0
          }
        }
      });
    });
    
    // Clear selection and select the new group
    get().selectComponent(groupId);
  },
  
  ungroupComponents: (slideId: string, groupId: string) => {
    const components = get().getDraftComponents(slideId);
    const groupComponent = components.find(c => c.id === groupId && c.type === 'Group');
    
    if (!groupComponent) return;
    
    const childIds = groupComponent.props.children || [];
    
    // Update child components to remove group reference (positions stay the same)
    childIds.forEach((childId: string) => {
      const child = components.find(c => c.id === childId);
      if (child) {
        get().updateDraftComponent(slideId, childId, {
          props: {
            ...child.props,
            parentId: undefined,
            // Keep the same position since we're storing absolute positions
            position: {
              x: child.props.position?.x || 0,
              y: child.props.position?.y || 0
            }
          }
        });
      }
    });
    
    // Remove the group component
    get().removeDraftComponent(slideId, groupId);
    
    // Clear editing group mode
    get().setEditingGroupId(null);
    
    // Select the ungrouped components
    get().selectComponents(childIds);
  },
  
  alignSelectedComponents: (slideId: string, alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const selectedComponents = get().getSelectedComponents(slideId);
    if (selectedComponents.length < 2) return;
    
    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedComponents.forEach(comp => {
      const x = comp.props.position?.x || 0;
      const y = comp.props.position?.y || 0;
      const width = comp.props.size?.width || 100;
      const height = comp.props.size?.height || 100;
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    });
    
    // Apply alignment
    selectedComponents.forEach(comp => {
      const currentX = comp.props.position?.x || 0;
      const currentY = comp.props.position?.y || 0;
      const width = comp.props.size?.width || 100;
      const height = comp.props.size?.height || 100;
      
      let newX = currentX;
      let newY = currentY;
      
      switch (alignment) {
        case 'left':
          newX = minX;
          break;
        case 'center':
          newX = minX + (maxX - minX) / 2 - width / 2;
          break;
        case 'right':
          newX = maxX - width;
          break;
        case 'top':
          newY = minY;
          break;
        case 'middle':
          newY = minY + (maxY - minY) / 2 - height / 2;
          break;
        case 'bottom':
          newY = maxY - height;
          break;
      }
      
      get().updateDraftComponent(slideId, comp.id, {
        props: {
          ...comp.props,
          position: { x: newX, y: newY }
        }
      });
    });
  },
  
  distributeSelectedComponents: (slideId: string, direction: 'horizontal' | 'vertical') => {
    const selectedComponents = get().getSelectedComponents(slideId);
    if (selectedComponents.length < 3) return;
    
    // Sort components by position
    const sortedComponents = [...selectedComponents].sort((a, b) => {
      if (direction === 'horizontal') {
        return (a.props.position?.x || 0) - (b.props.position?.x || 0);
      } else {
        return (a.props.position?.y || 0) - (b.props.position?.y || 0);
      }
    });
    
    // Calculate total space and spacing
    const firstComp = sortedComponents[0];
    const lastComp = sortedComponents[sortedComponents.length - 1];
    
    if (direction === 'horizontal') {
      const startX = firstComp.props.position?.x || 0;
      const endX = (lastComp.props.position?.x || 0) + (lastComp.props.size?.width || 100);
      const totalSpace = endX - startX;
      
      // Calculate total width of all components
      const totalWidth = sortedComponents.reduce((sum, comp) => sum + (comp.props.size?.width || 100), 0);
      const spacing = (totalSpace - totalWidth) / (sortedComponents.length - 1);
      
      // Position components
      let currentX = startX;
      sortedComponents.forEach((comp, index) => {
        if (index > 0) {
          get().updateDraftComponent(slideId, comp.id, {
            props: {
              ...comp.props,
              position: { 
                x: currentX, 
                y: comp.props.position?.y || 0 
              }
            }
          });
        }
        currentX += (comp.props.size?.width || 100) + spacing;
      });
    } else {
      const startY = firstComp.props.position?.y || 0;
      const endY = (lastComp.props.position?.y || 0) + (lastComp.props.size?.height || 100);
      const totalSpace = endY - startY;
      
      // Calculate total height of all components
      const totalHeight = sortedComponents.reduce((sum, comp) => sum + (comp.props.size?.height || 100), 0);
      const spacing = (totalSpace - totalHeight) / (sortedComponents.length - 1);
      
      // Position components
      let currentY = startY;
      sortedComponents.forEach((comp, index) => {
        if (index > 0) {
          get().updateDraftComponent(slideId, comp.id, {
            props: {
              ...comp.props,
              position: { 
                x: comp.props.position?.x || 0,
                y: currentY
              }
            }
          });
        }
        currentY += (comp.props.size?.height || 100) + spacing;
      });
    }
    },
  }));
  
// Make editor store available globally for components that can't use hooks
if (typeof window !== 'undefined') {
  (window as any).__editorStore = useEditorStore;
}
  
// Optional: Add selectors for common derivations if needed
// export const selectDraftComponents = (slideId: string) => (state: EditorState) => state.draftComponents[slideId];
// export const selectIsSyncing = (state: EditorState) => state.isSyncing;

// --- TODO ---
// 1. Review usages of useEditorStore and update them to use useEditorSettingsStore and useHistoryStore where appropriate.
// 2. Ensure deckStore.batchUpdateSlideComponents exists and works as expected.
// 3. Verify the interaction logic between editorStore, historyStore, and deckStore (especially around saving/syncing).
// 4. Test the refactored undo/redo and draft initialization/saving logic thoroughly.
// 5. Double-check the chart cleanup logic and reliance on global window properties. Consider alternatives.