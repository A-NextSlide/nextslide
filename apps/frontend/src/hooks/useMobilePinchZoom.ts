import { useEffect, useRef, useState, useCallback } from 'react';
import { BROWSER } from '@/utils/browser';

const SNAP_THRESHOLD = 1.05;

/**
 * Custom pinch-to-zoom for mobile that uses CSS `transform: scale()` (GPU-
 * composited) instead of native browser zoom (which triggers DOM reflow on
 * every frame and crashes the tab on heavy slide content).
 *
 * How to use:
 * 1. Call the hook and get `containerRef`, `isZoomed`, `resetZoom`.
 * 2. Attach `containerRef` to a wrapper `<div>` around the zoomable content.
 * 3. The hook directly manipulates the element's transform for zero-overhead
 *    frame updates during gestures — no React re-renders during the gesture.
 * 4. Call `resetZoom()` when the slide changes to snap back to 1×.
 * 5. Check `isZoomed` to conditionally disable swipe-to-navigate.
 *
 * Works together with:
 * - `usePreventMobileZoom()` (viewport meta tag blocks native zoom)
 * - `touch-action: pan-x pan-y` CSS (compositor-level native zoom block)
 *
 * Features:
 * - Pinch to zoom in / out (two fingers)
 * - Pan to move around when zoomed (single finger)
 * - Center-tracks the pinch midpoint during zoom
 * - Snaps back to 1× when released near 1×
 * - Blocks event propagation when zoomed so swipe-to-navigate doesn't fire
 * - Prevents Safari proprietary gesture events
 */
export function useMobilePinchZoom(options?: {
  minZoom?: number;
  maxZoom?: number;
  enabled?: boolean;
}) {
  const {
    minZoom = 1,
    maxZoom = 3,
    enabled = BROWSER.isMobile,
  } = options || {};

  const containerRef = useRef<HTMLDivElement>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  // Mutable state — avoids re-renders during active gesture
  const state = useRef({ zoom: 1, panX: 0, panY: 0 });

  const resetZoom = useCallback(() => {
    state.current = { zoom: 1, panX: 0, panY: 0 };
    const el = containerRef.current;
    if (el) {
      el.style.transform = '';
      el.style.willChange = '';
    }
    setIsZoomed(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const s = state.current;

    // ── Pinch state ────────────────────────────────────────────────────
    let pinching = false;
    let pinchDist0 = 0;   // initial finger distance
    let pinchZoom0 = 1;   // zoom at pinch start
    let pinchCX = 0;      // initial center X
    let pinchCY = 0;      // initial center Y
    let pinchPanX0 = 0;   // pan at pinch start
    let pinchPanY0 = 0;

    // ── Single-finger pan state (when zoomed) ─────────────────────────
    let panning = false;
    let panTX = 0;        // touch X at pan start
    let panTY = 0;
    let panX0 = 0;        // pan offset at pan start
    let panY0 = 0;

    // ── Helpers ───────────────────────────────────────────────────────
    const apply = () => {
      if (s.zoom <= 1.01) {
        el.style.transform = '';
        el.style.willChange = '';
      } else {
        el.style.willChange = 'transform';
        // translate is divided by zoom because it's applied BEFORE scale in the
        // transform chain and we need screen-pixel offsets
        el.style.transform =
          `scale(${s.zoom}) translate(${s.panX / s.zoom}px, ${s.panY / s.zoom}px)`;
      }
    };

    const commitZoomState = () => {
      setIsZoomed(s.zoom > SNAP_THRESHOLD);
    };

    // ── Touch handlers ────────────────────────────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // ▸ Pinch start
        e.preventDefault();
        e.stopPropagation();
        pinching = true;
        panning = false;
        const [t1, t2] = [e.touches[0], e.touches[1]];
        pinchDist0 = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        pinchZoom0 = s.zoom;
        pinchCX = (t1.clientX + t2.clientX) / 2;
        pinchCY = (t1.clientY + t2.clientY) / 2;
        pinchPanX0 = s.panX;
        pinchPanY0 = s.panY;
      } else if (e.touches.length === 1 && s.zoom > SNAP_THRESHOLD) {
        // ▸ Pan start (only when zoomed in)
        e.stopPropagation(); // prevent swipe-to-navigate
        panning = true;
        panTX = e.touches[0].clientX;
        panTY = e.touches[0].clientY;
        panX0 = s.panX;
        panY0 = s.panY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinching) {
        e.preventDefault();
        e.stopPropagation();
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const scale = dist / pinchDist0;
        s.zoom = Math.min(maxZoom, Math.max(minZoom, pinchZoom0 * scale));

        // Track center-point movement for pan during pinch
        const cx = (t1.clientX + t2.clientX) / 2;
        const cy = (t1.clientY + t2.clientY) / 2;
        s.panX = pinchPanX0 + (cx - pinchCX);
        s.panY = pinchPanY0 + (cy - pinchCY);
        apply();
      } else if (e.touches.length === 1 && panning && s.zoom > SNAP_THRESHOLD) {
        e.preventDefault();
        e.stopPropagation();
        s.panX = panX0 + (e.touches[0].clientX - panTX);
        s.panY = panY0 + (e.touches[0].clientY - panTY);
        apply();
      }
    };

    const onTouchEnd = (_e: TouchEvent) => {
      pinching = false;
      panning = false;

      // Snap back to 1× if the user let go near 1×
      if (s.zoom < SNAP_THRESHOLD) {
        s.zoom = 1;
        s.panX = 0;
        s.panY = 0;
        apply();
      }
      commitZoomState();
    };

    // Safari fires proprietary gesture events before touch events — block them
    const preventGesture = (e: Event) => e.preventDefault();

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('gesturestart', preventGesture, { passive: false });
    el.addEventListener('gesturechange', preventGesture, { passive: false });
    el.addEventListener('gestureend', preventGesture, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('gesturestart', preventGesture);
      el.removeEventListener('gesturechange', preventGesture);
      el.removeEventListener('gestureend', preventGesture);
      el.style.transform = '';
      el.style.willChange = '';
    };
  }, [enabled, minZoom, maxZoom]);

  return { containerRef, isZoomed, resetZoom };
}
