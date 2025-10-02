/**
 * Console Suppressor Utility
 * 
 * This utility suppresses console errors from external scripts that we can't control,
 * particularly YouTube embeds and other third-party services that conflict with ad blockers.
 * 
 * Only suppresses errors that match specific patterns to avoid hiding important errors.
 */

// Patterns to suppress - these are from external scripts we can't control
const suppressPatterns = [
  // YouTube and Google Play errors from ad blockers
  /ERR_BLOCKED_BY_CLIENT/,
  /play\.google\.com.*net::ERR_BLOCKED_BY_CLIENT/,
  /youtube\.com.*net::ERR_BLOCKED_BY_CLIENT/,
  /www\.youtube\.com\/youtubei.*net::ERR_BLOCKED_BY_CLIENT/,
  /www\.youtube\.com\/generate_204/,
  
  // YouTube specific file patterns
  /frame_ant\.js/,
  /base\.js.*ERR_BLOCKED_BY_CLIENT/,
  /www-embed-player\.js.*ERR_BLOCKED_BY_CLIENT/,
  /base\.js:\d+\s+POST\s+https:\/\/play\.google\.com/,
  /frame_ant\.js:\d+\s+POST\s+https:\/\/www\.youtube\.com/,
  
  // Google Analytics and tracking
  /google-analytics/,
  /doubleclick\.net/,
  /googletagmanager/,
  
  // Common ad blocker patterns
  /Failed to load resource.*blocked/i,
  /blocked by the client/i,
  
  // YouTube specific warnings
  /Download the React DevTools/,  // This is just a suggestion, not an error
  
  // Websocket errors (from YJS when disconnecting)
  /WebSocket is closed before the connection is established/,
  
  // Vite/React specific
  /\[vite\] connecting/,
  /\[vite\] connected/,
  
  // YouTube player specific
  /4OOpnSldGpU/,  // YouTube video ID in stack traces
  /VM\d+:\d+/,    // Virtual machine references from YouTube
  
  // Google Play log patterns
  /hasfast=true.*SAPISIDHASH/,
  /SAPISID3PHASH/,
  
  // Stack trace patterns from YouTube
  /@\s+base\.js/,
  /@\s+www-embed-player\.js/,
  /@\s+frame_ant\.js/,
  
  // General YouTube iframe errors
  /www\.youtube\.com.*iframe/i,
  /youtube\.com.*embed/i,
];

// Track custom component errors to prevent spam
const customComponentErrorCache = new Map<string, number>();
const CUSTOM_COMPONENT_ERROR_THROTTLE = 5000; // 5 seconds

// Function to check if error is from external source
function isExternalError(message: string, stackTrace?: string): boolean {
  // Check if this is a custom component error that's being spammed
  if (message.includes('Custom component render error:') && 
      message.includes('Rendered more hooks than during the previous render')) {
    const now = Date.now();
    const lastLogged = customComponentErrorCache.get(message) || 0;
    
    if (now - lastLogged < CUSTOM_COMPONENT_ERROR_THROTTLE) {
      return true; // Suppress it
    } else {
      customComponentErrorCache.set(message, now);
      return false; // Allow it through this time
    }
  }
  
  // Check message
  if (suppressPatterns.some(pattern => pattern.test(message))) {
    return true;
  }
  
  // Check stack trace if available
  if (stackTrace && suppressPatterns.some(pattern => pattern.test(stackTrace))) {
    return true;
  }
  
  // Check for YouTube/Google domains in the message
  const externalDomains = [
    'youtube.com',
    'google.com',
    'googleapis.com',
    'googlevideo.com',
    'ytimg.com',
    'googletagmanager.com',
    'google-analytics.com',
    'doubleclick.net'
  ];
  
  return externalDomains.some(domain => message.includes(domain));
}

// Function to suppress only external errors (used in development)
function suppressExternalErrorsOnly() {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  // Override console methods to filter external errors
  console.error = function(...args: any[]) {
    const message = args.join(' ');
    const stack = new Error().stack || '';
    
    if (!isExternalError(message, stack)) {
      originalError.apply(console, args);
    }
  };
  
  console.warn = function(...args: any[]) {
    // Always pass through all warnings in development
    // We're only filtering errors and logs
    originalWarn.apply(console, args);
  };
  
  // Also filter console.log for network errors that show up there
  console.log = function(...args: any[]) {
    const message = args.join(' ');
    
    // Skip if it looks like a network error from YouTube/Google
    if (message.includes('net::ERR_BLOCKED_BY_CLIENT') || 
        message.includes('GET https://www.youtube.com') ||
        message.includes('POST https://www.youtube.com') ||
        message.includes('POST https://play.google.com')) {
      return;
    }
    
    originalLog.apply(console, args);
  };
}

export function initializeConsoleSuppressor() {
  // In development, only suppress external errors
  if (import.meta.env.DEV) {
    suppressExternalErrorsOnly();
    return;
  }

  // Store original console methods
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;

  // Override console.error
  console.error = function(...args: any[]) {
    const message = args.join(' ');
    const stack = new Error().stack || '';
    
    if (!isExternalError(message, stack)) {
      originalError.apply(console, args);
    }
  };

  // Override console.warn
  console.warn = function(...args: any[]) {
    // Always pass through all warnings in development
    // We're only filtering errors and logs
    originalWarn.apply(console, args);
  };
  
  // Override console.log to filter network errors
  console.log = function(...args: any[]) {
    const message = args.join(' ');
    
    if (!isExternalError(message)) {
      originalLog.apply(console, args);
    }
  };

  // Also suppress network errors shown in DevTools
  if (window.addEventListener) {
    window.addEventListener('error', (event) => {
      if (event.message && isExternalError(event.message, event.error?.stack)) {
        event.preventDefault();
        return;
      }
      
      // Also check the filename for external scripts
      if (event.filename && (
        event.filename.includes('youtube.com') ||
        event.filename.includes('google.com') ||
        event.filename.includes('base.js') ||
        event.filename.includes('www-embed-player.js') ||
        event.filename.includes('frame_ant.js')
      )) {
        event.preventDefault();
      }
    }, true);
    
    // Intercept unhandled promise rejections from external sources
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason && (
        event.reason.toString().includes('ERR_BLOCKED_BY_CLIENT') ||
        isExternalError(event.reason.toString(), event.reason.stack)
      )) {
        event.preventDefault();
      }
    });
  }
}

// Auto-initialize when imported
if (typeof window !== 'undefined') {
  initializeConsoleSuppressor();
} 