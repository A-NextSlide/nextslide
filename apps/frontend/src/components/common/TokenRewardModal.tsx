/**
 * TokenRewardModal
 *
 * Reusable modal for showing token rewards to users.
 * Clean white box with orange accents matching the app style.
 *
 * Used for:
 * - Onboarding welcome bonus
 * - Achievement rewards
 * - Promotional bonuses
 * - Referral rewards
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, Coins, Sparkles, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface TokenRewardConfig {
  /** Number of tokens to reward */
  amount: number;
  /** Title text */
  title: string;
  /** Subtitle/description */
  subtitle: string;
  /** Optional message below the token count */
  message?: string;
  /** Button text */
  buttonText?: string;
  /** Icon type */
  icon?: 'gift' | 'coins' | 'heart' | 'sparkles';
}

interface TokenRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TokenRewardConfig;
}

const iconMap = {
  gift: Gift,
  coins: Coins,
  heart: Heart,
  sparkles: Sparkles,
};

const TokenRewardModal: React.FC<TokenRewardModalProps> = ({
  isOpen,
  onClose,
  config
}) => {
  const [displayCount, setDisplayCount] = useState(0);
  const [isCounting, setIsCounting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const Icon = iconMap[config.icon || 'gift'];

  // Start counting animation when modal opens
  useEffect(() => {
    if (isOpen && !isCounting) {
      setIsCounting(true);
      setShowConfetti(true);

      const duration = 1500;
      const steps = 30;
      const increment = config.amount / steps;
      const stepTime = duration / steps;

      let current = 0;
      const interval = setInterval(() => {
        current += increment;
        if (current >= config.amount) {
          setDisplayCount(config.amount);
          clearInterval(interval);
        } else {
          setDisplayCount(Math.floor(current));
        }
      }, stepTime);

      return () => clearInterval(interval);
    }
  }, [isOpen, config.amount, isCounting]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDisplayCount(0);
      setIsCounting(false);
      setShowConfetti(false);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-[420px]"
          >
            {/* Floating tokens decoration - positioned outside the box */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="absolute -top-6 -left-6 w-16 h-16 rounded-2xl flex items-center justify-center z-10"
              style={{
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                boxShadow: '0 8px 24px rgba(255, 165, 0, 0.4)',
              }}
            >
              <Coins className="w-8 h-8 text-white" />
            </motion.div>

            <motion.div
              initial={{ scale: 0, rotate: 20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.3, type: 'spring' }}
              className="absolute -top-4 -right-4 w-12 h-12 rounded-xl flex items-center justify-center z-10"
              style={{
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                boxShadow: '0 6px 20px rgba(255, 165, 0, 0.4)',
              }}
            >
              <Sparkles className="w-6 h-6 text-white" />
            </motion.div>

            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.4, type: 'spring' }}
              className="absolute -bottom-4 -right-6 w-14 h-14 rounded-xl flex items-center justify-center z-10"
              style={{
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                boxShadow: '0 6px 20px rgba(255, 165, 0, 0.4)',
              }}
            >
              <Coins className="w-7 h-7 text-white" />
            </motion.div>

            {/* Main card */}
            <div
              className="relative bg-white dark:bg-zinc-900 overflow-hidden"
              style={{
                borderRadius: 20,
                border: '2px solid rgba(255, 67, 1, 0.3)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 67, 1, 0.1)',
              }}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
              >
                <X className="w-5 h-5 text-black/40 dark:text-white/40" />
              </button>

              {/* Subtle orange glow at top */}
              <div
                className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse at 50% 0%, #FF4301 0%, transparent 60%)'
                }}
              />

              {/* Content */}
              <div className="relative px-8 pt-10 pb-8 text-center">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 400 }}
                  className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                  style={{
                    background: 'linear-gradient(135deg, #FF4301 0%, #FF6B35 100%)',
                    boxShadow: '0 8px 32px rgba(255, 67, 1, 0.3)',
                  }}
                >
                  <Icon className="w-10 h-10 text-white" strokeWidth={1.5} />
                </motion.div>

                {/* Title */}
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-2xl font-extrabold text-zinc-900 dark:text-white mb-2 tracking-tight"
                  style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}
                >
                  {config.title}
                </motion.h2>

                {/* Subtitle */}
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-zinc-500 dark:text-zinc-400 text-[15px] leading-relaxed max-w-[300px] mx-auto mb-8"
                >
                  {config.subtitle}
                </motion.p>

                {/* Token display */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.25, type: 'spring' }}
                  className="relative mx-auto mb-6 p-6 rounded-2xl"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 165, 0, 0.05) 100%)',
                    border: '2px solid rgba(255, 215, 0, 0.3)',
                  }}
                >
                  <div className="flex items-center justify-center gap-3">
                    <Coins className="w-8 h-8 text-amber-500" />
                    <motion.span
                      key={displayCount}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className="text-5xl font-black"
                      style={{
                        background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif',
                      }}
                    >
                      +{displayCount}
                    </motion.span>
                  </div>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-2 uppercase tracking-wider">
                    Tokens
                  </p>
                </motion.div>

                {/* Optional message */}
                {config.message && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-sm text-zinc-400 dark:text-zinc-500 mb-6"
                  >
                    {config.message}
                  </motion.p>
                )}

                {/* CTA Button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  <Button
                    onClick={onClose}
                    className="w-full h-12 text-[15px] font-semibold text-white transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #FF4301 0%, #FF6B35 100%)',
                      boxShadow: '0 4px 14px rgba(255, 67, 1, 0.4)',
                      fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif',
                    }}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {config.buttonText || 'Claim & Continue'}
                  </Button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TokenRewardModal;
