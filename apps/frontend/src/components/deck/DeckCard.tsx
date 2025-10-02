import React from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Card, CardContent } from '@/components/ui/card';
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
}

const DeckCard: React.FC<DeckCardProps> = React.memo(({ 
  deck, 
  onEdit, 
  onShowDeleteDialog, 
  index,
  shouldAnimate = false 
}) => {
  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (err) {
      return 'Unknown date';
    }
  };

  return (
    <div
      className={`group relative ${deck.data?.isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'} flex flex-col ${shouldAnimate ? 'animate-opacity-in' : ''}`}
      onClick={() => {
        if (deck.data?.isGenerating) return; // Block navigation during importing/generating
        onEdit(deck);
      }}
      style={shouldAnimate ? { 
        animationDelay: `${index * 0.15}s`, 
        animationFillMode: 'backwards' 
      } : undefined}
    >
      <div className="relative aspect-[16/9] w-full max-w-full overflow-hidden rounded-lg transition-all duration-300"
           style={{
             background: deck.data?.isImporting
               ? 'linear-gradient(135deg, #FFEFE6 0%, #FFF7F3 100%)'
               : undefined
           }}>
        <div className="absolute inset-0 w-full h-full flex items-center justify-center">
          {deck.data?.isGenerating ? (
            <div className="flex flex-col items-center justify-center gap-4 p-4">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
              {deck.data?.isImporting ? (
                <p className="text-sm text-zinc-700 dark:text-zinc-200 text-center">
                  Importing…
                </p>
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
          ) : (
            <DeckThumbnail deck={deck} />
          )}
        </div>
        {!deck.data?.isGenerating && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2">
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
                  e.stopPropagation(); // Prevent triggering onEdit when clicking the edit button
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
      
      <div className="mt-3 px-1">
        <div className="flex flex-col items-start">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 break-words">
            {deck.data?.isImporting ? (deck.name || 'Importing presentation…') : (deck.name || 'Untitled presentation')}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Updated {formatDate(deck.lastModified)}</span>
            {deck.is_shared && (
              <Badge variant="secondary" className="h-5 text-xs px-1.5 flex items-center gap-1">
                {deck.share_type === 'view' ? <Eye size={10} /> : <Users size={10} />}
                {deck.share_type === 'view' ? 'Shared' : 'Collab'}
              </Badge>
            )}
          </div>
          {deck.is_shared && deck.shared_by && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Shared by {deck.shared_by.name || deck.shared_by.email}
            </span>
          )}
        </div>
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
    prevProps.shouldAnimate === nextProps.shouldAnimate
  );
});

DeckCard.displayName = 'DeckCard';

export default DeckCard; 