import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X, Gamepad2, Sparkles, Zap, Coffee, Palette, Bug, Brain, Keyboard, Type, Factory, Hammer } from 'lucide-react';

// Lazy load games for better performance
const SlideFactoryGame = lazy(() => import('./games/SlideFactoryGame'));
const TypeRacer = lazy(() => import('./games/TypeRacer'));
const FontFrenzy = lazy(() => import('./games/FontFrenzy'));
const MemoryMatch = lazy(() => import('./games/MemoryMatch'));
const SlidingPuzzle = lazy(() => import('./games/SlidingPuzzle'));
const LightsOut = lazy(() => import('./games/LightsOut'));

interface SlideFactoryOverlayProps {
  isVisible: boolean;
  slideProgress?: { current: number; total: number };
  onClose?: () => void;
}

// Fun worker characters who narrate what's happening
const WORKERS = [
  { id: 'bolt', name: 'Bolt', emoji: '⚡', role: 'Speed Optimizer', personality: 'Hyperactive caffeine gremlin' },
  { id: 'pixel', name: 'Pixel', emoji: '🎨', role: 'Design Artist', personality: 'Perfectionist with color anxiety' },
  { id: 'data', name: 'Data', emoji: '📊', role: 'Chart Whisperer', personality: 'Speaks only in metrics' },
  { id: 'bug', name: 'Bug', emoji: '🐛', role: 'Quality Tester', personality: 'Paranoid but thorough' },
  { id: 'bean', name: 'Bean', emoji: '☕', role: 'Morale Officer', personality: 'Literally runs on coffee' },
];

// Funny stage messages with character attribution
const STAGE_MESSAGES = {
  initialization: [
    { worker: 'bolt', text: "Warming up the hamster wheels... 🐹" },
    { worker: 'bean', text: "First, we caffeinate the algorithms..." },
    { worker: 'bug', text: "Running pre-flight checks... so far so good!" },
  ],
  theme_generation: [
    { worker: 'pixel', text: "Mixing the perfect color palette... NO not that purple!" },
    { worker: 'pixel', text: "Arguing with the gradient generator... again." },
    { worker: 'bolt', text: "Speed-running through 47 font combinations!" },
  ],
  image_collection: [
    { worker: 'data', text: "Searching the infinite image void..." },
    { worker: 'bean', text: "I found a nice stock photo of people pointing at laptops!" },
    { worker: 'bug', text: "Making sure no image has a watermark... or a hidden banana." },
  ],
  slide_generation: [
    { worker: 'pixel', text: "Placing elements with pixel-perfect precision... mostly." },
    { worker: 'bolt', text: "SLIDES GO BRRRR ⚡" },
    { worker: 'data', text: "Optimizing layout algorithms... the math is mathing!" },
    { worker: 'bug', text: "Testing each slide for Comic Sans... coast is clear!" },
    { worker: 'bean', text: "This slide looks great! *sips coffee*" },
  ],
  finalization: [
    { worker: 'bolt', text: "Sprint to the finish line! 🏃‍♂️💨" },
    { worker: 'pixel', text: "Adding final polish... and a sprinkle of magic ✨" },
    { worker: 'bug', text: "One final bug sweep... all clear!" },
    { worker: 'bean', text: "Presentation complete! Time for a coffee break! ☕" },
  ],
};

