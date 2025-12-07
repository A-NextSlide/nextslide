/**
 * Reward Context
 *
 * Global reward system for showing token rewards throughout the app.
 * Can be triggered from anywhere using the useReward hook.
 *
 * Usage:
 *   const { showReward } = useReward();
 *   showReward({
 *     amount: 200,
 *     title: "Welcome Bonus!",
 *     subtitle: "Thanks for joining NextSlide",
 *   });
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import TokenRewardModal, { TokenRewardConfig } from '@/components/common/TokenRewardModal';

interface RewardContextType {
  /** Show a token reward modal */
  showReward: (config: TokenRewardConfig) => void;
  /** Check if a reward is currently showing */
  isShowing: boolean;
}

const RewardContext = createContext<RewardContextType | null>(null);

// Predefined reward configs for common scenarios
export const REWARD_CONFIGS = {
  /** Welcome bonus for new users */
  welcomeBonus: {
    amount: 200,
    title: "A Token of Appreciation!",
    subtitle: "We're so grateful you're one of our early users. Here's a little gift to get you started.",
    message: "Each slide costs 5 tokens. Create up to 40 slides!",
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

  const showReward = useCallback((config: TokenRewardConfig) => {
    setCurrentConfig(config);
    setIsShowing(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsShowing(false);
    // Clear config after animation completes
    setTimeout(() => setCurrentConfig(null), 300);
  }, []);

  return (
    <RewardContext.Provider value={{ showReward, isShowing }}>
      {children}
      {currentConfig && (
        <TokenRewardModal
          isOpen={isShowing}
          onClose={handleClose}
          config={currentConfig}
        />
      )}
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
