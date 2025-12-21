import { useEffect, useMemo, useState, type RefObject } from 'react';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

const FALLBACK_VIEWPORT = { width: 1200, height: 800 };

const getViewportFallback = () => {
  if (typeof window === 'undefined') return FALLBACK_VIEWPORT;
  return { width: window.innerWidth || FALLBACK_VIEWPORT.width, height: window.innerHeight || FALLBACK_VIEWPORT.height };
};

const computeSlideSize = (viewportWidth: number, viewportHeight: number) => {
  const safeViewport = {
    width: viewportWidth > 0 ? viewportWidth : getViewportFallback().width,
    height: viewportHeight > 0 ? viewportHeight : getViewportFallback().height
  };

  const isCompact = safeViewport.width < 768 || safeViewport.height < 500;
  const aspectRatio = DEFAULT_SLIDE_WIDTH / DEFAULT_SLIDE_HEIGHT;

  const verticalPadding = isCompact ? 24 : 120;
  const horizontalPadding = isCompact ? 12 : 64;

  const availableWidth = Math.max(0, safeViewport.width - horizontalPadding);
  const availableHeight = Math.max(0, safeViewport.height - verticalPadding);

  const heightConstrainedWidth = availableHeight * aspectRatio;
  const width = Math.max(1, Math.min(availableWidth, heightConstrainedWidth));
  const height = width / aspectRatio;

  return {
    width,
    height,
    viewportWidth: safeViewport.width,
    viewportHeight: safeViewport.height,
    isCompact
  };
};

export const useSlideViewportSize = (viewportRef: RefObject<HTMLElement>) => {
  const [viewportSize, setViewportSize] = useState(getViewportFallback());

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.max(0, Math.floor(rect.width));
      const height = Math.max(0, Math.floor(rect.height));
      setViewportSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
    };

    updateSize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateSize());
      resizeObserver.observe(element);
    } else {
      window.addEventListener('resize', updateSize);
      window.addEventListener('orientationchange', updateSize);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateSize);
        window.removeEventListener('orientationchange', updateSize);
      }
    };
  }, [viewportRef]);

  return useMemo(
    () => computeSlideSize(viewportSize.width, viewportSize.height),
    [viewportSize.width, viewportSize.height]
  );
};

export { computeSlideSize };
