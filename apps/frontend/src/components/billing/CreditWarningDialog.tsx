/**
 * Credit Warning Dialog
 *
 * Shows a branded dialog when user is out of credits.
 * Uses NextSlide branding with orange accents and HK Grotesk font.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, X, Rocket, CheckCircle2 } from 'lucide-react';

interface CreditWarningDialogProps {
  open: boolean;
  onClose: () => void;
  remainingCredits: number;
  requiredCredits: number;
  slideCount: number;
  planName: string;
  /** If true, user has some credits but not enough for full deck */
  isPartialGeneration?: boolean;
  /** Callback when user wants to proceed with partial generation */
  onProceedPartial?: () => void;
}

export function CreditWarningDialog({
  open,
  onClose,
  remainingCredits,
  requiredCredits,
  slideCount,
  planName,
  isPartialGeneration = false,
  onProceedPartial,
}: CreditWarningDialogProps) {
  const navigate = useNavigate();

  const affordableSlides = Math.floor(remainingCredits / 5); // 5 credits per slide
  const isOutOfCredits = remainingCredits === 0;
  // Post-generation mode: when requiredCredits is 0, we're showing this after generation completed
  const isPostGeneration = requiredCredits === 0 && remainingCredits === 0;

  const handleUpgrade = () => {
    onClose();
    navigate('/pricing');
  };

  const handleProceed = () => {
    if (onProceedPartial) {
      onProceedPartial();
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[420px] p-0 overflow-hidden bg-white dark:bg-zinc-900 border-2 border-[#FF4301]/30 shadow-2xl shadow-[#FF4301]/10"
        style={{ borderRadius: '20px' }}
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
            {isPostGeneration ? (
              <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={1.5} />
            ) : (
              <Rocket className="w-10 h-10 text-white" strokeWidth={1.5} />
            )}
          </div>

          {/* Title */}
          <h2
            className="text-2xl font-extrabold text-zinc-900 dark:text-white mb-3 tracking-tight"
            style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}
          >
            {isPostGeneration
              ? "Nice Work!"
              : isOutOfCredits
                ? "Credits Used Up"
                : "Almost There!"}
          </h2>

          {/* Description */}
          <p className="text-zinc-500 dark:text-zinc-400 text-[15px] leading-relaxed max-w-[300px] mx-auto">
            {isPostGeneration ? (
              <>Your presentation is ready. Upgrade to create more amazing slides.</>
            ) : isOutOfCredits ? (
              <>You've used your free credits. Upgrade to keep creating.</>
            ) : (
              <>You need {requiredCredits} credits but have {remainingCredits}. Upgrade to unlock full presentations.</>
            )}
          </p>
        </div>

        {/* Content */}
        <div className="px-8 pb-8 space-y-4">
          {/* Feature highlights for post-generation */}
          {isPostGeneration && (
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

          {/* Stats - only for pre-generation */}
          {!isPostGeneration && !isOutOfCredits && (
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

            {isPartialGeneration && affordableSlides > 0 && (
              <Button
                onClick={handleProceed}
                variant="outline"
                className="w-full h-11 bg-transparent border-2 border-[#FF4301]/30 text-[#FF4301] hover:bg-[#FF4301]/5 hover:border-[#FF4301]/50 transition-all font-medium"
              >
                Generate {affordableSlides} slides (use all credits)
              </Button>
            )}

            <button
              onClick={onClose}
              className="w-full h-10 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              {isPostGeneration ? "Continue to presentation" : "Maybe later"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CreditWarningDialog;
