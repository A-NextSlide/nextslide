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
      { rootMargin: '100px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Measure container once visible
  useEffect(() => {
    if (!isVisible || !containerRef.current) return;
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        setContainerDims({ width: rect.width, height: rect.height });
      }
    };
    measure();
    // Also measure after a short delay in case layout isn't ready
    const t = setTimeout(measure, 50);
    return () => clearTimeout(t);
  }, [isVisible]);

  // Calculate scale
  const getScale = () => {
    if (!responsive && fixedWidth && fixedHeight) {
      return Math.min(fixedWidth / baseWidth, fixedHeight / baseHeight);
    }
    if (containerDims) {
      return Math.min(containerDims.width / baseWidth, containerDims.height / baseHeight);
    }
    return 0.1; // fallback
  };
  const scale = Math.max(0.01, getScale());

  // Render placeholder when not visible or no dimensions yet
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
            top: '50%',
            left: '50%',
            width: baseWidth,
            height: baseHeight,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center center',
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
                    height: baseHeight,
                    position: 'absolute',
                    top: 0,
                    left: 0
                  }}
                />
              </StaticActiveSlideProvider>
            </EditorStateProvider>
          </NavigationProvider>
        </div>
      )}
    </div>
  );
};

export default MiniSlide;
