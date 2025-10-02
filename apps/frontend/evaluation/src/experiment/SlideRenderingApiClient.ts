/**
 * API client utilities for rendering slides via the API server
 */
import { SlideData, CompleteDeckData } from '../types';
import path from 'path';
import fs from 'fs/promises';
import { getApiServerConfig } from '../utils/config';
import { withErrorHandling, trySafe } from '../utils/error-handling';
import { ensureDirectoryExists } from '../utils/rendering';
import { Logger, createLoggerWrapper } from '../utils/logging';
import { ApiClient } from '../api/ApiClient';

/**
 * Configuration options for the rendering API
 */
interface RenderApiConfig {
  apiBaseUrl?: string;
  logger?: Logger;
  debugMode?: boolean;
}

/**
 * Global state
 */
let apiBaseUrl: string = 'http://localhost:3333';
let logger: Logger = console;
let debugMode: boolean = false;

/**
 * Initialize the slide rendering API client with configuration
 */
export function initializeRenderingApi(config: RenderApiConfig = {}): void {
  // Apply the new configuration
  apiBaseUrl = config.apiBaseUrl || getApiServerConfig().baseUrl;
  logger = config.logger || createLoggerWrapper(console, 'SlideRenderingApi');
  debugMode = config.debugMode || false;
  
  logger.info(`Initialized slide rendering API client with base URL: ${apiBaseUrl}`);
}

/**
 * Clean up the slide rendering API client and its resources.
 * This should be called before the application exits.
 */
export function cleanupRenderingApi(): void {
  // Add diagnostics before cleanup if in debug mode
  if (debugMode) {
    logger.info('\n==== SLIDE RENDERING API CLIENT CLEANUP DIAGNOSTICS ====');
    
    // Attempt to log any requests that might still be in progress
    trySafe(async () => {
      // @ts-ignore - accessing Node.js internals
      const activeRequests = process._getActiveRequests && process._getActiveRequests();
      if (activeRequests && activeRequests.length > 0) {
        logger.info(`Found ${activeRequests.length} active HTTP requests`);
        
        activeRequests.forEach((req: any, i: number) => {
          if (req.method && req.path) {
            logger.info(`  Request ${i+1}: ${req.method} ${req.path}`);
          } else {
            logger.info(`  Request ${i+1}: [details not available]`);
          }
          
          // Check if the request has a connection and try to close it
          if (req.connection || req.socket) {
            const connection = req.connection || req.socket;
            logger.info(`    - Connected to: ${connection.remoteAddress}:${connection.remotePort}`);
            logger.info(`    - Connection state: ${connection.destroyed ? 'destroyed' : 'active'}`);
          }
        });
      } else {
        logger.info('No active HTTP requests found');
      }
    }, logger);
    
    logger.info('==== END SLIDE RENDERING API CLIENT CLEANUP DIAGNOSTICS ====\n');
  }
}

/**
 * Generates HTML for slides using the API server
 */
export async function generateSlidesHtml(params: { 
  slides: SlideData[], 
  deckId: string, 
  deckData?: CompleteDeckData
}): Promise<string> {
  const { slides, deckId, deckData } = params;
  
  // Validate API URL
  if (!apiBaseUrl) {
    throw new Error('API server base URL not configured. Please call initializeRenderingApi with a valid config.');
  }
  
  // Create a complete deck data object if not provided
  const completeDeckData = deckData || {
    uuid: deckId,
    name: 'Generated Deck',
    slides: slides,
    version: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    size: {
      width: 1920,
      height: 1080
    },
    components: {},
    styles: {},
    dependencies: {},
    backgroundStyles: {},
    elementStyles: {},
    themeOverrides: {
      darkMode: false
    }
  };
  
  // Wrap the HTML generation with error handling
  const generateHtmlWithErrorHandling = withErrorHandling(
    async () => {
      // Create API client
      const apiClient = new ApiClient(apiBaseUrl);
      
      // Check if API server is available
      const isAvailable = await apiClient.isAvailable();
      if (!isAvailable) {
        throw new Error('API server is not available');
      }
      
      // Create HTML content for each slide
      const slideHtmlPromises = slides.map(async (slide, index) => {
        try {
          // Find the slide index in the deck
          const slideIndex = completeDeckData.slides.findIndex(s => s.id === slide.id);
          if (slideIndex === -1) {
            throw new Error(`Slide ${slide.id} not found in the deck`);
          }
          
          // Render the slide
          const response = await apiClient.renderSlide(slide, completeDeckData);
          
          // Use the HTML from the response
          const slideHtml = response.html || '';
          
          return `
          <!-- START SLIDE CONTAINER: Slide #${index + 1} | ID: ${slide.id} | Deck: ${deckId} -->
          <div class="slide-item">
            <div class="slide-label">Slide ${index + 1}: ${slide.title || slide.id}</div>
            <div class="slide-container">
              ${slideHtml}
            </div>
          </div>
          <!-- END SLIDE CONTAINER: Slide #${index + 1} | ID: ${slide.id} -->
          `;
        } catch (error) {
          logger.error(`Error rendering slide ${slide.id}: ${error instanceof Error ? error.message : String(error)}`);
          return `
          <!-- START SLIDE CONTAINER: Slide #${index + 1} | ID: ${slide.id} | Deck: ${deckId} -->
          <div class="slide-item">
            <div class="slide-label">Slide ${index + 1}: ${slide.title || slide.id}</div>
            <div class="slide-container error">
              <div class="error-message">Error rendering slide: ${error instanceof Error ? error.message : String(error)}</div>
            </div>
          </div>
          <!-- END SLIDE CONTAINER: Slide #${index + 1} | ID: ${slide.id} -->
          `;
        }
      });
      
      // Wait for all slide HTML to be generated
      const slideHtmls = await Promise.all(slideHtmlPromises);
      
      return slideHtmls.join('');
    },
    `Error generating slides HTML for deck ${deckId}`,
    logger
  );
  
  return generateHtmlWithErrorHandling();
}

