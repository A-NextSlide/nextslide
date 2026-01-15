import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { cn } from '@/lib/utils';
import { normalizeSlideForRender, resolveSlideSize } from '@/utils/slideNormalization';
import Slide from '@/components/Slide';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { NavigationProvider } from '@/context/NavigationContext';

interface MiniSlideProps {
  slide: SlideData;
  width?: number;
  height?: number;
  className?: string;
  onClick?: () => void;
  responsive?: boolean;
  slideSize?: { width: number; height: number };
}

/**
 * Synchronous mobile detection using matchMedia
 * This runs during render, not in useEffect, so we get the correct value on first render
 */
const checkIsMobile = (): boolean => {
  if (typeof window === 'undefined') return true; // SSR: assume mobile for safety

  // Check touch capability
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Check screen size using matchMedia (synchronous)
  const isNarrowScreen = window.matchMedia('(max-width: 768px)').matches;
  const isShortScreen = window.matchMedia('(max-height: 500px)').matches;

  // Also check userAgent for mobile devices
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent);

  // Mobile if: touch device with small screen, OR mobile user agent
  return (isTouch && (isNarrowScreen || isShortScreen)) || isMobileUA;
};

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
 *
 * Mobile: Renders simple background only to prevent memory crashes
 * Desktop: Renders full slide content with proper scaling
 */
const MiniSlide: React.FC<MiniSlideProps> = ({
  slide,
  width: fixedWidth,
  height: fixedHeight,
  className = '',
  onClick,
  responsive = true,
  slideSize
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDims, setContainerDims] = useState<{ width: number; height: number } | null>(null);

  // Check mobile synchronously on every render
  // This ensures we NEVER render heavy components on mobile
  const isMobile = checkIsMobile();

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

  // Measure container for responsive mode (desktop only)
  useEffect(() => {
    // Skip measurement on mobile - we don't need it
    if (isMobile) return;
    if (!containerRef.current) return;

    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        setContainerDims({ width: rect.width, height: rect.height });
      }
    };

    measure();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver?.disconnect();
    };
  }, [isMobile]);

  // Common container classes
  const containerClasses = cn(
    "relative overflow-hidden rounded cursor-pointer w-full h-full",
    "hover:ring-2 hover:ring-primary/50",
    className
  );

  // ========================================
  // MOBILE: Simple background-only rendering
  // ========================================
  if (isMobile) {
    return (
      <div
        ref={containerRef}
        className={containerClasses}
        onClick={onClick}
        style={backgroundStyle}
      />
    );
  }

  // ========================================
  // DESKTOP: Full slide rendering
  // ========================================

  // Calculate dimensions and scale
  const targetWidth = !responsive && fixedWidth ? fixedWidth : containerDims?.width || 160;
  const targetHeight = !responsive && fixedHeight ? fixedHeight : containerDims?.height || 90;
  const scale = Math.max(0.01, Math.min(targetWidth / baseWidth, targetHeight / baseHeight));

  // Wait for container dimensions in responsive mode
  if (responsive && !containerDims) {
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

  // Desktop: Full slide render with providers and scaling
  return (
    <div
      ref={containerRef}
      className={containerClasses}
      onClick={onClick}
      style={backgroundStyle}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: targetWidth,
          height: targetHeight,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: baseWidth,
            height: baseHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            pointerEvents: 'none'
          }}
        >
          <NavigationProvider initialSlideIndex={0}>
            <EditorStateProvider
              syncConfig={{ enabled: false, useRealtimeSubscription: false }}
              initialEditingState={false}
              slideSizeOverride={resolvedSlideSize}
            >
              <StaticActiveSlideProvider slide={safeSlide}>
                <Slide
                  slide={safeSlide}
                  isActive={true}
                  isEditing={false}
                  isThumbnail={true}
                  style={{
                    width: baseWidth,
                    height: baseHeight
                  }}
                />
              </StaticActiveSlideProvider>
            </EditorStateProvider>
          </NavigationProvider>
        </div>
      </div>
    </div>
  );
};

export default MiniSlide;
