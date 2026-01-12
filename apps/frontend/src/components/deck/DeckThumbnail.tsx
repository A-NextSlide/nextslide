import React, { useMemo } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Presentation } from 'lucide-react';
import MiniSlide from './MiniSlide';
import { useIsMobile } from '@/hooks/use-mobile';

// Extract background from slide for lightweight mobile thumbnails
const extractBackgroundFromSlide = (slide: any): string | undefined => {
  if (!slide?.components) return undefined;
  const bg = slide.components.find(
    (comp: any) => comp.type === 'Background' || comp.id?.toLowerCase().includes('background')
  );
  if (!bg?.props) return undefined;

  const props = bg.props;
  const gradient = props.gradient || props.style?.background;

  try {
    if (typeof gradient === 'string' && gradient) return gradient;
    if (gradient && typeof gradient === 'object') {
      const rawStops = Array.isArray(gradient.stops) ? gradient.stops : gradient.colors;
      if (!rawStops?.length) return undefined;

      const stops = rawStops
        .filter((s: any) => s?.color)
        .map((s: any, idx: number) => {
          let pos = s.position ?? (idx / Math.max(1, rawStops.length - 1)) * 100;
          if (pos <= 1 && rawStops.every((st: any) => (st.position ?? 0) <= 1)) pos *= 100;
          return `${s.color} ${pos}%`;
        })
        .join(', ');

      if (!stops) return undefined;
      if (gradient.type === 'radial') return `radial-gradient(circle, ${stops})`;
      const angle = typeof gradient.angle === 'number' ? gradient.angle : 180;
      return `linear-gradient(${angle}deg, ${stops})`;
    }
  } catch {}

  return props.backgroundColor || props.color || props.page?.backgroundColor;
};

// Component to render a deck thumbnail using the first slide
const DeckThumbnail: React.FC<{ deck: CompleteDeckData }> = React.memo(({ deck }) => {
  const isMobile = useIsMobile();
  // Get the first slide from the deck for the thumbnail
  // Support both old format (deck.slides[0]) and new format (deck.first_slide)
  const rawFirstSlide = (deck as any).first_slide || (deck.slides && deck.slides.length > 0 ? deck.slides[0] : null);
  let firstSlide: any = rawFirstSlide;
  if (typeof rawFirstSlide === 'string') {
    try {
      firstSlide = JSON.parse(rawFirstSlide);
    } catch {
      firstSlide = null;
    }
  }
  

  
  // If no slide at all, show a placeholder
  if (!firstSlide) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-md p-4">
        <Presentation className="h-10 w-10 text-primary/50 mb-2" />
        <p className="text-xs text-muted-foreground text-center line-clamp-2">{deck.name}</p>
      </div>
    );
  }
  
  const hasComponents = Array.isArray(firstSlide.components) && firstSlide.components.length > 0;

  // Memoize background extraction for mobile
  const slideBackground = useMemo(() => {
    if (!isMobile || !hasComponents) return undefined;
    return extractBackgroundFromSlide(firstSlide);
  }, [isMobile, hasComponents, firstSlide]);

  if (!hasComponents) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-md p-4">
        <Presentation className="h-10 w-10 text-primary/50 mb-2" />
        <p className="text-xs text-muted-foreground text-center line-clamp-2">{deck.name}</p>
      </div>
    );
  }

  // On mobile, render a lightweight thumbnail with just the background
  // This prevents crashes from too many MiniSlide components creating ResizeObservers
  if (isMobile) {
    const bgStyle = slideBackground || 'linear-gradient(135deg, #f8fafc, #e2e8f0)';
    return (
      <div
        className="w-full h-full rounded-md relative overflow-hidden"
        style={{ background: bgStyle }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="p-2 rounded-full bg-black/10 backdrop-blur-sm">
            <Presentation className="h-6 w-6 text-white/70" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <MiniSlide
      slide={firstSlide}
      responsive={true}
      slideSize={deck.size}
    />
  );
}, (prevProps, nextProps) => {
  // Only re-render if the deck changes
  const prevFirstSlide = (prevProps.deck as any).first_slide || prevProps.deck.slides?.[0];
  const nextFirstSlide = (nextProps.deck as any).first_slide || nextProps.deck.slides?.[0];
  
  return (
    prevProps.deck.uuid === nextProps.deck.uuid &&
    prevFirstSlide?.id === nextFirstSlide?.id &&
    prevFirstSlide?.lastModified === nextFirstSlide?.lastModified
  );
});

DeckThumbnail.displayName = 'DeckThumbnail';

export default DeckThumbnail;
