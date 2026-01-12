import React, { useMemo } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Presentation } from 'lucide-react';
import MiniSlide from './MiniSlide';
import { useIsMobile } from '@/hooks/use-mobile';

// Extract background from slide components - lightweight extraction
const extractBackground = (slide: any): string | undefined => {
  if (!slide?.components) return undefined;
  const bg = slide.components.find(
    (comp: any) => comp.type === 'Background' || (comp.id && comp.id.toLowerCase().includes('background'))
  );
  if (!bg) return undefined;

  const props: any = bg.props || {};
  const gradient = props.gradient || props.style?.background;

  try {
    if (typeof gradient === 'string' && gradient) return gradient;
    if (gradient && typeof gradient === 'object') {
      const rawStops = Array.isArray(gradient.stops) ? gradient.stops : gradient.colors;
      if (rawStops) {
        const stops = rawStops
          .filter((s: any) => s && s.color)
          .map((s: any, idx: number) => {
            let pos = s.position;
            if (pos === undefined || pos === null || isNaN(pos)) {
              pos = (idx / Math.max(1, rawStops.length - 1)) * 100;
            }
            if (pos <= 1) pos = pos * 100;
            return `${s.color} ${pos}%`;
          })
          .join(', ');
        if (stops) {
          if (gradient.type === 'radial') return `radial-gradient(circle, ${stops})`;
          const angle = typeof gradient.angle === 'number' ? gradient.angle : 180;
          return `linear-gradient(${angle}deg, ${stops})`;
        }
      }
    }
  } catch {}

  return props.backgroundColor || props.color || props.page?.backgroundColor || undefined;
};

// Component to render a deck thumbnail using the first slide
const DeckThumbnail: React.FC<{ deck: CompleteDeckData }> = React.memo(({ deck }) => {
  const isMobile = useIsMobile();

  // Get the first slide from the deck for the thumbnail
  const rawFirstSlide = (deck as any).first_slide || (deck.slides && deck.slides.length > 0 ? deck.slides[0] : null);

  const firstSlide = useMemo(() => {
    if (typeof rawFirstSlide === 'string') {
      try {
        return JSON.parse(rawFirstSlide);
      } catch {
        return null;
      }
    }
    return rawFirstSlide;
  }, [rawFirstSlide]);

  const hasComponents = Array.isArray(firstSlide?.components) && firstSlide.components.length > 0;
  const background = useMemo(() => extractBackground(firstSlide), [firstSlide]);

  // If no slide at all, show a placeholder
  if (!firstSlide || !hasComponents) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-md p-4">
        <Presentation className="h-10 w-10 text-primary/50 mb-2" />
        <p className="text-xs text-muted-foreground text-center line-clamp-2">{deck.name}</p>
      </div>
    );
  }

  // ON MOBILE: Render lightweight background-only thumbnail to prevent crash
  // MiniSlide with all its providers is too heavy for many deck cards
  if (isMobile) {
    return (
      <div
        className="w-full h-full rounded-md"
        style={{
          background: background || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}
      />
    );
  }

  // ON DESKTOP: Use full MiniSlide with proper rendering
  return (
    <MiniSlide
      slide={firstSlide}
      responsive={true}
      slideSize={deck.size}
    />
  );
}, (prevProps, nextProps) => {
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
