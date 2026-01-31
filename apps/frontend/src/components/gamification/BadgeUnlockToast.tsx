/**
 * BadgeUnlockToast
 *
 * Special notification component for when a user earns a new badge.
 * Features confetti celebration (via canvas-confetti), badge icon display,
 * and auto-dismiss after 5 seconds.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Layers,
  Trophy,
  Zap,
  Eye,
  Star,
  Flame,
  Repeat,
  Award,
  Users,
  Share2,
  Crown,
  X,
  type LucideIcon,
} from 'lucide-react';
import confetti from 'canvas-confetti';

const ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  layers: Layers,
  trophy: Trophy,
  zap: Zap,
  eye: Eye,
  star: Star,
  flame: Flame,
  repeat: Repeat,
  award: Award,
  users: Users,
  share2: Share2,
  crown: Crown,
};

export interface BadgeUnlockData {
  badge_type: string;
  name: string;
  description: string;
  icon: string;
  credits: number;
}

interface BadgeUnlockToastProps {
  badge: BadgeUnlockData | null;
  onDismiss: () => void;
}

const BadgeUnlockToast: React.FC<BadgeUnlockToastProps> = ({ badge, onDismiss }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConfettiFired = useRef(false);

  const fireConfetti = useCallback(() => {
    if (hasConfettiFired.current) return;
    hasConfettiFired.current = true;

    // Celebration burst
    const defaults = {
      spread: 60,
      ticks: 80,
      gravity: 1.2,
      decay: 0.94,
      startVelocity: 25,
      colors: ['#FFD700', '#FFA500', '#FF4301', '#FF6B35', '#FBBF24'],
    };

    confetti({
      ...defaults,
      particleCount: 40,
      origin: { x: 0.5, y: 0.7 },
      angle: 90,
    });

    // A second smaller burst
    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: 25,
        origin: { x: 0.4, y: 0.75 },
        angle: 120,
      });
      confetti({
        ...defaults,
        particleCount: 25,
        origin: { x: 0.6, y: 0.75 },
        angle: 60,
      });
    }, 200);
  }, []);

  useEffect(() => {
    if (badge) {
      hasConfettiFired.current = false;
      // Small delay so the toast is visible before confetti
      const confettiTimer = setTimeout(fireConfetti, 300);

      // Auto-dismiss after 5 seconds
      timerRef.current = setTimeout(() => {
        onDismiss();
      }, 5000);

      return () => {
        clearTimeout(confettiTimer);
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [badge, fireConfetti, onDismiss]);

  const Icon = badge ? (ICON_MAP[badge.icon] || Award) : Award;

  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[340px] max-w-[calc(100vw-32px)]"
        >
          <div
            className="relative bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden"
            style={{
              border: '2px solid rgba(255, 215, 0, 0.4)',
              boxShadow:
                '0 20px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,215,0,0.1), 0 0 30px rgba(255,165,0,0.1)',
            }}
          >
            {/* Top gold accent bar */}
            <div className="h-1 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-400" />

            {/* Close button */}
            <button
              onClick={onDismiss}
              className="absolute right-3 top-3 p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
            >
              <X className="w-3.5 h-3.5 text-zinc-400" />
            </button>

            <div className="flex items-center gap-3 px-4 py-3.5">
              {/* Badge icon */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
                className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                  boxShadow: '0 4px 12px rgba(255,165,0,0.3)',
                }}
              >
                <Icon className="w-6 h-6 text-white" strokeWidth={2} />
              </motion.div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    Badge Unlocked!
                  </p>
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">
                    {badge.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {badge.description}
                  </p>
                </motion.div>
              </div>

              {/* Credits */}
              {badge.credits > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.25, type: 'spring' }}
                  className="flex-shrink-0 text-center"
                >
                  <p
                    className="text-lg font-black"
                    style={{
                      background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    +{badge.credits}
                  </p>
                  <p className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    Credits
                  </p>
                </motion.div>
              )}
            </div>

            {/* Progress bar for auto-dismiss */}
            <motion.div
              className="h-0.5 bg-gradient-to-r from-amber-400 to-yellow-400"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 5, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BadgeUnlockToast;
