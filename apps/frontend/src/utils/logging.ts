/**
 * Logging utilities for interactive-slide-sorcery
 * 
 * This utility provides a configurable logging system that can:
 * 1. Enable/disable logs globally
 * 2. Enable specific categories of logs while disabling others
 * 3. Control log levels (debug, info, warn, error)
 * 4. Format logs with prefixes and colors
 */

// Log levels in order of severity
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4, // Special level to disable all logs
}

// Log categories to organize logs by feature
export enum LogCategory {
  REGISTRY = 'registry',
  STORE = 'store',
  COMPONENTS = 'components',
  RENDERING = 'rendering',
  COLLABORATION = 'collaboration',
  PERFORMANCE = 'performance',
  YJS = 'yjs',
  NETWORK = 'network',
  OTHER = 'other',
}

// Configuration interface for the logger
export interface LoggerConfig {
  // Global minimum log level - logs below this level are suppressed
  globalLevel: LogLevel;
  
  // Per-category minimum log levels - overrides the global level
  categoryLevels: Partial<Record<LogCategory, LogLevel>>;
  
  // Whether to use colors in console output
  useColors: boolean;
  
  // Whether to add timestamps to logs
  showTimestamps: boolean;
}

// Default configuration
const DEFAULT_CONFIG: LoggerConfig = {
  globalLevel: LogLevel.INFO,
  categoryLevels: {},
  useColors: true,
  showTimestamps: false,
};

// ANSI color codes for console output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Singleton instance of the current configuration
let currentConfig: LoggerConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the global logging system
 */
export function configureLogging(config: Partial<LoggerConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...config,
    // Merge category levels
    categoryLevels: {
      ...currentConfig.categoryLevels,
      ...(config.categoryLevels || {}),
    }
  };
}

/**
 * Enable a specific category of logs
 */
export function enableCategory(category: LogCategory, level: LogLevel = LogLevel.DEBUG): void {
  currentConfig.categoryLevels[category] = level;
}

/**
 * Disable a specific category of logs
 */
export function disableCategory(category: LogCategory): void {
  currentConfig.categoryLevels[category] = LogLevel.NONE;
}

/**
 * Reset logging configuration to defaults
 */
export function resetLogging(): void {
  currentConfig = { ...DEFAULT_CONFIG };
}

/**
 * Check if a log should be shown based on its level and category
 */
function shouldLog(level: LogLevel, category: LogCategory): boolean {
  // Get the minimum level for this category, or fall back to global level
  const minimumLevel = category in currentConfig.categoryLevels
    ? currentConfig.categoryLevels[category]
    : currentConfig.globalLevel;
  
  // Log if the current level is >= minimum level
  return level >= minimumLevel;
}

/**
 * Format a log message with optional colors, timestamps, and category
 */
function formatLogMessage(
  level: LogLevel,
  category: LogCategory,
  message: string,
): string {
  const { useColors, showTimestamps } = currentConfig;
  
  // Define color for each log level
  const levelColors = {
    [LogLevel.DEBUG]: COLORS.gray,
    [LogLevel.INFO]: COLORS.blue,
    [LogLevel.WARN]: COLORS.yellow,
    [LogLevel.ERROR]: COLORS.red,
    [LogLevel.NONE]: COLORS.reset,
  };
  
  // Define color for each category
  const categoryColors = {
    [LogCategory.REGISTRY]: COLORS.magenta,
    [LogCategory.STORE]: COLORS.cyan,
    [LogCategory.COMPONENTS]: COLORS.green,
    [LogCategory.RENDERING]: COLORS.blue,
    [LogCategory.COLLABORATION]: COLORS.yellow,
    [LogCategory.PERFORMANCE]: COLORS.red,
    [LogCategory.YJS]: COLORS.magenta,
    [LogCategory.NETWORK]: COLORS.cyan,
    [LogCategory.OTHER]: COLORS.gray,
  };
  
  // Level name for the prefix
  const levelName = LogLevel[level].padEnd(5);
  
  // Build prefix parts
  const parts: string[] = [];
  
  // Add timestamp if enabled
  if (showTimestamps) {
    const timestamp = new Date().toISOString();
    parts.push(useColors ? `${COLORS.dim}${timestamp}${COLORS.reset}` : timestamp);
  }
  
  // Add log level
  if (useColors) {
    parts.push(`${levelColors[level]}${COLORS.bright}${levelName}${COLORS.reset}`);
  } else {
    parts.push(levelName);
  }
  
  // Add category
  if (useColors) {
    parts.push(`${categoryColors[category]}[${category}]${COLORS.reset}`);
  } else {
    parts.push(`[${category}]`);
  }
  
  // Combine prefix and message
  return `${parts.join(' ')} ${message}`;
}

/**
 * Logger class that handles log filtering and formatting
 */
export class Logger {
  private category: LogCategory;
  
  constructor(category: LogCategory = LogCategory.OTHER) {
    this.category = category;
  }
  
  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]): void {
    if (!shouldLog(LogLevel.DEBUG, this.category)) return;
    
    const formattedMessage = formatLogMessage(LogLevel.DEBUG, this.category, message);
    console.debug(formattedMessage, ...args);
  }
  
  /**
   * Log an info message
   */
  info(message: string, ...args: any[]): void {
    if (!shouldLog(LogLevel.INFO, this.category)) return;
    
    const formattedMessage = formatLogMessage(LogLevel.INFO, this.category, message);
    console.log(formattedMessage, ...args);
  }
  
  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    if (!shouldLog(LogLevel.WARN, this.category)) return;
    
    const formattedMessage = formatLogMessage(LogLevel.WARN, this.category, message);
    console.warn(formattedMessage, ...args);
  }
  
  /**
   * Log an error message
   */
  error(message: string, ...args: any[]): void {
    if (!shouldLog(LogLevel.ERROR, this.category)) return;
    
    const formattedMessage = formatLogMessage(LogLevel.ERROR, this.category, message);
    console.error(formattedMessage, ...args);
  }
}

/**
 * Create a logger for a specific category
 */
export function createLogger(category: LogCategory = LogCategory.OTHER): Logger {
  return new Logger(category);
}

// Export convenience functions for common logging tasks

/**
 * Enable only specific categories while disabling all others
 */
export function enableOnlyCategories(...categories: LogCategory[]): void {
  // First disable everything
  Object.values(LogCategory).forEach(cat => {
    currentConfig.categoryLevels[cat] = LogLevel.NONE;
  });
  
  // Then enable only the specified categories
  categories.forEach(cat => {
    currentConfig.categoryLevels[cat] = LogLevel.DEBUG;
  });
}

/**
 * Quick utility to enable Registry logs only (commonly needed)
 */
export function enableRegistryLogsOnly(): void {
  enableOnlyCategories(LogCategory.REGISTRY);
}

/**
 * Set the global log level
 */
export function setGlobalLogLevel(level: LogLevel): void {
  currentConfig.globalLevel = level;
}

/**
 * Completely disable all logging
 */
export function disableAllLogs(): void {
  currentConfig.globalLevel = LogLevel.NONE;
}

/**
 * Enable all logs at a specific level
 */
export function enableAllLogs(level: LogLevel = LogLevel.DEBUG): void {
  currentConfig.globalLevel = level;
  // Clear any per-category overrides
  currentConfig.categoryLevels = {};
}