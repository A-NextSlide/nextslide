import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Brain, Grid3x3, Lightbulb, Gamepad2, Keyboard, Type, Factory, Hammer, Sparkles, Zap } from 'lucide-react';

// Lazy load all games
const MemoryMatch = lazy(() => import('@/components/common/games/MemoryMatch'));
const SlidingPuzzle = lazy(() => import('@/components/common/games/SlidingPuzzle'));
const LightsOut = lazy(() => import('@/components/common/games/LightsOut'));
const TypeRacer = lazy(() => import('@/components/common/games/TypeRacer'));
const FontFrenzy = lazy(() => import('@/components/common/games/FontFrenzy'));
const SlideFactoryGame = lazy(() => import('@/components/common/games/SlideFactoryGame'));

interface GenerationGameOverlayProps {
  deckState: 'pending' | 'creating' | 'generating' | 'completed' | 'error' | undefined;
  startedAt?: string | undefined;
  isVisibleOverride?: boolean;
  mountInsideSlide?: boolean;
  currentSlideIndex?: number;
  totalSlides?: number;
}

type GameKey = 'memory' | 'sliding' | 'lightsout' | 'typing' | 'fonts' | 'factory';

const GAME_DATA: Record<GameKey, {
  title: string;
  desc: string;
  icon: typeof Brain;
  gradient: string;
  emoji: string;
  isNew?: boolean;
  isHot?: boolean;
  difficulty: string;
}> = {
  factory: {
    title: 'Slide Factory',
    desc: 'Run the chaotic factory! Dodge feedback!',
    icon: Factory,
    gradient: 'from-indigo-500 to-purple-600',
    emoji: '🏭',
    isNew: true,
    isHot: true,
    difficulty: 'Medium',
  },
  fonts: {
    title: 'Font Frenzy',
    desc: 'Destroy Comic Sans invasion!',
    icon: Type,
    gradient: 'from-pink-500 to-rose-600',
    emoji: '🔤',
    isNew: true,
    difficulty: 'Medium',
  },
  typing: {
    title: 'Type Fighter',
    desc: 'Speed-type cursed client quotes!',
    icon: Keyboard,
    gradient: 'from-green-500 to-emerald-600',
    emoji: '⌨️',
    isNew: true,
    difficulty: 'Variable',
  },
  memory: {
    title: 'Memory Match',
    desc: 'Classic memory with a twist!',
    icon: Brain,
    gradient: 'from-orange-500 to-amber-600',
    emoji: '🧠',
    difficulty: 'Easy',
  },
  sliding: {
    title: 'Sliding Puzzle',
    desc: 'Slide tiles to solve!',
    icon: Grid3x3,
    gradient: 'from-purple-500 to-pink-600',
    emoji: '🧩',
    difficulty: 'Hard',
  },
  lightsout: {
    title: 'Lights Out',
    desc: 'Turn off all the lights!',
    icon: Lightbulb,
    gradient: 'from-yellow-500 to-orange-600',
    emoji: '💡',
    difficulty: 'Medium',
  },
};

