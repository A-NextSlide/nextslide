import { useEffect, useRef } from 'react';
import { SlideData } from '@/types/SlideTypes';

/**
 * Set of URLs already preloaded this session to avoid redundant work.
 * Persists across hook unmounts so navigating back doesn't re-preload.
 */
const preloadedUrls = new Set<string>();

/**
 * Extract every image URL we can find from a slide:
 *  - component.props.src (Image components)
 *  - component.props.thumbnail / fallbackSrc (fallback chain)
 *  - slide.backgroundImage
 *  - img src attributes inside CustomComponent HTML
 */
function extractImageUrls(slide: SlideData): string[] {
  const urls: string[] = [];

  // Slide-level background image
  if (slide.backgroundImage) {
    urls.push(slide.backgroundImage);
  }

  if (!slide.components) return urls;

  for (const component of slide.components) {
    const props = component.props as Record<string, any>;

    // Standard Image components
    if (component.type === 'Image') {
      if (props.src) urls.push(props.src);
      if (props.thumbnail) urls.push(props.thumbnail);
      if (props.fallbackSrc) urls.push(props.fallbackSrc);
      continue;
    }

    // CustomComponent – images live inside the render HTML string
    if (component.type === 'CustomComponent' && typeof props.render === 'string') {
      const srcRegex = /src=["']([^"']+)["']/g;
      let match: RegExpExecArray | null;
      while ((match = srcRegex.exec(props.render)) !== null) {
        const url = match[1];
        if (url && (url.startsWith('http') || url.startsWith('data:'))) {
          urls.push(url);
        }
      }
    }
  }

  // Filter out placeholders and empty strings
  return urls.filter(
    (url) =>
      url &&
      !url.includes('placeholder') &&
      !url.startsWith('generating://') &&
      url !== ''
  );
}

/**
 * Preloads images for slides adjacent to the current one so they are
 * already in the browser cache when the user navigates.
 *
 * Uses `requestIdleCallback` (with `setTimeout` fallback) to avoid
 * blocking the main thread during slide transitions.
 *
 * @param slides       Full array of slides in the deck
 * @param currentIndex Index of the currently visible slide
 * @param buffer       Number of slides ahead/behind to preload (default 2)
 */
export function useImagePreloader(
  slides: SlideData[],
  currentIndex: number,
  buffer: number = 2
): void {
  const idleHandleRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!slides || slides.length === 0) return;

    // Collect URLs from the adjacent slides (skip current – it's already loading)
    const urlsToPreload = new Set<string>();
    const start = Math.max(0, currentIndex - buffer);
    const end = Math.min(slides.length - 1, currentIndex + buffer);

    for (let i = start; i <= end; i++) {
      if (i === currentIndex) continue; // current slide already rendering
      const slideUrls = extractImageUrls(slides[i]);
      for (const url of slideUrls) {
        if (!preloadedUrls.has(url)) {
          urlsToPreload.add(url);
        }
      }
    }

    if (urlsToPreload.size === 0) return;

    // Schedule preloading during idle time so it doesn't interfere with the
    // current slide's rendering / transition.
    const schedule =
      typeof window.requestIdleCallback === 'function'
        ? (cb: () => void) => window.requestIdleCallback(cb, { timeout: 2000 })
        : (cb: () => void) => setTimeout(cb, 100);

    idleHandleRef.current = schedule(() => {
      for (const url of urlsToPreload) {
        if (preloadedUrls.has(url)) continue;
        preloadedUrls.add(url);

        const img = new Image();
        // No-op handlers – we just want the browser to cache the bytes.
        img.decoding = 'async';
        img.src = url;
      }
    });

    return () => {
      // Cancel the idle callback if the slide changes before it fires
      if (idleHandleRef.current !== null) {
        if (typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(idleHandleRef.current as number);
        } else {
          clearTimeout(idleHandleRef.current as ReturnType<typeof setTimeout>);
        }
        idleHandleRef.current = null;
      }
    };
  }, [slides, currentIndex, buffer]);
}
