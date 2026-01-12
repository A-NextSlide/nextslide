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
  responsive?: boolean; // If true, will fit to container size
  slideSize?: { width: number; height: number };
}

// This component renders a miniature version of the slide directly
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
  // Use sensible fallback dimensions to prevent 0-size containers on mobile
  const fallbackWidth = fixedWidth || 160;
  const fallbackHeight = fixedHeight || 90;
  const [dimensions, setDimensions] = useState({ width: fallbackWidth, height: fallbackHeight });
  // Always render immediately - don't block on ResizeObserver
  const [isReady, setIsReady] = useState(true);
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
  
  // Use ResizeObserver to track container size changes when responsive
  useEffect(() => {
    if (!responsive || !containerRef.current) {
      if (fixedWidth && fixedHeight) {
        setDimensions({ width: fixedWidth, height: fixedHeight });
      }
      return;
    }
    
    const updateDimensions = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      let containerWidth = rect.width;
      let containerHeight = rect.height;

      // On mobile, container may have 0 dimensions initially - use fallbacks
      if (containerWidth <= 0 || containerHeight <= 0) {
        containerWidth = fallbackWidth;
        containerHeight = fallbackHeight;
      }

      // Calculate dimensions maintaining aspect ratio
      const aspectRatio = baseSlideWidth / baseSlideHeight;
      let width = containerWidth;
      let height = containerWidth / aspectRatio;

      // If calculated height exceeds container, scale based on height
      if (height > containerHeight) {
        height = containerHeight;
        width = containerHeight * aspectRatio;
      }

      setDimensions({ width: Math.max(1, width), height: Math.max(1, height) });
      setIsReady(true);
    };
    
    // Initial calculation
    updateDimensions();

    if (typeof ResizeObserver === 'undefined') {
      setIsReady(true);
      return;
    }
    
    // Set up ResizeObserver
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [responsive, fixedWidth, fixedHeight, baseSlideWidth, baseSlideHeight]);
  
  // Calculate scale based on current dimensions - guard against NaN and 0
  const rawScale = Math.min(
    dimensions.width / baseSlideWidth,
    dimensions.height / baseSlideHeight
  );
  // Ensure scale is valid (not NaN, not 0, not Infinity) - minimum 0.01 to prevent invisible renders
  const scale = (!isFinite(rawScale) || rawScale <= 0) ? 0.05 : Math.max(0.01, rawScale);

  // Calculate actual dimensions to maintain aspect ratio
  const actualWidth = Math.max(1, baseSlideWidth * scale);
  const actualHeight = Math.max(1, baseSlideHeight * scale);
  
  // If responsive, use container ref for sizing
  // Compute a simple fallback background from the slide's Background component
  const fallbackBackground = useMemo(() => {
    const comps = normalizedSlide?.components || [];
    const bg = comps.find(
      (comp) => comp.type === 'Background' || (comp.id && comp.id.toLowerCase().includes('background'))
    );
    if (!bg) return undefined as string | undefined;
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
        if (!stops) return undefined as any;
        if (gradient.type === 'radial') {
          return `radial-gradient(circle, ${stops})`;
        }
        const angle = typeof gradient.angle === 'number' ? gradient.angle : 180;
        return `linear-gradient(${angle}deg, ${stops})`;
      }
    } catch {}
    const directColor = props.backgroundColor || props.color || props.page?.backgroundColor;
    if (typeof directColor === 'string' && directColor) return directColor;
    return undefined as string | undefined;
  }, [normalizedSlide]);

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
        style={fallbackBackground ? { background: fallbackBackground } : undefined}
      >
        {isReady && (
          <div 
            className="absolute inset-0 flex items-center justify-center"
          >
            <div 
              className="relative"
              style={{
                width: actualWidth,
                height: actualHeight
              }}
            >
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
            </div>
          </div>
        )}
      </div>
    );
  }
  
  // Non-responsive version (original behavior)
  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded cursor-pointer transition-all slide-thumbnail",
        "hover:ring-2 hover:ring-primary/50",
        className
      )}
      style={{ 
        width: actualWidth, 
        height: actualHeight,
        ...(fallbackBackground ? { background: fallbackBackground } : {})
      }}
      onClick={onClick}
    >
      <div 
        className="absolute inset-0"
        style={{
          width: `${baseSlideWidth}px`,
          height: `${baseSlideHeight}px`,
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
                  width: `${baseSlideWidth}px`, 
                  height: `${baseSlideHeight}px`,
                  position: 'absolute',
                  top: 0,
                  left: 0
                }}
              />
            </StaticActiveSlideProvider>
          </EditorStateProvider>
        </NavigationProvider>
      </div>
    </div>
  );
};

export default MiniSlide; 
