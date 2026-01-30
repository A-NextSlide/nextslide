import React from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Button } from '@/components/ui/button';
import { Trash2, Edit, Users, Eye, Loader2 } from 'lucide-react';
import DeckThumbnail from '@/components/deck/DeckThumbnail';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface DeckCardProps {
  deck: CompleteDeckData;
  onEdit: (deck: CompleteDeckData) => void;
  onShowDeleteDialog: (deckId: string, event: React.MouseEvent) => void;
  index: number;
  shouldAnimate?: boolean; // New prop to control animation
  thumbnailRenderMode?: 'full' | 'background';
  /** Cached thumbnail URL - if provided, shows this instead of rendering live thumbnail */
  cachedThumbnailUrl?: string | null;
  /** Callback when thumbnail element is ready for screenshot capture */
  onThumbnailRef?: (element: HTMLDivElement | null) => void;
  /** Force immediate thumbnail render, bypassing lazy loading */
  forceRender?: boolean;
}

const DeckCard: React.FC<DeckCardProps> = React.memo(({
  deck,
  onEdit,
  onShowDeleteDialog,
  index,
  shouldAnimate = false,
  thumbnailRenderMode = 'full',
  cachedThumbnailUrl,
  onThumbnailRef,
  forceRender = false
}) => {
  const touchHandledRef = React.useRef(false);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (err) {
      return 'Unknown date';
    }
  };

  const displayName = deck.data?.isImporting
    ? (deck.name || 'Importing presentation…')
    : (deck.name || 'Untitled presentation');

  return (
    <div
      className={`group relative touch-manipulation ${deck.data?.isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'} ${shouldAnimate ? 'animate-opacity-in' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (deck.data?.isGenerating) return;
        // Skip if touch already handled this interaction
        if (touchHandledRef.current) {
          touchHandledRef.current = false;
          return;
        }
        onEdit(deck);
      }}
      onTouchStart={(e) => {
        // Track touch start position to detect drags vs taps
        if (e.touches.length === 1) {
          touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
        }
      }}
      onTouchEnd={(e) => {
        // Handle touch end for better mobile responsiveness
        if (deck.data?.isGenerating) return;

        // Check if this was a tap (not a scroll/drag)
        if (e.changedTouches.length === 1 && touchStartRef.current) {
          const touch = e.changedTouches[0];
          const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
          const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
          const TAP_THRESHOLD = 10; // pixels

          // Only trigger if finger didn't move much (it's a tap, not a drag)
          if (deltaX < TAP_THRESHOLD && deltaY < TAP_THRESHOLD) {
            e.preventDefault();
            touchHandledRef.current = true;
            onEdit(deck);
            // Reset after a short delay
            setTimeout(() => { touchHandledRef.current = false; }, 100);
          }
        }
        touchStartRef.current = null;
      }}
      style={shouldAnimate ? {
        animationDelay: `${index * 0.15}s`,
        animationFillMode: 'backwards'
      } : undefined}
    >
      <div className={`relative aspect-[16/9] w-full max-w-full overflow-hidden rounded-lg transition-all duration-300 ring-1 ring-zinc-200 dark:ring-zinc-700 ${deck.data?.isImporting ? 'bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-950/30 dark:to-orange-900/20' : ''}`}>
        <div className="absolute inset-0 w-full h-full flex items-center justify-center">
          {deck.data?.isGenerating ? (
            <div className="flex flex-col items-center justify-center gap-4 p-4">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400 mt-4" />
              {deck.data?.isImporting ? (
                <div className="text-center">
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">
                    Importing…
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    About 1-2 min
                  </p>
                </div>
              ) : (
                <>
                  <div className="w-full max-w-[200px]">
                    <Progress value={deck.data?.generationProgress || 0} className="h-2" />
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
                    {deck.data?.currentSlide && deck.data?.totalSlides
                      ? `Generating slide ${deck.data.currentSlide} of ${deck.data.totalSlides}`
                      : 'Starting generation...'}
                  </p>
                </>
              )}
            </div>
          ) : cachedThumbnailUrl ? (
            /* Show cached screenshot if available */
            <img
              src={cachedThumbnailUrl}
              alt={deck.name || 'Deck thumbnail'}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            /* Render live thumbnail */
            <div ref={onThumbnailRef} className="w-full h-full">
              <DeckThumbnail deck={deck} renderMode={thumbnailRenderMode} forceRender={forceRender} />
            </div>
          )}
        </div>

        {/* Text overlay at bottom - always visible */}
        {!deck.data?.isGenerating && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-8 pb-2 px-3">
            <h3 className="text-sm font-bold text-white truncate" title={displayName}>
              {displayName}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-white/70 whitespace-nowrap">
                Updated {formatDate(deck.lastModified)}
              </span>
              {deck.is_shared && (
                <Badge variant="secondary" className="h-4 text-[10px] px-1 flex items-center gap-0.5 bg-white/20 text-white border-0">
                  {deck.share_type === 'view' ? <Eye size={8} /> : <Users size={8} />}
                  {deck.share_type === 'view' ? 'Shared' : 'Collab'}
                </Badge>
              )}
            </div>
            {deck.is_shared && deck.shared_by && (
              <span className="text-[10px] text-white/60 mt-0.5 block truncate">
                Shared by {deck.shared_by.name || deck.shared_by.email}
              </span>
            )}
          </div>
        )}

        {/* Hover overlay with action buttons */}
        {!deck.data?.isGenerating && (
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2">
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white"
                onClick={(e) => onShowDeleteDialog(deck.uuid || '', e)}
              >
                <Trash2 size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(deck);
                }}
              >
                <Edit size={14} />
              </Button>
            </div>
          </div>
        )}

        {deck.data?.isGenerating && (
          <div className="absolute inset-0" style={{ cursor: 'progress' }} />
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to avoid re-renders when unnecessary
  return (
    prevProps.deck.uuid === nextProps.deck.uuid &&
    prevProps.deck.name === nextProps.deck.name &&
    prevProps.deck.data?.isGenerating === nextProps.deck.data?.isGenerating &&
    prevProps.deck.data?.generationProgress === nextProps.deck.data?.generationProgress &&
    prevProps.deck.data?.currentSlide === nextProps.deck.data?.currentSlide &&
    prevProps.deck.lastModified === nextProps.deck.lastModified &&
    prevProps.deck.is_shared === nextProps.deck.is_shared &&
    prevProps.deck.share_type === nextProps.deck.share_type &&
    prevProps.deck.shared_by?.email === nextProps.deck.shared_by?.email &&
    prevProps.index === nextProps.index &&
    prevProps.shouldAnimate === nextProps.shouldAnimate &&
    prevProps.thumbnailRenderMode === nextProps.thumbnailRenderMode &&
    prevProps.cachedThumbnailUrl === nextProps.cachedThumbnailUrl &&
    prevProps.forceRender === nextProps.forceRender
  );
});

DeckCard.displayName = 'DeckCard';

export default DeckCard; 