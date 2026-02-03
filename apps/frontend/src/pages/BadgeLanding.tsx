import React, { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BROWSER } from '@/utils/browser';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { shareService } from '@/services/shareService';
import { useAuth } from '@/context/SupabaseAuthContext';
import { trackBadgeLandingViewed, trackBadgeLandingCtaClicked } from '@/services/analytics';
import { Loader2, ArrowRight } from 'lucide-react';
import { normalizeSlideForRender, resolveSlideSize } from '@/utils/slideNormalization';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { SlideData } from '@/types/SlideTypes';

// Lazy load Slide component for the preview thumbnail
const Slide = lazy(() => import('@/components/Slide'));

const BadgeLanding: React.FC = () => {
  const { deckCode } = useParams<{ deckCode: string }>();
  const navigate = useNavigate();
  const { signInWithGoogle } = useAuth();

  const [deck, setDeck] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Track page view
  useEffect(() => {
    trackBadgeLandingViewed(deckCode);
  }, [deckCode]);

  // Fetch the deck for preview
  useEffect(() => {
    if (!deckCode) return;

    const fetchDeck = async () => {
      setIsLoading(true);
      try {
        const response = await shareService.getPublicDeck(deckCode);
        if (response.success && response.data) {
          setDeck(response.data.deck);
        }
      } catch (err) {
        console.error('[BadgeLanding] Failed to fetch deck:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDeck();
  }, [deckCode]);

  const handleCtaClick = () => {
    trackBadgeLandingCtaClicked({ deckCode, method: 'create' });
    navigate(BROWSER.isNativeApp ? '/app' : '/');
  };

  const handleGoogleAuth = async () => {
    trackBadgeLandingCtaClicked({ deckCode, method: 'google' });
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      // Error handled by auth context
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Get the first slide for preview
  const firstSlide: SlideData | null = deck?.slides?.[0] || null;
  const slideSize = firstSlide ? resolveSlideSize(firstSlide, deck?.size) : { width: 960, height: 540 };

  // Get slide background for preview card
  const getSlideBackground = (slide: SlideData): string | undefined => {
    try {
      const components = Array.isArray(slide.components) ? slide.components : [];
      const bg = components.find((c: any) => c && (c.type === 'Background' || (c.id && c.id.toLowerCase().includes('background'))));
      const props: any = bg?.props || {};
      if (typeof props.background === 'string' && props.background.trim()) {
        return props.background;
      }
      const directColor = props.backgroundColor || props.color;
      if (typeof directColor === 'string' && directColor) return directColor;
    } catch {
      // Ignore errors
    }
    return undefined;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex flex-col">
      {/* Header */}
      <header className="w-full px-6 py-5 flex items-center justify-between">
        <a href="/" className="no-underline">
          <BrandWordmark sizePx={16} textColor="#fff" />
        </a>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-16 -mt-8">
        {/* Preview card */}
        <div className="w-full max-w-2xl mb-10">
          <div className="relative rounded-xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10 aspect-video bg-zinc-800">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-white/40" />
              </div>
            ) : firstSlide ? (
              <div className="w-full h-full overflow-hidden">
                <div
                  className="origin-top-left"
                  style={{
                    width: slideSize.width,
                    height: slideSize.height,
                    transform: `scale(${Math.min(640 / slideSize.width, 360 / slideSize.height)})`,
                    background: getSlideBackground(firstSlide) || '#1a1a1a',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  <Suspense fallback={<div className="w-full h-full bg-zinc-800" />}>
                    <StaticActiveSlideProvider slide={normalizeSlideForRender(firstSlide, slideSize, { preferFallbackSize: true })?.slide || firstSlide}>
                      <Slide
                        slide={normalizeSlideForRender(firstSlide, slideSize, { preferFallbackSize: true })?.slide || firstSlide}
                        isActive={true}
                        direction={null}
                        isEditing={false}
                        onSave={() => {}}
                        selectedComponentId={undefined}
                        onComponentSelect={() => {}}
                        forceSimpleContainer={true}
                      />
                    </StaticActiveSlideProvider>
                  </Suspense>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                <p className="text-white/30 text-sm">Preview unavailable</p>
              </div>
            )}
          </div>
          {deck?.slides?.length > 1 && (
            <p className="text-center text-white/30 text-xs mt-3">
              {deck.slides.length} slides
            </p>
          )}
        </div>

        {/* Hero text */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-4 max-w-xl leading-tight">
          This presentation was created in seconds with AI
        </h1>
        <p className="text-lg sm:text-xl text-white/50 text-center mb-10 max-w-md">
          Make yours free
        </p>

        {/* CTAs */}
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          {/* Google OAuth - primary */}
          <Button
            className="w-full h-12 bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold text-base shadow-lg shadow-orange-500/20"
            onClick={handleGoogleAuth}
            disabled={isGoogleLoading}
          >
            {isGoogleLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            Continue with Google
          </Button>

          {/* Secondary CTA */}
          <Button
            variant="outline"
            className="w-full h-12 border-white/20 text-white hover:bg-white/10 font-semibold text-base"
            onClick={handleCtaClick}
          >
            Create my own
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* View presentation link */}
        {deckCode && (
          <a
            href={`/p/${deckCode}`}
            className="mt-8 text-white/30 hover:text-white/50 text-sm transition-colors no-underline"
          >
            View this presentation
          </a>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-white/20 text-xs">
        <a href="/" className="no-underline hover:text-white/40 transition-colors">nextslide.ai</a>
      </footer>
    </div>
  );
};

export default BadgeLanding;
