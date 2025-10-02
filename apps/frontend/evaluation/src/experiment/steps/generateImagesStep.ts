import { ExperimentContext } from '../ExperimentStepPipeline';
import { ExperimentStep, StepConfiguration, StepResult } from './types';
import { SlideData } from '../../types';
import path from 'path';
import fs from 'fs/promises';
import { createStepLogger, createChildLogger } from './StepLogger';
import { Logger } from '../../utils/logging';
import { withTimeout } from '../../utils/error-handling';
import { ApiClient } from '../../api/ApiClient';

/**
 * Step 4: Generate HTML and Images for the slides
 */
export const generateImagesStep: ExperimentStep<ExperimentContext, ExperimentContext> = {
  name: 'Generate HTML and Images',
  description: 'Generates HTML and Images for the slides',
  
  async execute(
    context: ExperimentContext, 
    config: StepConfiguration
  ): Promise<StepResult<ExperimentContext>> {
    // Create a logger for this step using the common utility
    const logger: Logger = createStepLogger(context, 'GenImages');
    
    try {
      if (!context.beforeSlides) {
        logger.error('No before slides available to generate images');
        // Return success but with empty arrays
        return {
          success: true,
          data: {
            ...context,
            beforeHtml: '',
            afterHtml: '',
            beforeImagePaths: [],
            afterImagePaths: [],
            beforeImagesBase64: [],
            afterImagesBase64: []
          }
        };
      }

      if (!context.afterSlides) {
        logger.error('No after slides available to generate images');
        // Return success but with empty arrays
        return {
          success: true,
          data: {
            ...context,
            beforeHtml: '',
            afterHtml: '',
            beforeImagePaths: [],
            afterImagePaths: [],
            beforeImagesBase64: [],
            afterImagesBase64: []
          }
        };
      }

      // Generate HTML for slides
      logger.info('Generating HTML for before slides');
      let beforeHtml = '';
      let afterHtml = '';
      let beforeImagePaths: string[] = [];
      let afterImagePaths: string[] = [];
      let beforeImagesBase64: string[] = [];
      let afterImagesBase64: string[] = [];
      
      // Verify we have different before and after states
      const beforeComponentCount = context.beforeSlides.reduce((count, slide) => count + (slide.components?.length || 0), 0);
      const afterComponentCount = context.afterSlides.reduce((count, slide) => count + (slide.components?.length || 0), 0);
      logger.info(`Image generation - before slides have ${beforeComponentCount} total components`);
      logger.info(`Image generation - after slides have ${afterComponentCount} total components`);
      
      try {
        logger.info(`Generating HTML for ${context.beforeSlides.length} before slides`);
        const { generateSlidesHtml } = await import('../SlideRenderingApiClient');
        beforeHtml = await generateSlidesHtml({
          slides: context.beforeSlides,
          deckId: `${context.deckStoreId}-before`
        });

        logger.info(`Generating HTML for ${context.afterSlides.length} after slides`);
        afterHtml = await generateSlidesHtml({
          slides: context.afterSlides,
          deckId: `${context.deckStoreId}-after`
        });

        // Save the HTML files
        const htmlDir = path.join(context.experimentDir, 'html');
        await fs.mkdir(htmlDir, { recursive: true }); // Ensure HTML directory exists
        await fs.writeFile(path.join(htmlDir, 'before.html'), beforeHtml);
        await fs.writeFile(path.join(htmlDir, 'after.html'), afterHtml);
      } catch (htmlError) {
        logger.error(`Error generating HTML: ${htmlError instanceof Error ? htmlError.message : String(htmlError)}`);
        // Continue despite errors - we'll still try to generate images
      }

      try {
        // Configure HTML generator to use API
        const { initializeRenderingApi } = await import('../SlideRenderingApiClient');
        
        // Get rendering options from the step configuration
        const renderingOptions = config.renderingOptions || {
          scale: 0.75,
          maxConcurrentRenders: 1,
          requestTimeoutMs: 60000
        };
        
        // Initialize the slide rendering API client with configuration
        // This will be used by the generateSlideImages function
        initializeRenderingApi({
          apiBaseUrl: process.env.API_SERVER_URL || 'http://localhost:3333',
          debugMode: Boolean(process.env.DEBUG) || false
        });
        
        // Generate images for before slides
        logger.info('Generating images for before slides');
        beforeImagePaths = await generateSlideImagesWithRetry(
          context.beforeSlides,
          context.experimentDir,
          'before-',
          renderingOptions.scale,
          config.retries,
          logger,
          context
        );

        // Generate images for after slides
        logger.info('Generating images for after slides');
        afterImagePaths = await generateSlideImagesWithRetry(
          context.afterSlides,
          context.experimentDir,
          'after-',
          renderingOptions.scale,
          config.retries,
          logger,
          context
        );
      } catch (imageError) {
        logger.error(`Error during image generation: ${imageError instanceof Error ? imageError.message : String(imageError)}`);
        // Continue despite errors - we'll still try to convert any images that were generated
      }

      try {
        // Ensure image paths arrays are initialized
        beforeImagePaths = beforeImagePaths || [];
        afterImagePaths = afterImagePaths || [];
        
        // Log to debug any issues with arrays
        logger.info(`Before image paths: ${beforeImagePaths.length > 0 ? 'present' : 'empty'}`);
        logger.info(`After image paths: ${afterImagePaths.length > 0 ? 'present' : 'empty'}`);
        
        // Filter out any undefined or null paths for safety
        const validBeforePaths = beforeImagePaths.filter(path => path !== undefined && path !== null);
        const validAfterPaths = afterImagePaths.filter(path => path !== undefined && path !== null);
        
        // Convert images to base64 for API calls if we have any
        if (validBeforePaths.length > 0) {
          logger.info(`Reading ${validBeforePaths.length} 'before' images into base64...`);
          
          // Validate each path before processing
          for (let i = 0; i < validBeforePaths.length; i++) {
            logger.info(`Before image path ${i}: ${validBeforePaths[i]}`);
          }
          
          beforeImagesBase64 = await Promise.all(
            validBeforePaths.map(filePath => readImageAsBase64(filePath).catch(e => {
              logger.error(`Error reading image ${filePath}: ${e.message}`);
              return '';
            }))
          ).then(results => results.filter(r => r !== ''));
        }

        if (validAfterPaths.length > 0) {
          logger.info(`Reading ${validAfterPaths.length} 'after' images into base64...`);
          
          // Validate each path before processing
          for (let i = 0; i < validAfterPaths.length; i++) {
            logger.info(`After image path ${i}: ${validAfterPaths[i]}`);
          }
          
          afterImagesBase64 = await Promise.all(
            validAfterPaths.map(filePath => readImageAsBase64(filePath).catch(e => {
              logger.error(`Error reading image ${filePath}: ${e.message}`);
              return '';
            }))
          ).then(results => results.filter(r => r !== ''));
        }
      } catch (base64Error) {
        logger.error(`Error converting images to base64: ${base64Error instanceof Error ? base64Error.message : String(base64Error)}`);
        // Continue even if we couldn't convert images
      }

      return {
        success: true,
        data: {
          ...context,
          beforeHtml,
          afterHtml,
          beforeImagePaths,
          afterImagePaths,
          beforeImagesBase64,
          afterImagesBase64
        }
      };
    } catch (error) {
      logger.error(`Error generating images: ${error instanceof Error ? error.message : String(error)}`);
      // Return success but with empty arrays - we don't want to fail the entire experiment just because image generation failed
      return {
        success: true,
        data: {
          ...context,
          beforeHtml: '',
          afterHtml: '',
          beforeImagePaths: [],
          afterImagePaths: [],
          beforeImagesBase64: [],
          afterImagesBase64: []
        }
      };
    }
  }
};

