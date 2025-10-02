import { StepConfiguration } from './types';

/**
 * Configuration for experiment steps
 * 
 * This file contains default configurations for each step in the experiment pipeline.
 * These settings can be used to control thread pools, concurrency limits, timeouts, etc.
 */
export const defaultStepConfig: Record<string, StepConfiguration> = {
  'Setup Deck': {
    concurrencyLimit: 8,
    timeoutMs: 30000, // 30 seconds
    retries: 0,
    description: 'Sets up the deck and slides for the experiment'
  },
  'Generate Deck Diff': {
    concurrencyLimit: 8, // API-heavy step, limit concurrency
    timeoutMs: 180000, // 3 minutes
    retries: 1,
    description: 'Generates a deck diff from the API or uses provided one'
  },
  'Apply Deck Diff': {
    concurrencyLimit: 8,
    timeoutMs: 60000, // 1 minute
    retries: 0,
    description: 'Applies deck diff to generate the "after" state'
  },
  'Generate HTML and Images': {
    concurrencyLimit: 3, // Resource-intensive step, limit concurrency
    timeoutMs: 300000, // 5 minutes
    retries: 2,
    renderingOptions: {
      scale: 0.75,
      maxConcurrentRenders: 3,
      requestTimeoutMs: 60000 // 1 minute per individual render
    },
    description: 'Generates HTML and images for the slides'
  },
  'Evaluate Quality': {
    concurrencyLimit: 8, // API-heavy step, limit concurrency
    timeoutMs: 180000, // 3 minutes
    retries: 1,
    description: 'Evaluates quality of the result'
  },
  'Finalize Experiment': {
    concurrencyLimit: 10, // Simple step, allow high concurrency
    timeoutMs: 30000, // 30 seconds
    retries: 0,
    description: 'Finalizes experiment, sets success flag and end time'
  }
};

/**
 * Global configuration for experiments
 */
export const globalConfig = {
  // Server-side rendering configuration
  ssr: {
    baseUrl: process.env.SSR_API_URL || 'http://localhost:3030',
    maxConnections: 2,
    connectionPoolTimeoutMs: 10000
  },
  
  // API configuration
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:9090',
    maxConnections: 3,
    connectionPoolTimeoutMs: 10000
  },
  
  // Default image rendering configuration
  imageRendering: {
    defaultScale: 0.75,
    format: 'png',
    quality: 90,
    width: 1920,
    height: 1080
  },
  
  // Thread pool configuration
  threadPools: {
    global: {
      maxThreads: 5,
      queueTimeoutMs: 60000
    }
  }
};

/**
 * Function to get step configuration with defaults applied
 */
export function getStepConfig(stepName: string): StepConfiguration {
  const config = defaultStepConfig[stepName];
  if (!config) {
    console.warn(`No configuration found for step "${stepName}", using defaults`);
    return {
      concurrencyLimit: 3,
      timeoutMs: 60000,
      retries: 0,
      description: `Step ${stepName}`
    };
  }
  return config;
} 