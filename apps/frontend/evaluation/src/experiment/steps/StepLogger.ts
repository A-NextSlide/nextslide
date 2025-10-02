import { Logger } from '../../utils/logging';
import { ExperimentContext } from '../ExperimentStepPipeline';

/**
 * Logger implementation that stores logs in the experiment context
 */
export class ExperimentLogger implements Logger {
  private logs: string[];
  private prefix: string;

  constructor(logs: string[], prefix: string = '') {
    this.logs = logs;
    this.prefix = prefix ? `[${prefix}] ` : '';
  }

  private timestamp(): string {
    return new Date().toISOString();
  }

  private log(level: string, message: string): void {
    const logMessage = `${this.timestamp()} ${this.prefix}${level}: ${message}`;
    this.logs.push(logMessage);
    console.log(logMessage);
  }

  info(message: string): void {
    this.log('INFO', message);
  }

  error(message: string): void {
    this.log('ERROR', message);
  }

  warn(message: string): void {
    this.log('WARN', message);
  }

  debug(message: string): void {
    this.log('DEBUG', message);
  }
}

/**
 * Creates a logger for experiment steps that logs to both console and the context logs array
 */
export function createStepLogger(context: ExperimentContext, stepName: string): Logger {
  return {
    info(message: string): void {
      const logMessage = `[${context.id}] [${stepName}] INFO: ${message}`;
      console.log(logMessage);
      context.logs.push(`[${stepName}] INFO: ${message}`);
    },
    
    error(message: string): void {
      const logMessage = `[${context.id}] [${stepName}] ERROR: ${message}`;
      console.error(logMessage);
      context.logs.push(`[${stepName}] ERROR: ${message}`);
    },
    
    warn(message: string): void {
      const logMessage = `[${context.id}] [${stepName}] WARN: ${message}`;
      console.warn(logMessage);
      context.logs.push(`[${stepName}] WARN: ${message}`);
    },
    
    debug(message: string): void {
      const logMessage = `[${context.id}] [${stepName}] DEBUG: ${message}`;
      console.debug(logMessage);
      context.logs.push(`[${stepName}] DEBUG: ${message}`);
    }
  };
}

/**
 * Creates a prefixed child logger for a component within a step
 * Useful for sub-operations like rendering individual slides
 */
export function createChildLogger(parentLogger: Logger, childPrefix: string): Logger {
  return {
    info(message: string): void {
      parentLogger.info(`[${childPrefix}] ${message}`);
    },
    
    error(message: string): void {
      parentLogger.error(`[${childPrefix}] ${message}`);
    },
    
    warn(message: string): void {
      parentLogger.warn(`[${childPrefix}] ${message}`);
    },
    
    debug(message: string): void {
      parentLogger.debug(`[${childPrefix}] ${message}`);
    }
  };
}

/**
 * Creates a timer logger that reports elapsed time when the returned function is called
 */
export function createTimerLogger(logger: Logger, operationName: string): () => number {
  const startTime = Date.now();
  return () => {
    const elapsedMs = Date.now() - startTime;
    logger.info(`${operationName} completed in ${elapsedMs}ms`);
    return elapsedMs;
  };
}

/**
 * Runs an operation with retry logic
 * 
 * @param operation The function to retry
 * @param maxRetries Maximum number of retries
 * @param logger Logger to use for reporting
 * @param operationName Name of the operation for logging
 * @returns Result of the operation or throws if all retries fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>, 
  maxRetries: number,
  logger: Logger,
  operationName: string
): Promise<T> {
  let retryCount = 0;
  let lastError: Error | null = null;
  
  while (retryCount <= maxRetries) {
    try {
      if (retryCount > 0) {
        logger.info(`Retry ${retryCount}/${maxRetries} for ${operationName}`);
      }
      
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const attempt = retryCount + 1;
      logger.error(`Attempt ${attempt}/${maxRetries + 1} failed for ${operationName}: ${lastError.message}`);
      retryCount++;
    }
  }
  
  // If we get here, all retries failed
  throw lastError || new Error(`All retries failed for ${operationName}`);
}

/**
 * Runs an operation with a timeout
 * 
 * @param operation The function to execute
 * @param timeoutMs Timeout in milliseconds
 * @param errorMessage Error message if timeout occurs
 * @returns Result of the operation or throws if timeout occurs
 */
export async function withTimeout<T>(
  operation: () => Promise<T>, 
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  // Create a promise that will resolve with the operation result
  const operationPromise = operation();
  
  // Create a promise that will reject after the timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  
  // Race the operation against the timeout
  return Promise.race([operationPromise, timeoutPromise]);
} 