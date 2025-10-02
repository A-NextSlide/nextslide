import { SlideData } from "../types/SlideTypes";
import {
  addSlide as addSlideUtil,
  addSlideAfter as addSlideAfterUtil,
  updateSlide as updateSlideUtil,
  removeSlide as removeSlideUtil,
  duplicateSlide as duplicateSlideUtil,
  reorderSlides as reorderSlidesUtil,
  mergeComponents
} from "../utils/slideUtils";
import { StoreApi } from 'zustand';
import { DeckState } from './deckStoreTypes';
import { ComponentInstance } from '../types/components';
import { useThemeStore } from './themeStore';
import { initialWorkspaceTheme } from '../types/themes';

/**
 * This module contains functions for slide operations within the deck store.
 * These are extracted to reduce the complexity of the main deck store file.
 */

/**
 * Creates a slide operations object for the given state setter and getter.
 * @param set Function to set state
 * @param get Function to get state
 */
export const createSlideOperations = (set: StoreApi<DeckState>['setState'], get: StoreApi<DeckState>['getState']) => ({
  // Add a new slide
  addSlide: async (slide: Omit<SlideData, 'id'>) => {
    // Create atomic operation that completes all steps in a single function
    const updateOperation = async () => {
      // Get current state
      const { deckData } = get();
      const startingSlideCount = deckData.slides.length;
      
      // Get current theme
      const { workspaceThemeId, availableThemes } = useThemeStore.getState();
      const currentTheme = availableThemes.find(t => t.id === workspaceThemeId) || initialWorkspaceTheme;
      
      // Create updated slides with utility function
      const updatedSlides = await addSlideUtil(deckData.slides, slide, currentTheme);
      
      // Verify the slide was actually added
      if (updatedSlides.length !== startingSlideCount + 1) {
        throw new Error('Failed to add slide - slide count mismatch');
      }
      
      // Generate a new version ID
      const versionInfo = get().generateNewVersion();
      
      // Create updated deck data
      const updatedDeck = {
        ...deckData,
        slides: updatedSlides,
        ...versionInfo
      };
      
      // Update state and save to backend in one step
      get().updateDeckData(updatedDeck);
    };
    
    // Schedule the operation
    get().scheduleUpdate(updateOperation);
  },
  
  // Add a new slide after a specific slide
  addSlideAfter: async (afterSlideId: string, slide: Partial<SlideData> = {}) => {

    
    // Create atomic operation
    const updateOperation = async () => {
      try {
        const { deckData } = get();
        
        // Get current theme
        const { workspaceThemeId, availableThemes } = useThemeStore.getState();
        const currentTheme = availableThemes.find(t => t.id === workspaceThemeId) || initialWorkspaceTheme;
        
        // Create the new slide and add it after the specified slide
        const updatedSlides = await addSlideAfterUtil(deckData.slides, afterSlideId, slide, currentTheme);
        
        // Generate a new version ID
        const versionInfo = get().generateNewVersion();
        
        // Create the updated deck data
        const updatedDeck = {
          ...deckData,
          slides: updatedSlides,
          ...versionInfo
        };
        
        // Update state and save to backend in one step
        get().updateDeckData(updatedDeck);
        

      } catch (error) {
        console.error(`[addSlideAfter] Error:`, error);
        throw error;
      }
    };
    
    // Schedule the operation
    get().scheduleUpdate(updateOperation);
  },
  
  // Update an existing slide
  updateSlide: async (id: string, data: Partial<SlideData>) => {
    try {
      const { deckData } = get();
      if (!deckData || !deckData.slides) {
      console.warn(`[updateSlide] Attempted to update slide ${id} that doesn't belong to current deck ${deckData.uuid}`);
      return;
    }
        
        // Find the current slide
        const currentSlide = deckData.slides.find(s => s.id === id);
        if (!currentSlide) {
          // Silently handle missing slide
          return;
        }
        
        // Create updated slides array
        const updatedSlides = updateSlideUtil(deckData.slides, id, data);
        
        // Find the updated slide
        const updatedSlide = updatedSlides.find(s => s.id === id);
        
        // Check if there's an actual change
        if (JSON.stringify(updatedSlide) === JSON.stringify(currentSlide)) {
          // No changes detected, silently exit
          return;
        }

        // Preserve the status if the update doesn't include one
        if (updatedSlide && !('status' in data)) {
          updatedSlide.status = currentSlide.status;
        }
        
        // CRITICAL: Prevent status downgrade from completed to generating/pending
        if (updatedSlide && currentSlide.status === 'completed' && 
            data.status && (data.status === 'generating' || data.status === 'pending')) {
          console.warn(`[updateSlide] Prevented status downgrade from 'completed' to '${data.status}' for slide ${id}`);
          updatedSlide.status = 'completed';
        }
        
        // Generate a new version
        const versionInfo = get().generateNewVersion();
        
        // Update the deck data
        const updatedDeck = {
          ...deckData,
          slides: updatedSlides,
          ...versionInfo
        };
        
        // Update state and save to backend
        get().updateDeckData(updatedDeck);
      } catch (error) {
        console.error(`[updateSlide] Error:`, error);
        throw error;
      }
  },
  
  // Remove a slide
  removeSlide: async (id: string) => {

    
    // Create atomic operation
    const updateOperation = async () => {
      try {
        // Get current state
        const { deckData } = get();
        const startingSlideCount = deckData.slides.length;
        
        // Verify slide exists
        if (!deckData.slides.some(slide => slide.id === id)) {
          console.warn(`[removeSlide] Slide ${id} not found for removal - operation cancelled`);
          return;
        }
        

        
        // Create updated slides array
        const updatedSlides = await removeSlideUtil(deckData.slides, id);
        
        // Verify slide was actually removed
        if (updatedSlides.length !== startingSlideCount - 1) {
          console.error(`[removeSlide] Slide count mismatch: Expected ${startingSlideCount - 1}, got ${updatedSlides.length}`);
          throw new Error('Failed to remove slide - slide count mismatch');
        }
        
        // Generate a new version
        const versionInfo = get().generateNewVersion();
        
        // Create updated deck data
        const updatedDeck = {
          ...deckData,
          slides: updatedSlides,
          ...versionInfo
        };
        
        // Update state and save to backend
        get().updateDeckData(updatedDeck);
        

      } catch (error) {
        console.error(`[removeSlide] Error:`, error);
        throw error;
      }
    };
    
    // Schedule the operation
    get().scheduleUpdate(updateOperation);
  },
  
  // Duplicate a slide
  duplicateSlide: async (id: string) => {

    
    // Create atomic operation
    const updateOperation = async () => {
      try {
        const { deckData } = get();
        
        // Verify slide exists
        if (!deckData.slides.some(slide => slide.id === id)) {
          console.warn(`[duplicateSlide] Slide ${id} not found for duplication - operation cancelled`);
          return;
        }
        
        // Create updated slides array
        const updatedSlides = await duplicateSlideUtil(deckData.slides, id);
        
        // Generate a new version
        const versionInfo = get().generateNewVersion();
        
        // Create updated deck data
        const updatedDeck = {
          ...deckData,
          slides: updatedSlides,
          ...versionInfo
        };
        
        // Update state and save to backend
        get().updateDeckData(updatedDeck);
        

      } catch (error) {
        console.error(`[duplicateSlide] Error:`, error);
        throw error;
      }
    };
    
    // Schedule the operation
    get().scheduleUpdate(updateOperation);
  },
  
  // Reorder slides (drag and drop)
  reorderSlides: async (sourceIndex: number, destinationIndex: number) => {

    
    // Create atomic operation
    const updateOperation = async () => {
      try {
        const { deckData } = get();
        
        // Validate indices
        if (sourceIndex < 0 || sourceIndex >= deckData.slides.length || 
            destinationIndex < 0 || destinationIndex >= deckData.slides.length ||
            sourceIndex === destinationIndex) {
          console.warn(`[reorderSlides] Invalid slide indices for reordering: ${sourceIndex} to ${destinationIndex}`);
          return;
        }
        
        // Create updated slides array
        const updatedSlides = reorderSlidesUtil(deckData.slides, sourceIndex, destinationIndex);
        
        // Generate a new version
        const versionInfo = get().generateNewVersion();
        
        // Create updated deck data
        const updatedDeck = {
          ...deckData,
          slides: updatedSlides,
          ...versionInfo
        };
        
        // Update state and save to backend
        get().updateDeckData(updatedDeck);
        

      } catch (error) {
        console.error(`[reorderSlides] Error:`, error);
        throw error;
      }
    };
    
    // Schedule the operation
    get().scheduleUpdate(updateOperation);
  },

  // Component operations
  // Add a component to a slide
  addComponent: (slideId: string, component: ComponentInstance) => {

    
    const { deckData, yjsAddComponent, yjsSyncEnabled } = get();
    
    // Validate that the slide belongs to the current deck
    const slideExists = deckData.slides.some(s => s.id === slideId);
    if (!slideExists) {
      console.warn(`[addComponent] Attempted to add component to slide ${slideId} that doesn't belong to current deck ${deckData.uuid}`);
      return;
    }
    
    if (yjsAddComponent && yjsSyncEnabled) {
      yjsAddComponent(slideId, component);
      return;
    }
    
    const updateOperation = async () => {
      try {
        const { deckData } = get();
        
        // Find the slide
        const slide = deckData.slides.find(s => s.id === slideId);
        if (!slide) {
          return;
        }
        
        // Create updated components array
        const updatedComponents = mergeComponents(slide.components || [], [component]);
        
        // Create updated slides array
        const updatedSlides = updateSlideUtil(deckData.slides, slideId, { 
          components: updatedComponents 
        });
        
        // Generate a new version
        const versionInfo = get().generateNewVersion();
        
        // Create updated deck data
        const updatedDeck = {
          ...deckData,
          slides: updatedSlides,
          ...versionInfo
        };
        
        // Update state and save to backend
        get().updateDeckData(updatedDeck);
      } catch (error) {
        // Silent error handling
      }
    };
    
    // Schedule the operation
    get().scheduleUpdate(updateOperation);
  },
  
  // Update a component on a slide
  updateComponent: (slideId: string, componentId: string, data: Partial<ComponentInstance>) => {

    
    const { deckData, yjsUpdateComponent, yjsSyncEnabled } = get();
    
    // Validate that the slide belongs to the current deck
    const slideExists = deckData.slides.some(s => s.id === slideId);
    if (!slideExists) {
      console.warn(`[updateComponent] Attempted to update component on slide ${slideId} that doesn't belong to current deck ${deckData.uuid}`);
      return;
    }
    
    if (yjsUpdateComponent && yjsSyncEnabled && data.props) {
      yjsUpdateComponent(slideId, componentId, data.props);
      return;
    }
    
    // Schedule update operation
    const updateOperation = async () => {
      try {
        const { deckData } = get();
        
        // Find the slide
        const slide = deckData.slides.find(s => s.id === slideId);
        if (!slide || !slide.components) {
          return;
        }
        
        // Find the component
        const component = slide.components.find(c => c.id === componentId);
        if (!component) {
          return;
        }
        
        // Create updated component
        const updatedComponent = {
          ...component,
          ...data,
          props: { ...component.props, ...(data.props || {}) }
        };
        
        // Create updated components array
        const updatedComponents = slide.components.map(c => 
          c.id === componentId ? updatedComponent : c
        );
        
        // Check if components actually changed
        if (JSON.stringify(updatedComponents) === JSON.stringify(slide.components)) {
          return;
        }
        
        // Create updated slides array
        const updatedSlides = updateSlideUtil(deckData.slides, slideId, { 
          components: updatedComponents 
        });

        // Decide whether this change is layout-only (position/size/rotation) to avoid version bumps during moves
        const allowedLayoutKeys = new Set(['position', 'size', 'rotation']);
        const prevProps = component.props || {} as any;
        const nextProps = (updatedComponent.props || {}) as any;
        const allKeys = new Set<string>([...Object.keys(prevProps), ...Object.keys(nextProps)]);
        let nonLayoutChanged = false;
        allKeys.forEach((key) => {
          if (allowedLayoutKeys.has(key)) {
            return;
          }
          const prevVal = (prevProps as any)[key];
          const nextVal = (nextProps as any)[key];
          const prevStr = JSON.stringify(prevVal);
          const nextStr = JSON.stringify(nextVal);
          if (prevStr !== nextStr) {
            nonLayoutChanged = true;
          }
        });
        // Also guard against top-level changes (outside props)
        const topLevelChanged = ['type','locked','visible','styles','id'].some((k) => (component as any)[k] !== (updatedComponent as any)[k]);
        const isLayoutOnlyChange = !nonLayoutChanged && !topLevelChanged;

        if (isLayoutOnlyChange) {
          // Save without version bump for pure layout moves
          const deckNoVersionBump = {
            ...deckData,
            slides: updatedSlides
          };
          get().updateDeckData(deckNoVersionBump);
        } else {
          // Generate a new version for substantive changes
          const versionInfo = get().generateNewVersion();
          const updatedDeck = {
            ...deckData,
            slides: updatedSlides,
            ...versionInfo
          };
          get().updateDeckData(updatedDeck);
        }
      } catch (error) {
        console.error(`[updateComponent] Error:`, error);
        throw error;
      }
    };
    
    // Schedule the operation
    get().scheduleUpdate(updateOperation);
  },
  
  // Delete a component from a slide
  deleteComponent: (slideId: string, componentId: string) => {

    
    // Delete component from Yjs if collaboration is enabled
    try {
      const { yjsRemoveComponent, yjsSyncEnabled } = get();
      if (yjsRemoveComponent && yjsSyncEnabled) {

        yjsRemoveComponent(slideId, componentId);
      }
    } catch (error) {
      console.warn(`[deleteComponent] Error removing component from Yjs:`, error);
    }
    
    // Schedule update operation
    const updateOperation = async () => {
      try {
        const { deckData } = get();
        
        // Find the slide
        const slide = deckData.slides.find(s => s.id === slideId);
        if (!slide || !slide.components) {
          console.warn(`[deleteComponent] Slide ${slideId} not found or has no components`);
          return;
        }
        
        // Prevent deletion of background component
        const target = slide.components.find(c => c.id === componentId);
        const isBackgroundComponent = target && (target.type === 'Background' || (target.id && target.id.toLowerCase().includes('background')));
        if (isBackgroundComponent) {
          return;
        }

        // Create updated components array (background already guarded above)
        const updatedComponents = slide.components.filter(c => c.id !== componentId);
        
        // Check if component was actually found and removed
        if (updatedComponents.length === slide.components.length) {
          console.warn(`[deleteComponent] Component ${componentId} not found on slide ${slideId}`);
          return;
        }
        
        // Create updated slides array
        const updatedSlides = updateSlideUtil(deckData.slides, slideId, { 
          components: updatedComponents 
        });
        
        // Generate a new version
        const versionInfo = get().generateNewVersion();
        
        // Create updated deck data
        const updatedDeck = {
          ...deckData,
          slides: updatedSlides,
          ...versionInfo
        };
        
        // Update state and save to backend
        get().updateDeckData(updatedDeck);
        

      } catch (error) {
        console.error(`[deleteComponent] Error:`, error);
        throw error;
      }
    };
    
    // Schedule the operation
    get().scheduleUpdate(updateOperation);
  },
  
  // Batch update components on a slide
  batchUpdateComponents: (slideId: string, components: ComponentInstance[]) => {

    
    // Schedule update operation
    const updateOperation = async () => {
      try {
        const { deckData } = get();
        
        // Find the slide
        const slide = deckData.slides.find(s => s.id === slideId);
        if (!slide) {
          console.warn(`[batchUpdateComponents] Slide ${slideId} not found`);
          return;
        }
        
        // Create updated slides array
        const updatedSlides = updateSlideUtil(deckData.slides, slideId, { 
          components: components 
        });
        
        // Generate a new version
        const versionInfo = get().generateNewVersion();
        
        // Create updated deck data
        const updatedDeck = {
          ...deckData,
          slides: updatedSlides,
          ...versionInfo
        };
        
        // Update state and save to backend
        get().updateDeckData(updatedDeck, { batchUpdate: true });
        

      } catch (error) {
        console.error(`[batchUpdateComponents] Error:`, error);
        throw error;
      }
    };
    
    // Schedule the operation
    get().scheduleUpdate(updateOperation);
  }
});