/**
 * Reward Context
 *
 * Global reward system for showing token rewards throughout the app.
 * Can be triggered from anywhere using the useReward hook.
 *
 * Also integrates with the gamification system for badge unlock toasts
 * and streak check-in calls.
 *
 * Usage:
 *   const { showReward, showBadgeUnlock, triggerStreakCheckIn } = useReward();
 *   showReward({
 *     amount: 200,
 *     title: "Welcome Bonus!",
 *     subtitle: "Thanks for joining NextSlide",
 *   });
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import TokenRewardModal, { TokenRewardConfig } from '@/components/common/TokenRewardModal';
import BadgeUnlockToast, { type BadgeUnlockData } from '@/components/gamification/BadgeUnlockToast';
import { gamificationApi, type EarnedBadge } from '@/services/gamificationApi';

interface RewardContextType {
  /** Show a token reward modal */
  showReward: (config: TokenRewardConfig) => void;
  /** Check if a reward is currently showing */
  isShowing: boolean;
  /** Show a badge unlock notification */
  showBadgeUnlock: (badge: BadgeUnlockData) => void;
  /** Trigger a streak check-in (call after deck creation) */
  triggerStreakCheckIn: () => Promise<void>;
  /** Trigger a badge check (call periodically or after key actions) */
  triggerBadgeCheck: () => Promise<void>;
}

const RewardContext = createContext<RewardContextType | null>(null);

// Predefined reward configs for common scenarios
export const REWARD_CONFIGS = {
  /** Welcome bonus for new users */
  welcomeBonus: {
    amount: 450,
    title: "A Token of Appreciation!",
    subtitle: "We're so grateful you're one of our early users. Here's a little gift to get you started.",
    message: "Each slide costs 5 tokens. Create up to 90 slides!",
    buttonText: "Start Creating",
    icon: 'gift' as const,
  },

  /** Referral reward */
  referralBonus: {
    amount: 50,
    title: "Referral Bonus!",
    subtitle: "Thanks for spreading the word about NextSlide.",
    buttonText: "Awesome!",
    icon: 'heart' as const,
  },

  /** Achievement reward */
  achievementBonus: {
    amount: 25,
    title: "Achievement Unlocked!",
    subtitle: "You've reached a milestone. Keep up the great work!",
    buttonText: "Keep Going",
    icon: 'sparkles' as const,
  },

  /** Promotional bonus */
  promoBonus: {
    amount: 100,
    title: "Special Bonus!",
    subtitle: "We appreciate you being part of our community.",
    buttonText: "Claim Bonus",
    icon: 'coins' as const,
  },
};

export function RewardProvider({ children }: { children: ReactNode }) {
  const [isShowing, setIsShowing] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<TokenRewardConfig | null>(null);
  const [gamificationEnabled, setGamificationEnabled] = useState(true);

  // Badge unlock toast state
  const [badgeUnlock, setBadgeUnlock] = useState<BadgeUnlockData | null>(null);
  const badgeQueueRef = useRef<BadgeUnlockData[]>([]);
  const isShowingBadgeRef = useRef(false);

  // Fetch gamification enabled status on mount
  useEffect(() => {
    gamificationApi.getStatus()
      .then((res) => setGamificationEnabled(res.enabled))
      .catch(() => {
        // Default to enabled if status check fails
        setGamificationEnabled(true);
      });
  }, []);

  const showReward = useCallback((config: TokenRewardConfig) => {
    setCurrentConfig(config);
    setIsShowing(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsShowing(false);
    // Clear config after animation completes
    setTimeout(() => setCurrentConfig(null), 300);
  }, []);

  // Process next badge in queue
  const processNextBadge = useCallback(() => {
    if (badgeQueueRef.current.length > 0 && !isShowingBadgeRef.current) {
      isShowingBadgeRef.current = true;
      const next = badgeQueueRef.current.shift()!;
      setBadgeUnlock(next);
    }
  }, []);

  // Show a badge unlock notification (queued if one is already showing)
  const showBadgeUnlock = useCallback((badge: BadgeUnlockData) => {
    badgeQueueRef.current.push(badge);
    if (!isShowingBadgeRef.current) {
      processNextBadge();
    }
  }, [processNextBadge]);

  const handleBadgeDismiss = useCallback(() => {
    setBadgeUnlock(null);
    isShowingBadgeRef.current = false;
    // Process next queued badge after a short gap
    setTimeout(processNextBadge, 400);
  }, [processNextBadge]);

  // Helper to convert earned badges to unlock data
  const notifyNewBadges = useCallback((badges: EarnedBadge[]) => {
    for (const badge of badges) {
      showBadgeUnlock({
        badge_type: badge.badge_type,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        credits: badge.credits_awarded,
      });
    }
  }, [showBadgeUnlock]);

  // Trigger streak check-in (call after deck creation)
  const triggerStreakCheckIn = useCallback(async () => {
    if (!gamificationEnabled) return;
    try {
      const result = await gamificationApi.checkIn();
      // Show badge unlock toasts for any newly awarded badges
      if (result.newly_awarded_badges && result.newly_awarded_badges.length > 0) {
        notifyNewBadges(result.newly_awarded_badges);
      }
    } catch (err) {
      // Non-critical - don't break the main flow
      console.warn('[RewardContext] Streak check-in failed:', err);
    }
  }, [notifyNewBadges, gamificationEnabled]);

  // Trigger badge check (call after key actions)
  const triggerBadgeCheck = useCallback(async () => {
    if (!gamificationEnabled) return;
    try {
      const result = await gamificationApi.checkBadges();
      if (result.newly_awarded && result.newly_awarded.length > 0) {
        notifyNewBadges(result.newly_awarded as EarnedBadge[]);
      }
    } catch (err) {
      console.warn('[RewardContext] Badge check failed:', err);
    }
  }, [notifyNewBadges, gamificationEnabled]);

  // Automatically trigger streak check-in + badge check when a deck is created
  useEffect(() => {
    const handleDeckGenComplete = () => {
      // Delay slightly so the main flow completes first
      setTimeout(() => {
        triggerStreakCheckIn();
      }, 2000);
    };

    window.addEventListener('deck_generation_complete', handleDeckGenComplete);
    return () => {
      window.removeEventListener('deck_generation_complete', handleDeckGenComplete);
    };
  }, [triggerStreakCheckIn]);

  // Badge check on login — catches anything earned while away (views, community approvals)
  useEffect(() => {
    const handleSignIn = () => {
      setTimeout(() => {
        triggerBadgeCheck();
      }, 3000);
    };

    window.addEventListener('user_signed_in', handleSignIn);
    return () => {
      window.removeEventListener('user_signed_in', handleSignIn);
    };
  }, [triggerBadgeCheck]);

  return (
    <RewardContext.Provider
      value={{
        showReward,
        isShowing,
        showBadgeUnlock,
        triggerStreakCheckIn,
        triggerBadgeCheck,
      }}
    >
      {children}
      {currentConfig && (
        <TokenRewardModal
          isOpen={isShowing}
          onClose={handleClose}
          config={currentConfig}
        />
      )}
      <BadgeUnlockToast badge={badgeUnlock} onDismiss={handleBadgeDismiss} />
    </RewardContext.Provider>
  );
}

export function useReward() {
  const context = useContext(RewardContext);
  if (!context) {
    throw new Error('useReward must be used within a RewardProvider');
  }
  return context;
}
