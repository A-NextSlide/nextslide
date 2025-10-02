/**
 * Examples of how to use the logging system
 * This file is for demonstration purposes only
 */

import {
  LogLevel,
  LogCategory,
  createLogger,
  configureLogging,
  enableRegistryLogsOnly,
  enableOnlyCategories,
  disableAllLogs,
  enableAllLogs,
  enableCategory,
  disableCategory,
} from './logging';

// Example 1: Basic usage with different categories
const registryLogger = createLogger(LogCategory.REGISTRY);
const storeLogger = createLogger(LogCategory.STORE);
const componentLogger = createLogger(LogCategory.COMPONENTS);

export function basicLoggerExample() {
  // Logs from different systems
  registryLogger.info('Registry initialized with 10 components');
  storeLogger.debug('Store update: slide-1 modified');
  componentLogger.warn('Component text-123 has invalid properties');
  
  // With additional data
  registryLogger.info('Registered component %s with %d properties', 'Chart', 15);
}

// Example 2: Enabling only Registry logs
export function registryOnlyExample() {
  console.log('\n--- Enabling only Registry logs ---');
  
  // Enable only registry logs (all other categories will be silent)
  enableRegistryLogsOnly();
  
  // This will show
  registryLogger.info('Registry loaded successfully!');
  
  // These will be silent
  storeLogger.info('Store initialized'); // Won't show
  componentLogger.info('Components mounted'); // Won't show
}

// Example 3: Configuring log levels
export function logLevelsExample() {
  console.log('\n--- Configuring log levels ---');
  
  // Enable all logs but set global level to WARN
  enableAllLogs(LogLevel.WARN);
  
  registryLogger.debug('Debug message'); // Won't show
  registryLogger.info('Info message');   // Won't show
  registryLogger.warn('Warning message'); // Will show
  registryLogger.error('Error message');  // Will show
  
  // Enable debug logs for a specific category
  enableCategory(LogCategory.REGISTRY, LogLevel.DEBUG);
  
  registryLogger.debug('Now debug will show for Registry');  // Will show
  componentLogger.debug('But not for Components');          // Won't show
}

// Example 4: Custom formatting configuration
export function formattingExample() {
  console.log('\n--- Custom log formatting ---');
  
  // Configure custom log formatting
  configureLogging({
    showTimestamps: true,
    useColors: true,
  });
  
  enableAllLogs();
  
  registryLogger.info('Logs now include timestamps');
  registryLogger.error('Error messages are highlighted');
}

// Example 5: Disabling logs for production
export function productionExample() {
  console.log('\n--- Production configuration ---');
  
  // In production, you might want to:
  configureLogging({
    globalLevel: LogLevel.ERROR, // Only show errors
    useColors: false,            // Disable colors for log aggregation systems
  });
  
  // Or completely disable logs:
  // disableAllLogs();
  
  registryLogger.info('This info log will not appear');
  registryLogger.error('But errors will still show');
}

// Run all examples
export function runAllExamples() {
  basicLoggerExample();
  registryOnlyExample();
  logLevelsExample();
  formattingExample();
  productionExample();
  
  // Reset logging configuration at the end
  enableAllLogs();
}

// If this file is executed directly
if (require.main === module) {
  runAllExamples();
}