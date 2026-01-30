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
 *  - image URLs in CustomComponent JS data (arrays, objects, variables)
 *  - image URLs in CustomComponent nested props
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

    // CustomComponent – extract images from HTML, JS data, and props
    if (component.type === 'CustomComponent') {
      // 1. Image URLs from nested props (e.g. props.props.heroImage, props.props.image0)
      if (props.props && typeof props.props === 'object') {
        for (const value of Object.values(props.props)) {
          if (typeof value === 'string' && isImageUrl(value)) {
            urls.push(value);
          }
        }
      }

      // 2. Image URLs from the render HTML string
      if (typeof props.render === 'string') {
        const render = props.render;

        // img src attributes
        const srcRegex = /src=["']([^"']+)["']/g;
        let match: RegExpExecArray | null;
        while ((match = srcRegex.exec(render)) !== null) {
          const url = match[1];
          if (url && isImageUrl(url)) {
            urls.push(url);
          }
        }

        // CSS background-image: url(...)
        const bgRegex = /url\(["']?([^"')]+)["']?\)/g;
        while ((match = bgRegex.exec(render)) !== null) {
          const url = match[1];
          if (url && isImageUrl(url)) {
            urls.push(url);
          }
        }

        // Image URLs in JS data: strings in arrays/objects that look like URLs
        // Catches patterns like: image: "https://...", src: 'https://...',
        // "https://...supabase...", "https://images.pexels.com/..."
        const jsUrlRegex = /["'](https?:\/\/[^"']{20,}\.(?:jpg|jpeg|png|gif|webp|svg|avif)[^"']*)["']/gi;
        while ((match = jsUrlRegex.exec(render)) !== null) {
          const url = match[1];
          if (url && isImageUrl(url)) {
            urls.push(url);
          }
        }

        // Also catch URLs that don't end with an extension but are image CDN URLs
        // (supabase storage, pexels, unsplash, etc.)
        const cdnUrlRegex = /["'](https?:\/\/(?:[^"']*(?:supabase|nextslide|pexels|unsplash|images\.)[^"']*))["']/gi;
        while ((match = cdnUrlRegex.exec(render)) !== null) {
          const url = match[1];
          if (url && isImageUrl(url)) {
            urls.push(url);
          }
        }
      }
    }
  }

  // Dedupe and filter out placeholders and empty strings
  const seen = new Set<string>();
  return urls.filter((url) => {
    if (
      !url ||
      url.includes('placeholder') ||
      url.startsWith('generating://') ||
      url === '' ||
      url.startsWith('${') ||
      seen.has(url)
    ) {
      return false;
    }
    seen.add(url);
    return true;
  });
}

/** Check if a string looks like a real image URL (not a placeholder or template var) */
function isImageUrl(str: string): boolean {
  return (
    (str.startsWith('http') || str.startsWith('data:image')) &&
    !str.includes('placeholder') &&
    !str.startsWith('generating://') &&
    !str.includes('${')
  );
}

/**
 * Preloads images for the current slide and adjacent slides so they are
 * already in the browser cache when the user navigates.
 *
 * Current slide images are preloaded **eagerly** (immediately) so tabbed
 * content / image switching within a slide is instant.
 * Adjacent slide images use `requestIdleCallback` to avoid blocking.
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

    // --- Phase 1: Eagerly preload the CURRENT slide's images ---
    // This ensures all images (including those behind tabs / hidden by JS)
    // are in the browser cache before the user interacts with the slide.
    const currentSlide = slides[currentIndex];
    if (currentSlide) {
      const currentUrls = extractImageUrls(currentSlide);
      for (const url of currentUrls) {
        if (!preloadedUrls.has(url)) {
          preloadedUrls.add(url);
          const img = new Image();
          img.decoding = 'async';
          img.src = url;
        }
      }
    }

    // --- Phase 2: Preload adjacent slides on idle ---
    const urlsToPreload = new Set<string>();
    const start = Math.max(0, currentIndex - buffer);
    const end = Math.min(slides.length - 1, currentIndex + buffer);

    for (let i = start; i <= end; i++) {
      if (i === currentIndex) continue; // Already handled in Phase 1
      const slideUrls = extractImageUrls(slides[i]);
      for (const url of slideUrls) {
        if (!preloadedUrls.has(url)) {
          urlsToPreload.add(url);
        }
      }
    }

    if (urlsToPreload.size === 0) return;

    // Schedule adjacent-slide preloading during idle time so it doesn't
    // interfere with the current slide's rendering / transition.
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
