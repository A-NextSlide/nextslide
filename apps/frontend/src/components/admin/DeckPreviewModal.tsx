import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, Eye, Edit, Share2, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { DeckSummary } from '@/services/adminApi';
import { useNavigate } from 'react-router-dom';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import DeckThumbnail from '@/components/deck/DeckThumbnail';
import MiniSlide from '@/components/deck/MiniSlide';
import { CompleteDeckData } from '@/types/DeckTypes';

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

  useEffect(() => {
    if (decks[currentIndex]) {
      const newDeck = decks[currentIndex];
      if (newDeck.id !== currentDeck?.id) {
        setCurrentDeck(newDeck);
        setCurrentSlideIndex(0);
      }
    }
  }, [currentIndex, decks, currentDeck?.id]);

  const handlePreviousDeck = () => onNavigate(Math.max(0, currentIndex - 1));
  const handleNextDeck = () => onNavigate(Math.min(decks.length - 1, currentIndex + 1));

  const handlePreviousSlide = () => setCurrentSlideIndex(prev => Math.max(0, prev - 1));
  const handleNextSlide = () => {
    if (currentDeck && currentDeck.slides) {
      setCurrentSlideIndex(prev => Math.min(currentDeck.slides.length - 1, prev + 1));
    }
  };
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      if (currentSlideIndex > 0) handlePreviousSlide();
      else handlePreviousDeck();
    } else if (e.key === 'ArrowRight') {
      if (currentDeck?.slides && currentSlideIndex < currentDeck.slides.length - 1) handleNextSlide();
      else handleNextDeck();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown, currentSlideIndex, currentDeck]);

  if (!currentDeck) return null;

  const formatDate = (dateString: string) => {
    if (!dateString || isNaN(new Date(dateString).getTime())) return '-';
    return format(new Date(dateString), 'MMM d, yyyy');
  };

  const hasSlides = currentDeck.slides && currentDeck.slides.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-full h-[95vh] p-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
           <div className="flex items-center gap-4 min-w-0">
            <h2 className="text-lg font-semibold truncate" title={currentDeck.name}>{currentDeck.name}</h2>
            <Badge variant="outline">{currentDeck.visibility}</Badge>
            <span className="text-sm text-muted-foreground">{currentDeck.slideCount} slides</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handlePreviousDeck} disabled={currentIndex === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{currentIndex + 1} / {decks.length}</span>
            <Button variant="ghost" size="icon" onClick={handleNextDeck} disabled={currentIndex === decks.length - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="ml-4">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Main Content */}
          <div className="flex-1 bg-muted/20 p-4 lg:p-8 flex flex-col justify-center items-center relative">
            <div className="w-full h-full flex items-center justify-center">
              {hasSlides ? (
                <MiniSlide 
                  slide={currentDeck.slides![currentSlideIndex]} 
                  responsive={true}
                  className="w-full h-full object-contain" 
                />
              ) : (
                <DeckThumbnail 
                  deck={currentDeck as CompleteDeckData} 
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            {hasSlides && currentDeck.slides.length > 1 && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/30 text-white hover:bg-black/50"
                  onClick={handlePreviousSlide}
                  disabled={currentSlideIndex === 0}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/30 text-white hover:bg-black/50"
                  onClick={handleNextSlide}
                  disabled={currentSlideIndex === currentDeck.slides.length - 1}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs rounded-full px-3 py-1">
                  Slide {currentSlideIndex + 1} of {currentDeck.slides.length}
                </div>
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-[380px] border-l bg-card flex flex-col flex-shrink-0">
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2 text-base">Description</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {currentDeck.description || 'No description available'}
                  </p>
                </div>
                
                <Separator />

                <div className="space-y-3">
                   <h3 className="font-semibold text-base">Details</h3>
                   <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Owner</span>
                    <span className="font-medium truncate">{currentDeck.userFullName || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground">Email</span>
                    <span className="text-xs truncate">{currentDeck.userEmail || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span>{formatDate(currentDeck.createdAt)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Modified</span>
                    <span>{formatDate(currentDeck.lastModified)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Dimensions</span>
                    <span>{currentDeck.size.width} × {currentDeck.size.height}</span>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-3 text-base">Analytics</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-muted/50 rounded p-3">
                      <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground mb-1">
                        <Eye className="h-4 w-4" />
                        Views
                      </div>
                      <div className="text-xl font-bold">{currentDeck.analytics.viewCount}</div>
                    </div>
                    <div className="bg-muted/50 rounded p-3">
                      <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground mb-1">
                        <Edit className="h-4 w-4" />
                        Edits
                      </div>
                      <div className="text-xl font-bold">{currentDeck.analytics.editCount}</div>
                    </div>
                    <div className="bg-muted/50 rounded p-3">
                      <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground mb-1">
                        <Share2 className="h-4 w-4" />
                        Shares
                      </div>
                      <div className="text-xl font-bold">{currentDeck.analytics.shareCount}</div>
                    </div>
                  </div>
                </div>
                
                <Separator />

                <div className="pt-2 space-y-3">
                  <h3 className="font-semibold text-base">Actions</h3>
                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={() => {
                      onClose();
                      navigate(`/app/decks/${currentDeck.id}`);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Deck in Editor
                  </Button>
                  <Button className="w-full" variant="outline" disabled>
                    <Download className="h-4 w-4 mr-2" />
                    Download (Coming Soon)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeckPreviewModal;
