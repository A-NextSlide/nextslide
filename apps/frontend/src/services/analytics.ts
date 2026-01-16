/**
 * PostHog Analytics Service
 *
 * Centralized analytics tracking for the NextSlide application.
 * Wraps PostHog SDK with type-safe event tracking and user identification.
 */

import posthog from 'posthog-js';

// Environment configuration
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
// Use backend proxy to bypass ad blockers - falls back to direct if not configured
const API_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || '';
const POSTHOG_HOST = API_URL ? `${API_URL}/ingest` : (import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com');
const IS_PRODUCTION = import.meta.env.PROD;

// Track initialization state
let isInitialized = false;

/**
 * Initialize PostHog analytics
 * Should be called once at app startup (main.tsx)
 */
export function initAnalytics(): void {
  if (isInitialized) return;

  if (!POSTHOG_KEY) {
    if (IS_PRODUCTION) {
      console.warn('[Analytics] PostHog key not configured');
    }
    return;
  }

  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false, // Disable autocapture to reduce noise
      persistence: 'localStorage',
      disable_session_recording: !IS_PRODUCTION,
    });

    isInitialized = true;
    console.log('[Analytics] PostHog initialized');
  } catch (error) {
    console.error('[Analytics] Failed to initialize PostHog:', error);
  }
}

/**
 * Identify a user after authentication
 */
export function identifyUser(
  userId: string,
  properties?: {
    email?: string;
    name?: string;
    plan?: 'free' | 'pro' | 'enterprise';
    createdAt?: string;
    [key: string]: any;
  }
): void {
  if (!isInitialized) return;

  try {
    posthog.identify(userId, {
      email: properties?.email,
      name: properties?.name,
      plan: properties?.plan,
      created_at: properties?.createdAt,
      ...properties,
    });
  } catch (error) {
    console.error('[Analytics] Failed to identify user:', error);
  }
}

/**
 * Reset user identification (on logout)
 */
export function resetUser(): void {
  if (!isInitialized) return;

  try {
    posthog.reset();
  } catch (error) {
    console.error('[Analytics] Failed to reset user:', error);
  }
}

