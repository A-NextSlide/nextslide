import React from 'react';
import { cn } from '@/lib/utils';

interface SplatterLoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  progress?: { current: number; total: number } | null;
  stage?: string | null;
  phase?: string | null;
  totalProgress?: number | null;
}

// Phase ranges according to backend documentation
const PHASE_RANGES = {
  initialization: { start: 0, end: 15, label: "Setting up..." },
  theme_generation: { start: 15, end: 30, label: "Creating theme..." },
  image_collection: { start: 30, end: 55, label: "Finding images..." },
  slide_generation: { start: 55, end: 95, label: "Generating slides..." },
  finalization: { start: 95, end: 100, label: "Finalizing..." }
};

const SplatterLoadingOverlay: React.FC<SplatterLoadingOverlayProps> = ({
  isVisible,
  message,
  progress,
  stage,
  phase,
  totalProgress
}) => {
  // Calculate actual progress percentage
  const calculateProgress = () => {
    // If total progress is provided, use it
    if (totalProgress !== null && totalProgress !== undefined) {
      return Math.min(100, Math.max(0, totalProgress));
    }

    // If we have slide progress and are in slide generation phase
    if (progress && phase === 'slide_generation') {
      const slideProgress = (progress.current / progress.total) * 40; // 40% of total
      return Math.min(95, 55 + slideProgress); // Start at 55%, cap at 95%
    }

    // If we have progress for other phases
    if (progress && progress.total > 0) {
      const percentage = (progress.current / progress.total) * 100;

      // Map to phase range
      if (phase && PHASE_RANGES[phase as keyof typeof PHASE_RANGES]) {
        const phaseRange = PHASE_RANGES[phase as keyof typeof PHASE_RANGES];
        const phaseSize = phaseRange.end - phaseRange.start;
        return phaseRange.start + (percentage / 100) * phaseSize;
      }
    }

    // Default based on phase
    if (phase && PHASE_RANGES[phase as keyof typeof PHASE_RANGES]) {
      return PHASE_RANGES[phase as keyof typeof PHASE_RANGES].start;
    }

    return 0;
  };

  const progressPercentage = calculateProgress();
  const phaseInfo = phase ? PHASE_RANGES[phase as keyof typeof PHASE_RANGES] : null;

  return (
    <div className={cn(
      "fixed inset-0 z-[100] pointer-events-none transition-all duration-500",
      isVisible ? "opacity-100" : "opacity-0"
    )}
    style={{
      visibility: isVisible ? 'visible' : 'hidden'
    }}>
      {/* Background overlay - matches app background */}
      <div className="absolute inset-0 bg-white/90 dark:bg-black/90 backdrop-blur-sm" />

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <style>{`
          .animate-shimmer {
            animation: shimmer 2s linear infinite;
          }

          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>

        {/* Simple spinner */}
        <div className="mb-8">
          <div className="w-12 h-12 border-4 border-zinc-200 dark:border-zinc-800 border-t-[#FF4301] rounded-full animate-spin" />
        </div>

        <div className="text-center max-w-2xl px-8">
          {/* Main message */}
          <h2
            className="text-[#383636] dark:text-gray-300 mb-4"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: '24px',
              lineHeight: '120%',
              letterSpacing: '0%',
              textTransform: 'uppercase',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale'
            }}
          >
            {message || 'Generating Your Presentation'}
          </h2>

          {/* Stage information */}
          {stage && (
            <p className="text-base text-zinc-600 dark:text-zinc-400 mb-6">
              {stage}
            </p>
          )}

          {/* Progress bar: only show once there is measurable progress */}
          {progressPercentage > 0 && (
            <div className="max-w-sm mx-auto">
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden relative">
                <div
                  className="h-full bg-[#FF4301] transition-all duration-500 ease-out rounded-full relative overflow-hidden"
                  style={{ width: `${progressPercentage}%` }}
                >
                  {/* Shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {phaseInfo ? phaseInfo.label : (stage || 'Processing...')}
                </p>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                  {Math.round(progressPercentage)}%
                </p>
              </div>
              {/* Show slide progress if in slide generation phase */}
              {phase === 'slide_generation' && progress && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 text-center">
                  Slide {progress.current} of {progress.total}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SplatterLoadingOverlay;
