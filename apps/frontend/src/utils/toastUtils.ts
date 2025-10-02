import { toast } from '@/hooks/use-toast';

/**
 * Controls when toasts are shown for element and slide updates
 * Uses a simple debounce mechanism to avoid showing too many toasts
 */

// Keep track of the last time a toast was shown for each action type
const lastToastTime: Record<string, number> = {};
const TOAST_DEBOUNCE_MS = 2000; // Only show a toast every 2 seconds for the same action

// Keep track of which toasts are currently pending
const pendingToasts: Record<string, number> = {};

/**
 * Show a toast message, but only if a similar toast hasn't been shown recently
 */
export const showDebouncedToast = (
  type: string,
  title: string,
  description: string,
  variant?: 'default' | 'destructive'
): void => {
  const now = Date.now();
  const lastTime = lastToastTime[type] || 0;
  
  // Cancel any pending toasts of the same type
  if (pendingToasts[type]) {
    clearTimeout(pendingToasts[type]);
    delete pendingToasts[type];
  }
  
  // Only show the toast if it's been more than TOAST_DEBOUNCE_MS since the last one of this type
  if (now - lastTime > TOAST_DEBOUNCE_MS) {
    // Schedule toast to show after a short delay
    pendingToasts[type] = window.setTimeout(() => {
      toast({
        title,
        description,
        variant,
      });
      
      // Update the last toast time for this type
      lastToastTime[type] = Date.now();
      delete pendingToasts[type];
    }, 300); // Short delay to collect multiple rapid events
  }
};
