/**
 * Test script for the RenderingService
 * 
 * This script demonstrates how to use the RenderingService to create
 * before/after renderings of slides with a DeckDiff applied.
 * It now uses the API server instead of the old SSR pipeline.
 */
import path from 'path';
import { RenderingService } from './renderer/RenderingService';
import { createSampleSlide, createSampleDeckDiff, initializeDeckWithSlides } from './utils/test-utils';
import { createLoggerWrapper } from './utils/logging';
import { defaults } from './utils/config';

/**
 * Run a test of the RenderingService
 */
async function runRenderingTest() {
  // Set up logging
  const logger = createLoggerWrapper(console, 'RenderingTest');
  
  try {
    logger.info('Starting rendering test...');
    
    // Create sample test slide
    const sampleSlide = createSampleSlide();
    
    // Initialize the store with sample data
    initializeDeckWithSlides([sampleSlide]);
    
    // Create sample deck diff
    const sampleDiff = createSampleDeckDiff();
    
    // Create a rendering service using the API server
    const outputDir = path.join(process.cwd(), 'test-output');
    const apiBaseUrl = process.env.API_SERVER_URL || 'http://localhost:3333';
    
    logger.info(`Using API server at: ${apiBaseUrl}`);
    
    const renderingService = new RenderingService(
      outputDir, 
      defaults.rendering.width,
      defaults.rendering.height,
      { includeStyles: true },
      apiBaseUrl,
      logger
    );
    
    // Create before/after renderings
    logger.info('Creating before/after renderings...');
    const result = await renderingService.captureBeforeAndAfter('test-slide-1', sampleDiff);
    
    logger.info('Rendering complete!');
    logger.info(`Before rendering: ${result.beforeImagePath}`);
    logger.info(`After rendering: ${result.afterImagePath}`);
    logger.info(`Timestamp: ${result.timestamp}`);
    
    return result;
  } catch (error) {
    logger.error('Error during rendering test: ' + (error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

// Run the test
runRenderingTest()
  .then(() => {
    console.log('\nTest completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error(`\nTest failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }); 