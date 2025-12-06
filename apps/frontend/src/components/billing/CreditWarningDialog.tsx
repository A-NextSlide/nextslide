/**
 * Credit Warning Dialog
 *
 * Shows a branded dialog when user is out of credits or about to use overage.
 * Uses NextSlide branding with orange accents and HK Grotesk font.
 *
 * Handles:
 * - Free users with no credits (upgrade CTA)
 * - Paid users about to use overage credits (confirm overage)
 * - Pre-generation warning before clicking generate
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, X, Rocket, CheckCircle2, CreditCard, AlertTriangle } from 'lucide-react';

export type CreditWarningMode =
  | 'free_no_credits'      // Free user, 0 credits
  | 'free_low_credits'     // Free user, some credits but not enough
  | 'paid_overage'         // Paid user, will use overage credits
  | 'post_generation';     // After generation completed

interface CreditWarningDialogProps {
  open: boolean;
  onClose: () => void;
  remainingCredits: number;
  requiredCredits: number;
  slideCount: number;
  planName: string;
  /** Mode determines messaging and actions */
  mode?: CreditWarningMode;
  /** Callback when user wants to proceed (with partial gen or overage) */
  onProceed?: () => void;
  /** Overage cost per credit for paid users */
  overageCostPerCredit?: number;
}

