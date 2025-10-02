import { ExperimentInput, ExperimentResult } from './types';
import { ExperimentStepPipeline, ExperimentContext } from './ExperimentStepPipeline';
import { ThreadPool, StepThreadPoolManager } from '../utils/ThreadPool';
import { FlameGraphGenerator } from '../utils/FlameGraphGenerator';
import { ChatApiService } from '../api/ChatApiService';
import { 
  setupDeckStep, 
  createDeckDiffStep, 
  applyDeckDiffStep, 
  generateImagesStep, 
  evaluateQualityStep, 
  finalizeExperimentStep,
  ExperimentLogger 
} from './steps';
import { ExperimentStepFactory } from './steps/ExperimentStepFactory';
import { cleanupRenderingApi } from './SlideRenderingApiClient';
import fs from 'fs/promises';
import path from 'path';
import { globSync } from 'glob';
import crypto from 'crypto';
// Server-side rendering is now handled by SSR API service, no direct BrowserService dependency

// Define StepResult interface for typechecking
interface StepResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

// Default path for storing experiment results
const DEFAULT_OUTPUT_DIR = '/tmp/experiments';

/**
 * Parallel experiment runner that processes experiments efficiently
 * Uses separate thread pools for each pipeline step
 */
export class ParallelExperimentRunner {
  private outputDir: string;
  private chatApi: ChatApiService;
  private defaultConcurrency: number = 3;
  private runName?: string;
  private runUuid: string;
  private threadPoolManager: StepThreadPoolManager;
  private flameGraphGenerator: FlameGraphGenerator;

  /**
   * Initialize the parallel experiment runner
   * 
   * @param outputDir Directory to save experiment results (defaults to /tmp/experiments)
   * @param apiConfig Configuration for the API and run settings
   * @param concurrencyLimit Maximum number of concurrent experiments (default: 3)
   * @param stepConcurrencyLimits Optional limits for specific pipeline steps
   */
  constructor(
    outputDir?: string, 
    apiConfig?: { 
      apiKey?: string, 
      mockResponses?: boolean,
      baseUrl?: string,
      runName?: string,
      runUuid?: string
    }, 
    concurrencyLimit?: number,
    stepConcurrencyLimits?: Record<string, number>
  ) {
    // Use the provided output directory or default to /tmp/experiments
    this.outputDir = outputDir || DEFAULT_OUTPUT_DIR;
    
    // Set the default concurrency limit if provided
    if (concurrencyLimit !== undefined) {
      this.defaultConcurrency = concurrencyLimit;
    }
    
    // Store the run name if provided in apiConfig
    this.runName = apiConfig?.runName;
    
    // Set or generate the run UUID
    this.runUuid = apiConfig?.runUuid || this.generateUuid();
    
    // Create a chat api service
    this.chatApi = this.createChatApiService(apiConfig);
    
    // Set default step concurrency limits if not provided
    const defaultStepLimits = {
      'Setup Deck': this.defaultConcurrency,
      'Generate Deck Diff': this.defaultConcurrency,
      'Apply Deck Diff': this.defaultConcurrency,
      'Generate Images': 1, // Limit image generation to avoid resource contention
      'Evaluate Quality': this.defaultConcurrency,
      'Finalize Experiment': this.defaultConcurrency * 2 // This step is lightweight so can run more
    };
    
    // Create the thread pool manager with provided or default limits
    this.threadPoolManager = new StepThreadPoolManager(
      this.defaultConcurrency,
      stepConcurrencyLimits || defaultStepLimits
    );
    
    // Create flame graph generator for visualizing performance
    this.flameGraphGenerator = new FlameGraphGenerator();
    
    // Ensure the output directory exists
    this.ensureOutputDirExists();
  }
  
  /**
   * Create a ChatApiService instance with the given configuration
   */
  createChatApiService(apiConfig?: { 
    apiKey?: string, 
    mockResponses?: boolean,
    baseUrl?: string,
    runName?: string
  }): ChatApiService {
    return new ChatApiService({
      apiKey: apiConfig?.apiKey,
      mockResponses: apiConfig?.mockResponses,
      baseUrl: apiConfig?.baseUrl
    });
  }

