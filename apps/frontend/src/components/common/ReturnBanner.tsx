import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReturnBannerStore } from '@/stores/returnBannerStore';

const ReturnBanner: React.FC = () => {
  const navigate = useNavigate();
  const { pendingShareCode, pendingDeckName, clearPendingPresentation } = useReturnBannerStore();

  if (!pendingShareCode) return null;

  const handleReturn = () => {
    navigate(`/p/${pendingShareCode}`);
    clearPendingPresentation();
  };

  const handleDismiss = () => {
    clearPendingPresentation();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed top-0 left-0 right-0 z-[200] bg-[#FCFBF8] dark:bg-[#0a0a0a] border-b border-black/10 dark:border-white/10 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 bg-[#FF4301]/10 dark:bg-[#FF4301]/20 rounded-full p-2">
                <Play className="h-4 w-4 text-[#FF4301]" />
              </div>
              <p className="text-sm sm:text-base text-black/70 dark:text-white/70 truncate">
                <span className="hidden sm:inline">Continue viewing </span>
                <span className="font-semibold text-black dark:text-white">{pendingDeckName}</span>
              </p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={handleReturn}
                className="inline-flex items-center gap-2 bg-[#FF4301] hover:bg-[#E63901] text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg hover:shadow-xl transition-all group"
              >
                <span className="hidden sm:inline">Return to Presentation</span>
                <span className="sm:hidden">Resume</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={handleDismiss}
                className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                aria-label="Dismiss"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ReturnBanner;
