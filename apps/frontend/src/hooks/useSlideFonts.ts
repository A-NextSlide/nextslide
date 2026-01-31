import { useMemo, useState, useEffect, useRef } from 'react';
import { extractSlideFonts } from '@/utils/fontUtils';
import { FontLoadingService } from '@/services/FontLoadingService';

/**
 * Hook that extracts fonts from a slide and ensures they are loaded before
 * returning fontsReady: true. If all fonts are already cached, returns true
 * immediately with zero delay.
 */
export function useSlideFonts(slide: any): { fontsReady: boolean } {
  const fonts = useMemo(() => extractSlideFonts(slide), [slide]);

  // Fast path: check if all fonts are already loaded synchronously
  const allCached = useMemo(() => {
    if (fonts.length === 0) return true;
    return fonts.every(f => FontLoadingService.isFontLoaded(f));
  }, [fonts]);

  const [fontsReady, setFontsReady] = useState(allCached);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // If already cached or no fonts needed, mark ready immediately
    if (allCached) {
      setFontsReady(true);
      return;
    }

    setFontsReady(false);

    let timedOut = false;

    // 3-second timeout fallback - never block indefinitely
    const timeout = setTimeout(() => {
      timedOut = true;
      if (mountedRef.current) setFontsReady(true);
    }, 3000);

    FontLoadingService.loadFonts(fonts, {
      maxConcurrent: 6,
      delayBetweenBatches: 0,
      useIdleCallback: false,
    }).finally(() => {
      if (!timedOut && mountedRef.current) {
        setFontsReady(true);
      }
      clearTimeout(timeout);
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [fonts, allCached]);

  return { fontsReady };
}
