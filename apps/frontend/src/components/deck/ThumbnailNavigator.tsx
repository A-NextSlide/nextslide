import React, { useCallback, useMemo, useRef, useState } from 'react';
import { SlideData } from '@/types/SlideTypes';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem
} from '@/components/ui/context-menu';
import { Trash2, Copy, Plus, GripVertical } from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { DeckStatus } from '@/types/DeckTypes';
import { cn } from '@/lib/utils';
import MiniSlide from './MiniSlide';
import { useIsMobile } from '@/hooks/use-mobile';

// ThumbnailItem component
interface ThumbnailItemProps {
  slide: SlideData;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onDelete: (slideId: string, slideIndex: number) => void;
  onDuplicate: (slideId: string, slideIndex: number) => void;
  onAddAfter: (slideId: string, slideIndex: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, destinationIndex: number) => void;
  onDragEnd: () => void;
  renderSimple?: boolean;
}

const getSlideFallbackBackground = (slide: SlideData): string | undefined => {
  const comps = slide?.components || [];
  const bg = comps.find(
    (comp) => comp.type === 'Background' || (comp.id && comp.id.toLowerCase().includes('background'))
  );
  if (!bg) return undefined;

  const props: any = bg.props || {};
  const gradient = props.gradient || props.style?.background || (props.background && props.background.color ? props.background : null);

  try {
    if (typeof gradient === 'string' && gradient) return gradient;
    if (gradient && typeof gradient === 'object' && (Array.isArray((gradient as any).stops) || Array.isArray((gradient as any).colors))) {
      const rawStops = Array.isArray((gradient as any).stops) ? (gradient as any).stops : (gradient as any).colors;
      const stops = rawStops
        .filter((s: any) => s && s.color)
        .map((s: any, idx: number) => {
          let position = s.position;
          if (position === undefined || position === null || Number.isNaN(position)) {
            position = (idx / Math.max(1, rawStops.length - 1)) * 100;
          }
          if (position <= 1 && rawStops.every((stop: any) => (stop.position ?? 0) <= 1)) {
            position = position * 100;
          }
          return `${s.color}${typeof position === 'number' ? ` ${position}%` : ''}`;
        })
        .join(', ');
      if (!stops) return undefined;
      if (gradient.type === 'radial') {
        return `radial-gradient(circle, ${stops})`;
      }
      const angle = typeof gradient.angle === 'number' ? gradient.angle : 180;
      return `linear-gradient(${angle}deg, ${stops})`;
    }
  } catch {}

  const directColor = props.backgroundColor || props.color || props.page?.backgroundColor;
  if (typeof directColor === 'string' && directColor) return directColor;
  return undefined;
};

const ThumbnailItem: React.FC<ThumbnailItemProps> = ({
  slide,
  index,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onAddAfter,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  renderSimple = false,
}) => {
  // Check if slide has real content (not just background)
  const hasRealContent = useMemo(() => {
    return slide?.components?.some(
      (c) => c.type !== 'Background' && !c.id?.toLowerCase().includes('background')
    );
  }, [slide?.components]);
  const fallbackBackground = useMemo(() => (
    renderSimple ? getSlideFallbackBackground(slide) : undefined
  ), [renderSimple, slide]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={cn(
            "slide-thumbnail w-40 h-24 rounded flex-shrink-0 cursor-pointer transition-all relative",
            isSelected
              ? 'border-2 border-primary shadow-sm'
              : 'border border-border hover:border-primary/50'
          )}
          draggable={!renderSimple}
          onDragStart={() => onDragStart(index)}
          onDragOver={(e) => onDragOver(e, index)}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e, index)}
          onDragEnd={onDragEnd}
        >
          {/* Drag handle icon */}
          <div
            className="absolute top-1 right-1 z-40 opacity-30 hover:opacity-100 transition-opacity cursor-grab"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-foreground" />
          </div>

          {/* Slide number */}
          <div className="absolute -top-5 w-full text-center text-[10px] text-gray-500 z-40">
            {index + 1}
          </div>

          {/* Clickable overlay */}
          <div
            className="absolute inset-0 z-30 cursor-pointer"
            onClick={() => onSelect(index)}
          />

          {/* Main thumbnail content */}
          <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-sm">
            {renderSimple ? (
              <div
                className="w-full h-full rounded-sm overflow-hidden flex items-center justify-center"
                style={fallbackBackground ? { background: fallbackBackground } : { background: '#f5f5f5' }}
              >
                <div className="text-[10px] font-medium text-zinc-600">
                  Slide {index + 1}
                </div>
              </div>
            ) : hasRealContent ? (
              <MiniSlide
                slide={slide}
                width={160}
                height={90}
                responsive={false}
              />
            ) : (
              <div className="w-full h-full rounded-sm overflow-hidden bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 flex items-center justify-center">
                <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
                  Slide {index + 1}
                </div>
              </div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onAddAfter(slide.id, index)}>
          <Plus className="mr-2 h-4 w-4" />
          New Slide
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDuplicate(slide.id, index)}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicate Slide
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDelete(slide.id, index)} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Slide
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

