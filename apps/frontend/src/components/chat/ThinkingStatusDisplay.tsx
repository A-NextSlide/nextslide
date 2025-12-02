/**
 * ThinkingStatusDisplay
 * Simple, clean thinking indicator
 * Shows step label with animated dots
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { ThinkingStep, STATUS_PHASES, StatusPhase } from '@/types/agentEvents';

interface ThinkingStatusDisplayProps {
  steps: ThinkingStep[];
  isActive: boolean;
  className?: string;
}

// Animated dots component
const AnimatedDots: React.FC = () => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 350);

    return () => clearInterval(interval);
  }, []);

  return <span className="inline-block w-4 text-left">{dots}</span>;
};

const ThinkingStatusDisplay: React.FC<ThinkingStatusDisplayProps> = ({
  steps,
  isActive,
  className,
}) => {
  // Don't render if no steps and not active
  if (steps.length === 0 && !isActive) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* Show accumulated steps */}
      {steps.map((step, index) => {
        const isCompleted = step.status === 'completed';
        const isCurrentlyActive = step.status === 'active';

        return (
          <div
            key={step.id}
            className={cn(
              "flex items-start gap-2 text-sm animate-in fade-in slide-in-from-left-2",
              "duration-200"
            )}
            style={{ animationDelay: `${index * 30}ms` }}
          >
            {/* Status indicator */}
            <span className="mt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center">
              {isCompleted ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : isCurrentlyActive ? (
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
              )}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <span
                className={cn(
                  isCompleted && "text-zinc-500 dark:text-zinc-400",
                  isCurrentlyActive && "text-zinc-700 dark:text-zinc-200 font-medium",
                  !isCompleted && !isCurrentlyActive && "text-zinc-400"
                )}
              >
                {step.label}
              </span>

              {/* Animated dots for active step */}
              {isCurrentlyActive && <AnimatedDots />}

              {/* Detail - show inline */}
              {step.detail && (
                <span className="text-zinc-500 dark:text-zinc-500 ml-1">
                  — {step.detail}
                </span>
              )}

              {/* Expanded content */}
              {step.expandedContent && (
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 leading-relaxed">
                  {step.expandedContent}
                </p>
              )}

              {/* Citations if available */}
              {step.citations && step.citations.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {step.citations.slice(0, 3).map((citation, i) => (
                    <span
                      key={i}
                      className="text-[10px] text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded"
                    >
                      {(() => {
                        try {
                          return new URL(citation).hostname.replace('www.', '');
                        } catch {
                          return citation;
                        }
                      })()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ThinkingStatusDisplay;
