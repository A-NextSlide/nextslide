import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Lock, Sparkles, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewSlide {
  title: string;
  content: string;
  locked: boolean;
}

export interface PreviewCarouselProps {
  slides: PreviewSlide[];
  title: string;
  onSignupClick: () => void;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Skeleton loader for the loading state
// ---------------------------------------------------------------------------

const SkeletonCard: React.FC = () => (
  <div className="w-full max-w-[520px] mx-auto">
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/10 dark:border-white/10 p-6 sm:p-8 animate-pulse">
      <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-700 rounded-full mb-4" />
      <div className="h-6 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded-lg mb-6" />
      <div className="space-y-3">
        <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800 rounded" />
        <div className="h-4 w-5/6 bg-zinc-100 dark:bg-zinc-800 rounded" />
        <div className="h-4 w-4/6 bg-zinc-100 dark:bg-zinc-800 rounded" />
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Single slide card
// ---------------------------------------------------------------------------

interface SlideCardProps {
  slide: PreviewSlide;
  index: number;
  total: number;
  onSignupClick: () => void;
  onSlideClick?: () => void;
}

const SlideCard: React.FC<SlideCardProps> = ({ slide, index, total, onSignupClick, onSlideClick }) => {
  const isLocked = slide.locked;

  return (
    <div className="w-full max-w-[520px] mx-auto select-none">
      <div
        onClick={!isLocked ? onSlideClick : undefined}
        className={cn(
          'relative bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden transition-shadow duration-300',
          isLocked
            ? 'border-zinc-200 dark:border-zinc-700'
            : 'border-black/10 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/30 cursor-pointer active:scale-[0.98] transition-transform',
        )}
      >
        {/* Slide content */}
        <div className={cn('p-6 sm:p-8 min-h-[220px] flex flex-col', isLocked && 'select-none')}>
          {/* Slide number badge */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#FF4301]">
              Slide {index + 1} of {total}
            </span>
            {isLocked && <Lock className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />}
          </div>

          {/* Title */}
          <h3
            className="text-lg sm:text-xl font-bold text-black dark:text-white mb-3 leading-snug"
            style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
          >
            {slide.title}
          </h3>

          {/* Content */}
          <p className="text-sm sm:text-base text-black/70 dark:text-white/70 leading-relaxed flex-1">
            {slide.content}
          </p>
        </div>

        {/* Blur + lock overlay for locked slides */}
        {isLocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            {/* Blurred backdrop */}
            <div className="absolute inset-0 backdrop-blur-[6px] bg-white/60 dark:bg-zinc-900/70" />

            {/* CTA content */}
            <div className="relative z-20 text-center px-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#FF4301]/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-[#FF4301]" />
              </div>
              <p className="text-sm font-semibold text-black dark:text-white mb-1">
                Sign up to see all slides
              </p>
              <p className="text-xs text-black/50 dark:text-white/50 mb-4">
                Free forever. No credit card.
              </p>
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSignupClick();
                }}
                className="bg-[#FF4301] hover:bg-[#E63901] text-white text-xs font-bold px-5 py-2 rounded-lg shadow-md"
              >
                Sign Up Free <ArrowRight className="ml-1.5 w-3 h-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Carousel dots
// ---------------------------------------------------------------------------

interface DotsProps {
  total: number;
  current: number;
  onSelect: (i: number) => void;
  slides: PreviewSlide[];
}

const Dots: React.FC<DotsProps> = ({ total, current, onSelect, slides }) => (
  <div className="flex items-center justify-center gap-2 mt-5">
    {Array.from({ length: total }).map((_, i) => (
      <button
        key={i}
        onClick={() => onSelect(i)}
        className={cn(
          'w-2 h-2 rounded-full transition-all duration-300',
          i === current
            ? 'bg-[#FF4301] w-5'
            : slides[i]?.locked
              ? 'bg-zinc-300 dark:bg-zinc-600'
              : 'bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500',
        )}
        aria-label={`Go to slide ${i + 1}`}
      />
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Main carousel component
// ---------------------------------------------------------------------------

const PreviewCarousel: React.FC<PreviewCarouselProps> = ({
  slides,
  title,
  onSignupClick,
  isLoading = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 = left, 1 = right
  const touchStartX = useRef<number | null>(null);

  // Fullscreen presentation mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsSlideIndex, setFsSlideIndex] = useState(0);

  const total = slides.length;

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return;
      setDirection(index > currentIndex ? 1 : -1);
      setCurrentIndex(index);
    },
    [currentIndex, total],
  );

  const goNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setDirection(1);
      setCurrentIndex((p) => p + 1);
    }
  }, [currentIndex, total]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((p) => p - 1);
    }
  }, [currentIndex]);

  // Fullscreen handlers
  const openFullscreen = useCallback((index: number) => {
    if (slides[index]?.locked) return;
    setFsSlideIndex(index);
    setIsFullscreen(true);
  }, [slides]);

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  const fsNext = useCallback(() => {
    setFsSlideIndex((prev) => {
      let next = prev + 1;
      // Skip locked slides
      while (next < slides.length && slides[next]?.locked) next++;
      return next < slides.length ? next : prev;
    });
  }, [slides]);

  const fsPrev = useCallback(() => {
    setFsSlideIndex((prev) => {
      let next = prev - 1;
      while (next >= 0 && slides[next]?.locked) next--;
      return next >= 0 ? next : prev;
    });
  }, [slides]);

  // Keyboard + touch for fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFullscreen();
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); fsNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); fsPrev(); }
    };
    let fsTouchStartX = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length) fsTouchStartX = e.touches[0].clientX;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (!e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - fsTouchStartX;
      if (Math.abs(dx) > 50) { dx < 0 ? fsNext() : fsPrev(); }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isFullscreen, fsNext, fsPrev, closeFullscreen]);

  // Keyboard navigation (carousel, only when not fullscreen)
  useEffect(() => {
    if (isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, isFullscreen]);

  // Touch swipe
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      if (delta < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  // Animation variants for the slide transition
  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 80 : -80,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -80 : 80,
      opacity: 0,
    }),
  };

  // --- Loading state ---
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full px-4 sm:px-8"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[#FF4301]">
            <Sparkles className="w-4 h-4 animate-spin" />
            Creating your presentation...
          </div>
        </div>
        <SkeletonCard />
        <div className="flex items-center justify-center gap-2 mt-5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          ))}
        </div>
      </motion.div>
    );
  }

  if (slides.length === 0) return null;

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
      className="w-full px-4 sm:px-8"
    >
      {/* Presentation title */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF4301]/10 border border-[#FF4301]/20 mb-3">
          <Sparkles className="w-3 h-3 text-[#FF4301]" />
          <span className="text-xs font-bold text-[#FF4301]">PREVIEW</span>
        </div>
        <h3
          className="text-lg sm:text-xl font-bold text-black dark:text-white"
          style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
        >
          {title}
        </h3>
      </div>

      {/* Carousel area */}
      <div
        className="relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Left arrow */}
        {currentIndex > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 sm:-translate-x-4 z-30 w-9 h-9 rounded-full bg-white dark:bg-zinc-800 shadow-lg border border-black/10 dark:border-white/10 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4 text-black dark:text-white" />
          </button>
        )}

        {/* Right arrow */}
        {currentIndex < total - 1 && (
          <button
            onClick={goNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 sm:translate-x-4 z-30 w-9 h-9 rounded-full bg-white dark:bg-zinc-800 shadow-lg border border-black/10 dark:border-white/10 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4 text-black dark:text-white" />
          </button>
        )}

        {/* Slide container */}
        <div className="overflow-hidden">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <SlideCard
                slide={slides[currentIndex]}
                index={currentIndex}
                total={total}
                onSignupClick={onSignupClick}
                onSlideClick={() => openFullscreen(currentIndex)}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Dots navigation */}
      <Dots total={total} current={currentIndex} onSelect={goTo} slides={slides} />

    </motion.div>

    {/* Fullscreen Presentation Overlay — portaled to body to escape stacking contexts */}
    {isFullscreen && slides.length > 0 && createPortal(
      <div
        className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center"
        onClick={closeFullscreen}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 md:p-5">
          <div className="bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 text-white/90 text-sm font-medium border border-white/20">
            {fsSlideIndex + 1} / {slides.filter((s) => !s.locked).length}
          </div>
          <button
            onClick={closeFullscreen}
            className="bg-black/60 backdrop-blur-sm rounded-full w-9 h-9 flex items-center justify-center text-white/90 hover:bg-black/80 active:scale-95 border border-white/20 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Slide content in landscape card */}
        <div
          className="relative w-full h-full flex items-center justify-center p-4 md:p-12"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative w-full max-w-[900px] aspect-video bg-white dark:bg-zinc-900 rounded-xl overflow-hidden shadow-2xl flex flex-col justify-center p-8 sm:p-12 md:p-16">
            {/* Slide number */}
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#FF4301] mb-3 sm:mb-4">
              Slide {fsSlideIndex + 1}
            </span>

            {/* Title */}
            <h2
              className="text-xl sm:text-3xl md:text-4xl font-bold text-black dark:text-white mb-4 sm:mb-6 leading-tight"
              style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
            >
              {slides[fsSlideIndex].title}
            </h2>

            {/* Content */}
            <p className="text-sm sm:text-base md:text-lg text-black/70 dark:text-white/70 leading-relaxed max-w-[700px]">
              {slides[fsSlideIndex].content}
            </p>
          </div>

          {/* Nav buttons */}
          <button
            onClick={(e) => { e.stopPropagation(); fsPrev(); }}
            className={cn(
              'absolute left-1 md:left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm border border-white/20 transition-all',
              fsSlideIndex === 0 ? 'opacity-30' : 'hover:bg-black/70 active:scale-95',
            )}
            disabled={fsSlideIndex === 0}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); fsNext(); }}
            className={cn(
              'absolute right-1 md:right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm border border-white/20 transition-all',
              fsSlideIndex >= slides.length - 1 || slides[fsSlideIndex + 1]?.locked
                ? 'opacity-30'
                : 'hover:bg-black/70 active:scale-95',
            )}
            disabled={fsSlideIndex >= slides.length - 1 || !!slides[fsSlideIndex + 1]?.locked}
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-3 md:bottom-5 left-6 right-6 z-10">
          <div className="bg-white/20 rounded-full h-1 overflow-hidden">
            <div
              className="bg-white/80 h-full rounded-full transition-all duration-300"
              style={{
                width: `${((fsSlideIndex + 1) / slides.filter((s) => !s.locked).length) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
};

export default PreviewCarousel;
