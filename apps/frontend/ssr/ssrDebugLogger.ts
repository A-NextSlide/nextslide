/**
 * SSR Debug Logger
 * 
 * A utility for logging debug information during server-side rendering.
 * Works in both server and client environments.
 */

// Define the debug log entry structure
interface SSRDebugLogEntry {
  timestamp: string;
  component: string;
  message: string;
  data?: any;
}

// Setup global storage for debug logs
declare global {
  var __SSR_DEBUG_LOGS: SSRDebugLogEntry[];
}

// Initialize the global log array if it doesn't exist
if (typeof global !== 'undefined' && !global.__SSR_DEBUG_LOGS) {
  global.__SSR_DEBUG_LOGS = [];
}

// Flag to control logging - disable by default, enable with environment variable
let loggingEnabled = true;
// Check for environment variables in a way that's safe for both browser and Node
if (typeof process !== 'undefined' && process.env && process.env.ENABLE_SSR_DEBUG === 'true') {
  loggingEnabled = true;
}

/**
 * Enable or disable debug logging
 */
export function setLoggingEnabled(enabled: boolean): void {
  loggingEnabled = enabled;
}

/**
 * Log a debug message that will be captured in both console and global storage
 * 
 * @param component Name of the component or module doing the logging
 * @param message Debug message
 * @param data Optional data to include in the log
 */
export function ssrDebugLog(component: string, message: string, data?: any): void {
  // Skip logging if disabled
  if (!loggingEnabled) {
    return;
  }
  
  // Only add to logs but don't print to console in normal operation
  // This keeps verbose logs contained to the debug system
  
  // Capture to global array for later extraction
  if (typeof global !== 'undefined' && global.__SSR_DEBUG_LOGS) {
    try {
      // Create a safe serializable copy of the data
      let safeData = undefined;
      if (data !== undefined) {
        try {
          // Try to create a safe serializable copy of complex objects
          safeData = JSON.parse(JSON.stringify(data));
        } catch (e) {
          // If serialization fails, use string representation
          safeData = String(data);
        }
      }
      
      global.__SSR_DEBUG_LOGS.push({
        timestamp: new Date().toISOString(),
        component,
        message,
        data: safeData
      });
    } catch (error) {
      // Don't log in normal operation
    }
  }
}

/**
 * Get all captured debug logs
 */
export function getSSRDebugLogs(): SSRDebugLogEntry[] {
  if (typeof global !== 'undefined' && global.__SSR_DEBUG_LOGS) {
    return [...global.__SSR_DEBUG_LOGS];
  }
  return [];
}

/**
 * Clear all captured debug logs
 */
export function clearSSRDebugLogs(): void {
  if (typeof global !== 'undefined' && global.__SSR_DEBUG_LOGS) {
    global.__SSR_DEBUG_LOGS = [];
  }
}

/**
 * Print all captured debug logs to console
 */
export function printSSRDebugLogs(): void {
  const logs = getSSRDebugLogs();
  console.log('\n===== SSR DEBUG LOGS =====');
  console.log(`Total entries: ${logs.length}`);
  
  if (logs.length > 0) {
    logs.forEach((entry, index) => {
      console.log(`\n[${index + 1}] ${entry.timestamp} - ${entry.component}`);
      console.log(`Message: ${entry.message}`);
      if (entry.data !== undefined) {
        console.log('Data:', entry.data);
      }
    });
  }
  console.log('\n=========================\n');
}

export default {
  log: ssrDebugLog,
  getLogs: getSSRDebugLogs,
  clearLogs: clearSSRDebugLogs,
  printLogs: printSSRDebugLogs,
  setEnabled: setLoggingEnabled
}; 