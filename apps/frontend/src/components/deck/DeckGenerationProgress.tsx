import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeckStatus } from '@/types/DeckTypes';
import { motion } from 'framer-motion';

interface DeckGenerationProgressProps {
  status: DeckStatus;
  className?: string;
}

const styles = `
  @keyframes animation-delay-500 {
    0% { opacity: 0.2; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(1.1); }
    100% { opacity: 0.2; transform: scale(1); }
  }
  
  .animation-delay-500 {
    animation: animation-delay-500 2s ease-in-out infinite;
    animation-delay: 0.5s;
  }
  
  @keyframes gradient-dance {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
`;

// Phase ranges according to backend documentation
const PHASE_RANGES = {
  initialization: { start: 0, end: 15 },      // 15%
  theme_generation: { start: 15, end: 30 },   // 15%
  image_collection: { start: 30, end: 55 },   // 25%
  slide_generation: { start: 55, end: 95 },   // 40% (biggest chunk)
  finalization: { start: 95, end: 100 }       // 5%
};

export default function DeckGenerationProgress({ status, className }: DeckGenerationProgressProps) {
  const currentSlideDisplay = status.currentSlide || 0;
  // If totalSlides is 0 but we have a currentSlide > 0, estimate totalSlides
  const totalSlidesDisplay = status.totalSlides || (currentSlideDisplay > 0 ? Math.max(currentSlideDisplay, 8) : 15);
  
  // Calculate progress based on phase
  const calculateProgress = () => {
    // If we have an explicit progress value, use it
    if (status.progress !== undefined) {
      return Math.min(100, Math.max(0, status.progress));
    }
    
    // Otherwise calculate based on slide progress during slide_generation phase
    if (status.state === 'generating' && currentSlideDisplay > 0 && totalSlidesDisplay > 0) {
      const slideProgress = (currentSlideDisplay / totalSlidesDisplay) * 40; // 40% of total progress
      return Math.min(95, 55 + slideProgress); // Start at 55%, cap at 95%
    }
    
    // Default to start of current phase
    switch (status.state) {
      case 'creating':
        return PHASE_RANGES.initialization.start;
      case 'theme_generation':
        return PHASE_RANGES.theme_generation.start;
      case 'image_collection':
        return PHASE_RANGES.image_collection.start;
      case 'generating':
        return PHASE_RANGES.slide_generation.start;
      case 'finalizing':
        return PHASE_RANGES.finalization.start;
      case 'completed':
        return 100;
      default:
        return 0;
    }
  };
  
  const progressPercentage = calculateProgress();
  
  // Animated progress state
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(progressPercentage);
  
  // Update target when progress prop changes
  useEffect(() => {
    setTargetProgress(progressPercentage);
  }, [progressPercentage]);
  
  // Smooth progress animation
  useEffect(() => {
    const animationId = setInterval(() => {
      setAnimatedProgress(current => {
        const diff = targetProgress - current;
        if (Math.abs(diff) < 0.1) return targetProgress;
        
        // Animate at 10% of the difference per frame for smooth animation
        return current + diff * 0.1;
      });
    }, 16); // ~60fps
    
    return () => clearInterval(animationId);
  }, [targetProgress]);
  
  // Inject styles
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = styles;
    document.head.appendChild(styleEl);
    
    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);
  
  // Estimate: generating 2 slides per minute
  const remainingSlides = Math.max(0, totalSlidesDisplay - currentSlideDisplay);
  const estimatedMinutesRemaining = Math.ceil(remainingSlides / 2);
  
  // Parse message if it's JSON
  const getDisplayMessage = () => {
    if (!status.message) return '';
    
    // Check if message looks like JSON
    if (status.message.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(status.message);
        // Extract the actual message from the JSON object
        if (parsed.message) return parsed.message;
        
        // If no message field, try to create a readable message from the JSON
        if (parsed.type === 'slide_completed') {
          return `Completed slide ${(parsed.slide_index || 0) + 1}: ${parsed.slide_title || 'Untitled'}`;
        } else if (parsed.type === 'deck_complete') {
          return 'Deck generation completed!';
        } else if (parsed.type === 'error') {
          return parsed.error || 'An error occurred';
        }
        
        // If we can't create a readable message, don't show raw JSON
        return 'Processing...';
      } catch (e) {
        // If parsing fails, return the original message
        return status.message;
      }
    }
    
    return status.message;
  };
  
  // Get slide title from status or parsed message
  const getSlideTitle = () => {
    if (status.currentSlideTitle) return status.currentSlideTitle;
    
    // Try to extract from JSON message
    if (status.message && status.message.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(status.message);
        return parsed.slide_title || parsed.slideTitle || null;
      } catch (e) {
        return null;
      }
    }
    
    return null;
  };
  
  const slideTitle = getSlideTitle();
  
  // Inject animation styles
  React.useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = styles;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  const getStateIcon = () => {
    switch (status.state) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Loader2 className="w-5 h-5 animate-spin text-blue-600" />;
    }
  };

  const getStateColor = () => {
    switch (status.state) {
      case 'completed':
        return 'bg-green-600';
      case 'error':
        return 'bg-red-600';
      default:
        return 'bg-blue-600';
    }
  };

  return (
    <div className={cn("w-full flex flex-col items-center justify-center", className)} style={{ transform: 'none', isolation: 'isolate' }}>
      <div className="space-y-6 text-center" style={{ transform: 'none' }}>
        {/* Main title with dancing pink gradient */}
        {status.state === 'generating' && (
          <div className="relative">
            {/* Background sparkles */}
            <div className="absolute -inset-4 opacity-30 pointer-events-none">
              <Sparkles className="absolute top-0 left-0 h-8 w-8 text-pink-400 animate-pulse" />
              <Sparkles className="absolute bottom-0 right-0 h-6 w-6 text-purple-400 animate-pulse animation-delay-500" />
            </div>
            
            {/* Main text with gradient animation */}
            <h2 className="text-4xl font-black tracking-tight relative inline-block z-10"
                style={{
                  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  fontWeight: 900,
                  background: 'linear-gradient(135deg, #ec4899 0%, #f472b6 25%, #c084fc 50%, #f472b6 75%, #ec4899 100%)',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'gradient-dance 3s ease infinite'
                }}>
              Generating Your Presentation
            </h2>
          </div>
        )}
        
        {status.state === 'completed' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-3">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
              <div className="text-lg font-semibold text-green-600">Deck Composition Complete!</div>
            </div>
            <p className="text-base text-muted-foreground max-w-md mx-auto">
              Your presentation is ready!
            </p>
            
            {/* Editor mode instructions */}
            <div className="bg-muted/50 border border-border rounded-lg p-4 max-w-md mx-auto">
              <p className="text-sm font-semibold text-foreground mb-2">To start editing directly:</p>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-primary/10 text-primary text-xs font-mono">E</span>
                  Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-background border border-border rounded">E</kbd> to enter editor mode
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-primary/10 text-primary">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </span>
                  Double-click any slide to edit
                </p>
              </div>
            </div>
          </div>
        )}
        
        {status.state === 'error' && (
          <div className="flex items-center justify-center space-x-3">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h2 className="text-3xl font-black text-red-600">Generation Error</h2>
          </div>
        )}
        
        {/* Progress bar - only show when generating */}
        {status.state === 'generating' && (
          <div className="space-y-2 max-w-md mx-auto">
            <Progress value={animatedProgress} className="h-3" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Slide {currentSlideDisplay} of {totalSlidesDisplay}</span>
              <span>{Math.round(animatedProgress)}%</span>
            </div>
          </div>
        )}
        
        {/* Current status message - only show when generating or error */}
        {(status.state === 'generating' || status.state === 'error') && (
          <div className="space-y-2 relative z-10" style={{ transform: 'none' }}>
            <p className="text-lg font-medium text-muted-foreground" style={{ transform: 'none', display: 'block' }}>{getDisplayMessage()}</p>
            {slideTitle && status.state === 'generating' && !getDisplayMessage().toLowerCase().includes('completed') && (
              <p className="text-base text-muted-foreground" style={{ transform: 'none', display: 'block' }}>
                Creating: <span className="font-semibold text-foreground" style={{ transform: 'none', display: 'inline' }}>{slideTitle}</span>
              </p>
            )}
          </div>
        )}
        
        {/* Time estimate */}
        {status.state === 'generating' && remainingSlides > 0 && (
          <div className="text-sm text-muted-foreground">
            Estimated time remaining: <span className="font-semibold">{estimatedMinutesRemaining} minute{estimatedMinutesRemaining !== 1 ? 's' : ''}</span>
          </div>
        )}
        
        {/* Error message */}
        {status.state === 'error' && status.error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 max-w-md mx-auto">
            <p className="text-sm text-red-600 dark:text-red-400">{status.error}</p>
            {status.errorSlide && (
              <p className="text-xs text-red-500 dark:text-red-300 mt-1">
                Error occurred on slide: {status.errorSlide}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 