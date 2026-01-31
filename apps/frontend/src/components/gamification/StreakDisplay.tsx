/**
 * StreakDisplay
 *
 * Shows the user's current creation streak with a dynamic flame icon.
 * Flame size/intensity grows with longer streaks.
 * Displays progress to the next milestone and a claim button when reached.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StreakData } from '@/services/gamificationApi';

// Streak milestones and their credit rewards
const MILESTONES = [
  { days: 3, credits: 10 },
  { days: 7, credits: 25 },
  { days: 30, credits: 100 },
];

interface StreakDisplayProps {
  streak: StreakData;
  onClaimReward?: (milestone: number) => Promise<void>;
  compact?: boolean;
  className?: string;
}

type FlameSize = 'none' | 'small' | 'medium' | 'large' | 'legendary';

function getFlameSize(streak: number): FlameSize {
  if (streak <= 0) return 'none';
  if (streak <= 2) return 'small';
  if (streak <= 6) return 'medium';
  if (streak <= 29) return 'large';
  return 'legendary';
}

const FLAME_STYLES: Record<FlameSize, { iconClass: string; glowColor: string; animateIntensity: number }> = {
  none: { iconClass: 'w-5 h-5 text-zinc-300 dark:text-zinc-600', glowColor: 'transparent', animateIntensity: 0 },
  small: { iconClass: 'w-5 h-5 text-orange-400', glowColor: 'rgba(251,146,60,0.2)', animateIntensity: 1 },
  medium: { iconClass: 'w-6 h-6 text-orange-500', glowColor: 'rgba(249,115,22,0.3)', animateIntensity: 1.5 },
  large: { iconClass: 'w-7 h-7 text-red-500', glowColor: 'rgba(239,68,68,0.35)', animateIntensity: 2 },
  legendary: { iconClass: 'w-8 h-8 text-yellow-400', glowColor: 'rgba(250,204,21,0.4)', animateIntensity: 3 },
};

const StreakDisplay: React.FC<StreakDisplayProps> = ({
  streak,
  onClaimReward,
  compact = false,
  className = '',
}) => {
  const [claimingMilestone, setClaimingMilestone] = useState<number | null>(null);
  const currentStreak = streak.current_streak;
  const flameSize = getFlameSize(currentStreak);
  const style = FLAME_STYLES[flameSize];

  // Find claimable milestones
  const claimableMilestones = MILESTONES.filter(
    (m) => currentStreak >= m.days && !streak.streak_credits_claimed?.[String(m.days)]
  );

  // Find next unclaimed milestone
  const nextMilestone = streak.next_milestone;
  const daysUntilNext = streak.days_until_next;

  const handleClaim = async (milestone: number) => {
    if (!onClaimReward || claimingMilestone) return;
    setClaimingMilestone(milestone);
    try {
      await onClaimReward(milestone);
    } finally {
      setClaimingMilestone(null);
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <motion.div
          animate={
            style.animateIntensity > 0
              ? {
                  scale: [1, 1 + style.animateIntensity * 0.03, 1],
                  rotate: [0, -2, 2, 0],
                }
              : {}
          }
          transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
        >
          <Flame className={style.iconClass} />
        </motion.div>
        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
          {currentStreak}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <motion.div
            className="relative"
            animate={
              style.animateIntensity > 0
                ? {
                    scale: [1, 1 + style.animateIntensity * 0.05, 1],
                    rotate: [0, -3, 3, 0],
                  }
                : {}
            }
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
          >
            {/* Glow behind flame */}
            {flameSize !== 'none' && (
              <div
                className="absolute inset-0 rounded-full blur-md"
                style={{ backgroundColor: style.glowColor }}
              />
            )}
            <Flame className={`relative ${style.iconClass}`} />
          </motion.div>
          <div>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {currentStreak > 0 ? `${currentStreak}-day streak` : 'No active streak'}
            </p>
            {streak.longest_streak > 0 && currentStreak < streak.longest_streak && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                Best: {streak.longest_streak} days
              </p>
            )}
          </div>
        </div>

        {/* Streak counter badge */}
        {currentStreak > 0 && (
          <div
            className={`
              px-2.5 py-1 rounded-full text-xs font-bold
              ${flameSize === 'legendary'
                ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white'
                : flameSize === 'large'
                ? 'bg-gradient-to-r from-red-400 to-orange-500 text-white'
                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'}
            `}
          >
            {currentStreak}d
          </div>
        )}
      </div>

      {/* Progress to next milestone */}
      {nextMilestone && daysUntilNext != null && daysUntilNext > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-zinc-500 dark:text-zinc-400">
              Next: {nextMilestone}-day milestone
            </span>
            <span className="text-zinc-400 dark:text-zinc-500">
              {daysUntilNext} more {daysUntilNext === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500"
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, (currentStreak / nextMilestone) * 100)}%`,
              }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Claimable rewards */}
      <AnimatePresence>
        {claimableMilestones.map((m) => (
          <motion.div
            key={m.days}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleClaim(m.days)}
              disabled={claimingMilestone === m.days}
              className="w-full h-9 text-xs font-semibold border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              {claimingMilestone === m.days ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Gift className="w-3.5 h-3.5 mr-1.5" />
              )}
              Claim {m.days}-day reward: +{m.credits} credits
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default StreakDisplay;
