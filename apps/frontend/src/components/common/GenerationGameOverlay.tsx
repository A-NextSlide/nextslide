import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { X, Gamepad2 } from 'lucide-react';
import SlideStackerGame from '@/components/common/games/SlideStackerGame';

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
  const [completed, setCompleted] = useState(false);
  const [firstSlideDone, setFirstSlideDone] = useState(false);
  const timerRef = useRef<number | null>(null);
  const hasArmedRef = useRef(false);

  const isGenerating = deckState === 'creating' || deckState === 'generating' || deckState === 'pending';
  const isComplete = deckState === 'completed';

  // Arm a 5s timer when generation (re)starts
  useEffect(() => {
    if (isVisibleOverride) {
      setShowOverlay(true);
      return;
    }

    // Once we've shown the prompt, keep it visible until generation is complete
    if (showOverlay) {
      if (isComplete) {
        setCompleted(true);
      }
      return;
    }
  }, [isGenerating, isComplete, startedAt, isVisibleOverride]);

  // Track when slide 1 completes to show a subtle hint
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

  // Auto-hide overlay when user dismisses after completion
  const handleDismiss = () => {
    setShowOverlay(false);
  };

  // Show nothing if not prompted yet
  if (!showOverlay) return null;

  // Render the expanded overlay
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

      {showOverlay && (
        <div
          className={cn(
            'rounded-2xl shadow-2xl border border-border backdrop-blur-xl bg-background/95',
            'overflow-hidden h-full w-full flex flex-col animate-[scale-in-up_0.3s_ease-out]'
          )}
          style={{
            boxShadow: '0 20px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,67,1,0.1)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)'
          }}
        >
          <style dangerouslySetInnerHTML={{
            __html: `
          @keyframes scale-in-up {
            from { 
              opacity: 0; 
              transform: scale(0.95) translateY(10px); 
            }
            to { 
              opacity: 1; 
              transform: scale(1) translateY(0); 
            }
          }
        `}} />
          {/* Header */}
          <div className="px-5 pt-5 pb-3 flex items-start gap-3 border-b border-orange-100">
            <div className="h-10 w-10 rounded-full flex items-center justify-center shadow-md animate-[float_3s_ease-in-out_infinite]"
              style={{
                background: 'linear-gradient(135deg, #FF4301 0%, #FF6B35 100%)',
                boxShadow: '0 4px 12px rgba(255, 67, 1, 0.3)'
              }}>
              <Gamepad2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold tracking-tight bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent"
                style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}>
                Let's Play While We Wait!
              </div>
              <div className="mt-1 text-sm text-muted-foreground" style={{ fontFamily: '\'Inter\', -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif' }}>
                <div className="typing-animation" style={{ ['--message-length' as any]: 50, ['--animation-duration' as any]: '1.8s' }}>
                  Slide gen may take about a minute. Play time?
                </div>
                <span className="typing-cursor ml-0.5">✨</span>
              </div>
            </div>
            {/* Close button (always visible) */}
            <button
              aria-label="Close"
              className="group relative p-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-600 hover:text-orange-700 transition-all duration-200 transform hover:scale-110"
              onClick={handleDismiss}
            >
              <X className="w-5 h-5 relative z-10" />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-400 to-pink-400 opacity-0 group-hover:opacity-20 transition-opacity duration-200" />
            </button>
          </div>
          <style dangerouslySetInnerHTML={{
            __html: `
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-5px); }
          }
        `}} />

          {/* Subtle banners */}
          {(firstSlideDone || completed) && (
            <div className="mx-5 mt-2 mb-1 text-xs font-medium rounded-md px-2 py-1 inline-flex items-center gap-1"
              style={{ background: 'rgba(16,185,129,0.12)', color: 'rgb(16,185,129)' }}>
              <span>
                ✨ {completed ? 'Slide is done' : 'Slide 1 is done — you can exit the game anytime.'}
              </span>
            </div>
          )}

          {/* Game Container */}
          <div className="flex-1 overflow-hidden relative">
            <SlideStackerGame onClose={handleDismiss} />
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerationGameOverlay;


