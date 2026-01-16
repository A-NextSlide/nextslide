import React, { useEffect, useState, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { communityService, CommunityDeck } from '@/services/communityService';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, ArrowLeft, FileStack, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlideData } from '@/types/SlideTypes';
import { normalizeSlideForRender } from '@/utils/slideNormalization';
import { NavigationProvider } from '@/context/NavigationContext';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { StaticEditorStateProvider } from '@/context/EditorStateContext';
import { useAuth } from '@/context/SupabaseAuthContext';
import Slide from '@/components/Slide';
import { cn } from '@/lib/utils';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

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
  const [slideScale, setSlideScale] = useState(0.5); // Start smaller
  const slideContainerRef = useRef<HTMLDivElement>(null);

  // Compute deck slide size from the first slide or theme
  const deckSlideSize = useMemo(() => {
    if (slides.length > 0 && slides[0]?.size) {
      return slides[0].size;
    }
    if (theme?.defaultSlideSize) {
      return theme.defaultSlideSize;
    }
    return { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };
  }, [slides, theme]);

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
        const normalizedSlides = (data.slides || []).map((slide: SlideData, idx: number) => {
          const normalized = normalizeSlideForRender(slide, data.theme?.defaultSlideSize);
          if (!normalized) {
            console.log('[CommunityDeckView] Normalization failed for slide', idx);
            return slide; // Return original if normalization fails
          }
          console.log('[CommunityDeckView] Normalized slide', idx, 'size:', normalized.slideSize);
          return {
            ...normalized.slide,
            size: normalized.slideSize,
          };
        });

        console.log('[CommunityDeckView] Loaded deck with', normalizedSlides.length, 'slides');
        console.log('[CommunityDeckView] First slide size:', normalizedSlides[0]?.size);
        console.log('[CommunityDeckView] Theme defaultSlideSize:', data.theme?.defaultSlideSize);

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

  // Calculate slide scale to fit container
  useLayoutEffect(() => {
    const calculateScale = () => {
      const container = slideContainerRef.current;
      if (!container || deckSlideSize.width <= 0 || deckSlideSize.height <= 0) return;

      const rect = container.getBoundingClientRect();
      const styles = window.getComputedStyle(container);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);

      // Subtract padding to get actual content area
      const availableWidth = rect.width - paddingX;
      const availableHeight = rect.height - paddingY;

      if (availableWidth <= 0 || availableHeight <= 0) return;

      const scaleX = availableWidth / deckSlideSize.width;
      const scaleY = availableHeight / deckSlideSize.height;
      // Use the smaller scale to fit, and cap at 1 (never scale up)
      const scale = Math.min(scaleX, scaleY, 1);

      console.log('[CommunityDeckView] Scale calc:', {
        containerW: rect.width,
        containerH: rect.height,
        paddingX,
        paddingY,
        availableW: availableWidth,
        availableH: availableHeight,
        slideW: deckSlideSize.width,
        slideH: deckSlideSize.height,
        scaleX,
        scaleY,
        finalScale: scale
      });

      if (Number.isFinite(scale) && scale > 0) {
        setSlideScale(scale);
      }
    };

    // Calculate after a brief delay to ensure container is sized
    const timeoutId = setTimeout(calculateScale, 100);
    const rafId = requestAnimationFrame(calculateScale);

    let resizeObserver: ResizeObserver | null = null;
    const container = slideContainerRef.current;
    if (container && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(calculateScale);
      resizeObserver.observe(container);
    }

    window.addEventListener('resize', calculateScale);

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', calculateScale);
    };
  }, [deckSlideSize.width, deckSlideSize.height, slides]);

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

  const scaledWidth = deckSlideSize.width * slideScale;
  const scaledHeight = deckSlideSize.height * slideScale;

  // Thumbnail dimensions
  const thumbHeight = 60;
  const thumbScale = thumbHeight / deckSlideSize.height;
  const thumbWidth = deckSlideSize.width * thumbScale;

  return (
    <NavigationProvider>
      <StaticEditorStateProvider slideSize={deckSlideSize}>
        <div className="h-screen bg-black flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-3 bg-black/90 z-10 shrink-0">
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
            ref={slideContainerRef}
            className="flex-1 flex items-center justify-center relative min-h-0 px-20 py-6"
          >
            {/* Previous button */}
            <button
              className={cn(
                "absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all",
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

            {/* Slide wrapper - uses aspect ratio to maintain proportions */}
            <div
              className="relative w-full h-full flex items-center justify-center"
              onClick={goToNextSlide}
            >
              <div
                className="relative overflow-hidden rounded-lg shadow-2xl bg-white"
                style={{
                  width: `${scaledWidth}px`,
                  height: `${scaledHeight}px`,
                }}
              >
                {/* Inner content at full resolution, scaled via CSS transform */}
                <div
                  className="absolute top-0 left-0 origin-top-left"
                  style={{
                    width: `${deckSlideSize.width}px`,
                    height: `${deckSlideSize.height}px`,
                    transform: `scale(${slideScale})`,
                  }}
                >
                  <StaticActiveSlideProvider slide={currentSlide}>
                    <Slide
                      slide={currentSlide}
                      isActive={true}
                      isEditing={false}
                    />
                  </StaticActiveSlideProvider>
                </div>
              </div>
            </div>

            {/* Next button */}
            <button
              className={cn(
                "absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all",
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
          <div className="bg-black/90 py-2 px-3 overflow-x-auto shrink-0">
            <div className="flex gap-2 justify-center">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  onClick={() => setCurrentSlideIndex(index)}
                  className={cn(
                    "rounded overflow-hidden border-2 transition-all shrink-0",
                    index === currentSlideIndex
                      ? "border-white"
                      : "border-transparent opacity-60 hover:opacity-100"
                  )}
                  style={{
                    width: `${thumbWidth}px`,
                    height: `${thumbHeight}px`,
                  }}
                >
                  <div
                    className="bg-white origin-top-left"
                    style={{
                      width: `${deckSlideSize.width}px`,
                      height: `${deckSlideSize.height}px`,
                      transform: `scale(${thumbScale})`,
                    }}
                  >
                    <StaticActiveSlideProvider slide={slide}>
                      <Slide
                        slide={slide}
                        isActive={true}
                        isEditing={false}
                        isThumbnail={true}
                      />
                    </StaticActiveSlideProvider>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </StaticEditorStateProvider>
    </NavigationProvider>
  );
};

export default CommunityDeckView;
