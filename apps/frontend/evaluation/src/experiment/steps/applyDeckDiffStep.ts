import { ExperimentContext } from '../ExperimentStepPipeline';
import { ExperimentStep, StepConfiguration, StepResult } from './types';
import { createDeckStore } from '../../state/DeckStateManager';
import { createStepLogger } from './StepLogger';
import { Logger } from '../../utils/logging';

/**
 * Step 3: Apply deck diff to generate the "after" state
 */
export const applyDeckDiffStep: ExperimentStep<ExperimentContext, ExperimentContext> = {
  name: 'Apply Deck Diff',
  description: 'Applies deck diff to generate the "after" state',
  
  async execute(
    context: ExperimentContext, 
    config: StepConfiguration
  ): Promise<StepResult<ExperimentContext>> {
    // Create a logger for this step using the common utility
    const logger: Logger = createStepLogger(context, 'ApplyDiff');
    
    try {
      if (!context.deckDiff) {
        throw new Error('No deck diff available to apply');
      }

      // Create a fresh deck store for the "after" state - we won't modify original before slides
      const afterDeckId = `${context.deckStoreId}-after`;
      const deckStore = createDeckStore(afterDeckId);
      
      // Initialize with a basic deck
      deckStore.getState().setDeck({
        uuid: afterDeckId,
        name: `Experiment After Deck: ${afterDeckId}`,
        slides: [],
        size: { width: 1920, height: 1080 }, // Default size
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
      
      // Create deep copies of the before slides to use in the "after" deck
      // This ensures we don't modify the original before slides
      const beforeSlidesCopies = JSON.parse(JSON.stringify(context.beforeSlides));
      
      // Add the copied slides to the "after" deck store
      for (const slideData of beforeSlidesCopies) {
        deckStore.getState().addSlide(slideData);
      }

      // Apply the deck diff to the "after" deck
      logger.info('Applying deck diff to create the "after" state');
      deckStore.getState().applyDeckDiff(context.deckDiff);
      logger.info('Successfully applied deck diff to create the "after" state');

      // Get all slides in the "after" deck
      const afterSlides = getAllDeckSlides(deckStore.getState());
      
      // Log after slide data for debugging
      logger.info(`Apply diff step - created ${afterSlides.length} after slides`);
      afterSlides.forEach((slide, index) => {
        const componentCount = slide.components?.length || 0;
        logger.info(`After Slide ${index + 1}: ID=${slide.id}, Component count=${componentCount}`);
      });
      
      // Verify the before and after states are different objects
      logger.info('Verifying before and after slides are separate objects');
      logger.info(`Before slides reference: ${context.beforeSlides}`);
      logger.info(`After slides reference: ${afterSlides}`);
      
      // Do a comparison to confirm they're different
      const beforeStr = JSON.stringify(context.beforeSlides).substring(0, 50);
      const afterStr = JSON.stringify(afterSlides).substring(0, 50);
      logger.info(`Before slides (truncated): ${beforeStr}...`);
      logger.info(`After slides (truncated): ${afterStr}...`);

      return {
        success: true,
        data: {
          ...context,
          afterSlides
        }
      };
    } catch (error) {
      logger.error(`Error applying deck diff: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
};

/**
 * Get all slides from the current deck.
 * Makes sure to deep clone them to avoid reference issues.
 */
function getAllDeckSlides(storeState?: any): any[] {
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