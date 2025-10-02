import { ExperimentContext } from '../ExperimentStepPipeline';
import { SlideData } from '../../types';
import { ExperimentStep, StepConfiguration, StepResult } from './types';
import { createDeckStore, DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '../../state/DeckStateManager';
import { standardizeSize } from '../../../../src/utils/deckUtils';
import { createStepLogger } from './StepLogger';
import { Logger } from '../../utils/logging';

/**
 * Create a fresh deck for an experiment
 */
function createFreshDeck(deckId: string) {
  // Create a new store instance for this experiment
  const deckStore = createDeckStore(deckId);
  
  // Initialize with a basic deck
  deckStore.getState().setDeck({
    uuid: deckId,
    name: `Experiment Deck: ${deckId}`,
    slides: [],
    size: { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT },
    version: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    // @ts-ignore - type mismatch but these properties are used in the code
    components: {},
    styles: {},
    dependencies: {},
    backgroundStyles: {},
    elementStyles: {},
    themeOverrides: {
      darkMode: false
    }
  });
  
  return deckStore;
}

/**
 * Get all slides from the current deck.
 * Makes sure to deep clone them to avoid reference issues.
 */
function getAllDeckSlides(storeState?: any): SlideData[] {
  // Get the current deck state
  const deckState = storeState || {};
  
  // Get all slides
  const slides = deckState.deckData?.slides || [];
  
  // Make sure we have at least one slide
  if (slides.length === 0) {
    console.warn('No slides found in deck');
    return [];
  }
  
  // Make deep clones of all slides to avoid reference issues
  return slides.map((slide: any) => JSON.parse(JSON.stringify(slide)));
}

/**
 * Step 1: Set up the deck and slides
 */
export const setupDeckStep: ExperimentStep<ExperimentContext, ExperimentContext> = {
  name: 'Setup Deck',
  description: 'Sets up the deck and slides for the experiment',
  
  async execute(
    context: ExperimentContext, 
    config: StepConfiguration
  ): Promise<StepResult<ExperimentContext>> {
    // Create a logger for this step using the common utility
    const logger: Logger = createStepLogger(context, 'SetupDeck');
    
    try {
      logger.info(`Creating fresh deck for experiment: ${context.id}`);
      
      // Exit early if we don't have slides
      if (!context.beforeSlides || context.beforeSlides.length === 0) {
        logger.error(`No slides available in context for experiment: ${context.id}`);
        throw new Error(`No slides available in experiment`);
      }
      
      // Log some information about available slides
      logger.info(`Experiment has ${context.beforeSlides.length} slides`);
      context.beforeSlides.forEach((slide, index) => {
        logger.info(`Slide ${index + 1}: ID=${slide.id}, Title=${slide.title || 'Untitled'}`);
      });
      
      // Create a fresh deck
      const deckStore = createFreshDeck(context.deckStoreId);

      // Get existing slides and remove them
      const existingSlides = getAllDeckSlides(deckStore.getState());
      for (const slide of existingSlides) {
        deckStore.getState().removeSlide(slide.id);
      }

      // Process slides to ensure all width/height properties are numeric
      const processedSlides = context.beforeSlides.map(slide => {
        // If slide has width/height, make sure they're numbers
        if (slide.width !== undefined || slide.height !== undefined) {
          return {
            ...slide,
            width: standardizeSize(slide.width, DEFAULT_SLIDE_WIDTH),
            height: standardizeSize(slide.height, DEFAULT_SLIDE_HEIGHT)
          };
        }
        return slide;
      });

      // Add all slides from the experiment
      for (const slideData of processedSlides) {
        deckStore.getState().addSlide(slideData);
      }

      // Make a deep copy of the original slides to preserve the "before" state
      // This ensures we have a separate copy that won't be modified when we apply the deck diff
      const beforeSlides = JSON.parse(JSON.stringify(processedSlides));
      
      // Log slide components for debugging
      logger.info(`Setup step - preserved ${beforeSlides.length} before slides with deep copy`);
      beforeSlides.forEach((slide, index) => {
        const componentCount = slide.components?.length || 0;
        logger.info(`Before Slide ${index + 1}: ID=${slide.id}, Component count=${componentCount}`);
      });
      
      // Get the target slide for the "before" view
      const targetSlide = deckStore.getState().getSlide(context.targetSlideId);
      if (!targetSlide) {
        const slides = deckStore.getState().deckData.slides || [];
        if (slides.length > 0) {
          // Just use the first available slide if target not found
          logger.warn(`Slide with ID ${context.targetSlideId} not found in deck, using first available slide instead`);
          context.targetSlideId = slides[0].id;
        } else {
          throw new Error(`Slide with ID ${context.targetSlideId} not found in deck and no slides available`);
        }
      }
      
      return {
        success: true,
        data: {
          ...context,
          beforeSlides // Store a deep copy of the original slides
        }
      };
    } catch (error) {
      logger.error(`Error setting up deck: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}; 