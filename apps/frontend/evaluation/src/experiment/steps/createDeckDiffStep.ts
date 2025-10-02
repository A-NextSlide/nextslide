import { ExperimentContext } from '../ExperimentStepPipeline';
import { ExperimentStep, StepConfiguration, StepResult } from './types';
import { DeckDiff } from '../../types';
import { createStepLogger } from './StepLogger';
import { Logger } from '../../utils/logging';
import { withTimeout } from '../../utils/error-handling';

/**
 * Step 2: Generate deck diff from API or use provided one
 */
export const createDeckDiffStep: ExperimentStep<ExperimentContext, ExperimentContext> = {
  name: 'Generate Deck Diff',
  description: 'Generates a deck diff from the API or uses provided one',
  
  async execute(
    context: ExperimentContext, 
    config: StepConfiguration
  ): Promise<StepResult<ExperimentContext>> {
    // Create a logger for this step using the common utility
    const logger: Logger = createStepLogger(context, 'DeckDiff');
    
    try {
      let deckDiff: DeckDiff | null = null;
      let messages: string[] = [];
      let metadata: Record<string, any> = {};
      let apiLatency: number | undefined;
      
      // Start timing for the diff generation specifically
      const diffStartTime = Date.now();

      if (context.deckDiff) {
        // Use provided deck diff
        logger.info('Using provided deck diff');
        deckDiff = context.deckDiff;
        messages = ['Using provided deck diff'];
        metadata = { source: 'provided' };
        
        // No API latency since we're using provided diff
        apiLatency = 0;
      } else {
        logger.info(`Generating deck diff from API for prompt: ${context.prompt}`);
        
        // Get a ChatApiService instance from the improved connection pool
        const { ImprovedServiceConnectionManager } = await import('../../utils/ImprovedServiceConnectionManager');
        const connectionManager = ImprovedServiceConnectionManager.getInstance();
        const apiService = await connectionManager.getChatApiService();
        
        try {
          // Capture the start time for API latency measurement
          const apiStartTime = Date.now();
          
          // Use the configured timeout from the step configuration
          const timeoutMs = config.timeoutMs || 180000; // Fallback to 3 minutes if not specified
          logger.info(`Using API request timeout of ${timeoutMs}ms from configuration`);
          
          // Make the API call with all slides and target slide ID
          // Use the withTimeout utility for consistent timeout handling
          const response = await withTimeout(
            apiService.generateDeckDiff(
              context.beforeSlides, 
              context.targetSlideId, 
              context.prompt, 
              logger,
              context.run_uuid  // Use run_uuid from context instead of ID
            ),
            timeoutMs,
            'API call for deck diff generation'
          );
          
          // Capture API latency
          apiLatency = Date.now() - apiStartTime;
          
          logger.info(`API latency: ${apiLatency}ms`);
          
          // Handle null deckDiff as a failure case
          if (!response.deckDiff) {
            logger.error(`API returned null deckDiff for experiment ${context.id} ${context.run_uuid}`);
            logger.error(`This might be due to rate limiting, API issues, or the prompt not being understood`);
            
            // Release the API service back to the pool
            await connectionManager.releaseChatApiService(apiService);
            
            // Check if we should retry based on configuration
            if (config.retries > 0) {
              logger.info(`Will retry up to ${config.retries} more times`);
              // We could implement retry logic here, but for now, just return error
            }
            
            // Return early with error
            return {
              success: false,
              error: new Error(`API returned null deckDiff: Response received but no changes included.`)
            };
          }
          
          // Normal case - extract response data
          deckDiff = response.deckDiff;
          messages = response.messages || [];
          metadata = {
            ...response.metadata,
            apiLatency: `${apiLatency}ms`
          };
          
          // Release the API service back to the pool
          await connectionManager.releaseChatApiService(apiService);
        } catch (apiError) {
          // Make sure to release the service back to the pool even if there's an error
          await connectionManager.releaseChatApiService(apiService);
          throw apiError;
        }
      }
      
      // Calculate diff generation time
      const diffGenerationTime = Date.now() - diffStartTime;
      logger.info(`Diff generation time: ${diffGenerationTime}ms`);

      // Update context with the newly generated deck diff
      return {
        success: true,
        data: {
          ...context,
          deckDiff,
          messages,
          apiLatency,
          diffGenerationTime
        }
      };
    } catch (error) {
      logger.error(`Error generating deck diff: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}; 