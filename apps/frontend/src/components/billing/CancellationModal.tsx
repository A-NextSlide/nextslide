/**
 * Cancellation Modal Component
 *
 * Multi-step flow to understand why users are canceling
 * and record feedback for product improvement.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface CancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, details: string) => Promise<void>;
  planName: string;
  currentCredits: number;
  periodEnd: string | null;
}

const CANCELLATION_REASONS = [
  { id: 'too_expensive', label: 'Too expensive' },
  { id: 'not_using', label: 'Not using it enough' },
  { id: 'missing_features', label: 'Missing features I need' },
  { id: 'switching', label: 'Switching to another tool' },
  { id: 'temporary', label: 'Was just a temporary project' },
  { id: 'other', label: 'Other reason' },
] as const;

export const CancellationModal: React.FC<CancellationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  planName,
  currentCredits,
  periodEnd,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (!selectedReason) return;

    setIsLoading(true);
    try {
      await onConfirm(selectedReason, details);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedReason('');
    setDetails('');
    onClose();
  };

  const formattedEndDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'the end of your billing period';

  if (!isOpen) return null;

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
          className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>

          {/* Step 1: Survey */}
          {step === 1 && (
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-1">
                    Before you go...
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    We'd love to understand why you're leaving so we can improve.
                  </p>
                </div>
              </div>

              {/* What changes */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl mb-6">
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-2">
                  If you cancel your <span className="font-medium">{planName}</span> plan:
                </p>
                <ul className="space-y-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    Keep full access until {formattedEndDate}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    After that, credits reset to 10/month (Free plan)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    Your presentations stay safe forever
                  </li>
                </ul>
              </div>

              {/* Reason selection */}
              <div className="mb-6">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                  Why are you canceling?
                </p>
                <div className="space-y-2">
                  {CANCELLATION_REASONS.map((reason) => (
                    <button
                      key={reason.id}
                      onClick={() => setSelectedReason(reason.id)}
                      className={cn(
                        'w-full p-3 rounded-lg border text-left text-sm transition-all',
                        selectedReason === reason.id
                          ? 'border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                          : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300'
                      )}
                    >
                      {reason.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional details */}
              {selectedReason && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-6"
                >
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                    Anything else you'd like to share? (optional)
                  </label>
                  <Textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Tell us more..."
                    className="resize-none"
                    rows={3}
                  />
                </motion.div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleClose}
                >
                  Keep my plan
                </Button>
                <Button
                  variant="default"
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900"
                  disabled={!selectedReason}
                  onClick={() => setStep(2)}
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Confirmation */}
          {step === 2 && (
            <div className="p-6">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
                  Confirm cancellation
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Your {planName} subscription will end on {formattedEndDate}.
                  You can resubscribe anytime.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <Button
                  variant="destructive"
                  className="w-full py-6"
                  onClick={handleConfirm}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Canceling...
                    </>
                  ) : (
                    'Yes, cancel my subscription'
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep(1)}
                  disabled={isLoading}
                >
                  Go back
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CancellationModal;