  /**
   * Ensure the output directory exists
   */
  private async ensureOutputDirExists() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      console.log(`Ensuring output directory exists: ${this.outputDir}`);
    } catch (error) {
      console.error(`Error creating output directory ${this.outputDir}:`, error);
    }
  }

  /**
   * Generate a UUID v4
   * Using a simplified implementation for Node.js environment
   */
  private generateUuid(): string {
    // Use crypto.randomUUID() if available (Node.js 14.17.0+)
    if (crypto.randomUUID) {
      return crypto.randomUUID();
    }
    
    // Fallback implementation for older Node.js versions
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Run a single experiment
   */
  async runExperiment(experiment: ExperimentInput, experimentDir?: string, label?: string): Promise<ExperimentResult> {
    console.log(`Running experiment: ${experiment.id}`);
    
    // Create a directory for this experiment if not provided
    let experimentOutputDir: string;
    if (experimentDir) {
      experimentOutputDir = experimentDir;
    } else {
      experimentOutputDir = path.join(this.outputDir, experiment.id);
    }
    
    // Ensure experiment directories exist
    try {
      await ExperimentStepPipeline.ensureExperimentDirs(experimentOutputDir);
    } catch (error) {
      console.error(`Error creating experiment directories: ${error instanceof Error ? error.message : String(error)}`);
      return {
        experiment,
        resultPath: experimentOutputDir,
        runtime: 0,
        totalRuntime: 0,
        success: false,
        error: `Failed to create experiment directories: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
        label,
        runName: this.runName,
        run_uuid: this.runUuid
      };
    }

    // Create initial experiment context
    const context = ExperimentStepPipeline.buildInitialContext(
      experiment, 
      experimentOutputDir, 
      label, 
      this.runName,
      this.runUuid
    );
    
    // Setup logger 
    const logger = new ExperimentLogger(context.logs, experiment.id);
    
    // Build pipeline with thread pool manager
    const pipeline = new ExperimentStepPipeline(logger, this.threadPoolManager, this.flameGraphGenerator);
    
    // Create step factory to generate properly configured steps
    const stepFactory = new ExperimentStepFactory();
    
    // Get all steps with proper configuration from the factory
    const configuredSteps = stepFactory.createAllSteps();
    
    // Add each step to the pipeline with an adapter to match the expected interface
    for (const step of configuredSteps) {
      pipeline.addStep({
        name: step.name,
        execute: (ctx, logger) => {
          // The factory has wrapped each step's execute method to only require the context
          // So we can just pass the context and the configuration is already bound
          return (step.execute as (ctx: ExperimentContext) => Promise<StepResult<ExperimentContext>>)(ctx as ExperimentContext);
        }
      });
    }
    
    // Create a promise that will reject after the timeout
    const EXPERIMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes max per experiment
    const experimentTimeout = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Experiment timed out after ${EXPERIMENT_TIMEOUT_MS/1000/60} minutes`));
        clearTimeout(timeoutId);
      }, EXPERIMENT_TIMEOUT_MS);
    });
    
    try {
      // Run the pipeline with a timeout
      const result = await Promise.race<StepResult<ExperimentContext>>([
        pipeline.run<ExperimentContext>(context),
        experimentTimeout
      ]);
      
      if (!result.success) {
        // Pipeline failed
        const errorMessage = result.error?.message || 'Unknown error in experiment pipeline';
        logger.error(`Pipeline failed: ${errorMessage}`);
        
        // Update context with error information
        const updatedContext = {
          ...context, 
          success: false,
          error: errorMessage,
          endTime: Date.now()
        };
        
        // Save results even on failure
        await pipeline.saveResults(updatedContext);
        
        return ExperimentStepPipeline.contextToResult(updatedContext, experiment);
      }
      
      // Pipeline succeeded, save results
      const finalContext = result.data as ExperimentContext;
      await pipeline.saveResults(finalContext);
      
      return ExperimentStepPipeline.contextToResult(finalContext, experiment);
    } catch (error) {
      // Handle timeout or any unexpected errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Experiment error: ${errorMsg}`);
      
      if (errorMsg.includes('timed out')) {
        logger.error(`CRITICAL: Experiment ${experiment.id} timed out after ${EXPERIMENT_TIMEOUT_MS/1000/60} minutes`);
        logger.error('This experiment was forcibly terminated to prevent pipeline blockage');
      } else {
        logger.error(`Unexpected error: ${errorMsg}`);
      }
      
      // Create error context and save
      const errorContext = {
        ...context,
        success: false,
        error: errorMsg,
        endTime: Date.now()
      };
      
      try {
        await pipeline.saveResults(errorContext);
      } catch (saveError) {
        logger.error(`Failed to save results after error: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
      }
      
      return ExperimentStepPipeline.contextToResult(errorContext, experiment);
    }
  }

  /**
   * Run multiple experiments from a directory
   */
  async runExperimentsFromDirectory(
    experimentsDir: string, 
    specificFiles?: string[],
    runInParallel: boolean = false,
    concurrencyLimit: number = this.defaultConcurrency,
    stepConcurrencyLimits?: Record<string, number>
  ): Promise<string[]> {
    // Update step concurrency limits if provided
    if (stepConcurrencyLimits) {
      Object.entries(stepConcurrencyLimits).forEach(([step, limit]) => {
        this.threadPoolManager.setStepConcurrencyLimit(step, limit);
      });
    }
    // Create a timestamped directory for this run
    const timestamp = Date.now();
    const formattedDate = new Date(timestamp).toISOString().replace(/:/g, '-').replace(/\..+/, '');
    
    // Use the run name in the directory if provided
    const runDirName = this.runName ? 
      `experiment-${this.runName}-${formattedDate}` : 
      `experiment-${formattedDate}`;
    
    const runDir = path.join(this.outputDir, runDirName);
    
    try {
      await fs.mkdir(runDir, { recursive: true });
      console.log(`Created run directory: ${runDir}`);
    } catch (error) {
      console.error(`Error creating run directory ${runDir}:`, error);
      throw new Error(`Failed to create run directory: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Set this as the output directory for this run
    const originalOutputDir = this.outputDir;
    this.outputDir = runDir;
    
    // Browser service is now handled by the SSR API, not directly initialized here
    console.log('Using SSR API for rendering - no direct browser initialization needed');
    
    // Log the run UUID
    console.log(`Using run UUID: ${this.runUuid} for all experiments in this batch`);
    
    // Find experiment files in category folders
    const experimentFiles = await this.findExperimentFiles(experimentsDir, specificFiles);
    
    console.log(`Found ${experimentFiles.length} experiment files to process`);
    console.log(`Results will be saved to: ${runDir}`);
    
    if (experimentFiles.length === 0) {
      console.warn('No experiment files found');
      return [];
    }
    
    // Create a ThreadPool with the specified concurrency limit
    const threadPool = new ThreadPool(concurrencyLimit);
    console.log(`Using ThreadPool with concurrency limit: ${concurrencyLimit}`);
    
    // For parallel mode, use maximum concurrency; for sequential, use 1
    const effectiveConcurrency = runInParallel ? concurrencyLimit : 1;
    threadPool.setMaxConcurrency(effectiveConcurrency);
    
    // Array to store results
    const experimentResults: (ExperimentResult | null)[] = [];
    
    // Setup progress reporting
    let completedTasks = 0;
    const totalTasks = experimentFiles.length;
    
    // Set task complete callback for progress reporting
    threadPool.setTaskCompleteCallback((result) => {
      completedTasks++;
      experimentResults.push(result);
      const percentComplete = Math.round(completedTasks/totalTasks*100);
      console.log(`Progress: ${completedTasks}/${totalTasks} experiments completed (${percentComplete}%)`);
    });
    
    // Log the mode we're running in
    if (runInParallel) {
      console.log(`Running ${experimentFiles.length} experiments in parallel mode with max ${effectiveConcurrency} concurrent tasks...`);
    } else {
      console.log(`Running ${experimentFiles.length} experiments in sequential mode (1 at a time)...`);
    }
    
    // Add all experiment tasks to the thread pool
    for (const experimentInfo of experimentFiles) {
      // Create a task for this experiment
      const task = async () => {
        try {
          console.log(`Loading experiment from: ${experimentInfo.filePath}`);
          const fileContent = await fs.readFile(experimentInfo.filePath, 'utf-8');
          const experiment: ExperimentInput = JSON.parse(fileContent);
          
          // Ensure experiment has a valid ID
          if (!experiment.id) {
            const fileName = path.basename(experimentInfo.filePath, '.json');
            experiment.id = `experiment-${fileName}`;
            console.log(`Using filename as experiment ID: ${experiment.id}`);
          }
          
          console.log(`Processing experiment file: ${experiment.id} (category: ${experimentInfo.label})`);
          
          // Create directory for this specific experiment
          const experimentDir = path.join(runDir, experiment.id);
          await fs.mkdir(experimentDir, { recursive: true });
          
          const result = await this.runExperiment(experiment, experimentDir, experimentInfo.label);
          console.log(`Experiment ${experiment.id} completed successfully`);
          
          // No need to check browser service health - using SSR API now
          
          return result;
        } catch (err) {
          console.error(`Unhandled error in experiment ${experimentInfo.filePath}:`, err);
          return null; // Return null for failed experiments
        }
      };
      
      // Add the task to the thread pool
      await threadPool.addTask(task);
    }
    
    // Wait for all tasks to complete
    console.log(`Waiting for all ${experimentFiles.length} experiments to complete...`);
    await threadPool.waitForAll();
    console.log(`All experiments have completed processing.`);
    
    // Generate run summary
    await this.generateRunSummary(experimentResults, runDir);
    
    // Restore the original output directory
    this.outputDir = originalOutputDir;
    
    // Report thread pool statistics
    const poolStatus = this.threadPoolManager.getStatus();
    console.log('\n====== Thread Pool Status ======');
    Object.entries(poolStatus).forEach(([step, status]) => {
      console.log(`Step "${step}": ${status.running} running, ${status.queued} queued (limit: ${status.concurrencyLimit})`);
    });
    console.log('===============================\n');
    
    // Clean up resources before returning
    await this.cleanup();
    
    // Filter out null results and extract successful paths
    const validResults = experimentResults.filter((result): result is ExperimentResult => 
      result !== null
    );
    
    const resultPaths = validResults
      .filter(result => result.success && result.resultPath)
      .map(result => result.resultPath);
    
    return resultPaths;
  }

  /**
   * Find experiment files in the experiments directory
   */
  private async findExperimentFiles(experimentsDir: string, specificFiles?: string[]): Promise<{ filePath: string; label: string }[]> {
    let experimentFiles: { filePath: string; label: string }[] = [];
    
    if (specificFiles && specificFiles.length > 0) {
      // Process specific files
      for (const filePath of specificFiles) {
        try {
          // Check if this is a direct path to a file
          await fs.access(filePath);
          const stat = await fs.stat(filePath);
          
          if (stat.isFile() && filePath.endsWith('.json')) {
            // This is a direct path to a JSON file
            console.log(`Found direct experiment file: ${filePath}`);
            experimentFiles.push({
              filePath,
              // Use the parent directory name as the label
              label: path.basename(path.dirname(filePath))
            });
            continue; // Continue to next file
          }
        } catch (e) {
          // Not a direct file path, continue with normal search
        }
        
        // If not a direct file path, proceed with the original logic
        const fileName = path.basename(filePath);
        
        // Check each category folder for the file
        const categoryFolders = await fs.readdir(experimentsDir);
        for (const folder of categoryFolders) {
          const folderPath = path.join(experimentsDir, folder);
          
          // Skip if not a directory
          const folderStat = await fs.stat(folderPath);
          if (!folderStat.isDirectory()) continue;
          
          const categoryFilePath = path.join(folderPath, fileName);
          try {
            await fs.access(categoryFilePath);
            // File exists in this category
            experimentFiles.push({ 
              filePath: categoryFilePath, 
              label: folder 
            });
            break;
          } catch {
            // File doesn't exist in this category, continue searching
            continue;
          }
        }
      }
    } else {
      // Get all experiment files from all category folders
      const categoryFolders = await fs.readdir(experimentsDir);
      for (const folder of categoryFolders) {
        const folderPath = path.join(experimentsDir, folder);
        
        // Skip if not a directory
        const folderStat = await fs.stat(folderPath);
        if (!folderStat.isDirectory()) continue;
        
        // Get all JSON files in this category folder
        const files = globSync(path.join(folderPath, '*.json'));
        files.forEach(filePath => {
          experimentFiles.push({ 
            filePath, 
            label: folder 
          });
        });
      }
    }
    
    return experimentFiles;
  }

  /**
   * Generate summary statistics from experiment results
   */
  private async generateRunSummary(experimentResults: (ExperimentResult | null)[], runDir: string): Promise<void> {
    // Print success/failure summary
    const successCount = experimentResults.filter(Boolean).length;
    const failedCount = experimentResults.filter(r => r === null).length;
    console.log(`Experiments processing complete: ${successCount} successful, ${failedCount} failed`);

    // Filter out null results and extract successful results
    const validResults = experimentResults.filter((result): result is ExperimentResult => 
      result !== null
    );
    
    // Calculate runtime statistics
    const runtimes = validResults.filter(r => r.success).map(r => r.runtime);
    const runtimeStats = this.calculateRuntimeStats(runtimes);
    
    // Calculate total runtime statistics
    const totalRuntimes = validResults.filter(r => r.success).map(r => r.totalRuntime || 0);
    const totalRuntimeStats = this.calculateRuntimeStats(totalRuntimes);
    
    // Calculate quality evaluation time statistics
    const qualityEvalTimes = validResults
      .filter(r => r.success && typeof r.qualityEvaluationTime === 'number')
      .map(r => r.qualityEvaluationTime as number);
    const qualityEvalTimeStats = qualityEvalTimes.length > 0 ? 
      this.calculateRuntimeStats(qualityEvalTimes) : undefined;
    
    // Calculate quality statistics
    const qualityScores = validResults
      .filter(r => r.success && typeof r.qualityScore === 'number')
      .map(r => r.qualityScore as number);
    
    // Only calculate quality stats if we have scores
    const qualityStats = qualityScores.length > 0 ? this.calculateQualityStats(qualityScores) : undefined;
    
    // Calculate category distribution
    const categoryDistribution: Record<string, number> = {};
    validResults.forEach(result => {
      const category = result.label || 'uncategorized';
      categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
    });
    
    // Create timestamp for this summary
    const summaryTimestamp = Date.now();
    const formattedDate = new Date(summaryTimestamp).toISOString().replace(/:/g, '-').replace(/\..+/, '');
    
    // Generate a summary.json file for this run with statistics
    const summaryData = {
      timestamp: summaryTimestamp,
      formattedDate,
      runName: this.runName,
      runUuid: this.runUuid,
      outputDirectory: runDir,
      totalExperiments: experimentResults.length,
      successfulExperiments: validResults.filter(r => r.success).length,
      failedExperiments: validResults.filter(r => !r.success).length,
      experimentsWithQualityScores: qualityScores.length,
      categoryDistribution,
      
      // Diff generation time stats (primary runtime metric)
      diffGenerationTimeStats: {
        ...runtimeStats,
        // Convert times to seconds for better readability
        minSec: runtimeStats.min / 1000,
        maxSec: runtimeStats.max / 1000,
        avgSec: runtimeStats.avg / 1000,
        medianSec: runtimeStats.median / 1000,
        totalSec: runtimeStats.total / 1000,
      },
      
      // Total runtime stats (includes quality evaluation)
      totalRuntimeStats: {
        ...totalRuntimeStats,
        minSec: totalRuntimeStats.min / 1000,
        maxSec: totalRuntimeStats.max / 1000,
        avgSec: totalRuntimeStats.avg / 1000,
        medianSec: totalRuntimeStats.median / 1000,
        totalSec: totalRuntimeStats.total / 1000,
      },
      
      // Quality evaluation time stats
      qualityEvaluationTimeStats: qualityEvalTimeStats ? {
        ...qualityEvalTimeStats,
        minSec: qualityEvalTimeStats.min / 1000,
        maxSec: qualityEvalTimeStats.max / 1000,
        avgSec: qualityEvalTimeStats.avg / 1000,
        medianSec: qualityEvalTimeStats.median / 1000,
        totalSec: qualityEvalTimeStats.total / 1000,
      } : undefined,
      
      qualityStats,
      experiments: validResults.map(result => ({
        id: result.experiment.id,
        success: result.success,
        diffGenerationTime: result.runtime,
        diffGenerationTimeSec: result.runtime / 1000,
        totalRuntime: result.totalRuntime || result.runtime,
        totalRuntimeSec: (result.totalRuntime || result.runtime) / 1000,
        qualityEvaluationTime: result.qualityEvaluationTime,
        qualityEvaluationTimeSec: result.qualityEvaluationTime ? result.qualityEvaluationTime / 1000 : undefined,
        resultPath: path.relative(runDir, result.resultPath),
        qualityScore: result.qualityScore,
        error: result.error,
        label: result.label,
        runName: this.runName,
        run_uuid: result.run_uuid
      }))
    };
    
    // Generate aggregated flame graph
    try {
      console.log('\nGenerating aggregated flame graph visualization...');
      
      // Get all experiment IDs
      const experimentIds = validResults.map(result => result.experiment.id);
      
      // Generate the run ID from the timestamp
      const runId = `run-${formattedDate}`;
      
      // Save the aggregated flame graph
      const flamegraphPath = await this.flameGraphGenerator.saveAggregatedFlameGraph(
        runId,
        runDir,
        experimentIds,
        this.runName
      );
      
      // Add flamegraph path to the summary data
      summaryData.flamegraphPath = path.relative(runDir, flamegraphPath);
      
      console.log(`Aggregated flame graph saved to: ${flamegraphPath}`);
    } catch (error) {
      console.error('Error generating aggregated flame graph:', error);
    }
    
    // Write the summary.json to file
    const summaryPath = path.join(runDir, 'summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summaryData, null, 2));
    console.log(`Run summary saved to: ${summaryPath}`);
    
    // Print final summary to console
    console.log(`\n====== Experiment Run Summary ======`);
    console.log(`Total experiments: ${summaryData.totalExperiments}`);
    console.log(`Successful: ${summaryData.successfulExperiments}`);
    console.log(`Failed: ${summaryData.failedExperiments}`);
    console.log(`Run UUID: ${this.runUuid}`);
    
    // Print category distribution
    console.log(`\n== Category Distribution ==`);
    Object.entries(categoryDistribution).forEach(([category, count]) => {
      console.log(`  ${category}: ${count} experiments`);
    });
    
    if (qualityStats) {
      console.log(`\n== Quality Statistics ==`);
      console.log(`Experiments with quality scores: ${qualityScores.length}`);
      console.log(`Average quality score: ${qualityStats.avg.toFixed(2)}/5`);
      console.log(`Median quality score: ${qualityStats.median.toFixed(2)}/5`);
    }
    
    console.log(`\n== Timing Statistics ==`);
    console.log(`Diff Generation Time (target metric):`);
    console.log(`  Average: ${summaryData.diffGenerationTimeStats.avgSec.toFixed(2)}s`);
    console.log(`  Median: ${summaryData.diffGenerationTimeStats.medianSec.toFixed(2)}s`);
    console.log(`  Min: ${summaryData.diffGenerationTimeStats.minSec.toFixed(2)}s`);
    console.log(`  Max: ${summaryData.diffGenerationTimeStats.maxSec.toFixed(2)}s`);
    
    console.log(`\nTotal Runtime (includes quality evaluation):`);
    console.log(`  Average: ${summaryData.totalRuntimeStats.avgSec.toFixed(2)}s`);
    console.log(`  Median: ${summaryData.totalRuntimeStats.medianSec.toFixed(2)}s`);
    
    if (qualityEvalTimeStats) {
      console.log(`\nQuality Evaluation Time:`);
      console.log(`  Average: ${summaryData.qualityEvaluationTimeStats?.avgSec.toFixed(2)}s`);
      console.log(`  Median: ${summaryData.qualityEvaluationTimeStats?.medianSec.toFixed(2)}s`);
    }
    
    // Print flame graph info
    if (summaryData.flamegraphPath) {
      console.log(`\nFlame Graph: ${path.join(runDir, summaryData.flamegraphPath)}`);
    }
    
    console.log(`\nResults directory: ${runDir}`);
    console.log(`===================================\n`);
  }

  /**
   * Calculate runtime statistics from an array of runtimes
   */
  private calculateRuntimeStats(runtimes: number[]): {
    min: number;
    max: number;
    avg: number;
    median: number;
    total: number;
    count: number;
  } {
    if (runtimes.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        median: 0,
        total: 0,
        count: 0
      };
    }

    // Sort the runtimes for median calculation
    const sorted = [...runtimes].sort((a, b) => a - b);
    
    // Calculate statistics
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const total = sorted.reduce((sum, val) => sum + val, 0);
    const avg = total / sorted.length;
    
    // Calculate median
    const midIndex = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[midIndex - 1] + sorted[midIndex]) / 2
      : sorted[midIndex];
    
    return {
      min,
      max,
      avg,
      median,
      total,
      count: sorted.length
    };
  }

  /**
   * Calculate quality statistics from an array of quality scores
   */
  private calculateQualityStats(scores: number[]): {
    min: number;
    max: number;
    avg: number;
    median: number;
    count: number;
    distribution: Record<number, number>;
  } {
    if (scores.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        median: 0,
        count: 0,
        distribution: {}
      };
    }

    // Sort the scores for median calculation
    const sorted = [...scores].sort((a, b) => a - b);
    
    // Calculate statistics
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const total = sorted.reduce((sum, val) => sum + val, 0);
    const avg = total / sorted.length;
    
    // Calculate median
    const midIndex = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[midIndex - 1] + sorted[midIndex]) / 2
      : sorted[midIndex];
    
    // Calculate distribution
    const distribution: Record<number, number> = {};
    for (let i = 1; i <= 5; i++) {
      distribution[i] = 0;
    }
    
    // Count occurrences of each score
    scores.forEach(score => {
      distribution[score] = (distribution[score] || 0) + 1;
    });
    
    return {
      min,
      max,
      avg,
      median,
      count: sorted.length,
      distribution
    };
  }

  /**
   * Cleanup resources used by the experiment runner
   */
  async cleanup(): Promise<void> {
    // No direct browser service to clean up - the SSR API handles its own resources
    console.log('No browser service to clean up - using SSR API for rendering');
    
    // Clean up the slide rendering API client
    try {
      console.log('Cleaning up slide rendering API resources...');
      cleanupRenderingApi();
    } catch (e) {
      console.error('Error cleaning up slide rendering API:', e);
    }
    
    // Detect open handles that might be keeping the process alive
    console.log('\n==== ACTIVE HANDLES DIAGNOSTIC ====');
    console.log('Checking for active handles that may prevent process exit:');
    
    try {
      // @ts-ignore: active handles are technically internal but useful for debugging
      const activeHandles = process._getActiveHandles();
      console.log(`Number of active handles: ${activeHandles.length}`);
      
      // Group handles by type to make them easier to analyze
      const handlesByType: Record<string, number> = {};
      activeHandles.forEach((handle: any) => {
        const type = handle.constructor ? handle.constructor.name : typeof handle;
        handlesByType[type] = (handlesByType[type] || 0) + 1;
      });
      
      // Print summary of handle types
      console.log('Active handle types:');
      Object.entries(handlesByType).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
      });
      
      // Enhanced socket handle inspection - show detailed info for all sockets
      const socketHandles = activeHandles.filter((h: any) => 
        h.constructor && (h.constructor.name === 'Socket' || h.constructor.name === 'Server'));
      
      if (socketHandles.length > 0) {
        console.log(`\n==== DETAILED SOCKET ANALYSIS ====`);
        console.log(`Found ${socketHandles.length} active socket connections:`);
        
        socketHandles.forEach((socket: any, i: number) => {
          // Get detailed socket information
          const localAddress = socket.localAddress ? `${socket.localAddress}:${socket.localPort}` : 'unknown';
          const remoteAddress = socket.remoteAddress ? `${socket.remoteAddress}:${socket.remotePort}` : 'unknown';
          const connecting = socket.connecting || false;
          const destroyed = socket.destroyed || false;
          const readable = socket.readable || false;
          const writable = socket.writable || false;
          const pending = socket.pending || false;
          
          console.log(`Socket ${i+1}/${socketHandles.length}:`);
          console.log(`  - Local: ${localAddress}`);
          console.log(`  - Remote: ${remoteAddress}`);
          console.log(`  - State: ${connecting ? 'connecting' : (destroyed ? 'destroyed' : 'established')}`);
          console.log(`  - Readable: ${readable}, Writable: ${writable}, Pending: ${pending}`);
          
          // Additional socket diagnostics
          if (socket._httpMessage) {
            console.log(`  - Has pending HTTP message: Yes`);
            if (socket._httpMessage.method && socket._httpMessage.path) {
              console.log(`  - HTTP Request: ${socket._httpMessage.method} ${socket._httpMessage.path}`);
            }
          }
          
          // Timeout information
          if (socket.timeout) {
            console.log(`  - Timeout set: ${socket.timeout}ms`);
          }
          
          // Socket events
          const events = socket.eventNames ? socket.eventNames() : [];
          if (events.length > 0) {
            console.log(`  - Active event listeners: ${events.join(', ')}`);
            events.forEach(eventName => {
              const listeners = socket.listeners(eventName).length;
              console.log(`    - ${eventName}: ${listeners} listener(s)`);
            });
          }
          
          console.log(''); // Add a blank line between sockets
        });
        
        // Enhanced debugging - look for specific issues
        console.log('==== SOCKET ISSUE ANALYSIS ====');
        
        // Check for keep-alive sockets
        const keepAliveSockets = socketHandles.filter((s: any) => 
          s._httpMessage && s._httpMessage.shouldKeepAlive);
          
        if (keepAliveSockets.length > 0) {
          console.log(`Warning: Found ${keepAliveSockets.length} sockets with keep-alive set`);
        }
        
        // Check for sockets with pending operations
        const pendingSockets = socketHandles.filter((s: any) => s.pending);
        if (pendingSockets.length > 0) {
          console.log(`Warning: Found ${pendingSockets.length} sockets with pending operations`);
        }
        
        // Check for ESTABLISHED HTTP connections (node-fetch related)
        console.log('\nHTTP connection analysis:');
        const httpSockets = socketHandles.filter((s: any) => 
          (s.remoteAddress && s.remotePort && !s.destroyed));
          
        if (httpSockets.length > 0) {
          console.log(`Found ${httpSockets.length} potentially active HTTP connections`);
          httpSockets.forEach((socket: any, i) => {
            console.log(`HTTP Socket ${i+1}: ${socket.remoteAddress}:${socket.remotePort}`);
          });
        }
        
        // Don't attempt to destroy sockets yet - we're just diagnosing
        console.log('\nNot destroying sockets to better analyze the issue');
      }
      
      // Look for timers that might be keeping the process alive
      const timerHandles = activeHandles.filter((h: any) => 
        h.constructor && (h.constructor.name === 'Timeout' || h.constructor.name === 'Interval'));
        
      if (timerHandles.length > 0) {
        console.log(`\n==== TIMER ANALYSIS ====`);
        console.log(`Found ${timerHandles.length} active timers`);
        
        timerHandles.forEach((timer: any, i) => {
          // Try to extract useful info from the timer
          const msecs = timer._idleTimeout;
          const repeat = timer._repeat;
          
          // Get stack trace if available
          let stack = 'unavailable';
          if (timer.stack) {
            stack = timer.stack;
          } else if (timer._onTimeout && timer._onTimeout.stack) {
            stack = timer._onTimeout.stack;
          }
          
          console.log(`Timer ${i+1}/${timerHandles.length}:`);
          console.log(`  - Timeout: ${msecs}ms`);
          console.log(`  - Repeating: ${repeat ? 'Yes' : 'No'}`);
          console.log(`  - Stack trace: ${stack}`);
        });
      }
      
      // Check promises/microtasks that might be pending
      console.log('\n==== ASYNC RESOURCE ANALYSIS ====');
      try {
        // @ts-ignore: activeResourcesInfo is an internal API but useful for diagnostics
        if (process._getActiveResourcesInfo) {
          const asyncResources = process._getActiveResourcesInfo();
          console.log(`Active async resources: ${asyncResources.length}`);
          
          const resourceTypes: Record<string, number> = {};
          asyncResources.forEach((resource: any) => {
            resourceTypes[resource.type] = (resourceTypes[resource.type] || 0) + 1;
          });
          
          console.log('Async resource types:');
          Object.entries(resourceTypes).forEach(([type, count]) => {
            console.log(`  - ${type}: ${count}`);
          });
          
          // Log details of the first few resources of each type
          Object.keys(resourceTypes).forEach(type => {
            const typeResources = asyncResources.filter((r: any) => r.type === type).slice(0, 3);
            console.log(`\nSample ${type} resources:`);
            typeResources.forEach((resource: any, i: number) => {
              console.log(`  ${i+1}. ${JSON.stringify(resource)}`);
            });
          });
        } else {
          console.log('Active async resources info not available in this Node.js version');
        }
      } catch (e) {
        console.error('Error accessing async resources info:', e);
      }
      
      // Enhanced diagnostics for HTML generator and ChatApiService
      console.log('\n==== API CLIENT DIAGNOSTICS ====');
      if (this.chatApi) {
        console.log('ChatApiService instance exists');
        // Dump ChatApiService configuration
        console.log(`API Config: ${JSON.stringify(this.chatApi.config || 'Not available')}`);
        
        // Try to inspect deeper into the ChatApiService
        try {
          // @ts-ignore - accessing private properties for diagnostics
          const agent = this.chatApi._httpAgent;
          if (agent) {
            console.log('HTTP Agent info:');
            console.log(`  - Type: ${agent.constructor ? agent.constructor.name : 'unknown'}`);
            // Check for socket pool
            if (agent.freeSockets) {
              const freeSocketCount = Object.values(agent.freeSockets).flat().length;
              console.log(`  - Free sockets: ${freeSocketCount}`);
            }
            if (agent.sockets) {
              const activeSocketCount = Object.values(agent.sockets).flat().length;
              console.log(`  - Active sockets: ${activeSocketCount}`);
            }
            if (agent.requests) {
              const pendingRequestCount = Object.values(agent.requests).flat().length;
              console.log(`  - Pending requests: ${pendingRequestCount}`);
            }
          } else {
            console.log('No HTTP Agent found in ChatApiService');
          }
        } catch (e) {
          console.error('Error inspecting ChatApiService:', e);
        }
      } else {
        console.log('No ChatApiService instance available');
      }
      
      // Don't clean up yet - just diagnose
      
    } catch (e) {
      console.error('Error inspecting active handles:', e);
    }
    
    console.log('==== END DIAGNOSTIC ====\n');
    
    // Instead of setting a kill timer, create a diagnostic timer that will run 
    // several rounds of diagnostics to see how handles change over time
    console.log('Setting a diagnostic timer to monitor handles over time...');
    
    let diagnosticRun = 0;
    const maxDiagnosticRuns = 3;
    
    const diagnosticTimer = setInterval(() => {
      diagnosticRun++;
      console.log(`\n==== DIAGNOSTIC RUN ${diagnosticRun}/${maxDiagnosticRuns} (after ${diagnosticRun * 10} seconds) ====`);
      
      try {
        // @ts-ignore: active handles are technically internal but useful for debugging
        const activeHandles = process._getActiveHandles();
        console.log(`Number of active handles: ${activeHandles.length}`);
        
        // Group handles by type
        const handlesByType: Record<string, number> = {};
        activeHandles.forEach((handle: any) => {
          const type = handle.constructor ? handle.constructor.name : typeof handle;
          handlesByType[type] = (handlesByType[type] || 0) + 1;
        });
        
        console.log('Active handle types:');
        Object.entries(handlesByType).forEach(([type, count]) => {
          console.log(`  - ${type}: ${count}`);
        });
        
        // If this is the final diagnostic run, print a more detailed report and force exit
        if (diagnosticRun >= maxDiagnosticRuns) {
          console.log('\n==== FINAL DIAGNOSTIC SUMMARY ====');
          console.log(`Process still has ${activeHandles.length} active handles after ${diagnosticRun * 10} seconds`);
          console.log('These handles are likely preventing the process from exiting naturally');
          
          // Print all handle details one last time
          activeHandles.forEach((handle: any, i) => {
            const type = handle.constructor ? handle.constructor.name : typeof handle;
            console.log(`\nHandle ${i+1}/${activeHandles.length} (${type}):`);
            
            // Additional type-specific info
            if (type === 'Socket') {
              const socket = handle;
              const localAddress = socket.localAddress ? `${socket.localAddress}:${socket.localPort}` : 'unknown';
              const remoteAddress = socket.remoteAddress ? `${socket.remoteAddress}:${socket.remotePort}` : 'unknown';
              console.log(`  - Local: ${localAddress}, Remote: ${remoteAddress}`);
              console.log(`  - Destroyed: ${socket.destroyed || false}`);
            } else if (type === 'Timeout' || type === 'Interval') {
              const timer = handle;
              console.log(`  - Timeout: ${timer._idleTimeout}ms`);
              console.log(`  - Repeating: ${timer._repeat ? 'Yes' : 'No'}`);
            }
          });
          
          console.log(`\n===== CONCLUSION =====`);
          console.log(`Process is likely hanging due to unclosed network connections.`);
          console.log(`Run with NODE_DEBUG=net,http,timer node your-script.js for more detailed diagnostics.`);
          
          clearInterval(diagnosticTimer);
          
          // Truly hang rather than forcing exit, so the user can see all diagnostic info
          console.log('\nNot forcing exit to allow you to see the complete diagnostics.');
          console.log('Press Ctrl+C to exit manually.');
        }
      } catch (e) {
        console.error(`Error in diagnostic run ${diagnosticRun}:`, e);
      }
    }, 10000); // Run diagnostics every 10 seconds
  }
}