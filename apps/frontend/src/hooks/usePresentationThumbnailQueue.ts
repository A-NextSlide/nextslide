/**
 * Queue management hook for presentation mode thumbnails on mobile.
 * Processes one thumbnail render at a time to prevent memory crashes.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getCachedThumbnailWithHash, generateSlideHash } from '@/utils/presentationThumbnailCache';
import { SlideData } from '@/types/SlideTypes';

export interface UsePresentationThumbnailQueueResult {
  /** The slide ID currently being rendered (only one at a time) */
  activeRenderSlideId: string | null;
  /** Mark a slide as cached (call after screenshot captured) */
  markCached: (slideId: string) => void;
  /** Check if a specific slide should be rendering now */
  needsRender: (slideId: string) => boolean;
  /** Check if a slide has a valid cache */
  isCached: (slideId: string) => boolean;
  /** Register a slide as visible */
  markVisible: (slideId: string) => void;
  /** Register a slide as hidden */
  markHidden: (slideId: string) => void;
}

export interface UsePresentationThumbnailQueueOptions {
  slides: SlideData[];
  enabled: boolean;
}

export function usePresentationThumbnailQueue({
  slides,
  enabled,
}: UsePresentationThumbnailQueueOptions): UsePresentationThumbnailQueueResult {
  // All state in refs to avoid stale closures
  const cachedSetRef = useRef<Set<string>>(new Set());
  const visibleSetRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<string[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State for re-rendering components
  const [activeRenderSlideId, setActiveRenderSlideId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Initialize cached set from existing cache
  useEffect(() => {
    if (!enabled) return;

    for (const slide of slides) {
      if (slide?.id) {
        const hash = generateSlideHash(slide);
        const cached = getCachedThumbnailWithHash(slide.id, hash);
        if (cached) {
          cachedSetRef.current.add(slide.id);
        }
      }
    }
  }, [enabled, slides]);

  // Process next item in queue - uses refs to avoid stale closures
  const processNextInQueue = useCallback(() => {
    if (!enabled) return;
    if (isScrollingRef.current) return;
    if (activeIdRef.current !== null) return;

    // Find next visible, non-cached slide
    while (queueRef.current.length > 0) {
      const nextId = queueRef.current.shift()!;

      if (!visibleSetRef.current.has(nextId)) continue;
      if (cachedSetRef.current.has(nextId)) continue;

      // Found one to render
      activeIdRef.current = nextId;
      setActiveRenderSlideId(nextId);
      console.log(`[ThumbnailQueue] Rendering: ${nextId}`);
      return;
    }
  }, [enabled]);

  // Schedule processing with debounce
  const scheduleProcess = useCallback(() => {
    if (processTimeoutRef.current) {
      clearTimeout(processTimeoutRef.current);
    }
    processTimeoutRef.current = setTimeout(() => {
      processNextInQueue();
    }, 50);
  }, [processNextInQueue]);

  // Track scrolling
  useEffect(() => {
    if (!enabled) return;

    const handleScroll = () => {
      isScrollingRef.current = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        scheduleProcess();
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (processTimeoutRef.current) clearTimeout(processTimeoutRef.current);
    };
  }, [enabled, scheduleProcess]);

  // Mark slide as visible
  const markVisible = useCallback((slideId: string) => {
    if (!slideId || !enabled) return;

    visibleSetRef.current.add(slideId);

    // Don't queue if: already cached, already queued, or currently rendering
    if (cachedSetRef.current.has(slideId)) return;
    if (queueRef.current.includes(slideId)) return;
    if (activeIdRef.current === slideId) return;

    queueRef.current.push(slideId);
    console.log(`[ThumbnailQueue] Queued: ${slideId}, queue length: ${queueRef.current.length}`);

    // Start processing if nothing active
    if (activeIdRef.current === null) {
      scheduleProcess();
    }
  }, [enabled, scheduleProcess]);

  // Mark slide as hidden
  const markHidden = useCallback((slideId: string) => {
    if (!slideId) return;

    visibleSetRef.current.delete(slideId);

    // Remove from queue
    const idx = queueRef.current.indexOf(slideId);
    if (idx !== -1) {
      queueRef.current.splice(idx, 1);
    }
  }, []);

  // Mark slide as cached (after screenshot captured)
  const markCached = useCallback((slideId: string) => {
    if (!slideId) return;

    console.log(`[ThumbnailQueue] Cached: ${slideId}`);
    cachedSetRef.current.add(slideId);

    // Remove from queue if present
    const idx = queueRef.current.indexOf(slideId);
    if (idx !== -1) {
      queueRef.current.splice(idx, 1);
    }

    // Clear active if this was it
    if (activeIdRef.current === slideId) {
      activeIdRef.current = null;
      setActiveRenderSlideId(null);

      // Process next after a short delay
      setTimeout(() => {
        processNextInQueue();
      }, 150);
    }

    // Trigger re-render
    setTick(t => t + 1);
  }, [processNextInQueue]);

  // Check if slide should render now
  const needsRender = useCallback((slideId: string): boolean => {
    return activeRenderSlideId === slideId;
  }, [activeRenderSlideId]);

  // Check if slide is cached
  const isCached = useCallback((slideId: string): boolean => {
    return cachedSetRef.current.has(slideId);
  }, []);

  return {
    activeRenderSlideId,
    markCached,
    needsRender,
    isCached,
    markVisible,
    markHidden,
  };
}
