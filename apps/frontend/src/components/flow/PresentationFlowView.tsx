import React, { useState, useEffect } from 'react';
import { SlideOutline } from '@/types/SlideTypes';
import { cn } from '@/lib/utils';
import { motion, type Variants } from 'framer-motion';

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.02
    }
  }
};

// Prevent re-animation on tab switches: module-scoped flag persists across re-mounts
let hasAnimatedPresentationFlow = false;

const itemVariants: Variants = {
  // For the first item (index 0), avoid vertical shift; others use a subtle drop
  hidden: (index: number = 0) => ({ opacity: 0, y: index === 0 ? 0 : -6 }),
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 0.55, 0.25, 0.95] } }
};

interface PresentationFlowViewProps {
  slides: SlideOutline[];
  onReorderSlides: (fromIndex: number, toIndex: number) => void;
  className?: string;
}

const PresentationFlowView: React.FC<PresentationFlowViewProps> = ({
  slides,
  onReorderSlides,
  className
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (index !== draggedIndex) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      onReorderSlides(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const getFlowLabel = (slide: SlideOutline, index: number): string => {
    const title = (slide.title || '').trim();
    if (title) return title;

    const stripHtml = (input?: string): string => {
      if (!input) return '';
      return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    const text = stripHtml(slide.content).slice(0, 140);
    const hasChart =
      (Array.isArray(slide.manualCharts) && slide.manualCharts.length > 0) ||
      !!slide.extractedData?.chartType ||
      (Array.isArray(slide.taggedMedia) && slide.taggedMedia.some(m => m.type === 'chart' || m.type === 'data')) ||
      /\b(chart|graph|trend|bar|line|pie)\b/i.test(text);

    const hasImage = Array.isArray(slide.taggedMedia) && slide.taggedMedia.some(m => m.type === 'image');

    const isKeyStat = /\b\d{1,3}(?:[\.,]\d+)?\s*%\b/.test(text) || (/\b\d[\d,\.]*\b/.test(text) && text.length <= 60);
    const isQuote = (/^["'“].{2,}['"”]$/.test(text) || /\s—\s|\s-\s/.test(text)) && text.length <= 100;

    if (hasChart) return 'Chart';
    if (hasImage) return 'Image';
    if (isKeyStat) return 'Key stat';
    if (isQuote) return 'Quote';
    if (text) return text.length > 50 ? `${text.slice(0, 50)}…` : text;
    return `Slide ${index + 1}`;
  };

  // Animate only once per session, and only when slides are available
  const [shouldRunAnimation, setShouldRunAnimation] = useState(
    !hasAnimatedPresentationFlow && (slides?.length || 0) > 0
  );
  const [animationKey, setAnimationKey] = useState(0);

  // If slides load after mount, trigger a one-time remount to run the entrance animation
  useEffect(() => {
    const hasSlides = (slides?.length || 0) > 0;
    if (hasSlides && !hasAnimatedPresentationFlow && !shouldRunAnimation) {
      setShouldRunAnimation(true);
      setAnimationKey((k) => k + 1);
    }
  }, [slides?.length, shouldRunAnimation]);

  // Mark animation as consumed so tab switches do not re-trigger it
  useEffect(() => {
    if (shouldRunAnimation && !hasAnimatedPresentationFlow) {
      hasAnimatedPresentationFlow = true;
    }
  }, [shouldRunAnimation]);

  return (
    <div className={cn("relative h-full w-full overflow-y-auto hide-scrollbar flex flex-col", className)}>
      <div className="p-2 pt-6 flex-grow">
        <h3 className="text-sm font-semibold mb-3 text-foreground/90">
          Presentation Flow
        </h3>
        <motion.div
          key={animationKey}
          className="space-y-1.5"
          variants={containerVariants}
          initial={shouldRunAnimation ? 'hidden' : false}
          animate={shouldRunAnimation ? 'show' : undefined}
        >
          {slides.map((slide: SlideOutline, index: number) => (
            <motion.div
              key={slide.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => {
                if (draggedIndex !== null) return;
                try {
                  window.dispatchEvent(new CustomEvent('navigate-to-slide-from-flow', { detail: { slideIndex: index } }));
                } catch {}
              }}
              className={cn(
                "p-2 rounded-md cursor-grab transition-all duration-150 ease-in-out",
                "backdrop-blur-[2px] bg-card/30 dark:bg-white/5 border border-border/30 dark:border-neutral-700/40",
                "hover:bg-card/50 dark:hover:bg-white/10 hover:border-border/60 dark:hover:border-neutral-600/60 hover:shadow-md",
                draggedIndex === index && "opacity-50 scale-95 shadow-none",
                dragOverIndex === index && draggedIndex !== index && "ring-1 ring-primary ring-offset-1 ring-offset-background shadow-md"
              )}
              variants={itemVariants}
              custom={index}
            >
              <p className="text-xs font-medium text-card-foreground truncate">{getFlowLabel(slide, index)}</p>
            </motion.div>
          ))}
          {slides.length === 0 && (
            <div className="mt-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted/20 mb-4">
                <svg className="w-8 h-8 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">No slides yet</p>
              <p className="text-xs text-muted-foreground/70">Your presentation flow will appear here once you add slides</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default PresentationFlowView; 