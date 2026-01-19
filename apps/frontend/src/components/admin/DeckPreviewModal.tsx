import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Edit,
  Share2,
  ExternalLink,
  Maximize2,
  Minimize2,
  Loader2,
  User,
  Calendar,
  Grid3X3,
  Info
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { DeckSummary, adminApi } from '@/services/adminApi';
import { useNavigate } from 'react-router-dom';
import MiniSlide from '@/components/deck/MiniSlide';
import Slide from '@/components/Slide';
import { cn } from '@/lib/utils';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { normalizeSlideForRender } from '@/utils/slideNormalization';
import { StaticEditorStateProvider } from '@/context/EditorStateContext';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { StaticNavigationProvider } from '@/context/NavigationContext';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const thumbnailScrollRef = useRef<HTMLDivElement>(null);

  const [currentDeck, setCurrentDeck] = useState<DeckSummary | null>(null);
  const [fullDeckData, setFullDeckData] = useState<DeckSummary | null>(null);
  const [isLoadingSlides, setIsLoadingSlides] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [slideScale, setSlideScale] = useState(1);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScaleRef = useRef<number | null>(null);

  // Get deck slide size
  const deckSlideSize = useMemo(() => {
    if (currentDeck?.size) {
      return { width: currentDeck.size.width, height: currentDeck.size.height };
    }
    return { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };
  }, [currentDeck?.size]);

  const baseSlideWidth = deckSlideSize.width;
  const baseSlideHeight = deckSlideSize.height;

  // Calculate slide scale to fit container
  useLayoutEffect(() => {
    if (!isOpen) return;

    const calculateScale = () => {
      const container = slideContainerRef.current;
      if (!container) return;

      try {
        const rect = container.getBoundingClientRect();
        const containerWidth = rect.width || window.innerWidth;
        const containerHeight = rect.height || window.innerHeight;

        if (!containerWidth || !containerHeight) return;

        // Calculate scale to fit the slide within the container with padding
        const padding = 64; // Account for padding
        const availableWidth = containerWidth - padding * 2;
        const availableHeight = containerHeight - padding * 2;

        const scaleX = availableWidth / baseSlideWidth;
        const scaleY = availableHeight / baseSlideHeight;
        const scale = Math.min(scaleX, scaleY, 1); // Don't scale above 1

        if (!Number.isFinite(scale) || scale <= 0) return;

        const normalizedScale = Math.round(scale * 1000) / 1000;
        if (lastScaleRef.current === normalizedScale) return;
        lastScaleRef.current = normalizedScale;

        setSlideScale(normalizedScale);
      } catch (error) {
        console.warn('[DeckPreviewModal] Scale calculation failed:', error);
      }
    };

    // Initial calculation
    const rafId = requestAnimationFrame(calculateScale);
    const timeoutId = setTimeout(calculateScale, 100);

    // ResizeObserver for dynamic updates
    let resizeObserver: ResizeObserver | null = null;
    const container = slideContainerRef.current;
    if (container && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(calculateScale);
      resizeObserver.observe(container);
    }

    window.addEventListener('resize', calculateScale);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', calculateScale);
    };
  }, [isOpen, baseSlideWidth, baseSlideHeight]);

  // Auto-hide controls after inactivity
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      if (!showInfo && !showThumbnails) {
        setShowControls(false);
      }
    }, 3000);
  }, [showInfo, showThumbnails]);

  // Update current deck when index changes
  useEffect(() => {
    if (decks[currentIndex]) {
      const newDeck = decks[currentIndex];
      if (newDeck.id !== currentDeck?.id) {
        setCurrentDeck(newDeck);
        setFullDeckData(null);
        setCurrentSlideIndex(0);
      }
    }
  }, [currentIndex, decks, currentDeck?.id]);

  // Fetch full deck data with all slides
  useEffect(() => {
    if (!isOpen || !currentDeck?.id) return;

    if (fullDeckData?.id === currentDeck.id && fullDeckData.slides && fullDeckData.slides.length > 0) {
      return;
    }

    const fetchFullDeck = async () => {
      setIsLoadingSlides(true);
      try {
        const fullDeck = await adminApi.getDeckWithSlides(currentDeck.id);
        if (fullDeck) {
          setFullDeckData(fullDeck);
        }
      } catch (error) {
        console.error('Failed to fetch full deck data:', error);
      } finally {
        setIsLoadingSlides(false);
      }
    };

    fetchFullDeck();
  }, [isOpen, currentDeck?.id, fullDeckData?.id, fullDeckData?.slides]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
      setFullDeckData(null);
      setShowInfo(false);
      setShowThumbnails(false);
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    } else {
      resetControlsTimeout();
    }
  }, [isOpen, resetControlsTimeout]);

  // Scroll current slide into view when thumbnails open
  useEffect(() => {
    if (showThumbnails && thumbnailScrollRef.current) {
      const container = thumbnailScrollRef.current;
      const slideButtons = container.querySelectorAll('button');
      const currentSlideElement = slideButtons[currentSlideIndex];

      if (currentSlideElement) {
        currentSlideElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
      }
    }
  }, [showThumbnails, currentSlideIndex]);

  const displayDeck = fullDeckData || currentDeck;

  const handlePreviousDeck = useCallback(() => {
    onNavigate(Math.max(0, currentIndex - 1));
    resetControlsTimeout();
  }, [currentIndex, onNavigate, resetControlsTimeout]);

  const handleNextDeck = useCallback(() => {
    onNavigate(Math.min(decks.length - 1, currentIndex + 1));
    resetControlsTimeout();
  }, [currentIndex, decks.length, onNavigate, resetControlsTimeout]);

  const handlePreviousSlide = useCallback(() => {
    setCurrentSlideIndex(prev => Math.max(0, prev - 1));
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  const handleNextSlide = useCallback(() => {
    if (displayDeck?.slides) {
      setCurrentSlideIndex(prev => Math.min(displayDeck.slides.length - 1, prev + 1));
    }
    resetControlsTimeout();
  }, [displayDeck, resetControlsTimeout]);

  const goToSlide = useCallback((index: number) => {
    setCurrentSlideIndex(index);
    setShowThumbnails(false);
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  const toggleFullscreen = useCallback(async () => {
    const elem = containerRef.current || document.documentElement;

    if (isFullscreen) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      } catch {
        // Ignore exit fullscreen errors
      }
      return;
    }

    try {
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        (elem as any).webkitRequestFullscreen();
      }
    } catch {
      // Fullscreen not supported
    }
  }, [isFullscreen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    resetControlsTimeout();

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (currentSlideIndex > 0) handlePreviousSlide();
        else handlePreviousDeck();
        break;
      case 'ArrowRight':
      case ' ':
        e.preventDefault();
        if (displayDeck?.slides && currentSlideIndex < displayDeck.slides.length - 1) handleNextSlide();
        else handleNextDeck();
        break;
      case 'Escape':
        e.preventDefault();
        if (showThumbnails) {
          setShowThumbnails(false);
        } else if (showInfo) {
          setShowInfo(false);
        } else if (isFullscreen) {
          toggleFullscreen();
        } else {
          onClose();
        }
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'g':
      case 'G':
        e.preventDefault();
        setShowThumbnails(prev => !prev);
        break;
      case 'i':
      case 'I':
        e.preventDefault();
        setShowInfo(prev => !prev);
        break;
    }
  }, [
    isOpen,
    currentSlideIndex,
    displayDeck,
    isFullscreen,
    showThumbnails,
    showInfo,
    handlePreviousSlide,
    handleNextSlide,
    handlePreviousDeck,
    handleNextDeck,
    toggleFullscreen,
    onClose,
    resetControlsTimeout
  ]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFS);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Mouse movement for showing controls
  const handleMouseMove = useCallback(() => {
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  // Normalize current slide for rendering
  const normalizedSlide = useMemo(() => {
    const hasSlides = displayDeck?.slides && displayDeck.slides.length > 0;
    const rawSlide = hasSlides ? displayDeck.slides[currentSlideIndex] : null;
    if (!rawSlide || !rawSlide.id) return null;

    const result = normalizeSlideForRender(rawSlide, deckSlideSize, { preferFallbackSize: true });
    return result?.slide || rawSlide;
  }, [displayDeck, currentSlideIndex, deckSlideSize]);

  if (!isOpen || !currentDeck) return null;

  const formatDateTime = (dateString: string) => {
    if (!dateString || isNaN(new Date(dateString).getTime())) return '-';
    return format(new Date(dateString), 'MMM d, yyyy h:mm a');
  };

  const hasSlides = displayDeck?.slides && displayDeck.slides.length > 0;
  const slideCount = displayDeck?.slides?.length || currentDeck.slideCount || 0;

  // Thumbnail dimensions
  const thumbnailHeight = 100;
  const aspectRatio = currentDeck.size ? currentDeck.size.width / currentDeck.size.height : 16/9;
  const thumbnailWidth = Math.round(thumbnailHeight * aspectRatio);

  // Calculate the scaled dimensions for the slide wrapper
  const scaledWidth = baseSlideWidth * slideScale;
  const scaledHeight = baseSlideHeight * slideScale;

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black"
        onMouseMove={handleMouseMove}
        style={{ height: '100dvh' }}
      >
        {/* Main slide display */}
        <div
          ref={slideContainerRef}
          className="relative w-full h-full flex items-center justify-center"
        >
          {isLoadingSlides ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4 text-white/60"
            >
              <Loader2 className="h-10 w-10 animate-spin" />
              <span className="text-sm font-medium">Loading slides...</span>
            </motion.div>
          ) : normalizedSlide ? (
            <motion.div
              key={`slide-${normalizedSlide.id}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="relative overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10"
              style={{
                width: `${scaledWidth}px`,
                height: `${scaledHeight}px`
              }}
            >
              {/* Inner content at full resolution, scaled via CSS transform */}
              <div
                className="absolute top-0 left-0 origin-top-left"
                style={{
                  width: `${baseSlideWidth}px`,
                  height: `${baseSlideHeight}px`,
                  transform: `scale(${slideScale})`,
                }}
              >
                <StaticNavigationProvider slideIndex={currentSlideIndex}>
                  <StaticEditorStateProvider slideSize={deckSlideSize}>
                    <StaticActiveSlideProvider slide={normalizedSlide}>
                      <Slide
                        slide={normalizedSlide}
                        isActive={true}
                        isEditing={false}
                        isThumbnail={false}
                      />
                    </StaticActiveSlideProvider>
                  </StaticEditorStateProvider>
                </StaticNavigationProvider>
              </div>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-white/40">
              <Grid3X3 className="h-16 w-16" />
              <span className="text-sm">No slides available</span>
            </div>
          )}

          {/* Edge trigger zones for controls */}
          {!showThumbnails && !showInfo && (
            <>
              <div
                className="absolute top-0 left-0 h-full z-10"
                style={{ width: '15%' }}
                onMouseEnter={resetControlsTimeout}
              />
              <div
                className="absolute top-0 right-0 h-full z-10"
                style={{ width: '15%' }}
                onMouseEnter={resetControlsTimeout}
              />
            </>
          )}
        </div>

        {/* Floating Controls */}
        <AnimatePresence>
          {showControls && !showThumbnails && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 pointer-events-none z-20"
            >
              {/* Top bar */}
              <div className="absolute top-0 left-0 right-0 p-4 md:p-6 pointer-events-auto">
                <div className="flex items-center justify-between gap-4">
                  {/* Left: Deck info */}
                  <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.05 }}
                    className="flex items-center gap-3 min-w-0"
                  >
                    <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/10 flex items-center gap-3 min-w-0">
                      <h2 className="text-white font-medium truncate max-w-[200px] md:max-w-[300px] text-sm" title={currentDeck.name}>
                        {currentDeck.name}
                      </h2>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] px-2 py-0.5 font-medium shrink-0",
                          currentDeck.visibility === 'public' && "bg-green-500/20 text-green-300 border-green-500/30",
                          currentDeck.visibility === 'private' && "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
                          currentDeck.visibility === 'unlisted' && "bg-blue-500/20 text-blue-300 border-blue-500/30"
                        )}
                      >
                        {currentDeck.visibility}
                      </Badge>
                    </div>
                  </motion.div>

                  {/* Center: Deck navigation */}
                  <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="hidden md:flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1 border border-white/10"
                  >
                    <button
                      onClick={handlePreviousDeck}
                      disabled={currentIndex === 0}
                      className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      title="Previous deck"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-white/60 text-xs tabular-nums px-2 min-w-[60px] text-center">
                      Deck {currentIndex + 1} / {decks.length}
                    </span>
                    <button
                      onClick={handleNextDeck}
                      disabled={currentIndex === decks.length - 1}
                      className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      title="Next deck"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </motion.div>

                  {/* Right: Action buttons */}
                  <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    className="flex items-center gap-2"
                  >
                    {/* Info toggle */}
                    <button
                      onClick={() => setShowInfo(prev => !prev)}
                      className={cn(
                        "bg-black/60 backdrop-blur-sm rounded-full w-10 h-10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-all border border-white/10",
                        showInfo && "bg-white/20 text-white"
                      )}
                      title="Show deck info (I)"
                    >
                      <Info className="h-4 w-4" />
                    </button>

                    {/* Thumbnail grid toggle */}
                    <button
                      onClick={() => setShowThumbnails(prev => !prev)}
                      className="bg-black/60 backdrop-blur-sm rounded-full w-10 h-10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-all border border-white/10"
                      title="Show all slides (G)"
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </button>

                    {/* Fullscreen toggle */}
                    <button
                      onClick={toggleFullscreen}
                      className="bg-black/60 backdrop-blur-sm rounded-full w-10 h-10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-all border border-white/10"
                      title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                    >
                      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>

                    {/* Close button */}
                    <button
                      onClick={onClose}
                      className="bg-black/60 backdrop-blur-sm rounded-full w-10 h-10 flex items-center justify-center text-white/80 hover:text-white hover:bg-red-500/80 transition-all border border-white/10"
                      title="Close (ESC)"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </motion.div>
                </div>
              </div>

              {/* Slide navigation arrows */}
              {hasSlides && slideCount > 1 && (
                <div className="absolute top-1/2 -translate-y-1/2 left-4 right-4 md:left-6 md:right-6 flex justify-between pointer-events-auto">
                  <motion.button
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    onClick={handlePreviousSlide}
                    disabled={currentSlideIndex === 0}
                    className={cn(
                      'bg-black/60 backdrop-blur-sm rounded-full w-12 h-12 flex items-center justify-center text-white/90 transition-all border border-white/10',
                      currentSlideIndex === 0
                        ? 'opacity-30 cursor-not-allowed'
                        : 'hover:bg-black/80 hover:scale-110'
                    )}
                    title="Previous slide"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </motion.button>

                  <motion.button
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    onClick={handleNextSlide}
                    disabled={currentSlideIndex === slideCount - 1}
                    className={cn(
                      'bg-black/60 backdrop-blur-sm rounded-full w-12 h-12 flex items-center justify-center text-white/90 transition-all border border-white/10',
                      currentSlideIndex === slideCount - 1
                        ? 'opacity-30 cursor-not-allowed'
                        : 'hover:bg-black/80 hover:scale-110'
                    )}
                    title="Next slide"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </motion.button>
                </div>
              )}

              {/* Bottom: Progress bar and slide counter */}
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 pointer-events-auto">
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col gap-3"
                >
                  {/* Slide counter pill */}
                  <div className="flex justify-center">
                    <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 border border-white/10 flex items-center gap-4">
                      <span className="text-white/90 text-sm font-medium tabular-nums">
                        {currentSlideIndex + 1} / {slideCount}
                      </span>

                      {/* Compact stats */}
                      <div className="hidden md:flex items-center gap-3 pl-3 border-l border-white/10">
                        <div className="flex items-center gap-1.5 text-white/50">
                          <Eye className="h-3.5 w-3.5" />
                          <span className="text-xs tabular-nums">{currentDeck.analytics.viewCount}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-white/50">
                          <Edit className="h-3.5 w-3.5" />
                          <span className="text-xs tabular-nums">{currentDeck.analytics.editCount}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-white/50">
                          <Share2 className="h-3.5 w-3.5" />
                          <span className="text-xs tabular-nums">{currentDeck.analytics.shareCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="bg-white/10 rounded-full h-1 overflow-hidden">
                    <motion.div
                      className="bg-white/60 h-full rounded-full"
                      animate={{ width: `${((currentSlideIndex + 1) / Math.max(1, slideCount)) * 100}%` }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                    />
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info Panel (slides in from right) */}
        <AnimatePresence>
          {showInfo && (
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute top-0 right-0 bottom-0 w-80 bg-black/90 backdrop-blur-xl border-l border-white/10 z-30 flex flex-col"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="text-white font-semibold text-sm">Deck Details</h3>
                <button
                  onClick={() => setShowInfo(false)}
                  className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Owner Section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-white/40 text-xs font-medium uppercase tracking-wider">
                    <User className="h-3.5 w-3.5" />
                    Owner
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 space-y-1">
                    <div className="text-white font-medium text-sm">{currentDeck.userFullName || 'Unknown'}</div>
                    <div className="text-white/50 text-xs truncate">{currentDeck.userEmail || 'N/A'}</div>
                  </div>
                </div>

                {/* Stats Section */}
                <div className="space-y-2">
                  <div className="text-white/40 text-xs font-medium uppercase tracking-wider">
                    Analytics
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <Eye className="h-4 w-4 mx-auto mb-1.5 text-blue-400" />
                      <div className="text-white font-semibold text-lg tabular-nums">{currentDeck.analytics.viewCount}</div>
                      <div className="text-white/40 text-[10px] uppercase tracking-wider">Views</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <Edit className="h-4 w-4 mx-auto mb-1.5 text-green-400" />
                      <div className="text-white font-semibold text-lg tabular-nums">{currentDeck.analytics.editCount}</div>
                      <div className="text-white/40 text-[10px] uppercase tracking-wider">Edits</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <Share2 className="h-4 w-4 mx-auto mb-1.5 text-purple-400" />
                      <div className="text-white font-semibold text-lg tabular-nums">{currentDeck.analytics.shareCount}</div>
                      <div className="text-white/40 text-[10px] uppercase tracking-wider">Shares</div>
                    </div>
                  </div>
                </div>

                {/* Details Section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-white/40 text-xs font-medium uppercase tracking-wider">
                    <Calendar className="h-3.5 w-3.5" />
                    Details
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-white/50 text-xs">Created</span>
                      <span className="text-white text-xs">{formatDateTime(currentDeck.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/50 text-xs">Modified</span>
                      <span className="text-white text-xs">{formatDateTime(currentDeck.lastModified)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/50 text-xs">Dimensions</span>
                      <span className="text-white text-xs tabular-nums">{currentDeck.size.width} × {currentDeck.size.height}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/50 text-xs">Slides</span>
                      <span className="text-white text-xs tabular-nums">{slideCount}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {currentDeck.description && (
                  <div className="space-y-2">
                    <div className="text-white/40 text-xs font-medium uppercase tracking-wider">
                      Description
                    </div>
                    <p className="text-white/70 text-xs leading-relaxed bg-white/5 rounded-lg p-3">
                      {currentDeck.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t border-white/10">
                <Button
                  size="sm"
                  className="w-full bg-white text-black hover:bg-white/90"
                  onClick={() => {
                    onClose();
                    navigate(`/app/decks/${currentDeck.id}`);
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in Editor
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thumbnail Grid Overlay */}
        <AnimatePresence>
          {showThumbnails && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/98 z-30 overflow-hidden"
              onClick={() => setShowThumbnails(false)}
            >
              <div className="flex flex-col h-full" onClick={(e) => e.stopPropagation()}>
                {/* Thumbnail header */}
                <div className="bg-black/90 backdrop-blur-sm border-b border-white/10">
                  <div className="flex items-center justify-between px-6 py-4">
                    <h2 className="text-white text-lg font-medium">All Slides</h2>
                    <button
                      onClick={() => setShowThumbnails(false)}
                      className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Horizontal scrollable thumbnail row */}
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-black/90 to-transparent pointer-events-none z-10" />
                    <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-black/90 to-transparent pointer-events-none z-10" />

                    <div
                      ref={thumbnailScrollRef}
                      className="flex items-center overflow-x-auto overflow-y-hidden px-6 pb-4 gap-3"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {displayDeck?.slides?.map((slide, index) => {
                        if (!slide || !slide.id) return null;

                        return (
                          <motion.button
                            key={slide.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: Math.min(index * 0.03, 0.3) }}
                            onClick={() => goToSlide(index)}
                            className={cn(
                              'relative group flex-shrink-0 overflow-hidden rounded-lg transition-all bg-gray-800',
                              'ring-2 ring-transparent hover:ring-white/50 hover:scale-105',
                              currentSlideIndex === index && 'ring-white scale-105'
                            )}
                            style={{
                              height: `${thumbnailHeight}px`,
                              width: `${thumbnailWidth}px`
                            }}
                          >
                            <div className="relative bg-white w-full h-full overflow-hidden">
                              <MiniSlide
                                slide={slide}
                                width={thumbnailWidth}
                                height={thumbnailHeight}
                                responsive={false}
                                className="pointer-events-none rounded-none"
                                slideSize={currentDeck.size}
                                forceRender={true}
                              />
                            </div>

                            {/* Slide number */}
                            <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 text-white text-[10px] font-medium">
                              {index + 1}
                            </div>

                            {/* Current indicator */}
                            {currentSlideIndex === index && (
                              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-white rounded-full px-2 py-0.5 text-black text-[10px] font-bold">
                                Current
                              </div>
                            )}

                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Click to close area */}
                <div
                  className="flex-1 bg-black/60 backdrop-blur-sm"
                  onClick={() => setShowThumbnails(false)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default DeckPreviewModal;
