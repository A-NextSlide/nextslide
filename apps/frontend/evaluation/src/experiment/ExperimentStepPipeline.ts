import { DeckDiff, SlideData } from '../types';
import { ExperimentInput, ExperimentResult, QualityEvaluation } from './types';
import { ThreadPool, StepThreadPoolManager } from '../utils/ThreadPool';
import { Logger } from '../utils/logging';
import { FlameGraphGenerator } from '../utils/FlameGraphGenerator';
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import crypto from 'crypto';

/**
 * Generates a deterministic hash based on experiment configuration
 * This ensures consistent IDs across runs for the same experiment
 */
function generateDeterministicHash(experiment: ExperimentInput): string {
  // Create a string representation of key experiment properties
  const hashInput = JSON.stringify({
    id: experiment.id,
    prompt: experiment.prompt,
    slideCount: experiment.slides?.length || 0,
    currentSlideId: experiment.currentSlideId
  });
  
  // Create a SHA-256 hash and return the first 8 characters
  return crypto.createHash('sha256')
    .update(hashInput)
    .digest('hex')
    .substring(0, 8);
}

export interface ExperimentContext {
  id: string;
  description: string;
  prompt: string;
  targetSlideId: string;
  deckStoreId: string;
  beforeSlides: SlideData[];
  afterSlides?: SlideData[];
  deckDiff?: DeckDiff;
  beforeImagePaths: string[];
  afterImagePaths: string[];
  beforeImagesBase64: string[];
  afterImagesBase64: string[];
  beforeHtml?: string;
  afterHtml?: string;
  messages: string[];
  startTime: number;
  endTime?: number;
  experimentDir: string;
  apiLatency?: number;
  diffGenerationTime?: number;
  qualityEvaluationTime?: number;
  qualityEvaluation?: QualityEvaluation;
  success: boolean;
  error?: string;
  label?: string;
  runName?: string;
  logs: string[];
  run_uuid?: string;
}

type StepResult<T> = {
  success: boolean;
  data?: T;
  error?: Error;
};

export type PipelineStep<TInput, TOutput> = {
  name: string;
  execute: (input: TInput, logger: Logger) => Promise<StepResult<TOutput>>;
};


export class ExperimentStepPipeline {
  private steps: PipelineStep<any, any>[];
  private logger: Logger;
  private threadPoolManager?: StepThreadPoolManager;
  private flameGraphGenerator: FlameGraphGenerator;

  constructor(logger: Logger, threadPoolManager?: StepThreadPoolManager, flameGraphGenerator?: FlameGraphGenerator) {
    this.steps = [];
    this.logger = logger;
    this.threadPoolManager = threadPoolManager;
    this.flameGraphGenerator = flameGraphGenerator || new FlameGraphGenerator();
  }

  addStep<TInput, TOutput>(step: PipelineStep<TInput, TOutput>): void {
    this.steps.push(step);
  }

  /**
   * Run the pipeline without threading (legacy method)
   */
  async run<TFinalOutput>(initialInput: any): Promise<StepResult<TFinalOutput>> {
    // If we have a thread pool manager, use the threaded approach
    if (this.threadPoolManager) {
      return this.runThreaded(initialInput);
    }
    
    // Otherwise, use the original sequential approach
    let currentInput = initialInput;
    
    // Always use deterministic experiment ID generation
    let experimentId: string;
    if (initialInput?.id) {
      // Use the provided experiment ID
      experimentId = initialInput.id;
    } else {
      // If for some reason no ID was provided, use a timestamp-based fallback
      // But truncate it to make it more stable across runs
      experimentId = `experiment-${Date.now().toString().substring(0, 10)}`;
      this.logger.warn(`No experiment ID provided, using generated ID: ${experimentId}`);
    }

    for (const step of this.steps) {
      this.logger.info(`Starting step: ${step.name}`);
      const stepStart = this.flameGraphGenerator.startStepTiming(experimentId, step.name);

      try {
        const result = await step.execute(currentInput, this.logger);

        const stepDuration = this.flameGraphGenerator.endStepTiming(
          experimentId, 
          step.name, 
          stepStart, 
          result.success, 
          result.error?.message
        );
        
        this.logger.info(`Completed step: ${step.name} in ${stepDuration}ms with success=${result.success}`);

        if (!result.success) {
          this.logger.error(`Step ${step.name} failed: ${result.error?.message || 'Unknown error'}`);
          return { 
            success: false, 
            error: result.error || new Error(`Step ${step.name} failed`) 
          };
        }

        currentInput = result.data;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.flameGraphGenerator.endStepTiming(
          experimentId, 
          step.name, 
          stepStart, 
          false, 
          errorMsg
        );
        
        this.logger.error(`Error in step ${step.name}: ${errorMsg}`);
        
        return { 
          success: false, 
          error: error instanceof Error ? error : new Error(String(error)) 
        };
      }
    }

    return { success: true, data: currentInput };
  }
  
