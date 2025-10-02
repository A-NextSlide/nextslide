import { ExperimentContext } from '../ExperimentStepPipeline';
import { ExperimentStep, StepConfiguration, StepResult } from './types';
import { createStepLogger } from './StepLogger';
import { Logger } from '../../utils/logging';
import { withTimeout } from '../../utils/error-handling';

/**
 * Step 5: Evaluate quality of the result
 */
export const evaluateQualityStep: ExperimentStep<ExperimentContext, ExperimentContext> = {
  name: 'Evaluate Quality',
  description: 'Evaluates quality of the result',
  
  async execute(
    context: ExperimentContext, 
    config: StepConfiguration
  ): Promise<StepResult<ExperimentContext>> {
    // Create a logger for this step using the common utility
    const logger: Logger = createStepLogger(context, 'Quality');
    
    try {
      // Skip quality evaluation if we're missing required data
      if (!context.beforeSlides || !context.afterSlides || !context.deckDiff || 
          !context.beforeImagesBase64 || !context.afterImagesBase64) {
        logger.warn('Skipping quality evaluation due to missing data');
        return {
          success: true,
          data: {
            ...context
          }
        };
      }

      logger.info(`Evaluating quality for experiment: ${context.id}`);
      const qualityStartTime = Date.now();

      // Log the number of images available
      logger.info(`Sending ${context.beforeImagesBase64.length} before images and ${context.afterImagesBase64.length} after images (base64) for quality evaluation`);

      // Get a ChatApiService instance from the improved connection pool
      const { ImprovedServiceConnectionManager } = await import('../../utils/ImprovedServiceConnectionManager');
      const connectionManager = ImprovedServiceConnectionManager.getInstance();
      const apiService = await connectionManager.getChatApiService();
      
      try {
        // Use the timeout from the config
        const timeoutMs = config.timeoutMs || 180000; // Fallback to 3 minutes if not specified
        logger.info(`Using quality evaluation timeout of ${timeoutMs}ms from configuration`);
        
        // Call the quality evaluation API with rendered HTML and base64 image arrays
        // Use the withTimeout utility for consistent timeout handling
        const qualityEvaluation = await withTimeout(
          apiService.evaluateQuality({
            prompt: context.prompt,
            beforeDeckSlides: context.beforeSlides,
            afterDeckSlides: context.afterSlides,
            deckDiff: context.deckDiff,
            beforeHtml: context.beforeHtml,
            afterHtml: context.afterHtml,
            beforeImages: context.beforeImagesBase64,
            afterImages: context.afterImagesBase64,
            logger,
            run_uuid: context.run_uuid  // Use run_uuid from context instead of ID
          }),
          timeoutMs,
          'Quality evaluation API call'
        );
        
        // Calculate quality evaluation time
        const qualityEvaluationTime = Date.now() - qualityStartTime;
        logger.info(`Quality evaluation complete. Score: ${qualityEvaluation.score}/5`);
        logger.info(`Quality evaluation time: ${qualityEvaluationTime}ms`);
        
        // Release the API service back to the pool
        await connectionManager.releaseChatApiService(apiService);
        
        return {
          success: true,
          data: {
            ...context,
            qualityEvaluation,
            qualityEvaluationTime
          }
        };
      } catch (apiError) {
        // Make sure to release the service back to the pool even if there's an error
        await connectionManager.releaseChatApiService(apiService);
        
        // If we have retries left, log that we'll retry
        if (config.retries > 0) {
          logger.info(`Quality evaluation failed, but will retry up to ${config.retries} more times`);
        }
        
        throw apiError;
      }
    } catch (error) {
      // Report quality evaluation errors as pipeline failures when they're critical
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error evaluating quality: ${errorMessage}`);
      
      // Check if this is a critical error that should fail the experiment
      const isCriticalError = 
        errorMessage.includes('is not defined') || // Reference errors like beforeImagePath is not defined
        errorMessage.includes('TypeError:') ||    // Type errors
        errorMessage.includes('Cannot read property'); // Property access errors
      
      if (isCriticalError) {
        logger.error(`Critical quality evaluation error detected, marking experiment as failed`);
        return {
          success: false, // Fail the pipeline for critical errors
          error: error instanceof Error ? error : new Error(errorMessage),
          data: {
            ...context,
            qualityEvaluationTime: Date.now() - context.startTime,
            error: errorMessage,
            success: false
          }
        };
      }
      
      // For non-critical errors, continue the pipeline but record the error
      return {
        success: true, // Still return success to continue pipeline for non-critical errors
        data: {
          ...context,
          qualityEvaluationTime: Date.now() - context.startTime,
          error: errorMessage // Use the standard error field instead of a custom one
        }
      };
    }
  }
};