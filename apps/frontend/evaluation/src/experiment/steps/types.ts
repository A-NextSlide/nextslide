/**
 * Configuration for an experiment step
 */
export interface StepConfiguration {
  /** Maximum number of concurrent executions of this step */
  concurrencyLimit: number;
  
  /** Timeout in milliseconds before the step is considered failed */
  timeoutMs: number;
  
  /** Number of retries on failure before giving up */
  retries: number;
  
  /** Description of what this step does */
  description: string;
  
  /** Additional rendering options for image generation step */
  renderingOptions?: {
    /** Scale factor for image rendering */
    scale: number;
    
    /** Maximum number of concurrent render operations */
    maxConcurrentRenders: number;
    
    /** Timeout for individual render requests */
    requestTimeoutMs: number;
  };
}

/**
 * Basic step interface for all experiment steps
 */
export interface ExperimentStep<TInput, TOutput> {
  /** Name of the step */
  name: string;
  
  /** Description of what the step does */
  description: string;
  
  /** Function to execute the step with the given input */
  execute: (input: TInput, config: StepConfiguration) => Promise<StepResult<TOutput>>;
}

/**
 * Result of executing a step
 */
export interface StepResult<T> {
  /** Whether the step was successful */
  success: boolean;
  
  /** Output data if successful */
  data?: T;
  
  /** Error if unsuccessful */
  error?: Error;
} 