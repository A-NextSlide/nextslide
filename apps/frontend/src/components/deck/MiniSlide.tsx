import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { cn } from '@/lib/utils';
import { normalizeSlideForRender, resolveSlideSize } from '@/utils/slideNormalization';
import Slide from '@/components/Slide';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { NavigationProvider } from '@/context/NavigationContext';
import { ThumbnailRenderProvider } from '@/context/ThumbnailRenderContext';

interface MiniSlideProps {
  slide: SlideData;
  width?: number;
  height?: number;
  className?: string;
  onClick?: () => void;
  responsive?: boolean;
  slideSize?: { width: number; height: number };
  /**
   * Rendering mode:
   * - full: render the full slide (can be heavy for lists)
   * - background: render only extracted background (safe for mobile deck lists)
   */
  renderMode?: 'full' | 'background';
}

/**
 * Extract background style from slide components
 */
const extractBackgroundStyle = (slide: SlideData | null): React.CSSProperties => {
  if (!slide) return { background: '#f5f5f5' };

  const comps = slide.components || [];
  const bg = comps.find((c: any) =>
    c.type === 'Background' || c.id?.toLowerCase().includes('background')
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

  // Handle string gradient
  if (typeof props.gradient === 'string' && props.gradient) {
    return { background: props.gradient };
  }

  // Handle solid color
  const color = props.backgroundColor || props.color || props.style?.background;
  if (color) {
    return { background: color };
  }

  return { background: '#f5f5f5' };
};

/**
 * MiniSlide - Thumbnail renderer for slides
 * Renders full slide content with proper scaling
 */
const MiniSlide: React.FC<MiniSlideProps> = ({
  slide,
  width: fixedWidth,
  height: fixedHeight,
  className = '',
  onClick,
  responsive = true,
  slideSize,
  renderMode = 'full'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDims, setContainerDims] = useState<{ width: number; height: number } | null>(null);
  const slideId = slide?.id || 'unknown';

  // Normalize slide data
  const normalizedResult = useMemo(() => {
    return normalizeSlideForRender(slide, slideSize, { preferFallbackSize: true });
  }, [slide, slideSize]);

  const normalizedSlide = useMemo(() => {
    if (normalizedResult?.slide) return normalizedResult.slide;
    if (typeof slide === 'string') return null;
    return slide;
  }, [normalizedResult, slide]);

  const resolvedSlideSize = useMemo(() => {
    if (normalizedResult?.slideSize) return normalizedResult.slideSize;
    return resolveSlideSize(normalizedSlide, slideSize);
  }, [normalizedResult, normalizedSlide, slideSize]);

  const baseWidth = resolvedSlideSize?.width || DEFAULT_SLIDE_WIDTH;
  const baseHeight = resolvedSlideSize?.height || DEFAULT_SLIDE_HEIGHT;

  // Extract background style
  const backgroundStyle = useMemo(() => extractBackgroundStyle(normalizedSlide), [normalizedSlide]);

  // Constants for stability
  const STABILITY_THRESHOLD = 100; // Only "lock" dimensions above this size

  // Measure container for responsive mode
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // Track if we have ever had a "stable" size (reasonable resolution)
    let isStable = false;

    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      // Expanded safety check: ensure strictly positive dimensions
      if (rect.width > 0 && rect.height > 0) {
        // If we already had a stable size, ignore very small "glitch" sizes (e.g. < STABILITY_THRESHOLD)
        // that might happen during mobile layout shifts (address bar, etc)
        if (isStable && (rect.width < STABILITY_THRESHOLD || rect.height < STABILITY_THRESHOLD)) {
          return;
        }

        if (rect.width >= STABILITY_THRESHOLD && rect.height >= STABILITY_THRESHOLD) {
          isStable = true;
        }

        setContainerDims({ width: rect.width, height: rect.height });
      }
    };

    // Initial measure with a small delay to allow mobile layout to settle
    const initialTimer = setTimeout(() => {
      measure();
    }, 100);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          // Stability check: ignore zero/tiny sizes if we already have a stable size
          if (width > 0 && height > 0) {
            if (isStable && (width < STABILITY_THRESHOLD || height < STABILITY_THRESHOLD)) return;

            if (width >= STABILITY_THRESHOLD && height >= STABILITY_THRESHOLD) {
              isStable = true;
            }
            setContainerDims({ width, height });
            return;
          }
        }
        measure();
      });
      resizeObserver.observe(containerRef.current);
    }

    const handleWindowResize = () => measure();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      clearTimeout(initialTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [renderMode, responsive]);

  // Common container classes - removed flex centering as it interferes with absolute positioning
  const containerClasses = cn(
    "relative overflow-hidden rounded cursor-pointer w-full h-full",
    "hover:ring-2 hover:ring-primary/50",
    className
  );

  // Calculate dimensions and scale
  // Default to a reasonable size if no dims yet to prevent layout thrashing
  const targetWidth = !responsive && fixedWidth ? fixedWidth : (containerDims?.width || 200);
  const targetHeight = !responsive && fixedHeight ? fixedHeight : (containerDims?.height || 112);

  // Safe scale calculation to avoid Infinity/NaN
  const scale = Math.min(
    targetWidth / Math.max(1, baseWidth),
    targetHeight / Math.max(1, baseHeight)
  );

  // Lightweight background-only rendering (used for mobile deck list stability/perf)
  if (renderMode === 'background') {
    return (
      <div
        ref={containerRef}
        className={containerClasses}
        onClick={onClick}
        style={backgroundStyle}
      />
    );
  }

  // Create safe slide for providers
  const safeSlide: SlideData = normalizedSlide || {
    id: 'thumbnail-fallback',
    deckId: '',
    order: 0,
    status: 'completed',
    components: []
  };

  // Check if we have content to render
  const hasContent = Array.isArray(safeSlide.components) && safeSlide.components.length > 0;

  // No content - show background only
  if (!hasContent) {
    return (
      <div
        ref={containerRef}
        className={containerClasses}
        onClick={onClick}
        style={backgroundStyle}
      />
    );
  }

  // Don't render full slide content until we have valid container dimensions
  // This prevents the tiny initial render from getting "stuck" due to memoization
  const hasValidDimensions = containerDims && containerDims.width > 100 && containerDims.height > 50;

  // Calculate the scaled dimensions for the wrapper
  const scaledWidth = baseWidth * scale;
  const scaledHeight = baseHeight * scale;

  console.log('[MiniSlide] Render:', {
    slideId,
    containerDims,
    baseWidth,
    baseHeight,
    scale,
    scaledWidth,
    scaledHeight,
    hasValidDimensions,
  });

  // Full slide render with providers and scaling
  // Use a wrapper that clips to the scaled size, containing a full-size slide that gets scaled
  return (
    <div
      ref={containerRef}
      className={containerClasses}
      onClick={onClick}
      style={backgroundStyle}
    >
      {hasValidDimensions && (
        <div
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
            overflow: 'hidden',
          }}
        >
          <div
            key={`scale-${Math.round(scale * 1000)}`}
            style={{
              position: 'relative',
              width: `${baseWidth}px`,
              height: `${baseHeight}px`,
              WebkitTransform: `scale(${scale})`,
              transform: `scale(${scale})`,
              WebkitTransformOrigin: 'top left',
              transformOrigin: 'top left',
              pointerEvents: 'none',
            } as React.CSSProperties}
          >
            {/* Force the slide to fill this exact container */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${baseWidth}px`,
                height: `${baseHeight}px`,
              }}
            >
              <NavigationProvider initialSlideIndex={0}>
                <EditorStateProvider
                  syncConfig={{ enabled: false, useRealtimeSubscription: false }}
                  initialEditingState={false}
                  slideSizeOverride={resolvedSlideSize}
                >
                  <StaticActiveSlideProvider slide={safeSlide}>
                    <ThumbnailRenderProvider mode={renderMode === 'full' ? 'full' : 'lite'}>
                      <Slide
                        slide={safeSlide}
                        isActive={true}
                        isEditing={false}
                        isThumbnail={true}
                      />
                    </ThumbnailRenderProvider>
                  </StaticActiveSlideProvider>
                </EditorStateProvider>
              </NavigationProvider>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiniSlide;
