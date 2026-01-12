import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Grid3X3, Maximize2, Minimize2 } from 'lucide-react';
import { usePresentationStore } from '@/stores/presentationStore';
import { useNavigation } from '@/context/NavigationContext';
import { SlideData } from '@/types/SlideTypes';
import { cn } from '@/lib/utils';
import { DEFAULT_SLIDE_HEIGHT, DEFAULT_SLIDE_WIDTH } from '@/utils/deckUtils';
import { normalizeSlideForRender } from '@/utils/slideNormalization';
import Watermark from '@/components/common/Watermark';
import MiniSlide from './MiniSlide';

interface PresentationModeProps {
  slides: SlideData[];
  currentSlideIndex: number;
  renderSlide: (slide: SlideData, index: number, scale?: number, isThumbnail?: boolean) => React.ReactNode;
  isViewOnly?: boolean;
  alwaysShowControls?: boolean;
  slideSize?: { width: number; height: number };
}

const PresentationMode: React.FC<PresentationModeProps> = ({
  slides,
  currentSlideIndex,
  renderSlide,
  isViewOnly = false,
  alwaysShowControls = false,
  slideSize
}) => {
  const {
    isPresenting,
    showControls,
    showThumbnails,
    exitPresentation,
    setShowControls,
    setShowThumbnails
  } = usePresentationStore();

  const { setCurrentSlideIndex } = useNavigation();

  // Navigation functions
  const goToNextSlide = useCallback(() => {
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  }, [currentSlideIndex, slides.length, setCurrentSlideIndex]);

  const goToPrevSlide = useCallback(() => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  }, [currentSlideIndex, setCurrentSlideIndex]);

  const goToSlide = useCallback((index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlideIndex(index);
    }
  }, [slides.length, setCurrentSlideIndex]);

  // Refs
  const presentationRef = useRef<HTMLDivElement>(null);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const thumbnailScrollRef = useRef<HTMLDivElement>(null);
  const lastMouseMove = useRef<number>(0);
  const lastScaleRef = useRef<number | null>(null);

  // State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [slideScale, setSlideScale] = useState(1);

  // Computed values
  const deckSlideSize = useMemo(
    () => slideSize || { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT },
    [slideSize]
  );

  const validIndex = useMemo(() => {
    if (!slides.length) return 0;
    return Math.max(0, Math.min(currentSlideIndex, slides.length - 1));
  }, [currentSlideIndex, slides.length]);

  const currentSlide = useMemo(
    () => (slides.length ? slides[validIndex] : null),
    [slides, validIndex]
  );

  const normalizedResult = useMemo(() => {
    if (!currentSlide) return null;
    return normalizeSlideForRender(currentSlide, deckSlideSize, { preferFallbackSize: true });
  }, [currentSlide, deckSlideSize]);

  const resolvedSlideSize = normalizedResult?.slideSize || deckSlideSize;
  const baseSlideWidth = resolvedSlideSize.width;
  const baseSlideHeight = resolvedSlideSize.height;

  // Thumbnail dimensions - guard against invalid values
  const thumbnailHeight = 120;
  const rawThumbnailWidth = thumbnailHeight * (deckSlideSize.width / deckSlideSize.height);
  const thumbnailWidth = (!isFinite(rawThumbnailWidth) || rawThumbnailWidth <= 0)
    ? Math.round(thumbnailHeight * (16 / 9)) // Default to 16:9 aspect ratio
    : Math.round(rawThumbnailWidth);

  // Calculate slide scale to fit container
  useLayoutEffect(() => {
    if (!isPresenting) return;

    const calculateScale = () => {
      const container = slideContainerRef.current;
      if (!container) return;

      try {
        const rect = container.getBoundingClientRect();
        const containerWidth = rect.width || window.innerWidth;
        const containerHeight = rect.height || window.innerHeight;

        // Skip if container has no dimensions yet
        if (!containerWidth || !containerHeight) return;

        // Calculate scale to fit the slide within the container
        const scaleX = containerWidth / baseSlideWidth;
        const scaleY = containerHeight / baseSlideHeight;
        const scale = Math.min(scaleX, scaleY);

        if (!Number.isFinite(scale) || scale <= 0) return;

        const normalizedScale = Math.round(scale * 1000) / 1000;
        if (lastScaleRef.current === normalizedScale) return;
        lastScaleRef.current = normalizedScale;

        setSlideScale(normalizedScale);
      } catch (error) {
        console.warn('[PresentationMode] Scale calculation failed:', error);
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
  }, [isPresenting, baseSlideWidth, baseSlideHeight]);

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

  // Add/remove body class for presentation mode
  useEffect(() => {
    if (isPresenting) {
      document.body.classList.add('presentation-mode');
    } else {
      document.body.classList.remove('presentation-mode');
    }

    return () => {
      document.body.classList.remove('presentation-mode');
    };
  }, [isPresenting]);

  // Dispatch slidechange event when slide changes (for chart animations)
  useEffect(() => {
    if (!isPresenting) return;
    if (!currentSlide?.id) return;

    let raf1: number | null = null;
    let raf2: number | null = null;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const event = new CustomEvent('slidechange', {
          detail: { slideId: currentSlide.id, index: currentSlideIndex }
        });
        document.dispatchEvent(event);

        if (typeof window !== 'undefined') {
          (window as any).__lastSlideChangeDispatch = {
            slideId: currentSlide.id,
            ts: Date.now()
          };
        }
      });
    });

    return () => {
      if (raf1 !== null) cancelAnimationFrame(raf1);
      if (raf2 !== null) cancelAnimationFrame(raf2);
    };
  }, [currentSlideIndex, currentSlide?.id, isPresenting]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(async () => {
    const elem = presentationRef.current || document.documentElement;

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

  const handleExitPresentation = useCallback(() => {
    exitPresentation();
  }, [exitPresentation]);

  // Event handlers
  useEffect(() => {
    if (!isPresenting) return;

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastMouseMove.current < 100) return;
      lastMouseMove.current = now;

      if (!showThumbnails) {
        // Show controls when cursor is within 10% of any edge
        const edgeThreshold = 0.1;
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;

        const nearEdge = x < edgeThreshold || x > (1 - edgeThreshold) ||
                         y < edgeThreshold || y > (1 - edgeThreshold);

        if (nearEdge) {
          setShowControls(true);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          handleExitPresentation();
          break;
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          setShowControls(true);
          goToNextSlide();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setShowControls(true);
          goToPrevSlide();
          break;
        case 'g':
        case 'G':
          e.preventDefault();
          setShowThumbnails(!showThumbnails);
          break;
      }
    };

    const handleFullscreenChange = () => {
      const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFS);
    };

    // Touch/swipe support
    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (!e.touches || e.touches.length === 0) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;

      if (!showThumbnails) {
        setShowControls(true);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (showThumbnails) return;
      if (!e.changedTouches || e.changedTouches.length === 0) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      // Only trigger swipe if horizontal movement is greater than vertical and significant
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX < 0) {
          goToNextSlide();
        } else {
          goToPrevSlide();
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [
    isPresenting,
    showThumbnails,
    isFullscreen,
    goToNextSlide,
    goToPrevSlide,
    toggleFullscreen,
    handleExitPresentation,
    setShowControls,
    setShowThumbnails
  ]);

  // Render slide content at scale=1, we apply CSS transform for scaling
  const slideContent = useMemo(() => {
    if (!isPresenting || !currentSlide) return null;
    return renderSlide(currentSlide, validIndex, 1, false);
  }, [currentSlide, isPresenting, renderSlide, validIndex]);

  if (!isPresenting) return null;

  const progressTotal = Math.max(1, slides.length);

  // Calculate the scaled dimensions for the wrapper
  const scaledWidth = baseSlideWidth * slideScale;
  const scaledHeight = baseSlideHeight * slideScale;

  return (
    <motion.div
      ref={presentationRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black"
      style={{ height: '100dvh' }}
    >
      {/* Main slide display - container for measuring available space */}
      <div
        ref={slideContainerRef}
        className="relative w-full h-full flex items-center justify-center"
      >
        {/* Outer wrapper sized to the scaled dimensions for proper centering */}
        <div
          className="relative overflow-hidden rounded-lg"
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
            {currentSlide && (
              <div
                key={`slide-${currentSlide.id || validIndex}`}
                className="w-full h-full relative"
              >
                {slideContent}
                {isViewOnly && (
                  <Watermark
                    text="VIEW ONLY"
                    opacity={0.06}
                    fontSize={120}
                    rotation={-30}
                    repeat={false}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating controls overlay */}
      <AnimatePresence>
        {(showControls || alwaysShowControls) && !showThumbnails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 pointer-events-none z-[20000]"
          >
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 p-6 pointer-events-auto">
              <div className="flex items-center justify-between">
                {/* Current slide indicator */}
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="bg-black/60 rounded-full px-4 py-2 text-white/90 text-sm font-medium border border-white/20"
                >
                  {validIndex + 1} / {slides.length}
                </motion.div>

                {/* Right controls */}
                <div className="flex items-center gap-2">
                  {/* Grid view button */}
                  <motion.button
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    onClick={() => setShowThumbnails(true)}
                    className="bg-black/60 rounded-full p-2 text-white/90 hover:bg-black/80 transition-colors border border-white/20"
                    title="Show all slides (G)"
                  >
                    <Grid3X3 size={18} />
                  </motion.button>

                  {/* Fullscreen toggle */}
                  <motion.button
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    onClick={toggleFullscreen}
                    className="bg-black/60 rounded-full p-2 text-white/90 hover:bg-black/80 transition-colors border border-white/20"
                    title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
                  >
                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </motion.button>

                  {/* Exit button */}
                  <motion.button
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    onClick={handleExitPresentation}
                    className="bg-black/60 rounded-full p-2 text-white/90 hover:bg-black/80 transition-colors border border-white/20"
                    title="Exit presentation (ESC)"
                  >
                    <X size={18} />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Navigation arrows */}
            <div className="absolute top-1/2 -translate-y-1/2 left-6 right-6 flex justify-between pointer-events-auto">
              <motion.button
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                onClick={goToPrevSlide}
                disabled={validIndex === 0}
                className={cn(
                  'bg-black/60 rounded-full p-3 text-white/90 transition-all border border-white/20',
                  validIndex === 0
                    ? 'opacity-30 cursor-not-allowed'
                    : 'hover:bg-black/80 hover:scale-110'
                )}
              >
                <ChevronLeft size={24} />
              </motion.button>

              <motion.button
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                onClick={goToNextSlide}
                disabled={validIndex === slides.length - 1}
                className={cn(
                  'bg-black/60 rounded-full p-3 text-white/90 transition-all border border-white/20',
                  validIndex === slides.length - 1
                    ? 'opacity-30 cursor-not-allowed'
                    : 'hover:bg-black/80 hover:scale-110'
                )}
              >
                <ChevronRight size={24} />
              </motion.button>
            </div>

            {/* Bottom progress bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-6 left-6 right-6 pointer-events-auto"
            >
              <div className="bg-black/40 rounded-full h-1 overflow-hidden">
                <motion.div
                  className="bg-white/80 h-full rounded-full"
                  animate={{ width: `${((validIndex + 1) / progressTotal) * 100}%` }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thumbnail grid overlay */}
      <AnimatePresence>
        {showThumbnails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/98 z-[20000] overflow-y-auto"
            onClick={() => setShowThumbnails(false)}
          >
            <div className="flex flex-col h-full" onClick={(e) => e.stopPropagation()}>
              {/* Thumbnail bar at top */}
              <div className="bg-black/90 backdrop-blur-sm border-b border-white/10">
                {/* Header row */}
                <div className="flex items-center justify-between px-6 py-3">
                  <h2 className="text-white text-lg font-medium">All Slides</h2>
                  <button
                    onClick={() => setShowThumbnails(false)}
                    className="bg-white/10 rounded-full p-1.5 text-white/90 hover:bg-white/20 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Horizontally scrollable thumbnail row */}
                <div className="relative">
                  {/* Left gradient */}
                  <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-black/90 to-transparent pointer-events-none z-10" />

                  {/* Right gradient */}
                  <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black/90 to-transparent pointer-events-none z-10" />

                  {/* Scrollable container */}
                  <div
                    ref={thumbnailScrollRef}
                    className="flex items-center overflow-x-auto overflow-y-hidden thumbnail-scroll px-6 pb-4"
                  >
                    <div className="flex gap-4 items-center">
                      {slides.map((slide, index) => {
                        if (!slide || !slide.id || slide.id.startsWith('placeholder-')) {
                          return null;
                        }

                        return (
                          <motion.button
                            key={slide.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: Math.min(index * 0.05, 0.5) }}
                            onClick={() => {
                              goToSlide(index);
                              setShowThumbnails(false);
                            }}
                            className={cn(
                              'relative group flex-shrink-0 overflow-hidden rounded-md transition-all bg-gray-800',
                              'ring-1 ring-transparent hover:ring-white/50 hover:scale-105',
                              validIndex === index && 'ring-2 ring-white scale-105'
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
                                className="pointer-events-none rounded-none hover:ring-0"
                                slideSize={deckSlideSize}
                              />
                            </div>

                            {/* Slide number overlay */}
                            <div className="absolute top-1 left-1 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 text-white text-xs font-medium">
                              {index + 1}
                            </div>

                            {/* Current slide indicator */}
                            {validIndex === index && (
                              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-white rounded-full px-2 py-0.5 text-black text-xs font-bold">
                                Current
                              </div>
                            )}

                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dark background area below thumbnails */}
              <div
                className="flex-1 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowThumbnails(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PresentationMode;
