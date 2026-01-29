import { useSyncExternalStore, useMemo, useRef, useEffect } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { subscribe, getSnapshot, getStamp, generateContentHash } from './stampCache';
import { requestStamp } from './stampRenderer';

interface SlideStampResult {
  stampUrl: string | null;
  isGenerating: boolean;
  backgroundStyle: React.CSSProperties;
}

const DEBOUNCE_MS = 2000;

/**
 * React hook for slide stamps.
 * Subscribes to the stamp cache and auto-requests generation on cache miss.
 */
export function useSlideStamp(
  slide: SlideData | null,
  slideSize?: { width: number; height: number }
): SlideStampResult {
  // Subscribe to cache changes
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const slideId = slide?.id || '';
  const hash = useMemo(() => (slide ? generateContentHash(slide) : ''), [slide]);
  const stampUrl = slideId && hash ? getStamp(slideId, hash) : null;

  // Track request state
  const requestedHashRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGeneratingRef = useRef(false);

  // Background style for placeholder
  const backgroundStyle = useMemo(() => extractBackgroundStyle(slide), [slide]);

  // Auto-request stamp on cache miss (debounced)
  useEffect(() => {
    if (!slide || !slideId || !hash) return;
    if (stampUrl) {
      // Already cached and valid
      isGeneratingRef.current = false;
      requestedHashRef.current = hash;
      return;
    }

    // Already requested this exact hash
    if (requestedHashRef.current === hash) return;

    // Debounce to avoid re-requesting during rapid edits
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      requestedHashRef.current = hash;
      isGeneratingRef.current = true;
      requestStamp(slide, slideSize, 'normal').finally(() => {
        isGeneratingRef.current = false;
      });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [slide, slideId, hash, stampUrl, slideSize]);

  const isGenerating = !stampUrl && !!slideId && !!hash;

  return { stampUrl, isGenerating, backgroundStyle };
}

/**
 * Extract background CSS from slide components for placeholder rendering.
 */
function extractBackgroundStyle(slide: SlideData | null): React.CSSProperties {
  if (!slide) return { background: '#f5f5f5' };

  const comps = slide.components || [];
  const bg = comps.find(
    (c: any) => c.type === 'Background' || c.id?.toLowerCase().includes('background')
  );

  if (!bg) return { background: '#f5f5f5' };

  const props: any = bg.props || {};

  // Handle gradient backgrounds
  if (props.gradient && typeof props.gradient === 'object') {
    const g = props.gradient;
    const rawStops = g.stops || g.colors || [];
    if (rawStops.length > 0) {
      const stops = rawStops
        .filter((s: any) => s?.color)
        .map((s: any, i: number, arr: any[]) => {
          let pos = s.position ?? (i / Math.max(1, arr.length - 1)) * 100;
          if (pos <= 1 && arr.every((stop: any) => (stop.position ?? 0) <= 1)) {
            pos = pos * 100;
          }
          return `${s.color} ${pos}%`;
        })
        .join(', ');

      if (stops) {
        if (g.type === 'radial') {
          return { background: `radial-gradient(circle, ${stops})` };
        }
        const angle = typeof g.angle === 'number' ? g.angle : 180;
        return { background: `linear-gradient(${angle}deg, ${stops})` };
      }
    }
  }

  if (typeof props.gradient === 'string' && props.gradient) {
    return { background: props.gradient };
  }

  const color = props.backgroundColor || props.color || props.style?.background;
  if (color) return { background: color };

  return { background: '#f5f5f5' };
}
