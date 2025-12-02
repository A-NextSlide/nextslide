import { useEffect, useState, useCallback, useRef } from 'react';
import { FontLoadingService } from '../services/FontLoadingService';

/**
 * Hook to handle loading a font and tracking its loading state
 * @param fontFamily The font family to load
 * @returns Boolean indicating if the font has loaded
 */
export function useFontLoading(fontFamily: string): boolean {
  const [isLoaded, setIsLoaded] = useState(FontLoadingService.isFontLoaded(fontFamily));

  useEffect(() => {
    if (!isLoaded && fontFamily) {
      let mounted = true;

      FontLoadingService.loadFont(fontFamily).then(() => {
        if (mounted) {
          setIsLoaded(true);
        }
      });

      return () => { mounted = false; };
    }
  }, [fontFamily, isLoaded]);

  return isLoaded;
}

/**
 * Hook for loading fonts with async/await support
 * Used for theme editing where we need to wait for fonts before applying
 */
export function useFontLoader() {
  const [isLoading, setIsLoading] = useState(false);
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());
  const loadingRef = useRef<Set<string>>(new Set());

  /**
   * Load a single font and wait for browser to process it
   */
  const loadFont = useCallback(async (fontFamily: string): Promise<void> => {
    if (!fontFamily || loadedFonts.has(fontFamily) || loadingRef.current.has(fontFamily)) {
      return;
    }

    loadingRef.current.add(fontFamily);
    setIsLoading(true);

    try {
      // Sync designer fonts first (ensures font definitions are available)
      await FontLoadingService.syncDesignerFonts?.();

      // Load the font
      await FontLoadingService.loadFont(fontFamily);

      // Wait for browser to process font
      if ('fonts' in document) {
        await Promise.all([
          document.fonts.load(`bold 24px "${fontFamily}"`).catch(() => {}),
          document.fonts.load(`normal 16px "${fontFamily}"`).catch(() => {}),
          document.fonts.load(`14px "${fontFamily}"`).catch(() => {}),
        ]);
      }

      setLoadedFonts(prev => new Set([...prev, fontFamily]));
    } catch (err) {
      console.warn(`[useFontLoader] Failed to load font: ${fontFamily}`, err);
    } finally {
      loadingRef.current.delete(fontFamily);
      if (loadingRef.current.size === 0) {
        setIsLoading(false);
      }
    }
  }, [loadedFonts]);

  /**
   * Load theme fonts (heading + body)
   */
  const loadThemeFonts = useCallback(async (
    headingFont: string,
    bodyFont: string
  ): Promise<void> => {
    setIsLoading(true);

    try {
      // Sync designer fonts first
      await FontLoadingService.syncDesignerFonts?.();

      // Load heading font
      if (headingFont) {
        await loadFont(headingFont);
      }

      // Load body font if different
      if (bodyFont && bodyFont !== headingFont) {
        await loadFont(bodyFont);
      }
    } finally {
      setIsLoading(false);
    }
  }, [loadFont]);

  /**
   * Load multiple fonts in parallel
   */
  const loadFonts = useCallback(async (fonts: string[]): Promise<void> => {
    const uniqueFonts = [...new Set(fonts.filter(Boolean))];
    if (uniqueFonts.length === 0) return;

    setIsLoading(true);

    try {
      await FontLoadingService.syncDesignerFonts?.();
      await Promise.all(uniqueFonts.map(font => loadFont(font)));
    } finally {
      setIsLoading(false);
    }
  }, [loadFont]);

  /**
   * Check if a font is already loaded
   */
  const isFontLoaded = useCallback((fontFamily: string): boolean => {
    return loadedFonts.has(fontFamily) || FontLoadingService.isFontLoaded(fontFamily);
  }, [loadedFonts]);

  return {
    loadFont,
    loadThemeFonts,
    loadFonts,
    isFontLoaded,
    isLoading,
    loadedFonts,
  };
}