  /**
   * Run the pipeline with threaded steps
   * Uses dedicated thread pools for each step
   */
  async runThreaded<TFinalOutput>(initialInput: any): Promise<StepResult<TFinalOutput>> {
    if (!this.threadPoolManager) {
      throw new Error('ThreadPoolManager is required for runThreaded');
    }
    
    return new Promise<StepResult<TFinalOutput>>((resolve) => {
      let currentStep = 0;
      let currentInput = initialInput;
      let stepWatchdogTimeout: NodeJS.Timeout | null = null;
      const MAX_STEP_TIME_MS = 10 * 60 * 1000; // 10 minutes max per step
      
      // Always use deterministic experiment ID generation
      let experimentId: string;
      if (initialInput?.id) {
        // Use the provided experiment ID
        experimentId = initialInput.id;
      } else {
        // If for some reason no ID was provided, use a timestamp-based fallback
        // But truncate it to make it more stable across runs
        experimentId = `experiment-${Date.now().toString().substring(0, 10)}`;
        this.logger.warn(`No experiment ID provided, using generated ID: ${experimentId}`);
      }
      
      // Function to clear any existing watchdog timers
      const clearWatchdog = () => {
        if (stepWatchdogTimeout) {
          clearTimeout(stepWatchdogTimeout);
          stepWatchdogTimeout = null;
        }
      };
      
      // Function to add a watchdog timer for the current step
      const setWatchdog = (stepName: string) => {
        clearWatchdog(); // Clear any existing watchdog
        
        stepWatchdogTimeout = setTimeout(() => {
          const errorMsg = `Step "${stepName}" timed out after ${MAX_STEP_TIME_MS/1000} seconds`;
          this.logger.error(`WATCHDOG TIMEOUT: ${errorMsg}`);
          
          // Mark this step as failed and continue
          resolve({
            success: false,
            error: new Error(errorMsg)
          });
        }, MAX_STEP_TIME_MS);
      };
      
      // Process the next step
      const processStep = async () => {
        try {
          // If we've completed all steps, resolve with success
          if (currentStep >= this.steps.length) {
            clearWatchdog(); // Make sure to clear watchdog at the end
            resolve({ success: true, data: currentInput });
            return;
          }
          
          const step = this.steps[currentStep];
          this.logger.info(`Starting step: ${step.name}`);
          const stepStart = this.flameGraphGenerator.startStepTiming(experimentId, step.name);
          
          // Set watchdog timer for this step
          setWatchdog(step.name);
          
          try {
            // Create a task for this step and queue it in the appropriate thread pool
            this.threadPoolManager!.addTask(step.name, async () => {
              try {
                const result = await step.execute(currentInput, this.logger);
                
                // Clear the watchdog as step completed
                clearWatchdog();
                
                const stepDuration = this.flameGraphGenerator.endStepTiming(
                  experimentId, 
                  step.name, 
                  stepStart, 
                  result.success, 
                  result.error?.message
                );
                
                this.logger.info(`Completed step: ${step.name} in ${stepDuration}ms with success=${result.success}`);
                
                if (!result.success) {
                  this.logger.error(`Step ${step.name} failed: ${result.error?.message || 'Unknown error'}`);
                  resolve({
                    success: false,
                    error: result.error || new Error(`Step ${step.name} failed`)
                  });
                  return;
                }
                
                // Update the current input for the next step
                currentInput = result.data;
                
                // Move to the next step
                currentStep++;
                
                // Process the next step
                processStep();
              } catch (error) {
                // Clear the watchdog as step completed (with error)
                clearWatchdog();
                
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.flameGraphGenerator.endStepTiming(
                  experimentId, 
                  step.name, 
                  stepStart, 
                  false, 
                  errorMsg
                );
                
                this.logger.error(`Error in step ${step.name}: ${errorMsg}`);
                
                resolve({
                  success: false,
                  error: error instanceof Error ? error : new Error(String(error))
                });
              }
            });
          } catch (error) {
            // Clear the watchdog if we couldn't even queue the task
            clearWatchdog();
            
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.flameGraphGenerator.endStepTiming(
              experimentId, 
              step.name, 
              stepStart, 
              false, 
              errorMsg
            );
            
            this.logger.error(`Error queueing step ${step.name}: ${errorMsg}`);
            
            resolve({
              success: false,
              error: error instanceof Error ? error : new Error(String(error))
            });
          }
        } catch (outerError) {
          // Handle any unexpected errors in the processStep function itself
          clearWatchdog();
          this.logger.error(`Critical error in processStep: ${outerError instanceof Error ? outerError.message : String(outerError)}`);
          resolve({
            success: false,
            error: outerError instanceof Error ? outerError : new Error(String(outerError))
          });
        }
      };
      
      // Start processing the first step
      processStep();
    });
  }

