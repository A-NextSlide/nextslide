/**
 * Lightweight placeholder for CommunityDeckCard while waiting to render the full thumbnail.
 * Shows deck metadata with a gradient placeholder instead of the heavy MiniSlide.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Copy, FileStack, Loader2 } from 'lucide-react';
import { CommunityDeck, COMMUNITY_CATEGORIES } from '@/services/communityService';
import { cn } from '@/lib/utils';

interface CommunityDeckCardPlaceholderProps {
  deck: CommunityDeck;
  onView?: (deck: CommunityDeck) => void;
  className?: string;
}

const CommunityDeckCardPlaceholder: React.FC<CommunityDeckCardPlaceholderProps> = ({
  deck,
  onView,
  className,
}) => {
  const category = COMMUNITY_CATEGORIES[deck.category as keyof typeof COMMUNITY_CATEGORIES];

  return (
    <div
      className={cn(
        'group relative cursor-pointer',
        className
      )}
      onClick={() => onView?.(deck)}
    >
      <div className="relative aspect-[16/9] w-full max-w-full overflow-hidden rounded-lg transition-all duration-300 ring-1 ring-zinc-200 dark:ring-zinc-700">
        {/* Gradient placeholder with loading spinner */}
        <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-100 dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-800 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-orange-400/60" />
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
      </div>
    </div>
  );
};

export default CommunityDeckCardPlaceholder;