/**
 * Generates images for slides and saves them in the experiment directory using the API server
 * 
 * @param slides The slide data to render
 * @param outputDir Directory to save the images in
 * @param prefix Prefix for the image filenames
 * @param scale Scale factor for the images (0.25-1.0)
 * @param options Additional options for rendering
 * @returns Array of paths to the generated images
 */
export async function generateSlideImages(
  slides: SlideData[], 
  outputDir: string, 
  prefix: string = '',
  scale: number = 0.75,
  options: any = {}
): Promise<string[]> {
  const customLogger = options.logger || logger;
  const experimentId = options.experimentId || 'unknown';
  const timeout = options.timeout || 60000; // 1 minute timeout per slide by default
  
  customLogger.info(`Starting image generation for ${slides.length} slides at scale ${scale} with ${timeout}ms timeout`);
  
  // Ensure the images directory exists
  const imagesDir = path.join(outputDir, 'images');
  await fs.mkdir(imagesDir, { recursive: true });
  
  // Validate the slides before processing
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideIndex = i + 1;
    
    // Check if slide is valid
    if (!slide.id) {
      customLogger.warn(`Slide ${slideIndex} is missing ID, generating one`);
      slide.id = `slide-${Date.now()}-${slideIndex}`;
    }
    
    if (!slide.components || !Array.isArray(slide.components)) {
      customLogger.warn(`Slide ${slideIndex} (${slide.id}) has no components or invalid components`);
    }
  }
  
  // Create a complete deck data object
  const deckData: CompleteDeckData = {
    uuid: experimentId,
    name: 'Experiment Deck',
    slides: slides,
    version: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    size: {
      width: 1920,
      height: 1080
    },
    components: {},
    styles: {},
    dependencies: {},
    backgroundStyles: {},
    elementStyles: {},
    themeOverrides: {
      darkMode: false
    }
  };
  
  const imagePaths: string[] = [];
  
  // Create API client
  const apiClient = new ApiClient(apiBaseUrl);
  
  // Check if API server is available
  const isAvailable = await apiClient.isAvailable();
  if (!isAvailable) {
    throw new Error('API server is not available');
  }
  
  // Process each slide
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideIndex = i + 1;
    const filename = `${prefix}slide-${slideIndex}-${slide.id}.png`;
    const imagePath = path.join(imagesDir, filename);
    
    try {
      customLogger.info(`Rendering slide ${slideIndex}/${slides.length}: ${slide.id}`);
      
      // Render the slide
      const renderResponse = await apiClient.renderSlide(slide, deckData);
      
      // Save the image
      const base64Data = renderResponse.screenshot.replace(/^data:image\/\w+;base64,/, '');
      await fs.writeFile(imagePath, base64Data, { encoding: 'base64' });
      
      customLogger.info(`Saved image for slide ${slide.id} to ${imagePath}`);
      imagePaths.push(imagePath);
    } catch (error) {
      customLogger.error(`Error rendering slide ${slide.id}: ${error instanceof Error ? error.message : String(error)}`);
      // Continue with next slide on error
    }
  }
  
  return imagePaths;
}