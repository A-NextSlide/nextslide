import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

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
  const [animatedProgress, setAnimatedProgress] = useState(progress || 0);
  const [highWaterMark, setHighWaterMark] = useState(progress || 0); // Track the highest progress we've seen
  const [localProgress, setLocalProgress] = useState(progress || 0);
  const [lastPhase, setLastPhase] = useState(phase);
  
  // Find current phase
  const currentPhaseIndex = phases.findIndex(p => phase === p.key);
  const currentPhaseData = phases[currentPhaseIndex] || phases[0];
  
  // Calculate actual progress based on phase and backend progress
  const calculateActualProgress = (backendProgress: number, currentPhase: string) => {
    const phaseData = phases.find(p => p.key === currentPhase);
    if (!phaseData) return backendProgress;
    
    // If backend sends phase-specific progress (0-100 within phase)
    // convert it to overall progress
    if (backendProgress <= 100) {
      const phaseSize = phaseData.maxProgress - phaseData.minProgress;
      const phaseProgress = (backendProgress / 100) * phaseSize;
      return Math.min(phaseData.minProgress + phaseProgress, phaseData.maxProgress);
    }
    
    return backendProgress;
  };
  
  // Update progress from backend
  useEffect(() => {
    console.log(`[EnhancedDeckProgress] Progress update:`, {
      backendProgress: progress,
      phase,
      currentHighWaterMark: highWaterMark
    });

    // Use backend progress directly - backend already calculates correct percentages
    const actualProgress = progress;

    // Never go backwards
    if (actualProgress >= highWaterMark) {
      setHighWaterMark(actualProgress);
      setLocalProgress(actualProgress);
    }
  }, [progress, phase, totalSlides, completedSlides.size]);
  
  // Handle phase transitions
  useEffect(() => {
    if (phase !== lastPhase) {
      console.log(`[Progress] Phase transition: ${lastPhase} -> ${phase}`);
      setLastPhase(phase);
      
      // When transitioning to a new phase, ensure we're at least at the phase minimum
      const minForNewPhase = currentPhaseData.minProgress;
      
      // Only update if we need to move forward to the new phase minimum
      if (highWaterMark < minForNewPhase) {
        console.log(`[Progress] Advancing to phase minimum: ${minForNewPhase}`);
        setLocalProgress(minForNewPhase);
        setHighWaterMark(minForNewPhase);
      }
    }
  }, [phase, lastPhase, currentPhaseData.minProgress, highWaterMark]);
  
  // No auto-increment - backend sends accurate real-time progress updates
  useEffect(() => {
    // Only ensure completion at 100%
    if (phase === 'generation_complete' || phase === 'finalization' || phase === 'complete' || localProgress >= 100) {
      setLocalProgress(100);
      return;
    }
  }, [phase, localProgress]);
  
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

  // Map backend substep keys to human-friendly labels (and remove bullet dot)
  const getSubstepLabel = (key?: string, slideIndex?: number): string | undefined => {
    if (!key) return undefined;
    switch (key) {
      case 'theme_creation':
        return 'Creating visual theme';
      case 'palette_generation':
        return 'Generating color palette';
      case 'designing_layouts':
        return 'Designing editorial layouts';
      case 'designing_slide_layout':
        return 'Creating slide structures';
      case 'layouts_complete':
        return 'Blueprint complete';
      case 'preparing_context':
        return 'Preparing slide context';
      case 'rag_lookup':
        return 'Finding best design patterns';
      case 'ai_generation':
        return 'AI Generation';
      case 'saving':
        return 'Saving slide';
      default:
        // Fallback: convert snake_case to Title Case
        try {
          return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        } catch {
          return undefined;
        }
    }
  };

  return (
    <div className="space-y-3 w-full" style={{ minWidth: 0 }}>
      {/* Current step - prominent */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">
          {phases[Math.max(currentPhaseIndex, progressPhaseIndex)]?.label || 'Starting'}
        </span>
        {substep && !isComplete && (() => {
          const label = getSubstepLabel(substep, currentSlide);
          return label ? (
            <span className="text-xs text-orange-500">{label}</span>
          ) : null;
        })()}
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