  /**
   * Creates required directories for experiment output
   */
  static async ensureExperimentDirs(outputDir: string): Promise<void> {
    try {
      await fs.mkdir(outputDir, { recursive: true });
      await fs.mkdir(path.join(outputDir, 'html'), { recursive: true });
      await fs.mkdir(path.join(outputDir, 'json'), { recursive: true });
      await fs.mkdir(path.join(outputDir, 'images'), { recursive: true });
      await fs.mkdir(path.join(outputDir, 'flamegraph'), { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create experiment directories: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Builds a complete context from an experiment input
   */
  static buildInitialContext(
    experiment: ExperimentInput, 
    experimentDir: string, 
    label?: string, 
    runName?: string,
    run_uuid?: string
  ): ExperimentContext {
    const targetSlideId = experiment.currentSlideId || (experiment.slides.length > 0 ? experiment.slides[0].id : 'slide-1');
    
    // Use actual timestamp - this doesn't affect determinism of the experiment
    const startTime = Date.now();
    
    // Always use a deterministic deck ID based on the experiment configuration only
    // Don't include timestamp in the deck ID for true determinism
    const hash = generateDeterministicHash(experiment);
    const experimentDeckId = `experiment-${experiment.id}-${hash}`;

    return {
      id: experiment.id,
      description: experiment.description,
      prompt: experiment.prompt,
      targetSlideId,
      deckStoreId: experimentDeckId,
      beforeSlides: experiment.slides || [], // Initialize with experiment slides
      beforeImagePaths: [],
      afterImagePaths: [],
      beforeImagesBase64: [],
      afterImagesBase64: [],
      messages: [],
      startTime,
      experimentDir,
      success: false,
      logs: [],
      label,
      runName,
      run_uuid
    };
  }

  /**
   * Convert experiment context to final result
   */
  static contextToResult(context: ExperimentContext, experiment: ExperimentInput): ExperimentResult {
    return {
      experiment,
      resultPath: context.experimentDir,
      runtime: context.diffGenerationTime || 0, 
      totalRuntime: context.endTime ? (context.endTime - context.startTime) : 0,
      success: context.success,
      error: context.error,
      apiLatency: context.apiLatency,
      timestamp: context.startTime,
      qualityScore: context.qualityEvaluation?.score,
      qualityEvaluation: context.qualityEvaluation,
      qualityEvaluationTime: context.qualityEvaluationTime,
      label: context.label,
      runName: context.runName,
      run_uuid: context.run_uuid,
      beforeImagePaths: context.beforeImagePaths,
      afterImagePaths: context.afterImagePaths
    };
  }

  /**
   * Saves results to JSON files and generates flamegraph
   */
  async saveResults(context: ExperimentContext): Promise<void> {
    const { experimentDir, success, id, description, prompt, beforeSlides, afterSlides, deckDiff, 
           beforeImagePaths, afterImagePaths, startTime, endTime, messages, 
           apiLatency, diffGenerationTime, qualityEvaluationTime, qualityEvaluation, 
           label, runName, logs, error } = context;

    const totalRuntime = endTime ? (endTime - startTime) : 0;

    // Format all logs into a single string
    const logsText = logs.join('\n');

    // Save logs to file
    await fs.writeFile(
      path.join(experimentDir, 'experiment.log'),
      logsText
    );

    // Generate and save flame graph
    try {
      const flamegraphPath = await this.flameGraphGenerator.saveFlameGraph(id, experimentDir);
      this.logger.info(`Saved flame graph to ${flamegraphPath}`);
      
      // Add flamegraph path to results
      const flamegraphRelativePath = path.relative(experimentDir, flamegraphPath);
      
      // Create result summary object
      const resultsData = {
        id,
        description,
        prompt,
        diffGenerationTime,
        qualityEvaluationTime,
        totalRuntime,
        apiLatency,
        success,
        timestamp: startTime,
        qualityScore: qualityEvaluation?.score,
        qualityEvaluation,
        messages,
        slides: {
          beforeCount: beforeSlides?.length || 0,
          afterCount: afterSlides?.length || 0,
          targetSlideId: context.targetSlideId,
          beforeImagePaths,
          afterImagePaths
        },
        label,
        runName,
        run_uuid: context.run_uuid,
        error,
        logsFilePath: path.join(experimentDir, 'experiment.log'),
        flamegraphPath: flamegraphRelativePath
      };

      // Save main results.json file
      await fs.writeFile(
        path.join(experimentDir, 'results.json'),
        JSON.stringify(resultsData, null, 2)
      );
    } catch (error) {
      this.logger.error(`Error generating flame graph: ${error instanceof Error ? error.message : String(error)}`);
      
      // Create result summary object without flamegraph
      const resultsData = {
        id,
        description,
        prompt,
        diffGenerationTime,
        qualityEvaluationTime,
        totalRuntime,
        apiLatency,
        success,
        timestamp: startTime,
        qualityScore: qualityEvaluation?.score,
        qualityEvaluation,
        messages,
        slides: {
          beforeCount: beforeSlides?.length || 0,
          afterCount: afterSlides?.length || 0,
          targetSlideId: context.targetSlideId,
          beforeImagePaths,
          afterImagePaths
        },
        label,
        runName,
        run_uuid: context.run_uuid,
        error,
        logsFilePath: path.join(experimentDir, 'experiment.log')
      };

      // Save main results.json file
      await fs.writeFile(
        path.join(experimentDir, 'results.json'),
        JSON.stringify(resultsData, null, 2)
      );
    }

    // Save component JSON files if we have successful data
    if (success && beforeSlides && afterSlides && deckDiff) {
      // Deck diff
      await fs.writeFile(
        path.join(experimentDir, 'json', 'deck_diff.json'), 
        JSON.stringify(deckDiff, null, 2)
      );
      
      // Before slides data
      await fs.writeFile(
        path.join(experimentDir, 'json', 'before.json'), 
        JSON.stringify(beforeSlides, null, 2)
      );
      
      // After slides data
      await fs.writeFile(
        path.join(experimentDir, 'json', 'after.json'), 
        JSON.stringify(afterSlides, null, 2)
      );
    }
  }
}
