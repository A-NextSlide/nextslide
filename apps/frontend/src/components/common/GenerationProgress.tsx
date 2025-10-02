import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GenerationProgressTracker } from '@/services/generation/GenerationProgressTracker';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface GenerationProgressProps {
  variant?: 'full' | 'compact' | 'minimal';
  className?: string;
  showDetails?: boolean;
  onComplete?: () => void;
}

export const GenerationProgress: React.FC<GenerationProgressProps> = ({
  variant = 'full',
  className,
  showDetails = true,
  onComplete
}) => {
  const tracker = useRef(GenerationProgressTracker.getInstance());
  const [state, setState] = useState(tracker.current.getState());
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const handleUpdate = (newState: any) => {
      setState({ ...newState });
      
      if (newState.progress === 100 && onComplete) {
        setTimeout(onComplete, 500);
      }
    };
    
    const handleProgressUpdate = (newState: any) => {
      setState(prevState => ({
        ...prevState,
        progress: newState.progress,
        smoothProgress: newState.smoothProgress
      }));
    };
    
    tracker.current.on('update', handleUpdate);
    tracker.current.on('progressUpdate', handleProgressUpdate);
    
    // If backend tells us work is already finished, surface a quick complete row
    const handleDeckComplete = () => {
      setState(prev => ({ ...prev, progress: 100, message: 'Your presentation is ready!', phase: 'finalization' }));
      if (onComplete) setTimeout(onComplete, 300);
    };
    window.addEventListener('deck_complete', handleDeckComplete as EventListener);
    
    return () => {
      tracker.current.off('update', handleUpdate);
      tracker.current.off('progressUpdate', handleProgressUpdate);
      window.removeEventListener('deck_complete', handleDeckComplete as EventListener);
    };
  }, [onComplete]);
  
  const phaseConfig = {
    initialization: { color: '#f59e0b', emoji: '🚀' },
    theme_generation: { color: '#8b5cf6', emoji: '🎨' },
    image_collection: { color: '#10b981', emoji: '🖼️' },
    slide_generation: { color: '#f59e0b', emoji: '📝' },
    finalization: { color: '#6366f1', emoji: '✨' }
  };
  
  const currentPhase = phaseConfig[state.phase as keyof typeof phaseConfig] || phaseConfig.initialization;
  
  // Format time display
  const formatTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };
  
  if (variant === 'minimal') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="w-4 h-4" style={{ color: currentPhase.color }} />
        </motion.div>
        <span className="text-sm font-medium">
          {state.message} ({state.progress}%)
        </span>
      </div>
    );
  }
  
  if (variant === 'compact') {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-2">
            <span>{currentPhase.emoji}</span>
            {state.message}
          </span>
          <span className="text-sm text-muted-foreground">{state.progress}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: currentPhase.color }}
            animate={{ width: `${state.smoothProgress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
      </div>
    );
  }
  
  // Full variant
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn("space-y-4", className)}
        >
          {/* Main Progress Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <span className="text-2xl">{currentPhase.emoji}</span>
                {state.message}
              </h3>
              <span className="text-2xl font-bold" style={{ color: currentPhase.color }}>
                {state.progress}%
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="h-3 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full relative overflow-hidden"
                style={{ backgroundColor: currentPhase.color }}
                animate={{ width: `${state.smoothProgress}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {/* Shimmer effect removed */}
              </motion.div>
            </div>
            
            {/* Time and Slide Info */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {state.estimatedTime && state.progress < 95 
                  ? `~${formatTime(state.estimatedTime)} remaining`
                  : formatTime(state.elapsedTime) + ' elapsed'
                }
              </span>
              {state.currentSlide && state.totalSlides && (
                <span>
                  Slide {state.currentSlide} of {state.totalSlides}
                </span>
              )}
            </div>
          </div>
          
          {/* Phase Timeline */}
          {showDetails && (
            <div className="flex items-center justify-between px-4">
              {Object.entries(phaseConfig).map(([phase, config], index) => {
                const isActive = state.phase === phase;
                const phaseIndex = Object.keys(phaseConfig).indexOf(phase);
                const currentIndex = Object.keys(phaseConfig).indexOf(state.phase);
                const isCompleted = phaseIndex < currentIndex;
                
                return (
                  <React.Fragment key={phase}>
                    <motion.div
                      className="flex flex-col items-center gap-1"
                      initial={{ scale: 0.8, opacity: 0.5 }}
                      animate={{
                        scale: isActive ? 1.1 : isCompleted ? 1 : 0.9,
                        opacity: isActive || isCompleted ? 1 : 0.5
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all",
                          isCompleted && "bg-green-100 dark:bg-green-900"
                        )}
                        style={{
                          backgroundColor: isActive ? config.color : isCompleted ? undefined : '#f3f4f6',
                          color: isActive ? 'white' : isCompleted ? '#10b981' : '#9ca3af',
                          ringColor: isActive ? config.color + '40' : undefined
                        }}
                      >
                        {isCompleted ? '✓' : config.emoji}
                      </div>
                      <span className={cn(
                        "text-xs text-center max-w-[60px]",
                        (isActive || isCompleted) ? "font-medium" : "text-muted-foreground"
                      )}>
                        {phase.replace(/_/g, ' ')}
                      </span>
                    </motion.div>
                    
                    {index < Object.keys(phaseConfig).length - 1 && (
                      <div className="flex-1 h-0.5 bg-secondary mx-2">
                        <motion.div
                          className="h-full bg-green-500"
                          initial={{ width: 0 }}
                          animate={{ width: isCompleted ? '100%' : '0%' }}
                          transition={{ duration: 0.5, delay: 0.2 }}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
          
          {/* Slide Grid Preview */}
          {showDetails && state.slides.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {state.slides.map((slide, index) => (
                <motion.div
                  key={slide.id || index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ 
                    opacity: slide.status === 'pending' ? 0.3 : 1,
                    scale: slide.status === 'generating' ? 0.95 : 1
                  }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    "aspect-[16/9] rounded border-2 relative overflow-hidden transition-all",
                    slide.status === 'completed' && "border-green-500 bg-green-50 dark:bg-green-900/20",
                    slide.status === 'generating' && "border-orange-500 bg-orange-50 dark:bg-orange-900/20",
                    slide.status === 'pending' && "border-muted bg-muted/50"
                  )}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    {slide.status === 'generating' && (
                      <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                    )}
                    {slide.status === 'completed' && (
                      <span className="text-green-500 text-lg">✓</span>
                    )}
                    {slide.status === 'pending' && (
                      <span className="text-xs text-muted-foreground">{index + 1}</span>
                    )}
                  </div>
                  
                  {/* Progress overlay for generating slides */}
                  {slide.status === 'generating' && (
                    <motion.div
                      className="absolute bottom-0 left-0 right-0 h-1 bg-orange-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${slide.progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                  
                  {/* Image indicator */}
                  {slide.hasImages && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};