import { ExperimentContext } from '../ExperimentStepPipeline';
import { ExperimentStep, StepConfiguration, StepResult } from './types';
import { createStepLogger } from './StepLogger';
import { Logger } from '../../utils/logging';

/**
 * Step 6: Finalize experiment - set success flag and end time
 */
export const finalizeExperimentStep: ExperimentStep<ExperimentContext, ExperimentContext> = {
  name: 'Finalize Experiment',
  description: 'Finalizes experiment, sets success flag and end time',
  
  async execute(
    context: ExperimentContext, 
    config: StepConfiguration
  ): Promise<StepResult<ExperimentContext>> {
    // Create a logger for this step using the common utility
    const logger: Logger = createStepLogger(context, 'Finalize');
    
    try {
      // Set end time and success flag
      const endTime = Date.now();
      const totalRuntime = endTime - context.startTime;

      logger.info(`Experiment completed in ${totalRuntime}ms`);
      logger.info(`Diff generation time: ${context.diffGenerationTime || 0}ms`);
      if (context.qualityEvaluationTime) {
        logger.info(`Quality evaluation time: ${context.qualityEvaluationTime}ms`);
      }

      // Log experiment statistics
      logExperimentStatistics(context, logger);

      return {
        success: true,
        data: {
          ...context,
          endTime,
          success: true
        }
      };
    } catch (error) {
      logger.error(`Error finalizing experiment: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
};

/**
 * Log key statistics about the experiment
 */
function logExperimentStatistics(context: ExperimentContext, logger: Logger): void {
  try {
    // Log general experiment info
    logger.info(`=== Experiment ${context.id} Stats ===`);
    
    // Performance stats
    const totalTime = context.endTime 
      ? context.endTime - context.startTime 
      : Date.now() - context.startTime;
    
    logger.info(`Total runtime: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    
    // Slide counts
    if (context.beforeSlides) {
      logger.info(`Before slides: ${context.beforeSlides.length}`);
    }
    
    if (context.afterSlides) {
      logger.info(`After slides: ${context.afterSlides.length}`);
    }
    
    // Component counts
    const beforeComponents = context.beforeSlides?.reduce(
      (count, slide) => count + (slide.components?.length || 0), 
      0
    ) || 0;
    
    const afterComponents = context.afterSlides?.reduce(
      (count, slide) => count + (slide.components?.length || 0), 
      0
    ) || 0;
    
    logger.info(`Component count: ${beforeComponents} before, ${afterComponents} after (${afterComponents - beforeComponents} difference)`);
    
    // Images
    if (context.beforeImagePaths && context.afterImagePaths) {
      logger.info(`Images generated: ${context.beforeImagePaths.length} before, ${context.afterImagePaths.length} after`);
    }
    
    // Quality score
    if (context.qualityEvaluation) {
      logger.info(`Quality score: ${context.qualityEvaluation.score}/5`);
      
      // Safely access any feedback that might be available
      // Use type assertion to access potential properties
      const qualityData = context.qualityEvaluation as any;
      const feedback = qualityData.rationale || 
                      qualityData.explanation || 
                      qualityData.feedback || 
                      'No feedback available';
      
      logger.info(`Feedback: ${String(feedback).substring(0, 100)}...`);
    }
    
    // Log any critical issues
    const issues: string[] = [];
    
    if (!context.deckDiff) {
      issues.push('No deck diff was generated');
    }
    
    if (!context.afterSlides || context.afterSlides.length === 0) {
      issues.push('No after slides were generated');
    }
    
    if (context.beforeImagePaths?.length === 0) {
      issues.push('No before images were generated');
    }
    
    if (context.afterImagePaths?.length === 0) {
      issues.push('No after images were generated');
    }
    
    if (issues.length > 0) {
      logger.warn(`Issues found: ${issues.join(', ')}`);
    } else {
      logger.info('No major issues detected with experiment execution');
    }
    
    logger.info('=== End Stats ===');
  } catch (error) {
    logger.error(`Error logging experiment statistics: ${error instanceof Error ? error.message : String(error)}`);
  }
} 