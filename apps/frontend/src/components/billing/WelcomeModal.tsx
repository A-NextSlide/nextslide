/**
 * Welcome Modal Component
 *
 * Shows after successful subscription upgrade.
 * Exciting, celebratory design matching the brand.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Sparkles, ArrowRight, Crown, Rocket, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  monthlyCredits: number;
  isFriendsFamily?: boolean;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  planName,
  monthlyCredits,
  isFriendsFamily = false
}) => {
  if (!isOpen) return null;

  const isPro = planName.toLowerCase() === 'pro';
  // Detect F&F from credits (-1 = unlimited) or explicit prop
  const isFF = isFriendsFamily || monthlyCredits === -1;

  return (
    <AnimatePresence>
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
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 30 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>

          {/* Header gradient with celebration */}
          <div className={`px-6 pt-10 pb-14 text-white text-center relative overflow-hidden ${
            isFF
              ? 'bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500'
              : 'bg-gradient-to-br from-[#FF4301] to-[#E63901]'
          }`}>
            {/* Floating sparkles */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="absolute inset-0 pointer-events-none"
            >
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0.5],
                    y: [-20, -60]
                  }}
                  transition={{
                    delay: 0.5 + i * 0.2,
                    duration: 2,
                    repeat: Infinity,
                    repeatDelay: 3
                  }}
                  className="absolute"
                  style={{
                    left: `${15 + i * 15}%`,
                    top: '60%'
                  }}
                >
                  <Sparkles className="w-4 h-4 text-white/40" />
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: 'spring', damping: 12 }}
              className="w-20 h-20 mx-auto mb-5 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm"
            >
              {isFF ? (
                <Heart className="w-10 h-10" />
              ) : isPro ? (
                <Crown className="w-10 h-10" />
              ) : (
                <Rocket className="w-10 h-10" />
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2
                className="text-3xl font-bold mb-2"
                style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
              >
                {isFF ? 'Welcome to the Family!' : `Welcome to ${planName}!`}
              </h2>
              <p className="text-white/80 text-lg">
                {isFF
                  ? "Ahmed must really like you! 💜"
                  : "You're all set to create amazing presentations"}
              </p>
            </motion.div>
          </div>

          {/* Content */}
          <div className="px-6 py-6 -mt-6 bg-white dark:bg-zinc-900 rounded-t-2xl relative">
            {/* Credits highlight */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center py-6 mb-4"
            >
              {isFF ? (
                <>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="text-5xl font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
                      ∞
                    </span>
                  </div>
                  <p className="text-zinc-500 dark:text-zinc-400">
                    unlimited credits forever! 🎉
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Zap className="w-6 h-6 text-[#FF4301]" />
                    <span className="text-4xl font-bold text-zinc-900 dark:text-white">
                      {monthlyCredits.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-zinc-500 dark:text-zinc-400">
                    credits ready to use this month
                  </p>
                </>
              )}
            </motion.div>

            {/* Quick stats */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-2 gap-3 mb-6"
            >
              <div className={`p-4 rounded-xl text-center ${
                isFF
                  ? 'bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20'
                  : 'bg-zinc-50 dark:bg-zinc-800/50'
              }`}>
                <p className={`text-2xl font-bold ${
                  isFF
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-zinc-900 dark:text-white'
                }`}>
                  {isFF ? '∞' : `~${Math.floor(monthlyCredits / 5 / 8)}`}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">presentations</p>
              </div>
              <div className={`p-4 rounded-xl text-center ${
                isFF
                  ? 'bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20'
                  : 'bg-zinc-50 dark:bg-zinc-800/50'
              }`}>
                <p className={`text-2xl font-bold ${
                  isFF
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-zinc-900 dark:text-white'
                }`}>
                  {isFF ? '∞' : `~${Math.floor(monthlyCredits / 5)}`}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">slides</p>
              </div>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Button
                className="w-full bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 text-white font-semibold py-6"
                onClick={onClose}
              >
                Start Creating
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default WelcomeModal;
