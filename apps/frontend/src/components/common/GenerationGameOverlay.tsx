import React, { useEffect, useState, lazy, Suspense, useRef } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gamepad2, Sparkles, Trophy, ArrowRight } from 'lucide-react';

// Lazy load games
const TheDeadlineGame = lazy(() => import('@/components/common/games/TheDeadlineGame'));
const SlideFactoryGame = lazy(() => import('@/components/common/games/SlideFactoryGame'));
// Keep others just in case, but hidden by default
const MemoryMatch = lazy(() => import('@/components/common/games/MemoryMatch'));

interface GenerationGameOverlayProps {
  deckState: 'pending' | 'creating' | 'generating' | 'completed' | 'error' | undefined;
  startedAt?: string | undefined;
  isVisibleOverride?: boolean;
  mountInsideSlide?: boolean;
  currentSlideIndex?: number;
  totalSlides?: number;
}

const GenerationGameOverlay: React.FC<GenerationGameOverlayProps> = ({
  deckState,
  startedAt,
  isVisibleOverride,
  mountInsideSlide = false,
  currentSlideIndex,
  totalSlides
}) => {
  const [showOverlay, setShowOverlay] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [activeGame, setActiveGame] = useState<'deadline' | 'arcade' | null>('deadline'); // Default to deadline
  const [isMinimized, setIsMinimized] = useState(false);

  const isGenerating = deckState === 'creating' || deckState === 'generating' || deckState === 'pending';
  const isComplete = deckState === 'completed';
  const timerRef = useRef<number | null>(null);
  const hasArmedRef = useRef(false);

  // Auto-show prompt after a few seconds of generation
  useEffect(() => {
    if (isVisibleOverride) {
      setShowOverlay(true);
      return;
    }

    if (showPrompt || showOverlay) return;

    if (isGenerating && !isComplete && !hasArmedRef.current) {
      const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
      const elapsed = Date.now() - startMs;
      const remaining = Math.max(0, 3000 - elapsed); // Show sooner (3s)

      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setShowPrompt(true);
      }, remaining) as unknown as number;
      hasArmedRef.current = true;
    }

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isGenerating, isComplete, startedAt, isVisibleOverride, showPrompt, showOverlay]);

  if (!showPrompt && !showOverlay) return null;

  const handleDismiss = () => {
    setShowOverlay(false);
    setIsMinimized(true);
    // Re-show prompt after a while if still generating? No, let's keep it minimized.
  };

  const handlePlay = () => {
    setShowOverlay(true);
    setIsMinimized(false);
    setActiveGame('deadline');
  };

  return (
    <>
      {/* Minimized Prompt (Floating Button) */}
      <AnimatePresence>
        {!showOverlay && showPrompt && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className={cn(
              "absolute z-[60]",
              mountInsideSlide ? "bottom-6 right-6" : "bottom-8 right-8"
            )}
          >
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePlay}
              className="group relative flex items-center gap-3 pl-4 pr-6 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl border border-cyan-500/50 overflow-hidden"
            >
              {/* Animated Background */}
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 group-hover:opacity-100 transition-opacity" />

              {/* Icon */}
              <div className="relative z-10 w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform">
                <Gamepad2 className="w-6 h-6 text-black" />
              </div>

              {/* Text */}
              <div className="relative z-10 text-left">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Waiting?</div>
                <div className="font-black text-lg leading-none">Play The Deadline</div>
              </div>

              {/* Badge */}
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-slate-900"
              />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Overlay */}
      <AnimatePresence>
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", duration: 0.5 }}
            className={cn(
              'absolute z-[70] overflow-hidden flex flex-col',
              mountInsideSlide ? 'inset-4 rounded-3xl shadow-2xl' : 'inset-0'
            )}
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            }}
          >
            {/* Game Container */}
            <div className="flex-1 relative overflow-hidden">
              <Suspense fallback={
                <div className="absolute inset-0 flex items-center justify-center text-cyan-500">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <Gamepad2 className="w-12 h-12" />
                  </motion.div>
                </div>
              }>
                {activeGame === 'deadline' ? (
                  <TheDeadlineGame onClose={handleDismiss} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white">
                    {/* Placeholder for other games if we want them back */}
                    <div className="text-center">
                      <h2 className="text-2xl font-bold mb-4">Arcade Mode</h2>
                      <p className="text-slate-400 mb-6">More games coming soon!</p>
                      <button
                        onClick={() => setActiveGame('deadline')}
                        className="px-6 py-2 bg-cyan-500 text-black font-bold rounded-lg"
                      >
                        Back to The Deadline
                      </button>
                    </div>
                  </div>
                )}
              </Suspense>
            </div>

            {/* Footer / Progress Bar */}
            <div className="h-16 bg-slate-900/80 backdrop-blur-md border-t border-white/10 flex items-center px-6 justify-between shrink-0 relative z-50">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                    {isComplete ? 'GENERATION COMPLETE' : 'GENERATING SLIDES...'}
                  </span>
                  <span className="text-white font-medium text-sm flex items-center gap-2">
                    {isComplete ? 'Your deck is ready!' : `Building slide ${currentSlideIndex || 1} of ${totalSlides || '?'}`}
                    {!isComplete && (
                      <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                        <Sparkles className="w-3 h-3 text-yellow-400" />
                      </motion.span>
                    )}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              {totalSlides && totalSlides > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                  <motion.div
                    className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${((currentSlideIndex || 0) / totalSlides) * 100}%` }}
                    transition={{ type: "spring", stiffness: 50 }}
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                {isComplete && (
                  <motion.button
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleDismiss}
                    className="px-5 py-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl shadow-lg shadow-green-500/20 flex items-center gap-2"
                  >
                    <span>View Slides</span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                )}

                <button
                  onClick={handleDismiss}
                  className="p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors"
                  title="Minimize Game"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default GenerationGameOverlay;
