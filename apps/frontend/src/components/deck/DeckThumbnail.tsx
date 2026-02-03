import React, { useMemo } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Presentation } from 'lucide-react';
import MiniSlide from './MiniSlide';
import { BROWSER } from '@/utils/browser';

// Component to render a deck thumbnail using the first slide
const DeckThumbnail: React.FC<{ deck: CompleteDeckData; renderMode?: 'full' | 'background'; forceRender?: boolean }> = React.memo(({ deck, renderMode = 'full', forceRender = false }) => {
  // On mobile & desktop app, prefer server-rendered thumbnail to prevent
  // GPU tile budget exhaustion from full Slide DOM rendering
  const serverThumbnail = (deck as any).thumbnail_url;
  if ((BROWSER.isMobile || BROWSER.isDesktopApp) && serverThumbnail) {
    return (
      <img
        src={serverThumbnail}
        alt={deck.name || 'Deck thumbnail'}
        className="w-full h-full object-cover"
        draggable={false}
        loading="lazy"
      />
    );
  }

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

  // If no slide at all, show a placeholder
  if (!firstSlide || !hasComponents) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-md p-4">
        <Presentation className="h-10 w-10 text-primary/50 mb-2" />
        <p className="text-xs text-muted-foreground text-center line-clamp-2">{deck.name}</p>
      </div>
    );
  }

  // On mobile/desktop app without a server thumbnail, use lightweight background-only
  // mode to prevent crashes and GPU tile budget exhaustion from full slide rendering
  const effectiveRenderMode = (BROWSER.isMobile || BROWSER.isDesktopApp) ? 'background' : renderMode;

  // Use MiniSlide - it has IntersectionObserver for lazy loading
  return (
    <div className="w-full h-full">
      <MiniSlide
        key={effectiveRenderMode} // Force remount on mode change to ensure clean measurement
        slide={firstSlide}
        responsive={true}
        slideSize={deck.size}
        className="w-full h-full"
        renderMode={effectiveRenderMode}
        forceRender={forceRender}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  const prevFirstSlide = (prevProps.deck as any).first_slide || prevProps.deck.slides?.[0];
  const nextFirstSlide = (nextProps.deck as any).first_slide || nextProps.deck.slides?.[0];

  return (
    prevProps.deck.uuid === nextProps.deck.uuid &&
    prevFirstSlide?.id === nextFirstSlide?.id &&
    prevFirstSlide?.lastModified === nextFirstSlide?.lastModified &&
    prevProps.renderMode === nextProps.renderMode &&
    prevProps.forceRender === nextProps.forceRender
  );
});

DeckThumbnail.displayName = 'DeckThumbnail';

export default DeckThumbnail;