interface ThumbnailNavigatorProps {
  slides: SlideData[];
  currentSlideIndex: number;
  onThumbnailClick: (index: number) => void;
  isTransitioning?: boolean;
  onSlideDelete?: (slideId: string) => void;
  deckStatus?: DeckStatus;
  isNewDeck?: boolean;
}

// Placeholder thumbnail component for generating slides
const PlaceholderThumbnail: React.FC<{ index: number; isSelected: boolean; onSelect: (index: number) => void }> = ({
  index,
  isSelected,
  onSelect,
}) => (
  <div
    className={cn(
      "slide-thumbnail w-40 h-24 rounded flex-shrink-0 cursor-pointer transition-all relative",
      isSelected
        ? 'border-2 border-primary shadow-sm'
        : 'border border-border hover:border-primary/50'
    )}
    onClick={() => onSelect(index)}
  >
    {/* Slide number */}
    <div className="absolute -top-5 w-full text-center text-[10px] text-gray-500 z-40">
      {index + 1}
    </div>

    {/* Placeholder content - animated gradient */}
    <div className="w-full h-full rounded-sm overflow-hidden bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 flex items-center justify-center">
      <div className="flex flex-col items-center gap-1">
        <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        <div className="text-[9px] font-medium text-orange-600 dark:text-orange-400">
          Generating...
        </div>
      </div>
    </div>
  </div>
);

// Throttle constant for slide operations
const OPERATION_THROTTLE_MS = 800;

