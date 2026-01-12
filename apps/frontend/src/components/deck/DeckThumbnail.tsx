import React from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Presentation } from 'lucide-react';
import MiniSlide from './MiniSlide';

// Component to render a deck thumbnail using the first slide
const DeckThumbnail: React.FC<{ deck: CompleteDeckData }> = React.memo(({ deck }) => {
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

  if (!hasComponents) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-md p-4">
        <Presentation className="h-10 w-10 text-primary/50 mb-2" />
        <p className="text-xs text-muted-foreground text-center line-clamp-2">{deck.name}</p>
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
