import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trackEvent } from '@/services/analytics';

const DISMISS_KEY = 'referral_prompt_dismissed_at';
const DISMISS_DAYS = 7;

interface ReferralPromptProps {
  /** 'post_creation' shows after deck creation, 'low_credits' shows when credits are low */
  variant: 'post_creation' | 'low_credits';
}

const ReferralPrompt: React.FC<ReferralPromptProps> = ({ variant }) => {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const dismissedAt = new Date(dismissed).getTime();
        const now = Date.now();
        const daysSinceDismiss = (now - dismissedAt) / (1000 * 60 * 60 * 24);
        if (daysSinceDismiss < DISMISS_DAYS) {
          return; // Still within cooldown
        }
      }
      setVisible(true);
      trackEvent('referral_prompt_shown', { variant });
    } catch {
      // localStorage not available
    }
  }, [variant]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {
      // localStorage not available
    }
    trackEvent('referral_prompt_dismissed', { variant });
  }, [variant]);

  const handleClick = useCallback(() => {
    navigate('/profile?tab=referrals');
  }, [navigate]);

  if (!visible) return null;

  const message =
    variant === 'post_creation'
      ? 'Love your new presentation? Invite friends and earn 50 credits each!'
      : 'Running low on credits? Invite a friend and earn 50 free credits.';

  return (
    <div className="relative bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border border-orange-200 dark:border-orange-800/50 rounded-lg px-4 py-3 flex items-center gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
        <Gift className="w-4 h-4 text-orange-600 dark:text-orange-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        className="shrink-0 text-xs border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40"
      >
        Invite Friends
      </Button>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-zinc-400" />
      </button>
    </div>
  );
};

export default ReferralPrompt;
