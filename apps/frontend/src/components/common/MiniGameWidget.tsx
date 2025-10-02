import React, { useEffect, useMemo, useRef, useState } from 'react';
import LightsOut from '@/components/common/games/LightsOut';

interface MiniGameWidgetProps {
  className?: string;
  title?: string;
  active?: boolean;
}

const MiniGameWidget: React.FC<MiniGameWidgetProps> = ({ className, title = 'Tiny Game', active = false }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [showExitMessage, setShowExitMessage] = useState(false);
  const [hasEngaged, setHasEngaged] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  // Manage visibility transitions based on active flag
  useEffect(() => {
    if (active) {
      // Becoming active
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // Reset per-session state so the widget behaves fresh each time
      setHasEngaged(false);
      setShowExitMessage(false);
      setIsFading(false);
      setIsVisible(true);
    } else {
      // Going inactive
      if (!isVisible) return;
      if (hasEngaged) {
        // Show an encouraging exit message briefly, then fade out
        setShowExitMessage(true);
        setIsFading(false);
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => {
          setIsFading(true);
          hideTimerRef.current = window.setTimeout(() => {
            setIsVisible(false);
            setIsFading(false);
            setShowExitMessage(false);
          }, 350) as unknown as number; // match CSS transition
        }, 900) as unknown as number;
      } else {
        // Just fade away silently
        setIsFading(true);
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => {
          setIsVisible(false);
          setIsFading(false);
        }, 300) as unknown as number; // match CSS transition
      }
    }
    // Cleanup timers on unmount
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [active]);

  const containerStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
    opacity: isVisible ? (isFading ? 0 : 1) : 0,
    transform: isVisible ? (isFading ? 'translateY(-2px)' : 'translateY(0)') : 'translateY(-2px)',
    pointerEvents: isVisible ? 'auto' : 'none',
    transition: 'opacity 0.25s ease, transform 0.25s ease'
  }), [isVisible, isFading]);

  return (
    <div
      className={
        (className || '') +
        ' rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur px-3 py-3 shadow-sm'
      }
      style={containerStyle}
      onPointerDownCapture={() => setHasEngaged(true)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold tracking-wide uppercase text-zinc-700 dark:text-zinc-200">
          {title}
        </div>
        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">(1 min)</div>
      </div>
      <div className="w-[148px]">
        {!showExitMessage && <LightsOut size={4} />}
      </div>
      {showExitMessage && (
        <div className="mt-2 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
          Almost! Gotta be quicker!
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 1024px) {
          .mini-game-hide-on-small { display: none; }
        }
      `}} />
    </div>
  );
};

export default MiniGameWidget;


