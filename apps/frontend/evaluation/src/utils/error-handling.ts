/**
 * Error handling utilities for the evaluation system
 * 
 * This module provides consistent error handling patterns used throughout the system.
 */

import { Logger } from './logging';

/**
 * Custom error class for evaluation system errors
 */
export class EvaluationError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly context?: Record<string, any>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'EvaluationError';
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EvaluationError);
    }
  }
}

/**
 * Create a timeout promise that rejects after the specified time
 * 
 * @param ms Time in milliseconds
 * @param reason Custom reason for the timeout
 * @returns Promise that rejects after the specified time
 */
export function createTimeout(ms: number, reason: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new EvaluationError(`Operation timed out after ${ms}ms: ${reason}`, 'TIMEOUT'));
    }, ms);
  });
}

/**
 * Wraps an async function with standard error handling
 * 
 * @param fn Function to wrap
 * @param errorMessage Error message prefix
 * @param logger Optional logger to log errors
 * @returns Wrapped function with error handling
 */
export function withErrorHandling<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  errorMessage: string,
  logger?: Logger
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      const errorDetails = error instanceof Error
        ? error.message
        : String(error);
        
      const fullMessage = `${errorMessage}: ${errorDetails}`;
      
      // Log the error if a logger was provided
      if (logger) {
        logger.error(fullMessage);
        if (error instanceof Error && error.stack) {
          logger.error(error.stack);
        }
      }
      
      throw new EvaluationError(
        fullMessage,
        'OPERATION_FAILED',
        { args },
        error instanceof Error ? error : undefined
      );
    }
  };
}

/**
 * Runs a function or promise with a timeout
 * 
 * @param fnOrPromise Function to run or Promise to await
 * @param timeoutMs Timeout in milliseconds
 * @param timeoutReason Reason for the timeout
 * @returns Result of the function/promise or rejects with timeout error
 */
export async function withTimeout<T>(
  fnOrPromise: (() => Promise<T>) | Promise<T>,
  timeoutMs: number,
  timeoutReason?: string
): Promise<T> {
  // Create a standardized timeout error
  const timeoutError = new EvaluationError(
    `Operation timed out after ${timeoutMs}ms${timeoutReason ? ': ' + timeoutReason : ''}`,
    'TIMEOUT'
  );
  
  // Create a promise that rejects after the timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);
      reject(timeoutError);
    }, timeoutMs);
  });
  
  // If fnOrPromise is a function, call it to get the promise
  // Otherwise, use it directly as a promise
  const promise = typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise;
  
  // Race the promise against the timeout
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Safely executes a function and returns null if it fails
 * 
 * @param fn Function to execute
 * @param logger Optional logger to log errors
 * @returns Result of the function or null if it fails
 */
export async function trySafe<T>(
  fn: () => Promise<T>,
  logger?: Logger
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (logger) {
      logger.error(`Operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
} 