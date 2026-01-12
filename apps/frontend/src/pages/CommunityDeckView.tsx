import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { communityService, CommunityDeck } from '@/services/communityService';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, ArrowLeft, FileStack, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlideData } from '@/types/SlideTypes';
import { normalizeSlideForRender, resolveSlideSize } from '@/utils/slideNormalization';
import { NavigationProvider } from '@/context/NavigationContext';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { useAuth } from '@/context/SupabaseAuthContext';
import Slide from '@/components/Slide';
import { cn } from '@/lib/utils';

const CommunityDeckView: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [deck, setDeck] = useState<CommunityDeck | null>(null);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [theme, setTheme] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRemixing, setIsRemixing] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  useEffect(() => {
    const loadDeck = async () => {
      if (!deckId) {
        setError('No deck ID provided');
        setIsLoading(false);
        return;
      }

      try {
        const data = await communityService.getDeckById(deckId);
        setDeck(data);

        // Normalize slides
        const normalizedSlides = (data.slides || []).map((slide: SlideData) => {
          const normalized = normalizeSlideForRender(slide);
          return {
            ...normalized,
            size: resolveSlideSize(normalized.size, data.theme?.defaultSlideSize),
          };
        });

        setSlides(normalizedSlides);
        setTheme(data.theme);
      } catch (err: any) {
        console.error('[CommunityDeckView] Error loading deck:', err);
        setError(err.message || 'Failed to load deck');
      } finally {
        setIsLoading(false);
      }
    };

    loadDeck();
  }, [deckId]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrentSlideIndex(prev => Math.min(prev + 1, slides.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentSlideIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        navigate(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length, navigate]);

  const handleRemix = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to remix this deck',
      });
      navigate('/login');
      return;
    }

    if (!deckId) return;

    setIsRemixing(true);
    try {
      const result = await communityService.remixDeck(deckId);
      toast({
        title: 'Remixed!',
        description: `"${result.deckName}" has been added to your slides`,
      });
      navigate(`/app?deck=${result.deckUuid}`);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to remix deck',
      });
    } finally {
      setIsRemixing(false);
    }
  };

  const goToPrevSlide = useCallback(() => {
    setCurrentSlideIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const goToNextSlide = useCallback(() => {
    setCurrentSlideIndex(prev => Math.min(prev + 1, slides.length - 1));
  }, [slides.length]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-white mx-auto mb-4" />
          <p className="text-white/70">Loading presentation...</p>
        </div>
      </div>
    );
  }

  if (error || !deck || slides.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <FileStack className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Deck Not Found</h1>
          <p className="text-gray-500 mb-6">
            {error || "This community deck doesn't exist or has been removed."}
          </p>
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentSlideIndex];

  return (
    <NavigationProvider>
      <EditorStateProvider>
        <StaticActiveSlideProvider slide={currentSlide}>
          <div className="min-h-screen bg-black flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-black/90 z-10">
              <Button
                variant="ghost"
                size="sm"
                className="text-white/70 hover:text-white hover:bg-white/10"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>

              <div className="text-center flex-1">
                <h1 className="text-white font-medium text-sm truncate">
                  {deck.title}
                </h1>
                <p className="text-white/50 text-xs">
                  {currentSlideIndex + 1} / {slides.length}
                </p>
              </div>

              <Button
                size="sm"
                className="bg-white text-black hover:bg-gray-100"
                onClick={handleRemix}
                disabled={isRemixing}
              >
                {isRemixing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                Remix
              </Button>
            </div>

            {/* Slide Display */}
            <div
              className="flex-1 flex items-center justify-center p-4 relative"
              onClick={goToNextSlide}
            >
              {/* Previous button */}
              <button
                className={cn(
                  "absolute left-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-opacity",
                  currentSlideIndex === 0 && "opacity-30 cursor-not-allowed"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrevSlide();
                }}
                disabled={currentSlideIndex === 0}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              {/* Slide */}
              <div className="w-full max-w-5xl aspect-video bg-white rounded-lg overflow-hidden shadow-2xl">
                <Slide
                  slide={currentSlide}
                  theme={theme}
                  isEditable={false}
                  isSelected={false}
                  className="w-full h-full"
                />
              </div>

              {/* Next button */}
              <button
                className={cn(
                  "absolute right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-opacity",
                  currentSlideIndex === slides.length - 1 && "opacity-30 cursor-not-allowed"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  goToNextSlide();
                }}
                disabled={currentSlideIndex === slides.length - 1}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>

            {/* Slide thumbnails */}
            <div className="bg-black/90 p-3 overflow-x-auto">
              <div className="flex gap-2 justify-center">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id}
                    onClick={() => setCurrentSlideIndex(index)}
                    className={cn(
                      "w-20 h-12 rounded overflow-hidden border-2 transition-all shrink-0",
                      index === currentSlideIndex
                        ? "border-white"
                        : "border-transparent opacity-60 hover:opacity-100"
                    )}
                  >
                    <div className="w-full h-full bg-white transform scale-[0.15] origin-top-left" style={{ width: '533%', height: '533%' }}>
                      <Slide
                        slide={slide}
                        theme={theme}
                        isEditable={false}
                        isSelected={false}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </StaticActiveSlideProvider>
      </EditorStateProvider>
    </NavigationProvider>
  );
};

export default CommunityDeckView;
