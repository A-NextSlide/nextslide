/**
 * Utility functions for conditional logging during deck generation.
 * Error suppression has been removed — real errors now propagate to
 * the console and Sentry so crashes are visible.
 */

/**
 * Check if the deck is currently generating.
 * Used to suppress certain warnings during deck generation.
 */
export function isDeckGenerating(): boolean {
  if (typeof window === 'undefined') return false;

  const deckStatus = (window as any).__deckStatus;
  return deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
}

/**
 * Log a warning only if the deck is not generating.
 * Helps reduce console noise during deck generation.
 */
export function warnIfNotGenerating(message: string, ...args: any[]): void {
  if (!isDeckGenerating()) {
    console.warn(message, ...args);
  }
}

/**
 * Log an error only if the deck is not generating.
 * Helps reduce console noise during deck generation.
 */
export function errorIfNotGenerating(message: string, ...args: any[]): void {
  if (!isDeckGenerating()) {
    console.error(message, ...args);
  }
}
