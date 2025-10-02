import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
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
    { key: 'image_collection', label: 'Processing Media', minProgress: 30, maxProgress: 55 },
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
    
    // Calculate the actual overall progress
    let actualProgress = progress;
    
    // Special handling for slide generation phase
    if (phase === 'slide_generation' && totalSlides > 0) {
      // Use the formula from the guide: 55 + (completedSlides / totalSlides) * 40
      actualProgress = 55 + (completedSlides.size / totalSlides) * 40;
    } else if (progress >= 0) {
      // For other phases, calculate based on phase range
      actualProgress = calculateActualProgress(progress, phase);
    }
    
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
  
  // Auto-increment progress - only for phases before slide generation
  useEffect(() => {
    // Only auto-increment if we're not complete
    if (phase === 'generation_complete' || localProgress >= 100) {
      setLocalProgress(100);
      return;
    }
    
    // Only auto-increment for early phases, not during slide generation
    if (phase === 'slide_generation') {
      return;
    }
    
    const interval = setInterval(() => {
      setLocalProgress(current => {
        // Determine safe increment limit based on phase
        let safeMax = currentPhaseData.maxProgress - 2; // Stop 2% before phase end
        
        // Only increment if we're below the safe maximum
        if (current < safeMax) {
          return current + 0.5; // Slower increment
        }
        
        return current;
      });
    }, 2000); // Increment every 2 seconds
    
    return () => clearInterval(interval);
  }, [phase, currentPhaseData.maxProgress]);
  
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

  const isComplete = phase === 'generation_complete' || progress >= 100;

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
    <div className="space-y-4 w-full" style={{ minWidth: 0 }}>
      {/* Vertical Phase Timeline - Always show this */}
      <div className="relative pl-4 w-full" style={{ minWidth: 0 }}>
        {phases.map((p, index) => {
          // Determine if this phase is active, completed, or pending
          let isPhaseCompleted = false;
          let isPhaseActive = false;
          
          if (isComplete) {
            // If generation is complete, all phases are completed
            isPhaseCompleted = true;
            isPhaseActive = false;
          } else {
            // Use the actual current phase index for active state
            const effectivePhaseIndex = Math.max(currentPhaseIndex, progressPhaseIndex);
            
            // A phase is completed if we've passed it
            isPhaseCompleted = index < effectivePhaseIndex;
            
            // A phase is active if it matches our current phase
            isPhaseActive = index === effectivePhaseIndex;
          }
          
          const isLast = index === phases.length - 1;
          
          return (
            <div key={p.key} className="relative" style={{ marginBottom: isLast ? '0' : '2rem' }}>
              {/* Phase Row */}
              <div className="flex items-center gap-3 relative w-full" style={{ minWidth: 0 }}>
                {/* Phase Dot - Animated fill */}
                <div className="relative">
                  {/* Outer ring */}
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full border-2 transition-all duration-500 z-10 relative",
                      isPhaseCompleted || isPhaseActive ? "border-orange-500" : "border-muted-foreground"
                    )}
                  />
                  {/* Inner fill - animated */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ 
                      scale: isPhaseCompleted ? 1 : isPhaseActive ? 0.5 : 0,
                      opacity: isPhaseCompleted ? 1 : isPhaseActive ? 1 : 0
                    }}
                    transition={{ 
                      duration: 0.3,
                      delay: isPhaseCompleted ? index * 0.1 : 0,
                      ease: "easeOut"
                    }}
                    className={cn(
                      "absolute inset-0.5 rounded-full",
                      isPhaseCompleted ? "bg-orange-500" : 
                       isPhaseActive ? "bg-orange-500" : 
                      "bg-transparent"
                    )}
                  />
                  {/* Active pulse ring */}
                  {false && isPhaseActive && !isComplete && (
                    <motion.div
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ 
                        scale: 1.5,
                        opacity: 0
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeOut"
                      }}
                      className="absolute inset-0 w-3 h-3 rounded-full border-2 border-orange-500"
                    />
                  )}
                </div>
                
                {/* Phase Label - hide when showing a substep to avoid duplicated/truncated leading character */}
                {!(isPhaseActive && substep && !isComplete) && (
                  <motion.span
                    initial={{ opacity: 0.5 }}
                    animate={{ 
                      opacity: isPhaseActive || isPhaseCompleted ? 1 : 0.5,
                      x: isPhaseActive || isPhaseCompleted ? 0 : -5
                    }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "text-sm font-medium truncate flex-1",
                      isPhaseActive || isPhaseCompleted ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {p.label}
                  </motion.span>
                )}
                
                {/* Substep indicator - shows inline */}
                {isPhaseActive && substep && !isComplete && (() => {
                  const label = getSubstepLabel(substep, currentSlide);
                  if (!label) return null;
                  return (
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={label}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="text-xs text-orange-600 dark:text-orange-400 ml-2 truncate flex-1"
                        style={{ maxWidth: '100%', minHeight: '16px', display: 'inline-flex', alignItems: 'center' }}
                      >
                        {label}
                      </motion.span>
                    </AnimatePresence>
                  );
                })()}
              </div>
              
              {/* Connecting Line - Animated fill */}
              {!isLast && (
                <div className="absolute left-[5px] top-4 w-0.5 h-8" style={{ height: '2rem' }}>
                  {/* Background line */}
                  <div className="absolute inset-0 bg-muted-foreground/30" />
                  {/* Animated fill line */}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ 
                      height: isPhaseCompleted ? '100%' : '0%'
                    }}
                    transition={{ 
                      duration: 0.5,
                      delay: isPhaseCompleted ? index * 0.1 + 0.2 : 0,
                      ease: "easeInOut"
                    }}
                    className="absolute top-0 left-0 w-full bg-orange-500"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress Bar and Status at Bottom */}
      <div className="space-y-2">
        {/* Progress Bar - show only when we have measurable progress (> 0) */}
        {animatedProgress > 0 && (
          <div className="relative">
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${isComplete ? 100 : Math.min(100, Math.max(0, animatedProgress))}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-orange-500 to-orange-600"
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-bold text-foreground">
                {isComplete ? '100' : Math.round(Math.max(0, animatedProgress))}%
              </span>
            </div>
          </div>
        )}
        
        {/* Status Message - Hide when complete */}
        {!isComplete && (
          <AnimatePresence mode="wait">
            <motion.div
              key={message}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="text-sm text-muted-foreground text-center"
            >
              {message}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Slide Grid - Only show during slide generation */}
        {phase === 'slide_generation' && totalSlides > 0 && !isComplete && (
          <div className="space-y-2 mt-3">
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: totalSlides }, (_, i) => {
                const isCompleted = completedSlides.has(i);
                const isInProgress = slidesInProgress.has(i);
                const hasError = errors.has(i);
                
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(i * 0.02, 0.2) }}
                    className={cn(
                      "aspect-[16/9] rounded-sm flex items-center justify-center text-[10px] font-medium transition-all duration-300",
                      isCompleted && "bg-green-500 text-white",
                      isInProgress && "bg-blue-500 text-white animate-pulse",
                      hasError && "bg-red-500 text-white",
                      !isCompleted && !isInProgress && !hasError && "bg-muted border border-border"
                    )}
                    title={
                      hasError ? `Error: ${errors.get(i)}` : 
                      isCompleted ? `Slide ${i + 1} completed` :
                      isInProgress ? `Generating slide ${i + 1}` :
                      `Slide ${i + 1} pending`
                    }
                  >
                    {i + 1}
                  </motion.div>
                );
              })}
            </div>
            
            {/* Slide Stats */}
            <div className="flex gap-4 text-xs text-muted-foreground justify-center">
              <span>{completedSlides.size} of {totalSlides} completed</span>
              {slidesInProgress.size > 0 && (
                <span className="text-blue-600 dark:text-blue-400">
                  ({slidesInProgress.size} generating)
                </span>
              )}
              {errors.size > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  Errors: {errors.size}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Completion Message - Show below progress when complete */}
      {isComplete && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="space-y-3"
        >
          {/* Success message - smaller and simpler */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-700">
            <div className="flex items-center justify-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-green-700 dark:text-green-300">
                Your presentation is ready!
              </span>
            </div>
          </div>


        </motion.div>
      )}
    </div>
  );
}; 