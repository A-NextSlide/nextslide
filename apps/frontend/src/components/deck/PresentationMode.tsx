import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Grid3X3, Lock } from 'lucide-react';
import { usePresentationStore } from '@/stores/presentationStore';
import { useNavigation } from '@/context/NavigationContext';
import { SlideData } from '@/types/SlideTypes';
import { cn } from '@/lib/utils';
import { DEFAULT_SLIDE_HEIGHT, DEFAULT_SLIDE_WIDTH } from '@/utils/deckUtils';
import Watermark from '@/components/common/Watermark';
import MiniSlide from './MiniSlide';
import MobilePresentationThumbnail from './MobilePresentationThumbnail';
import { useIsMobile } from '@/hooks/use-mobile';
import { BROWSER } from '@/utils/browser';
import { captureTinySlideScreenshot } from '@/utils/slideScreenshot';
import { useLockedSlides } from '@/hooks/useLockedSlides';
import LockedSlideOverlay from './LockedSlideOverlay';

interface PresentationModeProps {
  slides: SlideData[];
  currentSlideIndex: number;
  renderSlide: (slide: SlideData, index: number, scale?: number, isThumbnail?: boolean) => React.ReactNode;
  isViewOnly?: boolean;
  alwaysShowControls?: boolean;
  slideSize?: { width: number; height: number };
}

/**
 * CaptureSlot - Offscreen component for capturing slide screenshots
 * Reports when the slide is fully mounted and ready for capture
 */
interface CaptureSlotProps {
  slide: SlideData;
  slideSize: { width: number; height: number };
  onSlideReady: (slideId: string) => void;
}

