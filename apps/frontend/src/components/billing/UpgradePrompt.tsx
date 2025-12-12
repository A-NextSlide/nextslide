/**
 * Upgrade Prompt Component
 *
 * Shows when user runs out of credits or tries an action without enough credits.
 * Modern, slick design matching the brand.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Sparkles, ArrowRight, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCredits } from '@/context/CreditsContext';

interface UpgradePromptProps {
  onClose?: () => void;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const { showUpgradePrompt, setShowUpgradePrompt, insufficientCreditsAction, balance } = useCredits();

  const handleClose = () => {
    setShowUpgradePrompt(false);
    onClose?.();
  };

  const handleUpgrade = () => {
    setShowUpgradePrompt(false);
    navigate('/pricing');
  };

  // Action-specific messages
  const getActionMessage = () => {
    switch (insufficientCreditsAction) {
      case 'slide_generation':
        return 'generate this slide';
      case 'ai_chat':
        return 'send this message';
      case 'ai_edit':
        return 'make this edit';
      case 'theme_generation':
        return 'generate this theme';
      case 'outline_generation':
        return 'generate this outline';
      default:
        return 'complete this action';
    }
  };

  if (!showUpgradePrompt) return null;

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
          onClick={handleClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
          >
            <X className="w-5 h-5 text-black/50 dark:text-white/50" />
          </button>

          {/* Header gradient */}
          <div className="bg-gradient-to-br from-[#FF4301] to-[#E63901] px-6 pt-8 pb-12 text-white text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring' }}
              className="w-16 h-16 mx-auto mb-4 bg-white/20 rounded-2xl flex items-center justify-center"
            >
              <Zap className="w-8 h-8" />
            </motion.div>
            <h2
              className="text-2xl font-bold mb-2"
              style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
            >
              Out of Credits
            </h2>
            <p className="text-white/80">
              You need more credits to {getActionMessage()}
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-6 -mt-6 bg-white dark:bg-zinc-900 rounded-t-2xl relative">
            {/* Current balance */}
            {balance && (
              <div className="flex items-center justify-between p-4 bg-black/5 dark:bg-white/5 rounded-xl mb-6">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-[#FF4301]" />
                  <span className="text-sm text-black/60 dark:text-white/60">Current balance</span>
                </div>
                <span className="font-bold text-lg">
                  {balance.remaining_credits} credits
                </span>
              </div>
            )}

            {/* Pro benefits */}
            <div className="space-y-3 mb-6">
              <p className="text-sm font-medium text-black dark:text-white">
                Upgrade to Pro and get:
              </p>
              {[
                '2,000 credits/month (~400 presentations)',
                'Priority AI generation',
                'All export formats',
                'Pay-as-you-go if you need more'
              ].map((benefit, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-[#FF4301]" />
                  <span className="text-sm text-black/70 dark:text-white/70">{benefit}</span>
                </motion.div>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="space-y-3">
              <Button
                className="w-full bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold py-6"
                onClick={handleUpgrade}
              >
                Upgrade to Pro - $19.99/mo
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="ghost"
                className="w-full text-black/50 dark:text-white/50"
                onClick={handleClose}
              >
                Maybe later
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default UpgradePrompt;
