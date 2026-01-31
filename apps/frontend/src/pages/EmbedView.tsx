import React, { useEffect, useState, useRef, useCallback, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { shareService } from '@/services/shareService';
import { trackEvent } from '@/services/analytics';
import { SlideData } from '@/types/SlideTypes';
import { normalizeSlideForRender, resolveSlideSize } from '@/utils/slideNormalization';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';

// Lazy-load Slide component for lighter bundle
const Slide = React.lazy(() => import('@/components/Slide'));

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class SlideErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[EmbedView] Slide render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="w-full h-full flex items-center justify-center bg-zinc-900">
          <AlertCircle className="w-8 h-8 text-zinc-500" />
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CONTROLS_HIDE_DELAY = 3000;
const SWIPE_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const EmbedView: React.FC = () => {
  const { shareCode } = useParams<{ shareCode: string }>();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<any>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasTrackedRef = useRef(false);

  // Derived
  const slides: SlideData[] = deck?.slides ?? [];
  const totalSlides = slides.length;

  const deckSlideSize = useMemo(() => {
    return resolveSlideSize(slides[0], deck?.size);
  }, [slides, deck?.size]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!shareCode) return;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await shareService.getPublicDeck(shareCode);

        if (response.success && response.data) {
          const { deck: deckData } = response.data;

          const cleanedSlides = Array.isArray(deckData?.slides)
            ? deckData.slides.filter((s: any) => s && s.id && !s.id.startsWith('placeholder-'))
            : [];

          const normalizedSlides = cleanedSlides.map((slide: SlideData) => {
            const normalized = normalizeSlideForRender(slide, deckData?.size, { preferFallbackSize: true });
            return normalized?.slide || slide;
          });

          const resolvedDeckSize = resolveSlideSize(normalizedSlides[0], deckData?.size);
          setDeck({ ...deckData, slides: normalizedSlides, size: resolvedDeckSize });
        } else {
          setError(response.error || 'Failed to load presentation');
        }
      } catch (err) {
        console.error('[EmbedView] Load error:', err);
        setError('Failed to load presentation');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [shareCode]);

  // ---------------------------------------------------------------------------
  // Analytics: track embed_viewed once
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hasTrackedRef.current && shareCode && deck) {
      hasTrackedRef.current = true;
      trackEvent('embed_viewed', { shareCode });
    }
  }, [shareCode, deck]);

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------
  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSlides) return;
      setCurrentSlideIndex(index);
      if (shareCode) {
        trackEvent('embed_slide_navigated', { shareCode, slideIndex: index });
      }
    },
    [totalSlides, shareCode],
  );

  const goNext = useCallback(() => goToSlide(currentSlideIndex + 1), [goToSlide, currentSlideIndex]);
  const goPrev = useCallback(() => goToSlide(currentSlideIndex - 1), [goToSlide, currentSlideIndex]);

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          goPrev();
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

  // ---------------------------------------------------------------------------
  // Auto-hide controls
  // ---------------------------------------------------------------------------
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [resetHideTimer]);

  const handleMouseMove = useCallback(() => {
    resetHideTimer();
  }, [resetHideTimer]);

  // ---------------------------------------------------------------------------
  // Touch / swipe support
  // ---------------------------------------------------------------------------
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      // Only act on horizontal swipes (dx larger than dy)
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) goNext();
        else goPrev();
      }

      touchStartRef.current = null;
      resetHideTimer();
    },
    [goNext, goPrev, resetHideTimer],
  );

  // ---------------------------------------------------------------------------
  // Slide renderer (memoised)
  // ---------------------------------------------------------------------------
  const getSlideBackground = useCallback((slide: SlideData): string | undefined => {
    try {
      const components = Array.isArray(slide.components) ? slide.components : [];
      const bg = components.find(
        (c) => c && (c.type === 'Background' || (c.id && c.id.toLowerCase().includes('background'))),
      );
      const props: any = bg?.props || {};
      if (typeof props.background === 'string' && props.background.trim()) return props.background;
      const directColor = props.backgroundColor || props.color || (slide as any).backgroundColor;
      if (typeof directColor === 'string' && directColor) return directColor;
    } catch {
      /* ignore */
    }
    return undefined;
  }, []);

  // Compute scale to fit viewport
  const [viewportSize, setViewportSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scale = useMemo(() => {
    const sw = viewportSize.w / deckSlideSize.width;
    const sh = viewportSize.h / deckSlideSize.height;
    return Math.min(sw, sh);
  }, [viewportSize, deckSlideSize]);

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div style={rootStyle}>
        <Loader2 size={32} style={{ color: '#71717a', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !deck || totalSlides === 0) {
    return (
      <div style={rootStyle}>
        <AlertCircle size={28} style={{ color: '#71717a', marginBottom: 8 }} />
        <p style={{ color: '#a1a1aa', fontSize: 14 }}>{error || 'No slides found'}</p>
      </div>
    );
  }

  const currentSlide = slides[currentSlideIndex];
  const fallbackBg = getSlideBackground(currentSlide);

  return (
    <div
      ref={containerRef}
      style={rootStyle}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slide viewport */}
      <div
        style={{
          position: 'relative',
          width: deckSlideSize.width * scale,
          height: deckSlideSize.height * scale,
          overflow: 'hidden',
          borderRadius: 2,
        }}
      >
        <div
          style={{
            width: deckSlideSize.width,
            height: deckSlideSize.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'relative',
            ...(fallbackBg
              ? { background: fallbackBg, backgroundSize: 'cover', backgroundPosition: 'center' }
              : {}),
          }}
        >
          <SlideErrorBoundary>
            <React.Suspense
              fallback={
                <div style={{ width: '100%', height: '100%', background: '#18181b' }} />
              }
            >
              <EditorStateProvider initialEditingState={false} slideSizeOverride={deckSlideSize}>
                <StaticActiveSlideProvider slide={currentSlide}>
                  <Slide
                    key={currentSlide.id}
                    slide={currentSlide}
                    isActive={true}
                    direction={null}
                    isEditing={false}
                    onSave={() => {}}
                    selectedComponentId={undefined}
                    onComponentSelect={() => {}}
                    forceSimpleContainer={true}
                  />
                </StaticActiveSlideProvider>
              </EditorStateProvider>
            </React.Suspense>
          </SlideErrorBoundary>
        </div>
      </div>

      {/* Controls overlay */}
      <div
        style={{
          ...overlayStyle,
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      >
        {/* Left arrow */}
        {currentSlideIndex > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            style={{ ...arrowBtnStyle, left: 8 }}
            aria-label="Previous slide"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Right arrow */}
        {currentSlideIndex < totalSlides - 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            style={{ ...arrowBtnStyle, right: 8 }}
            aria-label="Next slide"
          >
            <ChevronRight size={24} />
          </button>
        )}

        {/* Slide counter */}
        <div style={counterStyle}>
          {currentSlideIndex + 1} / {totalSlides}
        </div>

        {/* Powered by NextSlide */}
        <a
          href={`https://nextslide.ai/p/${shareCode}`}
          target="_blank"
          rel="noopener noreferrer"
          style={poweredByStyle}
        >
          Powered by NextSlide
        </a>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inline styles (avoid importing large CSS frameworks for embed lightness)
// ---------------------------------------------------------------------------
const rootStyle: React.CSSProperties = {
  width: '100%',
  height: '100vh',
  background: '#09090b',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  position: 'relative',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 20,
};

const arrowBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'rgba(0,0,0,0.5)',
  color: '#fff',
  border: 'none',
  borderRadius: '50%',
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
};

const counterStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.55)',
  color: '#e4e4e7',
  fontSize: 12,
  padding: '4px 12px',
  borderRadius: 12,
  letterSpacing: '0.05em',
  userSelect: 'none',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
};

const poweredByStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  right: 12,
  fontSize: 11,
  color: 'rgba(255,255,255,0.35)',
  textDecoration: 'none',
  userSelect: 'none',
  transition: 'color 0.2s',
};

export default EmbedView;
