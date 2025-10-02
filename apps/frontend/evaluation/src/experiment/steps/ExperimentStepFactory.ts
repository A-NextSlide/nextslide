import { ExperimentStep, StepConfiguration } from './types';
import { ExperimentContext } from '../ExperimentStepPipeline';
import { defaultStepConfig, getStepConfig, globalConfig } from './config';
import { 
  setupDeckStep,
  createDeckDiffStep, 
  applyDeckDiffStep,
  generateImagesStep,
  evaluateQualityStep,
  finalizeExperimentStep
} from './index';

/**
 * Factory class for creating experiment step instances with configuration
 */
export class ExperimentStepFactory {
  private stepConfigs: Record<string, StepConfiguration>;

  /**
   * Create a new factory with optional custom configuration
   */
  constructor(customConfig?: Record<string, Partial<StepConfiguration>>) {
    // Start with default configs
    this.stepConfigs = { ...defaultStepConfig };

    // Merge any custom configs
    if (customConfig) {
      Object.entries(customConfig).forEach(([stepName, config]) => {
        this.stepConfigs[stepName] = {
          ...this.getStepConfig(stepName),
          ...config
        };
      });
    }
  }

  /**
   * Get configuration for a specific step
   */
  getStepConfig(stepName: string): StepConfiguration {
    return this.stepConfigs[stepName] || getStepConfig(stepName);
  }

  /**
   * Update configuration for a specific step
   */
  updateStepConfig(stepName: string, config: Partial<StepConfiguration>): void {
    this.stepConfigs[stepName] = {
      ...this.getStepConfig(stepName),
      ...config
    };
  }

  /**
   * Create the setup deck step with current configuration
   */
  createSetupDeckStep(): ExperimentStep<ExperimentContext, ExperimentContext> {
    const config = this.getStepConfig(setupDeckStep.name);
    return {
      ...setupDeckStep,
      execute: (context: ExperimentContext) => setupDeckStep.execute(context, config)
    };
  }

  /**
   * Create the deck diff step with current configuration
   */
  createDeckDiffStep(): ExperimentStep<ExperimentContext, ExperimentContext> {
    const config = this.getStepConfig(createDeckDiffStep.name);
    return {
      ...createDeckDiffStep,
      execute: (context: ExperimentContext) => createDeckDiffStep.execute(context, config)
    };
  }

  /**
   * Create the apply deck diff step with current configuration
   */
  createApplyDeckDiffStep(): ExperimentStep<ExperimentContext, ExperimentContext> {
    const config = this.getStepConfig(applyDeckDiffStep.name);
    return {
      ...applyDeckDiffStep,
      execute: (context: ExperimentContext) => applyDeckDiffStep.execute(context, config)
    };
  }

  /**
   * Create the generate images step with current configuration
   */
  createGenerateImagesStep(): ExperimentStep<ExperimentContext, ExperimentContext> {
    const config = this.getStepConfig(generateImagesStep.name);
    return {
      ...generateImagesStep,
      execute: (context: ExperimentContext) => generateImagesStep.execute(context, config)
    };
  }

  /**
   * Create the evaluate quality step with current configuration
   */
  createEvaluateQualityStep(): ExperimentStep<ExperimentContext, ExperimentContext> {
    const config = this.getStepConfig(evaluateQualityStep.name);
    return {
      ...evaluateQualityStep,
      execute: (context: ExperimentContext) => evaluateQualityStep.execute(context, config)
    };
  }

  /**
   * Create the finalize experiment step with current configuration
   */
  createFinalizeExperimentStep(): ExperimentStep<ExperimentContext, ExperimentContext> {
    const config = this.getStepConfig(finalizeExperimentStep.name);
    return {
      ...finalizeExperimentStep,
      execute: (context: ExperimentContext) => finalizeExperimentStep.execute(context, config)
    };
  }

  /**
   * Create all steps for a complete experiment pipeline
   */
  createAllSteps(): ExperimentStep<ExperimentContext, ExperimentContext>[] {
    return [
      this.createSetupDeckStep(),
      this.createDeckDiffStep(),
      this.createApplyDeckDiffStep(),
      this.createGenerateImagesStep(),
      this.createEvaluateQualityStep(),
      this.createFinalizeExperimentStep()
    ];
  }
  
  /**
   * Get the global configuration settings
   */
  getGlobalConfig(): typeof globalConfig {
    return { ...globalConfig };
  }
} 