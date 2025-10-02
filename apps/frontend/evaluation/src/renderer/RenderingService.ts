import { SlideData, DeckDiff, RenderingResult, CompleteDeckData } from '../types';
import { useDeckStore } from '../state/DeckStateManager';
import { renderSlideToFile, SlideRenderingOptions } from '../utils/rendering';
import { defaults } from '../utils/config';
import { Logger } from '../utils/logging';

/**
 * Service for creating renderings of slides before and after applying a DeckDiff
 */
export class RenderingService {
  private outputDir: string;
  private width: number;
  private height: number;
  private renderOptions: Record<string, any>;
  private apiBaseUrl: string;
  private logger: Logger;
  
  /**
   * Initialize the rendering service
   * 
   * @param outputDir Directory to save renderings
   * @param width Slide width in pixels
   * @param height Slide height in pixels
   * @param renderOptions Additional rendering options
   * @param apiBaseUrl Base URL for the API server
   * @param logger Logger to use for rendering events
   */
  constructor(
    outputDir: string, 
    width = defaults.rendering.width, 
    height = defaults.rendering.height,
    renderOptions: Record<string, any> = {},
    apiBaseUrl: string = process.env.API_SERVER_URL || defaults.apiServer.baseUrl || 'http://localhost:3333',
    logger: Logger = console
  ) {
    this.outputDir = outputDir;
    this.width = width;
    this.height = height;
    this.renderOptions = renderOptions;
    this.apiBaseUrl = apiBaseUrl;
    this.logger = logger;
  }

  /**
   * Create a rendering of a slide
   * 
   * @param slide Slide to render
   * @param deckData Complete deck data containing the slide
   * @param type Type of rendering (before/after)
   * @param debug Enable debug mode
   * @returns Path to the saved rendering
   */
  private async createRendering(
    slide: SlideData, 
    deckData: CompleteDeckData,
    type: 'before' | 'after', 
    debug: boolean = false
  ): Promise<string> {
    this.logger.log(`Creating ${type} rendering of slide ${slide.id}`);
    
    const options: SlideRenderingOptions = {
      outputDir: this.outputDir,
      width: this.width,
      height: this.height,
      debug: debug || this.renderOptions.debug,
      includeStyles: this.renderOptions.includeStyles ?? true,
      apiBaseUrl: this.apiBaseUrl
    };
    
    try {
      // Directly call renderSlideToFile
      return await renderSlideToFile(slide, deckData, options, type);
    } catch (error) {
      const errorMessage = `Failed to render slide ${slide.id} (${type}): ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Create before and after renderings of a slide with a DeckDiff applied
   * 
   * @param slideId ID of the slide to render
   * @param deckDiff DeckDiff to apply
   * @param debug Enable debug mode
   * @returns Promise resolving to the rendering result
   */
  async captureBeforeAndAfter(
    slideId: string, 
    deckDiff: DeckDiff, 
    debug: boolean = false
  ): Promise<RenderingResult> {
    // Get the store
    const store = useDeckStore.getState();
    
    // Find the slide in the deck
    const slide = store.getSlide(slideId);
    if (!slide) {
      throw new Error(`Slide ${slideId} not found in deck`);
    }
    
    // Make a copy of the original deck for comparison and rendering
    const originalDeck = JSON.parse(JSON.stringify(store.deckData));
    
    // Create a rendering of the slide before applying the diff
    this.logger.log(`Taking rendering of slide ${slideId} before applying diff`);
    const beforeImagePath = await this.createRendering(slide, originalDeck, 'before', debug);
    
    // Apply the deck diff
    this.logger.log(`Applying deckDiff to slide ${slideId}`);
    store.applyDeckDiff(deckDiff);
    
    // Get the updated slide and deck
    const updatedSlide = store.getSlide(slideId);
    if (!updatedSlide) {
      throw new Error(`Slide ${slideId} not found after applying diff`);
    }
    
    // Create a rendering of the slide after applying the diff
    this.logger.log(`Taking rendering of slide ${slideId} after applying diff`);
    const afterImagePath = await this.createRendering(updatedSlide, store.deckData, 'after', debug);
    
    // Log the changes for debugging
    this.logChanges(deckDiff, slideId);
    
    // Return the result
    const timestamp = new Date().toISOString();
    return {
      beforeImagePath,
      afterImagePath,
      deckDiff,
      timestamp
    };
  }
  
  /**
   * Log changes from a deck diff for debugging
   * 
   * @param deckDiff The deck diff to log
   * @param slideId Optional slide ID to filter changes for
   */
  private logChanges(deckDiff: DeckDiff, slideId?: string): void {
    try {
      this.logger.debug('Deck diff changes:');
      
      // Log slides being added
      if (deckDiff.slides_to_add && deckDiff.slides_to_add.length > 0) {
        this.logger.debug(`  - Adding ${deckDiff.slides_to_add.length} slide(s)`);
      }
      
      // Log slides being removed
      if (deckDiff.slides_to_remove && deckDiff.slides_to_remove.length > 0) {
        this.logger.debug(`  - Removing ${deckDiff.slides_to_remove.length} slide(s)`);
      }
      
      // Log slides being updated
      if (deckDiff.slides_to_update && deckDiff.slides_to_update.length > 0) {
        this.logger.debug(`  - Updating ${deckDiff.slides_to_update.length} slide(s)`);
        
        // If a specific slide ID is provided, filter for changes to that slide
        if (slideId) {
          const slideChanges = deckDiff.slides_to_update.find(s => s.slide_id === slideId);
          if (slideChanges) {
            this.logger.debug(`  - Changes to slide ${slideId}:`);
            
            // Components to add
            if (slideChanges.components_to_add && slideChanges.components_to_add.length > 0) {
              this.logger.debug(`    - Adding ${slideChanges.components_to_add.length} component(s)`);
            }
            
            // Components to remove
            if (slideChanges.components_to_remove && slideChanges.components_to_remove.length > 0) {
              this.logger.debug(`    - Removing ${slideChanges.components_to_remove.length} component(s)`);
            }
            
            // Components to update
            if (slideChanges.components_to_update && slideChanges.components_to_update.length > 0) {
              this.logger.debug(`    - Updating ${slideChanges.components_to_update.length} component(s)`);
            }
          }
        }
      }
      
      // Log deck property changes
      if (deckDiff.deck_properties && Object.keys(deckDiff.deck_properties).length > 0) {
        this.logger.debug(`  - Updating ${Object.keys(deckDiff.deck_properties).length} deck properties`);
      }
    } catch (error) {
      this.logger.error('Error logging deck diff changes: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
} 