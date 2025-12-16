import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, Eye, Edit, Share2, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DeckSummary } from '@/services/adminApi';
import { useNavigate } from 'react-router-dom';
import DeckThumbnail from '@/components/deck/DeckThumbnail';
import MiniSlide from '@/components/deck/MiniSlide';
import { CompleteDeckData } from '@/types/DeckTypes';
import { cn } from '@/lib/utils';

interface DeckPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  decks: DeckSummary[];
  currentIndex: number;
  onNavigate: (index: number) => void;
}

const DeckPreviewModal: React.FC<DeckPreviewModalProps> = ({
  isOpen,
  onClose,
  decks,
  currentIndex,
  onNavigate,
}) => {
  const navigate = useNavigate();
  const [currentDeck, setCurrentDeck] = useState<DeckSummary | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (decks[currentIndex]) {
      const newDeck = decks[currentIndex];
      if (newDeck.id !== currentDeck?.id) {
        setCurrentDeck(newDeck);
        setCurrentSlideIndex(0);
      }
    }
  }, [currentIndex, decks, currentDeck?.id]);

  useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
    }
  }, [isOpen]);

  const handlePreviousDeck = () => onNavigate(Math.max(0, currentIndex - 1));
  const handleNextDeck = () => onNavigate(Math.min(decks.length - 1, currentIndex + 1));

  const handlePreviousSlide = () => setCurrentSlideIndex(prev => Math.max(0, prev - 1));
  const handleNextSlide = () => {
    if (currentDeck && currentDeck.slides) {
      setCurrentSlideIndex(prev => Math.min(currentDeck.slides.length - 1, prev + 1));
    }
  };

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      if (currentSlideIndex > 0) handlePreviousSlide();
      else handlePreviousDeck();
    } else if (e.key === 'ArrowRight') {
      if (currentDeck?.slides && currentSlideIndex < currentDeck.slides.length - 1) handleNextSlide();
      else handleNextDeck();
    } else if (e.key === 'Escape') {
      if (isFullscreen) {
        setIsFullscreen(false);
      } else {
        onClose();
      }
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    }
  }, [currentSlideIndex, currentDeck, isFullscreen, onClose, toggleFullscreen]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!currentDeck) return null;

  const formatDate = (dateString: string) => {
    if (!dateString || isNaN(new Date(dateString).getTime())) return '-';
    return format(new Date(dateString), 'MMM d, yyyy');
  };

  const hasSlides = currentDeck.slides && currentDeck.slides.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          "p-0 gap-0 flex flex-col transition-all duration-200 overflow-hidden",
          isFullscreen
            ? "max-w-none w-screen h-screen rounded-none border-0"
            : "max-w-5xl w-full h-[85vh]"
        )}
      >
        {/* Compact Header */}
        <div className={cn(
          "flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0",
          isFullscreen ? "bg-black border-white/10" : "bg-muted/30"
        )}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h2 className={cn(
              "text-sm font-medium truncate max-w-[300px]",
              isFullscreen && "text-white"
            )} title={currentDeck.name}>{currentDeck.name}</h2>
            {!isFullscreen && (
              <>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{currentDeck.visibility}</Badge>
                <span className="text-xs text-muted-foreground">{currentDeck.slideCount} slides</span>
              </>
            )}
          </div>

          {/* Deck Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePreviousDeck}
              disabled={currentIndex === 0}
              className={cn(
                "p-1.5 rounded hover:bg-black/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors",
                isFullscreen && "hover:bg-white/10 text-white"
              )}
              title="Previous deck"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className={cn(
              "text-xs tabular-nums px-1",
              isFullscreen ? "text-white/60" : "text-muted-foreground"
            )}>{currentIndex + 1}/{decks.length}</span>
            <button
              onClick={handleNextDeck}
              disabled={currentIndex === decks.length - 1}
              className={cn(
                "p-1.5 rounded hover:bg-black/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors",
                isFullscreen && "hover:bg-white/10 text-white"
              )}
              title="Next deck"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className={cn("w-px h-4 mx-2", isFullscreen ? "bg-white/20" : "bg-border")} />

            <button
              onClick={toggleFullscreen}
              className={cn(
                "p-1.5 rounded hover:bg-black/10 transition-colors",
                isFullscreen && "hover:bg-white/10 text-white"
              )}
              title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className={cn(
                "p-1.5 rounded hover:bg-black/10 transition-colors",
                isFullscreen && "hover:bg-white/10 text-white"
              )}
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Main Slide View */}
          <div className={cn(
            "flex-1 flex items-center justify-center relative",
            isFullscreen ? "bg-black p-4" : "bg-neutral-900/95 p-6"
          )}>
            {/* Slide Container */}
            <div className="relative w-full h-full flex items-center justify-center">
              {hasSlides ? (
                <MiniSlide
                  slide={currentDeck.slides![currentSlideIndex]}
                  responsive={true}
                  className="max-w-full max-h-full object-contain rounded shadow-2xl"
                />
              ) : (
                <DeckThumbnail
                  deck={currentDeck as CompleteDeckData}
                  className="max-w-full max-h-full object-contain rounded shadow-2xl"
                />
              )}
            </div>

            {/* Slide Navigation Arrows */}
            {hasSlides && currentDeck.slides.length > 1 && (
              <>
                <button
                  onClick={handlePreviousSlide}
                  disabled={currentSlideIndex === 0}
                  className={cn(
                    "absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all",
                    "bg-black/40 hover:bg-black/60 text-white disabled:opacity-20 disabled:cursor-not-allowed",
                    isFullscreen && "p-3"
                  )}
                  title="Previous slide"
                >
                  <ChevronLeft className={cn(isFullscreen ? "h-6 w-6" : "h-5 w-5")} />
                </button>
                <button
                  onClick={handleNextSlide}
                  disabled={currentSlideIndex === currentDeck.slides.length - 1}
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all",
                    "bg-black/40 hover:bg-black/60 text-white disabled:opacity-20 disabled:cursor-not-allowed",
                    isFullscreen && "p-3"
                  )}
                  title="Next slide"
                >
                  <ChevronRight className={cn(isFullscreen ? "h-6 w-6" : "h-5 w-5")} />
                </button>

                {/* Slide Counter */}
                <div className={cn(
                  "absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white rounded-full px-3 py-1 text-xs tabular-nums",
                  isFullscreen && "text-sm px-4 py-1.5"
                )}>
                  {currentSlideIndex + 1} / {currentDeck.slides.length}
                </div>
              </>
            )}
          </div>

          {/* Compact Sidebar */}
          {!isFullscreen && (
            <div className="w-[280px] border-l bg-card flex flex-col flex-shrink-0 overflow-hidden">
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {/* Owner Info */}
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Owner</div>
                  <div className="text-sm font-medium truncate">{currentDeck.userFullName || 'Unknown'}</div>
                  <div className="text-xs text-muted-foreground truncate">{currentDeck.userEmail || 'N/A'}</div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <Eye className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-sm font-semibold">{currentDeck.analytics.viewCount}</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <Edit className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-sm font-semibold">{currentDeck.analytics.editCount}</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <Share2 className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-sm font-semibold">{currentDeck.analytics.shareCount}</div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{formatDate(currentDeck.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Modified</span>
                    <span>{formatDate(currentDeck.lastModified)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size</span>
                    <span>{currentDeck.size.width}×{currentDeck.size.height}</span>
                  </div>
                </div>

                {/* Description */}
                {currentDeck.description && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Description</div>
                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {currentDeck.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="p-3 border-t">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onClose();
                    navigate(`/app/decks/${currentDeck.id}`);
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open in Editor
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeckPreviewModal;