/**
 * Read an image file and convert it to base64 data URL
 */
async function readImageAsBase64(imagePath: string): Promise<string> {
  try {
    // Read the file as a buffer
    const imageBuffer = await fs.readFile(imagePath);
    
    // Convert to base64 string
    const base64Image = imageBuffer.toString('base64');
    
    // Determine the image format from the file extension
    const extension = imagePath.split('.').pop()?.toLowerCase() || 'png';
    const mimeType = extension === 'jpg' || extension === 'jpeg' 
      ? 'image/jpeg' 
      : 'image/png';
    
    // Return the base64 data URL
    return `data:${mimeType};base64,${base64Image}`;
  } catch (error) {
    console.error(`Error reading image file ${imagePath}:`, error);
    throw new Error(`Failed to read image file ${imagePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate images for slides with retry functionality
 */
async function generateSlideImagesWithRetry(
  slides: SlideData[], 
  outputDir: string, 
  prefix: string = '',
  scale: number = 0.75,
  maxRetries: number = 3,
  logger: Logger,
  context?: any // Optional context for experiment ID
): Promise<string[]> {
  // Generate a unique experiment ID for this batch of slides
  const experimentId = context?.experimentId || `exp-${Date.now()}`;
  
  // Create an images directory if it doesn't exist
  const imagesDir = path.join(outputDir, 'images');
  await fs.mkdir(imagesDir, { recursive: true });
  
  const apiBaseUrl = process.env.API_SERVER_URL || 'http://localhost:3333';
  
  logger.info(`Generating images for ${slides.length} slides to ${imagesDir}`);
  
  const imagePaths: string[] = [];
  const errors: Error[] = [];
  
  // Process each slide
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideIndex = i + 1;
    
    // Create a child logger for slide-specific logging
    const slideLogger = createChildLogger(logger, `Slide${slideIndex}`);
    
    // Create a task to render this slide
    const renderTask = async (): Promise<string> => {
      const filename = `${prefix}slide-${slideIndex}-${slide.id}.png`;
      const outputPath = path.join(imagesDir, filename);
      
      slideLogger.info(`Processing slide ${slideIndex}/${slides.length} (${slide.id})`);
      
      // Make a deep copy of the slide
      const slideCopy = JSON.parse(JSON.stringify(slide));
      
      try {
        // Generate the image for this slide
        const options = {
          experimentId: experimentId,
          logger: slideLogger,
          timeout: 60000, // 60 second timeout
          debug: true
        };
        
        // Always use the API service
        slideLogger.info(`Rendering slide ${slide.id} to image via API server`);
        
        // Create API client
        const apiClient = new ApiClient(apiBaseUrl);
        
        // Check if API server is available
        const isAvailable = await apiClient.isAvailable();
        if (!isAvailable) {
          throw new Error('API server is not available');
        }
        
        // Create a simple deck with just this slide for rendering
        const deckData = {
          uuid: experimentId,
          name: 'Single Slide Render',
          slides: [slideCopy],
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
        
        // Render the slide
        const response = await apiClient.renderSlide(slideCopy, deckData, {
          width: 1920,
          height: 1080,
          debug: true
        });
        
        // Save the image
        const base64Data = response.screenshot.replace(/^data:image\/\w+;base64,/, '');
        await fs.writeFile(outputPath, base64Data, { encoding: 'base64' });
        
        // Verify the file was created
        const fileExists = await fs.access(outputPath)
          .then(() => true)
          .catch(() => false);
        
        if (!fileExists) {
          throw new Error(`Image file was not created for slide ${slide.id}`);
        }
        
        // Get file size to confirm it's valid
        const stats = await fs.stat(outputPath);
        
        if (stats.size === 0) {
          throw new Error(`Image file for slide ${slide.id} is empty (0 bytes)`);
        }
        
        slideLogger.info(`Successfully rendered to ${outputPath} (${stats.size} bytes)`);
        return outputPath;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        slideLogger.error(`❌ Error rendering: ${errorMessage}`);
        
        if (error instanceof Error && error.stack) {
          slideLogger.debug(`Stack trace: ${error.stack}`);
        }
        
        throw error;
      }
    };
    
    try {
      // Use a promise with timeout to handle the rendering task
      const timeoutMs = 60000; // 60 second timeout per slide
      
      // Keep trying to render the slide until we succeed or run out of retries
      let retryCount = 0;
      let success = false;
      let lastError: Error | null = null;
      
      while (!success && retryCount <= maxRetries) {
        try {
          if (retryCount > 0) {
            slideLogger.info(`Retry ${retryCount}/${maxRetries} for slide ${slide.id}`);
          }
          
          // Use our improved withTimeout utility to execute the render task with timeout
          const imagePath = await withTimeout(
            renderTask,
            timeoutMs,
            `Rendering slide ${slide.id}`
          );
          
          imagePaths.push(imagePath);
          success = true;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          slideLogger.error(`Attempt ${retryCount+1}/${maxRetries+1} failed: ${lastError.message}`);
          retryCount++;
        }
      }
      
      if (!success) {
        throw lastError || new Error(`Failed to render slide ${slide.id} after ${maxRetries+1} attempts`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      logger.error(`Failed to render slide ${slide.id}`);
    }
  }
  
  // Log the results
  logger.info(`Image generation complete: ${imagePaths.length}/${slides.length} slides successfully rendered, ${errors.length} failed`);
  
  if (errors.length > 0) {
    logger.warn(`Errors encountered during image generation: ${errors.length}`);
    
    // Log the first few errors
    const maxErrorsToLog = Math.min(3, errors.length);
    for (let i = 0; i < maxErrorsToLog; i++) {
      logger.error(`Error ${i+1}/${errors.length}: ${errors[i].message}`);
    }
    
    if (errors.length > maxErrorsToLog) {
      logger.warn(`... and ${errors.length - maxErrorsToLog} more errors`);
    }
  }
  
  // Log the actual image paths for debugging if any were created
  if (imagePaths.length > 0) {
    logger.info(`First generated image path: ${imagePaths[0]}`);
    logger.info(`Last generated image path: ${imagePaths[imagePaths.length - 1]}`);
  }
  
  // Always return an array, even if it's empty
  return imagePaths;
} 