import { useCallback, useEffect, useRef, useState } from 'react';

const PRIMARY_SLIDE_MIN_WIDTH = 320;
const MAX_ATTEMPTS = 12;

export function useChartAnimation(
  componentId: string,
  containerRef: React.RefObject<HTMLDivElement>
) {
  const [animationKey, setAnimationKey] = useState(`chart-${componentId}-${Date.now()}`);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  const resetTimerRef = useRef<number | null>(null);
  const pendingRafRef = useRef<number | null>(null);
  const pendingTimeoutRef = useRef<number | null>(null);
  const lastSlideIdRef = useRef<string | null>(null);
  const lastTriggerAtRef = useRef<number>(0);

  const getIsDraggingOrResizing = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return Boolean((window as any).__isDraggingCharts || (window as any).__isResizingCharts);
  }, []);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const cancelPending = useCallback(() => {
    if (pendingRafRef.current !== null) {
      window.cancelAnimationFrame(pendingRafRef.current);
      pendingRafRef.current = null;
    }
    if (pendingTimeoutRef.current !== null) {
      window.clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
  }, []);

  const triggerAnimation = useCallback(() => {
    if (typeof window === 'undefined' || getIsDraggingOrResizing()) return;

    setAnimationKey(`chart-${componentId}-${Date.now()}`);
    setShouldAnimate(true);

    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      setShouldAnimate(false);
      resetTimerRef.current = null;
    }, 900);
  }, [clearResetTimer, componentId, getIsDraggingOrResizing]);

  const getVisibleSlideContainer = useCallback(() => {
    const slideContainer = containerRef?.current?.closest('.slide-container[data-slide-id]') as HTMLElement | null;
    if (!slideContainer) return null;

    const rect = slideContainer.getBoundingClientRect?.();
    if (!rect || rect.width < PRIMARY_SLIDE_MIN_WIDTH || rect.height < 80) {
      return null;
    }

    const computed = window.getComputedStyle(slideContainer);
    if (computed.visibility === 'hidden' || computed.display === 'none' || Number(computed.opacity) === 0) {
      return null;
    }

    const slideId = slideContainer.getAttribute('data-slide-id') || null;
    return { slideContainer, slideId } as const;
  }, [containerRef]);

  const scheduleAnimation = useCallback((attempt = 0, delay = 90) => {
    if (typeof window === 'undefined') return;
    if (attempt > MAX_ATTEMPTS) return;

    cancelPending();

    if (getIsDraggingOrResizing()) {
      pendingRafRef.current = window.requestAnimationFrame(() => {
        scheduleAnimation(attempt + 1, delay);
      });
      return;
    }

    const info = getVisibleSlideContainer();
    if (!info) {
      pendingRafRef.current = window.requestAnimationFrame(() => {
        scheduleAnimation(attempt + 1, delay);
      });
      return;
    }

    const { slideId } = info;
    if (slideId && slideId === lastSlideIdRef.current) {
      const elapsed = Date.now() - lastTriggerAtRef.current;
      if (elapsed < 600) {
        return;
      }
    }

    pendingRafRef.current = window.requestAnimationFrame(() => {
      pendingTimeoutRef.current = window.setTimeout(() => {
        if (getIsDraggingOrResizing()) {
          scheduleAnimation(attempt + 1, delay);
          return;
        }
        lastSlideIdRef.current = slideId;
        lastTriggerAtRef.current = Date.now();
        triggerAnimation();
      }, delay);
    });
  }, [cancelPending, getIsDraggingOrResizing, getVisibleSlideContainer, triggerAnimation]);

  useEffect(() => {
    scheduleAnimation(0, 120);
    return () => {
      cancelPending();
      clearResetTimer();
    };
  }, [scheduleAnimation, cancelPending, clearResetTimer]);

  useEffect(() => {
    const handleSlideEvent = () => {
      lastSlideIdRef.current = null;
      scheduleAnimation(0, 100);
    };

    const handleSlideChange = (event: Event) => {
      const slideId = (event as CustomEvent)?.detail?.slideId;
      if (slideId) {
        lastSlideIdRef.current = slideId;
      }
      scheduleAnimation(0, 90);
    };

    document.addEventListener('slidechange', handleSlideChange);
    window.addEventListener('slide:navigate', handleSlideEvent as EventListener);
    window.addEventListener('slide:navigate:index', handleSlideEvent as EventListener);

    return () => {
      document.removeEventListener('slidechange', handleSlideChange);
      window.removeEventListener('slide:navigate', handleSlideEvent as EventListener);
      window.removeEventListener('slide:navigate:index', handleSlideEvent as EventListener);
    };
  }, [scheduleAnimation]);

  useEffect(() => {
    lastSlideIdRef.current = null;
    scheduleAnimation(0, 80);
  }, [componentId, scheduleAnimation]);

  return {
    animationKey,
    triggerAnimation,
    shouldAnimate: shouldAnimate && !getIsDraggingOrResizing()
  };
}
