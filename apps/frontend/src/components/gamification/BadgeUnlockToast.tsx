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

    const defaults = {
      spread: 55,
      ticks: 70,
      gravity: 1.2,
      decay: 0.94,
      startVelocity: 22,
      colors: ['#FF4301', '#FF6B00', '#FF8C42', '#FFA564', '#FFD4B8'],
    };

    confetti({
      ...defaults,
      particleCount: 35,
      origin: { x: 0.5, y: 0.3 },
      angle: 90,
    });

    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: 20,
        origin: { x: 0.4, y: 0.35 },
        angle: 120,
      });
      confetti({
        ...defaults,
        particleCount: 20,
        origin: { x: 0.6, y: 0.35 },
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
          initial={{ opacity: 0, y: -30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] w-[360px] max-w-[calc(100vw-32px)]"
        >
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #FF4301 0%, #FF6B00 100%)',
              boxShadow:
                '0 20px 50px -12px rgba(255,67,1,0.4), 0 8px 20px -4px rgba(0,0,0,0.12)',
            }}
          >
            {/* Close button */}
            <button
              onClick={onDismiss}
              className="absolute right-3 top-3 p-1 rounded-full hover:bg-white/20 transition-colors z-10"
            >
              <X className="w-3.5 h-3.5 text-white/70" />
            </button>

            <div className="flex items-center gap-4 px-5 py-4">
              {/* Badge icon */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
                className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-white/20 backdrop-blur-sm"
                style={{
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                }}
              >
                <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
              </motion.div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">
                    Badge Unlocked
                  </p>
                  <p className="text-[15px] font-bold text-white truncate leading-snug mt-0.5">
                    {badge.name}
                  </p>
                  <p className="text-xs text-white/70 mt-0.5 leading-snug">
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
                  className="flex-shrink-0 text-center px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur-sm"
                >
                  <p className="text-lg font-black text-white leading-none">
                    +{badge.credits}
                  </p>
                  <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider mt-0.5">
                    Credits
                  </p>
                </motion.div>
              )}
            </div>

            {/* Progress bar for auto-dismiss */}
            <motion.div
              className="h-[3px] bg-white/30"
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