/**
 * Track a custom event
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, any>
): void {
  if (!isInitialized) return;

  try {
    posthog.capture(eventName, properties);
  } catch (error) {
    console.error('[Analytics] Failed to track event:', error);
  }
}

// ============================================================================
// Typed Event Tracking Functions
// These provide type-safe wrappers for common events
// ============================================================================

// --- Authentication Events ---

export function trackSignUp(method: 'email' | 'google' | 'magic_link'): void {
  trackEvent('user_signed_up', { method });
}

export function trackSignIn(method: 'email' | 'google' | 'magic_link'): void {
  trackEvent('user_signed_in', { method });
}

export function trackSignOut(): void {
  trackEvent('user_signed_out');
}

// --- Outline Generation Events ---

export function trackOutlineGenerationStarted(properties: {
  detailLevel: string;
  slideCount?: number;
  hasAttachments?: boolean;
  hasUrl?: boolean;
  model?: string;
}): void {
  trackEvent('outline_generation_started', properties);
}

export function trackOutlineGenerationCompleted(properties: {
  detailLevel: string;
  slideCount: number;
  durationMs: number;
  model?: string;
}): void {
  trackEvent('outline_generation_completed', properties);
}

export function trackOutlineGenerationFailed(properties: {
  error: string;
  detailLevel?: string;
}): void {
  trackEvent('outline_generation_failed', properties);
}

// --- Deck Events ---

export function trackDeckCreated(properties: {
  deckId: string;
  slideCount: number;
  source: 'outline' | 'import' | 'template' | 'blank';
  durationMs?: number;
}): void {
  trackEvent('deck_created', properties);
}

export function trackDeckOpened(properties: {
  deckId: string;
  slideCount: number;
  isOwner: boolean;
}): void {
  trackEvent('deck_opened', properties);
}

export function trackDeckDeleted(deckId: string): void {
  trackEvent('deck_deleted', { deck_id: deckId });
}

export function trackDeckDuplicated(properties: {
  sourceDeckId: string;
  newDeckId: string;
}): void {
  trackEvent('deck_duplicated', properties);
}

export function trackDeckShared(properties: {
  deckId: string;
  shareType: 'link' | 'team' | 'community';
}): void {
  trackEvent('deck_shared', properties);
}

export function trackDeckExported(properties: {
  deckId: string;
  format: 'pptx' | 'pdf' | 'png' | 'json' | 'html' | 'google_slides';
  slideCount: number;
}): void {
  trackEvent('deck_exported', properties);
}

// --- Slide Events ---

export function trackSlideCreated(properties: {
  deckId: string;
  slideIndex: number;
  method: 'manual' | 'ai' | 'duplicate';
}): void {
  trackEvent('slide_created', properties);
}

export function trackSlideDeleted(properties: {
  deckId: string;
  slideIndex: number;
}): void {
  trackEvent('slide_deleted', properties);
}

// --- Component Events ---

export function trackComponentAdded(properties: {
  deckId: string;
  componentType: string;
  method: 'drag' | 'click' | 'ai';
}): void {
  trackEvent('component_added', properties);
}

// --- Media Events ---

export function trackMediaSearched(properties: {
  query: string;
  source: 'unsplash' | 'pexels' | 'serpapi' | 'upload';
  resultCount: number;
}): void {
  trackEvent('media_searched', properties);
}

export function trackMediaSelected(properties: {
  source: 'unsplash' | 'pexels' | 'serpapi' | 'upload';
  mediaType: 'image' | 'video' | 'gif';
}): void {
  trackEvent('media_selected', properties);
}

// --- Billing Events ---

export function trackUpgradePromptShown(properties: {
  trigger: 'credits_low' | 'feature_gate' | 'manual';
  currentPlan: 'free' | 'pro' | 'enterprise';
  creditsRemaining?: number;
}): void {
  trackEvent('upgrade_prompt_shown', properties);
}

export function trackPlanSelected(plan: 'free' | 'pro' | 'enterprise'): void {
  trackEvent('plan_selected', { plan });
}

export function trackPaymentCompleted(properties: {
  plan: 'pro' | 'enterprise';
  amount: number;
  currency: string;
}): void {
  trackEvent('payment_completed', properties);
}

// --- Feature Usage Events ---

export function trackFeatureUsed(properties: {
  feature: string;
  context?: string;
}): void {
  trackEvent('feature_used', properties);
}

export function trackAIChatMessage(properties: {
  messageType: 'user' | 'assistant';
  deckId?: string;
  slideId?: string;
}): void {
  trackEvent('ai_chat_message', properties);
}

// --- Error Events ---

export function trackError(properties: {
  error: string;
  context: string;
  fatal?: boolean;
}): void {
  trackEvent('error_occurred', properties);
}

// --- Page View Events ---

export function trackPageView(pageName: string, properties?: Record<string, any>): void {
  trackEvent('$pageview', {
    page_name: pageName,
    ...properties,
  });
}

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flagKey: string): boolean {
  if (!isInitialized) return false;

  try {
    return posthog.isFeatureEnabled(flagKey) ?? false;
  } catch {
    return false;
  }
}

/**
 * Get feature flag payload
 */
export function getFeatureFlagPayload(flagKey: string): any {
  if (!isInitialized) return null;

  try {
    return posthog.getFeatureFlagPayload(flagKey);
  } catch {
    return null;
  }
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Get the PostHog instance for advanced usage
 */
export function getPostHog(): typeof posthog | null {
  if (!isInitialized) return null;
  return posthog;
}

/**
 * Check if analytics is initialized and active
 */
export function isAnalyticsActive(): boolean {
  return isInitialized && !posthog.has_opted_out_capturing();
}

// Default export for convenience
export default {
  init: initAnalytics,
  identify: identifyUser,
  reset: resetUser,
  track: trackEvent,
  isFeatureEnabled,
  getFeatureFlagPayload,
};
