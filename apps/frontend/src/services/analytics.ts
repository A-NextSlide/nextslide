/**
 * PostHog Analytics Service
 *
 * Centralized analytics tracking for the NextSlide application.
 * Wraps PostHog SDK with type-safe event tracking and user identification.
 */

import posthog from 'posthog-js';

// Environment configuration
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
// Use PostHog directly - proxy can be configured via VITE_POSTHOG_HOST if needed
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
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
      person_profiles: 'always', // Create profiles for all users including anonymous
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false, // Disable autocapture to reduce noise
      persistence: 'localStorage',
      // Session recording configuration - always enabled
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: false,
        maskInputOptions: {
          password: true, // Only mask password fields
        },
      },
      loaded: (ph) => {
        // Expose PostHog to window for debugging
        (window as any).posthog = ph;

        // Start session recording explicitly
        ph.startSessionRecording();

        console.log('[Analytics] PostHog loaded, starting session recording...');

        // Check status after decide call completes (delayed check)
        setTimeout(() => {
          console.log('[Analytics] Session recording status:', ph.sessionRecordingStarted());
          if (!ph.sessionRecordingStarted()) {
            console.warn('[Analytics] Session recording failed to start - trying again');
            ph.startSessionRecording();
          }
        }, 2000);
      },
    });

    isInitialized = true;
    console.log('[Analytics] PostHog initialized with key:', POSTHOG_KEY?.slice(0, 10) + '...');
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

// --- Referral Events ---

export function trackReferralCodeCopied(code: string): void {
  trackEvent('referral_code_copied', { code });
}

export function trackReferralLinkShared(properties: {
  platform: 'email' | 'twitter' | 'copy';
  code: string;
}): void {
  trackEvent('referral_link_shared', properties);
}

export function trackReferralLandingViewed(code: string): void {
  trackEvent('referral_landing_viewed', { code });
}

export function trackReferralSignupCompleted(code: string): void {
  trackEvent('referral_signup_completed', { code });
}

export function trackReferralPromptShown(variant: string): void {
  trackEvent('referral_prompt_shown', { variant });
}

