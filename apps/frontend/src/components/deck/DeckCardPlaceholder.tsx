/**
 * Lightweight placeholder for DeckCard while waiting to render the full thumbnail.
 * Shows deck metadata with a gradient placeholder instead of the heavy thumbnail.
 */

import React from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Loader2, Users, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface DeckCardPlaceholderProps {
  deck: CompleteDeckData;
  onEdit: (deck: CompleteDeckData) => void;
}

const DeckCardPlaceholder: React.FC<DeckCardPlaceholderProps> = ({ deck, onEdit }) => {
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Unknown date';
    }
  };

  const displayName = deck.name || 'Untitled presentation';

  return (
    <div
      className="group relative touch-manipulation cursor-pointer"
      onClick={() => onEdit(deck)}
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
        }
      }}
      onTouchEnd={(e) => {
        if (e.changedTouches.length === 1 && touchStartRef.current) {
          const touch = e.changedTouches[0];
          const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
          const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
          if (deltaX < 10 && deltaY < 10) {
            e.preventDefault();
            onEdit(deck);
          }
        }
        touchStartRef.current = null;
      }}
    >
      <div className="relative aspect-[16/9] w-full max-w-full overflow-hidden rounded-lg transition-all duration-300 ring-1 ring-zinc-200 dark:ring-zinc-700">
        {/* Gradient placeholder with loading spinner */}
        <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-100 dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-800 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-orange-400/60" />
        </div>

        {/* Text overlay at bottom - same as DeckCard */}
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
      </div>
    </div>
  );
};

export default DeckCardPlaceholder;
