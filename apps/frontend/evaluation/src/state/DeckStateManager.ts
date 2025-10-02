import { create, StoreApi } from 'zustand';
import { 
  CompleteDeckData, 
  SlideData, 
  ComponentInstance, 
  DeckDiff 
} from '../types';
import { applyDeckDiffPure } from '../../../src/utils/deckDiffUtils';

// Interface for the state store
interface DeckState {
  // Core data
  deckData: CompleteDeckData;
  
  // Actions
  updateDeckData: (data: Partial<CompleteDeckData>) => void;
  applyDeckDiff: (deckDiff: DeckDiff) => void;
  setDeck: (deckData: CompleteDeckData) => void;
  getSlide: (slideId: string) => SlideData | undefined;
  updateSlide: (slideId: string, slide: SlideData) => void;
  addSlide: (slide: SlideData) => void;
  removeSlide: (slideId: string) => void;
}

// Default slide width and height
export const DEFAULT_SLIDE_WIDTH = 1920;
export const DEFAULT_SLIDE_HEIGHT = 1080;

// Create a minimal deck with a single empty slide
export const createMinimalDeck = (deckId: string): CompleteDeckData => {
  return {
    uuid: deckId,
    name: 'Evaluation Deck',
    size: {
      width: DEFAULT_SLIDE_WIDTH,
      height: DEFAULT_SLIDE_HEIGHT
    },
    slides: [
      {
        id: 'slide-1',
        title: 'Test Slide',
        background: {
          id: 'bg-1',
          type: 'Shape',
          props: {
            fill: '#ffffff',
            shapeType: 'rectangle',
            stroke: 'transparent',
            strokeWidth: 0,
            position: { x: 0, y: 0 },
            width: DEFAULT_SLIDE_WIDTH,
            height: DEFAULT_SLIDE_HEIGHT
          }
        },
        components: []
      }
    ],
    version: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    components: {},
    styles: {},
    dependencies: {},
    backgroundStyles: {},
    elementStyles: {},
    themeOverrides: {
      darkMode: false
    }
  };
};

// Factory function to create a new deck store
export function createDeckStore(initialDeckId: string = 'evaluation-deck') {
  // Create a new store instance with an empty deck
  return create<DeckState>((set, get) => ({
    // Initial state with an empty deck
    deckData: createMinimalDeck(initialDeckId),
    
    // Update deck data with new values
    updateDeckData: (data: Partial<CompleteDeckData>) => {
      set((state) => ({
        deckData: {
          ...state.deckData,
          ...data,
          lastModified: new Date().toISOString()
        }
      }));
    },
    
    // Set the entire deck data
    setDeck: (deckData: CompleteDeckData) => {
      set({ deckData });
    },
    
    // Get a slide by ID
    getSlide: (slideId: string) => {
      return get().deckData.slides.find(slide => slide.id === slideId);
    },
    
    // Update a slide by ID
    updateSlide: (slideId: string, slideData: SlideData) => {
      set((state) => {
        const slideIndex = state.deckData.slides.findIndex(s => s.id === slideId);
        if (slideIndex === -1) return state; // No change if slide not found
        
        const updatedSlides = [...state.deckData.slides];
        updatedSlides[slideIndex] = slideData;
        
        return {
          deckData: {
            ...state.deckData,
            slides: updatedSlides,
            lastModified: new Date().toISOString()
          }
        };
      });
    },
    
    // Add a new slide
    addSlide: (slide: SlideData) => {
      set((state) => ({
        deckData: {
          ...state.deckData,
          slides: [...state.deckData.slides, slide],
          lastModified: new Date().toISOString()
        }
      }));
    },
    
    // Remove a slide
    removeSlide: (slideId: string) => {
      set((state) => ({
        deckData: {
          ...state.deckData,
          slides: state.deckData.slides.filter(slide => slide.id !== slideId),
          lastModified: new Date().toISOString()
        }
      }));
    },
    
    // Apply a deck diff to the current deck
    applyDeckDiff: (deckDiff: DeckDiff) => {
      // Validate input - Check if deckDiff is null or undefined
      if (!deckDiff) {
        throw new Error('Cannot apply null or undefined deck diff. The API may have returned an invalid response.');
      }
      
      // Use the applyDeckDiffPure function from deckDiffUtils.ts
      const currentDeckData = get().deckData;
      const updatedDeckData = applyDeckDiffPure(currentDeckData, deckDiff);
      
      // Only update the state if changes were made
      if (updatedDeckData !== currentDeckData) {
        set({ deckData: updatedDeckData });
      }
    }
  }));
}

// Create a default shared store instance
export const useDeckStore = createDeckStore(); 