export function trackReferralPromptDismissed(variant: string): void {
  trackEvent('referral_prompt_dismissed', { variant });
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

// --- Badge Events ---

export function trackBadgeImpression(shareCode: string): void {
  trackEvent('badge_impression', { shareCode });
}

export function trackBadgeClick(shareCode: string): void {
  trackEvent('badge_click', { shareCode });
}

export function trackBadgeLandingViewed(deckCode?: string): void {
  trackEvent('badge_landing_viewed', { deckCode });
}

export function trackBadgeLandingCtaClicked(properties: {
  deckCode?: string;
  method: 'google' | 'create';
}): void {
  trackEvent('badge_landing_cta_clicked', properties);
}

// --- Embed Events ---

export function trackEmbedCodeCopied(properties: {
  shareCode: string;
  size: string;
}): void {
  trackEvent('embed_code_copied', properties);
}

export function trackEmbedViewed(shareCode: string): void {
  trackEvent('embed_viewed', { shareCode });
}

export function trackEmbedSlideNavigated(properties: {
  shareCode: string;
  slideIndex: number;
}): void {
  trackEvent('embed_slide_navigated', properties);
}

// --- Social Sharing Events ---

export function trackSocialShareClicked(platform: 'linkedin' | 'twitter' | 'email' | 'whatsapp' | 'copy_link'): void {
  trackEvent('social_share_clicked', { platform });
}

export function trackSocialShareCompleted(platform: 'linkedin' | 'twitter' | 'email' | 'whatsapp' | 'copy_link'): void {
  trackEvent('social_share_completed', { platform });
}

export function trackShareDialogOpened(properties?: {
  title?: string;
  shareCode?: string;
}): void {
  trackEvent('share_dialog_opened', properties);
}

// --- Showcase Events ---

export function trackShowcaseViewed(properties: {
  category?: string;
  tab: string;
}): void {
  trackEvent('showcase_viewed', properties);
}

export function trackShowcaseUpvoted(deckId: string): void {
  trackEvent('showcase_upvoted', { deckId });
}

export function trackShowcaseRemixed(deckId: string): void {
  trackEvent('showcase_remixed', { deckId });
}

export function trackShowcaseSearch(query: string): void {
  trackEvent('showcase_search', { query });
}

export function trackShowcaseSubmitted(category: string): void {
  trackEvent('showcase_submitted', { category });
}

// --- Gamification Events ---

export function trackBadgeEarned(properties: {
  badgeType: string;
  badgeName: string;
  credits: number;
}): void {
  trackEvent('badge_earned', properties);
}

export function trackStreakUpdated(properties: {
  currentStreak: number;
  isNewDay: boolean;
}): void {
  trackEvent('streak_updated', properties);
}

export function trackStreakRewardClaimed(properties: {
  milestone: number;
  credits: number;
}): void {
  trackEvent('streak_reward_claimed', properties);
}

export function trackLeaderboardViewed(properties: {
  period: string;
  metric: string;
}): void {
  trackEvent('leaderboard_viewed', properties);
}

// --- Analytics Dashboard Events ---

export function trackAnalyticsDashboardViewed(): void {
  trackEvent('analytics_dashboard_viewed');
}

export function trackAnalyticsDeckViewed(deckId: string): void {
  trackEvent('analytics_deck_viewed', { deckId });
}

export function trackAnalyticsPeriodChanged(properties: {
  period: string;
  deckId?: string;
}): void {
  trackEvent('analytics_period_changed', properties);
}

// --- Export Events ---

export function trackLinkedInCarouselExported(properties: {
  format: string;
  slideCount: number;
  deckId: string;
}): void {
  trackEvent('linkedin_carousel_exported', properties);
}

// --- Profile Events ---

export function trackProfileViewed(username: string): void {
  trackEvent('profile_viewed', { username });
}

export function trackProfileFollowed(username: string): void {
  trackEvent('profile_followed', { username });
}

export function trackProfileUnfollowed(username: string): void {
  trackEvent('profile_unfollowed', { username });
}

export function trackProfileUpdated(fields: string[]): void {
  trackEvent('profile_updated', { fields });
}

// --- Landing Page Events ---

export function trackLandingPageViewed(properties: { slug: string; type: 'use_case' | 'industry' }): void {
  trackEvent('landing_page_viewed', properties);
}

export function trackLandingPageCtaClicked(properties: { slug: string; cta: string }): void {
  trackEvent('landing_page_cta_clicked', properties);
}

// --- Team Sharing Events ---

export function trackDeckSharedWithUser(properties: { deckId: string; permission: string }): void {
  trackEvent('deck_shared_with_user', properties);
}

export function trackSharedDeckViewed(properties: { deckId: string; shareId: string }): void {
  trackEvent('shared_deck_viewed', properties);
}

export function trackTeamInvitePromptShown(variant: string): void {
  trackEvent('team_invite_prompt_shown', { variant });
}

export function trackTeamInvitePromptDismissed(variant: string): void {
  trackEvent('team_invite_prompt_dismissed', { variant });
}

export function trackTeamInvitePromptClicked(variant: string): void {
  trackEvent('team_invite_prompt_clicked', { variant });
}

// --- Webpage Publishing Events ---

export function trackWebpagePublished(properties: { deckId: string; slug: string }): void {
  trackEvent('webpage_published', properties);
}

export function trackWebpageViewed(slug: string): void {
  trackEvent('webpage_viewed', { slug });
}

export function trackWebpageLeadCaptured(slug: string): void {
  trackEvent('webpage_lead_captured', { slug });
}

export function trackWebpageScrollDepth(properties: { slug: string; depth: number; totalSections: number }): void {
  trackEvent('webpage_scroll_depth', properties);
}

// --- Enterprise / PQA Events ---

export function trackPqaPromptShown(properties: { domain: string; userCount: number }): void {
  trackEvent('pqa_prompt_shown', properties);
}

export function trackPqaPromptDismissed(properties: { domain: string }): void {
  trackEvent('pqa_prompt_dismissed', properties);
}

export function trackPqaPromptClicked(properties: { domain: string; destination: string }): void {
  trackEvent('pqa_prompt_clicked', properties);
}

export function trackEnterpriseFeatureGated(properties: { feature: string; currentPlan: string }): void {
  trackEvent('enterprise_feature_gated', properties);
}

export function trackEnterpriseUpgradeClicked(properties: { feature: string; currentPlan: string }): void {
  trackEvent('enterprise_upgrade_clicked', properties);
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