const ThumbnailNavigator: React.FC<ThumbnailNavigatorProps> = ({
  slides,
  currentSlideIndex,
  onThumbnailClick,
  onSlideDelete,
  deckStatus,
}) => {
  const isMobile = useIsMobile();
  // Check if deck is generating
  const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating' || deckStatus?.state === 'pending';
  const totalExpectedSlides = deckStatus?.totalSlides || 0;
  // Store operations
  const removeSlide = useDeckStore(state => state.removeSlide);
  const duplicateSlide = useDeckStore(state => state.duplicateSlide);
  const addSlideAfter = useDeckStore(state => state.addSlideAfter);
  const addSlide = useDeckStore(state => state.addSlide);
  const reorderSlides = useDeckStore(state => state.reorderSlides);

  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastOperationRef = useRef<number>(0);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropZoneIndex, setDropZoneIndex] = useState<number | null>(null);

  // Sort slides by order
  const displaySlides = useMemo(() => {
    return [...(slides || [])].sort((a, b) => a.order - b.order);
  }, [slides]);

  const totalSlides = displaySlides.length;

  // Check if operation is throttled
  const isThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastOperationRef.current < OPERATION_THROTTLE_MS) {
      return true;
    }
    lastOperationRef.current = now;
    return false;
  }, []);

  // Set operation flag on window
  const setOperationFlag = useCallback((value: boolean) => {
    if (typeof window !== 'undefined') {
      (window as any).__isSlideOperationInProgress = value;
      if (!value) {
        // Clear after delay when setting to false
        setTimeout(() => {
          (window as any).__isSlideOperationInProgress = false;
        }, 2000);
      }
    }
  }, []);

  // Handle delete slide
  const handleDelete = useCallback((slideId: string, slideIndex: number) => {
    if (isThrottled()) return;

    if (totalSlides <= 1) {
      toast({
        title: "Cannot Delete Slide",
        description: "A presentation must have at least one slide.",
        variant: "destructive",
        duration: 3000
      });
      return;
    }

    setOperationFlag(true);

    removeSlide(slideId)
      .then(() => {
        // Adjust current slide index
        if (slideIndex < currentSlideIndex) {
          onThumbnailClick(currentSlideIndex - 1);
        } else if (slideIndex === currentSlideIndex) {
          onThumbnailClick(Math.max(0, slideIndex - 1));
        }

        if (onSlideDelete) {
          onSlideDelete(slideId);
        }

        toast({
          title: "Slide Deleted",
          description: `Slide ${slideIndex + 1} has been removed.`,
          duration: 2000
        });
      })
      .catch(() => {
        toast({
          title: "Error Deleting Slide",
          description: "An error occurred while deleting the slide.",
          variant: "destructive",
          duration: 3000
        });
      })
      .finally(() => setOperationFlag(false));
  }, [isThrottled, totalSlides, removeSlide, currentSlideIndex, onThumbnailClick, onSlideDelete, toast, setOperationFlag]);

  // Handle duplicate slide
  const handleDuplicate = useCallback((slideId: string, slideIndex: number) => {
    if (isThrottled()) return;

    setOperationFlag(true);

    duplicateSlide(slideId)
      .then(() => {
        if (slideIndex < currentSlideIndex) {
          onThumbnailClick(currentSlideIndex + 1);
        }

        toast({
          title: "Slide Duplicated",
          description: `Slide ${slideIndex + 1} has been duplicated.`,
          duration: 1500
        });
      })
      .catch(() => {
        toast({
          title: "Error Duplicating Slide",
          description: "An error occurred while duplicating the slide.",
          variant: "destructive",
          duration: 3000
        });
      })
      .finally(() => setOperationFlag(false));
  }, [isThrottled, duplicateSlide, currentSlideIndex, onThumbnailClick, toast, setOperationFlag]);

  // Handle add slide after
  const handleAddAfter = useCallback((slideId: string, slideIndex: number) => {
    if (isThrottled()) return;

    setOperationFlag(true);

    addSlideAfter(slideId)
      .then(() => {
        if (slideIndex < currentSlideIndex) {
          onThumbnailClick(currentSlideIndex + 1);
        }

        toast({
          title: "Slide Added",
          description: `A new slide has been added after slide ${slideIndex + 1}.`,
          duration: 1500
        });
      })
      .catch(() => {
        toast({
          title: "Error Adding Slide",
          description: "An error occurred while adding the slide.",
          variant: "destructive",
          duration: 1500
        });
      })
      .finally(() => setOperationFlag(false));
  }, [isThrottled, addSlideAfter, currentSlideIndex, onThumbnailClick, toast, setOperationFlag]);

  // Handle add slide at end
  const handleAddSlide = useCallback(() => {
    if (isThrottled()) return;

    const deckData = useDeckStore.getState().deckData;
    addSlide({
      title: 'New Slide',
      deckId: deckData.uuid,
      order: deckData.slides.length,
      status: 'completed'
    });

    toast({
      title: "New Slide Added",
      description: "A new slide has been added to your deck.",
      duration: 1500
    });
  }, [isThrottled, addSlide, toast]);

  // Drag handlers
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
    (window as any).__isDraggingSlide = true;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const dropZone = mouseX < rect.width / 2 ? index : index + 1;
    setDropZoneIndex(dropZone);
  }, [draggedIndex]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    if (draggedIndex === null || dropZoneIndex === null || isThrottled()) {
      setDraggedIndex(null);
      setDropZoneIndex(null);
      return;
    }

    let actualDestination = dropZoneIndex;
    if (dropZoneIndex > draggedIndex) {
      actualDestination = dropZoneIndex - 1;
    }

    if (draggedIndex === actualDestination) {
      setDraggedIndex(null);
      setDropZoneIndex(null);
      return;
    }

    reorderSlides(draggedIndex, actualDestination)
      .then(() => {
        // Update current slide index if necessary
        if (currentSlideIndex === draggedIndex) {
          onThumbnailClick(actualDestination);
        } else if (draggedIndex < currentSlideIndex && actualDestination >= currentSlideIndex) {
          onThumbnailClick(currentSlideIndex - 1);
        } else if (draggedIndex > currentSlideIndex && actualDestination <= currentSlideIndex) {
          onThumbnailClick(currentSlideIndex + 1);
        }

        toast({
          title: "Slide Moved",
          description: `Slide moved to position ${actualDestination + 1}.`,
          duration: 2000
        });
      })
      .catch(() => {
        toast({
          title: "Error Moving Slide",
          description: "An error occurred while moving the slide.",
          variant: "destructive",
          duration: 3000
        });
      });

    setDraggedIndex(null);
    setDropZoneIndex(null);
  }, [draggedIndex, dropZoneIndex, isThrottled, reorderSlides, currentSlideIndex, onThumbnailClick, toast]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDropZoneIndex(null);
    setTimeout(() => {
      (window as any).__isDraggingSlide = false;
    }, 2000);
  }, []);

  // Scroll current thumbnail into view
  React.useEffect(() => {
    if (!containerRef.current) return;

    const thumbnails = containerRef.current.querySelectorAll('.slide-thumbnail');
    if (thumbnails.length <= currentSlideIndex) return;

    const thumbnail = thumbnails[currentSlideIndex] as HTMLElement;
    if (!thumbnail) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const thumbnailCenter = thumbnail.offsetLeft + thumbnail.offsetWidth / 2;
    const scrollPosition = thumbnailCenter - containerRect.width / 2;

    containerRef.current.scrollLeft = Math.max(0, scrollPosition);
  }, [currentSlideIndex]);

  return (
    <div
      ref={containerRef}
      className="p-4 pt-5 pb-5 flex flex-nowrap items-center gap-3 overflow-x-auto overflow-y-hidden scrollbar-hide max-w-full"
      style={{
        minHeight: '130px',
        marginTop: 'auto',
        zIndex: 10,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        overscrollBehavior: 'contain'
      }}
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && containerRef.current) {
          containerRef.current.scrollLeft += e.deltaY;
        }
      }}
    >
      <div className="pb-2">
        <motion.div
          className="flex gap-2 px-2"
          layout
          transition={{ layout: { type: "spring", stiffness: 350, damping: 30 } }}
        >
          {/* Render existing slides */}
          {displaySlides.map((slide, index) => {
            const showDropZoneBefore = dropZoneIndex === index && draggedIndex !== null;
            const isDragged = draggedIndex === index;

            return (
              <React.Fragment key={slide.id}>
                {/* Drop zone indicator before this slide */}
                <AnimatePresence>
                  {showDropZoneBefore && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 4, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex-shrink-0 bg-primary rounded-sm"
                      style={{ height: '96px', alignSelf: 'center' }}
                    />
                  )}
                </AnimatePresence>

                <motion.div
                  layoutId={slide.id}
                  layout="position"
                  initial={false}
                  animate={{
                    opacity: isDragged ? 0.5 : 1,
                    scale: isDragged ? 0.95 : 1
                  }}
                  transition={{
                    layout: { type: "spring", stiffness: 350, damping: 30 },
                    scale: { type: "spring", stiffness: 400, damping: 20 },
                    opacity: { duration: 0.15 }
                  }}
                >
                  <ThumbnailItem
                    slide={slide}
                    index={index}
                    isSelected={index === currentSlideIndex}
                    onSelect={onThumbnailClick}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onAddAfter={handleAddAfter}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    renderSimple={isMobile}
                  />
                </motion.div>

                {/* Drop zone indicator after last slide (only when not generating placeholders) */}
                {index === displaySlides.length - 1 && !isGenerating && (
                  <AnimatePresence>
                    {dropZoneIndex === index + 1 && draggedIndex !== null && (
                      <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 4, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex-shrink-0 bg-primary rounded-sm"
                        style={{ height: '96px', alignSelf: 'center' }}
                      />
                    )}
                  </AnimatePresence>
                )}
              </React.Fragment>
            );
          })}

          {/* Render placeholder thumbnails for slides being generated */}
          {isGenerating && totalExpectedSlides > displaySlides.length && (
            <>
              {Array.from({ length: totalExpectedSlides - displaySlides.length }, (_, i) => {
                const index = displaySlides.length + i;
                return (
                  <motion.div
                    key={`placeholder-${index}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.05 }}
                  >
                    <PlaceholderThumbnail
                      index={index}
                      isSelected={index === currentSlideIndex}
                      onSelect={onThumbnailClick}
                    />
                  </motion.div>
                );
              })}
            </>
          )}

          {/* Show initial placeholder when no slides and no expected count yet */}
          {displaySlides.length === 0 && !isGenerating && (
            <div className="w-40 h-24 rounded flex-shrink-0 border border-dashed border-border flex items-center justify-center text-muted-foreground text-xs">
              No slides
            </div>
          )}
        </motion.div>
      </div>

      {/* Add Slide button */}
      <motion.div
        className="h-12 w-12 rounded-full flex-shrink-0 cursor-pointer transition-all relative border border-dashed border-border hover:border-primary/50 group"
        onClick={handleAddSlide}
        animate={{ opacity: 1 }}
        initial={false}
      >
        <div className="w-full h-full bg-secondary/5 hover:bg-secondary/10 flex items-center justify-center rounded-full overflow-hidden">
          <Plus className="h-6 w-6 text-primary/50 group-hover:text-primary transition-colors" />
        </div>
      </motion.div>
    </div>
  );
};

export default ThumbnailNavigator;