const CaptureSlot = React.forwardRef<HTMLDivElement, CaptureSlotProps>(
  ({ slide, slideSize, onSlideReady }, ref) => {
    // Report when this slide is mounted
    useEffect(() => {
      if (slide?.id) {
        // Small delay to ensure MiniSlide has started rendering
        const timer = setTimeout(() => {
          onSlideReady(slide.id);
        }, 50);
        return () => clearTimeout(timer);
      }
    }, [slide?.id, onSlideReady]);

    return (
      <div
        ref={ref}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: `${slideSize.width}px`,
          height: `${slideSize.height}px`,
          background: '#fff',
          pointerEvents: 'none',
        }}
      >
        <MiniSlide
          key={`capture-${slide.id}`}
          slide={slide}
          width={slideSize.width}
          height={slideSize.height}
          responsive={false}
          slideSize={slideSize}
          forceRender
        />
      </div>
    );
  }
);

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
  const isMobile = useIsMobile();

  // Get locked slides info
  const { isLocked, lockedCount } = useLockedSlides();

  // Use lightweight thumbnails on mobile to prevent crashes
  const useMobileThumbnails = BROWSER.isMobile;

  // Mobile thumbnail capture state - captures one slide at a time offscreen
  const [thumbnailCache, setThumbnailCache] = useState<Map<string, string>>(() => new Map());
  const [captureIndex, setCaptureIndex] = useState<number>(-1);
  const captureSlotRef = useRef<HTMLDivElement>(null);
  const isCapturingRef = useRef(false);

  // Start capturing when thumbnails open on mobile
  useEffect(() => {
    if (useMobileThumbnails && showThumbnails && captureIndex === -1) {
      // Start with first uncached slide
      const firstUncached = slides.findIndex(s => s?.id && !thumbnailCache.has(s.id));
      if (firstUncached !== -1) {
        setCaptureIndex(firstUncached);
      }
    }
    if (!showThumbnails) {
      setCaptureIndex(-1);
      isCapturingRef.current = false;
    }
  }, [showThumbnails, useMobileThumbnails, slides, thumbnailCache, captureIndex]);

  // Ref to track which slide is currently in the capture slot
  const captureSlotSlideIdRef = useRef<string | null>(null);

  // Capture current slide and move to next
  const captureCurrentSlide = useCallback(async () => {
    if (!captureSlotRef.current || isCapturingRef.current) return;

    // Capture slide ID at start - this is the slide we're capturing
    const currentIndex = captureIndex;
    const slide = slides[currentIndex];
    if (!slide?.id) {
      // Move to next
      const nextUncached = slides.findIndex((s, i) => i > currentIndex && s?.id && !thumbnailCache.has(s.id));
      setCaptureIndex(nextUncached);
      return;
    }

    const slideId = slide.id; // Lock in the ID
    isCapturingRef.current = true;
    console.log(`[MobileCapture] Starting capture for slide ${currentIndex}: ${slideId}`);

    try {
      // Wait for MiniSlide to render the correct slide
      // Check up to 5 times with 100ms intervals
      let attempts = 0;
      const maxAttempts = 5;
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 100));

        // Verify the capture slot has the correct slide
        if (captureSlotSlideIdRef.current === slideId) {
          break;
        }
        attempts++;
        console.log(`[MobileCapture] Waiting for slide ${slideId}, slot has ${captureSlotSlideIdRef.current}, attempt ${attempts}`);
      }

      if (captureSlotSlideIdRef.current !== slideId) {
        console.warn(`[MobileCapture] Slot mismatch after ${maxAttempts} attempts, skipping ${slideId}`);
        isCapturingRef.current = false;
        const nextUncached = slides.findIndex((s, i) => i > currentIndex && s?.id && !thumbnailCache.has(s.id));
        setCaptureIndex(nextUncached);
        return;
      }

      const dataUrl = await captureTinySlideScreenshot(captureSlotRef.current);

      if (dataUrl) {
        console.log(`[MobileCapture] Success: ${slideId}`);
        // Update cache with the locked slideId
        setThumbnailCache(prev => {
          const next = new Map(prev);
          next.set(slideId, dataUrl);
          return next;
        });

        // Small delay to let state update propagate before moving to next
        await new Promise(r => setTimeout(r, 50));
      } else {
        console.warn(`[MobileCapture] No data returned for: ${slideId}`);
      }
    } catch (err) {
      console.error(`[MobileCapture] Failed:`, err);
    }

    isCapturingRef.current = false;

    // Find next uncached slide - check from current position
    const nextUncached = slides.findIndex((s, i) => i > currentIndex && s?.id && !thumbnailCache.has(s.id));
    setCaptureIndex(nextUncached);
  }, [captureIndex, slides, thumbnailCache]);

  // Trigger capture when captureIndex changes
  useEffect(() => {
    if (useMobileThumbnails && showThumbnails && captureIndex >= 0 && captureIndex < slides.length) {
      const timer = setTimeout(captureCurrentSlide, 50);
      return () => clearTimeout(timer);
    }
  }, [captureIndex, useMobileThumbnails, showThumbnails, slides.length, captureCurrentSlide]);

  // Edge detection state and timeout ref
  const [isInEdgeZone, setIsInEdgeZone] = useState(false);
  const edgeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle mouse movement to detect edge zones (30% from each side)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (showThumbnails || isMobile) return;

    const containerWidth = window.innerWidth;
    const mouseX = e.clientX;
    const edgeThreshold = containerWidth * 0.30; // 30% from each edge

    const inLeftZone = mouseX < edgeThreshold;
    const inRightZone = mouseX > containerWidth - edgeThreshold;
    const inEdge = inLeftZone || inRightZone;

    if (inEdge) {
      // Clear any pending hide timeout
      if (edgeTimeoutRef.current) {
        clearTimeout(edgeTimeoutRef.current);
        edgeTimeoutRef.current = null;
      }

      if (!isInEdgeZone) {
        setIsInEdgeZone(true);
      }
      // Always show controls when in edge zone
      setShowControls(true);
    } else {
      // Left the edge zone - start a short delay before hiding
      if (isInEdgeZone) {
        if (edgeTimeoutRef.current) {
          clearTimeout(edgeTimeoutRef.current);
        }
        edgeTimeoutRef.current = setTimeout(() => {
          setIsInEdgeZone(false);
          edgeTimeoutRef.current = null;
        }, 300);
      }
    }
  }, [showThumbnails, isMobile, isInEdgeZone, setShowControls]);

  // Clean up edge timeout on unmount
  useEffect(() => {
    return () => {
      if (edgeTimeoutRef.current) {
        clearTimeout(edgeTimeoutRef.current);
      }
    };
  }, []);

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
  const thumbnailScrollRef = useRef<HTMLDivElement>(null);

  // State
  const [slideScale, setSlideScale] = useState<number | null>(null);
  const [forceLandscape, setForceLandscape] = useState(false);

  // Get slide dimensions - use deck size for consistency
  const deckSlideSize = useMemo(
    () => slideSize || { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT },
    [slideSize]
  );
  const baseSlideWidth = deckSlideSize.width;
  const baseSlideHeight = deckSlideSize.height;

  // Thumbnail dimensions
  const thumbnailHeight = 120;
  const rawThumbnailWidth = thumbnailHeight * (deckSlideSize.width / deckSlideSize.height);
  const thumbnailWidth = (!isFinite(rawThumbnailWidth) || rawThumbnailWidth <= 0)
    ? Math.round(thumbnailHeight * (16 / 9))
    : Math.round(rawThumbnailWidth);

  const validIndex = useMemo(() => {
    if (!slides.length) return 0;
    return Math.max(0, Math.min(currentSlideIndex, slides.length - 1));
  }, [currentSlideIndex, slides.length]);

  const currentSlide = useMemo(
    () => (slides.length ? slides[validIndex] : null),
    [slides, validIndex]
  );

  // Check if current slide is locked
  const currentSlideIsLocked = isLocked(validIndex);

  // Calculate scale and determine if we need forced landscape rotation
  useLayoutEffect(() => {
    if (!isPresenting) {
      setSlideScale(null);
      setForceLandscape(false);
      return;
    }

    const calculateScale = () => {
      let viewportWidth = window.innerWidth;
      let viewportHeight = window.innerHeight;

      // On mobile, if viewport is portrait (taller than wide), force landscape mode
      // by swapping dimensions and applying CSS rotation
      const isPortrait = viewportHeight > viewportWidth;
      const needsForceLandscape = isMobile && isPortrait;

      setForceLandscape(needsForceLandscape);

      // If forcing landscape, swap the viewport dimensions for calculation
      if (needsForceLandscape) {
        [viewportWidth, viewportHeight] = [viewportHeight, viewportWidth];
      }

      // Minimal padding - just enough for buttons
      const horizontalPadding = isMobile ? 80 : 150;
      const verticalPadding = isMobile ? 80 : 150;

      const availableWidth = viewportWidth - horizontalPadding;
      const availableHeight = viewportHeight - verticalPadding;

      const scaleX = availableWidth / baseSlideWidth;
      const scaleY = availableHeight / baseSlideHeight;
      const scale = Math.min(scaleX, scaleY);

      if (Number.isFinite(scale) && scale > 0) {
        setSlideScale(Math.round(scale * 1000) / 1000);
      }
    };

    // Calculate immediately
    calculateScale();

    // Recalculate on resize/orientation change
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [isPresenting, baseSlideWidth, baseSlideHeight, isMobile]);

  // Scroll current slide into view when thumbnails open
  useEffect(() => {
    if (showThumbnails && thumbnailScrollRef.current) {
      const slideButtons = thumbnailScrollRef.current.querySelectorAll('button');
      const currentSlideElement = slideButtons[currentSlideIndex];
      if (currentSlideElement) {
        currentSlideElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
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
    return () => document.body.classList.remove('presentation-mode');
  }, [isPresenting]);

  // Dispatch slidechange event when slide changes
  useEffect(() => {
    if (!isPresenting || !currentSlide?.id) return;
    const event = new CustomEvent('slidechange', {
      detail: { slideId: currentSlide.id, index: currentSlideIndex }
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.dispatchEvent(event);
      });
    });
  }, [currentSlideIndex, currentSlide?.id, isPresenting]);

  const handleExitPresentation = useCallback(() => {
    exitPresentation();
  }, [exitPresentation]);

  // Keyboard and touch handlers
  useEffect(() => {
    if (!isPresenting) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          handleExitPresentation();
          break;
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          goToNextSlide();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevSlide();
          break;
        case 'g':
        case 'G':
          e.preventDefault();
          setShowThumbnails(!showThumbnails);
          break;
      }
    };

    // Touch/swipe support
    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (!e.touches?.length) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      if (!showThumbnails) setShowControls(true);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (showThumbnails || !e.changedTouches?.length) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX < 0) goToNextSlide();
        else goToPrevSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPresenting, showThumbnails, goToNextSlide, goToPrevSlide, handleExitPresentation, setShowControls, setShowThumbnails]);

  // Render slide content
  const slideContent = useMemo(() => {
    if (!isPresenting || !currentSlide) return null;
    return renderSlide(currentSlide, validIndex, 1, false);
  }, [currentSlide, isPresenting, renderSlide, validIndex]);

  if (!isPresenting || slideScale === null) return null;

  const scaledWidth = baseSlideWidth * slideScale;
  const scaledHeight = baseSlideHeight * slideScale;
  const progressTotal = Math.max(1, slides.length);

  // When forcing landscape, we rotate the entire view 90 degrees
  const containerStyle = forceLandscape
    ? {
        width: window.innerHeight,
        height: window.innerWidth,
        transform: 'rotate(90deg)',
        transformOrigin: 'top left',
        position: 'fixed' as const,
        top: 0,
        left: window.innerWidth,
        zIndex: 100,
      }
    : {
        height: '100dvh',
      };

  return (
    <motion.div
      ref={presentationRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn("bg-black", forceLandscape ? "" : "fixed inset-0 z-[100]")}
      style={containerStyle}
      onMouseMove={handleMouseMove}
    >
      {/* Slide container */}
      <div className="relative w-full h-full flex items-center justify-center">
        <div
          className="relative overflow-hidden rounded-lg bg-white"
          style={{ width: scaledWidth, height: scaledHeight }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: baseSlideWidth,
              height: baseSlideHeight,
              transform: `scale(${slideScale})`,
            }}
          >
            {currentSlide && (
              <div key={`slide-${currentSlide.id || validIndex}`} className="w-full h-full relative">
                {/* Slide content - blurred if locked */}
                <div
                  className="w-full h-full"
                  style={currentSlideIsLocked ? {
                    filter: 'blur(16px) saturate(0.7) brightness(0.95)',
                    pointerEvents: 'none'
                  } : undefined}
                >
                  {slideContent}
                </div>

                {/* Locked slide overlay - shown on top of blurred content */}
                {currentSlideIsLocked && (
                  <LockedSlideOverlay
                    lockedCount={lockedCount}
                    mode="full"
                    openInNewTab={true}
                    className="absolute inset-0"
                  />
                )}

                {isViewOnly && !currentSlideIsLocked && (
                  <Watermark text="VIEW ONLY" opacity={0.06} fontSize={120} rotation={-30} repeat={false} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls overlay */}
      <AnimatePresence>
        {(showControls || alwaysShowControls || isInEdgeZone) && !showThumbnails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none z-[20000]"
          >
            {/* Top bar */}
            <div className={cn(
              "absolute top-0 left-0 right-0 pointer-events-auto",
              isMobile ? "p-3" : "p-6"
            )}>
              <div className="flex items-center justify-between">
                <div className="bg-black/60 rounded-full px-4 py-2 text-white/90 text-sm font-medium border border-white/20">
                  {validIndex + 1} / {slides.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowThumbnails(true)}
                    className="bg-black/60 rounded-full w-10 h-10 flex items-center justify-center text-white/90 hover:bg-black/80 border border-white/20"
                  >
                    <Grid3X3 size={18} />
                  </button>
                  <button
                    onClick={handleExitPresentation}
                    className="bg-black/60 rounded-full w-10 h-10 flex items-center justify-center text-white/90 hover:bg-black/80 border border-white/20"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Navigation buttons - at sides, vertically centered */}
            <div className="absolute top-1/2 -translate-y-1/2 left-2 pointer-events-auto">
              <button
                onClick={goToPrevSlide}
                disabled={validIndex === 0}
                className={cn(
                  'bg-black/60 rounded-full w-12 h-12 flex items-center justify-center text-white/90 border border-white/20',
                  validIndex === 0 ? 'opacity-30' : 'hover:bg-black/80 active:scale-95'
                )}
              >
                <ChevronLeft size={24} />
              </button>
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 right-2 pointer-events-auto">
              <button
                onClick={goToNextSlide}
                disabled={validIndex === slides.length - 1}
                className={cn(
                  'bg-black/60 rounded-full w-12 h-12 flex items-center justify-center text-white/90 border border-white/20',
                  validIndex === slides.length - 1 ? 'opacity-30' : 'hover:bg-black/80 active:scale-95'
                )}
              >
                <ChevronRight size={24} />
              </button>
            </div>

            {/* Progress bar */}
            <div className={cn(
              "absolute left-6 right-6 pointer-events-auto",
              isMobile ? "bottom-4" : "bottom-6"
            )}>
              <div className="bg-black/40 rounded-full h-1 overflow-hidden">
                <motion.div
                  className="bg-white/80 h-full rounded-full"
                  animate={{ width: `${((validIndex + 1) / progressTotal) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
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
              <div className="bg-black/90 backdrop-blur-sm border-b border-white/10">
                <div className="flex items-center justify-between px-6 py-3">
                  <h2 className="text-white text-lg font-medium">All Slides</h2>
                  <button
                    onClick={() => setShowThumbnails(false)}
                    className="bg-white/10 rounded-full p-1.5 text-white/90 hover:bg-white/20"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-black/90 to-transparent pointer-events-none z-10" />
                  <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black/90 to-transparent pointer-events-none z-10" />
                  <div ref={thumbnailScrollRef} className="flex items-center overflow-x-auto px-6 pb-4">
                    <div className="flex gap-4 items-center">
                      {slides.map((slide, index) => {
                        if (!slide?.id || slide.id.startsWith('placeholder-')) return null;

                        const slideIsLocked = isLocked(index);

                        // On mobile, use lightweight thumbnail with cached screenshots
                        if (useMobileThumbnails) {
                          return (
                            <MobilePresentationThumbnail
                              key={slide.id}
                              slide={slide}
                              width={thumbnailWidth}
                              height={thumbnailHeight}
                              isActive={validIndex === index}
                              slideNumber={index + 1}
                              onClick={() => { goToSlide(index); setShowThumbnails(false); }}
                              cachedUrl={thumbnailCache.get(slide.id) || null}
                              isCapturing={captureIndex === index}
                              isLocked={slideIsLocked}
                            />
                          );
                        }

                        // Desktop: use MiniSlide directly (unchanged behavior)
                        return (
                          <button
                            key={slide.id}
                            onClick={() => { goToSlide(index); setShowThumbnails(false); }}
                            className={cn(
                              'relative group flex-shrink-0 overflow-hidden rounded-md bg-gray-800',
                              'ring-1 ring-transparent hover:ring-white/50',
                              slideIsLocked && 'ring-1 ring-orange-500/50',
                              validIndex === index && 'ring-2 ring-white'
                            )}
                            style={{ height: thumbnailHeight, width: thumbnailWidth }}
                          >
                            <div className="relative bg-white w-full h-full overflow-hidden">
                              <MiniSlide
                                slide={slide}
                                width={thumbnailWidth}
                                height={thumbnailHeight}
                                responsive={false}
                                className="pointer-events-none"
                                slideSize={deckSlideSize}
                                isLocked={slideIsLocked}
                              />
                            </div>
                            <div className="absolute top-1 left-1 bg-black/70 rounded-full px-2 py-0.5 text-white text-xs font-medium flex items-center gap-1">
                              {slideIsLocked && <Lock size={10} className="text-orange-400" />}
                              {index + 1}
                            </div>
                            {validIndex === index && !slideIsLocked && (
                              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-white rounded-full px-2 py-0.5 text-black text-xs font-bold">
                                Current
                              </div>
                            )}
                            {slideIsLocked && (
                              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-orange-500 rounded-full px-2 py-0.5 text-white text-xs font-bold">
                                Locked
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 bg-black/60" onClick={() => setShowThumbnails(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offscreen capture slot - renders ONE MiniSlide at a time for screenshot capture */}
      {/* Hidden behind overlay, forceRender bypasses lazy loading */}
      {useMobileThumbnails && showThumbnails && captureIndex >= 0 && captureIndex < slides.length && slides[captureIndex]?.id && (
        <CaptureSlot
          ref={captureSlotRef}
          slide={slides[captureIndex]}
          slideSize={deckSlideSize}
          onSlideReady={(slideId) => { captureSlotSlideIdRef.current = slideId; }}
        />
      )}
    </motion.div>
  );
};

export default PresentationMode;
