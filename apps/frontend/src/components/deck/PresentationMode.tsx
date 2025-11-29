import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Grid3X3, Maximize2, Minimize2 } from 'lucide-react';
import { usePresentationStore } from '@/stores/presentationStore';
import { useSlideNavigation } from '@/hooks/useSlideNavigation';
import { SlideData } from '@/types/SlideTypes';
import { cn } from '@/lib/utils';
import { DEFAULT_SLIDE_HEIGHT, DEFAULT_SLIDE_WIDTH } from '@/utils/deckUtils';
import Watermark from '@/components/common/Watermark';

interface PresentationModeProps {
  slides: SlideData[];
  currentSlideIndex: number;
  renderSlide: (slide: SlideData, index: number, scale?: number) => React.ReactNode;
  isViewOnly?: boolean;
  alwaysShowControls?: boolean;
}

const PresentationMode: React.FC<PresentationModeProps> = ({
  slides,
  currentSlideIndex,
  renderSlide,
  isViewOnly = false,
  alwaysShowControls = false
}) => {
  const { 
    isPresenting, 
    showControls, 
    showThumbnails,
    exitPresentation, 
    setShowControls,
    setShowThumbnails 
  } = usePresentationStore();
  
  const { goToNextSlide, goToPrevSlide, goToSlide } = useSlideNavigation();
  const lastMouseMove = useRef<number>(0);
  const mouseMoveTimeout = useRef<NodeJS.Timeout | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const thumbnailScrollRef = useRef<HTMLDivElement>(null);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const presentationRef = useRef<HTMLDivElement>(null);
  const [slideScale, setSlideScale] = useState(0.8); // Start with a conservative scale
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle fullscreen toggle with iOS Safari support
  const toggleFullscreen = async () => {
    try {
      if (isFullscreen) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      } else {
        const elem = presentationRef.current || document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if ((elem as any).webkitRequestFullscreen) {
          // iOS Safari
          (elem as any).webkitRequestFullscreen();
        } else if ((elem as any).webkitEnterFullscreen) {
          // Older iOS
          (elem as any).webkitEnterFullscreen();
        }
      }
    } catch (err) {
      console.log('Fullscreen not supported:', err);
    }
  };
  
  // Dispatch slidechange event when slide changes in presentation mode
  // This ensures chart animations are triggered properly
  useEffect(() => {
    if (!isPresenting) return;
    
    const currentSlide = slides[currentSlideIndex];
    if (!currentSlide?.id) return;
    
    // Use requestAnimationFrame to ensure the slide is rendered before dispatching the event
    let raf1: number | null = null;
    let raf2: number | null = null;
    
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        // Dispatch the slidechange event
        const event = new CustomEvent('slidechange', {
          detail: { slideId: currentSlide.id, index: currentSlideIndex }
        });
        document.dispatchEvent(event);
        
        // Also update the global window state for chart animations
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
  }, [currentSlideIndex, slides, isPresenting]);
  
  // Calculate slide scale based on container size
  useEffect(() => {
    const calculateScale = () => {
      if (!slideContainerRef.current || !isPresenting) return;
      
      const container = slideContainerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      // Skip if container has no dimensions yet
      if (containerWidth === 0 || containerHeight === 0) return;
      
      // Calculate scale to fit the slide within the container
      const scaleX = containerWidth / DEFAULT_SLIDE_WIDTH;
      const scaleY = containerHeight / DEFAULT_SLIDE_HEIGHT;
      const scale = Math.min(scaleX, scaleY);
      
      setSlideScale(scale);
    };
    
    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      calculateScale();
    });
    
    // Also calculate after a small delay as a fallback
    const timeoutId = setTimeout(calculateScale, 100);
    
    // Use ResizeObserver for better dimension tracking
    let resizeObserver: ResizeObserver | null = null;
    if (slideContainerRef.current && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        calculateScale();
      });
      resizeObserver.observe(slideContainerRef.current);
    }
    
    window.addEventListener('resize', calculateScale);
    
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', calculateScale);
    };
  }, [isPresenting]);
  
  // Scroll current slide into view when thumbnails open
  useEffect(() => {
    if (showThumbnails && thumbnailScrollRef.current) {
      const container = thumbnailScrollRef.current;
      const slides = container.querySelectorAll('button');
              const currentSlideElement = slides[currentSlideIndex];
      
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

  // Handle mouse/touch movement and keyboard
  useEffect(() => {
    if (!isPresenting) return;

    let touchStartX = 0;
    let touchStartY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();

      // Throttle mouse move events
      if (now - lastMouseMove.current < 100) return;
      lastMouseMove.current = now;

      // Don't show controls if thumbnails are open
      if (showThumbnails) return;

      // Show controls
      setShowControls(true);
    };

    // Touch support for mobile
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;

      // Show controls on touch
      if (!showThumbnails) {
        setShowControls(true);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (showThumbnails) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      // Only trigger swipe if horizontal movement is greater than vertical
      // and the swipe distance is significant (> 50px)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX < 0) {
          // Swipe left -> next slide
          goToNextSlide();
        } else {
          // Swipe right -> previous slide
          goToPrevSlide();
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPresenting) return;

      switch (e.key) {
        case 'Escape':
          exitPresentation();
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

    // Handle fullscreen changes (including webkit prefix for Safari)
    const handleFullscreenChange = () => {
      const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFS);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isPresenting, showThumbnails, setShowControls, exitPresentation, goToNextSlide, goToPrevSlide]);

  if (!isPresenting) return null;

  const currentSlide = slides[currentSlideIndex];

  return (
    <motion.div
      ref={presentationRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black"
      style={{ height: '100dvh' }} // Use dvh for mobile Safari compatibility
    >
      {/* Main slide display */}
      <div className="relative w-full h-full flex items-center justify-center p-4">
        <div
          ref={slideContainerRef}
          className="relative rounded-lg overflow-hidden"
          style={{
            width: '100%',
            maxWidth: `min(95vw, calc(95dvh * ${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}))`,
            aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`,
            // Fallback height for browsers that don't support aspect-ratio
            minHeight: `min(calc(95vw * ${DEFAULT_SLIDE_HEIGHT} / ${DEFAULT_SLIDE_WIDTH}), 95dvh)`
          }}
        >
          {currentSlide && renderSlide(currentSlide, currentSlideIndex, slideScale)}
          {/* Add watermark for view-only presentations */}
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
      </div>

      {/* Floating controls overlay */}
      <AnimatePresence>
        {(showControls || alwaysShowControls) && !showThumbnails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 pointer-events-none z-20"
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
                  {currentSlideIndex + 1} / {slides.length}
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
                    className={cn(
                      "bg-black/60 rounded-full text-white/90 hover:bg-black/80 transition-colors border border-white/20",
                      isMobile ? "p-3" : "p-2"
                    )}
                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    {isFullscreen ? <Minimize2 size={isMobile ? 22 : 18} /> : <Maximize2 size={isMobile ? 22 : 18} />}
                  </motion.button>

                  {/* Exit button */}
                  <motion.button
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    onClick={exitPresentation}
                    className="bg-black/60 rounded-full p-2 text-white/90 hover:bg-black/80 transition-colors border border-white/20"
                    title="Exit presentation (ESC)"
                  >
                    <X size={18} />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Navigation arrows */}
            <div className={cn(
              "absolute top-1/2 -translate-y-1/2 flex justify-between pointer-events-auto",
              isMobile ? "left-2 right-2" : "left-6 right-6"
            )}>
              <motion.button
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                onClick={goToPrevSlide}
                disabled={currentSlideIndex === 0}
                className={cn(
                  "bg-black/60 rounded-full text-white/90 transition-all border border-white/20",
                  isMobile ? "p-4" : "p-3",
                  currentSlideIndex === 0
                    ? "opacity-30 cursor-not-allowed"
                    : "hover:bg-black/80 hover:scale-110 active:scale-95"
                )}
              >
                <ChevronLeft size={isMobile ? 28 : 24} />
              </motion.button>

              <motion.button
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                onClick={goToNextSlide}
                disabled={currentSlideIndex === slides.length - 1}
                className={cn(
                  "bg-black/60 rounded-full text-white/90 transition-all border border-white/20",
                  isMobile ? "p-4" : "p-3",
                  currentSlideIndex === slides.length - 1
                    ? "opacity-30 cursor-not-allowed"
                    : "hover:bg-black/80 hover:scale-110 active:scale-95"
                )}
              >
                <ChevronRight size={isMobile ? 28 : 24} />
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
                  animate={{ width: `${((currentSlideIndex + 1) / slides.length) * 100}%` }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile fullscreen floating button - shows when on mobile and not fullscreen */}
      {isMobile && !isFullscreen && !showThumbnails && (
        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ delay: 0.5 }}
          onClick={toggleFullscreen}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 bg-white/90 text-black rounded-full px-5 py-3 flex items-center gap-2 shadow-xl font-medium active:scale-95 transition-transform"
        >
          <Maximize2 size={20} />
          <span>Full Screen</span>
        </motion.button>
      )}

      {/* Thumbnail grid overlay */}
      <AnimatePresence>
        {showThumbnails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/98 z-20 overflow-y-auto"
            onClick={() => setShowThumbnails(false)}
          >
                        <div className="flex flex-col h-full" onClick={(e) => e.stopPropagation()}>
              {/* Thin thumbnail bar at top */}
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
                    // Skip placeholder slides
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
                            "relative group flex-shrink-0 overflow-hidden rounded-md transition-all bg-gray-800",
                            "ring-1 ring-transparent hover:ring-white/50 hover:scale-105",
                            currentSlideIndex === index && "ring-2 ring-white scale-105"
                          )}
                        style={{
                          height: '120px',
                          aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`
                        }}
                      >
                        {/* Slide thumbnail */}
                        <div className="relative bg-white w-full h-full overflow-hidden">
                          <div
                            className="absolute"
                            style={{
                              transform: `scale(${120 / DEFAULT_SLIDE_HEIGHT})`,
                              transformOrigin: 'top left',
                              width: `${DEFAULT_SLIDE_WIDTH}px`,
                              height: `${DEFAULT_SLIDE_HEIGHT}px`,
                              left: 0,
                              top: 0
                            }}
                          >
                            {renderSlide(slide, index, 1)}
                          </div>
                        </div>

                        {/* Slide number overlay */}
                        <div className="absolute top-1 left-1 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 text-white text-xs font-medium">
                          {index + 1}
                        </div>

                        {/* Current slide indicator */}
                        {currentSlideIndex === index && (
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
              <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setShowThumbnails(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PresentationMode; 