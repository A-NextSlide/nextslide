import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SlideData } from '@/types/SlideTypes';
import Slide from '@/components/Slide';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { NavigationProvider } from '@/context/NavigationContext';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { cn } from '@/lib/utils';
import { normalizeSlideForRender, resolveSlideSize } from '@/utils/slideNormalization';

interface MiniSlideProps {
  slide: SlideData;
  width?: number;
  height?: number;
  className?: string;
  onClick?: () => void;
  responsive?: boolean;
  slideSize?: { width: number; height: number };
}

// Extract background from slide for placeholder rendering
const getSlideBackground = (slide: SlideData | null): string | undefined => {
  if (!slide) return undefined;
  const comps = slide?.components || [];
  const bg = comps.find(
    (comp) => comp.type === 'Background' || (comp.id && comp.id.toLowerCase().includes('background'))
  );
  if (!bg) return undefined;
  const props: any = bg.props || {};
  const gradient = props.gradient || props.style?.background || (props.background && props.background.color ? props.background : null);
  try {
    if (typeof gradient === 'string' && gradient) return gradient;
    if (gradient && typeof gradient === 'object' && (Array.isArray((gradient as any).stops) || Array.isArray((gradient as any).colors))) {
      const rawStops = Array.isArray((gradient as any).stops) ? (gradient as any).stops : (gradient as any).colors;
      const stops = rawStops
        .filter((s: any) => s && s.color)
        .map((s: any, idx: number) => {
          let position = s.position;
          if (position === undefined || position === null || isNaN(position)) {
            position = (idx / Math.max(1, rawStops.length - 1)) * 100;
          }
          if (position <= 1 && rawStops.every((stop: any) => (stop.position ?? 0) <= 1)) {
            position = position * 100;
          }
          return `${s.color}${typeof position === 'number' ? ` ${position}%` : ''}`;
        })
        .join(', ');
      if (!stops) return undefined;
      if (gradient.type === 'radial') {
        return `radial-gradient(circle, ${stops})`;
      }
      const angle = typeof gradient.angle === 'number' ? gradient.angle : 180;
      return `linear-gradient(${angle}deg, ${stops})`;
    }
  } catch {}
  const directColor = props.backgroundColor || props.color || props.page?.backgroundColor;
  if (typeof directColor === 'string' && directColor) return directColor;
  return undefined;
};

const MiniSlide: React.FC<MiniSlideProps> = ({
  slide,
  width: fixedWidth,
  height: fixedHeight,
  className = '',
  onClick,
  responsive = true,
  slideSize
}) => {
  // ALL HOOKS MUST BE AT THE TOP - before any conditionals or functions
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 160, height: 90 });

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

  const safeSlide = useMemo(() => {
    if (normalizedSlide) return normalizedSlide;
    return {
      id: 'thumbnail-fallback',
      deckId: '',
      order: 0,
      status: 'completed',
      components: []
    } as SlideData;
  }, [normalizedSlide]);

  const baseSlideWidth = resolvedSlideSize?.width || DEFAULT_SLIDE_WIDTH;
  const baseSlideHeight = resolvedSlideSize?.height || DEFAULT_SLIDE_HEIGHT;
  const aspectRatio = baseSlideWidth / baseSlideHeight;

  // Get background for placeholder
  const fallbackBackground = useMemo(() => getSlideBackground(normalizedSlide), [normalizedSlide]);

  // IntersectionObserver - only render full slide when visible (prevents mobile crash)
  useEffect(() => {
    if (!containerRef.current) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      setHasBeenVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            setHasBeenVisible(true);
          } else {
            setIsVisible(false);
          }
        });
      },
      { root: null, rootMargin: '100px', threshold: 0 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ResizeObserver for responsive mode - debounced to prevent crashes
  useEffect(() => {
    if (!responsive || !containerRef.current) return;

    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      let timeoutId: ReturnType<typeof setTimeout>;
      const observer = new ResizeObserver(() => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(updateSize, 100);
      });
      observer.observe(containerRef.current);
      return () => {
        clearTimeout(timeoutId);
        observer.disconnect();
      };
    }
  }, [responsive]);

  // Calculate dimensions for non-responsive mode
  const targetWidth = fixedWidth || 160;
  const targetHeight = fixedHeight || (targetWidth / aspectRatio);
  const fixedScale = Math.min(targetWidth / baseSlideWidth, targetHeight / baseSlideHeight);
  const safeFixedScale = (!isFinite(fixedScale) || fixedScale <= 0) ? 0.1 : fixedScale;

  // Calculate dimensions for responsive mode
  const responsiveScale = Math.min(
    containerSize.width / baseSlideWidth,
    containerSize.height / baseSlideHeight
  );
  const safeResponsiveScale = (!isFinite(responsiveScale) || responsiveScale <= 0) ? 0.1 : responsiveScale;

  // Placeholder component
  const Placeholder = () => (
    <div
      className="w-full h-full"
      style={{ background: fallbackBackground || '#f0f0f0' }}
    />
  );

  // Full slide render component
  const FullSlideRender = ({ scale }: { scale: number }) => (
    <div
      style={{
        width: `${baseSlideWidth}px`,
        height: `${baseSlideHeight}px`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        pointerEvents: 'none',
        background: 'transparent'
      }}
    >
      <NavigationProvider initialSlideIndex={0}>
        <EditorStateProvider
          syncConfig={{ enabled: false, useRealtimeSubscription: false }}
          initialEditingState={false}
          slideSizeOverride={resolvedSlideSize}
        >
          <StaticActiveSlideProvider slide={safeSlide}>
            <div className="slide-canvas" style={{ background: 'transparent' }}>
              <Slide
                slide={safeSlide}
                isActive={true}
                isEditing={false}
                isThumbnail={true}
                style={{
                  width: `${baseSlideWidth}px`,
                  height: `${baseSlideHeight}px`,
                  position: 'absolute',
                  top: 0,
                  left: 0
                }}
              />
            </div>
          </StaticActiveSlideProvider>
        </EditorStateProvider>
      </NavigationProvider>
    </div>
  );

  // RESPONSIVE MODE
  if (responsive) {
    return (
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden rounded cursor-pointer transition-all w-full h-full slide-thumbnail",
          "hover:ring-2 hover:ring-primary/50",
          className
        )}
        onClick={onClick}
        style={{
          aspectRatio: `${baseSlideWidth} / ${baseSlideHeight}`,
          background: fallbackBackground || '#f5f5f5'
        }}
      >
        {(isVisible || hasBeenVisible) ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="relative"
              style={{
                width: baseSlideWidth * safeResponsiveScale,
                height: baseSlideHeight * safeResponsiveScale
              }}
            >
              <FullSlideRender scale={safeResponsiveScale} />
            </div>
          </div>
        ) : <Placeholder />}
      </div>
    );
  }

  // NON-RESPONSIVE MODE (fixed dimensions)
  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded cursor-pointer transition-all slide-thumbnail",
        "hover:ring-2 hover:ring-primary/50",
        className
      )}
      style={{
        width: baseSlideWidth * safeFixedScale,
        height: baseSlideHeight * safeFixedScale,
        background: fallbackBackground || '#f5f5f5'
      }}
      onClick={onClick}
    >
      {(isVisible || hasBeenVisible) ? (
        <div className="absolute inset-0">
          <FullSlideRender scale={safeFixedScale} />
        </div>
      ) : <Placeholder />}
    </div>
  );
};

export default MiniSlide;
