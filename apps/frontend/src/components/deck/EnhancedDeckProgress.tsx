import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { CheckCircle2, Gamepad2 } from 'lucide-react';

interface EnhancedDeckProgressProps {
  phase: string;
  progress: number;
  message: string;
  currentSlide?: number;
  totalSlides?: number;
  slidesInProgress?: Set<number>;
  completedSlides?: Set<number>;
  errors?: Map<number, string>;
  substep?: string;
}

export const EnhancedDeckProgress: React.FC<EnhancedDeckProgressProps> = ({
  phase,
  progress,
  message,
  currentSlide,
  totalSlides = 0,
  slidesInProgress = new Set(),
  completedSlides = new Set(),
  errors = new Map(),
  substep
}) => {
  const phases = [
    { key: 'initialization', label: 'Initializing', minProgress: 0, maxProgress: 15 },
    { key: 'theme_generation', label: 'Creating Theme', minProgress: 15, maxProgress: 30 },
    { key: 'layout_design', label: 'Creating Blueprint', minProgress: 30, maxProgress: 40 },
    { key: 'image_collection', label: 'Processing Media', minProgress: 40, maxProgress: 55 },
    { key: 'slide_generation', label: 'Generating Slides', minProgress: 55, maxProgress: 95 },
    { key: 'finalization', label: 'Finalizing', minProgress: 95, maxProgress: 100 }
  ];

  // Smooth animated progress that creeps up
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [highWaterMark, setHighWaterMark] = useState(0); // Track the highest progress we've seen
  const [localProgress, setLocalProgress] = useState(0);
  const [lastPhase, setLastPhase] = useState(phase);
  const [creepProgress, setCreepProgress] = useState(0); // For slow creep during initial phases

  // Find current phase
  const currentPhaseIndex = phases.findIndex(p => phase === p.key);
  const currentPhaseData = phases[currentPhaseIndex] || phases[0];

  // Slow creep timer for pre-slide phases
  useEffect(() => {
    // Only creep during early phases (before slide_generation)
    const isEarlyPhase = ['initialization', 'theme_generation', 'layout_design', 'image_collection'].includes(phase);

    if (isEarlyPhase && creepProgress < 20) {
      // Slow creep: increment by 0.5% every 500ms (takes ~20 seconds to reach 20%)
      const timer = setInterval(() => {
        setCreepProgress(prev => Math.min(prev + 0.5, 20));
      }, 500);
      return () => clearInterval(timer);
    }
  }, [phase, creepProgress]);

  // Calculate progress based on phase
  // Pre-slide phases: use slow creep (0-20%)
  // Slide generation: use (100 - totalSlides + completedSlides) approach
  useEffect(() => {
    let calculatedProgress = 0;

    if (phase === 'slide_generation' && totalSlides > 0) {
      // Once slides start generating: base is (100 - totalSlides), then add completed slides
      // e.g., 12 slides: starts at 88%, each slide adds ~1%
      const baseProgress = Math.max(20, 100 - totalSlides); // At least 20% to show progress
      const slideProgress = completedSlides.size;
      calculatedProgress = Math.min(baseProgress + slideProgress, 99); // Cap at 99% until finalization
    } else if (phase === 'finalization' || phase === 'generation_complete' || phase === 'complete') {
      calculatedProgress = 100;
    } else {
      // Early phases: use slow creep
      calculatedProgress = creepProgress;
    }

    // Never go backwards
    if (calculatedProgress > highWaterMark) {
      setHighWaterMark(calculatedProgress);
      setLocalProgress(calculatedProgress);
    }
  }, [phase, totalSlides, completedSlides.size, creepProgress, highWaterMark]);
  
  // Handle phase transitions
  useEffect(() => {
    if (phase !== lastPhase) {
      setLastPhase(phase);

      // When entering slide_generation, jump to base progress if we haven't already
      if (phase === 'slide_generation' && totalSlides > 0 && highWaterMark < 20) {
        const baseProgress = Math.max(20, 100 - totalSlides);
        setHighWaterMark(baseProgress);
        setLocalProgress(baseProgress);
      }
    }
  }, [phase, lastPhase, totalSlides, highWaterMark]);
  
  // Smoothly animate to the local progress
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimatedProgress(current => {
        const target = localProgress;
        const diff = target - current;
        
        if (Math.abs(diff) < 0.5) {
          clearInterval(timer);
          return target;
        }
        
        // Animate at 20% of the difference per frame
        return current + diff * 0.2;
      });
    }, 50);
    
    return () => clearInterval(timer);
  }, [localProgress]);

  const isComplete = phase === 'generation_complete' || phase === 'finalization' || phase === 'complete' || progress >= 100;

  // Game state - tracks if user has opened the game
  const [gameOpen, setGameOpen] = useState(false);

  // Listen for game close events
  useEffect(() => {
    const handleGameClose = () => setGameOpen(false);
    window.addEventListener('hide-waiting-game', handleGameClose);
    return () => window.removeEventListener('hide-waiting-game', handleGameClose);
  }, []);

  const openGame = () => {
    setGameOpen(true);
    window.dispatchEvent(new CustomEvent('show-waiting-game'));
  };

  // Track the maximum phase index we've reached to prevent going backwards
  const [maxPhaseIndex, setMaxPhaseIndex] = useState(-1);
  
  useEffect(() => {
    if (currentPhaseIndex > maxPhaseIndex) {
      setMaxPhaseIndex(currentPhaseIndex);
    }
  }, [currentPhaseIndex, maxPhaseIndex]);

  // Ensure phase progress aligns with actual progress percentage
  const getPhaseFromProgress = (progressValue: number) => {
    for (let i = 0; i < phases.length; i++) {
      if (progressValue >= phases[i].minProgress && progressValue < phases[i].maxProgress) {
        return i;
      }
    }
    return phases.length - 1;
  };

  const progressPhaseIndex = getPhaseFromProgress(animatedProgress);

  return (
    <div className="space-y-2 w-full" style={{ minWidth: 0 }}>
      {/* Current step - prominent */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">
          {phases[Math.max(currentPhaseIndex, progressPhaseIndex)]?.label || 'Starting'}
        </span>
      </div>

      {/* Phase dots - horizontal row */}
      <div className="flex items-center gap-1.5">
        {phases.map((p, index) => {
          let isPhaseCompleted = false;
          let isPhaseActive = false;

          if (isComplete) {
            isPhaseCompleted = true;
          } else {
            const effectivePhaseIndex = Math.max(currentPhaseIndex, progressPhaseIndex);
            isPhaseCompleted = index < effectivePhaseIndex;
            isPhaseActive = index === effectivePhaseIndex;
          }

          return (
            <React.Fragment key={p.key}>
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-all duration-300",
                  isPhaseCompleted ? "bg-orange-500" :
                  isPhaseActive ? "bg-orange-500" :
                  "bg-muted-foreground/25"
                )}
                title={p.label}
              />
              {index < phases.length - 1 && (
                <div className={cn(
                  "w-3 h-0.5 rounded-full transition-colors",
                  isPhaseCompleted ? "bg-orange-500" : "bg-muted-foreground/20"
                )} />
              )}
            </React.Fragment>
          );
        })}
        <span className="text-[10px] text-muted-foreground ml-2">
          {Math.max(currentPhaseIndex, progressPhaseIndex) + 1}/{phases.length}
        </span>
      </div>

      {/* Progress bar */}
      {animatedProgress > 0 && (
        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${isComplete ? 100 : Math.min(100, Math.max(0, animatedProgress))}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
          />
        </div>
      )}

      {/* Play game button - small, grey, left-aligned */}
      {!isComplete && !gameOpen && (
        <button
          onClick={openGame}
          className="mt-1 py-1 px-2 rounded text-[10px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-all flex items-center gap-1.5"
        >
          <Gamepad2 className="w-3 h-3" />
          <span>This takes a minute. Play a game?</span>
        </button>
      )}
      {gameOpen && !isComplete && (
        <span className="mt-1 text-[10px] text-muted-foreground/50 flex items-center gap-1.5">
          <Gamepad2 className="w-3 h-3" />
          Game running in slide area
        </span>
      )}

      {/* Slide grid */}
      {phase === 'slide_generation' && totalSlides > 0 && !isComplete && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            {Array.from({ length: totalSlides }, (_, i) => {
              const isSlideCompleted = completedSlides.has(i);
              const isInProgress = slidesInProgress.has(i);
              const hasError = errors.has(i);

              return (
                <div
                  key={i}
                  className={cn(
                    "w-5 h-4 rounded text-[9px] flex items-center justify-center font-medium transition-colors",
                    isSlideCompleted && "bg-green-500 text-white",
                    isInProgress && "bg-orange-500 text-white",
                    hasError && "bg-red-500 text-white",
                    !isSlideCompleted && !isInProgress && !hasError && "bg-muted border border-muted-foreground/20 text-muted-foreground"
                  )}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {completedSlides.size} of {totalSlides} slides complete
          </div>
        </div>
      )}

      {/* Completion */}
      {isComplete && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-2.5 py-1.5 rounded-md"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-medium">Your presentation is ready</span>
        </motion.div>
      )}
    </div>
  );
}; 