// Game definitions with fun descriptions
const GAMES = [
  { 
    id: 'factory', 
    name: 'Slide Factory', 
    desc: 'Run the chaotic slide factory! Dodge feedback, collect power-ups!',
    icon: Factory,
    gradient: 'from-indigo-500 to-purple-600',
    emoji: '🏭',
    difficulty: 'Medium',
    time: '~2 min',
    isNew: true,
  },
  { 
    id: 'nightmares', 
    name: 'Presentation Nightmares', 
    desc: 'SMASH annoying client feedback before it escapes! Now with BOSSES!',
    icon: Hammer,
    gradient: 'from-red-500 to-orange-600',
    emoji: '🔨',
    difficulty: 'Easy',
    time: '~1 min',
    isNew: false,
  },
  { 
    id: 'typing', 
    name: 'Type Fighter', 
    desc: 'Speed-type cursed client quotes! How fast can you type "make it pop"?',
    icon: Keyboard,
    gradient: 'from-green-500 to-emerald-600',
    emoji: '⌨️',
    difficulty: 'Variable',
    time: '~30 sec',
    isNew: true,
  },
  { 
    id: 'fonts', 
    name: 'Font Frenzy', 
    desc: 'Defend typography! Tap to destroy Comic Sans before it infects everything!',
    icon: Type,
    gradient: 'from-pink-500 to-rose-600',
    emoji: '🔤',
    difficulty: 'Medium',
    time: '~45 sec',
    isNew: true,
  },
  { 
    id: 'memory', 
    name: 'Memory Match', 
    desc: 'Classic memory game with presentation-themed emojis!',
    icon: Brain,
    gradient: 'from-amber-500 to-orange-600',
    emoji: '🧠',
    difficulty: 'Easy',
    time: '~1 min',
    isNew: false,
  },
  { 
    id: 'sliding', 
    name: 'Sliding Puzzle', 
    desc: 'Slide tiles to solve the puzzle. Brain stretching guaranteed!',
    icon: Sparkles,
    gradient: 'from-cyan-500 to-blue-600',
    emoji: '🧩',
    difficulty: 'Hard',
    time: '~2 min',
    isNew: false,
  },
];

type GameId = typeof GAMES[number]['id'];

