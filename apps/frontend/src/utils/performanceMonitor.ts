/**
 * Performance monitoring utilities for the application
 * 
 * This module provides basic performance monitoring capabilities,
 * particularly for font loading and rendering metrics.
 */

// Store metrics in memory
const metrics: Record<string, number[]> = {};
const fontMetrics: Record<string, { loadTime: number, uses: number }> = {};

/**
 * Record a metric value under a specific name
 * 
 * @param name The metric name
 * @param value The value to record
 */
export function recordMetric(name: string, value: number): void {
  if (!metrics[name]) {
    metrics[name] = [];
  }
  metrics[name].push(value);
  
  // If this is a font metric, also record in fontMetrics
  if (name.startsWith('Font')) {
    const fontName = name.split(':')[1];
    if (fontName) {
      recordFontMetric(fontName, value);
    }
  }
}

/**
 * Record a font loading metric
 * 
 * @param fontName The name of the font
 * @param loadTime The time it took to load in milliseconds
 */
export function recordFontMetric(fontName: string, loadTime: number): void {
  if (!fontMetrics[fontName]) {
    fontMetrics[fontName] = { loadTime, uses: 1 };
  } else {
    // Average the load times
    const current = fontMetrics[fontName];
    const newLoadTime = (current.loadTime * current.uses + loadTime) / (current.uses + 1);
    fontMetrics[fontName] = {
      loadTime: newLoadTime,
      uses: current.uses + 1
    };
  }
}

/**
 * Get all recorded metrics
 */
export function getMetrics(): Record<string, number[]> {
  return { ...metrics };
}

/**
 * Get font loading metrics
 */
export function getFontMetrics(): Record<string, { loadTime: number, uses: number }> {
  return { ...fontMetrics };
}

/**
 * Log font metrics that exceed a threshold
 * 
 * @param thresholdMs Only log fonts that took longer than this to load
 */
export function logFontMetrics(thresholdMs: number = 0): void {
  const slowFonts = Object.entries(fontMetrics)
    .filter(([_fontName, { loadTime }]) => loadTime > thresholdMs)
    .sort(([_fontA, a], [_fontB, b]) => b.loadTime - a.loadTime);
  
  if (slowFonts.length === 0) {
    console.log('No slow fonts detected.');
    return;
  }
  
  console.group('Font Loading Performance');
  console.log(`Found ${slowFonts.length} fonts that took longer than ${thresholdMs}ms to load:`);
  
  slowFonts.forEach(([fontName, { loadTime, uses }]) => {
    console.log(`${fontName}: ${loadTime.toFixed(2)}ms (used ${uses} times)`);
  });
  
  console.groupEnd();
}

/**
 * Clear all recorded metrics
 */
export function clearMetrics(): void {
  Object.keys(metrics).forEach(key => {
    metrics[key] = [];
  });
  
  Object.keys(fontMetrics).forEach(key => {
    delete fontMetrics[key];
  });
}