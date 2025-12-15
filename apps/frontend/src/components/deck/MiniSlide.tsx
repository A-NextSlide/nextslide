import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SlideData } from '@/types/SlideTypes';
import Slide from '@/components/Slide';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { ActiveSlideProvider } from '@/context/ActiveSlideContext';
import { NavigationProvider } from '@/context/NavigationContext';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { cn } from '@/lib/utils';

interface MiniSlideProps {
  slide: SlideData;
  width?: number;
  height?: number;
  className?: string;
  onClick?: () => void;
  responsive?: boolean; // If true, will fit to container size
}

// This component renders a miniature version of the slide directly
const MiniSlide: React.FC<MiniSlideProps> = ({ 
  slide, 
  width: fixedWidth,
  height: fixedHeight,
  className = '',
  onClick,
  responsive = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: fixedWidth || 160, height: fixedHeight || 90 });
  const [isReady, setIsReady] = useState(!responsive); // If not responsive, ready immediately
  
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
      const containerWidth = rect.width;
      const containerHeight = rect.height;
      
      if (containerWidth > 0 && containerHeight > 0) {
        // Calculate dimensions maintaining aspect ratio
        const aspectRatio = DEFAULT_SLIDE_WIDTH / DEFAULT_SLIDE_HEIGHT;
        let width = containerWidth;
        let height = containerWidth / aspectRatio;
        
        // If calculated height exceeds container, scale based on height
        if (height > containerHeight) {
          height = containerHeight;
          width = containerHeight * aspectRatio;
        }
        
        setDimensions({ width, height });
        setIsReady(true);
      }
    };
    
    // Initial calculation
    updateDimensions();
    
    // Set up ResizeObserver
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [responsive, fixedWidth, fixedHeight]);
  
  // Calculate scale based on current dimensions
  const scale = Math.min(
    dimensions.width / DEFAULT_SLIDE_WIDTH,
    dimensions.height / DEFAULT_SLIDE_HEIGHT
  );
  
  // Calculate actual dimensions to maintain aspect ratio
  const actualWidth = DEFAULT_SLIDE_WIDTH * scale;
  const actualHeight = DEFAULT_SLIDE_HEIGHT * scale;
  
  // If responsive, use container ref for sizing
  // Compute a simple fallback background from the slide's Background component
  const fallbackBackground = useMemo(() => {
    const comps = slide?.components || [];
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
  }, [slide]);

  if (responsive) {
    return (
      <div 
        ref={containerRef}
        className={cn(
          "relative overflow-hidden rounded cursor-pointer transition-all w-full h-full",
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
                  width: `${DEFAULT_SLIDE_WIDTH}px`,
                  height: `${DEFAULT_SLIDE_HEIGHT}px`,
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
                   >
                     <ActiveSlideProvider>
                       <div className="slide-canvas" style={{ background: 'transparent' }}>
                         <Slide 
                           slide={slide} 
                           isActive={true}
                           isEditing={false}
                           isThumbnail={true}
                           style={{ 
                             width: `${DEFAULT_SLIDE_WIDTH}px`, 
                             height: `${DEFAULT_SLIDE_HEIGHT}px`,
                             position: 'absolute',
                             top: 0,
                             left: 0
                           }}
                         />
                       </div>
                     </ActiveSlideProvider>
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
        "relative overflow-hidden rounded cursor-pointer transition-all",
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
          width: `${DEFAULT_SLIDE_WIDTH}px`,
          height: `${DEFAULT_SLIDE_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none'
        }}
      >
        <NavigationProvider initialSlideIndex={0}>
          <EditorStateProvider 
            syncConfig={{ enabled: false, useRealtimeSubscription: false }} 
            initialEditingState={false}
          >
            <ActiveSlideProvider>
              <Slide 
                slide={slide} 
                isActive={true}
                isEditing={false}
                isThumbnail={true}
                style={{ 
                  width: `${DEFAULT_SLIDE_WIDTH}px`, 
                  height: `${DEFAULT_SLIDE_HEIGHT}px`,
                  position: 'absolute',
                  top: 0,
                  left: 0
                }}
              />
            </ActiveSlideProvider>
          </EditorStateProvider>
        </NavigationProvider>
      </div>
    </div>
  );
};

export default MiniSlide; 