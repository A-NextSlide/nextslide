/**
 * PLG / Growth utilities for native app engagement.
 * These handle platform-specific growth mechanics like
 * install prompts, rating requests, and engagement tracking.
 */

import { BROWSER } from "./browser";
import { nativeBridge } from "./nativeBridge";

// ============================================================
// App install banner (mobile web → app store)
// ============================================================

const INSTALL_BANNER_DISMISSED_KEY = "ns:install-banner-dismissed";
const INSTALL_BANNER_COOLDOWN_DAYS = 14;

/** Check if we should show the app install banner on mobile web */
export function shouldShowInstallBanner(): boolean {
  // Only show on mobile web (not in native apps)
  if (BROWSER.isNativeApp || !BROWSER.isMobile) return false;

  const dismissed = localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY);
  if (dismissed) {
    const dismissedAt = parseInt(dismissed, 10);
    const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    if (daysSince < INSTALL_BANNER_COOLDOWN_DAYS) return false;
  }

  return true;
}

/** Mark the install banner as dismissed */
export function dismissInstallBanner() {
  localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, Date.now().toString());
}

/** Get the app store URL based on platform */
export function getAppStoreUrl(): string {
  if (BROWSER.isIOS) {
    return "https://apps.apple.com/app/nextslide/id0000000000"; // TODO: Replace with actual App Store ID
  }
  return "https://play.google.com/store/apps/details?id=ai.nextslide.mobile";
}

// ============================================================
// App rating prompt
// ============================================================

const RATING_PROMPT_KEY = "ns:rating-prompt";
const RATING_PROMPT_THRESHOLD = 5; // Show after N decks created

interface RatingState {
  prompted: boolean;
  decksCreated: number;
  lastPromptedAt?: number;
}

function getRatingState(): RatingState {
  try {
    const raw = localStorage.getItem(RATING_PROMPT_KEY);
    return raw ? JSON.parse(raw) : { prompted: false, decksCreated: 0 };
  } catch {
    return { prompted: false, decksCreated: 0 };
  }
}

function setRatingState(state: RatingState) {
  localStorage.setItem(RATING_PROMPT_KEY, JSON.stringify(state));
}

/** Track a deck creation for rating prompt logic */
export function trackDeckCreated() {
  if (!BROWSER.isNativeApp) return;

  const state = getRatingState();
  state.decksCreated++;
  setRatingState(state);
}

/** Check if we should prompt the user for a rating */
export function shouldPromptForRating(): boolean {
  if (!BROWSER.isMobileApp) return false;

  const state = getRatingState();
  if (state.prompted) return false;
  return state.decksCreated >= RATING_PROMPT_THRESHOLD;
}

/** Mark rating as prompted */
export function markRatingPrompted() {
  const state = getRatingState();
  state.prompted = true;
  state.lastPromptedAt = Date.now();
  setRatingState(state);
}

// ============================================================
// Notification permission prompt
// ============================================================

const NOTIFICATION_PROMPT_KEY = "ns:notification-prompt";
const NOTIFICATION_PROMPT_DELAY_DECKS = 2;

/** Check if we should prompt for notification permissions */
export function shouldPromptForNotifications(): boolean {
  if (!BROWSER.isNativeApp) return false;

  const dismissed = localStorage.getItem(NOTIFICATION_PROMPT_KEY);
  if (dismissed) return false;

  const state = getRatingState();
  return state.decksCreated >= NOTIFICATION_PROMPT_DELAY_DECKS;
}

/** Dismiss the notification prompt */
export function dismissNotificationPrompt() {
  localStorage.setItem(NOTIFICATION_PROMPT_KEY, "true");
}

/** Request notification permissions through the native bridge */
export function requestNativeNotifications() {
  nativeBridge.requestNotificationPermission();
  dismissNotificationPrompt();
}

// ============================================================
// Native engagement analytics
// ============================================================

/** Track an engagement event in the native app */
export function trackNativeEvent(event: string, properties?: Record<string, unknown>) {
  if (!BROWSER.isMobileApp) return;

  // Send via bridge to native analytics
  nativeBridge.haptic("selection");
  // The web app can also track this server-side
}
