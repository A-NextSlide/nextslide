import { useDeckStore, createMinimalDeck } from './state/DeckStateManager';
import { RenderingService } from './renderer/RenderingService';
import { DeckDiff, ComponentInstance } from './types';
import { 
  getRuntimePath, 
  ensureDirectoryExists,
  createLoggerWrapper,
  withErrorHandling 
} from './utils';

/**
 * Create a sample deck for demonstration purposes
 */
function createSampleDeck() {
  // Create a deck with a single slide
  const deckStore = useDeckStore.getState();
  
  // Create a minimal deck with a default slide
  const sampleDeck = createMinimalDeck('sample-deck');
  
  // Add a text component to the first slide
  const firstSlide = sampleDeck.slides[0];
  firstSlide.components = [
    {
      id: 'text-1',
      type: 'TextBlock',
      props: {
        position: { x: 200, y: 200 },
        width: 600,
        height: 200,
        text: 'This is a sample slide',
        fontSize: 48,
        fontWeight: 'bold',
        textAlign: 'center',
        textColor: '#000000'
      }
    }
  ];
  
  // Set the deck data
  deckStore.setDeck(sampleDeck);
  
  return sampleDeck;
}

/**
 * Create a sample deck diff that changes the text component's properties
 */
function createSampleDeckDiff(): DeckDiff {
  const slideId = 'slide-1';
  const componentId = 'text-1';
  
  // Create component update that changes the text and color
  const componentUpdate: ComponentInstance = {
    id: componentId,
    type: 'TextBlock',
    props: {
      text: 'This text has been updated by a DeckDiff!',
      textColor: '#FF0000',
      fontSize: 54
    }
  };
  
  // Create the deck diff with the component update
  return {
    slides_to_update: [
      {
        slide_id: slideId,
        components_to_update: [componentUpdate]
      }
    ]
  };
}

/**
 * Print information about accessing the HTML files
 */
function printHelp(beforePath: string, afterPath: string) {
  console.log('\n=== How to View the Results ===');
  console.log('The system has created HTML files for slide visualization.');
  console.log('To view the files:');
  console.log(`  1. Before slide: open "${beforePath}" in your web browser`);
  console.log(`  2. After slide: open "${afterPath}" in your web browser`);
  console.log('\nThese HTML files show how the slide looks before and after applying the deck diff.');
  console.log('In a production implementation, this would use a headless browser to create actual PNG images.');
}

/**
 * Run the rendering demo
 */
async function runDemo() {
  // Set up logging
  const logger = createLoggerWrapper(console, 'Demo');
  
  // Use error handling
  const runWithErrorHandling = withErrorHandling(
    async () => {
      logger.info('Starting slide evaluation demo');
      
      // Create a sample deck
      const deck = createSampleDeck();
      
      // Create a sample deck diff
      const deckDiff = createSampleDeckDiff();
      
      // Get the current directory
      const { dirname } = getRuntimePath();
      
      // Create rendering service
      // Use the directory relative to the current file
      const outputDir = `${dirname}/../slide-renderings`;
      await ensureDirectoryExists(outputDir);
      
      const renderingService = new RenderingService(outputDir, undefined, undefined, {}, undefined, logger);
      
      // Create before and after renderings
      logger.info('Creating before and after slide renderings...');
      const result = await renderingService.captureBeforeAndAfter('slide-1', deckDiff);
      
      // Print the result
      logger.info('\n=== Results ===');
      logger.info('Slide renderings created:');
      logger.info(`  Before: ${result.beforeImagePath}`);
      logger.info(`  After: ${result.afterImagePath}`);
      logger.info(`  Timestamp: ${result.timestamp}`);
      
      // Print help information
      printHelp(result.beforeImagePath, result.afterImagePath);
      
      return result;
    },
    'Error running demo',
    logger
  );
  
  try {
    await runWithErrorHandling();
    logger.info('\nDemo completed successfully');
  } catch (error) {
    logger.error(`Demo failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run the demo
runDemo();

// Export the API client
export * from './experiment/SlideRenderingApiClient'; 