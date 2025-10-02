/**
 * Logging utilities for the experiment runner
 */

/**
 * Interface for basic logger operations
 */
export interface Logger {
  info(message: string): void;
  error(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
  log(message: string): void;
}

/**
 * Console logger that logs to the console
 */
export class ConsoleLogger implements Logger {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix ? `[${prefix}] ` : '';
  }

  info(message: string): void {
    console.log(`${this.prefix}${message}`);
  }

  error(message: string): void {
    console.error(`${this.prefix}${message}`);
  }

  warn(message: string): void {
    console.warn(`${this.prefix}${message}`);
  }

  debug(message: string): void {
    if (process.env.DEBUG) {
      console.debug(`${this.prefix}${message}`);
    }
  }

  log(message: string): void {
    console.log(`${this.prefix}${message}`);
  }
}

/**
 * Creates a logger wrapper that can be used with existing loggers or fall back to console
 * 
 * @param logger An optional logger implementation
 * @param prefix Optional prefix for console logger (if used)
 * @returns A logger object with info, error, warn, debug methods
 */
export function createLoggerWrapper(logger?: Logger | null, prefix: string = ''): Logger {
  if (logger) {
    return logger;
  }
  
  // No logger provided, create a console logger
  return new ConsoleLogger(prefix);
}

/**
 * Creates a silent logger that doesn't output anything
 * Useful for suppressing logs in tests or other contexts
 */
export class SilentLogger implements Logger {
  info(_message: string): void {}
  error(_message: string): void {}
  warn(_message: string): void {}
  debug(_message: string): void {}
  log(_message: string): void {}
}