import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, FileStack, Loader2 } from 'lucide-react';
import { CommunityDeck, COMMUNITY_CATEGORIES } from '@/services/communityService';
import MiniSlide from '@/components/deck/MiniSlide';
import { StampThumbnail } from '@/stamps';
import { BROWSER } from '@/utils/browser';
import { cn } from '@/lib/utils';

interface CommunityDeckCardProps {
  deck: CommunityDeck;
  onRemix?: (deck: CommunityDeck) => void;
  onView?: (deck: CommunityDeck) => void;
  isRemixing?: boolean;
  showRemixButton?: boolean;
  className?: string;
  /** Cached thumbnail URL - if provided, shows this instead of rendering live MiniSlide */
  cachedThumbnailUrl?: string | null;
  /** Callback when thumbnail element is ready for screenshot capture */
  onThumbnailRef?: (element: HTMLDivElement | null) => void;
}

const CommunityDeckCard: React.FC<CommunityDeckCardProps> = ({
  deck,
  onRemix,
  onView,
  isRemixing = false,
  showRemixButton = true,
  className,
  cachedThumbnailUrl,
  onThumbnailRef,
}) => {
  const category = COMMUNITY_CATEGORIES[deck.category as keyof typeof COMMUNITY_CATEGORIES];

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger card click if clicking the remix button
    if ((e.target as HTMLElement).closest('button')) return;
    onView?.(deck);
  };

  return (
    <div
      className={cn(
        'group relative cursor-pointer',
        className
      )}
      onClick={handleCardClick}
    >
      <div className="relative aspect-[16/9] w-full max-w-full overflow-hidden rounded-lg transition-all duration-300 ring-1 ring-zinc-200 dark:ring-zinc-700 hover:ring-zinc-300 dark:hover:ring-zinc-600 hover:shadow-lg">
        {/* Thumbnail */}
        <div className="absolute inset-0 w-full h-full">
          {cachedThumbnailUrl ? (
            /* Show cached screenshot if available */
            <img
              src={cachedThumbnailUrl}
              alt={deck.title}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : deck.firstSlide ? (
            /* Render thumbnail - stamp-based on mobile, live MiniSlide on desktop */
            <div ref={onThumbnailRef} className="w-full h-full">
              {BROWSER.isMobile ? (
                <StampThumbnail
                  slide={deck.firstSlide}
                  className="w-full h-full"
                />
              ) : (
                <MiniSlide
                  slide={deck.firstSlide}
                  className="w-full h-full"
                />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-800">
              <FileStack className="h-8 w-8 text-gray-300" />
            </div>
          )}
        </div>

        {/* Category Badge - top left */}
        <div className="absolute top-2 left-2 z-10">
          <Badge
            variant="secondary"
            className="text-xs font-medium backdrop-blur-sm"
            style={{
              backgroundColor: `${category?.color}cc`,
              color: 'white',
            }}
          >
            {category?.name || deck.category}
          </Badge>
        </div>

        {/* Gradient overlay with text at bottom */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-8 pb-2 px-3">
          <h3 className="text-sm font-bold text-white truncate" title={deck.title}>
            {deck.title}
          </h3>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-white/70">
            <span className="flex items-center gap-1">
              <FileStack className="h-3 w-3" />
              {deck.slideCount} slides
            </span>
            <span className="flex items-center gap-1">
              <Copy className="h-3 w-3" />
              {deck.remixCount} remixes
            </span>
          </div>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Remix Button - Bottom Right */}
        {showRemixButton && onRemix && (
          <Button
            size="sm"
            className="absolute bottom-2 right-2 h-8 px-3 bg-white hover:bg-gray-100 text-black text-xs font-medium shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onClick={(e) => {
              e.stopPropagation();
              onRemix(deck);
            }}
            disabled={isRemixing}
          >
            {isRemixing ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Remixing...
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 mr-1.5" />
                Remix
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default CommunityDeckCard;
