import { useEffect } from 'react';
import { BROWSER } from '@/utils/browser';

/**
 * Prevents the native browser pinch-to-zoom on mobile devices.
 *
 * Why: On mobile, native zoom triggers full layout recalculations (reflows) on
 * every frame of the gesture.  When heavy slide DOM is present (Tiptap editors,
 * iframes, charts, SVG shapes, CSS-filtered images) this overwhelms the device
 * and crashes the browser tab.
 *
 * How it works – three layers of protection:
 * 1. **Viewport meta tag** – sets `maximum-scale=1, user-scalable=no` so the
 *    browser itself won't zoom the page.
 * 2. Callers add **`touch-action: pan-x pan-y`** CSS on slide containers so
 *    pinch gestures are ignored at the compositor level (no JS needed).
 * 3. Callers attach **gesturestart/gesturechange/gestureend** listeners on
 *    Safari (which fires proprietary gesture events before touch events).
 *
 * The hook restores the original viewport meta content on unmount so other
 * pages (settings, text-heavy content) can still be zoomed for accessibility.
 */
export function usePreventMobileZoom() {
  useEffect(() => {
    if (!BROWSER.isMobile) return;

    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;

    const originalContent = meta.getAttribute('content') || '';

    // Build the new content string
    let newContent = originalContent;

    // user-scalable
    if (/user-scalable\s*=/.test(newContent)) {
      newContent = newContent.replace(/user-scalable\s*=\s*\w+/, 'user-scalable=no');
    } else {
      newContent += ', user-scalable=no';
    }

    // maximum-scale
    if (/maximum-scale\s*=/.test(newContent)) {
      newContent = newContent.replace(/maximum-scale\s*=\s*[\d.]+/, 'maximum-scale=1');
    } else {
      newContent += ', maximum-scale=1';
    }

    meta.setAttribute('content', newContent);

    return () => {
      meta.setAttribute('content', originalContent);
    };
  }, []);
}

/**
 * Inline styles to apply on any container that wraps rendered slide content on
 * mobile.  These are cheap CSS declarations that prevent zoom gestures from
 * reaching the browser's compositor and isolate paint/layout from the rest of
 * the page.
 *
 * Usage:
 * ```tsx
 * <div style={BROWSER.isMobile ? MOBILE_SLIDE_GUARD_STYLE : undefined}>
 *   <Slide ... />
 * </div>
 * ```
 */
export const MOBILE_SLIDE_GUARD_STYLE: React.CSSProperties = {
  // Allow scroll/pan but block pinch-to-zoom and double-tap zoom
  touchAction: 'pan-x pan-y',
  // Promote to GPU compositor layer so transforms don't cause reflows
  willChange: 'transform',
  // Isolate paint – prevents slide repaints from invalidating the rest of the page
  contain: 'paint',
};

/**
 * Attach Safari gesture-event listeners that preventDefault to block the
 * proprietary zoom gesture.  Call this in a useEffect on the container element.
 *
 * Usage:
 * ```ts
 * useEffect(() => {
 *   if (!BROWSER.isMobile) return;
 *   const el = containerRef.current;
 *   if (!el) return;
 *   return preventSafariGestureZoom(el);
 * }, []);
 * ```
 */
export function preventSafariGestureZoom(el: HTMLElement): () => void {
  const prevent = (e: Event) => {
    e.preventDefault();
  };

  el.addEventListener('gesturestart', prevent, { passive: false });
  el.addEventListener('gesturechange', prevent, { passive: false });
  el.addEventListener('gestureend', prevent, { passive: false });

  return () => {
    el.removeEventListener('gesturestart', prevent);
    el.removeEventListener('gesturechange', prevent);
    el.removeEventListener('gestureend', prevent);
  };
}