const SlideFactoryOverlay: React.FC<SlideFactoryOverlayProps> = ({
  isVisible,
  slideProgress,
  onClose,
}) => {
  const [showGames, setShowGames] = useState(false);
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [currentStage, setCurrentStage] = useState<keyof typeof STAGE_MESSAGES>('initialization');
  const [currentMessage, setCurrentMessage] = useState(0);
  const [workerMood, setWorkerMood] = useState<'working' | 'celebrating' | 'panicking'>('working');

  // Cycle through stage messages
  useEffect(() => {
    if (!isVisible || showGames) return;
    
    const messages = STAGE_MESSAGES[currentStage];
    const interval = setInterval(() => {
      setCurrentMessage(m => (m + 1) % messages.length);
    }, 4000);
    
    return () => clearInterval(interval);
  }, [isVisible, currentStage, showGames]);

  // Update stage based on progress
  useEffect(() => {
    if (!slideProgress) {
      setCurrentStage('initialization');
      return;
    }
    
    const progress = (slideProgress.current / slideProgress.total) * 100;
    
    if (progress === 0) {
      setCurrentStage('initialization');
    } else if (progress < 20) {
      setCurrentStage('theme_generation');
    } else if (progress < 50) {
      setCurrentStage('image_collection');
    } else if (progress < 95) {
      setCurrentStage('slide_generation');
    } else {
      setCurrentStage('finalization');
      setWorkerMood('celebrating');
    }
  }, [slideProgress]);

  // Get current message with worker
  const messageData = useMemo(() => {
    const messages = STAGE_MESSAGES[currentStage];
    const data = messages[currentMessage % messages.length];
    const worker = WORKERS.find(w => w.id === data.worker) || WORKERS[0];
    return { ...data, workerData: worker };
  }, [currentStage, currentMessage]);

  // Close game
  const handleCloseGame = () => {
    setActiveGame(null);
  };

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0d0d1f 100%)',
      }}
    >
      {/* Close button - always visible */}
      {onClose && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="absolute top-4 right-4 z-[110] p-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl border border-white/20 text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </motion.button>
      )}

      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              background: `rgba(${Math.random() * 255}, ${Math.random() * 100 + 155}, 255, 0.3)`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.6, 0.2],
              scale: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 6 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Conveyor belt animation at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-16 overflow-hidden">
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-8 flex items-center"
          style={{
            background: 'linear-gradient(90deg, #2a2a4a, #3a3a5a)',
            borderTop: '2px solid #4a4a6a',
          }}
        >
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="w-8 h-2 bg-gray-600 rounded mx-2 flex-shrink-0"
              animate={{ x: [-100, 0] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'linear',
                delay: i * 0.2,
              }}
            />
          ))}
        </motion.div>
      </div>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {activeGame ? (
          // Full-screen game
          <motion.div
            key="game"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-4 rounded-2xl overflow-hidden shadow-2xl border border-white/10"
          >
            <Suspense fallback={
              <div className="w-full h-full flex items-center justify-center bg-slate-900">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full"
                />
              </div>
            }>
              {activeGame === 'factory' && <SlideFactoryGame onClose={handleCloseGame} slideProgress={slideProgress} />}
              {activeGame === 'nightmares' && (
                <div className="w-full h-full relative">
                  {/* Import SlideAreaGame dynamically or use a wrapper */}
                  <FontFrenzy onComplete={handleCloseGame} />
                  <button
                    onClick={handleCloseGame}
                    className="absolute top-4 right-4 z-50 p-2 bg-red-500 hover:bg-red-400 rounded-full text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
              {activeGame === 'typing' && (
                <div className="w-full h-full p-8 bg-slate-900 flex items-center justify-center">
                  <div className="max-w-lg w-full">
                    <TypeRacer />
                    <button
                      onClick={handleCloseGame}
                      className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium"
                    >
                      Back to Factory
                    </button>
                  </div>
                </div>
              )}
              {activeGame === 'fonts' && <FontFrenzy onComplete={handleCloseGame} />}
              {activeGame === 'memory' && (
                <div className="w-full h-full p-8 bg-slate-900 flex items-center justify-center">
                  <div className="max-w-md w-full">
                    <MemoryMatch />
                    <button
                      onClick={handleCloseGame}
                      className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium"
                    >
                      Back to Factory
                    </button>
                  </div>
                </div>
              )}
              {activeGame === 'sliding' && (
                <div className="w-full h-full p-8 bg-slate-900 flex items-center justify-center">
                  <div className="max-w-md w-full">
                    <SlidingPuzzle size={3} />
                    <button
                      onClick={handleCloseGame}
                      className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium"
                    >
                      Back to Factory
                    </button>
                  </div>
                </div>
              )}
            </Suspense>
          </motion.div>
        ) : showGames ? (
          // Game selection grid
          <motion.div
            key="game-select"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl w-full mx-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-black text-white flex items-center gap-3">
                  <motion.span
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    🎮
                  </motion.span>
                  Choose Your Adventure!
                </h2>
                <p className="text-gray-400 mt-1">Your slides are cooking. Play while you wait!</p>
              </div>
              <button
                onClick={() => setShowGames(false)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Game grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {GAMES.map((game, i) => {
                const Icon = game.icon;
                return (
                  <motion.button
                    key={game.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setActiveGame(game.id)}
                    className={cn(
                      "relative p-5 rounded-2xl text-left transition-all",
                      "bg-gradient-to-br border border-white/10",
                      game.gradient,
                      "hover:shadow-2xl hover:shadow-purple-500/20"
                    )}
                  >
                    {/* NEW badge */}
                    {game.isNew && (
                      <motion.div
                        className="absolute -top-2 -right-2 px-2 py-0.5 bg-yellow-400 rounded-full text-xs font-bold text-black"
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ repeat: Infinity, duration: 1 }}
                      >
                        NEW!
                      </motion.div>
                    )}
                    
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-white/20 rounded-xl">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-lg font-bold text-white flex items-center gap-2">
                          {game.name}
                          <span className="text-xl">{game.emoji}</span>
                        </div>
                        <p className="text-sm text-white/80 mt-1 line-clamp-2">{game.desc}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-white/60">
                          <span>{game.difficulty}</span>
                          <span>•</span>
                          <span>{game.time}</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Progress indicator at bottom */}
            {slideProgress && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Slides building in background...</span>
                  <span className="text-sm font-bold text-white">
                    {slideProgress.current} / {slideProgress.total}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(slideProgress.current / slideProgress.total) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </motion.div>
            )}
          </motion.div>
        ) : (
          // Main loading view with workers
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-2xl w-full mx-4 text-center"
          >
            {/* Factory title */}
            <motion.div
              initial={{ y: -20 }}
              animate={{ y: 0 }}
              className="mb-8"
            >
              <motion.h1
                className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-orange-400"
                animate={{ backgroundPosition: ['0%', '100%', '0%'] }}
                transition={{ duration: 5, repeat: Infinity }}
                style={{ backgroundSize: '200%' }}
              >
                🏭 THE SLIDE FACTORY 🏭
              </motion.h1>
              <p className="text-gray-400 mt-2 text-lg">
                Our finest robots are crafting your presentation!
              </p>
            </motion.div>

            {/* Worker characters */}
            <div className="flex justify-center gap-3 mb-8">
              {WORKERS.map((worker, i) => (
                <motion.div
                  key={worker.id}
                  className={cn(
                    "relative p-3 rounded-xl transition-all",
                    messageData.worker === worker.id 
                      ? "bg-white/20 scale-110 shadow-lg shadow-purple-500/30" 
                      : "bg-white/5"
                  )}
                  animate={{
                    y: workerMood === 'celebrating' ? [0, -10, 0] : [0, -3, 0],
                    rotate: workerMood === 'panicking' ? [-5, 5, -5] : 0,
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: workerMood === 'celebrating' ? 0.5 : 1,
                    delay: i * 0.1,
                  }}
                >
                  <span className="text-3xl">{worker.emoji}</span>
                  {messageData.worker === worker.id && (
                    <motion.div
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-green-400 rounded-full"
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ repeat: Infinity, duration: 0.5 }}
                    />
                  )}
                </motion.div>
              ))}
            </div>

            {/* Message bubble */}
            <motion.div
              key={currentMessage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-8"
            >
              <div className="inline-block p-4 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{messageData.workerData.emoji}</span>
                  <span className="font-bold text-white">{messageData.workerData.name}</span>
                  <span className="text-xs text-gray-400">• {messageData.workerData.role}</span>
                </div>
                <p className="text-lg text-gray-200">{messageData.text}</p>
              </div>
            </motion.div>

            {/* Progress bar */}
            {slideProgress && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="text-gray-400">Building slides...</span>
                  <span className="font-bold text-white">
                    📄 {slideProgress.current} / {slideProgress.total}
                  </span>
                </div>
                <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 rounded-full relative overflow-hidden"
                    initial={{ width: 0 }}
                    animate={{ width: `${(slideProgress.current / slideProgress.total) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  >
                    {/* Shimmer effect */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                      animate={{ x: [-200, 200] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </motion.div>
                </div>
              </div>
            )}

            {/* Play games button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowGames(true)}
              className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl font-bold text-white text-lg shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-shadow"
            >
              <span className="flex items-center gap-3">
                <Gamepad2 className="w-6 h-6" />
                Play Games While You Wait!
                <motion.span
                  animate={{ rotate: [0, 20, -20, 0] }}
                  transition={{ repeat: Infinity, duration: 0.5 }}
                >
                  🎮
                </motion.span>
              </span>
              
              {/* Sparkle effects */}
              <motion.div
                className="absolute -top-1 -right-1"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <Sparkles className="w-5 h-5 text-yellow-300" />
              </motion.div>
            </motion.button>

            {/* Time estimate */}
            <p className="text-gray-500 mt-4 text-sm">
              ⏱️ Usually takes about 1-2 minutes
            </p>

            {/* Optional close button */}
            {onClose && (
              <button
                onClick={onClose}
                className="mt-6 text-gray-500 hover:text-gray-300 text-sm underline"
              >
                I'll just wait here thanks
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Factory machinery decorations */}
      <div className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-8 pointer-events-none">
        {/* Gears */}
        <motion.div
          className="text-4xl opacity-20"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        >
          ⚙️
        </motion.div>
        <motion.div
          className="text-5xl opacity-20"
          animate={{ rotate: -360 }}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        >
          ⚙️
        </motion.div>
        <motion.div
          className="text-3xl opacity-20"
          animate={{ rotate: 360 }}
          transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
        >
          ⚙️
        </motion.div>
      </div>
    </motion.div>
  );
};

export default SlideFactoryOverlay;

