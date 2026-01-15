import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { cn } from '@/lib/utils';
import { normalizeSlideForRender, resolveSlideSize } from '@/utils/slideNormalization';
import { ComponentRenderer } from '@/renderers/ComponentRenderer';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';

interface MiniSlideProps {
  slide: SlideData;
  width?: number;
  height?: number;
  className?: string;
  onClick?: () => void;
  responsive?: boolean;
  slideSize?: { width: number; height: number };
}

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
  const [isVisible, setIsVisible] = useState(false);
  const [containerDims, setContainerDims] = useState<{ width: number; height: number } | null>(null);

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

  // Get background for placeholder
  const fallbackBg = useMemo(() => {
    const comps = normalizedSlide?.components || [];
    const bg = comps.find((c: any) => c.type === 'Background' || c.id?.toLowerCase().includes('background'));
    if (!bg) return '#f5f5f5';
    const props: any = bg.props || {};
    if (props.gradient?.stops || props.gradient?.colors) {
      const g = props.gradient;
      const stops = (g.stops || g.colors).filter((s: any) => s?.color).map((s: any, i: number, arr: any[]) => {
        const pos = s.position ?? (i / Math.max(1, arr.length - 1)) * 100;
        return `${s.color} ${pos <= 1 ? pos * 100 : pos}%`;
      }).join(', ');
      if (stops) return g.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle || 180}deg, ${stops})`;
    }
    return props.backgroundColor || props.color || props.style?.background || '#f5f5f5';
  }, [normalizedSlide]);

  // IntersectionObserver - only render when visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Measure container and track resize
  useEffect(() => {
    if (!isVisible || !containerRef.current) return;
    const el = containerRef.current;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        setContainerDims(prev => {
          // Only update if dimensions actually changed
          if (prev && Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1) {
            return prev;
          }
          return { width: rect.width, height: rect.height };
        });
      }
    };

    measure();

    // Use ResizeObserver to track size changes
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(el);
    }

    // Also listen to window resize as fallback
    window.addEventListener('resize', measure);

    // Also measure after a short delay in case layout isn't ready
    const t = setTimeout(measure, 50);

    return () => {
      clearTimeout(t);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isVisible]);

  // Calculate scale - use container dims or fixed dims
  const targetWidth = !responsive && fixedWidth ? fixedWidth : containerDims?.width || 160;
  const targetHeight = !responsive && fixedHeight ? fixedHeight : containerDims?.height || 90;
  const scale = Math.max(0.01, Math.min(targetWidth / baseWidth, targetHeight / baseHeight));

  // Get components to render
  const components = useMemo(() => {
    return normalizedSlide?.components || [];
  }, [normalizedSlide]);

  // Separate background from other components
  const { backgroundComponent, otherComponents } = useMemo(() => {
    const bg = components.find((c: any) => c.type === 'Background' || c.id?.toLowerCase().includes('background'));
    const others = components.filter((c: any) => c.type !== 'Background' && !c.id?.toLowerCase().includes('background'));
    return { backgroundComponent: bg, otherComponents: others };
  }, [components]);

  // Create safe slide for provider
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

  // Show placeholder when not visible or no dimensions
  const showPlaceholder = !isVisible || (responsive && !containerDims);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded cursor-pointer w-full h-full",
        "hover:ring-2 hover:ring-primary/50",
        className
      )}
      onClick={onClick}
      style={{ background: fallbackBg }}
    >
      {!showPlaceholder && (
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
          {/* Inner container at base slide dimensions, scaled down */}
          <div
            style={{
              position: 'relative',
              width: baseWidth,
              height: baseHeight,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none'
            }}
          >
            <EditorStateProvider
              syncConfig={{ enabled: false, useRealtimeSubscription: false }}
              initialEditingState={false}
              slideSizeOverride={resolvedSlideSize}
            >
              <StaticActiveSlideProvider slide={safeSlide}>
                {/* Background */}
                {backgroundComponent && (
                  <div
                    className="absolute inset-0 w-full h-full overflow-hidden"
                    style={{ zIndex: 0 }}
                  >
                    <ComponentRenderer
                      component={backgroundComponent}
                      isThumbnail={true}
                      allComponents={components}
                    />
                  </div>
                )}

                {/* Other components */}
                {otherComponents.map((component: any) => (
                  <ComponentRenderer
                    key={component.id}
                    component={component}
                    isThumbnail={true}
                    allComponents={components}
                  />
                ))}
              </StaticActiveSlideProvider>
            </EditorStateProvider>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiniSlide;
