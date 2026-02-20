/**
 * Console Suppressor Utility
 *
 * Suppresses console noise from external third-party scripts we can't control
 * (YouTube embeds, Google Analytics, ad-blocker errors).
 *
 * App-specific suppression has been removed so real errors propagate to Sentry.
 */

// Patterns to suppress — external scripts only
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

  // YouTube player specific
  /4OOpnSldGpU/,
  /VM\d+:\d+/,

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

function isExternalError(message: string, stackTrace?: string): boolean {
  // Throttle spammy custom component hook errors
  if (message.includes('Custom component render error:') &&
      message.includes('Rendered more hooks than during the previous render')) {
    const now = Date.now();
    const lastLogged = customComponentErrorCache.get(message) || 0;
    if (now - lastLogged < CUSTOM_COMPONENT_ERROR_THROTTLE) {
      return true; // Suppress
    }
    customComponentErrorCache.set(message, now);
    return false;
  }

  if (suppressPatterns.some(pattern => pattern.test(message))) {
    return true;
  }

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
    'doubleclick.net',
  ];

  return externalDomains.some(domain => message.includes(domain));
}

export function initializeConsoleSuppressor() {
  const originalError = console.error;
  const originalLog = console.log;

  // Filter console.error for external noise
  console.error = function (...args: any[]) {
    const message = args.join(' ');
    const stack = new Error().stack || '';
    if (!isExternalError(message, stack)) {
      originalError.apply(console, args);
    }
  };

  // Filter console.log for network errors from YouTube/Google
  console.log = function (...args: any[]) {
    const message = args.join(' ');
    if (
      message.includes('net::ERR_BLOCKED_BY_CLIENT') ||
      message.includes('GET https://www.youtube.com') ||
      message.includes('POST https://www.youtube.com') ||
      message.includes('POST https://play.google.com')
    ) {
      return;
    }
    originalLog.apply(console, args);
  };

  // Let errors propagate to Sentry — no preventDefault
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('error', (event) => {
      // Only suppress errors from external scripts (by filename)
      if (
        event.filename &&
        (event.filename.includes('youtube.com') ||
          event.filename.includes('google.com') ||
          event.filename.includes('base.js') ||
          event.filename.includes('www-embed-player.js') ||
          event.filename.includes('frame_ant.js'))
      ) {
        event.preventDefault();
      }
      // All other errors: let them propagate to Sentry
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
      if (
        event.reason &&
        (event.reason.toString().includes('ERR_BLOCKED_BY_CLIENT') ||
          isExternalError(event.reason.toString(), event.reason.stack))
      ) {
        event.preventDefault();
      }
      // All other rejections: let them propagate to Sentry
    });
  }
}

// Auto-initialize when imported
if (typeof window !== 'undefined') {
  initializeConsoleSuppressor();
}
