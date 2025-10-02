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
}

const PresentationMode: React.FC<PresentationModeProps> = ({ 
  slides, 
  currentSlideIndex,
  renderSlide,
  isViewOnly = false
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
  const [slideScale, setSlideScale] = useState(0.8); // Start with a conservative scale
  
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

  // Handle mouse movement
  useEffect(() => {
    if (!isPresenting) return;

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

    // Handle fullscreen changes
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isPresenting, showThumbnails, setShowControls, exitPresentation, goToNextSlide, goToPrevSlide]);

  if (!isPresenting) return null;

  const currentSlide = slides[currentSlideIndex];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black"
    >
      {/* Main slide display */}
      <div className="relative w-full h-full flex items-center justify-center p-4">
        <div 
          ref={slideContainerRef}
          className="relative rounded-lg overflow-hidden"
          style={{
            width: '100%',
            maxWidth: `min(95vw, calc(95vh * ${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}))`,
            aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`
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
        {showControls && !showThumbnails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 pointer-events-none"
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
                    onClick={() => {
                      if (isFullscreen) {
                        document.exitFullscreen();
                      } else {
                        document.documentElement.requestFullscreen();
                      }
                    }}
                    className="bg-black/60 rounded-full p-2 text-white/90 hover:bg-black/80 transition-colors border border-white/20"
                  >
                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
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
            <div className="absolute top-1/2 -translate-y-1/2 left-6 right-6 flex justify-between pointer-events-auto">
              <motion.button
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                onClick={goToPrevSlide}
                disabled={currentSlideIndex === 0}
                className={cn(
                  "bg-black/60 rounded-full p-3 text-white/90 transition-all border border-white/20",
                  currentSlideIndex === 0 
                    ? "opacity-30 cursor-not-allowed" 
                    : "hover:bg-black/80 hover:scale-110"
                )}
              >
                <ChevronLeft size={24} />
              </motion.button>

              <motion.button
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                onClick={goToNextSlide}
                disabled={currentSlideIndex === slides.length - 1}
                className={cn(
                  "bg-black/60 rounded-full p-3 text-white/90 transition-all border border-white/20",
                  currentSlideIndex === slides.length - 1 
                    ? "opacity-30 cursor-not-allowed" 
                    : "hover:bg-black/80 hover:scale-110"
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
                  animate={{ width: `${((currentSlideIndex + 1) / slides.length) * 100}%` }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
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
            className="absolute inset-0 bg-black/98 z-10 overflow-y-auto"
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
                            className="absolute inset-0"
                            style={{
                              transform: `scale(${120 / DEFAULT_SLIDE_HEIGHT})`,
                              transformOrigin: 'center',
                              width: `${DEFAULT_SLIDE_WIDTH}px`,
                              height: `${DEFAULT_SLIDE_HEIGHT}px`,
                              left: '50%',
                              top: '50%',
                              marginLeft: `-${DEFAULT_SLIDE_WIDTH / 2}px`,
                              marginTop: `-${DEFAULT_SLIDE_HEIGHT / 2}px`
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