// Fun worker messages that rotate
const WORKER_MESSAGES = [
  { emoji: '⚡', name: 'Bolt', text: "Slides are cooking! Play a game?" },
  { emoji: '🎨', name: 'Pixel', text: "I'm making it look PERFECT. Entertain yourself!" },
  { emoji: '☕', name: 'Bean', text: "Grab a virtual coffee while we work!" },
  { emoji: '📊', name: 'Data', text: "Optimizing layouts... go have fun!" },
  { emoji: '🐛', name: 'Bug', text: "Testing for Comic Sans... play while I check!" },
];

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
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);
  const [completed, setCompleted] = useState(false);
  const [firstSlideDone, setFirstSlideDone] = useState(false);
  const [currentWorkerMessage, setCurrentWorkerMessage] = useState(0);
  const timerRef = useRef<number | null>(null);
  const hasArmedRef = useRef(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState<number>(240);

  const isGenerating = deckState === 'creating' || deckState === 'generating' || deckState === 'pending';
  const isComplete = deckState === 'completed';

  // Rotate worker messages
  useEffect(() => {
    if (!showOverlay || activeGame) return;
    const interval = setInterval(() => {
      setCurrentWorkerMessage(m => (m + 1) % WORKER_MESSAGES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [showOverlay, activeGame]);

  // Arm a 5s timer when generation (re)starts
  useEffect(() => {
    if (isVisibleOverride) {
      setShowOverlay(true);
      return;
    }

    if (showPrompt || showOverlay) {
      if (isComplete) {
        setCompleted(true);
      }
      return;
    }

    if (isGenerating && !isComplete && !hasArmedRef.current) {
      const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
      const elapsed = Date.now() - startMs;
      const remaining = Math.max(0, 5000 - elapsed);

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

  // Track when slide 1 completes
  useEffect(() => {
    const onSlideCompleted = (e: any) => {
      const idx = e?.detail?.slide_index ?? e?.detail?.slideIndex;
      if (typeof idx === 'number' && idx === 0) {
        setFirstSlideDone(true);
      }
    };
    window.addEventListener('slide_completed', onSlideCompleted as EventListener);
    return () => window.removeEventListener('slide_completed', onSlideCompleted as EventListener);
  }, []);

  const handleDismiss = () => {
    setShowOverlay(false);
    setActiveGame(null);
  };

  // Fit game board within available space
  useEffect(() => {
    if (!splitRef.current) return;
    const el = splitRef.current;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const gap = 12;
      const asideWidth = 260;
      const availableWidth = Math.max(0, rect.width - asideWidth - gap);
      const availableHeight = rect.height;
      const size = Math.floor(Math.min(availableWidth, availableHeight) - 16);
      setBoardSize(size);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!showPrompt && !showOverlay) return null;

  const workerMessage = WORKER_MESSAGES[currentWorkerMessage];

  return (
    <div 
      className={cn(
        'absolute z-[60] transition-all duration-500 ease-out',
        showOverlay ? 'inset-0' : ''
      )} 
      style={
        showOverlay 
          ? { inset: 0 } 
          : mountInsideSlide 
            ? { top: 20, left: 20 } 
            : { top: '1rem', left: '1rem' }
      }
    >
      {/* Minimized prompt button */}
      <AnimatePresence>
        {!showOverlay && showPrompt && (
          <motion.button
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.3, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="group relative px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-shadow border border-white/20"
            onClick={() => setShowOverlay(true)}
          >
            <span className="relative z-10 flex items-center gap-2">
              <motion.span
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                <Gamepad2 className="w-5 h-5" />
              </motion.span>
              <span className="font-bold">Play Games!</span>
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
              >
                🎮
              </motion.span>
            </span>
            <motion.div
              className="absolute -top-1 -right-1"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <Sparkles className="w-4 h-4 text-yellow-300" />
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>
      
      {/* Expanded overlay */}
      <AnimatePresence>
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(
              'rounded-2xl shadow-2xl border border-white/10 backdrop-blur-xl',
              'overflow-hidden h-full w-full flex flex-col'
            )}
            style={{ 
              background: 'linear-gradient(135deg, rgba(15,15,35,0.98) 0%, rgba(30,30,60,0.98) 100%)',
            }}
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-start gap-3 border-b border-white/10">
              <motion.div 
                className="h-12 w-12 rounded-xl flex items-center justify-center shadow-lg"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                style={{
                  background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                }}
              >
                <Gamepad2 className="w-6 h-6 text-white" />
              </motion.div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-black text-white flex items-center gap-2">
                  🏭 The Slide Factory Arcade
                  <motion.span
                    animate={{ y: [0, -3, 0] }}
                    transition={{ repeat: Infinity, duration: 0.5 }}
                  >
                    ✨
                  </motion.span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentWorkerMessage}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="mt-1 text-sm text-gray-400 flex items-center gap-2"
                  >
                    <span>{workerMessage.emoji}</span>
                    <span className="font-medium text-gray-300">{workerMessage.name}:</span>
                    <span>"{workerMessage.text}"</span>
                  </motion.div>
                </AnimatePresence>
              </div>
              <button
                aria-label="Close"
                className="group p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                onClick={handleDismiss}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status banners */}
            {(firstSlideDone || completed) && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="mx-5 mt-2 mb-1 px-3 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                style={{ background: 'rgba(16,185,129,0.15)', color: 'rgb(52,211,153)' }}
              >
                <motion.span
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  ✨
                </motion.span>
                {completed ? 'Your slides are ready! 🎉' : 'First slide done — you can exit anytime!'}
              </motion.div>
            )}

            {/* Game chooser */}
            {!activeGame && (
              <div className="px-5 pb-5 pt-3 flex-1 overflow-auto">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {(Object.entries(GAME_DATA) as [GameKey, typeof GAME_DATA[GameKey]][]).map(([key, game], idx) => {
                    const Icon = game.icon;
                    return (
                      <motion.button
                        key={key}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setActiveGame(key)}
                        className={cn(
                          "relative rounded-xl border border-white/10 text-left p-4 transition-all",
                          `bg-gradient-to-br ${game.gradient}`,
                          "hover:shadow-lg hover:shadow-purple-500/20"
                        )}
                      >
                        {/* Badges */}
                        <div className="absolute -top-2 -right-2 flex gap-1">
                          {game.isNew && (
                            <motion.span
                              className="px-2 py-0.5 bg-yellow-400 rounded-full text-xs font-bold text-black"
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ repeat: Infinity, duration: 1 }}
                            >
                              NEW
                            </motion.span>
                          )}
                          {game.isHot && (
                            <motion.span
                              className="px-2 py-0.5 bg-red-500 rounded-full text-xs font-bold text-white"
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ repeat: Infinity, duration: 0.8 }}
                            >
                              🔥 HOT
                            </motion.span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white/20 rounded-lg">
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-white flex items-center gap-2">
                              {game.title}
                              <span>{game.emoji}</span>
                            </div>
                            <p className="text-xs text-white/70 mt-0.5">{game.desc}</p>
                            <span className="text-[10px] text-white/50 mt-1 inline-block">
                              {game.difficulty}
                            </span>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active game container */}
            {activeGame && (
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Game header */}
                <div className="px-4 py-2 flex items-center justify-between border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{GAME_DATA[activeGame].emoji}</span>
                    <span className="font-bold text-white">{GAME_DATA[activeGame].title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
                      onClick={() => setActiveGame(null)}
                    >
                      Switch Game
                    </button>
                    <button
                      className="text-xs px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-medium transition-colors"
                      onClick={handleDismiss}
                    >
                      Close
                    </button>
                  </div>
                </div>

                {/* Game area */}
                <div className="flex-1 overflow-hidden">
                  <Suspense fallback={
                    <div className="w-full h-full flex items-center justify-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full"
                      />
                    </div>
                  }>
                    {activeGame === 'factory' && (
                      <SlideFactoryGame 
                        onClose={() => setActiveGame(null)}
                        slideProgress={totalSlides ? { current: currentSlideIndex || 0, total: totalSlides } : undefined}
                      />
                    )}
                    {activeGame === 'fonts' && (
                      <FontFrenzy onComplete={() => {}} />
                    )}
                    {activeGame === 'typing' && (
                      <div className="w-full h-full p-6 flex items-center justify-center overflow-auto">
                        <div className="max-w-md w-full">
                          <TypeRacer />
                        </div>
                      </div>
                    )}
                    {activeGame === 'memory' && (
                      <div className="w-full h-full p-6 flex items-center justify-center overflow-auto">
                        <div className="max-w-sm w-full">
                          <MemoryMatch />
                        </div>
                      </div>
                    )}
                    {activeGame === 'sliding' && (
                      <div className="w-full h-full p-6 flex items-center justify-center overflow-auto">
                        <div className="max-w-sm w-full">
                          <SlidingPuzzle size={3} />
                        </div>
                      </div>
                    )}
                    {activeGame === 'lightsout' && (
                      <div className="w-full h-full p-6 flex items-center justify-center overflow-auto">
                        <div className="max-w-sm w-full">
                          <LightsOut size={5} />
                        </div>
                      </div>
                    )}
                  </Suspense>
                </div>

                {/* Slide progress indicator */}
                {totalSlides && totalSlides > 0 && (
                  <div className="px-4 py-2 border-t border-white/10">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>Building slides in background...</span>
                      <span className="text-white font-medium">
                        📄 {currentSlideIndex || 0} / {totalSlides}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${((currentSlideIndex || 0) / totalSlides) * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GenerationGameOverlay;
