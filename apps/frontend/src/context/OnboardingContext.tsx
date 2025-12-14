/**
 * Onboarding Context
 *
 * Provides onboarding state and methods throughout the app.
 * Tracks what the user has seen/completed to avoid showing
 * tutorials, welcome modals, and confirmations repeatedly.
 *
 * Flags tracked:
 * - welcome_shown: First-time welcome modal
 * - tutorial_completed: Feature walkthrough/tutorial
 * - overage_confirmed: User has acknowledged overage billing (only ask once)
 * - feature_hints_dismissed: List of feature hints the user has dismissed
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authService } from '@/services/authService';
import { useAuth } from '@/context/SupabaseAuthContext';

export interface OnboardingState {
  welcome_shown: boolean;
  presentations_created: number;
  show_ai_hints: boolean;
  tutorial_completed: boolean;
  tutorial_views_count: number;
  overage_confirmed: boolean;
  feature_hints_dismissed: string[];
}

interface OnboardingContextType {
  /** Current onboarding state */
  state: OnboardingState | null;
  /** Whether the onboarding state is loading */
  loading: boolean;
  /** Refresh onboarding state from server */
  refreshState: () => Promise<void>;
  /** Mark welcome modal as shown (won't show again) */
  markWelcomeShown: () => Promise<void>;
  /** Mark tutorial as completed */
  markTutorialCompleted: () => Promise<void>;
  /** Increment tutorial views count (called when tutorial is shown) */
  incrementTutorialViews: () => Promise<void>;
  /** Mark overage confirmation as acknowledged (won't ask again) */
  markOverageConfirmed: () => Promise<void>;
  /** Dismiss a feature hint by ID */
  dismissFeatureHint: (hintId: string) => Promise<void>;
  /** Check if a feature hint has been dismissed */
  isHintDismissed: (hintId: string) => boolean;
  /** Should show welcome modal */
  shouldShowWelcome: boolean;
  /** Should show tutorial (shown first 2 times per user) */
  shouldShowTutorial: boolean;
  /** Should show AI hints (first 2 presentations) */
  shouldShowAiHints: boolean;
  /** Should ask for overage confirmation (only once) */
  shouldAskOverageConfirmation: boolean;
}

const defaultState: OnboardingState = {
  welcome_shown: false,
  presentations_created: 0,
  show_ai_hints: true,
  tutorial_completed: false,
  tutorial_views_count: 0,
  overage_confirmed: false,
  feature_hints_dismissed: [],
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshState = useCallback(async () => {
    if (authLoading || !user) {
      setState(null);
      return;
    }

    setLoading(true);
    try {
      const onboardingState = await authService.getOnboardingState();
      if (onboardingState) {
        setState({
          welcome_shown: onboardingState.welcome_shown ?? false,
          presentations_created: onboardingState.presentations_created ?? 0,
          show_ai_hints: onboardingState.show_ai_hints ?? true,
          tutorial_completed: onboardingState.tutorial_completed ?? false,
          tutorial_views_count: onboardingState.tutorial_views_count ?? 0,
          overage_confirmed: onboardingState.overage_confirmed ?? false,
          feature_hints_dismissed: Array.isArray(onboardingState.feature_hints_dismissed)
            ? onboardingState.feature_hints_dismissed
            : [],
        });
      } else {
        setState(defaultState);
      }
    } catch (error) {
      console.error('[OnboardingContext] Error fetching onboarding state:', error);
      // Always set default state on error to prevent crashes
      setState(defaultState);
    } finally {
      setLoading(false);
    }
  }, [user, authLoading]);

  // Load state when auth is ready
  useEffect(() => {
    if (!authLoading) {
      refreshState();
    }
  }, [refreshState, authLoading]);

  const markWelcomeShown = useCallback(async () => {
    try {
      await authService.markWelcomeShown();
      setState(prev => prev ? { ...prev, welcome_shown: true } : prev);
    } catch (error) {
      console.error('[OnboardingContext] Error marking welcome shown:', error);
    }
  }, []);

  const markTutorialCompleted = useCallback(async () => {
    try {
      await authService.markOnboardingFlag('tutorial_completed');
      setState(prev => prev ? { ...prev, tutorial_completed: true } : prev);
    } catch (error) {
      console.error('[OnboardingContext] Error marking tutorial completed:', error);
    }
  }, []);

  const incrementTutorialViews = useCallback(async () => {
    try {
      const newCount = await authService.incrementTutorialViews();
      setState(prev => prev ? { ...prev, tutorial_views_count: newCount } : prev);
    } catch (error) {
      console.error('[OnboardingContext] Error incrementing tutorial views:', error);
    }
  }, []);

  const markOverageConfirmed = useCallback(async () => {
    try {
      await authService.markOnboardingFlag('overage_confirmed');
      setState(prev => prev ? { ...prev, overage_confirmed: true } : prev);
    } catch (error) {
      console.error('[OnboardingContext] Error marking overage confirmed:', error);
    }
  }, []);

  const dismissFeatureHint = useCallback(async (hintId: string) => {
    try {
      await authService.dismissFeatureHint(hintId);
      setState(prev => prev ? {
        ...prev,
        feature_hints_dismissed: [...prev.feature_hints_dismissed, hintId]
      } : prev);
    } catch (error) {
      console.error('[OnboardingContext] Error dismissing feature hint:', error);
    }
  }, []);

  const isHintDismissed = useCallback((hintId: string) => {
    return state?.feature_hints_dismissed.includes(hintId) ?? false;
  }, [state?.feature_hints_dismissed]);

  // Computed properties for convenience
  // IMPORTANT: Only return true AFTER state is loaded (not null) and the flag is false
  // This prevents showing modals before we've confirmed the user hasn't seen them
  const shouldShowWelcome = state !== null && !state.welcome_shown;
  // Show tutorial if user has seen it fewer than 2 times
  const shouldShowTutorial = state !== null && state.tutorial_views_count < 2;
  const shouldShowAiHints = state?.show_ai_hints ?? false;
  const shouldAskOverageConfirmation = state !== null && !state.overage_confirmed;

  return (
    <OnboardingContext.Provider
      value={{
        state,
        loading,
        refreshState,
        markWelcomeShown,
        markTutorialCompleted,
        incrementTutorialViews,
        markOverageConfirmed,
        dismissFeatureHint,
        isHintDismissed,
        shouldShowWelcome,
        shouldShowTutorial,
        shouldShowAiHints,
        shouldAskOverageConfirmation,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

/**
 * Hook for checking if a specific feature hint should be shown
 * Returns true if the hint hasn't been dismissed yet
 */
export function useFeatureHint(hintId: string) {
  const { isHintDismissed, dismissFeatureHint, state } = useOnboarding();

  const shouldShow = !isHintDismissed(hintId);
  const dismiss = useCallback(() => dismissFeatureHint(hintId), [dismissFeatureHint, hintId]);

  return { shouldShow, dismiss, isLoading: state === null };
}
