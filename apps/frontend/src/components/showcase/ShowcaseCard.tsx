import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Heart,
  Copy,
  Eye,
  FileStack,
  Loader2,
  Star,
} from 'lucide-react';
import { COMMUNITY_CATEGORIES } from '@/services/communityService';
import type { ShowcaseDeck } from '@/services/showcaseApi';
import MiniSlide from '@/components/deck/MiniSlide';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ShowcaseCardProps {
  deck: ShowcaseDeck;
  onUpvote?: (deck: ShowcaseDeck) => void;
  onRemix?: (deck: ShowcaseDeck) => void;
  onView?: (deck: ShowcaseDeck) => void;
  isRemixing?: boolean;
  isUpvoting?: boolean;
  variant?: 'default' | 'featured';
  className?: string;
}

const ShowcaseCard: React.FC<ShowcaseCardProps> = ({
  deck,
  onUpvote,
  onRemix,
  onView,
  isRemixing = false,
  isUpvoting = false,
  variant = 'default',
  className,
}) => {
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const category = COMMUNITY_CATEGORIES[deck.category as keyof typeof COMMUNITY_CATEGORIES];

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onView?.(deck);
  };

  const handleUpvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!deck.hasUpvoted) {
      setShowHeartBurst(true);
      setTimeout(() => setShowHeartBurst(false), 600);
    }
    onUpvote?.(deck);
  };

  const handleRemix = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemix?.(deck);
  };

  const isFeaturedVariant = variant === 'featured';

  // Extract background color from first slide theme if available
  const slideBg = deck.firstSlide?.background?.color
    || deck.firstSlide?.style?.backgroundColor
    || undefined;

  return (
    <motion.div
      className={cn(
        'group relative cursor-pointer',
        isFeaturedVariant && 'col-span-1',
        className
      )}
      onClick={handleCardClick}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      layout
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-xl transition-all duration-300',
          'ring-1 ring-zinc-200 dark:ring-zinc-700',
          'hover:ring-zinc-300 dark:hover:ring-zinc-600',
          'hover:shadow-xl hover:shadow-zinc-200/50 dark:hover:shadow-zinc-900/50',
          'bg-white dark:bg-zinc-900',
        )}
      >
        {/* Thumbnail area */}
        <div
          className={cn(
            'relative w-full overflow-hidden',
            isFeaturedVariant ? 'aspect-[16/9]' : 'aspect-[16/9]',
          )}
        >
          <div className="absolute inset-0 w-full h-full">
            {deck.firstSlide ? (
              <MiniSlide
                slide={deck.firstSlide}
                className="w-full h-full"
              />
            ) : (
              <div
                className="flex items-center justify-center h-full"
                style={{ backgroundColor: slideBg || '#f4f4f5' }}
              >
                <FileStack className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
              </div>
            )}
          </div>

          {/* Featured badge - top left */}
          {deck.isFeatured && (
            <div className="absolute top-2.5 left-2.5 z-10">
              <Badge
                className="bg-amber-500 hover:bg-amber-500 text-white text-xs font-semibold shadow-lg px-2 py-0.5 gap-1"
              >
                <Star className="h-3 w-3 fill-current" />
                Featured
              </Badge>
            </div>
          )}

          {/* Category badge - top right */}
          <div className="absolute top-2.5 right-2.5 z-10">
            <Badge
              variant="secondary"
              className="text-xs font-medium backdrop-blur-md border-0 shadow-sm"
              style={{
                backgroundColor: `${category?.color || '#71717a'}dd`,
                color: 'white',
              }}
            >
              {category?.name || deck.category}
            </Badge>
          </div>

          {/* Gradient overlay */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent h-1/2 pointer-events-none" />

          {/* Bottom overlay with title */}
          <div className="absolute inset-x-0 bottom-0 px-3.5 pb-3 pt-6 z-10">
            <h3
              className={cn(
                'font-bold text-white truncate',
                isFeaturedVariant ? 'text-base' : 'text-sm',
              )}
              title={deck.title}
            >
              {deck.title}
            </h3>
          </div>

          {/* Hover action buttons */}
          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>

        {/* Card footer */}
        <div className="px-3.5 py-3 space-y-2.5">
          {/* Author row */}
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold text-white flex-shrink-0"
              style={{
                backgroundColor: category?.color || '#71717a',
              }}
            >
              {(deck.authorName || '?')[0].toUpperCase()}
            </div>
            <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate font-medium">
              {deck.authorName || 'Anonymous'}
            </span>
          </div>

          {/* Stats and actions */}
          <div className="flex items-center justify-between">
            {/* Stats */}
            <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500">
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {formatCount(deck.viewCount)}
              </span>
              <span className="flex items-center gap-1">
                <Copy className="h-3.5 w-3.5" />
                {formatCount(deck.remixCount)}
              </span>
              <span className="flex items-center gap-1">
                <FileStack className="h-3.5 w-3.5" />
                {deck.slideCount}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              {/* Upvote button */}
              {onUpvote && (
                <button
                  onClick={handleUpvote}
                  disabled={isUpvoting}
                  className={cn(
                    'relative flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all duration-200',
                    deck.hasUpvoted
                      ? 'bg-red-50 dark:bg-red-950/30 text-red-500'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500',
                  )}
                >
                  <AnimatePresence>
                    {showHeartBurst && (
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center"
                        initial={{ scale: 0.5, opacity: 1 }}
                        animate={{ scale: 2, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                      >
                        <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <motion.div
                    animate={deck.hasUpvoted ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    <Heart
                      className={cn(
                        'h-3.5 w-3.5 transition-colors',
                        deck.hasUpvoted ? 'fill-red-500 text-red-500' : '',
                      )}
                    />
                  </motion.div>
                  <span>{formatCount(deck.upvoteCount)}</span>
                </button>
              )}

              {/* Remix button */}
              {onRemix && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  onClick={handleRemix}
                  disabled={isRemixing}
                >
                  {isRemixing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Remix
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default ShowcaseCard;