export function CreditWarningDialog({
  open,
  onClose,
  remainingCredits,
  requiredCredits,
  slideCount,
  planName,
  mode,
  onProceed,
  overageCostPerCredit = 0.10,
}: CreditWarningDialogProps) {
  const navigate = useNavigate();

  // Auto-detect mode if not provided
  const effectiveMode = mode || ((): CreditWarningMode => {
    if (requiredCredits === 0 && remainingCredits === 0) return 'post_generation';
    const isPaidPlan = ['starter', 'pro', 'enterprise'].includes(planName.toLowerCase());
    if (remainingCredits === 0) {
      return isPaidPlan ? 'paid_overage' : 'free_no_credits';
    }
    if (remainingCredits < requiredCredits) {
      return isPaidPlan ? 'paid_overage' : 'free_low_credits';
    }
    return 'free_no_credits';
  })();

  const affordableSlides = Math.floor(remainingCredits / 5); // 5 credits per slide
  const overageCredits = Math.max(0, requiredCredits - remainingCredits);
  const overageCost = (overageCredits * overageCostPerCredit).toFixed(2);
  const isPaidUser = ['starter', 'pro', 'enterprise'].includes(planName.toLowerCase());

  const handleUpgrade = () => {
    onClose();
    navigate('/profile?tab=billing');
  };

  const handleProceed = () => {
    if (onProceed) {
      onProceed();
    }
    onClose();
  };

  // Determine content based on mode
  const getTitle = () => {
    switch (effectiveMode) {
      case 'post_generation':
        return "Nice Work!";
      case 'paid_overage':
        return "Extra Credits Needed";
      case 'free_low_credits':
        return "Almost There!";
      case 'free_no_credits':
      default:
        return "Credits Used Up";
    }
  };

  const getDescription = () => {
    switch (effectiveMode) {
      case 'post_generation':
        return "Your presentation is ready. Upgrade to create more amazing slides.";
      case 'paid_overage':
        return `This presentation needs ${overageCredits} extra credits beyond your plan. You'll be charged $${overageCost} for overage.`;
      case 'free_low_credits':
        return `You need ${requiredCredits} credits but have ${remainingCredits}. Upgrade to unlock full presentations.`;
      case 'free_no_credits':
      default:
        return "You've used your free credits. Upgrade to keep creating.";
    }
  };

  const getIcon = () => {
    switch (effectiveMode) {
      case 'post_generation':
        return <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={1.5} />;
      case 'paid_overage':
        return <CreditCard className="w-10 h-10 text-white" strokeWidth={1.5} />;
      default:
        return <Rocket className="w-10 h-10 text-white" strokeWidth={1.5} />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[420px] p-0 overflow-hidden bg-white dark:bg-zinc-900 border-2 border-[#FF4301]/30 shadow-2xl shadow-[#FF4301]/10"
        style={{ borderRadius: '20px' }}
        hideCloseButton
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors z-10"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="relative px-8 pt-10 pb-6 text-center">
          {/* Subtle orange glow */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              background: 'radial-gradient(circle at 50% 0%, #FF4301 0%, transparent 70%)'
            }}
          />

          {/* Icon */}
          <div
            className="relative mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
            style={{
              background: 'linear-gradient(135deg, #FF4301 0%, #FF6B35 100%)',
              boxShadow: '0 8px 32px rgba(255, 67, 1, 0.3)'
            }}
          >
            {getIcon()}
          </div>

          {/* Title */}
          <h2
            className="text-2xl font-extrabold text-zinc-900 dark:text-white mb-3 tracking-tight"
            style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}
          >
            {getTitle()}
          </h2>

          {/* Description */}
          <p className="text-zinc-500 dark:text-zinc-400 text-[15px] leading-relaxed max-w-[300px] mx-auto">
            {getDescription()}
          </p>
        </div>

        {/* Content */}
        <div className="px-8 pb-8 space-y-4">
          {/* Feature highlights for post-generation */}
          {effectiveMode === 'post_generation' && (
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                <div className="w-5 h-5 rounded-full bg-[#FF4301]/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-[#FF4301]" />
                </div>
                <span>200 credits per month (~40 presentations)</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                <div className="w-5 h-5 rounded-full bg-[#FF4301]/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-[#FF4301]" />
                </div>
                <span>Premium templates & AI features</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                <div className="w-5 h-5 rounded-full bg-[#FF4301]/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-[#FF4301]" />
                </div>
                <span>Export to PowerPoint & PDF</span>
              </div>
            </div>
          )}

          {/* Overage breakdown for paid users */}
          {effectiveMode === 'paid_overage' && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800/50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
                    <span>Credits needed:</span>
                    <span className="font-medium">{requiredCredits}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
                    <span>Your balance:</span>
                    <span className="font-medium">{remainingCredits}</span>
                  </div>
                  <div className="border-t border-amber-200 dark:border-amber-700 pt-2 flex justify-between text-zinc-900 dark:text-white font-semibold">
                    <span>Overage charge:</span>
                    <span className="text-[#FF4301]">${overageCost}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stats - for free users with some credits */}
          {effectiveMode === 'free_low_credits' && (
            <div className="flex gap-3">
              <div className="flex-1 text-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50">
                <div className="text-2xl font-bold text-zinc-900 dark:text-white">{remainingCredits}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">You have</div>
              </div>
              <div className="flex-1 text-center p-3 rounded-xl bg-[#FF4301]/5 border border-[#FF4301]/20">
                <div className="text-2xl font-bold text-[#FF4301]">{requiredCredits}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">You need</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2.5 pt-2">
            {/* Primary action based on mode */}
            {effectiveMode === 'paid_overage' ? (
              // Paid user - option to proceed with overage
              <>
                <Button
                  onClick={handleProceed}
                  className="w-full h-12 text-[15px] font-semibold text-white transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #FF4301 0%, #FF6B35 100%)',
                    boxShadow: '0 4px 14px rgba(255, 67, 1, 0.4)',
                    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif',
                  }}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Continue with Overage (${overageCost})
                </Button>
                <Button
                  onClick={handleUpgrade}
                  variant="outline"
                  className="w-full h-11 bg-transparent border-2 border-[#FF4301]/30 text-[#FF4301] hover:bg-[#FF4301]/5 hover:border-[#FF4301]/50 transition-all font-medium"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Upgrade for More Credits
                </Button>
              </>
            ) : (
              // Free user - upgrade CTA
              <>
                <Button
                  onClick={handleUpgrade}
                  className="w-full h-12 text-[15px] font-semibold text-white transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #FF4301 0%, #FF6B35 100%)',
                    boxShadow: '0 4px 14px rgba(255, 67, 1, 0.4)',
                    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif',
                  }}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Upgrade to Starter — $9.99/mo
                </Button>

                {/* Partial generation option for free users with some credits */}
                {effectiveMode === 'free_low_credits' && affordableSlides > 0 && onProceed && (
                  <Button
                    onClick={handleProceed}
                    variant="outline"
                    className="w-full h-11 bg-transparent border-2 border-[#FF4301]/30 text-[#FF4301] hover:bg-[#FF4301]/5 hover:border-[#FF4301]/50 transition-all font-medium"
                  >
                    Generate {affordableSlides} slides (use all credits)
                  </Button>
                )}
              </>
            )}

            <button
              onClick={onClose}
              className="w-full h-10 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              {effectiveMode === 'post_generation' ? "Continue to presentation" : "Maybe later"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CreditWarningDialog;
